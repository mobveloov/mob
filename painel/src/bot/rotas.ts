// Rotas do bot (montadas em /api/bot, ANTES do app.use("/api", exigirLogin) do servidor).
//   POST /webhook/:empresa/:segredo   entrada do provedor de WhatsApp (pública, protegida pelo segredo da empresa)
//   o resto exige login; mudar conexão e configuração exige admin.

import express, { type Request, type Response } from "express";
import * as D from "../servidor/dados.ts";
import { exigirLogin, exigirPapel } from "../servidor/sessao.ts";
import * as A from "./armazem.ts";
import { encerrarAtendimento, marcarLida, provedorDe, receber, responderOperador, servidorWhatsApp } from "./fluxo.ts";
import { caixaSimulada, soDigitos } from "./provedores.ts";
import { atualizarStatus, iniciarStatus } from "./status.ts";
import type { ConfigBot, Conversa, Recebida } from "./tipos.ts";

export const rotasBot = express.Router();
export default rotasBot;

const ok = (fn: (req: Request, res: Response) => unknown) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e) {
    console.error("[bot]", req.method, req.path.replace(/\/webhook\/.*/, "/webhook/…"), e instanceof Error ? e.message : e);
    if (!res.headersSent) res.status(400).json({ erro: e instanceof Error ? e.message : "Erro." });
  }
};

// ------------------------------------------------------------------ webhook (público)

rotasBot.post("/webhook/:empresa/:segredo", express.json({ limit: "2mb" }), (req, res) => {
  const { empresa, segredo } = req.params;
  if (!D.idValido(empresa) || !D.empresa(empresa) || !A.segredoConfere(empresa, segredo)) return res.status(404).json({ erro: "Não encontrado." });
  const cfg = A.config(empresa);
  if (!cfg.ativo || !D.empresa(empresa)!.ativa) return res.json({ ok: true, ignorado: true });
  let recebidas: Recebida[];
  try { recebidas = provedorDe(empresa).lerWebhook(req.body); } catch { recebidas = []; }
  // Responde na hora; o processamento segue em cada fila de conversa (uma conversa não espera a outra).
  res.json({ ok: true, recebidas: recebidas.length });
  for (const r of recebidas) receber(empresa, r).catch((e) => console.error("[bot] webhook", empresa, e instanceof Error ? e.message : e));
});

// ------------------------------------------------------------------ com login

rotasBot.use(exigirLogin);
const admin = exigirPapel("admin");
const ctx = (req: Request) => req.ctx!;

function urlWebhook(req: Request, empresaId: string) {
  const base = (process.env.PUBLICO_URL ?? "").trim().replace(/\/+$/, "") || `${req.protocol}://${req.get("host")}`;
  return `${base}/api/bot/webhook/${empresaId}/${A.segredoWebhook(empresaId)}`;
}

rotasBot.get("/config", ok((req, res) => {
  const id = ctx(req).empresaId;
  const s = A.segredosBot(id);
  const ehAdmin = ["admin", "plataforma"].includes(ctx(req).usuario.papel);
  const srv = servidorWhatsApp(id);
  res.json({
    config: { ...A.config(id), instancia: srv.instancia },
    servidor: {
      daPlataforma: srv.daPlataforma,
      /** O servidor da plataforma está pronto (a empresa só precisa ler o QR). */
      plataformaPronta: Boolean((process.env.WHATSAPP_EVOLUTION_URL ?? "").trim() && (process.env.WHATSAPP_EVOLUTION_TOKEN ?? "").trim()),
      urlApi: s.urlApi ?? "", // endereço não é segredo; o token nunca sai
      tokenSalvo: Boolean(s.token),
    },
    webhook: ehAdmin ? urlWebhook(req, id) : null,
  });
}));

rotasBot.put("/config", admin, ok((req, res) => {
  const id = ctx(req).empresaId;
  const b = (req.body ?? {}) as Record<string, unknown>;
  const atual = A.config(id);
  const instancia = typeof b.instancia === "string" && b.instancia.trim() ? b.instancia.trim() : atual.instancia;
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,40}$/.test(instancia)) throw new Error("Nome da instância: 3 a 40 letras, números, - ou _.");
  const nova: ConfigBot = {
    ativo: typeof b.ativo === "boolean" ? b.ativo : atual.ativo,
    provedor: b.provedor === "evolution" ? "evolution" : b.provedor === "simulado" ? "simulado" : atual.provedor,
    instancia,
  };
  // Servidor próprio da empresa (opcional). Vazio = usa o servidor da plataforma.
  const urlApi = typeof b.urlApi === "string" ? b.urlApi.trim() : undefined;
  if (urlApi && !/^https?:\/\/[^\s]+$/i.test(urlApi)) throw new Error("Endereço do servidor inválido (use http:// ou https://).");
  // Token vazio = mantém o atual. Sem endereço, o token também sai.
  const token = urlApi === "" ? "" : typeof b.token === "string" && b.token.trim() ? b.token.trim() : undefined;
  A.salvarSegredosBot(id, { urlApi, token });
  A.salvarConfig(id, nova);
  A.segredoWebhook(id);
  res.json({ ok: true, config: nova });
}));

