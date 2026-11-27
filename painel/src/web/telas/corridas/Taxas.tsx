// Gestão de taxas de cancelamento: Taxas, Pendentes, Repassados, Resolvidos e Abonados, com filtros por OS, motorista, cliente e período.
import { useEffect, useState } from "react";
import { Filter, X } from "lucide-react";
import { Aviso, Janela, Paginacao, Selo, Vazio, dhAno, msgErro, op, qs, useDados } from "./comum";
import { BotaoExportar, PERIODO_30, SeletorPeriodo, brl, dataBrIso, paramsPeriodo, useAdmin, type PeriodoPag } from "./pagamentos-comum";
import { BaixarTaxa } from "./Pendentes";
import "./corridas.css";

const ABAS: Array<[string, string, string]> = [["todos", "Taxas", "taxas"], ["pendentes", "Pendentes", "pendentes"], ["repassados", "Repassados", "repassados"], ["resolvidos", "Resolvidos", "resolvidos"], ["abonados", "Abonados", "abonados"]];
const SITUACOES: Array<[string, string]> = [["todos", "Todos"], ["pendentes", "Pendentes"], ["repassados", "Repassados"], ["resolvidos", "Resolvidos"], ["abonados", "Abonados"]];
const TOM_ABA: Record<string, string> = { todos: "", pendentes: "alerta", repassados: "info", resolvidos: "ok", abonados: "ruim" };
const TOM: Record<string, string> = { pendente: "alerta", processando: "info", repassado: "info", resolvido: "ok", abonado: "ruim" };
/** Períodos do filtro na Machine (sem "Ontem"). */
const PERIODOS_TAXAS = ["hoje", "semana_passada", "mes_passado", "ultimos_7", "ultimos_30", "personalizado"];
const NOME: Record<string, string> = { pendente: "Pendente", processando: "Processando", repassado: "Repassado", resolvido: "Resolvido", abonado: "Abonado" };

