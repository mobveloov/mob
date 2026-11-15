// v14.52: localizacao colada do Google Maps no painel (Sugestoes de Endereco).
// Aceita "-21.026138, -48.227547", "Espetinho do Gui : -21.0261385, -48.2275471", "-21.02 -48.22"
// e o link do Maps ("...@-21.026138,-48.227547,17z").
//
// Teste: node --experimental-strip-types supabase/functions/_shared/coordPaste.test.ts

export interface PastedPoint { name: string | null; lat: number; lng: number }

const NUM = "(-?\\d{1,2}(?:[.,]\\d+)?)";

export function parseCoordPaste(raw: string | null | undefined): PastedPoint | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const link = new RegExp(`@${NUM},${NUM}`).exec(text);
  const pair = link ?? new RegExp(`${NUM}\\s*[,;\\s]\\s*${NUM}\\s*$`).exec(text.replace(/[()]/g, " ").trim());
  if (!pair) return null;
  const lat = Number(pair[1].replace(",", "."));
  const lng = Number(pair[2].replace(",", "."));
  // so Brasil (evita trocar lat/lng ou colar outra coisa)
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -34 || lat > 6 || lng < -74 || lng > -32) return null;
  const before = link ? "" : text.slice(0, pair.index).replace(/[\s:;,\-–]+$/, "").trim();
  return { name: before || null, lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}
