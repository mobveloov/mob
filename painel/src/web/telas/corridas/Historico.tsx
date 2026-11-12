// Histórico (Consultar corridas): filtros avançados, atalhos de tempo, atualização automática, janela da corrida.
// Mantém os extras da central: planilha e análise com IA.
import { useState } from "react";
import { AlertTriangle, FileDown, Filter, HelpCircle, Loader2, Send, Sparkles, X } from "lucide-react";
import { api, baixar, corridasCsv, type CorridaPainel, type Relatorio } from "../../api";
import { useSessao } from "../../App";
import { RelatorioIa } from "../../componentes/RelatorioIa";
import { Aviso, Paginacao, Selo, GRUPO_CLASSE, Janela, Vazio, dh, op, qs, reais, useDados, msgErro } from "./comum";
import { JanelaCorrida, JanelaExterna } from "./JanelaCorrida";

const ATALHOS: Array<[string, string]> = [["15min", "15m"], ["30min", "30m"], ["1h", "1h"], ["4h", "4h"], ["hoje", "Hoje"]];
const VAZIO = { os: "", cidade: "", categoria: "", endereco: "", nomePax: "", cpfPax: "", telPax: "", motorista: "", dataIni: "", dataFim: "", horaIni: "", horaFim: "", pagamento: "", origem: "", status: "", fonte: "" };
type Filtros = typeof VAZIO;
const iconeStatus: Record<string, string> = { aguardando: "🟡", pendente: "🟠", andamento: "🔵", finalizada: "✅", cancelada_pax: "❌", cancelada_mot: "⛔", nao_atendida: "🕰️" };

/** Dd/mm/aaaa -> aaaa-mm-dd (aceita também a data já no formato do campo de data). */
const dataIso = (s: string) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim()); return m ? `${m[3]}-${m[2]}-${m[1]}` : /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ""; };

