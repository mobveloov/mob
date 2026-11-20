// Alertas de SOS em tempo real para o painel: uma única consulta curta (a cada 5 s) serve o sino, a faixa vermelha e a tela.
// Quando aparece um alerta novo, toca um som de sirene (se o navegador já liberou o áudio) e avisa quem estiver ouvindo.
import { useEffect, useState } from "react";

export interface ItemSos { id: string; situacao: "aberto" | "atendido"; papel: string; nome: string; em: string; os: string }
export interface ResumoSos { abertos: number; atendidos: number; itens: ItemSos[] }

const VAZIO: ResumoSos = { abertos: 0, atendidos: 0, itens: [] };
const INTERVALO_MS = 5000;
let atual: ResumoSos = VAZIO;
const ouvintes = new Set<(r: ResumoSos) => void>();
const conhecidos = new Set<string>();
let timer: ReturnType<typeof setInterval> | null = null;

/** Sirene curta (duas notas) pelo WebAudio. Falha em silêncio se o navegador ainda não deixa tocar. */
export function tocarSirene() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const t0 = ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "square"; o.frequency.value = i % 2 ? 660 : 880;
      g.gain.setValueAtTime(0.0001, t0 + i * 0.3); g.gain.exponentialRampToValueAtTime(0.25, t0 + i * 0.3 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.3 + 0.28);
      o.connect(g).connect(ctx.destination); o.start(t0 + i * 0.3); o.stop(t0 + i * 0.3 + 0.3);
    }
    setTimeout(() => void ctx.close(), 1500);
  } catch { /* sem áudio */ }
}

async function consultar() {
  try {
    const r = await fetch("/api/apps-central/sos/resumo", { credentials: "same-origin" });
    if (!r.ok) return;
    const j = (await r.json()) as ResumoSos;
    const novos = j.itens.filter((i) => i.situacao === "aberto" && !conhecidos.has(i.id));
    for (const i of j.itens) conhecidos.add(i.id);
    if (novos.length) tocarSirene(); // também vale para o alerta que já estava aberto quando o painel foi aberto
    atual = j;
    for (const f of ouvintes) f(j);
  } catch { /* sem rede: tenta de novo no próximo ciclo */ }
}

function ligar() { if (!timer) { void consultar(); timer = setInterval(() => void consultar(), INTERVALO_MS); } }
function desligar() { if (!ouvintes.size && timer) { clearInterval(timer); timer = null; } }

/** Resumo dos alertas que ainda pedem ação da central. Atualiza sozinho. */
export function useSosAbertos(): ResumoSos & { recarregar: () => void } {
  const [r, setR] = useState<ResumoSos>(atual);
  useEffect(() => { ouvintes.add(setR); ligar(); return () => { ouvintes.delete(setR); desligar(); }; }, []);
  return { ...r, recarregar: () => void consultar() };
}
