// Caixa de avisos dos apps (passageiro e motorista): tudo o que a central (painel, CRM, jornadas, gatilhos) manda
// para uma pessoa fica aqui, com a situação de cada mensagem. Contrato completo em docs/PUSH_APPS.md.
//
// Situação (estado) de cada aviso:
//   enviada   a central gravou na caixa da pessoa (e tentou o push do sistema, se houver chave do Firebase);
//   entregue  o app da pessoa buscou a lista ou recebeu o aviso em tempo real;
//   lida      a pessoa abriu o aviso;
//   falha     não foi possível entregar (pessoa sem cadastro, por exemplo).
// Push do sistema (app fechado), campo "push": enviado | sem_chave | sem_aparelho | falha.
// "sem_chave" = o dono ainda não colocou a conta de serviço do Firebase: a mensagem está na caixa do app, só não toca no celular.

import crypto from "node:crypto";
import { cadastroPorId } from "../comum/cadastros.ts";
import { listar } from "../cadastros/armazem.ts";
import { banco } from "../servidor/banco.ts";
import { emitir, type Alvo } from "./eventos.ts";
import { avisarDetalhado, type SituacaoPush } from "./push.ts";
import type { PapelApp } from "./sessoes.ts";

export type EstadoAviso = "enviada" | "entregue" | "lida" | "falha";
export interface Aviso {
  id: string; titulo: string; texto: string; origem: string; origemId: string; envioRef: string;
  estado: EstadoAviso; push: SituacaoPush; erro: string; em: number; entregueEm: number | null; lidaEm: number | null;
}
interface Linha {
  id: string; titulo: string; texto: string; origem: string; origem_id: string; envio_ref: string; estado: EstadoAviso; push: SituacaoPush; erro: string;
  em: number; entregue_em: number | null; lida_em: number | null;
}
const COLUNAS = "id, titulo, texto, origem, origem_id, envio_ref, estado, push, erro, em, entregue_em, lida_em";
const paraAviso = (l: Linha): Aviso => ({ id: l.id, titulo: l.titulo, texto: l.texto, origem: l.origem, origemId: l.origem_id, envioRef: l.envio_ref, estado: l.estado, push: l.push, erro: l.erro, em: l.em, entregueEm: l.entregue_em, lidaEm: l.lida_em });

const dig = (t: unknown) => String(t ?? "").replace(/\D/g, "");

/** Acha a pessoa dos apps a partir do telefone (CRM trabalha com telefone). null = não tem cadastro. */
export function alvoDoTelefone(empresaId: string, papel: PapelApp, telefone: string): (Alvo & { nome: string }) | null {
  const t = dig(telefone).slice(-11);
  if (t.length < 8) return null;
  if (papel === "motorista") {
    const m = listar(empresaId, cadastroPorId("motoristas")!).find((x) => dig(x.telefone).slice(-11) === t);
    return m ? { papel, chave: m.id, nome: String(m.nome ?? "") } : null;
  }
  const c = listar(empresaId, cadastroPorId("clientes")!).find((x) => dig(x.telefone).slice(-11) === t);
  return c ? { papel, chave: dig(c.telefone), nome: String(c.nome ?? "") } : null;
}

export interface PedidoAviso { titulo: string; texto: string; origem: string; origemId?: string; envioRef?: string; canal?: "geral" | "chat" }

/**
 * Entrega um aviso na caixa da pessoa (sempre) e tenta o push do sistema (se houver chave do Firebase e aparelho).
 * Nunca lança erro por causa do push. Devolve o aviso gravado.
 */
export async function entregar(empresaId: string, alvo: Alvo, p: PedidoAviso): Promise<Aviso> {
  const id = crypto.randomUUID();
  const agora = Date.now();
  const titulo = p.titulo.trim().slice(0, 80) || "Aviso da central", texto = p.texto.trim().slice(0, 1000);
  banco().prepare("INSERT INTO app_avisos (empresa, id, papel, chave, titulo, texto, origem, origem_id, envio_ref, estado, push, em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'enviada', 'sem_chave', ?)")
    .run(empresaId, id, alvo.papel, alvo.chave, titulo, texto, p.origem.slice(0, 30), (p.origemId ?? "").slice(0, 60), (p.envioRef ?? "").slice(0, 60), agora);
  // Tempo real: se o app estiver aberto, recebe agora e já conta como entregue (o app confirma ao receber).
  emitir(empresaId, alvo, "aviso", { id, titulo, texto, em: agora });
  const r = await avisarDetalhado(empresaId, alvo, { titulo, texto, canal: p.canal ?? "geral", dados: { tipo: "aviso", avisoId: id } });
  banco().prepare("UPDATE app_avisos SET push = ?, erro = ? WHERE empresa = ? AND id = ?").run(r.situacao, r.erro.slice(0, 200), empresaId, id);
  return paraAviso(banco().prepare(`SELECT ${COLUNAS} FROM app_avisos WHERE empresa = ? AND id = ?`).get(empresaId, id) as unknown as Linha);
}

/** Registra uma tentativa que não deu para entregar (pessoa sem cadastro etc.). */
export function registrarFalha(empresaId: string, papel: PapelApp, chave: string, p: PedidoAviso, erro: string): void {
  banco().prepare("INSERT INTO app_avisos (empresa, id, papel, chave, titulo, texto, origem, origem_id, envio_ref, estado, push, erro, em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'falha', 'sem_aparelho', ?, ?)")
    .run(empresaId, crypto.randomUUID(), papel, chave.slice(0, 80), p.titulo.slice(0, 80), p.texto.slice(0, 1000), p.origem.slice(0, 30), (p.origemId ?? "").slice(0, 60), (p.envioRef ?? "").slice(0, 60), erro.slice(0, 200), Date.now());
}

