// Financeiro: Carteiras, Extrato Geral (fluxo de caixa), Saques, Recargas e Relatórios & Stats (produção dos motoristas).
// Tudo sai da tabela de carteira dos apps, dos saques e das corridas próprias da empresa.

import { cadastroPorId } from "../comum/cadastros.ts";
import { listar } from "../cadastros/armazem.ts";
import { saques as saquesDaEmpresa, type Saque } from "../apps/extras.ts";
import { listarProprias } from "../corridas/index.ts";
import { banco } from "../servidor/banco.ts";
import { agoraBr, normal } from "../servidor/util.ts";
import { calcularComissao } from "./comissao.ts";

const cent = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const dia = (d: Date) => d.toISOString().slice(0, 10);
const somar = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/** Período do filtro (hoje, ontem, semana passada, mês atual, mês passado, ano passado ou datas). */
export function periodo(chave: string, inicio = "", fim = ""): { inicio: string; fim: string; rotulo: string } {
  const h = agoraBr(), hoje = dia(h);
  const mes = (a: number, m: number) => ({ inicio: dia(new Date(Date.UTC(a, m, 1))), fim: dia(new Date(Date.UTC(a, m + 1, 0))) });
  switch (chave) {
    case "hoje": return { inicio: hoje, fim: hoje, rotulo: "Hoje" };
    case "ontem": { const o = dia(somar(h, -1)); return { inicio: o, fim: o, rotulo: "Ontem" }; }
    case "semana": { const ini = somar(h, -((h.getUTCDay() + 6) % 7)); return { inicio: dia(ini), fim: hoje, rotulo: "Esta Semana" }; }
    case "semana_passada": { const seg = somar(h, -((h.getUTCDay() + 6) % 7) - 7); return { inicio: dia(seg), fim: dia(somar(seg, 6)), rotulo: "Semana Passada" }; }
    case "mes": return { ...mes(h.getUTCFullYear(), h.getUTCMonth()), fim: hoje, rotulo: "Este Mês" };
    case "mes_passado": return { ...mes(h.getUTCFullYear(), h.getUTCMonth() - 1), rotulo: "Mês Passado" };
    case "ano_passado": return { inicio: `${h.getUTCFullYear() - 1}-01-01`, fim: `${h.getUTCFullYear() - 1}-12-31`, rotulo: "Ano Passado" };
    case "personalizado": {
      const ok = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
      const i = ok(inicio) ? inicio : hoje, f = ok(fim) ? fim : i;
      return { inicio: i <= f ? i : f, fim: i <= f ? f : i, rotulo: "Personalizado" };
    }
    default: return { ...mes(h.getUTCFullYear(), h.getUTCMonth()), fim: hoje, rotulo: "Mês Atual" };
  }
}

export type PapelCarteira = "motorista" | "passageiro";
interface Linha { id: string; papel: PapelCarteira; chave: string; valor: number; descricao: string; corridaId: string | null; em: string; por: string }

function lancamentos(empresaId: string, de: string, ate: string, papel?: PapelCarteira, chave?: string): Linha[] {
  const sql = `SELECT id, papel, chave, valor, descricao, corrida_id AS corridaId, em, por FROM carteira WHERE empresa = ? AND substr(em, 1, 10) >= ? AND substr(em, 1, 10) <= ?${papel ? " AND papel = ?" : ""}${chave ? " AND chave = ?" : ""} ORDER BY em DESC, rowid DESC LIMIT 2000`;
  const args = [empresaId, de, ate, ...(papel ? [papel] : []), ...(chave ? [chave] : [])];
  return banco().prepare(sql).all(...args) as unknown as Linha[];
}

