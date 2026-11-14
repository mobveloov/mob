// Conversa dos apps com o servidor (/api/apps/<empresa>/...), tempo real, áudio, GPS e push.
// Roda no navegador (teste) e dentro do APK (Capacitor). No APK, o build grava config.json com a empresa e o
// endereço da API. No navegador: ?empresa=<id> na URL (e ?api=<url> se a API estiver em outro endereço).

import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export type Papel = "passageiro" | "motorista";
/** teste: APK de teste (build com APP_TESTE=1). Mostra o campo "Servidor" na entrada, para trocar o endereço temporário. */
export interface Config { empresaId: string; api: string; papel: Papel; teste?: boolean }

const ler = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const gravar = (k: string, v: string | null) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };

let cfg: Config = { empresaId: "", api: "", papel: "passageiro" };
export const config = () => cfg;
export const nativo = () => Capacitor.isNativePlatform();

/** Só no APK de teste: guarda outro endereço de servidor (ou volta ao do build com ""). Recarrega o app. */
export function trocarServidor(url: string) {
  const u = url.trim().replace(/\/+$/, "");
  if (u && !/^https?:\/\/[^\s"'<>]+$/.test(u)) throw new Error("Endereço inválido. Ex.: https://exemplo.trycloudflare.com");
  gravar("servidor-teste", u || null);
  location.reload();
}

export async function carregarConfig(papel: Papel): Promise<Config> {
  try {
    const r = await fetch("./config.json", { cache: "no-store" });
    if (r.ok) {
      const j = (await r.json()) as Partial<Config>;
      if (j.empresaId) {
        const outro = j.teste ? ler("servidor-teste") : null;
        return (cfg = { empresaId: j.empresaId, api: (outro || j.api || "").replace(/\/+$/, ""), papel, teste: !!j.teste });
      }
    }
  } catch { /* sem config.json: navegador */ }
  const q = new URLSearchParams(location.search);
  if (q.get("empresa")) gravar("empresa", q.get("empresa"));
  if (q.get("api")) gravar("api", q.get("api"));
  return (cfg = { empresaId: ler("empresa") ?? "", api: (ler("api") ?? "").replace(/\/+$/, ""), papel });
}

// ------------------------------------------------------------------ token

const chaveToken = () => `token-${cfg.papel}-${cfg.empresaId}`;
export const token = () => ler(chaveToken());
export const guardarToken = (t: string | null) => gravar(chaveToken(), t);

export class ErroApi extends Error { constructor(msg: string, public status: number) { super(msg); } }

export const urlApi = (caminho: string) => `${cfg.api}/api/apps/${cfg.empresaId}${caminho}`;
export const urlArquivo = (caminho: string | null) => (caminho ? `${cfg.api}${caminho}` : "");

export async function api<T = Record<string, unknown>>(caminho: string, o: { metodo?: string; corpo?: unknown; bruto?: Blob; cabecalhos?: Record<string, string> } = {}): Promise<T> {
  const h: Record<string, string> = { ...(o.cabecalhos ?? {}) };
  const t = token();
  if (t) h.authorization = `Bearer ${t}`;
  let body: BodyInit | undefined;
  if (o.bruto) { body = o.bruto; h["content-type"] ??= o.bruto.type; }
  else if (o.corpo !== undefined) { body = JSON.stringify(o.corpo); h["content-type"] = "application/json"; }
  let r: Response;
  try { r = await fetch(urlApi(caminho), { method: o.metodo ?? (body ? "POST" : "GET"), headers: h, body }); }
  catch { throw new ErroApi("Sem conexão com a central. Confira a internet.", 0); }
  const j = (await r.json().catch(() => ({}))) as T & { erro?: string };
  if (r.status === 401 && t) { guardarToken(null); window.dispatchEvent(new Event("app-sair")); }
  if (!r.ok) throw new ErroApi(j.erro ?? `Erro ${r.status}.`, r.status);
  return j;
}

// ------------------------------------------------------------------ tempo real (SSE lido com fetch, para mandar o token)

/**
 * Tempo real. Tenta o SSE; se o "ola" não chegar em 5 s (rede, proxy ou túnel que segura o fluxo), passa para a
 * espera longa (GET /eventos/espera), que funciona em qualquer rede. Reconecta sozinho.
 */
export function tempoReal(aoEvento: (tipo: string, dados: any) => void, aoMudar: (ligado: boolean) => void): () => void {
  let parado = false, ctrl: AbortController | null = null, usarEspera = false;
  const sair = () => { guardarToken(null); window.dispatchEvent(new Event("app-sair")); };
  const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

  const sse = async () => {
    ctrl = new AbortController();
    const c = ctrl;
    let recebeu = false;
    const vigia = setTimeout(() => { if (!recebeu) { usarEspera = true; c.abort(); } }, 5000);
    try {
      const r = await fetch(urlApi("/eventos"), { headers: { authorization: `Bearer ${token() ?? ""}` }, signal: c.signal });
      if (r.status === 401) { sair(); parado = true; return; }
      if (!r.ok || !r.body) throw new Error();
      const leitor = r.body.getReader(), dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await leitor.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const bloco = buf.slice(0, i); buf = buf.slice(i + 2);
          const tipo = /^event: (.+)$/m.exec(bloco)?.[1], dados = /^data: (.*)$/m.exec(bloco)?.[1];
          if (tipo === "ola" && !recebeu) { recebeu = true; aoMudar(true); }
          if (tipo && dados && tipo !== "ola") { try { aoEvento(tipo, JSON.parse(dados)); } catch { /* evento estranho */ } }
        }
      }
    } catch { /* caiu ou trocou para a espera longa */ } finally { clearTimeout(vigia); }
  };

  const espera = async () => {
    let desde = -1;
    while (!parado) {
      ctrl = new AbortController();
      try {
        const r = await fetch(urlApi(`/eventos/espera?desde=${desde}`), { headers: { authorization: `Bearer ${token() ?? ""}` }, signal: ctrl.signal, cache: "no-store" });
        if (r.status === 401) { sair(); return; }
        if (!r.ok) throw new Error();
        const j = (await r.json()) as { seq: number; eventos: Array<{ seq: number; tipo: string; dados: unknown }> };
        if (desde < 0) aoMudar(true);
        for (const e of j.eventos) { try { aoEvento(e.tipo, e.dados); } catch { /* evento estranho */ } }
        desde = j.seq;
      } catch {
        if (parado) return;
        aoMudar(false); desde = desde < 0 ? -1 : desde;
        await esperar(3000);
      }
    }
  };

  void (async () => {
    while (!parado && !usarEspera) {
      await sse();
      if (parado || usarEspera) break;
      aoMudar(false);
      await esperar(3000);
    }
    if (!parado) await espera();
  })();
  return () => { parado = true; ctrl?.abort(); };
}

