// Gestão de pendências de pagamentos: tipos (Pagamento insuficiente, Taxa de cancelamento, Pix no app) e situações
// (Pendente, Processando, Resolvido, Abonado). Só o administrador muda a situação ou registra uma pendência.
import { useEffect, useState } from "react";
import { Aviso, Janela, Paginacao, Selo, Vazio, dh, fone, msgErro, op, qs, useDados } from "./comum";
import { BotaoExportar, PERIODO_30, SeletorPeriodo, brl, paramsPeriodo, useAdmin, type PeriodoPag } from "./pagamentos-comum";
import "./corridas.css";

const TOM: Record<string, string> = { pendente: "alerta", processando: "info", resolvido: "ok", abonado: "ruim" };
const NOME: Record<string, string> = { pendente: "Pendente", processando: "Processando", resolvido: "Resolvido", abonado: "Abonado" };
const TIPOS = ["Pagamento insuficiente", "Taxa de cancelamento", "Pix no app"];

export default function Pendentes() {
  const admin = useAdmin();
  const [tipo, setTipo] = useState("todos");
  const [status, setStatus] = useState("pendente");
  const [busca, setBusca] = useState(""), [b, setB] = useState("");
  const [per, setPer] = useState<PeriodoPag>(PERIODO_30);
  const [maisFiltros, setMais] = useState(false), [motorista, setMotorista] = useState("");
  const [pagina, setPagina] = useState(1);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const [baixa, setBaixa] = useState<any>(null);
  useEffect(() => { const t = setTimeout(() => { setB(busca); setPagina(1); }, 350); return () => clearTimeout(t); }, [busca]);
  const filtro = { tipo, busca: b, motorista, ...paramsPeriodo(per) };
  const { dados, erro, carregando, recarregar } = useDados<any>(() => op(`/pendencias${qs({ ...filtro, status, pagina })}`), [JSON.stringify(filtro), status, pagina]);
  async function agir(p: any, acao: string) {
    if (acao === "abonar" && !confirm("Abonar (perdoar) esta pendência? O passageiro não precisará pagar.")) return;
    setErroAcao(null);
    try { await op(`/pendencias/${encodeURIComponent(p.id)}/${acao}`, {}); recarregar(); } catch (e) { setErroAcao(msgErro(e)); }
  }
  const c = dados?.contagens;
  const filtrando = [tipo !== "todos" && `Tipo: ${tipo}`, b && `Passageiro: ${b}`, motorista && `Motorista: ${motorista}`].filter(Boolean) as string[];
  return (
    <div className="oc">
      <div className="oc-topo">
        <div><h1>Gestão de pendências de pagamentos</h1><p className="suave" style={{ margin: "2px 0 0" }}>Taxas de cancelamento, Pix no app e pagamentos insuficientes</p></div>
        <div className="oc-kpi alerta" style={{ minWidth: 200 }}><span>Total em aberto</span><strong>{brl(dados?.totalAberto ?? 0)}</strong></div>
      </div>
      <div className="oc-abas">{[["todos", "Todos"], ...TIPOS.map((t) => [t, t])].map(([k, r]) => <button key={k} className={tipo === k ? "on" : ""} onClick={() => { setTipo(k); setPagina(1); }}>{r}</button>)}</div>
      <div className="oc-card oc-fila">
        <input style={{ maxWidth: 260 }} placeholder="Buscar passageiro, telefone ou OS" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar passageiro" />
        <SeletorPeriodo valor={per} onChange={(p) => { setPer(p); setPagina(1); }} />
        <button className="oc-btn" onClick={() => setMais(!maisFiltros)}>Mais filtros</button>
        {maisFiltros && <input style={{ maxWidth: 200 }} placeholder="Nome do motorista" value={motorista} onChange={(e) => { setMotorista(e.target.value); setPagina(1); }} aria-label="Motorista" />}
        <BotaoExportar caminho={`/pendencias/exportar${qs({ ...filtro, status })}`} nome="pendencias-de-pagamentos.csv" onErro={setErroAcao} />
        {admin && <button className="oc-btn pri" onClick={() => setNovo(true)}>Registrar pendência</button>}
        <button className="oc-btn" onClick={() => { setTipo("todos"); setBusca(""); setB(""); setMotorista(""); setPer(PERIODO_30); setPagina(1); }}>Limpar filtro</button>
      </div>
      {!!filtrando.length && <p className="suave" style={{ margin: "0 0 8px" }}>Filtrando por: {filtrando.join(" · ")}</p>}
      <div className="oc-kpis">
        {(["pendente", "processando", "resolvido", "abonado"] as const).map((s) => (
          <button key={s} className={`oc-kpi ${TOM[s]}`} style={{ textAlign: "left", cursor: "pointer", outline: status === s ? "2px solid var(--oc-pri)" : "none" }} onClick={() => { setStatus(s); setPagina(1); }} aria-pressed={status === s}>
            <span>{NOME[s]}</span><strong>{c?.[s].qtd ?? 0}</strong><small>{brl(c?.[s].valor ?? 0)}</small>
          </button>
        ))}
      </div>
      <Aviso texto={erro} erro /><Aviso texto={erroAcao} erro />
      <div className="oc-card">
        {carregando && !dados && <Vazio>Carregando...</Vazio>}
        {dados && !dados.total && <Vazio>Não encontramos nenhum resultado para a sua pesquisa.</Vazio>}
        {!!dados?.total && <>
          <div className="oc-rola"><table><thead><tr><th>Data</th><th>Tipo</th><th>OS de origem</th><th>Passageiro</th><th>Motorista</th><th>Valor</th><th>Situação</th><th>Ações</th></tr></thead>
            <tbody>{dados.itens.map((p: any) => (
              <tr key={p.id}><td>{dh(p.data)}</td><td>{p.tipo}{p.observacao && <><br /><small>{p.observacao}</small></>}</td><td className="forte">{p.os || "—"}</td>
                <td>{p.passageiro}<br /><small>{fone(p.telefone)}</small></td><td>{p.motorista || "—"}</td><td className="forte">{brl(p.valor)}</td>
                <td><Selo tom={TOM[p.situacaoGestao]}>{NOME[p.situacaoGestao]}</Selo>{p.situacao === "repassado" && <small> (repassado ao motorista)</small>}{p.resolvidoPor && <small> por {p.resolvidoPor}</small>}</td>
                <td>{admin && (p.situacao === "pendente" || p.situacao === "processando" || p.situacao === "repassado") ? (
                  <span className="oc-fila">
                    {p.situacao === "pendente" && <button className="oc-btn peq" onClick={() => agir(p, "processar")}>Processando</button>}
                    <button className="oc-btn peq ok" onClick={() => (p.origem === "taxa" ? setBaixa(p) : agir(p, "baixar"))}>Baixar</button>
                    <button className="oc-btn peq" onClick={() => agir(p, "abonar")}>Abonar</button>
                  </span>) : "—"}</td></tr>))}</tbody></table></div>
          <Paginacao pagina={dados.pagina} paginas={dados.paginas} total={dados.total} onMudar={setPagina} rotulo="pendências" />
        </>}
      </div>
      {novo && <NovaPendencia onFechar={() => setNovo(false)} onFeito={() => { setNovo(false); recarregar(); }} />}
      {baixa && <BaixarTaxa item={baixa} onFechar={() => setBaixa(null)} onFeito={() => { setBaixa(null); recarregar(); }} />}
    </div>
  );
}

