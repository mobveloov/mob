// CRM › Público › Contatos: base de passageiros 360° (portada do crm-sync-contacts e das funções de contato do sistema de referência).
// Fonte: cadastro de passageiros + corridas. Sem Machine: a corrida é nativa, então o "sync" lê as corridas do próprio painel.
// A base é guardada no banco (tabela crm_contatos); tags, aniversário e marcação de opt-out ficam, mesmo se o sync rodar de novo.
// Linha do tempo (crm_eventos): cadastro, solicitou, concluiu, cancelou, avaliou, msg_enviada, opt_out, opt_in.

import { listar as listarCadastro } from "../cadastros/armazem.ts";
import { cadastroPorId } from "../comum/cadastros.ts";
import type { CorridaPainel } from "../comum/corrida.ts";
import * as A from "../crm/armazem.ts";
import { chaveDe, corridasDoPublico, publico, telefoneWhatsApp } from "../crm/publico.ts";
import { waOptOutKey } from "../crm/optout.ts";
import { descadastros } from "../crm/templates.ts";
import type { ItemFila } from "../crm/tipos.ts";
import { normal } from "../servidor/util.ts";
import { bd, DIA, realDe } from "./base.ts";

export type Estagio = "novo" | "ativo" | "fiel" | "em_risco" | "inativo" | "perdido";
export const ESTAGIOS: Estagio[] = ["novo", "ativo", "fiel", "em_risco", "inativo", "perdido"];
export type OptIn = "in" | "out" | "pending";

export interface ContatoCrm {
  chave: string; telefone: string; nome: string; cidade: string; origem: string; stage: Estagio; opt_in_status: OptIn;
  opt_in_em: number | null; opt_out_em: number | null; tags: string[]; aniversario: string; primeira_corrida: number | null; ultima_corrida: number | null;
  total_corridas: number; total_gasto: number; ticket_medio: number; cancelamentos: number; simulacoes_sem_conversao: number;
  nota_media: number; categoria_favorita: string; faixa_horaria: string; nps: number | null;
  rfm_r: number | null; rfm_f: number | null; rfm_m: number | null; rfm_segmento: string | null; rfm_pontos: number; criado_em: number;
}

const COLUNAS = "chave, telefone, nome, cidade, origem, stage, opt_in_status, opt_in_em, opt_out_em, tags, aniversario, primeira_corrida, ultima_corrida, total_corridas, total_gasto, ticket_medio, cancelamentos, simulacoes_sem_conversao, nota_media, categoria_favorita, faixa_horaria, nps, rfm_r, rfm_f, rfm_m, rfm_segmento, rfm_pontos, criado_em";

function linhaParaContato(r: Record<string, unknown>): ContatoCrm {
  let tags: string[] = [];
  try { const t = JSON.parse(String(r.tags ?? "[]")); if (Array.isArray(t)) tags = t.map(String); } catch { /* tags ruins */ }
  return { ...(r as unknown as ContatoCrm), tags };
}

/** Etapa do ciclo de vida: pela última corrida finalizada e pelo total (mesma regra do sistema de referência). */
export function estagioDoContato(ultimaMs: number | null, totalCorridas: number, agoraMs: number): Estagio {
  if (!ultimaMs) return "novo";
  const dias = Math.floor((agoraMs - ultimaMs) / DIA);
  if (dias <= 30) return totalCorridas >= 10 ? "fiel" : "ativo";
  if (dias <= 59) return "em_risco";
  if (dias <= 89) return "inativo";
  return "perdido";
}

export interface Metricas {
  chave: string; telefone: string; nome: string; cidade: string; noCadastro: boolean; aniversario: string; criadoCadastro: number | null;
  finalizadas: number; canceladas: number; gasto: number; primeira: number | null; ultima: number | null;
  categoriaFavorita: string; faixaHoraria: string; notaMedia: number;
}

