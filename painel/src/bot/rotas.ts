// Rotas do bot (montadas em /api/bot, ANTES do app.use("/api", exigirLogin) do servidor).
//   POST /webhook/:empresa/:segredo   entrada do provedor de WhatsApp (pública, protegida pelo segredo da empresa)
//   o resto exige login; mudar conexão e configuração exige admin.

import { podeCargo } from "../comum/cargos.ts";
import express, { type Request, type Response } from "express";
import * as D from "../servidor/dados.ts";
import { validarUrlExterna } from "../servidor/url.ts";
import { exigirLogin, exigirModulo, exigirPapel } from "../servidor/sessao.ts";
import * as A from "./armazem.ts";
import * as S from "./sugestoes-cadastro.ts";
import { controlarConversa, encerrarAtendimento, marcarLida, provedorDe, receber, responderOperador, servidorWhatsApp } from "./fluxo.ts";
import crypto from "node:crypto";
import { caixaSimulada, soDigitos } from "./provedores.ts";
import { metaAssinaturaOk } from "./provedores-api.ts";
import { atualizarStatus, iniciarStatus } from "./status.ts";
import { ID_PRINCIPAL, TIPOS_PROVEDOR, type ConexaoBot, type ConfigBot, type Conversa, type Recebida, type TipoProvedor } from "./tipos.ts";

export const rotasBot = express.Router();
export default rotasBot;

const ok = (fn: (req: Request, res: Response) => unknown) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e) {
    console.error("[bot]", req.method, req.path.replace(/\/webhook\/.*/, "/webhook/…"), e instanceof Error ? e.message : e);
    if (!res.headersSent) res.status(400).json({ erro: e instanceof Error ? e.message : "Erro." });
  }
};

// ------------------------------------------------------------------ webhook (público)

/** Conexão do endereço (a principal quando o endereço não traz o id) ou null se o segredo, a empresa ou a conexão não existirem. */
function conexaoDoWebhook(params: Request["params"]): { empresa: string; cx: ConexaoBot } | null {
  const { empresa, segredo } = params;
  if (!D.idValido(empresa) || !D.empresa(empresa) || !A.segredoConfere(empresa, segredo)) return null;
  const cx = A.conexao(empresa, params.conexao || ID_PRINCIPAL);
  return cx ? { empresa, cx } : null;
}

type ComCru = Request & { corpoCru?: string };
/** Guarda o corpo cru dos avisos de webhook (a Meta assina o texto exato). Passe em `express.json({ verify })`. */
export function guardarCorpoCru(req: unknown, _res: unknown, buf: Buffer) {
  const r = req as ComCru;
  if (String(r.url ?? "").includes("/webhook/")) r.corpoCru = buf.toString("utf8");
}
const lerJson = express.json({ limit: "2mb", verify: guardarCorpoCru });

/** Meta: ao cadastrar o webhook, ela chama este endereço com a senha de verificação. */
rotasBot.get(["/webhook/:empresa/:segredo", "/webhook/:empresa/:segredo/:conexao"], (req, res) => {
  const alvo = conexaoDoWebhook(req.params);
  const senha = alvo ? A.segredosBot(alvo.empresa, alvo.cx.id).verifyToken : "";
  const q = req.query as Record<string, unknown>;
  const dado = String(q["hub.verify_token"] ?? "");
  if (alvo?.cx.provedor === "meta" && senha && q["hub.mode"] === "subscribe" && dado.length === senha.length
    && crypto.timingSafeEqual(Buffer.from(dado), Buffer.from(senha))) return res.status(200).type("text/plain").send(String(q["hub.challenge"] ?? "").slice(0, 200));
  res.status(404).json({ erro: "Não encontrado." });
});

