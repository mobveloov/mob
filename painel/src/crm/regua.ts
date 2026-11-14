// Régua de reativação (portado de crm-send-campaign/regua.ts do sistema de referência): avisa por WhatsApp quem parou de pedir
// corrida, por faixa de dias (1, 7, 30, 90 e 365). Limite por dia com aquecimento, horário comercial, envio espalhado e parada
// sozinha quando dá erro. As regras de quem recebe ficam em regua-pura.ts (com teste).
// O número padrão é o do bot de atendimento (o passageiro responde ali e já pede a corrida); opcional: o WhatsApp do CRM.

import { banco } from "../servidor/banco.ts";
import * as D from "../servidor/dados.ts";
import * as A from "./armazem.ts";
import { brAgora, enviadosHoje, inicioDoDiaBr, pausaGeral, type ConfigRegua } from "./limites.ts";
import { waOptOutKey } from "./optout.ts";
import type { Contato } from "./tipos.ts";
import { publico, telefoneWhatsApp } from "./publico.ts";
import { registrar } from "./registro.ts";
import {
  isBotNumber, normalizeTiers, REGUA_PADRAO, reguaBudgetNow, reguaCandidates, reguaDailyCap, reguaGapMs, renderReguaMessage, inReguaWindow, shouldAutoPause,
  type ReguaContato, type ReguaEnvio,
} from "./regua-pura.ts";
import { provedorDaEmpresa } from "./whatsapp.ts";

const DIA = 86_400_000;
const ARQ = "regua.json";

export const CONFIG_REGUA_PADRAO: ConfigRegua = {
  status: "off", message: null, tiers: normalizeTiers(null), max_per_day: REGUA_PADRAO.maxPerDay, warmup_start: REGUA_PADRAO.warmupStart, warmup_step: REGUA_PADRAO.warmupStep,
  warmup_started_at: null, window_start: REGUA_PADRAO.windowStart, window_end: REGUA_PADRAO.windowEnd, days: [...REGUA_PADRAO.days], error_limit: REGUA_PADRAO.errorLimit,
  consecutive_errors: 0, paused_reason: null, last_run_at: null, numero: "crm", repeat_after_days: 15, conexao_id: null,
};

export const configRegua = (e: string): ConfigRegua => ({ ...CONFIG_REGUA_PADRAO, ...A.ler<Partial<ConfigRegua>>(e, ARQ, {}) });
const gravarConfig = (e: string, c: ConfigRegua) => A.gravar(e, ARQ, c);

const clamp = (v: unknown, min: number, max: number, d: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
const hhmmOk = (v: unknown, d: string) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v ?? "")) ? String(v) : d);

// ------------------------------------------------------------------ número de envio

export interface NumeroEnvio {
  id: string | null; tipo: "bot" | "crm"; instance: string | null; phone?: string | null; connected: boolean; pausado: boolean;
  enviar: ((telefone: string, texto: string) => Promise<{ ok: boolean; erro?: string }>) | null;
}

/** Números que a régua pode usar nesta empresa (bot de atendimento e WhatsApp do CRM). */
export async function numerosDaEmpresa(e: string): Promise<NumeroEnvio[]> {
  const out: NumeroEnvio[] = [];
  try {
    const B = await import("../bot/armazem.ts");
    const F = await import("../bot/fluxo.ts");
    const cfg = B.config(e);
    const p = F.provedorDe(e);
    const sit = await p.situacao().catch(() => ({ situacao: "desconectado" }) as { situacao: string });
    const conectado = sit.situacao === "conectado";
    out.push({
      id: "bot", tipo: "bot", instance: p.tipo === "simulado" ? "simulado" : (F.servidorWhatsApp(e).instancia || cfg.instancia || "bot"), phone: null, connected: conectado || p.tipo === "simulado", pausado: cfg.ativo === false,
      enviar: async (t, x) => { try { await p.enviarTexto(t, x); return { ok: true }; } catch (err) { return { ok: false, erro: err instanceof Error ? err.message : "Falha no envio." }; } },
    });
  } catch { /* bot indisponível */ }
  const prov = provedorDaEmpresa(e);
  const pend = await prov.pendencias().catch(() => ["Não consegui falar com o WhatsApp."]);
  out.push({
    id: null, tipo: "crm", instance: prov.nome === "simulado" ? "simulado" : (A.credWhatsApp(e).instancia || "crm"), connected: pend.length === 0, pausado: false,
    enviar: async (t, x) => { const r = await prov.enviar(t, x); return r.ok ? { ok: true } : { ok: false, erro: r.erro }; },
  });
  return out;
}

