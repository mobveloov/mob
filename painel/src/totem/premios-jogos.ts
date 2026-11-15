// Roleta de Cupom e Raspadinha (Prêmios). Regras puras, sem banco: configuração com padrões, sorteio do prêmio pela
// chance de cada um, agenda dos avisos (dias, hora, até 3 vezes por dia com 6 h entre elas) e código do cupom.
// Usado pelo módulo de prêmios do totem (premios.ts) e pelas telas. Teste: test/totem-premios.test.ts

import crypto from "node:crypto";

export type JogoTipo = "roleta" | "raspadinha";
export type PremioTipo = "percent" | "fixed" | "none";

export interface Premio {
  /** Texto na roleta / embaixo da prata da raspadinha */
  label: string;
  type: PremioTipo;
  /** % (percent) ou R$ (fixed). Ignorado em "none". */
  value: number;
  /** Chance de sair, em % (0 a 100). O que faltar para 100 vira "não ganha nada". */
  chance: number;
  color?: string;
}

export interface ConfigJogo {
  invites_enabled: boolean;
  public_open: boolean;
  title: string;
  message: string;
  button_text: string;
  card_headline: string;
  card_phrase: string;
  color: string;
  prizes: Premio[];
  coupon_valid_days: number;
  schedule_enabled: boolean;
  /** 0 = domingo ... 6 = sábado */
  days: number[];
  send_time: string;
  times_per_day: number;
  every_n_days: number;
}

export const ROTULO_JOGO: Record<JogoTipo, string> = { roleta: "Roleta", raspadinha: "Raspadinha" };

export function configPadrao(kind: JogoTipo): ConfigJogo {
  const roleta = kind === "roleta";
  return {
    invites_enabled: false,
    public_open: true,
    title: roleta ? "Gire e ganhe desconto!" : "Raspe e ganhe!",
    message: roleta ? "Você ganhou um giro na roleta" : "Tem um presente esperando por você",
    button_text: roleta ? "Girar roleta" : "Raspar agora",
    card_headline: roleta ? "Gire e ganhe" : "raspe e ganhe",
    card_phrase: roleta ? "Boa sorte!" : "Tem um presente esperando por você",
    color: "#D4A017",
    prizes: roleta
      ? [
        { label: "10% OFF", type: "percent", value: 10, chance: 5 },
        { label: "Não foi dessa vez", type: "none", value: 0, chance: 0 },
        { label: "5% OFF", type: "percent", value: 5, chance: 10 },
        { label: "15% OFF", type: "percent", value: 15, chance: 4 },
        { label: "R$ 5 OFF", type: "fixed", value: 5, chance: 1 },
      ]
      : [
        { label: "R$ 5 de desconto", type: "fixed", value: 5, chance: 10 },
        { label: "10% de desconto", type: "percent", value: 10, chance: 20 },
        { label: "Não foi dessa vez", type: "none", value: 0, chance: 0 },
      ],
    coupon_valid_days: 3,
    schedule_enabled: false,
    days: [1, 2, 3, 4, 5],
    send_time: roleta ? "14:00" : "10:00",
    times_per_day: 1,
    every_n_days: 1,
  };
}

const limitar = (v: unknown, min: number, max: number, padrao: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao;
};
const texto = (v: unknown, padrao: string, max: number): string => {
  const s = typeof v === "string" ? v.replace(/[<>]/g, "").trim() : "";
  return (s || padrao).slice(0, max);
};

