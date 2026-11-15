// Templates comportamentais: regras puras (hora preferida, antecedência, dias, taxa de cancelamento). Portado de behavior.ts.
// Fase 1 (pre_janela): lead_minutes antes da hora preferida do passageiro. Fase 2 (meio_janela, opcional): depois, só se ele ainda não fez corrida.

const TZ = "America/Sao_Paulo";

/** Hora, minuto, dia da semana (0=domingo) e data (AAAA-MM-DD) em Brasilia. */
export function brClock(ms: number): { hour: number; minute: number; dow: number; date: string } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short",
  }).formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return { hour: Number(parts.hour) % 24, minute: Number(parts.minute), dow, date: `${parts.year}-${parts.month}-${parts.day}` };
}

/** h esta na faixa [start, end] (inclusivo); end < start atravessa a meia-noite (ex.: 22 a 3). */
export function hourInRange(h: number, start: number, end: number): boolean {
  return start <= end ? h >= start && h <= end : h >= start || h <= end;
}

export interface LinhaTemplate {
  id: string; name: string; hour_start: number; hour_end: number; weekdays: number[]; match_weekday: boolean;
  lead_minutes: number; min_rides: number; min_inactive_days: number | null; max_inactive_days: number | null; min_cancel_rate: number | null;
  channel: string; title: string | null; body: string; second_after_minutes: number | null; second_title: string | null; second_body: string | null;
  max_per_run: number; sent_count: number;
}

/** Momento-alvo da fase 1: agora + antecedencia. So dispara nos primeiros 30 min da hora-alvo (o cron roda a cada 10). */
export function phaseOneTarget(nowMs: number, t: Pick<LinhaTemplate, "lead_minutes" | "weekdays" | "hour_start" | "hour_end">) {
  const target = brClock(nowMs + Math.max(0, t.lead_minutes) * 60000);
  const ok = target.minute < 30 && (t.weekdays ?? []).includes(target.dow) && hourInRange(target.hour, t.hour_start, t.hour_end);
  return { ok, hour: target.hour, dow: target.dow };
}

export function cancelRate(rides: number, canc: number): number {
  const total = rides + canc;
  return total > 0 ? (canc / total) * 100 : 0;
}

