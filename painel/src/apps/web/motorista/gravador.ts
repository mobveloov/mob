// Gravação da corrida (segurança do motorista): áudio (ou vídeo, se a empresa liberar) em pedaços de 60 s, qualidade baixa
// (áudio Opus ~24 kbps; vídeo 480p, 15 quadros, ~500 kbps) para gastar pouco espaço e dados. Os pedaços vão para o servidor assim que
// possível; os que não foram ficam na fila e saem na próxima chance (rede volta).

import { token, urlApi } from "../comum/api";

export interface ConfigGravacao { ativa: boolean; obrigatoria: boolean; video: boolean; dias: number }
interface Pedaco { n: number; blob: Blob; segundos: number; video: boolean }

let sessao: { corridaId: string; rec: MediaRecorder; fluxo: MediaStream; n: number; fila: Pedaco[]; inicio: number; video: boolean } | null = null;
let enviando = false;

async function esvaziarFila() {
  if (enviando || !sessao) return;
  enviando = true;
  try {
    while (sessao && sessao.fila.length) {
      const p = sessao.fila[0];
      const r = await fetch(urlApi(`/corridas/${sessao.corridaId}/gravacao`), {
        method: "POST", body: p.blob,
        headers: { authorization: `Bearer ${token() ?? ""}`, "content-type": p.blob.type.split(";")[0] || "audio/webm", "x-parte": String(p.n), "x-segundos": String(p.segundos), "x-video": p.video ? "1" : "0" },
      });
      if (!r.ok && r.status !== 413) throw new Error(String(r.status));
      sessao.fila.shift();
    }
  } catch { /* sem rede agora: tenta de novo no próximo pedaço */ } finally { enviando = false; }
}
if (typeof window !== "undefined") window.addEventListener("online", () => void esvaziarFila());

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
    const nova = { corridaId, rec, fluxo, n: 0, fila: [] as Pedaco[], inicio: Date.now(), video };
    sessao = nova;
    rec.ondataavailable = (e) => {
      if (!e.data.size || sessao !== nova) return;
      nova.fila.push({ n: nova.n++, blob: e.data, segundos: Math.round((Date.now() - nova.inicio) / 1000), video });
      void esvaziarFila();
    };
    rec.start(60_000);
    return true;
  } catch { sessao = null; return false; }
}

/** Para a gravação e manda o último pedaço. */
export function pararGravacao() {
  const s = sessao;
  if (!s) return;
  try { if (s.rec.state !== "inactive") s.rec.stop(); } catch { /* já parou */ }
  s.fluxo.getTracks().forEach((t) => t.stop());
  // O último pedaço chega no evento seguinte; a fila continua sendo esvaziada mesmo depois de "parar".
  setTimeout(() => { if (sessao === s) { sessao = null; } }, 3000);
  void esvaziarFila();
}