const faixa = (iso: string | null) => {
  const h = iso ? new Date(iso).getUTCHours() : NaN;
  if (!Number.isFinite(h)) return "";
  return h < 6 ? "madrugada" : h < 12 ? "manhã" : h < 18 ? "tarde" : "noite";
};
const maisFrequente = (m: Map<string, number>) => { let b = "", n = 0; for (const [k, v] of m) if (k && v > n) { b = k; n = v; } return b; };

/** Junta cadastro e corridas por passageiro (só quem tem telefone). Pura: testada sem banco. */
export function calcularMetricas(corridas: CorridaPainel[], cadastro: Array<Record<string, unknown>>): Map<string, Metricas> {
  type Acc = Metricas & { _cat: Map<string, number>; _cid: Map<string, number>; _fx: Map<string, number>; _notas: number[] };
  const m = new Map<string, Acc>();
  const pegar = (chave: string, nome: string, tel: string): Acc => {
    let x = m.get(chave);
    if (!x) {
      x = { chave, telefone: telefoneWhatsApp(tel) || tel, nome, cidade: "", noCadastro: false, aniversario: "", criadoCadastro: null, finalizadas: 0, canceladas: 0, gasto: 0, primeira: null, ultima: null, categoriaFavorita: "", faixaHoraria: "", notaMedia: 0, _cat: new Map(), _cid: new Map(), _fx: new Map(), _notas: [] };
      m.set(chave, x);
    }
    return x;
  };
  const comTelefone = (tel: string) => String(tel ?? "").replace(/\D/g, "").length >= 8;
  for (const c of corridas) {
    if (!comTelefone(c.telefonePassageiro)) continue;
    const chave = chaveDe("passageiro", c.telefonePassageiro, c.passageiro);
    if (!chave) continue;
    const x = pegar(chave, c.passageiro.trim(), c.telefonePassageiro);
    if (c.passageiro.trim() && !x.nome) x.nome = c.passageiro.trim();
    if (c.cidade) x._cid.set(c.cidade, (x._cid.get(c.cidade) ?? 0) + 1);
    if (c.grupo === "cancelada") x.canceladas++;
    if (c.grupo === "finalizada") {
      x.finalizadas++;
      x.gasto += c.valor ?? 0;
      const quando = realDe(c.finalizadaEm ?? c.solicitadaEm);
      if (quando != null) {
        if (x.primeira == null || quando < x.primeira) x.primeira = quando;
        if (x.ultima == null || quando > x.ultima) x.ultima = quando;
      }
      if (c.categoria) x._cat.set(c.categoria, (x._cat.get(c.categoria) ?? 0) + 1);
      const f = faixa(c.solicitadaEm);
      if (f) x._fx.set(f, (x._fx.get(f) ?? 0) + 1);
      if (c.avaliacao != null && c.avaliacao > 0) x._notas.push(c.avaliacao);
    }
  }
  for (const r of cadastro) {
    const tel = String(r.telefone ?? ""), nome = String(r.nome ?? "").trim();
    if (!comTelefone(tel)) continue;
    const chave = chaveDe("passageiro", tel, nome);
    if (!chave) continue;
    const x = pegar(chave, nome, tel);
    if (nome) x.nome = nome;
    x.noCadastro = true;
    x.telefone = telefoneWhatsApp(tel) || x.telefone;
    x.aniversario = String(r.nascimento ?? "");
    const cad = Date.parse(String(r.criadoEm ?? ""));
    x.criadoCadastro = Number.isFinite(cad) ? cad : null;
    const cidadeCad = String(r.cidade ?? "").trim();
    if (cidadeCad) x._cid.set(cidadeCad, Number.MAX_SAFE_INTEGER);
  }
  const saida = new Map<string, Metricas>();
  for (const { _cat, _cid, _fx, _notas, ...x } of m.values()) {
    saida.set(x.chave, {
      ...x, cidade: maisFrequente(_cid), categoriaFavorita: maisFrequente(_cat), faixaHoraria: maisFrequente(_fx),
      gasto: Math.round(x.gasto * 100) / 100, notaMedia: _notas.length ? Math.round((_notas.reduce((a, b) => a + b, 0) / _notas.length) * 10) / 10 : 0,
    });
  }
  return saida;
}

