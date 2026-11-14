import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, MapPin, Car, Smartphone, DollarSign, Receipt, Gauge, BarChart3, Users, Star, Info, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { api, dinheiro, numero } from "../api";
import { useSessao } from "../App";
import { Avisos, Titulo, useCarregar } from "../componentes/ui";
import { CorpoIndicador, eng, type Ind } from "../telas/engajamento/pecas";
import pacote from "../../../package.json";

// Página inicial "Indicadores": igual à da Machine. Estatísticas da operação (7 cartões com variação contra o período
// anterior), seção de engajamento, Métricas de avaliação (NPS de passageiros e de motoristas), Comparativos de
// desempenho e Evolução do NPS. Cada bloco tem o seu período.

type Opcao = [string, string];
const ESTATISTICAS: Opcao[] = [["hoje", "Hoje"], ["ontem", "Ontem"], ["semana_passada", "Semana passada"], ["mes_passado", "Mês passado"], ["ultimo_7", "Últimos 7 dias"], ["ultimo_30", "Últimos 30 dias"]];
const METRICAS: Opcao[] = [["consolidado", "Consolidado"], ...ESTATISTICAS.slice(1)];
const CORES = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#64748b"];
const dataBr = (iso: string) => iso.split("-").reverse().join("/");

interface Escolha { periodo: string; ini: string; fim: string }
type Linha = { nome: string; valor: number; pct: number };

/** Barras das telas de estatísticas (usado por Estatisticas.tsx). */
type Contagem = { nome: string; qtd: number; pct: number };
export const barrasDe = (l: Contagem[] | undefined, n = 8) => (l ?? []).slice(0, n).map((c) => ({ rotulo: c.nome, valor: c.qtd, extra: `${numero(c.pct, 1)}%` }));
interface Ind7 { valor: number; anterior: number; variacao: number | null }
interface Dados {
  corridas: { total: number; anterior: number; finalizadas: number; canceladas: number; naoAtendidas: number; emAndamento: number; canceladasPor: { motorista: number; passageiro: number; central: number }; variacao: number | null };
  origens: Linha[];
  ganhos: { total: number; anterior: number; variacao: number | null; porPagamento: Linha[] };
  ticketMedio: Ind7; motoristasAtivos: Ind7; corridasPorMotorista: Ind7; passageirosCadastrados: Ind7;
}
interface Nps { nps: number | null; respondentes: number; detratores: number; neutros: number; promotores: number }
interface Metricas { passageiros: Nps; motoristas: Nps }
interface Serie { serie: Array<{ rotulo: string; solicitadas: number; finalizadas: number; naoAtendidas: number; canceladas: number; ganhos: number; nps: number | null }> }

/** Seletor suspenso que fecha ao clicar fora. */
function Seletor({ classe, icone, rotulo, children }: { classe: string; icone: ReactNode; rotulo: string; children: (fechar: () => void) => ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fora = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAberto(false); };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);
  return (
    <div className={`seletor ${classe}`} ref={ref}>
      <button type="button" className="seletor-botao" onClick={() => setAberto(!aberto)} aria-expanded={aberto}>
        <span>{icone}{rotulo}</span><ChevronDown size={14} />
      </button>
      {aberto && <div className="seletor-lista">{children(() => setAberto(false))}</div>}
    </div>
  );
}

/** Seletor de período com "Personalizado" (de/até). */
function SeletorPeriodo({ opcoes, valor, onMudar }: { opcoes: Opcao[]; valor: Escolha; onMudar: (e: Escolha) => void }) {
  const pers = valor.periodo === "personalizado";
  const rotulo = pers ? (valor.ini ? `${dataBr(valor.ini)}${valor.fim ? ` a ${dataBr(valor.fim)}` : ""}` : "Personalizado") : opcoes.find((p) => p[0] === valor.periodo)?.[1] ?? "Período";
  return (
    <Seletor classe="periodo-sel" icone={<Calendar size={16} />} rotulo={rotulo}>
      {(fechar) => (
        <>
          {opcoes.map(([id, nome]) => <button key={id} className={valor.periodo === id ? "ativo" : ""} onClick={() => { onMudar({ ...valor, periodo: id }); fechar(); }}>{nome}</button>)}
          <hr />
          <button className={`destaque ${pers ? "ativo" : ""}`} onClick={() => { const h = new Date().toISOString().slice(0, 10); onMudar({ periodo: "personalizado", ini: valor.ini || h, fim: valor.fim || h }); }}>Personalizado</button>
          {pers && (
            <div className="seletor-datas">
              <label>De<input type="date" value={valor.ini} onChange={(e) => onMudar({ ...valor, ini: e.target.value, fim: valor.fim && e.target.value > valor.fim ? e.target.value : valor.fim })} /></label>
              <label>Até<input type="date" value={valor.fim} min={valor.ini} onChange={(e) => onMudar({ ...valor, fim: e.target.value })} /></label>
            </div>
          )}
        </>
      )}
    </Seletor>
  );
}

