// Mapa Real-Time: motoristas dos apps no mapa (Leaflet + OpenStreetMap), com indicadores e filtros.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, EyeOff, MoreVertical } from "lucide-react";
import { Aviso, L, Selo, hora, op, pino, qs, useDados, useMapa } from "./comum";
import "./corridas.css";
import { ajustarSeguro } from "../../../comum/mapa-seguro.ts";
import { dentroDaCobertura } from "../../../comum/mapa-centro.ts";
import { decimal } from "../../../comum/formato-br.ts";

const SIT: Record<string, { rotulo: string; cor: string; tom: string }> = {
  livre: { rotulo: "Livre", cor: "#22c55e", tom: "ok" }, chamada: { rotulo: "Recebendo chamada", cor: "#a78bfa", tom: "rox" }, a_caminho: { rotulo: "A caminho", cor: "#3b82f6", tom: "info" },
  no_local: { rotulo: "Aguardando", cor: "#f59e0b", tom: "alerta" }, em_andamento: { rotulo: "Em andamento", cor: "#ef4444", tom: "ruim" }, offline: { rotulo: "Desconectado", cor: "#64748b", tom: "" },
};

/** "há 12 min", "há 3 h", "ontem", "há 5 dias" (a partir de um instante ISO real); sem registro: "sem registro". */
export function tempoDesde(iso?: string | null, agora = Date.now()): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return "sem registro";
  const min = Math.max(0, Math.round((agora - t) / 60_000));
  if (min < 1) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
}

export default function MapaReal() {
  const [filial, setFilial] = useState("");
  const { dados, erro, carregando } = useDados<any>(() => op(`/mapa${qs({ filial })}`), [filial], 10_000);
  const [sit, setSit] = useState("");
  const [cat, setCat] = useState("");
  const [busca, setBusca] = useState("");
  // Quem aparece: conectados (padrão), desconectados (pin cinza na última posição) ou todos.
  const [exibir, setExibir] = useState<"conectados" | "desconectados" | "ambos">("conectados");
  const offline = exibir !== "conectados";
  // O mapa abre na cidade da filial escolhida (ou ajusta para caber todas), com a área de cobertura desenhada.
  const { ref, mapa, vista } = useMapa(undefined, 12, true, { filial });
  const camada = useRef<L.LayerGroup | null>(null);
  const ajustou = useRef(false);

  const lista = useMemo(() => (dados?.motoristas ?? []).filter((m: any) =>
    (sit ? m.situacao === sit : exibir === "ambos" || (exibir === "conectados") === (m.situacao !== "offline")) && (!cat || !m.categorias || m.categorias.split(",").map((x: string) => x.trim()).includes(cat))
    && (!busca || `${m.nome} ${m.placa}`.toLowerCase().includes(busca.toLowerCase()))), [dados, sit, cat, busca, exibir]);

  useEffect(() => {
    if (!mapa) return;
    camada.current?.remove();
    const g = L.layerGroup().addTo(mapa); camada.current = g;
    const pts: Array<[number, number]> = [];
    const areas = vista?.areas ?? [];
    for (const m of lista) {
      if (m.lat == null) continue;
      const s = SIT[m.situacao] ?? SIT.offline;
      // Dentro da área: pino cheio com o status. Fora dela: ponto pequeno e apagado.
      const dentro = dentroDaCobertura(m.lat, m.lng, areas);
      const off = m.situacao === "offline";
      L.marker([m.lat, m.lng], { icon: dentro ? pino(s.cor, "🚗") : pino(s.cor, "", "ponto"), opacity: off ? 0.75 : dentro ? 1 : 0.55, zIndexOffset: off ? -800 : dentro ? 0 : -500 })
        .bindPopup(`<b>${m.nome}</b><br>${[m.veiculo, m.placa].filter(Boolean).join(" · ")}<br>${s.rotulo}${m.corrida ? `<br>OS ${m.corrida.os} · ${m.corrida.passageiro}` : ""}<br><small>${off ? `Último contato ${tempoDesde(m.ultimoContatoEm)} (última posição conhecida)` : `Posição às ${hora(m.atualizadoEm)}`}${dentro ? "" : " · fora da área de cobertura"}</small>`).addTo(g);
      pts.push([m.lat, m.lng]);
    }
    // Só sem centro nenhum (empresa nova) o mapa se ajusta aos motoristas.
    if (pts.length && !ajustou.current && vista && !vista.centro) { if (ajustarSeguro(mapa, L.latLngBounds(pts).pad(0.3), { maxZoom: 14 })) ajustou.current = true; }
  }, [mapa, lista, vista]);

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
        {([["conectados", "Conectados"], ["desconectados", "Desconectados"], ["ambos", "Ambos"]] as const).map(([v, r]) => (
          <button key={v} className={`oc-chip ${exibir === v ? "on" : ""}`} aria-pressed={exibir === v} onClick={() => setExibir(v)}>{exibir === v ? <Eye size={13} /> : <EyeOff size={13} />} {r}</button>
        ))}
      </div>
      <div className="oc-card" style={{ padding: 0, overflow: "hidden" }}>
        <div ref={ref} className="oc-mapa" style={{ height: 460 }} />
        <div className="oc-legenda" aria-label="Legenda do mapa" style={{ display: "flex", flexWrap: "wrap", gap: 12, padding: "8px 12px", fontSize: 12 }}>
          {Object.entries(SIT).filter(([k2]) => k2 !== "offline" || offline).map(([k2, v]) => <span key={k2} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><i style={{ width: 11, height: 11, borderRadius: "50%", background: v.cor, display: "inline-block" }} />{v.rotulo}</span>)}
          {!!vista?.areas.length && <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><i style={{ width: 14, height: 11, borderRadius: 3, border: "2px solid #2563eb", background: "rgba(37,99,235,.12)", display: "inline-block" }} />Área de cobertura{vista.filialId ? ` de ${vista.nome}` : ""}</span>}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, opacity: 0.7 }}><i style={{ width: 8, height: 8, borderRadius: "50%", background: "#64748b", display: "inline-block" }} />Ponto pequeno: fora da área</span>
        </div>
      </div>
      <div className="oc-card">
        {!ordenada.length ? <p className="oc-vazio">Nenhum motorista nesta visão.</p> : <div className="oc-rola"><table>
          <thead><tr>
            <th><button className="oc-x" onClick={() => ordenar("nome")} aria-label="Ordenar por motorista">Motorista ⇅</button></th>
            <th><button className="oc-x" onClick={() => ordenar("situacao")} aria-label="Ordenar por status">Status ⇅</button></th>
            <th>Categorias</th><th>Ações</th></tr></thead>
          <tbody>{ordenada.map((m: any) => { const s2 = SIT[m.situacao] ?? SIT.offline; const cats = String(m.categorias || "").split(",").map((x: string) => x.trim()).filter(Boolean); return (
            <tr key={m.id} className={m.lat != null ? "clic" : ""} onClick={() => m.lat != null && mapa?.setView([m.lat, m.lng], 16)}>
              <td className="forte">{m.nome}<br /><small className="suave">{[m.veiculo, m.placa].filter(Boolean).join(" ") || "—"}</small></td>
              <td><Selo tom={s2.tom}>{s2.rotulo}</Selo>{m.situacao === "offline" && <><br /><small className="suave">Último contato {tempoDesde(m.ultimoContatoEm)}</small></>}{m.corrida && <><br /><small className="suave">OS {m.corrida.os} · {m.corrida.passageiro}</small></>}</td>
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
