// Rotas do painel para Financeiro, Comunicação, Config, Avaliações e Ajuda (montadas em /api/config, depois do login).

import express, { type Request, type Response } from "express";
import fs from "node:fs";
import { resolverSaque } from "../apps/extras.ts";
import { lancar, saldo } from "../apps/extras.ts";
import { exigirPapel } from "../servidor/sessao.ts";
import * as D from "../servidor/dados.ts";
import { agoraBr } from "../servidor/util.ts";
import { configDosApps } from "./apps.ts";
import { configNps, resetarRecusas, resumoNps, salvarConfigNps, type PapelNps } from "./avaliacoes.ts";
import { ajuda, salvarAjuda } from "./ajuda.ts";
import { categoriasCompletas, ICONES, removerCategoria, removerTarifaExtra, salvarCategoria, salvarTarifaExtra, salvarTarifaPadrao } from "./categorias.ts";
import { ROTULO_METODO } from "./tarifa-calculo.ts";
import { pedidosRecentes } from "../corridas/index.ts";
import { agendamentos, buscarPessoas, conversas, criarAgendamento, dispararNotificacao, executarAgendamentos, historicoNotificacoes, marcarLidas, mensagensDaPessoa, pausarAgendamento, removerAgendamento, responder, sanearPedido } from "./comunicacao.ts";
import { credito, removerRegraComissao, salvarCredito, salvarRegraComissao } from "./credito.ts";
import { descontos, removerDesconto, salvarDesconto } from "./descontos.ts";
import { regrasDespacho, salvarDespacho, transbordos } from "./despacho.ts";
import { areasAutomaticas, ativarAutomacao, ativarDinamica, automacoes, dinamicas, LEGENDA_DINAMICA, nivelDinamica, prioridadeDinamicas, PRIORIDADES, removerAutomacao, removerDinamica, ROTULO_PRIORIDADE, salvarAutomacao, salvarDinamica, salvarPrioridade } from "./dinamica.ts";
import { csvExtratoOnline, csvVisaoGeral, extratoDaCentral, extratoOnline, marcarTransacao, pedirRecargaCentral, resolverPedidoRecarga, visaoGeral } from "./financeiro-visao.ts";
import { detalheCarteira, extratoGeral, listaCarteiras, listaRecargas, listaSaques, periodo, producaoMotoristas } from "./financeiro.ts";
import { adicionarBanner, arquivoDoBanner, gerais, MAX_BANNER, removerBanner, salvarGerais, salvarTermos, termos } from "./gerais.ts";
import { credenciaisMp, CAMPOS_MP, pagamentos, salvarCredenciaisMp, salvarPagamentos } from "./pagamentos.ts";
import { texto } from "./armazem.ts";

export const rotasConfig = express.Router();
const ok = (fn: (req: Request, res: Response) => unknown) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e) {
    console.error("[config]", req.method, req.path, e instanceof Error ? e.message : e);
    if (!res.headersSent) res.status(400).json({ erro: e instanceof Error ? e.message : "Erro." });
  }
};
const emp = (req: Request) => req.ctx!.empresaId;
const quem = (req: Request) => req.ctx!.usuario.email;
const admin = exigirPapel("admin");
const q = (req: Request, k: string) => String(req.query[k] ?? "");
const per = (req: Request) => periodo(q(req, "periodo"), q(req, "inicio"), q(req, "fim"));
const papelCart = (v: string) => (v === "motorista" ? "motorista" : "passageiro") as "motorista" | "passageiro";

// ------------------------------------------------------------------ financeiro

