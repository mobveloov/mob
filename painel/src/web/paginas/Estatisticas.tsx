import { useState } from "react";
import { api, dinheiro, diasAtrasIso, hojeIso, numero, type Filtro } from "../api";
import { Avisos, Barras, Cartao, Kpi, Periodo, Titulo, useCarregar } from "../componentes/ui";
import { barrasDe } from "./Painel";

/** Estatísticas: todos os números calculados das corridas (os mesmos que a IA recebe). */
export default function Estatisticas() {
  const [filtro, setFiltro] = useState<Filtro>({ inicio: diasAtrasIso(29), fim: hojeIso() });
  const { dados, erro } = useCarregar(() => api.estatisticas(filtro), [JSON.stringify(filtro)]);
  const s = dados?.stats;
  const km = (n: number | null) => (n != null ? `${numero(n, 1)} km` : "—");
  return (
    <>
      <Titulo titulo="Estatísticas" sub="Todos os números calculados a partir das corridas." />
      <Cartao><Periodo valor={filtro} onChange={setFiltro} rapidos={false} /></Cartao>
      <Avisos lista={[...(dados?.avisos ?? []), erro]} />
      {s && (
        <>
          {s.semDados.length > 0 && <div className="aviso">Sem dados nas integrações desta empresa para: {s.semDados.join(", ")}.</div>}
          <div className="kpis">
            <Kpi rotulo="Distância típica" valor={km(s.distancia.mediana)} />
            <Kpi rotulo="Motorista até o passageiro" valor={km(s.distanciaMotorista.mediana)} detalhe={s.distanciaMotorista.n ? `${numero(s.distanciaMotorista.acima4kmPct, 1)}% acima de 4 km` : "sem dados"} />
            <Kpi rotulo="Com tarifa dinâmica" valor={`${numero(s.dinamica.pct, 1)}%`} detalhe={`${numero(s.dinamica.corridas)} corridas`} />
            <Kpi rotulo="Com desconto" valor={`${numero(s.descontos.pct, 1)}%`} detalhe={dinheiro(s.descontos.valorTotal)} />
            <Kpi rotulo="Avaliação média" valor={s.avaliacao.media != null ? numero(s.avaliacao.media, 2) : "—"} detalhe={`${numero(s.avaliacao.qtd)} avaliações`} />
            <Kpi rotulo="Passageiros distintos" valor={numero(s.passageiros.distintos)} detalhe={`${numero(s.passageiros.recorrentes)} voltaram`} />
          </div>
          <div className="grade">
            <Cartao titulo="Pedido feito por"><Barras itens={barrasDe(s.canais)} /></Cartao>
            <Cartao titulo="Tarifas usadas"><Barras itens={barrasDe(s.tarifas)} /></Cartao>
            <Cartao titulo="Quem cancela"><Barras itens={barrasDe(s.cancelamento.porQuem)} /></Cartao>
            <Cartao titulo="Faixas de valor"><Barras itens={barrasDe(s.faixasValor)} /></Cartao>
            <Cartao titulo="Cidades"><Barras itens={(s.cidades as Array<{ nome: string; qtd: number; taxaCancelamento: number }>).map((c) => ({ rotulo: c.nome, valor: c.qtd, extra: `${numero(c.taxaCancelamento, 0)}% canc.` }))} /></Cartao>
            <Cartao titulo="Faturamento por categoria"><Barras itens={(s.porCategoria as Array<{ nome: string; faturamento: number; corridas: number }>).map((c) => ({ rotulo: c.nome, valor: c.faturamento, extra: `${c.corridas}` }))} formato={dinheiro} /></Cartao>
            <Cartao titulo="Cupons usados"><Barras itens={barrasDe(s.descontos.cupons)} /></Cartao>
            <Cartao titulo="Notas das avaliações"><Barras itens={barrasDe(s.avaliacao.notas)} /></Cartao>
            <Cartao titulo="Dados em branco">
              <Barras itens={(s.qualidade as Array<{ campo: string; vazios: number; pct: number }>).map((q) => ({ rotulo: q.campo, valor: q.pct, extra: `${q.vazios}` }))} formato={(n) => `${numero(n, 0)}%`} />
            </Cartao>
          </div>
        </>
      )}
    </>
  );
}
