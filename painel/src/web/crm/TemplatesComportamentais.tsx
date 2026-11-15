import { useState } from "react";
import { Clock, Edit3, Info, Package, Plus, Send, Trash2 } from "lucide-react";
import { MODELOS_COMPORTAMENTAIS } from "../../crm/comportamento-modelos.ts";
import { Cartao, Gaveta, useCarregar } from "../componentes/ui";
import { quandoReal } from "./api";
import { automacao, type TemplateComportamental } from "./api-automacao";
import { useGestor, useRetorno } from "./comum";

const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const hh = (h: number) => `${String(h).padStart(2, "0")}h`;
const faixa = (t: { hour_start: number; hour_end: number }) => (t.hour_start === 0 && t.hour_end === 23 ? "qualquer hora" : `${hh(t.hour_start)} a ${hh(t.hour_end)}`);
const diasTexto = (d: number[]) => (d.length === 7 ? "todos os dias" : d.length === 5 && [1, 2, 3, 4, 5].every((x) => d.includes(x)) ? "dias úteis" : d.map((x) => DOW[x]).join(", "));

/** CRM › Automação › Templates Comportamentais: a mensagem sai ANTES da hora em que o passageiro costuma chamar. */
export default function TemplatesComportamentais() {
  const { dados, erro, recarregar } = useCarregar(() => automacao.comportamentais(), []);
  const gestor = useGestor();
  const { tentar, caixa } = useRetorno();
  const [editando, setEditando] = useState<Partial<TemplateComportamental> | null>(null);
  const [instalando, setInstalando] = useState(false);
  const linhas = dados?.templates ?? [];
  const testar = async (t: TemplateComportamental) => {
    const fone = prompt("Telefone para o teste (com DDD):");
    if (!fone) return;
    const r = await tentar(() => automacao.testarComportamental(t.id, fone));
    if (r) alert(r.sent ? "Teste enviado (WhatsApp)." : `Não enviado: ${r.error ?? "falha"}`);
  };
  return (
    <div className="pilha">
      <Cartao>
        <p style={{ margin: 0 }}><Info size={14} /> A 1ª mensagem sai <strong>antes</strong> da hora em que o passageiro costuma chamar (pré-janela). A 2ª, se configurada, sai alguns minutos depois só para quem ainda não fez corrida (meio-janela). Cada pessoa recebe no máximo 1 vez por dia por template. Precisa da análise da aba Comportamentos.</p>
      </Cartao>
      {caixa}
      {erro && <div className="aviso erro">{erro}</div>}
      {gestor && (
        <div className="acoes" style={{ justifyContent: "flex-end" }}>
          <button className="botao" onClick={() => setInstalando(true)}><Package size={14} /> Instalar templates</button>
          <button className="botao primario" onClick={() => setEditando({})}><Plus size={14} /> Novo template</button>
        </div>
      )}
      {dados && !linhas.length && <Cartao><p className="vazio"><Clock size={16} /> Nenhum template comportamental. Comece por Instalar templates.</p></Cartao>}
      <div className="grade">
        {linhas.map((t) => (
          <Cartao key={t.id}>
            <div className="linha-filtro" style={{ alignItems: "flex-start" }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0 }}><strong>{t.name}</strong> <span className={`selo ${t.is_active ? "ok" : ""}`}>{t.is_active ? "Ativo" : "Desativado"}</span></p>
                <p className="sub" style={{ margin: "4px 0" }}>{faixa(t)} · {diasTexto(t.weekdays)} · {t.lead_minutes} min antes · WhatsApp</p>
                <p className="sub" style={{ margin: "4px 0" }}><strong>{t.title}</strong> {t.body}</p>
                {t.second_after_minutes && t.second_body && <p className="sub" style={{ margin: "4px 0" }}>2ª notificação {t.second_after_minutes} min depois: {t.second_title}</p>}
                <p className="sub" style={{ margin: "4px 0" }}>{(t.sent_count ?? 0).toLocaleString("pt-BR")} envio(s){t.last_run_at ? ` · última rodada ${quandoReal(t.last_run_at)}` : ""}</p>
              </div>
              {gestor && <input type="checkbox" role="switch" aria-label="Ativo" checked={t.is_active} onChange={() => tentar(() => automacao.ligarComportamental(t.id)).then(recarregar)} />}
            </div>
            {gestor && (
              <div className="acoes">
                <button className="botao" onClick={() => testar(t)}><Send size={14} /> Enviar teste</button>
                <button className="icone" title="Editar" aria-label="Editar" onClick={() => setEditando(t)}><Edit3 size={14} /></button>
                <button className="icone" title="Excluir" aria-label="Excluir" onClick={() => confirm(`Excluir o template "${t.name}"?`) && tentar(() => automacao.apagarComportamental(t.id)).then(recarregar)}><Trash2 size={14} /></button>
              </div>
            )}
          </Cartao>
        ))}
      </div>
      <Gaveta aberta={instalando} onFechar={() => setInstalando(false)} titulo="Instalar templates comportamentais" larga>
        {instalando && <Instalador instalados={new Set(linhas.map((t) => t.template_key).filter(Boolean) as string[])} onFeito={(n) => { setInstalando(false); recarregar(); alert(`${n} template(s) instalado(s) desativados. Revise e ative.`); }} />}
      </Gaveta>
      <Gaveta aberta={!!editando} onFechar={() => setEditando(null)} titulo={editando?.id ? "Editar template comportamental" : "Novo template comportamental"} larga>
        {editando && <Formulario t={editando} onSalvo={() => { setEditando(null); recarregar(); }} />}
      </Gaveta>
    </div>
  );
}

