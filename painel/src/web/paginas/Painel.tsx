import { useEffect, useRef, useState, type ReactNode } from "react";
import { Calendar, ChevronDown, MapPin, Car, Smartphone, DollarSign, Receipt, Gauge, BarChart3, Users, Star, Info, TrendingUp, TrendingDown } from "lucide-react";
import { api, dinheiro, numero } from "../api";
import { useSessao } from "../App";
import { Avisos, Titulo, useCarregar } from "../componentes/ui";

// Painel "Indicadores": igual ao painel de referência. Filtro de cidade e período, 7 cartões com
// variação contra o período anterior e os gráficos de "Comparativos de desempenho" e "Evolução do NPS".

const PERIODOS: Array<[string, string]> = [["hoje", "Hoje"], ["ontem", "Ontem"], ["semana", "Esta Semana"], ["mes", "Este Mês"], ["mes_passado", "Mês Passado"], ["ano_passado", "Ano Passado"]];
const CORES = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#64748b"];
const dataBr = (iso: string) => iso.split("-").reverse().join("/");

type Linha = { nome: string; valor: number; pct: number };

/** Barras das telas de estatísticas (usado por Estatisticas.tsx). */
type Contagem = { nome: string; qtd: number; pct: number };
export const barrasDe = (l: Contagem[] | undefined, n = 8) => (l ?? []).slice(0, n).map((c) => ({ rotulo: c.nome, valor: c.qtd, extra: `${numero(c.pct, 1)}%` }));
interface Ind {
  corridas: { total: number; finalizadas: number; canceladas: number; naoAtendidas: number; emAndamento: number; canceladasPor: { motorista: number; passageiro: number; central: number }; variacao: number | null };
  origens: Linha[];
  ganhos: { total: number; variacao: number | null; porPagamento: Linha[] };
  ticketMedio: { valor: number; variacao: number | null };
  motoristasAtivos: { valor: number; variacao: number | null };
  corridasPorMotorista: { valor: number; variacao: number | null };
  passageirosCadastrados: { valor: number; variacao: number | null };
  serie: Array<{ rotulo: string; solicitadas: number; finalizadas: number; naoAtendidas: number; canceladas: number; ganhos: number; nps: number | null }>;
}

/** Seletor suspenso (cidade e período) que fecha ao clicar fora. */
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

