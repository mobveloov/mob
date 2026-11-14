// Gestão de pendências de pagamentos e Gestão de taxas de cancelamento (formato da Machine).
//
// Três tipos de pendência:
//   - Taxa de cancelamento: sai das corridas canceladas com taxa (automática).
//   - Pix no app: nasce sozinha quando um Pix de corrida é marcado como Estornada ou Chargeback (operacao/pix.ts).
//   - Pagamento insuficiente: registrada à mão pela central (não há gateway que detecte isso).
// Situações: Pendente, Processando, Resolvido e Abonado. Nas taxas existe também "Repassado" (valor liberado ao motorista),
// que na gestão de pendências aparece como Processando. Só o administrador muda situação; tudo é por empresa.
// Arquivos (por empresa, em operacao/): pendencias.json (situação de cada taxa ou Pix) e pendencias-manuais.json (registros à mão).

import { listarProprias, type CorridaPropria } from "../corridas/index.ts";
import { banco } from "../servidor/banco.ts";
import { agoraBr, arred, normal } from "../servidor/util.ts";
import { lancar } from "../apps/extras.ts";
import { gravarOperacao, lerOperacao } from "./armazem.ts";
import { montarCsv } from "../config/financeiro-visao.ts";
import { pixDasCorridas } from "./pix.ts";

export const TIPOS_PENDENCIA = ["Pagamento insuficiente", "Taxa de cancelamento", "Pix no app"] as const;
export type TipoPendencia = typeof TIPOS_PENDENCIA[number];
export type SituacaoPendencia = "pendente" | "processando" | "resolvido" | "abonado";
type SituacaoGravada = SituacaoPendencia | "repassado";
export const SITUACOES_PENDENCIA: SituacaoPendencia[] = ["pendente", "processando", "resolvido", "abonado"];

/** Nomes antigos (antes dos estados novos) continuam valendo nos filtros e no que já foi gravado. */
const ALIAS: Record<string, SituacaoGravada> = { paga: "resolvido", abonada: "abonado" };
export const normalizarSituacao = (s: string): SituacaoGravada | "" => (ALIAS[s] ?? (["pendente", "processando", "repassado", "resolvido", "abonado"].includes(s) ? (s as SituacaoGravada) : ""));

interface Estado { status: string; em: string; por: string; valor?: number; motivo?: string; osColeta?: string; motoristaColeta?: string }
const estados = (empresaId: string) => lerOperacao<Record<string, Estado>>(empresaId, "pendencias.json", {});

interface Manual { id: string; tipo: TipoPendencia; os: string; passageiro: string; telefone: string; motorista: string; valor: number; observacao: string; status: SituacaoPendencia; criadoEm: string; criadoPor: string; em: string | null; por: string | null }
const manuais = (empresaId: string) => lerOperacao<Manual[]>(empresaId, "pendencias-manuais.json", []);

export interface ItemPendencia {
  id: string; origem: "taxa" | "pix" | "manual"; tipo: TipoPendencia; os: string; data: string; passageiro: string; telefone: string; motorista: string;
  valor: number; situacao: SituacaoGravada; resolvidoEm: string | null; resolvidoPor: string | null; observacao: string;
  osColeta: string; motoristaColeta: string;
}

const paginar = <T>(l: T[], pagina: number, porPagina = 20) => {
  const paginas = Math.max(1, Math.ceil(l.length / porPagina));
  const p = Math.min(Math.max(1, Math.floor(pagina) || 1), paginas);
  return { total: l.length, pagina: p, paginas, itens: l.slice((p - 1) * porPagina, p * porPagina) };
};
const soDigitos = (s: string) => s.replace(/\D/g, "");

function itensDeTaxa(empresaId: string, est: Record<string, Estado>): ItemPendencia[] {
  return listarProprias(empresaId).filter((c) => c.status === "cancelada" && (c.taxaCancelamento ?? 0) > 0).map((c) => {
    const e = est[c.id];
    return {
      id: c.id, origem: "taxa" as const, tipo: "Taxa de cancelamento" as const, os: c.os, data: c.historico.at(-1)?.em ?? c.solicitadaEm, passageiro: c.passageiro.nome, telefone: c.passageiro.telefone,
      motorista: c.motorista, valor: e?.valor ?? c.taxaCancelamento!, situacao: (normalizarSituacao(e?.status ?? "") || "pendente") as SituacaoGravada, resolvidoEm: e?.em ?? null, resolvidoPor: e?.por ?? null,
      observacao: e?.motivo ?? "", osColeta: e?.osColeta ?? "", motoristaColeta: e?.motoristaColeta ?? "",
    };
  });
}

