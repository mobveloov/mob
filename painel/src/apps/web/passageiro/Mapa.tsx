// Mapa de verdade (Leaflet + mapa base do OpenStreetMap, sem chave): embarque, paradas, destino, rota e o carro
// do motorista andando. Tocar no mapa devolve a posição (o pedido usa para marcar embarque ou destino).

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./passageiro.css";
import type { Posicao } from "../comum/api";

export interface PontoMapa { lat: number; lng: number; tipo: "embarque" | "parada" | "destino"; rotulo: string }

const BRASIL: L.LatLngExpression = [-15.78, -47.93];

const icone = (tipo: PontoMapa["tipo"] | "carro", texto = "") =>
  L.divIcon({
    className: "",
    html: tipo === "carro" ? `<div class="marca-carro" aria-label="Motorista">🚗</div>` : `<div class="marca-ponto marca-${tipo}">${texto}</div>`,
    iconSize: tipo === "carro" ? [36, 36] : [26, 26],
    iconAnchor: tipo === "carro" ? [18, 18] : [13, 13],
  });

export function Mapa({ pontos, carro, aoTocar, centroInicial, altura = 260 }: {
  pontos: PontoMapa[]; carro?: Posicao | null; aoTocar?: (p: Posicao) => void; centroInicial?: Posicao | null; altura?: number;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const camada = useRef<L.LayerGroup | null>(null);
  const marcaCarro = useRef<L.Marker | null>(null);
  const animacao = useRef(0);
  const tocar = useRef(aoTocar);
  tocar.current = aoTocar;
  const enquadrou = useRef("");
  const pontosRef = useRef(pontos);
  pontosRef.current = pontos;
  /** Enquadra os pontos e o carro juntos. */
  const enquadrarTudo = (m: L.Map, carroAgora: L.LatLng) => {
    const todos: L.LatLngTuple[] = [...pontosRef.current.map((p) => [p.lat, p.lng] as L.LatLngTuple), [carroAgora.lat, carroAgora.lng]];
    if (todos.length === 1) m.setView(todos[0], 16);
    else m.fitBounds(L.latLngBounds(todos), { padding: [36, 36], maxZoom: 17 });
  };

  // Cria o mapa uma vez.
  useEffect(() => {
    if (!caixa.current) return;
    const m = L.map(caixa.current, { zoomControl: true, attributionControl: true }).setView(BRASIL, 4);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
    camada.current = L.layerGroup().addTo(m);
    m.on("click", (e: L.LeafletMouseEvent) => tocar.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
    mapa.current = m;
    // O tamanho da caixa só fica certo depois de desenhar a tela.
    const t = setTimeout(() => m.invalidateSize(), 150);
    return () => { clearTimeout(t); cancelAnimationFrame(animacao.current); m.remove(); mapa.current = null; marcaCarro.current = null; enquadrou.current = ""; };
  }, []);

  // Centro inicial (GPS) quando ainda não há pontos.
  useEffect(() => {
    if (mapa.current && centroInicial && !pontos.length && !enquadrou.current) mapa.current.setView([centroInicial.lat, centroInicial.lng], 15);
  }, [centroInicial?.lat, centroInicial?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pontos e rota.
  const chave = pontos.map((p) => `${p.tipo}:${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join("|");
  useEffect(() => {
    const m = mapa.current, g = camada.current;
    if (!m || !g) return;
    g.clearLayers();
    let n = 0;
    for (const p of pontos) {
      const texto = p.tipo === "embarque" ? "A" : p.tipo === "destino" ? "B" : String(++n);
      L.marker([p.lat, p.lng], { icon: icone(p.tipo, texto), title: p.rotulo, keyboard: false }).bindTooltip(p.rotulo).addTo(g);
    }
    if (pontos.length > 1) L.polyline(pontos.map((p) => [p.lat, p.lng] as L.LatLngTuple), { color: getComputedStyle(document.documentElement).getPropertyValue("--cor").trim() || "#0f766e", weight: 4, opacity: 0.8, dashArray: "8 6" }).addTo(g);
    // Enquadra quando os pontos mudam (inclui o carro na primeira vez).
    const todos: L.LatLngTuple[] = pontos.map((p) => [p.lat, p.lng]);
    if (carro) todos.push([carro.lat, carro.lng]);
    if (todos.length === 1) m.setView(todos[0], 16);
    else if (todos.length > 1) m.fitBounds(L.latLngBounds(todos), { padding: [36, 36], maxZoom: 17 });
    if (todos.length) enquadrou.current = chave;
  }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps

  // Carro do motorista: anda suave até a posição nova.
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    if (!carro) { marcaCarro.current?.remove(); marcaCarro.current = null; return; }
    const destino = L.latLng(carro.lat, carro.lng);
    if (!marcaCarro.current) {
      marcaCarro.current = L.marker(destino, { icon: icone("carro"), zIndexOffset: 1000, keyboard: false }).bindTooltip("Motorista").addTo(m);
      if (!m.getBounds().contains(destino)) enquadrarTudo(m, destino);
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
    if (!m.getBounds().pad(-0.1).contains(destino)) enquadrarTudo(m, destino);
  }, [carro?.lat, carro?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={caixa} className="mapa-real" style={{ height: altura }} role="application" aria-label="Mapa" />;
}
