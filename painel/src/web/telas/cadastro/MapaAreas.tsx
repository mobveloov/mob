// Mapa (Leaflet + OpenStreetMap) para ver áreas e desenhar o perímetro de uma cidade, tocando nos pontos.

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type Ponto = [number, number];
export interface AreaMapa { id: string; nome: string; poligono: Ponto[]; cor?: string }

interface Props {
  areas?: AreaMapa[];
  /** Perímetro em desenho (editável por toque). */
  desenho?: Ponto[];
  onDesenho?: (p: Ponto[]) => void;
  grande?: boolean;
}

const CENTRO_BRASIL: Ponto = [-14.2, -51.9];

export default function MapaAreas({ areas = [], desenho, onDesenho, grande }: Props) {
  const caixa = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const camada = useRef<L.LayerGroup | null>(null);
  const aoDesenhar = useRef(onDesenho);
  const desenhoAtual = useRef(desenho);
  const ajustou = useRef(false);
  aoDesenhar.current = onDesenho;
  desenhoAtual.current = desenho;

  useEffect(() => {
    if (!caixa.current || mapa.current) return;
    const m = L.map(caixa.current, { center: CENTRO_BRASIL, zoom: 4 });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
    camada.current = L.layerGroup().addTo(m);
    m.on("click", (e: L.LeafletMouseEvent) => {
      if (!aoDesenhar.current) return;
      aoDesenhar.current([...(desenhoAtual.current ?? []), [Math.round(e.latlng.lat * 1e6) / 1e6, Math.round(e.latlng.lng * 1e6) / 1e6]]);
    });
    mapa.current = m;
    return () => { m.remove(); mapa.current = null; };
  }, []);

  useEffect(() => {
    const m = mapa.current, g = camada.current;
    if (!m || !g) return;
    g.clearLayers();
    const limites: L.LatLngExpression[] = [];
    for (const a of areas) {
      if (a.poligono.length < 3) continue;
      L.polygon(a.poligono, { color: a.cor ?? "#f97316", weight: 2, fillOpacity: 0.15 }).bindTooltip(a.nome).addTo(g);
      limites.push(...a.poligono);
    }
    if (desenho?.length) {
      if (desenho.length >= 3) L.polygon(desenho, { color: "#22c55e", weight: 3, fillOpacity: 0.2 }).addTo(g);
      else L.polyline(desenho, { color: "#22c55e", weight: 3 }).addTo(g);
      desenho.forEach((p, i) => L.circleMarker(p, { radius: 6, color: "#22c55e", fillColor: "#fff", fillOpacity: 1 }).bindTooltip(String(i + 1)).addTo(g));
      limites.push(...desenho);
    }
    if (limites.length && (!onDesenho || !ajustou.current)) { m.fitBounds(L.latLngBounds(limites), { padding: [24, 24], maxZoom: 15 }); ajustou.current = true; } // ao desenhar, o mapa não pula a cada ponto
  }, [areas, desenho]);

  return <div ref={caixa} className={`cg-mapa ${grande ? "cg-mapa-grande" : ""}`} style={onDesenho ? { cursor: "crosshair" } : undefined} />;
}