rotasBot.post(["/webhook/:empresa/:segredo", "/webhook/:empresa/:segredo/:conexao"], lerJson, (req, res) => {
  const alvo = conexaoDoWebhook(req.params);
  if (!alvo) return res.status(404).json({ erro: "Não encontrado." });
  const { empresa, cx } = alvo;
  const cfg = A.config(empresa);
  if (!cfg.ativo || !cx.ativa || !D.empresa(empresa)!.ativa) return res.json({ ok: true, ignorado: true });
  // Meta assina cada aviso com o App Secret do app; com o segredo salvo, aviso sem assinatura certa é recusado.
  if (cx.provedor === "meta") {
    const appSecret = A.segredosBot(empresa, cx.id).appSecret;
    if (appSecret && !metaAssinaturaOk((req as ComCru).corpoCru ?? "", req.get("x-hub-signature-256"), appSecret)) return res.status(401).json({ erro: "Assinatura inválida." });
  }
  let recebidas: Recebida[];
  try { recebidas = provedorDe(empresa, cx.id).lerWebhook(req.body); } catch { recebidas = []; }
  // Responde na hora; o processamento segue em cada fila de conversa (uma conversa não espera a outra).
  res.json({ ok: true, recebidas: recebidas.length });
  for (const r of recebidas) receber(empresa, { ...r, conexao: cx.id }).catch((e) => console.error("[bot] webhook", empresa, e instanceof Error ? e.message : e));
});

// ------------------------------------------------------------------ com login

rotasBot.use(exigirLogin);
rotasBot.use((req, res, next) => (req.path.startsWith("/webhook/") ? next() : exigirModulo("bot")(req, res, next)));
const admin = exigirPapel("admin");
const ctx = (req: Request) => req.ctx!;

function urlWebhook(req: Request, empresaId: string, conexaoId: string = ID_PRINCIPAL) {
  const base = (process.env.PUBLICO_URL ?? "").trim().replace(/\/+$/, "") || `${req.protocol}://${req.get("host")}`;
  return `${base}/api/bot/webhook/${empresaId}/${A.segredoWebhook(empresaId)}${conexaoId === ID_PRINCIPAL ? "" : `/${conexaoId}`}`;
}

/** Dados de uma conexão que o painel pode ver. Tokens e segredos nunca saem: só "salvo". */
function visaoConexao(req: Request, empresaId: string, cx: ConexaoBot, ehAdmin: boolean) {
  const s = A.segredosBot(empresaId, cx.id);
  const srv = servidorWhatsApp(empresaId, cx.id);
  return {
    id: cx.id, nome: cx.nome, ativa: cx.ativa, provedor: cx.provedor, principal: cx.id === ID_PRINCIPAL,
    instancia: cx.provedor === "evolution" ? srv.instancia : cx.instancia,
    servidor: {
      daPlataforma: cx.provedor === "evolution" ? srv.daPlataforma : false,
      plataformaPronta: Boolean((process.env.WHATSAPP_EVOLUTION_URL ?? "").trim() && (process.env.WHATSAPP_EVOLUTION_TOKEN ?? "").trim()),
      urlApi: s.urlApi ?? "", // endereço não é segredo; os tokens nunca saem
      tokenSalvo: Boolean(s.token), clientTokenSalvo: Boolean(s.clientToken), appSecretSalvo: Boolean(s.appSecret),
      phoneId: s.phoneId ?? "", wabaId: s.wabaId ?? "",
    },
    webhook: ehAdmin ? urlWebhook(req, empresaId, cx.id) : null,
    senhaVerificacao: ehAdmin && cx.provedor === "meta" ? s.verifyToken ?? null : null,
  };
}

