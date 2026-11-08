// Leitura de arquivo JSON com cache na memória. Antes, cada pedido lia e interpretava o arquivo inteiro de novo
// (sessões, corridas, cadastros): com centenas de motoristas consultando ao mesmo tempo, a CPU travava.
//
// - Lê do disco só quando o arquivo muda (data de alteração ou tamanho diferentes) ou na primeira vez.
// - O valor guardado é CONGELADO (só leitura): quem precisa mudar faz uma cópia e grava com gravarJson.
//   Assim nenhuma parte do código altera a memória sem salvar no disco.
// - gravarJson grava de forma segura (arquivo temporário + troca) e já atualiza o cache.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

interface Guardado { mtimeMs: number; tamanho: number; valor: unknown; conferidoEm: number }
const cache = new Map<string, Guardado>();
const MAX_ARQUIVOS = 5000;
const pastasCriadas = new Set<string>();

function congelar<T>(v: T): T {
  if (v && typeof v === "object" && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const x of Object.values(v as Record<string, unknown>)) congelar(x);
  }
  return v;
}

/** Confere o disco no máximo uma vez por segundo por arquivo (o painel é quem grava; mudança de fora aparece em até 1 s). */
const CONFERIR_MS = 1000;

/** Valor do arquivo (só leitura). Se não existir ou estiver estragado, devolve `padrao`. */
export function lerJson<T>(arq: string, padrao: T): T {
  const agora = Date.now();
  const recente = cache.get(arq);
  if (recente && agora - recente.conferidoEm < CONFERIR_MS) return recente.valor as T;
  let st: fs.Stats;
  try { st = fs.statSync(arq); } catch { cache.delete(arq); return padrao; }
  const c = cache.get(arq);
  if (c && c.mtimeMs === st.mtimeMs && c.tamanho === st.size) { c.conferidoEm = agora; return c.valor as T; }
  let valor: unknown;
  try { valor = JSON.parse(fs.readFileSync(arq, "utf8")); } catch { cache.delete(arq); return padrao; }
  if (cache.size >= MAX_ARQUIVOS) cache.delete(cache.keys().next().value!);
  cache.set(arq, { mtimeMs: st.mtimeMs, tamanho: st.size, valor: congelar(valor), conferidoEm: agora });
  return valor as T;
}

/** Grava o valor (de forma segura) e atualiza o cache. */
export function gravarJson(arq: string, valor: unknown, opcoes: { espacos?: number; modo?: number } = {}) {
  const pasta = path.dirname(arq);
  if (!pastasCriadas.has(pasta)) { fs.mkdirSync(pasta, { recursive: true }); pastasCriadas.add(pasta); }
  const tmp = `${arq}.${process.pid}.${crypto.randomBytes(3).toString("hex")}.tmp`;
  const texto = JSON.stringify(valor, null, opcoes.espacos);
  const escrever = () => fs.writeFileSync(tmp, texto, opcoes.modo != null ? { mode: opcoes.modo } : undefined);
  try { escrever(); } catch (e) {
    // A pasta sumiu depois de criada (apagada por fora): cria de novo e tenta mais uma vez.
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    fs.mkdirSync(pasta, { recursive: true });
    escrever();
  }
  fs.renameSync(tmp, arq);
  try {
    const st = fs.statSync(arq);
    // Guarda uma cópia congelada do que foi gravado (quem gravou pode continuar mexendo no objeto dele).
    cache.set(arq, { mtimeMs: st.mtimeMs, tamanho: st.size, valor: congelar(JSON.parse(texto)), conferidoEm: Date.now() });
  } catch { cache.delete(arq); pastasCriadas.delete(pasta); }
}

/** Esquece o cache de um arquivo (ou de todos). */
export function esquecerJson(arq?: string) {
  if (arq) cache.delete(arq); else { cache.clear(); pastasCriadas.clear(); }
}
