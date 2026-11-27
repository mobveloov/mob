// Voz dos apps gerada no SERVIDOR (voz de verdade, em vez do speechSynthesis robótico do aparelho).
//   GET  /api/apps/<empresa>/voz?texto=...&voz=feminina|masculina&velocidade=1&app=passageiro|motorista
//   POST /api/apps/<empresa>/voz  { texto, voz, velocidade, app }
// Devolve áudio MP3. Rota pública, com limite por IP. Cada frase é gerada uma vez: cache em disco por hash(texto+voz+velocidade+motor),
// em <dados>/empresas/<empresa>/apps/voz/<hash>.mp3 (o nome do arquivo é só o hash: nada vindo do cliente entra em caminho).
// Motores, em ordem: Gemini TTS (chave do Gemini nas Integrações) -> Edge neural (pt-BR, sem chave). Sem nenhum: 503 (o app usa só o toque).
// Só JS puro (msedge-tts usa ws; @breezystack/lamejs codifica o MP3): nenhum binário nativo, roda no Alpine.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express, { type Request, type Response } from "express";
import { chavesDisponiveis, rotas } from "../ia/roteador.ts";
import { geminiAudioFrom, geminiTtsBody } from "../bot/voz-gemini.ts";
import { FRASES_FIXAS, MAX_TEXTO_VOZ, velocidadeValida, vozDoApp, type AppVoz, type GeneroVoz, type MotorVoz } from "../config/voz-app.ts";
import * as D from "../servidor/dados.ts";
import { limitador, pastaApps } from "./armazem.ts";

export interface PedidoVoz { empresaId: string; texto: string; genero: GeneroVoz; velocidade: number }
export interface Motor { id: "gemini" | "edge"; disponivel(empresaId: string): boolean; gerar(p: PedidoVoz): Promise<Buffer> }
export interface ResultadoVoz { bytes: Buffer; motor: "gemini" | "edge" | "cache"; hash: string }

const GEMINI_VOZ: Record<GeneroVoz, string> = { feminina: "Kore", masculina: "Orus" };
const EDGE_VOZ: Record<GeneroVoz, string> = { feminina: "pt-BR-FranciscaNeural", masculina: "pt-BR-AntonioNeural" };
const MAX_MP3 = 2 * 1024 * 1024;
const MAX_ARQUIVOS = () => Number(process.env.APPS_VOZ_MAX_ARQUIVOS) || 3000;

// ------------------------------------------------------------------ texto

/** Limpa o texto: sem marcas, espaços repetidos nem caracteres de controle. null = vazio. Lança 413 se passar do limite. */
export function textoParaFalar(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (t.length > MAX_TEXTO_VOZ) throw Object.assign(new Error(`Frase longa demais (máximo ${MAX_TEXTO_VOZ} caracteres).`), { status: 413 });
  return t;
}

// ------------------------------------------------------------------ WAV -> MP3

