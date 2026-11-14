// Peças comuns das telas de centrais: chamada à API /api/centrais e a "central em foco" escolhida no seletor do topo.
// A central em foco só vale para as telas de centrais (controle financeiro, planos, demonstrativo). O servidor sempre confere
// se a central pedida é a própria empresa ou uma associada dela: o que vem daqui nunca dá acesso a outra empresa.

import { useEffect, useState } from "react";

function empresaEscolhida() {
  try { return localStorage.getItem("empresa") ?? ""; } catch { return ""; }
}

export async function pedirCentrais<T = any>(url: string, metodo = "GET", corpo?: unknown): Promise<T> {
  const h: Record<string, string> = {};
  const emp = empresaEscolhida();
  if (emp) h["X-Empresa"] = emp;
  if (corpo !== undefined) h["Content-Type"] = "application/json";
  const r = await fetch(`/api/centrais${url}`, { method: metodo, headers: h, credentials: "same-origin", body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((b as { erro?: string }).erro || `Erro ${r.status}`);
  return b as T;
}

/** Baixa um CSV do servidor (a proteção contra injeção de fórmula é feita lá). */
export async function baixarCsvCentrais(url: string, nome: string) {
  const emp = empresaEscolhida();
  const r = await fetch(`/api/centrais${url}`, { credentials: "same-origin", headers: emp ? { "X-Empresa": emp } : {} });
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { erro?: string }).erro || `Erro ${r.status}`);
  const blob = await r.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const CHAVE = "centralFoco", EVENTO = "central-foco";
export const lerFoco = () => { try { return localStorage.getItem(CHAVE) ?? ""; } catch { return ""; } };
export function definirFoco(id: string) {
  try { id ? localStorage.setItem(CHAVE, id) : localStorage.removeItem(CHAVE); } catch { /* sem armazenamento */ }
  window.dispatchEvent(new Event(EVENTO));
}
/** Central em foco ("" = a própria empresa). Muda junto quando o seletor do topo muda. */
export function useFoco() {
  const [foco, setFoco] = useState(lerFoco());
  useEffect(() => {
    const f = () => setFoco(lerFoco());
    window.addEventListener(EVENTO, f);
    return () => window.removeEventListener(EVENTO, f);
  }, []);
  return foco;
}

export interface CentralResumo { id: string; nome: string; codigo: number; tipo: "principal" | "associada"; ativa: boolean; rotulo: string }
