// Entende data e hora digitadas (ou faladas) pelo passageiro para agendar corrida.
// Horario de Brasilia fixo em UTC-3 (o Brasil nao tem mais horario de verao).
//
// Exemplos: "amanha 7h", "hoje as 18:30", "depois de amanha 6 da manha", "sexta 18h",
//           "05/10 14h", "dia 5 as 14h", "em 2 horas", "meio dia".
//
// Teste: node --experimental-strip-types supabase/functions/_shared/scheduleParse.test.ts

export const SCHEDULE_MIN_MINUTES = 15; // a corrida começa a procurar motorista 10 min antes: 15 da folga
export const SCHEDULE_MAX_DAYS = 7;
const BRT_OFFSET_MS = 3 * 3600_000; // UTC-3

export type ScheduleResult =
  | { ok: true; whenMs: number; hadDate: boolean }
  | { ok: false; reason: "no_time" | "ambiguous_hour" | "too_soon" | "too_far" | "bad_date"; hour?: number };

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9:/\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Campos "de relogio" em Brasilia para um instante UTC.
function brt(ms: number) {
  const d = new Date(ms - BRT_OFFSET_MS);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), wd: d.getUTCDay() };
}
// Instante UTC a partir de campos de relogio em Brasilia.
function fromBrt(y: number, mo: number, d: number, h: number, mi: number): number {
  return Date.UTC(y, mo, d, h, mi) + BRT_OFFSET_MS;
}
function daysInMonth(y: number, mo: number): number {
  return new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
}

const WEEKDAYS: Array<[RegExp, number]> = [
  [/\bdomingo\b/, 0], [/\bsegunda(?:-?feira)?\b/, 1], [/\bterca(?:-?feira)?\b/, 2], [/\bquarta(?:-?feira)?\b/, 3],
  [/\bquinta(?:-?feira)?\b/, 4], [/\bsexta(?:-?feira)?\b/, 5], [/\bsabado\b/, 6],
];

// ── Hora falada por extenso (audio transcrito): "meio dia e vinte", "as oito e meia", "duas da tarde" ──
const HORA_PALAVRA: Array<[string, number]> = [
  ["vinte e tr[êe]s", 23], ["vinte e duas", 22], ["vinte e dois", 22], ["vinte e uma", 21], ["vinte e um", 21],
  ["vinte", 20], ["dezenove", 19], ["dezoito", 18], ["dezessete", 17], ["dezesseis", 16], ["quinze", 15],
  ["quatorze", 14], ["catorze", 14], ["treze", 13], ["doze", 12], ["onze", 11], ["dez", 10], ["nove", 9],
  ["oito", 8], ["sete", 7], ["seis", 6], ["cinco", 5], ["quatro", 4], ["tr[êe]s", 3], ["duas", 2], ["dois", 2],
  ["uma", 1], ["um", 1],
];
const MIN_PALAVRA: Array<[string, number]> = [
  ["cinquenta e cinco", 55], ["cinquenta", 50], ["quarenta e cinco", 45], ["quarenta", 40], ["trinta e cinco", 35],
  ["trinta", 30], ["meia", 30], ["vinte e cinco", 25], ["vinte", 20], ["quinze", 15], ["dez", 10], ["cinco", 5],
];
const RE_HORA = `(\\d{1,2}|${HORA_PALAVRA.map(([w]) => w).join("|")})`;
const RE_MIN = `(\\d{1,2}|${MIN_PALAVRA.map(([w]) => w).join("|")})`;
const SEM_LETRA_ANTES = "(?<![\\p{L}\\d])";
const SEM_LETRA_DEPOIS = "(?![\\p{L}\\d])";
function palavraParaNumero(w: string, lista: Array<[string, number]>): number | null {
  if (/^\d+$/.test(w)) return +w;
  const x = w.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const [re, n] of lista) if (new RegExp(`^${re.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace("[ee]", "e")}$`).test(x)) return n;
  return null;
}
const p2 = (n: number) => String(n).padStart(2, "0");

