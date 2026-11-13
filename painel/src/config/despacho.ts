// Config › Regras de Despacho e Transbordos. O despacho dos apps (apps/despacho.ts) lê daqui: método de distribuição, raio, tempo na
// tela do motorista, limite de motoristas por rodada e se motorista de outra cidade pode atender (transbordo).

import { cadastroPorId } from "../comum/cadastros.ts";
import { listar } from "../cadastros/armazem.ts";
import { listarProprias } from "../corridas/index.ts";
import { normal } from "../servidor/util.ts";
import { extraDaCategoria } from "./categorias.ts";
import { gravarConfig, lerConfig, numero, sim, umDe } from "./armazem.ts";

export interface RegrasDespacho {
  metodo: "primeiro_aceitar" | "mais_proximo" | "fila_virtual";
  raioMetros: number; tempoTela: number; limiteMotoristas: number;
  prioritarios: number; secundarios: number; reserva: number;
  maxTentativas: number; tempoPendencia: number; notificarGrupo: "prioritario" | "todos";
  distanciaProxima: number; permitirProxima: boolean;
  /** Transbordo: motorista de outra cidade pode atender corridas desta cidade. */
  permitirTransbordo: boolean;
}
export const DESPACHO_PADRAO: RegrasDespacho = {
  metodo: "mais_proximo", raioMetros: 20_000, tempoTela: 20, limiteMotoristas: 20, prioritarios: 20, secundarios: 15, reserva: 10,
  maxTentativas: 4, tempoPendencia: 1, notificarGrupo: "prioritario", distanciaProxima: 500, permitirProxima: false, permitirTransbordo: true,
};

export function sanearDespacho(e: unknown, atual: RegrasDespacho = DESPACHO_PADRAO): RegrasDespacho {
  const o = { ...atual, ...((e ?? {}) as object) } as Record<string, unknown>;
  const n = (k: keyof RegrasDespacho, min: number, max: number) => Math.round(numero(o[k], DESPACHO_PADRAO[k] as number, min, max));
  return {
    metodo: umDe(o.metodo, ["primeiro_aceitar", "mais_proximo", "fila_virtual"] as const, "mais_proximo"),
    raioMetros: n("raioMetros", 100, 100_000), tempoTela: n("tempoTela", 5, 120), limiteMotoristas: n("limiteMotoristas", 1, 500),
    prioritarios: n("prioritarios", 0, 500), secundarios: n("secundarios", 0, 500), reserva: n("reserva", 0, 500),
    maxTentativas: n("maxTentativas", 1, 50), tempoPendencia: n("tempoPendencia", 0, 1440), notificarGrupo: umDe(o.notificarGrupo, ["prioritario", "todos"] as const, "prioritario"),
    distanciaProxima: n("distanciaProxima", 0, 500_000), permitirProxima: sim(o.permitirProxima), permitirTransbordo: sim(o.permitirTransbordo, true),
  };
}
export const regrasDespacho = (empresaId: string): RegrasDespacho => sanearDespacho(lerConfig(empresaId, "despacho", {}), DESPACHO_PADRAO);
export function salvarDespacho(empresaId: string, entrada: unknown): RegrasDespacho {
  const r = sanearDespacho(entrada, regrasDespacho(empresaId));
  gravarConfig(empresaId, "despacho", r);
  return r;
}

/** O motorista (pela cidade do cadastro) pode atender esta categoria? Só barra se o transbordo estiver desligado e as cidades forem diferentes. */
export function transbordoPermitido(empresaId: string, cidadeMotorista: unknown, categoria: string): boolean {
  if (regrasDespacho(empresaId).permitirTransbordo) return true;
  const base = normal(extraDaCategoria(empresaId, categoria).cidade), dele = normal(String(cidadeMotorista ?? ""));
  return !base || !dele || base === dele;
}

/** Corridas feitas por motorista de outra cidade (relatório Transbordos). */
export function transbordos(empresaId: string, inicio: string, fim: string, cidadeMotorista = "") {
  const mot = new Map(listar(empresaId, cadastroPorId("motoristas")!).map((m) => [m.id, m]));
  const linhas = listarProprias(empresaId).filter((c) => c.motoristaId && c.status === "finalizada" && c.solicitadaEm.slice(0, 10) >= inicio && c.solicitadaEm.slice(0, 10) <= fim).flatMap((c) => {
    const base = String(extraDaCategoria(empresaId, c.categoria).cidade || ""), m = mot.get(c.motoristaId!), dele = String(m?.cidade ?? "");
    if (!base || !dele || normal(base) === normal(dele)) return [];
    if (cidadeMotorista && normal(cidadeMotorista) !== normal(dele)) return [];
    return [{ os: c.os, em: c.solicitadaEm, motorista: c.motorista, cidadeMotorista: dele, cidadeCorrida: base, categoria: c.categoria, valor: c.valor }];
  });
  return linhas.sort((a, b) => b.em.localeCompare(a.em));
}
