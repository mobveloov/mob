// Rotas do CRM (/api/crm). Registrar no servidor com:  app.use("/api/crm", exigirLogin, router)
// A empresa de cada pedido vem SEMPRE de req.ctx.empresaId (login), nunca da URL.
// Operador monta público, listas e rascunhos. Disparar, configurar o envio e mexer em jornadas: só admin.

import express, { type Request, type Response } from "express";
import * as D from "../servidor/dados.ts";
import { exigirPapel } from "../servidor/sessao.ts";
import { agoraBr } from "../servidor/util.ts";
import { ErroIa } from "../ia/roteador.ts";
import * as A from "./armazem.ts";
import { conferirCupom, cuponsDaEmpresa } from "./cupons.ts";
import * as E from "./envio.ts";
import { montarTexto, variacoesComIa, variaveisDesconhecidas } from "./mensagem.ts";
import { aplicarRegras, destinatarios, opcoes, publico, sanearRegras, selecionar } from "./publico.ts";
import { VARIAVEIS, type Campanha, type Jornada, type Lista } from "./tipos.ts";
import { caixaSimulada, provedorDaEmpresa } from "./whatsapp.ts";

export const router = express.Router();
export default router;

const ok = (fn: (req: Request, res: Response) => unknown) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e) {
    console.error("[crm]", req.method, req.path, e instanceof Error ? e.message : e);
    if (!res.headersSent) res.status(400).json({ erro: e instanceof Error ? e.message : "Erro." });
  }
};
const emp = (req: Request) => {
  const id = req.ctx?.empresaId;
  if (!id || !D.idValido(id)) throw new Error("Entre de novo.");
  return id;
};
const admin = exigirPapel("admin");
const texto = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const agoraIso = () => new Date().toISOString();

/** Data digitada na tela ("AAAA-MM-DDTHH:MM", horário de Brasília) -> padrão do painel. */
function dataAgendada(v: unknown): string | null {
  const m = String(v ?? "").match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])).toISOString() : null;
}

// ------------------------------------------------------------------ público

/** Público filtrado (até 500 na tela) + números para a contagem. */
router.post("/publico", ok(async (req, res) => {
  const e = emp(req);
  const regras = sanearRegras(req.body?.regras);
  const { todos, lista, avisos } = await selecionar(e, regras);
  const dest = destinatarios(lista);
  const ordem = [...lista].sort((a, b) => b.corridas - a.corridas);
  res.json({
    avisos, total: lista.length, destinatarios: dest.length, semTelefone: lista.filter((c) => !c.telefone.replace(/\D/g, "")).length, optOut: lista.filter((c) => c.optOut).length,
    opcoes: opcoes(todos), contatos: ordem.slice(0, 500), cortado: lista.length > 500,
  });
}));

/** Só a contagem (tela de campanha, antes de salvar). */
router.post("/publico/contar", ok(async (req, res) => {
  const { lista, avisos } = await selecionar(emp(req), sanearRegras(req.body?.regras));
  res.json({ total: lista.length, destinatarios: destinatarios(lista).length, avisos });
}));

router.post("/publico/optout", ok((req, res) => {
  const chave = texto(req.body?.chave, 60);
  if (!/^[pm]:[\w .-]{1,56}$/.test(chave)) return res.status(400).json({ erro: "Pessoa inválida." });
  A.marcarOptOut(emp(req), chave, req.body?.sair !== false);
  res.json({ ok: true });
}));

// ------------------------------------------------------------------ listas e segmentos

router.get("/listas", ok(async (req, res) => {
  const e = emp(req);
  const l = A.listas(e);
  // Tamanho atual de cada uma (dinâmica recalcula).
  const pub = { passageiro: (await publico(e, "passageiro")).contatos, motorista: (await publico(e, "motorista")).contatos };
  res.json({ listas: l.map((x) => ({ ...x, chaves: undefined, total: aplicarRegras(pub[x.regras.tipo], { tipo: x.regras.tipo, listaId: x.id }, l).length })) });
}));

