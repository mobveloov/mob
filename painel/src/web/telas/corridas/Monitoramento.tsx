// Monitoramento (Acompanhamento): corridas dos últimos 10 min e abertas, mensagens não lidas, atualização automática a cada 5 s.
import { useState } from "react";
import { Loader2, MessageCircle, RefreshCw } from "lucide-react";
import { Aviso, GRUPO_CLASSE, Selo, Vazio, hora, op, qs, useDados } from "./comum";
import { JanelaCorrida } from "./JanelaCorrida";
import "./corridas.css";

const GRUPO: Record<string, string> = { procurando: "alerta", a_caminho: "info", no_local: "info", em_andamento: "info", finalizada: "ok", cancelada: "ruim", nao_atendida: "alerta" };

const VAZIO = { passageiro: "", telefone: "", motorista: "", endereco: "", empresa: "", filial: "" };

const COLS: Array<[string, string]> = [["os", "Nº OS"], ["passageiro", "Nome do passageiro"], ["motorista", "Motorista"], ["empresa", "Empresa"], ["statusTexto", "Status"]];
const ordenadas = (l: any[], o: { k: string; d: number }) => (o.k ? [...l].sort((a, b) => o.d * String(a[o.k] ?? "").localeCompare(String(b[o.k] ?? ""), "pt-BR", { numeric: true })) : l);

export default function Monitoramento() {
  const [ordem, setOrdem] = useState<{ k: string; d: number }>({ k: "", d: 1 });
  const [rasc, setRasc] = useState(VAZIO);
  const [f, setF] = useState(VAZIO);
  const [aberta, setAberta] = useState<string | null>(null);
  const { dados, erro, carregando, recarregar } = useDados<any>(() => op(`/monitoramento${qs(f)}`), [JSON.stringify(f)], 5000);
  const campo = (k: keyof typeof VAZIO, r: string, ph = "") => <label className="oc-l" style={{ flex: 1, minWidth: 180 }}>{r}<input value={rasc[k]} onChange={(e) => setRasc({ ...rasc, [k]: e.target.value })} placeholder={ph} /></label>;
  const total = dados?.corridas.length ?? 0;
  return (
    <div className="oc">
      <div className="oc-topo"><h1>Acompanhamento <small>Corridas Pendentes de Atendimento</small></h1></div>
      <div className="oc-card">
        <h3>Filtrar</h3>
        <form className="oc-fila" style={{ alignItems: "flex-end" }} onSubmit={(e) => { e.preventDefault(); setF(rasc); }}>
          {campo("passageiro", "Nome do passageiro")}{campo("telefone", "Telefone do passageiro", "11 96123-4567")}{campo("motorista", "Nome/VTR do motorista")}{campo("endereco", "Endereço de partida")}
          <label className="oc-l" style={{ flex: 1, minWidth: 180 }}>Empresa<select value={rasc.empresa} onChange={(e) => setRasc({ ...rasc, empresa: e.target.value })}><option value="">Selecione</option>{(dados?.empresas ?? []).map((n: string) => <option key={n}>{n}</option>)}</select></label>
          {!!dados?.filiais?.length && <label className="oc-l" style={{ flex: 1, minWidth: 180 }}>Filial<select value={rasc.filial} onChange={(e) => setRasc({ ...rasc, filial: e.target.value })}><option value="">Todas</option>{dados.filiais.map((x: { id: string; nome: string }) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>}
          <button className="oc-btn pri" type="submit"><RefreshCw size={16} className={carregando ? "gira" : ""} /> Filtrar</button>
          <button className="oc-btn" type="button" onClick={() => { setRasc(VAZIO); setF(VAZIO); }}>Limpar filtros</button>
        </form>
      </div>
      <Aviso texto={erro} erro />
      <div className="oc-card">
        <h3><MessageCircle size={13} /> Mensagens não lidas <Selo tom={dados?.chats.length ? "ruim" : ""}>{dados?.chats.length ?? 0} Novas</Selo></h3>
        {dados && !dados.chats.length && <p className="suave" style={{ margin: 0 }}>Nenhuma mensagem nova.</p>}
        <div className="oc-fila" style={{ overflowX: "auto", flexWrap: "nowrap", paddingBottom: 6 }}>
          {dados?.chats.map((c: any) => (
            <button key={c.corridaId} className="oc-card" style={{ minWidth: 230, textAlign: "left", cursor: "pointer", marginBottom: 0, color: "inherit" }} onClick={() => setAberta(c.corridaId)}>
              <b>{c.nome}</b> <Selo tom="info">OS {c.os}</Selo><br /><span className="suave">{c.preview}</span><br /><small className="suave">{c.qtd} nova(s) · {hora(c.em)}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="oc-card">
        {carregando && !dados && <Vazio><Loader2 size={16} className="gira" /> Carregando...</Vazio>}
        {dados && !dados.corridas.length && <Vazio>Nenhum resultado encontrado.</Vazio>}
        {!!total && <><p className="suave" style={{ marginTop: 0 }}>Exibindo 1-{total} de {total} {total === 1 ? "resultado" : "resultados"}.</p><div className="oc-rola"><table>
          <thead><tr>{COLS.map(([k, r]) => <th key={k} style={{ cursor: "pointer" }} aria-sort={ordem.k === k ? (ordem.d > 0 ? "ascending" : "descending") : "none"} onClick={() => setOrdem({ k, d: ordem.k === k ? -ordem.d : 1 })}>{r}{ordem.k === k ? (ordem.d > 0 ? " ▲" : " ▼") : ""}</th>)}</tr></thead>
          <tbody>{ordenadas(dados.corridas, ordem).map((c: any) => (
            <tr key={c.id} className="clic" onClick={() => setAberta(c.id)}>
              <td className="forte">{c.os}</td>
              <td>{c.passageiro}<br /><small className="corta suave">{c.embarque}</small></td>
              <td>{c.motorista || "---"}</td>
              <td>{c.empresa || "---"}</td>
              <td><Selo tom={GRUPO[c.status] ?? GRUPO_CLASSE.aberta}>{c.statusTexto}</Selo></td>
            </tr>))}</tbody></table></div></>}
      </div>
      {aberta && <JanelaCorrida id={aberta} onFechar={() => setAberta(null)} onMudou={recarregar} />}
    </div>
  );
}
