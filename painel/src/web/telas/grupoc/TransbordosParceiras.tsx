// Config › Transbordo (Machine): "Envia corridas para" e "Recebe corridas de", com as centrais parceiras da rede e quatro colunas Sim/Não.
// O relatório de corridas feitas por motorista de outra cidade (painel de referência) fica logo abaixo.

import { useState } from "react";
import { Aviso, Cab, Carregando, pedirConfig, useAdmin, useCarregar, useSalvar } from "../demais/comum";
import { Transbordos } from "../demais/ConfigRegras";

const COLUNAS: Array<[string, string]> = [["pf", "Repassa corridas (PF)"], ["pj", "Repassa corridas (PJ)"], ["pendentes", "Exibe corridas pendentes"], ["programadas", "Exibe corridas programadas"]];

export function TransbordosParceiras() {
  const admin = useAdmin();
  const d = useCarregar(() => pedirConfig("/transbordo-bandeiras"), []);
  const [p, setP] = useState<any[] | null>(null), [lido, setLido] = useState<unknown>(null), [mudou, setMudou] = useState(false);
  if (d.dados && lido !== d.dados) { setLido(d.dados); setP(structuredClone(d.dados.parceiras)); setMudou(false); }
  const { msg, salvando, salvar } = useSalvar();
  const trocar = (id: string, lado: "envia" | "recebe", col: string, v: boolean) => { setP((p ?? []).map((x) => (x.id === id ? { ...x, [lado]: { ...x[lado], [col]: v } } : x))); setMudou(true); };
  const tabela = (lado: "envia" | "recebe", titulo: string) => (
    <>
      <h3>{titulo}</h3>
      <div className="tabela-rola"><table>
        <thead><tr><th>Nome da bandeira</th>{COLUNAS.map(([c, n]) => <th key={c}>{n}</th>)}</tr></thead>
        <tbody>{(p ?? []).map((x) => (
          <tr key={x.id}><td className="forte">{x.nome}</td>{COLUNAS.map(([c, n]) => (
            <td key={c}>{admin
              ? <select aria-label={`${x.nome}: ${n}`} value={x[lado][c] ? "s" : "n"} onChange={(e) => trocar(x.id, lado, c, e.target.value === "s")}><option value="s">Sim</option><option value="n">Não</option></select>
              : x[lado][c] ? "Sim" : "Não"}</td>
          ))}</tr>
        ))}</tbody>
      </table></div>
    </>
  );
  return (
    <>
      <Cab titulo="Transbordo" />
      <Aviso erro={d.erro ?? msg?.erro} ok={msg?.ok} />
      <section className="dm-cartao">
        <p>Uma corrida que não foi aceita pelos seus motoristas poderá ser direcionada para uma central parceira ou uma central associada próxima.</p>
        {!p ? <Carregando /> : !p.length ? <p className="vazio">Esta central não tem centrais parceiras ou associadas.</p> : (
          <>
            {tabela("envia", "Envia corridas para")}
            {tabela("recebe", "Recebe corridas de")}
            {admin && <div className="dm-salvar"><button className="botao primario" disabled={salvando || !mudou} onClick={() => salvar(async () => { const r = await pedirConfig("/transbordo-bandeiras", "PUT", { parceiras: p }); setLido(r); setP(structuredClone(r.parceiras)); setMudou(false); }, "Transbordo gravado.")}>Gravar</button></div>}
          </>
        )}
      </section>
      <h2 className="dm-sep">Corridas feitas por motorista de outra cidade (painel de referência)</h2>
      <Transbordos />
    </>
  );
}
