// Descadastro do WhatsApp do CRM (portado do sistema de referência, v16.122). Regras de texto, sem banco.
// A parte que grava e consulta fica em optout-banco.ts (SQLite).
export const WA_OPTOUT_FOOTER =
  "Não deseja mais receber nossas mensagens? Responda *NÃO QUERO MAIS* que removeremos seu número da nossa lista de comunicação pelo WhatsApp.";
export const WA_OPTOUT_CONFIRM =
  "Pronto! Seu número foi removido da nossa lista de mensagens promocionais pelo WhatsApp. Você não receberá mais esse tipo de comunicação. Agradecemos pela compreensão! 💛";
/** Motivo gravado no envio pulado (crm_send_logs / fila da campanha). */
export const WA_OPTOUT_SKIP = "Descadastrado do WhatsApp";
/** Janela de "resposta a uma campanha recente" para PARAR / SAIR / CANCELAR. */
export const RECENT_HOURS = 72;
/** Conversa do bot parada há mais que isso não conta como pedido em andamento. */
export const BOT_BUSY_MINUTES = 120;

/** Texto do template com o rodapé de descadastro (uma vez só). */
export function withOptOutFooter(body: string, enabled: boolean | null | undefined): string {
  const b = String(body ?? "").trimEnd();
  if (!enabled || b.includes("NÃO QUERO MAIS")) return b;
  return b ? `${b}\n\n${WA_OPTOUT_FOOTER}` : WA_OPTOUT_FOOTER;
}

function plain(s: string): string {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/([a-z])\1{2,}/g, "$1") // "naaao", "pararrr"
    .replace(/\s+/g, " ").trim()
    .split(" ").map((w) => (w === "naum" || w === "nao" || w === "n" || w === "nn" || w === "num" ? "nao" : w)).join(" ");
}

const POLITE_START = /^(?:(?:ola|oi|bom dia|boa tarde|boa noite|por favor|pfv|pf|pfvr|ok|okay|eu)\s+)+/;
const POLITE_END = /(?:\s+(?:por favor|pfv|pf|pfvr|obrigad[oa]|obg|grat[oa]|valeu|vlw|ok))+$/;

function core(text: string): string {
  return plain(text).replace(POLITE_START, "").replace(POLITE_END, "").trim();
}

const STRONG_EXACT = new Set([
  "stop", "unsubscribe", "parar mensagens", "parar as mensagens", "parar de receber", "sair da lista", "remover da lista",
  "cancelar mensagens", "cancelar as mensagens", "cancelar inscricao", "sair das mensagens", "remover meu numero",
  "nao quero receber", "nao quero mais receber", "nao quero receber mensagens", "nao quero mais mensagens",
  "nao quero mais mensagem", "nao desejo mais receber", "nao quero mais receber mensagens",
]);

const STRONG_RE: RegExp[] = [
  /^nao quero mais(?: (?:receber|mensage(?:m|ns)|nada|isso|nenhuma|promoc(?:ao|oes)))*$/,
  /^(?:(?:eu )?quero )?(?:me )?descad[a-z]*(?: (?:meu numero|o numero|me|por favor))?$/, // descadastrar, descadastra, descadastro
  /^(?:pode )?parar? de (?:me )?(?:mandar|enviar) (?:mensage(?:m|ns)|promoc(?:ao|oes)|propaganda|campanhas?)/,
  /^nao (?:quero|desejo) (?:mais )?receber (?:mensage(?:m|ns)|promoc(?:ao|oes)|propaganda|campanhas?)/,
  /^(?:me )?(?:tira|tire|remove|remova) (?:meu numero )?(?:da|dessa|desta) lista/,
];

/** "não quero mais" sem complemento: no meio de um pedido pode ser sobre a corrida. */
const AMBIGUOUS_RE = /^nao quero mais(?: nada| isso)?$/;

const WEAK_EXACT = new Set(["parar", "pare", "para", "sair", "sai", "cancelar", "cancela", "cancele", "canselar", "cansela"]);

export type OptOutKind = "forte" | "fraca" | null;

/** Que tipo de pedido de descadastro é o texto (null = não é). */
export function waOptOutKind(text: string | null | undefined): OptOutKind {
  const t = core(String(text ?? ""));
  if (!t) return null;
  if (STRONG_EXACT.has(t) || STRONG_RE.some((re) => re.test(t))) return "forte";
  if (WEAK_EXACT.has(t)) return "fraca";
  return null;
}

/**
 * Decide se descadastra. `recentCampaign`: recebeu WhatsApp do CRM nas últimas RECENT_HOURS.
 * `botBusy`: tem pedido no bot ou corrida em andamento.
 */
export function shouldOptOut(text: string | null | undefined, ctx: { recentCampaign: boolean; botBusy: boolean }): boolean {
  const kind = waOptOutKind(text);
  if (kind === "forte") return !(ctx.botBusy && AMBIGUOUS_RE.test(core(String(text ?? ""))));
  if (kind === "fraca") return ctx.recentCampaign && !ctx.botBusy;
  return false;
}

/** Chave do número: DDD + 8 dígitos (sem 55 e sem o 9 do celular), igual para todos os formatos salvos. */
export function waOptOutKey(phone: string | null | undefined): string {
  let d = String(phone ?? "").replace(/\D/g, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11 && d[2] === "9") d = d.slice(0, 2) + d.slice(3);
  return d;
}

/** Formatos em que o número pode estar salvo (com/sem 55, com/sem o 9). */
export function waPhoneVariants(phone: string | null | undefined): string[] {
  const k = waOptOutKey(phone);
  if (!k) return [];
  const d = String(phone ?? "").replace(/\D/g, "");
  const out = new Set<string>([d, d.startsWith("55") && d.length >= 12 ? d.slice(2) : `55${d}`, k, `55${k}`]);
  if (k.length === 10 && /^[6-9]/.test(k[2])) {
    const nine = `${k.slice(0, 2)}9${k.slice(2)}`;
    out.add(nine);
    out.add(`55${nine}`);
  }
  out.delete("");
  return [...out];
}

/** O texto traz o rodapé "NÃO QUERO MAIS" das campanhas? */
export function hasOptOutFooter(body: string | null | undefined): boolean {
  return plain(String(body ?? "")).includes("responda nao quero mais");
}

/** Tira da lista quem está descadastrado do WhatsApp. */
export function splitWaOptOut<T extends { phone: string }>(list: T[], keys: Set<string>): { allowed: T[]; blocked: T[] } {
  const allowed: T[] = [];
  const blocked: T[] = [];
  for (const r of list) (keys.has(waOptOutKey(r.phone)) ? blocked : allowed).push(r);
  return { allowed, blocked };
}

