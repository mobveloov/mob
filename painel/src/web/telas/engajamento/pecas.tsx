// Peças do Mapa de engajamento no formato da Machine, usadas na tela própria e na página inicial (Painel):
// seção de indicador (régua com os limites, cartões das três faixas, menu Ações, lista e ajuste de faixas).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CalendarDays, Car, ChevronDown, Clock, PauseCircle, Settings, Star, Tag, Timer, User, XCircle, MapPin } from "lucide-react";
import { Janela, msgErro } from "../corridas/comum";
import "./engajamento.css";

export type Papel = "motoristas" | "passageiros";
export interface Periodo { tipo: string; inicio?: string; fim?: string }
export interface Ind {
  id: string; rotulo: string; icone: string; nomes: [string, string, string]; esquema: "sem" | "inv" | "neu"; sufixo: string; passo: number; max: number; casas: number;
  periodoTipo: "dias" | "semanas" | "nenhum"; explicacao: string;
  a: number; b: number; periodo: Periodo; limites: [string, string, string];
  contagem: [number, number, number]; percentuais: [number, number, number]; total: number; conectados: [number, number, number];
  predominante: { indice: 0 | 1 | 2; nome: string; percentual: number } | null;
  barras: Array<{ de: number; ate: number; qtd: number; altura: number; faixa: 0 | 1 | 2 }>; escalaMax: number;
}
export interface Filtro { situacao?: string; categoria?: string }

export async function eng<T = any>(caminho: string, corpo?: unknown, metodo?: string): Promise<T> {
  const r = await fetch(`/api/engajamento${caminho}`, {
    method: metodo ?? (corpo !== undefined ? "POST" : "GET"), credentials: "same-origin", headers: { "Content-Type": "application/json" },
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { erro?: string }).erro || `Erro ${r.status}`);
  return j as T;
}

export const num = (n: number, casas = 1) => n.toLocaleString("pt-BR", { maximumFractionDigits: casas });
const ICONES: Record<string, typeof Star> = { schedule: Clock, timer: Timer, directions_car: Car, pause_circle_outline: PauseCircle, event: CalendarDays, star: Star, person: User, place: MapPin, cancel: XCircle, local_offer: Tag };
const COR = { sem: ["#c9376a", "#e8bc4a", "#45b3b0"], inv: ["#45b3b0", "#e8bc4a", "#c9376a"], neu: ["#cbd3da", "#9aa5b1", "#5a6b7d"] } as const;
export const corDe = (ind: Pick<Ind, "esquema">, i: number) => COR[ind.esquema][i];
const valor = (ind: Ind, v: number) => `${num(v, Math.max(ind.casas, ind.passo < 1 ? 1 : 0))}${ind.sufixo}`;

const PERIODOS_DIAS: Array<[string, string]> = [["7", "Últimos 7 dias"], ["15", "Últimos 15 dias"], ["30", "Últimos 30 dias"], ["90", "Últimos 90 dias"], ["personalizado", "Personalizado"]];
const PERIODOS_SEMANAS: Array<[string, string]> = [["1", "Última semana"], ["2", "Últimas 2 semanas"], ["3", "Últimas 3 semanas"], ["4", "Últimas 4 semanas"], ["8", "Últimas 8 semanas"], ["personalizado", "Personalizado"]];

// ------------------------------------------------------------------ régua (barras + marcas dos limites)

