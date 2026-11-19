// Chat da corrida entre passageiro e motorista: texto, áudio, foto e vídeo.
// Mensagens no banco (tabela chat_mensagens, uma linha por mensagem; os chat/<corrida>.json antigos entram na primeira vez e
// viram .json.migrado); áudios em DADOS_DIR/empresas/<id>/apps/chat/audio/<id>.<ext>.
// Áudio: só os tipos da lista (conferidos pelo cabeçalho do arquivo, não só pelo Content-Type) e até APPS_AUDIO_MAX_KB
// (padrão 1024 KB, mais ou menos 1 minuto). No máximo 60 áudios e 500 mensagens por corrida.
// Foto e vídeo: arquivos em DADOS_DIR/empresas/<id>/apps/chat/midia/<id>.<ext>. Foto JPG, PNG ou WEBP até APPS_FOTO_MAX_KB
// (padrão 5120 KB); vídeo MP4, 3GP, MOV ou WEBM até APPS_VIDEO_MAX_MB (padrão 16 MB, o limite do WhatsApp). O tipo é conferido
// pelo começo do arquivo. No máximo 40 fotos/vídeos por corrida.

import crypto from "node:crypto";
import fs from "node:fs";
import type { StatementSync } from "node:sqlite";
import { banco, migrarPastaUmaVez } from "../servidor/banco.ts";
import { arquivo, idCorridaValido } from "./armazem.ts";
import type { PapelApp } from "./sessoes.ts";

export interface Mensagem {
  id: string;
  de: PapelApp;
  nome: string;
  texto?: string;
  audio?: { id: string; mime: string; bytes: number; segundos: number | null };
  midia?: MidiaChat;
  em: string;
}

/** Foto ou vídeo do chat da corrida. */
export interface MidiaChat { id: string; tipo: "imagem" | "video"; mime: string; bytes: number; legenda?: string }

const MAX_MENSAGENS = 500;
const MAX_AUDIOS = 60;
export const maxAudioBytes = () => Math.max(16, Math.min(Number(process.env.APPS_AUDIO_MAX_KB) || 1024, 5120)) * 1024;

/** Tipos aceitos → extensão do arquivo. */
export const TIPOS_AUDIO: Record<string, string> = {
  "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/aac": "aac", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav",
};
const MAX_MIDIAS = 40;
export const maxImagemBytes = () => Math.max(64, Math.min(Number(process.env.APPS_FOTO_MAX_KB) || 5120, 10240)) * 1024;
export const maxVideoBytes = () => Math.max(1, Math.min(Number(process.env.APPS_VIDEO_MAX_MB) || 16, 32)) * 1024 * 1024;
/** Maior arquivo de mídia aceito (o que a rota deixa passar). */
export const maxMidiaBytes = () => Math.max(maxImagemBytes(), maxVideoBytes());

export const TIPOS_IMAGEM: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const TIPOS_VIDEO: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm", "video/3gpp": "3gp", "video/quicktime": "mov" };
const MIME_DA_EXT_MIDIA: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", mp4: "video/mp4", webm: "video/webm", "3gp": "video/3gpp", mov: "video/quicktime" };

/** O começo do arquivo de foto/vídeo bate com o tipo? */
function cabecalhoDeMidiaConfere(ext: string, b: Uint8Array): boolean {
  const s = (i: number, t: string) => Buffer.from(b.subarray(i, i + t.length)).toString("latin1") === t;
  switch (ext) {
    case "jpg": return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case "png": return b[0] === 0x89 && s(1, "PNG");
    case "webp": return s(0, "RIFF") && s(8, "WEBP");
    case "mp4": case "3gp": return s(4, "ftyp");
    case "mov": return s(4, "ftyp") || s(4, "moov") || s(4, "mdat") || s(4, "free") || s(4, "wide");
    case "webm": return b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
    default: return false;
  }
}

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

function validar(corridaId: string) {
  if (!idCorridaValido(corridaId)) throw new Error("Corrida inválida.");
}

