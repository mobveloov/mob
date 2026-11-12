// Pagamentos Pend. (Pendências): taxas de cancelamento a receber do passageiro. Baixar (recebeu) ou abonar (perdoou).
import { useEffect, useState } from "react";
import { Aviso, Paginacao, Selo, Vazio, dh, fone, msgErro, op, qs, reais, useDados } from "./comum";
import "./corridas.css";

const SIT: Record<string, string> = { pendente: "alerta", paga: "ok", abonada: "info" };

export default function Pendentes() {
  const [status, setStatus] = useState("pendente");
  const [busca, setBusca] = useState("");
  const [b, setB] = useState("");
  const [pagina, setPagina] = useState(1);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  useEffect(() => { const t = setTimeout(() => { setB(busca); setPagina(1); }, 350); return () => clearTimeout(t); }, [busca]);
  const { dados, erro, carregando, recarregar } = useDados<any>(() => op(`/pendencias${qs({ status, busca: b, pagina })}`), [status, b, pagina]);
  async function resolver(id: string, acao: "baixar" | "abonar") {
    if (!confirm(acao === "baixar" ? "Confirmar que o passageiro pagou esta taxa?" : "Abonar (perdoar) esta taxa? O passageiro não precisará pagar.")) return;
    setErroAcao(null);
    try { await op(`/pendencias/${id}/${acao}`, {}); recarregar(); } catch (e) { setErroAcao(msgErro(e)); }
  }
  return (
    <div className="oc">
      <div className="oc-topo">
        <div><h1>Pendências</h1><p className="suave" style={{ margin: "2px 0 0" }}>Taxas de cancelamento e débitos</p></div>
        <div className="oc-kpi alerta" style={{ minWidth: 200 }}><span>Total em Aberto</span><strong>{reais(dados?.totalAberto ?? 0)}</strong></div>
      </div>
      <div className="oc-card oc-fila">
        <input style={{ maxWidth: 320 }} placeholder="Buscar passageiro, OS..." value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar" />
        <select style={{ maxWidth: 180 }} value={status} onChange={(e) => { setStatus(e.target.value); setPagina(1); }} aria-label="Situação">
          <option value="pendente">Pendentes</option><option value="paga">Pagas</option><option value="abonada">Abonadas</option><option value="todos">Todos</option></select>
        <button className="oc-btn" onClick={recarregar}>Atualizar</button>
      </div>
      <Aviso texto={erro} erro /><Aviso texto={erroAcao} erro />
      <div className="oc-card">
        {carregando && !dados && <Vazio>Carregando...</Vazio>}
        {dados && !dados.total && <Vazio>Nenhuma pendência neste filtro.</Vazio>}
        {!!dados?.total && <>
          <div className="oc-rola"><table><thead><tr><th>Data</th><th>OS Origem</th><th>Passageiro</th><th>Motorista</th><th>Valor</th><th>Status</th><th>Ações</th></tr></thead>
            <tbody>{dados.itens.map((p: any) => (
              <tr key={p.id}><td>{dh(p.data)}</td><td className="forte">{p.os}</td><td>{p.passageiro}<br /><small>{fone(p.telefone)}</small></td><td>{p.motorista || "—"}</td><td className="forte">{reais(p.valor)}</td>
                <td><Selo tom={SIT[p.status]}>{p.status === "pendente" ? "Pendente" : p.status === "paga" ? "Paga" : "Abonada"}</Selo>{p.resolvidoPor && <small> por {p.resolvidoPor}</small>}</td>
                <td>{p.status === "pendente" ? <span className="oc-fila"><button className="oc-btn peq ok" onClick={() => resolver(p.id, "baixar")}>Baixar</button><button className="oc-btn peq" onClick={() => resolver(p.id, "abonar")}>Abonar</button></span> : "—"}</td></tr>))}</tbody></table></div>
          <Paginacao pagina={dados.pagina} paginas={dados.paginas} total={dados.total} onMudar={setPagina} rotulo="pendências" />
        </>}
      </div>
    </div>
  );
}
