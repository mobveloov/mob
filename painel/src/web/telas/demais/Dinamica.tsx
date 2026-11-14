// Config › Tarifas dinâmicas no formato da Machine: mapa com áreas manuais e automáticas, automações, legenda, interruptor por área
// e prioridade entre as dinâmicas. Regras sem área (horário e alta demanda) ficam numa aba própria.

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Pencil, Plus, Trash2, Zap } from "lucide-react";
import { Aviso, Cab, Campo, Carregando, Interruptor, Modal, dinheiro, pedirConfig, useAdmin, useCarregar, useSalvar } from "./comum";

const num = (v: string) => (v === "" ? 0 : Number(String(v).replace(/\./g, "").replace(",", ".")) || 0);
const txt = (n: number | null | undefined) => (n == null || n === 0 ? "" : String(n).replace(".", ","));

// ------------------------------------------------------------------ Tarifas Dinâmicas

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
type TipoDin = "mapa" | "horario" | "demanda";

type Aba = "automaticas" | "manuais" | "sem_area";
const ABAS: Array<[Aba, string]> = [["manuais", "Manuais"], ["automaticas", "Automáticas"], ["sem_area", "Sem área"]];
const COR_NIVEL: Record<number, string> = { 1: "#f59e0b", 2: "#f97316", 3: "#dc2626" };

/** "+R$ 5,00", "1,3x" ou "+20%": o mesmo texto que a Machine mostra na etiqueta da área. */
export function valorDinamica(r: { cobranca: string; valor: number }) {
  return r.cobranca === "fixo" ? `+${dinheiro(r.valor)}` : r.cobranca === "multiplicador" ? `${String(r.valor).replace(".", ",")}x` : `+${String(r.valor).replace(".", ",")}%`;
}

