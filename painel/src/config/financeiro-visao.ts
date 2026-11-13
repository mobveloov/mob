// Financeiro no formato da Machine: Visão geral do financeiro (3 gráficos), Extrato da central (com pedido de recarga de saldo)
// e Extrato de transações online (tipos, status com chargeback e estorno, repasse, ID e CSV).
// Tudo por empresa. Nenhum gateway real: o pedido de recarga só registra o valor, e chargeback/estorno são marcações da central.

import { listarProprias } from "../corridas/index.ts";
import { banco } from "../servidor/banco.ts";
import { agoraBr, normal } from "../servidor/util.ts";
import { calcularComissao } from "./comissao.ts";
import { pessoas, tipoDoLancamento } from "./financeiro.ts";

const cent = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const MS_DIA = 86_400_000;
const hojeBr = () => agoraBr().toISOString().slice(0, 10);
const diaDe = (s: string | null | undefined) => String(s ?? "").slice(0, 10);

interface Per { inicio: string; fim: string }

/** Todos os dias do período (limite de 400, para não estourar a resposta). */
export function diasDoPeriodo(p: Per): string[] {
  const r: string[] = [];
  for (let t = Date.parse(`${p.inicio}T00:00:00Z`), f = Date.parse(`${p.fim}T00:00:00Z`); t <= f && r.length < 400; t += MS_DIA) r.push(new Date(t).toISOString().slice(0, 10));
  return r;
}

/** Período anterior, com o mesmo tamanho, logo antes do atual (para a variação em %). */
export function periodoAnterior(p: Per): Per {
  const ini = Date.parse(`${p.inicio}T00:00:00Z`);
  const n = Math.max(1, Math.round((Date.parse(`${p.fim}T00:00:00Z`) - ini) / MS_DIA) + 1);
  const dia = (t: number) => new Date(t).toISOString().slice(0, 10);
  return { inicio: dia(ini - n * MS_DIA), fim: dia(ini - MS_DIA) };
}

/** Variação em %: null quando o período anterior foi zero e o atual não (sem base de comparação). */
export function variacao(atual: number, anterior: number): number | null {
  if (!anterior) return atual ? null : 0;
  return cent(((atual - anterior) / Math.abs(anterior)) * 100);
}

// ------------------------------------------------------------------ CSV seguro

/**
 * Célula de CSV protegida contra injeção de fórmula: texto que começa com = + - @ (ou tabulação/retorno) ganha um apóstrofo na frente.
 * Números saem sem proteção (vírgula decimal), então valores negativos continuam sendo números no Excel.
 */
