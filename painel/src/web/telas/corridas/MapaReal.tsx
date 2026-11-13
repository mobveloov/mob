// Mapa Real-Time: motoristas dos apps no mapa (Leaflet + OpenStreetMap), com indicadores e filtros.
import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, RefreshCw } from "lucide-react";
import { Aviso, L, Selo, fone, hora, op, pino, useDados, useMapa, zap } from "./comum";
import "./corridas.css";

const SIT: Record<string, { rotulo: string; cor: string; tom: string }> = {
  livre: { rotulo: "Livre", cor: "#22c55e", tom: "ok" }, chamada: { rotulo: "Recebendo chamada", cor: "#a78bfa", tom: "rox" }, a_caminho: { rotulo: "A caminho", cor: "#3b82f6", tom: "info" },
  no_local: { rotulo: "Aguardando", cor: "#f59e0b", tom: "alerta" }, em_andamento: { rotulo: "Em andamento", cor: "#ef4444", tom: "ruim" }, offline: { rotulo: "Desconectado", cor: "#64748b", tom: "" },
};

export default function MapaReal() {
  const { dados, erro, carregando, recarregar } = useDados<any>(() => op("/mapa"), [], 10_000);
  const [sit, setSit] = useState("");
  const [cat, setCat] = useState("");
  const [busca, setBusca] = useState("");
  const [offline, setOffline] = useState(false);
  const { ref, mapa } = useMapa([-15.78, -47.93], 12);
  const camada = useRef<L.LayerGroup | null>(null);
  const ajustou = useRef(false);

  const lista = useMemo(() => (dados?.motoristas ?? []).filter((m: any) =>
    (offline || m.situacao !== "offline") && (!sit || m.situacao === sit) && (!cat || !m.categorias || m.categorias.split(",").map((x: string) => x.trim()).includes(cat))
    && (!busca || `${m.nome} ${m.placa}`.toLowerCase().includes(busca.toLowerCase()))), [dados, sit, cat, busca, offline]);

  useEffect(() => {
    if (!mapa) return;
    camada.current?.remove();
    const g = L.layerGroup().addTo(mapa); camada.current = g;
    const pts: Array<[number, number]> = [];
    for (const m of lista) {
      if (m.lat == null) continue;
      const s = SIT[m.situacao] ?? SIT.offline;
      L.marker([m.lat, m.lng], { icon: pino(s.cor, "🚗") })
        .bindPopup(`<b>${m.nome}</b><br>${[m.veiculo, m.placa].filter(Boolean).join(" · ")}<br>${s.rotulo}${m.corrida ? `<br>OS ${m.corrida.os} · ${m.corrida.passageiro}` : ""}<br><small>Posição às ${hora(m.atualizadoEm)}</small>`).addTo(g);
      pts.push([m.lat, m.lng]);
    }
    if (pts.length && !ajustou.current) { mapa.fitBounds(L.latLngBounds(pts).pad(0.3), { maxZoom: 14 }); ajustou.current = true; }
  }, [mapa, lista]);

  const s = dados?.stats;
  const k = (r: string, v: number | undefined, tom = "") => <div className={`oc-kpi ${tom}`}><span>{r}</span><strong>{v ?? 0}</strong></div>;
  return (
    <div className="oc">
      <div className="oc-topo"><h1>Mapa Real-Time <small>Motoristas online nos apps · atualiza a cada 10 s</small></h1>
        <button className="oc-btn" onClick={recarregar}><RefreshCw size={16} className={carregando ? "gira" : ""} /> Atualizar</button></div>
      <Aviso texto={erro} erro />
      <div className="oc-kpis">
        {k("Conectados", s?.conectados, "ok")}{k("Livres", s?.livres, "ok")}{k("A caminho", s?.aCaminho, "info")}{k("Aguardando", s?.aguardando, "alerta")}{k("Em andamento", s?.emAndamento, "ruim")}{k("Desconectados", s?.desconectados)}
      </div>
      <div className="oc-card oc-fila">
        <input style={{ maxWidth: 260 }} placeholder="Buscar motorista ou placa..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select style={{ maxWidth: 200 }} value={sit} onChange={(e) => setSit(e.target.value)} aria-label="Situação"><option value="">Todas as situações</option>{Object.entries(SIT).map(([k2, v]) => <option key={k2} value={k2}>{v.rotulo}</option>)}</select>
        <select style={{ maxWidth: 200 }} value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoria"><option value="">Todas as categorias</option>{(dados?.categorias ?? []).map((c: string) => <option key={c}>{c}</option>)}</select>
        <button className={`oc-chip ${offline ? "on" : ""}`} onClick={() => setOffline(!offline)}>{offline ? <Eye size={13} /> : <EyeOff size={13} />} Desconectados</button>
      </div>
      <div className="oc-card" style={{ padding: 0, overflow: "hidden" }}><div ref={ref} className="oc-mapa" style={{ height: 460 }} /></div>
      <div className="oc-card">
        <h3>Motoristas ({lista.length})</h3>
        {!lista.length ? <p className="oc-vazio">Nenhum motorista nesta visão.</p> : <div className="oc-rola"><table>
          <thead><tr><th>Motorista</th><th>Veículo</th><th>Situação</th><th>Corrida</th><th>Posição</th><th>Contato</th></tr></thead>
          <tbody>{lista.map((m: any) => { const s2 = SIT[m.situacao] ?? SIT.offline; return (
            <tr key={m.id} className={m.lat != null ? "clic" : ""} onClick={() => m.lat != null && mapa?.setView([m.lat, m.lng], 16)}>
              <td className="forte">{m.nome}</td><td>{[m.veiculo, m.placa].filter(Boolean).join(" · ") || "—"}</td><td><Selo tom={s2.tom}>{s2.rotulo}</Selo></td>
              <td>{m.corrida ? `OS ${m.corrida.os} · ${m.corrida.passageiro}` : "—"}</td><td>{m.atualizadoEm ? `às ${hora(m.atualizadoEm)}` : "sem posição"}</td>
              <td>{m.telefone ? <a href={zap(m.telefone)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{fone(m.telefone)}</a> : "—"}</td></tr>); })}</tbody></table></div>}
      </div>
    </div>
  );
}
