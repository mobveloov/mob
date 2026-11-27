// Relatório de faturamento (Financeiro › Relatórios › Faturamento), no formato da Machine: cinco indicadores do período e uma linha por OS
// (finalizada, cancelada ou não atendida), com período, mais filtros, busca por OS, paginação de 10 e Exportar CSV.
// Os números vêm de /api/config/relatorio-faturamento, sempre da empresa escolhida.

import { useEffect, useState } from "react";
import { Download, Filter, Info, Search } from "lucide-react";
import { Aviso, Carregando, FiltroPeriodo, PERIODOS_MACHINE, dinheiro, pedirConfig, queryPeriodo, textoPeriodo, useCarregar, useSalvar, type PeriodoSel } from "./comum";
import { baixarCsv } from "./FinanceiroMachine";

const HOJE: PeriodoSel = { chave: "hoje", inicio: "", fim: "" };
// Como na Machine: o filtro nasce com tudo marcado; "Todos" marca ou desmarca as demais. Tudo marcado = sem filtro.
const STATUS_TODOS = ["Finalizada", "Cancelada", "Não atendida"];
const FORMAS_TODAS = ["Dinheiro", "Maquininha de débito", "Maquininha de crédito", "eTicket", "Voucher", "Cartão no app", "Pix", "Picpay", "Whatsapp", "Pix no app"];
const SEM_FILTRO = { status: STATUS_TODOS, pagamento: FORMAS_TODAS };
const valorFiltro = (marcadas: string[], todas: string[]) => (marcadas.length === todas.length || !marcadas.length ? "" : marcadas.join("|"));
function Grupo({ rotulo, opcoes, marcadas, onChange }: { rotulo: string; opcoes: string[]; marcadas: string[]; onChange: (m: string[]) => void }) {
  const todas = marcadas.length === opcoes.length;
  return (
    <fieldset className="dm-campo" style={{ flexBasis: "100%", border: 0, padding: 0 }}>
      <span>{rotulo}</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <label><input type="checkbox" checked={todas} onChange={() => onChange(todas ? [] : opcoes)} /> Todos</label>
        {opcoes.map((o) => <label key={o}><input type="checkbox" checked={marcadas.includes(o)} onChange={() => onChange(marcadas.includes(o) ? marcadas.filter((m) => m !== o) : opcoes.filter((x) => x === o || marcadas.includes(x)))} /> {o}</label>)}
      </div>
    </fieldset>
  );
}
const dataHoraCompleta = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}, ${s.slice(11, 19)}`;
const TOM: Record<string, string> = { Finalizada: "ok", Cancelada: "ruim", "Não atendida": "alerta" };

function Kpi({ titulo, dica, valor }: { titulo: string; dica: string; valor: number | undefined }) {
  return <div className="dm-kpi"><small>{titulo} <span title={dica} aria-label={dica}><Info size={13} /></span></small><strong>{valor == null ? "—" : dinheiro(valor)}</strong></div>;
}

export function RelatorioFaturamento() {
  const [per, setPer] = useState<PeriodoSel>(HOJE);
  const [mais, setMais] = useState(false);
  const [f, setF] = useState(SEM_FILTRO), [aplicado, setAplicado] = useState(SEM_FILTRO);
  const [busca, setBusca] = useState(""), [os, setOs] = useState("");
  const [pagina, setPagina] = useState(1);
  const { msg, salvar } = useSalvar();
  useEffect(() => { const t = setTimeout(() => { setOs(busca); setPagina(1); }, 300); return () => clearTimeout(t); }, [busca]);
  const filtro = `${queryPeriodo(per)}&status=${encodeURIComponent(valorFiltro(aplicado.status, STATUS_TODOS))}&pagamento=${encodeURIComponent(valorFiltro(aplicado.pagamento, FORMAS_TODAS))}&busca=${encodeURIComponent(os)}`;
  const d = useCarregar(() => pedirConfig(`/relatorio-faturamento?${filtro}&pagina=${pagina}`), [filtro, pagina]);
  const x = d.dados;
  const de = x ? (x.total ? (x.pagina - 1) * x.porPagina + 1 : 0) : 0, ate = x ? Math.min(x.total, x.pagina * x.porPagina) : 0;
  const numeros: number[] = x ? Array.from({ length: x.paginas }, (_, i) => i + 1).filter((p) => p === 1 || p === x.paginas || Math.abs(p - x.pagina) <= 2) : [];
  return (
    <>
      <div className="aviso" role="note">Atenção: O histórico de faturamento vem das corridas registradas neste painel. Para períodos anteriores ao início do uso do painel, não há dados.</div>
      <div className="dm-cab">
        <div><h1>Relatório de faturamento</h1><p>Período: {textoPeriodo(per)}{x ? ` (${x.periodo.inicio.split("-").reverse().join("/")} a ${x.periodo.fim.split("-").reverse().join("/")})` : ""}</p></div>
        <div className="dm-cab-acoes">
          <button className="botao" aria-expanded={mais} onClick={() => setMais(!mais)}><Filter size={14} /> Mais filtros</button>
          <FiltroPeriodo valor={per} onChange={(p) => { setPer(p); setPagina(1); }} atalhos={PERIODOS_MACHINE} />
          <button className="botao" onClick={() => salvar(() => baixarCsv(`/relatorio-faturamento/csv?${filtro}`, "relatorio-faturamento.csv"), "CSV exportado.")}><Download size={14} /> Exportar CSV</button>
        </div>
      </div>
      {mais && (
        <form className="dm-cartao dm-filtros" aria-label="Filtro de pesquisa" onSubmit={(e) => { e.preventDefault(); setPagina(1); setAplicado(f); setMais(false); }}>
          <div style={{ flexBasis: "100%" }}><h3 className="dm-secao">Filtro de pesquisa</h3><small>Você pode filtrar um ou mais campos</small></div>
          <Grupo rotulo="Forma de pagamento" opcoes={FORMAS_TODAS} marcadas={f.pagamento} onChange={(m) => setF({ ...f, pagamento: m })} />
          <Grupo rotulo="Status" opcoes={STATUS_TODOS} marcadas={f.status} onChange={(m) => setF({ ...f, status: m })} />
          <button className="botao primario">Filtrar</button>
          <button type="button" className="botao" onClick={() => { setF(SEM_FILTRO); setAplicado(SEM_FILTRO); setPagina(1); }}>Limpar filtros</button>
          <button type="button" className="botao" onClick={() => { setF(aplicado); setMais(false); }}>Cancelar</button>
        </form>
      )}
      <Aviso erro={d.erro ?? msg?.erro} ok={msg?.ok} />
      <div className="dm-kpis">
        <Kpi titulo="Total de faturamento bruto" dica="Soma dos valores cobrados nas corridas no período selecionado." valor={x?.brutoTotal} />
        <Kpi titulo="Total taxa da central" dica="Ganhos efetivos da central no período selecionado por todas as corridas." valor={x?.taxaCentral} />
        <Kpi titulo="Ticket médio" dica="Valor médio por corrida no período selecionado." valor={x?.ticketMedio} />
        <Kpi titulo="Solicitações não atendidas" dica="Soma dos valores de corridas solicitadas que não foram aceitas/atendidas por nenhum motorista no período." valor={x?.naoAtendidas} />
        <Kpi titulo="Solicitações canceladas" dica="Valor total de corridas canceladas no período (pelo passageiro ou motorista)." valor={x?.canceladas} />
      </div>
      <div className="dm-cartao tabela-rola">
        <div className="dm-busca"><Search size={14} aria-hidden /><input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por número da OS" aria-label="Buscar por número da OS" /><button type="button" className="botao" aria-label="Buscar" onClick={() => setPagina(1)}><Search size={14} /></button></div>
        {x && <p><small>{x.total ? `Exibindo ${de}-${ate} de ${x.total} resultados` : ""}</small></p>}
        <table>
          <thead><tr><th>Data e Hora</th><th>Ordem de serviço</th><th>Forma de pagamento</th><th className="num">Valor</th><th className="num">Taxa da central</th><th>Status</th></tr></thead>
          <tbody>
            {!x ? <tr><td colSpan={6}><Carregando /></td></tr> : !x.itens.length ? <tr><td colSpan={6} className="vazio">Nenhum resultado encontrado.</td></tr> : x.itens.map((i: any) => (
              <tr key={i.id}><td>{dataHoraCompleta(i.em)}</td><td>{i.os}</td><td>{i.pagamento || "—"}</td><td className="num">{dinheiro(i.valor)}</td><td className="num">{dinheiro(i.taxa)}</td><td><span className={`selo ${TOM[i.status]}`}>{i.status}</span></td></tr>
            ))}
          </tbody>
        </table>
        {x && x.paginas > 1 && (
          <div className="dm-cab-acoes" style={{ marginTop: 10 }} role="navigation" aria-label="Páginas">
            <button className="botao" disabled={x.pagina <= 1} onClick={() => setPagina(1)}>Primeira</button>
            <button className="botao" disabled={x.pagina <= 1} onClick={() => setPagina(x.pagina - 1)}>←</button>
            {numeros.map((p) => <button key={p} className={`botao ${p === x.pagina ? "primario" : ""}`} onClick={() => setPagina(p)}>{p}</button>)}
            <button className="botao" disabled={x.pagina >= x.paginas} onClick={() => setPagina(x.pagina + 1)}>→</button>
            <button className="botao" disabled={x.pagina >= x.paginas} onClick={() => setPagina(x.paginas)}>Última</button>
          </div>
        )}
      </div>
    </>
  );
}
