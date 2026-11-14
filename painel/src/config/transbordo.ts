// Config › Transbordos (Machine): "Envia corridas para" e "Recebe corridas de" com as centrais parceiras (a principal e as associadas
// da rede). Para cada uma: repassa corridas de pessoa física (PF) e jurídica (PJ), exibe pendentes e exibe programadas.
// Fica em config/transbordo.json; só vale entre centrais da mesma rede (centrais/rede.ts). Nada aqui lê dados de outra empresa:
// só o nome das centrais da própria rede.

import { associadasDe, principalDe } from "../centrais/rede.ts";
import { empresa } from "../servidor/dados.ts";
import { gravarConfig, lerConfig, sim } from "./armazem.ts";

export const COLUNAS_TRANSBORDO = ["pf", "pj", "pendentes", "programadas"] as const;
export type ColunaTransbordo = (typeof COLUNAS_TRANSBORDO)[number];
export type LinhaTransbordo = Record<ColunaTransbordo, boolean>;
export interface Parceira { id: string; nome: string; envia: LinhaTransbordo; recebe: LinhaTransbordo }

const padrao = (): LinhaTransbordo => ({ pf: true, pj: true, pendentes: true, programadas: true });
type Guardado = Record<string, { envia?: Partial<LinhaTransbordo>; recebe?: Partial<LinhaTransbordo> }>;

const lerLinha = (e: unknown): LinhaTransbordo => {
  const o = (e ?? {}) as Record<string, unknown>;
  return { pf: sim(o.pf, true), pj: sim(o.pj, true), pendentes: sim(o.pendentes, true), programadas: sim(o.programadas, true) };
};

/** Centrais parceiras (principal e associadas) com as marcações de envio e de recebimento. */
export function transbordoDasParceiras(empresaId: string): Parceira[] {
  const guardado = lerConfig<Guardado>(empresaId, "transbordo", {});
  const ids = [principalDe(empresaId), ...associadasDe(empresaId)].filter((x): x is string => !!x);
  return ids.map((id) => ({ id, nome: empresa(id)?.nome ?? "Central", envia: lerLinha(guardado[id]?.envia ?? padrao()), recebe: lerLinha(guardado[id]?.recebe ?? padrao()) }));
}

export function salvarTransbordo(empresaId: string, entrada: unknown): Parceira[] {
  const validas = new Set(transbordoDasParceiras(empresaId).map((p) => p.id));
  const lista = Array.isArray((entrada as { parceiras?: unknown })?.parceiras) ? ((entrada as { parceiras: Array<Record<string, unknown>> }).parceiras) : [];
  const novo: Guardado = {};
  for (const p of lista) {
    const id = String(p?.id ?? "");
    if (!validas.has(id)) throw new Error("Central parceira não encontrada.");
    novo[id] = { envia: lerLinha(p.envia), recebe: lerLinha(p.recebe) };
  }
  const atual = lerConfig<Guardado>(empresaId, "transbordo", {});
  gravarConfig(empresaId, "transbordo", { ...atual, ...novo });
  return transbordoDasParceiras(empresaId);
}