rotasConfig.get("/carteiras", ok((req, res) => res.json(listaCarteiras(emp(req), papelCart(q(req, "papel")), q(req, "busca"), q(req, "situacao") || "todos"))));
rotasConfig.get("/carteiras/:papel/:chave", ok((req, res) => res.json({ ...detalheCarteira(emp(req), papelCart(req.params.papel), req.params.chave, per(req)), periodo: per(req) })));
rotasConfig.post("/carteiras/:papel/:chave/ajuste", admin, ok((req, res) => {
  const papel = papelCart(req.params.papel);
  const valor = Number(req.body?.valor);
  if (!Number.isFinite(valor) || valor <= 0 || valor > 10_000) throw new Error("Valor inválido.");
  const retirar = req.body?.acao === "remover";
  if (retirar && saldo(emp(req), papel, req.params.chave) < valor) throw new Error("O saldo não cobre esta retirada.");
  const l = lancar(emp(req), papel, req.params.chave, retirar ? -valor : valor, texto(req.body?.descricao, 120) || (retirar ? "Débito da central" : "Crédito da central"), quem(req));
  res.json({ lancamento: l, saldo: saldo(emp(req), papel, req.params.chave) });
}));
rotasConfig.get("/extrato", ok((req, res) => res.json({ periodo: per(req), ...extratoGeral(emp(req), (["motorista", "passageiro"].includes(q(req, "aba")) ? q(req, "aba") : "geral") as "geral", per(req)) })));
rotasConfig.get("/saques", ok((req, res) => res.json({ periodo: per(req), ...listaSaques(emp(req), per(req)) })));
rotasConfig.post("/saques/:id/:acao", admin, ok((req, res) => {
  if (req.params.acao !== "pagar" && req.params.acao !== "recusar") throw new Error("Ação inválida.");
  res.json({ saque: resolverSaque(emp(req), req.params.id, req.params.acao === "pagar", quem(req), texto(req.body?.motivo, 200)) });
}));
// Financeiro no formato da Machine (mesma regra de acesso do restante do financeiro: leitura para quem está logado, escrita só do admin).
const baixarCsv = (res: Response, nome: string, csv: string) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${nome}-${agoraBr().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
};
rotasConfig.get("/visao-geral", ok((req, res) => res.json(visaoGeral(emp(req), per(req)))));
rotasConfig.get("/visao-geral/csv", ok((req, res) => baixarCsv(res, "visao-geral-financeiro", csvVisaoGeral(emp(req), per(req)))));
rotasConfig.get("/extrato-central", ok((req, res) => res.json(extratoDaCentral(emp(req), per(req)))));
rotasConfig.post("/extrato-central/recargas", admin, ok((req, res) => res.status(201).json({ pedido: pedirRecargaCentral(emp(req), Number(req.body?.valor), texto(req.body?.observacao, 200), quem(req)) })));
rotasConfig.post("/extrato-central/recargas/:id/:acao", admin, ok((req, res) => {
  if (!["confirmar", "cancelar"].includes(req.params.acao)) throw new Error("Ação inválida.");
  res.json({ pedido: resolverPedidoRecarga(emp(req), req.params.id, req.params.acao === "confirmar", quem(req)) });
}));
const filtroTransacoes = (req: Request) => ({ tipo: q(req, "tipo"), status: q(req, "status"), repasse: /^\d{4}-\d{2}-\d{2}$/.test(q(req, "repasse")) ? q(req, "repasse") : "", busca: q(req, "busca").slice(0, 80) });
rotasConfig.get("/transacoes-online", ok((req, res) => res.json(extratoOnline(emp(req), per(req), filtroTransacoes(req)))));
rotasConfig.get("/transacoes-online/csv", ok((req, res) => baixarCsv(res, "extrato-transacoes-online", csvExtratoOnline(emp(req), per(req), filtroTransacoes(req)))));
rotasConfig.post("/transacoes-online/:id/status", admin, ok((req, res) => res.json(marcarTransacao(emp(req), req.params.id, String(req.body?.status ?? ""), texto(req.body?.motivo, 200), quem(req)))));
rotasConfig.get("/recargas", ok((req, res) => res.json({ periodo: per(req), ...listaRecargas(emp(req), papelCart(q(req, "aba") || "motorista"), per(req)) })));
rotasConfig.get("/relatorios/producao", ok((req, res) => {
  const p = periodo("personalizado", q(req, "inicio") || agoraBr().toISOString().slice(0, 8) + "01", q(req, "fim") || agoraBr().toISOString().slice(0, 10));
  res.json({ periodo: p, ...producaoMotoristas(emp(req), { ...p, busca: q(req, "busca"), categoria: q(req, "categoria"), pagamento: q(req, "pagamento"), ordem: q(req, "ordem"), dir: q(req, "dir") }) });
}));