// ------------------------------------------------------------------ sincronização

export interface ResultadoSync { contatos: number; novos: number; atualizados: number; eventos: number }

/**
 * Traz para a base os passageiros do cadastro e das corridas e recalcula as métricas. Nunca diminui o total
 * (as corridas lidas cobrem só os últimos dias configurados). Tags, aniversário e opt-out marcado à mão ficam.
 */
export async function sincronizar(empresa: string, corridasDadas?: CorridaPainel[]): Promise<ResultadoSync> {
  const corridas = corridasDadas ?? (await corridasDoPublico(empresa)).corridas;
  const cadCad = cadastroPorId("clientes");
  const cadastro = cadCad ? listarCadastro(empresa, cadCad) : [];
  const metricas = calcularMetricas(corridas, cadastro);
  const agora = Date.now();
  const bloqueio = A.optOuts(empresa);
  const descad = new Map(descadastros(empresa).map((d) => [d.chave, d.estado]));
  // Lido antes do ponto de retorno: a primeira leitura da fila pode migrar o arquivo antigo e confirmar a transação do ciclo.
  const fila = A.fila(empresa);
  const db = bd();
  const existentes = new Map((db.prepare(`SELECT ${COLUNAS} FROM crm_contatos WHERE empresa = ?`).all(empresa) as Array<Record<string, unknown>>).map((r) => [String(r.chave), linhaParaContato(r)]));
  const upsert = db.prepare(`INSERT INTO crm_contatos (empresa, ${COLUNAS}, atualizado_em) VALUES (?, ${COLUNAS.split(",").map(() => "?").join(", ")}, ?)
    ON CONFLICT (empresa, chave) DO UPDATE SET telefone = excluded.telefone, nome = excluded.nome, cidade = excluded.cidade, stage = excluded.stage,
      opt_in_status = excluded.opt_in_status, opt_in_em = excluded.opt_in_em, opt_out_em = excluded.opt_out_em, aniversario = excluded.aniversario,
      primeira_corrida = excluded.primeira_corrida, ultima_corrida = excluded.ultima_corrida, total_corridas = excluded.total_corridas,
      total_gasto = excluded.total_gasto, ticket_medio = excluded.ticket_medio, cancelamentos = excluded.cancelamentos, nota_media = excluded.nota_media,
      categoria_favorita = excluded.categoria_favorita, faixa_horaria = excluded.faixa_horaria, atualizado_em = excluded.atualizado_em`);
  let novos = 0, atualizados = 0;
  db.exec("SAVEPOINT sync_contatos");
  try {
    for (const m of metricas.values()) {
      const antes = existentes.get(m.chave);
      const total = Math.max(m.finalizadas, antes?.total_corridas ?? 0);
      const gasto = Math.max(m.gasto, antes?.total_gasto ?? 0);
      const cancel = Math.max(m.canceladas, antes?.cancelamentos ?? 0);
      const ultima = m.ultima != null && antes?.ultima_corrida != null ? Math.max(m.ultima, antes.ultima_corrida) : m.ultima ?? antes?.ultima_corrida ?? null;
      const primeira = m.primeira != null && antes?.primeira_corrida != null ? Math.min(m.primeira, antes.primeira_corrida) : m.primeira ?? antes?.primeira_corrida ?? null;
      // Opt-out: vem da marcação da tela Público, dos descadastros do WhatsApp ou de uma marcação feita aqui.
      const chaveWa = waOptOutKey(m.telefone);
      const estadoDescad = chaveWa ? descad.get(chaveWa) : undefined;
      let optIn: OptIn = antes?.opt_in_status ?? "pending";
      let optOutEm = antes?.opt_out_em ?? null;
      if (bloqueio[m.chave] || estadoDescad === "descadastrado") { if (optIn !== "out") optOutEm = agora; optIn = "out"; }
      else if (optIn === "out") { optIn = estadoDescad === "autorizado" ? "in" : "pending"; optOutEm = null; }
      else if (estadoDescad === "autorizado") optIn = "in";
      const stage: Estagio = optIn === "out" && antes ? antes.stage : estagioDoContato(ultima, total, agora);
      const origem = antes?.origem ?? (m.noCadastro ? "cadastro" : "corridas");
      upsert.run(
        empresa, m.chave, m.telefone, m.nome || antes?.nome || "", m.cidade || antes?.cidade || "", origem, stage, optIn, antes?.opt_in_em ?? null, optOutEm,
        JSON.stringify(antes?.tags ?? []), m.aniversario || antes?.aniversario || "", primeira, ultima, total, gasto, total > 0 ? Math.round((gasto / total) * 100) / 100 : 0,
        cancel, antes?.simulacoes_sem_conversao ?? 0, m.notaMedia || antes?.nota_media || 0, m.categoriaFavorita || antes?.categoria_favorita || "",
        m.faixaHoraria || antes?.faixa_horaria || "", antes?.nps ?? null, antes?.rfm_r ?? null, antes?.rfm_f ?? null, antes?.rfm_m ?? null, antes?.rfm_segmento ?? null,
        antes?.rfm_pontos ?? 0, antes?.criado_em ?? m.criadoCadastro ?? agora, agora,
      );
      if (antes) atualizados++; else novos++;
    }
    const eventos = registrarEventos(empresa, corridas, metricas, cadastro, fila);
    db.exec("RELEASE sync_contatos");
    return { contatos: metricas.size, novos, atualizados, eventos };
  } catch (e) {
    db.exec("ROLLBACK TO sync_contatos");
    db.exec("RELEASE sync_contatos");
    throw e;
  }
}

