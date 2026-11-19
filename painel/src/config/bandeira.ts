// Config › Gerais › aba Despacho ("Alterando Bandeira" da Machine): parâmetros da central para pendências, reenvio, alertas,
// cerca eletrônica, corrida em espera, estimativa, tela de solicitação, área de operação controlada e os disparos por proximidade.
// Fica em config/bandeira.json. Quem já vale no sistema: área de operação controlada (bloqueia pedido fora dela). O resto fica
// gravado e aparece nas telas; o despacho ainda usa as Regras de Despacho (config/despacho.ts) para montar as rodadas.

import { gravarConfig, lerConfig, lista, numero, sim, umDe } from "./armazem.ts";

export const TIPOS_DESPACHO = ["proximidade", "apoio_proximidade", "area_proximidade"] as const;
export const UNIDADES_AUTORIZACAO = ["minutos", "horas", "dias"] as const;
export const ESTIMATIVAS = ["menor_tempo", "menor_trajeto"] as const;
export const MAX_DISPAROS = 6;

export interface Disparo { motoristas: number; km: number; secundarios: boolean; transbordo: boolean }
export interface Bandeira {
  expiracaoPendenciaMin: number; distanciaListarKm: number; distanciaPendenciaKm: number;
  reenvioAutomatico: boolean; redistribuirAgendada: boolean; alertasOperadores: boolean; enviarNumeroPartida: boolean;
  autorizacaoCorporativa: { valor: number; unidade: (typeof UNIDADES_AUTORIZACAO)[number] };
  obrigarProximidadeApp: boolean; cercaEletronica: boolean; corridaEmEspera: boolean; distanciaEsperaKm: number;
  tipoEstimativa: (typeof ESTIMATIVAS)[number];
  observacaoObrigatoria: boolean; obrigaEnderecoDesejado: boolean; calcularEstimativa: boolean;
  /** Id da área (Cadastro › Áreas) onde os passageiros podem pedir corrida; vazio = sem limite. */
  areaControlada: string;
  tipoDespacho: (typeof TIPOS_DESPACHO)[number]; eleicao: boolean; tentativas: number; disparos: Disparo[];
}

const DISPAROS_PADRAO: Disparo[] = [
  { motoristas: 2, km: 1, secundarios: true, transbordo: true }, { motoristas: 3, km: 3, secundarios: true, transbordo: true },
  { motoristas: 6, km: 5, secundarios: true, transbordo: true }, { motoristas: 6, km: 6, secundarios: true, transbordo: true },
  { motoristas: 6, km: 7, secundarios: true, transbordo: true }, { motoristas: 6, km: 8, secundarios: true, transbordo: true },
];
export const BANDEIRA_PADRAO: Bandeira = {
  expiracaoPendenciaMin: 20, distanciaListarKm: 5, distanciaPendenciaKm: 5, reenvioAutomatico: true, redistribuirAgendada: true, alertasOperadores: true, enviarNumeroPartida: true,
  autorizacaoCorporativa: { valor: 10, unidade: "minutos" }, obrigarProximidadeApp: false, cercaEletronica: false, corridaEmEspera: false, distanciaEsperaKm: 1,
  tipoEstimativa: "menor_tempo", observacaoObrigatoria: false, obrigaEnderecoDesejado: false, calcularEstimativa: true, areaControlada: "",
  tipoDespacho: "proximidade", eleicao: true, tentativas: 3, disparos: DISPAROS_PADRAO,
};

export function sanearBandeira(e: unknown, atual: Bandeira = BANDEIRA_PADRAO): Bandeira {
  const o = { ...atual, ...((e ?? {}) as object) } as Record<string, any>;
  const n = (v: unknown, padrao: number, min: number, max: number) => Math.round(numero(v, padrao, min, max) * 100) / 100;
  const tentativas = Math.round(n(o.tentativas, 3, 1, MAX_DISPAROS));
  const brutos = lista(o.disparos).map((d) => (d ?? {}) as Record<string, unknown>);
  // Sempre 6 linhas guardadas (as que passam da quantidade de tentativas só não aparecem). Máximos da Machine: 20 motoristas e 50 km.
  const disparos = DISPAROS_PADRAO.map((p, i) => {
    const d = brutos[i] ?? {};
    return { motoristas: Math.round(n(d.motoristas, p.motoristas, 1, 20)), km: n(d.km, p.km, 0.1, 50), secundarios: sim(d.secundarios, p.secundarios), transbordo: sim(d.transbordo, p.transbordo) };
  });
  const aut = (o.autorizacaoCorporativa ?? {}) as Record<string, unknown>;
  return {
    expiracaoPendenciaMin: Math.round(n(o.expiracaoPendenciaMin, 20, 1, 1440)), distanciaListarKm: n(o.distanciaListarKm, 5, 0, 500), distanciaPendenciaKm: n(o.distanciaPendenciaKm, 5, 0, 500),
    reenvioAutomatico: sim(o.reenvioAutomatico, true), redistribuirAgendada: sim(o.redistribuirAgendada, true), alertasOperadores: sim(o.alertasOperadores, true), enviarNumeroPartida: sim(o.enviarNumeroPartida, true),
    autorizacaoCorporativa: { valor: Math.round(n(aut.valor, 10, 1, 9999)), unidade: umDe(aut.unidade, UNIDADES_AUTORIZACAO, "minutos") },
    obrigarProximidadeApp: sim(o.obrigarProximidadeApp), cercaEletronica: sim(o.cercaEletronica), corridaEmEspera: sim(o.corridaEmEspera), distanciaEsperaKm: n(o.distanciaEsperaKm, 1, 0, 500),
    tipoEstimativa: umDe(o.tipoEstimativa, ESTIMATIVAS, "menor_tempo"), observacaoObrigatoria: sim(o.observacaoObrigatoria), obrigaEnderecoDesejado: sim(o.obrigaEnderecoDesejado), calcularEstimativa: sim(o.calcularEstimativa, true),
    areaControlada: typeof o.areaControlada === "string" ? o.areaControlada.slice(0, 80) : "",
    tipoDespacho: umDe(o.tipoDespacho, TIPOS_DESPACHO, "proximidade"), eleicao: sim(o.eleicao, true), tentativas, disparos,
  };
}
export const bandeira = (empresaId: string): Bandeira => sanearBandeira(lerConfig(empresaId, "bandeira", {}), BANDEIRA_PADRAO);
export function salvarBandeira(empresaId: string, entrada: unknown, areasValidas: string[]): Bandeira {
  const b = sanearBandeira(entrada, bandeira(empresaId));
  if (b.areaControlada && !areasValidas.includes(b.areaControlada)) throw new Error("Escolha uma área que exista em Cadastro › Áreas.");
  gravarConfig(empresaId, "bandeira", b);
  return b;
}
