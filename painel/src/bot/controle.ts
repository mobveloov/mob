// Comandos digitados pela central no proprio WhatsApp do bot (mensagem "fromMe" dentro da conversa de um contato).
// Bloquear: o contato nao consegue mais pedir corrida pelo bot (so conversa normal no chat, ex.: central x motorista).
// Pausar: o bot fica quieto com aquele contato por X minutos (atendimento humano) e depois volta sozinho.
// Configuracao em Bot de WhatsApp › Comandos da central. Modulo puro. Portado do sistema de referência.

export interface BotControlConfig {
  blockWord: string;
  unblockWord: string;
  pauseWord: string;
  resumeWord: string;
  pauseMinutes: number;
}

export const DEFAULT_BOT_CONTROL: BotControlConfig = {
  blockWord: "#bloquear",
  unblockWord: "#desbloquear",
  pauseWord: "#pausar",
  resumeWord: "#voltar",
  pauseMinutes: 60,
};

const clean = (v: unknown, def: string): string => {
  const s = String(v ?? "").trim().toLowerCase().slice(0, 30);
  return s.length >= 2 ? s : def;
};

export function normalizeBotControl(raw: unknown): BotControlConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const mins = Math.round(Number(r.pauseMinutes));
  return {
    blockWord: clean(r.blockWord, DEFAULT_BOT_CONTROL.blockWord),
    unblockWord: clean(r.unblockWord, DEFAULT_BOT_CONTROL.unblockWord),
    pauseWord: clean(r.pauseWord, DEFAULT_BOT_CONTROL.pauseWord),
    resumeWord: clean(r.resumeWord, DEFAULT_BOT_CONTROL.resumeWord),
    pauseMinutes: Number.isFinite(mins) && mins >= 1 && mins <= 1440 ? mins : DEFAULT_BOT_CONTROL.pauseMinutes,
  };
}

export type BotCommand = "block" | "unblock" | "pause" | "resume";

/** A mensagem inteira e um comando? (so a palavra, sem diferenca de maiuscula/acento/espaco/ponto) */
export function parseBotCommand(text: string | null | undefined, cfg: BotControlConfig): BotCommand | null {
  const t = String(text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/[.!]+$/, "");
  if (!t) return null;
  const n = (w: string) => w.normalize("NFD").replace(/[̀-ͯ]/g, "");
  // desbloquear antes de bloquear (uma palavra pode conter a outra)
  if (t === n(cfg.unblockWord)) return "unblock";
  if (t === n(cfg.blockWord)) return "block";
  if (t === n(cfg.resumeWord)) return "resume";
  if (t === n(cfg.pauseWord)) return "pause";
  return null;
}

/**
 * Comando com o numero do contato ("#bloquear 16 99293-0774"), para digitar na conversa com voce mesmo (ou em
 * qualquer conversa) sem o contato ver nada. Devolve o comando e o numero com DDI 55, ou null.
 */
export function parseBotCommandWithPhone(text: string | null | undefined, cfg: BotControlConfig): { cmd: BotCommand; phone: string } | null {
  const raw = String(text ?? "").trim();
  const m = raw.match(/^(\S+)\s+([+\d][\d\s().-]{8,20})$/);
  if (!m) return null;
  const cmd = parseBotCommand(m[1], cfg);
  if (!cmd) return null;
  let digits = m[2].replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  if (!/^55\d{10,11}$/.test(digits)) return null;
  return { cmd, phone: digits };
}

/** Numero brasileiro com e sem o 9 do celular (o WhatsApp de contas antigas usa o formato sem o 9). */
export function brPhoneVariants(phone: string): string[] {
  const d = phone.replace(/\D/g, "");
  const out = new Set([d]);
  const m = d.match(/^55(\d{2})(\d{8,9})$/);
  if (m) {
    const [, ddd, num] = m;
    if (num.length === 9 && num.startsWith("9")) out.add(`55${ddd}${num.slice(1)}`);
    if (num.length === 8 && /^[6-9]/.test(num)) out.add(`55${ddd}9${num}`);
  }
  return [...out];
}

/** O bot deve ficar quieto com este contato agora? */
export function botSilencedFor(conv: { blocked?: boolean | null; paused_until?: string | null } | null | undefined, nowMs = Date.now()): "blocked" | "paused" | null {
  if (!conv) return null;
  if (conv.blocked) return "blocked";
  if (conv.paused_until && new Date(conv.paused_until).getTime() > nowMs) return "paused";
  return null;
}

// ── Atendimento de suporte pelo numero do bot (sem um ver o numero do outro) ──

/** Codigo curto do atendimento (para o atendente responder a um passageiro especifico quando ha mais de um). */
export function supportCode(convId: string): string {
  return String(convId ?? "").replace(/[^0-9a-f]/gi, "").slice(0, 4).toUpperCase() || "0000";
}

/** "A1B2 texto" ou "#A1B2 texto": resposta para um atendimento especifico. */
export function parseSupportReply(text: string, codes: string[]): { code: string | null; body: string } {
  const m = String(text ?? "").trim().match(/^#?([0-9a-f]{4})\b[\s:,-]*([\s\S]*)$/i);
  if (m && codes.includes(m[1].toUpperCase()) && m[2].trim()) return { code: m[1].toUpperCase(), body: m[2].trim() };
  return { code: null, body: String(text ?? "").trim() };
}
