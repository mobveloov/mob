// Textos editaveis do bot (Bot de Corridas > Mensagens), saudacao com imagem e base de conhecimento (respostas
// prontas para perguntas como "aceita pet?"). Portado do sistema de referência. Teste: test/bot-regras.test.ts
//
// Textos: chaves da config do bot (textos) que o fluxo realmente le.
// Ficam de fora os textos montados com os dados da corrida (ex.: confirmacao com embarque/destino): um texto fixo
// apagaria esses dados. Por isso o webhook ignora o personalizado dessas chaves (DYNAMIC_TEXT_KEYS).

export interface BotTextDef { key: string; label: string; def: string; group: string }

export const BOT_TEXT_DEFS: BotTextDef[] = [
  { group: "Menu", key: "welcome_menu", label: "Boas-vindas (primeira mensagem)", def: "👋 Ola! Como podemos ajudar?" },
  { group: "Menu", key: "welcome_back", label: "Boas-vindas (quem já pediu antes)", def: "👋 Ola! Como podemos ajudar?" },
  { group: "Menu", key: "welcome_repeat", label: "Repetir o menu", def: "👋 Como podemos ajudar?" },
  { group: "Embarque", key: "ask_address", label: "Pedir o endereço de embarque", def: "📍 Ola! Qual e o endereco de embarque? Voce pode digitar o endereco, enviar sua localizacao ou mandar um audio." },
  { group: "Embarque", key: "address_retry", label: "Pedir o embarque de novo", def: "📍 Por favor, envie o endereco de embarque. Voce pode digitar, enviar sua localizacao, mandar um audio ou enviar uma foto da fachada." },
  { group: "Embarque", key: "address_correction", label: "Corrigir o embarque", def: "🔄 Sem problema! Qual e o endereco correto de embarque? Voce pode digitar, enviar sua localizacao ou mandar um audio." },
  { group: "Destino", key: "ask_destination", label: "Perguntar o destino", def: "🎯 Para onde voce vai?" },

  { group: "Destino", key: "destination_retry", label: "Pedir o destino de novo", def: "📍 Por favor, envie o endereco de destino (rua e numero). Voce pode digitar, mandar um audio ou compartilhar a localizacao. Se nao quiser informar, envie 2." },
  { group: "Confirmação", key: "confirm_retry", label: "Repetir a confirmação", def: "⚠️ Por favor, responda SIM para confirmar ou NAO para corrigir." },
  { group: "Categoria e pagamento", key: "ask_category", label: "Perguntar a categoria", def: "🏆 Qual categoria voce deseja?" },
  { group: "Categoria e pagamento", key: "category_retry", label: "Categoria inválida", def: "⚠️ Opcao invalida. Escolha uma categoria:" },
  { group: "Categoria e pagamento", key: "ask_payment", label: "Perguntar o pagamento", def: "💰 Qual a forma de pagamento?" },
  { group: "Categoria e pagamento", key: "payment_retry", label: "Pagamento inválido", def: "⚠️ Opcao invalida. Qual a forma de pagamento?" },
  { group: "Pedido", key: "ride_success", label: "Corrida solicitada", def: "✅ Corrida solicitada com sucesso! Um motorista vai aceitar em breve. Aguarde." },
  { group: "Pedido", key: "ride_error", label: "Erro ao solicitar", def: "❌ Não foi possível solicitar a corrida no momento. Tente novamente enviando uma nova mensagem." },
  { group: "Suporte", key: "support_forward", label: "Indo para o suporte", def: "💬 Voce sera direcionado para o suporte. Envie sua mensagem e nossa equipe ira responder." },
  { group: "Suporte", key: "support_exit", label: "Suporte encerrado", def: "👋 Suporte encerrado." },
  { group: "Suporte", key: "support_thanks", label: "Suporte encerrado (agradecimento, sem menu)", def: "💛 Atendimento encerrado. Obrigado por falar com a gente! Quando precisar de uma corrida, é só mandar uma mensagem por aqui." },
];

/** Textos montados com os dados da corrida: o personalizado e ignorado (apagaria embarque/destino). */
export const DYNAMIC_TEXT_KEYS = new Set(["confirm_address"]);

const TEXT_KEYS = new Set(BOT_TEXT_DEFS.map((d) => d.key));
export const BOT_TEXT_MAX = 1000;