export function Regua({ ind, a, b, editavel, compacta, onMudar }: { ind: Ind; a: number; b: number; editavel?: boolean; compacta?: boolean; onMudar?: (a: number, b: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [arrastando, setArrastando] = useState<0 | 1 | null>(null);
  const pos = (v: number) => `${Math.max(0, Math.min(100, (v / ind.escalaMax) * 100))}%`;
  useEffect(() => {
    if (arrastando == null) return;
    const mover = (e: PointerEvent) => {
      const r = ref.current?.getBoundingClientRect();
      if (!r || !onMudar) return;
      const bruto = ((e.clientX - r.left) / r.width) * ind.escalaMax;
      const v = Math.max(0, Math.min(ind.max, Math.round(bruto / ind.passo) * ind.passo));
      const f = Math.round(v * 100) / 100;
      if (arrastando === 0) onMudar(Math.min(f, b - ind.passo), b); else onMudar(a, Math.max(f, a + ind.passo));
    };
    const soltar = () => setArrastando(null);
    window.addEventListener("pointermove", mover); window.addEventListener("pointerup", soltar);
    return () => { window.removeEventListener("pointermove", mover); window.removeEventListener("pointerup", soltar); };
  }, [arrastando, a, b, ind, onMudar]);
  const barras = ind.barras.map((x) => ({ ...x, faixa: (x.de + (x.ate - x.de) / 2 <= a ? 0 : x.de + (x.ate - x.de) / 2 <= b ? 1 : 2) as 0 | 1 | 2 }));
  return (
    <div ref={ref} className={`me-regua ${editavel ? "me-regua--editavel" : ""} ${compacta ? "me-regua--compacta" : ""}`}>
      <div className="me-regua__barras">
        {barras.map((x, i) => (
          <i key={i} className="me-regua__barra" style={{ height: `${x.altura}%`, background: corDe(ind, x.faixa) }} data-t={`${x.qtd} · ${num(x.de, 2)} a ${num(x.ate, 2)}${ind.sufixo}`} />
        ))}
      </div>
      <div className="me-regua__eixo" />
      {[a, b].map((v, k) => (
        <button key={k} type="button" className="me-regua__alca" style={{ left: pos(v) }} tabIndex={editavel ? 0 : -1} aria-hidden={!editavel} role="slider" aria-valuenow={v}
          onPointerDown={editavel ? (e) => { e.preventDefault(); setArrastando(k as 0 | 1); } : undefined}
          onKeyDown={editavel ? (e) => { const d = e.key === "ArrowRight" ? ind.passo : e.key === "ArrowLeft" ? -ind.passo : 0; if (d && onMudar) k === 0 ? onMudar(Math.max(0, Math.min(b - ind.passo, a + d)), b) : onMudar(a, Math.min(ind.max, Math.max(a + ind.passo, b + d))); } : undefined}>
          <s className="me-regua__alca-linha" /><u className="me-regua__alca-rotulo">{valor(ind, v)}</u>
        </button>
      ))}
    </div>
  );
}

function Rosca({ pct, cor }: { pct: number; cor: string }) {
  const r = 20, c = 2 * Math.PI * r;
  return (
    <svg className="me-rosca" viewBox="0 0 48 48" aria-hidden>
      <circle cx="24" cy="24" r={r} fill="none" stroke="var(--me-trilho)" strokeWidth="6" />
      <circle cx="24" cy="24" r={r} fill="none" stroke={cor} strokeWidth="6" strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 24 24)" />
    </svg>
  );
}

// ------------------------------------------------------------------ cartões das três faixas

type AcaoTipo = "ver" | "cupom" | "notificacao" | "mensagem" | "desafio" | "status";
const ROTULO_ACAO: Record<AcaoTipo, string> = { ver: "Ver", cupom: "Enviar cupom", notificacao: "Enviar notificação", mensagem: "Enviar mensagem", desafio: "Lançar desafio", status: "Alterar status" };

export function Cartoes({ papel, ind, filtro, podeAgir, onAcao, onFeito }: { papel: Papel; ind: Ind; filtro: Filtro; podeAgir: boolean; onAcao?: (t: AcaoTipo, faixa: number) => void; onFeito?: () => void }) {
  const [menu, setMenu] = useState<number | null>(null);
  const [acao, setAcao] = useState<{ tipo: AcaoTipo; faixa: number } | null>(null);
  const itens: AcaoTipo[] = papel === "motoristas" ? ["ver", "desafio", "notificacao", "mensagem", "status"] : ["ver", "cupom", "notificacao"];
  useEffect(() => {
    if (menu == null) return;
    const fora = () => setMenu(null);
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [menu]);
  return (
    <div className="oc me-oc"><div className="me-cartoes">
      {([0, 1, 2] as const).map((i) => (
        <div key={i} className="me-cartao" style={{ borderLeftColor: corDe(ind, i) }}>
          <div className="me-cartao__topo">
            <span className="me-ponto" style={{ background: corDe(ind, i) }} />
            <span className="me-cartao__nome"><b>{ind.nomes[i]}</b><em>{ind.limites[i]}</em></span>
            {podeAgir && (
              <span className="me-cartao__acoes" onMouseDown={(e) => e.stopPropagation()}>
                <button type="button" className="me-btn me-btn--sm" aria-expanded={menu === i} onClick={() => setMenu(menu === i ? null : i)}>Ações<span className="me-chevron" /></button>
                {menu === i && (
                  <div className="me-menu__painel">
                    {itens.map((t) => (
                      <button key={t} type="button" className="me-menu__item" onClick={() => { setMenu(null); setAcao({ tipo: t, faixa: i }); onAcao?.(t, i); }}>
                        {t === "ver" ? (papel === "motoristas" ? "Ver motoristas" : "Ver passageiros") : ROTULO_ACAO[t]}
                      </button>
                    ))}
                  </div>
                )}
              </span>
            )}
          </div>
          <div className="me-cartao__medida">
            <Rosca pct={ind.percentuais[i]} cor={corDe(ind, i)} />
            <div><p className="me-cartao__numero">{num(ind.contagem[i], 0)}</p><p className="me-cartao__percentual">{num(ind.percentuais[i], 1)}% do total</p></div>
          </div>
          {papel === "motoristas" && (
            <>
              <div className="me-cartao__barra"><i style={{ width: `${ind.contagem[i] ? (ind.conectados[i] / ind.contagem[i]) * 100 : 0}%` }} /></div>
              <div className="me-cartao__legenda">
                <span className="me-cartao__legenda-item--ativo"><b>{num(ind.conectados[i], 0)}</b> conectados</span>
                <span><b>{num(ind.contagem[i] - ind.conectados[i], 0)}</b> desconectados</span>
              </div>
            </>
          )}
        </div>
      ))}
      {acao && (acao.tipo === "ver"
        ? <ListaFaixa papel={papel} ind={ind} faixa={acao.faixa} filtro={filtro} onFechar={() => setAcao(null)} />
        : <ModalAcao papel={papel} ind={ind} faixa={acao.faixa} tipo={acao.tipo} filtro={filtro} onFechar={() => setAcao(null)} onFeito={() => { setAcao(null); onFeito?.(); }} />)}
    </div></div>
  );
}

const qsFiltro = (f: Filtro) => `${f.situacao !== undefined ? `&situacao=${encodeURIComponent(f.situacao)}` : ""}${f.categoria !== undefined ? `&categoria=${encodeURIComponent(f.categoria)}` : ""}`;

function ListaFaixa({ papel, ind, faixa, filtro, onFechar }: { papel: Papel; ind: Ind; faixa: number; filtro: Filtro; onFechar: () => void }) {
  const [d, setD] = useState<{ total: number; pessoas: Array<{ id: string; nome: string; telefone: string; conectado: boolean; valor: number }> } | null>(null);
  const [erro, setErro] = useState("");
  useEffect(() => { eng(`/lista?papel=${papel}&indicador=${ind.id}&faixa=${faixa}${qsFiltro(filtro)}`).then(setD).catch((e) => setErro(msgErro(e))); }, [papel, ind.id, faixa, filtro.situacao, filtro.categoria]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Janela onFechar={onFechar} titulo={`${papel === "motoristas" ? "Motoristas" : "Passageiros"}: ${ind.rotulo} · ${ind.nomes[faixa]} (${ind.limites[faixa]})`} sub={d ? `${num(d.total, 0)} ${papel === "motoristas" ? "motoristas" : "passageiros"} nesta faixa${d.total > 500 ? " (mostrando 500)" : ""}.` : undefined} nivel="alto">
      {erro && <p className="oc-aviso erro">{erro}</p>}
      {!d && !erro && <p className="oc-vazio">Carregando...</p>}
      {d && !d.pessoas.length && <p className="oc-vazio">Ninguém nesta faixa.</p>}
      {d && d.pessoas.length > 0 && (
        <div className="me-lista">
          <div className="me-lista__linha cab"><span>Nome</span><span>Telefone</span><span>{ind.rotulo}</span></div>
          {d.pessoas.map((p) => (
            <div key={p.id} className="me-lista__linha"><span>{p.nome}{p.conectado && <em className="me-online">conectado</em>}</span><span>{p.telefone || "—"}</span><span>{valor(ind, p.valor)}</span></div>
          ))}
        </div>
      )}
    </Janela>
  );
}

function ModalAcao({ papel, ind, faixa, tipo, filtro, onFechar, onFeito }: { papel: Papel; ind: Ind; faixa: number; tipo: AcaoTipo; filtro: Filtro; onFechar: () => void; onFeito: () => void }) {
  const [titulo, setTitulo] = useState(""), [texto, setTexto] = useState(""), [cupom, setCupom] = useState(""), [status, setStatus] = useState("Inativo");
  const [erro, setErro] = useState(""), [enviando, setEnviando] = useState(false);
  const total = ind.contagem[faixa];
  async function enviar() {
    setErro(""); setEnviando(true);
    try { await eng("/acao", { papel, indicador: ind.id, faixa, tipo, titulo, texto, cupom, status, situacao: filtro.situacao, categoria: filtro.categoria }); onFeito(); } catch (e) { setErro(msgErro(e)); } finally { setEnviando(false); }
  }
  const nome = `${ind.nomes[faixa]} (${ind.limites[faixa]})`;
  return (
    <Janela onFechar={onFechar} titulo={ROTULO_ACAO[tipo]} sub={`${num(total, 0)} ${papel === "motoristas" ? "motoristas" : "passageiros"} · ${ind.rotulo}: ${nome}`} tamanho="media" nivel="alto"
      rodape={<><button className="me-btn" onClick={onFechar}>Cancelar</button><button className="me-btn me-btn--primario" onClick={enviar} disabled={enviando || !total}>{enviando ? "Enviando..." : tipo === "status" ? "Alterar" : "Enviar"}</button></>}>
      {erro && <p className="oc-aviso erro">{erro}</p>}
      <div className="me-form">
        {tipo === "status" && (
          <label>Nova situação<select value={status} onChange={(e) => setStatus(e.target.value)}>{["Ativo", "Bloqueado", "Inativo", "Em análise", "Fila de espera"].map((s) => <option key={s}>{s}</option>)}</select></label>
        )}
        {(tipo === "notificacao" || tipo === "cupom" || tipo === "desafio") && <label>Título<input value={titulo} maxLength={60} onChange={(e) => setTitulo(e.target.value)} /></label>}
        {tipo === "cupom" && <label>Código do cupom<input value={cupom} maxLength={30} onChange={(e) => setCupom(e.target.value.toUpperCase())} /></label>}
        {tipo !== "status" && <label>{tipo === "desafio" ? "Descrição do desafio" : "Mensagem"}<textarea value={texto} maxLength={500} rows={4} onChange={(e) => setTexto(e.target.value)} placeholder="Use {nome} para o primeiro nome." /></label>}
        {tipo === "status" && <p className="me-nota">A situação de {num(total, 0)} motoristas será alterada. Só o administrador pode fazer isto.</p>}
      </div>
    </Janela>
  );
}

// ------------------------------------------------------------------ ajustar faixas

export function AjustarFaixas({ papel, ind, podeSalvar, onFechar, onSalvo }: { papel: Papel; ind: Ind; podeSalvar: boolean; onFechar: () => void; onSalvo: () => void }) {
  const [a, setA] = useState(ind.a), [b, setB] = useState(ind.b);
  const [periodo, setPeriodo] = useState<Periodo>(ind.periodo.tipo === "nenhum" ? { tipo: "nenhum" } : { tipo: ind.periodo.tipo, inicio: ind.periodo.inicio, fim: ind.periodo.fim });
  const [erro, setErro] = useState(""), [salvando, setSalvando] = useState(false);
  const lista = ind.periodoTipo === "dias" ? PERIODOS_DIAS : PERIODOS_SEMANAS;
  const n2 = ind.nomes[2].toLowerCase();
  async function aplicar() {
    setErro(""); setSalvando(true);
    try { await eng("/config", { papel, indicador: ind.id, a, b, periodo }, "PUT"); onSalvo(); } catch (e) { setErro(msgErro(e)); } finally { setSalvando(false); }
  }
  const campo = (v: number, set: (n: number) => void, min: number, max: number) => (
    <input className="me-config__input" type="number" step={ind.passo} min={min} max={max} value={v} onChange={(e) => set(Number(e.target.value))} />
  );
  return (
    <div className="me-modal me-modal--aberto" role="dialog" aria-modal="true">
      <button type="button" className="me-modal__fundo" aria-label="Fechar" tabIndex={-1} onClick={onFechar} />
      <div className="me-modal__caixa">
        <div className="me-config">
          {erro && <p className="oc-aviso erro" style={{ margin: 12 }}>{erro}</p>}
          <div className="me-config__secao">
            <p className="me-config__titulo">O que este número significa</p>
            <p className="me-config__texto">{ind.explicacao}</p>
            {ind.periodoTipo !== "nenhum" && (
              <div className="me-config__linha">
                <div><label className="me-config__label">Período</label>
                  <select className="me-config__select" value={periodo.tipo} onChange={(e) => setPeriodo({ ...periodo, tipo: e.target.value })}>{lista.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></div>
                {periodo.tipo === "personalizado" && <>
                  <div><label className="me-config__label">De</label><input className="me-config__select" type="date" value={periodo.inicio ?? ""} onChange={(e) => setPeriodo({ ...periodo, inicio: e.target.value })} /></div>
                  <div><label className="me-config__label">Até</label><input className="me-config__select" type="date" value={periodo.fim ?? ""} onChange={(e) => setPeriodo({ ...periodo, fim: e.target.value })} /></div>
                </>}
              </div>
            )}
          </div>
          <div className="me-config__secao">
            <p className="me-config__titulo">Como dividir em faixas</p>
            <p className="me-config__texto">Você escolhe dois valores e eles criam as três faixas. Pode arrastar as marcas em cima do gráfico ou digitar os números. O campo de {n2} não é editável porque essa faixa começa exatamente onde o segundo valor termina.</p>
            <Regua ind={ind} a={a} b={b} editavel onMudar={(x, y) => { setA(x); setB(y); }} />
            <div className="me-config__linha" style={{ marginTop: 14 }}>
              <div><label className="me-config__label">{ind.nomes[0]} até</label>{campo(a, setA, 0, b)}</div>
              <div><label className="me-config__label">{ind.nomes[1]} até</label>{campo(b, setB, a, ind.max)}</div>
              <div><label className="me-config__label">{ind.nomes[2]} acima de</label><input className="me-config__input" type="number" value={b} disabled readOnly /></div>
            </div>
          </div>
          <div className="me-config__rodape">
            {!podeSalvar && <span className="me-nota" style={{ marginRight: "auto" }}>Só o administrador salva.</span>}
            <button type="button" className="me-btn" onClick={onFechar}>Cancelar</button>
            <button type="button" className="me-btn me-btn--primario" onClick={aplicar} disabled={!podeSalvar || salvando}>{salvando ? "Salvando..." : "Aplicar"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ seção do indicador

export function Explicacao({ ind }: { ind: Ind }) {
  return <div className="me-secao__coluna-explicacao"><p className="me-secao__explicacao-titulo">O que este número significa</p><p className="me-secao__explicacao-texto">{ind.explicacao}</p></div>;
}

export function CorpoIndicador({ papel, ind, filtro, podeAgir, podeSalvar, compacta, onMudou }: { papel: Papel; ind: Ind; filtro: Filtro; podeAgir: boolean; podeSalvar: boolean; compacta?: boolean; onMudou: () => void }) {
  const [ajustando, setAjustando] = useState(false);
  return (
    <>
      <div className="me-secao__grafico">
        <div className="me-secao__coluna-grafico">
          <div className="me-secao__acao-topo">
            <p className="me-secao__rotulo">Como os {papel === "motoristas" ? "motoristas" : "passageiros"} se distribuem</p>
            {!compacta && <button type="button" className="me-btn me-btn--sm" onClick={() => setAjustando(true)}><Settings size={16} />Ajustar faixas</button>}
          </div>
          <Regua ind={ind} a={ind.a} b={ind.b} compacta={compacta} editavel={false} />
        </div>
        <Explicacao ind={ind} />
      </div>
      <Cartoes papel={papel} ind={ind} filtro={filtro} podeAgir={podeAgir} onFeito={onMudou} />
      {ajustando && <AjustarFaixas papel={papel} ind={ind} podeSalvar={podeSalvar} onFechar={() => setAjustando(false)} onSalvo={() => { setAjustando(false); onMudou(); }} />}
    </>
  );
}

export function Secao({ papel, ind, aberta, onAlternar, filtro, podeAgir, podeSalvar, onMudou }: { papel: Papel; ind: Ind; aberta: boolean; onAlternar: () => void; filtro: Filtro; podeAgir: boolean; podeSalvar: boolean; onMudou: () => void }) {
  const Icone = ICONES[ind.icone] ?? Star;
  return (
    <section className="me-secao">
      <button type="button" className="me-secao__cabecalho" aria-expanded={aberta} onClick={onAlternar}>
        <span className="me-secao__icone"><Icone size={19} /></span>
        <span className="me-secao__titulo">{ind.rotulo}</span>
        <span className="me-secao__faixa">{([0, 1, 2] as const).map((i) => <i key={i} className="me-secao__faixa-segmento" style={{ width: `${ind.percentuais[i]}%`, background: corDe(ind, i) }} />)}</span>
        <span className="me-secao__status">{ind.predominante ? <span className="me-pill" style={{ background: `${corDe(ind, ind.predominante.indice)}26`, color: corTexto(ind, ind.predominante.indice) }}>{ind.predominante.nome} {num(ind.predominante.percentual, 1)}%</span> : <span className="me-pill me-pill--vazio">Sem dados</span>}</span>
        <span className={`me-secao__seta ${aberta ? "me-secao__seta--aberta" : ""}`}><ChevronDown size={20} /></span>
      </button>
      {aberta && <div className="me-secao__corpo"><CorpoIndicador papel={papel} ind={ind} filtro={filtro} podeAgir={podeAgir} podeSalvar={podeSalvar} onMudou={onMudou} /></div>}
    </section>
  );
}

const TEXTO: Record<string, string> = { "#c9376a": "#a82a55", "#45b3b0": "#2b7f7c", "#e8bc4a": "#8a6a0f", "#cbd3da": "#465361", "#9aa5b1": "#465361", "#5a6b7d": "#465361" };
const corTexto = (ind: Ind, i: number) => TEXTO[corDe(ind, i)] ?? "inherit";

export type { ReactNode };
