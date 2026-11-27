// Voz dos avisos falados (os dois apps). Quem fala é o SERVIDOR: o app baixa o mp3 neural pt-BR
// (GET /api/apps/<empresa>/voz?texto=&voz=&velocidade=&app=), guarda no aparelho (Cache Storage) e toca com o player.
// Voz (feminina/masculina), velocidade e liga/desliga vêm da Personalização do painel (campo `voz`).
// Sem rede e sem áudio guardado: só o toque. A voz do aparelho (speechSynthesis) só entra se a PESSOA escolher nos Ajustes.

import { config } from "./api";
import { personalizacaoAtual } from "./personalizacao";

/** nome/velocidade/painel: ajustes só da voz do aparelho. `painel:false` = a pessoa escolheu a voz do aparelho. */
export interface ConfigVoz { nome: string; velocidade: number; painel: boolean }
const CHAVE = "voz-config";
const PADRAO: ConfigVoz = { nome: "", velocidade: 0.95, painel: true };
export const FRASES_FIXAS = [
  "Seu motorista está a caminho.", "Seu motorista está no local.", "Sua corrida começou. Boa viagem.", "Corrida finalizada.",
  "Sua corrida foi cancelada.", "Não há nenhum motorista disponível no momento.",
  "Você está chegando ao local de embarque.", "Você está chegando ao destino.",
  ...[1, 2, 3, 4, 5].map((n) => `Você está chegando à parada ${n}.`),
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

// ------------------------------------------------------------------ voz do servidor (guardada no aparelho)

/** O que o painel mandou na Personalização (campo `voz`). */
export interface VozDoPainel { ligada: boolean; genero: "feminina" | "masculina"; velocidade: number; app: "passageiro" | "motorista"; url: string }
export function vozDoPainel(): VozDoPainel {
  const v = personalizacaoAtual()?.voz as Partial<VozDoPainel> | undefined;
  const papel = config().papel;
  return {
    ligada: v?.ligada !== false,
    genero: v?.genero === "masculina" ? "masculina" : "feminina",
    velocidade: Number(v?.velocidade) || 1,
    app: v?.app ?? papel,
    url: v?.url || `/api/apps/${config().empresaId}/voz`,
  };
}

let painelOff = 0; // até quando não tentar o servidor (sem motor, limite ou sem rede)
const emMemoria = new Map<string, string>(); // chave -> blob URL
const pedindo = new Map<string, Promise<string | null>>();
const chaveDe = (t: string, v: VozDoPainel) => `${t}|${v.genero}|${v.velocidade}`;
const chaveCache = (t: string, v: VozDoPainel) => `/voz-cache/${config().empresaId}/${v.genero}/${v.velocidade}/${encodeURIComponent(t)}`;
const abrirCache = () => (typeof caches !== "undefined" ? caches.open("voz-v2") : Promise.reject(new Error("sem cache")));
export interface RegistroVoz { texto: string; bytes: number; origem: "cache" | "servidor" }
/** Registro do que foi baixado/tocado (prova em teste e diagnóstico). */
export const registroVoz: RegistroVoz[] = []; // só cresce em teste (DEV)
const anota = (r: RegistroVoz) => { if (import.meta.env?.DEV) registroVoz.push(r); };
if (typeof window !== "undefined" && import.meta.env?.DEV) (window as unknown as { __vozRegistro: RegistroVoz[] }).__vozRegistro = registroVoz;

async function doCache(texto: string, v: VozDoPainel): Promise<string | null> {
  const k = chaveDe(texto, v);
  const m = emMemoria.get(k);
  if (m) return m;
  try {
    const r = await (await abrirCache()).match(chaveCache(texto, v));
    if (!r) return null;
    const b = await r.blob();
    const u = URL.createObjectURL(b);
    emMemoria.set(k, u);
    anota({ texto, bytes: b.size, origem: "cache" });
    return u;
  } catch { return null; }
}

/** Baixa o mp3 do servidor e guarda no aparelho. Devolve o endereço para tocar (ou null: só o toque). */
export async function baixarVoz(texto: string, fixa = true): Promise<string | null> {
  const v = vozDoPainel();
  if (!v.ligada || !config().empresaId) return null;
  const guardada = await doCache(texto, v);
  if (guardada) return guardada;
  if (Date.now() < painelOff) return null;
  const k = chaveDe(texto, v);
  const andando = pedindo.get(k);
  if (andando) return andando;
  const p = (async () => {
    try {
      const dados = { texto, voz: v.genero, velocidade: v.velocidade, app: v.app };
      // frases fixas: GET (cacheável); instruções com nome de rua: POST (o trajeto não vai no endereço/logs)
      const r = fixa ? await fetch(`${config().api}${v.url}?${new URLSearchParams({ ...dados, velocidade: String(v.velocidade) })}`)
        : await fetch(`${config().api}${v.url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(dados) });
      if (r.status === 204) return null; // desligada no painel
      if (!r.ok) { painelOff = Date.now() + (r.status === 429 ? 120_000 : 60_000); return null; }
      const bytes = await r.arrayBuffer();
      if (!bytes.byteLength) return null;
      try { await (await abrirCache()).put(chaveCache(texto, v), new Response(bytes, { headers: { "content-type": "audio/mpeg" } })); } catch { /* sem cache: toca só desta vez */ }
      const u = URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
      emMemoria.set(k, u);
      anota({ texto, bytes: bytes.byteLength, origem: "servidor" });
      return u;
    } catch { painelOff = Date.now() + 30_000; return null; } finally { pedindo.delete(k); }
  })();
  pedindo.set(k, p);
  return p;
}
export const aquecerVoz = async (texto: string) => { await baixarVoz(texto); };
/** Ao entrar no app: baixa as frases fixas (uma por vez, sem pressa). */
export async function aquecerFrasesFixas() {
  for (const f of FRASES_FIXAS) { await aquecerVoz(f); if (Date.now() < painelOff || !vozDoPainel().ligada) break; }
}

// ------------------------------------------------------------------ falar

let tocando: HTMLAudioElement | null = null;
export function pararVoz() {
  try { window.speechSynthesis?.cancel(); } catch { /* sem voz */ }
  try { tocando?.pause(); } catch { /* já parou */ }
  tocando = null;
}

/** Qual voz vai falar `texto` agora. */
export async function vozDe(texto: string): Promise<{ origem: "painel" | "aparelho" | "nenhuma"; nome: string }> {
  if (!vozDoPainel().ligada) return { origem: "nenhuma", nome: "" };
  if (lerConfigVoz().painel) {
    const v = vozDoPainel();
    return (await baixarVoz(texto)) ? { origem: "painel", nome: `Voz ${v.genero} do painel (neural)` } : { origem: "nenhuma", nome: "" };
  }
  const a = vozEscolhida();
  return a ? { origem: "aparelho", nome: a.name } : { origem: "nenhuma", nome: "" };
}

/** Fala `texto`. Painel desligou a voz = só o toque. Sem áudio do servidor = só o toque (não cai na voz robótica). */
let geracao = 0;
export async function falarTexto(texto: string, o: { fixa?: boolean } = {}): Promise<void> {
  const minha = ++geracao;
  try {
    pararVoz();
    const v = vozDoPainel();
    if (!v.ligada) return;
    const cfg = lerConfigVoz();
    if (!cfg.painel) { // a pessoa escolheu a voz do aparelho
      const s = window.speechSynthesis;
      const voz = s ? vozEscolhida() : null;
      if (s && voz) { const f = new SpeechSynthesisUtterance(texto); f.voice = voz; f.lang = voz.lang; f.rate = cfg.velocidade; s.speak(f); }
      return;
    }
    const url = await baixarVoz(texto, o.fixa !== false);
    if (minha !== geracao) return; // chegou outra fala enquanto baixava
    if (!url) { // instrução de navegação (frase nova) sem rede/servidor: a voz do aparelho avisa, para a curva não ficar muda
      const s = window.speechSynthesis, voz = s && o.fixa === false ? vozEscolhida() : null;
      if (s && voz) { const f = new SpeechSynthesisUtterance(texto); f.voice = voz; f.lang = voz.lang; f.rate = cfg.velocidade; s.speak(f); }
      return;
    }
    const a = new Audio(url);
    tocando = a;
    await a.play();
  } catch { /* sem voz: fica o toque */ }
}
