// Voz do bot: quando o passageiro manda ÁUDIO, a resposta vai também em áudio (depois do texto). Só com chave
// (Gemini; OpenAI como reserva). Sem chave, ou se a voz falhar, fica só o texto. As regras de fala são as do
// sistema de referência (voz-texto.ts e voz-gemini.ts).

import { chavesDisponiveis, rotas } from "../ia/roteador.ts";
import * as D from "../servidor/dados.ts";
import { geminiAudioFrom, geminiTtsBody, geminiVoiceName } from "./voz-gemini.ts";
import { speakableText } from "./voz-texto.ts";

type FetchLike = typeof fetch;
export interface DepsVoz { fetch?: FetchLike; env?: Record<string, string | undefined>; chavesEmpresa?: Record<string, string> }
export interface AudioPronto { bytes: Buffer; mimetype: string }

export const VOZES_GEMINI = ["Kore", "Puck", "Charon", "Fenrir", "Aoede", "Leda", "Orus", "Zephyr"];
export const VOZ_PADRAO = "Kore";
export const limparVoz = (v: unknown): string => geminiVoiceName(typeof v === "string" ? v : "") || VOZ_PADRAO;

/** Há chave para falar? */
export function podeFalar(empresaId: string, deps: DepsVoz = {}): boolean {
  const ch = chavesDisponiveis(deps.chavesEmpresa ?? D.segredos(empresaId).ia, deps.env ?? process.env);
  return ch.gemini.length > 0 || ch.openai.length > 0;
}

/** Texto -> áudio. null quando o texto não vale a pena falar (longo, só link), não há chave ou a voz falhou. */
export async function sintetizar(empresaId: string, mensagem: string, voz: string, deps: DepsVoz = {}): Promise<AudioPronto | null> {
  const fala = speakableText(mensagem);
  if (!fala) return null;
  const f = deps.fetch ?? fetch;
  const env = deps.env ?? process.env;
  const ch = chavesDisponiveis(deps.chavesEmpresa ?? D.segredos(empresaId).ia, env);
  const modelo = rotas("voz", env).find((r) => r.provedor === "gemini")?.modelo ?? "gemini-2.5-flash-preview-tts";
  for (const chave of ch.gemini.slice(0, 2)) {
    try {
      const r = await f(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": chave },
        body: JSON.stringify(geminiTtsBody(fala, voz)), signal: AbortSignal.timeout(20_000),
      });
      if (!r.ok) { console.error("[bot] voz gemini", `HTTP ${r.status}`); continue; }
      const a = geminiAudioFrom(await r.json());
      if (a) return { bytes: Buffer.from(a.audioBase64, "base64"), mimetype: a.mimeType };
    } catch (e) { console.error("[bot] voz gemini", e instanceof Error ? e.message : e); }
  }
  for (const chave of ch.openai.slice(0, 1)) {
    try {
      const r = await f("https://api.openai.com/v1/audio/speech", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${chave}` },
        body: JSON.stringify({ model: "gpt-4o-mini-tts", voice: "nova", input: fala, response_format: "opus" }), signal: AbortSignal.timeout(20_000),
      });
      if (!r.ok) { console.error("[bot] voz openai", `HTTP ${r.status}`); continue; }
      const bytes = Buffer.from(await r.arrayBuffer());
      if (bytes.length) return { bytes, mimetype: "audio/ogg" };
    } catch (e) { console.error("[bot] voz openai", e instanceof Error ? e.message : e); }
  }
  return null;
}
