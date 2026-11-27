// Cadastro › Cupons, como na Machine: abas Resgatável e Automático, contadores (ativos, inativos, aguardando), cartões com código,
// desconto, público e usos, filtro "Ver cupons parceiros?" e o Novo cupom em 5 passos (Configuração, Período de validade, Público,
// Especificações e Restrições). Lista: /api/gestao/cupons; gravação: /api/cadastros/cupons (as regras valem na hora de pedir a corrida).

import { useEffect, useState } from "react";
import { Check, Clock, Download, Filter, Plus, X } from "lucide-react";
import { api, empresaEscolhidaAgora } from "../../api";
import { useCarregar } from "../../componentes/ui";
import { Abas, Cabecalho, Campo, chamar, consulta, dinheiro, Janela, Paginacao, Selo, useAviso, Vazio } from "./base";
import { FORMAS_CUPOM, LIMITES_USO, type FormaCupom, type LimiteUso } from "../../../cadastros/cupom-regras.ts";

type Cupom = Record<string, string | number | boolean | null> & { id: string; usos: number; descontoTotal: number; situacao: string };
interface Resposta { cupons: Cupom[]; automaticos: Cupom[]; paginacao: { atual: number; totalPaginas: number }; contadores: { ativos: number; inativos: number; aguardando: number }; kpis: { total: number; usos: number; economia: number } }
interface Cliente { telefone: string; nome: string; cpf?: string }
const STATUS_LISTA = [["Todos", "Todos"], ["Ativos", "Ativos"], ["Inativos", "Inativos"], ["Aguardando", "Aguardando"]] as const;
const TOM: Record<string, "ok" | "alerta" | "neutro"> = { Ativos: "ok", Aguardando: "alerta", Inativos: "neutro" };

