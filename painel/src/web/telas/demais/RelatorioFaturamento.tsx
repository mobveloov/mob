// Relatório de faturamento (Financeiro › Relatórios › Faturamento), no formato da Machine: cinco indicadores do período e uma linha por OS
// (finalizada, cancelada ou não atendida), com período, mais filtros, busca por OS, paginação de 10 e Exportar CSV.
// Os números vêm de /api/config/relatorio-faturamento, sempre da empresa escolhida.

import { useEffect, useState } from "react";
import { Download, Filter, Info, Search } from "lucide-react";
import { Aviso, Carregando, FiltroPeriodo, PERIODOS_MACHINE, dinheiro, pedirConfig, queryPeriodo, textoPeriodo, useCarregar, useSalvar, type PeriodoSel } from "./comum";
import { baixarCsv } from "./FinanceiroMachine";

const HOJE: PeriodoSel = { chave: "hoje", inicio: "", fim: "" };
const SEM_FILTRO = { status: "todos", pagamento: "" };
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
  const filtro = `${queryPeriodo(per)}&status=${encodeURIComponent(aplicado.status)}&pagamento=${encodeURIComponent(aplicado.pagamento)}&busca=${encodeURIComponent(os)}`;
  const d = useCarregar(() => pedirConfig(`/relatorio-faturamento?${filtro}&pagina=${pagina}`), [filtro, pagina]);
  const formas = useCarregar(() => fetch("/api/relatorios/definicoes", { credentials: "same-origin" }).then((r) => r.json()).catch(() => null), []);
  const x = d.dados;
  const de = x ? (x.total ? (x.pagina - 1) * x.porPagina + 1 : 0) : 0, ate = x ? Math.min(x.total, x.pagina * x.porPagina) : 0;
  const numeros: number[] = x ? Array.from({ length: x.paginas }, (_, i) => i + 1).filter((p) => p === 1 || p === x.paginas || Math.abs(p - x.pagina) <= 2) : [];
  return (
    <>
      <div className="dm-cab">
        <div><h1>Relatório de faturamento</h1><p>Período: {textoPeriodo(per)}{x ? ` (${x.periodo.inicio.split("-").reverse().join("/")} a ${x.periodo.fim.split("-").reverse().join("/")})` : ""}</p></div>
        <div className="dm-cab-acoes">
          <button className="botao" aria-expanded={mais} onClick={() => setMais(!mais)}><Filter size={14} /> Mais filtros</button>
          <FiltroPeriodo valor={per} onChange={(p) => { setPer(p); setPagina(1); }} atalhos={PERIODOS_MACHINE} />
          <button className="botao" onClick={() => salvar(() => baixarCsv(`/relatorio-faturamento/csv?${filtro}`, "relatorio-faturamento.csv"), "CSV exportado.")}><Download size={14} /> Exportar CSV</button>
        </div>
      </div>
      {mais && (
        <form className="dm-cartao dm-filtros" onSubmit={(e) => { e.preventDefault(); setPagina(1); setAplicado(f); }}>
          <label>Status<select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="todos">Todos</option>{(x?.status ?? []).map((s: string) => <option key={s}>{s}</option>)}</select></label>
          <label>Forma de pagamento<select value={f.pagamento} onChange={(e) => setF({ ...f, pagamento: e.target.value })}><option value="">Todas</option>{(formas.dados?.formas ?? []).map((n: string) => <option key={n}>{n}</option>)}</select></label>
          <button className="botao primario">Filtrar</button>
          <button type="button" className="botao" onClick={() => { setF(SEM_FILTRO); setAplicado(SEM_FILTRO); setPagina(1); }}>Limpar filtros</button>
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
        <div className="dm-busca"><Search size={14} aria-hidden /><input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por ordem de serviço" aria-label="Buscar por ordem de serviço" /></div>
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
