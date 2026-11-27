// Config › Gerais › aba Despacho ("Alterando Bandeira" da Machine): parâmetros da central para pendências, reenvio, alertas,
// cerca eletrônica, corrida em espera, estimativa, tela de solicitação, área de operação controlada e os disparos por proximidade.
// Fica em config/bandeira.json. Quem já vale no sistema: área de operação controlada (bloqueia pedido fora dela) e os disparos.
// Os disparos (e a quantidade de tentativas) são as ETAPAS das Regras de Despacho (config/despacho.ts): uma só lista, gravada lá,
// que o despacho percorre na ordem. Aqui eles aparecem (e são gravados) no formato da Machine. Sem limite de etapas; 0 = sem limite.

import { gravarConfig, lerConfig, numero, sim, umDe } from "./armazem.ts";
import { regrasDespacho, salvarDespacho, type Etapa } from "./despacho.ts";

export const TIPOS_DESPACHO = ["proximidade", "apoio_proximidade", "area_proximidade"] as const;
export const UNIDADES_AUTORIZACAO = ["minutos", "horas", "dias"] as const;
export const ESTIMATIVAS = ["menor_tempo", "menor_trajeto"] as const;

/** Um disparo = uma etapa do despacho. motoristas 0 = sem limite; km 0 = o raio inicial; tempo 0 = o tempo na tela da empresa. */
export interface Disparo { motoristas: number; km: number; secundarios: boolean; transbordo: boolean; tempo: number }
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

const deEtapa = (e: Etapa): Disparo => ({ motoristas: e.quantidade, km: e.raioKm, secundarios: e.secundarios, transbordo: e.transbordo, tempo: e.tempo });
export const BANDEIRA_PADRAO: Bandeira = {
  expiracaoPendenciaMin: 20, distanciaListarKm: 5, distanciaPendenciaKm: 5, reenvioAutomatico: true, redistribuirAgendada: true, alertasOperadores: true, enviarNumeroPartida: true,
  autorizacaoCorporativa: { valor: 10, unidade: "minutos" }, obrigarProximidadeApp: false, cercaEletronica: false, corridaEmEspera: false, distanciaEsperaKm: 1,
  tipoEstimativa: "menor_tempo", observacaoObrigatoria: false, obrigaEnderecoDesejado: false, calcularEstimativa: true, areaControlada: "",
  tipoDespacho: "proximidade", eleicao: true, tentativas: 3, disparos: [],
};

export function sanearBandeira(e: unknown, atual: Bandeira = BANDEIRA_PADRAO): Bandeira {
  const o = { ...atual, ...((e ?? {}) as object) } as Record<string, any>;
  const n = (v: unknown, padrao: number, min: number, max: number) => Math.round(numero(v, padrao, min, max) * 100) / 100;
  const aut = (o.autorizacaoCorporativa ?? {}) as Record<string, unknown>;
  return {
    expiracaoPendenciaMin: Math.round(n(o.expiracaoPendenciaMin, 20, 1, 1440)), distanciaListarKm: n(o.distanciaListarKm, 5, 0, 500), distanciaPendenciaKm: n(o.distanciaPendenciaKm, 5, 0, 500),
    reenvioAutomatico: sim(o.reenvioAutomatico, true), redistribuirAgendada: sim(o.redistribuirAgendada, true), alertasOperadores: sim(o.alertasOperadores, true), enviarNumeroPartida: sim(o.enviarNumeroPartida, true),
    autorizacaoCorporativa: { valor: Math.round(n(aut.valor, 10, 1, 9999)), unidade: umDe(aut.unidade, UNIDADES_AUTORIZACAO, "minutos") },
    obrigarProximidadeApp: sim(o.obrigarProximidadeApp), cercaEletronica: sim(o.cercaEletronica), corridaEmEspera: sim(o.corridaEmEspera), distanciaEsperaKm: n(o.distanciaEsperaKm, 1, 0, 500),
    tipoEstimativa: umDe(o.tipoEstimativa, ESTIMATIVAS, "menor_tempo"), observacaoObrigatoria: sim(o.observacaoObrigatoria), obrigaEnderecoDesejado: sim(o.obrigaEnderecoDesejado), calcularEstimativa: sim(o.calcularEstimativa, true),
    areaControlada: typeof o.areaControlada === "string" ? o.areaControlada.slice(0, 80) : "",
    tipoDespacho: umDe(o.tipoDespacho, TIPOS_DESPACHO, "proximidade"), eleicao: sim(o.eleicao, true), tentativas: 0, disparos: [],
  };
}
/** Os disparos e a quantidade de tentativas vêm das etapas do despacho (não ficam repetidos em bandeira.json). */
const comDisparos = (b: Bandeira, empresaId: string): Bandeira => { const e = regrasDespacho(empresaId).etapas; return { ...b, tentativas: e.length, disparos: e.map(deEtapa) }; };
export const bandeira = (empresaId: string): Bandeira => comDisparos(sanearBandeira(lerConfig(empresaId, "bandeira", {}), BANDEIRA_PADRAO), empresaId);
export function salvarBandeira(empresaId: string, entrada: unknown, areasValidas: string[]): Bandeira {
  const b = sanearBandeira(entrada, bandeira(empresaId));
  if (b.areaControlada && !areasValidas.includes(b.areaControlada)) throw new Error("Escolha uma área que exista em Cadastro › Áreas.");
  // Lista de disparos enviada: vira a lista de etapas do despacho (sem limite de quantidade).
  const d = (entrada as { disparos?: unknown } | null)?.disparos;
  if (Array.isArray(d)) {
    const atuais = regrasDespacho(empresaId).etapas;
    salvarDespacho(empresaId, { etapas: d.map((x, i) => { const r = (x ?? {}) as Record<string, unknown>; return { ...(atuais[i] ?? {}), quantidade: r.motoristas, raioKm: r.km, tempo: r.tempo ?? atuais[i]?.tempo ?? 0, secundarios: r.secundarios, transbordo: r.transbordo }; }) });
  }
  gravarConfig(empresaId, "bandeira", { ...b, tentativas: 0, disparos: [] });
  return bandeira(empresaId);
}