async function baixarPlanilha(tipo: string) {
  const emp = empresaEscolhidaAgora();
  const r = await fetch(`/api/gestao/cupons/exportar${consulta({ tipo })}`, { credentials: "same-origin", headers: emp ? { "X-Empresa": emp } : {} });
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { erro?: string }).erro || `Erro ${r.status}`);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(await r.blob()); a.download = "cupons.csv"; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const pct = (n: unknown) => `${Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const textoUsos = (n: number) => (n ? `${n} ${n === 1 ? "vez" : "vezes"}` : "Nenhuma vez");

export default function Cupons() {
  const [tipo, setTipo] = useState("Resgatavel");
  const [autoStatus, setAutoStatus] = useState("todos"), [autoBusca, setAutoBusca] = useState("");
  const [status, setStatus] = useState("Todos");
  const [busca, setBusca] = useState(""), [termo, setTermo] = useState("");
  const [parceiros, setParceiros] = useState(false), [filtroAberto, setFiltroAberto] = useState(false), [parceirosForm, setParceirosForm] = useState("0");
  const [pagina, setPagina] = useState(1);
  const [exportar, setExportar] = useState(false);
  const l = useCarregar(() => chamar<Resposta>("GET", `/cupons${consulta({ status, tipo, busca: termo, parceiros: parceiros ? "1" : "", pagina })}`), [status, tipo, termo, parceiros, pagina]);
  const [editando, setEditando] = useState<Cupom | "novo" | null>(null);
  const [auto, setAuto] = useState<Cupom | null>(null);
  const { aviso, tentar } = useAviso();
  const d = l.dados;
  useEffect(() => { if (!exportar) return; const f = () => setExportar(false); window.addEventListener("click", f); return () => window.removeEventListener("click", f); }, [exportar]);
  const mostraAuto = tipo === "Automatico", mostraResg = tipo === "Resgatavel";
  const c = d?.contadores ?? { ativos: 0, inativos: 0, aguardando: 0 };

  return (
    <div className="cg-pagina-solta">
      {aviso}
      <Cabecalho titulo="Cupons">
        <button className="cg-botao" aria-label="Filtro de pesquisa" title="Filtro de pesquisa" onClick={() => { setParceirosForm(parceiros ? "1" : "0"); setFiltroAberto(true); }}><Filter size={16} /></button>
        <button className="cg-botao verde" onClick={() => setEditando("novo")}><Plus size={16} /> Criar cupom</button>
      </Cabecalho>
      <div className="cg-linha-tab">
        <Abas itens={[{ id: "Resgatavel" as const, rotulo: "Resgatável" }, { id: "Automatico" as const, rotulo: "Automático" }]} valor={tipo as "Resgatavel" | "Automatico"} onChange={(v) => { setTipo(v); setPagina(1); }} />
        {!mostraResg && <label className="cg-campo" style={{ flex: "0 1 200px" }}><span>Situação</span><select value={autoStatus} onChange={(e) => setAutoStatus(e.target.value)} aria-label="Situação do automático"><option value="todos">Todos</option><option value="ativo">Ativo</option><option value="inativo">Inativo</option></select></label>}
        {!mostraResg && <input placeholder="Pesquisar" value={autoBusca} onChange={(e) => setAutoBusca(e.target.value)} aria-label="Pesquisar" />}
        {mostraResg && <label className="cg-campo" style={{ flex: "0 1 200px" }}><span>Situação</span><select value={status} onChange={(e) => { setStatus(e.target.value); setPagina(1); }} aria-label="Situação">{STATUS_LISTA.map(([id, r]) => <option key={id} value={id}>{r}</option>)}</select></label>}
        {mostraResg && <form style={{ display: "flex", gap: 6, flex: "1 1 220px" }} onSubmit={(e) => { e.preventDefault(); setTermo(busca.trim()); setPagina(1); }}><input placeholder="Pesquisar" value={busca} minLength={2} onChange={(e) => setBusca(e.target.value)} aria-label="Pesquisar" /><button className="cg-botao" aria-label="Pesquisar cupom">Buscar</button></form>}
        <div className="cg-menu-acoes">
          <button className="cg-botao" aria-haspopup="menu" aria-expanded={exportar} onClick={(e) => { e.stopPropagation(); setExportar(!exportar); }}><Download size={16} /> Exportar</button>
          {exportar && <ul role="menu">
            <li><button role="menuitem" onClick={() => { setExportar(false); window.print(); }}>Impressão (PDF)</button></li>
            <li><button role="menuitem" onClick={() => { setExportar(false); void tentar(() => baixarPlanilha(tipo), "Planilha exportada."); }}>Planilha (CSV)</button></li>
          </ul>}
        </div>
      </div>
      {mostraAuto && <>
        <h2 className="cg-secao">Cupons automáticos</h2>
        <div className="cg-autos">{d?.automaticos.filter((c) => (autoStatus === "todos" || (autoStatus === "ativo") === (c.ativo === true)) && (!autoBusca.trim() || `${c.codigo} ${c.descricao ?? ""}`.toLowerCase().includes(autoBusca.trim().toLowerCase()))).map((c) => (
          <div className="cg-auto" key={String(c.codigo)}>
            <strong>{String(c.codigo)}</strong>
            <span>{String(c.descricao)}</span>
            <span><Selo tom="info">Automático</Selo> <Selo tom={c.ativo === true ? "ok" : "neutro"}>{c.ativo === true ? "Ativo" : "Inativo"}</Selo></span>
            <span>Cupom utilizado: <strong>{textoUsos(Number(c.usos))}</strong></span>
            <span>Limite de uso: <strong>{String(c.limite)}</strong></span>
            {Number(c.valor) > 0 && <small className="cg-mono">{c.tipoDesconto === "Percentual" ? `${c.valor}%` : dinheiro(Number(c.valor))}{c.valorMaximo ? `, teto ${dinheiro(Number(c.valorMaximo))}` : ""}</small>}
            <button className="cg-botao" onClick={() => setAuto(c)}>{c.ativo === true ? "Configurar" : "Ativar"}</button>
          </div>))}</div>
      </>}
      {mostraResg && <>
        <div className="cg-cupom-contadores">
          {([["Ativos", "Cupons ativos", c.ativos, <Check key="a" size={18} />], ["Inativos", "Cupons inativos", c.inativos, <X key="i" size={18} />], ["Aguardando", "Aguardando", c.aguardando, <Clock key="g" size={18} />]] as const).map(([id, rotulo, n, icone]) => (
            <button type="button" key={id} className={`cg-cupom-contador ${status === id ? "ativo" : ""}`} onClick={() => { setStatus(status === id ? "Todos" : id); setPagina(1); }}>{icone}<span>{rotulo}</span><strong>{n}</strong></button>))}
        </div>
        <h2 className="cg-secao">Seus cupons</h2>
        <div className="cg-cupom-lista">
          {d?.cupons.map((x) => (
            <article className={`cg-cupom ${TOM[String(x.grupo)] ?? "neutro"}`} key={x.id}>
              <div className="cg-cupom-topo">
                <div><strong>{String(x.codigo)}</strong><b>{x.tipoDesconto === "Percentual" ? pct(x.valor) : dinheiro(Number(x.valor))}</b></div>
                <div className="cg-cupom-selos"><Selo tom="neutro">{String(x.publicoRotulo)}</Selo><Selo tom={x.grupo === "Ativos" ? "ok" : x.grupo === "Aguardando" ? "alerta" : "neutro"}>{x.grupo === "Ativos" ? "Ativo" : x.grupo === "Aguardando" ? "Aguardando" : "Inativo"}</Selo></div>
              </div>
              <div className="cg-cupom-pe">
                <span>{String(x.detalhe)}</span>
                <span>Cupom utilizado: <strong>{textoUsos(x.usos)}</strong></span>
                <span className="cg-acoes">
                  <button className="cg-botao" onClick={() => setEditando(x)}>Editar</button>
                  <button className="cg-botao" onClick={() => void tentar(async () => { await api.salvarRegistro("cupons", x.id, { ativo: x.ativo !== true }); l.recarregar(); }, x.ativo === true ? "Cupom pausado." : "Cupom ativado.")}>{x.ativo === true ? "Pausar" : "Ativar"}</button>
                  <button className="cg-botao perigo" onClick={() => confirm(`Excluir o cupom ${x.codigo}?`) && void tentar(async () => { await api.apagarRegistro("cupons", x.id); l.recarregar(); }, "Cupom excluído.")}>Excluir</button>
                </span>
              </div>
            </article>))}
        </div>
        {d && !d.cupons.length && <div className="cg-tabela-caixa"><Vazio titulo="Nenhum cupom encontrado." /></div>}
        <Paginacao atual={d?.paginacao.atual ?? 1} total={d?.paginacao.totalPaginas ?? 1} onChange={setPagina} />
      </>}
      <Janela aberta={filtroAberto} titulo="Filtro de pesquisa" sub="Você pode filtrar um ou mais campos" onFechar={() => setFiltroAberto(false)} largura="pequena"
        rodape={<>
          <button className="cg-botao" onClick={() => setFiltroAberto(false)}>Cancelar</button>
          <button className="cg-botao" onClick={() => { setParceiros(false); setPagina(1); setFiltroAberto(false); }}>Limpar filtros</button>
          <button className="cg-botao primario" onClick={() => { setParceiros(parceirosForm === "1"); setPagina(1); setFiltroAberto(false); }}>Filtrar</button>
        </>}>
        <Campo rotulo="Ver cupons parceiros?"><select value={parceirosForm} onChange={(e) => setParceirosForm(e.target.value)}><option value="0">Não</option><option value="1">Sim</option></select></Campo>
      </Janela>
      {editando && <NovoCupom c={editando === "novo" ? null : editando} onFechar={() => setEditando(null)} onSalvo={() => l.recarregar()} />}
      {auto && <FormularioAutomatico c={auto} onFechar={() => setAuto(null)} onSalvo={() => l.recarregar()} />}
    </div>
  );
}

function FormularioAutomatico({ c, onFechar, onSalvo }: { c: Cupom; onFechar: () => void; onSalvo: () => void }) {
  const [f, setF] = useState({ tipoDesconto: String(c.tipoDesconto || "Percentual"), valor: Number(c.valor) > 0 ? String(c.valor) : "", valorMaximo: c.valorMaximo ? String(c.valorMaximo) : "", ativo: c.ativo === true });
  const { aviso, tentar } = useAviso();
  const salvar = async () => {
    const n = (v: string) => (v === "" ? null : Number(v.replace(",", ".")));
    const corpo: Record<string, unknown> = { ...c, tipoDesconto: f.tipoDesconto, valor: n(f.valor), valorMaximo: n(f.valorMaximo), ativo: f.ativo, automatico: true };
    for (const k of ["usos", "descontoTotal", "situacao", "limite", "id", "grupo", "publicoRotulo", "detalhe"]) delete corpo[k];
    if (await tentar(() => (c.id ? api.salvarRegistro("cupons", c.id, corpo) : api.criarRegistro("cupons", corpo)), "Cupom automático salvo.")) { onSalvo(); onFechar(); }
  };
  return (
    <Janela cheia aberta titulo={String(c.codigo)} sub={`${String(c.descricao)}. Limite de uso: ${String(c.limite)}.`} onFechar={onFechar} rodape={<><button className="cg-botao" onClick={onFechar}>Voltar</button><button className="cg-botao primario" onClick={() => void salvar()}>Gravar</button></>}>
      {aviso}
      <div className="cg-grade">
        <Campo rotulo="Tipo"><select value={f.tipoDesconto} onChange={(e) => setF({ ...f, tipoDesconto: e.target.value })}><option value="Percentual">% Porcentagem</option><option value="Valor fixo">R$ Fixo</option></select></Campo>
        <Campo rotulo="Valor"><input inputMode="decimal" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} /></Campo>
        <Campo rotulo="Teto Máx (R$)"><input inputMode="decimal" value={f.valorMaximo} onChange={(e) => setF({ ...f, valorMaximo: e.target.value })} /></Campo>
        <Campo rotulo="Situação"><select value={f.ativo ? "1" : "0"} onChange={(e) => setF({ ...f, ativo: e.target.value === "1" })}><option value="1">Ativo</option><option value="0">Inativo</option></select></Campo>
      </div>
    </Janela>
  );
}

const PASSOS = ["Configuração do cupom", "Período de validade", "Público", "Especificações", "Restrições"] as const;
const HORAS = Array.from({ length: 24 }, (_, i) => String(i)), MINUTOS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));
const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const maisMeses = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
const aHora = (v: unknown, padrao: string): [string, string] => { const m = /^(\d{2}):(\d{2})$/.exec(String(v ?? "")); return m ? [String(Number(m[1])), m[2]] : [padrao, padrao === "23" ? "59" : "00"]; };
const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(/\./g, "").replace(",", ".")));
const hhmm = (h: string, m: string) => `${h.padStart(2, "0")}:${m}`;

/** Novo cupom / Editar cupom em 5 passos, como na Machine. */
function NovoCupom({ c, onFechar, onSalvo }: { c: Cupom | null; onFechar: () => void; onSalvo: () => void }) {
  const t = (k: string) => (c?.[k] == null ? "" : String(c[k]));
  const [hi, mi] = aHora(c?.horaInicio, "0"), [hf, mf] = aHora(c?.horaFim, "23");
  const clientesIniciais: Cliente[] = (() => {
    try { const x = JSON.parse(t("clientes") || "[]"); if (Array.isArray(x) && x.length) return x as Cliente[]; } catch { /* usa o telefone antigo */ }
    return c?.clienteTelefone ? [{ telefone: String(c.clienteTelefone), nome: String(c.clienteNome ?? "") }] : [];
  })();
  const [passo, setPasso] = useState(0);
  const [f, setF] = useState({
    codigo: t("codigo"), tipoDesconto: t("tipoDesconto") || "Percentual", valor: t("valor").replace(".", ","), valorMaximo: t("valorMaximo").replace(".", ","),
    inicio: t("inicio") || hoje(), horaInicio: hi, minInicio: mi, fim: t("fim") || maisMeses(hoje(), 5), horaFim: hf, minFim: mf,
    publico: c ? (t("publico") === "especificos" || (!t("publico") && clientesIniciais.length > 0) ? "especificos" : "todos") : "todos",
    pagamentos: t("pagamentos").split(",").filter(Boolean) as FormaCupom[],
    limiteUso: (t("limiteUso") || (Number(c?.usoPorPassageiro) > 0 ? "por_passageiro" : "sem_limite")) as LimiteUso, usoPorPassageiro: t("usoPorPassageiro"),
    localAplicacao: t("localAplicacao") || "P", areaId: t("areaId"), exibirApp: c ? c.exibirApp !== false : true,
  });
  const [clientes, setClientes] = useState<Cliente[]>(clientesIniciais);
  const [busca, setBusca] = useState("");
  const areas = useCarregar(() => chamar<{ areas: Array<{ id: string; nome: string }> }>("GET", "/areas"), []);
  const achados = useCarregar(() => (busca.trim().length >= 2 ? chamar<{ clientes: Cliente[] }>("GET", `/cupons-clientes${consulta({ q: busca.trim() })}`) : Promise.resolve(null)), [busca]);
  const { aviso, tentar, setAviso } = useAviso();
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((a) => ({ ...a, [k]: v }));
  const percentual = f.tipoDesconto === "Percentual";

  const confere = (): string | null => {
    if (passo === 0) {
      if (!f.codigo.trim()) return "Informe o código promocional.";
      const v = num(f.valor);
      if (!v || v <= 0) return "Informe o valor do desconto.";
      if (percentual && v > 100) return "O desconto percentual não passa de 100%.";
    }
    if (passo === 1) {
      if (!f.inicio || !f.fim) return "Informe a data de início e a data de fim.";
      if (`${f.fim}T${hhmm(f.horaFim, f.minFim)}` <= `${f.inicio}T${hhmm(f.horaInicio, f.minInicio)}`) return "A data de fim precisa ser depois do início.";
    }
    if (passo === 2 && f.publico === "especificos" && !clientes.length) return "Escolha pelo menos um cliente.";
    if (passo === 3 && f.limiteUso === "por_passageiro" && !(Number(f.usoPorPassageiro) >= 1)) return "Informe quantas vezes cada passageiro pode usar.";
    return null;
  };
  const avancar = () => { const e = confere(); if (e) return setAviso({ texto: e, erro: true }); setPasso(passo + 1); };
  const salvar = async () => {
    const e = confere(); if (e) return setAviso({ texto: e, erro: true });
    const corpo: Record<string, unknown> = {
      ...(c ?? {}), codigo: f.codigo.trim().toUpperCase(), tipoDesconto: f.tipoDesconto, valor: num(f.valor), valorMaximo: num(f.valorMaximo),
      inicio: f.inicio, horaInicio: hhmm(f.horaInicio, f.minInicio), fim: f.fim, horaFim: hhmm(f.horaFim, f.minFim),
      publico: f.publico, clientes: f.publico === "especificos" ? JSON.stringify(clientes.map((x) => ({ telefone: x.telefone, nome: x.nome }))) : null,
      pagamentos: f.pagamentos.join(","), limiteUso: f.limiteUso, usoPorPassageiro: f.limiteUso === "por_passageiro" ? Number(f.usoPorPassageiro) : null,
      localAplicacao: f.areaId ? f.localAplicacao : "P", areaId: f.areaId || null, exibirApp: f.exibirApp, ativo: c ? c.ativo === true : true,
    };
    if (await tentar(() => (c ? api.salvarRegistro("cupons", c.id, corpo) : api.criarRegistro("cupons", corpo)), c ? "Cupom salvo." : "Cupom criado.")) { onSalvo(); onFechar(); }
  };
  const ultimo = passo === PASSOS.length - 1;
  return (
    <Janela aberta titulo={c ? "Editar cupom" : "Novo cupom"} sub={PASSOS[passo]} onFechar={onFechar} largura="media"
      rodape={<>
        {passo > 0 && <button className="cg-botao" onClick={() => setPasso(passo - 1)}>Voltar</button>}
        {ultimo ? <button className="cg-botao verde" onClick={() => void salvar()}>{c ? "Salvar cupom" : "Criar cupom"}</button> : <button className="cg-botao primario" onClick={avancar}>Continuar</button>}
      </>}>
      {aviso}
      <div className="cg-etapas" aria-label="Passos">{PASSOS.map((p, i) => <span key={p} title={p} className={i === passo ? "ativa" : ""}>{i + 1}</span>)}</div>
      {passo === 0 && (
        <div className="cg-grade">
          <Campo rotulo="Código promocional" dica="Este será o código que os clientes precisarão digitar para utilizar o cupom." className="larga"><input value={f.codigo} maxLength={30} placeholder="Ex: CUPOM10" onChange={(e) => set("codigo", e.target.value.toUpperCase().replace(/[^A-Z0-9_.-]/g, ""))} /></Campo>
          <div className="larga"><strong>Tipo</strong>
            <div className="cg-caixas" style={{ flexDirection: "row", marginTop: 6 }}>
              {([["Percentual", "Percentual"], ["Valor fixo", "Valor fixo"]] as const).map(([v, r]) => <label key={v}><input type="radio" name="tipo_desconto" checked={f.tipoDesconto === v} onChange={() => set("tipoDesconto", v)} />{r}</label>)}
            </div></div>
          <Campo rotulo="Valor do desconto"><div className="cg-duplo">{!percentual && <span>R$</span>}<input inputMode="decimal" value={f.valor} placeholder="0,00" onChange={(e) => set("valor", e.target.value)} />{percentual && <span>%</span>}</div></Campo>
          <Campo rotulo="Valor máximo de desconto"><div className="cg-duplo"><span>R$</span><input inputMode="decimal" value={f.valorMaximo} onChange={(e) => set("valorMaximo", e.target.value)} /></div></Campo>
          <p className="cg-info-bloco larga">O desconto máximo não se aplica a corridas com cupom realizadas por motoristas com o app em versão inferior a 20.6.</p>
        </div>
      )}
      {passo === 1 && (
        <div className="cg-grade">
          <Campo rotulo="Data de início"><input type="date" value={f.inicio} onChange={(e) => set("inicio", e.target.value)} /></Campo>
          <Campo rotulo="Hora de início"><div className="cg-duplo"><select aria-label="Hora de início" value={f.horaInicio} onChange={(e) => set("horaInicio", e.target.value)}>{HORAS.map((h) => <option key={h}>{h}</option>)}</select><span>:</span><select aria-label="Minuto de início" value={f.minInicio} onChange={(e) => set("minInicio", e.target.value)}>{MINUTOS.map((m) => <option key={m}>{m}</option>)}</select></div></Campo>
          <Campo rotulo="Data de fim"><input type="date" value={f.fim} onChange={(e) => set("fim", e.target.value)} /></Campo>
          <Campo rotulo="Hora de fim"><div className="cg-duplo"><select aria-label="Hora de fim" value={f.horaFim} onChange={(e) => set("horaFim", e.target.value)}>{HORAS.map((h) => <option key={h}>{h}</option>)}</select><span>:</span><select aria-label="Minuto de fim" value={f.minFim} onChange={(e) => set("minFim", e.target.value)}>{MINUTOS.map((m) => <option key={m}>{m}</option>)}</select></div></Campo>
        </div>
      )}
      {passo === 2 && (
        <>
          <strong>Quem pode usar o cupom?</strong>
          <div className="cg-caixas" style={{ margin: "8px 0" }}>
            <label><input type="radio" name="publico" checked={f.publico === "todos"} onChange={() => set("publico", "todos")} />Todos os clientes</label>
            <label><input type="radio" name="publico" checked={f.publico === "especificos"} onChange={() => set("publico", "especificos")} />Clientes específicos</label>
          </div>
          {f.publico === "especificos" && <>
            <p className="cg-info-bloco">Ao selecionar clientes específicos o cupom será aplicado automaticamente na corrida do passageiro, sem necessidade de ser resgatado pelo código.</p>
            <Campo rotulo="Buscar cliente"><input value={busca} placeholder="Nome, CPF ou telefone do cliente" onChange={(e) => setBusca(e.target.value)} /></Campo>
            {achados.dados?.clientes.filter((x) => !clientes.some((y) => y.telefone === x.telefone)).map((x) => <p key={x.telefone} style={{ margin: "4px 0" }}><button className="cg-botao" onClick={() => { setClientes([...clientes, x]); setBusca(""); }}>+ {x.nome} <small className="cg-mono">{x.telefone}</small></button></p>)}
            <h4 className="cg-secao">Clientes selecionados ({clientes.length})</h4>
            {clientes.map((x) => <div className="cg-resumo-linha" key={x.telefone}><span>{x.nome || "Sem nome"} <small className="cg-mono">{x.telefone}</small></span><button className="cg-botao perigo" onClick={() => setClientes(clientes.filter((y) => y.telefone !== x.telefone))}>Remover</button></div>)}
          </>}
        </>
      )}
      {passo === 3 && (
        <>
          <strong>Aplicar para os pagamentos em</strong>
          <div className="cg-caixas" style={{ margin: "8px 0" }}>
            {FORMAS_CUPOM.map(([v, r]) => <label key={v}><input type="checkbox" name="tipo_pagamento" checked={f.pagamentos.includes(v)} onChange={() => set("pagamentos", f.pagamentos.includes(v) ? f.pagamentos.filter((x) => x !== v) : [...f.pagamentos, v])} />{r}</label>)}
          </div>
          <p className="cg-info-bloco">Atenção: o cupom só pode ser aplicado se ao menos um dos métodos de pagamento configurados sejam aceitos na central principal ou central associada. Sem nenhum marcado, vale para todos.</p>
          <h4 className="cg-secao">Limite de uso</h4>
          <div className="cg-caixas">
            {LIMITES_USO.map(([v, r, ajuda]) => <label key={v} title={ajuda}><input type="radio" name="limite_uso" checked={f.limiteUso === v} onChange={() => set("limiteUso", v)} /><span>{r}<small style={{ display: "block", fontWeight: 400 }}>{ajuda}</small></span></label>)}
          </div>
          {f.limiteUso === "por_passageiro" && <Campo rotulo="Quantas vezes cada passageiro pode usar"><input type="number" min={1} value={f.usoPorPassageiro} onChange={(e) => set("usoPorPassageiro", e.target.value)} /></Campo>}
        </>
      )}
      {passo === 4 && (
        <>
          <strong>Restringir por localização <small>(Opcional)</small></strong>
          <div className="cg-duplo" style={{ margin: "8px 0", flexWrap: "wrap" }}>
            <span>Aplicar em</span>
            <select aria-label="Aplicar em" value={f.localAplicacao} onChange={(e) => set("localAplicacao", e.target.value)}><option value="P">Partida</option><option value="D">Destino</option></select>
            <span>quando localização for</span>
            <select aria-label="Área" value={f.areaId} onChange={(e) => set("areaId", e.target.value)}><option value="">Selecione</option>{areas.dados?.areas.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</select>
          </div>
          {f.localAplicacao === "D" && <p className="cg-info-bloco">A aplicação do cupom para um local de destino específico está disponível a partir da versão 28.5 do app passageiro.</p>}
          <h4 className="cg-secao">Exibição no app passageiro</h4>
          <label className="cg-interruptor"><input type="checkbox" name="exibir-app" checked={f.exibirApp} onChange={(e) => set("exibirApp", e.target.checked)} /><i /><span>Exibir na lista de cupons disponíveis no app</span></label>
          <p style={{ color: "var(--cg-suave)", fontSize: 12 }}>Permite que o passageiro visualize e selecione o cupom sem precisar digitar o código.</p>
        </>
      )}
    </Janela>
  );
}