function Tendencia({ v, titulo }: { v: number | null | undefined; titulo?: string }) {
  if (v == null) return <span className="tendencia neutra" title={titulo}>--%</span>;
  const baixa = v < 0;
  return <span className={`tendencia ${baixa ? "baixa" : v === 0 ? "neutra" : ""}`} title={titulo}>{baixa ? <TrendingDown size={12} /> : <TrendingUp size={12} />}{baixa ? "- " : "+ "}{numero(Math.abs(v), 1)}%</span>;
}

function Pizza({ itens }: { itens: Linha[] }) {
  const total = itens.reduce((s, i) => s + i.valor, 0);
  let acc = 0;
  const partes = itens.map((i, k) => { const de = acc; acc += (i.valor / (total || 1)) * 100; return `${CORES[k % CORES.length]} ${de}% ${acc}%`; });
  const furo = "radial-gradient(circle at center, transparent 55%, #000 56%)";
  return <div className="pizza" style={{ background: total ? `conic-gradient(${partes.join(", ")})` : "var(--borda)", mask: furo, WebkitMask: furo }} aria-hidden />;
}

function Esqueleto({ pronto, children }: { pronto: boolean; children: ReactNode }) {
  return pronto ? <h3 className="ind-valor">{children}</h3> : <h3 className="ind-valor esqueleto">0</h3>;
}

function Grande({ icone, cor, titulo, variacao, tituloVariacao, valor, pronto, lista, extra, dica, comValor }: { icone: ReactNode; cor: string; titulo: string; variacao?: number | null; tituloVariacao?: string; valor: ReactNode; pronto: boolean; lista: Linha[]; extra?: ReactNode; dica: ReactNode; comValor?: boolean }) {
  return (
    <div className="ind-caixa">
      <div className="ind-cartao">
        <div className="ind-cab"><span className={`ind-icone ${cor}`}>{icone}</span>{variacao !== undefined && <Tendencia v={variacao} titulo={tituloVariacao} />}</div>
        <div style={{ marginBottom: 16 }}><p className="ind-rotulo">{titulo}</p><Esqueleto pronto={pronto}>{valor}</Esqueleto></div>
        <div className="ind-corpo">
          <div className="ind-legenda">
            {lista.map((l, k) => (
              <div key={l.nome} className="ind-leg"><i style={{ background: CORES[k % CORES.length] }} /><div><p>{numero(l.pct, 1)}% {l.nome}</p>{comValor && <b>{numero(l.valor)}</b>}</div></div>
            ))}
          </div>
          <Pizza itens={lista} />
        </div>
        <div className="ind-extra">{extra}<div className={extra ? "dica" : ""} style={{ display: "flex", gap: 8 }}><Info size={14} /><span>{dica}</span></div></div>
      </div>
    </div>
  );
}

function Pequeno({ icone, cor, titulo, valor, variacao, tituloVariacao, comVariacao = true, pronto, dica }: { icone: ReactNode; cor: string; titulo: string; valor: ReactNode; variacao?: number | null; tituloVariacao?: string; comVariacao?: boolean; pronto: boolean; dica: string }) {
  return (
    <div className="ind-caixa baixa">
      <div className="ind-cartao">
        <div className="ind-cab"><span className={`ind-icone ${cor}`}>{icone}</span>{comVariacao && <Tendencia v={variacao} titulo={tituloVariacao} />}</div>
        <p className="ind-rotulo" style={{ marginTop: 8 }}>{titulo}</p>
        <Esqueleto pronto={pronto}>{valor}</Esqueleto>
        <div className="ind-extra"><Info size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />{dica}</div>
      </div>
    </div>
  );
}

