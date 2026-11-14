// Configurações do app guardadas no aparelho (localStorage): tema, navegador, alertas e áudio.

import { useSyncExternalStore } from "react";
import type { Ponto } from "./tipos";

export const VERSAO = "2.0";

export type Tema = "sistema" | "claro" | "escuro";
export type Navegador = "google" | "waze";
export type Sons = "padrao" | "sirene" | "campainha";
export interface Ajustes {
  tema: Tema; navegador: Navegador; prioritarias: boolean; flutuante: boolean; vibrar: boolean; insistente: boolean; voz: boolean; sons: Sons; volume: boolean; esconderGanhos: boolean;
}

const PADRAO: Ajustes = { tema: "sistema", navegador: "google", prioritarias: true, flutuante: true, vibrar: true, insistente: true, voz: true, sons: "padrao", volume: true, esconderGanhos: false };
const CHAVE = "motorista-ajustes";

function carregar(): Ajustes {
  try { return { ...PADRAO, ...(JSON.parse(localStorage.getItem(CHAVE) ?? "{}") as Partial<Ajustes>) }; } catch { return PADRAO; }
}

let atual = carregar();
const ouvintes = new Set<() => void>();

export const ajustes = () => atual;
export function mudarAjustes(p: Partial<Ajustes>) {
  atual = { ...atual, ...p };
  try { localStorage.setItem(CHAVE, JSON.stringify(atual)); } catch { /* sem armazenamento */ }
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

export const NOMES_TEMA: Record<Tema, string> = { sistema: "Sistema", claro: "Claro", escuro: "Escuro" };
export const NOMES_NAVEGADOR: Record<Navegador, string> = { google: "Google Maps", waze: "Waze" };
export const NOMES_SONS: Record<Sons, string> = { padrao: "Padrão", sirene: "Sirene", campainha: "Campainha" };
const TONS: Record<Sons, { f: [number, number]; onda: OscillatorType; passo: number }> = {
  padrao: { f: [880, 660], onda: "sine", passo: 0.35 }, sirene: { f: [960, 720], onda: "square", passo: 0.5 }, campainha: { f: [1320, 990], onda: "triangle", passo: 0.25 },
};

/** Link para navegar até o ponto no navegador escolhido. */
export function linkNavegar(p: Ponto) {
  const tem = p.lat != null && p.lng != null;
  if (atual.navegador === "waze") return tem ? `https://waze.com/ul?ll=${p.lat},${p.lng}&navigate=yes` : `https://waze.com/ul?q=${encodeURIComponent(p.texto)}&navigate=yes`;
  return `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${tem ? `${p.lat},${p.lng}` : encodeURIComponent(p.texto)}`;
}

// ------------------------------------------------------------------ som e vibração

/** Toque de alerta (sem arquivo de som). Com "volume automático", toca no volume máximo do app. */
export function tocar(vezes = 3) {
  try {
    const ctx = new AudioContext();
    const alto = atual.volume ? 0.9 : 0.25;
    const tom = TONS[atual.sons] ?? TONS.padrao;
    for (let i = 0; i < vezes; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = tom.onda; o.frequency.value = tom.f[i % 2]; o.connect(g); g.connect(ctx.destination);
      const t = ctx.currentTime + i * tom.passo;
      g.gain.setValueAtTime(alto, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.start(t); o.stop(t + 0.3);
    }
    setTimeout(() => void ctx.close(), vezes * 400 + 200);
  } catch { /* sem som */ }
}

export function tremer(ms: number | number[]) {
  if (!atual.vibrar) return;
  try { navigator.vibrate?.(ms); } catch { /* sem vibração */ }
}

// ------------------------------------------------------------------ voz (co-piloto)

export function falar(texto: string) {
  if (!atual.voz) return;
  try {
    const s = window.speechSynthesis;
    if (!s) return;
    const f = new SpeechSynthesisUtterance(texto);
    f.lang = "pt-BR";
    f.voice = s.getVoices().find((v) => v.lang.replace("_", "-").toLowerCase() === "pt-br") ?? null;
    s.cancel(); s.speak(f);
  } catch { /* sem voz */ }
}