rotasBot.get("/situacao", ok(async (req, res) => {
  res.json(await provedorDe(ctx(req).empresaId).situacao());
}));

rotasBot.post("/conectar", admin, ok(async (req, res) => {
  const id = ctx(req).empresaId;
  res.json(await provedorDe(id).conectar(urlWebhook(req, id)));
}));

rotasBot.post("/desconectar", admin, ok(async (req, res) => {
  await provedorDe(ctx(req).empresaId).desconectar();
  res.json({ ok: true });
}));

// ------------------------------------------------------------------ conversas

const resumo = (c: Conversa) => {
  const ultima = c.mensagens[c.mensagens.length - 1];
  return {
    id: c.id, nome: c.nome, etapa: c.etapa, naoLidas: c.naoLidas, atualizadaEm: c.atualizadaEm,
    ultima: ultima ? { de: ultima.de, texto: ultima.texto.slice(0, 120), em: ultima.em } : null,
    corrida: c.corrida ? { os: c.corrida.os, status: c.corrida.status } : null,
  };
};

rotasBot.get("/conversas", ok((req, res) => {
  const busca = String(req.query.busca ?? "").trim().toLowerCase();
  const lista = Object.values(A.conversas(ctx(req).empresaId))
    .filter((c) => !busca || c.nome.toLowerCase().includes(busca) || c.id.includes(soDigitos(busca) || "\u0000"))
    .sort((a, b) => b.atualizadaEm.localeCompare(a.atualizadaEm))
    .slice(0, 300)
    .map(resumo);
  res.json({ conversas: lista });
}));

rotasBot.get("/conversas/:id", ok(async (req, res) => {
  const id = soDigitos(req.params.id);
  const c = req.query.lida === "1" ? await marcarLida(ctx(req).empresaId, id) : A.conversa(ctx(req).empresaId, id);
  if (!c) return res.status(404).json({ erro: "Conversa não encontrada." });
  const { vistas: _v, ...publica } = c;
  res.json({ conversa: publica });
}));

rotasBot.post("/conversas/:id/responder", ok(async (req, res) => {
  const c = await responderOperador(ctx(req).empresaId, soDigitos(req.params.id), String(req.body?.texto ?? ""), ctx(req).usuario.nome);
  res.json({ ok: true, etapa: c.etapa });
}));

rotasBot.post("/conversas/:id/encerrar", ok(async (req, res) => {
  const c = await encerrarAtendimento(ctx(req).empresaId, soDigitos(req.params.id));
  res.json({ ok: true, etapa: c.etapa });
}));

// ------------------------------------------------------------------ testar conversa (só no modo simulado)

rotasBot.post("/simular", ok(async (req, res) => {
  const id = ctx(req).empresaId;
  if (A.config(id).provedor !== "simulado") throw new Error("O teste de conversa só funciona no modo simulado (nenhuma mensagem sai de verdade).");
  const b = (req.body ?? {}) as Record<string, unknown>;
  const telefone = soDigitos(b.telefone) || "5500000000000";
  const recebidas = provedorDe(id).lerWebhook({ ...b, telefone });
  const respostas: string[] = [];
  for (const r of recebidas) respostas.push(...(await receber(id, r)));
  res.json({ respostas, enviadas: caixaSimulada(id).filter((m) => m.telefone === telefone).slice(-30) });
}));

/** Consulta agora o status da corrida do telefone de teste (sem esperar a rodada periódica). */
rotasBot.post("/simular/status", ok(async (req, res) => {
  const id = ctx(req).empresaId;
  if (A.config(id).provedor !== "simulado") throw new Error("Só no modo simulado.");
  const telefone = soDigitos(req.body?.telefone) || "5500000000000";
  const texto = await atualizarStatus(id, telefone);
  res.json({ texto, enviadas: caixaSimulada(id).filter((m) => m.telefone === telefone).slice(-30) });
}));

if (process.env.NODE_ENV !== "test") iniciarStatus();