/** Troca a hora falada por numeros ("as oito e meia" -> "as 8:30"); o resto do texto fica igual. */
export function spokenTimeToDigits(raw: string): string {
  if (!raw) return raw;
  let s = raw;
  // "meio dia e vinte" -> "12:20"; "meia noite e meia" -> "00:30"
  s = s.replace(new RegExp(`${SEM_LETRA_ANTES}(meio|meia)[\\s-]*(dia|noite)\\s+e\\s+${RE_MIN}${SEM_LETRA_DEPOIS}`, "giu"),
    (m, _a, b, mi) => {
      const min = palavraParaNumero(mi, MIN_PALAVRA);
      return min === null || min > 59 ? m : `${/^d/i.test(b) ? "12" : "00"}:${p2(min)}`;
    });
  // "as oito e meia", "as 8 e 20", "as dez horas e quinze", "as oito"
  s = s.replace(new RegExp(`${SEM_LETRA_ANTES}([àa]s|pras|para\\s+as|pelas|umas)\\s+${RE_HORA}(?:\\s+horas?)?(?:\\s+e\\s+${RE_MIN})?${SEM_LETRA_DEPOIS}`, "giu"),
    (m, pre, h, mi) => {
      const hora = palavraParaNumero(h, HORA_PALAVRA);
      if (hora === null || hora > 23) return m;
      if (mi === undefined) return /^\d+$/.test(h) ? m : `${pre} ${hora}`;
      const min = palavraParaNumero(mi, MIN_PALAVRA);
      return min === null || min > 59 ? m : `${pre} ${hora}:${p2(min)}`;
    });
  // "oito e meia da noite", "duas da tarde" (sem "as": so com o periodo do dia logo depois)
  s = s.replace(new RegExp(`${SEM_LETRA_ANTES}${RE_HORA}(?:\\s+horas?)?(?:\\s+e\\s+${RE_MIN})?(?=\\s+(?:da|de)\\s+(?:manh[ãa]|madrugada|tarde|noite))`, "giu"),
    (m, h, mi) => {
      const hora = palavraParaNumero(h, HORA_PALAVRA);
      if (hora === null || hora > 23) return m;
      if (mi === undefined) return String(hora);
      const min = palavraParaNumero(mi, MIN_PALAVRA);
      return min === null || min > 59 ? m : `${hora}:${p2(min)}`;
    });
  return s;
}

