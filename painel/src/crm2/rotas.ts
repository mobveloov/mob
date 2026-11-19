// Rotas das abas de análise do CRM (/api/crm/...): Contatos, RFM, Conversão, Mapa de Calor, Recompensas, Cidades, Governança e Auditoria.
// Ligadas dentro de crm/rotas.ts (uma linha). A empresa vem do login (req.ctx.empresaId), nunca da URL.

import express, { type Request, type Response } from "express";
import { limparCachePublico, corridasDoPublico } from "../crm/publico.ts";
import * as D from "../servidor/dados.ts";
import { exigirPapel } from "../servidor/sessao.ts";
import { agoraBr } from "../servidor/util.ts";
import { apagarCidade, criarCidade, editarCidade, ligarCidade, listarCidades } from "./cidades.ts";
import { conversaoDaEmpresa } from "./conversao.ts";
import { anotar, auditarRotas, listarAuditoria } from "./auditoria.ts";
import { salvarConfig2 } from "./base.ts";
import * as C from "./contatos.ts";
import { resumoDeGovernanca } from "./governanca.ts";
import { atualizarMapa, lerMapa, mapaJaGerado } from "./mapa.ts";
import { criarCupom, descontoDosUltimos30Dias, listarCupons, removerCupom, resumoDeCupons } from "./recompensas.ts";
import { atualizarRfm, contatosParaCsv, criarSegmentoRfm, resumoRfm } from "./rfm.ts";

export const rotasCrm2 = express.Router();
/** Filtro de auditoria: vai antes das rotas do CRM (campanhas, jornadas, templates, listas). */
export const filtroAuditoria = auditarRotas;

const ok = (fn: (req: Request, res: Response) => unknown) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e) {
    console.error("[crm2]", req.method, req.path, e instanceof Error ? e.message : e);
    if (!res.headersSent) res.status(400).json({ erro: e instanceof Error ? e.message : "Erro." });
  }
};
const emp = (req: Request) => {
  const id = req.ctx?.empresaId;
  if (!id || !D.idValido(id)) throw new Error("Entre de novo.");
  return id;
};
const quem = (req: Request) => req.ctx?.usuario.email || req.ctx?.usuario.nome || "";
const admin = exigirPapel("admin");
const gestor = exigirPapel("gestor");
const txt = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const pagina = (v: unknown) => Math.max(0, Math.floor(Number(v)) || 0);

// ------------------------------------------------------------------ contatos

rotasCrm2.get("/contatos", ok(async (req, res) => {
  const e = emp(req);
  await C.garantirBase(e);
  const lista = C.listarContatos(e, { busca: txt(req.query.busca, 80), stage: txt(req.query.stage, 20), tag: txt(req.query.tag, 40), pagina: pagina(req.query.pagina) });
  res.json({ ...lista, estagios: C.contagemPorEstagio(e), tags: C.tagsDistintas(e), stats: C.estatisticas(e) });
}));

rotasCrm2.get("/contatos/motoristas", ok(async (req, res) => {
  res.json(await C.listarMotoristas(emp(req), { busca: txt(req.query.busca, 80), situacao: txt(req.query.situacao, 40), pagina: pagina(req.query.pagina) }));
}));

/** "Atualizar Métricas" / "Trazer para a base": lê o cadastro e as corridas de novo. */
rotasCrm2.post("/contatos/sincronizar", gestor, ok(async (req, res) => {
  const e = emp(req);
  limparCachePublico(e);
  res.json(await C.sincronizar(e));
}));

rotasCrm2.post("/contatos/importar", gestor, ok((req, res) => {
  const csv = String(req.body?.csv ?? "");
  if (!csv.trim()) return res.status(400).json({ erro: "Cole o conteúdo do CSV." });
  res.json(C.importarCsv(emp(req), csv.slice(0, 2_000_000)));
}));

