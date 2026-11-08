// Banco de dados do painel: SQLite que já vem dentro do Node (node:sqlite). Roda junto com o painel,
// sem servidor separado e sem chave nenhuma. Um arquivo só para todas as empresas; toda tabela tem a coluna
// "empresa" e toda consulta filtra por ela.
//
// Onde fica: BANCO_ARQUIVO (no .env). Vazio = DADOS_DIR/painel.db.
// O que guarda hoje: conversas do bot e fila de envio do CRM (antes eram arquivos JSON reescritos inteiros).
// Na primeira vez que uma empresa usa o banco, os dados do JSON antigo entram aqui e o arquivo vira
// "<nome>.json.migrado" (fica guardado, nada é apagado).

import fs from "node:fs";
import path from "node:path";
import { raiz } from "./dados.ts";

// O SQLite do Node ainda avisa "experimental" ao abrir: tira só esse aviso do log.
const avisoOriginal = process.emitWarning;
process.emitWarning = ((aviso: string | Error, ...resto: unknown[]) => {
  const texto = typeof aviso === "string" ? aviso : aviso?.message;
  if (/SQLite is an experimental feature/i.test(texto ?? "")) return;
  return (avisoOriginal as (...a: unknown[]) => void).call(process, aviso, ...resto);
}) as typeof process.emitWarning;
const { DatabaseSync } = await import("node:sqlite");
type Banco = InstanceType<typeof DatabaseSync>;

let aberto: { arquivo: string; db: Banco } | null = null;

export const arquivoDoBanco = () => path.resolve(process.env.BANCO_ARQUIVO?.trim() || path.join(raiz(), "painel.db"));

/** Banco aberto (abre e cria as tabelas na primeira vez). Troca sozinho se o caminho mudar (testes). */
export function banco(): Banco {
  const arquivo = arquivoDoBanco();
  if (aberto?.arquivo === arquivo) return aberto.db;
  aberto?.db.close();
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  const db = new DatabaseSync(arquivo);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS migracoes (empresa TEXT NOT NULL, nome TEXT NOT NULL, em TEXT NOT NULL, itens INTEGER NOT NULL, PRIMARY KEY (empresa, nome));
    CREATE TABLE IF NOT EXISTS bot_conversas (
      empresa TEXT NOT NULL, id TEXT NOT NULL, atualizada TEXT NOT NULL, aberta INTEGER NOT NULL DEFAULT 0, dados TEXT NOT NULL,
      PRIMARY KEY (empresa, id));
    CREATE INDEX IF NOT EXISTS bot_conversas_recentes ON bot_conversas (empresa, atualizada DESC);
    CREATE INDEX IF NOT EXISTS bot_conversas_abertas ON bot_conversas (empresa, aberta);
    CREATE TABLE IF NOT EXISTS crm_fila (
      empresa TEXT NOT NULL, id TEXT NOT NULL, origem TEXT NOT NULL, estado TEXT NOT NULL,
      proxima_em INTEGER NOT NULL, criado_em INTEGER NOT NULL, enviado_em INTEGER, dados TEXT NOT NULL,
      PRIMARY KEY (empresa, id));
    CREATE INDEX IF NOT EXISTS crm_fila_pendentes ON crm_fila (empresa, estado, proxima_em, criado_em);
    CREATE INDEX IF NOT EXISTS crm_fila_origem ON crm_fila (empresa, origem, estado);
  `);
  aberto = { arquivo, db };
  return db;
}

/** Fecha o banco (testes e desligamento). */
export function fecharBanco() {
  aberto?.db.close();
  aberto = null;
}

/** Roda tudo de uma vez: ou grava tudo, ou nada. */
export function transacao<T>(fn: () => T): T {
  const db = banco();
  db.exec("BEGIN IMMEDIATE");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

/**
 * Migra um JSON antigo da empresa uma única vez. `importar` grava os dados no banco e devolve quantos itens entraram.
 * Depois o arquivo vira "<nome>.migrado" (guardado, não apagado). Se der erro, nada muda e tenta de novo depois.
 */
const migradas = new Set<string>();
export function migrarUmaVez(empresa: string, nome: string, arquivoJson: string, importar: (conteudo: unknown) => number) {
  const db = banco();
  const chave = `${arquivoDoBanco()}|${empresa}|${nome}`;
  if (migradas.has(chave)) return;
  if (db.prepare("SELECT 1 FROM migracoes WHERE empresa = ? AND nome = ?").get(empresa, nome)) { migradas.add(chave); return; }
  let conteudo: unknown = null;
  if (fs.existsSync(arquivoJson)) {
    try { conteudo = JSON.parse(fs.readFileSync(arquivoJson, "utf8")); }
    catch (e) { console.error(`[banco] não li ${arquivoJson}: ${e instanceof Error ? e.message : e}`); return; } // tenta de novo depois
  }
  transacao(() => {
    const n = conteudo == null ? 0 : importar(conteudo);
    db.prepare("INSERT INTO migracoes (empresa, nome, em, itens) VALUES (?, ?, ?, ?)").run(empresa, nome, new Date().toISOString(), n);
  });
  migradas.add(chave);
  if (conteudo != null) {
    let destino = `${arquivoJson}.migrado`;
    for (let i = 2; fs.existsSync(destino); i++) destino = `${arquivoJson}.migrado-${i}`;
    fs.renameSync(arquivoJson, destino);
  }
}