export function parseScheduleWhen(raw: string, nowMs: number): ScheduleResult {
  // (20/10/2026) "Hoje 19.55": hora com PONTO vira 19:55 (o ponto sumia e o bot respondia "nao entendi o dia e a
  // hora" duas vezes). Data com ponto ("05.10.2026") fica como esta.
  const comPonto = String(raw ?? "").replace(/(^|[^\d.])([01]?\d|2[0-3])\.([0-5]\d)(?![\d.])/g, "$1$2:$3");
  const t = norm(spokenTimeToDigits(comPonto));
  const now = brt(nowMs);

  // ── "em 2 horas", "daqui a 40 minutos" ──
  const rel = t.match(/\b(?:em|daqui a|daqui)\s+(\d{1,2})\s*(horas?|h|minutos?|min)\b/);
  if (rel) {
    const n = parseInt(rel[1], 10);
    const unitMs = /^h/.test(rel[2]) ? 3600_000 : 60_000;
    return validate(nowMs + n * unitMs, nowMs, false);
  }

  // ── Hora ──
  let hour: number | null = null;
  let minute = 0;
  let explicit24 = false; // "18:30", "18h", "0h"
  let fixedHour = false;  // "meio dia" / "meia noite": a palavra "noite" nao deve deslocar a hora
  if (/\bmeio ?-?dia\b/.test(t)) { hour = 12; explicit24 = true; fixedHour = true; }
  else if (/\bmeia ?-?noite\b/.test(t)) { hour = 0; explicit24 = true; fixedHour = true; }
  else {
    const hm = t.match(/\b(\d{1,2})\s*[:h]\s*(\d{2})(?:\s*(?:h|hs|horas?))?\b/);
    const hOnly = t.match(/\b(\d{1,2})\s*(?:h|hs|horas?)\b/);
    // "as 7", "as 7 da noite" (nao confundir com "dia 7" nem "07/10")
    const asHour = t.match(/\b(?:as|a)\s+(\d{1,2})\b(?!\s*[/:])/);
    // "7 da manha/tarde/noite"
    const withPeriod = t.match(/\b(\d{1,2})\s+(?:da|de)\s+(?:manha|madrugada|tarde|noite)\b/);
    if (hm) { hour = +hm[1]; minute = +hm[2]; explicit24 = true; }
    else if (hOnly) { hour = +hOnly[1]; explicit24 = true; }
    else if (withPeriod) { hour = +withPeriod[1]; }
    else if (asHour) { hour = +asHour[1]; }
  }
  if (hour === null) return { ok: false, reason: "no_time" };
  if (hour > 23 || minute > 59) return { ok: false, reason: "no_time" };

  const period = /\b(?:da|de|pela|a)\s+(manha|madrugada)\b|\bmanha\b/.test(t) ? "am"
    : /\b(?:da|de|pela|a)\s+(tarde|noite)\b|\b(tarde|noite)\b/.test(t) ? "pm" : null;
  const hasPeriodWord = period !== null;

  if (hasPeriodWord && !fixedHour) {
    if (period === "pm" && hour < 12) hour += 12;
    else if (period === "pm" && hour === 12 && /\bnoite\b/.test(t)) hour = 0;
    else if (period === "am" && hour === 12) hour = 0;
  } else if (!explicit24 && hour >= 1 && hour <= 6) {
    return { ok: false, reason: "ambiguous_hour", hour };
  }

  // ── Data ──
  let y = now.y, mo = now.mo, d = now.d;
  let hadDate = true;
  const dm = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  const diaN = t.match(/\bdia\s+(\d{1,2})\b(?!\s*\/)/);
  if (/\bdepois de amanha\b/.test(t)) {
    const x = brt(nowMs + 2 * 86400_000); y = x.y; mo = x.mo; d = x.d;
  } else if (/\bamanha\b/.test(t) && !/\b(?:da|de|pela)\s+amanha\b/.test(t)) {
    const x = brt(nowMs + 86400_000); y = x.y; mo = x.mo; d = x.d;
  } else if (/\bhoje\b/.test(t)) {
    // hoje
  } else if (dm) {
    d = +dm[1]; mo = +dm[2] - 1;
    if (dm[3]) { y = +dm[3] < 100 ? 2000 + +dm[3] : +dm[3]; }
    if (mo < 0 || mo > 11 || d < 1 || d > daysInMonth(y, mo)) return { ok: false, reason: "bad_date" };
    if (!dm[3] && fromBrt(y, mo, d, hour, minute) < nowMs - 3600_000) y += 1;
  } else if (diaN) {
    d = +diaN[1];
    if (d < 1 || d > 31) return { ok: false, reason: "bad_date" };
    if (d < now.d || (d === now.d && fromBrt(y, mo, d, hour, minute) < nowMs)) {
      mo += 1; if (mo > 11) { mo = 0; y += 1; }
    }
    if (d > daysInMonth(y, mo)) return { ok: false, reason: "bad_date" };
  } else {
    const wdHit = WEEKDAYS.find(([re]) => re.test(t));
    if (wdHit) {
      const target = wdHit[1];
      let found = false;
      for (let i = 0; i <= 7; i++) {
        const x = brt(nowMs + i * 86400_000);
        if (x.wd === target && fromBrt(x.y, x.mo, x.d, hour, minute) > nowMs) { y = x.y; mo = x.mo; d = x.d; found = true; break; }
      }
      if (!found) return { ok: false, reason: "too_soon" };
    } else {
      // So a hora: hoje se ainda der tempo, senao amanha.
      hadDate = false;
      if (fromBrt(y, mo, d, hour, minute) < nowMs + SCHEDULE_MIN_MINUTES * 60_000) {
        const x = brt(nowMs + 86400_000); y = x.y; mo = x.mo; d = x.d;
      }
    }
  }

  return validate(fromBrt(y, mo, d, hour, minute), nowMs, hadDate);
}

