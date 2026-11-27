// Conversa dos apps com o servidor (/api/apps/<empresa>/...), tempo real, áudio, GPS e push.
// Roda no navegador (teste) e dentro do APK (Capacitor). No APK, o build grava config.json com a empresa e o
// endereço da API. No navegador: ?empresa=<id> na URL (e ?api=<url> se a API estiver em outro endereço).

import { falarTexto } from "./voz";
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export type Papel = "passageiro" | "motorista";
/** teste: APK de teste (build com APP_TESTE=1). Mostra o campo "Servidor" na entrada, para trocar o endereço temporário. */
export interface Config { empresaId: string; api: string; papel: Papel; teste?: boolean; descoberta?: string }

const ler = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const gravar = (k: string, v: string | null) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };

let cfg: Config = { empresaId: "", api: "", papel: "passageiro" };
export const config = () => cfg;

// Batida do app: avisa o servidor que está aberto (ao abrir e a cada 4 minutos). O painel usa o "último contato" para saber se o app está instalado.
if (typeof window !== "undefined") {
  const batida = () => { if (token() && document.visibilityState !== "hidden") void api("/ping").catch(() => undefined); };
  setTimeout(batida, 4000);
  setInterval(batida, 4 * 60_000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") setTimeout(batida, 500); });
}
export const nativo = () => Capacitor.isNativePlatform();

/** Só no APK de teste: guarda outro endereço de servidor (ou volta ao do build com ""). Recarrega o app. */
export function trocarServidor(url: string) {
  const u = url.trim().replace(/\/+$/, "");
  if (u && !/^https?:\/\/[^\s"'<>]+$/.test(u)) throw new Error("Endereço inválido. Ex.: https://exemplo.trycloudflare.com");
  gravar("servidor-teste", u || null);
  if (!u) gravar("api-descoberto", null);
  location.reload();
}

const httpsOuHttp = /^https?:\/\/[^\s"'<>]+$/;
const semBarra = (u: string) => u.replace(/\/+$/, "");

/** O servidor responde? (rota pública /api/saude, até 4 s) */
async function servidorVivo(api: string): Promise<boolean> {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 4000);
  try { return (await fetch(`${api}/api/saude`, { cache: "no-store", signal: ctl.signal })).ok; } catch { return false; } finally { clearTimeout(t); }
}

/**
 * Endereço fixo sem gerar APK de novo: se o build trouxe "descoberta" (um endereço FIXO que devolve {"api": "https://..."}),
 * o app confere o servidor que conhece; se não responder, pergunta à descoberta onde o servidor está agora e guarda a resposta.
 * Sem "descoberta" no build, nada muda (usa o endereço do build, ou o digitado no APK de teste).
 */
async function escolherServidor(doBuild: string, descoberta: string | undefined, preferido: string | null): Promise<string> {
  const base = semBarra(preferido || doBuild);
  if (preferido || !descoberta || !httpsOuHttp.test(descoberta)) return base; // endereço digitado à mão no APK de teste manda
  const guardado = ler("api-descoberto");
  for (const c of [guardado, base]) if (c && await servidorVivo(semBarra(c))) return semBarra(c);
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 5000);
    const r = await fetch(descoberta, { cache: "no-store", signal: ctl.signal }).finally(() => clearTimeout(t));
    const novo = r.ok ? semBarra(String(((await r.json()) as { api?: string }).api ?? "")) : "";
    if (httpsOuHttp.test(novo) && await servidorVivo(novo)) { gravar("api-descoberto", novo); return novo; }
  } catch { /* sem rede ou descoberta fora do ar: segue com o que há */ }
  return semBarra(guardado || base);
}

export async function carregarConfig(papel: Papel): Promise<Config> {
  try {
    const r = await fetch("./config.json", { cache: "no-store" });
    if (r.ok) {
      const j = (await r.json()) as Partial<Config>;
      if (j.empresaId) {
        const outro = j.teste ? ler("servidor-teste") : null;
        const api = await escolherServidor(j.api ?? "", j.descoberta, outro);
        return (cfg = { empresaId: j.empresaId, api, papel, teste: !!j.teste, descoberta: j.descoberta });
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

// ------------------------------------------------------------------ foto e vídeo do chat

/** Limites do chat (os mesmos do servidor, para avisar antes de enviar): foto até 5 MB, vídeo até 16 MB. */
export const LIMITE_FOTO = 5 * 1024 * 1024;
export const LIMITE_VIDEO = 16 * 1024 * 1024;
export const ACEITA_MIDIA = "image/jpeg,image/png,image/webp,video/mp4,video/3gpp,video/quicktime,video/webm";

/** Confere o arquivo escolhido (tipo e tamanho). Devolve o motivo se não der para enviar. */
export function problemaDaMidia(f: File): string | null {
  const t = f.type.toLowerCase();
  const foto = ["image/jpeg", "image/png", "image/webp"].includes(t), video = ["video/mp4", "video/3gpp", "video/quicktime", "video/webm"].includes(t);
  if (!foto && !video) return "Escolha uma foto (JPG, PNG ou WEBP) ou um vídeo (MP4, 3GP, MOV ou WEBM).";
  if (foto && f.size > LIMITE_FOTO) return "Foto grande demais (máximo 5 MB).";
  if (video && f.size > LIMITE_VIDEO) return "Vídeo grande demais (máximo 16 MB).";
  return null;
}

const midias = new Map<string, string>();
/** Baixa a foto ou o vídeo com o token e devolve um endereço local para mostrar. */
export async function urlDaMidia(corridaId: string, midiaId: string): Promise<string> {
  const ja = midias.get(midiaId);
  if (ja) return ja;
  const r = await fetch(urlApi(`/corridas/${corridaId}/midia/${midiaId}`), { headers: { authorization: `Bearer ${token() ?? ""}` } });
  if (!r.ok) throw new Error("Não deu para baixar o arquivo.");
  const u = URL.createObjectURL(await r.blob());
  midias.set(midiaId, u);
  return u;
}

/** Envia a foto ou o vídeo ao chat da corrida. */
export const enviarMidiaDoChat = (corridaId: string, f: File, legenda?: string) =>
  api(`/corridas/${corridaId}/midia`, { bruto: f, cabecalhos: legenda ? { "x-legenda": encodeURIComponent(legenda) } : {} });

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

/** Sufixo dos canais de notificação do Android (o som de um canal criado não muda; ver painel/src/apps/push.ts). */
const VERSAO_CANAL = "2";

/** Liga o push no APK (só se a empresa tiver Firebase configurado). Abre a tela certa ao tocar na notificação. */
export async function ligarPush(ativo: boolean, aoTocar: (dados: Record<string, string>) => void) {
  if (!ativo || !nativo() || !Capacitor.isPluginAvailable("PushNotifications")) return;
  try {
    const p = await Push.requestPermissions();
    if (p.receive !== "granted") return;
    for (const [id, nome] of [["corridas", "Corridas"], ["chegada", "Motorista no local"], ["chat", "Mensagens"], ["geral", "Avisos"]]) {
      await Push.createChannel({ id: id + VERSAO_CANAL, name: nome, importance: id === "corridas" || id === "chegada" ? 5 : 4, visibility: 1, vibration: true, ...(id === "corridas" ? { sound: config().papel === "passageiro" ? "aceite" : "toque_corrida" } : id === "chegada" ? { sound: "buzina" } : id === "chat" ? { sound: "mensagem" } : {}) }).catch(() => undefined);
    }
    await Push.addListener("registration", (t: { value: string }) => { void api("/push", { corpo: { token: t.value } }).catch(() => undefined); });
    await Push.addListener("pushNotificationActionPerformed", (a: { notification?: { data?: Record<string, string> } }) => aoTocar(a.notification?.data ?? {}));
    await Push.register();
  } catch { /* sem push: segue pelo tempo real */ }
}

// ------------------------------------------------------------------ ícone flutuante (só no APK do motorista)

interface PluginFlutuante { permissoes?(): Promise<Permissoes>; abrir?(o: { tipo: string }): Promise<void>; ofertaTelaCheia?(o: { titulo: string; texto: string }): Promise<void>; cancelarOferta?(): Promise<void>; rastrear?(o: { url: string; token: string }): Promise<void>; pararRastreio?(): Promise<void>; manterTela?(o: { ligar: boolean }): Promise<void>; permitido(): Promise<{ valor: boolean }>; pedir(): Promise<void>; mostrar(): Promise<void>; esconder(): Promise<void> }
const FlutuanteNativo = registerPlugin<PluginFlutuante>("Flutuante");

/** Situação das permissões do Android que o motorista precisa para receber corrida com o app minimizado ou a tela bloqueada. */
export interface Permissoes { sobrePosicao: boolean; notificacoes: boolean; bateria: boolean; localizacao: boolean; localizacaoSempre: boolean; telaCheia: boolean; fabricante: string; sdk: number }
/** As essenciais: sem elas o motorista não fica online (no APK). */
export const ESSENCIAIS: Array<keyof Permissoes> = ["localizacaoSempre", "notificacoes", "sobrePosicao", "bateria"];
export const permissoesNativas = {
  disponivel: () => nativo() && Capacitor.isPluginAvailable("Flutuante"),
  ler: async (): Promise<Permissoes | null> => { try { return permissoesNativas.disponivel() ? (await FlutuanteNativo.permissoes?.()) ?? null : null; } catch { return null; } },
  abrir: async (tipo: string) => { try { await FlutuanteNativo.abrir?.({ tipo }); } catch { /* sem plugin */ } },
  /** Chegou uma chamada com o app minimizado ou a tela bloqueada: acorda a tela e abre o app por cima de tudo. */
  ofertaTelaCheia: async (titulo: string, texto: string) => { try { if (permissoesNativas.disponivel()) await FlutuanteNativo.ofertaTelaCheia?.({ titulo, texto }); } catch { /* sem plugin */ } },
  cancelarOferta: async () => { try { if (permissoesNativas.disponivel()) await FlutuanteNativo.cancelarOferta?.(); } catch { /* sem plugin */ } },
  /** Falta alguma permissão essencial? Devolve os nomes que faltam (vazio: pode ficar online). Fora do APK, nunca falta. */
  faltando: async (): Promise<Array<keyof Permissoes>> => { const p = await permissoesNativas.ler(); return p ? ESSENCIAIS.filter((k) => !p[k]) : []; },
};
/** Bolinha por cima de outros apps quando o app é minimizado. Fora do APK do motorista, tudo isto não faz nada. */
export const flutuante = {
  disponivel: () => nativo() && Capacitor.isPluginAvailable("Flutuante"),
  permitido: async () => { try { return flutuante.disponivel() ? (await FlutuanteNativo.permitido()).valor : false; } catch { return false; } },
  pedir: async () => { try { if (flutuante.disponivel()) await FlutuanteNativo.pedir(); } catch { /* sem plugin */ } },
  mostrar: async () => { try { if (flutuante.disponivel()) await FlutuanteNativo.mostrar(); } catch { /* sem plugin */ } },
  esconder: async () => { try { if (flutuante.disponivel()) await FlutuanteNativo.esconder(); } catch { /* sem plugin */ } },
};

/** Motorista online: serviço em primeiro plano (notificação fixa) que continua mandando a posição com a tela apagada. Só no APK. */
export async function rastrearEmSegundoPlano(ligar: boolean) {
  try {
    if (!flutuante.disponivel()) return;
    if (ligar && token()) await FlutuanteNativo.rastrear?.({ url: urlApi("/posicao"), token: token() ?? "" });
    else await FlutuanteNativo.pararRastreio?.();
  } catch { /* sem plugin */ }
}

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
export async function manterTelaLigada(ligar: boolean, forcarDesligar = false) {
  querTelaLigada = ligar;
  if (ligar) await pegarTrava();
  else { try { await trava?.release(); } catch { /* já liberada */ } trava = null; }
  // A Activity do APK já liga FLAG_KEEP_SCREEN_ON ao abrir e ao voltar do segundo plano (os dois apps). Aqui só se desliga de propósito
  // (o motorista desligou "Manter a tela ligada"); o resto do tempo a flag fica acesa, mesmo se o Wake Lock da web falhar.
  try { if (flutuante.disponivel() && (ligar || forcarDesligar)) await FlutuanteNativo.manterTela?.({ ligar }); } catch { /* sem plugin */ }
}
// Reforço: reaplica a trava a cada 30 s enquanto o app quer a tela acesa (o WebView pode soltar o Wake Lock sem avisar).
if (typeof window !== "undefined") setInterval(() => { if (querTelaLigada && document.visibilityState === "visible") void pegarTrava(); }, 30_000);

// ------------------------------------------------------------------ utilidades

export const reais = (v: number | null | undefined) => (v == null ? "a combinar" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
export const telefoneBonito = (t: string) => t.replace(/^(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3");
export const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
export const vibrar = (ms: number | number[]) => { try { navigator.vibrate?.(ms); } catch { /* sem vibração */ } };

/** Toque curto (chamada de corrida), sem arquivo de som. */
export type Som = "chamada" | "mensagem" | "aceite" | "alerta" | "cancelado" | "buzina" | "iniciada" | "finalizada";
/** Toques da chamada do motorista (3 à escolha em Ajustes). */
export type Toque = "corrida" | "xperia" | "pulso" | "campanario" | "radar";
const ARQUIVOS: Record<Som, string> = {
  chamada: new URL("./sons/chamada.wav", import.meta.url).href,
  mensagem: new URL("./sons/mensagem.wav", import.meta.url).href,
  aceite: new URL("./sons/aceite.wav", import.meta.url).href,
  alerta: new URL("./sons/alerta.wav", import.meta.url).href,
  cancelado: new URL("./sons/cancelado.wav", import.meta.url).href,
  buzina: new URL("./sons/buzina.wav", import.meta.url).href,
  iniciada: new URL("./sons/iniciada.wav", import.meta.url).href,
  finalizada: new URL("./sons/finalizada.wav", import.meta.url).href,
};
const TOQUES: Record<Toque, string> = {
  corrida: new URL("./sons/toque_corrida.wav", import.meta.url).href, // estilo Uber/99/Machine: padrão da chamada do motorista
  xperia: new URL("./sons/toque_xperia.mp3", import.meta.url).href, // toque escolhido pelo dono (opção nos Ajustes)
  pulso: new URL("./sons/toque_pulso.wav", import.meta.url).href,
  campanario: new URL("./sons/toque_campanario.wav", import.meta.url).href,
  radar: new URL("./sons/toque_radar.wav", import.meta.url).href,
};
/** Toca o toque da chamada do motorista. Em laço (`laco`), repete até alguém chamar pararSons() (aceitou, recusou, expirou ou outro motorista pegou). */
export function tocarToque(toque: Toque, laco: boolean) {
  pararSons();
  const minha = geracaoDeSom;
  const url = TOQUES[toque] ?? TOQUES.corrida;
  const comAudio = () => {
    try {
      const a = new Audio(url);
      a.loop = laco; a.volume = 1;
      tocando.add(a);
      a.onended = () => tocando.delete(a);
      void a.play().catch(() => { if (minha === geracaoDeSom) bipe(); });
    } catch { bipe(); }
  };
  // Primeiro pelo contexto de áudio já liberado (toca em laço mesmo com o app em segundo plano e sem toque novo na tela); senão <audio>.
  void (async () => {
    try {
      const c = ctxAudio();
      if (c.state !== "running") await c.resume().catch(() => undefined);
      if (c.state === "running") {
        const src = c.createBufferSource(); src.buffer = await bufferDe(url); src.loop = laco; src.connect(c.destination);
        if (minha !== geracaoDeSom) return; // já mandaram parar
        src.start(); emContexto.add(src); src.onended = () => emContexto.delete(src);
        return;
      }
    } catch { /* cai para o <audio> */ }
    if (minha === geracaoDeSom) comAudio();
  })();
}
/** Toca um dos sons do app (arquivos em comum/sons, gerados por scripts/gerar-sons.mjs). `vezes` repete o som; sem `som`, escolhe pelo número de repetições. */
// ÁUDIO DESBLOQUEADO: o WebView do Android não toca som sem um toque do usuário. Ao primeiro toque na tela o contexto de áudio é liberado e os sons
// já ficam decodificados; depois disso o aceite, "chegou" e os outros marcos tocam sozinhos, mesmo sem ninguém mexer no app.
let contextoDeAudio: AudioContext | null = null;
const bufferes = new Map<string, AudioBuffer>();
const ctxAudio = () => (contextoDeAudio ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)());
async function bufferDe(url: string) {
  let b = bufferes.get(url);
  if (!b) { const ab = await (await fetch(url)).arrayBuffer(); b = await ctxAudio().decodeAudioData(ab); bufferes.set(url, b); }
  return b;
}
async function tocarNoContexto(url: string): Promise<AudioBufferSourceNode | null> {
  try {
    const c = ctxAudio();
    if (c.state !== "running") await c.resume().catch(() => undefined);
    if (c.state !== "running") return null;
    const src = c.createBufferSource(); src.buffer = await bufferDe(url); src.connect(c.destination); src.start();
    return src;
  } catch { return null; }
}
if (typeof window !== "undefined") {
  const liberar = () => {
    try { void ctxAudio().resume().then(() => { for (const u of [...Object.values(ARQUIVOS), ...Object.values(TOQUES)]) void bufferDe(u).catch(() => undefined); }); } catch { /* sem áudio */ }
  };
  for (const ev of ["pointerdown", "touchstart", "keydown"]) window.addEventListener(ev, liberar, { passive: true });
}
const emContexto = new Set<AudioBufferSourceNode>();

export function tocarAlerta(vezes = 3, som?: Som) {
  const qual: Som = som ?? (vezes <= 1 ? "mensagem" : vezes === 2 ? "cancelado" : "chamada");
  let n = 0;
  const minha = ++geracaoDeSom;
  const uma = () => {
    if (minha !== geracaoDeSom) return; // alguém mandou parar
    // 1º: contexto de áudio já liberado (toca mesmo sem gesto novo); 2º: <audio>; 3º: bipe.
    void tocarNoContexto(ARQUIVOS[qual]).then((src) => {
      if (src) { emContexto.add(src); src.onended = () => { emContexto.delete(src); if (++n < Math.min(vezes, 3)) setTimeout(uma, 250); }; return; }
      tocarComAudio();
    });
  };
  const tocarComAudio = () => {
    try {
      const a = new Audio(ARQUIVOS[qual]);
      a.volume = 1;
      tocando.add(a);
      a.onended = () => { tocando.delete(a); if (++n < Math.min(vezes, 3)) setTimeout(uma, 250); };
      void a.play().catch(() => bipe());
    } catch { bipe(); }
  };
  uma();
}
const tocando = new Set<HTMLAudioElement>();
let geracaoDeSom = 0;
/** Para na hora o toque da chamada (aceitou, recusou, venceu ou outro motorista pegou a corrida) e a vibração. */
export function pararSons() {
  geracaoDeSom++;
  for (const s of emContexto) { try { s.stop(); } catch { /* já parou */ } }
  emContexto.clear();
  void permissoesNativas.cancelarOferta(); // some a notificação de chamada em tela cheia
  for (const a of tocando) { try { a.pause(); a.currentTime = 0; } catch { /* já parou */ } }
  tocando.clear();
  try { navigator.vibrate?.(0); } catch { /* sem vibração */ }
}
/** Fala um aviso em português (voz do painel se já guardada; senão a melhor voz do aparelho). Frases fixas e curtas. */
export function falarAviso(texto: string) { void falarTexto(texto, { fixa: true }); }
/** Avisos de cada marco da corrida para o passageiro: som forte e voz. `no_local` toca a buzina e depois fala. */
export function avisoDoMarco(status: string) {
  try { ((window as unknown as { __marcos?: string[] }).__marcos ??= []).push(status); } catch { /* só observação dos testes */ }
  switch (status) {
    case "a_caminho": tocarAlerta(1, "aceite"); setTimeout(() => falarAviso("Seu motorista está a caminho."), 900); break;
    case "no_local": tocarAlerta(1, "buzina"); setTimeout(() => falarAviso("Seu motorista está no local."), 1500); vibrar([500, 200, 500, 200, 500]); break;
    case "em_andamento": tocarAlerta(1, "iniciada"); setTimeout(() => falarAviso("Sua corrida começou. Boa viagem."), 1200); break;
    case "finalizada": tocarAlerta(1, "finalizada"); setTimeout(() => falarAviso("Corrida finalizada."), 900); break;
    case "cancelada": case "nao_atendida": tocarAlerta(1, "cancelado"); setTimeout(() => falarAviso(status === "cancelada" ? "Sua corrida foi cancelada." : "Não há nenhum motorista disponível no momento."), 900); break;
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
