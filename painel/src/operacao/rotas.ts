// Rotas da operação de corridas da central (/api/operacao): grupo Corridas do painel.
// Registrar DEPOIS do app.use("/api", exigirLogin) do index.ts. A empresa vem SEMPRE do login (req.ctx).
//
//   GET  /historico                    histórico com filtros avançados (paginado no banco; ?todas=1 devolve a lista das outras fontes)
//   GET  /historico/exportar           planilha CSV do filtro (com proteção contra fórmula)
//   GET  /corridas/:id                 detalhe (repasses, financeiro, datas)
//   GET  /corridas/:id/raiox           auditoria: ondas de envio, timeline técnica, motoristas da região
//   GET  /corridas/:id/rastreio        rastreio (posição do motorista e link de compartilhar)
//   GET  /corridas/:id/recibo          recibo em HTML
//   GET  /corridas/:id/chat            chat da corrida (marca como lido)
//   POST /corridas/:id/reenviar        nova corrida igual (cancelada ou não atendida)
//   POST /corridas/:id/cancelar        cancelar pela central, passageiro, motorista ou erro
//   PUT  /corridas/:id                 editar a OS
//   GET  /pendencias (+ /exportar, POST registrar e mudar situação), /taxas-cancelamento (+ /exportar), /pix (+ /exportar, POST situação)
//   GET  /monitoramento, /mapa, /ocorrencias, /programadas, /objetos, /recuperacao, /passageiro, /motoristas
//   POST /solicitar                    nova solicitação (com paradas, agendamento, motorista e valor manual)

import fs from "node:fs";
import { Router, type Request, type Response } from "express";
import { arquivoDoAudio } from "../apps/chat.ts";
import { aposCancelar } from "../apps/extras.ts";
import { atribuirMotorista, cancelarCorrida, criarCorridaPropria, editarCorridaPropria, type EdicaoCorrida, type StatusProprio } from "../corridas/index.ts";
import { cadastroPorId } from "../comum/cadastros.ts";
import { listar } from "../cadastros/armazem.ts";
import { alertas } from "../apps/despacho.ts";
import * as D from "../servidor/dados.ts";
import { consultarProprias, csvDeCorridas, empresasPorTelefone, paraLinha, PAGAMENTOS_LISTA, URGENCIAS, VIAS } from "./consulta.ts";
import { exigirPapel } from "../servidor/sessao.ts";
import { agoraBr, normal } from "../servidor/util.ts";
import { ehVoucher, nomesConveniadas, validarVoucher } from "../relatorios/vouchers.ts";
import "./ondas.ts"; // liga o registro das ofertas do despacho
import { ABAS_RADAR, radar, registrarContato, type AbaRadar } from "./radar.ts";
import * as S from "./servico.ts";
import { periodo } from "../config/financeiro.ts";
import { ABAS_TAXAS, csvPendencias, csvTaxas, listarPendencias, listarTaxas, mudarPendencia, registrarPendencia, type AcaoPendencia, type FiltroPendencias, type FiltroTaxas } from "./pendencias.ts";
import { csvPix, listarPix, marcarPix, type FiltroPix } from "./pix.ts";
import { categoriasDaEmpresa, pagamentosDaEmpresa } from "../gestao/empresas.ts";

export const rotasOperacao = Router();
const hojeBr = () => agoraBr().toISOString().slice(0, 10);

const ok = (fn: (req: Request, res: Response) => unknown) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro.";
    if (!res.headersSent) res.status(/não encontrad/i.test(msg) ? 404 : 400).json({ erro: msg });
  }
};
const emp = (req: Request) => req.ctx!.empresaId;
const quem = (req: Request) => req.ctx!.usuario.email;
const q = (req: Request, k: string, max = 120) => String(req.query[k] ?? "").trim().slice(0, max);
const pag = (req: Request) => Number(req.query.pagina) || 1;
const central = exigirPapel("admin", "operador");
const dataOk = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "");
const horaOk = (s: string) => (/^\d{2}:\d{2}$/.test(s) ? s : "");
const num = (v: unknown) => (v === "" || v == null ? undefined : typeof v === "number" ? v : (() => { const t = String(v).trim(); return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t); })());
const ponto = (v: unknown) => {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const lat = Number(o.lat), lng = Number(o.lng);
  return { texto: String(o.texto ?? "").slice(0, 200), ...(Number.isFinite(lat) && Number.isFinite(lng) && o.lat != null && o.lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : {}) };
};

