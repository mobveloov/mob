// Rotas da automação do CRM (/api/crm): Gatilhos, Fila de Dispatches, Régua de reativação, Notificações e os limites de envio.
// Montadas por rotas.ts. A empresa de cada pedido vem SEMPRE do login (req.ctx.empresaId). Ver e consultar: qualquer usuário do CRM;
// criar, ligar, editar, cancelar envio e configurar: Gestor e acima.

import express, { type Request, type Response } from "express";
import * as D from "../servidor/dados.ts";
import { exigirPapel } from "../servidor/sessao.ts";
import * as A from "./armazem.ts";
import { MODELOS_GATILHO } from "./catalogo.ts";
import * as G from "./gatilhos.ts";
import * as L from "./limites.ts";
import { estatisticas, listarEnvios } from "./registro.ts";
import * as R from "./regua.ts";
import "./ganchos-crm2.ts";
import { templates } from "./templates.ts";

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
const admin = exigirPapel("gestor");
const txt = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const inteiro = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined; };

// ------------------------------------------------------------------ gatilhos

const comTemplate = (e: string) => {
  const mapa = new Map(templates(e).map((t) => [t.id, t]));
  return G.gatilhos(e).map((g) => ({ ...g, template: g.template_id ? mapa.get(g.template_id) ?? null : null }));
};

router.get("/gatilhos", ok((req, res) => {
  const e = emp(req);
  res.json({ gatilhos: comTemplate(e), templates: templates(e).filter((t) => t.is_active), ...G.estatisticasGatilhos(e), modelos: MODELOS_GATILHO.map((m) => ({ nome: m.template.name })), instalados: G.gatilhos(e).map((g) => g.name) });
}));

router.get("/gatilhos/usos", ok((req, res) => {
  const e = emp(req);
  res.json({ usos: G.usosDoTemplate(e, txt(req.query.template, 40), txt(req.query.exceto, 40) || undefined) });
}));

router.post("/gatilhos/instalar", admin, ok((req, res) => {
  const idx = Array.isArray(req.body?.indices) ? (req.body.indices as unknown[]).map(Number).filter((n) => Number.isInteger(n)) : [];
  res.json(G.instalarModelos(emp(req), idx));
}));

/** A mensagem pode ser editada junto: grava no template ou numa cópia só deste gatilho. */
function aplicarMensagem(e: string, corpo: Record<string, unknown>, nome: string): string {
  const m = corpo.mensagem as { titulo?: unknown; texto?: unknown; copia?: unknown } | undefined;
  const tpl = txt(corpo.template_id, 40);
  if (!m || !tpl) return tpl;
  return G.salvarMensagemDoGatilho(e, { templateId: tpl, titulo: String(m.titulo ?? ""), texto: String(m.texto ?? ""), copia: m.copia === true, nomeGatilho: nome });
}

router.post("/gatilhos", admin, ok((req, res) => {
  const e = emp(req);
  const nome = txt(req.body?.name, 120);
  const corpo = { ...req.body, template_id: aplicarMensagem(e, req.body ?? {}, nome) };
  res.json({ gatilho: G.salvarGatilho(e, null, { ...G.sanearGatilho(e, corpo), is_active: true }) });
}));

router.put("/gatilhos/:id", admin, ok((req, res) => {
  const e = emp(req);
  const nome = txt(req.body?.name, 120);
  const corpo = { ...req.body, template_id: aplicarMensagem(e, req.body ?? {}, nome) };
  res.json({ gatilho: G.salvarGatilho(e, String(req.params.id), G.sanearGatilho(e, corpo)) });
}));

router.post("/gatilhos/:id/ligar", admin, ok((req, res) => res.json({ gatilho: G.ligarGatilho(emp(req), String(req.params.id)) })));
router.post("/gatilhos/:id/duplicar", admin, ok((req, res) => res.json({ gatilho: G.duplicarGatilho(emp(req), String(req.params.id)) })));
router.delete("/gatilhos/:id", admin, ok((req, res) => res.json({ ok: G.apagarGatilho(emp(req), String(req.params.id)) })));
router.get("/gatilhos/:id/logs", ok((req, res) => res.json({ logs: G.logsDoGatilho(emp(req), String(req.params.id)) })));
router.post("/gatilhos/:id/teste", admin, ok(async (req, res) => res.json(await G.testarGatilho(emp(req), String(req.params.id), txt(req.body?.telefone, 30)))));

