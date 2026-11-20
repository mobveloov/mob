// Histórico de envios do CRM (aba Notificações): todo envio de campanha, gatilho, jornada, régua ou teste fica aqui.
// Equivale à tabela crm_send_logs do sistema de referência.

import crypto from "node:crypto";
import { statusPorEnvio, type StatusApp } from "../apps/avisos.ts";
import { banco } from "../servidor/banco.ts";

export type OrigemEnvio = "campaign" | "trigger" | "journey" | "manual" | "behavior" | "automation" | "regua";
export type EstadoEnvio = "sent" | "failed" | "skipped";

export interface EnvioLog {
  id: string; origem: OrigemEnvio; origem_id: string; canal: string; estado: EstadoEnvio; em: number; telefone: string; nome: string;
  titulo: string; previa: string; erro: string; variante: string; faixa: number | null;
  /** Só no canal "app": situação do aviso no app da pessoa (enviada, entregue, lida, falha) e do push do sistema. */
  app?: StatusApp;
}

export function registrar(e: string, p: Partial<EnvioLog> & Pick<EnvioLog, "origem" | "estado" | "telefone">): EnvioLog {
  const l: EnvioLog = {
    id: crypto.randomUUID().slice(0, 12), origem_id: "", canal: "whatsapp", em: Date.now(), nome: "", titulo: "", previa: "", erro: "", variante: "", faixa: null, ...p,
  };
  banco().prepare("INSERT INTO crm_envios (empresa, id, origem, origem_id, canal, estado, em, telefone, nome, titulo, previa, erro, variante, faixa) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(e, l.id, l.origem, l.origem_id, l.canal, l.estado, l.em, l.telefone.slice(0, 20), l.nome.slice(0, 120), l.titulo.slice(0, 120), l.previa.slice(0, 500), l.erro.slice(0, 300), l.variante.slice(0, 4), l.faixa);
  return l;
}

export interface FiltroEnvios { de?: number; ate?: number; origem?: string; estado?: string; canal?: string; gatilhoId?: string; gatilhoIds?: string[]; busca?: string; pagina?: number; porPagina?: number }

function onde(e: string, f: FiltroEnvios) {
  const w = ["empresa = ?"], a: Array<string | number> = [e];
  if (f.de) { w.push("em >= ?"); a.push(f.de); }
  if (f.ate) { w.push("em < ?"); a.push(f.ate); }
  if (f.origem) { w.push("origem = ?"); a.push(f.origem); }
  if (f.estado) { w.push("estado = ?"); a.push(f.estado); }
  if (f.canal) { w.push("canal = ?"); a.push(f.canal); }
  if (f.gatilhoId) { w.push("origem = 'trigger' AND origem_id = ?"); a.push(f.gatilhoId); }
  if (f.gatilhoIds) { w.push(`origem = 'trigger' AND origem_id IN (${f.gatilhoIds.map(() => "?").join(",") || "''"})`); a.push(...f.gatilhoIds); }
  const b = String(f.busca ?? "").trim().toLowerCase();
  if (b) {
    const dig = b.replace(/\D/g, "");
    const partes = ["lower(nome) LIKE ?", "lower(titulo) LIKE ?", "lower(previa) LIKE ?", "lower(erro) LIKE ?"];
    a.push(`%${b}%`, `%${b}%`, `%${b}%`, `%${b}%`);
    if (dig.length >= 3) { partes.push("telefone LIKE ?"); a.push(`%${dig}%`); }
    w.push(`(${partes.join(" OR ")})`);
  }
  return { sql: w.join(" AND "), args: a };
}

export function listarEnvios(e: string, f: FiltroEnvios) {
  const { sql, args } = onde(e, f);
  const por = Math.min(200, Math.max(1, f.porPagina ?? 50)), pag = Math.max(0, f.pagina ?? 0);
  const total = (banco().prepare(`SELECT COUNT(*) AS n FROM crm_envios WHERE ${sql}`).get(...args) as { n: number }).n;
  const linhas = banco().prepare(`SELECT id, origem, origem_id, canal, estado, em, telefone, nome, titulo, previa, erro, variante, faixa FROM crm_envios WHERE ${sql} ORDER BY em DESC, seq DESC LIMIT ? OFFSET ?`).all(...args, por, pag * por) as unknown as EnvioLog[];
  const refs = linhas.filter((l) => l.canal === "app").map((l) => l.id);
  if (refs.length) { const st = statusPorEnvio(e, refs); for (const l of linhas) if (l.canal === "app") l.app = st.get(l.id); }
  return { total, linhas };
}

/** Números do período (tela Notificações). */
export function estatisticas(e: string, de: number, ate: number) {
  const q = (col: string) => Object.fromEntries((banco().prepare(`SELECT ${col} AS k, COUNT(*) AS n FROM crm_envios WHERE empresa = ? AND em >= ? AND em < ? GROUP BY ${col}`).all(e, de, ate) as Array<{ k: string; n: number }>).map((r) => [r.k, r.n]));
  const por_estado = q("estado"), por_origem = q("origem"), por_canal = q("canal");
  return { total: Object.values(por_estado).reduce((a, b) => a + b, 0), by_status: por_estado, by_origin: por_origem, by_channel: por_canal };
}