export function TarifasDinamicas() {
  const admin = useAdmin();
  const [aba, setAba] = useState<Aba>("manuais");
  const [legenda, setLegenda] = useState(true);
  const [guia, setGuia] = useState(true);
  const d = useCarregar(() => pedirConfig("/dinamicas"), []);
  const [edit, setEdit] = useState<any>(null);
  const [auto, setAuto] = useState<any>(null);
  const [mostraAutomacoes, setMostraAutomacoes] = useState(false);
  const { msg, salvar } = useSalvar();
  const dados = d.dados;
  const regras: any[] = dados?.regras ?? [];
  const manuais = regras.filter((r) => r.tipo === "mapa");
  const semArea = regras.filter((r) => r.tipo !== "mapa");
  const automaticas: any[] = dados?.automaticas ?? [];
  const nova = (tipo: string) => setEdit({ tipo, nome: "", cidade: "", cobranca: "percentual", valor: 0, minimo: 0, poligono: [], janelas: [], gatilho: 10, ativa: true });
  const titulo = aba === "manuais" ? "Exibindo as áreas manuais da sua central" : aba === "automaticas" ? "Exibindo as áreas automáticas abertas agora" : "Dinâmicas sem área (horário e alta demanda)";
  const ativar = (url: string, v: boolean, depois = "Salvo.") => salvar(async () => { await pedirConfig(url, "POST", { ativa: v }); d.recarregar(); }, depois);
  return (
    <>
      <Cab titulo="Tarifas dinâmicas" sub="Multiplicadores de preço por área, horário e demanda">
        <button className="botao" onClick={() => setMostraAutomacoes(true)}><Zap size={14} /> Automações</button>
        <button className="botao" aria-pressed={legenda} onClick={() => setLegenda(!legenda)}>Legenda</button>
        {admin && <button className="botao primario" onClick={() => nova(aba === "sem_area" ? "horario" : "mapa")}><Plus size={14} /> Nova regra</button>}
      </Cab>
      <div className="dm-abas" role="tablist">{ABAS.map(([k, n]) => <button key={k} role="tab" aria-selected={aba === k} className={aba === k ? "ativo" : ""} onClick={() => setAba(k)}>{n}</button>)}</div>
      {guia && <div className="dm-cartao dm-guia"><strong>Navegue entre as dinâmicas</strong><p>Cada dinâmica tem suas configurações próprias. Use as abas para configurá-las e visualizá-las em tempo real. Em Automações, o painel abre áreas sozinho onde há muitos pedidos.</p><button className="botao" onClick={() => setGuia(false)}>Entendi</button></div>}
      <Aviso erro={d.erro ?? msg?.erro} ok={msg?.ok} />
      <div className="dm-dinamicas">
        <div className="dm-cartao dm-mapa-principal">
          <p className="sub" role="status">{titulo}</p>
          <MapaDinamicas aba={aba} manuais={manuais} automaticas={automaticas} />
          {legenda && <div className="dm-legenda" aria-label="Legenda do mapa">{(dados?.legenda ?? []).map((l: any) => <span key={l.nivel}><i style={{ background: l.cor }} /> {l.rotulo} <small>{l.detalhe}</small></span>)}<span><i style={{ background: "#94a3b8" }} /> Desligada</span></div>}
        </div>
        <section className="dm-cartao">
          <h2>{ABAS.find(([k]) => k === aba)![1]}</h2>
          {!dados ? <Carregando /> : aba === "automaticas" ? (
            <>
              <p className="sub"><span className="selo alerta">Beta</span> A dinâmica automática está em fase experimental. As áreas abaixo existem agora, pelos pedidos dos últimos minutos.</p>
              {!automaticas.length ? <p className="vazio">Nenhuma área automática aberta agora.</p> : <ul className="dm-transacoes">{automaticas.map((a) => <li key={a.id}><span><strong>{a.nome}</strong><small>{valorDinamica(a)} · {a.pedidos} pedidos recentes</small></span></li>)}</ul>}
              <p className="sub">{(dados.automacoes ?? []).length} automação(ões) cadastrada(s).</p>
            </>
          ) : !(aba === "manuais" ? manuais : semArea).length ? <p className="vazio">Nenhuma regra {aba === "manuais" ? "de área" : "sem área"}.</p> : (
            <ul className="dm-transacoes">{(aba === "manuais" ? manuais : semArea).map((r) => (
              <li key={r.id}><span><strong>{r.nome}</strong><small>{valorDinamica(r)}{r.tipo === "demanda" ? ` · acima de ${r.gatilho} corridas ativas` : ""}{r.tipo === "horario" ? ` · ${r.janelas.length} janela(s)` : ""}{r.cidade ? ` · ${r.cidade}` : ""}</small></span>
                <span className="dm-linha"><Interruptor valor={r.ativa} desabilitado={!admin} rotulo={`${r.nome} ativa`} onChange={(v) => ativar(`/dinamicas/${r.id}/ativa`, v, v ? "Regra ligada." : "Regra desligada.")} />
                  {admin && <><button className="icone" aria-label={`Editar ${r.nome}`} onClick={() => setEdit(structuredClone(r))}><Pencil size={14} /></button><button className="icone" aria-label={`Remover ${r.nome}`} onClick={async () => { if (confirm(`Remover a regra "${r.nome}"?`)) { await salvar(async () => { await pedirConfig(`/dinamicas/${r.id}`, "DELETE"); d.recarregar(); }, "Regra removida."); } }}><Trash2 size={14} /></button></>}</span></li>
            ))}</ul>
          )}
          <h3>Prioridade entre dinâmicas</h3>
          <p className="sub">Define qual critério decide quando mais de uma dinâmica vale para a mesma corrida.</p>
          <select aria-label="Prioridade das dinâmicas" disabled={!admin || !dados} value={dados?.prioridade ?? "somar"} onChange={(e) => salvar(async () => { await pedirConfig("/dinamicas-prioridade", "PUT", { prioridade: e.target.value }); d.recarregar(); }, "Prioridade salva.")}>
            {(dados?.prioridades ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.rotulo}</option>)}
          </select>
        </section>
      </div>
      {edit && <JanelaDinamica inicial={edit} onFechar={() => setEdit(null)} onSalvo={() => { setEdit(null); d.recarregar(); }} />}
      <Modal aberto={mostraAutomacoes} onFechar={() => setMostraAutomacoes(false)} titulo="Automações" sub="Áreas automáticas por demanda (beta)" larga>
        <p className="sub">Quando uma região do mapa recebe pedidos demais num período curto, o painel abre uma área com preço extra ali, e a fecha quando a procura cai. Ligue cada automação nas categorias, na aba Dinâmica.</p>
        {admin && <button className="botao primario" onClick={() => setAuto({ nome: "", cidade: "", ativa: true, janelaMin: 15, minPedidos: 5, celulaKm: 1, cobranca: "multiplicador", valor: 1.3, minimo: 0 })}><Plus size={14} /> Nova automação</button>}
        {!(dados?.automacoes ?? []).length ? <p className="vazio">Nenhuma automação criada.</p> : <ul className="dm-transacoes">{dados.automacoes.map((a: any) => (
          <li key={a.id}><span><strong>{a.nome}</strong><small>{valorDinamica(a)} · {a.minPedidos} pedidos em {a.janelaMin} min · regiões de {String(a.celulaKm).replace(".", ",")} km</small></span>
            <span className="dm-linha"><Interruptor valor={a.ativa} desabilitado={!admin} rotulo={`${a.nome} ativa`} onChange={(v) => ativar(`/dinamicas-automacoes/${a.id}/ativa`, v, v ? "Automação ligada." : "Automação desligada.")} />
              {admin && <><button className="icone" aria-label={`Editar ${a.nome}`} onClick={() => setAuto(structuredClone(a))}><Pencil size={14} /></button><button className="icone" aria-label={`Remover ${a.nome}`} onClick={async () => { if (confirm(`Remover a automação "${a.nome}"?`)) { await salvar(async () => { await pedirConfig(`/dinamicas-automacoes/${a.id}`, "DELETE"); d.recarregar(); }, "Automação removida."); } }}><Trash2 size={14} /></button></>}</span></li>
        ))}</ul>}
      </Modal>
      {auto && <JanelaAutomacao inicial={auto} onFechar={() => setAuto(null)} onSalvo={() => { setAuto(null); d.recarregar(); }} />}
    </>
  );
}

