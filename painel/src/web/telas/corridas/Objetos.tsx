// Objetos Perdidos: gestão de SAC e recuperação (registro até a devolução).
import { useEffect, useState } from "react";
import { CheckCircle2, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { Aviso, Paginacao, Selo, Vazio, dia, msgErro, op, qs, useDados } from "./comum";
import "./corridas.css";

export default function Objetos() {
  const [status, setStatus] = useState("todos");
  const [busca, setBusca] = useState("");
  const [b, setB] = useState("");
  const [pagina, setPagina] = useState(1);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  useEffect(() => { const t = setTimeout(() => { setB(busca); setPagina(1); }, 350); return () => clearTimeout(t); }, [busca]);
  const { dados, erro, carregando, recarregar } = useDados<any>(() => op(`/objetos${qs({ status, busca: b, pagina })}`), [status, b, pagina]);
  const fazer = async (fn: () => Promise<unknown>) => { setErroAcao(null); try { await fn(); recarregar(); } catch (e) { setErroAcao(msgErro(e)); } };
  return (
    <div className="oc">
      <div className="oc-topo">
        <div><h1>Objetos Perdidos <Selo tom="info">{dados?.total ?? 0}</Selo></h1><p className="suave" style={{ margin: "2px 0 0" }}>Gestão de SAC e Recuperação</p></div>
        <button className="oc-btn" onClick={recarregar}><RefreshCw size={16} className={carregando ? "gira" : ""} /> Atualizar</button>
      </div>
      <div className="oc-card oc-fila">
        <input style={{ maxWidth: 360 }} placeholder="Localizar por cliente, OS ou descrição..." value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar" />
        <select style={{ maxWidth: 180 }} value={status} onChange={(e) => { setStatus(e.target.value); setPagina(1); }} aria-label="Situação"><option value="todos">Todos Status</option><option value="pendente">Pendentes</option><option value="resolvido">Resolvidos</option></select>
      </div>
      <Aviso texto={erro} erro /><Aviso texto={erroAcao} erro />
      <div className="oc-card">
        {carregando && !dados && <Vazio>Carregando...</Vazio>}
        {dados && !dados.total && <Vazio>Nenhum objeto registrado. Cadastre em Cadastro &gt; Objetos perdidos.</Vazio>}
        {!!dados?.total && <>
          <div className="oc-rola"><table><thead><tr><th>Data</th><th>OS</th><th>Detalhe da Falha</th><th>Passageiro</th><th>Motorista</th><th>Status</th><th>Ações</th></tr></thead>
            <tbody>{dados.itens.map((o: any) => (
              <tr key={o.id}><td>{dia(o.data)}</td><td className="forte">{o.os || "—"}</td>
                <td style={{ whiteSpace: "normal", minWidth: 200 }}><b>{o.descricao}</b>{o.ondeEsta && <><br /><small>Onde está: {o.ondeEsta}</small></>}{o.observacao && <><br /><small>{o.observacao}</small></>}</td>
                <td>{o.passageiro || "—"}</td><td>{o.motorista || "—"}</td>
                <td><Selo tom={o.resolvido ? "ok" : "alerta"}>{o.resolvido ? <><CheckCircle2 size={12} /> Resolvido</> : o.situacao || "Pendente"}</Selo></td>
                <td><span className="oc-fila">
                  <button className="oc-btn peq" onClick={() => fazer(() => op(`/objetos/${o.id}/status`, {}))}>{o.resolvido ? <><RotateCcw size={13} /> Reabrir</> : <><CheckCircle2 size={13} /> Resolver</>}</button>
                  <button className="oc-btn peq ruim" aria-label="Apagar registro" onClick={() => confirm("Apagar este registro? Não dá para desfazer.") && fazer(() => op(`/objetos/${o.id}`, undefined, "DELETE"))}><Trash2 size={13} /></button></span></td></tr>))}</tbody></table></div>
          <Paginacao pagina={dados.pagina} paginas={dados.paginas} total={dados.total} onMudar={setPagina} rotulo="registros" />
        </>}
      </div>
    </div>
  );
}