const pessoas = (empresaId: string) => {
  const m = new Map<string, { nome: string; telefone: string; cidade: string; status: string }>();
  for (const x of listar(empresaId, cadastroPorId("motoristas")!)) m.set(`motorista|${x.id}`, { nome: String(x.nome ?? ""), telefone: String(x.telefone ?? ""), cidade: String(x.cidade ?? ""), status: String(x.status ?? "") });
  for (const x of listar(empresaId, cadastroPorId("clientes")!)) m.set(`passageiro|${String(x.telefone ?? "")}`, { nome: String(x.nome ?? ""), telefone: String(x.telefone ?? ""), cidade: String(x.cidade ?? ""), status: String(x.status ?? "") });
  return m;
};

/** Origem do lançamento: recarga Pix (automática), manual (central) ou movimento de corrida/saque. */
export function tipoDoLancamento(l: { valor: number; descricao: string; por: string }): "pix" | "manual" | "saque" | "corrida" {
  const d = normal(l.descricao);
  if (d.startsWith("saque")) return "saque";
  if (l.valor > 0 && d.startsWith("recarga pix")) return "pix";
  if (l.valor !== 0 && l.por.includes("@")) return "manual";
  return "corrida";
}

// ------------------------------------------------------------------ carteiras

export function listaCarteiras(empresaId: string, papel: PapelCarteira, busca = "", situacao = "todos") {
  const p = pessoas(empresaId);
  const saldos = new Map((banco().prepare("SELECT chave, ROUND(SUM(valor), 2) AS saldo, COUNT(*) AS n FROM carteira WHERE empresa = ? AND papel = ? GROUP BY chave").all(empresaId, papel) as Array<{ chave: string; saldo: number; n: number }>).map((s) => [s.chave, s]));
  const chaves = new Set<string>(saldos.keys());
  for (const k of p.keys()) if (k.startsWith(`${papel}|`)) chaves.add(k.slice(papel.length + 1));
  const q = normal(busca);
  const itens = [...chaves].map((chave) => {
    const x = p.get(`${papel}|${chave}`);
    const suspenso = ["Bloqueado", "Inativo"].includes(x?.status ?? "");
    return { chave, nome: x?.nome || chave, telefone: x?.telefone ?? (papel === "passageiro" ? chave : ""), cidade: x?.cidade ?? "", suspenso, saldo: saldos.get(chave)?.saldo ?? 0, lancamentos: saldos.get(chave)?.n ?? 0 };
  }).filter((i) => (!q || normal(`${i.nome} ${i.telefone}`).includes(q)) && (situacao === "todos" || (situacao === "Suspensos") === i.suspenso))
    .sort((a, b) => a.nome.localeCompare(b.nome)).slice(0, 500);
  return { itens, total: itens.length, saldoTotal: cent(itens.reduce((s, i) => s + i.saldo, 0)) };
}

export function detalheCarteira(empresaId: string, papel: PapelCarteira, chave: string, per: { inicio: string; fim: string }) {
  const x = pessoas(empresaId).get(`${papel}|${chave}`);
  const todos = banco().prepare("SELECT ROUND(COALESCE(SUM(valor), 0), 2) AS s FROM carteira WHERE empresa = ? AND papel = ? AND chave = ?").get(empresaId, papel, chave) as { s: number };
  const l = lancamentos(empresaId, per.inicio, per.fim, papel, chave);
  return {
    nome: x?.nome || chave, telefone: x?.telefone ?? (papel === "passageiro" ? chave : ""), suspenso: ["Bloqueado", "Inativo"].includes(x?.status ?? ""), saldo: todos.s,
    entradas: cent(l.filter((i) => i.valor > 0).reduce((s, i) => s + i.valor, 0)), saidas: cent(l.filter((i) => i.valor < 0).reduce((s, i) => s + Math.abs(i.valor), 0)),
    transacoes: l.slice(0, 300),
  };
}

// ------------------------------------------------------------------ comissões das corridas finalizadas