type SerieG = { nome: string; cor: string; valores: Array<number | null> };

/** Gráfico de linhas ou barras em SVG, com grade, eixos e dica ao passar o mouse. */
function Grafico({ rotulos, series, tipo, formato = (n) => numero(n) }: { rotulos: string[]; series: SerieG[]; tipo: "linha" | "barra"; formato?: (n: number) => string }) {
  const [foco, setFoco] = useState<number | null>(null);
  const W = 560, H = 260, ml = 44, mr = 12, mt = 12, mb = 28;
  const todos = series.flatMap((s) => s.valores).filter((v): v is number => v != null);
  if (!todos.length || todos.every((v) => v === 0) && tipo === "barra") return <div className="grafico-vazio">Sem dados no período.</div>;
  const min = Math.min(0, ...todos), max = Math.max(1, ...todos);
  const iw = W - ml - mr, ih = H - mt - mb, n = rotulos.length;
  const x = (i: number) => ml + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const xb = (i: number) => ml + ((i + 0.5) / n) * iw;
  const y = (v: number) => mt + ih - ((v - min) / (max - min || 1)) * ih;
  const passo = Math.max(1, Math.ceil(n / 8));
  const ticks = [0, 1, 2, 3, 4].map((k) => min + ((max - min) * k) / 4);
  const px = tipo === "linha" ? x : xb;
  return (
    <>
      <div className="grafico-legenda">{series.map((s) => <span key={s.nome}><i style={{ background: s.cor }} />{s.nome}</span>)}</div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" onMouseLeave={() => setFoco(null)}>
        {ticks.map((t) => <g key={t}><line className="grade-v" x1={ml} x2={W - mr} y1={y(t)} y2={y(t)} /><text x={ml - 6} y={y(t) + 4} textAnchor="end">{formato(Math.round(t * 10) / 10)}</text></g>)}
        {rotulos.map((r, i) => i % passo === 0 && <text key={i} x={px(i)} y={H - 8} textAnchor="middle">{r}</text>)}
        {tipo === "barra" && series.map((s, k) => s.valores.map((v, i) => v != null && (
          <rect key={`${k}-${i}`} x={xb(i) - (iw / n) * 0.35 + k * (((iw / n) * 0.7) / series.length)} width={Math.max(2, ((iw / n) * 0.7) / series.length - 1)} y={Math.min(y(v), y(0))} height={Math.abs(y(v) - y(0))} rx={3} fill={s.cor} opacity={foco === i ? 1 : 0.85} />
        )))}
        {tipo === "linha" && series.map((s) => {
          const pts = s.valores.map((v, i) => (v == null ? null : ([x(i), y(v)] as const)));
          let d = "", abre = false;
          pts.forEach((p) => { if (!p) { abre = false; return; } d += `${abre ? "L" : "M"}${p[0]},${p[1]} `; abre = true; });
          return <g key={s.nome}><path d={d} fill="none" stroke={s.cor} strokeWidth={2.5} strokeLinejoin="round" />{pts.map((p, i) => p && <circle key={i} className="ponto" cx={p[0]} cy={p[1]} r={n > 40 ? 0 : 3.5} fill={s.cor} />)}</g>;
        })}
        {rotulos.map((_, i) => <rect key={i} x={px(i) - iw / n / 2} y={mt} width={iw / n} height={ih} fill="transparent" onMouseEnter={() => setFoco(i)} />)}
      </svg>
      {foco != null && <p className="grafico-dica"><strong>{rotulos[foco]}</strong>: {series.map((s) => `${s.nome} ${s.valores[foco] == null ? "sem dados" : formato(s.valores[foco]!)}`).join(" · ")}</p>}
    </>
  );
}

