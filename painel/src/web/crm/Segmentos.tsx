import { useState } from "react";
import { Copy, Edit3, Plus, RefreshCw, Tag, Trash2, Users } from "lucide-react";
import { ESTAGIO_ROTULO, RFM_SEGMENTOS } from "../../crm2/catalogo.ts";
import type { RegrasSegmento } from "../../crm/segmentos.ts";
import { Cartao, Gaveta, useCarregar } from "../componentes/ui";
import { automacao, type Segmento } from "./api-automacao";
import { useGestor, useRetorno } from "./comum";

function chips(r: RegrasSegmento & { birthday_week?: boolean }): string[] {
  const c: string[] = [];
  if (r.stage) c.push(`Estágio: ${(Array.isArray(r.stage) ? r.stage : [r.stage]).map((x) => ESTAGIO_ROTULO[x] ?? x).join(" / ")}`);
  if (r.total_rides_min != null) c.push(`≥ ${r.total_rides_min} corridas`);
  if (r.total_rides_max != null) c.push(`≤ ${r.total_rides_max} corridas`);
  if (r.cancelations_min != null) c.push(`≥ ${r.cancelations_min} cancel.`);
  if (r.simulations_min != null) c.push(`≥ ${r.simulations_min} simulações s/ pedir`);
  if (r.total_spent_min != null) c.push(`gasto ≥ R$ ${r.total_spent_min}`);
  if (r.has_tag) c.push(`tag: ${r.has_tag}`);
  if (r.rfm_segment) c.push(`RFM: ${RFM_SEGMENTOS[r.rfm_segment]?.label ?? r.rfm_segment}`);
  if (r.inactive_days_min != null) c.push(`sem corrida há ≥ ${r.inactive_days_min} dias`);
  if (r.inactive_days_max != null) c.push(`até ${r.inactive_days_max} dias`);
  if (r.city) c.push(`cidade: ${r.city}`);
  if (r.opt_in_only) c.push("só com opt-in");
  if (r.birthday_week) c.push("aniversário nos próximos 7 dias");
  return c;
}

/** CRM › Público › Segmentos: listas dinâmicas para campanhas e automações. */
export default function Segmentos() {
  const { dados, erro, recarregar } = useCarregar(() => automacao.segmentos(), []);
  const gestor = useGestor();
  const { tentar, caixa } = useRetorno();
  const [editando, setEditando] = useState<Segmento | "novo" | null>(null);
  return (
    <div className="pilha">
      <div className="linha-filtro">
        <p className="sub" style={{ margin: 0 }}>Segmentos dinâmicos para campanhas e automações</p>
        {gestor && (
          <div className="acoes">
            <button className="botao" onClick={() => tentar(() => automacao.segmentosProntos(), (r) => `${r.criados} segmento(s) criado(s).`).then(recarregar)}><Plus size={14} /> Segmentos Prontos</button>
            <button className="botao primario" onClick={() => setEditando("novo")}><Plus size={14} /> Novo Segmento</button>
          </div>
        )}
      </div>
      {caixa}
      {erro && <div className="aviso erro">{erro}</div>}
      {dados && !dados.segmentos.length && <Cartao><p className="vazio"><Tag size={16} /> Nenhum segmento criado. Use 'Segmentos Prontos' para criar os pré-configurados ou crie um personalizado.</p></Cartao>}
      {dados?.segmentos.map((s) => (
        <Cartao key={s.id}>
          <div className="linha-filtro" style={{ alignItems: "flex-start" }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ margin: "0 0 4px" }}><strong>{s.name}</strong> {s.is_preset && <span className="selo info">Pronto</span>} <span className={`selo ${s.is_dynamic ? "ok" : ""}`}>{s.is_dynamic ? "Dinâmico" : "Estático"}</span></p>
              {s.description && <p className="sub" style={{ margin: "0 0 6px" }}>{s.description}</p>}
              <div className="periodo">{chips(s.rules).map((c) => <span key={c} className="chip">{c}</span>)}</div>
              <small className="sub"><Users size={11} /> {s.estimated_count.toLocaleString("pt-BR")} estimados · atualizado {new Date(s.updated_at).toLocaleDateString("pt-BR")}</small>
            </div>
            <div className="acoes">
              <button className="icone" title="Recontar quem entra hoje" aria-label="Recontar" onClick={() => tentar(() => automacao.recontarSegmento(s.id)).then(recarregar)}><RefreshCw size={14} /></button>
              {gestor && <button className="icone" title="Editar" aria-label="Editar" onClick={() => setEditando(s)}><Edit3 size={14} /></button>}
              {gestor && <button className="icone" title="Duplicar" aria-label="Duplicar" onClick={() => tentar(() => automacao.salvarSegmento(null, { name: `${s.name} (cópia)`, description: s.description ?? "", rules: s.rules as Record<string, unknown> })).then(recarregar)}><Copy size={14} /></button>}
              {gestor && <button className="icone" title="Excluir" aria-label="Excluir" onClick={() => confirm("Excluir este segmento?") && tentar(() => automacao.apagarSegmento(s.id)).then(recarregar)}><Trash2 size={14} /></button>}
            </div>
          </div>
        </Cartao>
      ))}
      <Gaveta aberta={!!editando} onFechar={() => setEditando(null)} titulo={editando && editando !== "novo" ? "Editar Segmento" : "Novo Segmento"}>
        {editando && <Formulario s={editando === "novo" ? null : editando} onSalvo={() => { setEditando(null); recarregar(); }} />}
      </Gaveta>
    </div>
  );
}

