// Config › Taxas da central: taxas cobradas a cada corrida, do motorista (abatida do repasse, debitada da carteira dele)
// ou do passageiro (acrescida ao valor da corrida). Ficam por empresa; cada central associada é uma empresa, então cada uma tem as suas.
// Quando a empresa tem ao menos uma taxa do motorista, elas substituem a comissão da categoria (config/comissao.ts).

import { normal } from "../servidor/util.ts";
import { FORMAS_TAXA, MAX_FAIXAS, MAX_TAXAS, valorDaTaxa, type FaixaTaxa, type FormaTaxa, type Taxa } from "../comum/taxas.ts";
import { centavos, gravarConfig, lerConfig, lista, novoId, numero, texto, umDe } from "./armazem.ts";

const IDS_FORMA = FORMAS_TAXA.map((f) => f.id) as readonly FormaTaxa[];

export function sanearFaixas(e: unknown): FaixaTaxa[] {
  const l = lista(e);
  if (!l.length) throw new Error("Informe ao menos uma faixa de valores.");
  if (l.length > MAX_FAIXAS) throw new Error(`No máximo ${MAX_FAIXAS} faixas.`);
  const saida: FaixaTaxa[] = [];
  l.forEach((x, i) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const n = i + 1;
    const tipo = umDe(o.tipo, ["porcentagem", "fixo"] as const, "porcentagem");
    const de = centavos(numero(o.de, 0, 0, 1_000_000));
    const ate = o.ate === null || o.ate === undefined || o.ate === "" ? null : centavos(numero(o.ate, 0, 0, 1_000_000));
    const valor = centavos(numero(o.valor, 0, 0, tipo === "porcentagem" ? 100 : 10_000));
    if (i === 0 && de !== 0) throw new Error("A primeira faixa começa em R$ 0,00.");
    if (i > 0 && de !== saida[i - 1].ate) throw new Error(`Faixa ${n}: o "De" precisa ser igual ao "Até" da faixa anterior.`);
    if (ate === null && i < l.length - 1) throw new Error(`Faixa ${n}: só a última faixa pode ficar "sem limite".`);
    if (ate !== null && ate <= de) throw new Error(`Faixa ${n}: o "Até" precisa ser maior que o "De".`);
    if (!(valor > 0)) throw new Error(`Faixa ${n}: informe o valor da taxa.`);
    saida.push({ de, ate, tipo, valor });
  });
  return saida;
}

/** Valida e normaliza uma taxa vinda do painel. `existentes` serve para recusar nome repetido. */
export function sanearTaxa(e: unknown, existentes: Taxa[], por: string, agora: string): Taxa {
  const o = (e ?? {}) as Record<string, unknown>;
  const nome = texto(o.nome, 60);
  if (!nome) throw new Error("Informe o nome da taxa.");
  const id = texto(o.id, 20) || novoId();
  if (existentes.some((t) => t.id !== id && normal(t.nome) === normal(nome))) throw new Error("Já existe uma taxa com este nome.");
  const categorias = [...new Set(lista(o.categorias).map((c) => texto(c, 60)).filter(Boolean))].slice(0, 100);
  if (!categorias.length) throw new Error("Escolha ao menos uma categoria.");
  const pagamentos = [...new Set(lista(o.pagamentos).filter((p): p is FormaTaxa => IDS_FORMA.includes(p as FormaTaxa)))];
  if (!pagamentos.length) throw new Error("Escolha ao menos uma forma de pagamento.");
  return { id, nome, quemPaga: umDe(o.quemPaga, ["motorista", "passageiro"] as const, "motorista"), categorias, pagamentos, faixas: sanearFaixas(o.faixas), atualizadoPor: por.slice(0, 80), atualizadoEm: agora };
}

function ler(empresaId: string): Taxa[] {
  const c = lerConfig<{ taxas?: unknown }>(empresaId, "taxas", {});
  return lista(c.taxas).map((t) => {
    try { return sanearTaxa(t, [], String((t as Taxa).atualizadoPor ?? ""), String((t as Taxa).atualizadoEm ?? "")); } catch { return null; }
  }).filter((t): t is Taxa => !!t);
}
export const taxas = (empresaId: string): Taxa[] => ler(empresaId);

export function salvarTaxa(empresaId: string, entrada: unknown, por: string, agora = new Date().toISOString()): Taxa[] {
  const atual = ler(empresaId);
  const t = sanearTaxa(entrada, atual, por, agora);
  const existe = atual.some((x) => x.id === t.id);
  if (!existe && atual.length >= MAX_TAXAS) throw new Error(`No máximo ${MAX_TAXAS} taxas.`);
  const novas = existe ? atual.map((x) => (x.id === t.id ? t : x)) : [...atual, t];
  gravarConfig(empresaId, "taxas", { taxas: novas });
  return novas;
}
export function removerTaxa(empresaId: string, id: string): Taxa[] {
  const atual = ler(empresaId);
  if (!atual.some((t) => t.id === id)) throw new Error("Taxa não encontrada.");
  const novas = atual.filter((t) => t.id !== id);
  gravarConfig(empresaId, "taxas", { taxas: novas });
  return novas;
}

export interface Cobranca { id: string; nome: string; valor: number }
export interface EntradaTaxa { categoria: string; valor: number; forma: FormaTaxa | null }

/** Taxas que valem para esta corrida. Forma de pagamento desconhecida (ex.: saldo da carteira): só as taxas que cobrem todas as formas. */
function aplicaveis(empresaId: string, quem: "motorista" | "passageiro", e: EntradaTaxa): Taxa[] {
  const cat = normal(e.categoria);
  return taxas(empresaId).filter((t) => t.quemPaga === quem && t.categorias.some((c) => normal(c) === cat)
    && (e.forma ? t.pagamentos.includes(e.forma) : t.pagamentos.length === IDS_FORMA.length));
}
/** Forma de pagamento escrita na corrida -> forma das taxas (null quando não reconhece, como "Saldo da carteira"). */
export function formaDaTaxa(pagamento: string | undefined): FormaTaxa | null {
  const t = normal(pagamento ?? "");
  if (!t) return null;
  if (t.includes("pix")) return "pix";
  if (t.includes("dinheiro")) return "dinheiro";
  if (t.includes("debito")) return "debito";
  if (t.includes("app") || t.includes("online")) return "cartao_app";
  if (t.includes("credito") || t.includes("cartao")) return "credito";
  return null;
}
export const temTaxaDoMotorista = (empresaId: string) => taxas(empresaId).some((t) => t.quemPaga === "motorista");

export function cobrancas(empresaId: string, quem: "motorista" | "passageiro", e: EntradaTaxa): Cobranca[] {
  let restante = e.valor;
  const saida: Cobranca[] = [];
  for (const t of aplicaveis(empresaId, quem, e)) {
    // O motorista nunca paga mais do que a corrida vale (somando as taxas).
    const v = quem === "motorista" ? Math.min(valorDaTaxa(t.faixas, e.valor), Math.max(restante, 0)) : valorDaTaxa(t.faixas, e.valor);
    if (v > 0) { saida.push({ id: t.id, nome: t.nome, valor: centavos(v) }); restante -= v; }
  }
  return saida;
}
export const somaCobrancas = (l: Cobranca[]) => centavos(l.reduce((s, c) => s + c.valor, 0));