router.post("/listas", ok(async (req, res) => {
  const e = emp(req);
  const nome = texto(req.body?.nome, 60);
  if (nome.length < 2) return res.status(400).json({ erro: "Dê um nome para a lista." });
  const modo = req.body?.modo === "fixa" ? "fixa" : "dinamica";
  const regras = sanearRegras(req.body?.regras);
  delete regras.listaId; // lista não aponta para lista (evita laço)
  const chaves = modo === "fixa" ? (await selecionar(e, regras)).lista.map((c) => c.chave) : [];
  const l = A.listas(e);
  const nova: Lista = { id: A.novoId(), nome, modo, regras, chaves, criadaEm: agoraIso(), atualizadaEm: agoraIso() };
  A.salvarListas(e, [...l, nova]);
  res.json({ lista: { ...nova, chaves: undefined }, total: modo === "fixa" ? chaves.length : undefined });
}));

router.delete("/listas/:id", ok((req, res) => {
  const e = emp(req);
  if (A.campanhas(e).some((c) => c.publico.listaId === req.params.id && ["agendada", "enviando", "pausada"].includes(c.estado))) return res.status(400).json({ erro: "Uma campanha em andamento usa esta lista." });
  A.salvarListas(e, A.listas(e).filter((x) => x.id !== req.params.id));
  res.json({ ok: true });
}));

// ------------------------------------------------------------------ campanhas

function lerCampanha(e: string, b: Record<string, unknown>, atual?: Campanha): Campanha {
  const t = texto(b.texto, 2000);
  const desconhecidas = variaveisDesconhecidas(t);
  if (desconhecidas.length) throw new Error(`Variável que não existe: {${desconhecidas.join("}, {")}}. Use: {${VARIAVEIS.join("}, {")}}.`);
  const variacoes = Array.isArray(b.variacoes) ? b.variacoes.map((v) => texto(v, 2000)).filter(Boolean).slice(0, 5) : atual?.variacoes ?? [];
  for (const v of variacoes) if (variaveisDesconhecidas(v).length) throw new Error("Uma variação tem variável que não existe.");
  const agendadaPara = b.agendadaPara ? dataAgendada(b.agendadaPara) : null;
  if (b.agendadaPara && !agendadaPara) throw new Error("Data de agendamento inválida.");
  return {
    id: atual?.id ?? A.novoId(), nome: texto(b.nome, 80) || "Campanha sem nome", canal: "whatsapp",
    publico: sanearRegras(b.publico), texto: t, variacoes, cupom: conferirCupom(e, texto(b.cupom, 40), false),
    agendadaPara, estado: atual?.estado ?? "rascunho", criadaEm: atual?.criadaEm ?? agoraIso(), atualizadaEm: agoraIso(),
    disparadaEm: atual?.disparadaEm ?? null, concluidaEm: atual?.concluidaEm ?? null, destinatarios: atual?.destinatarios ?? 0,
  };
}

router.get("/campanhas", ok((req, res) => {
  const e = emp(req);
  const f = A.fila(e);
  res.json({
    campanhas: A.campanhas(e).sort((a, b) => b.criadaEm.localeCompare(a.criadaEm)).map((c) => {
      const itens = f.filter((i) => i.origem.id === c.id);
      return { ...c, enviados: itens.filter((i) => i.estado === "enviado").length, pendentes: itens.filter((i) => i.estado === "pendente").length, falhas: itens.filter((i) => i.estado === "falha").length };
    }),
  });
}));

router.post("/campanhas", ok(async (req, res) => {
  const e = emp(req);
  const c = lerCampanha(e, req.body ?? {});
  const { lista } = await selecionar(e, c.publico);
  A.salvarCampanhas(e, [...A.campanhas(e), c]);
  res.json({ campanha: c, destinatarios: destinatarios(lista).length });
}));

