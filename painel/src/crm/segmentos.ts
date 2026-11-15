// CRM › Público › Segmentos (portado de crm_segmentos do sistema de referência): listas dinâmicas sobre a base de contatos
// (aba Contatos). As regras são recalculadas a cada contagem. "Segmentos Prontos" cria os 8 modelos do sistema de referência.

import crypto from "node:crypto";
import { banco } from "../servidor/banco.ts";
import { bd } from "../crm2/base.ts";
import { normal } from "../servidor/util.ts";

export interface RegrasSegmento {
  stage?: string | string[]; total_rides_min?: number; total_rides_max?: number; cancelations_min?: number; simulations_min?: number; total_spent_min?: number;
  has_tag?: string; rfm_segment?: string; inactive_days_min?: number; inactive_days_max?: number; city?: string; opt_in_only?: boolean; birthday_week?: boolean;
}
export interface Segmento {
  id: string; name: string; description: string | null; rules: RegrasSegmento; is_dynamic: boolean; is_preset: boolean; estimated_count: number; created_at: string; updated_at: string;
}

const ler = (r: unknown) => JSON.parse((r as { dados: string }).dados) as Segmento;
export const segmentos = (e: string): Segmento[] => (banco().prepare("SELECT dados FROM crm_segmentos WHERE empresa = ? ORDER BY seq DESC").all(e) as unknown[]).map(ler);
export const segmento = (e: string, id: string): Segmento | null => { const r = banco().prepare("SELECT dados FROM crm_segmentos WHERE empresa = ? AND id = ?").get(e, id); return r ? ler(r) : null; };

const ESTAGIOS = ["novo", "ativo", "fiel", "em_risco", "inativo", "perdido"];
const num = (v: unknown) => (v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) ? undefined : Number(v));

/** Só guarda regras conhecidas. Mensagens de erro iguais às do sistema de referência. */
export function sanearRegrasSegmento(r: Record<string, unknown>): RegrasSegmento {
  const o: RegrasSegmento = {};
  const st = Array.isArray(r.stage) ? (r.stage as unknown[]).map(String).filter((x) => ESTAGIOS.includes(x)) : ESTAGIOS.includes(String(r.stage)) ? String(r.stage) : undefined;
  if (st && (!Array.isArray(st) || st.length)) o.stage = st;
  for (const k of ["total_rides_min", "total_rides_max", "cancelations_min", "simulations_min", "total_spent_min", "inactive_days_min", "inactive_days_max"] as const) { const n = num(r[k]); if (n !== undefined && n >= 0) o[k] = n; }
  if (String(r.has_tag ?? "").trim()) o.has_tag = String(r.has_tag).trim().slice(0, 40);
  if (String(r.rfm_segment ?? "").trim()) o.rfm_segment = String(r.rfm_segment).trim().slice(0, 40);
  if (String(r.city ?? "").trim()) o.city = String(r.city).trim().slice(0, 80);
  if (r.opt_in_only) o.opt_in_only = true;
  if (r.birthday_week) o.birthday_week = true;
  if (o.inactive_days_min !== undefined && o.inactive_days_max !== undefined && o.inactive_days_max <= o.inactive_days_min) throw new Error("O teto de dias sem corrida precisa ser maior que o mínimo.");
  if (o.total_rides_min !== undefined && o.total_rides_max !== undefined && o.total_rides_max < o.total_rides_min) throw new Error("Corridas máx. não pode ser menor que corridas mín.");
  return o;
}

/** Quantos contatos entram hoje no segmento. */
export function contarSegmento(e: string, regras: RegrasSegmento, agora = Date.now()): number {
  const w = ["empresa = ?"], a: Array<string | number> = [e];
  const st = regras.stage ? (Array.isArray(regras.stage) ? regras.stage : [regras.stage]) : [];
  if (st.length) { w.push(`stage IN (${st.map(() => "?").join(",")})`); a.push(...st); }
  if (regras.total_rides_min !== undefined) { w.push("total_corridas >= ?"); a.push(regras.total_rides_min); }
  if (regras.total_rides_max !== undefined) { w.push("total_corridas <= ?"); a.push(regras.total_rides_max); }
  if (regras.cancelations_min !== undefined) { w.push("cancelamentos >= ?"); a.push(regras.cancelations_min); }
  if (regras.simulations_min !== undefined) { w.push("simulacoes_sem_conversao >= ?"); a.push(regras.simulations_min); }
  if (regras.total_spent_min !== undefined) { w.push("total_gasto >= ?"); a.push(regras.total_spent_min); }
  if (regras.rfm_segment) { w.push("rfm_segmento = ?"); a.push(regras.rfm_segment); }
  if (regras.opt_in_only) w.push("opt_in_status = 'in'");
  if (regras.inactive_days_min !== undefined) { w.push("ultima_corrida IS NOT NULL AND ultima_corrida <= ?"); a.push(agora - regras.inactive_days_min * 86_400_000); }
  if (regras.inactive_days_max !== undefined) { w.push("ultima_corrida IS NOT NULL AND ultima_corrida >= ?"); a.push(agora - regras.inactive_days_max * 86_400_000); }
  const linhas = bd().prepare(`SELECT cidade, tags, aniversario FROM crm_contatos WHERE ${w.join(" AND ")}`).all(...a) as Array<{ cidade: string; tags: string; aniversario: string }>;
  const cidade = regras.city ? normal(regras.city) : "";
  const tag = regras.has_tag ? regras.has_tag.toLowerCase() : "";
  const semana = new Set(Array.from({ length: 8 }, (_, i) => new Date(agora - 3 * 3600_000 + i * 86_400_000).toISOString().slice(5, 10)));
  return linhas.filter((l) => {
    if (cidade && normal(l.cidade) !== cidade) return false;
    if (tag) { try { if (!(JSON.parse(l.tags) as string[]).some((t) => String(t).toLowerCase() === tag)) return false; } catch { return false; } }
    if (regras.birthday_week && !(l.aniversario && semana.has(l.aniversario.slice(-5)))) return false;
    return true;
  }).length;
}

