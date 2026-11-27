// Retorno e Ocorrências (Machine): corridas que pedem atenção do operador (canceladas, não atendidas, pendentes e atrasadas).
// Busca pelo nome da empresa, "Mais filtros" (empresa, categoria e os 4 tipos), atualização automática e janela com os detalhes.
import { useState } from "react";
import { ExternalLink, Filter, MapPin, Search } from "lucide-react";
import { Aviso, Dado, Janela, Paginacao, Selo, Vazio, dh, fone, hora, msgErro, op, qs, reais, useDados } from "./comum";
import { JanelaCorrida } from "./JanelaCorrida";
import "./corridas.css";

const TIPOS: Array<[string, string]> = [["C", "Canceladas"], ["N", "Não atendidas"], ["P", "Pendentes"], ["A", "Atrasadas"]];
const SEM = { empresa: "", categoria: "", status: ["C", "N", "P", "A"] };

export default function Ocorrencias() {
  const [auto, setAuto] = useState(true);
  const [pagina, setPagina] = useState(1);
  const [busca, setBusca] = useState("");
  const [nomeEmpresa, setNomeEmpresa] = useState("");
  const [filtro, setFiltro] = useState(SEM);
  const [rasc, setRasc] = useState(SEM);
  const [aberto, setAberto] = useState(false);
  const [sel, setSel] = useState<any>(null);
  const [corrida, setCorrida] = useState<string | null>(null);
  const todos = filtro.status.length === 4;
  const { dados, erro, carregando, recarregar } = useDados<any>(
    () => op(`/ocorrencias${qs({ pagina, nomeEmpresa, empresa: filtro.empresa, categoria: filtro.categoria, status: todos ? "" : filtro.status.join(",") || "-" })}`),
    [pagina, nomeEmpresa, JSON.stringify(filtro)], auto ? 15_000 : undefined);
  const de = dados ? (dados.total ? (dados.pagina - 1) * 20 + 1 : 0) : 0;
  const ate = dados ? Math.min(dados.total, dados.pagina * 20) : 0;
  const marcar = (k: string, on: boolean) => setRasc({ ...rasc, status: on ? [...rasc.status, k] : rasc.status.filter((x) => x !== k) });
  const aplicar = () => { setFiltro(rasc); setPagina(1); setAberto(false); };
  const limpar = () => { setRasc(SEM); setFiltro(SEM); setNomeEmpresa(""); setBusca(""); setPagina(1); setAberto(false); };
  const o = dados?.opcoes;
  const [erroCiencia, setErroCiencia] = useState<string | null>(null);
  /** Registra (ou desfaz) a ciência: a ocorrência deixa de contar no aviso fixo do topo do painel. */
  async function ciencia(i: any, desfazer: boolean) {
    setErroCiencia(null);
    try { const r = await op<{ ciencia: { por: string; em: string } | null }>(`/ocorrencias/${encodeURIComponent(i.id)}/ciencia`, { desfazer }); setSel({ ...i, ciencia: r.ciencia }); recarregar(); window.dispatchEvent(new Event("ocorrencias-mudou")); }
    catch (e) { setErroCiencia(msgErro(e)); }
  }
  return (
    <div className="oc">
      <div className="oc-topo"><h1>Retorno e Ocorrências</h1></div>
      <div className="oc-card oc-fila" style={{ justifyContent: "space-between" }}>
        <form className="oc-fila" onSubmit={(e) => { e.preventDefault(); setNomeEmpresa(busca.trim()); setPagina(1); }}>
          <input name="nomeEmpresa" id="nomeEmpresa" placeholder="Nome da Empresa" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ width: 240 }} />
          <button className="oc-btn" type="submit" aria-label="Buscar"><Search size={16} /></button>
          <button className="oc-btn" type="button" onClick={() => { setRasc(filtro); setAberto(true); }}><Filter size={16} /> Mais filtros</button>
        </form>
        <label className="oc-sw"><input type="checkbox" id="switch-refresh" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> {auto ? "Atualizando automaticamente" : "Atualização automática pausada"}</label>
      </div>
      <Aviso texto={erro} erro />
      {(dados?.avisos ?? []).map((a: string) => <Aviso key={a} texto={a} />)}
      <div className="oc-card">
        {carregando && !dados && <Vazio>...</Vazio>}
        {dados && !dados.total && <Vazio>Nenhum resultado encontrado.</Vazio>}
        {!!dados?.total && <>
          <p className="suave" style={{ margin: "0 0 8px" }}>Exibindo {de}-{ate} de {dados.total} {dados.total === 1 ? "resultado" : "resultados"}.</p>
          <div className="oc-rola"><table><thead><tr><th>Nº OS</th><th>Nome do passageiro</th><th>Ocorrência</th><th>Motorista</th><th>Status</th><th>Prev</th><th>Aviso motorista</th><th>Tempo Expiração</th></tr></thead>
            <tbody>{dados.itens.map((i: any) => (
              <tr key={i.id} className="clic" onClick={() => setSel(i)}>
                <td className="forte">{i.os}</td>
                <td>{i.passageiro || "—"}<br /><small className="suave"><em>{i.embarque}</em></small></td>
                <td><Selo tom={i.tipo === "C" ? "ruim" : "alerta"}>{i.ocorrencia}</Selo>{i.ciencia && <><br /><small className="suave">Ciência de {i.ciencia.por}</small></>}</td>
                <td>{i.motorista || "---"}</td>
                <td>{i.statusTexto}</td>
                <td>{i.previsaoMin != null ? `${i.previsaoMin} min` : "---"}</td>
                <td>{i.avisoMotorista}</td>
                <td>-----</td>
              </tr>))}</tbody></table></div>
          <Paginacao pagina={dados.pagina} paginas={dados.paginas} total={dados.total} onMudar={setPagina} rotulo="ocorrências" />
        </>}
      </div>
      {aberto && (
        <Janela onFechar={() => setAberto(false)} titulo="Filtro de pesquisa" sub="Você pode filtrar um ou mais campos" tamanho="estreita"
          rodape={<><button className="oc-btn" type="button" onClick={limpar}>Limpar filtros</button><button className="oc-btn pri" type="button" onClick={aplicar}>Filtrar</button></>}>
          <form onSubmit={(e) => { e.preventDefault(); aplicar(); }} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <label className="oc-l">Empresa<select id="empresa-filter" value={rasc.empresa} onChange={(e) => setRasc({ ...rasc, empresa: e.target.value })}><option value="">Selecione</option>{(o?.empresas ?? []).map((x: string) => <option key={x}>{x}</option>)}</select></label>
            <label className="oc-l">Categoria<select id="categoria-filter" value={rasc.categoria} onChange={(e) => setRasc({ ...rasc, categoria: e.target.value })}><option value="">Selecione</option>{(o?.categorias ?? []).map((x: string) => <option key={x}>{x}</option>)}</select></label>
            <div className="oc-l">Status</div>
            {TIPOS.map(([k, r]) => <label key={k} className="oc-sw"><input type="checkbox" name="checkbox-filtro" id={`status_${k}`} checked={rasc.status.includes(k)} onChange={(e) => marcar(k, e.target.checked)} /> {r}</label>)}
          </form>
        </Janela>
      )}
      {sel && (
        <Janela onFechar={() => { setSel(null); setErroCiencia(null); }} titulo={`Ocorrência #${sel.os}`} sub={`${hora(sel.hora)} · ${sel.statusTexto}`} tamanho="estreita"
          rodape={<><button className="oc-btn" onClick={() => ciencia(sel, !!sel.ciencia)}>{sel.ciencia ? "Desfazer ciência" : "Registrar ciência"}</button>{sel.id.startsWith("propria:") && <button className="oc-btn" onClick={() => { setCorrida(sel.id); setSel(null); }}><ExternalLink size={14} /> Abrir corrida</button>}<button className="oc-btn pri" onClick={() => setSel(null)}>Fechar Detalhes</button></>}>
          <Aviso texto={erroCiencia} erro />
          {sel.ciencia && <p className="suave" style={{ margin: "0 0 8px" }}>Ciência registrada por {sel.ciencia.por} em {dh(sel.ciencia.em)}.</p>}
          <div className="oc-aviso erro"><b>Motivo do Problema</b><br />{sel.motivo}</div>
          <Dado r="Passageiro" v={sel.passageiro} /><Dado r="Telefone" v={fone(sel.telefone)} />
          <div className="oc-trajeto" style={{ margin: "14px 0" }}><div><i /><small>Origem</small><b>{sel.embarque}</b></div><div className="dest"><i /><small>Destino</small><b>{sel.destino || "Sem destino"}</b></div></div>
          <Dado r="Motorista" v={sel.motorista} /><Dado r="Valor Perdido" v={reais(sel.valorPerdido)} />
          <p className="suave"><MapPin size={12} /> {sel.tipo === "N" ? "Nenhum motorista aceitou a corrida." : sel.tipo === "C" ? "A corrida foi cancelada antes de terminar." : sel.tipo === "A" ? "O motorista está demorando para chegar." : "Ainda não há motorista para esta corrida."}</p>
        </Janela>
      )}
      {corrida && <JanelaCorrida id={corrida} onFechar={() => setCorrida(null)} />}
    </div>
  );
}