async function numeroEscolhido(e: string, c: ConfigRegua): Promise<{ n: NumeroEnvio | null; erro?: string }> {
  const lista = await numerosDaEmpresa(e);
  const n = lista.find((x) => (c.numero === "crm" ? x.tipo === "crm" : x.tipo === "bot"));
  if (!n) return { n: null, erro: c.numero === "crm" ? "O WhatsApp do CRM não está configurado. Configure em CRM > WhatsApp e ligue a régua de novo." : "O WhatsApp do bot não está configurado. Conecte em Bot de WhatsApp e ligue a régua de novo." };
  if (!n.connected) return { n, erro: c.numero === "crm" ? "O WhatsApp do CRM está desconectado. Reconecte em CRM > WhatsApp e ligue a régua de novo." : "O WhatsApp do bot está desconectado. Reconecte em Bot de WhatsApp e ligue a régua de novo." };
  return { n };
}

// ------------------------------------------------------------------ painel (status e configuração)

const enviosDaRegua = (e: string, desde: number) => banco().prepare("SELECT instancia, estado, COUNT(*) AS n FROM crm_regua_envios WHERE empresa = ? AND em >= ? GROUP BY instancia, estado").all(e, desde) as Array<{ instancia: string; estado: string; n: number }>;

export async function reguaStatus(e: string, agora = Date.now()) {
  const cfg = configRegua(e);
  const { n: esc, erro } = await numeroEscolhido(e, cfg);
  const cap = reguaDailyCap({ maxPerDay: cfg.max_per_day, warmupStart: cfg.warmup_start, warmupStep: cfg.warmup_step, warmupStartedAtMs: cfg.warmup_started_at ? Date.parse(cfg.warmup_started_at) : null }, agora);
  const hoje = inicioDoDiaBr(agora);
  const por = new Map<string, { sent: number; failed: number }>();
  for (const r of enviosDaRegua(e, hoje)) {
    const o = por.get(r.instancia) ?? { sent: 0, failed: 0 };
    if (r.estado === "sent") o.sent += r.n; else if (r.estado === "failed") o.failed += r.n;
    por.set(r.instancia, o);
  }
  const total = enviadosHoje(e, agora);
  const aquec = cfg.warmup_started_at ? Math.max(0, Math.floor((agora - Date.parse(cfg.warmup_started_at)) / DIA)) + 1 : 1;
  const numeros = (await numerosDaEmpresa(e)).map((n) => {
    const u = por.get(n.instance ?? "") ?? { sent: 0, failed: 0 };
    const escolhido = !!esc && esc.tipo === n.tipo;
    return { id: n.id, tipo: n.tipo, instance: n.instance, phone: n.phone ?? null, connected: n.connected, pausado: n.pausado, escolhido, reguaHoje: u.sent, enviadosHoje: escolhido ? total : u.sent, limite: cap, aquecimentoDia: aquec, erros: u.failed, podeEnviar: n.connected };
  });
  const reguaHoje = [...por.values()].reduce((a, o) => a + o.sent, 0), erros = [...por.values()].reduce((a, o) => a + o.failed, 0);
  return {
    config: cfg,
    numero: { instance: esc?.instance ?? null, connected: !!esc?.connected, provider: esc?.tipo ?? null, isBot: cfg.numero !== "crm", motivo: erro ?? null, botPausado: !!esc?.pausado },
    hoje: { regua: reguaHoje, erros, numeroTodo: total, limite: cap },
    numeros,
  };
}

