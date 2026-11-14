// Mapa (Leaflet + OpenStreetMap) para ver áreas e desenhar o perímetro de uma cidade, tocando nos pontos.
// Também mostra áreas de bloqueio (vermelho tracejado), cores por área, escala (medidor), Mapa/Satélite e a vista atual.

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type Ponto = [number, number];
export interface AreaMapa { id: string; nome: string; poligono: Ponto[]; cor?: string; bloqueio?: boolean }
export interface Vista { lat: number; lng: number; zoom: number }

interface Props {
  areas?: AreaMapa[];
  /** Perímetro em desenho (editável por toque). */
  desenho?: Ponto[];
  onDesenho?: (p: Ponto[]) => void;
  /** Cor do desenho (padrão verde). */
  corDesenho?: string;
  grande?: boolean;
  /** Imagem de satélite no lugar do mapa de ruas. */
  satelite?: boolean;
  /** Começa nesta vista (em vez de enquadrar as áreas). */
  vistaInicial?: Vista | null;
  /** Avisa a vista atual a cada movimento (para "Gravar"). */
  onVista?: (v: Vista) => void;
}

const CENTRO_BRASIL: Ponto = [-14.2, -51.9];
const URL_MAPA = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const URL_SATELITE = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

export default function MapaAreas({ areas = [], desenho, onDesenho, corDesenho = "#22c55e", grande, satelite, vistaInicial, onVista }: Props) {
  const caixa = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const camada = useRef<L.LayerGroup | null>(null);
  const base = useRef<L.TileLayer | null>(null);
  const aoDesenhar = useRef(onDesenho);
  const aoMover = useRef(onVista);
  const desenhoAtual = useRef(desenho);
  const ajustou = useRef(false);
  aoDesenhar.current = onDesenho;
  aoMover.current = onVista;
  desenhoAtual.current = desenho;

  useEffect(() => {
    if (!caixa.current || mapa.current) return;
    const m = L.map(caixa.current, { center: vistaInicial ? [vistaInicial.lat, vistaInicial.lng] : CENTRO_BRASIL, zoom: vistaInicial?.zoom ?? 4 });
    if (vistaInicial) ajustou.current = true;
    L.control.scale({ imperial: false, position: "bottomright" }).addTo(m);
    camada.current = L.layerGroup().addTo(m);
    m.on("click", (e: L.LeafletMouseEvent) => {
      if (!aoDesenhar.current) return;
      aoDesenhar.current([...(desenhoAtual.current ?? []), [Math.round(e.latlng.lat * 1e6) / 1e6, Math.round(e.latlng.lng * 1e6) / 1e6]]);
    });
    m.on("moveend", () => { const c = m.getCenter(); aoMover.current?.({ lat: c.lat, lng: c.lng, zoom: m.getZoom() }); });
    mapa.current = m;
    return () => { m.remove(); mapa.current = null; base.current = null; };
  }, []);

  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    base.current?.remove();
    base.current = L.tileLayer(satelite ? URL_SATELITE : URL_MAPA, { maxZoom: satelite ? 18 : 19, attribution: satelite ? "Imagens © Esri" : "© OpenStreetMap" }).addTo(m);
    base.current.bringToBack();
  }, [satelite]);

  useEffect(() => {
    const m = mapa.current, g = camada.current;
    if (!m || !g) return;
    g.clearLayers();
    const limites: L.LatLngExpression[] = [];
    for (const a of areas) {
      if (a.poligono.length < 3) continue;
      const estilo = a.bloqueio ? { color: "#ef4444", weight: 2, dashArray: "6 6", fillOpacity: 0.25 } : { color: a.cor ?? "#f97316", weight: 2, fillOpacity: 0.15 };
      L.polygon(a.poligono, estilo).bindTooltip(a.bloqueio ? `${a.nome} (bloqueio)` : a.nome).addTo(g);
      limites.push(...a.poligono);
    }
    if (desenho?.length) {
      if (desenho.length >= 3) L.polygon(desenho, { color: corDesenho, weight: 3, fillOpacity: 0.2 }).addTo(g);
      else L.polyline(desenho, { color: corDesenho, weight: 3 }).addTo(g);
      desenho.forEach((p, i) => L.circleMarker(p, { radius: 6, color: corDesenho, fillColor: "#fff", fillOpacity: 1 }).bindTooltip(String(i + 1)).addTo(g));
      limites.push(...desenho);
    }
    if (limites.length && (!onDesenho || !ajustou.current)) { m.fitBounds(L.latLngBounds(limites), { padding: [24, 24], maxZoom: 15 }); ajustou.current = true; } // ao desenhar, o mapa não pula a cada ponto
  }, [areas, desenho, corDesenho]);

  return <div ref={caixa} className={`cg-mapa ${grande ? "cg-mapa-grande" : ""}`} style={onDesenho ? { cursor: "crosshair" } : undefined} />;
}
