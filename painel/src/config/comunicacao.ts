// Comunicação: Conversas (caixa de entrada da central com passageiros e motoristas) e Notificações Push (disparo imediato e agendamento).

import crypto from "node:crypto";
import { cadastroPorId } from "../comum/cadastros.ts";
import { criar, listar } from "../cadastros/armazem.ts";
import { avisar } from "../apps/push.ts";
import { emitir } from "../apps/eventos.ts";
import type { PapelApp } from "../apps/sessoes.ts";
import { listarProprias } from "../corridas/index.ts";
import { agoraBr } from "../servidor/util.ts";
import { bancoConfig, gravarConfig, lerConfig, lista, novoId, numero, texto, umDe } from "./armazem.ts";

// ------------------------------------------------------------------ conversas

export interface MensagemCentral { id: string; de: "pessoa" | "central"; texto: string; em: string; lida: boolean }

/** Chamado pelo app (passageiro ou motorista) quando a pessoa escreve para a central. */
export function receberDaPessoa(empresaId: string, papel: PapelApp, chave: string, nome: string, textoMsg: string): MensagemCentral {
  const t = texto(textoMsg, 1000);
  if (!t) throw new Error("Escreva a mensagem.");
  return gravar(empresaId, papel, chave, nome, "pessoa", t);
}
function gravar(empresaId: string, papel: PapelApp, chave: string, nome: string, de: "pessoa" | "central", t: string): MensagemCentral {
  const m: MensagemCentral = { id: crypto.randomUUID(), de, texto: t, em: agoraBr().toISOString(), lida: de === "central" };
  bancoConfig().prepare("INSERT INTO central_chat (empresa, id, papel, chave, de, texto, em, lida) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(empresaId, m.id, papel, chave, de === "pessoa" ? texto(nome, 80) || chave : "central", t, m.em, m.lida ? 1 : 0);
  return m;
}
/** Mensagens da conversa (o app mostra as dela com a central). */
export function mensagensDaPessoa(empresaId: string, papel: PapelApp, chave: string, limite = 200): MensagemCentral[] {
  const l = bancoConfig().prepare("SELECT id, de, texto, em, lida FROM central_chat WHERE empresa = ? AND papel = ? AND chave = ? ORDER BY em DESC, rowid DESC LIMIT ?").all(empresaId, papel, chave, limite) as Array<{ id: string; de: string; texto: string; em: string; lida: number }>;
  return l.reverse().map((x) => ({ id: x.id, de: x.de === "central" ? "central" : "pessoa", texto: x.texto, em: x.em, lida: !!x.lida }));
}

export function conversas(empresaId: string) {
  const nomes = new Map<string, string>();
  for (const m of listar(empresaId, cadastroPorId("motoristas")!)) nomes.set(`motorista|${m.id}`, String(m.nome ?? ""));
  for (const c of listar(empresaId, cadastroPorId("clientes")!)) nomes.set(`passageiro|${c.telefone}`, String(c.nome ?? ""));
  const linhas = bancoConfig().prepare(`
    SELECT papel, chave, MAX(CASE WHEN de <> 'central' THEN de END) AS nome, MAX(em) AS ultima,
           SUM(CASE WHEN de <> 'central' AND lida = 0 THEN 1 ELSE 0 END) AS naoLidas, COUNT(*) AS total
    FROM central_chat WHERE empresa = ? GROUP BY papel, chave ORDER BY ultima DESC LIMIT 300`).all(empresaId) as Array<{ papel: PapelApp; chave: string; nome: string | null; ultima: string; naoLidas: number; total: number }>;
  return linhas.map((l) => {
    const u = bancoConfig().prepare("SELECT texto, de FROM central_chat WHERE empresa = ? AND papel = ? AND chave = ? ORDER BY em DESC, rowid DESC LIMIT 1").get(empresaId, l.papel, l.chave) as { texto: string; de: string };
    return { papel: l.papel, chave: l.chave, nome: nomes.get(`${l.papel}|${l.chave}`) || l.nome || l.chave, ultima: l.ultima, naoLidas: Number(l.naoLidas), ultimaTexto: u.texto, ultimaDe: u.de === "central" ? "central" : "pessoa" };
  });
}
export function responder(empresaId: string, papel: PapelApp, chave: string, textoMsg: string): MensagemCentral {
  const t = texto(textoMsg, 1000);
  if (!t) throw new Error("Escreva a mensagem.");
  const m = gravar(empresaId, papel, chave, "", "central", t);
  marcarLidas(empresaId, papel, chave);
  emitir(empresaId, { papel, chave }, "central_chat", m);
  void avisar(empresaId, { papel, chave }, { titulo: "Mensagem da central", texto: t, canal: "chat", dados: { tipo: "central_chat" } });
  return m;
}
export function marcarLidas(empresaId: string, papel?: PapelApp, chave?: string): number {
  const q = papel && chave
    ? bancoConfig().prepare("UPDATE central_chat SET lida = 1 WHERE empresa = ? AND papel = ? AND chave = ? AND lida = 0").run(empresaId, papel, chave)
    : bancoConfig().prepare("UPDATE central_chat SET lida = 1 WHERE empresa = ? AND lida = 0").run(empresaId);
  return Number(q.changes);
}

// ------------------------------------------------------------------ notificações push

export type Segmento = "todos" | "com_corridas" | "sem_corridas" | "individual";
export interface PedidoPush { papel: "motorista" | "passageiro"; segmento: Segmento; titulo: string; mensagem: string; usarNome?: boolean; usuario?: string }

function destinatarios(empresaId: string, papel: "motorista" | "passageiro", segmento: Segmento, usuario = ""): Array<{ chave: string; nome: string }> {
  const proprias = listarProprias(empresaId);
  const fez = new Set(proprias.map((c) => (papel === "motorista" ? c.motoristaId : c.passageiro.telefone.replace(/\D/g, ""))).filter(Boolean) as string[]);
  const todos = papel === "motorista"
    ? listar(empresaId, cadastroPorId("motoristas")!).filter((m) => m.status === "Ativo").map((m) => ({ chave: m.id, nome: String(m.nome ?? "") }))
    : listar(empresaId, cadastroPorId("clientes")!).filter((c) => c.status !== "Bloqueado").map((c) => ({ chave: String(c.telefone ?? "").replace(/\D/g, ""), nome: String(c.nome ?? "") }));
  if (segmento === "individual") return todos.filter((x) => x.chave === (papel === "motorista" ? usuario : usuario.replace(/\D/g, "")));
  if (segmento === "com_corridas") return todos.filter((x) => fez.has(x.chave));
  if (segmento === "sem_corridas") return todos.filter((x) => !fez.has(x.chave));
  return todos;
}

/** Pessoas para o campo "Individual" (busca por nome, telefone ou e-mail). */
export function buscarPessoas(empresaId: string, papel: "motorista" | "passageiro", busca: string) {
  const q = busca.trim().toLowerCase();
  const cad = listar(empresaId, cadastroPorId(papel === "motorista" ? "motoristas" : "clientes")!);
  return cad.filter((r) => !q || `${r.nome} ${r.telefone} ${r.email ?? ""}`.toLowerCase().includes(q)).slice(0, 20)
    .map((r) => ({ chave: papel === "motorista" ? r.id : String(r.telefone ?? ""), nome: String(r.nome ?? ""), telefone: String(r.telefone ?? "") }));
}

export function sanearPedido(e: unknown): PedidoPush {
  const o = (e ?? {}) as Record<string, unknown>;
  const papel = umDe(o.papel, ["motorista", "passageiro"] as const, "passageiro");
  const segmento = umDe(o.segmento, ["todos", "com_corridas", "sem_corridas", "individual"] as const, "todos");
  const titulo = texto(o.titulo, 60), mensagem = texto(o.mensagem, 240);
  if (!titulo || !mensagem) throw new Error("Preencha o título e a mensagem.");
  if (segmento === "individual" && !texto(o.usuario, 80)) throw new Error("Escolha o usuário.");
  return { papel, segmento, titulo, mensagem, usarNome: o.usarNome === true || o.usarNome === "1", usuario: texto(o.usuario, 80) };
}

const personalizar = (t: string, nome: string, usar: boolean, tituloDaMsg: boolean) => {
  const primeiro = nome.trim().split(/\s+/)[0] ?? "";
  if (!usar || !primeiro) return t.replace(/\{nome\}/g, "");
  if (t.includes("{nome}")) return t.replace(/\{nome\}/g, primeiro);
  return tituloDaMsg ? `${primeiro}, ${t.charAt(0).toLowerCase()}${t.slice(1)}` : t;
};

export async function dispararNotificacao(empresaId: string, p: PedidoPush, por: string, agendamentoId = "") {
  const alvos = destinatarios(empresaId, p.papel, p.segmento, p.usuario);
  if (!alvos.length) throw new Error("Nenhum destinatário neste filtro.");
  // Caixa de notificações do app: só quando é para todos (vale para quem abrir o app depois).
  if (p.segmento === "todos") {
    const hoje = agoraBr().toISOString().slice(0, 10);
    const fim = new Date(agoraBr().getTime() + 14 * 86_400_000).toISOString().slice(0, 10);
    criar(empresaId, cadastroPorId("notificacoes")!, { titulo: p.titulo, texto: p.mensagem.replace(/\{nome\}/g, ""), publico: p.papel === "motorista" ? "Motoristas" : "Passageiros", inicio: hoje, fim, ativa: true }, por);
  }
  let aceitos = 0;
  for (const a of alvos) {
    aceitos += await avisar(empresaId, { papel: p.papel, chave: a.chave }, { titulo: personalizar(p.titulo, a.nome, !!p.usarNome, true), texto: personalizar(p.mensagem, a.nome, !!p.usarNome, false), canal: "geral", dados: { tipo: "notificacao" } });
  }
  const id = novoId();
  bancoConfig().prepare("INSERT INTO notificacoes_envios (empresa, id, papel, titulo, mensagem, segmento, destinatarios, por, em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(empresaId, id, p.papel, p.titulo, p.mensagem, p.segmento + (agendamentoId ? ` (agendada)` : ""), alvos.length, por, agoraBr().toISOString());
  return { id, destinatarios: alvos.length, aparelhos: aceitos };
}

export function historicoNotificacoes(empresaId: string, limite = 50) {
  return bancoConfig().prepare("SELECT id, papel, titulo, mensagem, segmento, destinatarios, por, em FROM notificacoes_envios WHERE empresa = ? ORDER BY em DESC, rowid DESC LIMIT ?").all(empresaId, limite);
}

// ---- agendamento (Piloto Automático)

export interface Agendamento extends PedidoPush { id: string; regra: "unico" | "diario" | "semanal" | "mensal"; data: string; hora: string; diaSemana: number; diaMes: number; ativo: boolean; ultimoEnvio: string }
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export function sanearAgendamento(e: unknown): Agendamento {
  const o = (e ?? {}) as Record<string, unknown>;
  const p = sanearPedido(o);
  const regra = umDe(o.regra, ["unico", "diario", "semanal", "mensal"] as const, "unico");
  const hora = String(o.hora ?? "");
  if (!HORA.test(hora)) throw new Error("Informe o horário.");
  const data = String(o.data ?? "");
  if (regra === "unico" && !/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error("Informe a data.");
  return { ...p, id: texto(o.id, 20) || novoId(), regra, data: regra === "unico" ? data : "", hora, diaSemana: Math.round(numero(o.diaSemana, 0, 0, 6)), diaMes: Math.round(numero(o.diaMes, 1, 1, 31)), ativo: o.ativo !== false, ultimoEnvio: "" };
}
export const agendamentos = (empresaId: string): Agendamento[] => lista(lerConfig<unknown[]>(empresaId, "agendamentos", [])) as Agendamento[];
export function criarAgendamento(empresaId: string, entrada: unknown): Agendamento[] {
  const a = sanearAgendamento(entrada);
  gravarConfig(empresaId, "agendamentos", [...agendamentos(empresaId), a].slice(0, 100));
  return agendamentos(empresaId);
}
export function removerAgendamento(empresaId: string, id: string): Agendamento[] {
  gravarConfig(empresaId, "agendamentos", agendamentos(empresaId).filter((a) => a.id !== id));
  return agendamentos(empresaId);
}
export function pausarAgendamento(empresaId: string, id: string, ativo: boolean): Agendamento[] {
  gravarConfig(empresaId, "agendamentos", agendamentos(empresaId).map((a) => (a.id === id ? { ...a, ativo } : a)));
  return agendamentos(empresaId);
}

/** Dispara os agendamentos que venceram (roda a cada minuto). */
export async function executarAgendamentos(empresaId: string, agora = agoraBr()): Promise<number> {
  const dia = agora.toISOString().slice(0, 10), hm = agora.toISOString().slice(11, 16);
  let n = 0;
  const lista2 = agendamentos(empresaId);
  for (const a of lista2) {
    if (!a.ativo || a.ultimoEnvio === dia || hm < a.hora) continue;
    const vale = a.regra === "unico" ? a.data === dia : a.regra === "diario" ? true : a.regra === "semanal" ? agora.getUTCDay() === a.diaSemana : agora.getUTCDate() === a.diaMes;
    if (!vale) continue;
    a.ultimoEnvio = dia;
    if (a.regra === "unico") a.ativo = false;
    try { await dispararNotificacao(empresaId, a, "agendamento", a.id); n++; } catch { /* sem destinatário hoje */ }
  }
  if (n || lista2.some((a) => a.ultimoEnvio === dia)) gravarConfig(empresaId, "agendamentos", lista2);
  return n;
}