// ------------------------------------------------------------------ áudio do chat

const TIPOS = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4", "audio/aac"];

export class Gravador {
  private rec: MediaRecorder | null = null;
  private partes: Blob[] = [];
  private inicio = 0;
  async comecar() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("Este aparelho não grava áudio aqui.");
    const fluxo = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => { throw new Error("Libere o microfone para gravar áudio."); });
    const tipo = TIPOS.find((t) => MediaRecorder.isTypeSupported(t));
    this.rec = new MediaRecorder(fluxo, tipo ? { mimeType: tipo, audioBitsPerSecond: 32000 } : undefined);
    this.partes = [];
    this.rec.ondataavailable = (e) => { if (e.data.size) this.partes.push(e.data); };
    this.rec.start();
    this.inicio = Date.now();
  }
  /** Para e devolve o áudio (ou null se cancelou). */
  parar(cancelar = false): Promise<{ audio: Blob; segundos: number } | null> {
    const rec = this.rec;
    if (!rec) return Promise.resolve(null);
    return new Promise((ok) => {
      rec.onstop = () => {
        rec.stream.getTracks().forEach((t) => t.stop());
        this.rec = null;
        const tipo = (rec.mimeType || "audio/webm").split(";")[0];
        ok(cancelar ? null : { audio: new Blob(this.partes, { type: tipo }), segundos: Math.round((Date.now() - this.inicio) / 1000) });
      };
      rec.stop();
    });
  }
  get gravando() { return !!this.rec; }
}