/** Traz para o banco os chat/<corrida>.json antigos da empresa (uma vez só; os arquivos ficam guardados como .migrado). */
function preparar(empresaId: string) {
  migrarPastaUmaVez(empresaId, "chat_mensagens", arquivo(empresaId, "chat"), (nome, conteudo) => {
    const corridaId = nome.replace(/\.json$/, "");
    if (!idCorridaValido(corridaId) || !Array.isArray(conteudo)) return -1;
    const ins = banco().prepare("INSERT INTO chat_mensagens (empresa, corrida_id, id, de, tem_audio, audio_id, em, dados) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    let n = 0;
    for (const m of conteudo as Mensagem[]) { if (m && typeof m.id === "string") { gravarLinha(ins, empresaId, corridaId, m); n++; } }
    return n;
  });
}

function gravarLinha(ins: StatementSync, empresaId: string, corridaId: string, m: Mensagem) {
  ins.run(empresaId, corridaId, m.id, m.de, m.audio ? 1 : 0, m.audio?.id ?? m.midia?.id ?? null, m.em, JSON.stringify(m));
}

export const mensagens = (empresaId: string, corridaId: string): Mensagem[] => {
  validar(corridaId);
  preparar(empresaId);
  return (banco().prepare("SELECT dados FROM chat_mensagens WHERE empresa = ? AND corrida_id = ? ORDER BY seq").all(empresaId, corridaId) as Array<{ dados: string }>)
    .map((r) => JSON.parse(r.dados) as Mensagem);
};

const agora = () => new Date().toISOString();

const contar = (empresaId: string, corridaId: string, soAudios: boolean) =>
  (banco().prepare(`SELECT COUNT(*) AS n FROM chat_mensagens WHERE empresa = ? AND corrida_id = ?${soAudios ? " AND tem_audio = 1" : ""}`).get(empresaId, corridaId) as { n: number }).n;

function acrescentar(empresaId: string, corridaId: string, m: Mensagem) {
  validar(corridaId);
  preparar(empresaId);
  if (contar(empresaId, corridaId, false) >= MAX_MENSAGENS) throw new Error("O chat desta corrida chegou ao limite de mensagens.");
  gravarLinha(banco().prepare("INSERT INTO chat_mensagens (empresa, corrida_id, id, de, tem_audio, audio_id, em, dados) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"), empresaId, corridaId, m);
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
  validar(corridaId);
  preparar(empresaId);
  if (contar(empresaId, corridaId, true) >= MAX_AUDIOS) throw new Error("Esta corrida já tem áudios demais.");
  const audio = salvarArquivoDeAudio(empresaId, tipo, bytes, segundos);
  return acrescentar(empresaId, corridaId, { id: crypto.randomUUID(), de, nome: nome.slice(0, 80), audio, em: agora() });
}

/** Texto curto da mensagem para a notificação e para o resumo ("Mensagem de áudio", "Foto"...). */
export const resumoDaMensagem = (m: Mensagem) => m.texto ?? (m.audio ? "Mensagem de áudio" : m.midia?.tipo === "video" ? "Vídeo" : m.midia ? "Foto" : "");

/**
 * Confere (tipo, tamanho e começo do arquivo) e guarda uma foto ou um vídeo no chat da corrida.
 * `tipo` é o Content-Type (image/jpeg, video/mp4...); `legenda` é opcional (até 200 caracteres).
 */
export function enviarMidia(empresaId: string, corridaId: string, de: PapelApp, nome: string, tipo: string, bytes: Uint8Array, legenda?: string): Mensagem {
  validar(corridaId);
  preparar(empresaId);
  const mime = String(tipo ?? "").split(";")[0].trim().toLowerCase();
  const ehImagem = mime in TIPOS_IMAGEM, ehVideo = mime in TIPOS_VIDEO;
  if (!ehImagem && !ehVideo) throw new Error("Tipo de arquivo não aceito. Envie foto (JPG, PNG ou WEBP) ou vídeo (MP4, 3GP, MOV ou WEBM).");
  if (!bytes?.length) throw new Error("Arquivo vazio.");
  const max = ehImagem ? maxImagemBytes() : maxVideoBytes();
  if (bytes.length > max) throw new Error(`${ehImagem ? "Foto" : "Vídeo"} grande demais (máximo ${max >= 1024 * 1024 ? `${Math.round((max / 1024 / 1024) * 10) / 10} MB` : `${Math.round(max / 1024)} KB`}).`);
  const ext = ehImagem ? TIPOS_IMAGEM[mime] : TIPOS_VIDEO[mime];
  if (!cabecalhoDeMidiaConfere(ext, bytes)) throw new Error(ehImagem ? "O arquivo não é uma foto válida." : "O arquivo não é um vídeo válido.");
  const total = (banco().prepare("SELECT COUNT(*) AS n FROM chat_mensagens WHERE empresa = ? AND corrida_id = ? AND tem_audio = 0 AND audio_id IS NOT NULL").get(empresaId, corridaId) as { n: number }).n;
  if (total >= MAX_MIDIAS) throw new Error("Esta corrida já tem fotos e vídeos demais.");
  const id = crypto.randomUUID();
  fs.mkdirSync(arquivo(empresaId, "chat", "midia"), { recursive: true });
  fs.writeFileSync(arquivo(empresaId, "chat", "midia", `${id}.${ext}`), bytes, { mode: 0o600 });
  const leg = String(legenda ?? "").replace(/[<>]/g, "").trim().slice(0, 200);
  const midia: MidiaChat = { id, tipo: ehImagem ? "imagem" : "video", mime: MIME_DA_EXT_MIDIA[ext], bytes: bytes.length, ...(leg ? { legenda: leg } : {}) };
  return acrescentar(empresaId, corridaId, { id: crypto.randomUUID(), de, nome: nome.slice(0, 80), midia, em: agora() });
}

/** Arquivo da foto ou do vídeo, só se for desta corrida. */
export function arquivoDaMidia(empresaId: string, corridaId: string, midiaId: string): { caminho: string; mime: string } | null {
  if (!idCorridaValido(midiaId)) return null;
  validar(corridaId);
  preparar(empresaId);
  const linha = banco().prepare("SELECT dados FROM chat_mensagens WHERE empresa = ? AND corrida_id = ? AND audio_id = ?").get(empresaId, corridaId, midiaId) as { dados: string } | undefined;
  const m = linha ? (JSON.parse(linha.dados) as Mensagem) : undefined;
  if (!m?.midia) return null;
  const ext = Object.entries(MIME_DA_EXT_MIDIA).find(([, v]) => v === m.midia!.mime)?.[0];
  if (!ext) return null;
  const caminho = arquivo(empresaId, "chat", "midia", `${midiaId}.${ext}`);
  return fs.existsSync(caminho) ? { caminho, mime: m.midia.mime } : null;
}

// ------------------------------------------------------------------ mensagens não lidas (só na memória: zera quando o servidor reinicia)

const leituras = new Map<string, number>();
/** Chamado quando a pessoa abre ou busca o chat: tudo até agora conta como lido. */
export const marcarLida = (empresaId: string, corridaId: string, papel: PapelApp) => { leituras.set(`${empresaId}|${corridaId}|${papel}`, Date.now()); };
export function naoLidas(empresaId: string, corridaId: string, papel: PapelApp): number {
  if (!idCorridaValido(corridaId)) return 0;
  const desde = leituras.get(`${empresaId}|${corridaId}|${papel}`) ?? 0;
  preparar(empresaId);
  // "em" é uma data ISO (UTC): comparar como texto é o mesmo que comparar as datas.
  return (banco().prepare("SELECT COUNT(*) AS n FROM chat_mensagens WHERE empresa = ? AND corrida_id = ? AND de <> ? AND em > ?")
    .get(empresaId, corridaId, papel, new Date(desde).toISOString()) as { n: number }).n;
}

/** Arquivo do áudio, só se ele for desta corrida. */
export function arquivoDoAudio(empresaId: string, corridaId: string, audioId: string): { caminho: string; mime: string } | null {
  if (!idCorridaValido(audioId)) return null;
  validar(corridaId);
  preparar(empresaId);
  const linha = banco().prepare("SELECT dados FROM chat_mensagens WHERE empresa = ? AND corrida_id = ? AND audio_id = ?").get(empresaId, corridaId, audioId) as { dados: string } | undefined;
  const m = linha ? (JSON.parse(linha.dados) as Mensagem) : undefined;
  if (!m?.audio) return null;
  const ext = Object.entries(MIME_DA_EXT).find(([, v]) => v === m.audio!.mime)?.[0];
  const caminho = arquivo(empresaId, "chat", "audio", `${audioId}.${ext}`);
  return fs.existsSync(caminho) ? { caminho, mime: m.audio.mime } : null;
}