function validate(whenMs: number, nowMs: number, hadDate: boolean): ScheduleResult {
  const diff = whenMs - nowMs;
  if (diff < SCHEDULE_MIN_MINUTES * 60_000) return { ok: false, reason: "too_soon" };
  if (diff > SCHEDULE_MAX_DAYS * 86400_000) return { ok: false, reason: "too_far" };
  return { ok: true, whenMs, hadDate };
}

const WD_NAMES = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const pad = (n: number) => String(n).padStart(2, "0");

/** "quinta-feira, 02/10 às 07:00" */
export function formatScheduleBR(ms: number): string {
  const b = brt(ms);
  return `${WD_NAMES[b.wd]}, ${pad(b.d)}/${pad(b.mo + 1)} às ${pad(b.h)}:${pad(b.mi)}`;
}
/** "quinta-feira (02/10) às 07:00", para lembretes */
export function formatScheduleShort(ms: number): string {
  const b = brt(ms);
  return `${pad(b.d)}/${pad(b.mo + 1)} às ${pad(b.h)}:${pad(b.mi)}`;
}

export function scheduleErrorText(r: Extract<ScheduleResult, { ok: false }>): string {
  switch (r.reason) {
    case "too_soon": return `⏱️ O agendamento precisa ser com pelo menos ${SCHEDULE_MIN_MINUTES} minutos de antecedência. Para agora, é só pedir a corrida normalmente. Me diga outro horário, por exemplo: *amanhã 7h*.`;
    case "too_far": return `📅 Só consigo agendar até ${SCHEDULE_MAX_DAYS} dias à frente. Me diga uma data mais próxima, por exemplo: *sexta 18h*.`;
    case "ambiguous_hour": return `🕐 ${r.hour}h é da manhã ou da tarde/noite? Me mande de novo com o período, por exemplo: *amanhã ${r.hour} da manhã* ou *amanhã ${r.hour} da tarde*.`;
    case "bad_date": return "📅 Não entendi essa data. Tente assim: *05/10 14h* ou *amanhã 7h*.";
    default: return "🕐 Não entendi o dia e a hora. Me diga assim: *amanhã 7h*, *sexta 18:30* ou *05/10 14h*.";
  }
}

// ── Horário dentro do pedido ("me manda o carro na Rua X 556 às 10:45") ──
// So conta com uma hora clara: "as 10", "10:45", "10h", "7 da noite", "meio dia", "em 40 minutos".
// Numero de casa ("556", "rua 13 de maio") nao conta.
const NB = "(?<![\\p{L}\\d])"; // inicio de palavra que entende acento (o \b do JS nao entende "às")
const NA = "(?![\\p{L}\\d])";
const PERIODO = "(?:\\s+(?:da|de|pela)\\s+(?:manh[ãa]|madrugada|tarde|noite))?";
const HORAS = "(?:\\s*(?:h|hs|horas?))?";
const RIDE_TIME_RE = new RegExp(
  `${NB}(?:(?:[àa]s|pras|para\\s+as|pelas|umas)\\s+\\d{1,2}(?:\\s*[:h]\\s*\\d{2})?${HORAS}${PERIODO}`
  + `|\\d{1,2}\\s*[:h]\\s*\\d{2}${HORAS}${PERIODO}`
  + `|\\d{1,2}\\s*(?:h|hs|horas)${PERIODO}`
  + `|\\d{1,2}\\s+(?:da|de)\\s+(?:manh[ãa]|madrugada|tarde|noite)`
  + `|meio\\s*-?\\s*dia|meia\\s*-?\\s*noite`
  + `|(?:daqui\\s+a|daqui|em)\\s+\\d{1,2}\\s*(?:horas?|h|minutos?|min))${NA}`,
  "giu",
);
const RIDE_DATE_RE = new RegExp(
  `${NB}(?:hoje|depois\\s+de\\s+amanh[ãa]|amanh[ãa]|domingo|segunda(?:-?feira)?|ter[çc]a(?:-?feira)?|quarta(?:-?feira)?`
  + `|quinta(?:-?feira)?|sexta(?:-?feira)?|s[áa]bado|\\d{1,2}/\\d{1,2}(?:/\\d{2,4})?|dia\\s+\\d{1,2}`
  + `|(?:[àa]|pela)\\s+(?:manh[ãa]|madrugada|tarde|noite))${NA}`,
  "giu",
);

