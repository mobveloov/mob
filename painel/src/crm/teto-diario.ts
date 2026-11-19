// Teto diário de WhatsApp do CRM (13/11/2026, decisão do dono): vale para o número todo, somando campanhas, gatilhos,
// jornadas, comportamental, Simulou e Não Pediu e a régua. Mesmo modelo da régua: começa baixo e sobe aos poucos.
//
// Por que: o WhatsApp suspendeu o número do atendimento por 24 h (09/11) depois de 484 envios em um dia, de uma
// campanha. Suspensão derruba o bot de atendimento. As campanhas só tinham lote + pausa, sem teto por dia.
//
// A configuração é a mesma da régua (crm_regua_config: max_per_day, warmup_start, warmup_step, warmup_started_at),
// editada em CRM › Régua. Regras puras aqui; a leitura do banco fica em crmEngine.ts (DeliveryContext.waCapRoom).
// Teste: waDailyCap.test.ts
import { reguaDailyCap, REGUA_PADRAO } from "./regua-pura.ts";

/** Erro devolvido quando o teto do dia foi atingido. Não é falha: o item volta para a fila e sai quando houver vaga. */
export const WA_DAILY_CAP = "Teto diário de WhatsApp do CRM atingido: continua amanhã";
/** Começo do motivo gravado no histórico de pausas (o reinício automático procura por ele). */
export const CAP_PAUSE_REASON = "Teto diário de WhatsApp atingido";

export interface WaCapConfig {
  max_per_day?: number | null;
  warmup_start?: number | null;
  warmup_step?: number | null;
  warmup_started_at?: string | null;
}

/** Teto de hoje com aquecimento. Sem configuração usa o padrão da régua (8 no primeiro dia, +4 por dia, até 40). */
export function waDailyCapToday(cfg: WaCapConfig | null | undefined, nowMs: number): number {
  const n = (v: unknown, d: number) => (v == null || !Number.isFinite(Number(v)) ? d : Number(v));
  return reguaDailyCap({
    maxPerDay: n(cfg?.max_per_day, REGUA_PADRAO.maxPerDay),
    warmupStart: n(cfg?.warmup_start, REGUA_PADRAO.warmupStart),
    warmupStep: n(cfg?.warmup_step, REGUA_PADRAO.warmupStep),
    warmupStartedAtMs: cfg?.warmup_started_at ? new Date(cfg.warmup_started_at).getTime() : null,
  }, nowMs);
}

/** Vagas que sobram hoje (nunca negativo). */
export function waCapRoomLeft(cap: number, sentToday: number): number {
  return Math.max(0, Math.floor(cap) - Math.max(0, Math.floor(sentToday)));
}

/**
 * Este envio fica de fora da trava? Só o teste manual (botão de teste do painel) e as mensagens de acompanhamento
 * da corrida (corrida aceita, motorista chegou...), que são atendimento e não marketing. Elas contam no total do
 * dia, mas nunca são seguradas.
 */
export function waCapExempt(o: { origin: string; transactional?: boolean }): boolean {
  return o.origin === "manual" || o.transactional === true;
}

/** O WhatsApp é do tipo que o WhatsApp suspende (não oficial)? A Meta oficial não entra no teto. */
export function waCapApplies(provider: string | null | undefined): boolean {
  return !!provider && provider !== "meta_cloud";
}