/** Medidor do NPS: escala de 0 a 10 (detratores até 6, neutros 7 e 8, promotores 9 e 10), com a marca do NPS e a divisão em %. */
function Medidor({ titulo, d, pronto }: { titulo: string; d: Nps | undefined; pronto: boolean }) {
  const score = d?.nps == null ? null : (d.nps + 100) / 20;
  return (
    <div className="ind-caixa nps">
      <div className="ind-cartao">
        <div className="ind-cab"><span className="ind-icone cor-ambar"><Star size={22} /></span></div>
        <p className="ind-rotulo">{titulo}</p>
        <Esqueleto pronto={pronto}>{d?.nps ?? "--"}</Esqueleto>
        <div className="nps-escala" aria-hidden>
          <div className="nps-faixas"><i style={{ flex: 7, background: "#ef4444" }} /><i style={{ flex: 2, background: "#f59e0b" }} /><i style={{ flex: 2, background: "#10b981" }} /></div>
          {score != null && <b className="nps-marca" style={{ left: `${(score / 10) * 100}%` }} />}
          <div className="nps-numeros">{Array.from({ length: 11 }, (_, i) => <span key={i}>{i}</span>)}</div>
        </div>
        <div className="nps-legenda">
          <span><i style={{ background: "#ef4444" }} />{d ? d.detratores : 0}% Detratores</span>
          <span><i style={{ background: "#f59e0b" }} />{d ? d.neutros : 0}% Neutros</span>
          <span><i style={{ background: "#10b981" }} />{d ? d.promotores : 0}% Promotores</span>
        </div>
      </div>
    </div>
  );
}

/** Seção de engajamento da página inicial: um indicador dos motoristas por vez, com setas para trocar. */
function SecaoEngajamento() {
  const [pos, setPos] = useState(0);
  const { dados } = useCarregar(() => eng<{ indicadores: Ind[] }>("/mapa?papel=motoristas").catch(() => null), []);
  const lista = dados?.indicadores ?? [];
  const ind = lista[pos];
  if (!ind) return null;
  return (
    <div className="me-secao-inicio mapa-engajamento">
      <div className="me-secao__topo">
        <span className="me-secao__setas">
          <button type="button" className="me-btn me-btn--redondo" title="Indicador anterior" disabled={pos === 0} onClick={() => setPos(pos - 1)}><ChevronLeft size={18} /></button>
          <button type="button" className="me-btn me-btn--redondo" title="Próximo indicador" disabled={pos >= lista.length - 1} onClick={() => setPos(pos + 1)}><ChevronRight size={18} /></button>
        </span>
        <span className="me-secao__titulo">{ind.rotulo}</span>
        <Link to="/engajamento" className="me-secao__link"><ChevronRight size={16} /><p style={{ margin: 0 }}>Ver mapa de engajamento</p></Link>
      </div>
      <CorpoIndicador papel="motoristas" ind={ind} filtro={{ situacao: "A" }} podeAgir={false} podeSalvar={false} compacta onMudou={() => undefined} />
    </div>
  );
}


