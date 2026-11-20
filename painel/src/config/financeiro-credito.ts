// Financeiro > Créditos (Recargas e Saques, Extrato) e Financeiro > Cartão (Painel de Controle, Transações, Saldo da Central,
// Saldo do Motorista), como na Machine. Tudo sai do que o painel já tem: carteiras e extrato dos apps, pedidos de saque,
// corridas pagas por cartão e a taxa do plano de recebimento. Nenhuma operadora real: o que não existe aparece como "—".

import { saques as saquesDaEmpresa } from "../apps/extras.ts";
import { normal } from "../servidor/util.ts";
import { cent, corridasFinalizadas, diaDe, ehCartaoApp, extratoDaCentral, hojeBr, marcas, montarCsv, pedidosRecarga, type StatusTransacao } from "./financeiro-visao.ts";
import { lancamentos, listaCarteiras, pessoas, tipoDoLancamento, type Linha, type PapelCarteira } from "./financeiro.ts";
import { PLANOS, taxaCartao } from "./integracao-financeira.ts";

interface Per { inicio: string; fim: string }
const br = (d: string | null | undefined) => (d ? diaDe(d).split("-").reverse().join("/") : "");
const hora = (s: string) => s.slice(11, 16);
const papelOk = (v: string | undefined): PapelCarteira | "" => (v === "motorista" || v === "passageiro" ? v : "");
const LIMITE_TELA = 1000, LIMITE_CSV = 10_000;

// ------------------------------------------------------------------ Recargas e Saques

export const SITUACOES_RS = ["Confirmada", "Pendente", "Pago", "Recusado"] as const;
export interface FiltroRS { tipo?: string; papel?: string; situacao?: string; busca?: string }
interface LinhaRS { id: string; em: string; tipo: "Recarga" | "Saque"; papel: PapelCarteira; pessoa: string; cidade: string; detalhe: string; origem: string; valor: number; situacao: string; saqueId: string | null }

function linhasRS(empresaId: string, p: Per, f: FiltroRS): LinhaRS[] {
  const nomes = pessoas(empresaId);
  const out: LinhaRS[] = [];
  const papel = papelOk(f.papel);
  if (f.tipo !== "saque") {
    for (const l of lancamentos(empresaId, p.inicio, p.fim, papel || undefined)) {
      const t = tipoDoLancamento(l);
      if (l.valor <= 0 || (t !== "pix" && t !== "manual")) continue;
      const x = nomes.get(`${l.papel}|${l.chave}`);
      out.push({ id: l.id, em: l.em, tipo: "Recarga", papel: l.papel, pessoa: x?.nome || l.chave, cidade: x?.cidade ?? "", detalhe: l.descricao, origem: t === "pix" ? "Pix (automático)" : `Manual (${l.por})`, valor: l.valor, situacao: "Confirmada", saqueId: null });
    }
  }
  // Pedidos de saque existem só para motoristas (o app do passageiro não tem saque).
  if (f.tipo !== "recarga" && papel !== "passageiro") {
    for (const s of saquesDaEmpresa(empresaId)) {
      if (!(diaDe(s.em) >= p.inicio && diaDe(s.em) <= p.fim) && s.situacao !== "Pendente") continue;
      out.push({ id: `saque-${s.id}`, em: s.em, tipo: "Saque", papel: "motorista", pessoa: s.nome, cidade: nomes.get(`motorista|${s.motoristaId}`)?.cidade ?? "", detalhe: `Pix: ${s.chavePix}${s.motivo ? ` · ${s.motivo}` : ""}`, origem: "App do motorista", valor: s.valor, situacao: s.situacao, saqueId: s.id });
    }
  }
  const q = normal(f.busca ?? "");
  return out.filter((x) => (!f.situacao || f.situacao === "todos" || x.situacao === f.situacao) && (!q || normal(`${x.pessoa} ${x.detalhe}`).includes(q))).sort((a, b) => b.em.localeCompare(a.em));
}

