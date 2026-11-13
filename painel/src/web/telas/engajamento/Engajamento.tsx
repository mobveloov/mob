// Mapa de engajamento: mapa (Leaflet + OpenStreetMap) com as abas Motoristas, Passageiros e Histórico, seis indicadores
// classificados em Bom, Aceitável e Ruim e o ajuste das faixas e do período (salvo por empresa).
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronDown, ChevronUp, MapPin, Settings2, Smartphone, Star, Tag, User, XCircle, Map as IconeMapa } from "lucide-react";
import { useSessao } from "../../App";
import { Aviso, GRUPO_CLASSE, Janela, L, Selo, msgErro, useDados, useMapa } from "../corridas/comum";
import "./engajamento.css";

type Classe = "bom" | "aceitavel" | "ruim";
type IdInd = "solicitacoes" | "frequencia" | "cancelamento" | "estimativas" | "avaliacoes" | "tempoCasa";
type Aba = "motoristas" | "passageiros" | "historico";
interface Faixa { bom: number; aceitavel: number }
interface Periodo { tipo: "7" | "15" | "30" | "90" | "personalizado"; inicio?: string; fim?: string }
interface Indicador {
  id: IdInd; rotulo: string; unidade: string; sentido: "menor" | "maior"; explicacao: string; passo: number; max: number; faixa: Faixa;
  contagem: Record<Classe, number>; total: number; predominante: { classe: Classe; percentual: number } | null;
  histograma: Array<{ de: number; ate: number; qtd: number }>;
}
interface Ponto { id: string; nome: string; lat: number | null; lng: number | null; corridas: number; valores: Partial<Record<IdInd, number>>; classes: Partial<Record<IdInd, Classe>> }
interface Mapa { periodo: Periodo & { inicio: string; fim: string; dias: number }; indicadores: Indicador[]; pontos: Ponto[]; total: number; semPosicao: number }
interface Historico {
  periodo: Periodo & { inicio: string; fim: string; dias: number };
  serie: Array<{ dia: string; pedidas: number; finalizadas: number; canceladas: number; passageirosAtivos: number; passageirosNovos: number }>;
  pontos: Array<{ id: string; os: string; status: string; em: string; lat: number; lng: number }>;
  totais: { pedidas: number; finalizadas: number; canceladas: number; passageiros: number; taxaFinalizacao: number | null };
}
interface Config { periodo: Periodo; faixas: Record<"motoristas" | "passageiros", Record<IdInd, Faixa>>; padrao: Record<"motoristas" | "passageiros", Record<IdInd, Faixa>> }

const COR: Record<Classe, string> = { bom: "#22c55e", aceitavel: "#f59e0b", ruim: "#ef4444" };
const ROTULO: Record<Classe, string> = { bom: "Bom", aceitavel: "Aceitável", ruim: "Ruim" };
const CLASSES: Classe[] = ["bom", "aceitavel", "ruim"];
const ICONE: Record<IdInd, typeof Star> = { solicitacoes: MapPin, frequencia: CalendarDays, cancelamento: XCircle, estimativas: Tag, avaliacoes: Star, tempoCasa: User };
const PERIODOS: Array<[Periodo["tipo"], string]> = [["7", "Últimos 7 dias"], ["15", "Últimos 15 dias"], ["30", "Últimos 30 dias"], ["90", "Últimos 90 dias"], ["personalizado", "Personalizado"]];
const COR_STATUS: Record<string, string> = { finalizada: "#22c55e", cancelada: "#ef4444", nao_atendida: "#f59e0b" };
const STATUS_TEXTO: Record<string, string> = { finalizada: "Finalizada", cancelada: "Cancelada", nao_atendida: "Não atendida", procurando: "Procurando motorista", a_caminho: "Motorista a caminho", no_local: "Motorista no local", em_andamento: "Em andamento" };

const dataBr = (iso: string) => iso.split("-").reverse().join("/");
const num = (n: number, c = 1) => n.toLocaleString("pt-BR", { maximumFractionDigits: c });
const pct = (n: number) => `${num(n)}%`;
const valorTexto = (i: Indicador, v: number) => `${num(v, i.passo < 1 ? 1 : 0)}${i.unidade === "%" ? "%" : ` ${i.unidade}`}`;

