import { useState } from "react";
import { Crown, Download, Info, Plus, RefreshCw } from "lucide-react";
import { Cartao, useCarregar } from "../componentes/ui";
import { useGestor, useRetorno } from "../crm/comum";
import { RFM_SEGMENTOS } from "../../crm2/catalogo";
import { baixarCsv, crm2, dataCurta, dinheiroBr } from "./api";
import { decimal } from "../../comum/formato-br.ts";

/** CRM › Análises › RFM: Recência, Frequência e Monetário (nota de 1 a 5 comparando com a base), por segmento. */
export default function Rfm() {
  const { dados, erro, carregando, recarregar } = useCarregar(() => crm2.rfm(), []);
  const [atualizando, setAtualizando] = useState(false);
  const { tentar, caixa } = useRetorno();
  const gestor = useGestor();

  const atualizar = async () => {
    setAtualizando(true);
    await tentar(() => crm2.atualizarRfm(), (r) => `${r.analisados} passageiros analisados.`);
    setAtualizando(false);
    recarregar();
  };
  const criar = (segmento: string) => tentar(() => crm2.segmentoRfm(segmento), (r) => (r.jaExistia ? `O segmento "${r.nome}" já existe (${r.total} pessoas agora).` : `Segmento "${r.nome}" criado (${r.total} pessoas agora). Ele se atualiza sozinho a cada análise; use em campanhas e jornadas.`));
  const exportar = async () => {
    const r = await tentar(() => crm2.rfmContatos());
    if (r) baixarCsv("rfm-passageiros.csv", ["Nome", "Telefone", "Segmento", "R", "F", "M", "Corridas", "Gasto", "Última corrida"],
      r.contatos.map((c) => [c.nome, c.telefone, c.segmento ? RFM_SEGMENTOS[c.segmento]?.label ?? c.segmento : "", c.r, c.f, c.m, c.corridas, c.gasto.toFixed(2), dataCurta(c.ultima)]));
  };

  return (
    <div className="pilha">
      <div className="aviso" style={{ display: "flex", gap: 8 }}>
        <Info size={16} style={{ flexShrink: 0 }} />
        <p style={{ margin: 0 }}><strong>R</strong>ecência (dias desde a última corrida), <strong>F</strong>requência (total de corridas) e <strong>M</strong>onetário (total gasto), nota de 1 a 5 comparando com a sua base. Recalculado todo dia às 03:15; use "Atualizar análise" para recalcular agora.</p>
      </div>
      <div className="linha-filtro">
        <p className="sub">{(dados?.total ?? 0).toLocaleString("pt-BR")} passageiros · LTV total {dinheiroBr(dados?.ltv ?? 0)}</p>
        <div className="acoes">
          <button className="botao" onClick={exportar}><Download size={14} /> Exportar CSV</button>
          {gestor && <button className="botao primario" onClick={atualizar} disabled={atualizando}><RefreshCw size={14} className={atualizando ? "girar" : ""} /> Atualizar análise</button>}
        </div>
      </div>
      {caixa}
      {erro && <div className="aviso erro">{erro}</div>}
      {!dados && carregando ? <p className="vazio">Carregando...</p> : !dados?.linhas.length ? (
        <Cartao><p className="vazio"><Crown size={16} /> Sem contatos para analisar.</p></Cartao>
      ) : (
        <div className="crm2-rfm">
          {dados.linhas.map((r) => {
            const info = RFM_SEGMENTOS[r.segment] ?? { label: r.segment, color: "#64748b", action: "" };
            return (
              <Cartao key={r.segment}>
                <div className="linha-filtro">
                  <span style={{ display: "flex", gap: 8, alignItems: "center" }}><span className="crm2-bolinha" style={{ background: info.color }} /><strong>{info.label}</strong></span>
                  <small className="sub">{dados.total ? Math.round((r.contacts / dados.total) * 100) : 0}%</small>
                </div>
                <p style={{ fontSize: 26, fontWeight: 800, margin: "6px 0" }}>{r.contacts.toLocaleString("pt-BR")}</p>
                <div className="sub" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <span>{r.avg_recency_days != null ? `${Math.round(r.avg_recency_days)}d sem` : "-"}</span>
                  <span>{r.avg_rides != null ? `${decimal(r.avg_rides, 1)} corridas` : "-"}</span>
                  <span>LTV {dinheiroBr(r.ltv)}</span>
                </div>
                <p className="sub">{info.action}</p>
                {r.segment !== "sem_analise" && gestor && <button className="botao" onClick={() => criar(r.segment)}><Plus size={14} /> Criar segmento</button>}
              </Cartao>
            );
          })}
        </div>
      )}
    </div>
  );
}