function Tendencia({ v }: { v: number | null | undefined }) {
  if (v == null) return <span className="tendencia neutra">--%</span>;
  const baixa = v < 0;
  return <span className={`tendencia ${baixa ? "baixa" : v === 0 ? "neutra" : ""}`}>{baixa ? <TrendingDown size={12} /> : <TrendingUp size={12} />}{numero(Math.abs(v), 1)}%</span>;
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

function Grande({ icone, cor, titulo, variacao, valor, pronto, lista, rola, extra, dica }: { icone: ReactNode; cor: string; titulo: string; variacao?: number | null; valor: ReactNode; pronto: boolean; lista: Linha[]; rola?: boolean; extra?: ReactNode; dica: string }) {
  return (
    <div className="ind-caixa">
      <div className="ind-cartao">
        <div className="ind-cab"><span className={`ind-icone ${cor}`}>{icone}</span>{variacao !== undefined && <Tendencia v={variacao} />}</div>
        <div style={{ marginBottom: 16 }}><p className="ind-rotulo">{titulo}</p><Esqueleto pronto={pronto}>{valor}</Esqueleto></div>
        <div className="ind-corpo">
          <div className={`ind-legenda ${rola ? "rola" : ""}`}>
            {lista.map((l, k) => rola
              ? <div key={l.nome} className="ind-leg linha"><i style={{ background: CORES[k % CORES.length] }} /><p title={l.nome}>{l.nome}</p><strong>{dinheiro(l.valor)}</strong></div>
              : <div key={l.nome} className="ind-leg"><i style={{ background: CORES[k % CORES.length] }} /><div><p>{l.nome}</p><b>{numero(l.valor)} <small>({numero(l.pct, 1)}%)</small></b></div></div>)}
          </div>
          <Pizza itens={lista} />
        </div>
        <div className="ind-extra">{extra}<div className={extra ? "dica" : ""} style={{ display: "flex", gap: 8 }}><Info size={14} /><span>{dica}</span></div></div>
      </div>
    </div>
  );
}

function Pequeno({ icone, cor, titulo, valor, variacao, pronto, dica }: { icone: ReactNode; cor: string; titulo: string; valor: ReactNode; variacao: number | null | undefined; pronto: boolean; dica: string }) {
  return (
    <div className="ind-caixa baixa">
      <div className="ind-cartao">
        <div className="ind-cab"><span className={`ind-icone ${cor}`}>{icone}</span><Tendencia v={variacao} /></div>
        <p className="ind-rotulo" style={{ marginTop: 8 }}>{titulo}</p>
        <Esqueleto pronto={pronto}>{valor}</Esqueleto>
        <div className="ind-extra"><Info size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />{dica}</div>
      </div>
    </div>
  );
}

type Serie = { nome: string; cor: string; valores: Array<number | null> };

/** Gráfico de linhas ou barras em SVG, com grade, eixos e dica ao passar o mouse. */
function Grafico({ rotulos, series, tipo, formato = (n) => numero(n) }: { rotulos: string[]; series: Serie[]; tipo: "linha" | "barra"; formato?: (n: number) => string }) {
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

export default function Painel() {
  const { marca } = useSessao();
  const [cidade, setCidade] = useState("");
  const [periodo, setPeriodo] = useState("hoje");
  const [ini, setIni] = useState("");
  const [fim, setFim] = useState("");
  const personalizado = periodo === "personalizado";
  const pedido = !personalizado || ini ? [periodo, cidade, personalizado ? ini : "", personalizado ? fim : ""] : null;
  const { dados, erro } = useCarregar(() => (pedido ? api.indicadores(pedido[0], pedido[1], pedido[2] || undefined, pedido[3] || undefined) : Promise.resolve(null)), [JSON.stringify(pedido)]);
  const [cidades, setCidades] = useState<string[]>([]);
  useEffect(() => { if (dados?.cidades?.length) setCidades((c) => [...new Set([...c, ...dados.cidades])].sort((a, b) => a.localeCompare(b, "pt-BR"))); }, [dados]);
  const d = dados?.indicadores as Ind | undefined;
  const pronto = !!d;
  const rotuloPeriodo = personalizado ? (ini ? `${dataBr(ini)}${fim ? ` a ${dataBr(fim)}` : ""}` : "Personalizado") : PERIODOS.find((p) => p[0] === periodo)![1];
  const c = d?.corridas;
  const pc = (n: number) => (c && c.total ? (n / c.total) * 100 : 0);
  const legCorridas: Linha[] = c ? [
    { nome: "Finalizadas", valor: c.finalizadas, pct: pc(c.finalizadas) },
    { nome: "Canceladas", valor: c.canceladas, pct: pc(c.canceladas) },
    { nome: "Não atendidas", valor: c.naoAtendidas, pct: pc(c.naoAtendidas) },
    { nome: "Em andamento", valor: c.emAndamento, pct: pc(c.emAndamento) },
  ].filter((l) => l.valor > 0) : [];
  const rot = d?.serie.map((s) => s.rotulo) ?? [];

  return (
    <>
      <Titulo titulo="Indicadores" sub="Visão geral da sua operação">
        <div className="filtro-topo">
          <Seletor classe="cidade" icone={<MapPin size={16} />} rotulo={cidade ? cidades.find((x) => x.toLowerCase() === cidade.toLowerCase()) ?? cidade : "Todas as cidades"}>
            {(fechar) => (
              <>
                <button className={!cidade ? "ativo" : ""} onClick={() => { setCidade(""); fechar(); }}>Todas as cidades</button>
                {cidades.map((x) => <button key={x} className={cidade === x ? "ativo" : ""} onClick={() => { setCidade(x); fechar(); }}>{x}</button>)}
              </>
            )}
          </Seletor>
          <Seletor classe="periodo-sel" icone={<Calendar size={16} />} rotulo={rotuloPeriodo}>
            {(fechar) => (
              <>
                {PERIODOS.map(([id, nome]) => <button key={id} className={periodo === id ? "ativo" : ""} onClick={() => { setPeriodo(id); fechar(); }}>{nome}</button>)}
                <hr />
                <button className={`destaque ${personalizado ? "ativo" : ""}`} onClick={() => { if (!ini) { const h = new Date().toISOString().slice(0, 10); setIni(h); setFim(h); } setPeriodo("personalizado"); }}>Personalizado...</button>
                {personalizado && (
                  <div className="seletor-datas">
                    <label>De<input type="date" value={ini} onChange={(e) => { setIni(e.target.value); if (fim && e.target.value > fim) setFim(e.target.value); }} /></label>
                    <label>Até<input type="date" value={fim} min={ini} onChange={(e) => setFim(e.target.value)} /></label>
                  </div>
                )}
              </>
            )}
          </Seletor>
        </div>
      </Titulo>
      <Avisos lista={[...(dados?.avisos ?? []), erro]} />

      <div className="ind-linha3">
        <Grande icone={<Car size={22} />} cor="cor-azul" titulo="Corridas solicitadas" variacao={c?.variacao} valor={numero(c?.total ?? 0)} pronto={pronto} lista={legCorridas}
          extra={c && <>
            <div><Car size={14} /><span><b>{numero(c.canceladasPor.motorista)}</b> canceladas por motorista</span></div>
            <div><Car size={14} /><span><b>{numero(c.canceladasPor.passageiro)}</b> canceladas por cliente</span></div>
            <div><Car size={14} /><span><b>{numero(c.canceladasPor.central)}</b> canceladas pela central</span></div>
          </>}
          dica={c ? `Taxa de finalização: ${numero(pc(c.finalizadas), 1)}%.` : "Taxa de finalização."} />
        <Grande icone={<Smartphone size={22} />} cor="cor-roxo" titulo="Origem das corridas finalizadas" valor={numero(c?.finalizadas ?? 0)} pronto={pronto} lista={d?.origens ?? []}
          dica="Total de solicitações e distribuição das origens." />
        <Grande icone={<DollarSign size={22} />} cor="cor-verde" titulo="Ganhos gerais" variacao={d?.ganhos.variacao} valor={dinheiro(d?.ganhos.total ?? 0)} pronto={pronto} lista={d?.ganhos.porPagamento ?? []} rola
          dica="Total arrecadado (dinheiro, Pix, maquininha etc.)." />
      </div>

      <div className="ind-linha4">
        <Pequeno icone={<Receipt size={20} />} cor="cor-anil" titulo="Ticket médio por corrida" valor={dinheiro(d?.ticketMedio.valor ?? 0)} variacao={d?.ticketMedio.variacao} pronto={pronto} dica="Média gasta por corrida." />
        <Pequeno icone={<Gauge size={20} />} cor="cor-ambar" titulo="Motoristas ativos" valor={numero(d?.motoristasAtivos.valor ?? 0)} variacao={d?.motoristasAtivos.variacao} pronto={pronto} dica="Motoristas com corrida finalizada no período." />
        <Pequeno icone={<BarChart3 size={20} />} cor="cor-ciano" titulo="Corridas por motorista" valor={numero(d?.corridasPorMotorista.valor ?? 0, 2)} variacao={d?.corridasPorMotorista.variacao} pronto={pronto} dica="Média por motorista ativo." />
        <Pequeno icone={<Users size={20} />} cor="cor-rosa" titulo="Passageiros cadastrados" valor={numero(d?.passageirosCadastrados.valor ?? 0)} variacao={d?.passageirosCadastrados.variacao} pronto={pronto} dica="Novos cadastros no período." />
      </div>

      <h3 className="ind-secao">Comparativos de desempenho</h3>
      <div className="ind-graficos">
        <section className="grafico">
          <h3><Car size={20} color="#3b82f6" /> Total de corridas</h3>
          <Grafico tipo="linha" rotulos={rot} series={[
            { nome: "Solicitadas", cor: "#3b82f6", valores: d?.serie.map((s) => s.solicitadas) ?? [] },
            { nome: "Finalizadas", cor: "#10b981", valores: d?.serie.map((s) => s.finalizadas) ?? [] },
            { nome: "Canceladas", cor: "#ef4444", valores: d?.serie.map((s) => s.canceladas) ?? [] },
            { nome: "Não atendidas", cor: "#f59e0b", valores: d?.serie.map((s) => s.naoAtendidas) ?? [] },
          ]} />
        </section>
        <section className="grafico">
          <h3><DollarSign size={20} color="#10b981" /> Ganhos no período</h3>
          <Grafico tipo="barra" rotulos={rot} formato={(n) => dinheiro(n)} series={[{ nome: "Ganhos", cor: "#10b981", valores: d?.serie.map((s) => s.ganhos) ?? [] }]} />
        </section>
      </div>

      <h3 className="ind-secao">Evolução do NPS</h3>
      <div className="ind-graficos">
        <section className="grafico">
          <h3><Star size={20} color="#f59e0b" /> Evolução do NPS</h3>
          <Grafico tipo="linha" rotulos={rot} series={[{ nome: `NPS ${marca.nomeExibido}`, cor: "#f59e0b", valores: d?.serie.map((s) => s.nps) ?? [] }]} />
        </section>
      </div>
    </>
  );
}