export function recargasESaques(empresaId: string, p: Per, f: FiltroRS = {}) {
  const todos = linhasRS(empresaId, p, f);
  const soma = (l: LinhaRS[]) => cent(l.reduce((s, x) => s + x.valor, 0));
  const rec = todos.filter((x) => x.tipo === "Recarga"), saq = todos.filter((x) => x.tipo === "Saque");
  return {
    periodo: p, situacoes: SITUACOES_RS, total: todos.length,
    recargas: { qtd: rec.length, valor: soma(rec), pix: soma(rec.filter((x) => x.origem.startsWith("Pix"))), manual: soma(rec.filter((x) => x.origem.startsWith("Manual"))) },
    saques: { qtd: saq.length, pendente: soma(saq.filter((x) => x.situacao === "Pendente")), qtdPendentes: saq.filter((x) => x.situacao === "Pendente").length, pago: soma(saq.filter((x) => x.situacao === "Pago")), recusado: soma(saq.filter((x) => x.situacao === "Recusado")) },
    itens: todos.slice(0, LIMITE_TELA),
  };
}

export function csvRecargasESaques(empresaId: string, p: Per, f: FiltroRS = {}): string {
  return montarCsv(["Data e hora", "Tipo", "Papel", "Pessoa", "Cidade", "Origem", "Detalhe", "Situação", "Valor"],
    linhasRS(empresaId, p, f).slice(0, LIMITE_CSV).map((i) => [`${br(i.em)} ${hora(i.em)}`, i.tipo, i.papel === "motorista" ? "Motorista" : "Passageiro", i.pessoa, i.cidade, i.origem, i.detalhe, i.situacao, i.tipo === "Saque" ? -i.valor : i.valor]));
}

// ------------------------------------------------------------------ Extrato (créditos)

export const TIPOS_EXTRATO = [["pix", "Recarga Pix"], ["manual", "Ajuste manual"], ["saque", "Saque"], ["corrida", "Corrida"]] as const;
export interface FiltroExtrato { papel?: string; tipo?: string; busca?: string }
const rotuloTipo = (l: Linha) => { const t = tipoDoLancamento(l); return t === "pix" ? "Recarga Pix" : t === "manual" ? (l.valor > 0 ? "Crédito manual" : "Débito manual") : t === "saque" ? "Saque" : "Corrida"; };

function linhasExtrato(empresaId: string, p: Per, f: FiltroExtrato) {
  const nomes = pessoas(empresaId), q = normal(f.busca ?? "");
  return lancamentos(empresaId, p.inicio, p.fim, papelOk(f.papel) || undefined)
    .filter((l) => !f.tipo || f.tipo === "todos" || tipoDoLancamento(l) === f.tipo)
    .map((l) => { const x = nomes.get(`${l.papel}|${l.chave}`); return { id: l.id, em: l.em, papel: l.papel, pessoa: x?.nome || l.chave, telefone: x?.telefone ?? "", tipo: rotuloTipo(l), descricao: l.descricao, valor: l.valor, por: l.por, corridaId: l.corridaId }; })
    .filter((x) => !q || normal(`${x.pessoa} ${x.telefone} ${x.descricao}`).includes(q))
    .sort((a, b) => b.em.localeCompare(a.em));
}

export function extratoCreditos(empresaId: string, p: Per, f: FiltroExtrato = {}) {
  const todos = linhasExtrato(empresaId, p, f);
  const entradas = cent(todos.filter((x) => x.valor > 0).reduce((s, x) => s + x.valor, 0)), saidas = cent(todos.filter((x) => x.valor < 0).reduce((s, x) => s + Math.abs(x.valor), 0));
  return { periodo: p, tipos: TIPOS_EXTRATO, total: todos.length, entradas, saidas, liquido: cent(entradas - saidas), cortado: todos.length > LIMITE_TELA, itens: todos.slice(0, LIMITE_TELA) };
}

export function csvExtratoCreditos(empresaId: string, p: Per, f: FiltroExtrato = {}): string {
  return montarCsv(["Data e hora", "Papel", "Pessoa", "Telefone", "Tipo", "Descrição", "Lançado por", "Valor"],
    linhasExtrato(empresaId, p, f).slice(0, LIMITE_CSV).map((i) => [`${br(i.em)} ${hora(i.em)}`, i.papel === "motorista" ? "Motorista" : "Passageiro", i.pessoa, i.telefone, i.tipo, i.descricao, i.por, i.valor]));
}

// ------------------------------------------------------------------ Cartão