const audios = new Map<string, string>();
/** Baixa o áudio com o token e devolve um endereço local para tocar. */
export async function urlDoAudio(corridaId: string, audioId: string): Promise<string> {
  const ja = audios.get(audioId);
  if (ja) return ja;
  const r = await fetch(urlApi(`/corridas/${corridaId}/audio/${audioId}`), { headers: { authorization: `Bearer ${token() ?? ""}` } });
  if (!r.ok) throw new Error("Não deu para baixar o áudio.");
  const u = URL.createObjectURL(await r.blob());
  audios.set(audioId, u);
  return u;
}

// ------------------------------------------------------------------ GPS

export interface Posicao { lat: number; lng: number }

interface PluginGpsFundo {
  addWatcher(o: Record<string, unknown>, cb: (p?: { latitude: number; longitude: number }, erro?: { code?: string; message?: string }) => void): Promise<string>;
  removeWatcher(o: { id: string }): Promise<void>;
  openSettings(): Promise<void>;
}
const GpsFundo = registerPlugin<PluginGpsFundo>("BackgroundGeolocation");

/** Acompanha a posição. Com fundo=true no APK, continua com o app minimizado (serviço com notificação fixa). */
export function observarPosicao(aoMudar: (p: Posicao) => void, aoErro: (msg: string) => void, fundo = false): () => void {
  if (fundo && nativo() && Capacitor.isPluginAvailable("BackgroundGeolocation")) {
    let id: string | null = null, parado = false;
    GpsFundo.addWatcher({ backgroundTitle: "Você está online", backgroundMessage: "Recebendo chamadas de corrida.", requestPermissions: true, stale: false, distanceFilter: 15 }, (p, e) => {
      if (e) { aoErro(e.code === "NOT_AUTHORIZED" ? "Libere a localização (sempre) para ficar online." : "GPS indisponível."); return; }
      if (p) aoMudar({ lat: p.latitude, lng: p.longitude });
    }).then((w) => { if (parado) void GpsFundo.removeWatcher({ id: w }); else id = w; });
    return () => { parado = true; if (id) void GpsFundo.removeWatcher({ id }); };
  }
  if (!navigator.geolocation) { aoErro("Este aparelho não tem GPS."); return () => undefined; }
  const w = navigator.geolocation.watchPosition(
    (p) => aoMudar({ lat: p.coords.latitude, lng: p.coords.longitude }),
    (e) => aoErro(e.code === 1 ? "Libere a localização para continuar." : "GPS indisponível."),
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
  );
  return () => navigator.geolocation.clearWatch(w);
}

/** Posição de agora: tenta o GPS preciso; se demorar (lugar fechado, GPS acordando), aceita a posição aproximada. */
export function posicaoAgora(): Promise<Posicao> {
  const pedir = (o: PositionOptions) => new Promise<Posicao>((ok, falha) => {
    if (!navigator.geolocation) return falha(new Error("Este aparelho não tem GPS."));
    navigator.geolocation.getCurrentPosition((p) => ok({ lat: p.coords.latitude, lng: p.coords.longitude }), (e) => falha(Object.assign(new Error(e.code === 1 ? "Libere a localização." : "GPS indisponível. Tente de novo em alguns segundos."), { negado: e.code === 1 })), o);
  });
  return pedir({ enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 })
    .catch((e: Error & { negado?: boolean }) => (e.negado ? Promise.reject(e) : pedir({ enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 })));
}