// ------------------------------------------------------------------ histórico

/** Filtros da consulta (os mesmos para a tela, a planilha e a análise com IA). */
const filtrosHistorico = (req: Request): S.FiltroHistorico => ({
  rapido: S.RAPIDOS[q(req, "rapido")] ? q(req, "rapido") : undefined, os: q(req, "os", 30), osExterna: q(req, "osExterna", 40),
  centralChamada: q(req, "centralChamada", 60), centralCorrida: q(req, "centralCorrida", 60), empresa: q(req, "empresa", 80),
  cidade: q(req, "cidade"), categoria: q(req, "categoria"),
  endereco: q(req, "endereco"), nomePax: q(req, "nomePax"), cpfPax: q(req, "cpfPax", 20), telPax: q(req, "telPax", 20), motorista: q(req, "motorista"),
  dataIni: dataOk(q(req, "dataIni")), dataFim: dataOk(q(req, "dataFim")), horaIni: horaOk(q(req, "horaIni")), horaFim: horaOk(q(req, "horaFim")),
  pagamento: q(req, "pagamento"), origem: q(req, "origem"), status: q(req, "status"), fonte: q(req, "fonte", 60),
  urgencia: q(req, "urgencia", 2), via: q(req, "via", 10), cashback: q(req, "cashback", 2) === "1",
});
const nomeDaCentral = (req: Request) => D.empresa(emp(req))?.nome ?? "";
/** Só as corridas próprias do painel (sem sistema conectado nem planilha ativos; os dados de exemplo não contam): a consulta roda
 *  direto no banco, só com a página pedida. Com outra fonte conectada, a lista junta tudo na memória (caminho antigo). */
const soProprias = (req: Request, f: S.FiltroHistorico) => f.fonte === "propria" || (!f.fonte && !D.integracoes(emp(req)).some((i) => i.ativa && i.tipo !== "exemplo"));
const OPCOES_FIXAS = (req: Request) => ({
  pagamentos: PAGAMENTOS_LISTA, urgencias: Object.entries(URGENCIAS).map(([id, nome]) => ({ id, nome })), vias: Object.entries(VIAS).map(([id, nome]) => ({ id, nome })),
  centrais: [nomeDaCentral(req)].filter(Boolean),
  empresas: listar(emp(req), cadastroPorId("conveniadas")!).map((e) => String(e.nome ?? "")).filter(Boolean).sort(),
});

rotasOperacao.get("/historico", ok(async (req, res) => {
  const f = filtrosHistorico(req);
  const base = S.filtroBase(f);
  const porPagina = 30;
  if (soProprias(req, f) && req.query.todas !== "1") {
    const r = consultarProprias(emp(req), f, pag(req), porPagina, nomeDaCentral(req));
    const empresas = empresasPorTelefone(emp(req));
    const comAlerta = new Set(alertas(emp(req)).filter((a) => !a.resolvido).map((a) => `propria:${a.corridaId}`));
    return res.json({
      avisos: [], stats: r.stats, filtroBase: base, pagina: r.pagina, paginas: r.paginas, total: r.total, status: S.STATUS_FILTRO,
      corridas: r.itens.map((c) => ({ ...paraLinha(c, empresas), alerta: comAlerta.has(`propria:${c.id}`) })),
      opcoes: { ...S.opcoesRapidas(emp(req)), ...OPCOES_FIXAS(req) },
    });
  }
  const r = await S.historico(emp(req), f);
  if (req.query.todas === "1") return res.json({ corridas: r.corridas.slice(0, 5000), filtroBase: r.filtroBase });
  const paginas = Math.max(1, Math.ceil(r.corridas.length / porPagina));
  const pagina = Math.min(Math.max(1, pag(req)), paginas);
  const itens = r.corridas.slice((pagina - 1) * porPagina, pagina * porPagina);
  const empresas = empresasPorTelefone(emp(req));
  res.json({
    avisos: [...r.avisos, ...(f.osExterna || f.centralChamada || f.centralCorrida || f.empresa || f.urgencia || f.via || f.cashback ? ["Os filtros de nº externo, central, empresa, urgência, via e cashback valem só para as corridas próprias."] : [])],
    stats: r.stats, opcoes: { ...r.opcoes, ...OPCOES_FIXAS(req) }, filtroBase: r.filtroBase, pagina, paginas, total: r.corridas.length,
    corridas: itens.map((c) => ({ ...c, osExterna: "", empresa: empresas.get(c.telefonePassageiro.replace(/\D/g, "")) ?? "", alerta: r.alerta(c) })), status: S.STATUS_FILTRO,
  });
}));

