// Financeiro no formato da Machine: Visão geral do financeiro, Extrato da central e Extrato de transações online.
// Os números vêm de /api/config (visao-geral, extrato-central, transacoes-online), sempre da empresa escolhida.

import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Download, Filter, Info, Search } from "lucide-react";
import { useAvisoRelatorio } from "../../componentes/AvisoRelatorio";
import { buscarCsvCentrais, pedirCentrais, type CentralResumo } from "../centrais/comum";
import { Aviso, Campo, Carregando, FiltroPeriodo, Modal, PERIODO_MES, PERIODOS_MACHINE, dataBr, dataHoraBr, dinheiro, pedirConfig, queryPeriodo, textoPeriodo, useAdmin, useCarregar, useSalvar, type PeriodoSel } from "./comum";

const ULTIMOS_7: PeriodoSel = { chave: "ultimos_7", inicio: "", fim: "" };
const diaCurto = (d: string) => d.slice(8, 10) + "/" + d.slice(5, 7);
const dataExtenso = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });

/** Busca um CSV do servidor (a proteção contra fórmula é feita lá). */
export async function buscarCsv(url: string): Promise<Blob> {
  let emp = "";
  try { emp = localStorage.getItem("empresa") ?? ""; } catch { /* sem armazenamento */ }
  const r = await fetch(`/api/config${url}`, { credentials: "same-origin", headers: emp ? { "X-Empresa": emp } : {} });
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { erro?: string }).erro || `Erro ${r.status}`);
  return r.blob();
}
export async function baixarCsv(url: string, nome: string) {
  const blob = await buscarCsv(url);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function Variacao({ v }: { v: number | null | undefined }) {
  if (v === undefined) return null;
  if (v === null) return <span className="dm-var" title="Sem base de comparação no período anterior">novo</span>;
  return <span className={`dm-var ${v < 0 ? "txt-ruim" : v > 0 ? "txt-ok" : ""}`} title="Comparado ao período anterior de mesmo tamanho">{v > 0 ? "+" : ""}{v.toFixed(2).replace(".", ",")}%</span>;
}

function Indicador({ titulo, dica, valor, variacao, rodape, acao }: { titulo: string; dica: string; valor: number | undefined; variacao?: number | null; rodape?: string; acao?: ReactNode }) {
  return (
    <div className="dm-kpi">
      <small>{titulo} <span title={dica} aria-label={dica}><Info size={13} /></span></small>
      <strong>{valor == null ? "—" : dinheiro(valor)}</strong>
      <span><Variacao v={valor == null ? undefined : variacao} /> {rodape && <small>{rodape}</small>}</span>
      {acao}
    </div>
  );
}

// ------------------------------------------------------------------ gráficos (SVG simples, sem biblioteca)

interface Serie { chave: string; nome: string; cor: string }
const LARG = 640, ALT = 220, MAR = { e: 52, d: 10, t: 10, b: 28 };

function Grafico({ dados, series, tipo, vazio }: { dados: Array<Record<string, any>>; series: Serie[]; tipo: "barras" | "linha"; vazio: string }) {
  const empilhado = (d: Record<string, any>) => series.reduce((s, x) => s + (Number(d[x.chave]) || 0), 0);
  const max = Math.max(0, ...dados.map((d) => (tipo === "barras" ? empilhado(d) : Math.max(...series.map((s) => Number(d[s.chave]) || 0)))));
  if (!dados.length || max <= 0) return <p className="vazio">{vazio}</p>;
  const w = LARG - MAR.e - MAR.d, h = ALT - MAR.t - MAR.b;
  const x = (i: number) => MAR.e + (dados.length === 1 ? w / 2 : (i + 0.5) * (w / dados.length));
  const y = (v: number) => MAR.t + h - (v / max) * h;
  const passo = Math.max(1, Math.ceil(dados.length / 8));
  const larguraBarra = Math.max(3, Math.min(34, (w / dados.length) * 0.65));
  return (
    <>
      <svg viewBox={`0 0 ${LARG} ${ALT}`} className="dm-grafico" role="img" aria-label={series.map((s) => s.nome).join(", ")}>
        {[0, 0.5, 1].map((f) => <g key={f}><line x1={MAR.e} x2={LARG - MAR.d} y1={y(max * f)} y2={y(max * f)} stroke="currentColor" opacity="0.12" /><text x={MAR.e - 6} y={y(max * f) + 4} textAnchor="end" fontSize="10" fill="currentColor" opacity="0.7">{Math.round(max * f).toLocaleString("pt-BR")}</text></g>)}
        {dados.map((d, i) => (i % passo === 0 ? <text key={d.dia} x={x(i)} y={ALT - 8} textAnchor="middle" fontSize="10" fill="currentColor" opacity="0.7">{diaCurto(d.dia)}</text> : null))}
        {tipo === "barras" ? dados.map((d, i) => {
          let base = 0;
          return <g key={d.dia}>{series.map((s) => {
            const v = Number(d[s.chave]) || 0; if (!v) return null;
            const topo = y(base + v), alt = y(base) - topo; base += v;
            return <rect key={s.chave} x={x(i) - larguraBarra / 2} y={topo} width={larguraBarra} height={alt} fill={s.cor} rx="2"><title>{`${diaCurto(d.dia)} · ${s.nome}: ${dinheiro(v)}`}</title></rect>;
          })}</g>;
        }) : series.map((s) => (
          <g key={s.chave}>
            <polyline fill="none" stroke={s.cor} strokeWidth="2.5" points={dados.map((d, i) => `${x(i)},${y(Number(d[s.chave]) || 0)}`).join(" ")} />
            {dados.map((d, i) => <circle key={d.dia} cx={x(i)} cy={y(Number(d[s.chave]) || 0)} r="3" fill={s.cor}><title>{`${diaCurto(d.dia)} · ${s.nome}: ${dinheiro(Number(d[s.chave]) || 0)}`}</title></circle>)}
          </g>
        ))}
      </svg>
      <div className="dm-legenda">{series.map((s) => <span key={s.chave}><i style={{ background: s.cor }} /> {s.nome}</span>)}</div>
    </>
  );
}

const COR_A = "#2563eb", COR_B = "#16a34a", COR_C = "#f59e0b";

// ------------------------------------------------------------------ Visão geral do financeiro

export function VisaoGeral() {
  const [per, setPer] = useState<PeriodoSel>(ULTIMOS_7);
  const d = useCarregar(() => pedirConfig(`/visao-geral?${queryPeriodo(per)}`), [per]);
  const { msg, salvar } = useSalvar();
  const x = d.dados;
  const [detalhe, setDetalhe] = useState<null | "recargas" | "corridas" | "saques">(null);
  return (
    <>
      <div className="aviso" role="note">Atenção: Os dados de faturamento nesta tela vêm dos registros deste painel e não contemplam transações feitas fora dele.</div>
      <div className="dm-cab">
        <div><h1>Visão geral do financeiro</h1><p>Período: {textoPeriodo(per)}{x ? ` (${dataBr(x.periodo.inicio)} a ${dataBr(x.periodo.fim)})` : ""}</p></div>
        <div className="dm-cab-acoes">
          <FiltroPeriodo valor={per} onChange={setPer} atalhos={PERIODOS_MACHINE} />
          <button className="botao" onClick={() => salvar(() => baixarCsv(`/visao-geral/csv?${queryPeriodo(per)}`, "visao-geral-financeiro.csv"), "Relatório exportado.")}><Download size={14} /> Exportar relatório</button>
        </div>
      </div>
      <Aviso erro={d.erro ?? msg?.erro} ok={msg?.ok} />
      <div className="dm-kpis">
        <Indicador titulo="Faturamento total em corridas" dica="Valor total das corridas no período selecionado." valor={x?.faturamento.valor} variacao={x?.faturamento.variacao} rodape={x ? `${x.faturamento.corridas} corridas` : undefined} />
        <Indicador titulo="Ganhos líquidos em corridas" dica="Representa o ganho da central com taxas cobradas pelas corridas (comissões)." valor={x?.ganhosLiquidos.valor} variacao={x?.ganhosLiquidos.variacao} />
      </div>
      <h3 className="dm-secao">Recebimentos e fluxo de caixa</h3>
      <div className="dm-kpis">
        <Indicador titulo="Total de valores recebidos" dica="Total de valores já recebidos pela central em conceito de recargas e corridas." valor={x?.totalRecebido.valor} variacao={x?.totalRecebido.variacao} />
      </div>
      <div className="dm-graficos">
        <div className="dm-cartao">
          <div className="dm-linha dm-entre"><h3>Recargas Pix (Motoristas + Passageiros) <span title="Volume de recargas realizadas via Pix, diferenciando motoristas e passageiros." aria-label="Volume de recargas realizadas via Pix, diferenciando motoristas e passageiros."><Info size={13} /></span></h3><button className="botao" onClick={() => setDetalhe("recargas")}>Ver detalhes <ChevronRight size={14} /></button></div>
          <p className="dm-sub">Volume de recargas feitas por Pix, separando motoristas e passageiros. Total: <strong>{x ? dinheiro(x.recargasPix.total) : "—"}</strong></p>
          {!x ? <Carregando /> : <Grafico tipo="barras" dados={x.recargasPix.serie} series={[{ chave: "motoristas", nome: "Motoristas", cor: COR_A }, { chave: "passageiros", nome: "Passageiros", cor: COR_B }]} vazio="Nenhuma recarga Pix no período." />}
        </div>
        <div className="dm-cartao">
          <div className="dm-linha dm-entre"><h3>Corridas pagas no App (Cartão x Pix) <span title="Valores de corridas pagas dentro do aplicativo, separados entre pagamentos via Pix e Cartão." aria-label="Valores de corridas pagas dentro do aplicativo, separados entre pagamentos via Pix e Cartão."><Info size={13} /></span></h3><button className="botao" onClick={() => setDetalhe("corridas")}>Ver detalhes <ChevronRight size={14} /></button></div>
          <p className="dm-sub">Corridas pagas dentro do aplicativo. Total: <strong>{x ? dinheiro(x.corridasApp.total) : "—"}</strong> em {x?.corridasApp.qtd ?? 0} corridas</p>
          {!x ? <Carregando /> : <Grafico tipo="barras" dados={x.corridasApp.serie} series={[{ chave: "cartao", nome: "Cartão", cor: COR_A }, { chave: "pix", nome: "Pix", cor: COR_B }]} vazio="Nenhuma corrida paga no app no período." />}
        </div>
      </div>
      <h3 className="dm-secao">Saques</h3>
      <div className="dm-kpis">
        <Indicador titulo="Saques dos motoristas" dica="Total de valores sacados pelos motoristas dentro do período selecionado." valor={x?.saques.total} variacao={x?.saques.variacao} rodape={x ? `${x.saques.qtd} saques` : undefined} />
      </div>
      <div className="dm-graficos">
        <div className="dm-cartao">
          <div className="dm-linha dm-entre"><h3>Total de saques realizados no período</h3><a className="botao" href="/saques">Ver histórico de saques <ChevronRight size={14} /></a></div>
          {!x ? <Carregando /> : <Grafico tipo="barras" dados={x.saques.serie} series={[{ chave: "valor", nome: "Saques pagos", cor: COR_C }]} vazio="Nenhum saque pago no período." />}
        </div>
        <div className="dm-cartao">
          <h3>Tendência de saques <span title="Evolução dos saques realizados pelos motoristas ao longo do tempo." aria-label="Evolução dos saques realizados pelos motoristas ao longo do tempo."><Info size={13} /></span></h3>
          <p className="dm-sub">Evolução (acumulada) dos saques pagos ao longo do período.</p>
          {!x ? <Carregando /> : <Grafico tipo="linha" dados={x.saques.serie} series={[{ chave: "acumulado", nome: "Acumulado", cor: COR_C }]} vazio="Sem saques para mostrar a tendência." />}
        </div>
      </div>
      <div className="dm-kpis">
        <Indicador titulo="Total do próximo repasse" dica="Valor previsto para o seu próximo pagamento. Desconsidera pagamentos na data de hoje." valor={x?.proximoRepasse} />
      </div>
      <Modal aberto={!!detalhe} onFechar={() => setDetalhe(null)} titulo={detalhe === "recargas" ? "Recargas Pix por dia" : detalhe === "corridas" ? "Corridas pagas no app por dia" : ""} larga>
        {x && detalhe && (
          <div className="tabela-rola"><table>
            <thead><tr><th>Dia</th>{detalhe === "recargas" ? <><th>Motoristas</th><th>Passageiros</th></> : <><th>Cartão</th><th>Pix</th></>}</tr></thead>
            <tbody>{(detalhe === "recargas" ? x.recargasPix.serie : x.corridasApp.serie).filter((l: any) => (l.motoristas ?? l.cartao) || (l.passageiros ?? l.pix)).map((l: any) => (
              <tr key={l.dia}><td>{dataBr(l.dia)}</td><td className="num">{dinheiro(l.motoristas ?? l.cartao)}</td><td className="num">{dinheiro(l.passageiros ?? l.pix)}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </Modal>
    </>
  );
}

// ------------------------------------------------------------------ Extrato da central

type Modo = "mensal" | "periodo" | "hoje";
const mesAtual = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 7);
function limitesDoMes(ym: string): PeriodoSel {
  const [a, m] = ym.split("-").map(Number);
  const fim = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
  return { chave: "personalizado", inicio: `${ym}-01`, fim };
}

function useNomeCentral() {
  const d = useCarregar(() => fetch("/api/sessao", { credentials: "same-origin" }).then((r) => r.json()).catch(() => null), []);
  return String(d.dados?.empresa?.nome ?? "");
}
const mesExtenso = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC", month: "long", year: "numeric" });

export function ExtratoCentral() {
  const admin = useAdmin();
  const nomeCentral = useNomeCentral();
  const { msg, salvar } = useSalvar();
  const { gerar, aviso } = useAvisoRelatorio();
  const rede = useCarregar(() => pedirCentrais<{ atual: string; centrais: CentralResumo[] }>("/seletor").catch(() => ({ atual: "", centrais: [] as CentralResumo[] })), []);
  const [central, setCentral] = useState(""); // "" = a própria central
  const [acoes, setAcoes] = useState(false);
  const [modo, setModo] = useState<Modo>("mensal");
  const [mes, setMes] = useState(mesAtual());
  const [perPeriodo, setPerPeriodo] = useState<PeriodoSel>(ULTIMOS_7);
  const [mostrar, setMostrar] = useState<"todos" | "entrada" | "saida">("todos");
  const [ordem, setOrdem] = useState<"recentes" | "antigos" | "maior">("recentes");
  const [fechados, setFechados] = useState<Set<string> | "todos">(new Set());
  const [recarregar, setRecarregar] = useState(false), [pedidos, setPedidos] = useState(false);
  const per = modo === "hoje" ? ({ chave: "hoje", inicio: "", fim: "" } as PeriodoSel) : modo === "mensal" ? limitesDoMes(mes) : perPeriodo;
  // A principal vê o extrato de uma associada só se ela permitiu (e sem nomes de pessoas): quem confere é o servidor.
  const d = useCarregar(() => (central ? pedirCentrais(`/extrato/${encodeURIComponent(central)}?${queryPeriodo(per)}`) : pedirConfig(`/extrato-central?${queryPeriodo(per)}`)), [modo, mes, perPeriodo, central]);
  const x = d.dados;
  const dias = useMemo(() => {
    if (!x) return [];
    const l = x.dias.map((dia: any) => ({ ...dia, movimentos: dia.movimentos.filter((m: any) => mostrar === "todos" || m.tipo === mostrar).sort((a: any, b: any) => (ordem === "maior" ? b.valor - a.valor : a.em.localeCompare(b.em))) })).filter((dia: any) => dia.movimentos.length);
    return ordem === "antigos" ? [...l].reverse() : l;
  }, [x, mostrar, ordem]);
  const aberto = (dia: string) => fechados !== "todos" && !fechados.has(dia);
  const alternar = (dia: string) => setFechados((f) => { const n = new Set<string>(f === "todos" ? dias.map((i: any) => i.dia as string) : f); n.has(dia) ? n.delete(dia) : n.add(dia); return n; });
  return (
    <>
      <div className="dm-cab">
        <div><h1>Extrato da central</h1><p>{nomeCentral || "Entradas e saídas do caixa da central, dia a dia."}</p></div>
        <div className="dm-cab-acoes">{admin && !central && <button className="botao primario" onClick={() => setRecarregar(true)}>Recarregar saldo</button>}</div>
      </div>
      {(rede.dados?.centrais?.length ?? 0) > 1 && (
        <div className="dm-pilulas" role="tablist" aria-label="Central">
          {rede.dados!.centrais.map((c) => { const propria = c.id === rede.dados!.centrais[0].id; return <button key={c.id} role="tab" aria-selected={(central || rede.dados!.centrais[0].id) === c.id} className={(central || rede.dados!.centrais[0].id) === c.id ? "ativo" : ""} onClick={() => setCentral(propria ? "" : c.id)}>{c.nome}</button>; })}
        </div>
      )}
      <Aviso erro={d.erro ?? msg?.erro} ok={msg?.ok} />
      <div className="dm-kpis">
        <div className="dm-kpi destaque"><small>Saldo atual</small><strong>{x ? dinheiro(x.saldoAtual) : "—"}</strong><small>Comissões e recargas menos saques pagos</small></div>
        <div className="dm-kpi"><small>Recargas de saldo aguardando</small><strong>{x ? dinheiro(x.aguardando) : "—"}</strong><button className="botao" onClick={() => setPedidos(true)}>Ver detalhes <ChevronRight size={14} /></button></div>
      </div>
      <div className="dm-cartao dm-filtros">
        <div className="dm-pilulas" role="tablist">{([["mensal", "Mensal"], ["periodo", "Por período"], ["hoje", "Hoje"]] as Array<[Modo, string]>).map(([m, n]) => <button key={m} role="tab" aria-selected={modo === m} className={modo === m ? "ativo" : ""} onClick={() => setModo(m)}>{n}</button>)}</div>
        {modo === "mensal" && <input type="month" value={mes} max={mesAtual()} onChange={(e) => e.target.value && setMes(e.target.value)} aria-label="Mês" />}
        {modo === "periodo" && <FiltroPeriodo valor={perPeriodo} onChange={setPerPeriodo} atalhos={PERIODOS_MACHINE} />}
        <div className="dm-dropdown">
          <button type="button" className="botao" aria-haspopup="menu" aria-expanded={acoes} onClick={() => setAcoes(!acoes)}>Mais ações ▾</button>
          {acoes && <div className="dm-dropdown-menu" role="menu"><button role="menuitem" onClick={() => { setAcoes(false); void salvar(() => gerar(() => (central ? buscarCsvCentrais(`/extrato/${encodeURIComponent(central)}/csv?${queryPeriodo(per)}`) : buscarCsv(`/extrato-central/csv?${queryPeriodo(per)}`)), "extrato-da-central.csv"), ""); }}>Exportar</button></div>}
        </div>
        <select value={mostrar} onChange={(e) => setMostrar(e.target.value as typeof mostrar)} aria-label="Mostrar"><option value="todos">Entradas e saídas</option><option value="entrada">Só entradas</option><option value="saida">Só saídas</option></select>
        <label className="dm-inline">Ordenar por <select value={ordem} onChange={(e) => setOrdem(e.target.value as typeof ordem)} aria-label="Ordenar por"><option value="recentes">Dias mais recentes</option><option value="antigos">Dias mais antigos</option><option value="maior">Maior valor</option></select></label>
        <button className="botao" onClick={() => setFechados(fechados === "todos" ? new Set() : "todos")}>{fechados === "todos" ? "Expandir tudo" : "Colapsar tudo"}</button>
      </div>
      <div className="dm-kpis">
        <div className="dm-kpi"><small>Saldo inicial do período</small><strong>{x ? dinheiro(x.saldoInicial) : "—"}</strong></div>
        <div className="dm-kpi"><small>Total de entradas</small><strong className="txt-ok">{x ? dinheiro(x.totalEntradas) : "—"}</strong></div>
        <div className="dm-kpi"><small>Total de saídas</small><strong className="txt-ruim">{x ? dinheiro(x.totalSaidas) : "—"}</strong></div>
        <div className="dm-kpi"><small>Saldo final do período</small><strong>{x ? dinheiro(x.saldoFinal) : "—"}</strong></div>
      </div>
      <h3 className="dm-secao">Movimentações ({modo === "hoje" ? dataExtenso(new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)) : modo === "mensal" ? mesExtenso(mes) : textoPeriodo(per)})</h3>
      {!x ? <Carregando /> : !dias.length ? <div className="dm-cartao"><p className="vazio">Nenhuma movimentação encontrada para os filtros selecionados.</p></div> : dias.map((dia: any) => (
        <div className="dm-cartao dm-dia" key={dia.dia}>
          <button className="dm-dia-topo" onClick={() => alternar(dia.dia)} aria-expanded={aberto(dia.dia)}>
            {aberto(dia.dia) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <strong>{dataExtenso(dia.dia)}</strong>
            <span className="txt-ok">Entradas: {dinheiro(dia.entradas)}</span><span className="txt-ruim">Saídas: {dinheiro(dia.saidas)}</span><span>Saldo do dia: {dinheiro(dia.saldoDoDia)}</span>
          </button>
          {aberto(dia.dia) && (
            <ul className="dm-transacoes">
              <li><span><small>Saldo do dia anterior</small></span><b>{dinheiro(dia.saldoAnterior)}</b></li>
              {dia.movimentos.map((m: any) => <li key={m.id}><span><strong>{dataHoraBr(m.em).slice(-5)} · {m.descricao}</strong>{m.detalhe && <small>{m.detalhe}</small>}</span><b className={m.tipo === "entrada" ? "txt-ok" : "txt-ruim"}>{m.tipo === "entrada" ? "" : "- "}{dinheiro(m.valor)}</b></li>)}
            </ul>
          )}
        </div>
      ))}
      {aviso}
      <ModalRecarga aberto={recarregar} onFechar={() => setRecarregar(false)} onFeito={() => { setRecarregar(false); d.recarregar(); setPedidos(true); }} />
      <ModalPedidos aberto={pedidos} onFechar={() => setPedidos(false)} pedidos={x?.pedidos ?? []} admin={admin} onMudou={d.recarregar} />
    </>
  );
}

function ModalRecarga({ aberto, onFechar, onFeito }: { aberto: boolean; onFechar: () => void; onFeito: () => void }) {
  const [valor, setValor] = useState(""), [obs, setObs] = useState("");
  const { msg, salvando, salvar } = useSalvar();
  return (
    <Modal aberto={aberto} onFechar={onFechar} titulo="Recarregar saldo" sub="Registra o pedido de recarga e o valor. Nenhuma cobrança é feita aqui: depois de receber, confirme o pedido.">
      <form className="dm-form" onSubmit={async (e) => { e.preventDefault(); const r = await salvar(() => pedirConfig("/extrato-central/recargas", "POST", { valor: Number(valor.replace(/\./g, "").replace(",", ".")), observacao: obs })); if (r) { setValor(""); setObs(""); onFeito(); } }}>
        <Campo rotulo="Valor (R$)"><input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" required /></Campo>
        <Campo rotulo="Observação (opcional)"><input value={obs} onChange={(e) => setObs(e.target.value)} maxLength={200} placeholder="Ex.: Pix enviado pelo financeiro" /></Campo>
        <Aviso erro={msg?.erro} />
        <div className="dm-rodape-modal"><button type="button" className="botao" onClick={onFechar}>Cancelar</button><button className="botao primario" disabled={salvando || !valor}>Registrar pedido</button></div>
      </form>
    </Modal>
  );
}

function ModalPedidos({ aberto, onFechar, pedidos, admin, onMudou }: { aberto: boolean; onFechar: () => void; pedidos: any[]; admin: boolean; onMudou: () => void }) {
  const { msg, salvar } = useSalvar();
  const resolver = (id: string, acao: "confirmar" | "cancelar") => salvar(async () => { await pedirConfig(`/extrato-central/recargas/${id}/${acao}`, "POST", {}); onMudou(); }, acao === "confirmar" ? "Recarga confirmada." : "Pedido cancelado.");
  return (
    <Modal aberto={aberto} onFechar={onFechar} titulo="Pedidos de recarga de saldo" sub="Pedidos confirmados entram como entrada no extrato da central." larga>
      <Aviso erro={msg?.erro} ok={msg?.ok} />
      {!pedidos.length ? <p className="vazio">Nenhum pedido de recarga registrado.</p> : (
        <div className="tabela-rola"><table>
          <thead><tr><th>Data</th><th>Valor</th><th>Observação</th><th>Pedido por</th><th>Situação</th><th /></tr></thead>
          <tbody>{pedidos.map((p) => (
            <tr key={p.id}><td>{dataHoraBr(p.em)}</td><td className="num">{dinheiro(p.valor)}</td><td>{p.observacao || "—"}</td><td>{p.por}</td>
              <td><span className={`selo ${p.situacao === "Confirmado" ? "ok" : p.situacao === "Cancelado" ? "ruim" : "alerta"}`}>{p.situacao}</span></td>
              <td>{admin && p.situacao === "Solicitado" && <span className="dm-linha"><button className="botao primario" onClick={() => resolver(p.id, "confirmar")}>Confirmar recebimento</button><button className="botao" onClick={() => resolver(p.id, "cancelar")}>Cancelar</button></span>}</td></tr>
          ))}</tbody>
        </table></div>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------------ Extrato de transações online

// Como na Machine: "Tipo de transação" e "Repasse" (situação) são caixas de marcar, todas marcadas ao abrir; "Todos" marca ou desmarca as demais.
const TIPOS_TRANSACAO = ["Saque", "Pagamento", "Recarga empresa", "Recarga passageiro", "Recarga motorista", "Repasse"];
const SITUACOES_TRANSACAO = ["Pago", "Pendente", "Chargeback", "Estornado", "Cancelado"];
const PADRAO_FILTRO = { tipo: TIPOS_TRANSACAO, status: SITUACOES_TRANSACAO, repasse: "", busca: "" };
const valorMarcadas = (marcadas: string[], todas: string[]) => (marcadas.length === todas.length || !marcadas.length ? "todos" : marcadas.join("|"));

function GrupoMarcar({ rotulo, opcoes, marcadas, onChange }: { rotulo: string; opcoes: string[]; marcadas: string[]; onChange: (m: string[]) => void }) {
  const todas = marcadas.length === opcoes.length;
  return (
    <fieldset className="dm-campo" style={{ flexBasis: "100%", border: 0, padding: 0 }}>
      <span>{rotulo}</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <label><input type="checkbox" checked={todas} onChange={() => onChange(todas ? [] : opcoes)} /> Todos</label>
        {opcoes.map((o) => <label key={o}><input type="checkbox" checked={marcadas.includes(o)} onChange={() => onChange(opcoes.filter((x) => (x === o ? !marcadas.includes(o) : marcadas.includes(x))))} /> {o}</label>)}
      </div>
    </fieldset>
  );
}

export function ExtratoOnline() {
  const admin = useAdmin();
  const [per, setPer] = useState<PeriodoSel>({ chave: "hoje", inicio: "", fim: "" });
  const [maisFiltros, setMais] = useState(false), [repasses, setRepasses] = useState(false);
  const [f, setF] = useState(PADRAO_FILTRO), [aplicado, setAplicado] = useState(PADRAO_FILTRO);
  const [pagina, setPagina] = useState(1);
  const [marcar, setMarcar] = useState<any>(null);
  const qs = `${queryPeriodo(per)}&tipo=${encodeURIComponent(valorMarcadas(aplicado.tipo, TIPOS_TRANSACAO))}&status=${encodeURIComponent(valorMarcadas(aplicado.status, SITUACOES_TRANSACAO))}&repasse=${aplicado.repasse}&busca=${encodeURIComponent(aplicado.busca)}`;
  const d = useCarregar(() => pedirConfig(`/transacoes-online?${qs}&pagina=${pagina}`), [qs, pagina]);
  const { msg, salvar } = useSalvar();
  const x = d.dados;
  const de = x ? (x.total ? (x.pagina - 1) * x.porPagina + 1 : 0) : 0, ate = x ? Math.min(x.total, x.pagina * x.porPagina) : 0;
  const numeros: number[] = x ? Array.from({ length: x.paginas }, (_, i) => i + 1).filter((p) => p === 1 || p === x.paginas || Math.abs(p - x.pagina) <= 2) : [];
  return (
    <>
      <div className="aviso" role="note">Atenção: Os dados de faturamento nesta tela vêm dos registros deste painel e não contemplam transações feitas fora dele.</div>
      <div className="dm-cab">
        <div><h1>Extrato de transações online</h1><p>Período: {textoPeriodo(per)}</p></div>
        <div className="dm-cab-acoes">
          <button className="botao" aria-expanded={maisFiltros} onClick={() => setMais(!maisFiltros)}><Filter size={14} /> Mais filtros</button>
          <FiltroPeriodo valor={per} onChange={(p) => { setPer(p); setPagina(1); }} atalhos={PERIODOS_MACHINE} />
          <button className="botao" onClick={() => salvar(() => baixarCsv(`/transacoes-online/csv?${qs}`, "extrato-transacoes-online.csv"), "CSV exportado.")}><Download size={14} /> Exportar CSV</button>
        </div>
      </div>
      {maisFiltros && <form className="dm-cartao dm-filtros" aria-label="Filtro de pesquisa" onSubmit={(e) => { e.preventDefault(); setPagina(1); setAplicado(f); setMais(false); }}>
        <div style={{ flexBasis: "100%" }}><h3 className="dm-secao">Filtro de pesquisa</h3><small>Você pode filtrar um ou mais campos</small></div>
        <GrupoMarcar rotulo="Tipo de transação" opcoes={TIPOS_TRANSACAO} marcadas={f.tipo} onChange={(m) => setF({ ...f, tipo: m })} />
        <GrupoMarcar rotulo="Repasse" opcoes={SITUACOES_TRANSACAO} marcadas={f.status} onChange={(m) => setF({ ...f, status: m })} />
        <label>Data de repasse<input type="date" value={f.repasse} onChange={(e) => setF({ ...f, repasse: e.target.value })} /></label>
        <button className="botao primario">Filtrar</button>
        <button type="button" className="botao" onClick={() => { setF({ ...PADRAO_FILTRO, busca: f.busca }); setAplicado({ ...PADRAO_FILTRO, busca: aplicado.busca }); setPagina(1); }}>Limpar filtros</button>
        <button type="button" className="botao" onClick={() => { setF(aplicado); setMais(false); }}>Cancelar</button>
      </form>}
      <Aviso erro={d.erro ?? msg?.erro} ok={msg?.ok} />
      <div className="dm-kpis">
        <Indicador titulo="Total de valores em corridas e recargas" dica="Soma dos valores pagos em corridas e recargas no período (sem chargeback, estorno ou cancelamento)." valor={x?.totalCorridasRecargas} />
        <Indicador titulo="Repasses de hoje" dica="Soma dos pagamentos e repasses pagos cuja data de repasse é hoje." valor={x?.repassesHoje} rodape={undefined} acao={<button className="botao" onClick={() => setRepasses(true)}>Ver detalhes <ChevronRight size={14} /></button>} />
        <Indicador titulo="Repasses agendados" dica="Soma de todas as transações com status Pendente (saques e recargas aguardando a central)." valor={x?.repassesAgendados} />
      </div>
      <div className="dm-cartao tabela-rola">
        <div className="dm-busca"><Search size={14} aria-hidden /><input type="search" value={f.busca} onChange={(e) => { setF({ ...f, busca: e.target.value }); setAplicado({ ...aplicado, busca: e.target.value }); setPagina(1); }} placeholder="Buscar por ID da transação" aria-label="Buscar por ID da transação" /></div>
        {x && x.total > 0 && <p><small>Exibindo {de}-{ate} de {x.total} resultados</small></p>}
        <table>
          <thead><tr><th>Data e Hora</th><th>Data de repasse</th><th>ID da transação</th><th>Tipo de transação</th><th>Forma de pagamento</th><th>Repasse</th><th>Valor líquido</th>{admin && <th />}</tr></thead>
          <tbody>
            {!x ? <tr><td colSpan={8}><Carregando /></td></tr> : !x.itens.length ? <tr><td colSpan={8} className="vazio"><strong>Nenhuma transação encontrada para os filtros selecionados</strong><br />Quando houver lançamentos de transações, eles aparecerão aqui.</td></tr> : x.itens.map((i: any) => (
              <tr key={`${i.tipo}${i.id}`}>
                <td>{dataHoraBr(i.em)}</td><td>{i.dataRepasse ? dataBr(i.dataRepasse) : "—"}</td>
                <td title={i.id}><code>{i.codigo}</code><small className="bloco">{i.pessoa}{i.detalhe ? ` · ${i.detalhe}` : ""}</small></td>
                <td>{i.tipo}</td><td title={`Repasse para: ${i.repasse}`}>{i.forma}</td>
                <td><span className={`selo ${i.status === "Pago" ? "ok" : i.status === "Pendente" ? "alerta" : "ruim"}`}>{i.status}</span>{i.marcadoPor && <small className="bloco">por {i.marcadoPor}</small>}</td>
                <td className={`num ${i.valor < 0 ? "txt-ruim" : ""}`}>{dinheiro(i.valor)}</td>
                {admin && <td>{["Pagamento", "Repasse", "Recarga motorista", "Recarga passageiro", "Recarga empresa"].includes(i.tipo) && ["Pago", "Chargeback", "Estornado"].includes(i.status) && <button className="botao" onClick={() => setMarcar(i)}>Marcar</button>}</td>}
              </tr>
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
      <Modal aberto={repasses} onFechar={() => setRepasses(false)} titulo="Repasses de hoje" sub="Pagamentos e repasses pagos com data de repasse de hoje." larga>
        {(() => {
          const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
          const l = (x?.itens ?? []).filter((i: any) => i.status === "Pago" && i.dataRepasse === hoje && ["Pagamento", "Repasse"].includes(i.tipo));
          return !l.length ? <p className="vazio">Nenhum repasse com data de hoje.</p> : <div className="tabela-rola"><table><thead><tr><th>ID da transação</th><th>Tipo de transação</th><th>Forma de pagamento</th><th>Valor líquido</th></tr></thead>
            <tbody>{l.map((i: any) => <tr key={`${i.tipo}${i.id}`}><td><code>{i.codigo}</code></td><td>{i.tipo}</td><td>{i.forma}</td><td className="num">{dinheiro(i.valor)}</td></tr>)}</tbody></table></div>;
        })()}
      </Modal>
      <ModalMarcar item={marcar} onFechar={() => setMarcar(null)} onFeito={() => { setMarcar(null); d.recarregar(); }} />
    </>
  );
}

function ModalMarcar({ item, onFechar, onFeito }: { item: any; onFechar: () => void; onFeito: () => void }) {
  const [status, setStatus] = useState("Estornado"), [motivo, setMotivo] = useState("");
  const { msg, salvando, salvar } = useSalvar();
  return (
    <Modal aberto={!!item} onFechar={onFechar} titulo="Marcar transação" sub="Registro contábil: não altera a carteira de ninguém nem chama a operadora.">
      <form className="dm-form" onSubmit={async (e) => { e.preventDefault(); const r = await salvar(() => pedirConfig(`/transacoes-online/${encodeURIComponent(item.id)}/status`, "POST", { status, motivo })); if (r) { setMotivo(""); onFeito(); } }}>
        <Campo rotulo="Novo status"><select value={status} onChange={(e) => setStatus(e.target.value)}><option>Estornado</option><option>Chargeback</option><option value="Pago">Pago (desfazer marcação)</option></select></Campo>
        <Campo rotulo="Motivo"><input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} placeholder="Ex.: contestação do titular do cartão" /></Campo>
        <Aviso erro={msg?.erro} />
        <div className="dm-rodape-modal"><button type="button" className="botao" onClick={onFechar}>Cancelar</button><button className="botao primario" disabled={salvando}>Salvar</button></div>
      </form>
    </Modal>
  );
}

export { PERIODO_MES };
