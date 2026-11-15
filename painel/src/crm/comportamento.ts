// CRM comportamental (abas Comportamentos, Templates Comportamentais e Histórico de Disparos), portado do sistema de referência.
//
// - Análise: lê os pedidos dos últimos 180 dias e descobre a hora e os dias em que cada passageiro costuma chamar (precisa de 2 pedidos).
//   Roda todo dia às 05:20 (Brasília) e pelo botão "Analisar comportamento".
// - Templates: a mensagem sai ANTES da hora preferida (pré-janela); a 2ª, se houver, sai depois só para quem ainda não fez corrida (meio-janela).
// - Cada pessoa recebe no máximo 1 disparo por template, por dia e por fase (índice único; a linha é gravada ANTES do envio).
// - Motor a cada 10 minutos pelo trabalhador. Só WhatsApp.

import crypto from "node:crypto";
import { buscarCorridas } from "../servidor/fontes/index.ts";
import { banco } from "../servidor/banco.ts";
import { estagioDoContato } from "../crm2/contatos.ts";
import * as Cad from "../cadastros/armazem.ts";
import { cadastroPorId } from "../comum/cadastros.ts";
import * as D from "../servidor/dados.ts";
import { agoraBr } from "../servidor/util.ts";
import * as A from "./armazem.ts";
import { MODELOS_COMPORTAMENTAIS } from "./comportamento-modelos.ts";
import { brClock, cancelRate, phaseOneTarget, type LinhaTemplate } from "./comportamento-puro.ts";
import { descadastrado } from "./gatilhos.ts";
import { enviadosHoje, pausaGeral, tetoHoje } from "./limites.ts";
import { montarTexto } from "./mensagem.ts";
import { chaveDe, montarContatos, telefoneWhatsApp } from "./publico.ts";
import { registrar } from "./registro.ts";
import { reservar } from "./ritmo.ts";
import { validateSpinText } from "./spintext.ts";
import { provedorDaEmpresa } from "./whatsapp.ts";

const DIA = 86_400_000;

// ------------------------------------------------------------------ análise

export interface Preferencia { chave: string; telefone: string; nome: string; hora: number | null; dias: number[]; amostras: number }

/** Hora e dias preferidos a partir dos horários dos pedidos (Brasília). Regra do sistema de referência: precisa de 2 pedidos; dias: até 3, com pelo menos 20% dos pedidos. */
export function preferenciaDe(momentos: Date[]): { hora: number; dias: number[]; amostras: number } | null {
  const n = momentos.length;
  if (n < 2) return null;
  const horas = new Map<number, number>(), dias = new Map<number, number>();
  for (const d of momentos) { horas.set(d.getUTCHours(), (horas.get(d.getUTCHours()) ?? 0) + 1); dias.set(d.getUTCDay(), (dias.get(d.getUTCDay()) ?? 0) + 1); }
  const hora = [...horas.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  const minimo = Math.max(1, Math.ceil(n * 0.2));
  const top = [...dias.entries()].filter(([, c]) => c >= minimo).sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 3).map(([d]) => d);
  return { hora, dias: top, amostras: n };
}

/** Lê as corridas dos últimos 180 dias e grava a hora e os dias preferidos de cada passageiro. Devolve quantos ficaram com preferência. */
export async function analisar(e: string, agora = Date.now()): Promise<number> {
  const br = agoraBr();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const { corridas } = await buscarCorridas(e, { inicio: iso(new Date(br.getTime() - 180 * DIA)), fim: iso(br) });
  const cad = cadastroPorId("clientes");
  const contatos = montarContatos(corridas, "passageiro", br, A.optOuts(e), cad ? Cad.listar(e, cad) : []);
  const momentos = new Map<string, Date[]>();
  for (const c of corridas) {
    if (!c.solicitadaEm) continue;
    const k = chaveDe("passageiro", c.telefonePassageiro ?? "", c.passageiro ?? "");
    if (!k) continue;
    const l = momentos.get(k) ?? [];
    l.push(new Date(c.solicitadaEm));
    momentos.set(k, l);
  }
  const db = banco();
  const ins = db.prepare(`INSERT INTO crm_comportamento (empresa, chave, telefone, nome, hora, dias, amostras, corridas, canceladas, gasto, ultima, estagio, atualizado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT (empresa, chave) DO UPDATE SET telefone = excluded.telefone, nome = excluded.nome, hora = excluded.hora, dias = excluded.dias, amostras = excluded.amostras, corridas = excluded.corridas,
    canceladas = excluded.canceladas, gasto = excluded.gasto, ultima = excluded.ultima, estagio = excluded.estagio, atualizado_em = excluded.atualizado_em`);
  let comPref = 0;
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM crm_comportamento WHERE empresa = ?").run(e);
    for (const c of contatos) {
      const p = preferenciaDe(momentos.get(c.chave) ?? []);
      if (p) comPref++;
      const ultimaMs = c.ultimaCorrida ? Date.parse(c.ultimaCorrida) + 3 * 3600_000 : null;
      ins.run(e, c.chave, c.telefone, c.nome, p?.hora ?? null, JSON.stringify(p?.dias ?? []), p?.amostras ?? 0, c.finalizadas, c.canceladas, c.gasto, ultimaMs, estagioDoContato(ultimaMs, c.finalizadas, agora), agora);
    }
    db.exec("COMMIT");
  } catch (err) { db.exec("ROLLBACK"); throw err; }
  return comPref;
}

