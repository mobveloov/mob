// Mapa em tela cheia (Leaflet + OpenStreetMap, sem chave), em estilo claro ou escuro: minha posição, embarque,
// paradas, destino (com etiqueta), a linha da rota e o carro do motorista andando. No modo "escolher", o centro
// do mapa é o ponto escolhido.

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Posicao } from "../comum/api";
import { useCaminho } from "../comum/rota";

export interface PontoMapa { lat: number; lng: number; tipo: "embarque" | "parada" | "destino"; rotulo: string; detalhe?: string }

const BRASIL: L.LatLngExpression = [-15.78, -47.93];
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const SVG_PESSOA = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z"/></svg>`;
const SVG_BANDEIRA = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M5 22V3h2v1h12l-2.5 4.5L19 13H7v9z"/></svg>`;
const SVG_CARRO = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M5 11l1.6-4.4A2 2 0 0 1 8.5 5h7a2 2 0 0 1 1.9 1.6L19 11a2 2 0 0 1 2 2v4a1 1 0 0 1-1 1h-1a2 2 0 0 1-4 0H9a2 2 0 0 1-4 0H4a1 1 0 0 1-1-1v-4a2 2 0 0 1 2-2zm2.2 0h9.6l-1.2-3.4a.8.8 0 0 0-.8-.6H9.2a.8.8 0 0 0-.8.6zM7 15.5A1.5 1.5 0 1 0 7 12.5a1.5 1.5 0 0 0 0 3zm10 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/></svg>`;

function icone(p: PontoMapa, n: number) {
  const simbolo = p.tipo === "embarque" ? SVG_PESSOA : p.tipo === "destino" ? SVG_BANDEIRA : String(n);
  const etiqueta = `<div class="pino-etiqueta"><small>${esc(p.rotulo)}</small>${p.detalhe ? `<b>${esc(p.detalhe)}</b>` : ""}</div>`;
  return L.divIcon({ className: "", html: `<div class="pino pino-${p.tipo}"><span>${simbolo}</span>${etiqueta}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] });
}
const iconeCarro = L.divIcon({ className: "", html: `<div class="pino-carro" aria-label="Motorista">${SVG_CARRO}</div>`, iconSize: [40, 40], iconAnchor: [20, 20] });
const iconeEu = L.divIcon({ className: "", html: `<div class="pino-eu">${SVG_PESSOA}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] });

export function Mapa({ pontos = [], carro, eu, escuro = false, centralizar = 0, folga = 0, linha = true, aoMover, className = "" }: {
  pontos?: PontoMapa[]; carro?: Posicao | null; eu?: Posicao | null; escuro?: boolean;
  /** Mude o número para centralizar de novo. */ centralizar?: number;
  /** Espaço (px) coberto pela folha de baixo, para enquadrar acima dela. */ folga?: number;
  linha?: boolean; aoMover?: (centro: Posicao) => void; className?: string;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const camada = useRef<L.LayerGroup | null>(null);
  const marcaCarro = useRef<L.Marker | null>(null);
  const marcaEu = useRef<L.Marker | null>(null);
  const animacao = useRef(0);
  const mover = useRef(aoMover);
  mover.current = aoMover;
  const dados = useRef({ pontos, carro, eu, folga });
  dados.current = { pontos, carro, eu, folga };

  /** Enquadra tudo o que importa: pontos, carro e (sem pontos) minha posição. */
  const enquadrar = () => {
    const m = mapa.current;
    if (!m) return;
    const { pontos: ps, carro: c, eu: e, folga: f } = dados.current;
    const todos: L.LatLngTuple[] = ps.map((p) => [p.lat, p.lng]);
    if (c) todos.push([c.lat, c.lng]);
    if (!todos.length && e) todos.push([e.lat, e.lng]);
    if (!todos.length) return;
    if (todos.length === 1) { m.setView(todos[0], 16); if (f) m.panBy([0, f / 2], { animate: false }); }
    else m.fitBounds(L.latLngBounds(todos), { paddingTopLeft: [50, 90], paddingBottomRight: [50, 40 + f], maxZoom: 17 });
  };

  // Cria o mapa uma vez.
  useEffect(() => {
    if (!caixa.current) return;
    const m = L.map(caixa.current, { zoomControl: false, attributionControl: true }).setView(BRASIL, 4);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
    m.attributionControl.setPrefix(false);
    camada.current = L.layerGroup().addTo(m);
    m.on("moveend", () => { const c = m.getCenter(); mover.current?.({ lat: c.lat, lng: c.lng }); });
    mapa.current = m;
    // O tamanho da caixa só fica certo depois de desenhar a tela.
    const t = setTimeout(() => { m.invalidateSize(); enquadrar(); }, 120);
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(caixa.current);
    return () => { clearTimeout(t); ro.disconnect(); cancelAnimationFrame(animacao.current); m.remove(); mapa.current = null; marcaCarro.current = null; marcaEu.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Minha posição.
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    if (!eu) { marcaEu.current?.remove(); marcaEu.current = null; return; }
    if (!marcaEu.current) {
      marcaEu.current = L.marker([eu.lat, eu.lng], { icon: iconeEu, keyboard: false, interactive: false }).addTo(m);
      if (!dados.current.pontos.length && !dados.current.carro) enquadrar();
    } else marcaEu.current.setLatLng([eu.lat, eu.lng]);
  }, [eu?.lat, eu?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // Caminho pelas ruas (OSRM, pelo servidor). Sem ele a linha não é desenhada: nunca em linha reta.
  const caminho = useCaminho(linha ? pontos : []);

  // Pontos e rota.
  const chave = pontos.map((p) => `${p.tipo}:${p.lat.toFixed(5)},${p.lng.toFixed(5)}:${p.detalhe ?? ""}`).join("|");
  useEffect(() => {
    const m = mapa.current, g = camada.current;
    if (!m || !g) return;
    g.clearLayers();
    let n = 0;
    if (linha && caminho && caminho.length > 1) {
      const cor = getComputedStyle(document.documentElement).getPropertyValue("--cor").trim() || "#1a73e8";
      L.polyline(caminho, { color: "#111111", weight: 9, opacity: 0.85, lineJoin: "round" }).addTo(g);
      L.polyline(caminho, { color: cor, weight: 5, opacity: 1, lineJoin: "round" }).addTo(g);
    }
    for (const p of pontos) L.marker([p.lat, p.lng], { icon: icone(p, p.tipo === "parada" ? ++n : 0), title: p.rotulo, keyboard: false }).addTo(g);
    enquadrar();
  }, [chave, linha, caminho]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (centralizar) enquadrar(); }, [centralizar]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(enquadrar, 50); return () => clearTimeout(t); }, [folga]); // eslint-disable-line react-hooks/exhaustive-deps

  // Carro do motorista: anda suave até a posição nova.
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    if (!carro) { marcaCarro.current?.remove(); marcaCarro.current = null; return; }
    const destino = L.latLng(carro.lat, carro.lng);
    if (!marcaCarro.current) {
      marcaCarro.current = L.marker(destino, { icon: iconeCarro, zIndexOffset: 1000, keyboard: false }).addTo(m);
      enquadrar();
      return;
    }
    const inicio = marcaCarro.current.getLatLng(), t0 = performance.now(), duracao = 1200;
    cancelAnimationFrame(animacao.current);
    const passo = (t: number) => {
      const k = Math.min(1, (t - t0) / duracao);
      marcaCarro.current?.setLatLng([inicio.lat + (destino.lat - inicio.lat) * k, inicio.lng + (destino.lng - inicio.lng) * k]);
      if (k < 1) animacao.current = requestAnimationFrame(passo);
    };
    animacao.current = requestAnimationFrame(passo);
    if (!m.getBounds().pad(-0.1).contains(destino)) enquadrar();
  }, [carro?.lat, carro?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={caixa} className={`mapa-cheio ${escuro ? "mapa-escuro" : "mapa-claro"} ${className}`} role="application" aria-label="Mapa" />;
}
