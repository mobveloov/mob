// Config › Regras de Despacho e Transbordos. O despacho dos apps (apps/despacho.ts) lê daqui: método de distribuição, raio, tempo na
// tela do motorista, limite de motoristas por rodada, as etapas (disparos) e se motorista de outra cidade pode atender (transbordo).
// Nada do despacho é fixo no código: cada número vem destes campos. Em quantidade, raio e limite, 0 significa "sem limite".

import { cadastroPorId } from "../comum/cadastros.ts";
import { listar } from "../cadastros/armazem.ts";
import { listarProprias } from "../corridas/index.ts";
import { normal } from "../servidor/util.ts";
import { extraDaCategoria } from "./categorias.ts";
import { gravarConfig, lerConfig, numero, sim, umDe } from "./armazem.ts";

/**
 * Uma etapa (disparo) do despacho: o que a rodada de número N faz. As etapas são percorridas na ordem, uma por rodada; passadas todas,
 * a última se repete até acabarem as tentativas. Não há limite para a quantidade de etapas (cidades grandes adicionam quantas precisarem).
 * 0 em "quantidade", "raioKm" ou "tempo" significa: sem limite / o raio inicial da empresa / o tempo na tela da empresa.
 */
export interface Etapa {
  /** Motoristas que tocam ao mesmo tempo (método "primeiro a aceitar"). 0 = sem limite. */
  quantidade: number;
  /** Distância máxima do embarque nesta etapa (km). 0 = vale o Raio Inicial da empresa. */
  raioKm: number;
  /** Segundos que a chamada fica na tela nesta etapa. 0 = vale o Tempo na Tela da empresa. */
  tempo: number;
  /** Inclui motoristas secundários e reserva (senão, só os prioritários). */
  secundarios: boolean;
  /** Inclui motoristas de transbordo (outra cidade). Só vale se o transbordo da empresa estiver ligado. */
  transbordo: boolean;
}
/** Teto técnico só para proteger o armazenamento; na prática, sem limite. */
export const MAX_ETAPAS = 500;

export interface RegrasDespacho {
  metodo: "primeiro_aceitar" | "mais_proximo" | "fila_virtual";
  /** Raio inicial (m). 0 = sem limite de distância. */
  raioMetros: number; tempoTela: number;
  /** Máximo de motoristas chamados ao mesmo tempo numa rodada. 0 = sem limite. */
  limiteMotoristas: number;
  /** Etapas do despacho, na ordem (ao menos uma). */
  etapas: Etapa[];
  maxTentativas: number; tempoPendencia: number; notificarGrupo: "prioritario" | "todos";
  distanciaProxima: number; permitirProxima: boolean;
  /** Transbordo: motorista de outra cidade pode atender corridas desta cidade. */
  permitirTransbordo: boolean;
  /** Tempo em pendência (min) por filial. Filial que não está aqui herda `tempoPendencia` da empresa. */
  pendenciaFilial: Record<string, number>;
}

const umaEtapa = (quantidade: number): Etapa => ({ quantidade, raioKm: 0, tempo: 0, secundarios: true, transbordo: true });
/** Configuração antiga (Prioritários / Secundários / Reserva): vira três etapas, uma para cada ciclo, com a mesma quantidade. */
export const etapasDoFunil = (prioritarios: number, secundarios: number, reserva: number): Etapa[] => [umaEtapa(prioritarios), umaEtapa(secundarios), umaEtapa(reserva)];

export const DESPACHO_PADRAO: RegrasDespacho = {
  metodo: "mais_proximo", raioMetros: 20_000, tempoTela: 20, limiteMotoristas: 20, etapas: etapasDoFunil(20, 15, 10),
  maxTentativas: 4, tempoPendencia: 10, notificarGrupo: "prioritario", distanciaProxima: 500, permitirProxima: false, permitirTransbordo: true, pendenciaFilial: {},
};

const CHAVES_ANTIGAS = ["prioritarios", "secundarios", "reserva"] as const;

