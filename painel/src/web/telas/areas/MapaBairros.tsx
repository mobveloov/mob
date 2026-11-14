// Corridas › Mapa de Bairros e Demanda: demanda por bairro no mapa (Leaflet + OpenStreetMap), com filtros por situação do passageiro,
// bairros desertos, lista de passageiros por bairro e exportação (CSV, XML, copiar telefones). Dados reais da empresa.
// Servidor: /api/areas/bairros.

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Download, Maximize2, Crosshair } from "lucide-react";
import { useCarregar } from "../../componentes/ui";
import { Cabecalho, Janela, useAviso, Vazio } from "../cadastro/base";
import { baixar, chamarAreas, usePeriodo } from "./comum";

type Situacao = "nunca" | "ativos" | "naoAtendidas" | "canceladas" | "concluidas";
interface Bairro { bairro: string; cidade: string; lat: number | null; lng: number | null; corridas: number; passageiros: number; deserto: boolean; nunca: number; ativos: number; naoAtendidas: number; canceladas: number; concluidas: number }
interface Passageiro { nome: string; telefone: string; bairro: string; situacoes: Situacao[] }
interface Resposta { bairros: Bairro[]; passageiros: Passageiro[]; totais: Record<string, number> }

const ROTULO: Record<Situacao, string> = { nunca: "Nunca pediram", ativos: "Já pediram", naoAtendidas: "Não atendidas", canceladas: "Canceladas", concluidas: "Concluídas" };
const COR: Record<Situacao, string> = { nunca: "#ef4444", ativos: "#22c55e", naoAtendidas: "#eab308", canceladas: "#a855f7", concluidas: "#3b82f6" };
const ORDEM: Situacao[] = ["nunca", "ativos", "naoAtendidas", "canceladas", "concluidas"];

function Mapa({ bairros, ativas, desertos, onEscolher, centralizar, cheio }: { bairros: Bairro[]; ativas: Situacao[]; desertos: boolean; onEscolher: (b: Bairro) => void; centralizar: number; cheio: boolean }) {
  const caixa = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const camada = useRef<L.LayerGroup | null>(null);
  const aoEscolher = useRef(onEscolher);
  aoEscolher.current = onEscolher;
  const pontos = useRef<L.LatLngExpression[]>([]);

  useEffect(() => {
    if (!caixa.current || mapa.current) return;
    const m = L.map(caixa.current, { center: [-14.2, -51.9], zoom: 4 });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
    L.control.scale({ imperial: false }).addTo(m);
    camada.current = L.layerGroup().addTo(m);
    mapa.current = m;
    return () => { m.remove(); mapa.current = null; };
  }, []);

  useEffect(() => {
    const m = mapa.current, g = camada.current;
    if (!m || !g) return;
    g.clearLayers();
    pontos.current = [];
    for (const b of bairros) {
      if (b.lat == null || b.lng == null) continue;
      const doBairro = ativas.filter((s) => b[s] > 0);
      const total = ativas.reduce((a, s) => a + b[s], 0);
      const ehDeserto = b.deserto && desertos;
      if (!total && !ehDeserto) continue;
      const dominante = doBairro.sort((x, y) => b[y] - b[x])[0];
      const cor = ehDeserto && !total ? "#6b7280" : COR[dominante ?? "ativos"];
      const c = L.circleMarker([b.lat, b.lng], { radius: Math.min(36, 8 + Math.sqrt(total) * 4), color: cor, weight: 2, fillColor: cor, fillOpacity: ehDeserto && !total ? 0.05 : 0.35 });
      const linhas = ORDEM.filter((s) => b[s] > 0).map((s) => `${ROTULO[s]}: ${b[s]}`).join("<br>");
      c.bindTooltip(`<strong>${b.bairro.replace(/[<>&]/g, "")}</strong><br>${linhas || "Sem corridas no período (deserto)"}`);
      c.on("click", () => aoEscolher.current(b));
      c.addTo(g);
      pontos.current.push([b.lat, b.lng]);
    }
    if (pontos.current.length) m.fitBounds(L.latLngBounds(pontos.current), { padding: [30, 30], maxZoom: 14 });
  }, [bairros, ativas, desertos]);

  useEffect(() => { // centralizar e tela cheia
    const m = mapa.current;
    if (!m) return;
    setTimeout(() => { m.invalidateSize(); if (pontos.current.length) m.fitBounds(L.latLngBounds(pontos.current), { padding: [30, 30], maxZoom: 14 }); }, 60);
  }, [centralizar, cheio]);

  return <div ref={caixa} className="cg-mapa" />;
}

