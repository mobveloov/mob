// Rota desenhada pelas ruas (OSRM) e busca de endereço no OpenStreetMap (Nominatim), para quando a base da empresa
// (CNEFE) não acha. Tudo com cache na memória e sem chave.
//
//   OSRM_URL        servidor de rotas próprio. Sem ele: OSRM público (só para teste). OSRM_PUBLICO=0 desliga.
//   NOMINATIM_URL   servidor de busca próprio. Sem ele: Nominatim público (só para teste, 1 pedido por segundo).
//                   NOMINATIM_PUBLICO=0 desliga a busca de fora.
// Nos testes automáticos (NODE_ENV=test) nada disto chama a internet.

import { linhaReta, servidorOsrm, type Endereco } from "./index.ts";

export interface Posicao { lat: number; lng: number }
export interface Caminho { distanciaKm: number; minutos: number; pelasRuas: boolean; caminho: Array<[number, number]> }

const AGENTE = "painel-mobilidade/2.0 (apps de corrida)";

function guardar<T>(m: Map<string, { em: number; v: T }>, k: string, v: T, max = 800) {
  if (m.size >= max) m.delete(m.keys().next().value!);
  m.set(k, { em: Date.now(), v });
  return v;
}
const valido = <T>(x: { em: number; v: T } | undefined, ms: number) => (x && Date.now() - x.em < ms ? x : undefined);

// ------------------------------------------------------------------ rota pelas ruas

const rotas = new Map<string, { em: number; v: Caminho }>();
const chave = (p: Posicao[]) => p.map((x) => `${x.lat.toFixed(5)},${x.lng.toFixed(5)}`).join(";");

function reta(pontos: Posicao[]): Caminho {
  let km = 0;
  for (let i = 1; i < pontos.length; i++) km += linhaReta(pontos[i - 1], pontos[i]) * 1.3;
  km = Math.round(km * 100) / 100;
  return { distanciaKm: km, minutos: Math.max(1, Math.round(km * 2.5)), pelasRuas: false, caminho: pontos.map((p) => [p.lat, p.lng]) };
}

/** Caminho pelas ruas passando pelos pontos, na ordem. Sem servidor de rotas (ou se ele falhar): linha reta, com pelasRuas=false. */
export async function caminhoPelasRuas(pontos: Posicao[]): Promise<Caminho> {
  const p = pontos.filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lng) && Math.abs(x.lat) <= 90 && Math.abs(x.lng) <= 180).slice(0, 6);
  if (p.length < 2) return { distanciaKm: 0, minutos: 0, pelasRuas: false, caminho: p.map((x) => [x.lat, x.lng]) };
  const k = chave(p);
  const ja = valido(rotas.get(k), 15 * 60_000);
  if (ja) return ja.v;
  const url = servidorOsrm();
  if (url) {
    // Duas tentativas: o servidor público às vezes demora na primeira.
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      try {
        const r = await fetch(`${url}/route/v1/driving/${p.map((x) => `${x.lng},${x.lat}`).join(";")}?overview=full&geometries=geojson`, { headers: { "user-agent": AGENTE }, signal: AbortSignal.timeout(7000) });
        const j = (await r.json()) as { code?: string; routes?: Array<{ distance: number; duration: number; geometry?: { coordinates?: Array<[number, number]> } }> };
        const rt = j.code === "Ok" ? j.routes?.[0] : undefined;
        if (rt?.geometry?.coordinates?.length) {
          return guardar(rotas, k, {
            distanciaKm: Math.round(rt.distance / 10) / 100, minutos: Math.max(1, Math.round(rt.duration / 60)), pelasRuas: true,
            caminho: rt.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
          });
        }
        if (j.code === "NoRoute") break; // sem caminho de carro entre os pontos: não adianta tentar de novo
      } catch { /* tenta de novo, depois cai na linha reta */ }
    }
  }
  return reta(p);
}

// ------------------------------------------------------------------ busca de endereço fora da base (Nominatim)

function servidorNominatim(): string {
  const proprio = process.env.NOMINATIM_URL?.trim().replace(/\/+$/, "");
  if (proprio) return proprio;
  if (process.env.NODE_ENV === "test" || process.env.NOMINATIM_PUBLICO === "0") return "";
  return "https://nominatim.openstreetmap.org";
}
export const buscaDeForaLigada = () => !!servidorNominatim();

// O serviço público pede no máximo 1 pedido por segundo: os pedidos entram em fila.
let fila: Promise<unknown> = Promise.resolve();
let ultimo = 0;
function naFila<T>(fn: () => Promise<T>): Promise<T> {
  const r = fila.then(async () => {
    const espera = 1100 - (Date.now() - ultimo);
    if (espera > 0 && !process.env.NOMINATIM_URL) await new Promise((ok) => setTimeout(ok, espera));
    ultimo = Date.now();
    return fn();
  });
  fila = r.catch(() => undefined);
  return r;
}