router.put("/campanhas/:id", ok(async (req, res) => {
  const e = emp(req);
  const l = A.campanhas(e);
  const i = l.findIndex((x) => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ erro: "Campanha não encontrada." });
  if (l[i].estado !== "rascunho" && l[i].estado !== "agendada") return res.status(400).json({ erro: "Campanha já disparada não muda. Duplique para enviar outra." });
  l[i] = lerCampanha(e, req.body ?? {}, l[i]);
  if (!l[i].agendadaPara && l[i].estado === "agendada") l[i].estado = "rascunho";
  A.salvarCampanhas(e, l);
  res.json({ campanha: l[i] });
}));

router.delete("/campanhas/:id", ok((req, res) => {
  const e = emp(req);
  const c = A.campanhas(e).find((x) => x.id === req.params.id);
  if (!c) return res.status(404).json({ erro: "Campanha não encontrada." });
  if (c.estado === "enviando" || c.estado === "pausada") return res.status(400).json({ erro: "Cancele a campanha antes de apagar." });
  A.salvarCampanhas(e, A.campanhas(e).filter((x) => x.id !== c.id));
  res.json({ ok: true });
}));

/** Prévia: a mensagem pronta para as 3 primeiras pessoas do público. */
router.post("/campanhas/previa", ok(async (req, res) => {
  const e = emp(req);
  const c = lerCampanha(e, req.body ?? {});
  const { lista } = await selecionar(e, c.publico);
  const empresa = D.marca(e).nomeExibido;
  const exemplo = { nome: "Maria Silva", cidade: "sua cidade", diasSemCorrida: 12, corridas: 5 };
  const pessoas = destinatarios(lista).slice(0, 3);
  res.json({ previas: (pessoas.length ? pessoas : [exemplo]).map((p) => ({ nome: p.nome, texto: montarTexto(c.texto, { contato: p, cupom: c.cupom, empresa }) })) });
}));

router.post("/campanhas/:id/disparar", admin, ok(async (req, res) => {
  const e = emp(req);
  const c = A.campanhas(e).find((x) => x.id === req.params.id);
  if (!c) return res.status(404).json({ erro: "Campanha não encontrada." });
  if (req.body?.agendar) {
    if (!c.agendadaPara) return res.status(400).json({ erro: "Escolha a data e a hora do envio." });
    if (c.agendadaPara <= agoraBr().toISOString()) return res.status(400).json({ erro: "A data do agendamento já passou." });
    E.atualizarCampanha(e, c.id, (x) => { x.estado = "agendada"; });
    return res.json({ ok: true, agendada: true });
  }
  const n = await E.dispararCampanha(e, c.id);
  E.processarFila(e).catch(() => { /* o trabalhador tenta de novo */ });
  res.json({ ok: true, naFila: n });
}));

router.post("/campanhas/:id/pausar", admin, ok((req, res) => {
  const c = E.atualizarCampanha(emp(req), req.params.id, (x) => { if (x.estado !== "enviando") throw new Error("Só pausa campanha que está enviando."); x.estado = "pausada"; });
  res.json({ campanha: c });
}));
router.post("/campanhas/:id/retomar", admin, ok((req, res) => {
  const c = E.atualizarCampanha(emp(req), req.params.id, (x) => { if (x.estado !== "pausada") throw new Error("A campanha não está pausada."); x.estado = "enviando"; });
  res.json({ campanha: c });
}));
router.post("/campanhas/:id/cancelar", admin, ok((req, res) => {
  const e = emp(req);
  const c = A.campanhas(e).find((x) => x.id === req.params.id);
  if (!c) return res.status(404).json({ erro: "Campanha não encontrada." });
  if (c.estado === "concluida" || c.estado === "cancelada") return res.status(400).json({ erro: "A campanha já terminou." });
  E.cancelarCampanha(e, c.id);
  res.json({ ok: true });
}));

