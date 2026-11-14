// Regras de Áreas valem no despacho e na solicitação (sempre por empresa):
//
// - Área de risco/bloqueio: impede solicitações de corrida com embarque dentro dela. Pode ter horários de
//   ativação programada; sem horário, o bloqueio é contínuo. Horários em Brasília (agoraBr).
// - Prioridade (1 a 5, maior vence): quando as áreas se sobrepõem, vale a de maior prioridade. No despacho,
//   motorista que está dentro da mesma área do embarque passa na frente dos de fora (depois do nível).
//
// Este módulo só lê o armazém da gestão (não importa o despacho nem as corridas), para poder ser usado por ambos.

import { lerG } from "../gestao/armazem.ts";
import { agoraBr } from "../servidor/util.ts";

export type Ponto = [number, number];
export interface HorarioBloqueio { de: string; ate: string }
export interface Bloqueio { ativo: boolean; horarios: HorarioBloqueio[] }
export interface AreaRegra { id: string; nome: string; poligono: Ponto[]; prioridade?: number; cor?: string; bloqueio?: Bloqueio }

export const CORES_AREA: Record<string, string> = {
  Vermelho: "#ef4444", Amarelo: "#eab308", Azul: "#3b82f6", Verde: "#22c55e", Laranja: "#f97316", Roxo: "#a855f7", Rosa: "#ec4899", Cinza: "#6b7280",
};
export const PRIORIDADE_MIN = 1, PRIORIDADE_MAX = 5;

/** Ponto dentro do polígono (raio cruzando as arestas). */
export function dentroDe(lat: number, lng: number, pol: Ponto[]): boolean {
  if (pol.length < 3) return false;
  let d = false;
  for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
    const [yi, xi] = pol[i], [yj, xj] = pol[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) d = !d;
  }
  return d;
}

const minutos = (hhmm: string) => { const m = /^(\d{2}):(\d{2})$/.exec(hhmm); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

/** "HH:MM" válido (00:00 a 23:59) ou erro. */
export function horaValida(v: unknown, rotulo = "Hora"): string {
  const s = String(v ?? "").trim();
  const m = minutos(s);
  if (m == null || m >= 24 * 60) throw new Error(`${rotulo} inválida (use HH:MM).`);
  return s;
}

/** O bloqueio da área vale neste instante? Sem horários = contínuo; faixa que cruza a meia-noite (22:00 a 06:00) é aceita. */
export function bloqueioVale(a: AreaRegra, quando: Date = agoraBr()): boolean {
  const b = a.bloqueio;
  if (!b?.ativo) return false;
  if (!b.horarios?.length) return true;
  const agora = quando.getUTCHours() * 60 + quando.getUTCMinutes();
  return b.horarios.some((h) => {
    const de = minutos(h.de), ate = minutos(h.ate);
    if (de == null || ate == null) return false;
    return de <= ate ? agora >= de && agora <= ate : agora >= de || agora <= ate;
  });
}

export const areasDaEmpresa = (empresaId: string) => lerG<AreaRegra[]>(empresaId, "areas", []);
export const prioridadeDe = (a: AreaRegra) => Math.min(PRIORIDADE_MAX, Math.max(PRIORIDADE_MIN, Math.round(Number(a.prioridade) || PRIORIDADE_MIN)));

/** Foto das áreas para consultas em lote (uma rodada do despacho, por exemplo). */
export function fotoDeAreas(empresaId: string) {
  const todas = areasDaEmpresa(empresaId).filter((a) => a.poligono?.length >= 3);
  const bloqueios = todas.filter((a) => a.bloqueio?.ativo);
  const comuns = todas.filter((a) => !a.bloqueio?.ativo).sort((a, b) => prioridadeDe(b) - prioridadeDe(a));
  return {
    temAreas: todas.length > 0,
    /** Área de bloqueio em vigor neste ponto (e instante), se houver. */
    bloqueando(lat: number | null | undefined, lng: number | null | undefined, quando?: Date): AreaRegra | null {
      if (lat == null || lng == null) return null;
      return bloqueios.find((a) => bloqueioVale(a, quando) && dentroDe(lat, lng, a.poligono)) ?? null;
    },
    /** Área (não bloqueio) de maior prioridade que contém o ponto. */
    principal(lat: number | null | undefined, lng: number | null | undefined): AreaRegra | null {
      if (lat == null || lng == null) return null;
      return comuns.find((a) => dentroDe(lat, lng, a.poligono)) ?? null;
    },
  };
}

/** Mensagem para quem tenta pedir corrida dentro de uma área de bloqueio (null = pode pedir). */
export function motivoDeBloqueio(empresaId: string, ponto: { lat?: number | null; lng?: number | null } | undefined, quando?: Date): string | null {
  if (!ponto) return null;
  const a = fotoDeAreas(empresaId).bloqueando(ponto.lat, ponto.lng, quando);
  return a ? `Não atendemos este local no momento (área de bloqueio: ${a.nome}).` : null;
}

// ------------------------------------------------------------------ validação do que o admin grava na área

export function limparPrioridade(v: unknown): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < PRIORIDADE_MIN || n > PRIORIDADE_MAX) throw new Error(`Prioridade deve ser de ${PRIORIDADE_MIN} a ${PRIORIDADE_MAX}.`);
  return n;
}

export function limparCor(v: unknown): string {
  const s = String(v ?? "").trim();
  return CORES_AREA[s] ? s : "Laranja";
}

/** Bloqueio: ativo + até 8 horários (de/ate em HH:MM). Área de bloqueio precisa de perímetro desenhado. */
export function limparBloqueio(v: unknown, poligono: Ponto[]): Bloqueio {
  const o = (v && typeof v === "object" ? v : {}) as { ativo?: unknown; horarios?: unknown };
  const ativo = o.ativo === true;
  const lista = Array.isArray(o.horarios) ? o.horarios : [];
  if (lista.length > 8) throw new Error("No máximo 8 horários de bloqueio.");
  const horarios = lista.map((h) => {
    const x = (h ?? {}) as { de?: unknown; ate?: unknown };
    return { de: horaValida(x.de, "Hora inicial do bloqueio"), ate: horaValida(x.ate, "Hora final do bloqueio") };
  });
  if (ativo && poligono.length < 3) throw new Error("Desenhe o perímetro da área antes de ativar o bloqueio.");
  return { ativo, horarios };
}