/** Lê a lista de etapas: a lista nova; senão a configuração antiga (3 campos); senão a atual. Sempre devolve ao menos uma etapa. */
function etapasDe(entrada: Record<string, unknown>, atual: Etapa[], leitura = false): Etapa[] {
  let brutas: unknown[];
  if (Array.isArray(entrada.etapas)) brutas = entrada.etapas;
  else if (CHAVES_ANTIGAS.some((k) => k in entrada) && !leitura) {
    // PUT antigo: só muda a quantidade das etapas correspondentes que já existem; nunca refaz a lista com o padrão.
    brutas = atual.map((x, i) => { const k = CHAVES_ANTIGAS[i]; return k && k in entrada ? { ...x, quantidade: Math.round(numero(entrada[k], x.quantidade, 0, 500)) } : x; });
  } else if (CHAVES_ANTIGAS.some((k) => k in entrada)) {
    const q = (k: (typeof CHAVES_ANTIGAS)[number], padrao: number) => Math.round(numero(entrada[k], padrao, 0, 500));
    brutas = etapasDoFunil(q("prioritarios", 20), q("secundarios", 15), q("reserva", 10));
  } else brutas = atual;
  const l = brutas.slice(0, MAX_ETAPAS).map((x): Etapa => {
    const d = (x ?? {}) as Record<string, unknown>;
    return {
      quantidade: Math.round(numero(d.quantidade, 0, 0, 500)), raioKm: Math.round(numero(d.raioKm, 0, 0, 1000) * 100) / 100, tempo: Math.round(numero(d.tempo, 0, 0, 120)),
      secundarios: sim(d.secundarios, true), transbordo: sim(d.transbordo, true),
    };
  });
  return l.length ? l : DESPACHO_PADRAO.etapas.map((x) => ({ ...x }));
}

export function sanearDespacho(e: unknown, atual: RegrasDespacho = DESPACHO_PADRAO, leitura = false): RegrasDespacho {
  const entrada = (e && typeof e === "object" && !Array.isArray(e) ? e : {}) as Record<string, unknown>;
  const o = { ...atual, ...entrada } as Record<string, unknown>;
  const n = (k: keyof RegrasDespacho, min: number, max: number) => Math.round(numero(o[k], DESPACHO_PADRAO[k] as number, min, max));
  const etapas = etapasDe(entrada, atual.etapas, leitura);
  return {
    metodo: umDe(o.metodo, ["primeiro_aceitar", "mais_proximo", "fila_virtual"] as const, "mais_proximo"),
    raioMetros: n("raioMetros", 0, 100_000), tempoTela: n("tempoTela", 5, 120), limiteMotoristas: n("limiteMotoristas", 0, 500),
    etapas,
    maxTentativas: n("maxTentativas", 1, MAX_ETAPAS), tempoPendencia: n("tempoPendencia", 0, 1440), notificarGrupo: umDe(o.notificarGrupo, ["prioritario", "todos"] as const, "prioritario"),
    distanciaProxima: n("distanciaProxima", 0, 500_000), permitirProxima: sim(o.permitirProxima), permitirTransbordo: sim(o.permitirTransbordo, true),
    pendenciaFilial: pendenciasPorFilial(o.pendenciaFilial),
  };
}