/** Guarda provedor, nome, instância e segredos de uma conexão (a principal fica nos campos do topo da config). */
function gravarConexao(empresaId: string, id: string, b: Record<string, unknown>): ConexaoBot {
  const atual = A.conexao(empresaId, id);
  if (!atual) throw new Error("Conexão não encontrada.");
  const texto = (v: unknown) => (typeof v === "string" ? v.trim() : undefined);
  const provedor: TipoProvedor = TIPOS_PROVEDOR.includes(b.provedor as TipoProvedor) ? (b.provedor as TipoProvedor) : atual.provedor;
  const instancia = texto(b.instancia) || atual.instancia;
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,40}$/.test(instancia)) throw new Error("Nome da instância: 3 a 40 letras, números, - ou _.");
  const urlApi = texto(b.urlApi);
  // Servidor da empresa: só https público (o painel não chama a rede interna a pedido de uma empresa).
  if (urlApi) validarUrlExterna(urlApi, "do servidor de WhatsApp");
  if ((provedor === "zapi" || provedor === "zpro") && !urlApi && !A.segredosBot(empresaId, id).urlApi) throw new Error("Informe o endereço da instância.");
  const s: Record<string, string | undefined> = {};
  if (provedor === "evolution") {
    s.urlApi = urlApi;
    s.token = urlApi === "" ? "" : texto(b.token) || undefined; // token vazio = mantém; sem endereço, o token também sai
  } else if (provedor === "zapi" || provedor === "zpro") {
    s.urlApi = urlApi || undefined; s.token = texto(b.token) || undefined; s.clientToken = texto(b.clientToken);
  } else if (provedor === "meta") {
    s.token = texto(b.token) || undefined; s.phoneId = texto(b.phoneId); s.wabaId = texto(b.wabaId); s.appSecret = texto(b.appSecret) || undefined;
    if (!A.segredosBot(empresaId, id).verifyToken) s.verifyToken = `vlv_${crypto.randomBytes(16).toString("hex")}`;
  }
  if (s.phoneId && !/^\d{5,25}$/.test(s.phoneId)) throw new Error("O phone id da Meta tem só números.");
  const nome = texto(b.nome) ?? atual.nome;
  const ativa = typeof b.ativa === "boolean" ? b.ativa : atual.ativa;
  let nova: ConexaoBot;
  if (id === ID_PRINCIPAL) {
    const c = A.config(empresaId);
    const ativo = typeof b.ativo === "boolean" ? b.ativo : c.ativo;
    A.salvarConfig(empresaId, { ativo, provedor, instancia });
    nova = { id, nome: "Principal", ativa: true, provedor, instancia };
  } else {
    nova = A.salvarConexao(empresaId, { id, nome, ativa, provedor, instancia });
  }
  A.salvarSegredosBot(empresaId, s, id);
  return nova;
}

const idConexao = (req: Request) => String(req.params.id ?? ID_PRINCIPAL);
const conexaoOuErro = (req: Request) => {
  const cx = A.conexao(ctx(req).empresaId, idConexao(req));
  if (!cx) throw new Error("Conexão não encontrada.");
  return cx;
};

rotasBot.get("/config", ok((req, res) => {
  const id = ctx(req).empresaId;
  const ehAdmin = podeCargo(ctx(req).usuario.papel, "admin");
  const v = visaoConexao(req, id, A.conexao(id)!, ehAdmin);
  res.json({
    config: { ...A.config(id), instancia: v.instancia },
    servidor: v.servidor, webhook: v.webhook, senhaVerificacao: v.senhaVerificacao,
  });
}));

rotasBot.put("/config", admin, ok((req, res) => {
  const id = ctx(req).empresaId;
  gravarConexao(id, ID_PRINCIPAL, (req.body ?? {}) as Record<string, unknown>);
  A.segredoWebhook(id);
  res.json({ ok: true, config: A.config(id) });
}));

/** Mensagens, etapas do fluxo, saudação, respostas prontas, comandos da central e textos de status. Só admin. */
rotasBot.put("/config/avancada", admin, ok((req, res) => {
  const id = ctx(req).empresaId;
  const b = (req.body ?? {}) as Partial<ConfigBot>;
  const atual = A.config(id);
  const nova = A.sanearAvancada({ ...atual, ...Object.fromEntries(Object.entries(b).filter(([k]) => ["fluxo", "textos", "saudacao", "faq", "controle", "textosStatus"].includes(k))) });
  A.salvarConfig(id, { ativo: atual.ativo, provedor: atual.provedor, instancia: atual.instancia, ...nova });
  res.json({ ok: true, config: { ...A.config(id) } });
}));

// ------------------------------------------------------------------ conexões (números) da empresa