/**
 * Pedido de corrida com horario no meio. null = nao tem hora clara (corrida agora).
 * `text` volta sem a hora/data, para a busca do endereco.
 */
export function scheduleInRideText(raw: string, nowMs: number): { when: ScheduleResult; text: string } | null {
  raw = spokenTimeToDigits(raw);
  if (!raw || !new RegExp(RIDE_TIME_RE.source, "iu").test(raw)) return null;
  const text = raw.replace(RIDE_TIME_RE, " ").replace(RIDE_DATE_RE, " ")
    .replace(/\s+([,.!?])/g, "$1").replace(/[\s,]+$/g, "").replace(/\s{2,}/g, " ").trim();
  // so os pedacos de data/hora vao para o parser (numero da casa e "rua 13 de maio" ficam de fora)
  const pedacos = [...(raw.match(RIDE_DATE_RE) ?? []), ...(raw.match(RIDE_TIME_RE) ?? [])].join(" ");
  let when = parseScheduleWhen(pedacos, nowMs);
  // So a hora e ela e agora/ja ia passar (ex.: "as 15:10" sendo 15:00): e corrida para ja, nao para amanha.
  if (when.ok && !when.hadDate && when.whenMs - 86400_000 >= nowMs - 3600_000) when = { ok: false, reason: "too_soon" };
  return { when, text };
}

// Palavras que sobram numa mensagem que so fala do horario ("nao, e para meio dia e vinte").
const SO_HORARIO_RESTO = new RegExp(
  `^(?:${["n[ãa]o", "[ée]", "eh", "e", "sim", "ok", "pra", "para", "a", "o", "as", "na", "no", "verdade", "hora", "horas",
    "hor[áa]rio", "agenda", "agendar", "agendado", "agendada", "agendamento", "corrida", "carro", "uber", "motorista",
    "mudar", "muda", "troca", "trocar", "altera", "alterar", "por", "favor", "pfv", "pode", "ser", "quero", "que",
    "seja", "ent[ãa]o", "desculpa", "errei", "errado", "certo", "correto", "me", "busca", "buscar", "pegar", "pega",
    "mesmo", "mas", "s[óo]", "somente", "apenas", "de", "da", "do", "hoje", "amanh[ãa]", "isso"].join("|")})$`,
  "iu",
);

/**
 * Mensagem que so traz um horario (correcao no meio do pedido: "nao, e para meio dia e vinte", "as 12:20").
 * null = tem outra coisa (ex.: um endereco) ou nao tem hora clara.
 */
export function scheduleOnlyText(raw: string, nowMs: number): ScheduleResult | null {
  const r = scheduleInRideText(raw, nowMs);
  if (!r) return null;
  const sobra = r.text.split(/[\s,.!?;:]+/).filter(Boolean);
  return sobra.every((w) => SO_HORARIO_RESTO.test(w)) ? r.when : null;
}
