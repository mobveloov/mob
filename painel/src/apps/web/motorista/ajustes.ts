// Configurações do app guardadas no aparelho (localStorage): tema, navegador, alertas e áudio.

import { useSyncExternalStore } from "react";
import type { Ponto } from "./tipos";
import { tocarToque, type Toque } from "../comum/api";
import { falarTexto } from "../comum/voz";

export const VERSAO = "2.0";

export type Tema = "sistema" | "claro" | "escuro";
export type Navegador = "nativo" | "google" | "waze";
export type Sons = Toque; // toque da chamada: pulso, campanário ou radar
export interface Ajustes {
  tema: Tema; navegador: Navegador; prioritarias: boolean; flutuante: boolean; vibrar: boolean; insistente: boolean; voz: boolean; sons: Sons; volume: boolean; esconderGanhos: boolean; manterTela: boolean; gravar: boolean; gravarVideo: boolean; gravarSoWifi: boolean;
}

const PADRAO: Ajustes = { tema: "sistema", navegador: "nativo", prioritarias: true, flutuante: true, vibrar: true, insistente: true, voz: true, sons: "xperia", volume: true, esconderGanhos: false, manterTela: true, gravar: true, gravarVideo: false, gravarSoWifi: true };
const CHAVE = "motorista-ajustes";

function carregar(): Ajustes {
  try { const r = { ...PADRAO, ...(JSON.parse(localStorage.getItem(CHAVE) ?? "{}") as Partial<Ajustes>) }; if (!["corrida", "xperia", "pulso", "campanario", "radar"].includes(r.sons)) r.sons = "corrida"; return r; } catch { return PADRAO; }
}

let atual = carregar();
let escolheuTema = (() => { try { return "tema" in (JSON.parse(localStorage.getItem(CHAVE) ?? "{}") as object); } catch { return false; } })();
const ouvintes = new Set<() => void>();

export const ajustes = () => atual;

/** Tema que a empresa escolheu na Personalização: vale enquanto o motorista não escolheu o dele (o dele, guardado no aparelho, manda). */
export function temaPadraoDaEmpresa(t: Tema) {
  if (escolheuTema || atual.tema === t) return;
  atual = { ...atual, tema: t };
  aplicarTema();
  ouvintes.forEach((f) => f());
}
export function mudarAjustes(p: Partial<Ajustes>) {
  atual = { ...atual, ...p };
  if (p.tema) escolheuTema = true;
  try { const { tema, ...resto } = atual; localStorage.setItem(CHAVE, JSON.stringify(escolheuTema ? atual : resto)); } catch { /* sem armazenamento */ }
  aplicarTema();
  ouvintes.forEach((f) => f());
}

export function useAjustes(): [Ajustes, (p: Partial<Ajustes>) => void] {
  const a = useSyncExternalStore((f) => { ouvintes.add(f); return () => ouvintes.delete(f); }, () => atual);
  return [a, mudarAjustes];
}

// ------------------------------------------------------------------ tema

const escuroDoAparelho = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches;
export const temaEscuro = () => (atual.tema === "sistema" ? escuroDoAparelho() : atual.tema === "escuro");

export function aplicarTema() {
  document.documentElement.dataset.tema = temaEscuro() ? "escuro" : "claro";
}
if (typeof matchMedia !== "undefined") matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", aplicarTema);

export const NOMES_TEMA: Record<Tema, string> = { sistema: "Automático", claro: "Claro", escuro: "Escuro" };
export const NOMES_NAVEGADOR: Record<Navegador, string> = { nativo: "GPS do app (passo a passo)", google: "Google Maps", waze: "Waze" };
export const NOMES_SONS: Record<Sons, string> = { corrida: "Corrida", xperia: "Sony Xperia (padrão)", pulso: "Pulso", campanario: "Campanário", radar: "Radar" };

/** Link para navegar até o ponto no navegador escolhido. */
export function linkNavegar(p: Ponto) {
  const tem = p.lat != null && p.lng != null;
  if (atual.navegador === "waze") return tem ? `https://waze.com/ul?ll=${p.lat},${p.lng}&navigate=yes` : `https://waze.com/ul?q=${encodeURIComponent(p.texto)}&navigate=yes`;
  return `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${tem ? `${p.lat},${p.lng}` : encodeURIComponent(p.texto)}`;
}

// ------------------------------------------------------------------ som e vibração

/** Toca uma vez o toque escolhido (pré-escuta em Ajustes). A chamada de corrida toca em laço (Chamada.tsx) e para com pararSons(). */
export function tocar(_vezes = 1) { tocarToque(atual.sons, false); }

export function tremer(ms: number | number[]) {
  if (!atual.vibrar) return;
  try { navigator.vibrate?.(ms); } catch { /* sem vibração */ }
}

// ------------------------------------------------------------------ voz (co-piloto)

export function falar(texto: string, fixa = false) {
  if (!atual.voz) return;
  void falarTexto(texto, { fixa });
}
