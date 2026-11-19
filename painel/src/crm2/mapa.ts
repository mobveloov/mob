// CRM › Análises › Mapa de Calor (portado de crm_refresh_heatmap do sistema de referência).
// Conta embarques e desembarques por quadrado de 3 casas decimais (cerca de 110 m). Só corridas com coordenada
// dentro do Brasil entram (corridas antigas gravavam 0,0). Lê as corridas próprias do painel e as das integrações que informam coordenada.

import type { CorridaPainel } from "../comum/corrida.ts";
import { listarProprias } from "../corridas/index.ts";
import { bd, realDe } from "./base.ts";

export interface Celula { grid_lat: number; grid_lng: number; pickup_count: number; destination_count: number; last_ride_at: number | null }
interface Ponto { lat?: number; lng?: number }

const noBrasil = (lat: unknown, lng: unknown): lat is number => typeof lat === "number" && typeof lng === "number" && lat >= -34 && lat <= 6 && lng >= -74 && lng <= -34;
const casa = (n: number) => Math.round(n * 1000) / 1000;

/** Cálculo puro: corridas -> quadrados com embarques e desembarques. */
export function gradeDeCalor(corridas: Array<{ embarque?: Ponto; destino?: Ponto; solicitadaEm: string | null }>): Celula[] {
  const m = new Map<string, Celula>();
  const soma = (p: Ponto | undefined, tipo: "p" | "d", quando: number | null) => {
    if (!p || !noBrasil(p.lat, p.lng)) return;
    const lat = casa(p.lat), lng = casa(p.lng!);
    const k = `${lat}|${lng}`;
    const c = m.get(k) ?? { grid_lat: lat, grid_lng: lng, pickup_count: 0, destination_count: 0, last_ride_at: null };
    if (tipo === "p") c.pickup_count++; else c.destination_count++;
    if (quando != null && (c.last_ride_at == null || quando > c.last_ride_at)) c.last_ride_at = quando;
    m.set(k, c);
  };
  for (const c of corridas) {
    const q = realDe(c.solicitadaEm);
    soma(c.embarque, "p", q);
    soma(c.destino, "d", q);
  }
  return [...m.values()];
}

/** Corridas das integrações que trouxeram coordenada (as sem coordenada, só com texto de endereço, ficam de fora). */
export function deIntegracaoComPonto(corridas: CorridaPainel[]): Array<{ embarque?: Ponto; destino?: Ponto; solicitadaEm: string | null }> {
  return corridas.filter((c) => c.origem !== "propria" && (c.embarquePonto || c.destinoPonto)).map((c) => ({ embarque: c.embarquePonto, destino: c.destinoPonto, solicitadaEm: c.solicitadaEm }));
}

/** Recalcula o mapa da empresa (apaga o anterior e grava o novo). `integracao` = corridas das integrações (as com coordenada entram). Devolve quantos quadrados ficaram. */
export function atualizarMapa(empresa: string, integracao: CorridaPainel[] = []): number {
  const celulas = gradeDeCalor([...listarProprias(empresa), ...deIntegracaoComPonto(integracao)]);
  const db = bd();
  const agora = Date.now();
  db.exec("SAVEPOINT mapa");
  try {
    db.prepare("DELETE FROM crm_mapa WHERE empresa = ?").run(empresa);
    const ins = db.prepare("INSERT INTO crm_mapa (empresa, lat, lng, embarques, desembarques, ultima, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?)");
    for (const c of celulas) ins.run(empresa, c.grid_lat, c.grid_lng, c.pickup_count, c.destination_count, c.last_ride_at, agora);
    db.exec("RELEASE mapa");
  } catch (e) { db.exec("ROLLBACK TO mapa"); db.exec("RELEASE mapa"); throw e; }
  return celulas.length;
}

/** Até 5000 quadrados, os mais movimentados primeiro. */
export function lerMapa(empresa: string): Celula[] {
  return (bd().prepare("SELECT lat AS grid_lat, lng AS grid_lng, embarques AS pickup_count, desembarques AS destination_count, ultima AS last_ride_at FROM crm_mapa WHERE empresa = ? ORDER BY embarques DESC, lat, lng LIMIT 5000").all(empresa) as unknown as Celula[]);
}

export const mapaJaGerado = (empresa: string) => !!bd().prepare("SELECT 1 FROM crm_mapa WHERE empresa = ? LIMIT 1").get(empresa);
