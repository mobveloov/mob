// Centro, zoom, limites e áreas de cobertura dos mapas do painel (o servidor decide em GET /api/filiais/centro).
// Aqui ficam o formato, as contas de "dentro da área" e a aplicação no Leaflet. O hook que busca no servidor é web/useCentroDoMapa.ts.
// Nunca há um ponto fixo no meio do país: sem centro, o mapa mostra o Brasil inteiro (BRASIL_LIMITES).

import type * as Leaflet from "leaflet";
import { ajustarSeguro, invalidarDepois, mapaVivo } from "./mapa-seguro.ts";

type L = typeof Leaflet;
export type PontoLL = [number, number];
export interface AreaDoMapa {
  id: string; nome: string; cor: string; filialId: string | null;
  tipo: "area" | "raio";
  poligono?: PontoLL[]; centro?: { lat: number; lng: number }; raioM?: number;
}
export type LimitesLL = [[number, number], [number, number]];
export interface CentroDoMapa {
  filialId: string | null; nome: string;
  centro: { lat: number; lng: number } | null;
  zoom: number;
  limites: LimitesLL | null;
  areas: AreaDoMapa[];
  fonte: "filial" | "area" | "cidade" | "empresa" | "corridas" | "nenhuma";
  filiais: Array<{ id: string; nome: string; lat: number; lng: number }>;
}

/** O Brasil inteiro: só aparece quando nada diz onde a empresa atua. */
export const BRASIL_LIMITES: LimitesLL = [[-33.8, -73.9], [5.3, -34.8]];
export const CENTRO_BRASIL: PontoLL = [-14.2, -51.9];

function dentroDoPoligono(lat: number, lng: number, pol: PontoLL[]): boolean {
  let d = false;
  for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
    const [yi, xi] = pol[i], [yj, xj] = pol[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) d = !d;
  }
  return d;
}
const metros = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLng = (lng2 - lng1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) ** 2;
  return 12_742_000 * Math.asin(Math.min(1, Math.sqrt(a)));
};

/** O ponto está dentro de alguma área de cobertura? Sem nenhuma área desenhada, vale tudo (nada a comparar). */
export function dentroDaCobertura(lat: number, lng: number, areas: AreaDoMapa[]): boolean {
  if (!areas.length) return true;
  return areas.some((a) => (a.tipo === "raio" ? !!a.centro && !!a.raioM && metros(lat, lng, a.centro.lat, a.centro.lng) <= a.raioM : !!a.poligono && a.poligono.length >= 3 && dentroDoPoligono(lat, lng, a.poligono)));
}

/** Desenha a cobertura (contorno e preenchimento leves, sem pegar clique) num grupo novo e devolve o grupo. */
export function desenharCobertura(L: L, mapa: Leaflet.Map, areas: AreaDoMapa[], antigo?: Leaflet.LayerGroup | null): Leaflet.LayerGroup {
  antigo?.remove();
  const g = L.layerGroup().addTo(mapa);
  for (const a of areas) {
    const estilo = { color: a.cor, weight: 2, opacity: 0.7, fillColor: a.cor, fillOpacity: 0.08, interactive: false };
    if (a.tipo === "raio" && a.centro && a.raioM) L.circle([a.centro.lat, a.centro.lng], { ...estilo, radius: a.raioM }).addTo(g);
    else if (a.poligono && a.poligono.length >= 3) L.polygon(a.poligono, estilo).addTo(g);
  }
  return g;
}

/** Põe a vista no lugar certo: cabe a cobertura (ou todas as filiais); senão, centro e zoom; sem centro, o Brasil. */
export function aplicarVista(L: L, mapa: Leaflet.Map, c: CentroDoMapa | null): void {
  const ir = () => {
    if (!mapaVivo(mapa)) return false;
    try {
      if (c?.limites) return ajustarSeguro(mapa, c.limites, { padding: [24, 24], maxZoom: 16 });
      if (c?.centro) { mapa.setView([c.centro.lat, c.centro.lng], c.zoom, { animate: false }); return true; }
      return ajustarSeguro(mapa, BRASIL_LIMITES);
    } catch { return false; }
  };
  if (!ir()) invalidarDepois(mapa, 200, () => { ir(); });
}

/**
 * Mapa que ainda está onde foi criado (ninguém mexeu): só então o centro que chegou do servidor pode mandar na vista.
 * Com tolerância, porque o Leaflet desloca um pouco o centro quando a caixa muda de tamanho.
 */
export const mapaNaoMexido = (mapa: Leaflet.Map, inicial: PontoLL, zoomInicial = 4): boolean => {
  if (!mapaVivo(mapa)) return false;
  const c = mapa.getCenter();
  return mapa.getZoom() === zoomInicial && Math.abs(c.lat - inicial[0]) < 1.5 && Math.abs(c.lng - inicial[1]) < 1.5;
};