/** Salva a configuração e/ou liga, pausa e desliga (`status`: on | paused | off). */
export async function reguaSalvar(e: string, b: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const c = configRegua(e);
  const n: ConfigRegua = { ...c };
  if (b.message !== undefined) n.message = String(b.message ?? "").trim().slice(0, 1000) || null;
  if (b.tiers !== undefined) n.tiers = normalizeTiers(b.tiers);
  if (b.maxPerDay !== undefined) n.max_per_day = clamp(b.maxPerDay, 0, 500, REGUA_PADRAO.maxPerDay);
  if (b.warmupStart !== undefined) n.warmup_start = clamp(b.warmupStart, 0, 500, REGUA_PADRAO.warmupStart);
  if (b.warmupStep !== undefined) n.warmup_step = clamp(b.warmupStep, 0, 500, REGUA_PADRAO.warmupStep);
  if (b.windowStart !== undefined) n.window_start = hhmmOk(b.windowStart, REGUA_PADRAO.windowStart);
  if (b.windowEnd !== undefined) n.window_end = hhmmOk(b.windowEnd, REGUA_PADRAO.windowEnd);
  if (Array.isArray(b.days)) n.days = b.days.map(String).filter((d) => ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].includes(d));
  if (b.numero === "bot" || b.numero === "crm") n.numero = b.numero;
  if (b.repeatAfterDays !== undefined) n.repeat_after_days = clamp(b.repeatAfterDays, 0, 365, 15);
  if (b.errorLimit !== undefined) n.error_limit = clamp(b.errorLimit, 1, 20, REGUA_PADRAO.errorLimit);
  const status = typeof b.status === "string" ? b.status : null;
  if (status === "on") {
    const { n: esc, erro } = await numeroEscolhido(e, n);
    if (!esc || erro) return { ok: false, error: erro ?? "Número de envio indisponível." };
    n.status = "on"; n.consecutive_errors = 0;
    // Primeira vez, ou voltando depois de parar por erro: o aquecimento recomeça (poucos por dia, sobe aos poucos).
    if (!c.warmup_started_at || c.paused_reason) n.warmup_started_at = new Date().toISOString();
    n.paused_reason = null;
  } else if (status === "paused") { n.status = "paused"; n.paused_reason = null; }
  else if (status === "off") { n.status = "off"; n.paused_reason = null; }
  gravarConfig(e, n);
  return { ok: true };
}

function pausarPorErro(e: string, motivo: string) {
  const c = configRegua(e);
  if (c.status === "on") gravarConfig(e, { ...c, status: "paused", paused_reason: motivo });
}

// ------------------------------------------------------------------ rodada

export interface OpcoesRegua { /** Só nos testes: público já pronto. */ contatos?: Contato[]; agora?: number; dormir?: (ms: number) => Promise<unknown>; sorteio?: () => number; porRodada?: number }
const dormirReal = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ultimaRodada = new Map<string, number>();

/** Contatos nas faixas ainda sem mensagem, mais recentes primeiro, até juntar `quer`. */
export async function candidatosDaRegua(e: string, c: ConfigRegua, quer: number, agora: number, dados?: Contato[]) {
  const contatos = dados ?? (await publico(e, "passageiro")).contatos;
  const lista: ReguaContato[] = contatos
    .filter((x) => !x.optOut && x.telefone && x.corridas > 0 && x.ultimaCorrida)
    .map((x) => ({ phone: telefoneWhatsApp(x.telefone) || x.telefone.replace(/\D/g, ""), name: x.nome, last_ride_at: new Date(Date.parse(x.ultimaCorrida!) + 3 * 3600_000).toISOString(), total_rides: x.corridas }));
  const envios = (banco().prepare("SELECT telefone, faixa, estado, em FROM crm_regua_envios WHERE empresa = ?").all(e) as Array<{ telefone: string; faixa: number; estado: string; em: number }>)
    .map((r): ReguaEnvio => ({ phone: r.telefone, tier_days: r.faixa, sent_at: new Date(r.em).toISOString(), status: r.estado }));
  return reguaCandidates(lista, envios, normalizeTiers(c.tiers), agora, Number(c.repeat_after_days ?? 0)).slice(0, quer);
}

