// Demonstrativo Mensal: cobrança da plataforma por central e competência (tarifas das corridas, mensalidade, serviços e créditos).
import { useState } from "react";
import { Download } from "lucide-react";
import { Aviso, Cab, Campo, Carregando, dinheiro, useCarregar, useSalvar } from "../demais/comum";
import { baixarCsvCentrais, definirFoco, pedirCentrais, useFoco, type CentralResumo } from "./comum";

const celula = (n: number | null) => (n == null ? "---" : dinheiro(n));

export function DemonstrativoMensal() {
  const foco = useFoco();
  const [comp, setComp] = useState("");
  const qs = `${foco ? `central=${encodeURIComponent(foco)}&` : ""}${comp ? `competencia=${comp}` : ""}`;
  const d = useCarregar(() => pedirCentrais(`/demonstrativo?${qs}`), [qs]);
  const redes = useCarregar(() => pedirCentrais<{ centrais: CentralResumo[] }>("/rede"), []);
  const { msg, salvar } = useSalvar();
  const x = d.dados;
  return (
    <>
      <Cab titulo="Demonstrativo Mensal" sub="Cobrança da plataforma por central, mês a mês">
        <button className="botao" disabled={!x} onClick={() => salvar(() => baixarCsvCentrais(`/demonstrativo/csv?${qs}`, `demonstrativo-${x?.competencia ?? "mes"}.csv`), "CSV exportado.")}><Download size={14} /> Exportar</button>
      </Cab>
      <div className="dm-cartao dm-filtros">
        <Campo rotulo="Bandeira">
          <select value={foco || redes.dados?.centrais?.[0]?.id || ""} onChange={(e) => definirFoco(e.target.value === redes.dados?.centrais?.[0]?.id ? "" : e.target.value)} disabled={(redes.dados?.centrais?.length ?? 0) < 2}>
            {(redes.dados?.centrais ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Competência"><select value={comp || x?.competencia || ""} onChange={(e) => setComp(e.target.value)}>{(x?.competencias ?? []).map((c: any) => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}</select></Campo>
        <Campo rotulo="Dias ativos"><strong>{x?.diasAtivos ?? "—"}</strong></Campo>
      </div>
      <Aviso erro={d.erro ?? msg?.erro} ok={msg?.ok} />
      <div className="dm-cartao tabela-rola">
        <table>
          <thead><tr><th>Descrição</th><th>Quantidade</th><th>Valor unitário</th><th>Débitos</th><th>Créditos</th></tr></thead>
          <tbody>
            {!x ? <tr><td colSpan={5}>{d.erro ? "" : <Carregando />}</td></tr> : x.linhas.map((l: any, i: number) => (
              <tr key={i}><td>{l.descricao}</td><td>{l.quantidade ?? "---"}</td><td>{l.valorUnitario}</td><td>{celula(l.debito)}</td><td>{celula(l.credito)}</td></tr>
            ))}
            {x && <tr className="cc-total"><td colSpan={3}><strong>Total a pagar</strong>{x.quemPaga === "principal" && <small className="bloco">Pago pela central principal (débito automático na conta dela)</small>}</td><td colSpan={2}><strong>{dinheiro(x.totalAPagar)}</strong></td></tr>}
          </tbody>
        </table>
      </div>
      {x && <div className="dm-cartao cc-resumo"><span>Subtotal: <strong>{dinheiro(x.subtotal)}</strong></span><span>Descontos: <strong>{dinheiro(x.descontos)}</strong></span><span>Valor a pagar: <strong>{dinheiro(x.totalAPagar)}</strong></span></div>}
      <p className="dm-dica">Cálculo feito das corridas finalizadas da central no mês. Não há cobrança automática: o boleto é emitido pela plataforma.</p>
    </>
  );
}
