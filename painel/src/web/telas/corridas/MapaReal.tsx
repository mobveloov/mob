// Mapa Real-Time: motoristas dos apps no mapa (Leaflet + OpenStreetMap), com indicadores e filtros.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, EyeOff, MoreVertical } from "lucide-react";
import { Aviso, L, Selo, hora, op, pino, qs, useDados, useMapa } from "./comum";
import "./corridas.css";
import { ajustarSeguro } from "../../../comum/mapa-seguro.ts";
import { decimal } from "../../../comum/formato-br.ts";

const SIT: Record<string, { rotulo: string; cor: string; tom: string }> = {
  livre: { rotulo: "Livre", cor: "#22c55e", tom: "ok" }, chamada: { rotulo: "Recebendo chamada", cor: "#a78bfa", tom: "rox" }, a_caminho: { rotulo: "A caminho", cor: "#3b82f6", tom: "info" },
  no_local: { rotulo: "Aguardando", cor: "#f59e0b", tom: "alerta" }, em_andamento: { rotulo: "Em andamento", cor: "#ef4444", tom: "ruim" }, offline: { rotulo: "Desconectado", cor: "#64748b", tom: "" },
};

export default function MapaReal() {
  const [filial, setFilial] = useState("");
  const { dados, erro, carregando } = useDados<any>(() => op(`/mapa${qs({ filial })}`), [filial], 10_000);
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
    if (pts.length && !ajustou.current) { if (ajustarSeguro(mapa, L.latLngBounds(pts).pad(0.3), { maxZoom: 14 })) ajustou.current = true; }
  }, [mapa, lista]);

  const s = dados?.stats;
  const [ordem, setOrdem] = useState<{ por: "nome" | "situacao"; asc: boolean }>({ por: "nome", asc: true });
  const [menu, setMenu] = useState<string | null>(null);
  const ordenada = useMemo(() => [...lista].sort((x: any, y: any) => {
    const vx = ordem.por === "nome" ? x.nome : (SIT[x.situacao]?.rotulo ?? ""), vy = ordem.por === "nome" ? y.nome : (SIT[y.situacao]?.rotulo ?? "");
    return (ordem.asc ? 1 : -1) * String(vx).localeCompare(String(vy), "pt-BR");
  }), [lista, ordem]);
  const ordenar = (por: "nome" | "situacao") => setOrdem({ por, asc: ordem.por === por ? !ordem.asc : true });
  const pct = (n: number | undefined) => (s?.cadastrosAtivos ? `${decimal(((n ?? 0) / s.cadastrosAtivos) * 100, 2)}%` : "0%");
  const k = (r: string, v: number | undefined, tom = "", detalhe = "") => <div className={`oc-kpi ${tom}`}><span>{r}</span><strong>{v ?? 0}</strong>{detalhe && <small>{detalhe}</small>}</div>;
  return (
    <div className="oc">
      <div className="oc-topo"><h1>Mapa de motoristas <small>{carregando ? "Atualizando automaticamente" : "Atualizando automaticamente"}</small></h1></div>
      <Aviso texto={erro} erro />
      <div className="oc-kpis">
        {k("Cadastros ativos", s?.cadastrosAtivos)}{k("Conectados agora", s?.conectados, "ok", pct(s?.conectados))}{k("Desconectados", s?.desconectados, "", pct(s?.desconectados))}
      </div>
      <div className="oc-kpis">
        {k("Livres", s?.livres, "ok")}{k("A caminho", s?.aCaminho, "info")}{k("Aguardando passageiro", s?.aguardando, "alerta")}{k("Em andamento", s?.emAndamento, "ruim")}
      </div>
      <div className="oc-card oc-fila">
        <input style={{ maxWidth: 260 }} placeholder="Buscar" aria-label="Buscar motorista" value={busca} onChange={(e) => setBusca(e.target.value)} />
        {!!dados?.filiais?.length && <select style={{ maxWidth: 200 }} value={filial} onChange={(e) => setFilial(e.target.value)} aria-label="Filial"><option value="">Todas as filiais</option>{dados.filiais.map((x: { id: string; nome: string }) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select>}
        <select style={{ maxWidth: 200 }} value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoria"><option value="">Todas as categorias</option>{(dados?.categorias ?? []).map((c: string) => <option key={c}>{c}</option>)}</select>
        <select style={{ maxWidth: 200 }} value={sit} onChange={(e) => setSit(e.target.value)} aria-label="Situação"><option value="">Todos os status</option>{Object.entries(SIT).map(([k2, v]) => <option key={k2} value={k2}>{v.rotulo}</option>)}</select>
        <button className={`oc-chip ${offline ? "on" : ""}`} onClick={() => setOffline(!offline)}>{offline ? <Eye size={13} /> : <EyeOff size={13} />} Desconectados</button>
      </div>
      <div className="oc-card" style={{ padding: 0, overflow: "hidden" }}><div ref={ref} className="oc-mapa" style={{ height: 460 }} /></div>
      <div className="oc-card">
        {!ordenada.length ? <p className="oc-vazio">Nenhum motorista nesta visão.</p> : <div className="oc-rola"><table>
          <thead><tr>
            <th><button className="oc-x" onClick={() => ordenar("nome")} aria-label="Ordenar por motorista">Motorista ⇅</button></th>
            <th><button className="oc-x" onClick={() => ordenar("situacao")} aria-label="Ordenar por status">Status ⇅</button></th>
            <th>Categorias</th><th>Ações</th></tr></thead>
          <tbody>{ordenada.map((m: any) => { const s2 = SIT[m.situacao] ?? SIT.offline; const cats = String(m.categorias || "").split(",").map((x: string) => x.trim()).filter(Boolean); return (
            <tr key={m.id} className={m.lat != null ? "clic" : ""} onClick={() => m.lat != null && mapa?.setView([m.lat, m.lng], 16)}>
              <td className="forte">{m.nome}<br /><small className="suave">{[m.veiculo, m.placa].filter(Boolean).join(" ") || "—"}</small></td>
              <td><Selo tom={s2.tom}>{s2.rotulo}</Selo>{m.corrida && <><br /><small className="suave">OS {m.corrida.os} · {m.corrida.passageiro}</small></>}</td>
              <td>{cats.slice(0, 2).join(", ") || "—"}{cats.length > 2 && ` +${cats.length - 2}`}</td>
              <td style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
                <button className="oc-btn peq" aria-label={`Ações de ${m.nome}`} onClick={() => setMenu(menu === m.id ? null : m.id)}><MoreVertical size={14} /></button>
                {menu === m.id && <div className="oc-card" style={{ position: "absolute", right: 0, zIndex: 5, minWidth: 190, padding: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                  <Link className="oc-btn peq" style={{ textDecoration: "none" }} to={`/historico?motorista=${encodeURIComponent(m.nome)}`}>Ver Histórico</Link>
                  <Link className="oc-btn peq" style={{ textDecoration: "none" }} to={`/historico?motorista=${encodeURIComponent(m.nome)}`}>Consultar corridas</Link>
                  <Link className="oc-btn peq" style={{ textDecoration: "none" }} to={`/motoristas?editar=${m.id}`}>Adicionar créditos</Link>
                  <Link className="oc-btn peq" style={{ textDecoration: "none" }} to={`/motoristas?editar=${m.id}`}>Editar cadastro</Link>
                </div>}
              </td></tr>); })}</tbody></table></div>}
      </div>
    </div>
  );
}