export function salvarSegmento(e: string, id: string | null, d: { name: string; description?: string | null; rules: Record<string, unknown> }): Segmento {
  const name = String(d.name ?? "").trim().slice(0, 120);
  if (!name) throw new Error("Dê um nome ao segmento.");
  const rules = sanearRegrasSegmento(d.rules ?? {});
  const agora = new Date().toISOString();
  const descricao = String(d.description ?? "").trim().slice(0, 300) || null;
  if (id) {
    const a = segmento(e, id);
    if (!a) throw new Error("Segmento não encontrado.");
    const n: Segmento = { ...a, name, description: descricao, rules, updated_at: agora };
    n.estimated_count = contarSegmento(e, n.rules);
    banco().prepare("UPDATE crm_segmentos SET dados = ? WHERE empresa = ? AND id = ?").run(JSON.stringify(n), e, id);
    return n;
  }
  const n: Segmento = { id: crypto.randomUUID().slice(0, 8), name, description: descricao, rules, is_dynamic: true, is_preset: false, estimated_count: contarSegmento(e, rules), created_at: agora, updated_at: agora };
  banco().prepare("INSERT INTO crm_segmentos (empresa, id, dados) VALUES (?, ?, ?)").run(e, n.id, JSON.stringify(n));
  return n;
}

export function recontarSegmento(e: string, id: string): Segmento {
  const s = segmento(e, id);
  if (!s) throw new Error("Segmento não encontrado.");
  const n = { ...s, estimated_count: contarSegmento(e, s.rules) };
  banco().prepare("UPDATE crm_segmentos SET dados = ? WHERE empresa = ? AND id = ?").run(JSON.stringify(n), e, id);
  return n;
}

export const apagarSegmento = (e: string, id: string) => banco().prepare("DELETE FROM crm_segmentos WHERE empresa = ? AND id = ?").run(e, id).changes > 0;

const PRONTOS: Array<{ name: string; description: string; rules: RegrasSegmento }> = [
  { name: "Novos sem 1ª corrida", description: "Passageiros cadastrados que ainda não fizeram nenhuma corrida", rules: { stage: "novo", total_rides_max: 0 } },
  { name: "Inativos 30 dias", description: "Sem corrida há 30+ dias", rules: { stage: ["em_risco", "inativo", "perdido"] } },
  { name: "Inativos 60 dias", description: "Sem corrida há 60+ dias", rules: { stage: ["inativo", "perdido"] } },
  { name: "Inativos 90 dias", description: "Sem corrida há 90+ dias", rules: { stage: "perdido" } },
  { name: "Fiéis", description: "Corrida nos últimos 30 dias com 10+ corridas", rules: { stage: "fiel" } },
  { name: "Simularam e não pediram (7 dias)", description: "Simularam mas não converteram", rules: { simulations_min: 1, total_rides_max: 0 } },
  { name: "Cancelaram 2+ vezes", description: "Passageiros com 2+ cancelamentos", rules: { cancelations_min: 2 } },
  { name: "Aniversariantes da semana", description: "Aniversário nos próximos 7 dias", rules: { birthday_week: true } },
];

/** "Segmentos Prontos": cria os que ainda não existem (pelo nome). Devolve quantos entraram. */
export function instalarProntos(e: string): number {
  const ja = new Set(segmentos(e).map((s) => s.name));
  let n = 0;
  for (const p of PRONTOS) {
    if (ja.has(p.name)) continue;
    const agora = new Date().toISOString();
    const s: Segmento = { id: crypto.randomUUID().slice(0, 8), name: p.name, description: p.description, rules: p.rules, is_dynamic: true, is_preset: true, estimated_count: contarSegmento(e, p.rules), created_at: agora, updated_at: agora };
    banco().prepare("INSERT INTO crm_segmentos (empresa, id, dados) VALUES (?, ?, ?)").run(e, s.id, JSON.stringify(s));
    n++;
  }
  return n;
}