export function celulaCsv(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v).replace(".", ",") : "";
  let t = String(v).replace(/\r?\n/g, " ");
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return /[;"]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}
/** CSV com separador ";" e BOM (abre direto no Excel em português). */
export const montarCsv = (cabecalho: string[], linhas: unknown[][]) => "﻿" + [cabecalho, ...linhas].map((l) => l.map(celulaCsv).join(";")).join("\r\n") + "\r\n";

// ------------------------------------------------------------------ fontes de dados

const ehPix = (p: string) => normal(p).includes("pix");
const ehCartaoApp = (p: string) => { const n = normal(p); return n.includes("cartao") && n.includes("app"); };

function corridasFinalizadas(empresaId: string, de: string, ate: string) {
  return listarProprias(empresaId).filter((c) => c.status === "finalizada" && c.valor && diaDe(c.finalizadaEm ?? c.solicitadaEm) >= de && diaDe(c.finalizadaEm ?? c.solicitadaEm) <= ate);
}

interface Recarga { id: string; papel: "motorista" | "passageiro"; chave: string; valor: number; descricao: string; em: string; por: string }
function recargasPix(empresaId: string, de: string, ate: string): Recarga[] {
  const l = banco().prepare("SELECT id, papel, chave, valor, descricao, em, por FROM carteira WHERE empresa = ? AND valor > 0 AND substr(em, 1, 10) >= ? AND substr(em, 1, 10) <= ? ORDER BY em DESC, rowid DESC")
    .all(empresaId, de, ate) as unknown as Recarga[];
  return l.filter((x) => tipoDoLancamento(x) === "pix");
}

export interface SaqueLinha { id: string; motoristaId: string; nome: string; valor: number; chavePix: string; situacao: "Pendente" | "Pago" | "Recusado"; motivo: string; em: string; resolvidoEm: string | null }
function todosSaques(empresaId: string): SaqueLinha[] {
  return (banco().prepare("SELECT dados FROM saques WHERE empresa = ? ORDER BY em DESC").all(empresaId) as Array<{ dados: string }>).map((r) => JSON.parse(r.dados) as SaqueLinha);
}
const diaDoSaque = (s: SaqueLinha) => diaDe(s.resolvidoEm ?? s.em);

// ------------------------------------------------------------------ Visão geral do financeiro

function totaisDoPeriodo(empresaId: string, p: Per, saques: SaqueLinha[]) {
  const corridas = corridasFinalizadas(empresaId, p.inicio, p.fim);
  const faturamento = cent(corridas.reduce((s, c) => s + c.valor!, 0));
  const ganhos = cent(corridas.filter((c) => c.motoristaId).reduce((s, c) => s + calcularComissao(empresaId, c.categoria, c.valor!, c.motoristaId!).taxaCentral, 0));
  const pix = recargasPix(empresaId, p.inicio, p.fim);
  const recargas = cent(pix.reduce((s, x) => s + x.valor, 0));
  const app = corridas.filter((c) => ehPix(c.pagamento) || ehCartaoApp(c.pagamento));
  const noApp = cent(app.reduce((s, c) => s + c.valor!, 0));
  const sacados = cent(saques.filter((s) => s.situacao === "Pago" && diaDoSaque(s) >= p.inicio && diaDoSaque(s) <= p.fim).reduce((t, s) => t + s.valor, 0));
  return { corridas, faturamento, ganhos, pix, recargas, app, noApp, sacados };
}

export function visaoGeral(empresaId: string, p: Per) {
  const saques = todosSaques(empresaId);
  const a = totaisDoPeriodo(empresaId, p, saques), ant = totaisDoPeriodo(empresaId, periodoAnterior(p), saques);
  const dias = diasDoPeriodo(p);
  const serieRecargas = dias.map((dia) => ({
    dia,
    motoristas: cent(a.pix.filter((x) => x.papel === "motorista" && diaDe(x.em) === dia).reduce((s, x) => s + x.valor, 0)),
    passageiros: cent(a.pix.filter((x) => x.papel === "passageiro" && diaDe(x.em) === dia).reduce((s, x) => s + x.valor, 0)),
  }));
  const serieCorridas = dias.map((dia) => {
    const d = a.app.filter((c) => diaDe(c.finalizadaEm ?? c.solicitadaEm) === dia);
    return { dia, cartao: cent(d.filter((c) => ehCartaoApp(c.pagamento)).reduce((s, c) => s + c.valor!, 0)), pix: cent(d.filter((c) => !ehCartaoApp(c.pagamento) && ehPix(c.pagamento)).reduce((s, c) => s + c.valor!, 0)) };
  });
  const pagos = saques.filter((s) => s.situacao === "Pago" && diaDoSaque(s) >= p.inicio && diaDoSaque(s) <= p.fim);
  let acumulado = 0;
  const serieSaques = dias.map((dia) => {
    const d = pagos.filter((s) => diaDoSaque(s) === dia), valor = cent(d.reduce((t, s) => t + s.valor, 0));
    acumulado = cent(acumulado + valor);
    return { dia, valor, qtd: d.length, acumulado };
  });
  const recebido = cent(a.recargas + a.noApp), recebidoAnt = cent(ant.recargas + ant.noApp);
  return {
    periodo: p, anterior: periodoAnterior(p),
    faturamento: { valor: a.faturamento, variacao: variacao(a.faturamento, ant.faturamento), corridas: a.corridas.length },
    ganhosLiquidos: { valor: a.ganhos, variacao: variacao(a.ganhos, ant.ganhos) },
    totalRecebido: { valor: recebido, variacao: variacao(recebido, recebidoAnt) },
    recargasPix: { total: a.recargas, motoristas: cent(serieRecargas.reduce((s, x) => s + x.motoristas, 0)), passageiros: cent(serieRecargas.reduce((s, x) => s + x.passageiros, 0)), serie: serieRecargas },
    corridasApp: { total: a.noApp, cartao: cent(serieCorridas.reduce((s, x) => s + x.cartao, 0)), pix: cent(serieCorridas.reduce((s, x) => s + x.pix, 0)), qtd: a.app.length, serie: serieCorridas },
    saques: { total: a.sacados, variacao: variacao(a.sacados, ant.sacados), qtd: pagos.length, serie: serieSaques },
    proximoRepasse: cent(saques.filter((s) => s.situacao === "Pendente").reduce((t, s) => t + s.valor, 0)),
  };
}

export function csvVisaoGeral(empresaId: string, p: Per): string {
  const v = visaoGeral(empresaId, p);
  const linhas: unknown[][] = v.recargasPix.serie.map((x, i) => [x.dia.split("-").reverse().join("/"), x.motoristas, x.passageiros, v.corridasApp.serie[i].cartao, v.corridasApp.serie[i].pix, v.saques.serie[i].valor, v.saques.serie[i].qtd]);
  linhas.push(["TOTAL", v.recargasPix.motoristas, v.recargasPix.passageiros, v.corridasApp.cartao, v.corridasApp.pix, v.saques.total, v.saques.qtd]);
  return montarCsv(["Dia", "Recargas Pix motoristas", "Recargas Pix passageiros", "Corridas no app (cartão)", "Corridas no app (Pix)", "Saques pagos", "Qtde de saques"], linhas);
}

// ------------------------------------------------------------------ Pedidos de recarga de saldo da central

export interface PedidoRecarga { id: string; valor: number; situacao: "Solicitado" | "Confirmado" | "Cancelado"; observacao: string; em: string; por: string; resolvidoEm: string | null; resolvidoPor: string }
const LINHA_PEDIDO = "id, valor, situacao, observacao, em, por, resolvido_em AS resolvidoEm, resolvido_por AS resolvidoPor";

/** Só registra o pedido (valor e observação). Não cobra nada nem chama gateway: a central confirma depois que recebeu. */
export function pedirRecargaCentral(empresaId: string, valor: number, observacao: string, por: string): PedidoRecarga {
  const v = cent(Number(valor));
  if (!Number.isFinite(v) || v < 1) throw new Error("Informe um valor de pelo menos R$ 1,00.");
  if (v > 1_000_000) throw new Error("Valor acima do limite de R$ 1.000.000,00.");
  const p: PedidoRecarga = { id: crypto.randomUUID(), valor: v, situacao: "Solicitado", observacao: String(observacao ?? "").replace(/[<>]/g, "").trim().slice(0, 200), em: agoraBr().toISOString(), por: por.slice(0, 80), resolvidoEm: null, resolvidoPor: "" };
  banco().prepare("INSERT INTO central_recargas (empresa, id, valor, situacao, observacao, em, por) VALUES (?, ?, ?, ?, ?, ?, ?)").run(empresaId, p.id, p.valor, p.situacao, p.observacao, p.em, p.por);
  return p;
}
export function resolverPedidoRecarga(empresaId: string, id: string, confirmar: boolean, por: string): PedidoRecarga {
  const db = banco();
  const r = db.prepare(`SELECT ${LINHA_PEDIDO} FROM central_recargas WHERE empresa = ? AND id = ?`).get(empresaId, id) as unknown as PedidoRecarga | undefined;
  if (!r) throw new Error("Pedido de recarga não encontrado.");
  if (r.situacao !== "Solicitado") throw new Error("Este pedido já foi resolvido.");
  const novo = { ...r, situacao: confirmar ? "Confirmado" as const : "Cancelado" as const, resolvidoEm: agoraBr().toISOString(), resolvidoPor: por.slice(0, 80) };
  db.prepare("UPDATE central_recargas SET situacao = ?, resolvido_em = ?, resolvido_por = ? WHERE empresa = ? AND id = ?").run(novo.situacao, novo.resolvidoEm, novo.resolvidoPor, empresaId, id);
  return novo;
}
export const pedidosRecarga = (empresaId: string): PedidoRecarga[] =>
  banco().prepare(`SELECT ${LINHA_PEDIDO} FROM central_recargas WHERE empresa = ? ORDER BY em DESC LIMIT 500`).all(empresaId) as unknown as PedidoRecarga[];

// ------------------------------------------------------------------ Extrato da central

export interface Movimento { id: string; em: string; tipo: "entrada" | "saida"; descricao: string; detalhe: string; valor: number }

/** Movimentações do caixa da central até a data. Entradas: comissão das corridas, recargas Pix e recargas de saldo confirmadas. Saídas: saques pagos. */
function movimentosDaCentral(empresaId: string, ate: string): Movimento[] {
  const m: Movimento[] = [];
  const nomes = pessoas(empresaId);
  // comissão por dia (uma linha por dia, no fim do dia, como a Machine faz com a tarifa)
  const porDia = new Map<string, { qtd: number; valor: number }>();
  for (const c of listarProprias(empresaId)) {
    const dia = diaDe(c.finalizadaEm ?? c.solicitadaEm);
    if (c.status !== "finalizada" || !c.valor || !c.motoristaId || !dia || dia > ate) continue;
    const t = calcularComissao(empresaId, c.categoria, c.valor, c.motoristaId).taxaCentral;
    if (t <= 0) continue;
    const g = porDia.get(dia) ?? { qtd: 0, valor: 0 };
    g.qtd++; g.valor += t; porDia.set(dia, g);
  }
  for (const [dia, g] of porDia) m.push({ id: `com-${dia}`, em: `${dia}T23:59:00Z`, tipo: "entrada", descricao: `Comissão da central sobre corridas finalizadas (Qtde: ${g.qtd})`, detalhe: "", valor: cent(g.valor) });
  for (const r of recargasPix(empresaId, "0000-01-01", ate)) m.push({ id: `pix-${r.id}`, em: r.em, tipo: "entrada", descricao: `Recarga Pix de ${r.papel === "motorista" ? "motorista" : "passageiro"}`, detalhe: nomes.get(`${r.papel}|${r.chave}`)?.nome || r.chave, valor: r.valor });
  for (const p of pedidosRecarga(empresaId)) if (p.situacao === "Confirmado" && diaDe(p.resolvidoEm) <= ate) m.push({ id: `rec-${p.id}`, em: p.resolvidoEm!, tipo: "entrada", descricao: "Recarga de saldo da central", detalhe: p.observacao, valor: p.valor });
  for (const s of todosSaques(empresaId)) if (s.situacao === "Pago" && diaDoSaque(s) <= ate) m.push({ id: `saq-${s.id}`, em: s.resolvidoEm ?? s.em, tipo: "saida", descricao: "Saque pago ao motorista (Pix)", detalhe: s.nome, valor: s.valor });
  return m.sort((a, b) => a.em.localeCompare(b.em));
}

export function extratoDaCentral(empresaId: string, p: Per) {
  const hoje = hojeBr();
  const todos = movimentosDaCentral(empresaId, hoje > p.fim ? hoje : p.fim);
  const liquido = (l: Movimento[]) => cent(l.reduce((s, x) => s + (x.tipo === "entrada" ? x.valor : -x.valor), 0));
  const antes = todos.filter((x) => diaDe(x.em) < p.inicio), dentro = todos.filter((x) => diaDe(x.em) >= p.inicio && diaDe(x.em) <= p.fim);
  let corrente = liquido(antes);
  const dias = diasDoPeriodo(p).map((dia) => {
    const mov = dentro.filter((x) => diaDe(x.em) === dia);
    const entradas = cent(mov.filter((x) => x.tipo === "entrada").reduce((s, x) => s + x.valor, 0)), saidas = cent(mov.filter((x) => x.tipo === "saida").reduce((s, x) => s + x.valor, 0));
    const saldoAnterior = corrente;
    corrente = cent(corrente + entradas - saidas);
    return { dia, saldoAnterior, entradas, saidas, saldoDoDia: corrente, movimentos: mov };
  }).filter((d) => d.movimentos.length);
  const pedidos = pedidosRecarga(empresaId);
  return {
    periodo: p,
    saldoAtual: liquido(todos.filter((x) => diaDe(x.em) <= hoje)),
    saldoInicial: liquido(antes), totalEntradas: cent(dentro.filter((x) => x.tipo === "entrada").reduce((s, x) => s + x.valor, 0)),
    totalSaidas: cent(dentro.filter((x) => x.tipo === "saida").reduce((s, x) => s + x.valor, 0)), saldoFinal: corrente,
    dias: dias.reverse(),
    pedidos, aguardando: cent(pedidos.filter((x) => x.situacao === "Solicitado").reduce((s, x) => s + x.valor, 0)),
  };
}

// ------------------------------------------------------------------ Extrato de transações online

export const TIPOS_TRANSACAO = ["Saque", "Pagamento", "Recarga empresa", "Recarga passageiro", "Recarga motorista", "Repasse"] as const;
export const STATUS_TRANSACAO = ["Pago", "Pendente", "Chargeback", "Estornado", "Cancelado"] as const;
export type TipoTransacao = typeof TIPOS_TRANSACAO[number];
export type StatusTransacao = typeof STATUS_TRANSACAO[number];
export interface Transacao { id: string; codigo: string; em: string; dataRepasse: string | null; tipo: TipoTransacao; forma: string; repasse: string; status: StatusTransacao; valor: number; pessoa: string; detalhe: string; marcadoPor: string }

const marcas = (empresaId: string) => new Map((banco().prepare("SELECT id, status, motivo, por FROM transacoes_marcas WHERE empresa = ?").all(empresaId) as unknown as Array<{ id: string; status: StatusTransacao; motivo: string; por: string }>).map((m) => [m.id, m]));

/** Transações do período: recargas Pix, pagamentos de corridas pelo app, repasses por saldo, saques e recargas de saldo da central. */
export function transacoesOnline(empresaId: string, p: Per): Transacao[] {
  const nomes = pessoas(empresaId), mk = marcas(empresaId);
  const t: Transacao[] = [];
  const add = (x: Omit<Transacao, "codigo" | "marcadoPor">) => {
    const m = mk.get(x.id);
    const marcada = !!m && x.status === "Pago";
    t.push({ ...x, codigo: x.id.replace(/-/g, "").slice(0, 8).toUpperCase(), status: marcada ? m.status : x.status, marcadoPor: marcada ? m.por : "" });
  };
  for (const r of recargasPix(empresaId, p.inicio, p.fim)) add({ id: r.id, em: r.em, dataRepasse: diaDe(r.em), tipo: r.papel === "motorista" ? "Recarga motorista" : "Recarga passageiro", forma: "Pix", repasse: "Carteira do app", status: "Pago", valor: r.valor, pessoa: nomes.get(`${r.papel}|${r.chave}`)?.nome || r.chave, detalhe: r.descricao });
  for (const c of corridasFinalizadas(empresaId, p.inicio, p.fim)) {
    if (!ehPix(c.pagamento) && !ehCartaoApp(c.pagamento)) continue;
    const em = c.finalizadaEm ?? c.solicitadaEm!;
    add({ id: c.id, em, dataRepasse: diaDe(em), tipo: "Pagamento", forma: ehCartaoApp(c.pagamento) ? "Cartão no app" : "Pix", repasse: "Motorista", status: "Pago", valor: c.valor!, pessoa: c.passageiro.nome, detalhe: `Corrida OS ${c.os}` });
  }
  // repasse por saldo: o passageiro paga com a carteira e o valor passa para a carteira do motorista
  const rep = banco().prepare("SELECT id, chave, valor, descricao, em FROM carteira WHERE empresa = ? AND papel = 'motorista' AND valor > 0 AND corrida_id IS NOT NULL AND descricao LIKE '%paga com saldo%' AND substr(em, 1, 10) >= ? AND substr(em, 1, 10) <= ?").all(empresaId, p.inicio, p.fim) as unknown as Array<{ id: string; chave: string; valor: number; descricao: string; em: string }>;
  for (const r of rep) add({ id: r.id, em: r.em, dataRepasse: diaDe(r.em), tipo: "Repasse", forma: "Saldo da carteira", repasse: "Motorista", status: "Pago", valor: r.valor, pessoa: nomes.get(`motorista|${r.chave}`)?.nome || r.chave, detalhe: r.descricao });
  for (const s of todosSaques(empresaId)) {
    if (diaDe(s.em) < p.inicio || diaDe(s.em) > p.fim) continue;
    add({ id: s.id, em: s.em, dataRepasse: s.situacao === "Pago" ? diaDe(s.resolvidoEm) : null, tipo: "Saque", forma: "Pix", repasse: "Motorista", status: s.situacao === "Pago" ? "Pago" : s.situacao === "Recusado" ? "Estornado" : "Pendente", valor: -s.valor, pessoa: s.nome, detalhe: s.motivo || `Chave Pix ${s.chavePix}` });
  }
  for (const r of pedidosRecarga(empresaId)) {
    if (diaDe(r.em) < p.inicio || diaDe(r.em) > p.fim) continue;
    add({ id: r.id, em: r.em, dataRepasse: r.situacao === "Confirmado" ? diaDe(r.resolvidoEm) : null, tipo: "Recarga empresa", forma: "Pix", repasse: "Central", status: r.situacao === "Confirmado" ? "Pago" : r.situacao === "Cancelado" ? "Cancelado" : "Pendente", valor: r.valor, pessoa: r.por, detalhe: r.observacao });
  }
  return t.sort((a, b) => b.em.localeCompare(a.em));
}

export interface FiltroTransacoes { tipo?: string; status?: string; repasse?: string; busca?: string }
export function extratoOnline(empresaId: string, p: Per, f: FiltroTransacoes = {}) {
  const q = normal(f.busca ?? "").replace(/-/g, "");
  const todas = transacoesOnline(empresaId, p);
  const itens = todas.filter((x) => (!f.tipo || f.tipo === "todos" || x.tipo === f.tipo) && (!f.status || f.status === "todos" || x.status === f.status)
    && (!f.repasse || x.dataRepasse === f.repasse) && (!q || normal(`${x.id} ${x.codigo} ${x.pessoa} ${x.detalhe}`).replace(/-/g, "").includes(q)));
  const hoje = hojeBr();
  const soma = (l: Transacao[]) => cent(l.reduce((s, x) => s + x.valor, 0));
  const entradas = todas.filter((x) => x.status === "Pago" && ["Pagamento", "Recarga motorista", "Recarga passageiro", "Recarga empresa"].includes(x.tipo));
  const repHoje = todas.filter((x) => x.status === "Pago" && x.dataRepasse === hoje && ["Pagamento", "Repasse"].includes(x.tipo));
  return {
    periodo: p, tipos: TIPOS_TRANSACAO, status: STATUS_TRANSACAO, total: itens.length,
    totalCorridasRecargas: soma(entradas), repassesHoje: soma(repHoje), repassesAgendados: soma(todas.filter((x) => x.status === "Pendente")),
    itens: itens.slice(0, 1000),
  };
}

export function csvExtratoOnline(empresaId: string, p: Per, f: FiltroTransacoes = {}): string {
  const x = extratoOnline(empresaId, p, f);
  const br = (s: string | null) => (s ? s.slice(0, 10).split("-").reverse().join("/") : "");
  return montarCsv(["Data e hora", "Data de repasse", "ID da transação", "Tipo de transação", "Forma de pagamento", "Repasse", "Status", "Pessoa", "Detalhe", "Valor líquido"],
    x.itens.map((i) => [`${br(i.em)} ${i.em.slice(11, 16)}`, br(i.dataRepasse), i.id, i.tipo, i.forma, i.repasse, i.status, i.pessoa, i.detalhe, i.valor]));
}

/** Marca uma transação paga como Chargeback ou Estornado (ou volta para Pago). Só registro contábil: não mexe na carteira de ninguém. */
export function marcarTransacao(empresaId: string, id: string, status: string, motivo: string, por: string) {
  if (!["Pago", "Chargeback", "Estornado"].includes(status)) throw new Error("Status inválido. Use Pago, Chargeback ou Estornado.");
  const existe = transacoesOnline(empresaId, { inicio: "0000-01-01", fim: "9999-12-31" }).find((x) => x.id === id);
  if (!existe) throw new Error("Transação não encontrada.");
  if (!["Pagamento", "Recarga motorista", "Recarga passageiro", "Recarga empresa", "Repasse"].includes(existe.tipo)) throw new Error("Esta transação não aceita chargeback nem estorno.");
  if (existe.status !== "Pago" && !marcas(empresaId).has(id)) throw new Error("Só transações pagas podem ser marcadas.");
  if (status === "Pago") banco().prepare("DELETE FROM transacoes_marcas WHERE empresa = ? AND id = ?").run(empresaId, id);
  else banco().prepare("INSERT OR REPLACE INTO transacoes_marcas (empresa, id, status, motivo, em, por) VALUES (?, ?, ?, ?, ?, ?)").run(empresaId, id, status, String(motivo ?? "").replace(/[<>]/g, "").slice(0, 200), agoraBr().toISOString(), por.slice(0, 80));
  return { id, status };
}
