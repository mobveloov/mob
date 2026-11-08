import { useState } from "react";
import { Link } from "react-router-dom";
import { api, dinheiro, diasAtrasIso, hojeIso, numero, type Filtro } from "../api";
import { useSessao } from "../App";
import { Avisos, Barras, Cartao, Kpi, Periodo, Titulo, useCarregar } from "../componentes/ui";

type Contagem = { nome: string; qtd: number; pct: number };
export const barrasDe = (l: Contagem[] | undefined, n = 8) => (l ?? []).slice(0, n).map((c) => ({ rotulo: c.nome, valor: c.qtd, extra: `${numero(c.pct, 1)}%` }));

/** Painel inicial: indicadores do período + leituras rápidas. */
export default function Painel() {
  const { marca } = useSessao();
  const [filtro, setFiltro] = useState<Filtro>({ inicio: diasAtrasIso(6), fim: hojeIso() });
  const { dados, erro } = useCarregar(() => api.estatisticas(filtro), [JSON.stringify(filtro)]);
  const s = dados?.stats;
  return (
    <>
      <Titulo titulo="Painel" sub={`Visão geral da ${marca.nomeExibido} no período.`}>
        <Link className="botao primario" to="/corridas">Consultar corridas</Link>
      </Titulo>
      <Cartao><Periodo valor={filtro} onChange={setFiltro} rapidos={false} /></Cartao>
      <Avisos lista={[...(dados?.avisos ?? []), erro]} />
      {s && (
        <>
          <div className="kpis">
            <Kpi rotulo="Corridas" valor={numero(s.total)} detalhe={s.periodo.inicio ? `${s.periodo.inicio} a ${s.periodo.fim}` : ""} />
            <Kpi rotulo="Finalização" valor={`${numero(s.status.taxaFinalizacao, 1)}%`} detalhe={`${numero(s.status.finalizadas)} finalizadas`} tom="ok" />
            <Kpi rotulo="Cancelamento" valor={`${numero(s.status.taxaCancelamento, 1)}%`} detalhe={`${numero(s.status.canceladas)} canceladas`} tom="ruim" />
            <Kpi rotulo="Não atendidas" valor={`${numero(s.status.taxaNaoAtendidas, 1)}%`} detalhe={`${numero(s.status.naoAtendidas)} corridas`} tom="alerta" />
            <Kpi rotulo="Faturamento" valor={dinheiro(s.valor.soma)} detalhe={`valor típico ${dinheiro(s.valor.mediana)}`} />
            <Kpi rotulo="Motoristas ativos" valor={numero(s.motoristas.ativos)} detalhe={`top 3 fazem ${numero(s.motoristas.top3Pct, 1)}%`} tom="info" />
          </div>
          <Cartao titulo="Alertas">
            {s.alertas.map((a: { nivel: string; titulo: string; texto: string }) => <div key={a.titulo} className={`alerta-linha ${a.nivel}`}><strong>{a.titulo}</strong> {a.texto}</div>)}
          </Cartao>
          <div className="grade">
            <Cartao titulo="Corridas por hora">
              <Barras itens={(s.temporal.porHora as Array<{ hora: number; total: number; taxaCancelamento: number }>).filter((h) => h.total).map((h) => ({ rotulo: `${String(h.hora).padStart(2, "0")}h`, valor: h.total, extra: `${numero(h.taxaCancelamento, 0)}% canc.` }))} />
            </Cartao>
            <Cartao titulo="Corridas por dia da semana">
              <Barras itens={(s.temporal.porDiaSemana as Array<{ dia: string; total: number; taxaCancelamento: number }>).map((d) => ({ rotulo: d.dia, valor: d.total, extra: `${numero(d.taxaCancelamento, 0)}% canc.` }))} />
            </Cartao>
            <Cartao titulo="Categorias"><Barras itens={(s.porCategoria as Array<{ nome: string; corridas: number; taxaCancelamento: number }>).map((c) => ({ rotulo: c.nome, valor: c.corridas, extra: `${numero(c.taxaCancelamento, 0)}% canc.` }))} /></Cartao>
            <Cartao titulo="Formas de pagamento"><Barras itens={barrasDe(s.pagamentos)} /></Cartao>
            <Cartao titulo="Motivos de cancelamento"><Barras itens={barrasDe(s.cancelamento.motivos)} /></Cartao>
            <Cartao titulo="Top motoristas"><Barras itens={barrasDe(s.motoristas.top, 10)} /></Cartao>
            {s.origens.length > 1 && marca.mostrarOrigem && <Cartao titulo="Origem das corridas"><Barras itens={barrasDe(s.origens)} /></Cartao>}
          </div>
        </>
      )}
    </>
  );
}
