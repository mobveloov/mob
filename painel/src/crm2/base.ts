// Base das abas de análise do CRM (Contatos, RFM, Conversão, Mapa de Calor, Recompensas, Cidades, Governança e Auditoria).
// Tabelas no banco do painel, sempre com a coluna "empresa". Criadas aqui, na primeira vez que alguém as usa.
// Datas guardadas como milissegundos reais (UTC). Só a tela converte para o horário de Brasília.

import { arquivoDoBanco, banco } from "../servidor/banco.ts";

const prontas = new Set<string>();

/** Abre o banco e garante as tabelas do CRM-2 (uma vez por arquivo de banco). */
export function bd() {
  const db = banco();
  const arq = arquivoDoBanco();
  if (!prontas.has(arq)) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS crm_contatos (
        empresa TEXT NOT NULL, chave TEXT NOT NULL, telefone TEXT NOT NULL, nome TEXT NOT NULL DEFAULT '', cidade TEXT NOT NULL DEFAULT '',
        origem TEXT NOT NULL DEFAULT 'corridas', stage TEXT NOT NULL DEFAULT 'novo', opt_in_status TEXT NOT NULL DEFAULT 'pending',
        opt_in_em INTEGER, opt_out_em INTEGER, tags TEXT NOT NULL DEFAULT '[]', aniversario TEXT NOT NULL DEFAULT '',
        primeira_corrida INTEGER, ultima_corrida INTEGER, total_corridas INTEGER NOT NULL DEFAULT 0, total_gasto REAL NOT NULL DEFAULT 0,
        ticket_medio REAL NOT NULL DEFAULT 0, cancelamentos INTEGER NOT NULL DEFAULT 0, simulacoes_sem_conversao INTEGER NOT NULL DEFAULT 0,
        nota_media REAL NOT NULL DEFAULT 0, categoria_favorita TEXT NOT NULL DEFAULT '', faixa_horaria TEXT NOT NULL DEFAULT '', nps INTEGER,
        rfm_r INTEGER, rfm_f INTEGER, rfm_m INTEGER, rfm_segmento TEXT, rfm_pontos INTEGER NOT NULL DEFAULT 0,
        criado_em INTEGER NOT NULL, atualizado_em INTEGER NOT NULL, PRIMARY KEY (empresa, chave));
      CREATE INDEX IF NOT EXISTS crm_contatos_stage ON crm_contatos (empresa, stage);
      CREATE INDEX IF NOT EXISTS crm_contatos_rfm ON crm_contatos (empresa, rfm_segmento);
      CREATE TABLE IF NOT EXISTS crm_eventos (
        empresa TEXT NOT NULL, id TEXT NOT NULL, chave TEXT NOT NULL, tipo TEXT NOT NULL, quando INTEGER NOT NULL, dados TEXT NOT NULL DEFAULT '{}',
        PRIMARY KEY (empresa, id));
      CREATE INDEX IF NOT EXISTS crm_eventos_contato ON crm_eventos (empresa, chave, quando);
      CREATE INDEX IF NOT EXISTS crm_eventos_tipo ON crm_eventos (empresa, tipo, quando);
      CREATE TABLE IF NOT EXISTS crm_cidades (
        empresa TEXT NOT NULL, id TEXT NOT NULL, nome TEXT NOT NULL, estado TEXT NOT NULL DEFAULT '', lat REAL, lng REAL,
        raio_km REAL NOT NULL DEFAULT 15, ativa INTEGER NOT NULL DEFAULT 1, criada_em INTEGER NOT NULL, PRIMARY KEY (empresa, id));
      CREATE TABLE IF NOT EXISTS crm_auditoria (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, empresa TEXT NOT NULL, id TEXT NOT NULL, entidade TEXT NOT NULL, entidade_id TEXT NOT NULL,
        entidade_nome TEXT NOT NULL DEFAULT '', acao TEXT NOT NULL, ator TEXT NOT NULL DEFAULT '', campos TEXT NOT NULL DEFAULT '[]',
        antigo TEXT, novo TEXT, em INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS crm_auditoria_empresa ON crm_auditoria (empresa, em);
      CREATE TABLE IF NOT EXISTS crm_mapa (
        empresa TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL, embarques INTEGER NOT NULL DEFAULT 0, desembarques INTEGER NOT NULL DEFAULT 0,
        ultima INTEGER, atualizado_em INTEGER NOT NULL, PRIMARY KEY (empresa, lat, lng));
      CREATE TABLE IF NOT EXISTS crm_config2 (empresa TEXT NOT NULL, chave TEXT NOT NULL, valor TEXT NOT NULL, PRIMARY KEY (empresa, chave));
      CREATE TABLE IF NOT EXISTS crm_fid_cartoes (empresa TEXT NOT NULL, id TEXT NOT NULL, config TEXT NOT NULL, ativado_em INTEGER, criado_em INTEGER NOT NULL, PRIMARY KEY (empresa, id));
      CREATE TABLE IF NOT EXISTS crm_fid_progresso (
        empresa TEXT NOT NULL, cartao_id TEXT NOT NULL, telefone TEXT NOT NULL, corridas INTEGER NOT NULL DEFAULT 0, premiados INTEGER NOT NULL DEFAULT 0,
        ultimo_cupom TEXT, ultimo_erro TEXT, atualizado_em INTEGER NOT NULL, PRIMARY KEY (empresa, cartao_id, telefone));
      CREATE TABLE IF NOT EXISTS crm_pontos_programa (empresa TEXT NOT NULL PRIMARY KEY, config TEXT NOT NULL, ultimo_slot TEXT, atualizado_em INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS crm_pontos_lancamentos (
        empresa TEXT NOT NULL, id TEXT NOT NULL, telefone TEXT NOT NULL, tipo TEXT NOT NULL, pontos INTEGER NOT NULL, restante INTEGER NOT NULL DEFAULT 0,
        corrida_ref TEXT, vence_em INTEGER, premio TEXT, cupom TEXT, retirada TEXT, retirada_feita_em INTEGER, criado_em INTEGER NOT NULL, PRIMARY KEY (empresa, id));
      CREATE INDEX IF NOT EXISTS crm_pontos_tel ON crm_pontos_lancamentos (empresa, telefone, tipo);
      CREATE TABLE IF NOT EXISTS crm_pontos_links (empresa TEXT NOT NULL, telefone TEXT NOT NULL, token TEXT NOT NULL UNIQUE, PRIMARY KEY (empresa, telefone));
      CREATE TABLE IF NOT EXISTS crm_corridas_vistas (empresa TEXT NOT NULL, evento_id TEXT NOT NULL, em INTEGER NOT NULL, PRIMARY KEY (empresa, evento_id));
      CREATE TABLE IF NOT EXISTS crm_recompensas_ganhas (
        empresa TEXT NOT NULL, id TEXT NOT NULL, origem TEXT NOT NULL, telefone TEXT NOT NULL, nome TEXT NOT NULL DEFAULT '', premio TEXT NOT NULL DEFAULT '',
        cupom TEXT, em INTEGER NOT NULL, PRIMARY KEY (empresa, id));
      CREATE INDEX IF NOT EXISTS crm_recompensas_em ON crm_recompensas_ganhas (empresa, em);
    `);
    prontas.add(arq);
  }
  return db;
}

/** Configurações do CRM-2 por empresa (janela de envio, opt-in, janela de atribuição). */
export interface Config2 { janelaInicio: string; janelaFim: string; exigirOptIn: boolean; atribuicaoHoras: number }
export const CONFIG2_PADRAO: Config2 = { janelaInicio: "08:00", janelaFim: "21:00", exigirOptIn: false, atribuicaoHoras: 24 };

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function sanearConfig2(c: Partial<Config2>): Config2 {
  const h = Math.floor(Number(c.atribuicaoHoras));
  return {
    janelaInicio: HHMM.test(String(c.janelaInicio ?? "")) ? String(c.janelaInicio) : CONFIG2_PADRAO.janelaInicio,
    janelaFim: HHMM.test(String(c.janelaFim ?? "")) ? String(c.janelaFim) : CONFIG2_PADRAO.janelaFim,
    exigirOptIn: c.exigirOptIn === true,
    atribuicaoHoras: Number.isFinite(h) ? Math.min(168, Math.max(1, h)) : CONFIG2_PADRAO.atribuicaoHoras,
  };
}

export function config2(empresa: string): Config2 {
  return config2Salva(empresa) ?? { ...CONFIG2_PADRAO };
}

/** A configuração que a empresa gravou na Governança; null se ela nunca salvou (aí o envio não é restringido). */
export function config2Salva(empresa: string): Config2 | null {
  const r = bd().prepare("SELECT valor FROM crm_config2 WHERE empresa = ? AND chave = 'geral'").get(empresa) as { valor: string } | undefined;
  if (!r) return null;
  let c: Partial<Config2> = {};
  try { c = JSON.parse(r.valor); } catch { /* configuração ruim: volta ao padrão */ }
  return sanearConfig2(c);
}

export function salvarConfig2(empresa: string, c: Partial<Config2>): Config2 {
  if (c.janelaInicio !== undefined && !HHMM.test(String(c.janelaInicio))) throw new Error("Informe o horário de início e de fim da janela de envio.");
  if (c.janelaFim !== undefined && !HHMM.test(String(c.janelaFim))) throw new Error("Informe o horário de início e de fim da janela de envio.");
  const novo = sanearConfig2({ ...config2(empresa), ...c });
  bd().prepare("INSERT INTO crm_config2 (empresa, chave, valor) VALUES (?, 'geral', ?) ON CONFLICT (empresa, chave) DO UPDATE SET valor = excluded.valor").run(empresa, JSON.stringify(novo));
  return novo;
}

/** O horário (Brasília nos campos UTC) está dentro da janela de envio? Janela que passa da meia-noite também vale. */
export function dentroDaJanela(c: Pick<Config2, "janelaInicio" | "janelaFim">, brasilia: Date): boolean {
  const min = brasilia.getUTCHours() * 60 + brasilia.getUTCMinutes();
  const t = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const a = t(c.janelaInicio), b = t(c.janelaFim);
  if (a === b) return true;
  return a < b ? min >= a && min < b : min >= a || min < b;
}

export const DIA = 86_400_000;
export const HORA = 3_600_000;
/** Data da corrida (Brasília nos campos UTC) -> milissegundos reais. */
export const realDe = (isoBrasilia: string | null | undefined): number | null => {
  const t = isoBrasilia ? Date.parse(isoBrasilia) : NaN;
  return Number.isFinite(t) ? t + 3 * HORA : null;
};
