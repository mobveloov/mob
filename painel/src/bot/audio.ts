// Áudio do passageiro: transcrição pela nuvem (Groq, depois OpenAI), com as chaves da empresa e da plataforma.
// Sem chave nenhuma, não transcreve (o bot pede para escrever). Nenhuma chave fica no código.

import { chavesDisponiveis } from "../ia/roteador.ts";
import * as D from "../servidor/dados.ts";
import type { ProvedorWhatsApp } from "./provedores.ts";
import type { AudioRecebido } from "./tipos.ts";

type FetchLike = typeof fetch;

export interface DepsAudio { fetch?: FetchLike; env?: Record<string, string | undefined>; chavesEmpresa?: Record<string, string> }

/** Dica de vocabulário para o modelo acertar ruas e lugares do Brasil. */
const DICA = "Pedido de corrida por WhatsApp. Endereços brasileiros: rua, avenida, número, bairro, praça, hospital, rodoviária, shopping.";

export const extensao = (mimetype: string) => {
  const m = mimetype.toLowerCase();
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "m4a";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("webm")) return "webm";
  if (m.includes("wav")) return "wav";
  return "ogg";
};

const ENDPOINTS = [
  { provedor: "groq" as const, url: "https://api.groq.com/openai/v1/audio/transcriptions", modelo: "whisper-large-v3-turbo" },
  { provedor: "openai" as const, url: "https://api.openai.com/v1/audio/transcriptions", modelo: "whisper-1" },
];

/** Há alguma chave para transcrever? */
export function podeTranscrever(empresaId: string, deps: DepsAudio = {}): boolean {
  const ch = chavesDisponiveis(deps.chavesEmpresa ?? D.segredos(empresaId).ia, deps.env ?? process.env);
  return ENDPOINTS.some((e) => ch[e.provedor].length > 0);
}

/** Transcreve os bytes de um áudio. null quando não há chave ou nada deu certo. */
export async function transcrever(empresaId: string, bytes: Buffer, mimetype: string, deps: DepsAudio = {}): Promise<string | null> {
  const f = deps.fetch ?? fetch;
  const ch = chavesDisponiveis(deps.chavesEmpresa ?? D.segredos(empresaId).ia, deps.env ?? process.env);
  for (const e of ENDPOINTS) {
    for (const chave of ch[e.provedor].slice(0, 2)) {
      try {
        const form = new FormData();
        form.append("file", new Blob([new Uint8Array(bytes)], { type: mimetype || "audio/ogg" }), `audio.${extensao(mimetype)}`);
        form.append("model", e.modelo);
        form.append("language", "pt");
        form.append("prompt", DICA);
        const r = await f(e.url, { method: "POST", headers: { Authorization: `Bearer ${chave}` }, body: form, signal: AbortSignal.timeout(45_000) });
        if (!r.ok) { console.error("[bot] transcrição", e.provedor, `HTTP ${r.status}`); continue; }
        const texto = String(((await r.json()) as { text?: unknown }).text ?? "").trim();
        if (texto) return texto.slice(0, 1000);
      } catch (err) {
        console.error("[bot] transcrição", e.provedor, err instanceof Error ? err.message : err);
      }
    }
  }
  return null;
}

/** Texto do áudio: já pronto (simulado), ou baixado do provedor e transcrito. null quando não deu. */
export async function textoDoAudio(empresaId: string, a: AudioRecebido, provedor: ProvedorWhatsApp, deps: DepsAudio = {}): Promise<string | null> {
  if (a.transcricao?.trim()) return a.transcricao.trim().slice(0, 1000);
  if (!podeTranscrever(empresaId, deps) || !provedor.baixarAudio) return null;
  try {
    const arq = await provedor.baixarAudio(a);
    return arq ? await transcrever(empresaId, arq.bytes, arq.mimetype, deps) : null;
  } catch (e) {
    console.error("[bot] baixar áudio", e instanceof Error ? e.message : e);
    return null;
  }
}
