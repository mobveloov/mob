// Régua de reativação do CRM (passageiro que parou de pedir corrida) — regras PURAS, sem banco.
// Teste: crmRegua.test.ts
//
// Por que tanto cuidado: o WhatsApp suspendeu um número por 24 h (09/11/2026) depois de ~480 envios em um dia, de
// uma campanha de 6.612 pessoas, em número recém-conectado. A régua por isso tem: limite diário baixo, aquecimento
// (começa com poucos e sobe aos poucos), envio espalhado pelo horário comercial e parada sozinha quando dá erro.

export const REGUA_TIERS_PADRAO = [1, 7, 30, 90, 365];
/** Depois da última faixa, até quantos dias ainda vale enviar (1 ano + folga). Passou disso, não recebe mais. */
export const REGUA_FOLGA_ULTIMA_FAIXA = 30;

export const REGUA_MENSAGEM_PADRAO =
  "*{nome}, faz tempo que você não pede corrida* 🚗\n\n" +
  "Olá! Faz alguns dias que você não anda com a {empresa}. Quando precisar, é só ligar ou pedir por aqui mesmo: " +
  "diga onde você está e a gente manda um carro!\n\n" +
  "_Não quer mais receber? Responda NÃO QUERO MAIS._";

export interface ReguaConfig {
  tiers: number[];
  maxPerDay: number;
  warmupStart: number;
  warmupStep: number;
  /** início do aquecimento (ms); null = ainda não começou */
  warmupStartedAtMs: number | null;
  windowStart: string; // HH:MM
  windowEnd: string;
  /** dias da semana permitidos (sun..sat) */
  days: string[];
  errorLimit: number;
}

export const REGUA_PADRAO = {
  maxPerDay: 40, warmupStart: 8, warmupStep: 4, windowStart: "09:00", windowEnd: "18:00",
  days: ["mon", "tue", "wed", "thu", "fri", "sat"], errorLimit: 3, perRun: 2,
};

/** Faixas limpas: números inteiros ≥ 1, sem repetir, em ordem. Vazio/ruim = padrão. */
export function normalizeTiers(raw: unknown): number[] {
  const list = Array.isArray(raw) ? raw : [];
  const out = [...new Set(list.map((n) => Math.round(Number(n))).filter((n) => Number.isFinite(n) && n >= 1 && n <= 730))].sort((a, b) => a - b);
  return out.length ? out : [...REGUA_TIERS_PADRAO];
}

const DAY_MS = 86400000;

/** Dias inteiros sem pedir corrida (null = nunca pediu / sem data). */
export function daysInactive(lastRideAt: string | null | undefined, nowMs: number): number | null {
  if (!lastRideAt) return null;
  const t = new Date(lastRideAt).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((nowMs - t) / DAY_MS));
}

/**
 * Faixa em que o passageiro está: a MAIOR faixa já alcançada (1, 7, 30, 90, 365). Antes da primeira faixa ou depois
 * da última + folga = null (não recebe). Quem já passou de faixas não recebe as anteriores de uma vez.
 */
export function tierFor(days: number | null, tiers: number[]): number | null {
  if (days == null || !tiers.length) return null;
  const sorted = normalizeTiers(tiers);
  const last = sorted[sorted.length - 1];
  if (days < sorted[0] || days >= last + REGUA_FOLGA_ULTIMA_FAIXA) return null;
  let hit: number | null = null;
  for (const t of sorted) if (days >= t) hit = t;
  return hit;
}

export interface ReguaContato {
  phone: string;
  name?: string | null;
  last_ride_at: string | null;
  total_rides?: number | null;
}
export interface ReguaEnvio { phone: string; tier_days: number; sent_at: string; status?: string; }

const digits = (p: string) => String(p ?? "").replace(/\D/g, "");

/**
 * Quem recebe agora. Regras:
 *  - precisa ter corrida (last_ride_at) e estar numa faixa;
 *  - por padrão 1 mensagem por faixa; com `repeatAfterDays` (ex.: 15) a mesma faixa pode ser repetida depois desse intervalo,
 *    enquanto a pessoa continuar sem pedir corrida. Já enviado naquela faixa DEPOIS da última corrida (dentro do intervalo) = fora
 *    Quem pediu corrida depois do envio recomeça (envio antigo, anterior à última corrida, não conta);
 *  - prioridade para quem parou há menos tempo (menos dias sem pedir), desempate pelo telefone.
 */
export function reguaCandidates(
  contatos: ReguaContato[], envios: ReguaEnvio[], tiers: number[], nowMs: number, repeatAfterDays = 0,
): Array<{ phone: string; name: string | null; tier: number; days: number }> {
  const sentByPhone = new Map<string, ReguaEnvio[]>();
  for (const e of envios) {
    const k = digits(e.phone);
    const arr = sentByPhone.get(k) ?? [];
    arr.push(e);
    sentByPhone.set(k, arr);
  }
  const seen = new Set<string>();
  const out: Array<{ phone: string; name: string | null; tier: number; days: number }> = [];
  for (const c of contatos) {
    const phone = digits(c.phone);
    if (!phone || seen.has(phone)) continue;
    if (c.total_rides != null && Number(c.total_rides) <= 0) continue;
    const days = daysInactive(c.last_ride_at, nowMs);
    const tier = tierFor(days, tiers);
    if (tier == null || days == null) continue;
    const lastRide = new Date(c.last_ride_at as string).getTime();
    // Já recebeu esta faixa depois da última corrida? Só recebe de novo se passaram `repeatAfterDays` dias (0 = nunca repete). Descadastro (skipped) nunca volta.
    const already = (sentByPhone.get(phone) ?? []).some((e) => {
      if (e.tier_days !== tier) return false;
      const at = new Date(e.sent_at).getTime();
      if (at < lastRide) return false;
      if (e.status === "skipped" || repeatAfterDays <= 0) return true;
      return at > nowMs - repeatAfterDays * DAY_MS;
    });
    if (already) continue;
    seen.add(phone);
    out.push({ phone, name: c.name ?? null, tier, days });
  }
  out.sort((a, b) => a.days - b.days || (a.phone < b.phone ? -1 : 1));
  return out;
}

