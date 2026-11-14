// Config › Descontos, matriz por forma de pagamento (formato da Machine).
// Para cada forma de pagamento: desconto pelo site, pelo aplicativo #1 a #4 e o desconto máximo da empresa (todos em %).
// Zero em qualquer campo significa "Nenhum". Os descontos por campanha (descontos.ts) continuam valendo em separado.

import { centavos, gravarConfig, lerConfig, numero } from "./armazem.ts";

export const FORMAS_DESCONTO = [
  { id: "dinheiro", nome: "Dinheiro" }, { id: "debito", nome: "Cartão de débito" }, { id: "credito", nome: "Cartão de crédito" },
  { id: "cartao_app", nome: "Cartão no app" }, { id: "pix", nome: "Pix" },
] as const;
export type FormaDesconto = (typeof FORMAS_DESCONTO)[number]["id"];
export const CANAIS_DESCONTO = ["site", "app1", "app2", "app3", "app4"] as const;
export type CanalDesconto = (typeof CANAIS_DESCONTO)[number];
export type LinhaMatriz = Record<CanalDesconto, number> & { maximo: number };
export type MatrizDescontos = Record<FormaDesconto, LinhaMatriz>;

const linhaVazia = (): LinhaMatriz => ({ site: 0, app1: 0, app2: 0, app3: 0, app4: 0, maximo: 0 });
export const matrizVazia = (): MatrizDescontos => Object.fromEntries(FORMAS_DESCONTO.map((f) => [f.id, linhaVazia()])) as MatrizDescontos;

/** Valida a matriz inteira. Com `estrito` (gravação) recusa percentual fora de 0 a 100 e acima do máximo da empresa. */
export function sanearMatriz(e: unknown, estrito = false): MatrizDescontos {
  const o = (e ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const m = matrizVazia();
  for (const f of FORMAS_DESCONTO) {
    const l = o[f.id] ?? {}, linha = m[f.id];
    const pct = (v: unknown, rotulo: string) => {
      const n = numero(v, 0, -1e9, 1e9);
      if (n < 0 || n > 100) {
        if (estrito) throw new Error(`${f.nome}: ${rotulo} deve ficar entre 0% e 100%.`);
        return Math.min(100, Math.max(0, n));
      }
      return centavos(n);
    };
    linha.maximo = pct(l.maximo, "o desconto máximo");
    for (const c of CANAIS_DESCONTO) {
      linha[c] = pct(l[c], c === "site" ? "o desconto pelo site" : `o desconto pelo app #${c.slice(3)}`);
      if (estrito && linha.maximo > 0 && linha[c] > linha.maximo) throw new Error(`${f.nome}: o desconto (${linha[c]}%) passa do máximo da empresa (${linha.maximo}%).`);
    }
  }
  return m;
}
export const matrizDescontos = (empresaId: string): MatrizDescontos => sanearMatriz(lerConfig(empresaId, "descontos-matriz", {}));
export function salvarMatriz(empresaId: string, entrada: unknown): MatrizDescontos {
  const m = sanearMatriz(entrada, true);
  gravarConfig(empresaId, "descontos-matriz", m);
  return m;
}
/** Percentual da matriz para a forma de pagamento e o canal (site ou app #1 a #4), já limitado ao máximo da empresa. */
export function percentualDaMatriz(empresaId: string, forma: FormaDesconto, canal: CanalDesconto): number {
  const l = matrizDescontos(empresaId)[forma];
  if (!l) return 0;
  return l.maximo > 0 ? Math.min(l[canal], l.maximo) : l[canal];
}
