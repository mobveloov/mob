// Peças comuns das telas de Financeiro, Comunicação, Config, Avaliações e Ajuda.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { dinheiro } from "../../api";
import { useCarregar } from "../../componentes/ui";

export { dinheiro, useCarregar };

/** Chamada ao servidor (/api/config/...), com a empresa escolhida (usuário da plataforma). */
export async function pedirConfig<T = any>(url: string, metodo = "GET", corpo?: unknown): Promise<T> {
  const h: Record<string, string> = {};
  let emp = "";
  try { emp = localStorage.getItem("empresa") ?? ""; } catch { /* sem armazenamento */ }
  if (emp) h["X-Empresa"] = emp;
  if (corpo !== undefined) h["Content-Type"] = "application/json";
  const r = await fetch(`/api/config${url}`, { method: metodo, headers: h, credentials: "same-origin", body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((b as { erro?: string }).erro || `Erro ${r.status}`);
  return b as T;
}

/** Quem pode salvar (administrador). */
let papelUsuario: Promise<string> | null = null;
export function useAdmin() {
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    papelUsuario ??= fetch("/api/sessao", { credentials: "same-origin" }).then((r) => r.json()).then((s) => String(s?.usuario?.papel ?? "")).catch(() => "");
    let vivo = true;
    papelUsuario.then((p) => { if (vivo) setAdmin(p === "admin" || p === "plataforma"); });
    return () => { vivo = false; };
  }, []);
  return admin;
}

export function Cab({ titulo, sub, children }: { titulo: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="dm-cab">
      <div><h1>{titulo}</h1>{sub && <p>{sub}</p>}</div>
      <div className="dm-cab-acoes">{children}</div>
    </div>
  );
}

export function Aviso({ erro, ok }: { erro?: string | null; ok?: string | null }) {
  if (erro) return <div className="aviso erro" role="alert">{erro}</div>;
  if (ok) return <div className="aviso ok" role="status">{ok}</div>;
  return null;
}

export function Modal({ aberto, onFechar, titulo, sub, children, larga }: { aberto: boolean; onFechar: () => void; titulo: string; sub?: string; children: ReactNode; larga?: boolean }) {
  useEffect(() => {
    if (!aberto) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aberto, onFechar]);
  if (!aberto) return null;
  return (
    <div className="dm-fundo" onClick={onFechar}>
      <div className={`dm-modal ${larga ? "larga" : ""}`} role="dialog" aria-label={titulo} onClick={(e) => e.stopPropagation()}>
        <div className="dm-modal-topo"><div><h2>{titulo}</h2>{sub && <p>{sub}</p>}</div><button className="icone" onClick={onFechar} aria-label="Fechar"><X size={18} /></button></div>
        <div className="dm-modal-corpo">{children}</div>
      </div>
    </div>
  );
}

export function Campo({ rotulo, dica, children, className }: { rotulo: string; dica?: ReactNode; children: ReactNode; className?: string }) {
  return <label className={`dm-campo ${className ?? ""}`}><span>{rotulo}</span>{children}{dica && <small>{dica}</small>}</label>;
}

export function Interruptor({ valor, onChange, rotulo, descricao, desabilitado }: { valor: boolean; onChange: (v: boolean) => void; rotulo?: string; descricao?: string; desabilitado?: boolean }) {
  return (
    <div className="dm-interruptor-linha">
      {(rotulo || descricao) && <div><strong>{rotulo}</strong>{descricao && <small>{descricao}</small>}</div>}
      <button type="button" role="switch" aria-checked={valor} aria-label={rotulo ?? "Ligar ou desligar"} disabled={desabilitado} className={`dm-interruptor ${valor ? "ligado" : ""}`} onClick={() => onChange(!valor)}><i /></button>
    </div>
  );
}

export function Abas<T extends string>({ abas, valor, onChange }: { abas: Array<[T, string]>; valor: T; onChange: (v: T) => void }) {
  return <div className="dm-abas" role="tablist">{abas.map(([id, nome]) => <button key={id} role="tab" aria-selected={valor === id} className={valor === id ? "ativo" : ""} onClick={() => onChange(id)}>{nome}</button>)}</div>;
}

const PERIODOS: Array<[string, string]> = [["hoje", "Hoje"], ["ontem", "Ontem"], ["semana_passada", "Semana Passada"], ["ultimos_7", "Últimos 7 dias"], ["ultimos_30", "Últimos 30 dias"], ["mes_atual", "Mês Atual"], ["mes_passado", "Mês Passado"], ["ano_passado", "Ano Passado"]];
export interface PeriodoSel { chave: string; inicio: string; fim: string }
export const PERIODO_MES: PeriodoSel = { chave: "mes_atual", inicio: "", fim: "" };
export const textoPeriodo = (p: PeriodoSel) => (p.chave === "personalizado" ? `${p.inicio.split("-").reverse().join("/")} - ${p.fim.split("-").reverse().join("/")}` : (PERIODOS.find(([c]) => c === p.chave) ?? PERIODOS[5])[1]);
export const queryPeriodo = (p: PeriodoSel) => `periodo=${p.chave}${p.chave === "personalizado" ? `&inicio=${p.inicio}&fim=${p.fim}` : ""}`;

/** Filtro de período em lista suspensa (Hoje, Ontem, ... Personalizado). */
export function FiltroPeriodo({ valor, onChange, extras }: { valor: PeriodoSel; onChange: (p: PeriodoSel) => void; extras?: Array<[string, string]> }) {
  const [aberto, setAberto] = useState(false);
  const [de, setDe] = useState(""), [ate, setAte] = useState("");
  const [perso, setPerso] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as Node)) setAberto(false); };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);
  const lista = [...(extras ?? []), ...PERIODOS];
  return (
    <div className="dm-dropdown" ref={caixa}>
      <button type="button" className="botao" aria-haspopup="listbox" aria-expanded={aberto} onClick={() => setAberto(!aberto)}>{(lista.find(([c]) => c === valor.chave) ?? ["", textoPeriodo(valor)])[1]} ▾</button>
      {aberto && (
        <div className="dm-dropdown-menu" role="listbox">
          {lista.map(([c, n]) => <button key={c} role="option" aria-selected={valor.chave === c} onClick={() => { onChange({ chave: c, inicio: "", fim: "" }); setAberto(false); setPerso(false); }}>{n}</button>)}
          <button onClick={() => setPerso(!perso)}>Personalizado...</button>
          {perso && (
            <div className="dm-perso">
              <input type="date" value={de} onChange={(e) => setDe(e.target.value)} aria-label="Data inicial" />
              <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} aria-label="Data final" />
              <button className="botao primario" disabled={!de} onClick={() => { onChange({ chave: "personalizado", inicio: de, fim: ate || de }); setAberto(false); }}>Aplicar</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const Carregando = ({ texto = "Carregando..." }: { texto?: string }) => <p className="vazio" role="status">{texto}</p>;
export const dataBr = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
export const dataHoraBr = (s: string | null | undefined) => (s ? new Date(s).toLocaleString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

/** Botão de salvar com mensagem de resultado. */
export function useSalvar() {
  const [msg, setMsg] = useState<{ ok?: string; erro?: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  async function salvar<T>(fn: () => Promise<T>, textoOk = "Salvo.") {
    setSalvando(true); setMsg(null);
    try { const r = await fn(); setMsg({ ok: textoOk }); return r; } catch (e) { setMsg({ erro: (e as Error).message }); return undefined; } finally { setSalvando(false); }
  }
  return { msg, salvando, salvar, setMsg };
}
