import { useState } from "react";
import { FileDown, Filter, Loader2, RefreshCw, Send, Sparkles } from "lucide-react";
import { api, baixar, corridasCsv, dataHora, dinheiro, hojeIso, numero, STATUS_UI, type CorridaPainel, type Filtro, type Relatorio } from "../api";
import { useSessao } from "../App";
import { Avisos, Cartao, Gaveta, Kpi, Periodo, Titulo, useCarregar } from "../componentes/ui";
import { RelatorioIa } from "../componentes/RelatorioIa";
import { AcoesCorridaPropria } from "../componentes/AcoesCorridaPropria";

/**
 * Consultar corridas: uma tela só, para todas as origens juntas. Filtros completos, atalhos de tempo,
 * atualização automática, indicadores no topo, detalhe ao lado e exportação.
 * A IA vem embutida: "Exportar relatório" manda a consulta da tela e o relatório já sai com a análise.
 */
export default function ConsultarCorridas({ programadas = false }: { programadas?: boolean }) {
  const { marca } = useSessao();
  const inicial: Filtro = { inicio: hojeIso(), fim: hojeIso(), programada: programadas || undefined };
  const [filtro, setFiltro] = useState<Filtro>(inicial);
  const [rascunho, setRascunho] = useState<Filtro>(inicial);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [auto, setAuto] = useState(false);
  const [aberta, setAberta] = useState<CorridaPainel | null>(null);
  const [gerando, setGerando] = useState(false);
  const [rel, setRel] = useState<Relatorio | null>(null);
  const [erroRel, setErroRel] = useState<string | null>(null);
  const [pergunta, setPergunta] = useState("");
  const [resposta, setResposta] = useState<{ texto: string; erro?: boolean } | null>(null);
  const [perguntando, setPerguntando] = useState(false);

  const { dados, erro, carregando, recarregar } = useCarregar(() => api.corridas(filtro), [JSON.stringify(filtro)], auto ? 30_000 : undefined);
  const aplicar = (f: Filtro) => { setFiltro(f); setRascunho(f); };
  const nomeBase = `relatorio-corridas-${filtro.inicio ?? "recentes"}${filtro.fim && filtro.fim !== filtro.inicio ? `_a_${filtro.fim}` : ""}`;
  const csv = () => dados && baixar(`${nomeBase}.csv`, corridasCsv(dados.corridas, marca.mostrarOrigem), "text/csv;charset=utf-8");
  const variasOrigens = (dados?.opcoes.origens.length ?? 0) > 1;
  const mostrarOrigem = marca.mostrarOrigem && variasOrigens;

  async function exportar() {
    setGerando(true); setErroRel(null);
    try {
      const r = await api.relatorio(filtro);
      setRel(r);
      baixar(`${nomeBase}.html`, r.html, "text/html;charset=utf-8"); // já baixa o relatório com a análise
    } catch (e) { setErroRel(e instanceof Error ? e.message : String(e)); } finally { setGerando(false); }
  }

  async function perguntar() {
    if (!pergunta.trim()) return;
    setPerguntando(true);
    try { setResposta({ texto: (await api.perguntar(filtro, pergunta)).resposta }); }
    catch (e) { setResposta({ texto: e instanceof Error ? e.message : String(e), erro: true }); }
    finally { setPerguntando(false); }
  }

  const r = dados?.resumo;
  const pct = (n: number) => (r?.total ? ` (${numero((n / r.total) * 100, 1)}%)` : "");
  const sel = (k: keyof Filtro, rotulo: string, lista: Array<string | { id: string; nome: string }> = []) => (
    <label>{rotulo}
      <select value={String(rascunho[k] ?? "")} onChange={(e) => setRascunho({ ...rascunho, [k]: e.target.value || undefined })}>
        <option value="">Todos</option>
        {lista.map((x) => typeof x === "string" ? <option key={x} value={x}>{x}</option> : <option key={x.id} value={x.id}>{x.nome}</option>)}
      </select>
    </label>
  );

  return (
    <>
      <Titulo titulo={programadas ? "Corridas programadas" : "Consultar corridas"} sub={`Filtre, veja os detalhes e exporte. O relatório já sai com a análise de ${marca.assistente.nome}.`}>
        <label className="interruptor" title="Atualiza a lista a cada 30 segundos"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Atualizar sozinho</label>
        <button className="botao" onClick={recarregar}><RefreshCw size={16} className={carregando ? "gira" : ""} /> Atualizar</button>
        <button className="botao" onClick={csv} disabled={!dados?.total}><FileDown size={16} /> Planilha</button>
        <button className="botao primario" onClick={exportar} disabled={gerando || !dados?.total}>
          {gerando ? <Loader2 size={16} className="gira" /> : <Sparkles size={16} />} {gerando ? `${marca.assistente.nome} analisando...` : "Exportar relatório"}
        </button>
      </Titulo>

      <Cartao>
        <div className="linha-filtro">
          <Periodo valor={filtro} onChange={aplicar} />
          <button className="botao" onClick={() => setMostrarFiltros(!mostrarFiltros)}><Filter size={16} /> Mais filtros</button>
        </div>
        {mostrarFiltros && (
          <div className="filtros">
            <label>Número da OS<input value={rascunho.os ?? ""} onChange={(e) => setRascunho({ ...rascunho, os: e.target.value })} inputMode="numeric" /></label>
            <label>Passageiro, motorista, telefone ou endereço<input value={rascunho.busca ?? ""} onChange={(e) => setRascunho({ ...rascunho, busca: e.target.value })} /></label>
            <label>Status
              <select value={rascunho.grupo ?? ""} onChange={(e) => setRascunho({ ...rascunho, grupo: (e.target.value || undefined) as Filtro["grupo"] })}>
                <option value="">Todos</option>
                {Object.entries(STATUS_UI).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
              </select>
            </label>
            {sel("cidade", "Cidade", dados?.opcoes.cidades)}
            {sel("categoria", "Categoria", dados?.opcoes.categorias)}
            {sel("pagamento", "Forma de pagamento", dados?.opcoes.pagamentos)}
            {sel("canal", "Pedido feito por", dados?.opcoes.canais)}
            {variasOrigens && sel("origem", "Origem", dados?.opcoes.origens)}
            <label className="check"><input type="checkbox" checked={!!rascunho.programada} onChange={(e) => setRascunho({ ...rascunho, programada: e.target.checked || undefined })} /> Só programadas</label>
            <div className="acoes">
              <button className="botao primario" onClick={() => aplicar(rascunho)}>Filtrar</button>
              <button className="botao" onClick={() => aplicar(inicial)}>Limpar filtros</button>
            </div>
          </div>
        )}
      </Cartao>

      <Avisos lista={[...(dados?.avisos ?? []), erro, erroRel]} />

      <div className="kpis">
        <Kpi rotulo="Total" valor={numero(r?.total)} />
        <Kpi rotulo="Finalizadas" valor={numero(r?.finalizadas)} detalhe={r && pct(r.finalizadas)} tom="ok" />
        <Kpi rotulo="Canceladas" valor={numero(r?.canceladas)} detalhe={r && pct(r.canceladas)} tom="ruim" />
        <Kpi rotulo="Não atendidas" valor={numero(r?.naoAtendidas)} detalhe={r && pct(r.naoAtendidas)} tom="alerta" />
        <Kpi rotulo="Em andamento" valor={numero(r?.emAndamento)} tom="info" />
        <Kpi rotulo="Faturamento" valor={dinheiro(r?.faturamento)} detalhe={r && `ticket ${dinheiro(r.ticketMedio)}`} />
      </div>

      <Cartao className="ia-caixa">
        <div className="ia-topo"><Sparkles size={18} /> <strong>{marca.assistente.nome}</strong> <span>já está lendo esta consulta. Pergunte o que quiser sobre ela.</span></div>
        <form className="pergunta" onSubmit={(e) => { e.preventDefault(); perguntar(); }}>
          <input placeholder="Ex.: Por que tantas corridas foram canceladas? Qual o melhor horário para ter mais motoristas?" value={pergunta} onChange={(e) => setPergunta(e.target.value)} />
          <button className="botao primario" disabled={perguntando || !dados?.total}>{perguntando ? <Loader2 size={16} className="gira" /> : <Send size={16} />} Perguntar</button>
        </form>
        {resposta && <p className={resposta.erro ? "resposta erro" : "resposta"}>{resposta.texto}</p>}
      </Cartao>

      <Cartao>
        {carregando && !dados && <p className="vazio"><Loader2 size={16} className="gira" /> Carregando...</p>}
        {dados && !dados.total && <p className="vazio">Nenhuma corrida neste filtro.</p>}
        {!!dados?.total && (
          <div className="tabela-rola">
            <table>
              <thead><tr><th>Data/Hora</th><th>OS</th>{mostrarOrigem && <th>Origem</th>}<th>Partida</th><th>Passageiro</th><th>Motorista</th><th>Cidade</th><th>Categoria</th><th>Pagamento</th><th className="num">Valor</th><th>Status</th></tr></thead>
              <tbody>
                {dados.corridas.map((c) => (
                  <tr key={c.id} onClick={() => setAberta(c)}>
                    <td>{dataHora(c.solicitadaEm)}</td><td className="forte">{c.os}</td>
                    {mostrarOrigem && <td><span className="selo">{c.origemNome}</span></td>}
                    <td className="corta">{c.embarque || "—"}</td>
                    <td>{c.passageiro || c.telefonePassageiro || "—"}</td><td>{c.motorista || "—"}</td><td>{c.cidade || "—"}</td>
                    <td>{c.categoria || "—"}</td><td>{c.pagamento || "—"}</td><td className="num">{dinheiro(c.valor ?? c.valorEstimado)}</td>
                    <td><span className={`selo ${STATUS_UI[c.grupo].classe}`}>{c.statusTexto}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {dados.cortado && <p className="vazio">Mostrando as 2.000 mais recentes de {numero(dados.total)}. O relatório usa todas.</p>}
          </div>
        )}
      </Cartao>

      <Gaveta aberta={!!aberta} onFechar={() => setAberta(null)} titulo={`Corrida ${aberta?.os ?? ""}`}>
        {aberta && <>{aberta.origem === "propria" && <AcoesCorridaPropria id={aberta.id} onMudou={recarregar} />}<Detalhe c={aberta} mostrarOrigem={marca.mostrarOrigem} /></>}
      </Gaveta>
      <RelatorioIa rel={rel} onFechar={() => setRel(null)} nomeBase={nomeBase} onCsv={csv} />
    </>
  );
}

function Detalhe({ c, mostrarOrigem }: { c: CorridaPainel; mostrarOrigem: boolean }) {
  const linha = (r: string, v: unknown) => <div className="dado"><span>{r}</span><strong>{v == null || v === "" ? "—" : String(v)}</strong></div>;
  return (
    <div className="detalhe">
      <span className={`selo ${STATUS_UI[c.grupo].classe}`}>{c.statusTexto}</span> {mostrarOrigem && <span className="selo">{c.origemNome}</span>}
      <h3>Trajeto</h3>
      {linha("Embarque", c.embarque)}{linha("Destino", c.destino)}{linha("Distância estimada", c.distanciaKm != null ? `${numero(c.distanciaKm, 2)} km` : null)}
      <h3>Linha do tempo</h3>
      {linha("Pedido", dataHora(c.solicitadaEm))}{linha("Início", dataHora(c.iniciadaEm))}{linha("Fim", dataHora(c.finalizadaEm))}
      <h3>Pessoas</h3>
      {linha("Passageiro", c.passageiro)}{linha("Telefone do passageiro", c.telefonePassageiro)}{linha("Motorista", c.motorista)}{linha("Telefone do motorista", c.telefoneMotorista)}
      {linha("Distância do motorista no aceite", c.distanciaMotoristaKm != null ? `${numero(c.distanciaMotoristaKm, 1)} km` : null)}
      <h3>Valores</h3>
      {linha("Valor da corrida", dinheiro(c.valor))}{linha("Estimativa", dinheiro(c.valorEstimado))}{linha("Desconto", dinheiro(c.desconto))}{linha("Forma de pagamento", c.pagamento)}
      {linha("Tarifa", c.tarifa)}{linha("Fator dinâmico", c.fatorDinamico)}{linha("Cupom", c.cupom)}
      <h3>Operação</h3>
      {linha("Cidade", c.cidade)}{linha("Categoria", c.categoria)}{linha("Pedido feito por", c.canal)}
      {linha("Operador", c.operador)}{linha("Avaliação", c.avaliacao)}{linha("Programada", c.programada ? "Sim" : "Não")}
      {c.grupo === "cancelada" && <>{linha("Cancelada por", c.canceladaPor)}{linha("Motivo", c.motivoCancelamento)}</>}
      {c.observacao && linha("Observação", c.observacao)}
    </div>
  );
}
