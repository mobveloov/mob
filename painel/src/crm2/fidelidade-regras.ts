// Cartão Fidelidade (prêmio a cada N corridas) e Pontos de Troca (pontos por corrida, trocados por cupom ou brinde).
// Regras puras, sem banco (copiadas do sistema de referência). Usado por fidelidade.ts (trabalhador do CRM e página do
// passageiro) e pela tela Prêmios. Sem a Machine: não há "área" nem "gerador" de cupom, o cupom vai para o cadastro Cupons.
// Teste: test/crm-fidelidade.test.ts

export type RewardType = "percent" | "fixed";

// ── Cartão Fidelidade ──

export interface LoyaltyCard {
  name: string;
  rides_needed: number;
  reward_type: RewardType;
  reward_value: number;
  /** true = só uma vez na vida; false = de novo a cada N corridas */
  once: boolean;
  active: boolean;
  title: string;
  message: string;
}

export const CARD_TEMPLATES: LoyaltyCard[] = [
  { name: "Começo rápido — 3 corridas", rides_needed: 3, reward_type: "percent", reward_value: 3, once: true, active: false, title: "Você ganhou um presente! 🎁", message: "Obrigado pelas 3 corridas! Seu cupom: {cupom}" },
  { name: "Clássico — 10 corridas", rides_needed: 10, reward_type: "percent", reward_value: 5, once: true, active: false, title: "10 corridas! 🎉", message: "Você completou 10 corridas. Seu cupom de desconto: {cupom}" },
  { name: "Cupom a cada 10 corridas", rides_needed: 10, reward_type: "percent", reward_value: 10, once: false, active: false, title: "Mais um prêmio! 🏆", message: "A cada 10 corridas você ganha. Seu cupom: {cupom}" },
];

