// Voz dos avisos falados (os dois apps). Ordem:
//  1) voz do PAINEL (neural, a mesma do bot) já guardada no aparelho: toca na hora, sem rede;
//  2) senão, a MELHOR voz pt-BR do aparelho (neural/de rede antes das compactas), com ritmo natural, e já pede a do painel
//     em segundo plano para as próximas vezes (só frases fixas e curtas);
//  3) sem voz boa nenhuma: só o toque (não fala).
// Voz e velocidade são ajustes da pessoa (guardados no aparelho).

import { config, token, urlApi } from "./api";

export interface ConfigVoz { nome: string; velocidade: number; painel: boolean }
const CHAVE = "voz-config";
const PADRAO: ConfigVoz = { nome: "", velocidade: 0.95, painel: true };
export const FRASES_FIXAS = [
  "Seu motorista está a caminho.", "Seu motorista está no local.", "Sua corrida começou. Boa viagem.", "Corrida finalizada.",
  "Sua corrida foi cancelada.", "Não há nenhum motorista disponível no momento.",
  "Você está chegando ao local de embarque.", "Você está chegando ao destino.",
];

export function lerConfigVoz(): ConfigVoz {
  try {
    const j = JSON.parse(localStorage.getItem(CHAVE) ?? "{}") as Partial<ConfigVoz>;
    return { nome: String(j.nome ?? ""), velocidade: Math.min(1.3, Math.max(0.7, Number(j.velocidade) || PADRAO.velocidade)), painel: j.painel !== false };
  } catch { return PADRAO; }
}
export function salvarConfigVoz(p: Partial<ConfigVoz>) { try { localStorage.setItem(CHAVE, JSON.stringify({ ...lerConfigVoz(), ...p })); } catch { /* sem armazenamento */ } }

const ehPtBr = (v: { lang: string }) => v.lang.replace("_", "-").toLowerCase() === "pt-br";
/** Nota da voz: neural/de rede ganha da compacta. Quanto maior, melhor. -1 = não é português. */
export function notaDaVoz(v: { name: string; lang: string; localService?: boolean }): number {
  let n = 0;
  if (ehPtBr(v)) n += 100; else if (/^pt/i.test(v.lang)) n += 10; else return -1;
  if (/neural|natural|wavenet|studio|online|enhanced|premium/i.test(v.name)) n += 60;
  if (v.localService === false || /network|rede/i.test(v.name)) n += 40;
  if (/google/i.test(v.name)) n += 15;
  if (/francisca|luciana|thalita|antonio|brenda|donato|leila|camila|vitoria|ricardo/i.test(v.name)) n += 10;
  if (/compact|espeak|robot|default/i.test(v.name)) n -= 40;
  return n;
}
export function escolherVoz<T extends { name: string; lang: string; localService?: boolean }>(vozes: T[], preferida = ""): T | null {
  const pt = vozes.filter((v) => notaDaVoz(v) >= 0);
  if (!pt.length) return null;
  const pedida = preferida ? pt.find((v) => v.name === preferida) : undefined;
  return pedida ?? [...pt].sort((a, b) => notaDaVoz(b) - notaDaVoz(a))[0];
}
export function vozesDoAparelho(): SpeechSynthesisVoice[] {
  try { return (window.speechSynthesis?.getVoices() ?? []).filter((v) => notaDaVoz(v) >= 0).sort((a, b) => notaDaVoz(b) - notaDaVoz(a)); } catch { return []; }
}
export const vozEscolhida = () => escolherVoz(vozesDoAparelho(), lerConfigVoz().nome);

// ------------------------------------------------------------------ voz do painel (guardada no aparelho)

let painelOff = 0; // até quando não tentar o painel (sem chave ou sem rede)
const emMemoria = new Map<string, string>(); // frase -> blob URL
const pedindo = new Set<string>();
const hash = (t: string) => { let h = 5381; for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
const chaveCache = (t: string) => `/voz-cache/${config().empresaId}/${hash(t)}`;
const abrirCache = () => (typeof caches !== "undefined" ? caches.open("voz-v1") : Promise.reject(new Error("sem cache")));

async function doCache(texto: string): Promise<string | null> {
  const m = emMemoria.get(texto);
  if (m) return m;
  try {
    const r = await (await abrirCache()).match(chaveCache(texto));
    if (!r) return null;
    const u = URL.createObjectURL(await r.blob());
    emMemoria.set(texto, u);
    return u;
  } catch { return null; }
}

/** Pede ao painel e guarda (sem tocar). */
export async function aquecerVoz(texto: string): Promise<void> {
  if (!lerConfigVoz().painel || !token() || Date.now() < painelOff || pedindo.has(texto) || await doCache(texto)) return;
  pedindo.add(texto);
  try {
    const r = await fetch(urlApi("/voz"), { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token()}` }, body: JSON.stringify({ texto }) });
    if (r.status === 404) { painelOff = Date.now() + 30 * 60_000; return; } // painel sem voz: não insiste por 30 min
    if (!r.ok) { painelOff = Date.now() + 60_000; return; }
    const tipo = r.headers.get("content-type") ?? "audio/wav";
    const bytes = await r.arrayBuffer();
    try { await (await abrirCache()).put(chaveCache(texto), new Response(bytes, { headers: { "content-type": tipo } })); } catch { /* sem cache: toca só desta vez */ }
    emMemoria.set(texto, URL.createObjectURL(new Blob([bytes], { type: tipo })));
  } catch { painelOff = Date.now() + 60_000; } finally { pedindo.delete(texto); }
}
/** Ao entrar no app: guarda as frases fixas do painel (uma por vez, sem pressa). */
export async function aquecerFrasesFixas() { for (const f of FRASES_FIXAS) { await aquecerVoz(f); if (Date.now() < painelOff) break; } }

// ------------------------------------------------------------------ falar

let tocandoPainel: HTMLAudioElement | null = null;
export function pararVoz() {
  try { window.speechSynthesis?.cancel(); } catch { /* sem voz */ }
  try { tocandoPainel?.pause(); } catch { /* já parou */ }
  tocandoPainel = null;
}

/** Qual voz vai falar `texto` agora: do painel, o nome da voz do aparelho, ou nenhuma (só toque). */
export async function vozDe(texto: string): Promise<{ origem: "painel" | "aparelho" | "nenhuma"; nome: string }> {
  if (lerConfigVoz().painel && await doCache(texto)) return { origem: "painel", nome: "Voz do painel (neural)" };
  const v = vozEscolhida();
  return v ? { origem: "aparelho", nome: v.name } : { origem: "nenhuma", nome: "" };
}

export async function falarTexto(texto: string, o: { fixa?: boolean } = {}): Promise<void> {
  try {
    pararVoz();
    const cfg = lerConfigVoz();
    const url = cfg.painel ? await doCache(texto) : null;
    if (url) { const a = new Audio(url); tocandoPainel = a; a.playbackRate = cfg.velocidade > 1 ? Math.min(cfg.velocidade, 1.25) : 1; await a.play(); return; }
    const s = window.speechSynthesis;
    const voz = s ? vozEscolhida() : null;
    if (s && voz) {
      const f = new SpeechSynthesisUtterance(texto);
      f.voice = voz; f.lang = voz.lang; f.rate = cfg.velocidade; f.pitch = 1; f.volume = 1;
      s.speak(f);
    }
    if (o.fixa) void aquecerVoz(texto);
  } catch { /* sem voz: fica o toque */ }
}
