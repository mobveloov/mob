// Histórico (Consultar corridas): filtros avançados, atalhos de tempo, atualização automática, janela da corrida.
// Mantém os extras da central: planilha e análise com IA.
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, FileDown, Filter, HelpCircle, Loader2, Send, Sparkles, X } from "lucide-react";
import { api, baixar, corridasCsv, type CorridaPainel, type Relatorio } from "../../api";
import { useSessao } from "../../App";
import { RelatorioIa } from "../../componentes/RelatorioIa";
import { Aviso, Paginacao, Selo, GRUPO_CLASSE, Janela, Vazio, dh, op, qs, reais, useDados, msgErro } from "./comum";
import { mascaraData, mascaraHora } from "../../componentes/DataBr";
import { JanelaCorrida, JanelaExterna } from "./JanelaCorrida";

// Atalhos da Machine (15 minutos a 4 horas). "Hoje" é nosso, no fim, e é o padrão.
const ATALHOS: Array<[string, string]> = [["15min", "15 minutos"], ["30min", "30 minutos"], ["1h", "1 hora"], ["2h", "2 horas"], ["3h", "3 horas"], ["4h", "4 horas"], ["hoje", "Hoje"]];
/** Status da Machine que o nosso fluxo não usa: aparecem no filtro (como na Machine) e devolvem lista vazia. */
const STATUS_SEM_FLUXO: Array<[string, string]> = [["aguardando_aceite", "Aguardando aceite"], ["aguardando_liberacao", "Aguardando liberação"], ["pagamento_pendente", "Pagamento pendente"], ["negociacao", "Em negociação"]];
/** Ordem dos status no filtro da Machine. */
const ORDEM_STATUS = ["distribuindo", "a_caminho", "nao_atendida", "cancelada", "cancelada_pax", "cancelada_mot", "andamento", "finalizada", "pendente", "espera"];
const hojeBrTxt = () => { const d = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10); return `${d.slice(8)}/${d.slice(5, 7)}/${d.slice(0, 4)}`; };
const VAZIO = { os: "", osExterna: "", centralChamada: "", centralCorrida: "", empresa: "", categoria: "", nomePax: "", telPax: "", cpfPax: "", endereco: "", motorista: "", dataIni: "", dataFim: "", horaIni: "", horaFim: "", pagamento: "", status: "", urgencia: "", via: "", cashback: "", fonte: "", filial: "" };
type Filtros = typeof VAZIO;

/** Dd/mm/aaaa -> aaaa-mm-dd (aceita também a data já no formato do campo de data). */
const dataIso = (s: string) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim()); return m ? `${m[3]}-${m[2]}-${m[1]}` : /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ""; };

