// Nova Solicitação: a central pede a corrida pelo passageiro (telefone ou CPF), com rota, paradas, agendamento, motorista e valor manual.
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowDown, ArrowUp, CheckCircle2, Loader2, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { api } from "../../api";
import { pedirConfig } from "../demais/comum";
import { CampoEndereco, type PontoEscolhido } from "../../componentes/CampoEndereco";
import { Aviso, L, fone, msgErro, op, pino, reais, soDig, useDados, useMapa } from "./comum";
import "./corridas.css";
import { ajustarSeguro } from "../../../comum/mapa-seguro.ts";

const PAGAMENTOS = ["Dinheiro", "Crédito", "Débito", "Pix"];
const EXIGENCIAS = ["Porta-malas grande", "Aceita encomendas", "Adaptado para cadeirante", "Ficar à disposição do passageiro"];
const P0: PontoEscolhido = { texto: "" };

export default function Solicitar() {
  const navegar = useNavigate();
  const [params] = useSearchParams();
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
  const semDestino = !destino.texto.trim();
  const [referencia, setReferencia] = useState("");
  const [motoristaId, setMotoristaId] = useState(""), [motoristaTxt, setMotoristaTxt] = useState("");
  const [categoria, setCategoria] = useState("");
  const [agendar, setAgendar] = useState(false);
  const [quando, setQuando] = useState("");
  const [pagamento, setPagamento] = useState("");
  const [exigencias, setExigencias] = useState<string[]>([]);
  const [observacao, setObservacao] = useState("");
  const [empresaConv, setEmpresaConv] = useState(""), [centroCusto, setCentroCusto] = useState(""), [voucher, setVoucher] = useState("");
  const [infoTexto, setInfoTexto] = useState(""), [infoModo, setInfoModo] = useState<"antes" | "depois" | "interna">("antes");
  const infoAntes = infoModo === "antes" ? infoTexto : "", infoDepois = infoModo === "depois" ? infoTexto : "", infoInterna = infoModo === "interna" ? infoTexto : "";
  const [cpf, setCpf] = useState(""), [variosCarros, setVariosCarros] = useState(false), [favOrigem, setFavOrigem] = useState(true), [favDestino, setFavDestino] = useState(false);
  const [finalModo, setFinalModo] = useState<"livre" | "prefixado">("livre"), [prefixado, setPrefixado] = useState("");
  const [est, setEst] = useState<{ valor: number | null; distanciaKm: number | null } | null>(null);
  const [manual, setManual] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const cats = useDados(() => api.registros("categorias"), []);
  const cfg = useDados<{ categorias: Array<{ nome: string; extra: { solicitacoes: string } }> }>(() => pedirConfig("/categorias"), []);
  const conv = useDados(() => api.registros("conveniadas"), []);
  const conveniadas = (conv.dados?.registros ?? []).filter((c) => !c.status || c.status === "Ativa");
  const centros = String(conveniadas.find((c) => String(c.nome) === empresaConv)?.centrosCusto ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const mots = useDados<{ motoristas: any[] }>(() => op("/motoristas"), []);
  const mapa = useDados<any>(() => op("/mapa"), [], 15_000);
  const categorias = (cats.dados?.registros ?? []).filter((c) => c.ativa !== false);
  useEffect(() => { if (!categoria && categorias.length) setCategoria(String(categorias[0].nome)); }, [categorias.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Criar cópia" (Consultar corridas): abre a solicitação com os dados de uma corrida anterior, pronta para conferir e enviar.
  const copiarDe = params.get("copiar");
  useEffect(() => {
    if (!copiarDe) return;
    let vivo = true;
    op<any>(`/corridas/${encodeURIComponent(copiarDe)}`).then((d) => {
      if (!vivo) return;
      const c = d.corrida;
      setNome(c.passageiro.nome); setTelCadastro(c.passageiro.telefone); setBusca(c.passageiro.telefone); setTipo("tel");
      setOrigem({ texto: c.embarque.texto, lat: c.embarque.lat, lng: c.embarque.lng });
      setDestino(c.destino ? { texto: c.destino.texto, lat: c.destino.lat, lng: c.destino.lng } : P0);
      setParadas((c.paradas ?? []).map((p: any) => ({ texto: p.texto, lat: p.lat, lng: p.lng })));
      if (c.categoria) setCategoria(c.categoria);
      if (c.pagamento) setPagamento(c.pagamento);
      if (c.observacao) setObservacao(c.observacao);
      setOk(`Dados copiados da OS ${c.os}. Confira e clique em Solicitar.`);
    }).catch((e) => vivo && setErro(msgErro(e)));
    return () => { vivo = false; };
  }, [copiarDe]);

  async function buscar() {
    const v = busca.trim();
    if (!soDig(v)) return;
    setBuscando(true); setErro(null);
    try {
      const r = await op<any>(`/passageiro?${tipo === "tel" ? "telefone" : "cpf"}=${encodeURIComponent(soDig(v))}`);
      setTelCadastro(r.telefone); if (r.cpf) setCpf(r.cpf); setRecentes(r.enderecos ?? []);
      if (r.nome) setNome(r.nome);
      if (!r.encontrado) setErro("Passageiro não encontrado. Preencha o nome para cadastrar na primeira corrida.");
    } catch (e) { setErro(msgErro(e)); } finally { setBuscando(false); }
  }

  // Estimativa quando há categoria e rota (com coordenadas ou sem elas, pela base de tarifa).
  const chave = JSON.stringify([categoria, origem.lat, origem.lng, destino.lat, destino.lng, semDestino]);
  useEffect(() => {
    if (!categoria || !origem.texto || semDestino) { setEst(null); return; }
    let vivo = true;
    const p = new URLSearchParams({ categoria });
    if (origem.lat != null) { p.set("latEmbarque", String(origem.lat)); p.set("lngEmbarque", String(origem.lng)); }
    if (!semDestino && destino.lat != null) { p.set("latDestino", String(destino.lat)); p.set("lngDestino", String(destino.lng)); }
    fetch(`/api/corridas-proprias/estimativa?${p}`, { credentials: "same-origin" }).then((r) => r.json()).then((j) => vivo && setEst(j)).catch(() => vivo && setEst(null));
    return () => { vivo = false; };
  }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps

  const valor = manual != null ? (manual.trim() ? Number(manual.replace(",", ".")) : null) : est?.valor ?? null;

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
    if (ajustado.current !== k) { ajustado.current = k; const todos = [...pts, ...carros.map((c: any) => [c.lat, c.lng] as [number, number])]; if (todos.length) ajustarSeguro(m, L.latLngBounds(todos).pad(0.3), { maxZoom: 15 }); }
  }, [m, origem, destino, paradas, semDestino, mapa.dados]);

  const minimo = useMemo(() => new Date(Date.now() - 3 * 3600_000 + 20 * 60_000).toISOString().slice(0, 16), []);
  async function solicitar() {
    setErro(null); setOk(null);
    if (!nome.trim()) return setErro("Informe o nome do passageiro.");
    const tel = soDig(telCadastro || contato || (tipo === "tel" ? busca : ""));
    if (tel.length < 10) return setErro("Informe o telefone do passageiro (de cadastro ou contato manual).");
    if (!origem.texto.trim()) return setErro("Informe a origem.");
    if (agendar && !quando) return setErro("Escolha a data e a hora do agendamento.");
    if (!pagamento) return setErro("Escolha a forma de pagamento.");
    const fixo = Number(prefixado.replace(/\./g, "").replace(",", "."));
    if (finalModo === "prefixado" && !(fixo > 0)) return setErro("Informe o valor prefixado da corrida.");
    const modoCat = cfg.dados?.categorias.find((c) => c.nome === categoria)?.extra.solicitacoes;
    if (agendar && modoCat === "imediatas") return setErro("Esta categoria aceita apenas solicitações imediatas.");
    if (!agendar && modoCat === "agendadas") return setErro("Esta categoria aceita apenas corridas agendadas: marque \"Agendar Corrida\".");
    if (pagamento === "Voucher" && (!empresaConv || !voucher.trim())) return setErro("Para pagar com voucher, escolha a empresa e informe o número do voucher.");
    setEnviando(true);
    try {
      const r = await op<any>("/solicitar", {
        passageiro: { nome, telefone: tel, cpf: soDig(cpf) || undefined }, embarque: origem, complemento, paradas: paradas.filter((p) => p.texto.trim()), destino: semDestino ? undefined : destino, referencia,
        motoristaId, categoria, agendadaPara: agendar ? quando : undefined, pagamento, exigencias, observacao, infoAntes, infoDepois, infoInterna, telefoneContato: contato || undefined, enviarVariosCarros: variosCarros, favoritarOrigem: favOrigem, favoritarDestino: favDestino, valorFinalModo: finalModo, valorPrefixado: finalModo === "prefixado" ? fixo : undefined, empresaConveniada: empresaConv || undefined, centroCusto: centroCusto || undefined, voucher: pagamento === "Voucher" ? voucher : undefined, valor: manual != null && valor != null && Number.isFinite(valor) ? valor : undefined,
      });
      setOk(`Corrida solicitada: OS ${r.corrida.os}${r.corrida.valor != null ? ` · ${reais(r.corrida.valor)}` : ""}.${r.avisos?.length ? ` ${r.avisos.join(" ")}` : ""}`);
      setOrigem(P0); setDestino(P0); setParadas([]); setComplemento(""); setReferencia(""); setObservacao(""); setInfoTexto(""); setInfoModo("antes"); setCpf(""); setVariosCarros(false); setFavOrigem(true); setFavDestino(false); setFinalModo("livre"); setPrefixado(""); setExigencias([]); setManual(null); setAgendar(false); setQuando(""); setMotoristaId(""); setMotoristaTxt(""); setEmpresaConv(""); setCentroCusto(""); setVoucher("");
      setBusca(""); setNome(""); setContato(""); setTelCadastro(""); setRecentes([]);
    } catch (e) { setErro(msgErro(e)); } finally { setEnviando(false); }
  }

  const valorTexto = manual != null ? manual : est?.valor != null ? String(est.valor).replace(".", ",") : "";
  const pagamentos = [...PAGAMENTOS, ...(conveniadas.length ? ["Voucher"] : [])];
  return (
    <div className="oc">
      <div className="oc-topo"><h1>Solicitar nova corrida</h1></div>
      <Aviso texto={erro} erro />
      {ok && <div className="oc-aviso" style={{ color: "var(--oc-ok)", borderColor: "#34d39940", background: "#34d39918" }}><CheckCircle2 size={14} /> {ok}</div>}
      <div className="oc-card" style={{ maxWidth: 820 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="oc-fila"><span className="oc-l">Buscar cliente via:</span>
            {(["tel", "cpf"] as const).map((t) => <label key={t} className={`oc-chip ${tipo === t ? "on" : ""}`} style={{ cursor: "pointer" }}><input type="radio" name="busca_tipo" checked={tipo === t} onChange={() => { setTipo(t); setBusca(""); }} style={{ display: "none" }} />{t === "tel" ? "Telefone" : "CPF"}</label>)}
          </div>
          <label className="oc-l">{tipo === "tel" ? "Telefone de cadastro *" : "CPF do cliente *"}
            <span className="oc-fila" style={{ flexWrap: "nowrap" }}>
              <input value={busca} onChange={(e) => setBusca(e.target.value)} onBlur={buscar} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), buscar())} placeholder={tipo === "tel" ? "11 96123-4567" : "000.000.000-00"} maxLength={30} inputMode="numeric" />
              <button className="oc-btn" type="button" onClick={buscar} aria-label="Buscar passageiro">{buscando ? <Loader2 size={16} className="gira" /> : <Search size={16} />}</button>
            </span>
          </label>
          {recentes.length > 0 && (
            <div className="oc-recentes"><span className="suave" style={{ fontWeight: 800, fontSize: 11 }}>FAVORITOS</span>
              {recentes.map((e, i) => <button key={i} type="button" onClick={() => setOrigem(e)} title="Usar como partida">{e.texto}</button>)}</div>
          )}
          <label className="oc-l">Telefone para contato<input value={contato} onChange={(e) => setContato(e.target.value)} placeholder="11 96123-4567" maxLength={30} inputMode="tel" />{telCadastro && !contato && <small className="suave" style={{ textTransform: "none" }}>{fone(telCadastro)}</small>}</label>
          <label className="oc-l">Nome *<input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={100} /></label>
          <label className="oc-sw"><input type="checkbox" checked={agendar} onChange={(e) => setAgendar(e.target.checked)} /> Agendar corrida</label>
          {agendar && <input type="datetime-local" value={quando} min={minimo} onChange={(e) => setQuando(e.target.value)} aria-label="Data e hora do agendamento" />}
          <label className="oc-l">{infoModo === "depois" ? "Informação após o aceite" : infoModo === "interna" ? "Informação interna" : "Informação antes do aceite"}
            <textarea value={infoTexto} onChange={(e) => setInfoTexto(e.target.value)} maxLength={70} rows={2} placeholder="Será visualizada pelo motorista antes do aceite" /></label>
          <label className="oc-sw"><input type="checkbox" checked={infoModo === "depois"} onChange={(e) => setInfoModo(e.target.checked ? "depois" : "antes")} /> Informação após o aceite</label>
          <label className="oc-sw"><input type="checkbox" checked={infoModo === "interna"} onChange={(e) => setInfoModo(e.target.checked ? "interna" : "antes")} /> Informação interna</label>
          <div><span className="oc-l" style={{ display: "block", marginBottom: 6 }}>Forma de pagamento *</span>
            <div className="oc-pagto">{pagamentos.map((p) => <label key={p} className={pagamento === p ? "on" : ""}><input type="radio" name="forma_pagamento" checked={pagamento === p} onChange={() => setPagamento(p)} />{p}</label>)}</div></div>
          {conveniadas.length > 0 && (
            <div className="oc-grid2">
              <label className="oc-l">Empresa conveniada<select value={empresaConv} onChange={(e) => { setEmpresaConv(e.target.value); setCentroCusto(""); }}><option value="">Nenhuma</option>{conveniadas.map((c) => <option key={c.id}>{String(c.nome)}</option>)}</select></label>
              {centros.length > 0 && <label className="oc-l">Centro de custo<select value={centroCusto} onChange={(e) => setCentroCusto(e.target.value)}><option value="">Nenhum</option>{centros.map((c) => <option key={c}>{c}</option>)}</select></label>}
            </div>
          )}
          {pagamento === "Voucher" && <label className="oc-l">Número do voucher<input value={voucher} maxLength={30} onChange={(e) => setVoucher(e.target.value)} /></label>}
          <label className="oc-l">Categoria<select value={categoria} onChange={(e) => setCategoria(e.target.value)}>{categorias.map((c) => <option key={c.id}>{String(c.nome)}</option>)}</select></label>
          <div><span className="oc-l" style={{ display: "block", marginBottom: 6 }}>Exigências</span>
            <div className="oc-pagto">{EXIGENCIAS.map((x) => <label key={x} className={exigencias.includes(x) ? "on" : ""}><input type="checkbox" checked={exigencias.includes(x)} onChange={(e) => setExigencias(e.target.checked ? [...exigencias, x] : exigencias.filter((y) => y !== x))} />{x}</label>)}</div></div>
          <label className="oc-sw"><input type="checkbox" checked={variosCarros} onChange={(e) => setVariosCarros(e.target.checked)} /> Enviar mais de um carro</label>
          <label className="oc-l">Corridas apenas para o motorista:
            <input list="solic-motoristas" value={motoristaTxt} placeholder="Todos" onChange={(e) => { setMotoristaTxt(e.target.value); setMotoristaId((mots.dados?.motoristas ?? []).find((m) => m.nome === e.target.value)?.id ?? ""); }} />
            <datalist id="solic-motoristas">{(mots.dados?.motoristas ?? []).map((m) => <option key={m.id} value={m.nome} />)}</datalist>
          </label>
          <CampoEndereco rotulo="Endereço de partida (com número) *" valor={origem} onChange={setOrigem} />
          <label className="oc-l">Sala/Bloco/Apart<input value={complemento} onChange={(e) => setComplemento(e.target.value)} maxLength={100} /></label>
          <label className="oc-sw"><input type="checkbox" checked={favOrigem} onChange={(e) => setFavOrigem(e.target.checked)} /> Favoritar</label>
          {(
            <div className="oc-fila" style={{ flexWrap: "nowrap", alignItems: "flex-end" }}>
              <div style={{ flex: 1 }}><CampoEndereco rotulo="Endereço de destino (com número)" valor={destino} onChange={setDestino} /></div>
              <button className="oc-btn" type="button" disabled={paradas.length >= 3} onClick={() => setParadas([...paradas, P0])} aria-label="Adicionar parada" title="Adicionar parada (até 3)"><Plus size={16} /></button>
            </div>
          )}
          {paradas.map((p, i) => (
            <div key={i} className="oc-fila" style={{ flexWrap: "nowrap", alignItems: "flex-end" }}>
              <div style={{ flex: 1 }}><CampoEndereco rotulo={`Parada ${i + 1}`} valor={p} onChange={(v) => setParadas(paradas.map((x, j) => (j === i ? v : x)))} /></div>
              <button className="oc-btn" type="button" disabled={i === 0} onClick={() => setParadas(paradas.map((x, j) => (j === i - 1 ? paradas[i] : j === i ? paradas[i - 1] : x)))} aria-label="Subir parada"><ArrowUp size={16} /></button>
              <button className="oc-btn" type="button" disabled={i === paradas.length - 1} onClick={() => setParadas(paradas.map((x, j) => (j === i + 1 ? paradas[i] : j === i ? paradas[i + 1] : x)))} aria-label="Descer parada"><ArrowDown size={16} /></button>
              <button className="oc-btn" type="button" onClick={() => setParadas(paradas.filter((_, j) => j !== i))} aria-label="Remover parada"><Trash2 size={16} /></button>
            </div>
          ))}
          <label className="oc-sw"><input type="checkbox" checked={favDestino} onChange={(e) => setFavDestino(e.target.checked)} /> Favoritar</label>
          <label className="oc-l">Referência do endereço de partida<textarea value={referencia} onChange={(e) => setReferencia(e.target.value)} maxLength={120} rows={2} placeholder="Esta informação refere-se apenas ao endereço de partida (para outros dados, use os campos à esquerda)" /></label>
          <label className="oc-l">Valor estimado (R$)<input value={valorTexto || "0,00"} readOnly maxLength={10} aria-label="Valor estimado" />
            {est?.distanciaKm != null && <small className="suave" style={{ textTransform: "none" }}>{est.distanciaKm.toLocaleString("pt-BR")} km</small>}</label>
          <div className="oc-pagto">
            <label className={finalModo === "livre" ? "on" : ""}><input type="radio" name="valor_final" checked={finalModo === "livre"} onChange={() => setFinalModo("livre")} />Valor final livre</label>
            <label className={finalModo === "prefixado" ? "on" : ""}><input type="radio" name="valor_final" checked={finalModo === "prefixado"} onChange={() => setFinalModo("prefixado")} />Valor final prefixado em:</label>
          </div>
          {finalModo === "prefixado" && <label className="oc-l">Valor da corrida (R$)<input value={prefixado} onChange={(e) => setPrefixado(e.target.value)} inputMode="decimal" aria-label="Valor prefixado" /></label>}
          <label className="oc-l">Tarifa<input value={categoria} readOnly /></label>
          <small className="suave" style={{ textTransform: "none" }}>OBS: Caso a configuração do tipo de cálculo do valor final da corrida não seja "Pré-calculado Fixo", o valor pré-fixado não será considerado.</small>
          <div><button className="oc-btn peq" type="button" onClick={mapa.recarregar}><RefreshCw size={14} /> Atualizar motoristas</button></div>
          <div className="oc-mapa-solic"><div ref={ref} className="oc-mapa" /></div>
          <div className="oc-fila" style={{ justifyContent: "flex-end" }}>
            <button className="oc-btn" type="button" onClick={() => navegar(-1)}>Voltar</button>
            <button className="oc-btn pri" disabled={enviando} onClick={solicitar}>{enviando ? <Loader2 size={16} className="gira" /> : null} Solicitar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
