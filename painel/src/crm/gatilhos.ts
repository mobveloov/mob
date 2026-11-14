// Gatilhos automáticos do CRM (portado de crm-send-campaign/automation.ts do sistema de referência).
//
// Um gatilho liga um EVENTO (cadastro, status da corrida, tempo sem corrida, aniversário...) a um template de mensagem.
// - Evento com atraso: entra na "Fila de Dispatches" (tabela crm_gatilho_fila) e sai na hora marcada. Antes de sair, confere se a
//   situação ainda vale (ex.: ele já pediu a corrida) e, se não vale, cancela sozinho.
// - Evento sem atraso: sai na hora.
// - Gatilhos por tempo (inativo, cadastro sem corrida, aniversário) rodam pelo trabalhador, só dentro do horário de envio.
// Todo envio passa pelas mesmas travas do CRM: descadastro, pausa geral, horário, teto diário e ritmo do WhatsApp.
// Mensagens de acompanhamento da corrida (aceita, chegou, finalizada...) são atendimento: não entram no teto nem no lote.

import crypto from "node:crypto";
import * as Cad from "../cadastros/armazem.ts";
import { cadastroPorId } from "../comum/cadastros.ts";
import { banco } from "../servidor/banco.ts";
import * as D from "../servidor/dados.ts";
import { agoraBr } from "../servidor/util.ts";
import * as A from "./armazem.ts";
import { infoGatilho, MODELOS_GATILHO, TIPOS_GATILHO } from "./catalogo.ts";
import { ouvirEventosCrm, type EventoCrm } from "./eventos.ts";
import { brAgora, dentroDaJanela, enviadosHoje, pausaGeral, tetoHoje } from "./limites.ts";
import { montarTexto } from "./mensagem.ts";
import { waOptOutKey, waPhoneVariants, withOptOutFooter, WA_OPTOUT_SKIP } from "./optout.ts";
import { publico, telefoneWhatsApp } from "./publico.ts";
import { registrar } from "./registro.ts";
import { reservar } from "./ritmo.ts";
import { extractVariables, validateSpinText } from "./spintext.ts";
import { estaDescadastrado, salvarTemplate, template, templates, type Template } from "./templates.ts";
import { provedorDaEmpresa } from "./whatsapp.ts";

