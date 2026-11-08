// Pequenas funções de conversão usadas pelos adaptadores.

import type { GrupoStatus, StatusCorrida } from "./tipos.ts";

export const num = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  let s = String(v).trim().replace(/[R$\s]/g, "");
  // "1.234,56" -> 1234.56 ; "15,40" -> 15.40 ; "3.850" fica 3.850 (decimal com ponto)
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};

export const txt = (v: unknown): string | undefined => {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
};

/** Coordenada válida (descarta 0, vazio e lixo). */
export const coord = (v: unknown): number | undefined => {
  const n = num(v);
  return n === undefined || Math.abs(n) < 0.1 || Math.abs(n) > 180 ? undefined : n;
};

/** "2024-05-02 08:53:42" (horário de Brasília) -> "2024-05-02T08:53:42-03:00". ISO completo passa direto. */
export function isoLocal(v: unknown): string | undefined {
  const s = txt(v);
  if (!s) return undefined;
  if (/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$/.test(s)) return s;
  let m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(:\d{2})?$/);
  if (m) return `${m[1]}T${m[2]}${m[3] ?? ":00"}-03:00`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})[ ]+(\d{2}:\d{2})(:\d{2})?$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}T${m[4]}${m[5] ?? ":00"}-03:00`;
  return undefined;
}

/** ISO -> "AAAA-MM-DD" e "HH:MM" no horário de Brasília (para o Sistema B, que filtra por data local). */
export function partesBrasilia(iso: string): { dia: string; hora: string } {
  const d = new Date(new Date(iso).getTime() - 3 * 3600_000);
  const p = d.toISOString();
  return { dia: p.slice(0, 10), hora: p.slice(11, 16) };
}

export function grupoDe(s: StatusCorrida): GrupoStatus {
  if (s === "finalizada") return "finalizada";
  if (s === "cancelada") return "cancelada";
  if (s === "nao_atendida") return "nao_atendida";
  return "aberta";
}

/** Separa telefone brasileiro em código de área e número. Aceita "(19) 99999-0000", "5519999990000", "+55 19 ...". */
export function telefoneBr(t: string): { codigoPais: number; ddd: number; numero: string } | undefined {
  let d = t.replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  if (d.length < 10 || d.length > 11) return undefined;
  return { codigoPais: 55, ddd: Number(d.slice(0, 2)), numero: d.slice(2) };
}

/** Tira o prefixo "<integração>:" de um id, se houver ("sistema-a:123" -> "123"). */
export const semPrefixo = (id: string) => (id.includes(":") ? id.slice(id.lastIndexOf(":") + 1) : id);
