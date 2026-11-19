// Opções do pedido da corrida (pesquisa "Alguma preferência para esta corrida?"): preferências (extras + filtros da
// central), ida e volta, parada no caminho, cupom, motorista de confiança e recado para o motorista.
// A empresa liga cada opção em Bot › Ajustes › Opções do pedido; o passageiro escolhe no bot (o totem fica sem essas
// perguntas, para ser rápido); a escolha vai para a corrida própria (observação, cupom, parada e informação ao motorista).
// Módulo puro (sem banco): testado em test/bot-opcoes-pedido.test.ts. Copiado do sistema de referência.

export const PREF_KEYS = [
  "motorista_mulher",
  "aceita_animais",
  "porta_malas_grande",
  "adaptado_cadeirante",
  "aceita_encomendas",
  "veiculo_a_disposicao",
] as const;
export type PrefKey = typeof PREF_KEYS[number];

export const FILTER_KEYS = ["filtro_1", "filtro_2", "filtro_3", "filtro_4", "filtro_5", "filtro_6"] as const;
export type FilterKey = typeof FILTER_KEYS[number];
export type ExtraKey = PrefKey | FilterKey;

export const PREF_LABELS: Record<PrefKey, string> = {
  motorista_mulher: "Motorista mulher",
  aceita_animais: "Aceita animal de estimação",
  porta_malas_grande: "Porta-malas grande",
  adaptado_cadeirante: "Carro adaptado para cadeirante",
  aceita_encomendas: "Levar encomenda",
  veiculo_a_disposicao: "Carro à disposição (motorista espera)",
};

/** Opcoes que pedem um texto do passageiro. */
export type InputKey = "cupom" | "parada" | "favorito" | "recado";
export const INPUT_LABELS: Record<InputKey | "retorno", string> = {
  retorno: "Ida e volta",
  parada: "Parada no caminho",
  cupom: "Tenho cupom de desconto",
  favorito: "Motorista de confiança",
  recado: "Recado para o motorista",
};

export interface RideOptionsConfig {
  /** Mostrar as opcoes no bot do WhatsApp. */
  bot: boolean;
  prefs: Record<PrefKey, boolean>;
  /** Filtros proprios da central (nomes definidos pela central, ex.: "Ar-condicionado"). */
  filters: Array<{ key: FilterKey; label: string; enabled: boolean }>;
  retorno: boolean;
  parada: boolean;
  cupom: boolean;
  favorito: boolean;
  recado: boolean;
}


const bool = (v: unknown) => v === true;

export function normalizeRideOptionsConfig(raw: unknown): RideOptionsConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const prefsRaw = (r.prefs && typeof r.prefs === "object" ? r.prefs : {}) as Record<string, unknown>;
  const filtersRaw = Array.isArray(r.filters) ? r.filters as Array<Record<string, unknown>> : [];
  return {
    bot: bool(r.bot),
    prefs: Object.fromEntries(PREF_KEYS.map((k) => [k, bool(prefsRaw[k])])) as Record<PrefKey, boolean>,
    filters: FILTER_KEYS.map((key) => {
      const f = filtersRaw.find((x) => x?.key === key);
      const label = typeof f?.label === "string" ? f.label.trim().slice(0, 40) : "";
      return { key, label, enabled: bool(f?.enabled) && label !== "" };
    }),
    retorno: bool(r.retorno),
    parada: bool(r.parada),
    cupom: bool(r.cupom),
    favorito: bool(r.favorito),
    recado: bool(r.recado),
  };
}

export interface OptionItem {
  key: ExtraKey | InputKey | "retorno";
  label: string;
  /** Precisa de um texto do passageiro depois de escolhida. */
  input: InputKey | null;
}

