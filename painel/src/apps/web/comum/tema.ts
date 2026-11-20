// Tema do app (Automático, Claro, Escuro), lembrado no aparelho. O app do motorista tem o dele em motorista/ajustes.ts;
// este serve ao app do passageiro. Aplica data-tema="claro|escuro" no <html>.
import { useSyncExternalStore } from "react";

export type TemaApp = "sistema" | "claro" | "escuro";
export const NOMES_TEMA_APP: Record<TemaApp, string> = { sistema: "Automático", claro: "Claro", escuro: "Escuro" };
const CHAVE = "tema-app";

function ler(): TemaApp {
  try { const v = localStorage.getItem(CHAVE); return v === "claro" || v === "escuro" ? v : "sistema"; } catch { return "sistema"; }
}
let atual: TemaApp = ler();
const ouvintes = new Set<() => void>();
const escuroDoAparelho = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches;

export function aplicarTemaApp() {
  const escuro = atual === "escuro" || (atual === "sistema" && escuroDoAparelho());
  document.documentElement.dataset.tema = escuro ? "escuro" : "claro";
}
export function mudarTemaApp(t: TemaApp) {
  atual = t;
  try { if (t === "sistema") localStorage.removeItem(CHAVE); else localStorage.setItem(CHAVE, t); } catch { /* sem armazenamento */ }
  aplicarTemaApp();
  ouvintes.forEach((f) => f());
}
if (typeof matchMedia !== "undefined") matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", aplicarTemaApp);

export function useTemaApp(): [TemaApp, (t: TemaApp) => void] {
  const t = useSyncExternalStore((f) => { ouvintes.add(f); return () => ouvintes.delete(f); }, () => atual);
  return [t, mudarTemaApp];
}
