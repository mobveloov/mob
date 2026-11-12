// Config › Tarifas Dinâmicas: regras por área (polígono no mapa), por horário e por alta demanda. Cada categoria liga as que valem
// para ela (Categorias › Dinâmica). aplicarDinamica entra no preço estimado da corrida (corridas/index.ts › estimarPreco).

import { agoraBr } from "../servidor/util.ts";
import { extraDaCategoria } from "./categorias.ts";
import { centavos, gravarConfig, lerConfig, lista, novoId, numero, sim, texto, umDe } from "./armazem.ts";

export type TipoDinamica = "mapa" | "horario" | "demanda";
export interface JanelaDia { dia: number; inicio: string; fim: string }
export interface RegraDinamica {
  id: string; tipo: TipoDinamica; nome: string; cidade: string; ativa: boolean;
  /** "percentual" = acréscimo em % sobre o preço (20 = +20%); "fixo" = reais a mais. */
  cobranca: "percentual" | "fixo"; valor: number; minimo: number;
  poligono: Array<[number, number]>; janelas: JanelaDia[]; gatilho: number;
}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export function sanearDinamica(e: unknown, tipoPadrao?: TipoDinamica): RegraDinamica {
  const o = (e ?? {}) as Record<string, unknown>;
  const tipo = umDe(o.tipo ?? tipoPadrao, ["mapa", "horario", "demanda"] as const, "mapa");
  const nome = texto(o.nome, 60);
  if (!nome) throw new Error("Informe o nome da regra.");
  const cobranca = umDe(o.cobranca, ["percentual", "fixo"] as const, "percentual");
  const valor = centavos(numero(o.valor, 0, 0, cobranca === "percentual" ? 500 : 1000));
  if (!(valor > 0)) throw new Error("Informe o valor extra.");
  const poligono = lista(o.poligono).map((p) => (Array.isArray(p) ? [numero(p[0], NaN, -90, 90), numero(p[1], NaN, -180, 180)] : [NaN, NaN]) as [number, number]).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])).slice(0, 200);
  if (tipo === "mapa" && poligono.length < 3) throw new Error("Desenhe a área no mapa (no mínimo 3 pontos).");
  const janelas = lista(o.janelas).map((j) => { const x = (j ?? {}) as Record<string, unknown>; return { dia: Math.round(numero(x.dia, 0, 0, 6)), inicio: String(x.inicio ?? ""), fim: String(x.fim ?? "") }; }).filter((j) => HORA.test(j.inicio) && HORA.test(j.fim)).slice(0, 70);
  if (tipo === "horario" && !janelas.length) throw new Error("Configure ao menos um dia e horário.");
  return {
    id: texto(o.id, 20) || novoId(), tipo, nome, cidade: texto(o.cidade, 80), ativa: sim(o.ativa, true), cobranca, valor, minimo: centavos(numero(o.minimo, 0, 0, 1000)),
    poligono: tipo === "mapa" ? poligono : [], janelas: tipo === "horario" ? janelas : [], gatilho: tipo === "demanda" ? Math.round(numero(o.gatilho, 10, 1, 10_000)) : 0,
  };
}

export const dinamicas = (empresaId: string): RegraDinamica[] =>
  lista(lerConfig<unknown[]>(empresaId, "dinamicas", [])).map((r) => { try { return sanearDinamica(r); } catch { return null; } }).filter((r): r is RegraDinamica => !!r);

export function salvarDinamica(empresaId: string, entrada: unknown): RegraDinamica[] {
  const r = sanearDinamica(entrada);
  const l = dinamicas(empresaId);
  gravarConfig(empresaId, "dinamicas", l.some((x) => x.id === r.id) ? l.map((x) => (x.id === r.id ? r : x)) : [...l, r].slice(0, 300));
  return dinamicas(empresaId);
}
export function removerDinamica(empresaId: string, id: string): RegraDinamica[] {
  gravarConfig(empresaId, "dinamicas", dinamicas(empresaId).filter((x) => x.id !== id));
  return dinamicas(empresaId);
}
export function ativarDinamica(empresaId: string, id: string, ativa: boolean): RegraDinamica[] {
  gravarConfig(empresaId, "dinamicas", dinamicas(empresaId).map((x) => (x.id === id ? { ...x, ativa } : x)));
  return dinamicas(empresaId);
}

/** Ponto dentro do polígono (lat, lng). */
export function dentroDoPoligono(lat: number, lng: number, poly: Array<[number, number]>): boolean {
  let dentro = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i], [yj, xj] = poly[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

const minutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3));
function noHorario(r: RegraDinamica, quando: Date): boolean {
  const dia = quando.getUTCDay(), min = quando.getUTCHours() * 60 + quando.getUTCMinutes();
  return r.janelas.some((j) => {
    const a = minutos(j.inicio), b = minutos(j.fim);
    if (a <= b) return j.dia === dia && min >= a && min <= b;
    // vira a meia-noite: de a até 24h no dia, e de 0 até b no dia seguinte
    return (j.dia === dia && min >= a) || ((j.dia + 1) % 7 === dia && min <= b);
  });
}

export interface EntradaDinamica { categoria: string; valor: number; embarque?: { lat?: number; lng?: number }; demanda?: number; quando?: Date }
/** Soma o acréscimo das regras ligadas à categoria que valem agora, ali e com esta demanda. */
export function aplicarDinamica(empresaId: string, e: EntradaDinamica): { valor: number; adicional: number; regras: string[] } {
  const ids = new Set(extraDaCategoria(empresaId, e.categoria).dinamicas);
  if (!ids.size || !(e.valor > 0)) return { valor: e.valor, adicional: 0, regras: [] };
  const quando = e.quando ?? agoraBr();
  let adicional = 0;
  const usadas: string[] = [];
  for (const r of dinamicas(empresaId)) {
    if (!r.ativa || !ids.has(r.id)) continue;
    const vale = r.tipo === "horario" ? noHorario(r, quando)
      : r.tipo === "mapa" ? e.embarque?.lat != null && e.embarque.lng != null && dentroDoPoligono(e.embarque.lat, e.embarque.lng, r.poligono)
      : (e.demanda ?? 0) > r.gatilho;
    if (!vale) continue;
    adicional += Math.max(r.cobranca === "percentual" ? (e.valor * r.valor) / 100 : r.valor, r.minimo);
    usadas.push(r.nome);
  }
  adicional = centavos(adicional);
  return { valor: centavos(e.valor + adicional), adicional, regras: usadas };
}