/** Linha do tempo gerada das corridas, do cadastro e das mensagens enviadas (ids fixos: rodar de novo não repete). */
function registrarEventos(empresa: string, corridas: CorridaPainel[], metricas: Map<string, Metricas>, cadastro: Array<Record<string, unknown>>, fila: ItemFila[]): number {
  const ins = bd().prepare("INSERT OR IGNORE INTO crm_eventos (empresa, id, chave, tipo, quando, dados) VALUES (?, ?, ?, ?, ?, ?)");
  let n = 0;
  const grava = (id: string, chave: string, tipo: string, quando: number | null, dados: Record<string, unknown> = {}) => {
    if (quando == null || !metricas.has(chave)) return;
    if (Number(ins.run(empresa, id, chave, tipo, quando, JSON.stringify(dados)).changes) > 0) n++;
  };
  for (const c of corridas) {
    if (String(c.telefonePassageiro ?? "").replace(/\D/g, "").length < 8) continue;
    const chave = chaveDe("passageiro", c.telefonePassageiro, c.passageiro);
    const pedida = realDe(c.solicitadaEm);
    grava(`${c.id}:solicitou`, chave, "solicitou", pedida, { os: c.os, categoria: c.categoria });
    if (c.grupo === "finalizada") {
      grava(`${c.id}:concluiu`, chave, "concluiu", realDe(c.finalizadaEm ?? c.solicitadaEm), { os: c.os, valor: c.valor ?? 0, categoria: c.categoria });
      if (c.avaliacao != null && c.avaliacao > 0) grava(`${c.id}:avaliou`, chave, "avaliou", realDe(c.finalizadaEm ?? c.solicitadaEm), { os: c.os, nota: c.avaliacao });
    }
    if (c.grupo === "cancelada") grava(`${c.id}:cancelou`, chave, "cancelou", realDe(c.finalizadaEm ?? c.solicitadaEm), { os: c.os, motivo: c.motivoCancelamento });
  }
  for (const r of cadastro) {
    const tel = String(r.telefone ?? "");
    if (tel.replace(/\D/g, "").length < 8) continue;
    const chave = chaveDe("passageiro", tel, String(r.nome ?? ""));
    const cad = Date.parse(String(r.criadoEm ?? ""));
    grava(`cadastro:${chave}`, chave, "cadastro", Number.isFinite(cad) ? cad : null);
  }
  for (const i of fila) {
    if (i.estado === "enviado" && i.enviadoEm) grava(`fila:${i.id}`, i.chave, "msg_enviada", i.enviadoEm, { origem: i.origem.tipo, origemId: i.origem.id });
  }
  return n;
}