function Formulario({ s, onSalvo }: { s: Segmento | null; onSalvo: () => void }) {
  const r = (s?.rules ?? {}) as RegrasSegmento;
  const str = (v: unknown) => (v != null && v !== "" ? String(v) : "");
  const [nome, setNome] = useState(s?.name ?? "");
  const [desc, setDesc] = useState(s?.description ?? "");
  const [stage, setStage] = useState<string>(Array.isArray(r.stage) ? "__multi" : str(r.stage) || "all");
  const [f, setF] = useState({ min: str(r.total_rides_min), max: str(r.total_rides_max), canc: str(r.cancelations_min), sims: str(r.simulations_min), gasto: str(r.total_spent_min), tag: str(r.has_tag), cidade: str(r.city), inMin: str(r.inactive_days_min), inMax: str(r.inactive_days_max) });
  const [rfm, setRfm] = useState(str(r.rfm_segment) || "all");
  const [optIn, setOptIn] = useState(!!r.opt_in_only);
  const { tentar, caixa } = useRetorno();
  const mudar = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const salvar = async () => {
    const rules: Record<string, unknown> = { ...(r.birthday_week ? { birthday_week: true } : {}), ...(stage === "__multi" ? { stage: r.stage } : stage !== "all" ? { stage } : {}) };
    if (f.min) rules.total_rides_min = Number(f.min);
    if (f.max) rules.total_rides_max = Number(f.max);
    if (f.canc) rules.cancelations_min = Number(f.canc);
    if (f.sims) rules.simulations_min = Number(f.sims);
    if (f.gasto) rules.total_spent_min = Number(f.gasto);
    if (f.tag.trim()) rules.has_tag = f.tag.trim();
    if (rfm !== "all") rules.rfm_segment = rfm;
    if (f.inMin) rules.inactive_days_min = Number(f.inMin);
    if (f.inMax) rules.inactive_days_max = Number(f.inMax);
    if (f.cidade.trim()) rules.city = f.cidade.trim();
    if (optIn) rules.opt_in_only = true;
    if (await tentar(() => automacao.salvarSegmento(s?.id ?? null, { name: nome, description: desc, rules }))) onSalvo();
  };
  const campo = (rot: string, k: keyof typeof f, ph: string, tipo = "number") => <label>{rot}<input type={tipo} value={f[k]} placeholder={ph} onChange={(e) => mudar(k, e.target.value)} /></label>;
  return (
    <div className="form">
      {caixa}
      <label>Nome<input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Passageiros de alto valor" /></label>
      <label>Descrição<input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Descrição opcional" /></label>
      <h3 className="sub">Regras de Segmentação</h3>
      <label>Estágio
        <select value={stage} onChange={(e) => setStage(e.target.value)}>
          <option value="all">Qualquer estágio</option>
          {stage === "__multi" && <option value="__multi">{chips({ stage: r.stage })[0]} (original)</option>}
          {Object.entries(ESTAGIO_ROTULO).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      <div className="grade" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
        {campo("Corridas mín.", "min", "0")}{campo("Corridas máx.", "max", "999")}{campo("Cancelamentos mín.", "canc", "0")}{campo("Simulações s/ conversão mín.", "sims", "0")}
        {campo("Gasto total mín. (R$)", "gasto", "0")}{campo("Contém tag", "tag", "Ex: vip", "text")}
        <label>Grupo RFM
          <select value={rfm} onChange={(e) => setRfm(e.target.value)}><option value="all">Qualquer</option>{Object.entries(RFM_SEGMENTOS).filter(([k]) => k !== "sem_analise").map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        </label>
        {campo("Cidade", "cidade", "Todas", "text")}{campo("Sem corrida há pelo menos (dias)", "inMin", "-")}{campo("No máximo há (dias, teto)", "inMax", "-")}
      </div>
      <label className="check"><input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} /> Apenas com opt-in <small className="sub">Inclui somente contatos com consentimento ativo</small></label>
      <div className="acoes"><button className="botao primario" disabled={!nome.trim()} onClick={salvar}>{s ? "Salvar" : "Criar Segmento"}</button></div>
    </div>
  );
}