rotasCrm2.get("/contatos/:chave", ok((req, res) => {
  const e = emp(req);
  const contato = C.contatoPorChave(e, req.params.chave);
  if (!contato) return res.status(404).json({ erro: "Contato não encontrado." });
  res.json({ contato, eventos: C.linhaDoTempo(e, contato.chave), mensagens7dias: C.mensagens7dias(e, contato.chave) });
}));

/** Exporta os dados do contato (LGPD). */
rotasCrm2.get("/contatos/:chave/exportar", ok((req, res) => {
  const e = emp(req);
  const contato = C.contatoPorChave(e, req.params.chave);
  if (!contato) return res.status(404).json({ erro: "Contato não encontrado." });
  res.json({ contato, eventos: C.linhaDoTempo(e, contato.chave, 5000) });
}));

rotasCrm2.post("/contatos/:chave/optout", gestor, ok((req, res) => {
  res.json({ contato: C.mudarOptOut(emp(req), req.params.chave, req.body?.sair !== false, quem(req)) });
}));

rotasCrm2.put("/contatos/:chave/tags", gestor, ok((req, res) => {
  res.json({ tags: C.salvarTags(emp(req), req.params.chave, req.body?.tags) });
}));

rotasCrm2.delete("/contatos/:chave", admin, ok((req, res) => {
  C.excluirContato(emp(req), req.params.chave);
  res.json({ ok: true });
}));

// ------------------------------------------------------------------ RFM

rotasCrm2.get("/rfm", ok(async (req, res) => {
  const e = emp(req);
  await C.garantirBase(e);
  const linhas = resumoRfm(e);
  res.json({ linhas, total: linhas.reduce((a, l) => a + l.contacts, 0), ltv: Math.round(linhas.reduce((a, l) => a + l.ltv, 0) * 100) / 100 });
}));

rotasCrm2.post("/rfm/atualizar", gestor, ok(async (req, res) => {
  const e = emp(req);
  limparCachePublico(e);
  await C.sincronizar(e);
  res.json({ analisados: atualizarRfm(e) });
}));

rotasCrm2.post("/rfm/segmento", gestor, ok((req, res) => {
  const e = emp(req);
  const s = criarSegmentoRfm(e, txt(req.body?.segmento, 40));
  anotar(e, quem(req), { entidade: "segmento", entidade_id: s.id, entidade_nome: s.nome, acao: "criou", campos: [], antigo: null, novo: { id: s.id, nome: s.nome, modo: "dinamica", pessoas: s.total } });
  res.json(s);
}));

rotasCrm2.get("/rfm/contatos", ok((req, res) => res.json({ contatos: contatosParaCsv(emp(req)) })));

// ------------------------------------------------------------------ conversão

rotasCrm2.get("/conversao", ok(async (req, res) => {
  const e = emp(req);
  await C.garantirBase(e);
  res.json(conversaoDaEmpresa(e, Number(req.query.dias) || 30));
}));

// ------------------------------------------------------------------ mapa de calor

rotasCrm2.get("/mapa", ok(async (req, res) => {
  const e = emp(req);
  // Primeira vez sem nenhum dado: gera sozinho a partir das corridas.
  if (!mapaJaGerado(e)) atualizarMapa(e, (await corridasDoPublico(e)).corridas);
  res.json({ celulas: lerMapa(e), cidades: listarCidades(e) });
}));

rotasCrm2.post("/mapa/atualizar", gestor, ok(async (req, res) => {
  const e = emp(req);
  limparCachePublico(e);
  res.json({ zonas: atualizarMapa(e, (await corridasDoPublico(e)).corridas), celulas: lerMapa(e), cidades: listarCidades(e) });
}));

// ------------------------------------------------------------------ recompensas (cupons)