export default function MapaBairros() {
  const { qs, controle } = usePeriodo();
  const r = useCarregar(() => chamarAreas<Resposta>(`/bairros?${qs}`), [qs]);
  const [ativas, setAtivas] = useState<Situacao[]>(ORDEM);
  const [desertos, setDesertos] = useState(true);
  const [cheio, setCheio] = useState(false);
  const [centralizar, setCentralizar] = useState(0);
  const [aberto, setAberto] = useState<Bairro | null>(null);
  const { aviso, tentar, setAviso } = useAviso();
  const d = r.dados;
  const alternar = (s: Situacao) => setAtivas(ativas.includes(s) ? ativas.filter((x) => x !== s) : [...ativas, s]);
  const bairros = (d?.bairros ?? []).filter((b) => b.bairro !== "Não informado" || b.nunca || b.ativos);

  return (
    <div className="cg-pagina-solta ar-pagina">
      {aviso}
      <Cabecalho titulo="Mapeamento de Bairros e Demanda" sub="Passageiros ativos, desertos e cancelamentos por bairro">
        <div>{controle}</div>
        <button className="cg-botao" onClick={() => void tentar(() => baixar(`/bairros/csv?${qs}&situacao=todos`, "bairros.csv"))}><Download size={15} /> CSV</button>
        <button className="cg-botao" onClick={() => void tentar(() => baixar(`/bairros/xml?${qs}&situacao=todos`, "bairros.xml"))}><Download size={15} /> XML</button>
        <button className="cg-botao" onClick={() => void tentar(async () => { await navigator.clipboard.writeText((d?.passageiros ?? []).map((p) => p.telefone).join("\n")); setAviso({ texto: "Telefones copiados." }); })}>Copiar telefones</button>
      </Cabecalho>
      {r.erro && <div className="cg-aviso erro">{r.erro}</div>}
      <div className="ar-filtros" role="group" aria-label="Situação dos passageiros">
        {ORDEM.map((s) => (
          <label key={s}><input type="checkbox" checked={ativas.includes(s)} onChange={() => alternar(s)} /><i className="ar-ponto" style={{ background: COR[s] }} />{ROTULO[s]} ({d?.totais[s] ?? 0})</label>))}
        <label><input type="checkbox" checked={desertos} onChange={() => setDesertos(!desertos)} /><i className="ar-ponto" style={{ background: "#6b7280" }} />Desertos ({d?.totais.desertos ?? 0})</label>
        <button className="cg-botao" onClick={() => setAtivas(ORDEM)}>Todos ({d?.totais.todos ?? 0})</button>
        <button className="cg-botao" onClick={() => setCentralizar(centralizar + 1)}><Crosshair size={14} /> Centralizar</button>
        <button className="cg-botao" onClick={() => setCheio(!cheio)}><Maximize2 size={14} /> {cheio ? "Sair da tela cheia" : "Tela cheia"}</button>
      </div>
      <div className={`ar-mapa-caixa ${cheio ? "cheio" : ""}`}>
        {cheio && <button className="cg-botao primario ar-sair" onClick={() => setCheio(false)}>Sair da tela cheia</button>}
        <Mapa bairros={bairros} ativas={ativas} desertos={desertos} onEscolher={setAberto} centralizar={centralizar} cheio={cheio} />
      </div>
      <div className="ar-lista-bairros">
        {!bairros.length ? <div className="cg-tabela-caixa"><Vazio titulo="Nenhum bairro com dados." sub="Os bairros vêm do endereço de embarque das corridas." /></div> : (
          <div className="cg-tabela-caixa"><div className="cg-rolagem"><table className="cg-tabela">
            <thead><tr><th>Bairro</th><th className="centro">Corridas</th><th className="centro">Passageiros</th>{ORDEM.map((s) => <th key={s} className="centro">{ROTULO[s]}</th>)}<th /></tr></thead>
            <tbody>{bairros.map((b) => (
              <tr key={`${b.bairro}|${b.cidade}`}>
                <td><strong>{b.bairro}</strong>{b.cidade && <small className="cg-mono"> {b.cidade}</small>}{b.deserto && <small className="cg-mono"> · deserto</small>}</td>
                <td className="centro">{b.corridas}</td><td className="centro">{b.passageiros}</td>
                {ORDEM.map((s) => <td key={s} className="centro">{b[s] || "—"}</td>)}
                <td className="direita"><button className="cg-botao" onClick={() => setAberto(b)}>Ver passageiros</button></td>
              </tr>))}</tbody>
          </table></div></div>
        )}
      </div>
      {aberto && <ListaBairro bairro={aberto} passageiros={d?.passageiros ?? []} qs={qs} onFechar={() => setAberto(null)} />}
    </div>
  );
}