export function BaixarTaxa({ item, onFechar, onFeito }: { item: any; onFechar: () => void; onFeito: () => void }) {
  const [osColeta, setOs] = useState(""), [erro, setErro] = useState<string | null>(null), [ocupado, setOcupado] = useState(false);
  return (
    <Janela onFechar={onFechar} titulo="Baixar taxa de cancelamento" sub={`OS ${item.os}, ${item.passageiro}, ${brl(item.valor)}`} tamanho="estreita"
      rodape={<><button className="oc-btn" onClick={onFechar}>Cancelar</button><button className="oc-btn ok" disabled={ocupado} onClick={async () => {
        setOcupado(true); setErro(null);
        try { await op(`/pendencias/${encodeURIComponent(item.id)}/baixar`, { osColeta }); onFeito(); } catch (e) { setErro(msgErro(e)); } finally { setOcupado(false); }
      }}>Confirmar pagamento</button></>}>
      <p>Confirma que o passageiro pagou esta taxa? O valor debitado da carteira dele volta, para não cobrar duas vezes.</p>
      <label>OS da corrida de coleta (opcional)<input value={osColeta} onChange={(e) => setOs(e.target.value)} placeholder="Corrida em que a taxa foi cobrada" maxLength={30} /></label>
      <Aviso texto={erro} erro />
    </Janela>
  );
}

function NovaPendencia({ onFechar, onFeito }: { onFechar: () => void; onFeito: () => void }) {
  const [f, setF] = useState({ tipo: "Pagamento insuficiente", os: "", passageiro: "", telefone: "", valor: "", observacao: "" });
  const [erro, setErro] = useState<string | null>(null), [ocupado, setOcupado] = useState(false);
  const set = (k: string, v: string) => setF({ ...f, [k]: v });
  return (
    <Janela onFechar={onFechar} titulo="Registrar pendência" sub="Sem operadora de pagamento: a central registra aqui o que ficou devendo." tamanho="estreita"
      rodape={<><button className="oc-btn" onClick={onFechar}>Cancelar</button><button className="oc-btn pri" disabled={ocupado || !f.valor} onClick={async () => {
        setOcupado(true); setErro(null);
        try { await op("/pendencias", { ...f, valor: Number(f.valor.replace(/\./g, "").replace(",", ".")) }); onFeito(); } catch (e) { setErro(msgErro(e)); } finally { setOcupado(false); }
      }}>Registrar</button></>}>
      <label>Tipo<select value={f.tipo} onChange={(e) => set("tipo", e.target.value)}><option>Pagamento insuficiente</option><option>Pix no app</option></select></label>
      <label>OS da corrida (opcional)<input value={f.os} onChange={(e) => set("os", e.target.value)} maxLength={30} /></label>
      <label>Passageiro<input value={f.passageiro} onChange={(e) => set("passageiro", e.target.value)} maxLength={120} placeholder="Preenchido pela OS, se informada" /></label>
      <label>Telefone<input value={f.telefone} onChange={(e) => set("telefone", e.target.value)} maxLength={20} /></label>
      <label>Valor (R$)<input inputMode="decimal" value={f.valor} onChange={(e) => set("valor", e.target.value)} placeholder="0,00" /></label>
      <label>Observação<input value={f.observacao} onChange={(e) => set("observacao", e.target.value)} maxLength={300} /></label>
      <Aviso texto={erro} erro />
    </Janela>
  );
}
