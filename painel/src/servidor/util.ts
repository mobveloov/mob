// Pequenas funções usadas no servidor: texto sem acento, números e datas no padrão do painel.

/** Minúsculo, sem acento, espaços simples. */
export const normal = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** "1.234,56", "1234.56", "R$ 12,00" -> número. Vazio ou inválido -> null. */
export function numero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v ?? "").replace(/[R$\s%]/g, "").trim();
  if (!s || s === "-" || s === "---") return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const HORA = 3600_000;

/** Agora, no padrão do painel (horário de Brasília gravado como UTC; Brasil sem horário de verão). */
export const agoraBr = () => new Date(Date.now() - 3 * HORA);

/**
 * Texto de data -> padrão do painel (ISO com horário de Brasília nos campos UTC).
 * Aceita "04/11/2026 10:43[:12]", "2026-11-04 10:43:00" (lido como Brasília) e ISO com fuso (convertido).
 */
export function dataBr(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0))).toISOString();
  const iso = s.replace(" ", "T");
  const temFuso = /(Z|[+-]\d{2}:?\d{2})$/.test(iso);
  const t = Date.parse(temFuso ? iso : `${iso}Z`);
  if (Number.isNaN(t)) return null;
  return new Date(temFuso ? t - 3 * HORA : t).toISOString();
}

/** Padrão do painel -> ISO real com fuso de Brasília (o que o motor espera). */
export const paraIsoBrasilia = (d: Date) => `${d.toISOString().slice(0, 19)}-03:00`;

export const isoDia = (d: Date) => d.toISOString().slice(0, 10);

export const arred = (n: number, casas = 2) => Math.round(n * 10 ** casas) / 10 ** casas;
export const pct = (parte: number, total: number) => (total > 0 ? arred((parte / total) * 100, 1) : 0);

/** Protege contra injeção de fórmula na planilha: valor que começa com = + - @ (ou tabulação) ganha um apóstrofo na frente. */
export function celulaCsv(v: unknown): string {
  let s = String(v ?? "").replace(/\r?\n/g, " ");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