function JanelaAutomacao({ inicial, onFechar, onSalvo }: { inicial: any; onFechar: () => void; onSalvo: () => void }) {
  const [a, setA] = useState<any>(inicial);
  const { msg, salvando, salvar } = useSalvar();
  const set = (k: string, v: unknown) => setA({ ...a, [k]: v });
  return (
    <Modal aberto onFechar={onFechar} titulo={a.id ? "Editar automação" : "Nova automação"} sub="Regras para abrir áreas sozinho">
      <form className="dm-form" onSubmit={async (e) => { e.preventDefault(); const x = await salvar(() => pedirConfig("/dinamicas-automacoes", "POST", a)); if (x) onSalvo(); }}>
        <Campo rotulo="Nome"><input value={a.nome} onChange={(e) => set("nome", e.target.value)} required maxLength={60} placeholder="Ex: Pico de pedidos" /></Campo>
        <Campo rotulo="Cidade"><input value={a.cidade} onChange={(e) => set("cidade", e.target.value)} maxLength={80} /></Campo>
        <div className="dm-grade3">
          <Campo rotulo="Pedidos para abrir a área"><input type="number" min={2} value={a.minPedidos} onChange={(e) => set("minPedidos", Number(e.target.value))} /></Campo>
          <Campo rotulo="Janela (minutos)"><input type="number" min={5} max={240} value={a.janelaMin} onChange={(e) => set("janelaMin", Number(e.target.value))} /></Campo>
          <Campo rotulo="Tamanho da região (km)"><input inputMode="decimal" value={txt(a.celulaKm)} onChange={(e) => set("celulaKm", num(e.target.value))} /></Campo>
        </div>
        <div className="dm-duplo">
          <Campo rotulo="Tipo de cobrança"><select value={a.cobranca} onChange={(e) => set("cobranca", e.target.value)}><option value="multiplicador">Multiplicador (1,3x)</option><option value="percentual">% de acréscimo</option><option value="fixo">R$ adicional</option></select></Campo>
          <Campo rotulo="Valor"><input inputMode="decimal" value={txt(a.valor)} onChange={(e) => set("valor", num(e.target.value))} required /></Campo>
        </div>
        <Aviso erro={msg?.erro} />
        <div className="dm-rodape-modal"><button type="button" className="botao" onClick={onFechar}>Cancelar</button><button className="botao primario" disabled={salvando}>Salvar automação</button></div>
      </form>
    </Modal>
  );
}