interface Achado { lat: string; lon: string; display_name?: string; name?: string; address?: Record<string, string> }
const UF: Record<string, string> = {
  Acre: "AC", Alagoas: "AL", Amapá: "AP", Amazonas: "AM", Bahia: "BA", Ceará: "CE", "Distrito Federal": "DF", "Espírito Santo": "ES", Goiás: "GO", Maranhão: "MA",
  "Mato Grosso": "MT", "Mato Grosso do Sul": "MS", "Minas Gerais": "MG", Pará: "PA", Paraíba: "PB", Paraná: "PR", Pernambuco: "PE", Piauí: "PI", "Rio de Janeiro": "RJ",
  "Rio Grande do Norte": "RN", "Rio Grande do Sul": "RS", Rondônia: "RO", Roraima: "RR", "Santa Catarina": "SC", "São Paulo": "SP", Sergipe: "SE", Tocantins: "TO",
};

/** Monta o endereço no formato do painel. `numeroDigitado`: o número que a pessoa escreveu (o mapa muitas vezes não tem o número da casa). */
function montar(a: Achado, numeroDigitado = ""): Endereco | null {
  const lat = Number(a.lat), lng = Number(a.lon), e = a.address ?? {};
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const rua = e.road || e.pedestrian || e.footway || e.residential || "";
  const lugar = a.name && a.name !== rua ? a.name : "";
  const numero = e.house_number || (rua ? numeroDigitado : "");
  const bairro = e.suburb || e.neighbourhood || e.quarter || e.city_district || "";
  const cidade = e.city || e.town || e.village || e.municipality || "";
  const uf = (e["ISO3166-2-lvl4"] ?? "").replace("BR-", "") || UF[e.state ?? ""] || "";
  const primeira = [lugar, rua ? `${rua}${numero ? `, ${numero}` : ""}` : ""].filter(Boolean).join(" - ");
  if (!primeira) return null;
  const segunda = [bairro, cidade && uf ? `${cidade} - ${uf}` : cidade].filter(Boolean).join(", ");
  return { texto: segunda ? `${primeira} - ${segunda}` : primeira, rua: rua || lugar, numero, bairro, cidade, uf, cep: e.postcode ?? "", lat, lng, exato: !!e.house_number };
}

const buscas = new Map<string, { em: number; v: Endereco[] }>();

/** Procura o endereço no OpenStreetMap, só no Brasil, dando preferência ao que fica perto de `perto`. */
export async function buscarFora(texto: string, perto?: Posicao | null, limite = 6): Promise<Endereco[]> {
  const url = servidorNominatim();
  const q = texto.replace(/[<>]/g, "").trim().slice(0, 120);
  if (!url || q.length < 4) return [];
  const k = `${q.toLowerCase()}|${perto ? `${perto.lat.toFixed(1)},${perto.lng.toFixed(1)}` : ""}`;
  const ja = valido(buscas.get(k), 60 * 60_000);
  if (ja) return ja.v;
  const numero = /(?:,|\s)\s*(\d{1,5})\s*$/.exec(q)?.[1] ?? "";
  const p = new URLSearchParams({ q, format: "jsonv2", addressdetails: "1", countrycodes: "br", limit: String(limite + 2), "accept-language": "pt-BR" });
  // Preferência (sem excluir o resto) para uns 60 km em volta de quem pede.
  if (perto) p.set("viewbox", `${perto.lng - 0.6},${perto.lat + 0.6},${perto.lng + 0.6},${perto.lat - 0.6}`);
  try {
    const l = await naFila(async () => {
      const r = await fetch(`${url}/search?${p}`, { headers: { "user-agent": AGENTE }, signal: AbortSignal.timeout(7000) });
      return r.ok ? ((await r.json()) as Achado[]) : [];
    });
    const vistos = new Set<string>(), fim: Endereco[] = [];
    for (const a of l) {
      const e = montar(a, numero);
      if (!e || vistos.has(e.texto)) continue;
      vistos.add(e.texto); fim.push(e);
    }
    if (perto) fim.sort((x, y) => linhaReta(perto, x) - linhaReta(perto, y));
    return guardar(buscas, k, fim.slice(0, limite));
  } catch { return []; }
}

const pontos = new Map<string, { em: number; v: Endereco | null }>();

/** Endereço de um ponto do mapa (rua e número mais perto), pelo OpenStreetMap. */
export async function pontoFora(lat: number, lng: number): Promise<Endereco | null> {
  const url = servidorNominatim();
  if (!url || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const k = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const ja = valido(pontos.get(k), 6 * 3600_000);
  if (ja) return ja.v;
  try {
    const a = await naFila(async () => {
      const r = await fetch(`${url}/reverse?${new URLSearchParams({ lat: String(lat), lon: String(lng), format: "jsonv2", addressdetails: "1", zoom: "18", "accept-language": "pt-BR" })}`, { headers: { "user-agent": AGENTE }, signal: AbortSignal.timeout(7000) });
      return r.ok ? ((await r.json()) as Achado) : null;
    });
    const e = a ? montar(a) : null;
    return guardar(pontos, k, e ? { ...e, lat, lng } : null);
  } catch { return null; }
}