function ListaBairro({ bairro, passageiros, qs, onFechar }: { bairro: Bairro; passageiros: Passageiro[]; qs: string; onFechar: () => void }) {
  const [filtro, setFiltro] = useState<"todos" | Situacao>("todos");
  const { aviso, tentar, setAviso } = useAviso();
  const doBairro = passageiros.filter((p) => p.bairro === bairro.bairro);
  const lista = doBairro.filter((p) => filtro === "todos" || p.situacoes.includes(filtro));
  const alvo = `situacao=${filtro}&bairro=${encodeURIComponent(bairro.bairro)}`;
  return (
    <Janela aberta titulo={bairro.bairro} sub={`${doBairro.length} passageiro(s)`} onFechar={onFechar} largura="media" rodape={<button className="cg-botao" onClick={onFechar}>Fechar</button>}>
      {aviso}
      <div className="ar-filtros">
        {(["todos", ...ORDEM] as const).map((s) => (
          <button key={s} className={`cg-botao ${filtro === s ? "primario" : ""}`} onClick={() => setFiltro(s)}>{s === "todos" ? "Todos" : ROTULO[s]} ({s === "todos" ? doBairro.length : doBairro.filter((p) => p.situacoes.includes(s)).length})</button>))}
      </div>
      <div className="cg-acoes" style={{ marginBottom: 10 }}>
        <button className="cg-botao" onClick={() => void tentar(() => baixar(`/bairros/csv?${qs}&${alvo}`, `bairro-${filtro}.csv`))}><Download size={14} /> CSV</button>
        <button className="cg-botao" onClick={() => void tentar(() => baixar(`/bairros/xml?${qs}&${alvo}`, `bairro-${filtro}.xml`))}><Download size={14} /> XML</button>
        <button className="cg-botao" onClick={() => void tentar(async () => { await navigator.clipboard.writeText(lista.map((p) => p.telefone).join("\n")); setAviso({ texto: "Telefones copiados." }); })}>Copiar telefones</button>
      </div>
      {!lista.length ? <Vazio titulo="Ninguém neste filtro." /> : (
        <div className="cg-rolagem"><table className="cg-tabela"><thead><tr><th>Nome</th><th>Telefone</th><th>Situação</th></tr></thead>
          <tbody>{lista.map((p) => <tr key={p.telefone}><td>{p.nome}</td><td>{p.telefone}</td><td>{p.situacoes.map((s) => ROTULO[s]).join(", ")}</td></tr>)}</tbody></table></div>
      )}
    </Janela>
  );
}