// ------------------------------------------------------------------ push (Firebase da empresa)

interface PluginPush {
  requestPermissions(): Promise<{ receive: string }>;
  register(): Promise<void>;
  createChannel(c: Record<string, unknown>): Promise<void>;
  addListener(ev: string, cb: (d: any) => void): Promise<PluginListenerHandle>;
}
const Push = registerPlugin<PluginPush>("PushNotifications");

/** Liga o push no APK (só se a empresa tiver Firebase configurado). Abre a tela certa ao tocar na notificação. */
export async function ligarPush(ativo: boolean, aoTocar: (dados: Record<string, string>) => void) {
  if (!ativo || !nativo() || !Capacitor.isPluginAvailable("PushNotifications")) return;
  try {
    const p = await Push.requestPermissions();
    if (p.receive !== "granted") return;
    for (const [id, nome] of [["corridas", "Corridas"], ["chegada", "Motorista no local"], ["chat", "Mensagens"], ["geral", "Avisos"]]) {
      await Push.createChannel({ id, name: nome, importance: id === "corridas" || id === "chegada" ? 5 : 4, visibility: 1, vibration: true, ...(id === "corridas" ? { sound: "chamada" } : id === "chegada" ? { sound: "buzina" } : id === "chat" ? { sound: "mensagem" } : {}) }).catch(() => undefined);
    }
    await Push.addListener("registration", (t: { value: string }) => { void api("/push", { corpo: { token: t.value } }).catch(() => undefined); });
    await Push.addListener("pushNotificationActionPerformed", (a: { notification?: { data?: Record<string, string> } }) => aoTocar(a.notification?.data ?? {}));
    await Push.register();
  } catch { /* sem push: segue pelo tempo real */ }
}

// ------------------------------------------------------------------ ícone flutuante (só no APK do motorista)

interface PluginFlutuante { manterTela?(o: { ligar: boolean }): Promise<void>; permitido(): Promise<{ valor: boolean }>; pedir(): Promise<void>; mostrar(): Promise<void>; esconder(): Promise<void> }
const FlutuanteNativo = registerPlugin<PluginFlutuante>("Flutuante");
/** Bolinha por cima de outros apps quando o app é minimizado. Fora do APK do motorista, tudo isto não faz nada. */
export const flutuante = {
  disponivel: () => nativo() && Capacitor.isPluginAvailable("Flutuante"),
  permitido: async () => { try { return flutuante.disponivel() ? (await FlutuanteNativo.permitido()).valor : false; } catch { return false; } },
  pedir: async () => { try { if (flutuante.disponivel()) await FlutuanteNativo.pedir(); } catch { /* sem plugin */ } },
  mostrar: async () => { try { if (flutuante.disponivel()) await FlutuanteNativo.mostrar(); } catch { /* sem plugin */ } },
  esconder: async () => { try { if (flutuante.disponivel()) await FlutuanteNativo.esconder(); } catch { /* sem plugin */ } },
};

// ------------------------------------------------------------------ tela sempre acesa (online, em corrida, acompanhando a viagem)

interface TravaDeTela { release(): Promise<void> }
let trava: TravaDeTela | null = null;
let querTelaLigada = false;
async function pegarTrava() {
  try {
    const wl = (navigator as unknown as { wakeLock?: { request(t: "screen"): Promise<TravaDeTela> } }).wakeLock;
    if (wl && !trava) { trava = await wl.request("screen"); (trava as unknown as EventTarget).addEventListener?.("release", () => { trava = null; }); }
  } catch { /* o navegador não deixou (bateria fraca ou aba escondida) */ }
}
if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => { if (querTelaLigada && document.visibilityState === "visible") void pegarTrava(); });
/** Mantém a tela acesa (ou deixa apagar). No APK do motorista também liga a flag nativa; na web usa o Wake Lock e pede de novo ao voltar para o app. */
export async function manterTelaLigada(ligar: boolean) {
  querTelaLigada = ligar;
  if (ligar) await pegarTrava();
  else { try { await trava?.release(); } catch { /* já liberada */ } trava = null; }
  try { if (flutuante.disponivel()) await FlutuanteNativo.manterTela?.({ ligar }); } catch { /* sem plugin */ }
}

