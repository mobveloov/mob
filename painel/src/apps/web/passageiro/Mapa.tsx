// Mapa em tela cheia (Leaflet + OpenStreetMap, sem chave), em estilo claro ou escuro: minha posição, embarque,
// paradas, destino (com etiqueta), a linha da rota e o carro do motorista andando. No modo "escolher", o centro
// do mapa é o ponto escolhido.

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api, posicaoAgora, type Posicao } from "../comum/api";
import { LocateFixed, Moon, Sun } from "lucide-react";
import { useRota } from "../comum/rota";

export interface PontoMapa { lat: number; lng: number; tipo: "embarque" | "parada" | "destino"; rotulo: string; detalhe?: string }

const BRASIL: L.LatLngExpression = [-15.78, -47.93];
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const SVG_PESSOA = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z"/></svg>`;
const SVG_BANDEIRA = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M5 22V3h2v1h12l-2.5 4.5L19 13H7v9z"/></svg>`;
const SVG_CARRO = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M5 11l1.6-4.4A2 2 0 0 1 8.5 5h7a2 2 0 0 1 1.9 1.6L19 11a2 2 0 0 1 2 2v4a1 1 0 0 1-1 1h-1a2 2 0 0 1-4 0H9a2 2 0 0 1-4 0H4a1 1 0 0 1-1-1v-4a2 2 0 0 1 2-2zm2.2 0h9.6l-1.2-3.4a.8.8 0 0 0-.8-.6H9.2a.8.8 0 0 0-.8.6zM7 15.5A1.5 1.5 0 1 0 7 12.5a1.5 1.5 0 0 0 0 3zm10 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/></svg>`;

function icone(p: PontoMapa, n: number, resumo?: { km: number; minutos: number } | null) {
  const simbolo = p.tipo === "embarque" ? SVG_PESSOA : p.tipo === "destino" ? SVG_BANDEIRA : String(n);
  const etiqueta = `<div class="pino-etiqueta"><small>${esc(p.rotulo)}</small>${p.detalhe ? `<b>${esc(p.detalhe)}</b>` : ""}</div>`;
  const selo = p.tipo === "destino" && resumo ? `<div class="pino-selo"><b>${Math.max(1, Math.round(resumo.minutos))}</b><small>min</small><b>${resumo.km.toFixed(1).replace(".", ",")}</b><small>km</small></div>` : "";
  return L.divIcon({ className: "", html: `<div class="pino pino-${p.tipo}"><span>${simbolo}</span>${selo}${etiqueta}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] });
}
const SVG_MOTO = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19 10a3.5 3.5 0 0 0-1.1.2l-1.2-2.4H18V6h-3v1.6l.9 1.8-2.7 2.6H10l-1.5-3H6v2h1.6l.5 1A3.5 3.5 0 1 0 9.7 14H13l3.5-3.4.6 1.2A3.5 3.5 0 1 0 19 10zM5.5 16a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm13.5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/></svg>`;
export interface CarroPerto { lat: number; lng: number; tipo: "carro" | "moto"; categoria?: string }
const iconePerto = (tipo: "carro" | "moto") => L.divIcon({ className: "", html: `<div class="pino-perto pino-perto-${tipo}" aria-label="${tipo === "moto" ? "Moto disponível" : "Carro disponível"}">${tipo === "moto" ? SVG_MOTO : SVG_CARRO.replace('width="20" height="20"', 'width="16" height="16"')}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] });
const iconeCasa = (n: number) => L.divIcon({ className: "", html: `<span class="casa-num">${n}</span>`, iconSize: [30, 16], iconAnchor: [15, 8] });
const iconeCarro = L.divIcon({ className: "", html: `<div class="pino-carro" aria-label="Motorista">${SVG_CARRO}</div>`, iconSize: [40, 40], iconAnchor: [20, 20] });
const iconeEu = L.divIcon({ className: "", html: `<div class="pino-eu">${SVG_PESSOA}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] });

const CHAVE_TEMA = "tema-mapa-passageiro";
export function Mapa({ pontos = [], carro, alvoCarro, perto, eu: euProp, escuro = false, centralizar = 0, folga = 0, linha = true, aoMover, controles = false, className = "" }: {
  /** Mostra os botões de tema do mapa (claro/escuro) e de atualizar a minha localização. */ controles?: boolean;
  pontos?: PontoMapa[]; carro?: Posicao | null; eu?: Posicao | null; escuro?: boolean;
  /** Para onde o motorista (carro) está indo: desenha o caminho dele pelas ruas até lá, e atualiza enquanto ele anda. */ alvoCarro?: Posicao | null;
  /** Mostra os carros e motos livres por perto desta posição (atualiza sozinho). */ perto?: Posicao | null;
  /** Mude o número para centralizar de novo. */ centralizar?: number;
  /** Espaço (px) coberto pela folha de baixo, para enquadrar acima dela. */ folga?: number;
  linha?: boolean; aoMover?: (centro: Posicao) => void; className?: string;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const [temaEscolhido, setTemaEscolhido] = useState<"claro" | "escuro" | null>(() => { try { return controles ? (localStorage.getItem(CHAVE_TEMA) as "claro" | "escuro" | null) : null; } catch { return null; } });
  const [euLocal, setEuLocal] = useState<Posicao | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const escuroFinal = temaEscolhido ? temaEscolhido === "escuro" : escuro;
  const trocarTema = () => { const novo = escuroFinal ? "claro" : "escuro"; setTemaEscolhido(novo); try { localStorage.setItem(CHAVE_TEMA, novo); } catch { /* sem armazenamento */ } };
  const atualizarLocal = async () => { setAtualizando(true); try { const p = await posicaoAgora(); setEuLocal(p); } catch { /* sem GPS */ } finally { setAtualizando(false); setCentralizarInterno((n) => n + 1); } };
  const [centralizarInterno, setCentralizarInterno] = useState(0);
  const mapa = useRef<L.Map | null>(null);
  const camada = useRef<L.LayerGroup | null>(null);
  const marcaCarro = useRef<L.Marker | null>(null);
  const marcaEu = useRef<L.Marker | null>(null);
  const camadaCasas = useRef<L.LayerGroup | null>(null);
  const camadaPerto = useRef<L.LayerGroup | null>(null);
  const camadaCarroRota = useRef<L.LayerGroup | null>(null);
  const [carrosPerto, setCarrosPerto] = useState<CarroPerto[]>([]);
  const animacao = useRef(0);
  const mover = useRef(aoMover);
  mover.current = aoMover;
  const dados = useRef({ pontos, carro, eu: euProp, folga });
  dados.current = { pontos, carro, eu: euLocal ?? euProp, folga };

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
    camadaCasas.current = L.layerGroup().addTo(m);
    camadaCarroRota.current = L.layerGroup().addTo(m);
    camadaPerto.current = L.layerGroup().addTo(m);
    let espera = 0;
    const casas = async () => {
      const g = camadaCasas.current;
      if (!g) return;
      if (m.getZoom() < 17) { g.clearLayers(); return; }
      const c = m.getCenter(), raio = Math.min(250, Math.max(60, c.distanceTo(m.getBounds().getNorthEast()) * 0.8));
      try {
        const r = await api<{ casas: Array<{ numero: number; lat: number; lng: number }> }>(`/enderecos/casas?lat=${c.lat}&lng=${c.lng}&raio=${Math.round(raio)}`);
        if (!mapa.current) return;
        g.clearLayers();
        for (const x of r.casas) L.marker([x.lat, x.lng], { icon: iconeCasa(x.numero), interactive: false, keyboard: false, zIndexOffset: -500 }).addTo(g);
      } catch { /* sem a base de casas, o mapa fica sem os números */ }
    };
    m.on("moveend", () => { const c = m.getCenter(); mover.current?.({ lat: c.lat, lng: c.lng }); clearTimeout(espera); espera = window.setTimeout(() => void casas(), 350); });
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
    const eu = euLocal ?? euProp;
    if (!eu) { marcaEu.current?.remove(); marcaEu.current = null; return; }
    if (!marcaEu.current) {
      marcaEu.current = L.marker([eu.lat, eu.lng], { icon: iconeEu, keyboard: false, interactive: false }).addTo(m);
      if (!dados.current.pontos.length && !dados.current.carro) enquadrar();
    } else marcaEu.current.setLatLng([eu.lat, eu.lng]);
  }, [euProp?.lat, euProp?.lng, euLocal?.lat, euLocal?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // Caminho pelas ruas (OSRM, pelo servidor). Sem ele a linha não é desenhada: nunca em linha reta.
  const { linha: caminho, km: kmRota, minutos: minRota } = useRota(linha ? pontos : []);

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
    for (const p of pontos) L.marker([p.lat, p.lng], { icon: icone(p, p.tipo === "parada" ? ++n : 0, kmRota != null && minRota != null ? { km: kmRota, minutos: minRota } : null), title: p.rotulo, keyboard: false }).addTo(g);
    enquadrar();
  }, [chave, linha, caminho, kmRota, minRota]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (centralizar || centralizarInterno) enquadrar(); }, [centralizar, centralizarInterno]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(enquadrar, 50); return () => clearTimeout(t); }, [folga]); // eslint-disable-line react-hooks/exhaustive-deps

  // Carros e motos livres por perto (na hora de pedir): consulta de tempo em tempo.
  const perLat = perto?.lat, perLng = perto?.lng;
  useEffect(() => {
    if (perLat == null || perLng == null) { setCarrosPerto([]); return; }
    let vivo = true;
    const buscar = async () => {
      try { const r = await api<{ motoristas: CarroPerto[] }>(`/motoristas-perto?lat=${perLat}&lng=${perLng}`); if (vivo) setCarrosPerto(r.motoristas); } catch { /* sem a lista, não mostra */ }
    };
    void buscar();
    const t = setInterval(() => void buscar(), 8000);
    return () => { vivo = false; clearInterval(t); };
  }, [perLat != null ? perLat.toFixed(3) : "", perLng != null ? perLng.toFixed(3) : ""]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const g = camadaPerto.current;
    if (!g) return;
    g.clearLayers();
    for (const c of carrosPerto) L.marker([c.lat, c.lng], { icon: iconePerto(c.tipo), interactive: false, keyboard: false, title: c.categoria }).addTo(g);
  }, [carrosPerto]);

  // Caminho do motorista até o embarque (ou destino), pelas ruas; refaz enquanto ele anda.
  const { linha: caminhoCarro } = useRota(carro && alvoCarro ? [carro, alvoCarro] : [], 12000, 4, true);
  useEffect(() => {
    const g = camadaCarroRota.current;
    if (!g) return;
    g.clearLayers();
    if (!caminhoCarro || caminhoCarro.length < 2) return;
    const cor = getComputedStyle(document.documentElement).getPropertyValue("--cor").trim() || "#1a73e8";
    L.polyline(caminhoCarro, { color: "#111111", weight: 9, opacity: 0.85, lineJoin: "round" }).addTo(g);
    L.polyline(caminhoCarro, { color: cor, weight: 5, opacity: 1, lineJoin: "round" }).addTo(g);
  }, [caminhoCarro]);

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

  return (
    <>
      <div ref={caixa} className={`mapa-cheio ${escuroFinal ? "mapa-escuro" : "mapa-claro"} ${className}`} role="application" aria-label="Mapa" />
      {controles && (
        <div className="mapa-controles">
          <button type="button" aria-label={escuroFinal ? "Mapa claro" : "Mapa escuro"} onClick={trocarTema}>{escuroFinal ? <Sun size={22} /> : <Moon size={22} />}</button>
          <button type="button" aria-label="Atualizar minha localização" onClick={() => void atualizarLocal()} disabled={atualizando}>{atualizando ? <span className="girando" style={{ width: 18, height: 18, borderWidth: 2 }} /> : <LocateFixed size={22} />}</button>
        </div>
      )}
    </>
  );
}