export interface Gatilho {
  id: string;
  name: string;
  template_id: string | null;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  send_channel: "whatsapp";
  is_active: boolean;
  fire_count: number;
  last_fired_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Atendimento da corrida: sai na hora e não conta no teto diário de marketing. */
const TRANSACIONAL = new Set(["ride_accepted", "ride_driver_arrived", "ride_in_progress", "ride_completed", "ride_requested"]);
const TEMPO = new Set(["inactive_passenger", "inactivity_recurring", "birthday", "incomplete_signup"]);
const ATRASO_PADRAO: Record<string, number> = { simulated_no_request: 600, ride_not_served: 30, ride_canceled: 180 };
/** Antes de enviar um gatilho atrasado, confere se a situação ainda vale. */
const CANCELA_SE: Record<string, "requested_since" | "ride_since"> = { simulated_no_request: "requested_since", ride_not_served: "ride_since", ride_canceled: "ride_since", ride_canceled_no_car: "ride_since" };

const MAX_TENTATIVAS = 3;
const ESPERA_MS = 2 * 60_000;
const HORA = 3600_000;

// ------------------------------------------------------------------ cadastro de gatilhos

const linha = (r: unknown) => JSON.parse((r as { dados: string }).dados) as Gatilho;

export const gatilhos = (e: string): Gatilho[] =>
  (banco().prepare("SELECT dados FROM crm_gatilhos WHERE empresa = ? ORDER BY seq DESC").all(e) as unknown[]).map(linha);

export function gatilho(e: string, id: string): Gatilho | null {
  const r = banco().prepare("SELECT dados FROM crm_gatilhos WHERE empresa = ? AND id = ?").get(e, id);
  return r ? linha(r) : null;
}

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const txt = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

/** Confere e normaliza o que veio da tela. */
export function sanearGatilho(e: string, corpo: Record<string, unknown>): Pick<Gatilho, "name" | "template_id" | "trigger_type" | "trigger_config" | "send_channel"> {
  const name = txt(corpo.name, 120);
  const template_id = txt(corpo.template_id, 40);
  if (!name || !template_id) throw new Error("Nome e template são obrigatórios");
  if (!template(e, template_id)) throw new Error("Template não encontrado.");
  const trigger_type = String(corpo.trigger_type ?? "");
  if (!TIPOS_GATILHO.some((t) => t.value === trigger_type)) throw new Error("Escolha o evento do gatilho.");
  const c = (corpo.trigger_config ?? {}) as Record<string, unknown>;
  const cfg: Record<string, unknown> = {};
  for (const k of ["days_inactive", "days", "hours", "delay_seconds", "cooldown_hours"]) { const n = num(c[k]); if (n != null) cfg[k] = Math.max(0, Math.round(n)); }
  if (typeof c.hour === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(c.hour)) cfg.hour = c.hour;
  if (c.once_per_contact) cfg.once_per_contact = true;
  if (txt(c.city, 80)) cfg.city = txt(c.city, 80);
  if (c.respect_window) cfg.respect_window = true;
  if (c.respect_daily_cap !== undefined) cfg.respect_daily_cap = !!c.respect_daily_cap;
  return { name, template_id, trigger_type, trigger_config: cfg, send_channel: "whatsapp" };
}

export function salvarGatilho(e: string, id: string | null, d: Pick<Gatilho, "name" | "template_id" | "trigger_type" | "trigger_config" | "send_channel"> & { is_active?: boolean }): Gatilho {
  const agora = new Date().toISOString();
  if (id) {
    const atual = gatilho(e, id);
    if (!atual) throw new Error("Gatilho não encontrado.");
    const novo: Gatilho = { ...atual, ...d, is_active: d.is_active ?? atual.is_active, updated_at: agora };
    banco().prepare("UPDATE crm_gatilhos SET tipo = ?, ativo = ?, dados = ? WHERE empresa = ? AND id = ?").run(novo.trigger_type, novo.is_active ? 1 : 0, JSON.stringify(novo), e, id);
    return novo;
  }
  const novo: Gatilho = { id: crypto.randomUUID().slice(0, 8), fire_count: 0, last_fired_at: null, created_at: agora, updated_at: agora, ...d, is_active: d.is_active ?? true };
  banco().prepare("INSERT INTO crm_gatilhos (empresa, id, tipo, ativo, dados) VALUES (?, ?, ?, ?, ?)").run(e, novo.id, novo.trigger_type, novo.is_active ? 1 : 0, JSON.stringify(novo));
  return novo;
}

export const ligarGatilho = (e: string, id: string): Gatilho => {
  const g = gatilho(e, id);
  if (!g) throw new Error("Gatilho não encontrado.");
  return salvarGatilho(e, id, { ...g, is_active: !g.is_active });
};

export function duplicarGatilho(e: string, id: string): Gatilho {
  const g = gatilho(e, id);
  if (!g) throw new Error("Gatilho não encontrado.");
  return salvarGatilho(e, null, { name: `${g.name} (cópia)`, template_id: g.template_id, trigger_type: g.trigger_type, trigger_config: g.trigger_config, send_channel: g.send_channel, is_active: false });
}

export function apagarGatilho(e: string, id: string): boolean {
  banco().prepare("UPDATE crm_gatilho_fila SET estado = 'canceled', erro = 'Gatilho excluído' WHERE empresa = ? AND gatilho_id = ? AND estado IN ('pending', 'processing')").run(e, id);
  return banco().prepare("DELETE FROM crm_gatilhos WHERE empresa = ? AND id = ?").run(e, id).changes > 0;
}

/** Quantos OUTROS gatilhos usam o mesmo template (editar a mensagem mudaria todos). */
export function usosDoTemplate(e: string, templateId: string, exceto?: string): number {
  return gatilhos(e).filter((g) => g.template_id === templateId && g.id !== exceto).length;
}

/** Edita a mensagem do gatilho: grava no template ligado ou, com `copia`, numa cópia só deste gatilho. Devolve o id do template a usar. */
export function salvarMensagemDoGatilho(e: string, p: { templateId: string; titulo: string; texto: string; copia: boolean; nomeGatilho: string }): string {
  const t = template(e, p.templateId);
  if (!t) throw new Error("Template não encontrado.");
  const conteudo = p.texto.trim();
  if (!conteudo) throw new Error("Escreva a mensagem.");
  if (p.titulo.length > 40) throw new Error("Título com mais de 40 caracteres.");
  const v = validateSpinText(conteudo);
  if (!v.valid) throw new Error(v.errors.join(" "));
  const campos = { title: p.titulo.trim() || null, content: conteudo, variables: extractVariables(conteudo) };
  if (p.copia) {
    const { id: _id, created_at: _c, ...resto } = t;
    return salvarTemplate(e, null, { ...resto, ...campos, name: `${p.nomeGatilho.trim()} · mensagem`, is_active: true }).id;
  }
  salvarTemplate(e, t.id, { ...t, ...campos });
  return t.id;
}

/** Instala os modelos escolhidos (entram desligados). Pula os que já existem pelo nome do template. */
export function instalarModelos(e: string, indices: number[]): { instalados: number; falhas: string[] } {
  const jaTem = new Set(gatilhos(e).map((g) => g.name));
  let instalados = 0;
  const falhas: string[] = [];
  for (const i of indices) {
    const p = MODELOS_GATILHO[i];
    if (!p) continue;
    if (jaTem.has(p.template.name)) { falhas.push(`${p.template.name} (já instalado)`); continue; }
    try {
      const t = salvarTemplate(e, null, { name: p.template.name, category: p.template.category, title: p.template.title, content: p.template.content, variables: extractVariables(p.template.content), is_active: true, image_url: null, button_text: null, button_link: null, variant_b_content: null, ab_split_ratio: 0, wa_optout_footer: false });
      salvarGatilho(e, null, { name: p.template.name, template_id: t.id, trigger_type: p.trigger_type, trigger_config: p.config, send_channel: "whatsapp", is_active: false });
      instalados++;
    } catch { falhas.push(p.template.name); }
  }
  return { instalados, falhas };
}

// ------------------------------------------------------------------ fila de gatilhos (Fila de Dispatches e histórico do gatilho)

export type EstadoFila = "pending" | "processing" | "sent" | "failed" | "skipped" | "canceled";
export interface LinhaFila {
  id: string; gatilho_id: string; telefone: string; nome: string; estado: EstadoFila; sai_em: number | null; criado_em: number; mensagem: string; erro: string; carga: string;
}
const COLS = "id, gatilho_id, telefone, nome, estado, sai_em, criado_em, mensagem, erro, carga";

function inserirFila(e: string, g: Gatilho, tel: string, nome: string | null, p: { estado: EstadoFila; saiEm: number | null; mensagem?: string; erro?: string; carga?: unknown }): string {
  const id = crypto.randomUUID().slice(0, 12);
  banco().prepare("INSERT INTO crm_gatilho_fila (empresa, id, gatilho_id, telefone, nome, estado, sai_em, criado_em, mensagem, erro, carga) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    .run(e, id, g.id, tel, nome ?? "", p.estado, p.saiEm, Date.now(), p.mensagem ?? "", p.erro ?? "", JSON.stringify(p.carga ?? {}));
  return id;
}
const atualizarFila = (e: string, id: string, c: Partial<Pick<LinhaFila, "estado" | "sai_em" | "mensagem" | "erro" | "carga">> & { tomado_em?: number | null }) => {
  const campos = Object.keys(c), vals = Object.values(c);
  if (!campos.length) return;
  banco().prepare(`UPDATE crm_gatilho_fila SET ${campos.map((k) => `${k} = ?`).join(", ")} WHERE empresa = ? AND id = ?`).run(...(vals as Array<string | number | null>), e, id);
};

const chavesDoTelefone = (tel: string) => waPhoneVariants(tel).filter(Boolean);
function jaRecebeu(e: string, gatilhoId: string, tel: string, desde = 0): boolean {
  const v = chavesDoTelefone(tel);
  if (!v.length) return false;
  const r = banco().prepare(`SELECT COUNT(*) AS n FROM crm_gatilho_fila WHERE empresa = ? AND gatilho_id = ? AND estado IN ('sent','pending','processing') AND criado_em >= ? AND telefone IN (${v.map(() => "?").join(",")})`).get(e, gatilhoId, desde, ...v) as { n: number };
  return r.n > 0;
}

// ------------------------------------------------------------------ filtros do gatilho

function passaFiltros(e: string, g: Gatilho, tel: string, cidade: string | undefined): string | null {
  const cfg = g.trigger_config;
  const quer = typeof cfg.city === "string" ? cfg.city.trim() : "";
  if (quer && cidade && A_semAcento(cidade) !== A_semAcento(quer)) return "Fora da cidade do gatilho";
  if (cfg.once_per_contact && jaRecebeu(e, g.id, tel)) return "Já recebeu este gatilho";
  const cd = num(cfg.cooldown_hours);
  if (cd && cd > 0 && jaRecebeu(e, g.id, tel, Date.now() - cd * HORA)) return `Intervalo de ${cd}h ainda não passou`;
  return null;
}
const A_semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

// ------------------------------------------------------------------ envio de um gatilho

const nomeEmpresa = (e: string) => D.marca(e).nomeExibido || D.empresa(e)?.nome || "";

function descadastrado(e: string, tel: string): boolean {
  if (estaDescadastrado(e, tel)) return true;
  const k = waOptOutKey(tel);
  const marcas = A.optOuts(e);
  return Object.keys(marcas).some((c) => c.slice(2) && waOptOutKey(c.slice(2)) === k && k.length >= 10);
}

export interface PedidoEnvio { telefone: string; nome: string | null; vars: Record<string, string>; tentativas?: number }
export type ResultadoGatilho = "sent" | "failed" | "skipped" | "retry";

/** Monta o texto do gatilho para uma pessoa (variáveis {{x}} e SpinText). */
export function montarMensagem(e: string, t: Pick<Template, "title" | "content" | "wa_optout_footer">, nome: string | null, vars: Record<string, string>): string {
  const corpo = montarTexto(t.content, {
    contato: { nome: nome ?? "", cidade: vars.cidade ?? "", diasSemCorrida: vars.dias_sem_corrida ? Number(vars.dias_sem_corrida) : null, corridas: 0 },
    cupom: vars.cupom ?? "", empresa: nomeEmpresa(e), os: vars.os, valor: vars.valor, motorista: vars.motorista,
  });
  return withOptOutFooter(corpo, t.wa_optout_footer);
}

/**
 * Envia agora. Devolve "retry" quando o WhatsApp está ocupado (pausa, teto, lote): o item continua na fila e sai depois.
 * `logId` = linha que já existe na fila (gatilho com atraso).
 */
export async function enviarGatilho(e: string, g: Gatilho, p: PedidoEnvio, logId?: string, agora = Date.now()): Promise<ResultadoGatilho> {
  const cfg = g.trigger_config;
  const digitos = p.telefone.replace(/\D/g, "");
  const gravar = (estado: EstadoFila, c: { mensagem?: string; erro?: string; saiEm?: number | null } = {}) => {
    const campos = { estado, mensagem: c.mensagem ?? "", erro: c.erro ?? "" };
    if (logId) atualizarFila(e, logId, { ...campos, ...(c.saiEm !== undefined ? { sai_em: c.saiEm } : {}) });
    else inserirFila(e, g, digitos, p.nome, { estado, saiEm: c.saiEm ?? null, mensagem: c.mensagem, erro: c.erro, carga: { vars: p.vars, name: p.nome, tentativas: p.tentativas ?? 0 } });
  };
  const t = g.template_id ? template(e, g.template_id) : null;
  if (!t || !t.is_active) { gravar("failed", { erro: "Template inativo ou removido" }); return "failed"; }
  const transacional = TRANSACIONAL.has(g.trigger_type);
  const tel = telefoneWhatsApp(digitos);
  const texto = montarMensagem(e, t, p.nome, p.vars);
  const log = (estado: "sent" | "failed" | "skipped", erro = "") => registrar(e, { origem: "trigger", origem_id: g.id, estado, telefone: tel || digitos, nome: p.nome ?? "", titulo: t.title ?? "", previa: texto, erro });
  const adiar = (motivo: string): ResultadoGatilho => { gravar("pending", { erro: motivo, saiEm: agora + ESPERA_MS }); return "retry"; };

  if (!tel) { gravar("failed", { mensagem: texto, erro: "Telefone inválido." }); log("failed", "Telefone inválido."); return "failed"; }
  if (descadastrado(e, tel)) { gravar("skipped", { erro: WA_OPTOUT_SKIP }); log("skipped", WA_OPTOUT_SKIP); return "skipped"; }
  if (pausaGeral(e).pausado) return adiar("Envios do CRM pausados pelo painel: sai quando você continuar");
  const provedor = provedorDaEmpresa(e);
  const real = provedor.nome === "evolution";
  const respeitaJanela = !!cfg.respect_window || TEMPO.has(g.trigger_type);
  if (real && respeitaJanela && !dentroDaJanela(e)) { gravar("skipped", { erro: "Fora da janela de horário de envio" }); log("skipped", "Fora da janela de horário de envio"); return "skipped"; }
  const respeitaTeto = cfg.respect_daily_cap === undefined ? !transacional : !!cfg.respect_daily_cap;
  if (real && respeitaTeto && enviadosHoje(e, agora) >= tetoHoje(e, agora)) return adiar("Teto diário de WhatsApp do CRM atingido: continua amanhã");
  if (real && !transacional) {
    const res = reservar(A.config(e), A.ritmo(e), agora);
    if (!res.ok) return adiar("WhatsApp em pausa entre lotes ou no limite por minuto: sai na próxima rodada");
    A.salvarRitmo(e, res.estado);
  }
  const envio = await provedor.enviar(tel, texto);
  if (envio.ok) {
    gravar("sent", { mensagem: [t.title, texto].filter(Boolean).join(" — ") });
    log("sent");
    const g2 = gatilho(e, g.id);
    if (g2) banco().prepare("UPDATE crm_gatilhos SET dados = ? WHERE empresa = ? AND id = ?").run(JSON.stringify({ ...g2, fire_count: g2.fire_count + 1, last_fired_at: new Date().toISOString() }), e, g.id);
    return "sent";
  }
  if (envio.temporario && (p.tentativas ?? 0) + 1 < MAX_TENTATIVAS) {
    gravar("pending", { erro: envio.erro, saiEm: agora + ESPERA_MS });
    if (logId) atualizarFila(e, logId, { carga: JSON.stringify({ ...JSON.parse(carga(e, logId) || "{}"), tentativas: (p.tentativas ?? 0) + 1 }) });
    return "retry";
  }
  gravar("failed", { mensagem: texto, erro: envio.erro });
  log("failed", envio.erro);
  return "failed";
}

const carga = (e: string, id: string) => (banco().prepare("SELECT carga FROM crm_gatilho_fila WHERE empresa = ? AND id = ?").get(e, id) as { carga: string } | undefined)?.carga ?? "{}";

// ------------------------------------------------------------------ eventos

/** Quem simulou há pouco (para "simulou e pediu"). Fica só na memória: vale por 1 hora. */
const simulacoes = new Map<string, number>();

/** Evento do passageiro: dispara os gatilhos ligados desse tipo (agora ou com atraso). */
export async function tratarEvento(ev: EventoCrm): Promise<{ disparados: number; agendados: number }> {
  const e = ev.empresaId;
  const tel = ev.telefone.replace(/\D/g, "");
  if (tel.length < 8) return { disparados: 0, agendados: 0 };
  const quando = ev.em ?? Date.now();
  const vars = ev.vars ?? {};
  let disparados = 0, agendados = 0;
  if (ev.tipo === "simulated" || ev.tipo === "simulated_no_request") simulacoes.set(`${e}:${waOptOutKey(tel)}`, quando);
  const lista = gatilhos(e).filter((g) => g.is_active && g.trigger_type === ev.tipo);
  for (const g of lista) {
    if (passaFiltros(e, g, tel, ev.cidade ?? vars.cidade)) continue;
    const cfg = g.trigger_config;
    const atraso = num(cfg.delay_seconds) ?? ((num(cfg.delay_minutes) ?? 0) * 60 || (ATRASO_PADRAO[g.trigger_type] ?? 0));
    if (atraso > 0) {
      inserirFila(e, g, tel, ev.nome ?? null, { estado: "pending", saiEm: quando + atraso * 1000, carga: { v: 2, vars, name: ev.nome ?? null, since: quando, cancelIf: CANCELA_SE[g.trigger_type] ?? null, tentativas: 0 } });
      agendados++;
    } else if (await enviarGatilho(e, g, { telefone: tel, nome: ev.nome ?? null, vars }) === "sent") disparados++;
  }
  // Simulou e pediu: abriu corrida até 1 hora depois de simular.
  if (ev.tipo === "ride_requested") {
    const sim = simulacoes.get(`${e}:${waOptOutKey(tel)}`);
    if (sim && quando - sim <= HORA && quando >= sim) {
      const r = await tratarEvento({ ...ev, tipo: "simulated_and_requested" });
      disparados += r.disparados; agendados += r.agendados;
    }
  }
  return { disparados, agendados };
}

let ligado = false;
/** Liga o motor nos eventos das corridas e do cadastro (uma vez só). */
export function ligarEventos() {
  if (ligado) return;
  ligado = true;
  ouvirEventosCrm((ev) => { void tratarEvento(ev); });
}

// ------------------------------------------------------------------ fila com atraso

/** Ainda vale enviar? (passageiro já pediu / já fez corrida desde o evento) */
function aindaVale(e: string, tel: string, cancelaSe: string | null, desdeMs: number): boolean {
  if (!cancelaSe) return true;
  const v = chavesDoTelefone(tel);
  if (!v.length) return true;
  const desde = new Date(desdeMs - 3 * HORA).toISOString(); // corridas guardam a hora de Brasília como UTC
  const status = cancelaSe === "requested_since" ? null : ["a_caminho", "no_local", "em_andamento", "finalizada"];
  const sql = `SELECT COUNT(*) AS n FROM corridas_proprias WHERE empresa = ? AND solicitada_em > ? AND telefone IN (${v.map(() => "?").join(",")})` + (status ? ` AND status IN (${status.map(() => "?").join(",")})` : "");
  const r = banco().prepare(sql).get(e, desde, ...v, ...(status ?? [])) as { n: number };
  return r.n === 0;
}

/** Fila de gatilhos com atraso: manda o que já está na hora. */
export async function processarAtrasados(e: string, agora = Date.now()): Promise<{ processados: number; cancelados: number }> {
  banco().prepare("UPDATE crm_gatilho_fila SET estado = 'pending', tomado_em = NULL WHERE empresa = ? AND estado = 'processing' AND tomado_em < ?").run(e, agora - 5 * 60_000);
  const prontos = banco().prepare(`SELECT ${COLS} FROM crm_gatilho_fila WHERE empresa = ? AND estado = 'pending' AND sai_em IS NOT NULL AND sai_em <= ? ORDER BY sai_em LIMIT 100`).all(e, agora) as unknown as LinhaFila[];
  let processados = 0, cancelados = 0;
  for (const l of prontos) {
    const tomou = banco().prepare("UPDATE crm_gatilho_fila SET estado = 'processing', tomado_em = ? WHERE empresa = ? AND id = ? AND estado = 'pending'").run(agora, e, l.id).changes;
    if (!tomou) continue;
    try {
      const g = gatilho(e, l.gatilho_id);
      if (!g || !g.is_active) { atualizarFila(e, l.id, { estado: "canceled", erro: "Gatilho desativado" }); cancelados++; continue; }
      const c = JSON.parse(l.carga || "{}") as { vars?: Record<string, string>; name?: string | null; since?: number; cancelIf?: string | null; tentativas?: number };
      const cancelaSe = c.cancelIf ?? CANCELA_SE[g.trigger_type] ?? null;
      if (!aindaVale(e, l.telefone, cancelaSe, c.since ?? l.criado_em)) { atualizarFila(e, l.id, { estado: "canceled", erro: "Passageiro já pediu/fez corrida" }); cancelados++; continue; }
      await enviarGatilho(e, g, { telefone: l.telefone, nome: l.nome || c.name || null, vars: c.vars ?? {}, tentativas: c.tentativas ?? 0 }, l.id, agora);
      processados++;
    } catch (err) {
      atualizarFila(e, l.id, { estado: "failed", erro: err instanceof Error ? err.message : "Erro ao processar" });
    }
  }
  return { processados, cancelados };
}

// ------------------------------------------------------------------ gatilhos por tempo

const ultimaRodadaTempo = new Map<string, number>();

/** Inatividade, cadastro sem corrida e aniversário. Só dentro do horário de envio; no máximo uma vez a cada 5 min por empresa. */
export async function rodarGatilhosDeTempo(e: string, agora = Date.now(), forcar = false): Promise<number> {
  if (!forcar && agora - (ultimaRodadaTempo.get(e) ?? 0) < 5 * 60_000) return 0;
  const lista = gatilhos(e).filter((g) => g.is_active && TEMPO.has(g.trigger_type));
  if (!lista.length) return 0;
  ultimaRodadaTempo.set(e, agora);
  if (provedorDaEmpresa(e).nome === "evolution" && !dentroDaJanela(e)) return 0;
  const { contatos } = await publico(e, "passageiro");
  const porChave = new Map(contatos.map((c) => [waOptOutKey(c.telefone), c]));
  const cadastro = cadastroPorId("clientes");
  const registros = cadastro ? Cad.listar(e, cadastro) : [];
  const br = agoraBr();
  const hoje = br.toISOString().slice(5, 10); // MM-DD
  let enviados = 0;
  for (const g of lista) {
    const cfg = g.trigger_config;
    const alvo: Array<{ telefone: string; nome: string; vars: Record<string, string> }> = [];
    if (g.trigger_type === "inactive_passenger" || g.trigger_type === "inactivity_recurring") {
      const dias = num(cfg.days_inactive) ?? num(cfg.days) ?? (g.trigger_type === "inactive_passenger" ? 30 : 7);
      for (const c of contatos) {
        if (c.optOut || !c.telefone || c.corridas <= 0 || c.diasSemCorrida == null) continue;
        if (c.diasSemCorrida < dias || c.diasSemCorrida > dias + 7) continue; // 7 dias de folga para quem passou do limite fora do horário
        const ultima = c.ultimaCorrida ? Date.parse(c.ultimaCorrida) + 3 * HORA : 0;
        if (jaRecebeu(e, g.id, c.telefone, ultima)) continue; // uma vez por período de inatividade
        alvo.push({ telefone: c.telefone, nome: c.nome, vars: { cidade: c.cidade, dias_sem_corrida: String(c.diasSemCorrida) } });
      }
    } else if (g.trigger_type === "incomplete_signup") {
      const horas = num(cfg.hours) ?? 24;
      for (const r of registros) {
        const tel = String(r.telefone ?? ""), criado = Date.parse(String(r.criadoEm ?? "")) + 3 * HORA;
        if (!tel || !(criado <= agora - horas * HORA) || criado < agora - (horas + 168) * HORA) continue;
        const c = porChave.get(waOptOutKey(tel));
        if (c && (c.corridas > 0 || c.optOut)) continue;
        if (jaRecebeu(e, g.id, tel)) continue;
        alvo.push({ telefone: tel, nome: String(r.nome ?? ""), vars: { cidade: String(r.cidade ?? "") } });
      }
    } else if (g.trigger_type === "birthday") {
      const hora = typeof cfg.hour === "string" ? cfg.hour : "09:00";
      if (brAgora().hhmm < hora) continue;
      const anoComeca = Date.UTC(br.getUTCFullYear(), 0, 1) + 3 * HORA;
      for (const r of registros) {
        const tel = String(r.telefone ?? ""), nasc = String(r.nascimento ?? "");
        if (!tel || nasc.slice(5, 10) !== hoje) continue;
        const c = porChave.get(waOptOutKey(tel));
        if (c?.optOut) continue;
        if (jaRecebeu(e, g.id, tel, anoComeca)) continue; // 1 vez por ano
        alvo.push({ telefone: tel, nome: String(r.nome ?? ""), vars: { cidade: String(r.cidade ?? "") } });
      }
    }
    for (const a of alvo.slice(0, 50)) {
      if (passaFiltros(e, g, a.telefone, a.vars.cidade || undefined)) continue;
      const r = await enviarGatilho(e, g, { telefone: a.telefone, nome: a.nome || null, vars: a.vars });
      if (r === "sent") enviados++;
      if (r === "retry") break; // WhatsApp ocupado: volta na próxima rodada
    }
  }
  return enviados;
}

// ------------------------------------------------------------------ teste e telas

/** Teste do gatilho para um telefone: sai na hora, fora de horário, teto e lote. */
export async function testarGatilho(e: string, id: string, telefone: string): Promise<{ sent: boolean; error?: string }> {
  const g = gatilho(e, id);
  if (!g) throw new Error("Gatilho não encontrado.");
  const t = g.template_id ? template(e, g.template_id) : null;
  if (!t) throw new Error("Este gatilho está sem template.");
  const tel = telefoneWhatsApp(telefone);
  if (!tel) throw new Error("Telefone inválido. Use DDD + número.");
  const texto = montarMensagem(e, t, "Teste", { os: "12345", valor: "25,00", motorista: "Motorista Teste", cupom: "TESTE10", dias_sem_corrida: "15" });
  const r = await provedorDaEmpresa(e).enviar(tel, texto);
  registrar(e, { origem: "manual", origem_id: g.id, estado: r.ok ? "sent" : "failed", telefone: tel, nome: "Teste", titulo: t.title ?? "", previa: texto, erro: r.ok ? "" : r.erro });
  return r.ok ? { sent: true } : { sent: false, error: r.erro };
}

/** Números dos últimos 7 dias por gatilho (e quantos saíram hoje). */
export function estatisticasGatilhos(e: string, agora = Date.now()) {
  const desde = agora - 7 * 86_400_000;
  const hoje = Date.UTC(...(() => { const b = new Date(agora - 3 * HORA); return [b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()] as [number, number, number]; })()) + 3 * HORA;
  const por: Record<string, Record<string, number>> = {};
  const rows = banco().prepare("SELECT gatilho_id AS g, estado AS s, COUNT(*) AS n FROM crm_gatilho_fila WHERE empresa = ? AND criado_em >= ? GROUP BY gatilho_id, estado").all(e, desde) as Array<{ g: string; s: string; n: number }>;
  for (const r of rows) (por[r.g] ??= {})[r.s] = r.n;
  const hojeMap: Record<string, number> = {};
  for (const r of banco().prepare("SELECT origem_id AS g, COUNT(*) AS n FROM crm_envios WHERE empresa = ? AND origem = 'trigger' AND estado = 'sent' AND em >= ? GROUP BY origem_id").all(e, hoje) as Array<{ g: string; n: number }>) hojeMap[r.g] = r.n;
  return { counts: por, today: hojeMap };
}

export const logsDoGatilho = (e: string, id: string, limite = 40) =>
  banco().prepare(`SELECT ${COLS} FROM crm_gatilho_fila WHERE empresa = ? AND gatilho_id = ? ORDER BY criado_em DESC, seq DESC LIMIT ?`).all(e, id, limite) as unknown as LinhaFila[];

export type VisaoFila = "pending" | "processed" | "canceled" | "all";

export function listarFila(e: string, f: { visao: VisaoFila; gatilhoId?: string; busca?: string; pagina?: number; porPagina?: number }) {
  const w = ["empresa = ?", "sai_em IS NOT NULL"], a: Array<string | number> = [e];
  if (f.visao === "pending") w.push("estado IN ('pending','processing')");
  else if (f.visao === "processed") w.push("estado IN ('sent','failed','skipped')");
  else if (f.visao === "canceled") w.push("estado = 'canceled'");
  if (f.gatilhoId) { w.push("gatilho_id = ?"); a.push(f.gatilhoId); }
  const b = String(f.busca ?? "").trim().toLowerCase();
  if (b) { const d = b.replace(/\D/g, ""); w.push(`(lower(nome) LIKE ?${d.length >= 3 ? " OR telefone LIKE ?" : ""})`); a.push(`%${b}%`); if (d.length >= 3) a.push(`%${d}%`); }
  const por = Math.min(200, Math.max(1, f.porPagina ?? 50)), pag = Math.max(0, f.pagina ?? 0);
  const onde = w.join(" AND ");
  const total = (banco().prepare(`SELECT COUNT(*) AS n FROM crm_gatilho_fila WHERE ${onde}`).get(...a) as { n: number }).n;
  const ordem = f.visao === "pending" ? "sai_em ASC, seq ASC" : "criado_em DESC, seq DESC";
  const linhas = banco().prepare(`SELECT ${COLS} FROM crm_gatilho_fila WHERE ${onde} ORDER BY ${ordem} LIMIT ? OFFSET ?`).all(...a, por, pag * por) as unknown as LinhaFila[];
  return { total, linhas };
}

export function estatisticasFila(e: string, agora = Date.now()) {
  const n = (sql: string, ...x: number[]) => (banco().prepare(`SELECT COUNT(*) AS n FROM crm_gatilho_fila WHERE empresa = ? AND sai_em IS NOT NULL AND ${sql}`).get(e, ...x) as { n: number }).n;
  const pending = n("estado IN ('pending','processing')");
  const sent = n("estado = 'sent'"), failed = n("estado = 'failed'"), skipped = n("estado = 'skipped'");
  return { pending, due_1h: n("estado IN ('pending','processing') AND sai_em <= ?", agora + HORA), processed: sent + failed + skipped, sent, failed, canceled: n("estado = 'canceled'"), all: n("1 = 1") };
}

/** Cancela um envio pendente ou manda agora (a próxima rodada do trabalhador pega). */
export function agirNaFila(e: string, id: string, acao: "cancel" | "now"): boolean {
  if (acao === "cancel") return banco().prepare("UPDATE crm_gatilho_fila SET estado = 'canceled', erro = 'Cancelado manualmente no painel' WHERE empresa = ? AND id = ? AND estado = 'pending'").run(e, id).changes > 0;
  return banco().prepare("UPDATE crm_gatilho_fila SET sai_em = ? WHERE empresa = ? AND id = ? AND estado = 'pending'").run(Date.now(), e, id).changes > 0;
}

export { infoGatilho, templates };
