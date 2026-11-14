// Mensagens que o passageiro recebe quando o status da corrida muda (central, app do motorista ou painel).
// A empresa pode trocar o texto em Bot de WhatsApp › Mensagens de status; em branco = texto padrão. Portado do sistema de referência.

export interface StatusMessageDef { key: string; label: string; when: string; def: string }

export const STATUS_MESSAGE_DEFS: StatusMessageDef[] = [
  { key: "accepted", label: "Motorista aceitou", when: "O motorista aceitou (os dados do carro vão logo abaixo).", def: "✅ Corrida confirmada! Seu motorista esta a caminho." },
  { key: "driver_changed", label: "Motorista trocado", when: "Outro motorista assumiu a corrida (os dados do novo vão logo abaixo).", def: "\u{1F501} Seu motorista foi trocado! Confira os dados do novo motorista:" },
  { key: "arrived", label: "Chegou no local", when: "O motorista avisou que chegou no embarque.", def: "\u{1F697} Seu motorista chegou ao local de embarque! Procure pelo veiculo." },
  { key: "in_progress", label: "Corrida iniciada", when: "O motorista iniciou a viagem.", def: "\u{1F697} Sua viagem esta em andamento." },
  { key: "completed", label: "Corrida finalizada", when: "O motorista finalizou a viagem.", def: "\u{1F3C1} Sua viagem foi concluida. Obrigado pela preferencia!" },
  { key: "driver_canceled", label: "Motorista desistiu (buscando outro)", when: "O motorista cancelou antes de começar e o painel procura outro.", def: "\u{1F501} Seu motorista cancelou. Estamos procurando um novo motorista para sua corrida. Aguarde." },
  { key: "no_driver", label: "Não atendida", when: "Nenhum motorista aceitou.", def: "\u{1F614} Nao encontramos motorista disponivel para a sua corrida agora.\n\nPara pedir de novo, e so mandar uma mensagem aqui." },
  { key: "canceled_central", label: "Cancelada pela central", when: "A central cancelou a corrida.", def: "❌ Sua corrida foi cancelada pela central.\n\nPara pedir de novo, e so mandar uma mensagem aqui." },
  { key: "canceled", label: "Cancelada", when: "Outros cancelamentos.", def: "❌ Sua corrida foi cancelada." },
];

export const STATUS_MESSAGE_VARS = ["{passageiro}", "{motorista}", "{empresa}"];

export type StatusMessages = Record<string, string>;

/** So os textos personalizados validos (o resto usa o padrao). */
export function normalizeStatusMessages(raw: unknown): StatusMessages {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: StatusMessages = {};
  for (const d of STATUS_MESSAGE_DEFS) {
    const v = typeof r[d.key] === "string" ? (r[d.key] as string).replace(/\r\n/g, "\n").trim().slice(0, 600) : "";
    if (v) out[d.key] = v;
  }
  return out;
}

/** Status da corrida própria do painel -> chave da mensagem. */
export function statusKeyFor(status: string, opts: { driverChanged?: boolean; anterior?: string; canceladaPor?: string } = {}): string | null {
  if (status === "cancelada") return /central|operador|painel/i.test(opts.canceladaPor ?? "") ? "canceled_central" : "canceled";
  if (status === "nao_atendida") return "no_driver";
  if (status === "a_caminho") return opts.driverChanged ? "driver_changed" : "accepted";
  if (status === "no_local") return "arrived";
  if (status === "em_andamento") return "in_progress";
  if (status === "finalizada") return "completed";
  if (status === "procurando") return opts.anterior === "a_caminho" || opts.anterior === "no_local" ? "driver_canceled" : null;
  return null;
}

/** Texto final: o da empresa (ou o padrao) com {passageiro}, {motorista} e {empresa} trocados. */
export function renderStatusMessage(key: string, custom: StatusMessages | null | undefined, vars: { passageiro?: string | null; motorista?: string | null; empresa?: string | null } = {}): string | null {
  const def = STATUS_MESSAGE_DEFS.find((d) => d.key === key);
  if (!def) return null;
  const text = custom?.[key] || def.def;
  return text
    .replace(/\{passageiro\}/gi, (vars.passageiro ?? "").trim() || "passageiro")
    .replace(/\{motorista\}/gi, (vars.motorista ?? "").trim() || "seu motorista")
    .replace(/\{empresa\}/gi, (vars.empresa ?? "").trim() || "nossa central");
}
