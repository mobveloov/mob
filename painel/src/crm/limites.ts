// Limites e horários de envio do CRM, por empresa (portado de crmEngine / waDailyCap / crmPause do sistema de referência):
//   - horário de envio (janela) e consentimento: aba Governança;
//   - teto diário de WhatsApp com aquecimento (a configuração é a da Régua, como no sistema de referência);
//   - botão "Pausar todos os envios do CRM".
// Regras puras ficam em regua-pura.ts, teto-diario.ts e pausa-pura.ts.

import { banco } from "../servidor/banco.ts";
import { agoraBr } from "../servidor/util.ts";
import { config2, salvarConfig2 } from "../crm2/base.ts";
import * as A from "./armazem.ts";
import { waDailyCapToday, type WaCapConfig } from "./teto-diario.ts";

const DIAS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** Hora (HH:MM) e dia da semana em horário de Brasília. */
export function brAgora(d: Date = agoraBr()) {
  return { hhmm: d.toISOString().slice(11, 16), dia: DIAS[d.getUTCDay()] };
}

/** Início do dia de hoje (Brasília) em milissegundos reais. */
export function inicioDoDiaBr(agora = Date.now()): number {
  const b = new Date(agora - 3 * 3600_000);
  return Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()) + 3 * 3600_000;
}

// ------------------------------------------------------------------ governança (horário e consentimento)

// A janela de horário e o opt-in são os da aba Governança (crm2/base.ts): uma configuração só.
export interface Governanca { janelaInicio: string; janelaFim: string; exigirOptIn: boolean }
export const GOVERNANCA_PADRAO: Governanca = { janelaInicio: "08:00", janelaFim: "21:00", exigirOptIn: false };

export function governanca(e: string): Governanca {
  const c = config2(e);
  return { janelaInicio: c.janelaInicio, janelaFim: c.janelaFim, exigirOptIn: c.exigirOptIn };
}
export function salvarGovernanca(e: string, g: Partial<Governanca>): Governanca {
  const c = salvarConfig2(e, { ...(g.janelaInicio !== undefined ? { janelaInicio: g.janelaInicio } : {}), ...(g.janelaFim !== undefined ? { janelaFim: g.janelaFim } : {}), ...(g.exigirOptIn !== undefined ? { exigirOptIn: g.exigirOptIn === true } : {}) });
  return { janelaInicio: c.janelaInicio, janelaFim: c.janelaFim, exigirOptIn: c.exigirOptIn };
}

const minutos = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return (h || 0) * 60 + (m || 0); };

/** Dentro do horário de envio da empresa? Janela que cruza a meia-noite também vale. */
export function dentroDaJanela(e: string, hhmm = brAgora().hhmm): boolean {
  const g = governanca(e);
  const t = minutos(hhmm), a = minutos(g.janelaInicio), b = minutos(g.janelaFim);
  if (a === b) return true;
  return a < b ? t >= a && t < b : t >= a || t < b;
}

/** Quando abre a próxima janela (ms reais), para segurar o envio de marketing fora do horário. */
export function proximaJanela(e: string, agora = Date.now()): number {
  const g = governanca(e);
  const hoje = inicioDoDiaBr(agora);
  const alvo = hoje + minutos(g.janelaInicio) * 60_000;
  return alvo > agora ? alvo : alvo + 86_400_000;
}

// ------------------------------------------------------------------ pausa geral

export interface PausaGeral { pausado: boolean; por: string; em: string | null }
export const pausaGeral = (e: string): PausaGeral => ({ pausado: false, por: "", em: null, ...A.ler<Partial<PausaGeral>>(e, "pausa.json", {}) });
export function definirPausaGeral(e: string, pausado: boolean, por: string): PausaGeral {
  const p = { pausado, por, em: new Date().toISOString() };
  A.gravar(e, "pausa.json", p);
  return p;
}

// ------------------------------------------------------------------ teto diário (configuração da Régua)

export interface ConfigRegua {
  status: "off" | "on" | "paused"; message: string | null; tiers: number[]; max_per_day: number; warmup_start: number; warmup_step: number; warmup_started_at: string | null;
  window_start: string; window_end: string; days: string[]; error_limit: number; consecutive_errors: number; paused_reason: string | null; last_run_at: string | null;
  numero: "bot" | "crm"; repeat_after_days: number; conexao_id: string | null;
}

export const configCap = (e: string): WaCapConfig => {
  const c = A.ler<Partial<ConfigRegua>>(e, "regua.json", {});
  return { max_per_day: c.max_per_day, warmup_start: c.warmup_start, warmup_step: c.warmup_step, warmup_started_at: c.warmup_started_at };
};

export const tetoHoje = (e: string, agora = Date.now()) => waDailyCapToday(configCap(e), agora);

/** Tudo o que o CRM já mandou hoje por WhatsApp (campanha, gatilho, jornada, régua): o teto vale para o número todo. */
export function enviadosHoje(e: string, agora = Date.now()): number {
  const r = banco().prepare("SELECT COUNT(*) AS n FROM crm_envios WHERE empresa = ? AND canal = 'whatsapp' AND estado = 'sent' AND em >= ?").get(e, inicioDoDiaBr(agora)) as { n: number };
  return r.n;
}
