// Gravação da corrida: áudio (ou vídeo, se a empresa liberar) em pedaços de 60 s, qualidade baixa (áudio Opus ~24 kbps; vídeo 480p,
// 15 quadros, ~500 kbps) para gastar pouco espaço e dados.
//
// Cópia no celular: cada pedaço é gravado no armazenamento do aparelho (IndexedDB) assim que sai do gravador. Se o app fechar, o celular
// reiniciar ou faltar rede, nada se perde: o envio recomeça na próxima abertura. Depois de enviado, a cópia fica no aparelho por
// DIAS_COPIA dias (o motorista tem a própria prova) e some sozinha; o que nunca conseguiu subir some em DIAS_LIMITE.
//
// Envio só em Wi‑Fi (ajuste do motorista, ligado por padrão): com dados móveis os pedaços esperam no aparelho. O app descobre o tipo de
// rede por navigator.connection.type; se o aparelho não informa, o envio é liberado (não dá para saber, e a gravação não pode ficar presa).

import { token, urlApi } from "../comum/api";

export interface ConfigGravacao { ativa: boolean; obrigatoria: boolean; video: boolean; dias: number }
interface Pedaco { id: string; corridaId: string; n: number; blob: Blob; segundos: number; video: boolean; em: number; enviadoEm: number | null }

export const DIAS_COPIA = 3;
export const DIAS_LIMITE = 7;
const DIA = 86_400_000;

// ------------------------------------------------------------------ armazenamento no aparelho (IndexedDB)

let abrindo: Promise<IDBDatabase | null> | null = null;
function abrirBanco(): Promise<IDBDatabase | null> {
  abrindo ??= new Promise((ok) => {
    try {
      if (typeof indexedDB === "undefined") return ok(null);
      const r = indexedDB.open("gravacoes-corridas", 1);
      r.onupgradeneeded = () => { r.result.createObjectStore("pedacos", { keyPath: "id" }); };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ok(null);
    } catch { ok(null); }
  });
  return abrindo;
}
async function guardar(p: Pedaco) {
  const db = await abrirBanco();
  if (!db) { memoria.set(p.id, p); return; } // sem armazenamento: segura só na memória, até o app fechar
  await new Promise<void>((ok) => { try { const t = db.transaction("pedacos", "readwrite"); t.objectStore("pedacos").put(p); t.oncomplete = () => ok(); t.onerror = () => ok(); t.onabort = () => ok(); } catch { memoria.set(p.id, p); ok(); } });
}
async function todos(): Promise<Pedaco[]> {
  const db = await abrirBanco();
  const dosDois = [...memoria.values()];
  if (!db) return dosDois;
  const lista = await new Promise<Pedaco[]>((ok) => { try { const q = db.transaction("pedacos").objectStore("pedacos").getAll(); q.onsuccess = () => ok(q.result as Pedaco[]); q.onerror = () => ok([]); } catch { ok([]); } });
  return [...lista, ...dosDois];
}
async function apagar(id: string) {
  memoria.delete(id);
  const db = await abrirBanco();
  if (!db) return;
  await new Promise<void>((ok) => { try { const t = db.transaction("pedacos", "readwrite"); t.objectStore("pedacos").delete(id); t.oncomplete = () => ok(); t.onerror = () => ok(); t.onabort = () => ok(); } catch { ok(); } });
}
const memoria = new Map<string, Pedaco>();

// ------------------------------------------------------------------ rede

/** Só Wi‑Fi (ou cabo): "wifi"/"ethernet" liberam, "cellular" segura. Sem informação do aparelho, libera. */
export function redeLiberada(soWifi: boolean): boolean {
  if (!soWifi) return true;
  const t = (navigator as unknown as { connection?: { type?: string } }).connection?.type;
  return !t || t === "wifi" || t === "ethernet" || t === "unknown" || t === "other";
}

// ------------------------------------------------------------------ envio

let soWifi = true;
let enviando = false;
let sessao: { corridaId: string; rec: MediaRecorder; fluxo: MediaStream; n: number; inicio: number; video: boolean } | null = null;