// ------------------------------------------------------------------ comunicação

rotasConfig.get("/conversas", ok((req, res) => res.json({ conversas: conversas(emp(req)) })));
rotasConfig.get("/conversas/:papel/:chave", ok((req, res) => {
  const papel = papelCart(req.params.papel);
  marcarLidas(emp(req), papel, req.params.chave);
  res.json({ mensagens: mensagensDaPessoa(emp(req), papel, req.params.chave) });
}));
rotasConfig.post("/conversas/lidas", ok((req, res) => res.json({ marcadas: marcarLidas(emp(req)) })));
rotasConfig.post("/conversas/:papel/:chave", ok((req, res) => res.json({ mensagem: responder(emp(req), papelCart(req.params.papel), req.params.chave, String(req.body?.texto ?? "")) })));
rotasConfig.post("/conversas/transmissao", ok(async (req, res) => {
  res.json(await dispararNotificacao(emp(req), sanearPedido({ ...req.body, segmento: "todos", titulo: req.body?.titulo || "Aviso da central", mensagem: req.body?.texto }), quem(req)));
}));

rotasConfig.get("/notificacoes", ok((req, res) => res.json({ historico: historicoNotificacoes(emp(req)), agendamentos: agendamentos(emp(req)) })));
rotasConfig.get("/notificacoes/pessoas", ok((req, res) => res.json({ pessoas: buscarPessoas(emp(req), papelCart(q(req, "papel")), q(req, "busca")) })));
rotasConfig.post("/notificacoes", exigirPapel("admin", "operador"), ok(async (req, res) => res.json(await dispararNotificacao(emp(req), sanearPedido(req.body), quem(req)))));
rotasConfig.post("/notificacoes/agendar", exigirPapel("admin", "operador"), ok((req, res) => res.json({ agendamentos: criarAgendamento(emp(req), req.body) })));
rotasConfig.post("/notificacoes/agendar/:id/pausar", exigirPapel("admin", "operador"), ok((req, res) => res.json({ agendamentos: pausarAgendamento(emp(req), req.params.id, req.body?.ativo === true) })));
rotasConfig.delete("/notificacoes/agendar/:id", exigirPapel("admin", "operador"), ok((req, res) => res.json({ agendamentos: removerAgendamento(emp(req), req.params.id) })));

// ------------------------------------------------------------------ config: gerais do app

rotasConfig.get("/gerais", ok((req, res) => res.json({ ...gerais(emp(req)), categoriasNomes: categoriasCompletas(emp(req)).map((c) => ({ id: c.id, nome: c.nome })) })));
rotasConfig.put("/gerais", admin, ok((req, res) => res.json(salvarGerais(emp(req), req.body))));
rotasConfig.post("/gerais/banners", admin, express.raw({ type: "image/*", limit: MAX_BANNER }), ok((req, res) => {
  const bytes = req.body instanceof Buffer ? new Uint8Array(req.body) : new Uint8Array();
  res.json({ banner: adicionarBanner(emp(req), String(req.headers["content-type"] ?? ""), bytes, q(req, "link"), q(req, "tipo")) });
}));
rotasConfig.delete("/gerais/banners/:id", admin, ok((req, res) => { removerBanner(emp(req), req.params.id); res.json({ ok: true }); }));
rotasConfig.get("/gerais/banners/:id", ok((req, res) => {
  const a = arquivoDoBanner(emp(req), req.params.id);
  if (!a) return res.status(404).json({ erro: "Banner não encontrado." });
  res.setHeader("Content-Type", a.mime);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  fs.createReadStream(a.caminho).pipe(res);
}));
rotasConfig.get("/apps", ok((req, res) => res.json(configDosApps(emp(req)))));