/** Exportar: planilha CSV de tudo o que o filtro mostra (com proteção contra fórmula). */
rotasOperacao.get("/historico/exportar", ok((req, res) => {
  const f = filtrosHistorico(req);
  if (!soProprias(req, f)) throw new Error("A planilha completa vale para as corridas próprias. Escolha a fonte \"Próprias\" no filtro.");
  res.json({ nome: `corridas-${hojeBr()}.csv`, csv: csvDeCorridas(emp(req), f, nomeDaCentral(req)) });
}));

// ------------------------------------------------------------------ uma corrida

rotasOperacao.get("/corridas/:id", ok((req, res) => res.json(S.detalhe(emp(req), req.params.id))));
rotasOperacao.get("/corridas/:id/raiox", ok((req, res) => res.json(S.raioX(emp(req), req.params.id))));
rotasOperacao.get("/corridas/:id/rastreio", ok((req, res) => res.json(S.rastreio(emp(req), req.params.id, `${req.protocol}://${req.get("host")}`))));
rotasOperacao.get("/corridas/:id/recibo", ok((req, res) => res.json({ html: S.recibo(emp(req), req.params.id) })));
rotasOperacao.get("/corridas/:id/chat", ok((req, res) => res.json({ mensagens: S.chat(emp(req), req.params.id) })));
rotasOperacao.get("/corridas/:id/chat/audio/:audio", ok((req, res) => {
  const c = S.acharPropria(emp(req), req.params.id);
  const a = arquivoDoAudio(emp(req), c.id, req.params.audio);
  if (!a) return res.status(404).json({ erro: "Áudio não encontrado." });
  res.setHeader("Content-Type", a.mime);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(fs.readFileSync(a.caminho));
}));

rotasOperacao.post("/corridas/:id/reenviar", central, ok(async (req, res) => {
  const c = S.acharPropria(emp(req), req.params.id);
  if (c.status !== "cancelada" && c.status !== "nao_atendida") throw new Error("Só dá para reenviar corrida cancelada ou não atendida.");
  const nova = await criarCorridaPropria(emp(req), {
    passageiro: { ...c.passageiro }, embarque: { ...c.embarque }, destino: c.destino ? { ...c.destino } : undefined, paradas: (c.paradas ?? []).map((p) => ({ ...p })),
    categoria: c.categoria, pagamento: c.pagamento, canal: "painel", cupom: c.cupom || undefined,
    observacao: [c.observacao, `Reenvio da OS ${c.os}`].filter(Boolean).join(" · "),
  }, quem(req));
  res.json({ corrida: { id: nova.id, os: nova.os } });
}));

const ORIGEM_CANCEL: Record<string, "Central" | "Passageiro" | "Motorista" | "Sistema"> = { central: "Central", passageiro: "Passageiro", motorista: "Motorista", sistema: "Sistema" };
rotasOperacao.post("/corridas/:id/cancelar", central, ok(async (req, res) => {
  const origem = ORIGEM_CANCEL[String(req.body?.origem ?? "")];
  if (!origem) throw new Error("Escolha quem pediu o cancelamento.");
  const rotulo = origem === "Sistema" ? "erro / outros" : origem.toLowerCase();
  const motivo = String(req.body?.motivo ?? "").trim().slice(0, 200) || `Cancelamento pelo painel (${rotulo})`;
  const c = await cancelarCorrida(emp(req), S.acharPropria(emp(req), req.params.id).id, origem, motivo, quem(req));
  try { aposCancelar(emp(req), c); } catch (e) { console.error("[operacao] taxa:", e instanceof Error ? e.message : e); }
  res.json({ corrida: { id: c.id, os: c.os, status: c.status } });
}));

