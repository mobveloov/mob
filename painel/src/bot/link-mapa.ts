// v16.2: link de mapa no lugar da localizacao. No iPhone (e muito no Android) o passageiro compartilha o lugar pelo
// Google Maps / Apple Maps e chega um LINK ("https://maps.app.goo.gl/...", "https://maps.apple.com/?ll=..."), nao a
// localizacao do WhatsApp. Antes o bot tratava o link como endereco digitado e nao achava nada.
//
// - Link com coordenada (ponto marcado): vira { kind: "point" } -> o webhook trata igual a localizacao do WhatsApp.
// - Link de estabelecimento sem coordenada (Google "/maps/place/Nome - R. X, 95 - Bairro, Cidade - UF/..."):
//   vira { kind: "text" } com o endereco do link -> segue o caminho normal de endereco digitado.
// - Link curto: o servidor segue o redirecionamento SO para dominios do Google/Apple (sem SSRF), com prazo curto.
//
// Teste: node --experimental-strip-types supabase/functions/_shared/mapLink.test.ts

export type MapLinkResult =
  | { kind: "point"; lat: number; lng: number; name?: string }
  | { kind: "text"; text: string; name?: string };

const URL_RE = /https?:\/\/[^\s<>"']+/gi;

const MAP_HOST_RE = /^(?:maps\.app\.goo\.gl|goo\.gl|(?:www\.|maps\.)?google\.[a-z.]{2,8}|maps\.apple\.com|maps\.apple|(?:www\.)?apple\.co)$/i;
const SHORT_HOST_RE = /^(?:maps\.app\.goo\.gl|goo\.gl|maps\.apple|(?:www\.)?apple\.co)$/i;

function hostOf(u: string): string {
  try { return new URL(u).hostname.toLowerCase(); } catch { return ""; }
}

function isMapUrl(u: string): boolean {
  const h = hostOf(u);
  if (!MAP_HOST_RE.test(h)) return false;
  if (h === "goo.gl") return /^https?:\/\/goo\.gl\/maps\//i.test(u);
  if (/google\./i.test(h) && !/maps\./i.test(h)) return /\/maps(?:\/|\?|$)/i.test(u);
  return true;
}

/** Primeiro link de mapa da mensagem (ou null). */
export function findMapUrl(text: string | null | undefined): string | null {
  const t = String(text ?? "");
  for (const m of t.matchAll(URL_RE)) {
    const u = m[0].replace(/[).,;!?]+$/, "");
    if (isMapUrl(u)) return u;
  }
  return null;
}

export function hasMapLink(text: string | null | undefined): boolean {
  return findMapUrl(text) !== null;
}

function inBrazil(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -34 && lat <= 6 && lng >= -74 && lng <= -32;
}

