// Configurações de cada empresa (Financeiro, Comunicação, Config, Avaliações e Ajuda do painel).
//
// Ficam em DADOS_DIR/empresas/<id>/config/<nome>.json (um arquivo por assunto). As tabelas que crescem
// (conversas da central, respostas de NPS, envios de notificação) ficam no banco do painel, sempre com a empresa.
// É daqui que o servidor dos apps lê o que os apps usam (motivos de cancelamento, contatos, documentos exigidos,
// mensagens rápidas...): um lugar só.

import path from "node:path";
import { idValido, raiz } from "../servidor/dados.ts";
import { gravarJson, lerJson } from "../servidor/jsoncache.ts";
import { arquivoDoBanco, banco } from "../servidor/banco.ts";

export function pastaConfig(empresaId: string, ...partes: string[]) {
  if (!idValido(empresaId)) throw new Error("Empresa inválida.");
  return path.join(raiz(), "empresas", empresaId, "config", ...partes);
}

/** Lê uma configuração (cópia: quem chama pode mudar à vontade). */
export function lerConfig<T>(empresaId: string, nome: string, padrao: T): T {
  if (!/^[a-z-]+$/.test(nome)) throw new Error("Configuração inválida.");
  return structuredClone(lerJson<T>(pastaConfig(empresaId, `${nome}.json`), padrao));
}

export function gravarConfig(empresaId: string, nome: string, valor: unknown) {
  if (!/^[a-z-]+$/.test(nome)) throw new Error("Configuração inválida.");
  gravarJson(pastaConfig(empresaId, `${nome}.json`), valor, { espacos: 1 });
}

// ------------------------------------------------------------------ banco (tabelas desta parte)

const criadas = new Set<string>();
/** Banco do painel com as tabelas desta parte (cria na primeira vez). */
export function bancoConfig() {
  const db = banco();
  const arq = arquivoDoBanco();
  if (!criadas.has(arq)) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS central_chat (
        empresa TEXT NOT NULL, id TEXT NOT NULL, papel TEXT NOT NULL, chave TEXT NOT NULL, de TEXT NOT NULL, texto TEXT NOT NULL,
        em TEXT NOT NULL, lida INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (empresa, id));
      CREATE INDEX IF NOT EXISTS central_chat_pessoa ON central_chat (empresa, papel, chave, em);
      CREATE TABLE IF NOT EXISTS nps_app (
        empresa TEXT NOT NULL, papel TEXT NOT NULL, chave TEXT NOT NULL, nome TEXT NOT NULL, situacao TEXT NOT NULL,
        nota INTEGER, comentario TEXT NOT NULL DEFAULT '', em TEXT NOT NULL, PRIMARY KEY (empresa, papel, chave));
      CREATE TABLE IF NOT EXISTS notificacoes_envios (
        empresa TEXT NOT NULL, id TEXT NOT NULL, papel TEXT NOT NULL, titulo TEXT NOT NULL, mensagem TEXT NOT NULL,
        segmento TEXT NOT NULL, destinatarios INTEGER NOT NULL, por TEXT NOT NULL, em TEXT NOT NULL, PRIMARY KEY (empresa, id));
      CREATE INDEX IF NOT EXISTS notificacoes_envios_em ON notificacoes_envios (empresa, papel, em);
    `);
    criadas.add(arq);
  }
  return db;
}

// ------------------------------------------------------------------ leitura de valores do formulário

export const texto = (v: unknown, max = 200) => (typeof v === "string" ? v.replace(/[<>]/g, "").trim().slice(0, max) : typeof v === "number" ? String(v) : "");
export const sim = (v: unknown, padrao = false) => (v === undefined || v === null ? padrao : v === true || v === "true" || v === "1" || v === 1 || v === "sim");
/** "1.234,56", "12.5", 12 -> número (ou o padrão). */
export function numero(v: unknown, padrao = 0, min = -1e9, max = 1e9): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.min(max, Math.max(min, v));
  let s = String(v ?? "").replace(/[R$\s%]/g, "").trim();
  if (!s) return padrao;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao;
}
export const centavos = (n: number) => Math.round(n * 100) / 100;
export const umDe = <T extends string>(v: unknown, opcoes: readonly T[], padrao: T): T => (opcoes.includes(v as T) ? (v as T) : padrao);
export const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export const novoId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