rotasOperacao.put("/corridas/:id", central, ok(async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const e: EdicaoCorrida = {};
  if (typeof b.status === "string" && b.status) e.status = b.status as StatusProprio;
  if (typeof b.motoristaId === "string") e.motoristaId = b.motoristaId;
  if (typeof b.nome === "string" || typeof b.telefone === "string") e.passageiro = { nome: b.nome as string | undefined, telefone: b.telefone as string | undefined };
  if (typeof b.embarque === "string") e.embarque = b.embarque;
  if (typeof b.destino === "string") e.destino = b.destino;
  if ("valorInicial" in b) e.valorInicial = num(b.valorInicial) ?? null;
  if ("valorFinal" in b) e.valorFinal = num(b.valorFinal) ?? null;
  if (typeof b.pagamento === "string") e.pagamento = b.pagamento;
  const c = await editarCorridaPropria(emp(req), S.acharPropria(emp(req), req.params.id).id, e, quem(req));
  res.json({ corrida: { id: c.id, os: c.os, status: c.status } });
}));

// ------------------------------------------------------------------ telas

rotasOperacao.get("/monitoramento", ok((req, res) => res.json(S.monitoramento(emp(req), { passageiro: q(req, "passageiro"), telefone: q(req, "telefone", 20) }))));
rotasOperacao.get("/mapa", ok((req, res) => res.json(S.mapa(emp(req)))));
rotasOperacao.get("/ocorrencias", ok(async (req, res) => {
  const h = Number(req.query.horas);
  res.json(await S.ocorrencias(emp(req), h > 0 && h <= 72 ? h : 1, pag(req)));
}));

const FILTROS_PROG: S.FiltroProgramadas[] = ["hoje", "amanha", "futuras", "todas"];
rotasOperacao.get("/programadas", ok((req, res) => {
  const f = FILTROS_PROG.includes(q(req, "filtro") as S.FiltroProgramadas) ? (q(req, "filtro") as S.FiltroProgramadas) : "futuras";
  res.json(S.programadas(emp(req), f, q(req, "busca"), pag(req)));
}));
rotasOperacao.put("/programadas/:id", central, ok(async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const c = S.acharPropria(emp(req), req.params.id);
  if (!c.agendadaPara) throw new Error("Esta corrida não é programada.");
  const e: EdicaoCorrida = {};
  if (typeof b.dataHora === "string" && b.dataHora && b.dataHora.slice(0, 16) !== c.agendadaPara.slice(0, 16)) e.agendadaPara = b.dataHora;
  if ("valor" in b) { const v = num(b.valor) ?? null; if (v !== c.estimativa.valor) e.valorInicial = v; }
  if (typeof b.observacao === "string" && b.observacao !== c.observacao) e.observacao = b.observacao;
  const nova = await editarCorridaPropria(emp(req), c.id, e, quem(req));
  res.json({ corrida: { id: nova.id, os: nova.os } });
}));

// Período dos filtros: "todos" (ou vazio) não filtra por data; senão usa os atalhos do financeiro (hoje, ultimos_30, personalizado...).
const faixa = (req: Request): { inicio?: string; fim?: string } => {
  const p = q(req, "periodo");
  if (!p || p === "todos") return { inicio: dataOk(q(req, "inicio")) || undefined, fim: dataOk(q(req, "fim")) || undefined };
  const r = periodo(p, q(req, "inicio"), q(req, "fim"));
  return { inicio: r.inicio, fim: r.fim };
};
const filtroPendencias = (req: Request): FiltroPendencias => ({ ...faixa(req), tipo: q(req, "tipo"), situacao: q(req, "status") || q(req, "situacao") || "pendente", busca: q(req, "busca", 80), motorista: q(req, "motorista", 80) });
const baixarCsv = (res: Response, nome: string, csv: string) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${nome}-${hojeBr()}.csv"`);
  res.send(csv);
};
// Leitura para quem está logado; só o administrador muda situação ou registra (financeiro).
rotasOperacao.get("/pendencias", ok((req, res) => res.json(listarPendencias(emp(req), filtroPendencias(req), pag(req)))));
rotasOperacao.get("/pendencias/exportar", ok((req, res) => baixarCsv(res, "pendencias-de-pagamentos", csvPendencias(emp(req), filtroPendencias(req)))));
rotasOperacao.post("/pendencias", exigirPapel("admin"), ok((req, res) => res.status(201).json({ pendencia: registrarPendencia(emp(req), (req.body ?? {}) as Record<string, unknown>, quem(req)) })));
rotasOperacao.post("/pendencias/:id/:acao", exigirPapel("admin"), ok((req, res) => {
  const acao = req.params.acao as AcaoPendencia;
  if (!["processar", "repassar", "baixar", "abonar"].includes(acao)) throw new Error("Ação inválida.");
  res.json({ pendencia: mudarPendencia(emp(req), req.params.id, acao, quem(req), { osColeta: String(req.body?.osColeta ?? ""), motivo: String(req.body?.motivo ?? "") }) });
}));

