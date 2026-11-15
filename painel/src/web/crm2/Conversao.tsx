import { useState } from "react";
import { Download, Info, RefreshCw, TrendingUp } from "lucide-react";
import { Cartao, Kpi, useCarregar } from "../componentes/ui";
import { ORIGEM_ENVIO } from "../../crm2/catalogo";
import { baixarCsv, crm2, dinheiroBr } from "./api";

const num = (n: number) => n.toLocaleString("pt-BR");

/** CRM › Análises › Conversão: quanto cada campanha, jornada ou gatilho virou corrida e receita. */
export default function Conversao() {
  const [dias, setDias] = useState(30);
  const { dados, erro, carregando, recarregar } = useCarregar(() => crm2.conversao(dias), [dias]);
  const linhas = dados?.linhas ?? [];
  const total = linhas.reduce((a, r) => ({ sent: a.sent + r.sent, converted: a.converted + r.converted, revenue: a.revenue + r.revenue }), { sent: 0, converted: 0, revenue: 0 });
  return (
    <div className="pilha">
      <div className="aviso" style={{ display: "flex", gap: 8 }}>
        <Info size={16} style={{ flexShrink: 0 }} />
        <p style={{ margin: 0 }}>Uma mensagem <strong>converteu</strong> quando o passageiro finalizou uma corrida em até <strong>{dados?.horas ?? 24}h</strong> depois de recebê-la (ajuste a janela na aba Governança). Conta as corridas do painel. Receita = valor da 1ª corrida depois da mensagem.</p>
      </div>
      <div className="linha-filtro">
        <div className="periodo">{[7, 30, 90].map((d) => <button key={d} className={dias === d ? "chip ativo" : "chip"} onClick={() => setDias(d)}>{d} dias</button>)}</div>
        <div className="acoes">
          <button className="botao" onClick={recarregar}><RefreshCw size={14} className={carregando ? "girar" : ""} /> Recalcular</button>
          <button className="botao" onClick={() => baixarCsv(`conversao-${dias}d.csv`, ["Origem", "Nome", "Enviadas", "Converteram", "Taxa %", "Receita"],
            linhas.map((r) => [ORIGEM_ENVIO[r.origin] ?? r.origin, r.source_name, r.sent, r.converted, r.conversion_rate, r.revenue.toFixed(2)]))}><Download size={14} /> CSV</button>
        </div>
      </div>
      <div className="grade">
        <Kpi rotulo="Enviadas" valor={num(total.sent)} />
        <Kpi rotulo="Converteram" valor={num(total.converted)} tom="ok" />
        <Kpi rotulo="Taxa de conversão" valor={`${total.sent ? ((total.converted / total.sent) * 100).toFixed(2) : "0.00"}%`} tom="info" />
        <Kpi rotulo="Receita recuperada" valor={dinheiroBr(total.revenue)} />
      </div>
      {erro && <div className="aviso erro">{erro}</div>}
      {!dados && carregando ? <p className="vazio">Carregando...</p> : !linhas.length ? <Cartao><p className="vazio"><TrendingUp size={16} /> Nenhuma mensagem enviada no período.</p></Cartao> : (
        <Cartao>
          <div className="tabela-rola"><table>
            <thead><tr><th>Origem</th><th>Nome</th><th className="num">Enviadas</th><th className="num">Converteram</th><th className="num">Taxa</th><th className="num">Receita</th></tr></thead>
            <tbody>{linhas.map((r) => (
              <tr key={`${r.origin}-${r.source_id}`}>
                <td><span className="selo">{ORIGEM_ENVIO[r.origin] ?? r.origin}</span></td>
                <td>{r.source_name}</td>
                <td className="num">{num(r.sent)}</td>
                <td className="num" style={{ color: "var(--ok)" }}>{num(r.converted)}</td>
                <td className="num">{r.conversion_rate.toFixed(1)}%</td>
                <td className="num forte">{dinheiroBr(r.revenue)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </Cartao>
      )}
    </div>
  );
}
