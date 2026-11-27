// Voz do servidor para os avisos falados dos apps (passageiro e motorista): a MESMA voz neural do bot (Gemini das
// Integrações Avançadas da empresa). Só frases curtas e fixas, com cache em memória por empresa+voz+texto.
// Sem chave configurada, o app usa a melhor voz do aparelho (ou só o toque).

import { createHash } from "node:crypto";
import { podeFalar, sintetizar, limparVoz, type AudioPronto, type DepsVoz } from "../bot/voz.ts";

export const MAX_TEXTO_VOZ = 140;
const CACHE_MAX = 300;
const cache = new Map<string, AudioPronto>();
const limites = new Map<string, { janela: number; n: number }>();

/** Texto aceito para falar: curto, sem links. */
export function textoDeVoz(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t && t.length <= MAX_TEXTO_VOZ && !/https?:|www\./i.test(t) ? t : null;
}

/** No máximo 40 pedidos por minuto por pessoa (cada pedido novo gasta a chave da empresa). */
function dentroDoLimite(chave: string, agora = Date.now()): boolean {
  const l = limites.get(chave);
  if (!l || agora - l.janela > 60_000) { limites.set(chave, { janela: agora, n: 1 }); return true; }
  return ++l.n <= 40;
}

export function vozDisponivel(empresaId: string, deps?: DepsVoz) { return podeFalar(empresaId, deps); }

export async function vozDoApp(empresaId: string, pessoa: string, texto: string, voz: unknown, deps?: DepsVoz): Promise<{ audio: AudioPronto; cache: boolean } | "limite" | null> {
  const v = limparVoz(voz);
  const id = createHash("sha256").update(`${empresaId}\n${v}\n${texto}`).digest("hex");
  const guardado = cache.get(id);
  if (guardado) return { audio: guardado, cache: true };
  if (!dentroDoLimite(`${empresaId}:${pessoa}`)) return "limite";
  const a = await sintetizar(empresaId, texto, v, deps);
  if (!a) return null;
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(id, a);
  return { audio: a, cache: false };
}
