// Programadas: corridas agendadas (Hoje, Amanhã, Próximas, Todas), com janela de agendamento (cancelar e editar).
import { useState } from "react";
import { Ban, Edit3, FileDown, Loader2 } from "lucide-react";
import { Aviso, Janela, Paginacao, Selo, Vazio, dia, dhAno, msgErro, op, qs, reais, useDados, fone } from "./comum";
import "./corridas.css";

const TOM: Record<string, string> = { procurando: "alerta", a_caminho: "info", no_local: "info", em_andamento: "info", finalizada: "ok", cancelada: "ruim", nao_atendida: "alerta" };
const TOM_SIT: Record<string, string> = { distribuida: "ok", aguardando: "alerta", cancelada: "ruim", erro: "ruim" };
const VAZIO = { centralChamada: "", empresa: "", os: "", categoria: "", passageiro: "", motorista: "", dataIni: "", dataFim: "", pagamento: "", situacao: "", filial: "" };
type Filtros = typeof VAZIO;

export default function Programadas() {
  const [f, setF] = useState<Filtros>(VAZIO);
  const [rasc, setRasc] = useState<Filtros>(VAZIO);
  const [pagina, setPagina] = useState(1);
  const [sel, setSel] = useState<any>(null);
  const [erroEx, setErroEx] = useState<string | null>(null);
  const { dados, erro, carregando, recarregar } = useDados<any>(() => op(`/programadas${qs({ ...f, pagina })}`), [JSON.stringify(f), pagina], 30_000);
  const o = dados?.opcoes;
  const lista = (k: keyof Filtros, r: string, itens: Array<string | { id: string; nome: string }> = []) => (
    <label className="oc-l">{r}<select value={rasc[k]} onChange={(e) => setRasc({ ...rasc, [k]: e.target.value })}><option value="">Selecione</option>
      {itens.map((x) => typeof x === "string" ? <option key={x} value={x}>{x}</option> : <option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>
  );
  const campo = (k: keyof Filtros, r: string, tipo = "text") => <label className="oc-l">{r}<input type={tipo} value={rasc[k]} onChange={(e) => setRasc({ ...rasc, [k]: e.target.value })} /></label>;
  const filtrar = () => { setF(rasc); setPagina(1); };
  const limpar = () => { setRasc(VAZIO); setF(VAZIO); setPagina(1); };
  async function exportar() {
    setErroEx(null);
    try {
      const r = await fetch(`/api/operacao/programadas/exportar${qs(f)}`, { credentials: "same-origin" });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { erro?: string }).erro || `Erro ${r.status}`);
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a"); a.href = url; a.download = "corridas-programadas.csv"; a.click(); URL.revokeObjectURL(url);
    } catch (e) { setErroEx(msgErro(e)); }
  }
  return (
    <div className="oc">
      <div className="oc-topo">
        <h1>Corridas programadas</h1>
        <div className="oc-fila"><button className="oc-btn" onClick={exportar} disabled={!dados?.total}><FileDown size={16} /> Exportar</button></div>
      </div>
      <Aviso texto={erro} erro />
      <Aviso texto={erroEx} erro />
      <form className="oc-card" onSubmit={(e) => { e.preventDefault(); filtrar(); }}>
        <h3 style={{ marginTop: 0 }}>Filtros</h3>
        <div className="oc-grid3">
          {lista("centralChamada", "Central chamada", o?.centrais)}{lista("empresa", "Empresa", o?.empresas)}{campo("os", "Nº OS")}
          {lista("categoria", "Categoria", o?.categorias)}{campo("passageiro", "Nome do passageiro")}{campo("motorista", "Nome/VTR do motorista")}
          {campo("dataIni", "Data inicial", "date")}{campo("dataFim", "Data final", "date")}{lista("pagamento", "Forma de pagamento", o?.pagamentos)}
          {lista("situacao", "Situação do disparo", o?.situacoes)}{!!o?.filiais?.length && lista("filial", "Filial", o.filiais)}
        </div>
        <div className="oc-fila" style={{ marginTop: 12 }}>
          <button className="oc-btn pri" type="submit">Filtrar</button>
          <button className="oc-btn" type="button" onClick={limpar}>Limpar filtros</button>
        </div>
      </form>
      <div className="oc-card">
        {carregando && !dados && <Vazio>Carregando...</Vazio>}
        {dados && !dados.total && <Vazio>Nenhum resultado encontrado.</Vazio>}
        {!!dados?.total && <>
          <p className="suave" style={{ marginTop: 0 }}>Exibindo {(dados.pagina - 1) * 10 + 1}-{(dados.pagina - 1) * 10 + dados.itens.length} de {dados.total} {dados.total === 1 ? "resultado" : "resultados"}.</p>
          <div className="oc-rola"><table><thead><tr><th>Nº OS programada</th><th>Data</th><th>Hora</th><th>Antecedência (minutos)</th><th>Nome do passageiro</th><th>Empresa</th><th>Situação do disparo</th></tr></thead>
            <tbody>{dados.itens.map((c: any) => (
              <tr key={c.id} className="clic" onClick={() => setSel(c)}>
                <td className="forte">{c.os}</td><td>{dia(c.agendadaPara)}</td><td>{c.agendadaPara.slice(11, 16)}</td><td>{c.antecedencia}</td>
                <td>{c.passageiro}<br /><small className="suave">{c.origem}</small></td><td>{c.empresa || "---"}</td>
                <td><Selo tom={TOM_SIT[c.situacao]}>{c.situacaoTexto}</Selo></td></tr>))}</tbody></table></div>
          <Paginacao pagina={dados.pagina} paginas={dados.paginas} total={dados.total} onMudar={setPagina} rotulo="agendamentos" />
        </>}
      </div>
      {sel && <Detalhe c={sel} onFechar={() => setSel(null)} onMudou={() => { setSel(null); recarregar(); }} />}
    </div>
  );
}