/** Rodadas feitas antes de a corrida ir para pendência: o "máx. tentativas" da empresa (ao salvar uma lista de etapas, ele sobe até o número de etapas, para todas serem percorridas). */
export const tentativasDoDespacho = (r: RegrasDespacho): number => r.maxTentativas;
/** Etapa da rodada de número `rodada` (a primeira é 0); passadas todas, vale a última. */
export const etapaDaRodada = (r: RegrasDespacho, rodada: number): Etapa => r.etapas[Math.min(Math.max(0, rodada), r.etapas.length - 1)];
/** Raio (km) que vale para a etapa: o dela, ou o inicial da empresa. Infinity = sem limite. */
export const raioDaEtapaKm = (r: RegrasDespacho, et: Etapa): number => et.raioKm > 0 ? et.raioKm : r.raioMetros > 0 ? r.raioMetros / 1000 : Infinity;
/** Segundos da chamada na tela do motorista nesta etapa. */
export const tempoDaEtapa = (r: RegrasDespacho, et: Etapa): number => et.tempo > 0 ? et.tempo : r.tempoTela;
/** Quantos motoristas tocam juntos na etapa: a quantidade da etapa limitada pelo limite da empresa (0 nos dois = sem limite: Infinity). */
export const quantidadeDaEtapa = (r: RegrasDespacho, et: Etapa): number => {
  const l = [et.quantidade, r.limiteMotoristas].filter((x) => x > 0);
  return l.length ? Math.min(...l) : Infinity;
};
/** Quantos carros recebem juntos numa corrida marcada "enviar mais de um carro": o limite de motoristas do Despacho (0 = todos). */
export const carrosSimultaneos = (r: RegrasDespacho): number => r.limiteMotoristas > 0 ? r.limiteMotoristas : Infinity;
/** Duração total das tentativas (ms): soma do tempo na tela de cada rodada (a última etapa se repete). Usada pelo vigia de pendência. */
export const duracaoDasTentativasMs = (r: RegrasDespacho): number => {
  let s = 0;
  for (let i = 0; i < tentativasDoDespacho(r); i++) s += tempoDaEtapa(r, etapaDaRodada(r, i)) * 1000;
  return s;
};

/** Só ids de filial (texto curto) com minutos entre 0 e 1440; o resto some. Máximo de 200 filiais. */
function pendenciasPorFilial(v: unknown): Record<string, number> {
  const saida: Record<string, number> = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return saida;
  for (const [id, min] of Object.entries(v as Record<string, unknown>).slice(0, 200)) {
    if (!id || id.length > 80 || id === "__proto__" || min === "" || min == null) continue;
    const m = Number(min);
    if (Number.isFinite(m)) saida[id] = Math.round(Math.min(1440, Math.max(0, m)));
  }
  return saida;
}

/** Tempo em pendência (min) que vale para a filial; sem filial, ou filial sem valor próprio, vale o da empresa. */
export const tempoPendenciaDaFilial = (r: RegrasDespacho, filialId?: string | null): number =>
  filialId && Object.prototype.hasOwnProperty.call(r.pendenciaFilial, filialId) ? r.pendenciaFilial[filialId] : r.tempoPendencia;
export const regrasDespacho = (empresaId: string): RegrasDespacho => sanearDespacho(lerConfig(empresaId, "despacho", {}), DESPACHO_PADRAO, true);
export function salvarDespacho(empresaId: string, entrada: unknown): RegrasDespacho {
  const r = sanearDespacho(entrada, regrasDespacho(empresaId));
  // Lista de etapas enviada: as tentativas nunca ficam abaixo do número de etapas (senão as últimas nunca rodariam).
  if (Array.isArray((entrada as { etapas?: unknown } | null)?.etapas)) r.maxTentativas = Math.max(r.maxTentativas, r.etapas.length);
  gravarConfig(empresaId, "despacho", r);
  return r;
}

/** O motorista é de outra cidade (transbordo) em relação à cidade da categoria? */
export function ehTransbordo(empresaId: string, cidadeMotorista: unknown, categoria: string): boolean {
  const base = normal(extraDaCategoria(empresaId, categoria).cidade), dele = normal(String(cidadeMotorista ?? ""));
  return !!base && !!dele && base !== dele;
}
/** O motorista (pela cidade do cadastro) pode atender esta categoria? Só barra se o transbordo estiver desligado e as cidades forem diferentes. */
export function transbordoPermitido(empresaId: string, cidadeMotorista: unknown, categoria: string): boolean {
  if (regrasDespacho(empresaId).permitirTransbordo) return true;
  return !ehTransbordo(empresaId, cidadeMotorista, categoria);
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