function comissoesDoPeriodo(empresaId: string, de: string, ate: string) {
  return listarProprias(empresaId).filter((c) => c.status === "finalizada" && c.valor && c.motoristaId && (c.finalizadaEm ?? c.solicitadaEm).slice(0, 10) >= de && (c.finalizadaEm ?? c.solicitadaEm).slice(0, 10) <= ate)
    .map((c) => ({ c, r: calcularComissao(empresaId, c.categoria, c.valor!, c.motoristaId!) })).filter((x) => x.r.taxaCentral > 0);
}

// ------------------------------------------------------------------ extrato geral

export function extratoGeral(empresaId: string, aba: "geral" | "motorista" | "passageiro", per: { inicio: string; fim: string }) {
  const p = pessoas(empresaId);
  const todos = lancamentos(empresaId, per.inicio, per.fim, aba === "geral" ? undefined : aba);
  const com = aba === "passageiro" ? [] : comissoesDoPeriodo(empresaId, per.inicio, per.fim);
  const soma = (f: (l: Linha) => boolean) => cent(todos.filter(f).reduce((s, l) => s + Math.abs(l.valor), 0));
  const entradas = todos.filter((l) => l.valor > 0 && (tipoDoLancamento(l) === "pix" || tipoDoLancamento(l) === "manual"));
  const historico = [
    ...entradas.map((l) => ({ id: l.id, titulo: l.descricao, pessoa: p.get(`${l.papel}|${l.chave}`)?.nome || l.chave, papel: l.papel, valor: l.valor, em: l.em, tipo: tipoDoLancamento(l) })),
    ...com.map(({ c, r }) => ({ id: `com-${c.id}`, titulo: `Comissão Corrida #${c.os}`, pessoa: c.motorista, papel: "motorista" as const, valor: r.taxaCentral, em: c.finalizadaEm ?? c.solicitadaEm, tipo: "comissao" as const })),
  ].sort((a, b) => b.em.localeCompare(a.em)).slice(0, 300);
  return {
    faturamento: cent(com.reduce((s, x) => s + x.r.taxaCentral, 0)),
    recargas: soma((l) => l.valor > 0 && ["pix", "manual"].includes(tipoDoLancamento(l))),
    pix: soma((l) => l.valor > 0 && tipoDoLancamento(l) === "pix"),
    manual: soma((l) => l.valor !== 0 && tipoDoLancamento(l) === "manual"),
    saques: soma((l) => l.valor < 0 && tipoDoLancamento(l) === "saque"),
    historico,
  };
}

// ------------------------------------------------------------------ saques

export function listaSaques(empresaId: string, per: { inicio: string; fim: string }) {
  const p = pessoas(empresaId);
  const todos = saquesDaEmpresa(empresaId);
  const noPeriodo = todos.filter((s) => s.em.slice(0, 10) >= per.inicio && s.em.slice(0, 10) <= per.fim || s.situacao === "Pendente");
  const pago = noPeriodo.filter((s) => s.situacao === "Pago");
  const manuais = lancamentos(empresaId, per.inicio, per.fim, "motorista").filter((l) => l.valor < 0 && tipoDoLancamento(l) === "manual");
  return {
    pendente: cent(todos.filter((s) => s.situacao === "Pendente").reduce((s, x) => s + x.valor, 0)), qtdPendentes: todos.filter((s) => s.situacao === "Pendente").length,
    totalPago: cent(pago.reduce((s, x) => s + x.valor, 0)), manuais: cent(manuais.reduce((s, l) => s + Math.abs(l.valor), 0)),
    itens: noPeriodo.map((s: Saque) => ({ ...s, cidade: p.get(`motorista|${s.motoristaId}`)?.cidade ?? "" })),
  };
}

// ------------------------------------------------------------------ recargas

