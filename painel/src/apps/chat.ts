// Chat da corrida entre passageiro e motorista: texto e áudio.
// Mensagens em DADOS_DIR/empresas/<id>/apps/chat/<corrida>.json; áudios em .../chat/audio/<id>.<ext>.
// Áudio: só os tipos da lista (conferidos pelo cabeçalho do arquivo, não só pelo Content-Type) e até APPS_AUDIO_MAX_KB
// (padrão 1024 KB, mais ou menos 1 minuto). No máximo 60 áudios e 500 mensagens por corrida.

import crypto from "node:crypto";
import fs from "node:fs";
import { arquivo, gravar, idCorridaValido, ler } from "./armazem.ts";
import type { PapelApp } from "./sessoes.ts";

export interface Mensagem {
  id: string;
  de: PapelApp;
  nome: string;
  texto?: string;
  audio?: { id: string; mime: string; bytes: number; segundos: number | null };
  em: string;
}

const MAX_MENSAGENS = 500;
const MAX_AUDIOS = 60;
export const maxAudioBytes = () => Math.max(16, Math.min(Number(process.env.APPS_AUDIO_MAX_KB) || 1024, 5120)) * 1024;

/** Tipos aceitos → extensão do arquivo. */
export const TIPOS_AUDIO: Record<string, string> = {
  "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/aac": "aac", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav",
};
const MIME_DA_EXT: Record<string, string> = { webm: "audio/webm", ogg: "audio/ogg", m4a: "audio/mp4", aac: "audio/aac", mp3: "audio/mpeg", wav: "audio/wav" };

/** O começo do arquivo bate com o tipo? (evita guardar qualquer coisa com Content-Type de áudio) */
function cabecalhoConfere(ext: string, b: Uint8Array): boolean {
  const s = (i: number, t: string) => Buffer.from(b.subarray(i, i + t.length)).toString("latin1") === t;
  switch (ext) {
    case "webm": return b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
    case "ogg": return s(0, "OggS");
    case "m4a": return s(4, "ftyp");
    case "wav": return s(0, "RIFF") && s(8, "WAVE");
    case "mp3": return s(0, "ID3") || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0);
    case "aac": return b[0] === 0xff && (b[1] & 0xf6) === 0xf0;
    default: return false;
  }
}

const arqChat = (empresaId: string, corridaId: string) => {
  if (!idCorridaValido(corridaId)) throw new Error("Corrida inválida.");
  return arquivo(empresaId, "chat", `${corridaId}.json`);
};

export const mensagens = (empresaId: string, corridaId: string) => ler<Mensagem[]>(arqChat(empresaId, corridaId), []);

const agora = () => new Date().toISOString();

function acrescentar(empresaId: string, corridaId: string, m: Mensagem) {
  const l = mensagens(empresaId, corridaId);
  if (l.length >= MAX_MENSAGENS) throw new Error("O chat desta corrida chegou ao limite de mensagens.");
  gravar(arqChat(empresaId, corridaId), [...l, m]);
  return m;
}

export function enviarTexto(empresaId: string, corridaId: string, de: PapelApp, nome: string, texto: string): Mensagem {
  const t = String(texto ?? "").replace(/[<>]/g, "").trim().slice(0, 1000);
  if (!t) throw new Error("Escreva a mensagem.");
  return acrescentar(empresaId, corridaId, { id: crypto.randomUUID(), de, nome: nome.slice(0, 80), texto: t, em: agora() });
}

/** Confere (tipo, tamanho e começo do arquivo) e guarda um áudio na pasta da empresa. Usado pelo chat da corrida e pelo chat com a central. */
export function salvarArquivoDeAudio(empresaId: string, tipo: string, bytes: Uint8Array, segundos?: number): { id: string; mime: string; bytes: number; segundos: number | null } {
  const mime = String(tipo ?? "").split(";")[0].trim().toLowerCase();
  const ext = TIPOS_AUDIO[mime];
  if (!ext) throw new Error("Tipo de áudio não aceito.");
  if (!bytes?.length) throw new Error("Áudio vazio.");
  if (bytes.length > maxAudioBytes()) throw new Error(`Áudio grande demais (máximo ${Math.round(maxAudioBytes() / 1024)} KB).`);
  if (!cabecalhoConfere(ext, bytes)) throw new Error("O arquivo não é um áudio válido.");
  const id = crypto.randomUUID();
  fs.mkdirSync(arquivo(empresaId, "chat", "audio"), { recursive: true });
  fs.writeFileSync(arquivo(empresaId, "chat", "audio", `${id}.${ext}`), bytes, { mode: 0o600 });
  const seg = segundos != null && Number.isFinite(segundos) && segundos > 0 && segundos < 600 ? Math.round(segundos) : null;
  return { id, mime: MIME_DA_EXT[ext], bytes: bytes.length, segundos: seg };
}

/** Arquivo de um áudio pelo id (quem chama confere antes que o áudio é da pessoa certa). */
export function caminhoDoAudio(empresaId: string, audioId: string, mime: string): { caminho: string; mime: string } | null {
  if (!idCorridaValido(audioId)) return null;
  const ext = Object.entries(MIME_DA_EXT).find(([, v]) => v === mime)?.[0];
  if (!ext) return null;
  const caminho = arquivo(empresaId, "chat", "audio", `${audioId}.${ext}`);
  return fs.existsSync(caminho) ? { caminho, mime } : null;
}

export function enviarAudio(empresaId: string, corridaId: string, de: PapelApp, nome: string, tipo: string, bytes: Uint8Array, segundos?: number): Mensagem {
  const l = mensagens(empresaId, corridaId);
  if (l.filter((m) => m.audio).length >= MAX_AUDIOS) throw new Error("Esta corrida já tem áudios demais.");
  const audio = salvarArquivoDeAudio(empresaId, tipo, bytes, segundos);
  return acrescentar(empresaId, corridaId, { id: crypto.randomUUID(), de, nome: nome.slice(0, 80), audio, em: agora() });
}

// ------------------------------------------------------------------ mensagens não lidas (só na memória: zera quando o servidor reinicia)

const leituras = new Map<string, number>();
/** Chamado quando a pessoa abre ou busca o chat: tudo até agora conta como lido. */
export const marcarLida = (empresaId: string, corridaId: string, papel: PapelApp) => { leituras.set(`${empresaId}|${corridaId}|${papel}`, Date.now()); };
export function naoLidas(empresaId: string, corridaId: string, papel: PapelApp): number {
  if (!idCorridaValido(corridaId)) return 0;
  const desde = leituras.get(`${empresaId}|${corridaId}|${papel}`) ?? 0;
  return mensagens(empresaId, corridaId).filter((m) => m.de !== papel && Date.parse(m.em) > desde).length;
}

/** Arquivo do áudio, só se ele for desta corrida. */
export function arquivoDoAudio(empresaId: string, corridaId: string, audioId: string): { caminho: string; mime: string } | null {
  if (!idCorridaValido(audioId)) return null;
  const m = mensagens(empresaId, corridaId).find((x) => x.audio?.id === audioId);
  if (!m?.audio) return null;
  const ext = Object.entries(MIME_DA_EXT).find(([, v]) => v === m.audio!.mime)?.[0];
  const caminho = arquivo(empresaId, "chat", "audio", `${audioId}.${ext}`);
  return fs.existsSync(caminho) ? { caminho, mime: m.audio.mime } : null;
}