/** Uma empresa, uma rodada da régua (a cada 5 minutos). Devolve quantas mensagens saíram. */
export async function rodarRegua(e: string, o: OpcoesRegua = {}): Promise<number> {
  const c = configRegua(e);
  if (c.status !== "on") return 0;
  const agora = o.agora ?? Date.now();
  const br = brAgora(new Date(agora - 3 * 3600_000));
  if (!inReguaWindow(br.hhmm, br.dia, { windowStart: c.window_start, windowEnd: c.window_end, days: c.days })) return 0;
  if (pausaGeral(e).pausado) return 0;
  const { n, erro } = await numeroEscolhido(e, c);
  if (!n || erro) { pausarPorErro(e, erro ?? "Número de envio indisponível."); return 0; }
  if (n.pausado) return 0;
  const cap = reguaDailyCap({ maxPerDay: c.max_per_day, warmupStart: c.warmup_start, warmupStep: c.warmup_step, warmupStartedAtMs: c.warmup_started_at ? Date.parse(c.warmup_started_at) : null }, agora);
  const orcamento = reguaBudgetNow({ cap, sentToday: enviadosHoje(e, agora), hhmm: br.hhmm, windowStart: c.window_start, windowEnd: c.window_end, perRun: o.porRodada });
  if (orcamento <= 0) return 0;
  const lista = await candidatosDaRegua(e, c, orcamento, agora, o.contatos);
  const empresa = D.marca(e).nomeExibido || D.empresa(e)?.nome || "";
  let enviados = 0, erros = c.consecutive_errors ?? 0;
  const dormir = o.dormir ?? dormirReal;
  for (let i = 0; i < lista.length; i++) {
    if (i > 0) { const atual = configRegua(e); if (atual.status !== "on") break; } // pausar/desligar vale no meio da rodada
    const x = lista[i];
    const texto = renderReguaMessage(c.message, x.name, empresa);
    const r = await n.enviar!(x.phone, texto);
    const ins = (estado: string, err = "") => banco().prepare("INSERT INTO crm_regua_envios (empresa, telefone, faixa, estado, em, instancia, erro) VALUES (?,?,?,?,?,?,?)").run(e, x.phone, x.tier, estado, Date.now(), n.instance ?? "", err.slice(0, 300));
    ins(r.ok ? "sent" : "failed", r.erro ?? "");
    registrar(e, { origem: "regua", origem_id: "regua", estado: r.ok ? "sent" : "failed", telefone: x.phone, nome: x.name ?? "", previa: texto, erro: r.ok ? "" : (r.erro ?? "Falha no envio."), faixa: x.tier });
    if (r.ok) { enviados++; erros = 0; }
    else {
      erros++;
      if (shouldAutoPause(erros, c.error_limit)) { pausarPorErro(e, `Parou sozinha: ${erros} erros de envio seguidos. Confira o número em CRM > WhatsApp antes de ligar de novo.`); break; }
    }
    if (i < lista.length - 1) await dormir(reguaGapMs(o.sorteio?.()));
  }
  const final = configRegua(e);
  gravarConfig(e, { ...final, consecutive_errors: erros, last_run_at: new Date().toISOString() });
  return enviados;
}

/** Chamada pelo trabalhador a cada volta: a régua só roda a cada 5 minutos por empresa. */
export async function voltaRegua(e: string, agora = Date.now()): Promise<number> {
  if (configRegua(e).status !== "on") return 0;
  if (agora - (ultimaRodada.get(e) ?? 0) < 5 * 60_000) return 0;
  ultimaRodada.set(e, agora);
  return rodarRegua(e, { agora });
}

export { isBotNumber, waOptOutKey };
