// Mapa do app do motorista: Leaflet com o mapa base do OpenStreetMap (sem chave), em estilo escuro (filtro nos
// blocos do mapa). Mostra você (seta), embarque, paradas e destino, o caminho da viagem e a linha até o próximo ponto.
// Os caminhos são pelas ruas (OSRM, consultado pelo servidor).

import { useEffect, useRef } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useCaminho } from "../comum/rota";

export type TipoPonto = "eu" | "embarque" | "parada" | "destino";
export interface PontoMapa { lat: number; lng: number; rotulo: string; tipo: TipoPonto }
type Talvez = { lat?: number; lng?: number } | null | undefined;

const valido = (p: Talvez): p is { lat: number; lng: number } =>
  !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && !(p.lat === 0 && p.lng === 0);

const esc = (s: string) => s.replace(/[&<>"']/g, (x) => `&#${x.charCodeAt(0)};`);
const corMarca = () => getComputedStyle(document.documentElement).getPropertyValue("--cor").trim() || "#2563eb";

function icone(p: PontoMapa) {
  if (p.tipo === "eu") {
    return L.divIcon({
      className: "pino", iconSize: [34, 34], iconAnchor: [17, 17],
      html: `<span class="pino-eu"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 11 22 2l-9 19-2-8-8-2z" fill="currentColor"/></svg></span>`,
    });
  }
  const cor = p.tipo === "embarque" ? "#22c55e" : p.tipo === "parada" ? "#f59e0b" : "#ef4444";
  return L.divIcon({
    className: "pino", iconSize: [18, 18], iconAnchor: [9, 9],
    html: `<span class="pino-bola" style="background:${cor}"></span><span class="pino-rotulo">${esc(p.rotulo)}</span>`,
  });
}

/**
 * pontos: o que marcar. caminho: a viagem em ordem. ate: linha de você até o próximo ponto.
 * centralizar: mude o número para voltar a seguir você (botão de centralizar fora do mapa).
 */
export function Mapa({ pontos, caminho = [], ate, centralizar = 0, className = "" }: {
  pontos: PontoMapa[]; caminho?: Talvez[]; ate?: [Talvez, Talvez]; centralizar?: number; className?: string;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const camada = useRef<L.LayerGroup | null>(null);
  const seguir = useRef(true);
  const ultimaChave = useRef<string | null>(null);

  useEffect(() => {
    if (!caixa.current) return;
    const m = L.map(caixa.current, { zoomControl: false, attributionControl: true }).setView([-15.78, -47.93], 4);
    m.attributionControl.setPrefix(false);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
    camada.current = L.layerGroup().addTo(m);
    m.on("dragstart", () => { seguir.current = false; });
    mapa.current = m;
    // O mapa pode nascer escondido ou mudar de tamanho (tela girou): recalcula.
    const obs = new ResizeObserver(() => m.invalidateSize());
    obs.observe(caixa.current);
    return () => { obs.disconnect(); m.remove(); mapa.current = null; camada.current = null; };
  }, []);

  useEffect(() => { seguir.current = true; ultimaChave.current = null; }, [centralizar]);

  // Caminhos pelas ruas: a viagem inteira e o trecho de você até o próximo ponto (este se atualiza, no máximo a cada 12 s).
  const ruaViagem = useCaminho(caminho);
  const ruaAte = useCaminho(ate ?? [], 12000, 4);

  useEffect(() => {
    const m = mapa.current, g = camada.current;
    if (!m || !g) return;
    g.clearLayers();
    const validos = pontos.filter(valido);
    if (ruaViagem && ruaViagem.length > 1) L.polyline(ruaViagem, { color: "#64748b", weight: 6, opacity: 0.7, lineJoin: "round" }).addTo(g);
    if (ruaAte && ruaAte.length > 1) {
      L.polyline(ruaAte, { color: "#111111", weight: 10, opacity: 0.85, lineJoin: "round" }).addTo(g);
      L.polyline(ruaAte, { color: corMarca(), weight: 6, lineJoin: "round" }).addTo(g);
    }
    for (const p of validos) L.marker([p.lat, p.lng], { icon: icone(p), keyboard: false, interactive: false, zIndexOffset: p.tipo === "eu" ? 1000 : 0 }).addTo(g);
    if (!validos.length || !seguir.current) return;
    // Enquadra de novo quando muda o conjunto de pontos fixos; se só você andou, acompanha sem mudar o zoom.
    const fixos = validos.filter((p) => p.tipo !== "eu");
    const eu = validos.find((p) => p.tipo === "eu");
    const chave = fixos.map((p) => `${p.lat},${p.lng}`).join("|");
    if (chave !== ultimaChave.current) {
      ultimaChave.current = chave;
      if (validos.length === 1) m.setView([validos[0].lat, validos[0].lng], 16);
      else m.fitBounds(L.latLngBounds(validos.map((p) => [p.lat, p.lng] as [number, number])), { padding: [60, 60], maxZoom: 17 });
    } else if (eu && (!fixos.length || !m.getBounds().pad(-0.15).contains([eu.lat, eu.lng]))) m.panTo([eu.lat, eu.lng]);
  });

  return <div ref={caixa} className={`mapa-m ${className}`} role="region" aria-label="Mapa" />;
}