function point(lat: number, lng: number, name?: string): MapLinkResult | null {
  if (!inBrazil(lat, lng)) return null;
  const r: MapLinkResult = { kind: "point", lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
  if (name) r.name = name;
  return r;
}

function decodePart(s: string): string {
  try { return decodeURIComponent(s.replace(/\+/g, " ")).replace(/\s+/g, " ").trim(); } catch { return s.replace(/\+/g, " ").trim(); }
}

const PAIR = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;
// (lookahead em vez de \b: "R." termina em ponto e "praça" em ç, onde o \b do JS nao funciona)
const STREET_RE = /^(?:r\.|rua|av\.?|avenida|al\.?|alameda|tv\.?|travessa|rod\.?|rodovia|estr\.?|estrada|pc\.?|pca|praca|praça|lgo\.?|largo|via|vila|servidao|servidão)(?=[\s,.]|$)/i;

/** "Arena Fitness - R. Pará, 95 - Centro, Pitangueiras - SP, 14750-075" -> nome + "R. Pará, 95, Centro, Pitangueiras - SP" */
export function placeTextToAddress(raw: string): { text: string; name?: string } | null {
  let t = raw.replace(/,?\s*\d{5}-?\d{3}\s*$/, "").replace(/\s+/g, " ").trim(); // tira o CEP do fim
  if (!t) return null;
  const parts = t.split(/\s+-\s+/);
  let name: string | undefined;
  if (parts.length > 1 && !STREET_RE.test(parts[0]) && STREET_RE.test(parts[1])) {
    name = parts.shift();
  }
  // "R. Pará, 95 - Centro, Pitangueiras - SP" -> "R. Pará, 95, Centro, Pitangueiras - SP" (o estado fica com " - ")
  const uf = parts.length > 1 && /^[A-Z]{2}$/.test(parts[parts.length - 1].trim()) ? parts.pop()!.trim() : "";
  t = parts.map((p) => p.trim()).filter(Boolean).join(", ") + (uf ? ` - ${uf}` : "");
  t = t.replace(/,\s*,/g, ",").trim();
  if (!t) return null;
  return name ? { text: t, name } : { text: t };
}

/** Le um link de mapa JA expandido. Coordenada tem prioridade; senao, o texto do lugar. */
export function parseMapUrl(url: string): MapLinkResult | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  const host = u.hostname.toLowerCase();
  const q = (k: string) => u.searchParams.get(k);

  // Google: "!3d-21.01!4d-48.23" (ponto exato do lugar) — mais preciso que o "@" (centro da tela)
  const d34 = /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/.exec(url);
  const placeSeg = /\/maps\/place\/([^/?#]+)/i.exec(u.pathname);
  const placeName = placeSeg ? decodePart(placeSeg[1]) : "";
  const placeIsCoords = PAIR.exec(placeName);

  if (/apple/i.test(host)) {
    const name = decodePart(q("q") ?? q("name") ?? "") || undefined;
    for (const k of ["ll", "coordinate", "sll", "daddr", "q"]) {
      const v = q(k);
      const m = v ? PAIR.exec(v) : null;
      if (m) return point(Number(m[1]), Number(m[2]), name && !PAIR.test(name) ? name : undefined);
    }
    const addr = decodePart(q("address") ?? q("daddr") ?? "");
    if (addr) {
      const a = placeTextToAddress(addr);
      if (a) return { kind: "text", text: a.text, ...(name || a.name ? { name: name ?? a.name } : {}) };
    }
    return null;
  }

  const nameForPoint = placeName && !placeIsCoords ? (placeTextToAddress(placeName)?.name ?? undefined) : undefined;
  if (d34) {
    const r = point(Number(d34[1]), Number(d34[2]), nameForPoint);
    if (r) return r;
  }
  if (placeIsCoords) {
    const r = point(Number(placeIsCoords[1]), Number(placeIsCoords[2]));
    if (r) return r;
  }
  for (const k of ["q", "query", "ll", "center", "destination", "daddr"]) {
    const v = q(k);
    const m = v ? PAIR.exec(decodePart(v)) : null;
    if (m) {
      const r = point(Number(m[1]), Number(m[2]));
      if (r) return r;
    }
  }
  // Lugar sem coordenada exata: o texto do lugar vale mais que o "@" (que e so o centro da tela)
  if (placeName && !placeIsCoords) {
    const a = placeTextToAddress(placeName);
    if (a) return { kind: "text", ...a };
  }
  const at = /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/.exec(url);
  if (at) {
    const r = point(Number(at[1]), Number(at[2]));
    if (r) return r;
  }
  const qText = decodePart(q("q") ?? q("query") ?? "");
  if (qText && !PAIR.test(qText)) {
    const a = placeTextToAddress(qText);
    if (a) return { kind: "text", ...a };
  }
  return null;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Segue o link curto (so dominios de mapa) e le o destino. Nunca lanca erro: devolve null se nao der. */
export async function resolveMapLink(
  text: string | null | undefined,
  fetchFn: FetchLike = fetch,
  timeoutMs = 5000,
): Promise<MapLinkResult | null> {
  let url = findMapUrl(text);
  if (!url) return null;
  const direct = parseMapUrl(url);
  if (direct) return direct;
  for (let hop = 0; hop < 4 && SHORT_HOST_RE.test(hostOf(url)); hop++) {
    let next: string | null = null;
    try {
      const resp = await fetchFn(url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
      next = resp.headers.get("location");
      try { await resp.body?.cancel(); } catch { /* ignora */ }
    } catch {
      return null;
    }
    if (!next) return null;
    try { next = new URL(next, url).toString(); } catch { return null; }
    if (!MAP_HOST_RE.test(hostOf(next))) return null; // so segue para Google/Apple
    url = next;
    const r = parseMapUrl(url);
    if (r) return r;
  }
  return null;
}
