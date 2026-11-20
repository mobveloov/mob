// Taxas da central (Config › Taxas da central › Taxa por corrida): tipos e cálculo, sem nada de servidor.
// O painel (simulador) e o servidor (repasse e carteira) usam as mesmas contas daqui.

export const FORMAS_TAXA = [
  { id: "dinheiro", nome: "Dinheiro" }, { id: "debito", nome: "Débito (máquina)" }, { id: "credito", nome: "Crédito (máquina)" },
  { id: "cartao_app", nome: "Cartão no app" }, { id: "pix", nome: "Pix" },
] as const;
export type FormaTaxa = (typeof FORMAS_TAXA)[number]["id"];
export const MAX_FAIXAS = 10;
export const MAX_TAXAS = 50;
/** Tamanho máximo do nome da taxa (a Machine corta em 21 e tira emojis). */
export const MAX_NOME_TAXA = 21;
export const limparNomeTaxa = (n: string) => n.replace(/[\p{Extended_Pictographic}‍️]/gu, "").replace(/\s+/g, " ").trim().slice(0, MAX_NOME_TAXA).trim();

export interface FaixaTaxa { de: number; ate: number | null; tipo: "porcentagem" | "fixo"; valor: number }
export interface Taxa {
  id: string; nome: string; quemPaga: "motorista" | "passageiro"; categorias: string[]; pagamentos: FormaTaxa[]; faixas: FaixaTaxa[];
  /** Interruptor da lista (Machine): taxa desligada fica guardada, mas não cobra. Ausente = ligada. */
  ativa?: boolean;
  atualizadoPor: string; atualizadoEm: string;
}

const cent = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Quanto esta taxa cobra sobre o valor da corrida (faixa em que o valor cai; fora de todas as faixas = 0). Nunca passa do valor. */
export function valorDaTaxa(faixas: FaixaTaxa[], base: number): number {
  if (!Number.isFinite(base) || base <= 0) return 0;
  const f = faixas.find((x) => base >= x.de && (x.ate == null || base < x.ate));
  if (!f) return 0;
  const v = f.tipo === "porcentagem" ? (base * f.valor) / 100 : f.valor;
  return cent(Math.min(Math.max(v, 0), base));
}

/** Resumo para a lista: "10%", "R$ 1,30" ou "10% a 15%" quando as faixas diferem. */
export function resumoDaTaxa(faixas: FaixaTaxa[]): string {
  const t = (f: FaixaTaxa) => (f.tipo === "porcentagem" ? `${String(f.valor).replace(".", ",")}%` : `R$ ${f.valor.toFixed(2).replace(".", ",")}`);
  const u = [...new Set(faixas.map(t))];
  return u.length <= 1 ? (u[0] ?? "—") : `${u[0]} a ${u[u.length - 1]}`;
}

/** Simulador: o que o passageiro paga, o que o motorista recebe e o que fica para a central. */
export function simular(quemPaga: "motorista" | "passageiro", faixas: FaixaTaxa[], valorCorrida: number) {
  const taxa = valorDaTaxa(faixas, valorCorrida);
  return quemPaga === "passageiro"
    ? { passageiroPaga: cent(valorCorrida + taxa), motoristaRecebe: cent(valorCorrida), central: taxa }
    : { passageiroPaga: cent(valorCorrida), motoristaRecebe: cent(valorCorrida - taxa), central: taxa };
}
