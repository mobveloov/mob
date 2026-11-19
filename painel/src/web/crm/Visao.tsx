import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Barras, Cartao, Kpi, useCarregar } from "../componentes/ui";
import { crm } from "./api";

const PERIODOS = [{ dias: 7, rotulo: "7 dias" }, { dias: 14, rotulo: "14 dias" }, { dias: 30, rotulo: "30 dias" }, { dias: 90, rotulo: "90 dias" }];
const ORIGENS: Record<string, string> = { campanha: "Campanha", jornada: "Jornada", teste: "Manual" };
const num = (n: number) => n.toLocaleString("pt-BR");

/** CRM › Visão Geral: números do envio no período, por origem, por dia. */
export default function Visao() {
  const [dias, setDias] = useState(30);
  const { dados, erro, recarregar } = useCarregar(() => crm.visao(dias), [dias], 20_000);
  return (
    <div className="pilha">
      <div className="linha-filtro">
        <div className="periodo">{PERIODOS.map((p) => <button key={p.dias} className={dias === p.dias ? "chip ativo" : "chip"} onClick={() => setDias(p.dias)}>{p.rotulo}</button>)}</div>
        <button className="botao" onClick={recarregar}><RefreshCw size={14} /> Atualizar</button>
      </div>
      {erro && <div className="aviso erro">{erro}</div>}
      {dados && (
        <>
          <div className="grade">
            <Kpi rotulo="Mensagens enviadas" valor={num(dados.enviadas)} detalhe={`${num(dados.falhas)} falhas · ${num(dados.puladas)} puladas`} />
            <Kpi rotulo="Passageiros notificados" valor={num(dados.pessoasNotificadas)} detalhe="Únicos que receberam algo" />
            <Kpi rotulo="Campanhas" valor={num(dados.campanhas.total)} detalhe={`${dados.campanhas.enviando} enviando · ${dados.campanhas.agendadas} agendadas`} />
            <Kpi rotulo="Jornadas ligadas" valor={num(dados.jornadasLigadas)} detalhe={`${num(dados.templates)} templates · ${num(dados.descadastrados)} descadastrados`} />
          </div>
          <Cartao titulo="Mensagens enviadas por dia">
            {dados.porDia.length ? <Barras itens={dados.porDia.map((d) => ({ rotulo: d.dia.split("-").reverse().slice(0, 2).join("/"), valor: d.enviadas, extra: `${d.falhas} falhas` }))} /> : <p className="vazio">Sem envios no período.</p>}
          </Cartao>
          <Cartao titulo="Por origem">
            {Object.keys(dados.porOrigem).length ? <Barras itens={Object.entries(dados.porOrigem).map(([k, v]) => ({ rotulo: ORIGENS[k] ?? k, valor: v }))} /> : <p className="vazio">Sem envios no período.</p>}
          </Cartao>
        </>
      )}
    </div>
  );
}
