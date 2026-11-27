// Centro, zoom, limites e áreas de cobertura dos mapas do painel, por filial (ou pela empresa toda).
// Ordem de busca do centro (nunca um ponto fixo do país):
//   1. coordenadas guardadas na filial;  2. meio das áreas desenhadas que a filial cobre;
//   3. endereço da cidade/UF da filial achado pela base de endereços;  4. cidades da empresa (CRM e Endereços);
//   5. média dos embarques das corridas recentes.  Sem nada disso: centro nulo (a tela mostra o Brasil inteiro).
// O isolamento é o de sempre: a empresa vem do login, e quem está preso a uma filial só recebe a dela (decide a rota).

import { areasDaEmpresa, type Ponto } from "../areas/areas.ts";
import { listarProprias } from "../corridas/index.ts";
import { listarCidades } from "../crm2/cidades.ts";
import { buscarEndereco, cidadesAtendidas } from "../enderecos/index.ts";
import { listarFiliais, type Filial } from "./filiais.ts";

export interface AreaDoMapa {
  id: string; nome: string; cor: string; filialId: string | null;
  /** "area" = polígono desenhado em Gestão de áreas; "raio" = círculo do raio de cobertura da filial (ou da cidade do CRM). */
  tipo: "area" | "raio";
  poligono?: Ponto[]; centro?: { lat: number; lng: number }; raioM?: number;
}
export type Limites = [[number, number], [number, number]];
export interface CentroDoMapa {
  filialId: string | null; nome: string;
  centro: { lat: number; lng: number } | null;
  zoom: number;
  /** [[sul, oeste], [norte, leste]]: o que precisa caber na tela (áreas, ou todas as filiais). */
  limites: Limites | null;
  areas: AreaDoMapa[];
  /** De onde veio o centro (para o painel explicar e para os testes). */
  fonte: "filial" | "area" | "cidade" | "empresa" | "corridas" | "nenhuma";
  filiais: Array<{ id: string; nome: string; lat: number; lng: number }>;
}

const COR_PADRAO = "#2563eb";
const noBrasil = (lat: unknown, lng: unknown): boolean => typeof lat === "number" && typeof lng === "number" && lat >= -34 && lat <= 6 && lng >= -74 && lng <= -34;
const bordaDoRaio = (c: { lat: number; lng: number }, km: number): Limites => {
  const dLat = km / 111.32, dLng = km / (111.32 * Math.max(0.2, Math.cos((c.lat * Math.PI) / 180)));
  return [[c.lat - dLat, c.lng - dLng], [c.lat + dLat, c.lng + dLng]];
};
function unir(l: Array<Limites | null>): Limites | null {
  const v = l.filter((x): x is Limites => !!x);
  if (!v.length) return null;
  return [[Math.min(...v.map((x) => x[0][0])), Math.min(...v.map((x) => x[0][1]))], [Math.max(...v.map((x) => x[1][0])), Math.max(...v.map((x) => x[1][1]))]];
}
const limitesDe = (a: AreaDoMapa): Limites | null => {
  if (a.tipo === "raio" && a.centro && a.raioM) return bordaDoRaio(a.centro, a.raioM / 1000);
  const p = a.poligono ?? [];
  if (!p.length) return null;
  const lats = p.map((x) => x[0]), lngs = p.map((x) => x[1]);
  return [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]];
};
const meio = (l: Limites) => ({ lat: (l[0][0] + l[1][0]) / 2, lng: (l[0][1] + l[1][1]) / 2 });

/** Zoom do Leaflet em que a caixa cabe numa tela de cerca de 900 x 460 pixels. */
export function zoomParaLimites(l: Limites): number {
  const dLng = Math.max(1e-6, l[1][1] - l[0][1]);
  const lat = (l[0][0] + l[1][0]) / 2, dLat = Math.max(1e-6, l[1][0] - l[0][0]);
  const porLng = Math.log2((900 * 360) / (256 * dLng));
  const porLat = Math.log2((460 * 360 * Math.cos((lat * Math.PI) / 180)) / (256 * dLat));
  return Math.max(3, Math.min(17, Math.floor(Math.min(porLng, porLat))));
}

function dentroDoPoligono(lat: number, lng: number, pol: Ponto[]): boolean {
  let d = false;
  for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
    const [yi, xi] = pol[i], [yj, xj] = pol[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) d = !d;
  }
  return d;
}

/** Primeira coordenada achada na base de endereços para "cidade UF" (a base só cobre as cidades atendidas pela empresa). */
export function geocodificar(empresaId: string, cidade: string, uf: string): { lat: number; lng: number } | null {
  if (!cidade.trim()) return null;
  try {
    const r = buscarEndereco(empresaId, `${cidade} ${uf}`.trim(), 8).enderecos.find((e) => noBrasil(e.lat, e.lng));
    return r ? { lat: r.lat, lng: r.lng } : null;
  } catch { return null; }
}

function mediaDasCorridas(empresaId: string): { lat: number; lng: number } | null {
  let n = 0, lat = 0, lng = 0;
  for (const c of listarProprias(empresaId).slice(-300)) {
    const e = c.embarque;
    if (!e || !noBrasil(e.lat, e.lng)) continue;
    n++; lat += e.lat!; lng += e.lng!;
  }
  return n ? { lat: lat / n, lng: lng / n } : null;
}

type AreaCadastrada = ReturnType<typeof areasDaEmpresa>[number];
const comoArea = (a: AreaCadastrada, filialId: string | null): AreaDoMapa => ({ id: a.id, nome: a.nome, cor: a.cor || COR_PADRAO, filialId, tipo: "area", poligono: a.poligono });

