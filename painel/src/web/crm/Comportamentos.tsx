import { useState } from "react";
import { Activity, Check, Info } from "lucide-react";
import { Barras, Cartao, useCarregar } from "../componentes/ui";
import { automacao } from "./api-automacao";
import { Contagem } from "./automacao-comum";
import { useGestor, useRetorno } from "./comum";

const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const hh = (h: number) => `${String(h).padStart(2, "0")}h`;

/** CRM › Público › Comportamentos: hora e dias em que cada passageiro costuma chamar (últimos 180 dias). */
export default function Comportamentos() {
  const { dados, erro, recarregar } = useCarregar(() => automacao.comportamento(), []);
  const gestor = useGestor();
  const { tentar, caixa } = useRetorno();
  const [ocupado, setOcupado] = useState(false);
  const b = dados?.buckets ?? {};
  const pegar = (prefixo: string, chaves: Array<[string, string]>) => chaves.map(([k, l]) => ({ rotulo: l, valor: b[`${prefixo}:${k}`] ?? 0 }));
  const analisar = async () => {
    setOcupado(true);
    await tentar(() => automacao.analisar(), (r) => `${r.atualizados.toLocaleString("pt-BR")} passageiro(s) com hora e dias preferidos atualizados.`);
    setOcupado(false);
    recarregar();
  };
  return (
    <div className="pilha">
      <div className="linha-filtro">
        <p className="sub" style={{ margin: 0, flex: 1 }}>
          <Info size={14} /> A análise descobre a <strong>hora</strong> e os <strong>dias</strong> em que cada passageiro costuma chamar (últimos 180 dias). Roda sozinha todo dia às 05:20 e alimenta os Templates Comportamentais.
          {dados?.updated_at && <> Última análise: {new Date(dados.updated_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.</>}
        </p>
        {gestor && <button className="botao primario" disabled={ocupado} onClick={analisar}><Activity size={14} /> Analisar comportamento</button>}
      </div>
      {caixa}
      {erro && <div className="aviso erro">{erro}</div>}
      <div className="kpis">
        <Contagem rotulo="Passageiros" valor={dados?.total ?? 0} />
        <Contagem rotulo="Com hora preferida" valor={dados?.with_pref ?? 0} />
        <Contagem rotulo="Corridas finalizadas" valor={dados?.finished ?? 0} />
        <Contagem rotulo="Cancelamentos" valor={dados?.canceled ?? 0} />
      </div>
      <div className="grade">
        <Cartao titulo="Hora preferida (Brasília)"><Barras itens={Array.from({ length: 24 }, (_, h) => ({ rotulo: hh(h), valor: b[`hour:${h}`] ?? 0 }))} /></Cartao>
        <div>
          <Cartao titulo="Dias preferidos"><Barras itens={DOW.map((d, i) => ({ rotulo: d, valor: b[`dow:${i}`] ?? 0 }))} /></Cartao>
          <Cartao titulo="Estágio"><Barras itens={pegar("stage", [["novo", "Novo"], ["ativo", "Ativo"], ["fiel", "Fiel"], ["em_risco", "Em risco"], ["inativo", "Inativo"], ["perdido", "Perdido"]])} /></Cartao>
        </div>
        <Cartao titulo="Corridas finalizadas"><Barras itens={pegar("rides", [["0", "Nenhuma"], ["1", "1"], ["2_4", "2 a 4"], ["5_9", "5 a 9"], ["10_19", "10 a 19"], ["20", "20+"]])} /></Cartao>
        <Cartao titulo="Cancelamentos"><Barras itens={pegar("canc", [["0", "Nenhum"], ["1", "1"], ["2_3", "2 a 3"], ["4_9", "4 a 9"], ["10", "10+"]])} /></Cartao>
        <Cartao titulo="Gasto total"><Barras itens={pegar("spent", [["0", "R$ 0"], ["1_49", "até R$ 49"], ["50_99", "R$ 50–99"], ["100_299", "R$ 100–299"], ["300_999", "R$ 300–999"], ["1000", "R$ 1.000+"]])} /></Cartao>
        <Cartao titulo="Última corrida"><Barras itens={pegar("last", [["0_7", "Até 7 dias"], ["8_30", "8 a 30 dias"], ["31_90", "31 a 90 dias"], ["90", "Mais de 90"], ["nunca", "Nunca"]])} /></Cartao>
        <Cartao titulo="Última simulação de preço"><Barras itens={pegar("sim", [["0_1", "Hoje/ontem"], ["2_7", "2 a 7 dias"], ["8_30", "8 a 30 dias"], ["30", "Mais de 30"], ["nunca", "Nunca"]])} /></Cartao>
      </div>
      {!dados?.total && <p className="vazio"><Check size={14} /> Nenhum passageiro analisado ainda. Clique em "Analisar comportamento".</p>}
    </div>
  );
}