/** So chaves conhecidas, sem vazios, ate 1000 caracteres. Chaves antigas desconhecidas sao descartadas ao salvar. */
export function normalizeBotTexts(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!TEXT_KEYS.has(k) || typeof v !== "string") continue;
    const t = v.trim().slice(0, BOT_TEXT_MAX);
    if (t) out[k] = t;
  }
  return out;
}

/** Texto personalizado da conexao, ou o padrao. Ignora chaves dinamicas. */
export function customText(custom: Record<string, unknown> | null | undefined, key: string, fallback: string): string {
  if (DYNAMIC_TEXT_KEYS.has(key)) return fallback;
  const v = custom?.[key];
  return typeof v === "string" && v.trim() ? v : fallback;
}

// ── Saudacao com imagem ──

export interface BotGreeting {
  /** Endereco publico da imagem (enviada antes do menu de boas-vindas). */
  imageUrl: string;
  /** Legenda opcional da imagem. */
  caption: string;
}

/** Intervalo minimo entre duas imagens de saudacao para o mesmo passageiro. */
export const GREETING_IMAGE_EVERY_MS = 12 * 60 * 60 * 1000;

export function normalizeGreeting(raw: unknown): BotGreeting {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const url = typeof r.imageUrl === "string" ? r.imageUrl.trim() : "";
  return {
    imageUrl: /^https:\/\/\S+$/i.test(url) && url.length <= 1000 ? url : "",
    caption: typeof r.caption === "string" ? r.caption.trim().slice(0, 500) : "",
  };
}

/** Manda a imagem agora? So com imagem configurada e se a ultima foi ha mais de 12 h. */
export function shouldSendGreetingImage(g: BotGreeting, lastSentIso: string | null | undefined, nowMs: number): boolean {
  if (!g.imageUrl) return false;
  const last = lastSentIso ? new Date(lastSentIso).getTime() : NaN;
  return !Number.isFinite(last) || nowMs - last >= GREETING_IMAGE_EVERY_MS;
}

// ── Base de conhecimento ──

export interface FaqEntry {
  /** Pergunta de exemplo (so para o painel). */
  question: string;
  /** Palavras que identificam a pergunta (ex.: "pet, cachorro, gato"). */
  keywords: string[];
  answer: string;
}

export const FAQ_MAX_ENTRIES = 30;

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function parseKeywords(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw.map(String) : String(raw ?? "").split(/[,;\n]/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of list) {
    const t = fold(k).replace(/\s+/g, " ").trim();
    if (t.length < 3 || t.length > 40 || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 15) break;
  }
  return out;
}

export function normalizeFaq(raw: unknown): FaqEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: FaqEntry[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const r = e as Record<string, unknown>;
    const answer = typeof r.answer === "string" ? r.answer.trim().slice(0, 1000) : "";
    const keywords = parseKeywords(r.keywords);
    if (!answer || !keywords.length) continue;
    out.push({ question: typeof r.question === "string" ? r.question.trim().slice(0, 200) : "", keywords, answer });
    if (out.length >= FAQ_MAX_ENTRIES) break;
  }
  return out;
}

const QUESTION_START = /^(aceita|aceitam|aceito|pode|posso|podem|tem|tera|quanto|quantos|quantas|como|qual|quais|leva|levam|levo|da pra|da para|e possivel|funciona|funcionam|voces|vcs|vc|voce|onde|quando|precisa|preciso|cobra|cobram|faz|fazem|trabalha|trabalham)\b/;

/** A mensagem parece uma pergunta? `strict` (no meio do pedido): so com "?" e sem numeros (endereco). */
export function looksLikeQuestion(text: string, strict: boolean): boolean {
  const t = fold(text).trim();
  if (!t || t.length > 200) return false;
  if (strict) return t.includes("?") && !/\d/.test(t);
  return t.includes("?") || QUESTION_START.test(t);
}

/**
 * Resposta pronta para a mensagem, ou null. Precisa parecer pergunta e conter uma palavra-chave inteira
 * (ex.: "pet" casa com "aceita pet?" e nao com "petrolina"). Empate: a entrada com mais palavras encontradas.
 */
export function matchFaq(text: string, faq: FaqEntry[], strict: boolean): FaqEntry | null {
  if (!faq.length || !looksLikeQuestion(text, strict)) return null;
  const t = ` ${fold(text).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()} `;
  let best: FaqEntry | null = null;
  let bestHits = 0;
  for (const e of faq) {
    const hits = e.keywords.filter((k) => t.includes(` ${k.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()} `)).length;
    if (hits > bestHits) { best = e; bestHits = hits; }
  }
  return best;
}