function MapaDinamicas({ aba, manuais, automaticas }: { aba: Aba; manuais: any[]; automaticas: any[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const mapa = L.map(ref.current, { zoomControl: true }).setView([-15.8, -47.9], 4);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(mapa);
    const lista = aba === "automaticas" ? automaticas.map((a) => ({ ...a, ativa: true })) : aba === "manuais" ? manuais.filter((r) => r.poligono.length >= 3) : [];
    const camadas = lista.map((r) => {
      const cor = r.ativa ? COR_NIVEL[r.nivel] ?? "#dc2626" : "#94a3b8";
      return L.polygon(r.poligono, { color: cor, fillOpacity: 0.25 }).bindTooltip(`${r.nome} · ${valorDinamica(r)}`, { permanent: true, direction: "center", className: "dm-etiqueta" }).addTo(mapa);
    });
    if (camadas.length) mapa.fitBounds(L.featureGroup(camadas).getBounds().pad(0.3));
    setTimeout(() => mapa.invalidateSize(), 200);
    return () => { mapa.remove(); };
  }, [aba, manuais, automaticas]);
  return <div ref={ref} className="dm-mapa" role="img" aria-label="Mapa das áreas com tarifa dinâmica" />;
}

function DesenhoArea({ pontos, onChange }: { pontos: Array<[number, number]>; onChange: (p: Array<[number, number]>) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const atual = useRef(pontos);
  atual.current = pontos;
  useEffect(() => {
    if (!ref.current) return;
    const mapa = L.map(ref.current).setView(pontos[0] ?? [-15.8, -47.9], pontos.length ? 13 : 4);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(mapa);
    const grupo = L.layerGroup().addTo(mapa);
    const desenhar = () => { grupo.clearLayers(); const p = atual.current; if (p.length) { L.polygon(p, { color: "#ef4444" }).addTo(grupo); p.forEach((x) => L.circleMarker(x, { radius: 4, color: "#ef4444" }).addTo(grupo)); } };
    desenhar();
    mapa.on("click", (e: L.LeafletMouseEvent) => { atual.current = [...atual.current, [Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6))]]; onChange(atual.current); desenhar(); });
    const ajusta = () => mapa.invalidateSize();
    setTimeout(ajusta, 200);
    return () => { mapa.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { /* o desenho segue o estado pelo clique; limpar recria o mapa pela chave */ }, [pontos]);
  return <div ref={ref} className="dm-mapa modal" role="img" aria-label="Mapa para desenhar a área" />;
}

function JanelaDinamica({ inicial, onFechar, onSalvo }: { inicial: any; onFechar: () => void; onSalvo: () => void }) {
  const [r, setR] = useState<any>(inicial);
  const [chaveMapa, setChaveMapa] = useState(0);
  const { msg, salvando, salvar } = useSalvar();
  const set = (k: string, v: unknown) => setR({ ...r, [k]: v });
  const T = r.tipo as TipoDin;
  const janela = (dia: number) => r.janelas.filter((j: any) => j.dia === dia);
  const setJanelas = (l: any[]) => set("janelas", l);
  return (
    <Modal aberto onFechar={onFechar} titulo={r.id ? "Editar Regra" : "Nova Regra"} sub="Configure os parâmetros" larga={T !== "demanda"}>
      <form className="dm-form" onSubmit={async (e) => { e.preventDefault(); const x = await salvar(() => pedirConfig("/dinamicas", "POST", r)); if (x) onSalvo(); }}>
        {!r.id && T !== "mapa" && <Campo rotulo="Tipo da dinâmica"><select value={T} onChange={(e) => set("tipo", e.target.value)}><option value="horario">Por horário</option><option value="demanda">Por alta demanda</option></select></Campo>}
        <Campo rotulo={T === "demanda" ? "Nome" : "Nome da Regra"}><input value={r.nome} onChange={(e) => set("nome", e.target.value)} placeholder={T === "mapa" ? "Ex: Zona Show" : T === "horario" ? "Ex: Rush Manhã" : ""} required maxLength={60} /></Campo>
        <Campo rotulo="Cidade"><input value={r.cidade} onChange={(e) => set("cidade", e.target.value)} maxLength={80} /></Campo>
        {T === "mapa" && (
          <div><div className="dm-linha dm-entre"><small>{r.poligono.length >= 3 ? `Área com ${r.poligono.length} pontos` : "Clique no mapa para desenhar"}</small><button type="button" className="botao" onClick={() => { set("poligono", []); setChaveMapa(chaveMapa + 1); }}>Limpar desenho</button></div>
            <DesenhoArea key={chaveMapa} pontos={r.poligono} onChange={(p) => setR((x: any) => ({ ...x, poligono: p }))} /></div>
        )}
        {T === "demanda" && <fieldset><legend>Gatilho de Alta Demanda</legend><div className="dm-linha">Acima de <input type="number" min={1} value={r.gatilho} onChange={(e) => set("gatilho", Number(e.target.value))} aria-label="Corridas ativas" /> Corridas Ativas</div></fieldset>}
        <div className="dm-duplo">
          <Campo rotulo="Tipo Cobrança"><select value={r.cobranca} onChange={(e) => set("cobranca", e.target.value)}><option value="percentual">% de acréscimo</option><option value="multiplicador">Multiplicador (1,3x)</option><option value="fixo">{T === "mapa" ? "R$ Adicional" : T === "horario" ? "R$ Valor Fixo" : "R$"}</option></select></Campo>
          <Campo rotulo={T === "mapa" ? "Valor Extra" : T === "horario" ? "Valor" : "Valor Adicional"} dica={r.cobranca === "percentual" ? "Percentual de acréscimo: 20 = +20% no preço." : r.cobranca === "multiplicador" ? "Vezes o preço: 1,3 = 1,3x." : "Reais somados ao preço."}><input inputMode="decimal" value={txt(r.valor)} onChange={(e) => set("valor", num(e.target.value))} placeholder="Ex: 1.50" required /></Campo>
        </div>
        {T === "horario" && (
          <>
            <Campo rotulo="Mínimo (R$)"><input inputMode="decimal" value={txt(r.minimo)} onChange={(e) => set("minimo", num(e.target.value))} placeholder="0.00" /></Campo>
            <h4>Configurar Dias e Horários</h4>
            {DIAS.map((nome, dia) => (
              <div key={nome} className="dm-dia"><strong>{nome}</strong>
                {janela(dia).map((j: any, k: number) => { const idx = r.janelas.indexOf(j); return <span key={k} className="dm-linha"><input type="time" aria-label={`${nome} início`} value={j.inicio} onChange={(e) => setJanelas(r.janelas.map((x: any, i: number) => (i === idx ? { ...x, inicio: e.target.value } : x)))} /> até <input type="time" aria-label={`${nome} fim`} value={j.fim} onChange={(e) => setJanelas(r.janelas.map((x: any, i: number) => (i === idx ? { ...x, fim: e.target.value } : x)))} /><button type="button" className="icone" aria-label="Remover horário" onClick={() => setJanelas(r.janelas.filter((_: unknown, i: number) => i !== idx))}><Trash2 size={14} /></button></span>; })}
                <button type="button" className="botao" onClick={() => setJanelas([...r.janelas, { dia, inicio: "07:00", fim: "09:00" }])}>+ horário</button></div>
            ))}
          </>
        )}
        <Aviso erro={msg?.erro} />
        <div className="dm-rodape-modal"><button type="button" className="botao" onClick={onFechar}>Cancelar</button><button className="botao primario" disabled={salvando}>{T === "mapa" ? "Salvar Regra de Mapa" : T === "horario" ? "Salvar Regra de Horário" : "Salvar Regra de Demanda"}</button></div>
      </form>
    </Modal>
  );
}

