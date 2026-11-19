// Pausar / continuar / cancelar os envios do CRM. Módulo puro (sem banco): só decide.
// O estado fica no banco (crm_pausa_geral = pausa da empresa inteira; status da campanha/disparo = pausa de um envio),
// então sobrevive a recarregar o painel e a reiniciar o servidor. Teste: crmPause.test.ts

/** Erro devolvido quando a pausa segurou a mensagem. Não é falha: o item volta para a fila (isWaBusy reconhece). */
export const CRM_PAUSED = "Envios do CRM pausados pelo painel: sai quando você continuar";

export type SendDecision = "send" | "wait" | "stop";
export type PauseKind = "campaign" | "driver";

/**
 * Antes de CADA mensagem (ou lote): manda, espera (pausado, a fila fica intacta) ou para (cancelado/encerrado).
 * `globalPaused` = botão "Pausar todos os envios do CRM" da empresa.
 */
export function sendDecision(o: { kind: PauseKind; itemStatus: string | null | undefined; globalPaused: boolean }): SendDecision {
  const s = String(o.itemStatus ?? "");
  const open = o.kind === "campaign" ? ["running", "scheduled"] : ["queued", "sending"];
  if (s === "paused") return "wait";
  if (!open.includes(s)) return "stop";
  return o.globalPaused ? "wait" : "send";
}

export type PauseAction = "pause" | "resume" | "cancel";

/** O que o botão pode fazer em cada situação (o painel e o servidor usam a mesma regra). */
export function allowedActions(kind: PauseKind, status: string | null | undefined, pending: number): PauseAction[] {
  const s = String(status ?? "");
  if (kind === "campaign") {
    if (s === "running" || s === "scheduled") return pending > 0 ? ["pause", "cancel"] : s === "scheduled" ? ["pause"] : [];
    if (s === "paused") return pending > 0 ? ["resume", "cancel"] : ["resume"];
    return [];
  }
  if (s === "queued" || s === "sending") return ["pause", "cancel"];
  if (s === "paused") return ["resume", "cancel"];
  return [];
}

/** Status ao continuar: única retoma onde parou; recorrente volta a ficar agendada. */
export function resumeStatus(kind: PauseKind, o: { frequency?: string | null; pending: number }): string {
  if (kind === "driver") return o.pending > 0 ? "sending" : "done";
  if (o.frequency && o.frequency !== "once") return "scheduled";
  return o.pending > 0 ? "running" : "completed";
}

export const PAUSE_STATUS_LABEL: Record<string, string> = {
  running: "Enviando", sending: "Enviando", queued: "Na fila", scheduled: "Agendada", paused: "Pausado",
  completed: "Concluído", done: "Concluído", canceled: "Cancelado", failed: "Falhou", draft: "Rascunho",
};

export type PauseTarget = "geral" | "campanha" | "motoristas";
export const PAUSE_ACTION_LABEL: Record<PauseAction, string> = { pause: "pausou", resume: "continuou", cancel: "cancelou" };

// ── Pausa automática da campanha de WhatsApp ──
/** Falhas seguidas de WhatsApp que pausam a campanha sozinha (a fila fica intacta; o dono clica em Continuar). */
export const WA_FAIL_LIMIT = 5;
export const AUTO_PAUSE_USER = "sistema (automático)";

/**
 * `statuses` = últimos envios de WhatsApp da campanha, do mais novo para o mais velho ("sent" | "failed").
 * (13/11/2026) Com o número suspenso, a campanha seguiu tentando: 1.320 falhas seguidas em 10 e 11/11 e outra queimou
 * 445 de 491 destinatários como "falhou". Agora para na 5ª falha seguida e ninguém é perdido.
 */
export function waFailStreak(statuses: string[], limit = WA_FAIL_LIMIT): boolean {
  return statuses.length >= limit && statuses.slice(0, limit).every((s) => s === "failed");
}

/** Mensagem que não saiu porque o WhatsApp está em pausa entre lotes ou no limite por minuto: NÃO é falha, sai depois. */
export const WA_BUSY = "WhatsApp em pausa entre lotes ou no limite por minuto: sai na próxima rodada";
/** Teto diário atingido: também não é falha (sai quando houver vaga). */
const TETO = "Teto diário de WhatsApp do CRM atingido: continua amanhã";
/** O erro é só "espera a vez do WhatsApp"? (o item volta para a fila em vez de virar falha) */
export const isWaBusy = (err: string | null | undefined) => !!err && (err.includes(WA_BUSY) || err.includes(CRM_PAUSED) || err.includes(TETO));