export default function Historico({ programadas = false }: { programadas?: boolean }) {
  const { marca } = useSessao();
  const [rapido, setRapido] = useState("hoje");
  const [f, setF] = useState<Filtros>(VAZIO);
  const [rasc, setRasc] = useState<Filtros>(VAZIO);
  const [filtroAberto, setFiltroAberto] = useState(false);
  const [auto, setAuto] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [aberta, setAberta] = useState<CorridaPainel | null>(null);
  const [legenda, setLegenda] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [rel, setRel] = useState<Relatorio | null>(null);
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
  async function planilha() {
    try { baixar(`${nomeBase}.csv`, corridasCsv(await todas(), marca.mostrarOrigem), "text/csv;charset=utf-8"); } catch (e) { setErroEx(msgErro(e)); }
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
  const lista = (k: keyof Filtros, r: string, itens: Array<string | { id: string; nome: string }> = [], todos = "Todas") => (
    <label className="oc-l">{r}<select value={rasc[k]} onChange={(e) => setRasc({ ...rasc, [k]: e.target.value })}><option value="">{todos}</option>
      {itens.map((x) => typeof x === "string" ? <option key={x} value={x}>{x}</option> : <option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>
  );
  const op_ = dados?.opcoes;

  return (
    <div className="oc">
      <div className="oc-topo">
        <h1>{programadas ? "Corridas programadas" : "Corridas"} {dados && <small>{dados.total} no filtro</small>}</h1>
        <div className="oc-fila">
          <button className="oc-btn" onClick={planilha} disabled={!dados?.total}><FileDown size={16} /> Planilha</button>
          <button className="oc-btn pri" onClick={exportar} disabled={gerando || !dados?.total}>{gerando ? <Loader2 size={16} className="gira" /> : <Sparkles size={16} />} {gerando ? `${marca.assistente.nome} analisando...` : "Exportar relatório"}</button>
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
          <button className="oc-btn" onClick={() => { setRasc(f); setFiltroAberto(true); }}><Filter size={16} /> Filtros{nFiltros > 0 && <Selo tom="info">{nFiltros}</Selo>}</button>
          <label className="oc-sw"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto-Update</label>
        </div>
        <div className="oc-fila">
          <span className="suave" style={{ fontWeight: 800 }}>PERÍODO:</span>
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
        {dados && !dados.total && <Vazio>Nenhuma corrida encontrada.<br />Tente ajustar os filtros.</Vazio>}
        {!!dados?.total && <>
          <div className="oc-rola"><table>
            <thead><tr><th>Data/Hora</th><th>ID</th><th>Origem</th><th>Passageiro</th><th>Motorista</th><th>Cidade</th><th>Status</th></tr></thead>
            <tbody>
              {dados.corridas.map((c: CorridaPainel & { alerta?: boolean }) => (
                <tr key={c.id} className="clic" onClick={() => setAberta(c)}>
                  <td>{dh(c.solicitadaEm)}</td>
                  <td className="forte">{c.alerta && <AlertTriangle size={13} color="var(--oc-alerta)" />} {c.os}</td>
                  <td><Selo>{c.canal || "—"}</Selo></td>
                  <td>{c.passageiro || c.telefonePassageiro || "—"}<br /><small className="corta">{c.embarque}</small></td>
                  <td>{c.motorista || "—"}</td><td>{c.cidade || "—"}</td>
                  <td><Selo tom={GRUPO_CLASSE[c.grupo]}>{c.statusTexto}</Selo>{(c.valor ?? c.valorEstimado) != null && <small> {reais(c.valor ?? c.valorEstimado)}</small>}</td>
                </tr>
              ))}
            </tbody></table></div>
          <Paginacao pagina={dados.pagina} paginas={dados.paginas} total={dados.total} onMudar={setPagina} rotulo="corridas" />
        </>}
      </div>

      {filtroAberto && (
        <Janela onFechar={() => setFiltroAberto(false)} titulo="Filtros Avançados" sub="Refine sua busca" tamanho="media"
          rodape={<><button className="oc-btn" type="button" onClick={limpar}><X size={14} /> Limpar</button><button className="oc-btn pri" type="button" onClick={aplicar}>Aplicar Filtros</button></>}>
          <form onSubmit={(e) => { e.preventDefault(); aplicar(); }} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <h3 className="suave" style={{ margin: 0 }}>Identificação</h3>
            {campo("os", "Número da OS (ID)", "Ex: 1234")}
            <h3 className="suave" style={{ margin: 0 }}>Localidade & Veículo</h3>
            <div className="oc-grid2">{lista("cidade", "Cidade Base", op_?.cidades)}{lista("categoria", "Categoria", op_?.categorias)}</div>
            {campo("endereco", "Endereço (Rua, Bairro...)", "Digite um trecho do endereço...")}
            <h3 className="suave" style={{ margin: 0 }}>Pessoas Envolvidas</h3>
            <div className="oc-grid3">{campo("nomePax", "Passageiro", "Nome completo...")}{campo("cpfPax", "CPF", "CPF")}{campo("telPax", "Telefone", "Telefone")}</div>
            {campo("motorista", "Motorista", "Nome ou Placa do veículo...")}
            <h3 className="suave" style={{ margin: 0 }}>Período Customizado</h3>
            <div className="oc-grid2">{campo("dataIni", "Data Início", "", "date")}{campo("dataFim", "Data Fim", "", "date")}{campo("horaIni", "Hora Início", "00:00", "time")}{campo("horaFim", "Hora Fim", "23:59", "time")}</div>
            <h3 className="suave" style={{ margin: 0 }}>Operacional</h3>
            <div className="oc-grid2">
              {lista("pagamento", "Pagamento", op_?.pagamentos, "Todos")}
              {lista("origem", "Origem (Plataforma)", op_?.origens)}
              <label className="oc-l">Status Atual<select value={rasc.status} onChange={(e) => setRasc({ ...rasc, status: e.target.value })}><option value="">Todos os Status</option>
                {Object.entries(dados?.status ?? {}).map(([k, r]) => <option key={k} value={k}>{iconeStatus[k]} {String(r)}</option>)}</select></label>
              {marca.mostrarOrigem && (op_?.fontes?.length ?? 0) > 1 && lista("fonte", "Fonte dos dados", op_.fontes, "Todas")}
            </div>
          </form>
        </Janela>
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