rotasBot.get("/conexoes", ok((req, res) => {
  const id = ctx(req).empresaId;
  const ehAdmin = podeCargo(ctx(req).usuario.papel, "admin");
  res.json({ ativo: A.config(id).ativo, conexoes: A.conexoesDe(id).map((cx) => visaoConexao(req, id, cx, ehAdmin)), maximo: A.MAX_CONEXOES });
}));

rotasBot.post("/conexoes", admin, ok((req, res) => {
  const id = ctx(req).empresaId;
  const b = (req.body ?? {}) as Record<string, unknown>;
  const criada = A.salvarConexao(id, { nome: String(b.nome ?? "").trim() || "Novo número", provedor: "simulado" });
  A.segredoWebhook(id);
  try {
    const nova = gravarConexao(id, criada.id, { ...b, nome: criada.nome });
    res.json({ ok: true, conexao: visaoConexao(req, id, nova, true) });
  } catch (e) { A.removerConexao(id, criada.id); throw e; } // dados inválidos: não deixa uma conexão pela metade
}));

rotasBot.put("/conexoes/:id", admin, ok((req, res) => {
  const id = ctx(req).empresaId;
  const nova = gravarConexao(id, idConexao(req), (req.body ?? {}) as Record<string, unknown>);
  res.json({ ok: true, conexao: visaoConexao(req, id, nova, true) });
}));

rotasBot.delete("/conexoes/:id", admin, ok(async (req, res) => {
  const id = ctx(req).empresaId;
  const cx = conexaoOuErro(req);
  await provedorDe(id, cx.id).desconectar().catch(() => undefined); // tira o número do ar antes de apagar
  A.removerConexao(id, cx.id);
  res.json({ ok: true });
}));

rotasBot.get("/conexoes/:id/situacao", ok(async (req, res) => {
  res.json(await provedorDe(ctx(req).empresaId, conexaoOuErro(req).id).situacao());
}));

rotasBot.post("/conexoes/:id/conectar", admin, ok(async (req, res) => {
  const id = ctx(req).empresaId;
  const cx = conexaoOuErro(req);
  res.json(await provedorDe(id, cx.id).conectar(urlWebhook(req, id, cx.id)));
}));

rotasBot.post("/conexoes/:id/desconectar", admin, ok(async (req, res) => {
  await provedorDe(ctx(req).empresaId, conexaoOuErro(req).id).desconectar();
  res.json({ ok: true });
}));

// Atalhos da conexão principal (telas e integrações antigas).
rotasBot.get("/situacao", ok(async (req, res) => { res.json(await provedorDe(ctx(req).empresaId).situacao()); }));
rotasBot.post("/conectar", admin, ok(async (req, res) => { const id = ctx(req).empresaId; res.json(await provedorDe(id).conectar(urlWebhook(req, id))); }));
rotasBot.post("/desconectar", admin, ok(async (req, res) => { await provedorDe(ctx(req).empresaId).desconectar(); res.json({ ok: true }); }));

// ------------------------------------------------------------------ sugestões de endereço (apelidos)

rotasBot.get("/sugestoes", ok((req, res) => {
  const id = ctx(req).empresaId;
  res.json({ total: S.contarSugestoes(id), resultados: S.buscarSugestoes(id, String(req.query.busca ?? "")) });
}));
rotasBot.post("/sugestoes", admin, ok((req, res) => {
  const s = S.adicionarSugestao(ctx(req).empresaId, (req.body ?? {}) as Record<string, unknown>);
  res.json({ ok: true, sugestao: s, total: S.contarSugestoes(ctx(req).empresaId) });
}));
rotasBot.delete("/sugestoes/:id", admin, ok((req, res) => {
  S.excluirSugestao(ctx(req).empresaId, String(req.params.id));
  res.json({ ok: true, total: S.contarSugestoes(ctx(req).empresaId) });
}));

// ------------------------------------------------------------------ conversas