/** Configuração salva -> configuração completa e segura. A soma das chances nunca passa de 100. */
export function normalizarConfig(kind: JogoTipo, raw: unknown): ConfigJogo {
  const d = configPadrao(kind);
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const entrada = Array.isArray(r.prizes) ? r.prizes : d.prizes;
  let orcamento = 100;
  const prizes: Premio[] = [];
  for (const p of entrada.slice(0, 12) as Array<Record<string, unknown>>) {
    const type: PremioTipo = p?.type === "percent" || p?.type === "fixed" ? p.type : "none";
    const value = type === "percent" ? limitar(p?.value, 1, 100, 10) : type === "fixed" ? limitar(p?.value, 0.5, 500, 5) : 0;
    const chance = Math.min(orcamento, limitar(p?.chance, 0, 100, 0));
    orcamento -= chance;
    prizes.push({
      label: texto(p?.label, type === "none" ? "Não foi dessa vez" : type === "percent" ? `${value}% OFF` : `R$ ${value} OFF`, 30),
      type, value, chance: Math.round(chance * 100) / 100,
      ...(typeof p?.color === "string" && /^#[0-9a-f]{6}$/i.test(p.color) ? { color: p.color } : {}),
    });
  }
  const days = Array.isArray(r.days) ? [...new Set((r.days as unknown[]).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort() : d.days;
  const hora = typeof r.send_time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.send_time) ? r.send_time : d.send_time;
  return {
    invites_enabled: r.invites_enabled === true,
    public_open: r.public_open !== false,
    title: texto(r.title, d.title, 40),
    message: texto(r.message, d.message, 255),
    button_text: texto(r.button_text, d.button_text, 20),
    card_headline: texto(r.card_headline, d.card_headline, 40),
    card_phrase: texto(r.card_phrase, d.card_phrase, 80),
    color: typeof r.color === "string" && /^#[0-9a-f]{6}$/i.test(r.color) ? r.color : d.color,
    prizes: prizes.length ? prizes : d.prizes,
    coupon_valid_days: limitar(r.coupon_valid_days, 1, 60, d.coupon_valid_days),
    schedule_enabled: r.schedule_enabled === true,
    days,
    send_time: hora,
    times_per_day: Math.round(limitar(r.times_per_day, 1, 3, 1)),
    every_n_days: Math.round(limitar(r.every_n_days, 1, 30, 1)),
  };
}

/** Quantos, a cada 100 jogadas, ganham cupom e quantos não ganham nada. */
export function resumoDasChances(prizes: Premio[]): { coupon: number; nothing: number } {
  const coupon = prizes.filter((p) => p.type !== "none").reduce((s, p) => s + p.chance, 0);
  return { coupon: Math.round(coupon * 100) / 100, nothing: Math.round((100 - coupon) * 100) / 100 };
}

/**
 * Sorteia o prêmio. `rand` em [0, 1). Devolve o índice sorteado; quando cai na parte que sobra para 100, devolve o
 * primeiro prêmio "none" (ou -1 se não houver nenhum: o jogo mostra "não foi dessa vez").
 */
export function sortearPremio(prizes: Premio[], rand: number): number {
  let acc = 0;
  const r = Math.min(Math.max(rand, 0), 0.999999) * 100;
  for (let i = 0; i < prizes.length; i++) {
    if (prizes[i].type === "none") continue;
    acc += prizes[i].chance;
    if (r < acc) return i;
  }
  return prizes.findIndex((p) => p.type === "none");
}

/** Horários de envio do dia ("HH:MM"), até 3, com 6 h entre eles (sem passar da meia-noite). */
export function horariosDeEnvio(cfg: Pick<ConfigJogo, "send_time" | "times_per_day">): string[] {
  const [h, m] = cfg.send_time.split(":").map(Number);
  const out: string[] = [];
  for (let i = 0; i < cfg.times_per_day; i++) {
    const hh = h + i * 6;
    if (hh > 23) break;
    out.push(`${String(hh).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
  return out;
}

/**
 * Qual horário de envio está vencido agora e ainda não rodou hoje? `dataLocal` "AAAA-MM-DD", `diaSemana` 0-6, `hhmm` hora
 * local. `ultimo` = último horário já feito ("AAAA-MM-DD#i"). Janela de 30 min depois do horário. Devolve o índice
 * (0 = convite, 1-2 = lembretes) ou null.
 */
export function horarioVencido(cfg: ConfigJogo, dataLocal: string, diaSemana: number, hhmm: string, ultimo: string | null): number | null {
  if (!cfg.schedule_enabled || !cfg.invites_enabled || !cfg.days.includes(diaSemana)) return null;
  const emMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const agora = emMin(hhmm);
  const horas = horariosDeEnvio(cfg);
  for (let i = horas.length - 1; i >= 0; i--) {
    const ini = emMin(horas[i]);
    if (agora >= ini && agora < ini + 30) {
      const chave = `${dataLocal}#${i}`;
      if (ultimo && ultimo >= chave) return null;
      return i;
    }
  }
  return null;
}

/** Código do cupom: prefixo + 6 letras/números sem os que confundem (0/O, 1/I). */
export function codigoDoCupom(kind: JogoTipo, rand: () => number = Math.random): string {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += abc[Math.floor(rand() * abc.length) % abc.length];
  return `${kind === "roleta" ? "ROLETA" : "RASPA"}${s}`;
}

/** Primeiro nome em maiúsculas para o cartão da raspadinha ("MARIA,"). */
export function primeiroNome(nome: string | null | undefined): string {
  const n = String(nome ?? "").trim().split(/\s+/)[0] ?? "";
  return n.length >= 2 && n.length <= 20 ? n.toUpperCase() : "";
}

/** Token do convite (vai no link): 40 letras e números hexadecimais. */
export const novoToken = (): string => crypto.randomBytes(20).toString("hex");

/** Número aleatório seguro em [0, 1) para o sorteio. */
export const aleatorioSeguro = (): number => crypto.randomInt(0, 4294967296) / 4294967296;

/** Dia (AAAA-MM-DD) `n` dias antes de `data`. */
export function diasAntes(data: string, n: number): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

// ── Cupom também pelo WhatsApp ──

export const CUPOM_WHATSAPP_PADRAO =
  "🎁 Olá, {nome}! Você ganhou *{premio}* na {origem}.\nSeu cupom: *{cupom}*\nDigite no app na hora de pedir a corrida. Vale uma vez, até {validade}.";

export const ROTULO_ORIGEM: Record<string, string> = { roleta: "Roleta", raspadinha: "Raspadinha", fidelidade: "Cartão Fidelidade", pontos: "troca de pontos" };

/** Texto da mensagem com as variáveis {nome} {premio} {cupom} {validade} {origem}. Sem {cupom} no modelo, ele vai no fim. */
export function textoDoCupom(
  modelo: string | null | undefined,
  v: { nome?: string | null; premio: string; cupom: string; validDays: number; origem: string },
  agora = new Date(),
): string {
  const tpl = (modelo ?? "").trim() || CUPOM_WHATSAPP_PADRAO;
  // validade em dd/mm no horário de Brasília (UTC-3)
  const fim = new Date(agora.getTime() + v.validDays * 86400000 - 3 * 3600000);
  const validade = `${String(fim.getUTCDate()).padStart(2, "0")}/${String(fim.getUTCMonth() + 1).padStart(2, "0")}`;
  const fn = primeiroNome(v.nome ?? "");
  const nome = fn ? fn.charAt(0) + fn.slice(1).toLowerCase() : "tudo bem";
  let out = tpl
    .replace(/\{nome\}/g, nome).replace(/\{premio\}/g, v.premio).replace(/\{cupom\}/g, v.cupom)
    .replace(/\{validade\}/g, validade).replace(/\{origem\}/g, ROTULO_ORIGEM[v.origem] ?? v.origem);
  if (!tpl.includes("{cupom}")) out = `${out}\nCupom: *${v.cupom}*`;
  return out.slice(0, 1000);
}
