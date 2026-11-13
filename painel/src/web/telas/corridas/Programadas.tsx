// Programadas: corridas agendadas (Hoje, Amanhã, Próximas, Todas), com janela de agendamento (cancelar e editar).
import { useEffect, useState } from "react";
import { Ban, Edit3, Loader2 } from "lucide-react";
import { Aviso, Janela, Paginacao, Selo, Vazio, dhAno, msgErro, op, qs, reais, useDados, fone } from "./comum";
import "./corridas.css";

const FILTROS: Array<[string, string]> = [["hoje", "Hoje"], ["amanha", "Amanhã"], ["futuras", "Próximas"], ["todas", "Todas"]];
const TOM: Record<string, string> = { procurando: "alerta", a_caminho: "info", no_local: "info", em_andamento: "info", finalizada: "ok", cancelada: "ruim", nao_atendida: "alerta" };

export default function Programadas() {
  const [filtro, setFiltro] = useState("futuras");
  const [busca, setBusca] = useState("");
  const [b, setB] = useState("");
  const [pagina, setPagina] = useState(1);
  const [sel, setSel] = useState<any>(null);
  useEffect(() => { const t = setTimeout(() => { setB(busca); setPagina(1); }, 350); return () => clearTimeout(t); }, [busca]);
  const { dados, erro, carregando, recarregar } = useDados<any>(() => op(`/programadas${qs({ filtro, busca: b, pagina })}`), [filtro, b, pagina], 30_000);
  return (
    <div className="oc">
      <div className="oc-topo">
        <h1>Corridas Programadas</h1>
        <div className="oc-fila">
          {FILTROS.map(([k, r]) => <button key={k} className={`oc-chip ${filtro === k ? "on" : ""}`} onClick={() => { setFiltro(k); setPagina(1); }}>{r}</button>)}
          <input style={{ width: 220 }} placeholder="Buscar passageiro..." value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar passageiro" />
        </div>
      </div>
      <Aviso texto={erro} erro />
      <div className="oc-card">
        {carregando && !dados && <Vazio>Carregando...</Vazio>}
        {dados && !dados.total && <Vazio>Nenhuma corrida programada neste filtro.</Vazio>}
        {!!dados?.total && <>
          <div className="oc-rola"><table><thead><tr><th>Agendada Para</th><th>ID</th><th>Passageiro</th><th>Origem</th><th>Motorista</th><th>Status</th></tr></thead>
            <tbody>{dados.itens.map((c: any) => (
              <tr key={c.id} className="clic" onClick={() => setSel(c)}>
                <td className="forte">{dhAno(c.agendadaPara)}</td><td>{c.os}</td><td>{c.passageiro}<br /><small>{fone(c.telefone)}</small></td><td className="corta">{c.origem}</td><td>{c.motorista || "—"}</td>
                <td><Selo tom={TOM[c.status]}>{c.statusTexto}</Selo></td></tr>))}</tbody></table></div>
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