const filtroTaxas = (req: Request): FiltroTaxas => ({ ...faixa(req), aba: ABAS_TAXAS.find((a) => a === q(req, "aba")) ?? "todos", os: q(req, "os", 30), motorista: q(req, "motorista", 80), cliente: q(req, "cliente", 80) });
rotasOperacao.get("/taxas-cancelamento", ok((req, res) => res.json(listarTaxas(emp(req), filtroTaxas(req), pag(req)))));
rotasOperacao.get("/taxas-cancelamento/exportar", ok((req, res) => baixarCsv(res, "taxas-de-cancelamento", csvTaxas(emp(req), filtroTaxas(req)))));

const filtroPix = (req: Request): FiltroPix => ({ ...faixa(req), os: q(req, "os", 30) || q(req, "busca", 30), motorista: q(req, "motorista", 80), situacao: q(req, "situacao") });
rotasOperacao.get("/pix", ok((req, res) => res.json(listarPix(emp(req), filtroPix(req), pag(req)))));
rotasOperacao.get("/pix/exportar", ok((req, res) => baixarCsv(res, "transacoes-pix", csvPix(emp(req), filtroPix(req)))));
rotasOperacao.post("/pix/:id/situacao", exigirPapel("admin"), ok((req, res) => res.json({ pix: marcarPix(emp(req), req.params.id, String(req.body?.situacao ?? ""), String(req.body?.motivo ?? ""), quem(req)) })));

rotasOperacao.get("/objetos", ok((req, res) => {
  const s = ["todos", "pendente", "resolvido"].includes(q(req, "status")) ? (q(req, "status") as "todos") : "todos";
  res.json(S.objetos(emp(req), s, q(req, "busca"), pag(req)));
}));
rotasOperacao.post("/objetos/:id/status", central, ok((req, res) => res.json({ registro: S.alternarObjeto(emp(req), req.params.id, quem(req)) })));
rotasOperacao.delete("/objetos/:id", central, ok((req, res) => { S.apagarObjeto(emp(req), req.params.id); res.json({ ok: true }); }));

rotasOperacao.get("/recuperacao", ok((req, res) => {
  const aba = ABAS_RADAR.includes(q(req, "aba") as AbaRadar) ? (q(req, "aba") as AbaRadar) : "passageiros";
  const hoje = agoraBr().toISOString().slice(0, 10);
  const inicio = dataOk(q(req, "inicio")) || hoje, fim = dataOk(q(req, "fim")) || inicio;
  res.json({ aba, inicio, fim, ...radar(emp(req), aba, inicio, fim) });
}));
rotasOperacao.post("/recuperacao/contato", central, ok((req, res) => res.json({ contato: registrarContato(emp(req), String(req.body?.chave ?? ""), quem(req)) })));

// ------------------------------------------------------------------ nova solicitação

rotasOperacao.get("/passageiro", ok((req, res) => res.json(S.buscarPassageiro(emp(req), { telefone: q(req, "telefone", 20), cpf: q(req, "cpf", 20) }))));
rotasOperacao.get("/motoristas", ok((req, res) => res.json({ motoristas: S.opcoesMotoristas(emp(req)) })));

const PAGAMENTO_MACHINE_PARA_CORRIDA: Record<string, string[]> = {
  Dinheiro: ["Dinheiro"], "Maquininha de Débito": ["Cartão na Maquininha", "Débito (máquina)"], "Maquininha de Crédito": ["Cartão na Maquininha", "Crédito (máquina)"], "Cartão no app": ["Cartão no App"], Pix: ["Pix", "Pix no app"],
};

