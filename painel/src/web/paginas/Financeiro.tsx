import { useMemo, useState } from "react";
import { api, baixar, dinheiro, diasAtrasIso, hojeIso, numero, type CorridaPainel as Corrida, type Filtro } from "../api";
import { Avisos, Barras, Cartao, Kpi, Periodo, Titulo, useCarregar } from "../componentes/ui";

function agrupar(lista: Corrida[], chave: (c: Corrida) => string) {
  const m = new Map<string, { qtd: number; valor: number }>();
  for (const c of lista) {
    const k = chave(c) || "Não informado";
    const x = m.get(k) ?? { qtd: 0, valor: 0 };
    x.qtd++;
    x.valor += c.valor ?? 0;
    m.set(k, x);
  }
  return [...m.entries()].map(([rotulo, v]) => ({ rotulo, ...v })).sort((a, b) => b.valor - a.valor);
}

/** Faturamento: por forma de pagamento, por categoria e por dia. */
export default function Financeiro() {
  const [filtro, setFiltro] = useState<Filtro>({ inicio: diasAtrasIso(29), fim: hojeIso() });
  const { dados, erro } = useCarregar(() => api.corridas({ ...filtro, grupo: "finalizada" }), [JSON.stringify(filtro)]);
  const fin = dados?.corridas ?? [];
  const porDia = useMemo(() => agrupar(fin, (c) => c.solicitadaEm?.slice(0, 10).split("-").reverse().join("/") ?? "").sort((a, b) => a.rotulo.split("/").reverse().join().localeCompare(b.rotulo.split("/").reverse().join())), [fin]);
  const porPag = useMemo(() => agrupar(fin, (c) => c.pagamento), [fin]);
  const porCat = useMemo(() => agrupar(fin, (c) => c.categoria), [fin]);
  const csv = () => baixar("faturamento-por-dia.csv", "﻿Dia;Corridas;Faturamento\n" + porDia.map((d) => `${d.rotulo};${d.qtd};${d.valor.toFixed(2).replace(".", ",")}`).join("\n"), "text/csv;charset=utf-8");
  return (
    <>
      <Titulo titulo="Financeiro" sub="Faturamento das corridas finalizadas."><button className="botao" onClick={csv}>Planilha</button></Titulo>
      <Cartao><Periodo valor={filtro} onChange={setFiltro} rapidos={false} /></Cartao>
      <Avisos lista={[...(dados?.avisos ?? []), erro]} />
      {dados?.cortado && <div className="aviso">Período grande: os gráficos usam as 2.000 corridas mais recentes. O total de cima usa todas.</div>}
      <div className="kpis">
        <Kpi rotulo="Faturamento" valor={dinheiro(dados?.resumo.faturamento)} />
        <Kpi rotulo="Corridas finalizadas" valor={numero(dados?.resumo.finalizadas)} tom="ok" />
        <Kpi rotulo="Ticket médio" valor={dinheiro(dados?.resumo.ticketMedio)} />
      </div>
      <div className="grade">
        <Cartao titulo="Por forma de pagamento"><Barras itens={porPag.map((x) => ({ rotulo: x.rotulo, valor: x.valor, extra: `${x.qtd} corridas` }))} formato={dinheiro} /></Cartao>
        <Cartao titulo="Por categoria"><Barras itens={porCat.map((x) => ({ rotulo: x.rotulo, valor: x.valor, extra: `${x.qtd} corridas` }))} formato={dinheiro} /></Cartao>
        <Cartao titulo="Por dia" className="largo"><Barras itens={porDia.map((x) => ({ rotulo: x.rotulo, valor: x.valor, extra: `${x.qtd}` }))} formato={dinheiro} /></Cartao>
      </div>
    </>
  );
}