function Detalhe({ c, onFechar, onMudou }: { c: any; onFechar: () => void; onMudou: () => void }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ dataHora: String(c.agendadaPara).slice(0, 16), valor: c.valor != null ? String(c.valor).replace(".", ",") : "", observacao: c.observacao ?? "" });
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const fazer = async (fn: () => Promise<unknown>) => { setOcupado(true); setErro(null); try { await fn(); onMudou(); } catch (e) { setErro(msgErro(e)); } finally { setOcupado(false); } };
  const salvar = () => fazer(() => op(`/programadas/${c.id}`, f, "PUT"));
  const cancelar = () => confirm("Cancelar este agendamento?") && fazer(() => op(`/corridas/${c.id}/cancelar`, { origem: "central", motivo: "Agendamento cancelado pela central" }));
  const ro = (r: string, v: string) => <label className="oc-l">{r}<input value={v} readOnly /></label>;
  return (
    <Janela onFechar={onFechar} titulo={`Agendamento #${c.os}`} sub={<Selo tom={TOM[c.status]}>{c.statusTexto}</Selo>} tamanho="media"
      acoes={c.aberta && <>
        <button className="oc-btn ruim" onClick={cancelar} disabled={ocupado}><Ban size={15} /> Cancelar</button>
        <button className="oc-btn" onClick={() => setEdit(!edit)}><Edit3 size={15} /> {edit ? "Ver" : "Editar"}</button></>}
      rodape={edit && <button className="oc-btn pri" onClick={salvar} disabled={ocupado}>{ocupado && <Loader2 size={16} className="gira" />} Salvar Alterações</button>}>
      <Aviso texto={erro} erro />
      <div className="oc-grid2">
        <label className="oc-l">Data e Hora<input type="datetime-local" value={f.dataHora} readOnly={!edit} onChange={(e) => setF({ ...f, dataHora: e.target.value })} /></label>
        {ro("Passageiro", c.passageiro)}{ro("Solicitado em", dhAno(c.solicitadaEm))}{ro("Pagamento", c.pagamento)}
        <div style={{ gridColumn: "1 / -1" }}>{ro("Origem", c.origem)}</div>
        <div style={{ gridColumn: "1 / -1" }}>{ro("Destino", c.destino || "Sem destino")}</div>
        <label className="oc-l">Valor Estimado (R$){edit ? <input value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} inputMode="decimal" /> : <input value={reais(c.valor)} readOnly />}</label>
        {ro("Motorista", c.motorista || "—")}
        <label className="oc-l" style={{ gridColumn: "1 / -1" }}>Observação<textarea value={f.observacao} readOnly={!edit} onChange={(e) => setF({ ...f, observacao: e.target.value })} /></label>
      </div>
    </Janela>
  );
}