/** Lista da pessoa (mais novos primeiro). Ao buscar, o que estava "enviada" vira "entregue". */
export function listarDaPessoa(empresaId: string, alvo: Alvo, limite = 100) {
  const db = banco();
  const agora = Date.now();
  db.prepare("UPDATE app_avisos SET estado = 'entregue', entregue_em = ? WHERE empresa = ? AND papel = ? AND chave = ? AND estado = 'enviada'").run(agora, empresaId, alvo.papel, alvo.chave);
  const l = db.prepare(`SELECT ${COLUNAS} FROM app_avisos WHERE empresa = ? AND papel = ? AND chave = ? AND estado <> 'falha' ORDER BY em DESC, seq DESC LIMIT ?`).all(empresaId, alvo.papel, alvo.chave, limite) as unknown as Linha[];
  const avisos = l.map(paraAviso);
  return { avisos, naoLidos: contarNaoLidos(empresaId, alvo) };
}

export function contarNaoLidos(empresaId: string, alvo: Alvo): number {
  return Number((banco().prepare("SELECT COUNT(*) AS n FROM app_avisos WHERE empresa = ? AND papel = ? AND chave = ? AND estado IN ('enviada','entregue')").get(empresaId, alvo.papel, alvo.chave) as { n: number }).n);
}

/** O app confirma que recebeu (tempo real) sem abrir a lista. */
export function marcarEntregue(empresaId: string, alvo: Alvo, ids: string[]): number {
  let n = 0;
  const st = banco().prepare("UPDATE app_avisos SET estado = 'entregue', entregue_em = ? WHERE empresa = ? AND papel = ? AND chave = ? AND id = ? AND estado = 'enviada'");
  for (const id of ids.slice(0, 200)) n += Number(st.run(Date.now(), empresaId, alvo.papel, alvo.chave, String(id)).changes);
  return n;
}

/** Marca como lidos (ids) ou todos. Só mexe nos avisos da própria pessoa. */
export function marcarLidos(empresaId: string, alvo: Alvo, ids: string[] | "todos"): number {
  const agora = Date.now();
  const base = "UPDATE app_avisos SET estado = 'lida', lida_em = ?, entregue_em = COALESCE(entregue_em, ?) WHERE empresa = ? AND papel = ? AND chave = ? AND estado IN ('enviada','entregue')";
  if (ids === "todos") return Number(banco().prepare(base).run(agora, agora, empresaId, alvo.papel, alvo.chave).changes);
  const st = banco().prepare(`${base} AND id = ?`);
  let n = 0;
  for (const id of ids.slice(0, 200)) n += Number(st.run(agora, agora, empresaId, alvo.papel, alvo.chave, String(id)).changes);
  return n;
}

// ------------------------------------------------------------------ visão do CRM

export const ROTULO_ESTADO: Record<EstadoAviso, string> = { enviada: "Enviada", entregue: "Entregue no app", lida: "Lida", falha: "Falha" };
export const ROTULO_PUSH: Record<SituacaoPush, string> = { enviado: "Push do sistema enviado", sem_chave: "Push do sistema pendente de chave", sem_aparelho: "Sem aparelho registrado", falha: "Push do sistema falhou" };

export interface StatusApp { papel: "passageiro" | "motorista"; estado: EstadoAviso; push: SituacaoPush; erro: string; entregueEm: number | null; lidaEm: number | null }

/** Situação dos avisos ligados a linhas do histórico do CRM (envio_ref = id da linha em crm_envios). */
export function statusPorEnvio(empresaId: string, refs: string[]): Map<string, StatusApp> {
  const m = new Map<string, StatusApp>();
  if (!refs.length) return m;
  const l = banco().prepare(`SELECT envio_ref, papel, estado, push, erro, entregue_em, lida_em FROM app_avisos WHERE empresa = ? AND envio_ref IN (${refs.map(() => "?").join(",")})`).all(empresaId, ...refs) as unknown as Array<{ envio_ref: string; papel: "passageiro" | "motorista"; estado: EstadoAviso; push: SituacaoPush; erro: string; entregue_em: number | null; lida_em: number | null }>;
  for (const x of l) m.set(x.envio_ref, { papel: x.papel === "motorista" ? "motorista" : "passageiro", estado: x.estado, push: x.push, erro: x.erro, entregueEm: x.entregue_em, lidaEm: x.lida_em });
  return m;
}

/** Contagem por situação dos avisos de uma origem (campanha, jornada, gatilho ou envio da tela Notificações app). */
export function resumoDaOrigem(empresaId: string, origem: string, origemId: string) {
  const l = banco().prepare("SELECT estado, push, COUNT(*) AS n FROM app_avisos WHERE empresa = ? AND origem = ? AND origem_id = ? GROUP BY estado, push").all(empresaId, origem, origemId) as unknown as Array<{ estado: EstadoAviso; push: SituacaoPush; n: number }>;
  const r = { total: 0, enviadas: 0, entregues: 0, lidas: 0, falhas: 0, pushEnviado: 0, pushPendenteChave: 0 };
  for (const x of l) {
    r.total += x.n;
    if (x.estado === "enviada") r.enviadas += x.n; else if (x.estado === "entregue") r.entregues += x.n; else if (x.estado === "lida") r.lidas += x.n; else r.falhas += x.n;
    if (x.push === "enviado") r.pushEnviado += x.n; else if (x.push === "sem_chave") r.pushPendenteChave += x.n;
  }
  return r;
}
