// Corridas › Funil de Clientes: do cadastro à corrida concluída, com abandono, corridas e leads incompletos.
// Dados reais da empresa (corridas e passageiros). Servidor: /api/areas/funil.

import { useState } from "react";
import { Download } from "lucide-react";
import { useCarregar } from "../../componentes/ui";
import { Abas, Cabecalho, Paginacao, useAviso, Vazio } from "../cadastro/base";
import { baixar, chamarAreas, usePeriodo } from "./comum";

interface Etapa { rotulo: string; valor: number; pct: number }
interface Resposta {
  resumo: { cadastrados: number; solicitadas: number; abertas: number; finalizadas: number; canceladas: number; naoAtendidas: number; abandonaram: number; leadsPerdidos: number; conversao: number };
  etapas: Etapa[]; perdas: Array<{ rotulo: string; valor: number }>; porCanal: Array<{ canal: string; rotulo: string; solicitadas: number; concluidas: number }>;
}
interface Lista { colunas: Array<{ chave: string; rotulo: string }>; linhas: Array<Record<string, unknown>>; paginacao: { atual: number; totalPaginas: number; totalItens: number } }
type Aba = "abandono" | "corridas" | "leads";

const valorCelula = (chave: string, v: unknown) => {
  if (v == null || v === "") return "—";
  if ((chave === "quando" || chave === "cadastradoEm") && typeof v === "string") return new Date(chave === "quando" ? `${v.slice(0, 19)}Z` : v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: chave === "quando" ? "UTC" : undefined });
  if (chave === "valor" && typeof v === "number") return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return String(v);
};

export default function FunilClientes() {
  const { qs, controle } = usePeriodo();
  const [canal, setCanal] = useState("");
  const [aba, setAba] = useState<Aba>("abandono");
  const [pagina, setPagina] = useState(1);
  const { aviso, tentar } = useAviso();
  const filtro = `${qs}${canal ? `&canal=${canal}` : ""}`;
  const r = useCarregar(() => chamarAreas<Resposta>(`/funil?${filtro}`), [filtro]);
  const l = useCarregar(() => chamarAreas<Lista>(`/funil/lista?${filtro}&aba=${aba}&pagina=${pagina}`), [filtro, aba, pagina]);
  const d = r.dados;
  const topo = d?.etapas[0]?.valor || 1;

  return (
    <div className="cg-pagina-solta ar-pagina">
      {aviso}
      <Cabecalho titulo="Funil de Clientes" sub="Do cadastro à corrida concluída">
        <select aria-label="Canal" value={canal} onChange={(e) => { setCanal(e.target.value); setPagina(1); }} style={{ minHeight: 38, borderRadius: 12, padding: "0 10px" }}>
          <option value="">Todos os canais</option><option value="app">App</option><option value="bot">WhatsApp</option><option value="totem">Totem</option><option value="painel">Central</option><option value="macaneta">Maçaneta</option>
        </select>
        <div onChange={() => setPagina(1)}>{controle}</div>
        <button className="cg-botao" onClick={() => void tentar(() => baixar(`/funil/csv?${filtro}&aba=${aba}`, `funil-${aba}.csv`))}><Download size={15} /> Excel</button>
      </Cabecalho>
      {r.erro && <div className="cg-aviso erro">{r.erro}</div>}
      <div className="ar-kpis">
        <div className="ar-kpi"><small>Cadastros</small><strong>{d?.resumo.cadastrados ?? "…"}</strong><span>Passageiros novos no período</span></div>
        <div className="ar-kpi ruim"><small>Perda</small><strong>{d?.resumo.abandonaram ?? "…"}</strong><span>Abandonaram (canceladas e não atendidas)</span></div>
        <div className="ar-kpi ok"><small>Geral</small><strong>{d?.resumo.finalizadas ?? "…"}</strong><span>{d ? `Corridas com sucesso · ${d.resumo.canceladas} canceladas · ${d.resumo.naoAtendidas} não atendidas` : ""}</span></div>
        <div className="ar-kpi alerta"><small>Lead</small><strong>{d?.resumo.leadsPerdidos ?? "…"}</strong><span>Cadastrados que nunca pediram</span></div>
      </div>
      <div className="ar-duas">
        <section className="ar-funil">
          <h3>Funil de conversão{d ? ` · ${d.resumo.conversao}% concluídas` : ""}</h3>
          {d?.resumo.solicitadas === 0 && <p style={{ color: "var(--cg-suave)", fontSize: 13 }}>Nenhuma corrida solicitada no período.</p>}
          {d?.etapas.map((e) => (
            <div className="ar-etapa" key={e.rotulo}>
              <div><span>{e.rotulo}</span><span>{e.valor} ({e.pct}%)</span></div>
              <div className="ar-trilho"><i style={{ width: `${Math.round((e.valor / topo) * 100)}%` }} /></div>
            </div>))}
        </section>
        <section className="ar-funil">
          <h3>Onde as corridas se perdem</h3>
          {d?.perdas.map((e) => (
            <div className="ar-etapa" key={e.rotulo}>
              <div><span>{e.rotulo}</span><span>{e.valor}</span></div>
              <div className="ar-trilho perda"><i style={{ width: `${d.resumo.abandonaram ? Math.round((e.valor / d.resumo.abandonaram) * 100) : 0}%` }} /></div>
            </div>))}
          {!!d?.porCanal.length && <p style={{ color: "var(--cg-suave)", fontSize: 12, margin: "10px 0 0" }}>Por canal: {d.porCanal.map((c) => `${c.rotulo} ${c.concluidas}/${c.solicitadas}`).join(" · ")}</p>}
        </section>
      </div>
      <Abas itens={[{ id: "abandono", rotulo: "Funil de Abandono", n: d?.resumo.abandonaram }, { id: "corridas", rotulo: "Corridas (Geral)", n: d?.resumo.solicitadas }, { id: "leads", rotulo: "Leads Incompletos", n: d?.resumo.leadsPerdidos }]} valor={aba} onChange={(a) => { setAba(a); setPagina(1); }} />
      {!l.dados?.linhas.length ? <div className="cg-tabela-caixa"><Vazio titulo="Nenhum registro no período." /></div> : (
        <div className="cg-tabela-caixa"><div className="cg-rolagem"><table className="cg-tabela">
          <thead><tr>{l.dados.colunas.map((c) => <th key={c.chave}>{c.rotulo}</th>)}</tr></thead>
          <tbody>{l.dados.linhas.map((linha, i) => <tr key={i}>{l.dados!.colunas.map((c) => <td key={c.chave}>{valorCelula(c.chave, linha[c.chave])}</td>)}</tr>)}</tbody>
        </table></div>
          <div style={{ padding: "8px 16px" }}><Paginacao atual={l.dados.paginacao.atual} total={l.dados.paginacao.totalPaginas} onChange={setPagina} /></div></div>
      )}
    </div>
  );
}
