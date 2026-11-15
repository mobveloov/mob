// Repasse entre passageiro e motorista pelo número do bot, durante a corrida (sem mostrar o telefone de nenhum dos dois).
// Passageiro (WhatsApp) -> motorista: texto, áudio e localização caem no chat da corrida do app do motorista.
// Motorista (chat do app) -> passageiro: texto e áudio saem pelo WhatsApp, pelo mesmo número em que ele pediu a corrida.

import fs from "node:fs";
import { arquivoDoAudio, enviarAudio, enviarTexto, mensagens, TIPOS_AUDIO } from "../apps/chat.ts";
import type { ProvedorWhatsApp } from "./provedores.ts";
import type { Conversa, Recebida } from "./tipos.ts";

/** Só repassa com motorista a caminho, no local ou em corrida (antes disso ninguém para ler). */
export const comMotorista = (c: Conversa) => Boolean(c.corrida && c.corrida.grupo === "aberta" && ["a_caminho", "no_local", "em_andamento"].includes(c.corrida.status));

export const linkDoMapa = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat},${lng}`;

/**
 * Passageiro -> motorista. Devolve o que foi repassado ("texto", "audio", "local") ou null se nada foi.
 * `baixar` traz os bytes do áudio original (do provedor); sem ele, o áudio vai como texto transcrito.
 */
export async function repassarAoMotorista(
  empresaId: string, c: Conversa, r: Recebida, texto: string,
  baixar?: (a: NonNullable<Recebida["audio"]>) => Promise<{ bytes: Buffer; mimetype: string } | null>,
): Promise<"texto" | "audio" | "local" | null> {
  if (!comMotorista(c)) return null;
  const corridaId = c.corrida!.id;
  try {
    if (r.local) {
      enviarTexto(empresaId, corridaId, "passageiro", c.nome, `📍 Localização do passageiro${r.local.texto ? ` (${r.local.texto})` : ""}: ${linkDoMapa(r.local.lat!, r.local.lng!)}`);
      return "local";
    }
    if (r.audio && baixar) {
      const arq = await baixar(r.audio).catch(() => null);
      const mime = arq?.mimetype.split(";")[0].trim().toLowerCase() ?? "";
      if (arq && TIPOS_AUDIO[mime]) {
        try { enviarAudio(empresaId, corridaId, "passageiro", c.nome, mime, arq.bytes); return "audio"; } catch { /* arquivo fora do limite ou inválido: vai o texto */ }
      }
    }
    if (texto.trim()) { enviarTexto(empresaId, corridaId, "passageiro", c.nome, texto); return "texto"; }
  } catch (e) {
    console.error("[bot] repasse ao motorista", empresaId, e instanceof Error ? e.message : e);
  }
  return null;
}

/**
 * Motorista -> passageiro: manda pelo WhatsApp o que o motorista escreveu ou gravou depois do último repasse.
 * Devolve quantas mensagens saíram. Atualiza `corrida.chatEm` (quem chama grava a conversa).
 */
export async function repassarAoPassageiro(empresaId: string, c: Conversa, provedor: ProvedorWhatsApp): Promise<number> {
  const corrida = c.corrida;
  if (!corrida || corrida.grupo !== "aberta") return 0;
  const desde = corrida.chatEm ?? corrida.criadaEm;
  let feitas = 0;
  let ms: ReturnType<typeof mensagens>;
  try { ms = mensagens(empresaId, corrida.id); } catch { return 0; }
  for (const m of ms) {
    if (m.de !== "motorista" || m.em <= desde) continue;
    try {
      if (m.audio) {
        const arq = arquivoDoAudio(empresaId, corrida.id, m.audio.id);
        if (arq && provedor.enviarMidia) await provedor.enviarMidia(c.id, { tipo: "audio", bytes: fs.readFileSync(arq.caminho), mimetype: arq.mime });
        else await provedor.enviarTexto(c.id, "🎤 O motorista mandou um áudio, mas não consegui enviar por aqui.");
        c.mensagens.push({ de: "bot", texto: "🎤 Áudio do motorista", em: new Date().toISOString() });
      } else if (m.texto) {
        const t = `🚗 ${m.nome ? m.nome.split(/\s+/)[0] : "Motorista"}: ${m.texto}`;
        await provedor.enviarTexto(c.id, t);
        c.mensagens.push({ de: "bot", texto: t, em: new Date().toISOString() });
      } else continue;
      feitas++;
    } catch (e) {
      console.error("[bot] repasse ao passageiro", empresaId, e instanceof Error ? e.message : e);
      return feitas; // tenta de novo na próxima rodada (chatEm só avança até o último enviado)
    }
    corrida.chatEm = m.em;
  }
  return feitas;
}