/** Opcoes ligadas pela empresa, na ordem em que aparecem para o passageiro. */
export function enabledOptions(c: RideOptionsConfig): OptionItem[] {
  const out: OptionItem[] = [];
  for (const k of PREF_KEYS) if (c.prefs[k]) out.push({ key: k, label: PREF_LABELS[k], input: null });
  for (const f of c.filters) if (f.enabled) out.push({ key: f.key, label: f.label, input: null });
  if (c.retorno) out.push({ key: "retorno", label: INPUT_LABELS.retorno, input: null });
  if (c.parada) out.push({ key: "parada", label: INPUT_LABELS.parada, input: "parada" });
  if (c.cupom) out.push({ key: "cupom", label: INPUT_LABELS.cupom, input: "cupom" });
  if (c.favorito) out.push({ key: "favorito", label: INPUT_LABELS.favorito, input: "favorito" });
  if (c.recado) out.push({ key: "recado", label: INPUT_LABELS.recado, input: "recado" });
  return out;
}

export function hasAnyOption(c: RideOptionsConfig): boolean {
  return enabledOptions(c).length > 0;
}

export interface FavoriteDriver {
  /** Tipo de identificação: P = placa, T = telefone, V = numero da viatura. */
  tipo: "P" | "T" | "V";
  valor: string;
}

export interface RideChoices {
  extras?: Partial<Record<ExtraKey, true>>;
  retorno?: true;
  parada?: string;
  cupom?: string;
  favorito?: FavoriteDriver;
  recado?: string;
}

/** Cupom: letras e numeros, maiusculas, 3 a 30 caracteres. */
export function normalizeCoupon(text: unknown): string | null {
  const s = String(text ?? "").toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  return s.length >= 3 && s.length <= 30 ? s : null;
}

/** Motorista de confianca a partir do que o passageiro digitou: placa, telefone ou numero da viatura. */
export function parseFavoriteDriver(text: unknown): FavoriteDriver | null {
  const raw = String(text ?? "").trim().toUpperCase();
  const plate = raw.replace(/[\s-]/g, "");
  if (/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(plate)) return { tipo: "P", valor: plate };
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 10 && digits.length <= 13 && digits.length === raw.replace(/[\s()+.-]/g, "").length) {
    const local = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
    return { tipo: "T", valor: local };
  }
  if (/^\d{1,6}$/.test(raw.replace(/\s/g, ""))) return { tipo: "V", valor: raw.replace(/\s/g, "") };
  return null;
}

const cleanText = (v: unknown, max: number) => {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
};

/** Mantem so as escolhas que a empresa ligou e com valores validos. Nunca lanca erro. */
export function sanitizeChoices(raw: unknown, c: RideOptionsConfig): RideChoices {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: RideChoices = {};
  const ex = (r.extras && typeof r.extras === "object" ? r.extras : {}) as Record<string, unknown>;
  const extras: Partial<Record<ExtraKey, true>> = {};
  for (const k of PREF_KEYS) if (c.prefs[k] && ex[k] === true) extras[k] = true;
  for (const f of c.filters) if (f.enabled && ex[f.key] === true) extras[f.key] = true;
  if (Object.keys(extras).length) out.extras = extras;
  if (c.retorno && r.retorno === true) out.retorno = true;
  if (c.parada) { const p = cleanText(r.parada, 150); if (p) out.parada = p; }
  if (c.cupom) { const cp = normalizeCoupon(r.cupom); if (cp) out.cupom = cp; }
  if (c.favorito && r.favorito && typeof r.favorito === "object") {
    const f = r.favorito as Record<string, unknown>;
    const parsed = parseFavoriteDriver(f.valor);
    if (parsed && (f.tipo === undefined || f.tipo === parsed.tipo)) out.favorito = parsed;
  }
  if (c.recado) { const n = cleanText(r.recado, 140); if (n) out.recado = n; }
  return out;
}

export function isEmptyChoices(ch: RideChoices | null | undefined): boolean {
  return !ch || Object.keys(ch).length === 0;
}

