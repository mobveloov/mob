import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Flame, MapPin, RefreshCw, TrendingUp } from "lucide-react";
import { Cartao } from "../componentes/ui";
import { useGestor, useRetorno } from "../crm/comum";
import { crm2, dataHora, erroTexto, type Celula, type Cidade } from "./api";
import { baseDoMapa } from "../../comum/mapa-base.ts";
import { ajustarSeguro, invalidarDepois, mapaVivo } from "../../comum/mapa-seguro.ts";

/** CRM › Análises › Mapa de Calor: embarques e desembarques por região (círculos coloridos pela intensidade). */
export default function MapaCalor() {
  const [pontos, setPontos] = useState<Celula[] | null>(null);
  const [cidades, setCidades] = useState<Cidade[]>([]);
  const [erro, setErro] = useState("");
  const [atualizando, setAtualizando] = useState(false);
  const [modo, setModo] = useState<"pickups" | "destinations">("pickups");
  const [cidade, setCidade] = useState("all");
  const caixa = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const camada = useRef<L.LayerGroup | null>(null);
  const gestor = useGestor();
  const { tentar, caixa: retorno } = useRetorno();

  useEffect(() => { crm2.mapa().then((r) => { setPontos(r.celulas); setCidades(r.cidades); }).catch((e) => { setErro(erroTexto(e)); setPontos([]); }); }, []);
  const atualizar = async () => {
    setAtualizando(true); setErro("");
    const r = await tentar(() => crm2.atualizarMapa());
    if (r) { setPontos(r.celulas); setCidades(r.cidades); }
    setAtualizando(false);
  };

  const mostrar = !!pontos?.length;
  // O mapa só existe quando a caixa está na tela.
  useEffect(() => {
    if (!mostrar || !caixa.current || mapa.current) return;
    const m = L.map(caixa.current, { zoomControl: false, attributionControl: false }).setView([-14.2, -51.9], 4);
    baseDoMapa(L, m);
    L.control.zoom({ position: "bottomright" }).addTo(m);
    camada.current = L.layerGroup().addTo(m);
    mapa.current = m;
    return () => { m.remove(); mapa.current = null; camada.current = null; };
  }, [mostrar]);

  useEffect(() => {
    const m = mapa.current, g = camada.current;
    if (!m || !g || !pontos) return;
    g.clearLayers();
    let lista = pontos;
    const c = cidades.find((x) => x.id === cidade);
    if (c && c.lat != null && c.lng != null) {
      const raio = (c.radius_km ?? 15) / 111;
      lista = pontos.filter((p) => Math.abs(p.grid_lat - c.lat!) < raio && Math.abs(p.grid_lng - c.lng!) < raio);
    }
    const valor = (p: Celula) => (modo === "pickups" ? p.pickup_count : p.destination_count);
    const maximo = Math.max(...lista.map(valor), 1);
    const limites: Array<[number, number]> = [];
    for (const p of lista) {
      const n = valor(p);
      if (!n) continue;
      const forca = n / maximo;
      const cor = forca > 0.75 ? "#ef4444" : forca > 0.5 ? "#f97316" : forca > 0.25 ? "#eab308" : "#84cc16";
      L.circle([p.grid_lat, p.grid_lng], { radius: Math.max(40, Math.min(300, n * 5)), color: cor, fillColor: cor, fillOpacity: 0.3 + forca * 0.4, weight: 1 })
        .bindPopup(`<b>${n} ${modo === "pickups" ? "embarques" : "desembarques"}</b><br/>${p.grid_lat.toFixed(3)}, ${p.grid_lng.toFixed(3)}${p.last_ride_at ? `<br/>Última: ${dataHora(p.last_ride_at)}` : ""}`)
        .addTo(g);
      limites.push([p.grid_lat, p.grid_lng]);
    }
    const ajusta = () => { if (limites.length) ajustarSeguro(m, L.latLngBounds(limites), { padding: [60, 60], maxZoom: 15 }); else if (c && c.lat != null && c.lng != null && mapaVivo(m)) m.setView([c.lat, c.lng], 13); };
    ajusta();
    return invalidarDepois(m, 100, ajusta);
  }, [pontos, modo, cidade, cidades, mostrar]);

  if (pontos == null) return <p className="vazio">Carregando...</p>;
  const embarques = pontos.reduce((s, p) => s + p.pickup_count, 0);
  const desembarques = pontos.reduce((s, p) => s + p.destination_count, 0);
  const campo = (p: Celula) => (modo === "pickups" ? p.pickup_count : p.destination_count);
  const top = [...pontos].sort((a, b) => campo(b) - campo(a)).slice(0, 5);
  const maiorTop = top[0] ? campo(top[0]) : 1;

  return (
    <div className="pilha">
      <div className="linha-filtro">
        <p className="sub">Mapa de calor de embarques e desembarques por região</p>
        {gestor && <button className="botao primario" onClick={atualizar} disabled={atualizando}><RefreshCw size={14} className={atualizando ? "girar" : ""} /> Atualizar Dados</button>}
      </div>
      {retorno}
      {erro && <div className="aviso erro">{erro}</div>}
      {!pontos.length ? (
        atualizando ? <p className="vazio">Carregando...</p> : <Cartao><p className="vazio"><Flame size={16} /> Ainda não há corridas com localização para montar o mapa. Quando houver, clique em "Atualizar Dados".</p></Cartao>
      ) : (
        <div className="crm2-mapa-grade">
          <Cartao>
            <div className="linha-filtro">
              <strong style={{ display: "flex", alignItems: "center", gap: 6 }}><Flame size={16} /> Mapa de Calor</strong>
              <div className="acoes">
                <div className="periodo">
                  <button className={modo === "pickups" ? "chip ativo" : "chip"} onClick={() => setModo("pickups")}>Embarques</button>
                  <button className={modo === "destinations" ? "chip ativo" : "chip"} onClick={() => setModo("destinations")}>Desembarques</button>
                </div>
                <select value={cidade} onChange={(e) => setCidade(e.target.value)} aria-label="Cidade">
                  <option value="all">Todas as cidades</option>
                  {cidades.map((c) => <option key={c.id} value={c.id}>{c.name}{c.state ? ` - ${c.state}` : ""}</option>)}
                </select>
              </div>
            </div>
            <div ref={caixa} className="crm2-mapa" />
            <div className="crm2-legenda">
              <span><span className="crm2-bolinha" style={{ background: "#84cc16" }} /> Baixo</span>
              <span><span className="crm2-bolinha" style={{ background: "#eab308" }} /> Médio</span>
              <span><span className="crm2-bolinha" style={{ background: "#f97316" }} /> Alto</span>
              <span><span className="crm2-bolinha" style={{ background: "#ef4444" }} /> Muito Alto</span>
            </div>
          </Cartao>
          <div className="pilha">
            <Cartao titulo="Resumo">
              <div className="crm2-resumo"><span><TrendingUp size={14} /> Total de Embarques</span><strong style={{ color: "var(--alerta)" }}>{embarques}</strong></div>
              <div className="crm2-resumo"><span>Total de Desembarques</span><strong style={{ color: "var(--info)" }}>{desembarques}</strong></div>
              <div className="crm2-resumo"><span>Zonas Ativas</span><strong>{pontos.length}</strong></div>
            </Cartao>
            <Cartao titulo="Top 5 Zonas">
              {!top.length ? <p className="vazio">Sem dados</p> : top.map((z, i) => (
                <div key={i} style={{ marginBottom: 8 }}>
                  <div className="linha-filtro"><span className="sub"><MapPin size={12} /> {z.grid_lat.toFixed(3)}, {z.grid_lng.toFixed(3)}</span><strong>{campo(z)}</strong></div>
                  <div className="crm2-consentimento" style={{ height: 6 }}><span style={{ width: `${Math.max(8, (campo(z) / Math.max(maiorTop, 1)) * 100)}%` }} /></div>
                </div>
              ))}
            </Cartao>
          </div>
        </div>
      )}
    </div>
  );
}