router.post("/campanhas/:id/duplicar", ok((req, res) => {
  const e = emp(req);
  const c = A.campanhas(e).find((x) => x.id === req.params.id);
  if (!c) return res.status(404).json({ erro: "Campanha não encontrada." });
  const nova: Campanha = { ...c, id: A.novoId(), nome: `${c.nome} (cópia)`.slice(0, 80), estado: "rascunho", agendadaPara: null, criadaEm: agoraIso(), atualizadaEm: agoraIso(), disparadaEm: null, concluidaEm: null, destinatarios: 0 };
  A.salvarCampanhas(e, [...A.campanhas(e), nova]);
  res.json({ campanha: nova });
}));

router.get("/campanhas/:id/relatorio", ok((req, res) => res.json(E.relatorioCampanha(emp(req), req.params.id))));

/** Variações do texto pela IA (caso "chat"). */
router.post("/variacoes", ok(async (req, res) => {
  const e = emp(req);
  const t = texto(req.body?.texto, 2000);
  if (t.length < 10) return res.status(400).json({ erro: "Escreva a mensagem primeiro." });
  try {
    res.json(await variacoesComIa(t, Number(req.body?.quantidade) || 3, D.marca(e).nomeExibido, D.segredos(e).ia));
  } catch (err) {
    if (err instanceof ErroIa) return res.status(502).json({ erro: err.semChave ? "Nenhuma chave de IA configurada. Cadastre em Integrações." : "A IA não respondeu agora. Tente de novo." });
    throw err;
  }
}));

/** Mensagem de teste para um número (sai na hora, fora do lote). */
router.post("/teste", admin, ok(async (req, res) => {
  const e = emp(req);
  const empresa = D.marca(e).nomeExibido;
  const msg = montarTexto(texto(req.body?.texto, 2000), { contato: { nome: texto(req.body?.nome, 60) || "Teste", cidade: "", diasSemCorrida: null, corridas: 0 }, cupom: texto(req.body?.cupom, 40), empresa });
  const r = await E.enviarTeste(e, texto(req.body?.telefone, 30), msg);
  res.status(r.ok ? 200 : 502).json(r.ok ? { ok: true } : { erro: r.erro });
}));

// ------------------------------------------------------------------ jornadas

function lerJornada(e: string, b: Record<string, unknown>, atual?: Jornada): Jornada {
  const t = texto(b.texto, 2000);
  const desconhecidas = variaveisDesconhecidas(t);
  if (desconhecidas.length) throw new Error(`Variável que não existe: {${desconhecidas.join("}, {")}}.`);
  const g = (b.gatilho ?? {}) as Record<string, unknown>;
  const dias = Math.min(365, Math.max(1, Math.floor(Number(g.dias)) || 15));
  return {
    id: atual?.id ?? A.novoId(), nome: texto(b.nome, 80) || "Jornada sem nome", ativa: b.ativa === true,
    gatilho: { tipo: g.tipo === "cancelou" ? "cancelou" : "sem-corrida", dias }, publico: sanearRegras(b.publico),
    texto: t, cupom: conferirCupom(e, texto(b.cupom, 40), b.ativa === true),
    criadaEm: atual?.criadaEm ?? agoraIso(), atualizadaEm: agoraIso(), ultimaRodada: atual?.ultimaRodada ?? null,
  };
}

