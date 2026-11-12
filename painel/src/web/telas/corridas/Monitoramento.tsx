// Monitoramento (Acompanhamento): corridas dos últimos 10 min e abertas, mensagens não lidas, atualização automática a cada 5 s.
import { useState } from "react";
import { Eye, Loader2, MessageCircle, RefreshCw } from "lucide-react";
import { Aviso, GRUPO_CLASSE, Selo, Vazio, dh, fone, hora, op, qs, useDados } from "./comum";
import { JanelaCorrida } from "./JanelaCorrida";
import "./corridas.css";

const GRUPO: Record<string, string> = { procurando: "alerta", a_caminho: "info", no_local: "info", em_andamento: "info", finalizada: "ok", cancelada: "ruim", nao_atendida: "alerta" };

export default function Monitoramento() {
  const [passageiro, setPassageiro] = useState("");
  const [telefone, setTelefone] = useState("");
  const [f, setF] = useState({ passageiro: "", telefone: "" });
  const [aberta, setAberta] = useState<string | null>(null);
  const { dados, erro, carregando, recarregar } = useDados<any>(() => op(`/monitoramento${qs(f)}`), [JSON.stringify(f)], 5000);
  return (
    <div className="oc">
      <div className="oc-topo"><h1>Monitoramento <small>Monitoramento em Tempo Real · <span style={{ color: "var(--oc-ok)" }}>Sistema Online</span></small></h1></div>
      <div className="oc-card">
        <h3>Filtros</h3>
        <form className="oc-fila" style={{ alignItems: "flex-end" }} onSubmit={(e) => { e.preventDefault(); setF({ passageiro, telefone }); }}>
          <label className="oc-l" style={{ flex: 1, minWidth: 180 }}>Passageiro<input value={passageiro} onChange={(e) => setPassageiro(e.target.value)} placeholder="Nome..." /></label>
          <label className="oc-l" style={{ flex: 1, minWidth: 180 }}>Telefone<input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(00) 00000-0000" inputMode="tel" /></label>
          <button className="oc-btn pri" type="submit"><RefreshCw size={16} className={carregando ? "gira" : ""} /> Atualizar</button>
        </form>
        <p className="suave" style={{ marginBottom: 0 }}>Atualização auto a cada 5s</p>
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
        <h3>Corridas Recentes (10 min)</h3>
        {carregando && !dados && <Vazio><Loader2 size={16} className="gira" /> Carregando solicitações...</Vazio>}
        {dados && !dados.corridas.length && <Vazio>Nenhuma corrida recente.</Vazio>}
        {!!dados?.corridas.length && <div className="oc-rola"><table>
          <thead><tr><th>Nº OS / Hora</th><th>Passageiro / Origem</th><th>Motorista</th><th>Status</th><th>Ação</th></tr></thead>
          <tbody>{dados.corridas.map((c: any) => (
            <tr key={c.id} className="clic" onClick={() => setAberta(c.id)}>
              <td><b>{c.os}</b><br /><small>{dh(c.solicitadaEm)}</small></td>
              <td>{c.passageiro}<br /><small className="corta">{c.embarque}</small></td>
              <td>{c.motorista || "—"}{c.telefoneMotorista && <><br /><small>{fone(c.telefoneMotorista)}</small></>}</td>
              <td><Selo tom={GRUPO[c.status] ?? GRUPO_CLASSE.aberta}>{c.statusTexto}</Selo></td>
              <td><button className="oc-btn peq" onClick={(e) => { e.stopPropagation(); setAberta(c.id); }}><Eye size={14} /> Ver</button></td>
            </tr>))}</tbody></table></div>}
        <p className="suave" style={{ marginBottom: 0 }}>Exibindo {dados?.corridas.length ?? 0} registros</p>
      </div>
      {aberta && <JanelaCorrida id={aberta} onFechar={() => setAberta(null)} onMudou={recarregar} />}
    </div>
  );
}