export default function Taxas() {
  const admin = useAdmin();
  const [aba, setAba] = useState("todos");
  const [per, setPer] = useState<PeriodoPag>(PERIODO_30);
  const [motorista, setMotorista] = useState("");
  const [f, setF] = useState({ os: "", motorista: "", cliente: "" });
  // "Mais filtros": rascunho da janela (OS, situação, período, motorista e cliente), aplicado em Filtrar.
  const [aberto, setAberto] = useState(false);
  const [rasc, setRasc] = useState({ os: "", cliente: "", motorista: "", aba: "todos", per: PERIODO_30 });
  const [pagina, setPagina] = useState(1);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [baixa, setBaixa] = useState<any>(null);
  useEffect(() => { const t = setTimeout(() => { setF((x) => (x.motorista === motorista ? x : { ...x, motorista })); setPagina(1); }, 350); return () => clearTimeout(t); }, [motorista]);
  const filtro = { aba, ...f, ...paramsPeriodo(per) };
  const { dados, erro, carregando, recarregar } = useDados<any>(() => op(`/taxas-cancelamento${qs({ ...filtro, pagina })}`), [JSON.stringify(filtro), pagina]);
  const limparTudo = () => { setMotorista(""); setF({ os: "", motorista: "", cliente: "" }); setPer(PERIODO_30); setAba("todos"); setPagina(1); };
  const abrirFiltros = () => { setRasc({ os: f.os, cliente: f.cliente, motorista, aba, per }); setAberto(true); };
  const aplicar = () => { setF({ os: rasc.os.trim(), cliente: rasc.cliente.trim(), motorista: rasc.motorista.trim() }); setMotorista(rasc.motorista.trim()); setAba(rasc.aba); setPer(rasc.per); setPagina(1); setAberto(false); };
  async function agir(p: any, acao: string) {
    if (acao === "abonar" && !confirm("Abonar esta taxa? A cobrança será descartada.")) return;
    setErroAcao(null);
    try { await op(`/pendencias/${encodeURIComponent(p.id)}/${acao}`, {}); recarregar(); } catch (e) { setErroAcao(msgErro(e)); }
  }
  return (
    <div className="oc">
      <div className="oc-topo"><div><h1>Gestão de taxas de cancelamento</h1><p className="suave" style={{ margin: "2px 0 0" }}>Taxas cobradas de passageiros que cancelaram depois do prazo</p></div></div>
      <div className="oc-abas">{SITUACOES.map(([k, r]) => <button key={k} className={aba === k ? "on" : ""} onClick={() => { setAba(k); setPagina(1); }}>{r}</button>)}</div>
      <div className="oc-card oc-fila">
        <SeletorPeriodo valor={per} onChange={(p) => { setPer(p); setPagina(1); }} opcoes={PERIODOS_TAXAS} />
        <input style={{ maxWidth: 220 }} placeholder="Buscar motorista" value={motorista} onChange={(e) => setMotorista(e.target.value)} aria-label="Buscar motorista" />
        <button className="oc-btn" onClick={abrirFiltros}><Filter size={16} /> Mais filtros</button>
        <BotaoExportar caminho={`/taxas-cancelamento/exportar${qs(filtro)}`} nome="taxas-de-cancelamento.csv" onErro={setErroAcao} />
      </div>
      <div className="oc-fila" style={{ margin: "0 0 8px", alignItems: "center" }}>
        <span className="suave">Filtrando por:</span>
        {[
          dados?.periodo?.inicio ? { k: "per", t: `Período: ${dataBrIso(dados.periodo.inicio)} até ${dataBrIso(dados.periodo.fim)}`, x: () => setPer(PERIODO_30) } : null,
          f.os ? { k: "os", t: `Nº OS: ${f.os}`, x: () => setF({ ...f, os: "" }) } : null,
          f.cliente ? { k: "cli", t: `Cliente: ${f.cliente}`, x: () => setF({ ...f, cliente: "" }) } : null,
          f.motorista ? { k: "mot", t: `Motorista: ${f.motorista}`, x: () => { setMotorista(""); setF({ ...f, motorista: "" }); } } : null,
          aba !== "todos" ? { k: "aba", t: `Situação: ${SITUACOES.find((a) => a[0] === aba)?.[1]}`, x: () => setAba("todos") } : null,
        ].filter(Boolean).map((c) => <span key={c!.k} className="oc-chip on">{c!.t}<button className="oc-x" aria-label={`Remover filtro ${c!.t}`} onClick={() => { c!.x(); setPagina(1); }}><X size={12} /></button></span>)}
        {!dados?.periodo?.inicio && !f.os && !f.cliente && !f.motorista && aba === "todos" && <span>Todos</span>}
      </div>
      <div className="oc-kpis">
        {ABAS.map(([k, nome, chave]) => (
          <button key={k} className={`oc-kpi ${TOM_ABA[k]}`} style={{ textAlign: "left", cursor: "pointer", outline: aba === k ? "2px solid var(--oc-pri)" : "none" }} onClick={() => { setAba(k); setPagina(1); }} aria-pressed={aba === k}>
            <span>{nome}</span><strong>{dados?.[chave]?.qtd ?? 0}</strong><small>{brl(dados?.[chave]?.valor ?? 0)}</small>
          </button>
        ))}
      </div>
      <Aviso texto={erro} erro /><Aviso texto={erroAcao} erro />
      <div className="oc-card">
        {carregando && !dados && <Vazio>Carregando...</Vazio>}
        {dados && !dados.total && <Vazio>Não encontramos nenhum resultado para a sua pesquisa. <span className="oc-fila" style={{ justifyContent: "center", marginTop: 8 }}><button className="oc-btn" onClick={abrirFiltros}>Editar filtro</button><button className="oc-btn" onClick={limparTudo}>Limpar filtro</button></span></Vazio>}
        {!!dados?.total && <>
          <div className="oc-rola"><table><thead><tr><th>Data</th><th>Corrida de origem</th><th>Passageiro</th><th>Taxa</th><th>Motorista a receber</th><th>Motorista de coleta</th><th>Situação</th><th>Ações</th></tr></thead>
            <tbody>{dados.itens.map((p: any) => (
              <tr key={p.id}><td>{dhAno(p.data).replace(" ", " - ")}</td><td className="forte">OS {p.os}</td><td><small>Passageiro</small><br />{p.passageiro}</td><td className="forte">{brl(p.valor)}</td>
                <td>{p.motorista || "—"}{p.motorista && <><br /><small>Créditos ativados</small></>}</td>
                <td>{p.motoristaColeta || "—"}</td>
                <td><Selo tom={TOM[p.situacao]}>{NOME[p.situacao]}</Selo>
                  <br /><small>{p.situacao === "pendente" || p.situacao === "processando" ? "Aguardando próxima corrida" : p.situacao === "abonado" ? "Cobrança descartada" : p.resolvidoPor ? `por ${p.resolvidoPor}` : ""}</small></td>
                <td>{admin && !["resolvido", "abonado"].includes(p.situacao) ? (
                  <span className="oc-fila">
                    {p.situacao !== "repassado" && <button className="oc-btn peq" onClick={() => agir(p, "repassar")}>Repassar</button>}
                    <button className="oc-btn peq ok" onClick={() => setBaixa(p)}>Baixar</button>
                    <button className="oc-btn peq" onClick={() => agir(p, "abonar")}>Abonar</button>
                  </span>) : "—"}</td></tr>))}</tbody></table></div>
          <Paginacao pagina={dados.pagina} paginas={dados.paginas} total={dados.total} onMudar={setPagina} rotulo="taxas" />
        </>}
      </div>
      {aberto && (
        <Janela onFechar={() => setAberto(false)} titulo="Filtro de pesquisa" sub="Você pode filtrar um ou mais campos" tamanho="estreita"
          rodape={<><button className="oc-btn" type="button" onClick={() => setAberto(false)}>Cancelar</button><button className="oc-btn" type="button" onClick={() => { limparTudo(); setAberto(false); }}>Limpar filtros</button><button className="oc-btn pri" type="button" onClick={aplicar}>Filtrar</button></>}>
          <form onSubmit={(e) => { e.preventDefault(); aplicar(); }} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <label className="oc-l">Número da OS<input id="solicitacao-id" value={rasc.os} onChange={(e) => setRasc({ ...rasc, os: e.target.value })} inputMode="numeric" /></label>
            <label className="oc-l">Situação<select id="lista-tipo-filter" value={rasc.aba} onChange={(e) => setRasc({ ...rasc, aba: e.target.value })}>{SITUACOES.map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></label>
            <div className="oc-l">Período<SeletorPeriodo valor={rasc.per} onChange={(p) => setRasc({ ...rasc, per: p })} opcoes={PERIODOS_TAXAS} /></div>
            <label className="oc-l">Nome/VTR do Motorista<input id="nomeTaxista_filter" placeholder="Buscar motorista" value={rasc.motorista} onChange={(e) => setRasc({ ...rasc, motorista: e.target.value })} /></label>
            <label className="oc-l">Nome do Cliente<input id="nomeCliente_filter" placeholder="Buscar cliente" value={rasc.cliente} onChange={(e) => setRasc({ ...rasc, cliente: e.target.value })} /></label>
          </form>
        </Janela>
      )}
      {baixa && <BaixarTaxa item={baixa} onFechar={() => setBaixa(null)} onFeito={() => { setBaixa(null); recarregar(); }} />}
    </div>
  );
}