// ------------------------------------------------------------------ config: crédito, categorias, dinâmicas, descontos

rotasConfig.get("/credito", ok((req, res) => res.json({ ...credito(emp(req)), categorias: categoriasCompletas(emp(req)).map((c) => c.nome) })));
rotasConfig.put("/credito", admin, ok((req, res) => res.json(salvarCredito(emp(req), req.body))));
rotasConfig.post("/credito/regras", admin, ok((req, res) => res.json(salvarRegraComissao(emp(req), req.body))));
rotasConfig.delete("/credito/regras/:id", admin, ok((req, res) => res.json(removerRegraComissao(emp(req), req.params.id))));

rotasConfig.get("/categorias", ok((req, res) => res.json({ categorias: categoriasCompletas(emp(req)), dinamicas: dinamicas(emp(req)), automacoes: automacoes(emp(req)), metodos: ROTULO_METODO, regras: credito(emp(req)).regras, icones: ICONES })));
rotasConfig.post("/categorias", admin, ok((req, res) => res.json({ categoria: salvarCategoria(emp(req), null, req.body ?? {}, quem(req)) })));
rotasConfig.put("/categorias/:id", admin, ok((req, res) => res.json({ categoria: salvarCategoria(emp(req), req.params.id, req.body ?? {}, quem(req)) })));
rotasConfig.delete("/categorias/:id", admin, ok((req, res) => { removerCategoria(emp(req), req.params.id); res.json({ ok: true }); }));

// Editar tarifa (Machine): tarifa padrão e tarifas extras por dia e horário. Só o admin altera.
rotasConfig.put("/categorias/:id/tarifa", admin, ok((req, res) => res.json({ categoria: salvarTarifaPadrao(emp(req), req.params.id, req.body ?? {}, quem(req)) })));
rotasConfig.post("/categorias/:id/tarifas-extras", admin, ok((req, res) => res.json({ categoria: salvarTarifaExtra(emp(req), req.params.id, { ...(req.body ?? {}), id: undefined }) })));
rotasConfig.put("/categorias/:id/tarifas-extras/:extra", admin, ok((req, res) => res.json({ categoria: salvarTarifaExtra(emp(req), req.params.id, { ...(req.body ?? {}), id: req.params.extra }) })));
rotasConfig.delete("/categorias/:id/tarifas-extras/:extra", admin, ok((req, res) => res.json({ categoria: removerTarifaExtra(emp(req), req.params.id, req.params.extra) })));

/** Tudo da tela Tarifas dinâmicas: regras manuais (com a faixa da legenda), automações, áreas automáticas abertas agora e a prioridade. */
const painelDinamicas = (empresaId: string) => ({
  regras: dinamicas(empresaId).map((r) => ({ ...r, nivel: nivelDinamica(r) })),
  automacoes: automacoes(empresaId).map((a) => ({ ...a, nivel: nivelDinamica(a) })),
  automaticas: areasAutomaticas(empresaId, pedidosRecentes(empresaId)),
  prioridade: prioridadeDinamicas(empresaId),
  prioridades: PRIORIDADES.map((id) => ({ id, rotulo: ROTULO_PRIORIDADE[id] })),
  legenda: LEGENDA_DINAMICA,
});
rotasConfig.get("/dinamicas", ok((req, res) => res.json(painelDinamicas(emp(req)))));
rotasConfig.post("/dinamicas", admin, ok((req, res) => { salvarDinamica(emp(req), req.body); res.json(painelDinamicas(emp(req))); }));
rotasConfig.post("/dinamicas/:id/ativa", admin, ok((req, res) => { ativarDinamica(emp(req), req.params.id, req.body?.ativa === true); res.json(painelDinamicas(emp(req))); }));
rotasConfig.put("/dinamicas-prioridade", admin, ok((req, res) => { salvarPrioridade(emp(req), req.body?.prioridade); res.json(painelDinamicas(emp(req))); }));
rotasConfig.post("/dinamicas-automacoes", admin, ok((req, res) => { salvarAutomacao(emp(req), req.body); res.json(painelDinamicas(emp(req))); }));
rotasConfig.post("/dinamicas-automacoes/:id/ativa", admin, ok((req, res) => { ativarAutomacao(emp(req), req.params.id, req.body?.ativa === true); res.json(painelDinamicas(emp(req))); }));
rotasConfig.delete("/dinamicas-automacoes/:id", admin, ok((req, res) => { removerAutomacao(emp(req), req.params.id); res.json(painelDinamicas(emp(req))); }));
rotasConfig.delete("/dinamicas/:id", admin, ok((req, res) => { removerDinamica(emp(req), req.params.id); res.json(painelDinamicas(emp(req))); }));