/** Números dos gráficos da aba Comportamentos. */
export function visaoComportamento(e: string, agora = Date.now()) {
  const linhas = banco().prepare("SELECT chave, telefone, hora, dias, corridas, canceladas, gasto, ultima, estagio, atualizado_em FROM crm_comportamento WHERE empresa = ?").all(e) as Array<{
    chave: string; telefone: string; hora: number | null; dias: string; corridas: number; canceladas: number; gasto: number; ultima: number | null; estagio: string; atualizado_em: number }>;
  const sims = new Map<string, number>();
  for (const s of banco().prepare("SELECT telefone, MAX(em) AS em FROM crm_simulacoes WHERE empresa = ? GROUP BY telefone").all(e) as Array<{ telefone: string; em: number }>) {
    const k = chaveDe("passageiro", s.telefone, "");
    sims.set(k, Math.max(sims.get(k) ?? 0, s.em));
  }
  const b: Record<string, number> = {};
  const soma = (k: string) => { b[k] = (b[k] ?? 0) + 1; };
  const dias = (ms: number) => (agora - ms) / DIA;
  for (const l of linhas) {
    soma(`stage:${l.estagio}`);
    soma(`rides:${l.corridas === 0 ? "0" : l.corridas === 1 ? "1" : l.corridas <= 4 ? "2_4" : l.corridas <= 9 ? "5_9" : l.corridas <= 19 ? "10_19" : "20"}`);
    soma(`canc:${l.canceladas === 0 ? "0" : l.canceladas === 1 ? "1" : l.canceladas <= 3 ? "2_3" : l.canceladas <= 9 ? "4_9" : "10"}`);
    soma(`spent:${l.gasto === 0 ? "0" : l.gasto < 50 ? "1_49" : l.gasto < 100 ? "50_99" : l.gasto < 300 ? "100_299" : l.gasto < 1000 ? "300_999" : "1000"}`);
    soma(`last:${l.ultima == null ? "nunca" : dias(l.ultima) < 7 ? "0_7" : dias(l.ultima) < 30 ? "8_30" : dias(l.ultima) < 90 ? "31_90" : "90"}`);
    const s = sims.get(l.chave);
    soma(`sim:${s == null ? "nunca" : dias(s) < 1 ? "0_1" : dias(s) < 7 ? "2_7" : dias(s) < 30 ? "8_30" : "30"}`);
    if (l.hora != null) soma(`hour:${l.hora}`);
    for (const d of JSON.parse(l.dias) as number[]) soma(`dow:${d}`);
  }
  return {
    total: linhas.length, with_pref: linhas.filter((l) => l.hora != null).length, finished: linhas.reduce((a, l) => a + l.corridas, 0), canceled: linhas.reduce((a, l) => a + l.canceladas, 0),
    updated_at: linhas.length ? new Date(Math.max(...linhas.map((l) => l.atualizado_em))).toISOString() : null, buckets: b,
  };
}

// ------------------------------------------------------------------ templates

export interface TemplateComportamental extends Omit<LinhaTemplate, "sent_count"> {
  description: string; template_key: string | null; is_active: boolean; sent_count: number; last_run_at: string | null; created_at: string; updated_at: string;
}
const lerT = (r: unknown) => JSON.parse((r as { dados: string }).dados) as TemplateComportamental;

