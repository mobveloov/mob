// Peças comuns das telas do grupo Cadastro: chamada à API da gestão, janelas, abas, campos e paginação.

import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { empresaEscolhidaAgora } from "../../api";
import "./cadastro.css";

export async function chamar<T = Record<string, unknown>>(metodo: "GET" | "POST" | "PUT" | "DELETE", caminho: string, corpo?: unknown, base = "/api/gestao"): Promise<T> {
  const headers: Record<string, string> = {};
  if (corpo !== undefined) headers["Content-Type"] = "application/json";
  const emp = empresaEscolhidaAgora();
  if (emp) headers["X-Empresa"] = emp;
  const r = await fetch(`${base}${caminho}`, { method: metodo, headers, credentials: "same-origin", body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { erro?: string }).erro || `Erro ${r.status}`);
  return j as T;
}

/** Monta ?a=1&b=2 sem vazios. */
export const consulta = (o: Record<string, unknown>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== "" && v !== false) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const dinheiro = (n: number | null | undefined) => (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const dataBr = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");
export const dataHoraBr = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "");
export const mascaraCpf = (v: string) => v.replace(/\D/g, "").slice(0, 11).replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
export const mascaraTel = (v: string) => v.replace(/\D/g, "").slice(0, 11).replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4,5})(\d{4})$/, "$1-$2");

/** Avisos curtos (sucesso/erro), no canto da tela. */
export function useAviso() {
  const [aviso, setAviso] = useState<{ texto: string; erro?: boolean } | null>(null);
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(null), 4000); return () => clearTimeout(t); }, [aviso]);
  const tentar = async (f: () => Promise<unknown>, ok?: string) => {
    try { await f(); if (ok) setAviso({ texto: ok }); return true; } catch (e) { setAviso({ texto: e instanceof Error ? e.message : String(e), erro: true }); return false; }
  };
  const el = aviso ? <div className={`cg-aviso ${aviso.erro ? "erro" : "ok"}`} role="status">{aviso.texto}</div> : null;
  return { aviso: el, tentar, setAviso };
}

export function Cabecalho({ titulo, sub, children }: { titulo: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="cg-cabecalho">
      <div><h1>{titulo}</h1>{sub && <p>{sub}</p>}</div>
      <div className="cg-acoes">{children}</div>
    </div>
  );
}

/** Tela com filtros à esquerda (como na referência) e o conteúdo à direita. */
export function ComFiltros({ filtros, children }: { filtros: ReactNode; children: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="cg-corpo">
      <button className="cg-botao cg-filtro-mobile" onClick={() => setAberto(!aberto)}>Filtros</button>
      <aside className={`cg-filtros ${aberto ? "aberto" : ""}`}>
        <h3>Filtros</h3>
        {filtros}
      </aside>
      <div className="cg-conteudo">{children}</div>
    </div>
  );
}

export function Campo({ rotulo, children, dica, className }: { rotulo: string; children: ReactNode; dica?: string; className?: string }) {
  return <label className={`cg-campo ${className ?? ""}`}><span>{rotulo}</span>{children}{dica && <small>{dica}</small>}</label>;
}

export function Abas<T extends string>({ itens, valor, onChange }: { itens: Array<{ id: T; rotulo: string; n?: number }>; valor: T; onChange: (v: T) => void }) {
  return (
    <div className="cg-abas" role="tablist">
      {itens.map((i) => (
        <button key={i.id} role="tab" aria-selected={valor === i.id} className={valor === i.id ? "ativa" : ""} onClick={() => onChange(i.id)}>
          {i.rotulo}{i.n !== undefined && <b>{i.n}</b>}
        </button>
      ))}
    </div>
  );
}

export function Paginacao({ atual, total, onChange }: { atual: number; total: number; onChange: (n: number) => void }) {
  return (
    <div className="cg-paginacao">
      <span>Pág {atual} / {total}</span>
      <div>
        <button className="cg-botao" disabled={atual <= 1} onClick={() => onChange(atual - 1)}>Anterior</button>
        <button className="cg-botao" disabled={atual >= total} onClick={() => onChange(atual + 1)}>Próximo</button>
      </div>
    </div>
  );
}

export function Vazio({ titulo, sub }: { titulo: string; sub?: string }) {
  return <div className="cg-vazio"><strong>{titulo}</strong>{sub && <span>{sub}</span>}</div>;
}

export function Selo({ tom, children }: { tom: "ok" | "ruim" | "alerta" | "info" | "neutro" | "roxo"; children: ReactNode }) {
  return <span className={`cg-selo ${tom}`}>{children}</span>;
}

export function Janela({ aberta, titulo, sub, onFechar, children, rodape, largura, abas }: {
  aberta: boolean; titulo: string; sub?: string; onFechar: () => void; children: ReactNode; rodape?: ReactNode; largura?: "pequena" | "media" | "grande"; abas?: ReactNode;
}) {
  useEffect(() => {
    if (!aberta) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aberta, onFechar]);
  if (!aberta) return null;
  return (
    <div className="cg-fundo" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className={`cg-janela ${largura ?? "media"}`} role="dialog" aria-label={titulo}>
        <div className="cg-janela-topo">
          <div><h3>{titulo}</h3>{sub && <p>{sub}</p>}</div>
          <button className="cg-icone" onClick={onFechar} aria-label="Fechar"><X size={18} /></button>
        </div>
        {abas}
        <div className="cg-janela-corpo">{children}</div>
        {rodape && <div className="cg-janela-rodape">{rodape}</div>}
      </div>
    </div>
  );
}

/** Menu de ações de uma linha (os três pontinhos). */
export function MenuAcoes({ itens }: { itens: Array<{ rotulo: string; onClick: () => void; perigo?: boolean }> }) {
  const [aberto, setAberto] = useState(false);
  useEffect(() => {
    if (!aberto) return;
    const f = () => setAberto(false);
    window.addEventListener("click", f);
    return () => window.removeEventListener("click", f);
  }, [aberto]);
  return (
    <div className="cg-menu-acoes">
      <button className="cg-icone" aria-label="Ações" onClick={(e) => { e.stopPropagation(); setAberto(!aberto); }}>⋮</button>
      {aberto && <ul>{itens.map((i) => <li key={i.rotulo}><button className={i.perigo ? "perigo" : ""} onClick={() => { setAberto(false); i.onClick(); }}>{i.rotulo}</button></li>)}</ul>}
    </div>
  );
}

export function Interruptor({ ligado, onChange, rotulo }: { ligado: boolean; onChange: (v: boolean) => void; rotulo?: string }) {
  return (
    <label className="cg-interruptor">
      <input type="checkbox" checked={ligado} onChange={(e) => onChange(e.target.checked)} />
      <i />{rotulo && <span>{rotulo}</span>}
    </label>
  );
}

/** Opção grande de escolha única (como os cartões "Padrão / Personalizado / Isento"). */
export function Opcoes<T extends string>({ valor, onChange, itens, nome }: { valor: T; onChange: (v: T) => void; nome: string; itens: Array<{ id: T; titulo: string; sub?: string }> }) {
  return (
    <div className="cg-opcoes">
      {itens.map((i) => (
        <label key={i.id} className={valor === i.id ? "marcada" : ""}>
          <input type="radio" name={nome} checked={valor === i.id} onChange={() => onChange(i.id)} />
          <strong>{i.titulo}</strong>{i.sub && <small>{i.sub}</small>}
        </label>
      ))}
    </div>
  );
}