/** Muda a regra de envio (ajuste do motorista) e tenta mandar o que está esperando. */
export function usarSoWifi(v: boolean) { soWifi = v; void enviarPendentes(); }

/** Manda para o servidor tudo que ainda não foi (da corrida atual e de corridas anteriores), em ordem. */
export async function enviarPendentes() {
  if (enviando || !token() || !redeLiberada(soWifi)) return;
  enviando = true;
  try {
    const fila = (await todos()).filter((p) => p.enviadoEm == null).sort((a, b) => a.em - b.em || a.n - b.n);
    for (const p of fila) {
      let r: Response;
      try {
        r = await fetch(urlApi(`/corridas/${p.corridaId}/gravacao`), {
          method: "POST", body: p.blob,
          headers: { authorization: `Bearer ${token() ?? ""}`, "content-type": p.blob.type.split(";")[0] || "audio/webm", "x-parte": String(p.n), "x-segundos": String(p.segundos), "x-video": p.video ? "1" : "0" },
        });
      } catch { break; } // sem rede agora: continua na fila
      if (r.ok) { await guardar({ ...p, enviadoEm: Date.now() }); continue; }
      if ([400, 403, 404, 413].includes(r.status)) { await apagar(p.id); continue; } // o servidor recusou de vez: não adianta insistir
      break; // 401, 5xx...: tenta depois
    }
  } finally { enviando = false; }
  await limparCopias();
}

/** Apaga as cópias enviadas há mais de DIAS_COPIA dias e as que nunca subiram há mais de DIAS_LIMITE dias. */
async function limparCopias() {
  const agora = Date.now();
  for (const p of await todos()) {
    if ((p.enviadoEm != null && agora - p.enviadoEm > DIAS_COPIA * DIA) || agora - p.em > DIAS_LIMITE * DIA) await apagar(p.id);
  }
}

/** Quantos pedaços ainda esperam para subir (para mostrar ao motorista). */
export async function pedacosEsperando(): Promise<number> { return (await todos()).filter((p) => p.enviadoEm == null).length; }

if (typeof window !== "undefined") {
  window.addEventListener("online", () => void enviarPendentes());
  (navigator as unknown as { connection?: EventTarget }).connection?.addEventListener?.("change", () => void enviarPendentes());
  setTimeout(() => void enviarPendentes(), 4000); // abriu o app: manda o que sobrou de antes
}

// ------------------------------------------------------------------ gravação

export const gravando = () => !!sessao;

/** Começa a gravar esta corrida (se já estiver gravando a mesma, não faz nada). Devolve false se o aparelho não deixou. */
export async function iniciarGravacao(corridaId: string, video: boolean): Promise<boolean> {
  if (sessao?.corridaId === corridaId) return true;
  pararGravacao();
  try {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) return false;
    const fluxo = await navigator.mediaDevices.getUserMedia(video ? { audio: true, video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 } } } : { audio: true });
    const tipos = video ? ["video/webm;codecs=vp8,opus", "video/webm"] : ["audio/webm;codecs=opus", "audio/webm"];
    const mimeType = tipos.find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(fluxo, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 24_000, ...(video ? { videoBitsPerSecond: 500_000 } : {}) });
    const nova = { corridaId, rec, fluxo, n: 0, inicio: Date.now(), video };
    sessao = nova;
    rec.ondataavailable = (e) => {
      if (!e.data.size) return;
      const n = nova.n++;
      // O pedaço é guardado no aparelho primeiro (mesmo depois de "parar"); só então tenta subir.
      void guardar({ id: `${corridaId}:${n}`, corridaId, n, blob: e.data, segundos: Math.round((Date.now() - nova.inicio) / 1000), video, em: Date.now(), enviadoEm: null }).then(() => enviarPendentes());
    };
    rec.start(60_000);
    return true;
  } catch { sessao = null; return false; }
}

/** Para a gravação; o último pedaço é guardado e enviado quando a rede deixar. */
export function pararGravacao() {
  const s = sessao;
  if (!s) return;
  sessao = null;
  try { if (s.rec.state !== "inactive") s.rec.stop(); } catch { /* já parou */ }
  s.fluxo.getTracks().forEach((t) => t.stop());
}