/** WAV PCM 16 bits (mono ou estéreo) -> MP3. */
export async function wavParaMp3(wav: Buffer): Promise<Buffer> {
  if (wav.length < 44 || wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") throw new Error("Áudio WAV inválido.");
  let canais = 1, taxa = 24000, bits = 16, ini = -1, tam = 0;
  for (let o = 12; o + 8 <= wav.length;) {
    const id = wav.toString("ascii", o, o + 4), n = wav.readUInt32LE(o + 4);
    if (id === "fmt ") { canais = wav.readUInt16LE(o + 10); taxa = wav.readUInt32LE(o + 12); bits = wav.readUInt16LE(o + 22); }
    if (id === "data") { ini = o + 8; tam = Math.min(n, wav.length - ini); break; }
    o += 8 + n + (n & 1);
  }
  if (ini < 0 || bits !== 16 || (canais !== 1 && canais !== 2)) throw new Error("Formato de áudio não suportado.");
  const amostras = new Int16Array(Math.floor(tam / 2));
  for (let i = 0; i < amostras.length; i++) amostras[i] = wav.readInt16LE(ini + i * 2);
  const { Mp3Encoder } = await import("@breezystack/lamejs");
  const enc = new Mp3Encoder(canais, taxa, 64);
  const partes: Buffer[] = [];
  const bloco = 1152 * canais;
  for (let i = 0; i < amostras.length; i += bloco) {
    const f = amostras.subarray(i, i + bloco);
    let b: ArrayLike<number> & { buffer: ArrayBufferLike; byteOffset: number; length: number };
    if (canais === 1) b = enc.encodeBuffer(f);
    else { const e = new Int16Array(f.length / 2), d = new Int16Array(f.length / 2); for (let k = 0; k < e.length; k++) { e[k] = f[k * 2]; d[k] = f[k * 2 + 1]; } b = enc.encodeBuffer(e, d); }
    if (b.length) partes.push(Buffer.from(b.buffer, b.byteOffset, b.length)); // o lamejs devolve Int8Array
  }
  const fim = enc.flush();
  partes.push(Buffer.from(fim.buffer, fim.byteOffset, fim.length));
  return Buffer.concat(partes);
}

// ------------------------------------------------------------------ motores

type FetchLike = typeof fetch;
let fetchTeste: FetchLike | null = null;
/** Só para testes: troca o fetch do Gemini. */
export const definirFetchVoz = (f: FetchLike | null) => { fetchTeste = f; };

const motorGemini: Motor = {
  id: "gemini",
  disponivel: (empresaId) => chavesDisponiveis(D.segredos(empresaId).ia).gemini.length > 0,
  async gerar(p) {
    const chaves = chavesDisponiveis(D.segredos(p.empresaId).ia).gemini.slice(0, 2);
    const modelo = rotas("voz").find((r) => r.provedor === "gemini")?.modelo ?? "gemini-2.5-flash-preview-tts";
    const ritmo = p.velocidade >= 1.15 ? ", um pouco mais rápido" : p.velocidade <= 0.9 ? ", mais devagar" : "";
    const fala = `Diga em português do Brasil, com voz natural e clara${ritmo}: ${p.texto}`;
    let ultimo = "sem chave";
    for (const chave of chaves) {
      try {
        const r = await (fetchTeste ?? fetch)(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`, {
          method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": chave },
          body: JSON.stringify(geminiTtsBody(fala, GEMINI_VOZ[p.genero])), signal: AbortSignal.timeout(20_000),
        });
        if (!r.ok) { ultimo = `HTTP ${r.status}`; continue; }
        const a = geminiAudioFrom(await r.json());
        if (!a) { ultimo = "sem áudio"; continue; }
        const bytes = Buffer.from(a.audioBase64, "base64");
        if (/mpeg|mp3/.test(a.mimeType)) return bytes;
        if (/wav/.test(a.mimeType)) return await wavParaMp3(bytes);
        ultimo = `formato ${a.mimeType}`;
      } catch (e) { ultimo = e instanceof Error ? e.message : String(e); }
    }
    throw new Error(`Gemini: ${ultimo}`);
  },
};

const motorEdge: Motor = {
  id: "edge",
  disponivel: () => true,
  async gerar(p) {
    const { MsEdgeTTS, OUTPUT_FORMAT } = await import("msedge-tts");
    const tts = new MsEdgeTTS({ connectionTimeoutMs: 8000, synthesisTimeoutMs: 15000 });
    try {
      await tts.setMetadata(EDGE_VOZ[p.genero], OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const { audioStream } = tts.toStream(p.texto, { rate: p.velocidade });
      const partes: Buffer[] = [];
      let total = 0;
      for await (const c of audioStream) { partes.push(c as Buffer); total += (c as Buffer).length; if (total > MAX_MP3) throw new Error("Áudio grande demais."); }
      return Buffer.concat(partes);
    } finally { try { tts.close(); } catch { /* já fechado */ } }
  },
};

let motoresTeste: Motor[] | null = null;
/** Só para testes: troca os motores por falsos (null volta aos reais). */
export const definirMotoresVoz = (m: Motor[] | null) => { motoresTeste = m; };
const todosMotores = (): Motor[] => motoresTeste ?? [motorGemini, motorEdge];

/** Motores a tentar, na ordem, para a escolha da empresa (automático = Gemini com chave, depois Edge). */
export function motoresPara(empresaId: string, escolha: MotorVoz): Motor[] {
  const m = todosMotores();
  const quais = escolha === "auto" ? m : m.filter((x) => x.id === escolha);
  return quais.filter((x) => x.disponivel(empresaId));
}

// ------------------------------------------------------------------ cache em disco

const pastaVoz = (empresaId: string) => path.join(pastaApps(empresaId), "voz");
export const hashVoz = (texto: string, genero: GeneroVoz, velocidade: number, motor: MotorVoz) =>
  crypto.createHash("sha256").update(JSON.stringify([texto, genero, velocidade, motor])).digest("hex").slice(0, 40);
const arquivoDoHash = (empresaId: string, hash: string) => {
  if (!/^[0-9a-f]{40}$/.test(hash)) throw new Error("Hash inválido.");
  return path.join(pastaVoz(empresaId), `${hash}.mp3`);
};

function guardar(empresaId: string, hash: string, bytes: Buffer) {
  const pasta = pastaVoz(empresaId);
  fs.mkdirSync(pasta, { recursive: true, mode: 0o700 });
  try { // cache cheio: apaga os mais antigos
    const nomes = fs.readdirSync(pasta).filter((n) => n.endsWith(".mp3"));
    if (nomes.length >= MAX_ARQUIVOS()) {
      const velhos = nomes.map((n) => ({ n, t: fs.statSync(path.join(pasta, n)).mtimeMs })).sort((a, b) => a.t - b.t).slice(0, Math.ceil(nomes.length / 10));
      for (const v of velhos) fs.rmSync(path.join(pasta, v.n), { force: true });
    }
  } catch { /* pasta recém-criada */ }
  const destino = arquivoDoHash(empresaId, hash), tmp = `${destino}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, bytes, { mode: 0o600 });
  fs.renameSync(tmp, destino);
}

const emAndamento = new Map<string, Promise<ResultadoVoz>>();
export class SemMotorError extends Error { status = 503; }

export interface OpcoesVoz { app?: AppVoz; genero?: GeneroVoz; velocidade?: number }

/** Áudio da frase: do cache ou gerado agora (uma geração por frase, mesmo com vários pedidos juntos). `aoGerar` conta o limite de geração. */
export async function obterVoz(empresaId: string, texto: string, op: OpcoesVoz = {}, aoGerar?: () => boolean): Promise<ResultadoVoz> {
  const cfg = vozDoApp(empresaId, op.app ?? "passageiro");
  const genero = op.genero ?? cfg.genero, velocidade = velocidadeValida(op.velocidade, cfg.velocidade);
  const hash = hashVoz(texto, genero, velocidade, cfg.motor);
  const arq = arquivoDoHash(empresaId, hash);
  try { const bytes = fs.readFileSync(arq); if (bytes.length) { const agora = new Date(); fs.utimesSync(arq, agora, agora); return { bytes, motor: "cache", hash }; } } catch { /* não está no cache */ }
  const chave = `${empresaId}/${hash}`;
  const em = emAndamento.get(chave);
  if (em) return em;
  const p = (async (): Promise<ResultadoVoz> => {
    const motores = motoresPara(empresaId, cfg.motor);
    if (!motores.length) throw new SemMotorError(cfg.motor === "gemini" ? "Sem chave do Gemini nas Integrações." : "Nenhum motor de voz disponível.");
    if (aoGerar && !aoGerar()) throw Object.assign(new Error("Muitas frases novas. Tente de novo em alguns minutos."), { status: 429 });
    const falhas: string[] = [];
    for (const m of motores) {
      try {
        const bytes = await m.gerar({ empresaId, texto, genero, velocidade });
        if (!bytes.length || bytes.length > MAX_MP3) throw new Error("áudio vazio ou grande demais");
        guardar(empresaId, hash, bytes);
        return { bytes, motor: m.id, hash };
      } catch (e) { falhas.push(`${m.id}: ${e instanceof Error ? e.message : e}`); }
    }
    console.error("[voz]", empresaId, falhas.join(" | ").slice(0, 300));
    throw new SemMotorError("Não foi possível gerar a voz agora.");
  })().finally(() => emAndamento.delete(chave));
  emAndamento.set(chave, p);
  return p;
}

// ------------------------------------------------------------------ pré-geração das frases fixas

export interface RelatorioPreGeracao { total: number; geradas: number; jaNoCache: number; falhas: number }
const preGerando = new Set<string>();

/** Gera no cache as frases fixas dos apps (uma vez). Sem rede/chave, para depois de 3 falhas seguidas. Nunca lança. */
export async function preGerarFrases(empresaId: string, app?: AppVoz): Promise<RelatorioPreGeracao> {
  const r: RelatorioPreGeracao = { total: 0, geradas: 0, jaNoCache: 0, falhas: 0 };
  const apps: AppVoz[] = app ? [app] : ["passageiro", "motorista"];
  for (const a of apps) {
    const chave = `${empresaId}/${a}`;
    if (preGerando.has(chave)) continue;
    preGerando.add(chave);
    try {
      const cfg = vozDoApp(empresaId, a);
      if (!cfg.ligada) continue;
      let seguidas = 0;
      for (const frase of FRASES_FIXAS[a]) {
        r.total++;
        if (seguidas >= 3) { r.falhas++; continue; }
        try {
          const v = await obterVoz(empresaId, frase, { app: a });
          if (v.motor === "cache") r.jaNoCache++; else r.geradas++;
          seguidas = 0;
        } catch { r.falhas++; seguidas++; }
      }
    } catch { /* empresa inválida */ } finally { preGerando.delete(chave); }
  }
  return r;
}

// ------------------------------------------------------------------ rota pública

const podePorIp = limitador(() => Number(process.env.APPS_VOZ_POR_IP) || 120, 10 * 60_000);
const podeGerarPorIp = limitador(() => Number(process.env.APPS_VOZ_NOVAS_POR_IP) || 20, 10 * 60_000);
const podeGerarPorEmpresa = limitador(() => Number(process.env.APPS_VOZ_NOVAS_POR_EMPRESA) || 300, 60 * 60_000);

export const rotasPublicasVoz = express.Router({ mergeParams: true });

async function atender(req: Request, res: Response) {
  const empresaId = req.params.empresa;
  const ip = req.ip ?? "";
  try {
    if (!podePorIp(`${empresaId}|${ip}`)) { res.setHeader("Retry-After", "60"); return void res.status(429).json({ erro: "Muitos pedidos. Espere um pouco." }); }
    const dados = (req.method === "POST" ? req.body : req.query) as Record<string, unknown>;
    const texto = textoParaFalar(dados?.texto);
    if (!texto) return void res.status(400).json({ erro: "Informe o texto." });
    const app: AppVoz = dados?.app === "motorista" ? "motorista" : "passageiro";
    const cfg = vozDoApp(empresaId, app);
    if (!cfg.ligada) return void res.status(204).end(); // voz desligada na Personalização: o app usa só o toque
    const genero: GeneroVoz = dados?.voz === "masculina" || dados?.voz === "feminina" ? dados.voz : cfg.genero;
    const velocidade = velocidadeValida(dados?.velocidade, cfg.velocidade);
    const v = await obterVoz(empresaId, texto, { app, genero, velocidade }, () => podeGerarPorIp(`${empresaId}|${ip}`) && podeGerarPorEmpresa(empresaId));
    const etag = `"${v.hash}"`;
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("X-Voz-Motor", v.motor);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", "public, max-age=86400");
    if (req.headers["if-none-match"] === etag) return void res.status(304).end();
    res.setHeader("Content-Length", String(v.bytes.length));
    res.end(v.bytes);
  } catch (e) {
    const status = (e as { status?: number }).status ?? 400;
    if (status === 429) res.setHeader("Retry-After", "120");
    if (!res.headersSent) res.status(status).json({ erro: e instanceof Error ? e.message : "Erro.", ...(status === 503 ? { motivo: "sem_motor" } : {}) });
  }
}
rotasPublicasVoz.get("/voz", atender);
rotasPublicasVoz.post("/voz", atender);
