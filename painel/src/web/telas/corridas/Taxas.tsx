// Gestão de taxas de cancelamento: Taxas, Pendentes, Repassados, Resolvidos e Abonados, com filtros por OS, motorista, cliente e período.
import { useEffect, useState } from "react";
import { Aviso, Paginacao, Selo, Vazio, dhAno, msgErro, op, qs, useDados } from "./comum";
import { BotaoExportar, PERIODOS_CURTOS, PERIODO_30, SeletorPeriodo, brl, dataBrIso, paramsPeriodo, useAdmin, type PeriodoPag } from "./pagamentos-comum";
import { BaixarTaxa } from "./Pendentes";
import "./corridas.css";

const ABAS: Array<[string, string, string]> = [["todos", "Taxas", "taxas"], ["pendentes", "Pendentes", "pendentes"], ["repassados", "Repassados", "repassados"], ["resolvidos", "Resolvidos", "resolvidos"], ["abonados", "Abonados", "abonados"]];
const TOM_ABA: Record<string, string> = { todos: "", pendentes: "alerta", repassados: "info", resolvidos: "ok", abonados: "ruim" };
const TOM: Record<string, string> = { pendente: "alerta", processando: "info", repassado: "info", resolvido: "ok", abonado: "ruim" };
const NOME: Record<string, string> = { pendente: "Pendente", processando: "Processando", repassado: "Repassado", resolvido: "Resolvido", abonado: "Abonado" };

export default function Taxas() {
  const admin = useAdmin();
  const [aba, setAba] = useState("todos");
  const [per, setPer] = useState<PeriodoPag>(PERIODO_30);
  const [os, setOs] = useState(""), [motorista, setMotorista] = useState(""), [cliente, setCliente] = useState("");
  const [f, setF] = useState({ os: "", motorista: "", cliente: "" });
  const [pagina, setPagina] = useState(1);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [baixa, setBaixa] = useState<any>(null);
  useEffect(() => { const t = setTimeout(() => { setF({ os, motorista, cliente }); setPagina(1); }, 350); return () => clearTimeout(t); }, [os, motorista, cliente]);
  const filtro = { aba, ...f, ...paramsPeriodo(per) };
  const { dados, erro, carregando, recarregar } = useDados<any>(() => op(`/taxas-cancelamento${qs({ ...filtro, pagina })}`), [JSON.stringify(filtro), pagina]);
  const limparTudo = () => { setOs(""); setMotorista(""); setCliente(""); setPer(PERIODO_30); setAba("todos"); setPagina(1); };
  async function agir(p: any, acao: string) {
    if (acao === "abonar" && !confirm("Abonar esta taxa? A cobrança será descartada.")) return;
    setErroAcao(null);
    try { await op(`/pendencias/${encodeURIComponent(p.id)}/${acao}`, {}); recarregar(); } catch (e) { setErroAcao(msgErro(e)); }
  }
  return (
    <div className="oc">
      <div className="oc-topo"><div><h1>Gestão de taxas de cancelamento</h1><p className="suave" style={{ margin: "2px 0 0" }}>Taxas cobradas de passageiros que cancelaram depois do prazo</p></div></div>
      <div className="oc-abas">{[["todos", "Todos"], ["pendentes", "Pendentes"], ["repassados", "Repassados"], ["resolvidos", "Resolvidos"], ["abonados", "Abonados"]].map(([k, r]) => <button key={k} className={aba === k ? "on" : ""} onClick={() => { setAba(k); setPagina(1); }}>{r}</button>)}</div>
      <div className="oc-card oc-fila">
        <input style={{ maxWidth: 150 }} placeholder="Buscar OS" value={os} onChange={(e) => setOs(e.target.value)} aria-label="Buscar OS" />
        <input style={{ maxWidth: 200 }} placeholder="Buscar motorista" value={motorista} onChange={(e) => setMotorista(e.target.value)} aria-label="Buscar motorista" />
        <input style={{ maxWidth: 200 }} placeholder="Buscar cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} aria-label="Buscar cliente" />
        <SeletorPeriodo valor={per} onChange={(p) => { setPer(p); setPagina(1); }} opcoes={PERIODOS_CURTOS} />
        <BotaoExportar caminho={`/taxas-cancelamento/exportar${qs(filtro)}`} nome="taxas-de-cancelamento.csv" onErro={setErroAcao} />
        <button className="oc-btn" onClick={() => { setOs(""); setMotorista(""); setCliente(""); setPer(PERIODO_30); setPagina(1); }}>Limpar filtro</button>
      </div>
      <p className="suave" style={{ margin: "0 0 8px" }}>Filtrando por: {dados?.periodo?.inicio ? `Período: ${dataBrIso(dados.periodo.inicio)} até ${dataBrIso(dados.periodo.fim)}` : "Todos"}</p>
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
        {dados && !dados.total && <Vazio>Não encontramos nenhum resultado para a sua pesquisa. <span className="oc-fila" style={{ justifyContent: "center", marginTop: 8 }}><button className="oc-btn" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>Editar filtro</button><button className="oc-btn" onClick={limparTudo}>Limpar filtro</button></span></Vazio>}
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
      {baixa && <BaixarTaxa item={baixa} onFechar={() => setBaixa(null)} onFeito={() => { setBaixa(null); recarregar(); }} />}
    </div>
  );
}