export function listaRecargas(empresaId: string, aba: PapelCarteira, per: { inicio: string; fim: string }) {
  const p = pessoas(empresaId);
  const l = lancamentos(empresaId, per.inicio, per.fim, aba).filter((x) => x.valor > 0 && ["pix", "manual"].includes(tipoDoLancamento(x)));
  const pix = l.filter((x) => tipoDoLancamento(x) === "pix"), manual = l.filter((x) => tipoDoLancamento(x) === "manual");
  const s = (a: Linha[]) => cent(a.reduce((t, x) => t + x.valor, 0));
  return {
    total: s(l), qtd: l.length, pix: s(pix), manual: s(manual),
    itens: l.map((x) => ({ id: x.id, em: x.em, usuario: p.get(`${aba}|${x.chave}`)?.nome || x.chave, cidade: p.get(`${aba}|${x.chave}`)?.cidade ?? "", detalhe: x.descricao, origem: tipoDoLancamento(x) === "pix" ? "Pix (Automático)" : `Manual (${x.por})`, valor: x.valor })),
  };
}

// ------------------------------------------------------------------ relatórios & stats

export interface FiltroProducao { inicio: string; fim: string; busca?: string; categoria?: string; pagamento?: string; ordem?: string; dir?: string }
export function producaoMotoristas(empresaId: string, f: FiltroProducao) {
  const mot = new Map(listar(empresaId, cadastroPorId("motoristas")!).map((m) => [m.id, m]));
  const q = normal(f.busca ?? "");
  const corridas = listarProprias(empresaId).filter((c) => c.status === "finalizada" && c.valor && c.motoristaId && (c.finalizadaEm ?? c.solicitadaEm).slice(0, 10) >= f.inicio && (c.finalizadaEm ?? c.solicitadaEm).slice(0, 10) <= f.fim
    && (!f.categoria || f.categoria === "todas" || normal(c.categoria) === normal(f.categoria)) && (!f.pagamento || f.pagamento === "todos" || normal(c.pagamento) === normal(f.pagamento)));
  const grupos = new Map<string, { motoristaId: string; motorista: string; placa: string; veiculo: string; categoria: string; qtd: number; faturamento: number; comissao: number }>();
  for (const c of corridas) {
    const m = mot.get(c.motoristaId!);
    if (q && !normal(`${c.motorista} ${m?.placa ?? ""} ${c.telefoneMotorista}`).includes(q)) continue;
    const k = `${c.motoristaId}|${c.categoria}`;
    const g = grupos.get(k) ?? { motoristaId: c.motoristaId!, motorista: c.motorista, placa: String(m?.placa ?? ""), veiculo: String(m?.veiculo ?? ""), categoria: c.categoria, qtd: 0, faturamento: 0, comissao: 0 };
    g.qtd++; g.faturamento += c.valor!; g.comissao += calcularComissao(empresaId, c.categoria, c.valor!, c.motoristaId!).taxaCentral;
    grupos.set(k, g);
  }
  const campo = ({ nome: "motorista", qtd_corridas: "qtd", faturamento_total: "faturamento", ticket_medio: "ticket", comissao_total: "comissao" } as Record<string, string>)[f.ordem ?? ""] ?? "faturamento";
  const sinal = f.dir === "ASC" ? 1 : -1;
  const itens = [...grupos.values()].map((g) => ({ ...g, faturamento: cent(g.faturamento), comissao: cent(g.comissao), ticket: cent(g.faturamento / g.qtd) }))
    .sort((a, b) => sinal * (campo === "motorista" ? a.motorista.localeCompare(b.motorista) : (a as unknown as Record<string, number>)[campo] - (b as unknown as Record<string, number>)[campo]));
  return {
    bruto: cent(itens.reduce((s, i) => s + i.faturamento, 0)), receita: cent(itens.reduce((s, i) => s + i.comissao, 0)), corridas: itens.reduce((s, i) => s + i.qtd, 0),
    itens,
    categorias: [...new Set(listarProprias(empresaId).map((c) => c.categoria).filter(Boolean))].sort(),
    pagamentos: [...new Set(listarProprias(empresaId).map((c) => c.pagamento).filter(Boolean))].sort(),
  };
}