/** Pix estornado ou em chargeback vira dívida do passageiro com a central ("Pix no app"). */
function itensDePix(empresaId: string, est: Record<string, Estado>): ItemPendencia[] {
  return pixDasCorridas(empresaId).filter((x) => x.situacao === "Estornada" || x.situacao === "Chargeback").map((x) => {
    const e = est[`pix-${x.id}`];
    return {
      id: `pix-${x.id}`, origem: "pix" as const, tipo: "Pix no app" as const, os: x.os, data: x.marcadaEm ?? x.data, passageiro: x.passageiro, telefone: x.telefone, motorista: x.motorista,
      valor: x.valor, situacao: (normalizarSituacao(e?.status ?? "") || "pendente") as SituacaoGravada, resolvidoEm: e?.em ?? null, resolvidoPor: e?.por ?? null,
      observacao: `Pix ${x.situacao === "Chargeback" ? "com chargeback" : "estornado"}${x.motivo ? `: ${x.motivo}` : ""}`, osColeta: "", motoristaColeta: "",
    };
  });
}

function itensManuais(empresaId: string): ItemPendencia[] {
  return manuais(empresaId).map((m) => ({
    id: m.id, origem: "manual" as const, tipo: m.tipo, os: m.os, data: m.criadoEm, passageiro: m.passageiro, telefone: m.telefone, motorista: m.motorista, valor: m.valor,
    situacao: m.status, resolvidoEm: m.em, resolvidoPor: m.por, observacao: m.observacao, osColeta: "", motoristaColeta: "",
  }));
}

export const todasPendencias = (empresaId: string): ItemPendencia[] => {
  const est = estados(empresaId);
  return [...itensDeTaxa(empresaId, est), ...itensDePix(empresaId, est), ...itensManuais(empresaId)];
};

/** Na gestão de pendências "Repassado" aparece como Processando. */
export const situacaoDaGestao = (s: SituacaoGravada): SituacaoPendencia => (s === "repassado" ? "processando" : s);

export interface FiltroPendencias { tipo?: string; situacao?: string; busca?: string; inicio?: string; fim?: string; motorista?: string }
const diaDe = (s: string) => String(s ?? "").slice(0, 10);
function aplicar(l: ItemPendencia[], f: FiltroPendencias) {
  const b = normal(f.busca ?? "").trim(), m = normal(f.motorista ?? "").trim(), tel = soDigitos(f.busca ?? "");
  return l.filter((x) => (!f.inicio || diaDe(x.data) >= f.inicio) && (!f.fim || diaDe(x.data) <= f.fim)
    && (!f.tipo || f.tipo === "todos" || x.tipo === f.tipo)
    && (!b || normal(x.passageiro).includes(b) || x.os === (f.busca ?? "").trim() || (!!tel && x.telefone.includes(tel)))
    && (!m || normal(x.motorista).includes(m)));
}
const somar = (l: ItemPendencia[]) => arred(l.reduce((s, x) => s + x.valor, 0));
const contagem = (l: ItemPendencia[], sit: (x: ItemPendencia) => string) => {
  const r: Record<string, { qtd: number; valor: number }> = {};
  for (const s of [...SITUACOES_PENDENCIA, "repassado"]) { const g = l.filter((x) => sit(x) === s); r[s] = { qtd: g.length, valor: somar(g) }; }
  return r;
};

export function listarPendencias(empresaId: string, f: FiltroPendencias, pagina: number) {
  const base = aplicar(todasPendencias(empresaId), f).sort((a, b) => b.data.localeCompare(a.data));
  const sit = normalizarSituacao(f.situacao ?? "");
  const filtrado = sit ? base.filter((x) => (sit === "processando" ? situacaoDaGestao(x.situacao) === "processando" : x.situacao === sit)) : base;
  const c = contagem(base, (x) => situacaoDaGestao(x.situacao));
  return {
    totalAberto: somar(base.filter((x) => x.situacao === "pendente" || x.situacao === "processando" || x.situacao === "repassado")),
    contagens: { pendente: c.pendente, processando: c.processando, resolvido: c.resolvido, abonado: c.abonado },
    tipos: TIPOS_PENDENCIA,
    ...paginar(filtrado.map(paraTela), pagina),
  };
}

const paraTela = (x: ItemPendencia) => ({ ...x, status: x.situacao, situacaoGestao: situacaoDaGestao(x.situacao) });