router.get("/jornadas", ok((req, res) => {
  const e = emp(req);
  const f = A.fila(e);
  const d = A.disparos(e);
  res.json({ jornadas: A.jornadas(e).map((j) => ({ ...j, enviados: f.filter((i) => i.origem.id === j.id && i.estado === "enviado").length, pendentes: f.filter((i) => i.origem.id === j.id && i.estado === "pendente").length, alcancados: Object.keys(d[j.id] ?? {}).length })) });
}));
router.post("/jornadas", admin, ok((req, res) => {
  const e = emp(req);
  const j = lerJornada(e, req.body ?? {});
  if (j.ativa && !j.texto) return res.status(400).json({ erro: "Escreva a mensagem antes de ligar." });
  A.salvarJornadas(e, [...A.jornadas(e), j]);
  res.json({ jornada: j });
}));
router.put("/jornadas/:id", admin, ok((req, res) => {
  const e = emp(req);
  const l = A.jornadas(e);
  const i = l.findIndex((x) => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ erro: "Jornada não encontrada." });
  l[i] = lerJornada(e, req.body ?? {}, l[i]);
  if (l[i].ativa && !l[i].texto) return res.status(400).json({ erro: "Escreva a mensagem antes de ligar." });
  A.salvarJornadas(e, l);
  res.json({ jornada: l[i] });
}));
router.delete("/jornadas/:id", admin, ok((req, res) => {
  const e = emp(req);
  A.salvarJornadas(e, A.jornadas(e).filter((x) => x.id !== req.params.id));
  A.alterarFila(e, (f) => { for (const i of f) if (i.origem.id === req.params.id && i.estado === "pendente") { i.estado = "cancelado"; i.erro = "Jornada apagada."; } });
  res.json({ ok: true });
}));
/** Quantas pessoas a jornada pegaria agora (sem enviar). */
router.post("/jornadas/contar", ok(async (req, res) => {
  const e = emp(req);
  const j = lerJornada(e, { ...(req.body ?? {}), texto: "", cupom: "", ativa: false });
  const { lista } = await selecionar(e, j.publico);
  const alvo = destinatarios(j.gatilho.tipo === "sem-corrida" ? lista.filter((c) => c.diasSemCorrida != null && c.diasSemCorrida >= j.gatilho.dias) : lista.filter((c) => c.ultimoGrupo === "cancelada" && c.diasSemCorrida != null && c.diasSemCorrida <= j.gatilho.dias));
  res.json({ total: alvo.length });
}));
router.post("/jornadas/:id/rodar", admin, ok(async (req, res) => {
  const e = emp(req);
  const j = A.jornadas(e).find((x) => x.id === req.params.id);
  if (!j) return res.status(404).json({ erro: "Jornada não encontrada." });
  const n = await E.rodarJornada(e, j);
  E.processarFila(e).catch(() => { /* o trabalhador tenta de novo */ });
  res.json({ naFila: n });
}));

// ------------------------------------------------------------------ envio (fila e configuração)

/** Cupons do cadastro da empresa (para escolher na campanha). */
router.get("/cupons", ok((req, res) => res.json({ cupons: cuponsDaEmpresa(emp(req)) })));

router.get("/fila", ok((req, res) => res.json(E.resumoFila(emp(req)))));
router.post("/fila/processar", admin, ok(async (req, res) => res.json(await E.processarFila(emp(req)))));

router.get("/simulado", ok((req, res) => res.json({ mensagens: caixaSimulada(emp(req)).slice(0, 50).map((m) => ({ ...m, telefone: E.mascarar(m.telefone) })) })));

router.get("/config", ok(async (req, res) => {
  const e = emp(req);
  const c = A.config(e);
  const cred = A.credWhatsApp(e);
  res.json({
    config: c,
    // Segredo nunca volta: só se está preenchido.
    whatsapp: { url: cred.url, instancia: cred.instancia, token: cred.token ? "••••••" : "" },
    pendencias: await provedorDaEmpresa(e).pendencias(),
    variaveis: VARIAVEIS,
  });
}));

router.put("/config", admin, ok((req, res) => {
  const e = emp(req);
  const b = (req.body ?? {}) as Record<string, unknown>;
  const c = A.sanearConfig({ ...A.config(e), ...((b.config ?? {}) as object) });
  if (b.whatsapp && typeof b.whatsapp === "object") A.salvarCredWhatsApp(e, b.whatsapp as Record<string, unknown>);
  A.salvarConfig(e, c);
  res.json({ config: c });
}));

// Trabalhador da fila (não roda nos testes).
if (process.env.NODE_ENV !== "test") E.iniciarTrabalhador();
