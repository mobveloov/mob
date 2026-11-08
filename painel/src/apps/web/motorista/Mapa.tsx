// Mapa de verdade do app do motorista: Leaflet com o mapa base do OpenStreetMap (sem chave).
// Mostra os pontos (você, embarque, paradas, destino), o caminho da viagem e a linha até o próximo ponto.
// O caminho pelas ruas fica com o app de navegação (botão "Navegar"); aqui a linha é reta, só para orientar.

import { useEffect, useRef } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./motorista.css";

export type TipoPonto = "eu" | "carro" | "embarque" | "parada" | "destino";
export interface PontoMapa { lat: number; lng: number; rotulo: string; tipo: TipoPonto }

const CORES: Record<TipoPonto, string> = { eu: "#2563eb", carro: "#1f2937", embarque: "var(--cor)", parada: "#d97706", destino: "#c0392b" };
const valido = (p: { lat?: number; lng?: number } | null | undefined): p is { lat: number; lng: number } =>
  !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && !(p.lat === 0 && p.lng === 0);

const esc = (s: string) => s.replace(/[&<>"']/g, (x) => `&#${x.charCodeAt(0)};`);
function icone(p: PontoMapa) {
  const tam = p.tipo === "carro" || p.tipo === "eu" ? 18 : 16;
  return L.divIcon({
    className: "pino",
    html: `<span class="pino-bola" style="background:${CORES[p.tipo]};width:${tam}px;height:${tam}px"></span><span class="pino-rotulo">${esc(p.rotulo)}</span>`,
    iconSize: [tam, tam], iconAnchor: [tam / 2, tam / 2],
  });
}

/**
 * pontos: o que marcar. caminho: a viagem em ordem (embarque, paradas, destino). ate: linha do carro até o próximo ponto.
 * O mapa segue você enquanto ninguém arrastar; o botão "Centralizar" volta a seguir.
 */
export function Mapa({ pontos, caminho = [], ate, altura = 240 }: { pontos: PontoMapa[]; caminho?: Array<{ lat?: number; lng?: number }>; ate?: [{ lat?: number; lng?: number } | null, { lat?: number; lng?: number } | null]; altura?: number }) {
  const caixa = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const camada = useRef<L.LayerGroup | null>(null);
  const seguir = useRef(true);
  const ultimaChave = useRef<string | null>(null);
  const validos = pontos.filter((p) => valido(p));

  useEffect(() => {
    if (!caixa.current) return;
    const m = L.map(caixa.current, { zoomControl: true, attributionControl: true }).setView([-15.78, -47.93], 4);
    m.attributionControl.setPrefix("Leaflet");
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
    camada.current = L.layerGroup().addTo(m);
    m.on("dragstart", () => { seguir.current = false; });
    const Centralizar = L.Control.extend({
      onAdd: () => {
        const b = L.DomUtil.create("button", "mapa-centralizar");
        b.type = "button"; b.textContent = "Centralizar"; b.setAttribute("aria-label", "Centralizar o mapa");
        L.DomEvent.disableClickPropagation(b);
        b.onclick = () => { seguir.current = true; ultimaChave.current = null; m.fire("centralizar"); };
        return b;
      },
    });
    new Centralizar({ position: "topright" }).addTo(m);
    mapa.current = m;
    // O mapa pode nascer escondido ou mudar de tamanho (tela girou): recalcula.
    const obs = new ResizeObserver(() => m.invalidateSize());
    obs.observe(caixa.current);
    return () => { obs.disconnect(); m.remove(); mapa.current = null; camada.current = null; };
  }, []);

  useEffect(() => {
    const m = mapa.current, g = camada.current;
    if (!m || !g) return;
    const desenhar = () => {
      g.clearLayers();
      const trajeto = caminho.filter(valido).map((p) => L.latLng(p.lat, p.lng));
      if (trajeto.length > 1) L.polyline(trajeto, { color: "#64748b", weight: 4, opacity: 0.45 }).addTo(g);
      const [de, para] = ate ?? [null, null];
      if (valido(de) && valido(para)) L.polyline([[de.lat, de.lng], [para.lat, para.lng]], { color: getComputedStyle(document.documentElement).getPropertyValue("--cor").trim() || "#0f766e", weight: 5, dashArray: "8 8" }).addTo(g);
      for (const p of validos) L.marker([p.lat, p.lng], { icon: icone(p), keyboard: false, interactive: false }).addTo(g);
      if (!validos.length || !seguir.current) return;
      // Enquadra de novo quando muda o conjunto de pontos fixos; se só o carro andou, acompanha sem mudar o zoom.
      const chave = validos.filter((p) => p.tipo !== "carro" && p.tipo !== "eu").map((p) => `${p.lat},${p.lng}`).join("|");
      const moveis = validos.filter((p) => p.tipo === "carro" || p.tipo === "eu");
      if (chave !== ultimaChave.current) {
        ultimaChave.current = chave;
        if (validos.length === 1) m.setView([validos[0].lat, validos[0].lng], 16);
        else m.fitBounds(L.latLngBounds(validos.map((p) => [p.lat, p.lng] as [number, number])), { padding: [40, 40], maxZoom: 17 });
      } else if (!chave && moveis[0]) m.panTo([moveis[0].lat, moveis[0].lng]);
      else if (moveis[0] && !m.getBounds().pad(-0.1).contains([moveis[0].lat, moveis[0].lng])) m.panTo([moveis[0].lat, moveis[0].lng]);
    };
    desenhar();
    m.on("centralizar", desenhar);
    return () => { m.off("centralizar", desenhar); };
  });

  return <div ref={caixa} className="mapa-real" style={{ height: altura }} role="region" aria-label="Mapa" />;
}
