// Nova Solicitação: a central pede a corrida pelo passageiro (telefone ou CPF), com rota, paradas, agendamento, motorista e valor manual.
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Edit3, Loader2, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { api } from "../../api";
import { CampoEndereco, type PontoEscolhido } from "../../componentes/CampoEndereco";
import { Aviso, L, fone, hojeBr, msgErro, op, pino, reais, soDig, useDados, useMapa } from "./comum";
import "./corridas.css";

const PAGAMENTOS = ["Dinheiro", "Pix", "Cartão na Maquininha", "Saldo da Carteira", "Cartão no App"];
const EXIGENCIAS = ["Porta-malas grande", "Aceita encomendas", "Adaptado para cadeirante", "Ficar à disposição do passageiro"];
const P0: PontoEscolhido = { texto: "" };

export default function Solicitar() {
  const [tipo, setTipo] = useState<"tel" | "cpf">("tel");
  const [busca, setBusca] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [recentes, setRecentes] = useState<PontoEscolhido[]>([]);
  const [nome, setNome] = useState("");
  const [contato, setContato] = useState("");
  const [telCadastro, setTelCadastro] = useState("");
  const [origem, setOrigem] = useState<PontoEscolhido>(P0);
  const [complemento, setComplemento] = useState("");
  const [paradas, setParadas] = useState<PontoEscolhido[]>([]);
  const [destino, setDestino] = useState<PontoEscolhido>(P0);
  const [semDestino, setSemDestino] = useState(false);
  const [referencia, setReferencia] = useState("");
  const [motoristaId, setMotoristaId] = useState("");
  const [categoria, setCategoria] = useState("");
  const [agendar, setAgendar] = useState(false);
  const [quando, setQuando] = useState("");
  const [pagamento, setPagamento] = useState("");
  const [exigencias, setExigencias] = useState<string[]>([]);
  const [observacao, setObservacao] = useState("");
  const [est, setEst] = useState<{ valor: number | null; distanciaKm: number | null } | null>(null);
  const [manual, setManual] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const cats = useDados(() => api.registros("categorias"), []);
  const mots = useDados<{ motoristas: any[] }>(() => op("/motoristas"), []);
  const mapa = useDados<any>(() => op("/mapa"), [], 15_000);
  const categorias = (cats.dados?.registros ?? []).filter((c) => c.ativa !== false);
  useEffect(() => { if (!categoria && categorias.length) setCategoria(String(categorias[0].nome)); }, [categorias.length]); // eslint-disable-line react-hooks/exhaustive-deps

  async function buscar() {
    const v = busca.trim();
    if (!soDig(v)) return;
    setBuscando(true); setErro(null);
    try {
      const r = await op<any>(`/passageiro?${tipo === "tel" ? "telefone" : "cpf"}=${encodeURIComponent(soDig(v))}`);
      setTelCadastro(r.telefone); setRecentes(r.enderecos ?? []);
      if (r.nome) setNome(r.nome);
      if (!r.encontrado) setErro("Passageiro não encontrado. Preencha o nome para cadastrar na primeira corrida.");
    } catch (e) { setErro(msgErro(e)); } finally { setBuscando(false); }
  }

  // Estimativa quando há categoria e rota (com coordenadas ou sem elas, pela base de tarifa).
  const chave = JSON.stringify([categoria, origem.lat, origem.lng, destino.lat, destino.lng, semDestino]);
  useEffect(() => {
    if (!categoria || !origem.texto || (!semDestino && !destino.texto)) { setEst(null); return; }
    let vivo = true;
    const p = new URLSearchParams({ categoria });
    if (origem.lat != null) { p.set("latEmbarque", String(origem.lat)); p.set("lngEmbarque", String(origem.lng)); }
    if (!semDestino && destino.lat != null) { p.set("latDestino", String(destino.lat)); p.set("lngDestino", String(destino.lng)); }
    fetch(`/api/corridas-proprias/estimativa?${p}`, { credentials: "same-origin" }).then((r) => r.json()).then((j) => vivo && setEst(j)).catch(() => vivo && setEst(null));
    return () => { vivo = false; };
  }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps

  const valor = manual != null ? Number(manual.replace(",", ".")) : est?.valor ?? null;

  // Mapa com os carros online e os pontos da rota.
  const { ref, mapa: m } = useMapa([-15.78, -47.93], 12);
  const camada = useRef<L.LayerGroup | null>(null);
  const ajustado = useRef("");
  useEffect(() => {
    if (!m) return;
    camada.current?.remove();
    const g = L.layerGroup().addTo(m); camada.current = g;
    const pts: Array<[number, number]> = [];
    const add = (p: PontoEscolhido, c: string, t: string) => { if (p.lat != null && p.lng != null) { L.marker([p.lat, p.lng], { icon: pino(c, t) }).addTo(g); pts.push([p.lat, p.lng]); } };
    add(origem, "#10b981", "A"); paradas.forEach((p, i) => add(p, "#f59e0b", String(i + 1))); if (!semDestino) add(destino, "#ef4444", "B");
    if (pts.length > 1) L.polyline(pts, { color: "#60a5fa", weight: 4, dashArray: "8 8" }).addTo(g);
    const carros = (mapa.dados?.motoristas ?? []).filter((x: any) => x.lat != null && x.situacao !== "offline");
    for (const c of carros) L.marker([c.lat, c.lng], { icon: pino(c.situacao === "livre" ? "#22c55e" : "#64748b", "🚗") }).bindPopup(`<b>${c.nome}</b><br>${c.placa}`).addTo(g);
    const k = JSON.stringify(pts) + carros.length;
    if (ajustado.current !== k) { ajustado.current = k; const todos = [...pts, ...carros.map((c: any) => [c.lat, c.lng] as [number, number])]; if (todos.length) m.fitBounds(L.latLngBounds(todos).pad(0.3), { maxZoom: 15 }); }
  }, [m, origem, destino, paradas, semDestino, mapa.dados]);

  const minimo = useMemo(() => new Date(Date.now() - 3 * 3600_000 + 20 * 60_000).toISOString().slice(0, 16), []);
  async function solicitar() {
    setErro(null); setOk(null);
    if (!nome.trim()) return setErro("Informe o nome do passageiro.");
    const tel = soDig(telCadastro || contato || (tipo === "tel" ? busca : ""));
    if (tel.length < 10) return setErro("Informe o telefone do passageiro (de cadastro ou contato manual).");
    if (!origem.texto.trim()) return setErro("Informe a origem.");
    if (!semDestino && !destino.texto.trim()) return setErro("Informe o destino ou marque \"Sem Destino\".");
    if (agendar && !quando) return setErro("Escolha a data e a hora do agendamento.");
    if (!pagamento) return setErro("Escolha a forma de pagamento.");
    setEnviando(true);
    try {
      const r = await op<any>("/solicitar", {
        passageiro: { nome, telefone: tel }, embarque: origem, complemento, paradas: paradas.filter((p) => p.texto.trim()), destino: semDestino ? undefined : destino, referencia,
        motoristaId, categoria, agendadaPara: agendar ? quando : undefined, pagamento, exigencias, observacao, valor: manual != null && valor != null && Number.isFinite(valor) ? valor : undefined,
      });
      setOk(`Corrida solicitada: OS ${r.corrida.os}${r.corrida.valor != null ? ` · ${reais(r.corrida.valor)}` : ""}.${r.avisos?.length ? ` ${r.avisos.join(" ")}` : ""}`);
      setOrigem(P0); setDestino(P0); setParadas([]); setComplemento(""); setReferencia(""); setObservacao(""); setExigencias([]); setManual(null); setAgendar(false); setQuando(""); setMotoristaId("");
      setBusca(""); setNome(""); setContato(""); setTelCadastro(""); setRecentes([]);
    } catch (e) { setErro(msgErro(e)); } finally { setEnviando(false); }
  }

  return (
    <div className="oc">
      <div className="oc-topo"><h1>Nova Solicitação <small>{hojeBr().split("-").reverse().join("/")}</small></h1></div>
      <Aviso texto={erro} erro />
      {ok && <div className="oc-aviso" style={{ color: "var(--oc-ok)", borderColor: "#34d39940", background: "#34d39918" }}><CheckCircle2 size={14} /> {ok}</div>}
      <div className="oc-solic">
        <div>
          <div className="oc-card">
            <h3>1. Passageiro</h3>
            <div className="oc-fila" style={{ marginBottom: 10 }}>
              {(["tel", "cpf"] as const).map((t) => <label key={t} className={`oc-chip ${tipo === t ? "on" : ""}`} style={{ cursor: "pointer" }}><input type="radio" name="busca_tipo" checked={tipo === t} onChange={() => { setTipo(t); setBusca(""); }} style={{ display: "none" }} />{t === "tel" ? "Telefone" : "CPF"}</label>)}
            </div>
            <label className="oc-l">{tipo === "tel" ? "Telefone de cadastro *" : "CPF do cliente *"}
              <span className="oc-fila" style={{ flexWrap: "nowrap" }}>
                <input value={busca} onChange={(e) => setBusca(e.target.value)} onBlur={buscar} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), buscar())} placeholder={tipo === "tel" ? "(00) 00000-0000" : "000.000.000-00"} inputMode="numeric" />
                <button className="oc-btn" type="button" onClick={buscar} aria-label="Buscar passageiro">{buscando ? <Loader2 size={16} className="gira" /> : <Search size={16} />}</button>
              </span>
            </label>
            {recentes.length > 0 && (
              <div className="oc-recentes" style={{ marginTop: 10 }}><span className="suave" style={{ fontWeight: 800, fontSize: 11 }}>FAVORITOS</span>
                {recentes.map((e, i) => <button key={i} type="button" onClick={() => setOrigem(e)} title="Usar como origem">{e.texto}</button>)}</div>
            )}
            <div className="oc-grid2" style={{ marginTop: 10 }}>
              <label className="oc-l">Nome Passageiro *<input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Digite o nome do passageiro" maxLength={80} /></label>
              <label className="oc-l">Contato (Manual)<input value={contato} onChange={(e) => setContato(e.target.value)} placeholder="Auto" inputMode="tel" />{telCadastro && !contato && <small className="suave" style={{ textTransform: "none" }}>{fone(telCadastro)}</small>}</label>
            </div>
          </div>

          <div className="oc-card">
            <h3>2. Rota</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <CampoEndereco rotulo="Origem" valor={origem} onChange={setOrigem} />
              <input placeholder="Complemento (Opcional)" value={complemento} onChange={(e) => setComplemento(e.target.value)} maxLength={80} />
              {paradas.map((p, i) => (
                <div key={i} className="oc-fila" style={{ flexWrap: "nowrap", alignItems: "flex-end" }}>
                  <div style={{ flex: 1 }}><CampoEndereco rotulo={`Parada ${i + 1}`} valor={p} onChange={(v) => setParadas(paradas.map((x, j) => (j === i ? v : x)))} /></div>
                  <button className="oc-btn" type="button" onClick={() => setParadas(paradas.filter((_, j) => j !== i))} aria-label="Remover parada"><Trash2 size={16} /></button>
                </div>
              ))}
              {!semDestino && (
                <div className="oc-fila" style={{ flexWrap: "nowrap", alignItems: "flex-end" }}>
                  <div style={{ flex: 1 }}><CampoEndereco rotulo="Destino" valor={destino} onChange={setDestino} /></div>
                  <button className="oc-btn" type="button" disabled={paradas.length >= 3} onClick={() => setParadas([...paradas, P0])} aria-label="Adicionar parada" title="Adicionar parada (até 3)"><Plus size={16} /></button>
                </div>
              )}
              <input placeholder="Referência (Portão, Cor...)" value={referencia} onChange={(e) => setReferencia(e.target.value)} maxLength={120} />
              <label className="oc-sw"><input type="checkbox" checked={semDestino} onChange={(e) => setSemDestino(e.target.checked)} /> Sem Destino</label>
            </div>
            <div className="oc-mapa-solic"><div ref={ref} className="oc-mapa" /></div>
            <button className="oc-btn peq" type="button" style={{ marginTop: 8 }} onClick={mapa.recarregar}><RefreshCw size={14} /> Atualizar Carros</button>
          </div>
        </div>

        <div>
          <div className="oc-card">
            <h3>3. Opções</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label className="oc-l">Direcionar para Motorista
                <select value={motoristaId} onChange={(e) => setMotoristaId(e.target.value)}>
                  <option value="">Qualquer um (Fila Automática)</option>
                  {(mots.dados?.motoristas ?? []).map((m) => <option key={m.id} value={m.id}>{m.nome} ({m.online ? "Online" : "Offline"})</option>)}
                </select>
                <small className="suave" style={{ textTransform: "none", fontWeight: 400 }}>Deixe "Qualquer um" para o sistema distribuir.</small>
              </label>
              <label className="oc-l">Categoria do Veículo<select value={categoria} onChange={(e) => setCategoria(e.target.value)}>{categorias.map((c) => <option key={c.id}>{String(c.nome)}</option>)}</select></label>
              <div className="oc-card" style={{ background: "var(--oc-card2)", marginBottom: 0 }}>
                <label className="oc-sw"><input type="checkbox" checked={agendar} onChange={(e) => setAgendar(e.target.checked)} /> Agendar Corrida</label>
                {agendar && <input type="datetime-local" style={{ marginTop: 10 }} value={quando} min={minimo} onChange={(e) => setQuando(e.target.value)} aria-label="Data e hora do agendamento" />}
              </div>
              <div><span className="oc-l" style={{ display: "block", marginBottom: 6 }}>Pagamento</span>
                <div className="oc-pagto">{PAGAMENTOS.map((p) => <label key={p} className={pagamento === p ? "on" : ""}><input type="radio" name="forma_pagamento" checked={pagamento === p} onChange={() => setPagamento(p)} />{p}</label>)}</div></div>
              <div><span className="oc-l" style={{ display: "block", marginBottom: 6 }}>Filtros (Opcionais)</span>
                <div className="oc-pagto">{EXIGENCIAS.map((x) => <label key={x} className={exigencias.includes(x) ? "on" : ""}><input type="checkbox" checked={exigencias.includes(x)} onChange={(e) => setExigencias(e.target.checked ? [...exigencias, x] : exigencias.filter((y) => y !== x))} />{x}</label>)}</div></div>
              <textarea placeholder="Observação para o motorista..." value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={300} />
            </div>
          </div>
          <div className="oc-estimativa">
            <div className="oc-fila" style={{ justifyContent: "space-between" }}>
              <span className="suave" style={{ fontWeight: 800 }}>ESTIMATIVA</span>
              <button className="oc-btn peq" type="button" onClick={() => setManual(manual == null ? (est?.valor != null ? String(est.valor).replace(".", ",") : "") : null)}><Edit3 size={13} /> {manual == null ? "Editar valor" : "Usar estimativa"}</button>
            </div>
            {manual != null ? <input value={manual} onChange={(e) => setManual(e.target.value)} inputMode="decimal" style={{ margin: "8px 0", fontSize: 22 }} aria-label="Valor manual" /> : <div><strong>{valor != null ? reais(valor) : "R$ 0,00"}</strong></div>}
            <div className="oc-dado"><span>Distância</span><b>{est?.distanciaKm != null ? `${est.distanciaKm.toLocaleString("pt-BR")} km` : "0.0 km"}</b></div>
            <button className="oc-btn pri" style={{ width: "100%", marginTop: 12, minHeight: 46, fontSize: 15 }} disabled={enviando} onClick={solicitar}>{enviando ? <Loader2 size={16} className="gira" /> : null} Solicitar Corrida</button>
          </div>
        </div>
      </div>
    </div>
  );
}
