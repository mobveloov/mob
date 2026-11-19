// CRM › Configurações › Cidades: cidades atendidas para segmentar campanhas (tabela crm_cidades do sistema de referência).
// Sem centro informado, o centro vem da média dos embarques das corridas próprias naquela cidade.

import crypto from "node:crypto";
import { listarProprias } from "../corridas/index.ts";
import { normal } from "../servidor/util.ts";
import { bd } from "./base.ts";

export interface Cidade { id: string; name: string; state: string; lat: number | null; lng: number | null; radius_km: number; is_active: boolean; created_at: number }

const lin = (r: Record<string, unknown>): Cidade => ({ id: String(r.id), name: String(r.nome), state: String(r.estado), lat: r.lat as number | null, lng: r.lng as number | null, radius_km: Number(r.raio_km), is_active: r.ativa === 1, created_at: Number(r.criada_em) });

export function listarCidades(empresa: string): Cidade[] {
  return (bd().prepare("SELECT id, nome, estado, lat, lng, raio_km, ativa, criada_em FROM crm_cidades WHERE empresa = ? ORDER BY criada_em DESC, nome").all(empresa) as Array<Record<string, unknown>>).map(lin);
}

/** Centro aproximado: média dos embarques (com coordenada) das corridas daquela cidade. */
export function centroDasCorridas(empresa: string, cidade: string): { lat: number; lng: number } | null {
  const alvo = normal(cidade);
  let n = 0, lat = 0, lng = 0;
  for (const c of listarProprias(empresa)) {
    if (!c.embarque || typeof c.embarque.lat !== "number" || typeof c.embarque.lng !== "number") continue;
    const texto = normal(c.embarque.texto);
    if (!alvo || !texto.includes(alvo)) continue;
    n++; lat += c.embarque.lat; lng += c.embarque.lng;
  }
  return n ? { lat: Math.round((lat / n) * 100000) / 100000, lng: Math.round((lng / n) * 100000) / 100000 } : null;
}

const num = (v: unknown): number | null => { const n = typeof v === "string" ? parseFloat(v.replace(",", ".")) : Number(v); return v === "" || v == null || !Number.isFinite(n) ? null : n; };

export function lerCidade(empresa: string, corpo: Record<string, unknown>) {
  const nome = String(corpo.name ?? corpo.nome ?? "").trim().slice(0, 80);
  if (!nome) throw new Error("Informe o nome da cidade.");
  const estado = String(corpo.state ?? corpo.estado ?? "").trim().slice(0, 2).toUpperCase();
  let lat = num(corpo.lat), lng = num(corpo.lng);
  if (lat != null && (lat < -34 || lat > 6)) throw new Error("Latitude fora do Brasil.");
  if (lng != null && (lng < -74 || lng > -34)) throw new Error("Longitude fora do Brasil.");
  if (lat == null || lng == null) { const c = centroDasCorridas(empresa, nome); lat = c?.lat ?? null; lng = c?.lng ?? null; }
  const raio = num(corpo.radius_km ?? corpo.raio_km) ?? 15;
  return { nome, estado, lat, lng, raio: Math.min(100, Math.max(1, raio)) };
}

export function criarCidade(empresa: string, corpo: Record<string, unknown>): Cidade {
  const c = lerCidade(empresa, corpo);
  const id = crypto.randomUUID().slice(0, 8);
  const ja = (bd().prepare("SELECT nome, estado FROM crm_cidades WHERE empresa = ?").all(empresa) as Array<{ nome: string; estado: string }>).some((x) => normal(x.nome) === normal(c.nome) && x.estado === c.estado);
  if (ja) throw new Error("Esta cidade já está na lista.");
  bd().prepare("INSERT INTO crm_cidades (empresa, id, nome, estado, lat, lng, raio_km, ativa, criada_em) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)").run(empresa, id, c.nome, c.estado, c.lat, c.lng, c.raio, Date.now());
  return listarCidades(empresa).find((x) => x.id === id)!;
}

export function editarCidade(empresa: string, id: string, corpo: Record<string, unknown>): Cidade {
  if (!/^[\w-]{1,40}$/.test(id)) throw new Error("Cidade inválida.");
  const c = lerCidade(empresa, corpo);
  const r = bd().prepare("UPDATE crm_cidades SET nome = ?, estado = ?, lat = ?, lng = ?, raio_km = ? WHERE empresa = ? AND id = ?").run(c.nome, c.estado, c.lat, c.lng, c.raio, empresa, id);
  if (!Number(r.changes)) throw new Error("Cidade não encontrada.");
  return listarCidades(empresa).find((x) => x.id === id)!;
}

export function ligarCidade(empresa: string, id: string, ativa: boolean) {
  const r = bd().prepare("UPDATE crm_cidades SET ativa = ? WHERE empresa = ? AND id = ?").run(ativa ? 1 : 0, empresa, id);
  if (!Number(r.changes)) throw new Error("Cidade não encontrada.");
}

export function apagarCidade(empresa: string, id: string) {
  const r = bd().prepare("DELETE FROM crm_cidades WHERE empresa = ? AND id = ?").run(empresa, id);
  if (!Number(r.changes)) throw new Error("Cidade não encontrada.");
}