function Instalador({ instalados, onFeito }: { instalados: Set<string>; onFeito: (n: number) => void }) {
  const livres = MODELOS_COMPORTAMENTAIS.filter((p) => !instalados.has(p.key));
  const [sel, setSel] = useState<Set<string>>(new Set());
  const { tentar, caixa } = useRetorno();
  const instalar = async () => { const r = await tentar(() => automacao.instalarComportamentais([...sel])); if (r) onFeito(r.instalados); };
  return (
    <div className="form">
      {caixa}
      <div className="linha-filtro">
        <small className="sub">{livres.length} de {MODELOS_COMPORTAMENTAIS.length} disponível(is)</small>
        <button className="botao" onClick={() => setSel(sel.size === livres.length ? new Set() : new Set(livres.map((p) => p.key)))}>{sel.size === livres.length && livres.length > 0 ? "Desmarcar todos" : "Selecionar todos"}</button>
      </div>
      <div className="grade" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
        {MODELOS_COMPORTAMENTAIS.map((p) => {
          const feito = instalados.has(p.key);
          return (
            <button key={p.key} type="button" disabled={feito} className="cartao" style={{ textAlign: "left", marginBottom: 0, opacity: feito ? 0.5 : 1, borderColor: sel.has(p.key) ? "var(--primaria)" : undefined, cursor: feito ? "default" : "pointer" }}
              onClick={() => setSel((s) => { const n = new Set(s); if (n.has(p.key)) n.delete(p.key); else n.add(p.key); return n; })}>
              <strong>{p.emoji} {p.name}</strong>
              <p className="sub" style={{ margin: "4px 0" }}>{p.description}</p>
              <small className="sub">{faixa(p)} · {diasTexto(p.weekdays)}{feito ? " · Já instalado" : ""}</small>
            </button>
          );
        })}
      </div>
      <div className="acoes"><button className="botao primario" disabled={sel.size === 0} onClick={instalar}><Package size={14} /> Instalar ({sel.size})</button></div>
    </div>
  );
}

