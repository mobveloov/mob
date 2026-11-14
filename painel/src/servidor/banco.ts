// Banco de dados do painel: SQLite que já vem dentro do Node (node:sqlite). Roda junto com o painel,
// sem servidor separado e sem chave nenhuma. Um arquivo só para todas as empresas; toda tabela tem a coluna
// "empresa" e toda consulta filtra por ela.
//
// Onde fica: BANCO_ARQUIVO (no .env). Vazio = DADOS_DIR/painel.db.
// O que guarda hoje: corridas próprias, conversas do bot e fila de envio do CRM (antes eram arquivos JSON reescritos inteiros),
// perfis, carteira e saques dos apps, pedidos de recarga de saldo da central e marcações de estorno/chargeback, chat de suporte com a central e o tempo online dos motoristas.
// Na primeira vez que uma empresa usa o banco, os dados do JSON antigo entram aqui e o arquivo vira
// "<nome>.json.migrado" (fica guardado, nada é apagado).

import fs from "node:fs";
import path from "node:path";
import { raiz } from "./dados.ts";
import { normal } from "./util.ts";

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
  // Funções de busca para as consultas: texto sem acento nem maiúscula e só os dígitos (a busca de corridas roda no banco, sem carregar tudo).
  db.function("norm", { deterministic: true }, (v) => normal(v));
  db.function("dig", { deterministic: true }, (v) => String(v ?? "").replace(/\D/g, ""));
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
    CREATE TABLE IF NOT EXISTS corridas_proprias (
      empresa TEXT NOT NULL, id TEXT NOT NULL, os_num INTEGER NOT NULL, status TEXT NOT NULL, telefone TEXT NOT NULL,
      motorista_id TEXT, solicitada_em TEXT NOT NULL, dados TEXT NOT NULL,
      PRIMARY KEY (empresa, id));
    CREATE INDEX IF NOT EXISTS corridas_proprias_os ON corridas_proprias (empresa, os_num);
    CREATE INDEX IF NOT EXISTS corridas_proprias_status ON corridas_proprias (empresa, status);
    CREATE INDEX IF NOT EXISTS corridas_proprias_data ON corridas_proprias (empresa, solicitada_em);
    CREATE TABLE IF NOT EXISTS app_pessoas (
      empresa TEXT NOT NULL, papel TEXT NOT NULL, chave TEXT NOT NULL, codigo TEXT NOT NULL, indicado_por TEXT NOT NULL DEFAULT '', dados TEXT NOT NULL,
      PRIMARY KEY (empresa, papel, chave));
    CREATE INDEX IF NOT EXISTS app_pessoas_codigo ON app_pessoas (empresa, codigo);
    CREATE INDEX IF NOT EXISTS app_pessoas_indicado ON app_pessoas (empresa, papel, indicado_por);
    CREATE TABLE IF NOT EXISTS carteira (
      empresa TEXT NOT NULL, id TEXT NOT NULL, papel TEXT NOT NULL, chave TEXT NOT NULL, valor REAL NOT NULL, descricao TEXT NOT NULL,
      corrida_id TEXT, em TEXT NOT NULL, por TEXT NOT NULL, PRIMARY KEY (empresa, id));
    CREATE INDEX IF NOT EXISTS carteira_pessoa ON carteira (empresa, papel, chave, em);
    CREATE TABLE IF NOT EXISTS saques (
      empresa TEXT NOT NULL, id TEXT NOT NULL, motorista TEXT NOT NULL, situacao TEXT NOT NULL, em TEXT NOT NULL, dados TEXT NOT NULL,
      PRIMARY KEY (empresa, id));
    CREATE INDEX IF NOT EXISTS saques_motorista ON saques (empresa, motorista, situacao);
    CREATE TABLE IF NOT EXISTS central_recargas (
      empresa TEXT NOT NULL, id TEXT NOT NULL, valor REAL NOT NULL, situacao TEXT NOT NULL, observacao TEXT NOT NULL DEFAULT '',
      em TEXT NOT NULL, por TEXT NOT NULL, resolvido_em TEXT, resolvido_por TEXT NOT NULL DEFAULT '', PRIMARY KEY (empresa, id));
    CREATE INDEX IF NOT EXISTS central_recargas_empresa ON central_recargas (empresa, em);
    CREATE TABLE IF NOT EXISTS transacoes_marcas (
      empresa TEXT NOT NULL, id TEXT NOT NULL, status TEXT NOT NULL, motivo TEXT NOT NULL DEFAULT '', em TEXT NOT NULL, por TEXT NOT NULL,
      PRIMARY KEY (empresa, id));
    CREATE TABLE IF NOT EXISTS app_suporte (
      empresa TEXT NOT NULL, id TEXT NOT NULL, papel TEXT NOT NULL, chave TEXT NOT NULL, de TEXT NOT NULL,
      texto TEXT, audio TEXT, em TEXT NOT NULL, lida INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (empresa, id));
    CREATE INDEX IF NOT EXISTS app_suporte_conversa ON app_suporte (empresa, papel, chave, em);
    CREATE TABLE IF NOT EXISTS app_online (
      empresa TEXT NOT NULL, motorista TEXT NOT NULL, dia TEXT NOT NULL, segundos INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (empresa, motorista, dia));
    CREATE TABLE IF NOT EXISTS enderecos_correcoes (
      municipio TEXT NOT NULL, numero INTEGER NOT NULL, rua TEXT NOT NULL, rua_norm TEXT NOT NULL, bairro TEXT NOT NULL, bairro_norm TEXT NOT NULL,
      tipo TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL, PRIMARY KEY (municipio, rua_norm, bairro_norm, numero));
    CREATE INDEX IF NOT EXISTS enderecos_correcoes_rua ON enderecos_correcoes (municipio, rua_norm);
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