// ------------------------------------------------------------------ fila de dispatches (gatilhos com atraso)

const VISOES = new Set(["pending", "processed", "canceled", "all"]);

router.get("/dispatches", ok((req, res) => {
  const e = emp(req);
  const visao = VISOES.has(String(req.query.visao)) ? (String(req.query.visao) as G.VisaoFila) : "pending";
  const { total, linhas } = G.listarFila(e, { visao, gatilhoId: txt(req.query.gatilho, 40) || undefined, busca: txt(req.query.busca, 80), pagina: inteiro(req.query.pagina) ? Number(req.query.pagina) : 0 });
  res.json({ total, linhas, stats: G.estatisticasFila(e), gatilhos: G.gatilhos(e).map((g) => ({ id: g.id, name: g.name, type: g.trigger_type })) });
}));

router.post("/dispatches/:id/:acao", admin, ok((req, res) => {
  const acao = String(req.params.acao);
  if (acao !== "cancelar" && acao !== "agora") return res.status(404).json({ erro: "Ação desconhecida." });
  res.json({ ok: G.agirNaFila(emp(req), String(req.params.id), acao === "cancelar" ? "cancel" : "now") });
}));

/** Roda já a fila com atraso (botão "atualizar" e testes). */
router.post("/dispatches/processar", admin, ok(async (req, res) => res.json(await G.processarAtrasados(emp(req)))));

// ------------------------------------------------------------------ notificações (histórico de envios)

router.post("/notificacoes", ok((req, res) => {
  const e = emp(req);
  const b = req.body ?? {};
  const de = Number(b.de) || Date.now() - 7 * 86_400_000, ate = Number(b.ate) || Date.now() + 60_000;
  const evento = txt(b.evento, 40);
  const gatilhos = G.gatilhos(e);
  const filtro = {
    de, ate, origem: txt(b.origem, 20) || undefined, estado: txt(b.estado, 12) || undefined, canal: txt(b.canal, 12) || undefined, busca: txt(b.busca, 80),
    gatilhoId: txt(b.gatilho, 40) || undefined, gatilhoIds: evento ? gatilhos.filter((g) => g.trigger_type === evento).map((g) => g.id) : undefined, pagina: Math.max(0, Number(b.pagina) || 0),
  };
  const r = listarEnvios(e, filtro);
  res.json({
    ...r, stats: estatisticas(e, de, ate),
    nomes: {
      gatilhos: gatilhos.map((g) => ({ id: g.id, name: g.name, type: g.trigger_type })),
      campanhas: A.campanhas(e).map((c) => ({ id: c.id, name: c.nome })),
      jornadas: A.jornadas(e).map((j) => ({ id: j.id, name: j.nome })),
    },
  });
}));

// ------------------------------------------------------------------ régua de reativação

router.get("/regua", ok(async (req, res) => res.json(await R.reguaStatus(emp(req)))));
router.put("/regua", admin, ok(async (req, res) => {
  const r = await R.reguaSalvar(emp(req), req.body ?? {});
  if (!r.ok) return res.status(400).json({ erro: r.error ?? "Não foi possível salvar." });
  res.json({ ok: true });
}));

// ------------------------------------------------------------------ limites e horários de envio (a tela Governança usa estas rotas)

router.get("/limites", ok((req, res) => {
  const e = emp(req);
  res.json({ governanca: L.governanca(e), pausa: L.pausaGeral(e), tetoHoje: L.tetoHoje(e), enviadosHoje: L.enviadosHoje(e) });
}));
router.put("/limites/governanca", admin, ok((req, res) => res.json({ governanca: L.salvarGovernanca(emp(req), req.body ?? {}) })));
router.post("/limites/pausa", admin, ok((req, res) => res.json({ pausa: L.definirPausaGeral(emp(req), req.body?.pausar === true, req.ctx?.usuario.nome ?? "") })));