const resumo = (c: Conversa, nomes: Map<string, string>) => {
  const ultima = c.mensagens[c.mensagens.length - 1];
  return {
    id: c.id, nome: c.nome, etapa: c.etapa, naoLidas: c.naoLidas, atualizadaEm: c.atualizadaEm,
    ultima: ultima ? { de: ultima.de, texto: ultima.texto.slice(0, 120), em: ultima.em } : null,
    corrida: c.corrida ? { os: c.corrida.os, status: c.corrida.status } : null,
    conexao: nomes.get(c.conexao ?? ID_PRINCIPAL) ?? nomes.get(ID_PRINCIPAL) ?? "",
    bloqueado: c.bloqueado === true, pausadoAte: c.pausadoAte && Date.parse(c.pausadoAte) > Date.now() ? c.pausadoAte : null,
  };
};

rotasBot.get("/conversas", ok((req, res) => {
  const busca = String(req.query.busca ?? "").trim().toLowerCase();
  const nomes = new Map(A.conexoesDe(ctx(req).empresaId).map((x) => [x.id, x.nome]));
  const lista = Object.values(A.conversas(ctx(req).empresaId, busca ? undefined : 300))
    .filter((c) => !busca || c.nome.toLowerCase().includes(busca) || c.id.includes(soDigitos(busca) || "\u0000"))
    .sort((a, b) => b.atualizadaEm.localeCompare(a.atualizadaEm))
    .slice(0, 300)
    .map((c) => resumo(c, nomes));
  res.json({ conversas: lista });
}));

rotasBot.get("/conversas/:id", ok(async (req, res) => {
  const id = soDigitos(req.params.id);
  const c = req.query.lida === "1" ? await marcarLida(ctx(req).empresaId, id) : A.conversa(ctx(req).empresaId, id);
  if (!c) return res.status(404).json({ erro: "Conversa não encontrada." });
  const { vistas: _v, ...publica } = c;
  const cx = A.conexao(ctx(req).empresaId, c.conexao ?? ID_PRINCIPAL) ?? A.conexao(ctx(req).empresaId)!;
  res.json({ conversa: { ...publica, conexao: cx.id, conexaoNome: cx.nome } });
}));

rotasBot.post("/conversas/:id/responder", ok(async (req, res) => {
  const c = await responderOperador(ctx(req).empresaId, soDigitos(req.params.id), String(req.body?.texto ?? ""), ctx(req).usuario.nome);
  res.json({ ok: true, etapa: c.etapa });
}));

rotasBot.post("/conversas/:id/controle", ok(async (req, res) => {
  const cmd = String(req.body?.comando ?? "");
  if (!["block", "unblock", "pause", "resume"].includes(cmd)) return res.status(400).json({ erro: "Comando inválido." });
  const c = await controlarConversa(ctx(req).empresaId, soDigitos(req.params.id), cmd as "block" | "unblock" | "pause" | "resume");
  res.json({ ok: true, bloqueado: c.bloqueado === true, pausadoAte: c.pausadoAte ?? null });
}));

rotasBot.post("/conversas/:id/encerrar", ok(async (req, res) => {
  const c = await encerrarAtendimento(ctx(req).empresaId, soDigitos(req.params.id));
  res.json({ ok: true, etapa: c.etapa });
}));

// ------------------------------------------------------------------ testar conversa (só no modo simulado)

rotasBot.post("/simular", ok(async (req, res) => {
  const id = ctx(req).empresaId;
  const b = (req.body ?? {}) as Record<string, unknown>;
  const cx = A.conexao(id, typeof b.conexao === "string" && b.conexao ? b.conexao : ID_PRINCIPAL);
  if (!cx) throw new Error("Conexão não encontrada.");
  if (cx.provedor !== "simulado") throw new Error("O teste de conversa só funciona em conexão simulada (nenhuma mensagem sai de verdade).");
  const telefone = soDigitos(b.telefone) || "5500000000000";
  const recebidas = provedorDe(id, cx.id).lerWebhook({ ...b, telefone });
  const respostas: string[] = [];
  for (const r of recebidas) respostas.push(...(await receber(id, { ...r, conexao: cx.id })));
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