rotasCrm2.get("/recompensas", ok(async (req, res) => {
  const e = emp(req);
  const { corridas } = await corridasDoPublico(e);
  const hoje = agoraBr().toISOString().slice(0, 10);
  const origem = txt(req.query.origem, 12) || "all";
  const todos = listarCupons(e, corridas, hoje, origem);
  res.json({ cupons: todos.slice(0, 300), resumo: resumoDeCupons(todos), desconto30: descontoDosUltimos30Dias(corridas) });
}));

rotasCrm2.post("/recompensas/atualizar", gestor, ok((req, res) => { limparCachePublico(emp(req)); res.json({ ok: true }); }));

rotasCrm2.post("/recompensas/cupons", gestor, ok((req, res) => {
  const c = criarCupom(emp(req), req.body ?? {}, quem(req));
  res.json({ id: c.id });
}));

rotasCrm2.delete("/recompensas/cupons/:id", gestor, ok((req, res) => { removerCupom(emp(req), req.params.id); res.json({ ok: true }); }));

// ------------------------------------------------------------------ cidades

rotasCrm2.get("/cidades", ok((req, res) => res.json({ cidades: listarCidades(emp(req)) })));
rotasCrm2.post("/cidades", gestor, ok((req, res) => res.json({ cidade: criarCidade(emp(req), req.body ?? {}) })));
rotasCrm2.put("/cidades/:id", gestor, ok((req, res) => res.json({ cidade: editarCidade(emp(req), req.params.id, req.body ?? {}) })));
rotasCrm2.post("/cidades/:id/ligar", gestor, ok((req, res) => { ligarCidade(emp(req), req.params.id, req.body?.ativa !== false); res.json({ ok: true }); }));
rotasCrm2.delete("/cidades/:id", gestor, ok((req, res) => { apagarCidade(emp(req), req.params.id); res.json({ ok: true }); }));

// ------------------------------------------------------------------ governança

rotasCrm2.get("/governanca", ok(async (req, res) => {
  const e = emp(req);
  await C.garantirBase(e);
  res.json(resumoDeGovernanca(e));
}));

rotasCrm2.put("/governanca", admin, ok((req, res) => {
  res.json({ settings: salvarConfig2(emp(req), { janelaInicio: req.body?.crm_send_window_start, janelaFim: req.body?.crm_send_window_end, exigirOptIn: req.body?.crm_require_opt_in === true, atribuicaoHoras: req.body?.crm_attribution_hours }) });
}));

// ------------------------------------------------------------------ auditoria

rotasCrm2.get("/auditoria", ok((req, res) => {
  res.json({ linhas: listarAuditoria(emp(req), { dias: Number(req.query.dias), entidade: txt(req.query.entidade, 20), acao: txt(req.query.acao, 20) }) });
}));

// ------------------------------------------------------------------ rotina (não roda nos testes)

let relogio: NodeJS.Timeout | null = null;
const rfmFeitoNoDia = new Map<string, string>();

/** A cada 10 min traz contatos novos e recalcula as métricas; o RFM roda todo dia a partir das 03:15 (Brasília). */
export function iniciarRotinaCrm2(intervaloMs = 10 * 60_000) {
  if (relogio) return;
  relogio = setInterval(async () => {
    for (const e of D.listarEmpresas().filter((x) => x.ativa)) {
      try {
        await C.sincronizar(e.id);
        const br = agoraBr(), dia = br.toISOString().slice(0, 10);
        if (br.getUTCHours() * 60 + br.getUTCMinutes() >= 3 * 60 + 15 && rfmFeitoNoDia.get(e.id) !== dia) { atualizarRfm(e.id); rfmFeitoNoDia.set(e.id, dia); }
      } catch (err) { console.error("[crm2] rotina", e.id, err instanceof Error ? err.message : err); }
    }
  }, intervaloMs);
  relogio.unref();
}
export function pararRotinaCrm2() { if (relogio) clearInterval(relogio); relogio = null; }
if (process.env.NODE_ENV !== "test") iniciarRotinaCrm2();
