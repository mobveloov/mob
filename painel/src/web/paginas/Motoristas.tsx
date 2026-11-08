import { useMemo, useState } from "react";
import { api, baixar, dataHora, dinheiro, diasAtrasIso, hojeIso, numero, type Filtro } from "../api";
import { Avisos, Cartao, Periodo, Titulo, useCarregar } from "../componentes/ui";

/** Motoristas: corridas, % do total, cancelamentos, faturamento e km de cada motorista numa tabela só. */
export default function Motoristas() {
  const [filtro, setFiltro] = useState<Filtro>({ inicio: diasAtrasIso(29), fim: hojeIso() });
  const [busca, setBusca] = useState("");
  const { dados, erro } = useCarregar(() => api.motoristas(filtro), [JSON.stringify(filtro)]);
  const lista = useMemo(() => (dados?.motoristas ?? []).filter((m) => m.nome.toLowerCase().includes(busca.toLowerCase())), [dados, busca]);
  const total = (dados?.motoristas ?? []).reduce((a, m) => a + m.finalizadas, 0);
  const csv = () => baixar("motoristas.csv", "﻿Motorista;Corridas;Finalizadas;% das finalizadas;Canceladas;% cancelamento;Faturamento;Km;Nota\n" + lista.map((m) =>
    [m.nome, m.corridas, m.finalizadas, numero(total ? (m.finalizadas / total) * 100 : 0, 1), m.canceladas, numero(m.taxaCancelamento, 1), m.faturamento.toFixed(2).replace(".", ","), numero(m.km, 1), m.nota ?? ""].join(";")).join("\n"), "text/csv;charset=utf-8");
  return (
    <>
      <Titulo titulo="Produção dos motoristas" sub="Corridas, cancelamentos, faturamento e km de cada motorista no período."><button className="botao" onClick={csv}>Planilha</button></Titulo>
      <Cartao><div className="linha-filtro"><Periodo valor={filtro} onChange={setFiltro} rapidos={false} /><input placeholder="Buscar motorista" value={busca} onChange={(e) => setBusca(e.target.value)} /></div></Cartao>
      <Avisos lista={[...(dados?.avisos ?? []), erro]} />
      <Cartao>
        {!lista.length ? <p className="vazio">Nenhum motorista no período.</p> : (
          <div className="tabela-rola"><table>
            <thead><tr><th>Motorista</th><th className="num">Corridas</th><th className="num">Finalizadas</th><th className="num">% do total</th><th className="num">Canceladas</th><th className="num">% canc.</th><th className="num">Faturamento</th><th className="num">Km</th><th className="num">Nota</th><th>Última</th></tr></thead>
            <tbody>{lista.map((m) => (
              <tr key={m.nome}><td className="forte">{m.nome}</td><td className="num">{m.corridas}</td><td className="num">{m.finalizadas}</td>
                <td className="num">{numero(total ? (m.finalizadas / total) * 100 : 0, 1)}%</td><td className="num">{m.canceladas}</td>
                <td className={`num ${m.taxaCancelamento > 20 ? "txt-ruim" : ""}`}>{numero(m.taxaCancelamento, 1)}%</td><td className="num">{dinheiro(m.faturamento)}</td>
                <td className="num">{numero(m.km, 1)}</td><td className="num">{m.nota ?? "—"}</td><td>{dataHora(m.ultima)}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </Cartao>
    </>
  );
}