/** Áreas de cobertura de uma filial: as escolhidas no cadastro dela; sem escolha, as desenhadas que contêm o ponto dela; mais o círculo do raio. */
function areasDaFilial(f: Filial, todas: AreaCadastrada[]): AreaDoMapa[] {
  const validas = todas.filter((a) => a.poligono?.length >= 3);
  const escolhidas = f.areaIds.length ? validas.filter((a) => f.areaIds.includes(a.id)) : f.lat != null && f.lng != null ? validas.filter((a) => dentroDoPoligono(f.lat!, f.lng!, a.poligono)) : [];
  const r: AreaDoMapa[] = escolhidas.map((a) => comoArea(a, f.id));
  if (f.raioKm > 0 && f.lat != null && f.lng != null) r.push({ id: `raio-${f.id}`, nome: `Raio de ${f.nome}`, cor: COR_PADRAO, filialId: f.id, tipo: "raio", centro: { lat: f.lat, lng: f.lng }, raioM: f.raioKm * 1000 });
  return r;
}

/** Centro da empresa quando não há filial para olhar: áreas desenhadas, cidades do CRM, cidades atendidas, corridas. */
function doZero(empresaId: string): { centro: { lat: number; lng: number } | null; fonte: CentroDoMapa["fonte"]; areas: AreaDoMapa[]; limites: Limites | null } {
  const areas = areasDaEmpresa(empresaId).filter((a) => a.poligono?.length >= 3).map((a) => comoArea(a, null));
  const cidades = listarCidades(empresaId).filter((c) => c.is_active && c.lat != null && c.lng != null && noBrasil(c.lat, c.lng));
  const raios: AreaDoMapa[] = cidades.map((c) => ({ id: `cidade-${c.id}`, nome: c.name, cor: COR_PADRAO, filialId: null, tipo: "raio", centro: { lat: c.lat!, lng: c.lng! }, raioM: c.radius_km * 1000 }));
  const todas = [...areas, ...raios];
  const lim = unir(todas.map(limitesDe));
  if (lim) return { centro: meio(lim), fonte: "empresa", areas: todas, limites: lim };
  for (const m of cidadesAtendidas(empresaId)) {
    const g = geocodificar(empresaId, m.nome, m.uf);
    if (g) return { centro: g, fonte: "cidade", areas: [], limites: null };
  }
  const c = mediaDasCorridas(empresaId);
  return c ? { centro: c, fonte: "corridas", areas: [], limites: null } : { centro: null, fonte: "nenhuma", areas: [], limites: null };
}

/** `filialId` vazio = a empresa toda (cabe todas as filiais). Id que não existe cai no caso da empresa. */
export function centroDoMapa(empresaId: string, filialId?: string | null): CentroDoMapa {
  const filiais = listarFiliais(empresaId);
  const todas = areasDaEmpresa(empresaId);
  const comPonto = filiais.filter((f) => f.ativa && f.lat != null && f.lng != null);
  const lista = comPonto.map((f) => ({ id: f.id, nome: f.nome, lat: f.lat!, lng: f.lng! }));
  const f = filialId ? filiais.find((x) => x.id === filialId) : undefined;

  if (f) {
    const areas = areasDaFilial(f, todas);
    const lim = unir(areas.map(limitesDe));
    let centro: { lat: number; lng: number } | null = null, fonte: CentroDoMapa["fonte"] = "filial";
    if (f.lat != null && f.lng != null) centro = { lat: f.lat, lng: f.lng };
    else if (lim) { centro = meio(lim); fonte = "area"; }
    else { centro = geocodificar(empresaId, f.cidade, f.uf); fonte = "cidade"; }
    if (centro) {
      // Zoom: o da filial; sem ele, o que faz a área caber; sem área, o de uma cidade (13).
      const zoom = f.zoom ?? (lim ? zoomParaLimites(lim) : 13);
      return { filialId: f.id, nome: f.nome, centro, zoom, limites: f.zoom != null ? null : lim, areas, fonte, filiais: lista };
    }
    const z = doZero(empresaId);
    return { filialId: f.id, nome: f.nome, centro: z.centro, zoom: z.limites ? zoomParaLimites(z.limites) : 12, limites: z.limites, areas: areas.length ? areas : z.areas, fonte: z.fonte, filiais: lista };
  }

  // Todas as filiais: cabe tudo (pontos, áreas e raios).
  const vistas = new Set<string>();
  const areas = filiais.filter((x) => x.ativa).flatMap((x) => areasDaFilial(x, todas)).filter((a) => !vistas.has(a.id) && !!vistas.add(a.id));
  const pontos: Limites[] = comPonto.map((x) => [[x.lat!, x.lng!], [x.lat!, x.lng!]] as Limites);
  const lim = unir([...areas.map(limitesDe), ...pontos]);
  if (lim) {
    const unico = comPonto.length === 1 ? comPonto[0] : null;
    const soDela = !!unico && areas.every((a) => a.filialId === unico.id);
    const zoom = (soDela ? unico?.zoom : null) ?? (areas.length || comPonto.length > 1 ? zoomParaLimites(lim) : 13);
    return { filialId: null, nome: "Todas as filiais", centro: meio(lim), zoom, limites: soDela && unico?.zoom != null ? null : areas.length || comPonto.length > 1 ? lim : null, areas, fonte: "filial", filiais: lista };
  }
  const z = doZero(empresaId);
  return { filialId: null, nome: "Todas as filiais", centro: z.centro, zoom: z.limites ? zoomParaLimites(z.limites) : 12, limites: z.limites, areas: z.areas, fonte: z.fonte, filiais: lista };
}
