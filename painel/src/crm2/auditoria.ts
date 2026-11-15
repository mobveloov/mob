// CRM › Configurações › Auditoria (portado de crm_audit_log e crm_audit_trigger do sistema de referência).
// Quem criou, editou, ativou, desativou ou excluiu gatilhos, campanhas, jornadas, templates e segmentos.
// No sistema de referência um gatilho do banco anota tudo. Aqui um filtro nas rotas do CRM (auditarRotas) tira uma foto do
// item antes e depois de cada pedido que muda algo e anota a diferença, sem mexer nas rotas existentes.

import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import * as A from "../crm/armazem.ts";
import * as T from "../crm/templates.ts";
import { bd } from "./base.ts";

type Foto = Map<string, Record<string, unknown>>;
interface Entidade { entidade: string; ler: (empresa: string) => Array<Record<string, unknown>>; ligaCampo?: string }

/** Campos que mudam sozinhos (contadores e datas do motor) e não viram linha de auditoria. */
const RUIDO = new Set(["atualizadaEm", "ultimaRodada", "disparadaEm", "concluidaEm", "destinatarios", "chaves", "created_at", "enviadas", "falhas"]);

const ENTIDADES: Array<{ prefixo: string; def: Entidade }> = [
  { prefixo: "/campanhas", def: { entidade: "campanha", ler: (e) => A.campanhas(e) as unknown as Array<Record<string, unknown>> } },
  { prefixo: "/jornadas", def: { entidade: "jornada", ler: (e) => A.jornadas(e) as unknown as Array<Record<string, unknown>>, ligaCampo: "ativa" } },
  { prefixo: "/templates", def: { entidade: "template", ler: (e) => T.templates(e) as unknown as Array<Record<string, unknown>>, ligaCampo: "is_active" } },
  { prefixo: "/listas", def: { entidade: "segmento", ler: (e) => A.listas(e).map((l) => ({ ...l, pessoas: l.chaves.length })) as unknown as Array<Record<string, unknown>> } },
];

/** Outras partes do CRM (gatilhos, régua...) entram na auditoria dizendo o prefixo da rota e como ler os itens. */
export function registrarEntidadeAuditada(prefixo: string, entidade: string, ler: Entidade["ler"], ligaCampo?: string) {
  if (!ENTIDADES.some((x) => x.prefixo === prefixo)) ENTIDADES.push({ prefixo, def: { entidade, ler, ligaCampo } });
}

const foto = (def: Entidade, empresa: string): Foto => new Map(def.ler(empresa).map((i) => [String(i.id), JSON.parse(JSON.stringify(i)) as Record<string, unknown>]));
const nomeDe = (i: Record<string, unknown> | undefined) => String(i?.nome ?? i?.name ?? "").slice(0, 120);
const mesmo = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export interface Anotacao { entidade: string; entidade_id: string; entidade_nome: string; acao: string; campos: string[]; antigo: Record<string, unknown> | null; novo: Record<string, unknown> | null }

/** Diferença entre duas fotos da mesma entidade. Pura: testada sem banco. */
export function compararFotos(entidade: string, antes: Foto, depois: Foto, ligaCampo?: string): Anotacao[] {
  const saida: Anotacao[] = [];
  for (const [id, velho] of antes) {
    const novo = depois.get(id);
    if (!novo) { saida.push({ entidade, entidade_id: id, entidade_nome: nomeDe(velho), acao: "excluiu", campos: [], antigo: velho, novo: null }); continue; }
    const campos = [...new Set([...Object.keys(velho), ...Object.keys(novo)])].filter((k) => !RUIDO.has(k) && !mesmo(velho[k], novo[k]));
    if (!campos.length) continue;
    let acao = "editou";
    if (ligaCampo && campos.length === 1 && campos[0] === ligaCampo) acao = novo[ligaCampo] ? "ativou" : "desativou";
    saida.push({ entidade, entidade_id: id, entidade_nome: nomeDe(novo), acao, campos, antigo: velho, novo });
  }
  for (const [id, novo] of depois) if (!antes.has(id)) saida.push({ entidade, entidade_id: id, entidade_nome: nomeDe(novo), acao: "criou", campos: [], antigo: null, novo });
  return saida;
}

export function anotar(empresa: string, ator: string, a: Anotacao, em = Date.now()) {
  bd().prepare("INSERT INTO crm_auditoria (empresa, id, entidade, entidade_id, entidade_nome, acao, ator, campos, antigo, novo, em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(empresa, crypto.randomUUID(), a.entidade, a.entidade_id, a.entidade_nome, a.acao, ator, JSON.stringify(a.campos), a.antigo ? JSON.stringify(a.antigo) : null, a.novo ? JSON.stringify(a.novo) : null, em);
}

/** Filtro das rotas do CRM: pedidos que mudam algo e deram certo (2xx) são anotados com quem fez. */
export function auditarRotas(req: Request, res: Response, next: NextFunction) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
  const alvo = ENTIDADES.find((x) => req.path === x.prefixo || req.path.startsWith(`${x.prefixo}/`));
  const empresa = req.ctx?.empresaId;
  if (!alvo || !empresa) return next();
  let antes: Foto;
  try { antes = foto(alvo.def, empresa); } catch { return next(); }
  const ator = req.ctx?.usuario.email || req.ctx?.usuario.nome || "";
  res.on("finish", () => {
    if (res.statusCode >= 400) return;
    try { for (const a of compararFotos(alvo.def.entidade, antes, foto(alvo.def, empresa), alvo.def.ligaCampo)) anotar(empresa, ator, a); }
    catch (e) { console.error("[crm] auditoria", e instanceof Error ? e.message : e); }
  });
  next();
}

export interface LinhaAuditoria { id: string; entity_type: string; entity_id: string; entity_name: string; action: string; actor_email: string; changed_fields: string[]; old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null; created_at: number }

export function listarAuditoria(empresa: string, f: { dias?: number; entidade?: string; acao?: string }): LinhaAuditoria[] {
  const dias = Math.min(365, Math.max(1, Math.floor(Number(f.dias)) || 7));
  const onde = ["empresa = ?", "em >= ?"], args: Array<string | number> = [empresa, Date.now() - dias * 86_400_000];
  if (f.entidade && f.entidade !== "all") { onde.push("entidade = ?"); args.push(f.entidade); }
  if (f.acao && f.acao !== "all") { onde.push("acao = ?"); args.push(f.acao); }
  const json = (s: unknown) => { try { return s ? (JSON.parse(String(s)) as Record<string, unknown>) : null; } catch { return null; } };
  return (bd().prepare(`SELECT id, entidade, entidade_id, entidade_nome, acao, ator, campos, antigo, novo, em FROM crm_auditoria WHERE ${onde.join(" AND ")} ORDER BY em DESC, seq DESC LIMIT 300`).all(...args) as Array<Record<string, unknown>>)
    .map((r) => ({ id: String(r.id), entity_type: String(r.entidade), entity_id: String(r.entidade_id), entity_name: String(r.entidade_nome), action: String(r.acao), actor_email: String(r.ator), changed_fields: (json(r.campos) as unknown as string[]) ?? [], old_data: json(r.antigo), new_data: json(r.novo), created_at: Number(r.em) }));
}