export default function Painel() {
  const { marca } = useSessao();
  const [cidade, setCidade] = useState("");
  const [est, setEst] = useState<Escolha>({ periodo: "ontem", ini: "", fim: "" });
  const [met, setMet] = useState<Escolha>({ periodo: "consolidado", ini: "", fim: "" });
  const [cmp, setCmp] = useState<Escolha>({ periodo: "ultimo_7", ini: "", fim: "" });
  const prontoPeriodo = (e: Escolha) => e.periodo !== "personalizado" || !!e.ini;
  const liberado = prontoPeriodo(est) && prontoPeriodo(met) && prontoPeriodo(cmp);
  const pedido = liberado ? {
    cidade, periodo: est.periodo, ...(est.periodo === "personalizado" ? { inicio: est.ini, fim: est.fim } : {}),
    nps: met.periodo, ...(met.periodo === "personalizado" ? { npsInicio: met.ini, npsFim: met.fim } : {}),
    serie: cmp.periodo, ...(cmp.periodo === "personalizado" ? { serieInicio: cmp.ini, serieFim: cmp.fim } : {}),
  } : null;
  const { dados, erro } = useCarregar(() => (pedido ? api.indicadores(pedido) : Promise.resolve(null)), [JSON.stringify(pedido)]);
  const { dados: oc } = useCarregar(() => fetch("/api/operacao/ocorrencias?horas=1", { credentials: "same-origin" }).then((r) => (r.ok ? r.json() : null)).catch(() => null), [], 300_000);
  const [cidades, setCidades] = useState<string[]>([]);
  useEffect(() => { if (dados?.cidades?.length) setCidades((c) => [...new Set([...c, ...dados.cidades])].sort((a, b) => a.localeCompare(b, "pt-BR"))); }, [dados]);
  const d = dados?.indicadores as Dados | undefined;
  const m = dados?.metricas as Metricas | undefined;
  const s = (dados?.comparativos as Serie | undefined)?.serie ?? [];
  const pronto = !!d;
  const c = d?.corridas;
  const pc = (n: number) => (c && c.total ? (n / c.total) * 100 : 0);
  const legCorridas: Linha[] = c ? [
    { nome: "Finalizadas", valor: c.finalizadas, pct: pc(c.finalizadas) },
    { nome: "Canceladas", valor: c.canceladas, pct: pc(c.canceladas) },
    { nome: "Não atendidas", valor: c.naoAtendidas, pct: pc(c.naoAtendidas) },
  ] : [];
  const rot = s.map((x) => x.rotulo);
  const ant = (n: number | undefined, casas = 0) => `Comparado com ${dados?.rotuloAnterior ?? "o período anterior"}: ${numero(n ?? 0, casas)}`;
  const taxa = c ? pc(c.finalizadas) : 0;
  const dicaCorridas = c && c.total ? (taxa >= 70 ? "Seu número de corridas finalizadas é considerado alto. Procure mantê-lo acima de 70%." : "Seu número de corridas finalizadas é considerado baixo. Procure mantê-lo acima de 70%.") : "Seu número de corridas finalizadas é considerado alto. Procure mantê-lo acima de 70%.";
  const tem = (oc?.total ?? 0) > 0;

  return (
    <>
      <Titulo titulo="Indicadores">
        <div className="filtro-topo">
          <Seletor classe="cidade" icone={<MapPin size={16} />} rotulo={cidade ? cidades.find((x) => x.toLowerCase() === cidade.toLowerCase()) ?? cidade : "Todas as cidades"}>
            {(fechar) => (
              <>
                <button className={!cidade ? "ativo" : ""} onClick={() => { setCidade(""); fechar(); }}>Todas as cidades</button>
                {cidades.map((x) => <button key={x} className={cidade === x ? "ativo" : ""} onClick={() => { setCidade(x); fechar(); }}>{x}</button>)}
              </>
            )}
          </Seletor>
        </div>
      </Titulo>
      {tem && (
        <div className="aviso-ocorrencia" role="alert"><AlertTriangle size={16} /><span>Há corridas que podem requerer atenção do operador. Acione a <Link to="/ocorrencias">tela de ocorrências</Link> e registre ciência nas corridas para liberar este alerta</span></div>
      )}
      <Avisos lista={[...(dados?.avisos ?? []), erro]} />

      <div className="ind-secao-linha"><h3 className="ind-secao">Estatísticas da operação</h3><SeletorPeriodo opcoes={ESTATISTICAS} valor={est} onMudar={setEst} /></div>
      <div className="ind-linha3">
        <Grande icone={<Car size={22} />} cor="cor-azul" titulo="Corridas solicitadas" variacao={c?.variacao} tituloVariacao={ant(c?.anterior)} valor={numero(c?.total ?? 0)} pronto={pronto} lista={legCorridas} comValor
          extra={c && <>
            <div><Car size={14} /><span><b>{numero(c.canceladasPor.motorista)}</b> corridas foram canceladas por motorista</span></div>
            <div><Car size={14} /><span><b>{numero(c.canceladasPor.passageiro)}</b> corridas foram canceladas por cliente</span></div>
            <div><Car size={14} /><span><b>{numero(c.canceladasPor.central)}</b> corridas foram canceladas por central</span></div>
          </>}
          dica={dicaCorridas} />
        <Grande icone={<Smartphone size={22} />} cor="cor-roxo" titulo="Origem das corridas finalizadas" valor={numero(c?.finalizadas ?? 0)} pronto={pronto} lista={d?.origens ?? []} comValor
          dica="Total de solicitações e distribuição das origens no período" />
        <Grande icone={<DollarSign size={22} />} cor="cor-verde" titulo="Ganhos gerais" variacao={d?.ganhos.variacao} tituloVariacao={ant(d?.ganhos.anterior)} valor={dinheiro(d?.ganhos.total ?? 0)} pronto={pronto} lista={d?.ganhos.porPagamento ?? []}
          dica="Total arrecadado em todas as corridas finalizadas no período selecionado" />
      </div>

      <div className="ind-linha4">
        <Pequeno icone={<Receipt size={20} />} cor="cor-anil" titulo="Ticket médio por corrida" valor={dinheiro(d?.ticketMedio.valor ?? 0)} comVariacao={false} pronto={pronto} dica="Média de quanto um passageiro gasta em cada corrida" />
        <Pequeno icone={<Gauge size={20} />} cor="cor-ambar" titulo="Motoristas ativos" valor={numero(d?.motoristasAtivos.valor ?? 0)} comVariacao={false} pronto={pronto} dica="Número de Motoristas que ficaram ativos no período selecionado" />
        <Pequeno icone={<BarChart3 size={20} />} cor="cor-ciano" titulo="Corridas por motorista" valor={numero(d?.corridasPorMotorista.valor ?? 0, 2)} variacao={d?.corridasPorMotorista.variacao} tituloVariacao={ant(d?.corridasPorMotorista.anterior, 2)} pronto={pronto} dica="Média de quantas corridas cada motorista realizou" />
        <Pequeno icone={<Users size={20} />} cor="cor-rosa" titulo="Passageiros cadastrados" valor={numero(d?.passageirosCadastrados.valor ?? 0)} variacao={d?.passageirosCadastrados.variacao} tituloVariacao={ant(d?.passageirosCadastrados.anterior)} pronto={pronto} dica="Quantidade de passageiros cadastrados no período" />
      </div>

      <SecaoEngajamento />

      <div className="ind-secao-linha"><h3 className="ind-secao">Métricas de avaliação</h3><SeletorPeriodo opcoes={METRICAS} valor={met} onMudar={setMet} /></div>
      <div className="ind-graficos">
        <Medidor titulo="NPS dos passageiros" d={m?.passageiros} pronto={pronto} />
        <Medidor titulo="NPS dos Motoristas" d={m?.motoristas} pronto={pronto} />
      </div>

      <div className="ind-secao-linha"><h3 className="ind-secao">Comparativos de desempenho</h3><SeletorPeriodo opcoes={ESTATISTICAS} valor={cmp} onMudar={setCmp} /></div>
      <div className="ind-graficos">
        <section className="grafico">
          <h3><Car size={20} color="#3b82f6" /> Total de corridas</h3>
          <Grafico tipo="linha" rotulos={rot} series={[
            { nome: "Solicitadas", cor: "#3b82f6", valores: s.map((x) => x.solicitadas) },
            { nome: "Finalizadas", cor: "#10b981", valores: s.map((x) => x.finalizadas) },
            { nome: "Canceladas", cor: "#ef4444", valores: s.map((x) => x.canceladas) },
            { nome: "Não atendidas", cor: "#f59e0b", valores: s.map((x) => x.naoAtendidas) },
          ]} />
        </section>
        <section className="grafico">
          <h3><DollarSign size={20} color="#10b981" /> Ganhos no período</h3>
          <Grafico tipo="barra" rotulos={rot} formato={(n) => dinheiro(n)} series={[{ nome: "Ganhos", cor: "#10b981", valores: s.map((x) => x.ganhos) }]} />
        </section>
      </div>

      <div className="ind-graficos">
        <section className="grafico">
          <h3><Star size={20} color="#f59e0b" /> Evolução do NPS</h3>
          <Grafico tipo="linha" rotulos={rot} series={[{ nome: `NPS ${marca.nomeExibido}`, cor: "#f59e0b", valores: s.map((x) => x.nps) }]} />
          <p className="grafico-rodape"><Info size={14} /> O NPS é calculado da seguinte forma: Promotores – Detratores ÷ Número total de respondentes</p>
        </section>
      </div>
      <p className="rodape-versao">Versão {pacote.version}</p>
    </>
  );
}