export function csvPendencias(empresaId: string, f: FiltroPendencias): string {
  const base = aplicar(todasPendencias(empresaId), f).sort((a, b) => b.data.localeCompare(a.data));
  const sit = normalizarSituacao(f.situacao ?? "");
  const l = sit ? base.filter((x) => situacaoDaGestao(x.situacao) === situacaoDaGestao(sit)) : base;
  const rotulo: Record<string, string> = { pendente: "Pendente", processando: "Processando", repassado: "Processando", resolvido: "Resolvido", abonado: "Abonado" };
  return montarCsv(["Data", "Tipo", "OS", "Passageiro", "Telefone", "Motorista", "Valor", "Situação", "Resolvido em", "Resolvido por", "Observação"],
    l.map((x) => [dataBr(x.data), x.tipo, x.os, x.passageiro, x.telefone, x.motorista, x.valor, rotulo[x.situacao], dataBr(x.resolvidoEm), x.resolvidoPor ?? "", x.observacao]));
}
const dataBr = (s: string | null) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)} ${s.slice(11, 16)}` : "");

// ------------------------------------------------------------------ registrar à mão

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[<>]/g, "").trim().slice(0, max) : "");

/** Registra uma pendência de "Pagamento insuficiente" ou "Pix no app" (sem gateway: a central lança o que ficou devendo). */
export function registrarPendencia(empresaId: string, entrada: Record<string, unknown>, por: string): ItemPendencia {
  const tipo = TIPOS_PENDENCIA.find((t) => t === entrada.tipo);
  if (!tipo || tipo === "Taxa de cancelamento") throw new Error("Escolha o tipo: Pagamento insuficiente ou Pix no app. As taxas de cancelamento vêm das corridas canceladas.");
  const valor = arred(Number(entrada.valor));
  if (!Number.isFinite(valor) || valor <= 0 || valor > 100_000) throw new Error("Informe um valor entre R$ 0,01 e R$ 100.000,00.");
  const os = texto(entrada.os, 40);
  const c = os ? listarProprias(empresaId).find((x) => x.os === os) : undefined;
  if (os && !c) throw new Error("Não achei esta OS nas corridas da empresa.");
  const passageiro = texto(entrada.passageiro, 120) || c?.passageiro.nome || "";
  if (!passageiro) throw new Error("Informe o passageiro (ou uma OS da empresa).");
  const m: Manual = {
    id: crypto.randomUUID(), tipo, os, passageiro, telefone: soDigitos(texto(entrada.telefone, 20)) || c?.passageiro.telefone || "", motorista: c?.motorista ?? "",
    valor, observacao: texto(entrada.observacao, 300), status: "pendente", criadoEm: agoraBr().toISOString(), criadoPor: por.slice(0, 80), em: null, por: null,
  };
  gravarOperacao(empresaId, "pendencias-manuais.json", [...manuais(empresaId).slice(-4999), m]);
  return itensManuais(empresaId).find((x) => x.id === m.id)!;
}

// ------------------------------------------------------------------ mudar a situação

export type AcaoPendencia = "processar" | "repassar" | "baixar" | "abonar";
const NOVA: Record<AcaoPendencia, SituacaoGravada> = { processar: "processando", repassar: "repassado", baixar: "resolvido", abonar: "abonado" };

/** Valor que a taxa debitou do passageiro (o que de fato saiu da carteira, mesmo que a taxa da corrida tenha sido editada depois). */
function debitoDaTaxa(empresaId: string, c: CorridaPropria): number {
  const r = banco().prepare("SELECT COALESCE(SUM(-valor), 0) AS v FROM carteira WHERE empresa = ? AND papel = 'passageiro' AND chave = ? AND corrida_id = ? AND descricao = ? AND valor < 0")
    .get(empresaId, c.passageiro.telefone, c.id, `Taxa de cancelamento OS ${c.os}`.slice(0, 120)) as { v: number };
  return arred(r.v);
}

/**
 * Muda a situação de uma pendência. De Pendente/Processando/Repassado pode ir para qualquer outra; Resolvido e Abonado são finais.
 * Taxa baixada ou abonada: o que foi debitado da carteira do passageiro volta para ele (cobrança em dinheiro ou perdoada), uma vez só.
 */
export function mudarPendencia(empresaId: string, id: string, acao: AcaoPendencia, por: string, extra: { osColeta?: string; motivo?: string } = {}) {
  if (!(acao in NOVA)) throw new Error("Ação inválida.");
  const todas = todasPendencias(empresaId);
  const p = todas.find((x) => x.id === id);
  if (!p) throw new Error("Pendência não encontrada.");
  if (p.situacao === "resolvido" || p.situacao === "abonado") throw new Error("Esta pendência já foi resolvida.");
  if (acao === "repassar" && p.origem !== "taxa") throw new Error("Só a taxa de cancelamento tem repasse ao motorista.");
  const nova = NOVA[acao];
  if (nova === p.situacao) throw new Error("A pendência já está nesta situação.");
  const em = agoraBr().toISOString(), quem = por.slice(0, 120);
  if (p.origem === "manual") {
    const l = manuais(empresaId).map((m) => (m.id === id ? { ...m, status: nova as SituacaoPendencia, em: nova === "resolvido" || nova === "abonado" ? em : null, por: nova === "resolvido" || nova === "abonado" ? quem : null } : m));
    gravarOperacao(empresaId, "pendencias-manuais.json", l);
    return { ...p, situacao: nova, resolvidoEm: nova === "resolvido" || nova === "abonado" ? em : null, resolvidoPor: nova === "resolvido" || nova === "abonado" ? quem : null };
  }
  const est = estados(empresaId);
  const novo: Estado = { ...(est[id] ?? {}), status: nova, em, por: quem, motivo: texto(extra.motivo, 200) || est[id]?.motivo || "" };
  if (p.origem === "taxa") {
    const c = listarProprias(empresaId).find((x) => x.id === id)!;
    const debito = debitoDaTaxa(empresaId, c);
    novo.valor = debito || c.taxaCancelamento!;
    if (nova === "resolvido") {
      const os = texto(extra.osColeta, 40);
      if (os) {
        const coleta = listarProprias(empresaId).find((x) => x.os === os);
        if (!coleta) throw new Error("Não achei a OS de coleta nas corridas da empresa.");
        novo.osColeta = os; novo.motoristaColeta = coleta.motorista;
      }
    }
    if ((nova === "resolvido" || nova === "abonado") && debito > 0) lancar(empresaId, "passageiro", c.passageiro.telefone, debito, `Taxa de cancelamento OS ${c.os} ${nova === "resolvido" ? "paga" : "abonada"}`, quem, c.id);
  }
  gravarOperacao(empresaId, "pendencias.json", { ...est, [id]: novo });
  return { ...p, situacao: nova, resolvidoEm: em, resolvidoPor: quem };
}

// ------------------------------------------------------------------ Gestão de taxas de cancelamento

export const ABAS_TAXAS = ["todos", "pendentes", "repassados", "resolvidos", "abonados"] as const;
const SIT_ABA: Record<string, SituacaoGravada[]> = { pendentes: ["pendente", "processando"], repassados: ["repassado"], resolvidos: ["resolvido"], abonados: ["abonado"] };

export interface FiltroTaxas { aba?: string; os?: string; motorista?: string; cliente?: string; inicio?: string; fim?: string }
function taxasFiltradas(empresaId: string, f: FiltroTaxas) {
  const os = (f.os ?? "").trim(), mot = normal(f.motorista ?? ""), cli = normal(f.cliente ?? "");
  return itensDeTaxa(empresaId, estados(empresaId)).filter((x) => (!f.inicio || diaDe(x.data) >= f.inicio) && (!f.fim || diaDe(x.data) <= f.fim)
    && (!os || x.os.includes(os)) && (!mot || normal(x.motorista).includes(mot)) && (!cli || normal(x.passageiro).includes(cli))).sort((a, b) => b.data.localeCompare(a.data));
}

export function listarTaxas(empresaId: string, f: FiltroTaxas, pagina: number) {
  const base = taxasFiltradas(empresaId, f);
  const g = (s: SituacaoGravada[]) => base.filter((x) => s.includes(x.situacao));
  const aba = SIT_ABA[f.aba ?? ""];
  const resumo = (l: ItemPendencia[]) => ({ qtd: l.length, valor: somar(l) });
  return {
    taxas: resumo(base), pendentes: resumo(g(SIT_ABA.pendentes)), repassados: resumo(g(SIT_ABA.repassados)), resolvidos: resumo(g(SIT_ABA.resolvidos)), abonados: resumo(g(SIT_ABA.abonados)),
    ...paginar((aba ? g(aba) : base).map(paraTela), pagina, 10),
  };
}

export function csvTaxas(empresaId: string, f: FiltroTaxas): string {
  const base = taxasFiltradas(empresaId, f), aba = SIT_ABA[f.aba ?? ""];
  const l = aba ? base.filter((x) => aba.includes(x.situacao)) : base;
  const rotulo: Record<string, string> = { pendente: "Pendente", processando: "Processando", repassado: "Repassado", resolvido: "Resolvido", abonado: "Abonado" };
  return montarCsv(["Data", "OS (corrida de origem)", "Passageiro", "Taxa", "Motorista a receber", "Motorista de coleta", "Situação", "Resolvido em", "Resolvido por"],
    l.map((x) => [dataBr(x.data), x.os, x.passageiro, x.valor, x.motorista, x.motoristaColeta, rotulo[x.situacao], dataBr(x.resolvidoEm), x.resolvidoPor ?? ""]));
}

