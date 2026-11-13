// Config › Regras de Crédito (controle_creditos): parâmetros gerais do saldo do motorista e regras de comissão por faixa de valor.

import { centavos, gravarConfig, lerConfig, lista, novoId, numero, sim, texto, umDe } from "./armazem.ts";

export interface RegraComissao { id: string; nome: string; categoria: string; de: number; ate: number; tipo: "percentual" | "fixo"; valor: number }
export interface Credito {
  modelo: "regras" | "semanal"; saldoBloqueio: number; saldoAviso: number; permiteEditarValor: boolean; motoristaVeTaxas: boolean; regras: RegraComissao[];
}
export const CREDITO_PADRAO: Credito = { modelo: "regras", saldoBloqueio: -10, saldoAviso: -10, permiteEditarValor: false, motoristaVeTaxas: false, regras: [] };

export function sanearRegra(e: unknown): RegraComissao {
  const o = (e ?? {}) as Record<string, unknown>;
  const nome = texto(o.nome, 60), de = centavos(numero(o.de, 0, 0, 100_000)), ate = centavos(numero(o.ate, 0, 0, 100_000));
  if (!nome) throw new Error("Informe o nome da regra.");
  if (!(ate > de)) throw new Error('O valor "Até" precisa ser maior que "De".');
  const tipo = umDe(o.tipo, ["percentual", "fixo"] as const, "percentual");
  const valor = centavos(numero(o.valor, 0, 0, tipo === "percentual" ? 100 : 100_000));
  return { id: texto(o.id, 20) || novoId(), nome, categoria: texto(o.categoria, 60), de, ate, tipo, valor };
}

export function sanearCredito(e: unknown, atual: Credito = CREDITO_PADRAO): Credito {
  const o = { ...atual, ...((e ?? {}) as object) } as Record<string, unknown>;
  return {
    modelo: umDe(o.modelo, ["regras", "semanal"] as const, "regras"), saldoBloqueio: centavos(numero(o.saldoBloqueio, -10, -100_000, 100_000)),
    saldoAviso: centavos(numero(o.saldoAviso, -10, -100_000, 100_000)), permiteEditarValor: sim(o.permiteEditarValor), motoristaVeTaxas: sim(o.motoristaVeTaxas),
    regras: atual.regras,
  };
}

export const credito = (empresaId: string): Credito => {
  const c = lerConfig<Partial<Credito>>(empresaId, "credito", {});
  return { ...sanearCredito(c, CREDITO_PADRAO), regras: lista(c.regras).map((r) => { try { return sanearRegra(r); } catch { return null; } }).filter((r): r is RegraComissao => !!r) };
};
export function salvarCredito(empresaId: string, entrada: unknown): Credito {
  const c = sanearCredito(entrada, credito(empresaId));
  gravarConfig(empresaId, "credito", c);
  return c;
}
export function salvarRegraComissao(empresaId: string, entrada: unknown): Credito {
  const r = sanearRegra(entrada);
  const atual = credito(empresaId);
  const regras = atual.regras.some((x) => x.id === r.id) ? atual.regras.map((x) => (x.id === r.id ? r : x)) : [...atual.regras, r].slice(0, 200);
  gravarConfig(empresaId, "credito", { ...atual, regras });
  return credito(empresaId);
}
export function removerRegraComissao(empresaId: string, id: string): Credito {
  const atual = credito(empresaId);
  gravarConfig(empresaId, "credito", { ...atual, regras: atual.regras.filter((x) => x.id !== id) });
  return credito(empresaId);
}