/** Limite do dia com aquecimento: começa em `start` e sobe `step` por dia até o limite configurado. */
export function reguaDailyCap(cfg: { maxPerDay: number; warmupStart: number; warmupStep: number; warmupStartedAtMs: number | null }, nowMs: number): number {
  const max = Math.max(0, Math.floor(cfg.maxPerDay));
  if (cfg.warmupStartedAtMs == null) return Math.min(max, Math.max(0, Math.floor(cfg.warmupStart)));
  const day = Math.max(0, Math.floor((nowMs - cfg.warmupStartedAtMs) / DAY_MS));
  return Math.min(max, Math.max(0, Math.floor(cfg.warmupStart)) + Math.max(0, Math.floor(cfg.warmupStep)) * day);
}

const toMin = (hhmm: string) => {
  const [h, m] = String(hhmm || "0:0").slice(0, 5).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** Está dentro do horário comercial (dia permitido e horário)? `hhmm` e `day` em horário de Brasília. */
export function inReguaWindow(hhmm: string, day: string, cfg: { windowStart: string; windowEnd: string; days: string[] }): boolean {
  if (cfg.days?.length && !cfg.days.includes(day)) return false;
  const t = toMin(hhmm);
  return t >= toMin(cfg.windowStart) && t < toMin(cfg.windowEnd);
}

/**
 * Quantas mensagens já podem ter saído até agora: o limite do dia é espalhado pelo horário comercial
 * (sem rajada na abertura). Fora do horário = o que já cabia no fim do dia (todo o limite).
 */
export function reguaAllowedByNow(cap: number, hhmm: string, cfg: { windowStart: string; windowEnd: string }): number {
  const s = toMin(cfg.windowStart), e = toMin(cfg.windowEnd), t = toMin(hhmm);
  if (e <= s || cap <= 0) return Math.max(0, cap);
  if (t >= e) return cap;
  if (t < s) return 0;
  return Math.min(cap, Math.max(1, Math.ceil((cap * (t - s + 1)) / (e - s))));
}

/** Quantas mensagens saem NESTA rodada: o que falta até o permitido agora, no máximo `perRun` e nunca passa do limite do dia. */
export function reguaBudgetNow(opts: { cap: number; sentToday: number; hhmm: string; windowStart: string; windowEnd: string; perRun?: number }): number {
  const allowed = reguaAllowedByNow(opts.cap, opts.hhmm, opts);
  const room = Math.min(opts.cap - opts.sentToday, allowed - opts.sentToday);
  return Math.max(0, Math.min(room, opts.perRun ?? REGUA_PADRAO.perRun));
}

/** Parar sozinho? Erros seguidos no limite (zera quando uma mensagem sai). */
export function shouldAutoPause(consecutiveErrors: number, limit: number): boolean {
  return limit > 0 && consecutiveErrors >= limit;
}

/** O número de envio é o mesmo do bot de atendimento (ou do totem) da empresa? Aí a régua não sai. */
export function isBotNumber(instance: string | null | undefined, botInstances: Array<string | null | undefined>): boolean {
  const k = String(instance ?? "").trim().toLowerCase();
  if (!k) return false;
  return botInstances.some((b) => String(b ?? "").trim().toLowerCase() === k);
}

/**
 * Texto final. Aceita {nome} / {{nome}} / {empresa}. Sem nome confiável, tira o "{nome}, " do começo
 * ("Faz tempo que você não pede corrida") em vez de escrever "tudo bem, faz tempo...".
 */
export function renderReguaMessage(template: string | null | undefined, name: string | null | undefined, empresa: string | null | undefined): string {
  const raw = String(template ?? "").trim() || REGUA_MENSAGEM_PADRAO;
  const first = String(name ?? "").trim().split(/\s+/)[0] ?? "";
  const okName = /^[\p{L}'-]{2,20}$/u.test(first) ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : "";
  let t = raw.replace(/\{\{\s*(nome|empresa)\s*\}\}/gi, "{$1}");
  if (okName) t = t.replace(/\{nome\}/gi, okName);
  else {
    t = t.replace(/\{nome\}\s*,\s*([^\s])/gi, (_m, c: string) => c.toUpperCase()).replace(/\{nome\}/gi, "");
  }
  t = t.replace(/\{empresa\}/gi, String(empresa ?? "").trim() || "nossa empresa");
  return t.replace(/[ \t]{2,}/g, " ").trim();
}

/** Espera aleatória (ms) entre duas mensagens da mesma rodada. `rnd` em [0,1). */
export function reguaGapMs(rnd = Math.random(), minMs = 8000, maxMs = 20000): number {
  return Math.round(minMs + (maxMs - minMs) * rnd);
}