// ------------------------------------------------------------------ utilidades

export const reais = (v: number | null | undefined) => (v == null ? "a combinar" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
export const telefoneBonito = (t: string) => t.replace(/^(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3");
export const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
export const vibrar = (ms: number | number[]) => { try { navigator.vibrate?.(ms); } catch { /* sem vibração */ } };

/** Toque curto (chamada de corrida), sem arquivo de som. */
export type Som = "chamada" | "mensagem" | "aceite" | "alerta" | "cancelado" | "buzina";
const ARQUIVOS: Record<Som, string> = {
  chamada: new URL("./sons/chamada.wav", import.meta.url).href,
  mensagem: new URL("./sons/mensagem.wav", import.meta.url).href,
  aceite: new URL("./sons/aceite.wav", import.meta.url).href,
  alerta: new URL("./sons/alerta.wav", import.meta.url).href,
  cancelado: new URL("./sons/cancelado.wav", import.meta.url).href,
  buzina: new URL("./sons/buzina.wav", import.meta.url).href,
};
/** Toca um dos sons do app (arquivos em comum/sons, gerados por scripts/gerar-sons.mjs). `vezes` repete o som; sem `som`, escolhe pelo número de repetições. */
export function tocarAlerta(vezes = 3, som?: Som) {
  const qual: Som = som ?? (vezes <= 1 ? "mensagem" : vezes === 2 ? "cancelado" : "chamada");
  let n = 0;
  const uma = () => {
    try {
      const a = new Audio(ARQUIVOS[qual]);
      a.onended = () => { if (++n < Math.min(vezes, 3)) setTimeout(uma, 250); };
      void a.play().catch(() => bipe());
    } catch { bipe(); }
  };
  uma();
}
/** Fala um aviso em português (voz do aparelho). Sem voz disponível, não faz nada. */
export function falarAviso(texto: string) {
  try {
    const s = window.speechSynthesis;
    if (!s) return;
    const f = new SpeechSynthesisUtterance(texto);
    f.lang = "pt-BR"; f.rate = 1; f.volume = 1;
    f.voice = s.getVoices().find((v) => v.lang.replace("_", "-").toLowerCase() === "pt-br") ?? null;
    s.cancel(); s.speak(f);
  } catch { /* sem voz */ }
}
/** Avisos de cada marco da corrida para o passageiro: som forte e voz. `no_local` toca a buzina e depois fala. */
export function avisoDoMarco(status: string) {
  switch (status) {
    case "a_caminho": tocarAlerta(1, "aceite"); setTimeout(() => falarAviso("Seu motorista está a caminho."), 900); break;
    case "no_local": tocarAlerta(1, "buzina"); setTimeout(() => falarAviso("Seu motorista está no local."), 1500); vibrar([500, 200, 500, 200, 500]); break;
    case "em_andamento": setTimeout(() => falarAviso("Sua corrida começou. Boa viagem."), 200); break;
    case "finalizada": tocarAlerta(1, "aceite"); setTimeout(() => falarAviso("Corrida finalizada."), 900); break;
    case "cancelada": case "nao_atendida": tocarAlerta(1, "cancelado"); setTimeout(() => falarAviso(status === "cancelada" ? "Sua corrida foi cancelada." : "Não encontramos motorista agora."), 900); break;
  }
}
/** Reserva, se o navegador não deixar tocar o arquivo: um bipe simples. */
function bipe() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.25, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    o.start(); o.stop(ctx.currentTime + 0.3);
    setTimeout(() => void ctx.close(), 500);
  } catch { /* sem som */ }
}