async function eng<T>(caminho: string, corpo?: unknown, metodo?: string): Promise<T> {
  const r = await fetch(`/api/engajamento${caminho}`, {
    method: metodo ?? (corpo !== undefined ? "POST" : "GET"), credentials: "same-origin", headers: { "Content-Type": "application/json" },
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { erro?: string }).erro || `Erro ${r.status}`);
  return j as T;
}

/** Texto da faixa de cada classe, no jeito de falar da referência ("≤ 8%", "> 8 – 30%", "> 30%"). */
function textoFaixa(i: Indicador, c: Classe): string {
  const u = i.unidade === "%" ? "%" : "";
  const { bom, aceitavel } = i.faixa;
  if (i.sentido === "menor") return c === "bom" ? `≤ ${num(bom)}${u}` : c === "aceitavel" ? `> ${num(bom)} – ${num(aceitavel)}${u}` : `> ${num(aceitavel)}${u}`;
  return c === "bom" ? `≥ ${num(bom)}${u}` : c === "aceitavel" ? `≥ ${num(aceitavel)} e < ${num(bom)}${u}` : `< ${num(aceitavel)}${u}`;
}

export default function Engajamento() {
  const { sessao } = useSessao();
  const podeAjustar = sessao.usuario.papel !== "operador";
  const [aba, setAba] = useState<Aba>("passageiros");
  const [aberto, setAberto] = useState<IdInd>("cancelamento");
  const [filtro, setFiltro] = useState<Classe | "">("");
  const [visao, setVisao] = useState<"filtro" | "app">("filtro");
  const [ajustando, setAjustando] = useState(false);
  const papel = aba === "historico" ? null : aba;
  const mapaDados = useDados<Mapa | null>(() => (papel ? eng<Mapa>(`/mapa?papel=${papel}`) : Promise.resolve(null)), [papel]);
  const histDados = useDados<Historico | null>(() => (aba === "historico" ? eng<Historico>("/historico") : Promise.resolve(null)), [aba]);
  const config = useDados<Config>(() => eng<Config>("/config"), []);
  const erro = mapaDados.erro || histDados.erro || config.erro;
  const periodo = mapaDados.dados?.periodo ?? histDados.dados?.periodo;

  const recarregarTudo = () => { mapaDados.recarregar(); histDados.recarregar(); config.recarregar(); };
  const trocarAba = (a: Aba) => { setAba(a); setFiltro(""); };

  return (
    <div className="oc eng">
      <div className="oc-topo">
        <h1>Mapa de engajamento <small>{periodo ? `${dataBr(periodo.inicio)} a ${dataBr(periodo.fim)}` : "carregando..."}</small></h1>
        <div className="oc-fila">
          <button className="oc-btn" onClick={() => setAjustando(true)} disabled={!config.dados}><Settings2 size={16} /> Ajustar faixas</button>
        </div>
      </div>
      <Aviso texto={erro} erro />
      <div className="oc-abas" role="tablist">
        {([["motoristas", "Motoristas"], ["passageiros", "Passageiros"], ["historico", "Histórico"]] as Array<[Aba, string]>).map(([id, nome]) => (
          <button key={id} role="tab" aria-selected={aba === id} className={aba === id ? "on" : ""} onClick={() => trocarAba(id)}>{nome}</button>
        ))}
      </div>
      {papel && mapaDados.dados && (
        <PainelPapel papel={papel} dados={mapaDados.dados} aberto={aberto} setAberto={setAberto} filtro={filtro} setFiltro={setFiltro} visao={visao} setVisao={setVisao} />
      )}
      {papel && !mapaDados.dados && !erro && <p className="oc-vazio">Carregando...</p>}
      {aba === "historico" && histDados.dados && <PainelHistorico h={histDados.dados} />}
      {ajustando && config.dados && (
        <AjustarFaixas
          config={config.dados} papel={papel ?? "passageiros"} indicadorInicial={aberto} podeSalvar={podeAjustar}
          onFechar={() => setAjustando(false)} onSalvo={() => { setAjustando(false); recarregarTudo(); }}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ motoristas e passageiros

function PainelPapel({ papel, dados, aberto, setAberto, filtro, setFiltro, visao, setVisao }: {
  papel: "motoristas" | "passageiros"; dados: Mapa; aberto: IdInd; setAberto: (i: IdInd) => void;
  filtro: Classe | ""; setFiltro: (c: Classe | "") => void; visao: "filtro" | "app"; setVisao: (v: "filtro" | "app") => void;
}) {
  const atual = dados.indicadores.find((i) => i.id === aberto) ?? dados.indicadores[0];
  const quem = papel === "passageiros" ? "passageiros" : "motoristas";
  return (
    <div className="eng-grade">
      <div className="eng-lateral">
        <div className="oc-card eng-titulo"><strong>{num(dados.total, 0)}</strong><span>{papel === "passageiros" ? "Passageiros" : "Motoristas"} com atividade</span></div>
        {dados.indicadores.map((i) => {
          const Icone = ICONE[i.id];
          const exp = i.id === atual.id;
          return (
            <div key={i.id} className={`oc-card eng-ind ${exp ? "aberto" : ""}`}>
              <button className="eng-ind-topo" onClick={() => setAberto(i.id)} aria-expanded={exp}>
                <Icone size={18} />
                <span className="eng-ind-nome">{i.rotulo}</span>
                {i.predominante ? <span className={`eng-selo ${i.predominante.classe}`}>{ROTULO[i.predominante.classe]} {pct(i.predominante.percentual)}</span> : <span className="eng-selo vazio">Sem dados</span>}
                {exp ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {exp && (
                <div className="eng-ind-corpo">
                  <p className="eng-explica"><b>O que este número significa</b><br />{i.explicacao}</p>
                  <p className="eng-explica"><b>Como os {quem} se distribuem</b></p>
                  {CLASSES.map((c) => {
                    const n = i.contagem[c];
                    const fatia = i.total ? (n / i.total) * 100 : 0;
                    return (
                      <div key={c} className={`eng-faixa ${filtro === c ? "on" : ""}`}>
                        <div className="eng-faixa-topo"><i style={{ background: COR[c] }} /><strong>{ROTULO[c]}</strong><span className="eng-limite">{textoFaixa(i, c)}</span></div>
                        <div className="eng-barra"><div style={{ width: `${fatia}%`, background: COR[c] }} /></div>
                        <div className="eng-faixa-pe">
                          <span>{num(n, 0)} · {pct(fatia)} do total</span>
                          <button className="oc-btn peq" disabled={!n} onClick={() => setFiltro(filtro === c ? "" : c)}>{filtro === c ? "Limpar filtro" : "Ver no mapa"}</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="eng-central">
        <div className="oc-card eng-barra-mapa">
          <div className="eng-visao" role="group" aria-label="Tipo de mapa">
            <button className={`oc-chip ${visao === "filtro" ? "on" : ""}`} onClick={() => setVisao("filtro")}><IconeMapa size={13} /> Mapa de filtro</button>
            <button className={`oc-chip ${visao === "app" ? "on" : ""}`} onClick={() => setVisao("app")}><Smartphone size={13} /> Mapa do aplicativo</button>
          </div>
          <div className="eng-legenda">
            {CLASSES.map((c) => (
              <button key={c} className={`oc-chip ${filtro === c ? "on" : ""}`} onClick={() => setFiltro(filtro === c ? "" : c)}><i style={{ background: COR[c] }} /> {ROTULO[c]} ({num(atual.contagem[c], 0)})</button>
            ))}
          </div>
        </div>
        <p className="eng-nota">
          {visao === "filtro"
            ? `Cada ponto é um ${papel === "passageiros" ? "passageiro" : "motorista"}, colorido pela faixa de "${atual.rotulo}". Use as faixas para filtrar.`
            : `Visão do aplicativo: regiões de cerca de 1 km com a faixa predominante de "${atual.rotulo}", como a demanda aparece no app.`}
          {dados.semPosicao > 0 && ` ${dados.semPosicao} sem posição conhecida (ainda sem corrida com endereço).`}
        </p>
        <div className="oc-card" style={{ padding: 0, overflow: "hidden" }}>
          <MapaPontos pontos={dados.pontos} indicador={atual} filtro={filtro} visao={visao} />
        </div>
      </div>
    </div>
  );
}

function MapaPontos({ pontos, indicador, filtro, visao }: { pontos: Ponto[]; indicador: Indicador; filtro: Classe | ""; visao: "filtro" | "app" }) {
  const { ref, mapa } = useMapa([-15.78, -47.93], 4);
  const camada = useRef<L.LayerGroup | null>(null);
  const ajustou = useRef(false);
  const lista = useMemo(() => pontos.filter((p) => p.lat != null && p.lng != null && p.classes[indicador.id] && (!filtro || p.classes[indicador.id] === filtro)), [pontos, indicador.id, filtro]);

  useEffect(() => {
    if (!mapa) return;
    camada.current?.remove();
    const g = L.layerGroup().addTo(mapa);
    camada.current = g;
    if (visao === "filtro") {
      for (const p of lista) {
        const c = p.classes[indicador.id]!;
        L.circleMarker([p.lat!, p.lng!], { radius: 8, color: "#0b1121", weight: 1.5, fillColor: COR[c], fillOpacity: 0.9 })
          .bindPopup(`<b>${esc(p.nome)}</b><br>${esc(indicador.rotulo)}: ${esc(valorTexto(indicador, p.valores[indicador.id]!))} (${ROTULO[c]})<br><small>${p.corridas} corrida(s) no período</small>`).addTo(g);
      }
    } else {
      const celulas = new Map<string, { lat: number; lng: number; n: Record<Classe, number> }>();
      for (const p of lista) {
        const k = `${Math.round(p.lat! / 0.01)}:${Math.round(p.lng! / 0.01)}`;
        const c = celulas.get(k) ?? { lat: Math.round(p.lat! / 0.01) * 0.01, lng: Math.round(p.lng! / 0.01) * 0.01, n: { bom: 0, aceitavel: 0, ruim: 0 } };
        c.n[p.classes[indicador.id]!]++;
        celulas.set(k, c);
      }
      for (const c of celulas.values()) {
        const total = c.n.bom + c.n.aceitavel + c.n.ruim;
        const dom = CLASSES.reduce((a, x) => (c.n[x] > c.n[a] ? x : a), "bom" as Classe);
        L.circle([c.lat, c.lng], { radius: 550, color: COR[dom], weight: 1, fillColor: COR[dom], fillOpacity: Math.min(0.75, 0.25 + total * 0.1) })
          .bindPopup(`<b>${total} ${total === 1 ? "pessoa" : "pessoas"} nesta região</b><br>Bom: ${c.n.bom} · Aceitável: ${c.n.aceitavel} · Ruim: ${c.n.ruim}`).addTo(g);
      }
    }
    if (lista.length && !ajustou.current) {
      mapa.fitBounds(L.latLngBounds(lista.map((p) => [p.lat!, p.lng!] as [number, number])).pad(0.3), { maxZoom: 14 });
      ajustou.current = true;
    }
  }, [mapa, lista, indicador, visao]);

  return <div ref={ref} className="oc-mapa eng-mapa" role="region" aria-label="Mapa de engajamento" />;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// ------------------------------------------------------------------ histórico

function PainelHistorico({ h }: { h: Historico }) {
  const t = h.totais;
  const maximo = Math.max(1, ...h.serie.map((s) => s.pedidas));
  const passo = Math.max(1, Math.ceil(h.serie.length / 10));
  const kpi = (r: string, v: string, tom = "") => <div className={`oc-kpi ${tom}`}><span>{r}</span><strong>{v}</strong></div>;
  return (
    <>
      <div className="oc-kpis">
        {kpi("Corridas pedidas", num(t.pedidas, 0))}{kpi("Finalizadas", num(t.finalizadas, 0), "ok")}{kpi("Canceladas", num(t.canceladas, 0), "ruim")}
        {kpi("Passageiros", num(t.passageiros, 0), "info")}{kpi("Taxa de finalização", t.taxaFinalizacao == null ? "—" : pct(t.taxaFinalizacao))}
      </div>
      <div className="oc-card">
        <h3>Dia a dia do período</h3>
        {t.pedidas === 0 ? <p className="oc-vazio">Nenhuma corrida no período.</p> : (
          <div className="eng-dias" role="img" aria-label="Corridas pedidas por dia">
            {h.serie.map((s, i) => (
              <div key={s.dia} className="eng-dia" title={`${dataBr(s.dia)}: ${s.pedidas} pedidas, ${s.finalizadas} finalizadas, ${s.canceladas} canceladas, ${s.passageirosNovos} passageiros novos`}>
                <div className="eng-dia-barra"><div className="eng-dia-ped" style={{ height: `${(s.pedidas / maximo) * 100}%` }}><div className="eng-dia-fin" style={{ height: s.pedidas ? `${(s.finalizadas / s.pedidas) * 100}%` : 0 }} /></div></div>
                <span>{i % passo === 0 ? s.dia.slice(8, 10) + "/" + s.dia.slice(5, 7) : ""}</span>
              </div>
            ))}
          </div>
        )}
        <p className="eng-nota">Barra clara: pedidas. Parte verde: finalizadas. Passe o mouse para ver os números do dia.</p>
      </div>
      <div className="oc-card" style={{ padding: 0, overflow: "hidden" }}><MapaHistorico pontos={h.pontos} /></div>
    </>
  );
}

function MapaHistorico({ pontos }: { pontos: Historico["pontos"] }) {
  const { ref, mapa } = useMapa([-15.78, -47.93], 4);
  const ajustou = useRef(false);
  useEffect(() => {
    if (!mapa) return;
    const g = L.layerGroup().addTo(mapa);
    for (const p of pontos) {
      L.circleMarker([p.lat, p.lng], { radius: 6, color: "#0b1121", weight: 1, fillColor: COR_STATUS[p.status] ?? "#3b82f6", fillOpacity: 0.85 })
        .bindPopup(`OS ${esc(p.os)}<br>${esc(STATUS_TEXTO[p.status] ?? p.status)}<br><small>${esc(p.em.slice(8, 10) + "/" + p.em.slice(5, 7) + " " + p.em.slice(11, 16))}</small>`).addTo(g);
    }
    if (pontos.length && !ajustou.current) { mapa.fitBounds(L.latLngBounds(pontos.map((p) => [p.lat, p.lng] as [number, number])).pad(0.3), { maxZoom: 14 }); ajustou.current = true; }
    return () => { g.remove(); };
  }, [mapa, pontos]);
  return <div ref={ref} className="oc-mapa eng-mapa" role="region" aria-label="Mapa de embarques do período" />;
}

// ------------------------------------------------------------------ ajustar faixas

function AjustarFaixas({ config, papel, indicadorInicial, podeSalvar, onFechar, onSalvo }: {
  config: Config; papel: "motoristas" | "passageiros"; indicadorInicial: IdInd; podeSalvar: boolean; onFechar: () => void; onSalvo: () => void;
}) {
  const [qual, setQual] = useState<"motoristas" | "passageiros">(papel);
  const [ind, setInd] = useState<IdInd>(indicadorInicial);
  const [periodo, setPeriodo] = useState<Periodo>(config.periodo);
  const [faixas, setFaixas] = useState(() => JSON.parse(JSON.stringify(config.faixas)) as Config["faixas"]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const resumo = useDados<Mapa>(() => eng<Mapa>(`/mapa?papel=${qual}`), [qual]);
  const def = resumo.dados?.indicadores.find((i) => i.id === ind);
  const f = faixas[qual][ind];

  const mudar = (campo: keyof Faixa, v: number) => setFaixas((a) => ({ ...a, [qual]: { ...a[qual], [ind]: { ...a[qual][ind], [campo]: v } } }));
  const restaurar = () => setFaixas((a) => ({ ...a, [qual]: { ...a[qual], [ind]: { ...config.padrao[qual][ind] } } }));

  async function aplicar() {
    setErro(null); setSalvando(true);
    try {
      await eng("/config", { periodo }, "PUT");
      await eng("/config", { papel: qual, faixas: faixas[qual] }, "PUT");
      onSalvo();
    } catch (e) { setErro(msgErro(e)); } finally { setSalvando(false); }
  }

  const menor = def?.sentido === "menor";
  const maxHist = Math.max(1, ...(def?.histograma.map((b) => b.qtd) ?? [1]));
  const topo = def?.max ?? 100;
  return (
    <Janela
      onFechar={onFechar} titulo="Ajustar faixas" tamanho="media" sub="Escolha o período e os limites de Bom, Aceitável e Ruim. Vale para a empresa toda."
      rodape={<><button className="oc-btn" onClick={onFechar}>Cancelar</button><button className="oc-btn pri" onClick={aplicar} disabled={!podeSalvar || salvando}>{salvando ? "Salvando..." : "Aplicar"}</button></>}
    >
      <Aviso texto={erro} erro />
      {!podeSalvar && <Aviso texto="Só o administrador pode salvar as faixas. Você pode simular os valores, mas eles não serão gravados." />}
      <div className="oc-grid2 eng-ajuste">
        <label className="oc-l">Período
          <select value={periodo.tipo} onChange={(e) => setPeriodo({ ...periodo, tipo: e.target.value as Periodo["tipo"] })}>{PERIODOS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select>
        </label>
        <label className="oc-l">Quem
          <select value={qual} onChange={(e) => setQual(e.target.value as "motoristas" | "passageiros")}><option value="passageiros">Passageiros</option><option value="motoristas">Motoristas</option></select>
        </label>
        {periodo.tipo === "personalizado" && <>
          <label className="oc-l">De<input type="date" value={periodo.inicio ?? ""} onChange={(e) => setPeriodo({ ...periodo, inicio: e.target.value })} /></label>
          <label className="oc-l">Até<input type="date" value={periodo.fim ?? ""} onChange={(e) => setPeriodo({ ...periodo, fim: e.target.value })} /></label>
        </>}
      </div>
      <div className="eng-abas-ind" role="tablist">
        {(resumo.dados?.indicadores ?? []).map((i) => <button key={i.id} className={`oc-chip ${i.id === ind ? "on" : ""}`} onClick={() => setInd(i.id)}>{i.rotulo}</button>)}
      </div>
      {def && (
        <>
          <p className="eng-explica"><b>Como dividir em faixas</b><br />Você escolhe dois valores e eles criam as três faixas. Pode arrastar as marcas ou digitar os números. O campo de ruim não é editável porque essa faixa começa exatamente onde o segundo valor termina.</p>
          <div className="eng-hist" aria-label="Quantidade de pessoas por valor">
            {def.histograma.length === 0 ? <p className="oc-vazio">Sem dados no período para desenhar o gráfico.</p> : def.histograma.map((b, i) => {
              const meio = (b.de + b.ate) / 2;
              const c = classificarLocal(def.sentido, f, meio);
              return <div key={i} className="eng-hist-col" title={`${num(b.de, 1)} a ${num(b.ate, 1)}: ${b.qtd}`}><div style={{ height: `${(b.qtd / maxHist) * 100}%`, background: COR[c] }} /></div>;
            })}
          </div>
          <div className="eng-sliders">
            <label className="oc-l">{menor ? "Bom até" : "Bom a partir de"}
              <input type="range" min={0} max={topo} step={def.passo} value={f.bom} onChange={(e) => mudar("bom", Number(e.target.value))} />
              <input type="number" min={0} max={topo} step={def.passo} value={f.bom} onChange={(e) => mudar("bom", Number(e.target.value))} />
            </label>
            <label className="oc-l">{menor ? "Aceitável até" : "Aceitável a partir de"}
              <input type="range" min={0} max={topo} step={def.passo} value={f.aceitavel} onChange={(e) => mudar("aceitavel", Number(e.target.value))} />
              <input type="number" min={0} max={topo} step={def.passo} value={f.aceitavel} onChange={(e) => mudar("aceitavel", Number(e.target.value))} />
            </label>
            <label className="oc-l">{menor ? "Ruim acima de" : "Ruim abaixo de"}
              <input type="number" value={f.aceitavel} readOnly disabled />
            </label>
          </div>
          <div className="eng-previa">
            {CLASSES.map((c) => <Selo key={c} tom={GRUPO_CLASSE[c === "bom" ? "finalizada" : c === "ruim" ? "cancelada" : "nao_atendida"]}>{ROTULO[c]}: {textoFaixa({ ...def, faixa: f }, c)}</Selo>)}
          </div>
          <button className="oc-btn peq" onClick={restaurar}>Restaurar valores padrão deste indicador</button>
        </>
      )}
    </Janela>
  );
}

function classificarLocal(sentido: "menor" | "maior", f: Faixa, v: number): Classe {
  if (sentido === "menor") return v <= f.bom ? "bom" : v <= f.aceitavel ? "aceitavel" : "ruim";
  return v >= f.bom ? "bom" : v >= f.aceitavel ? "aceitavel" : "ruim";
}
