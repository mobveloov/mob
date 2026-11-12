// Retorno/Ocorrências: corridas que falharam (canceladas e não atendidas) na última hora, com painel lateral de detalhes.
import { useState } from "react";
import { ExternalLink, MapPin } from "lucide-react";
import { Aviso, Dado, Janela, Paginacao, Selo, Vazio, fone, hora, op, qs, reais, useDados } from "./comum";
import { JanelaCorrida } from "./JanelaCorrida";
import "./corridas.css";

export default function Ocorrencias() {
  const [auto, setAuto] = useState(true);
  const [horas, setHoras] = useState(1);
  const [pagina, setPagina] = useState(1);
  const [sel, setSel] = useState<any>(null);
  const [corrida, setCorrida] = useState<string | null>(null);
  const { dados, erro, carregando } = useDados<any>(() => op(`/ocorrencias${qs({ horas, pagina })}`), [horas, pagina], auto ? 15_000 : undefined);
  return (
    <div className="oc">
      <div className="oc-topo">
        <div><h1>Ocorrências</h1><p className="suave" style={{ margin: "2px 0 0" }}>Monitoramento em Tempo Real ({horas}h)</p></div>
        <div className="oc-fila">
          <select value={horas} onChange={(e) => { setHoras(Number(e.target.value)); setPagina(1); }} aria-label="Janela de tempo" style={{ width: 130 }}>{[1, 3, 6, 12, 24, 72].map((h) => <option key={h} value={h}>Últimas {h}h</option>)}</select>
          <label className="oc-sw"><input type="checkbox" id="autoUpdate" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto-Refresh</label>
        </div>
      </div>
      <Aviso texto={erro} erro />
      {(dados?.avisos ?? []).map((a: string) => <Aviso key={a} texto={a} />)}
      <div className="oc-card">
        {carregando && !dados && <Vazio>...</Vazio>}
        {dados && !dados.total && <Vazio>Nenhuma ocorrência no período.</Vazio>}
        {!!dados?.total && <>
          <div className="oc-rola"><table><thead><tr><th>Hora</th><th>OS</th><th>Detalhe da Falha</th><th>Passageiro</th><th>Motorista</th><th>Status</th></tr></thead>
            <tbody>{dados.itens.map((o: any) => (
              <tr key={o.id} className="clic" onClick={() => setSel(o)}>
                <td>{hora(o.hora)}</td><td className="forte">{o.os}</td><td className="corta" style={{ maxWidth: 320 }}>{o.motivo}</td><td>{o.passageiro}</td><td>{o.motorista || "—"}</td>
                <td><Selo tom={o.grupo === "cancelada" ? "ruim" : "alerta"}>{o.statusTexto}</Selo></td></tr>))}</tbody></table></div>
          <Paginacao pagina={dados.pagina} paginas={dados.paginas} total={dados.total} onMudar={setPagina} rotulo="ocorrências" />
        </>}
      </div>
      {sel && (
        <Janela onFechar={() => setSel(null)} titulo={`Ocorrência #${sel.os}`} sub={`${hora(sel.hora)} · ${sel.statusTexto}`} tamanho="estreita"
          rodape={<>{sel.id.startsWith("propria:") && <button className="oc-btn" onClick={() => { setCorrida(sel.id); setSel(null); }}><ExternalLink size={14} /> Abrir corrida</button>}<button className="oc-btn pri" onClick={() => setSel(null)}>Fechar Detalhes</button></>}>
          <div className="oc-aviso erro"><b>Motivo do Problema</b><br />{sel.motivo}</div>
          <Dado r="Passageiro" v={sel.passageiro} /><Dado r="Telefone" v={fone(sel.telefone)} />
          <div className="oc-trajeto" style={{ margin: "14px 0" }}><div><i /><small>Origem</small><b>{sel.embarque}</b></div><div className="dest"><i /><small>Destino</small><b>{sel.destino || "Sem destino"}</b></div></div>
          <Dado r="Motorista" v={sel.motorista} /><Dado r="Valor Perdido" v={reais(sel.valorPerdido)} />
          <p className="suave"><MapPin size={12} /> {sel.grupo === "nao_atendida" ? "Nenhum motorista aceitou a corrida." : "A corrida foi cancelada antes de terminar."}</p>
        </Janela>
      )}
      {corrida && <JanelaCorrida id={corrida} onFechar={() => setCorrida(null)} />}
    </div>
  );
}