function Formulario({ t, onSalvo }: { t: Partial<TemplateComportamental>; onSalvo: () => void }) {
  const [f, setF] = useState({
    name: t.name ?? "", description: t.description ?? "", hour_start: t.hour_start ?? 7, hour_end: t.hour_end ?? 9, weekdays: t.weekdays ?? [0, 1, 2, 3, 4, 5, 6],
    match_weekday: t.match_weekday ?? true, lead_minutes: t.lead_minutes ?? 30, min_rides: t.min_rides ?? 2, min_inactive_days: t.min_inactive_days ?? null, max_inactive_days: t.max_inactive_days ?? null,
    min_cancel_rate: t.min_cancel_rate ?? null, title: t.title ?? "", body: t.body ?? "", second_after_minutes: t.second_after_minutes ?? null, second_title: t.second_title ?? "", second_body: t.second_body ?? "",
    max_per_run: t.max_per_run ?? 300,
  });
  const { tentar, caixa } = useRetorno();
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const opc = (v: string) => (v.trim() === "" ? null : Math.max(0, Number(v) || 0));
  const horas = Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hh(h)}</option>);
  const salvar = async () => { const r = await tentar(() => automacao.salvarComportamental(t.id ?? null, f)); if (r) onSalvo(); };
  return (
    <div className="form">
      {caixa}
      <div className="grade" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
        <label>Nome<input value={f.name} onChange={(e) => set("name", e.target.value)} /></label>
        <label>Descrição<input value={f.description} onChange={(e) => set("description", e.target.value)} /></label>
      </div>
      <h3 className="sub">Para quem e quando</h3>
      <div className="grade" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
        <label>Hora preferida de<select value={f.hour_start} onChange={(e) => set("hour_start", Number(e.target.value))}>{horas}</select></label>
        <label>até<select value={f.hour_end} onChange={(e) => set("hour_end", Number(e.target.value))}>{horas}</select></label>
        <label>Enviar (min antes)<input type="number" min={0} max={180} value={f.lead_minutes} onChange={(e) => set("lead_minutes", Number(e.target.value) || 0)} /></label>
        <label>Mín. de corridas<input type="number" min={0} value={f.min_rides} onChange={(e) => set("min_rides", Number(e.target.value) || 0)} /></label>
        <label>Sem corrida há (mín. dias)<input type="number" min={0} value={f.min_inactive_days ?? ""} placeholder="-" onChange={(e) => set("min_inactive_days", opc(e.target.value))} /></label>
        <label>No máximo há (dias)<input type="number" min={0} value={f.max_inactive_days ?? ""} placeholder="-" onChange={(e) => set("max_inactive_days", opc(e.target.value))} /></label>
        <label>Cancela pelo menos (%)<input type="number" min={0} max={100} value={f.min_cancel_rate ?? ""} placeholder="-" onChange={(e) => set("min_cancel_rate", opc(e.target.value))} /></label>
        <label>Máx. por rodada<input type="number" min={1} value={f.max_per_run} onChange={(e) => set("max_per_run", Math.max(1, Number(e.target.value) || 1))} /></label>
      </div>
      <div className="periodo">
        {DOW.map((d, i) => <button key={d} type="button" className={f.weekdays.includes(i) ? "chip ativo" : "chip"} onClick={() => set("weekdays", f.weekdays.includes(i) ? f.weekdays.filter((x) => x !== i) : [...f.weekdays, i].sort())}>{d}</button>)}
      </div>
      <label className="check"><input type="checkbox" checked={f.match_weekday} onChange={(e) => set("match_weekday", e.target.checked)} /> Só no dia preferido do passageiro <small className="sub">(desligado: qualquer um dos dias marcados acima)</small></label>
      <h3 className="sub">1ª notificação (pré-janela)</h3>
      <label>Título (até 40)<input value={f.title} maxLength={40} onChange={(e) => set("title", e.target.value)} placeholder="Título (até 40)" /></label>
      <label>Mensagem (até 255). Use {"{{nome}}"}, {"{{empresa}}"}<textarea rows={2} value={f.body} maxLength={255} onChange={(e) => set("body", e.target.value)} /></label>
      <h3 className="sub">2ª notificação (meio-janela, opcional)</h3>
      <div className="grade" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
        <label>Minutos depois (vazio = sem)<input type="number" min={0} value={f.second_after_minutes ?? ""} onChange={(e) => set("second_after_minutes", opc(e.target.value))} /></label>
        <label>Título (até 40)<input value={f.second_title ?? ""} maxLength={40} onChange={(e) => set("second_title", e.target.value)} /></label>
      </div>
      <label>Só sai para quem ainda não fez corrida<textarea rows={2} value={f.second_body ?? ""} maxLength={255} onChange={(e) => set("second_body", e.target.value)} /></label>
      <div className="acoes"><button className="botao primario" onClick={salvar}>Salvar</button></div>
      {!t.id && <small className="sub">O template nasce desativado. Ative na lista quando estiver pronto.</small>}
    </div>
  );
}