rotasConfig.get("/descontos", ok((req, res) => res.json({ descontos: descontos(emp(req)), categorias: categoriasCompletas(emp(req)).map((c) => c.nome) })));
rotasConfig.post("/descontos", admin, ok((req, res) => res.json({ descontos: salvarDesconto(emp(req), req.body) })));
rotasConfig.delete("/descontos/:id", admin, ok((req, res) => res.json({ descontos: removerDesconto(emp(req), req.params.id) })));

// ------------------------------------------------------------------ config: despacho, transbordos, integrações

rotasConfig.get("/despacho", ok((req, res) => res.json(regrasDespacho(emp(req)))));
rotasConfig.put("/despacho", admin, ok((req, res) => res.json(salvarDespacho(emp(req), req.body))));
rotasConfig.get("/transbordos", ok((req, res) => {
  const hoje = agoraBr().toISOString().slice(0, 10);
  const p = periodo("personalizado", q(req, "inicio") || hoje.slice(0, 8) + "01", q(req, "fim") || hoje);
  res.json({ periodo: p, permitir: regrasDespacho(emp(req)).permitirTransbordo, itens: transbordos(emp(req), p.inicio, p.fim, q(req, "cidade")) });
}));

rotasConfig.get("/pagamentos", ok((req, res) => res.json({ ...pagamentos(emp(req)), credenciais: credenciaisMp(emp(req)), campos: CAMPOS_MP })));
rotasConfig.put("/pagamentos", admin, ok((req, res) => {
  if (req.body?.credenciais && typeof req.body.credenciais === "object") salvarCredenciaisMp(emp(req), req.body.credenciais as Record<string, unknown>);
  const p = salvarPagamentos(emp(req), req.body);
  res.json({ ...p, credenciais: credenciaisMp(emp(req)) });
}));

// ------------------------------------------------------------------ NPS, avaliações, termos, ajuda

const papelNps = (v: string): PapelNps => (v === "motorista" ? "motorista" : "passageiro");
rotasConfig.get("/nps/:papel", ok((req, res) => res.json({ config: configNps(emp(req), papelNps(req.params.papel)), resumo: resumoNps(emp(req), papelNps(req.params.papel)) })));
rotasConfig.put("/nps/:papel", admin, ok((req, res) => res.json({ config: salvarConfigNps(emp(req), papelNps(req.params.papel), req.body) })));
rotasConfig.post("/nps/:papel/resetar", admin, ok((req, res) => res.json({ removidas: resetarRecusas(emp(req), papelNps(req.params.papel)) })));

rotasConfig.get("/termos", ok((req, res) => res.json(termos(emp(req)))));
rotasConfig.put("/termos", admin, ok((req, res) => res.json(salvarTermos(emp(req), req.body ?? {}))));

rotasConfig.get("/ajuda", ok((req, res) => res.json(ajuda(emp(req)))));
rotasConfig.put("/ajuda", admin, ok((req, res) => res.json(salvarAjuda(emp(req), req.body))));

// Agendamentos de notificação: confere a cada minuto (não roda nos testes).
if (process.env.NODE_ENV !== "test") {
  setInterval(() => { for (const e of D.listarEmpresas()) executarAgendamentos(e.id).catch(() => undefined); }, 60_000).unref();
}
