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

/** Quantas mensagens a conversa tem no total (para o botão "Carregar mais mensagens"). */
export function totalMensagens(empresaId: string, papel: PapelApp, chave: string): number {
  return Number((bancoConfig().prepare("SELECT COUNT(*) AS n FROM central_chat WHERE empresa = ? AND papel = ? AND chave = ?").get(empresaId, papel, chave) as { n: number }).n);
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
/** Filtros da tela "Criando Notificação" (Machine): todos opcionais; sem nenhum, vale para todos os destinatários. */
export interface FiltrosPush { corridasMin?: number; corridasMax?: number; cadastroDe?: string; cadastroAte?: string; genero?: string[]; categorias?: string[]; status?: string[] }
export interface PedidoPush { papel: "motorista" | "passageiro"; segmento: Segmento; titulo: string; mensagem: string; usarNome?: boolean; usuario?: string; filtros?: FiltrosPush }

function destinatarios(empresaId: string, papel: "motorista" | "passageiro", segmento: Segmento, usuario = "", filtros?: FiltrosPush): Array<{ chave: string; nome: string }> {
  const proprias = listarProprias(empresaId);
  const chaveDe = (c: (typeof proprias)[number]) => (papel === "motorista" ? c.motoristaId : c.passageiro.telefone.replace(/\D/g, ""));
  const fez = new Set(proprias.map(chaveDe).filter(Boolean) as string[]);
  const finalizadas = new Map<string, number>();
  for (const c of proprias) { const k = chaveDe(c); if (k && c.status === "finalizada") finalizadas.set(k, (finalizadas.get(k) ?? 0) + 1); }
  const f = filtros ?? {};
  const noFiltro = (r: { criadoEm: string; genero?: unknown; categorias?: unknown; status?: unknown }, chave: string) => {
    const qtd = finalizadas.get(chave) ?? 0;
    if (f.corridasMin !== undefined && qtd < f.corridasMin) return false;
    if (f.corridasMax !== undefined && qtd > f.corridasMax) return false;
    const dia = String(r.criadoEm ?? "").slice(0, 10);
    if (f.cadastroDe && dia < f.cadastroDe) return false;
    if (f.cadastroAte && dia > f.cadastroAte) return false;
    if (f.genero?.length && !f.genero.includes(String(r.genero ?? ""))) return false;
    if (f.status?.length && !f.status.includes(String(r.status ?? ""))) return false;
    if (f.categorias?.length) { const tem = String(r.categorias ?? "").split(",").map((x) => x.trim()); if (!f.categorias.some((c) => tem.includes(c))) return false; }
    return true;
  };
  const todos = papel === "motorista"
    ? listar(empresaId, cadastroPorId("motoristas")!).filter((m) => (f.status?.length ? true : m.status === "Ativo") && noFiltro(m, m.id)).map((m) => ({ chave: m.id, nome: String(m.nome ?? "") }))
    : listar(empresaId, cadastroPorId("clientes")!).filter((c) => c.status !== "Bloqueado" && noFiltro(c, String(c.telefone ?? "").replace(/\D/g, ""))).map((c) => ({ chave: String(c.telefone ?? "").replace(/\D/g, ""), nome: String(c.nome ?? "") }));
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

const lista5 = (v: unknown, max = 20) => (Array.isArray(v) ? v.map((x) => texto(x, 40)).filter(Boolean).slice(0, max) : []);
const inteiro = (v: unknown) => (v === "" || v === null || v === undefined || !Number.isFinite(Number(v)) ? undefined : Math.max(0, Math.round(Number(v))));
const diaIso = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : undefined);
export function sanearFiltrosPush(e: unknown): FiltrosPush | undefined {
  const o = (e ?? {}) as Record<string, unknown>;
  const f: FiltrosPush = { corridasMin: inteiro(o.corridasMin), corridasMax: inteiro(o.corridasMax), cadastroDe: diaIso(o.cadastroDe), cadastroAte: diaIso(o.cadastroAte), genero: lista5(o.genero), categorias: lista5(o.categorias), status: lista5(o.status) };
  if (f.corridasMin !== undefined && f.corridasMax !== undefined && f.corridasMin > f.corridasMax) throw new Error("A quantidade mínima de corridas não pode ser maior que a máxima.");
  if (f.cadastroDe && f.cadastroAte && f.cadastroDe > f.cadastroAte) throw new Error("A data inicial do cadastro não pode ser depois da final.");
  const limpo = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && !(Array.isArray(v) && !v.length)));
  return Object.keys(limpo).length ? limpo as FiltrosPush : undefined;
}

export function sanearPedido(e: unknown): PedidoPush {
  const o = (e ?? {}) as Record<string, unknown>;
  const papel = umDe(o.papel, ["motorista", "passageiro"] as const, "passageiro");
  const segmento = umDe(o.segmento, ["todos", "com_corridas", "sem_corridas", "individual"] as const, "todos");
  const titulo = texto(o.titulo, 60), mensagem = texto(o.mensagem, 255);
  if (!mensagem) throw new Error("Preencha a mensagem.");
  if (!titulo && o.tituloOpcional !== true) throw new Error("Preencha o título e a mensagem.");
  const tituloFinal = titulo || "Aviso da central";
  if (segmento === "individual" && !texto(o.usuario, 80)) throw new Error("Escolha o usuário.");
  return { papel, segmento, titulo: tituloFinal, mensagem, usarNome: o.usarNome === true || o.usarNome === "1", usuario: texto(o.usuario, 80), filtros: sanearFiltrosPush(o.filtros) };
}