const ehMaquininha = (pagamento: string) => normal(pagamento).includes("maquininha");
const somarDias = (dia: string, n: number) => new Date(Date.parse(`${dia}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export interface TransacaoCartao { id: string; codigo: string; em: string; origem: "App" | "Maquininha"; forma: string; os: string; passageiro: string; motoristaId: string; motorista: string; valor: number; taxa: number; liquido: number; repasseEm: string | null; repasse: "Repassado" | "A repassar" | "—"; status: StatusTransacao }

/** Pagamentos de corridas por cartão no app e na maquininha. A taxa e o prazo de repasse são os do plano de recebimento e só valem para o cartão no app. */
export function transacoesCartao(empresaId: string, p: Per): TransacaoCartao[] {
  const t = taxaCartao(empresaId), prazo = t.plano === "d30" ? 30 : 1, hoje = hojeBr(), mk = marcas(empresaId);
  const out: TransacaoCartao[] = [];
  for (const c of corridasFinalizadas(empresaId, p.inicio, p.fim)) {
    const app = ehCartaoApp(c.pagamento);
    if (!app && !ehMaquininha(c.pagamento)) continue;
    const em = c.finalizadaEm ?? c.solicitadaEm, valor = c.valor!;
    const status: StatusTransacao = (mk.get(c.id)?.status as StatusTransacao | undefined) ?? "Pago";
    const taxa = app ? cent((valor * t.percentual) / 100) : 0;
    const repasseEm = app ? somarDias(diaDe(em), prazo) : null;
    out.push({ id: c.id, codigo: c.id.replace(/-/g, "").slice(0, 8).toUpperCase(), em, origem: app ? "App" : "Maquininha", forma: c.pagamento, os: c.os, passageiro: c.passageiro.nome, motoristaId: c.motoristaId ?? "", motorista: c.motorista, valor, taxa, liquido: cent(valor - taxa), repasseEm, repasse: !app || status !== "Pago" ? "—" : repasseEm! <= hoje ? "Repassado" : "A repassar", status });
  }
  return out.sort((a, b) => b.em.localeCompare(a.em));
}

const infoTaxa = (empresaId: string) => {
  const t = taxaCartao(empresaId);
  return { plano: PLANOS.find((x) => x.id === t.plano)?.nome ?? "Plano de recebimento ainda não escolhido", percentual: t.percentual, pagaPor: t.pagaPor, prazoDias: t.plano === "d30" ? 30 : 1 };
};

export function painelCartao(empresaId: string, p: Per) {
  const todas = transacoesCartao(empresaId, p), pagas = todas.filter((x) => x.status === "Pago");
  const soma = (l: TransacaoCartao[], k: "valor" | "taxa" | "liquido") => cent(l.reduce((s, x) => s + x[k], 0));
  const app = pagas.filter((x) => x.origem === "App"), maq = pagas.filter((x) => x.origem === "Maquininha");
  const formas = new Map<string, { qtd: number; valor: number }>();
  for (const x of pagas) { const g = formas.get(x.forma) ?? { qtd: 0, valor: 0 }; g.qtd++; g.valor = cent(g.valor + x.valor); formas.set(x.forma, g); }
  return {
    periodo: p, taxa: infoTaxa(empresaId), total: soma(pagas, "valor"), qtd: pagas.length,
    app: { qtd: app.length, bruto: soma(app, "valor"), taxa: soma(app, "taxa"), liquido: soma(app, "liquido") },
    maquininha: { qtd: maq.length, bruto: soma(maq, "valor") },
    porStatus: (["Pago", "Pendente", "Chargeback", "Estornado", "Cancelado"] as const).map((s) => ({ status: s, qtd: todas.filter((x) => x.status === s).length, valor: soma(todas.filter((x) => x.status === s), "valor") })),
    repasses: { repassado: soma(app.filter((x) => x.repasse === "Repassado"), "liquido"), aRepassar: soma(app.filter((x) => x.repasse === "A repassar"), "liquido") },
    porForma: [...formas].map(([forma, g]) => ({ forma, ...g })).sort((a, b) => b.valor - a.valor),
  };
}

export interface FiltroCartao { origem?: string; status?: string; repasse?: string; busca?: string }
function filtrarCartao(l: TransacaoCartao[], f: FiltroCartao) {
  const q = normal(f.busca ?? "").replace(/-/g, "");
  return l.filter((x) => (!f.origem || f.origem === "todas" || x.origem === f.origem) && (!f.status || f.status === "todos" || x.status === f.status) && (!f.repasse || f.repasse === "todos" || x.repasse === f.repasse)
    && (!q || normal(`${x.codigo} ${x.os} ${x.passageiro} ${x.motorista}`).replace(/-/g, "").includes(q)));
}

export function listaTransacoesCartao(empresaId: string, p: Per, f: FiltroCartao = {}) {
  const itens = filtrarCartao(transacoesCartao(empresaId, p), f);
  return { periodo: p, taxa: infoTaxa(empresaId), total: itens.length, bruto: cent(itens.reduce((s, x) => s + x.valor, 0)), taxas: cent(itens.reduce((s, x) => s + x.taxa, 0)), liquido: cent(itens.reduce((s, x) => s + x.liquido, 0)), itens: itens.slice(0, LIMITE_TELA) };
}

export function csvTransacoesCartao(empresaId: string, p: Per, f: FiltroCartao = {}): string {
  return montarCsv(["Data e hora", "Código", "Origem", "Forma de pagamento", "OS", "Passageiro", "Motorista", "Status", "Repasse", "Data de repasse", "Valor", "Taxa", "Líquido"],
    filtrarCartao(transacoesCartao(empresaId, p), f).slice(0, LIMITE_CSV).map((i) => [`${br(i.em)} ${hora(i.em)}`, i.codigo, i.origem, i.forma, i.os, i.passageiro, i.motorista, i.status, i.repasse, br(i.repasseEm), i.valor, i.taxa, i.liquido]));
}

export function saldoDaCentral(empresaId: string, p: Per) {
  const e = extratoDaCentral(empresaId, p), cartao = painelCartao(empresaId, p);
  const movimentos = e.dias.flatMap((d) => d.movimentos.map((m) => ({ ...m, dia: d.dia }))).sort((a, b) => b.em.localeCompare(a.em)).slice(0, 30);
  return {
    periodo: p, taxa: infoTaxa(empresaId), saldoAtual: e.saldoAtual, saldoInicial: e.saldoInicial, totalEntradas: e.totalEntradas, totalSaidas: e.totalSaidas, saldoFinal: e.saldoFinal,
    aguardandoRecarga: e.aguardando, qtdRecargasAguardando: pedidosRecarga(empresaId).filter((x) => x.situacao === "Solicitado").length,
    aReceber: cartao.repasses.aRepassar, repassado: cartao.repasses.repassado, movimentos,
  };
}

export function saldoDosMotoristas(empresaId: string, p: Per, busca = "") {
  const carteiras = listaCarteiras(empresaId, "motorista", busca).itens;
  const pend = new Map<string, number>();
  for (const s of saquesDaEmpresa(empresaId)) if (s.situacao === "Pendente") pend.set(s.motoristaId, cent((pend.get(s.motoristaId) ?? 0) + s.valor));
  const porMot = new Map<string, { aRepassar: number; repassado: number }>();
  for (const x of transacoesCartao(empresaId, p)) {
    if (x.origem !== "App" || x.status !== "Pago" || !x.motoristaId) continue;
    const g = porMot.get(x.motoristaId) ?? { aRepassar: 0, repassado: 0 };
    if (x.repasse === "Repassado") g.repassado = cent(g.repassado + x.liquido); else g.aRepassar = cent(g.aRepassar + x.liquido);
    porMot.set(x.motoristaId, g);
  }
  const itens = carteiras.map((c) => ({ id: c.chave, nome: c.nome, telefone: c.telefone, cidade: c.cidade, suspenso: c.suspenso, saldo: c.saldo, saquePendente: pend.get(c.chave) ?? 0, cartaoRepassado: porMot.get(c.chave)?.repassado ?? 0, cartaoARepassar: porMot.get(c.chave)?.aRepassar ?? 0 }));
  return { periodo: p, total: itens.length, saldoTotal: cent(itens.reduce((s, i) => s + i.saldo, 0)), saquesPendentes: cent(itens.reduce((s, i) => s + i.saquePendente, 0)), itens };
}

export function csvSaldoMotoristas(empresaId: string, p: Per, busca = ""): string {
  return montarCsv(["Motorista", "Telefone", "Cidade", "Saldo na carteira", "Saque pendente", "Cartão repassado (período)", "Cartão a repassar (período)"],
    saldoDosMotoristas(empresaId, p, busca).itens.map((i) => [i.nome, i.telefone, i.cidade, i.saldo, i.saquePendente, i.cartaoRepassado, i.cartaoARepassar]));
}
