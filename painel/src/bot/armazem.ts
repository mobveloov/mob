// Onde o bot guarda os dados de cada empresa: dados/empresas/<id>/bot/ (fora do Git).
//   config.json      provedor e instância (sem segredos)
//   conversas.json   conversas e mensagens
// URL e token do provedor e o segredo do webhook ficam nos segredos da empresa (segredos.json),
// na chave "bot-whatsapp". Nunca vão para o navegador.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as D from "../servidor/dados.ts";
import type { ConfigBot, Conversa } from "./tipos.ts";

export const CHAVE_SEGREDOS = "bot-whatsapp";
const MAX_MENSAGENS = 300;
const MAX_HISTORICO = 20;

function pasta(empresaId: string) {
  if (!D.idValido(empresaId)) throw new Error("Empresa inválida.");
  return path.join(D.raiz(), "empresas", empresaId, "bot");
}
function ler<T>(arq: string, padrao: T): T {
  try { return JSON.parse(fs.readFileSync(arq, "utf8")) as T; } catch { return padrao; }
}
function gravar(arq: string, valor: unknown) {
  fs.mkdirSync(path.dirname(arq), { recursive: true });
  const tmp = `${arq}.${process.pid}.${crypto.randomBytes(3).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(valor, null, 2));
  fs.renameSync(tmp, arq);
}

// ------------------------------------------------------------------ configuração

export const instanciaPadrao = (empresaId: string) => `bot-${empresaId}`;

export function configPadrao(empresaId: string): ConfigBot {
  return { ativo: false, provedor: "simulado", instancia: instanciaPadrao(empresaId) };
}

export function config(empresaId: string): ConfigBot {
  const c = ler<Partial<ConfigBot>>(path.join(pasta(empresaId), "config.json"), {});
  const p = configPadrao(empresaId);
  return {
    ativo: c.ativo ?? p.ativo,
    provedor: c.provedor === "evolution" ? "evolution" : "simulado",
    instancia: typeof c.instancia === "string" && c.instancia ? c.instancia : p.instancia,
  };
}

export const salvarConfig = (empresaId: string, c: ConfigBot) => gravar(path.join(pasta(empresaId), "config.json"), c);

/** Segredos do bot da empresa: urlApi e token (só se a empresa usa servidor próprio) e segredoWebhook. */
export function segredosBot(empresaId: string): Record<string, string> {
  return D.segredos(empresaId).integracoes[CHAVE_SEGREDOS] ?? {};
}

export function salvarSegredosBot(empresaId: string, novos: Record<string, string | undefined>) {
  const s = D.segredos(empresaId);
  const atual = { ...(s.integracoes[CHAVE_SEGREDOS] ?? {}) };
  for (const [k, v] of Object.entries(novos)) if (v !== undefined) { if (v === "") delete atual[k]; else atual[k] = v; }
  D.salvarSegredos(empresaId, { ...s, integracoes: { ...s.integracoes, [CHAVE_SEGREDOS]: atual } });
}

/** Segredo da URL do webhook. Criado na primeira vez. */
export function segredoWebhook(empresaId: string): string {
  const atual = segredosBot(empresaId).segredoWebhook;
  if (atual && atual.length >= 24) return atual;
  const novo = crypto.randomBytes(24).toString("base64url");
  salvarSegredosBot(empresaId, { segredoWebhook: novo });
  return novo;
}

export function segredoConfere(empresaId: string, recebido: string): boolean {
  const atual = segredosBot(empresaId).segredoWebhook ?? "";
  if (!atual || atual.length !== recebido.length) return false;
  return crypto.timingSafeEqual(Buffer.from(atual), Buffer.from(recebido));
}

// ------------------------------------------------------------------ conversas

const arqConversas = (empresaId: string) => path.join(pasta(empresaId), "conversas.json");
export const conversas = (empresaId: string): Record<string, Conversa> => ler(arqConversas(empresaId), {});
export const conversa = (empresaId: string, id: string): Conversa | null => conversas(empresaId)[id] ?? null;

export function novaConversa(id: string, nome: string): Conversa {
  const agora = new Date().toISOString();
  return { id, nome: nome || id, etapa: "inicio", rascunho: {}, historico: [], mensagens: [], vistas: [], naoLidas: 0, criadaEm: agora, atualizadaEm: agora };
}

export function salvarConversa(empresaId: string, c: Conversa) {
  const todas = conversas(empresaId);
  c.mensagens = c.mensagens.slice(-MAX_MENSAGENS);
  c.historico = c.historico.slice(-MAX_HISTORICO);
  c.vistas = c.vistas.slice(-200);
  c.atualizadaEm = new Date().toISOString();
  todas[c.id] = c;
  gravar(arqConversas(empresaId), todas);
}

// ------------------------------------------------------------------ trava por conversa

const filas = new Map<string, Promise<unknown>>();

/**
 * Roda `fn` sozinho para aquela conversa: mensagens do mesmo passageiro saem em ordem, e um toque duplo
 * espera o primeiro terminar (assim nunca nascem duas corridas). Conversas diferentes não esperam umas às outras.
 */
export function naFila<T>(empresaId: string, conversaId: string, fn: () => Promise<T>): Promise<T> {
  const chave = `${empresaId}/${conversaId}`;
  const antes = filas.get(chave) ?? Promise.resolve();
  const agora = antes.catch(() => undefined).then(fn);
  const fim = agora.finally(() => { if (filas.get(chave) === fim) filas.delete(chave); });
  filas.set(chave, fim);
  return agora;
}

/** Espera todas as filas esvaziarem (testes e desligamento). */
export async function aguardarFilas() {
  while (filas.size) await Promise.allSettled([...filas.values()]);
}

/** Empresas com o bot ligado. */
export const empresasComBot = () => D.listarEmpresas().filter((e) => e.ativa && config(e.id).ativo).map((e) => e.id);