const personalizar = (t: string, nome: string, usar: boolean, tituloDaMsg: boolean) => {
  const primeiro = nome.trim().split(/\s+/)[0] ?? "";
  if (!usar || !primeiro) return t.replace(/\{nome\}/g, "");
  if (t.includes("{nome}")) return t.replace(/\{nome\}/g, primeiro);
  return tituloDaMsg ? `${primeiro}, ${t.charAt(0).toLowerCase()}${t.slice(1)}` : t;
};

/** Prévia para a confirmação antes de enviar: quantos e quem recebe (nomes dos primeiros 50). */
export function previaDestinatarios(empresaId: string, p: PedidoPush) {
  const alvos = destinatarios(empresaId, p.papel, p.segmento, p.usuario, p.filtros);
  return { total: alvos.length, nomes: alvos.slice(0, 50).map((a) => a.nome) };
}

export async function dispararNotificacao(empresaId: string, p: PedidoPush, por: string, agendamentoId = "") {
  const alvos = destinatarios(empresaId, p.papel, p.segmento, p.usuario, p.filtros);
  if (!alvos.length) throw new Error("Nenhum destinatário neste filtro.");
  // Caixa de notificações do app: só quando é para todos (vale para quem abrir o app depois).
  if (p.segmento === "todos" && !p.filtros) {
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

/** Lista da tela "Notificações app" (Machine): filtros por destinatário, datas, título e mensagem; ordenação por coluna; 10 por página.
 *  Inclui os envios únicos ainda agendados (status "Agendada", data do envio = data marcada). */
export interface FiltroListaNotif { destinatario?: string; dataIni?: string; dataFim?: string; titulo?: string; mensagem?: string; ordem?: string; sentido?: string }
export function listaNotificacoes(empresaId: string, f: FiltroListaNotif, pagina: number) {
  const w = ["empresa = ?"]; const a: Array<string | number> = [empresaId];
  if (f.destinatario === "passageiro" || f.destinatario === "motorista") { w.push("papel = ?"); a.push(f.destinatario); }
  if (f.dataIni) { w.push("substr(em, 1, 10) >= ?"); a.push(f.dataIni); }
  if (f.dataFim) { w.push("substr(em, 1, 10) <= ?"); a.push(f.dataFim); }
  const like = (campo: string, v?: string) => { if (v) { w.push(`${campo} LIKE ? ESCAPE '!'`); a.push(`%${v.replace(/[!%_]/g, "!$&")}%`); } };
  like("titulo", f.titulo); like("mensagem", f.mensagem);
  const linhas = bancoConfig().prepare(`SELECT id, papel, titulo, mensagem, segmento, destinatarios, por, em FROM notificacoes_envios WHERE ${w.join(" AND ")} ORDER BY em DESC, rowid DESC LIMIT 5000`).all(...a) as Array<{ id: string; papel: string; titulo: string; mensagem: string; segmento: string; destinatarios: number; por: string; em: string }>;
  const dest = (p: string) => (p === "motorista" ? "Motorista" : "Cliente App");
  let itens = linhas.map((l) => ({ ...l, agendamentoId: "", destinatario: dest(l.papel), status: "Concluído", criadoEm: l.em, enviadoEm: l.em }));
  const nt = (v: string) => v.toLowerCase();
  for (const g of agendamentos(empresaId)) {
    if (g.regra !== "unico" || g.ultimoEnvio || !g.ativo) continue;
    if (f.destinatario && f.destinatario !== g.papel) continue;
    if (f.dataIni && g.data < f.dataIni) continue;
    if (f.dataFim && g.data > f.dataFim) continue;
    if (f.titulo && !nt(g.titulo).includes(nt(f.titulo))) continue;
    if (f.mensagem && !nt(g.mensagem).includes(nt(f.mensagem))) continue;
    const quando = `${g.data}T${g.hora}:00.000Z`;
    itens.push({ id: g.id, agendamentoId: g.id, papel: g.papel, titulo: g.titulo, mensagem: g.mensagem, segmento: g.segmento, destinatarios: 0, por: "", em: quando, destinatario: dest(g.papel), status: "Agendada", criadoEm: quando, enviadoEm: quando });
  }
  const campos = ["criadoEm", "destinatario", "titulo", "mensagem", "status", "enviadoEm"] as const;
  const campo = campos.find((c) => c === f.ordem);
  if (campo) { const d = f.sentido === "desc" ? -1 : 1; itens = [...itens].sort((x, y) => String(x[campo]).localeCompare(String(y[campo]), "pt-BR") * d); }
  else itens.sort((x, y) => y.em.localeCompare(x.em));
  const total = itens.length;
  const paginas = Math.max(1, Math.ceil(total / 10));
  const p = Math.min(Math.max(1, Math.floor(pagina) || 1), paginas);
  return { total, pagina: p, paginas, itens: itens.slice((p - 1) * 10, p * 10) };
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