export default function Historico({ programadas = false }: { programadas?: boolean }) {
  const { marca } = useSessao();
  const [rapido, setRapido] = useState(new URLSearchParams(window.location.search).get("motorista") ? "" : "hoje");
  const [params] = useSearchParams();
  const inicial: Filtros = { ...VAZIO, motorista: params.get("motorista") ?? "" };
  const [f, setF] = useState<Filtros>(inicial);
  const [rasc, setRasc] = useState<Filtros>(inicial);
  const [filtroAberto, setFiltroAberto] = useState(false);
  const [auto, setAuto] = useState(true);
  const [pagina, setPagina] = useState(1);
  const [aberta, setAberta] = useState<CorridaPainel | null>(null);
  const [legenda, setLegenda] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [rel, setRel] = useState<Relatorio | null>(null);
  const [pronto, setPronto] = useState<{ nome: string; csv: string } | null>(null);
  const [erroEx, setErroEx] = useState<string | null>(null);
  const [pergunta, setPergunta] = useState("");
  const [resposta, setResposta] = useState<{ texto: string; erro?: boolean } | null>(null);
  const [perguntando, setPerguntando] = useState(false);

  const consulta = { ...f, dataIni: dataIso(f.dataIni), dataFim: dataIso(f.dataFim), rapido: f.dataIni || f.dataFim ? "" : rapido };
  const { dados, erro, carregando } = useDados<any>(() => op(`/historico${qs({ ...consulta, pagina })}`), [JSON.stringify(consulta), pagina], auto ? 30_000 : undefined);
  const aplicar = () => { setF(rasc); setPagina(1); setFiltroAberto(false); };
  const limpar = () => { setRasc(VAZIO); setF(VAZIO); setRapido("hoje"); setPagina(1); setFiltroAberto(false); };
  const nFiltros = Object.values(f).filter(Boolean).length;
  const nomeBase = `relatorio-corridas-${new Date().toISOString().slice(0, 10)}`;
  const s = dados?.stats;

  const todas = async (): Promise<CorridaPainel[]> => (await op<{ corridas: CorridaPainel[] }>(`/historico${qs({ ...consulta, todas: 1 })}`)).corridas;
  /** Exportar: o servidor monta o CSV de tudo o que o filtro mostra (com proteção contra fórmula). Com outra fonte conectada, monta aqui. */
  async function planilha() {
    setErroEx(null);
    try {
      let arq: { nome: string; csv: string };
      try { arq = await op<{ nome: string; csv: string }>(`/historico/exportar${qs(consulta)}`); }
      catch { arq = { nome: `${nomeBase}.csv`, csv: corridasCsv(await todas(), marca.mostrarOrigem) }; }
      setPronto(arq);
    } catch (e) { setErroEx(msgErro(e)); }
  }
  async function exportar() {
    setGerando(true); setErroEx(null);
    try { const r = await api.relatorio(dados.filtroBase); setRel(r); baixar(`${nomeBase}.html`, r.html, "text/html;charset=utf-8"); }
    catch (e) { setErroEx(msgErro(e)); } finally { setGerando(false); }
  }
  async function perguntar() {
    if (!pergunta.trim() || !dados) return;
    setPerguntando(true);
    try { setResposta({ texto: (await api.perguntar(dados.filtroBase, pergunta)).resposta }); } catch (e) { setResposta({ texto: msgErro(e), erro: true }); } finally { setPerguntando(false); }
  }
  const campo = (k: keyof Filtros, r: string, ph = "", tipo = "text") => <label className="oc-l">{r}<input type={tipo} value={rasc[k]} onChange={(e) => setRasc({ ...rasc, [k]: e.target.value })} placeholder={ph} /></label>;
  const mascarado = (k: keyof Filtros, r: string, m: (s: string) => string, max = 10) => <label className="oc-l">{r}<input type="text" inputMode="numeric" maxLength={max} placeholder={max === 5 ? "hh:mm" : "dd/mm/aaaa"} value={rasc[k]} onChange={(e) => setRasc({ ...rasc, [k]: m(e.target.value) })} /></label>;
  const lista = (k: keyof Filtros, r: string, itens: Array<string | { id: string; nome: string }> = [], todos = "Todas") => (
    <label className="oc-l">{r}<select value={rasc[k]} onChange={(e) => setRasc({ ...rasc, [k]: e.target.value })}><option value="">{todos}</option>
      {itens.map((x) => typeof x === "string" ? <option key={x} value={x}>{x}</option> : <option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>
  );
  const op_ = dados?.opcoes;

  return (
    <div className="oc">
      <div className="oc-topo">
        <h1>{programadas ? "Corridas programadas" : "Consultar corridas"} {dados && <small>{dados.total} no filtro</small>}</h1>
        <div className="oc-fila">
          <button className="oc-btn" onClick={planilha} disabled={!dados?.total}><FileDown size={16} /> Exportar relatório</button>
          <button className="oc-btn pri" onClick={exportar} disabled={gerando || !dados?.total}>{gerando ? <Loader2 size={16} className="gira" /> : <Sparkles size={16} />} {gerando ? `${marca.assistente.nome} analisando...` : `Análise de ${marca.assistente.nome}`}</button>
        </div>
      </div>

      <div className="oc-kpis">
        <div className="oc-kpi"><span>Total</span><strong>{s?.total ?? 0}</strong></div>
        <div className="oc-kpi ok"><span>Finalizadas</span><strong>{s?.finalizadas ?? 0}</strong></div>
        <div className="oc-kpi ruim"><span>Canceladas</span><strong>{s?.canceladas ?? 0}</strong></div>
        <div className="oc-kpi info"><span>Ativas</span><strong>{s?.andamento ?? 0}</strong><small>{s?.andamentoMoto ?? 0} moto · {s?.andamentoCarro ?? 0} carro</small></div>
      </div>

      <div className="oc-card oc-fila" style={{ justifyContent: "space-between" }}>
        <div className="oc-fila">
          <button className="oc-btn" onClick={() => { setRasc({ ...f, dataIni: f.dataIni || hojeBrTxt(), dataFim: f.dataFim || hojeBrTxt() }); setFiltroAberto(true); }}><Filter size={16} /> Filtro{nFiltros > 0 && <Selo tom="info">{nFiltros}</Selo>}</button>
          <label className="oc-sw"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> {auto ? "Atualizando automaticamente" : "Atualização automática pausada"}</label>
        </div>
        <div className="oc-fila">
          <span className="suave" style={{ fontWeight: 800 }}>Exibindo as últimas:</span>
          {ATALHOS.map(([k, r]) => <button key={k} className={`oc-chip ${!(f.dataIni || f.dataFim) && rapido === k ? "on" : ""}`} onClick={() => { setRapido(k); setF({ ...f, dataIni: "", dataFim: "" }); setPagina(1); }}>{r}</button>)}
          <button className="oc-x" onClick={() => setLegenda(true)} aria-label="Legenda"><HelpCircle size={18} /></button>
        </div>
      </div>

      <Aviso texto={erro} erro />
      <Aviso texto={erroEx} erro />
      {(dados?.avisos ?? []).map((a: string) => <Aviso key={a} texto={a} />)}

      <div className="oc-card">
        <form className="oc-fila" onSubmit={(e) => { e.preventDefault(); perguntar(); }} style={{ flexWrap: "nowrap" }}>
          <Sparkles size={18} color="var(--oc-pri)" />
          <input placeholder={`Pergunte a ${marca.assistente.nome} sobre esta consulta. Ex.: por que tantas corridas foram canceladas?`} value={pergunta} onChange={(e) => setPergunta(e.target.value)} />
          <button className="oc-btn pri" disabled={perguntando || !dados?.total}>{perguntando ? <Loader2 size={16} className="gira" /> : <Send size={16} />} Perguntar</button>
        </form>
        {resposta && <p className={resposta.erro ? "oc-aviso erro" : ""} style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>{resposta.texto}</p>}
      </div>

      <div className="oc-card">
        {carregando && !dados && <Vazio><Loader2 size={16} className="gira" /> Carregando...</Vazio>}
        {dados && !dados.total && <Vazio>Nenhum resultado encontrado.</Vazio>}
        {!!dados?.total && <>
          <div className="oc-rola"><table>
            <thead><tr><th>Alerta</th><th>Nº OS</th><th>Partida</th><th>Passageiro</th><th>Motorista</th><th>Empresa</th><th>Status</th></tr></thead>
            <tbody>
              {dados.corridas.map((c: CorridaPainel & { alerta?: boolean; empresa?: string; osExterna?: string }) => (
                <tr key={c.id} className="clic" onClick={() => setAberta(c)}>
                  <td>{c.alerta ? <AlertTriangle size={14} color="var(--oc-alerta)" aria-label="Com alerta" /> : ""}</td>
                  <td className="forte">{c.os}<br /><small className="suave">{rapido !== "hoje" || f.dataIni || f.dataFim ? dh(c.solicitadaEm) : c.solicitadaEm?.slice(11, 19)}</small>{c.osExterna && <><br /><small className="suave">ext. {c.osExterna}</small></>}</td>
                  <td><span className="corta">{c.embarque || "—"}</span></td>
                  <td>{c.passageiro || c.telefonePassageiro || "—"}</td>
                  <td>{c.motorista || "—"}</td>
                  <td>{c.empresa || "---"}</td>
                  <td><Selo tom={GRUPO_CLASSE[c.grupo]}>{c.statusTexto}</Selo></td>
                </tr>
              ))}
            </tbody></table></div>
          <Paginacao pagina={dados.pagina} paginas={dados.paginas} total={dados.total} onMudar={setPagina} rotulo="corridas" />
        </>}
      </div>

      {filtroAberto && (
        <Janela onFechar={() => setFiltroAberto(false)} titulo="Filtro de pesquisa" sub="Você pode filtrar um ou mais campos" tamanho="media"
          rodape={<><button className="oc-btn" type="button" onClick={() => setFiltroAberto(false)}>Cancelar</button><button className="oc-btn" type="button" onClick={limpar}><X size={14} /> Limpar filtros</button><button className="oc-btn pri" type="button" onClick={aplicar}>Filtrar</button></>}>
          <form onSubmit={(e) => { e.preventDefault(); aplicar(); }} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="oc-grid2">{campo("os", "Número da OS", "", "number")}{campo("osExterna", "Número externo da OS", "")}</div>
            <div className="oc-grid2">{lista("centralChamada", "Central chamada", op_?.centrais, "Selecione")}{lista("centralCorrida", "Central da corrida", op_?.centrais, "Selecione")}</div>
            
            <div className="oc-grid2">{lista("empresa", "Empresa", op_?.empresas, "Selecione")}{lista("categoria", "Categoria", op_?.categorias, "Selecione")}</div>
            <div className="oc-grid3">{campo("nomePax", "Nome do passageiro", "")}{campo("telPax", "Telefone do passageiro", "+55 11 96123-4567", "tel")}{campo("cpfPax", "CPF do passageiro", "000.000.000-00")}</div>
            {campo("endereco", "Endereço de partida", "")}
            {campo("motorista", "Nome/VTR/Placa do motorista", "")}
            <div className="oc-grid2">{mascarado("dataIni", "Data inicial", mascaraData)}{mascarado("horaIni", "Hora inicial", mascaraHora, 5)}{mascarado("dataFim", "Data final", mascaraData)}{mascarado("horaFim", "Hora final", mascaraHora, 5)}</div>
            <div className="oc-grid2">
              {lista("pagamento", "Forma de pagamento", op_?.pagamentos, "Selecione")}
              <label className="oc-l">Status<select value={rasc.status} onChange={(e) => setRasc({ ...rasc, status: e.target.value })}><option value="">Selecione</option>
                {Object.entries<string>(dados?.status ?? {}).sort((a, b) => ORDEM_STATUS.indexOf(a[0]) - ORDEM_STATUS.indexOf(b[0])).map(([k, r]) => <option key={k} value={k}>{String(r)}</option>)}
                {STATUS_SEM_FLUXO.map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></label>
              {lista("urgencia", "Urgência", op_?.urgencias, "Selecione")}
              {lista("via", "Corrida via", op_?.vias, "Selecione")}
              {(op_?.filiais?.length ?? 0) > 0 && lista("filial", "Filial", op_.filiais, "Todas")}
              {marca.mostrarOrigem && (op_?.fontes?.length ?? 0) > 1 && lista("fonte", "Fonte dos dados", op_.fontes, "Todas")}
            </div>
            <h3 className="suave" style={{ margin: 0 }}>Outros filtros</h3>
            <label className="oc-sw"><input type="checkbox" checked={rasc.cashback === "1"} onChange={(e) => setRasc({ ...rasc, cashback: e.target.checked ? "1" : "" })} /> Corridas que geraram cashback</label>
          </form>
        </Janela>
      )}
      {pronto && (
        <Janela onFechar={() => setPronto(null)} titulo="Relatório gerado com sucesso!" sub="O arquivo está pronto para download" tamanho="estreita" nivel="centro"
          rodape={<button className="oc-btn pri" onClick={() => { baixar(pronto.nome, pronto.csv, "text/csv;charset=utf-8"); setPronto(null); }}>Baixar relatório</button>}><span /></Janela>
      )}
      {legenda && (
        <Janela onFechar={() => setLegenda(false)} titulo="Status das corridas" tamanho="estreita" nivel="centro">
          <div className="oc-legenda">
            {[["Finalizada", "ok"], ["Em andamento", "info"], ["Cancelada", "ruim"], ["Não atendida", "alerta"]].map(([t, c]) => <div key={t}><Selo tom={c}>{t}</Selo></div>)}
            <div><AlertTriangle size={14} color="var(--oc-alerta)" /> Corrida com alerta aberto (motorista parado, atraso ou SOS)</div>
          </div>
        </Janela>
      )}
      {aberta && (aberta.origem === "propria" ? <JanelaCorrida id={aberta.id} onFechar={() => setAberta(null)} /> : <JanelaExterna c={aberta} onFechar={() => setAberta(null)} />)}
      <RelatorioIa rel={rel} onFechar={() => setRel(null)} nomeBase={nomeBase} onCsv={planilha} />
    </div>
  );
}