const num = (v: unknown, min: number, max: number, def: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const txt = (v: unknown, def: string, max: number) => (typeof v === "string" && v.trim() ? v.trim() : def).slice(0, max);

export function normalizeCard(raw: unknown): LoyaltyCard {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const type: RewardType = r.reward_type === "fixed" ? "fixed" : "percent";
  const rides = Math.round(num(r.rides_needed, 1, 500, 10));
  return {
    name: txt(r.name, `Cartão ${rides} corridas`, 60),
    rides_needed: rides,
    reward_type: type,
    reward_value: type === "percent" ? num(r.reward_value, 1, 100, 5) : num(r.reward_value, 0.5, 500, 5),
    once: r.once !== false,
    active: r.active === true,
    title: txt(r.title, "Você ganhou um presente! 🎁", 40),
    message: txt(r.message, "Seu cupom de desconto: {cupom}", 255),
  };
}

/**
 * A corrida nova (contagem `after`, a partir da ativação do cartão) fecha um marco? `rewarded` = prêmios já dados.
 * Cartão "uma vez": prêmio só quando chega em N e nunca recebeu. Cartão repetido: a cada múltiplo de N.
 */
export function cardRewardDue(card: Pick<LoyaltyCard, "rides_needed" | "once">, after: number, rewarded: number): boolean {
  if (after <= 0 || card.rides_needed <= 0) return false;
  if (card.once) return rewarded === 0 && after >= card.rides_needed;
  return Math.floor(after / card.rides_needed) > rewarded;
}

/** Texto do aviso com o cupom e o desconto no lugar das variáveis. */
export function fillMessage(text: string, vars: { cupom?: string | null; desconto?: string; nome?: string | null }): string {
  return text
    .replace(/\{cupom\}/g, vars.cupom ?? "")
    .replace(/\{desconto\}/g, vars.desconto ?? "")
    .replace(/\{nome\}/g, (vars.nome ?? "").split(" ")[0] ?? "")
    .trim();
}

export const discountLabel = (type: RewardType, value: number) =>
  type === "percent" ? `${value}%` : `R$ ${value.toFixed(2).replace(".", ",")}`;

// ── Pontos de Troca ──

export interface PointsPrize {
  name: string;
  points: number;
  /** pickup = brinde para retirar (gera código, sem cupom); percent/fixed = cupom na hora */
  type: "pickup" | RewardType;
  value: number;
}

export interface PointsConfig {
  enabled: boolean;
  points_per_ride: number;
  point_value: number;
  min_points: number;
  points_expire_days: number;
  coupon_valid_days: number;
  prizes: PointsPrize[];
  whatsapp: string;
  schedule_enabled: boolean;
  days: number[];
  send_time: string;
  title: string;
  message: string;
}

export function defaultPointsConfig(): PointsConfig {
  return {
    enabled: false, points_per_ride: 1, point_value: 0.5, min_points: 10, points_expire_days: 90, coupon_valid_days: 3,
    prizes: [], whatsapp: "",
    schedule_enabled: false, days: [1, 2, 3, 4, 5], send_time: "10:00",
    title: "Seus pontos viraram desconto!", message: "Você já pode trocar seus pontos por desconto na próxima corrida.",
  };
}

export function normalizePointsConfig(raw: unknown): PointsConfig {
  const d = defaultPointsConfig();
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const prizes = (Array.isArray(r.prizes) ? r.prizes : []).slice(0, 12).map((p) => {
    const o = (p ?? {}) as Record<string, unknown>;
    const type = o.type === "percent" || o.type === "fixed" ? o.type : "pickup";
    return {
      name: txt(o.name, "Prêmio", 40),
      points: Math.round(num(o.points, 1, 100000, 10)),
      type,
      value: type === "pickup" ? 0 : type === "percent" ? num(o.value, 1, 100, 10) : num(o.value, 0.5, 500, 5),
    } as PointsPrize;
  });
  const days = Array.isArray(r.days) ? [...new Set((r.days as unknown[]).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort() : d.days;
  return {
    enabled: r.enabled === true,
    points_per_ride: Math.round(num(r.points_per_ride, 1, 100, 1)),
    point_value: Math.round(num(r.point_value, 0.01, 100, 0.5) * 100) / 100,
    min_points: Math.round(num(r.min_points, 1, 100000, 10)),
    points_expire_days: Math.round(num(r.points_expire_days, 7, 730, 90)),
    coupon_valid_days: Math.round(num(r.coupon_valid_days, 1, 60, 3)),
    prizes,
    whatsapp: String(r.whatsapp ?? "").replace(/\D/g, "").slice(0, 13),
    schedule_enabled: r.schedule_enabled === true,
    days,
    send_time: typeof r.send_time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.send_time) ? r.send_time : d.send_time,
    title: txt(r.title, d.title, 40),
    message: txt(r.message, d.message, 255),
  };
}

/** Lançamento de ganho de pontos ainda com saldo. */
export interface EarnRow { id: string; remaining: number; expires_at: string }

/** Saldo válido agora (pontos vencidos não contam). */
export function pointsBalance(rows: EarnRow[], nowMs = Date.now()): number {
  return rows.reduce((s, r) => s + (new Date(r.expires_at).getTime() > nowMs ? Math.max(0, r.remaining) : 0), 0);
}

/**
 * Tira `amount` pontos dos ganhos que vencem primeiro (FIFO por vencimento). Devolve quanto sai de cada lançamento,
 * ou null se o saldo válido não basta.
 */
export function consumePoints(rows: EarnRow[], amount: number, nowMs = Date.now()): Array<{ id: string; take: number }> | null {
  if (amount <= 0) return [];
  const valid = rows.filter((r) => r.remaining > 0 && new Date(r.expires_at).getTime() > nowMs)
    .sort((a, b) => a.expires_at.localeCompare(b.expires_at));
  if (pointsBalance(valid, nowMs) < amount) return null;
  const out: Array<{ id: string; take: number }> = [];
  let left = amount;
  for (const r of valid) {
    if (left <= 0) break;
    const take = Math.min(r.remaining, left);
    out.push({ id: r.id, take });
    left -= take;
  }
  return out;
}

/** Desconto em R$ de uma troca por dinheiro (pontos × valor do ponto), com 2 casas. */
export function pointsToMoney(points: number, pointValue: number): number {
  return Math.round(points * pointValue * 100) / 100;
}

/** Código de retirada do brinde (6 caracteres, sem 0/O e 1/I). */
export function pickupCode(rand: () => number = Math.random): string {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += abc[Math.floor(rand() * abc.length) % abc.length];
  return s;
}