/** Empresa conveniada, centro de custo e voucher da solicitação. Voucher exige empresa e um número dentro de uma faixa dela, ainda não usado. */
function dadosCorporativos(empresaId: string, b: Record<string, unknown>) {
  const nomes = nomesConveniadas(empresaId);
  const pedida = String(b.empresaConveniada ?? "").trim();
  const conveniada = pedida ? nomes.find((n) => normal(n) === normal(pedida)) : undefined;
  if (pedida && !conveniada) throw new Error("Empresa inexistente no cadastro de Empresas.");
  const centro = String(b.centroCusto ?? "").trim();
  if (centro && conveniada) {
    const cad = listar(empresaId, cadastroPorId("conveniadas")!).find((r) => normal(r.nome) === normal(conveniada));
    const centros = String(cad?.centrosCusto ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    if (centros.length && !centros.some((x) => normal(x) === normal(centro))) throw new Error("Centro de custo não cadastrado nesta empresa.");
  }
  if (conveniada) {
    const reg = listar(empresaId, cadastroPorId("conveniadas")!).find((r) => normal(r.nome) === normal(conveniada));
    if (reg?.status === "Suspensa" || reg?.status === "Encerrada" || reg?.status === "Aguardando ativação") throw new Error(`A empresa "${conveniada}" está com a situação "${reg.status}" e não pode solicitar corridas.`);
    const permitidas = categoriasDaEmpresa(reg);
    if (permitidas.length && b.categoria && !permitidas.some((x) => normal(x) === normal(String(b.categoria)))) throw new Error("Esta categoria não é permitida para a empresa.");
    const pagamentos = pagamentosDaEmpresa(reg);
    const pedido = String(b.pagamento ?? "");
    if (pagamentos.length && pedido && !ehVoucher(pedido) && !pagamentos.some((p) => (PAGAMENTO_MACHINE_PARA_CORRIDA[p.tipo] ?? [p.tipo]).some((n) => normal(n) === normal(pedido)))) throw new Error("Este tipo de pagamento não é permitido para a empresa.");
    if (reg?.permiteEspecificarMotorista === "Não" && b.motoristaId) throw new Error("Esta empresa não pode escolher o motorista da corrida.");
  }
  let numero: string | undefined;
  if (ehVoucher(String(b.pagamento ?? ""))) {
    if (!conveniada) throw new Error("Pagamento com voucher exige a empresa conveniada.");
    numero = validarVoucher(empresaId, conveniada, String(b.voucher ?? ""));
  }
  return { ...(conveniada ? { empresaConveniada: conveniada } : {}), ...(centro ? { centroCusto: centro.slice(0, 80) } : {}), ...(numero ? { voucher: numero } : {}) };
}

rotasOperacao.post("/solicitar", central, ok(async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const pass = (b.passageiro ?? {}) as Record<string, unknown>;
  const exig = Array.isArray(b.exigencias) ? b.exigencias.map((x) => String(x).replace(/[<>]/g, "").slice(0, 60)).slice(0, 10) : [];
  const observacao = [
    String(b.observacao ?? ""), b.complemento ? `Complemento: ${String(b.complemento).slice(0, 80)}` : "", b.referencia ? `Referência: ${String(b.referencia).slice(0, 120)}` : "",
    exig.length ? `Exigências: ${exig.join(", ")}` : "",
  ].filter((x) => x.trim()).join(" · ");
  const corporativo = dadosCorporativos(emp(req), b);
  const c = await criarCorridaPropria(emp(req), {
    passageiro: { nome: String(pass.nome ?? ""), telefone: String(pass.telefone ?? "") }, embarque: ponto(b.embarque),
    destino: b.destino ? ponto(b.destino) : undefined, paradas: Array.isArray(b.paradas) ? b.paradas.map(ponto) : [],
    categoria: String(b.categoria ?? ""), pagamento: String(b.pagamento ?? ""), canal: "painel", observacao,
    cupom: b.cupom ? String(b.cupom).slice(0, 30) : undefined, agendadaPara: b.agendadaPara ? String(b.agendadaPara) : undefined,
    osExterna: b.osExterna ? String(b.osExterna) : undefined,
    ...corporativo,
  }, quem(req));
  const avisos: string[] = [];
  const valor = num(b.valor);
  if (valor != null && valor !== c.estimativa.valor) {
    try { await editarCorridaPropria(emp(req), c.id, { valorInicial: valor }, quem(req)); } catch (e) { avisos.push(`Valor não mudou: ${e instanceof Error ? e.message : e}`); }
  }
  if (typeof b.motoristaId === "string" && b.motoristaId) {
    try { await atribuirMotorista(emp(req), c.id, b.motoristaId, quem(req)); } catch (e) { avisos.push(`Motorista não atribuído: ${e instanceof Error ? e.message : e}`); }
  }
  res.json({ corrida: { id: c.id, os: c.os, valor: valor ?? c.estimativa.valor }, avisos });
}));

rotasOperacao.use((_req, res) => res.status(404).json({ erro: "Caminho não encontrado." }));