export const templatesComportamentais = (e: string): TemplateComportamental[] =>
  (banco().prepare("SELECT dados FROM crm_comport_templates WHERE empresa = ? ORDER BY seq").all(e) as unknown[]).map(lerT);
export const templateComportamental = (e: string, id: string): TemplateComportamental | null => {
  const r = banco().prepare("SELECT dados FROM crm_comport_templates WHERE empresa = ? AND id = ?").get(e, id);
  return r ? lerT(r) : null;
};

const txt = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const inteiroOuNulo = (v: unknown, min: number, max: number) => (v === null || v === undefined || v === "" ? null : Math.min(max, Math.max(min, Math.round(Number(v)) || 0)));

/** Confere o que veio da tela. Mensagens iguais às do sistema de referência. */
export function sanearComportamental(c: Record<string, unknown>): Omit<TemplateComportamental, "id" | "template_key" | "is_active" | "sent_count" | "last_run_at" | "created_at" | "updated_at"> {
  const name = txt(c.name, 120), body = txt(c.body, 255), title = txt(c.title, 40), segundoCorpo = txt(c.second_body, 255), segundoTitulo = txt(c.second_title, 40);
  if (!name) throw new Error("Dê um nome ao template.");
  if (!body) throw new Error("Escreva a mensagem.");
  if (String(c.title ?? "").length > 40 || String(c.second_title ?? "").length > 40) throw new Error("Título com mais de 40 caracteres.");
  const dias = Array.isArray(c.weekdays) ? [...new Set((c.weekdays as unknown[]).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : [];
  if (!dias.length) throw new Error("Escolha ao menos um dia.");
  const segundoDepois = inteiroOuNulo(c.second_after_minutes, 0, 1440);
  if (segundoDepois && !segundoCorpo) throw new Error("Escreva a 2ª mensagem ou deixe sem 2ª notificação.");
  for (const t of [body, segundoCorpo].filter(Boolean)) { const v = validateSpinText(t); if (!v.valid) throw new Error(v.errors.join(" ")); }
  return {
    name, description: txt(c.description, 200), hour_start: inteiroOuNulo(c.hour_start, 0, 23) ?? 0, hour_end: inteiroOuNulo(c.hour_end, 0, 23) ?? 23, weekdays: dias,
    match_weekday: c.match_weekday !== false, lead_minutes: inteiroOuNulo(c.lead_minutes, 0, 180) ?? 30, min_rides: inteiroOuNulo(c.min_rides, 0, 1000) ?? 0,
    min_inactive_days: inteiroOuNulo(c.min_inactive_days, 0, 3650), max_inactive_days: inteiroOuNulo(c.max_inactive_days, 0, 3650), min_cancel_rate: inteiroOuNulo(c.min_cancel_rate, 0, 100),
    channel: "whatsapp", title: title || null, body, second_after_minutes: segundoDepois || null, second_title: segundoTitulo || null, second_body: segundoDepois ? segundoCorpo : null,
    max_per_run: Math.max(1, inteiroOuNulo(c.max_per_run, 1, 5000) ?? 300),
  };
}

export function salvarComportamental(e: string, id: string | null, d: ReturnType<typeof sanearComportamental>, extra: Partial<TemplateComportamental> = {}): TemplateComportamental {
  const agora = new Date().toISOString();
  if (id) {
    const a = templateComportamental(e, id);
    if (!a) throw new Error("Template não encontrado.");
    const n = { ...a, ...d, ...extra, id, updated_at: agora };
    banco().prepare("UPDATE crm_comport_templates SET dados = ? WHERE empresa = ? AND id = ?").run(JSON.stringify(n), e, id);
    return n;
  }
  const n: TemplateComportamental = { id: crypto.randomUUID().slice(0, 8), template_key: null, is_active: false, sent_count: 0, last_run_at: null, created_at: agora, updated_at: agora, ...d, ...extra };
  banco().prepare("INSERT INTO crm_comport_templates (empresa, id, dados) VALUES (?, ?, ?)").run(e, n.id, JSON.stringify(n));
  return n;
}

export const ligarComportamental = (e: string, id: string) => {
  const t = templateComportamental(e, id);
  if (!t) throw new Error("Template não encontrado.");
  return salvarComportamental(e, id, t, { is_active: !t.is_active });
};
export const apagarComportamental = (e: string, id: string) => {
  banco().prepare("UPDATE crm_comport_disparos SET estado = 'canceled', erro = 'Template excluído' WHERE empresa = ? AND template_id = ? AND estado = 'pending'").run(e, id);
  return banco().prepare("DELETE FROM crm_comport_templates WHERE empresa = ? AND id = ?").run(e, id).changes > 0;
};

/** Instala os modelos escolhidos (entram desativados). */
export function instalarComportamentais(e: string, chaves: string[]): number {
  const ja = new Set(templatesComportamentais(e).map((t) => t.template_key));
  let n = 0;
  for (const k of chaves) {
    const m = MODELOS_COMPORTAMENTAIS.find((x) => x.key === k);
    if (!m || ja.has(k)) continue;
    const { key, emoji, ...resto } = m;
    salvarComportamental(e, null, sanearComportamental(resto), { template_key: key, description: `${emoji} ${m.description}`, is_active: false });
    n++;
  }
  return n;
}

// ------------------------------------------------------------------ envio e motor

const nomeEmpresa = (e: string) => D.marca(e).nomeExibido || D.empresa(e)?.nome || "";

interface Pedido { telefone: string; nome: string; titulo: string; corpo: string; origemId: string }

/** Uma mensagem comportamental: descadastro, pausa geral, teto diário e ritmo do WhatsApp (ignora o horário, como no sistema de referência). */
async function enviarComportamental(e: string, p: Pedido, agora: number): Promise<{ estado: "sent" | "failed" | "skipped"; erro: string; ocupado: boolean }> {
  const tel = telefoneWhatsApp(p.telefone);
  const falha = (estado: "failed" | "skipped", erro: string) => { registrar(e, { origem: "behavior", origem_id: p.origemId, estado, telefone: tel || p.telefone, nome: p.nome, titulo: p.titulo, previa: p.corpo, erro }); return { estado, erro, ocupado: false }; };
  if (!tel) return falha("failed", "Telefone inválido.");
  if (descadastrado(e, tel)) return falha("skipped", "Descadastrado do WhatsApp");
  if (pausaGeral(e).pausado) return { estado: "skipped", erro: "Envios do CRM pausados pelo painel: sai quando você continuar", ocupado: true };
  const prov = provedorDaEmpresa(e);
  if (prov.nome === "evolution") {
    if (enviadosHoje(e, agora) >= tetoHoje(e, agora)) return { estado: "skipped", erro: "Teto diário de WhatsApp do CRM atingido: continua amanhã", ocupado: true };
    const r = reservar(A.config(e), A.ritmo(e), agora);
    if (!r.ok) return { estado: "skipped", erro: "WhatsApp em pausa entre lotes ou no limite por minuto: sai na próxima rodada", ocupado: true };
    A.salvarRitmo(e, r.estado);
  }
  const envio = await prov.enviar(tel, p.corpo);
  registrar(e, { origem: "behavior", origem_id: p.origemId, estado: envio.ok ? "sent" : "failed", telefone: tel, nome: p.nome, titulo: p.titulo, previa: p.corpo, erro: envio.ok ? "" : envio.erro });
  return { estado: envio.ok ? "sent" : "failed", erro: envio.ok ? "" : envio.erro, ocupado: false };
}

const texto = (e: string, corpo: string, nome: string) => montarTexto(corpo, { contato: { nome, cidade: "", diasSemCorrida: null, corridas: 0 }, cupom: "", empresa: nomeEmpresa(e) });

/** Rodada (a cada 10 min): fase 1 (pré-janela) e fase 2 (meio-janela). Devolve quantas saíram. */
export async function rodarComportamento(e: string, agora = Date.now()): Promise<{ sent: number; second: number; skipped: number }> {
  let sent = 0, second = 0, skipped = 0;
  const db = banco();
  const ativos = templatesComportamentais(e).filter((t) => t.is_active);
  const hoje = brClock(agora).date;
  for (const t of ativos) {
    const alvo = phaseOneTarget(agora, t);
    if (!alvo.ok) continue;
    const gente = db.prepare("SELECT telefone, nome, corridas, canceladas, ultima, dias FROM crm_comportamento WHERE empresa = ? AND hora = ? AND corridas >= ?").all(e, alvo.hour, Math.max(0, t.min_rides ?? 0)) as Array<{ telefone: string; nome: string; corridas: number; canceladas: number; ultima: number | null; dias: string }>;
    const lista = gente.filter((p) => {
      if (!p.telefone) return false;
      if (t.match_weekday && !(JSON.parse(p.dias) as number[]).includes(alvo.dow)) return false;
      if (t.min_inactive_days && !(p.ultima != null && p.ultima <= agora - t.min_inactive_days * DIA)) return false;
      if (t.max_inactive_days && !(p.ultima != null && p.ultima >= agora - t.max_inactive_days * DIA)) return false;
      if (t.min_cancel_rate && cancelRate(p.corridas, p.canceladas) < t.min_cancel_rate) return false;
      return true;
    }).slice(0, Math.max(1, t.max_per_run || 300));
    let aqui = 0;
    for (const p of lista) {
      const tel = p.telefone.replace(/\D/g, "");
      const id = crypto.randomUUID().slice(0, 12);
      // Trava: grava antes de enviar; o índice único recusa o segundo disparo do dia.
      const ok = db.prepare("INSERT OR IGNORE INTO crm_comport_disparos (empresa, id, template_id, telefone, nome, fase, estado, hora_pref, agendado_para, dia, criado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
        .run(e, id, t.id, tel, p.nome, "pre_janela", "pending", alvo.hour, agora, hoje, agora).changes;
      if (!ok) continue;
      const r = await enviarComportamental(e, { telefone: tel, nome: p.nome, titulo: t.title ?? "", corpo: texto(e, t.body, p.nome), origemId: t.id }, agora);
      if (r.ocupado) { db.prepare("DELETE FROM crm_comport_disparos WHERE empresa = ? AND id = ?").run(e, id); break; } // solta a trava: a próxima rodada tenta de novo
      db.prepare("UPDATE crm_comport_disparos SET estado = ?, enviado_em = ?, erro = ? WHERE empresa = ? AND id = ?").run(r.estado, r.estado === "sent" ? Date.now() : null, r.erro, e, id);
      if (r.estado === "sent") {
        sent++; aqui++;
        if (t.second_after_minutes && t.second_body) {
          db.prepare("INSERT OR IGNORE INTO crm_comport_disparos (empresa, id, template_id, telefone, nome, fase, estado, hora_pref, agendado_para, dia, criado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
            .run(e, crypto.randomUUID().slice(0, 12), t.id, tel, p.nome, "meio_janela", "pending", alvo.hour, agora + t.second_after_minutes * 60_000, hoje, agora);
        }
      } else if (r.estado === "skipped") skipped++;
    }
    salvarComportamental(e, t.id, t, { last_run_at: new Date(agora).toISOString(), sent_count: (t.sent_count ?? 0) + aqui });
  }

  // Fase 2: só quem ainda não fez corrida depois da 1ª mensagem.
  const devidos = db.prepare("SELECT id, template_id, telefone, nome, agendado_para FROM crm_comport_disparos WHERE empresa = ? AND estado = 'pending' AND fase = 'meio_janela' AND agendado_para <= ? LIMIT 300").all(e, agora) as Array<{ id: string; template_id: string; telefone: string; nome: string; agendado_para: number }>;
  const porId = new Map(ativos.map((t) => [t.id, t]));
  for (const d of devidos) {
    const t = porId.get(d.template_id);
    if (!t || !t.second_body) { db.prepare("UPDATE crm_comport_disparos SET estado = 'canceled', erro = 'Template desativado ou sem 2ª mensagem' WHERE empresa = ? AND id = ?").run(e, d.id); continue; }
    const desde = d.agendado_para - (t.second_after_minutes ?? 0) * 60_000;
    const c = db.prepare("SELECT ultima FROM crm_comportamento WHERE empresa = ? AND chave = ?").get(e, chaveDe("passageiro", d.telefone, d.nome)) as { ultima: number | null } | undefined;
    const fezCorrida = (c?.ultima ?? 0) > desde || temCorridaDepois(e, d.telefone, desde);
    if (fezCorrida) { db.prepare("UPDATE crm_comport_disparos SET estado = 'skipped', erro = 'Já fez corrida depois da 1ª mensagem' WHERE empresa = ? AND id = ?").run(e, d.id); skipped++; continue; }
    if (!db.prepare("UPDATE crm_comport_disparos SET estado = 'processing' WHERE empresa = ? AND id = ? AND estado = 'pending'").run(e, d.id).changes) continue;
    const r = await enviarComportamental(e, { telefone: d.telefone, nome: d.nome, titulo: t.second_title ?? "", corpo: texto(e, t.second_body, d.nome), origemId: t.id }, agora);
    if (r.ocupado) { db.prepare("UPDATE crm_comport_disparos SET estado = 'pending' WHERE empresa = ? AND id = ?").run(e, d.id); break; }
    db.prepare("UPDATE crm_comport_disparos SET estado = ?, enviado_em = ?, erro = ? WHERE empresa = ? AND id = ?").run(r.estado, r.estado === "sent" ? Date.now() : null, r.erro, e, d.id);
    if (r.estado === "sent") second++;
  }
  return { sent, second, skipped };
}

/** Corrida pedida depois de `desdeMs` (as corridas guardam a hora de Brasília como UTC). */
function temCorridaDepois(e: string, telefone: string, desdeMs: number): boolean {
  const k = telefone.replace(/\D/g, "").slice(-11);
  if (k.length < 8) return false;
  const r = banco().prepare("SELECT COUNT(*) AS n FROM corridas_proprias WHERE empresa = ? AND solicitada_em > ? AND telefone LIKE ?").get(e, new Date(desdeMs - 3 * 3600_000).toISOString(), `%${k}`) as { n: number };
  return r.n > 0;
}

const ultima = new Map<string, number>();
const ultimaAnalise = new Map<string, string>();

/** Chamada pelo trabalhador: motor a cada 10 min e análise diária depois das 05:20 (Brasília). */
export async function voltaComportamento(e: string, agora = Date.now()): Promise<void> {
  const b = brClock(agora);
  if (b.hour * 60 + b.minute >= 5 * 60 + 20 && ultimaAnalise.get(e) !== b.date && templatesComportamentais(e).some((t) => t.is_active)) {
    ultimaAnalise.set(e, b.date);
    await analisar(e, agora);
  }
  if (agora - (ultima.get(e) ?? 0) < 10 * 60_000) return;
  ultima.set(e, agora);
  if (templatesComportamentais(e).some((t) => t.is_active)) await rodarComportamento(e, agora);
}

// ------------------------------------------------------------------ histórico

export interface FiltroDisparos { de: number; fase?: string; estado?: string; template?: string; pagina?: number }

export function historicoComportamental(e: string, f: FiltroDisparos) {
  const w = ["empresa = ?", "criado_em >= ?"], a: Array<string | number> = [e, f.de];
  if (f.fase) { w.push("fase = ?"); a.push(f.fase); }
  if (f.estado) { w.push("estado = ?"); a.push(f.estado); }
  if (f.template) { w.push("template_id = ?"); a.push(f.template); }
  const onde = w.join(" AND ");
  const db = banco();
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM crm_comport_disparos WHERE ${onde}`).get(...a) as { n: number }).n;
  const linhas = db.prepare(`SELECT id, template_id, telefone, nome, fase, estado, hora_pref, agendado_para, enviado_em, erro, criado_em FROM crm_comport_disparos WHERE ${onde} ORDER BY criado_em DESC, seq DESC LIMIT 50 OFFSET ?`).all(...a, Math.max(0, f.pagina ?? 0) * 50);
  const cont = (col: string) => Object.fromEntries((db.prepare(`SELECT ${col} AS k, COUNT(*) AS n FROM crm_comport_disparos WHERE empresa = ? AND criado_em >= ? GROUP BY ${col}`).all(e, f.de) as Array<{ k: string; n: number }>).map((r) => [r.k, r.n]));
  const by_phase = cont("fase"), by_status = cont("estado");
  return { total, linhas, stats: { total: Object.values(by_phase).reduce((x, y) => x + y, 0), by_phase, by_status }, nomes: templatesComportamentais(e).map((t) => ({ id: t.id, name: t.name })) };
}

/** Teste do template: sai na hora para um telefone, fora de horário, teto e ritmo. */
export async function testarComportamental(e: string, id: string, telefone: string): Promise<{ sent: boolean; error?: string }> {
  const t = templateComportamental(e, id);
  if (!t) throw new Error("Template não encontrado.");
  const tel = telefoneWhatsApp(telefone);
  if (!tel) throw new Error("Telefone inválido. Use DDD + número.");
  const corpo = texto(e, t.body, "Teste");
  const r = await provedorDaEmpresa(e).enviar(tel, corpo);
  registrar(e, { origem: "manual", origem_id: t.id, estado: r.ok ? "sent" : "failed", telefone: tel, nome: "Teste", titulo: t.title ?? "", previa: corpo, erro: r.ok ? "" : r.erro });
  return r.ok ? { sent: true } : { sent: false, error: r.erro };
}