/** Sincroniza só se a base ainda está vazia (primeira visita à aba). */
export async function garantirBase(empresa: string) {
  const r = bd().prepare("SELECT COUNT(*) AS n FROM crm_contatos WHERE empresa = ?").get(empresa) as { n: number };
  if (!r.n) await sincronizar(empresa);
}

// ------------------------------------------------------------------ consultas

export interface FiltroContatos { busca?: string; stage?: string; tag?: string; pagina?: number; porPagina?: number }

const escaparLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export function listarContatos(empresa: string, f: FiltroContatos) {
  const onde = ["empresa = ?"], args: Array<string | number> = [empresa];
  if (f.stage && (ESTAGIOS as string[]).includes(f.stage)) { onde.push("stage = ?"); args.push(f.stage); }
  if (f.tag) { onde.push("EXISTS (SELECT 1 FROM json_each(crm_contatos.tags) WHERE value = ?)"); args.push(f.tag); }
  const termo = String(f.busca ?? "").replace(/[,()%*\\"]/g, " ").replace(/\s+/g, " ").trim();
  if (termo) {
    const dig = termo.replace(/\D/g, "");
    onde.push("(nome LIKE ? ESCAPE '\\' OR telefone LIKE ? ESCAPE '\\')");
    args.push(`%${escaparLike(termo)}%`, `%${escaparLike(dig.length >= 3 ? dig : termo)}%`);
  }
  const porPagina = Math.min(100, Math.max(1, Math.floor(Number(f.porPagina)) || 25));
  const pagina = Math.max(0, Math.floor(Number(f.pagina)) || 0);
  const db = bd();
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM crm_contatos WHERE ${onde.join(" AND ")}`).get(...args) as { n: number }).n;
  const linhas = db.prepare(`SELECT ${COLUNAS} FROM crm_contatos WHERE ${onde.join(" AND ")} ORDER BY criado_em DESC, chave LIMIT ? OFFSET ?`).all(...args, porPagina, pagina * porPagina) as Array<Record<string, unknown>>;
  return { total, contatos: linhas.map(linhaParaContato) };
}

export function contagemPorEstagio(empresa: string): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(ESTAGIOS.map((e) => [e, 0]));
  for (const r of bd().prepare("SELECT stage, COUNT(*) AS n FROM crm_contatos WHERE empresa = ? GROUP BY stage").all(empresa) as Array<{ stage: string; n: number }>) out[r.stage] = r.n;
  return out;
}

export function tagsDistintas(empresa: string): string[] {
  return (bd().prepare("SELECT DISTINCT value AS tag FROM crm_contatos, json_each(crm_contatos.tags) WHERE empresa = ? AND value <> '' ORDER BY 1 LIMIT 500").all(empresa) as Array<{ tag: string }>).map((r) => r.tag);
}

/** Números que explicam a diferença entre o cadastro e a base de contatos (e quantos motoristas há). */
export function estatisticas(empresa: string) {
  const cad = cadastroPorId("clientes");
  const passageiros = cad ? listarCadastro(empresa, cad) : [];
  const chaves = new Set((bd().prepare("SELECT chave FROM crm_contatos WHERE empresa = ?").all(empresa) as Array<{ chave: string }>).map((r) => r.chave));
  let semContato = 0, telefoneCurto = 0;
  for (const p of passageiros) {
    const tel = String(p.telefone ?? "");
    if (tel.replace(/\D/g, "").length < 8) { telefoneCurto++; continue; }
    if (!chaves.has(chaveDe("passageiro", tel, String(p.nome ?? "")))) semContato++;
  }
  const mot = cadastroPorId("motoristas");
  return { contatos: chaves.size, passageiros_cadastro: passageiros.length, passageiros_sem_contato: semContato, passageiros_telefone_curto: telefoneCurto, motoristas: mot ? listarCadastro(empresa, mot).length : 0 };
}

export function contatoPorChave(empresa: string, chave: string): ContatoCrm | null {
  const r = bd().prepare(`SELECT ${COLUNAS} FROM crm_contatos WHERE empresa = ? AND chave = ?`).get(empresa, chave) as Record<string, unknown> | undefined;
  return r ? linhaParaContato(r) : null;
}

const chaveValida = (c: string) => /^p:[\w .-]{1,56}$/.test(c);

/** Opt-out geral (ou reativação) de um contato. Mantém a marcação da tela Público em dia. */
export function mudarOptOut(empresa: string, chave: string, sair: boolean, ator: string): ContatoCrm {
  if (!chaveValida(chave)) throw new Error("Contato inválido.");
  const c = contatoPorChave(empresa, chave);
  if (!c) throw new Error("Contato não encontrado.");
  const agora = Date.now();
  A.marcarOptOut(empresa, chave, sair);
  bd().prepare("UPDATE crm_contatos SET opt_in_status = ?, opt_out_em = ?, atualizado_em = ? WHERE empresa = ? AND chave = ?").run(sair ? "out" : "pending", sair ? agora : null, agora, empresa, chave);
  bd().prepare("INSERT OR IGNORE INTO crm_eventos (empresa, id, chave, tipo, quando, dados) VALUES (?, ?, ?, ?, ?, ?)")
    .run(empresa, `${sair ? "optout" : "optin"}:${chave}:${agora}`, chave, sair ? "opt_out" : "opt_in", agora, JSON.stringify({ motivo: "manual", por: ator }));
  return contatoPorChave(empresa, chave)!;
}

export function salvarTags(empresa: string, chave: string, tags: unknown): string[] {
  if (!chaveValida(chave)) throw new Error("Contato inválido.");
  if (!Array.isArray(tags)) throw new Error("Tags inválidas.");
  const limpas = [...new Set(tags.map((t) => String(t).trim().slice(0, 40)).filter(Boolean))].slice(0, 30);
  const r = bd().prepare("UPDATE crm_contatos SET tags = ?, atualizado_em = ? WHERE empresa = ? AND chave = ?").run(JSON.stringify(limpas), Date.now(), empresa, chave);
  if (!Number(r.changes)) throw new Error("Contato não encontrado.");
  return limpas;
}

/** Exclui o contato e a linha do tempo dele (LGPD). A marcação de opt-out é mantida, para ele não voltar a receber. */
export function excluirContato(empresa: string, chave: string) {
  if (!chaveValida(chave)) throw new Error("Contato inválido.");
  const db = bd();
  db.prepare("DELETE FROM crm_eventos WHERE empresa = ? AND chave = ?").run(empresa, chave);
  const r = db.prepare("DELETE FROM crm_contatos WHERE empresa = ? AND chave = ?").run(empresa, chave);
  if (!Number(r.changes)) throw new Error("Contato não encontrado.");
}

export function linhaDoTempo(empresa: string, chave: string, limite = 50) {
  return (bd().prepare("SELECT id, tipo, quando FROM crm_eventos WHERE empresa = ? AND chave = ? ORDER BY quando DESC LIMIT ?").all(empresa, chave, limite) as Array<{ id: string; tipo: string; quando: number }>);
}

/** Mensagens que a pessoa recebeu nos últimos 7 dias (fila do CRM). */
export function mensagens7dias(empresa: string, chave: string, agora = Date.now()): number {
  return A.fila(empresa).filter((i) => i.chave === chave && i.estado === "enviado" && (i.enviadoEm ?? 0) >= agora - 7 * DIA).length;
}

// ------------------------------------------------------------------ importar CSV

export interface ResultadoCsv { importados: number; mantidos: number; erros: string[] }

/** Cabeçalho phone/telefone e name/nome. Aceita vírgula ou ponto e vírgula. Quem já existe não perde nome nem origem. */
export function importarCsv(empresa: string, texto: string): ResultadoCsv {
  const linhas = String(texto ?? "").replace(/^﻿/, "").trim().split(/\r?\n/);
  const sep = (linhas[0] ?? "").includes(";") && !(linhas[0] ?? "").includes(",") ? ";" : ",";
  const cab = (linhas[0] ?? "").split(sep).map((h) => h.trim().toLowerCase());
  const iTel = cab.findIndex((h) => h === "phone" || h === "telefone");
  const iNome = cab.findIndex((h) => h === "name" || h === "nome");
  const r: ResultadoCsv = { importados: 0, mantidos: 0, erros: [] };
  if (iTel === -1) return { ...r, erros: ['Coluna "phone" ou "telefone" não encontrada no cabeçalho.'] };
  if (linhas.length > 20_001) return { ...r, erros: ["O arquivo passa de 20 mil linhas. Divida em partes."] };
  const porChave = new Map<string, { telefone: string; nome: string }>();
  for (let i = 1; i < linhas.length; i++) {
    if (!linhas[i].trim()) continue;
    const col = linhas[i].split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
    const cru = col[iTel] ?? "";
    if (!cru) { r.erros.push(`Linha ${i + 1}: telefone vazio.`); continue; }
    const tel = telefoneWhatsApp(cru);
    if (!tel) { r.erros.push(`Linha ${i + 1}: telefone inválido (${cru.slice(0, 20)}).`); continue; }
    const nome = (iNome >= 0 ? col[iNome] ?? "" : "").slice(0, 120);
    porChave.set(chaveDe("passageiro", tel, nome), { telefone: tel, nome });
  }
  const db = bd();
  const agora = Date.now();
  const ver = db.prepare("SELECT nome FROM crm_contatos WHERE empresa = ? AND chave = ?");
  const novo = db.prepare("INSERT INTO crm_contatos (empresa, chave, telefone, nome, origem, criado_em, atualizado_em) VALUES (?, ?, ?, ?, 'importacao', ?, ?)");
  const preencher = db.prepare("UPDATE crm_contatos SET nome = ?, atualizado_em = ? WHERE empresa = ? AND chave = ?");
  db.exec("SAVEPOINT csv_contatos");
  try {
    for (const [chave, p] of porChave) {
      const ja = ver.get(empresa, chave) as { nome: string } | undefined;
      if (!ja) { novo.run(empresa, chave, p.telefone, p.nome, agora, agora); r.importados++; }
      else if (p.nome && !ja.nome.trim()) { preencher.run(p.nome, agora, empresa, chave); r.importados++; }
      else r.mantidos++;
    }
    db.exec("RELEASE csv_contatos");
  } catch (e) { db.exec("ROLLBACK TO csv_contatos"); db.exec("RELEASE csv_contatos"); throw e; }
  return r;
}

// ------------------------------------------------------------------ motoristas

/** Motoristas do cadastro, com a situação e a última corrida (aba Contatos › Motoristas). */
export async function listarMotoristas(empresa: string, f: { busca?: string; situacao?: string; pagina?: number }) {
  const { contatos } = await publico(empresa, "motorista");
  const b = normal(f.busca ?? ""), dig = b.replace(/\D/g, "");
  let lista = contatos.filter((c) => c.noCadastro);
  const situacoes = [...new Set(lista.map((c) => c.situacao).filter(Boolean))].sort();
  if (f.situacao) lista = lista.filter((c) => c.situacao === f.situacao);
  if (b) lista = lista.filter((c) => normal(c.nome).includes(b) || (dig.length >= 3 && c.telefone.replace(/\D/g, "").includes(dig)));
  lista.sort((a, c) => a.nome.localeCompare(c.nome, "pt-BR"));
  const pagina = Math.max(0, Math.floor(Number(f.pagina)) || 0);
  return {
    total: lista.length, situacoes,
    motoristas: lista.slice(pagina * 25, pagina * 25 + 25).map((c) => ({ chave: c.chave, nome: c.nome, telefone: c.telefone, cidade: c.cidade, situacao: c.situacao, ultimaCorrida: c.ultimaCorrida })),
  };
}