/** Resumo curto das escolhas (confirmacao ao passageiro, painel, recado ao motorista no modo manual). */
export function describeChoices(ch: RideChoices, c: RideOptionsConfig): string[] {
  const lines: string[] = [];
  for (const k of Object.keys(ch.extras ?? {}) as ExtraKey[]) {
    const label = (PREF_LABELS as Record<string, string>)[k] ?? c.filters.find((f) => f.key === k)?.label ?? k;
    lines.push(label);
  }
  if (ch.retorno) lines.push(INPUT_LABELS.retorno);
  if (ch.parada) lines.push(`Parada: ${ch.parada}`);
  if (ch.cupom) lines.push(`Cupom: ${ch.cupom}`);
  if (ch.favorito) lines.push(`Motorista de confiança: ${ch.favorito.valor}`);
  if (ch.recado) lines.push(`Recado: ${ch.recado}`);
  return lines;
}

// ── Bot do WhatsApp ──

/** Menu numerado das opcoes. 0 = seguir sem opcoes. */
export function botOptionsMenu(items: OptionItem[]): string {
  const lines = items.map((it, i) => `*${i + 1}* - ${it.label}`);
  return [
    "✨ *Alguma preferência para esta corrida?*",
    "",
    ...lines,
    "",
    "Responda com os números (ex.: *1 3*) ou *0* para seguir sem preferência.",
  ].join("\n");
}

/** Le a resposta ao menu: numeros separados por espaco/virgula, ou 0/nao/seguir. */
export function parseOptionsReply(text: string, items: OptionItem[]): { skip: boolean; picked: OptionItem[]; invalid: boolean } {
  const t = String(text ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  if (/^(0|nao|n|nenhum[a]?|seguir|continuar|pular|sem preferencia|nada|ok)$/.test(t)) return { skip: true, picked: [], invalid: false };
  const nums = t.match(/\d+/g);
  if (!nums || t.replace(/[\d\s,;.e-]/g, "").length > 0) {
    // Nome escrito por extenso (ex.: "ida e volta")
    const byName = items.filter((it) => t.length >= 4 && it.label.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(t));
    return byName.length === 1 ? { skip: false, picked: byName, invalid: false } : { skip: false, picked: [], invalid: true };
  }
  const picked: OptionItem[] = [];
  for (const n of nums) {
    const i = Number(n);
    if (i === 0) continue;
    const it = items[i - 1];
    if (!it) return { skip: false, picked: [], invalid: true };
    if (!picked.includes(it)) picked.push(it);
  }
  return picked.length ? { skip: false, picked, invalid: false } : { skip: true, picked: [], invalid: false };
}

export const INPUT_PROMPTS: Record<InputKey, string> = {
  parada: "\u{1F4CD} Qual o endereço da parada? (rua e número)",
  cupom: "\u{1F39F}️ Qual o código do cupom?",
  favorito: "\u{1F697} Informe a *placa*, o *telefone* ou o *número da viatura* do motorista de confiança:",
  recado: "\u{1F4DD} Qual o recado para o motorista? (ex.: portaria 2, apto 31)",
};

/**
 * Aplica o texto do passageiro a uma opcao que pede entrada. Devolve as escolhas atualizadas ou um erro para
 * perguntar de novo. "pular" desiste so desta opcao.
 */
export function applyInput(ch: RideChoices, key: InputKey, text: string): { choices: RideChoices; error: string | null } {
  const t = String(text ?? "").trim();
  if (/^(pular|cancelar|nao|não|0)$/i.test(t)) return { choices: ch, error: null };
  if (key === "cupom") {
    const cp = normalizeCoupon(t);
    return cp ? { choices: { ...ch, cupom: cp }, error: null } : { choices: ch, error: "Código inválido. Envie só o código do cupom (ou *pular*)." };
  }
  if (key === "favorito") {
    const f = parseFavoriteDriver(t);
    return f ? { choices: { ...ch, favorito: f }, error: null } : { choices: ch, error: "Não entendi. Envie a placa (ex.: ABC1D23), o telefone com DDD ou o número da viatura (ou *pular*)." };
  }
  const s = cleanText(t, key === "parada" ? 150 : 140);
  if (!s || s.length < 3) return { choices: ch, error: "Texto muito curto. Tente de novo (ou *pular*)." };
  return { choices: { ...ch, [key]: s }, error: null };
}
