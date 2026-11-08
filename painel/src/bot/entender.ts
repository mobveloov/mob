// Entender o que o passageiro escreveu. Regras simples primeiro (rápidas e sem custo);
// a IA (caso "classificacao" do roteador) só entra em frase livre no menu.

import { gerarJson } from "../ia/roteador.ts";
import * as D from "../servidor/dados.ts";

/** "Olá, BOM dia!!" -> "ola bom dia" */
export const normalizar = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

const CUMPRIMENTOS = new Set([
  "oi", "oii", "oiii", "ola", "ole", "opa", "eai", "e", "ai", "salve", "hello", "hi", "bom", "boa", "dia", "tarde", "noite",
  "tudo", "bem", "bom", "td", "blz", "beleza", "obrigado", "obrigada", "obg", "valeu", "vlw", "ok", "okay", "certo", "show",
  "lindo", "linda", "querido", "querida", "amigo", "amiga", "moco", "moca", "gente", "pessoal", "por", "favor", "pf", "pfv",
  "tchau", "ate", "logo", "kk", "kkk", "kkkk", "rs", "haha", "sim", "nao", "joia", "tranquilo", "como", "vai", "voce", "vc", "esta", "ta",
]);

/** "oi lindo", "bom dia!", "tudo bem?" -> true. Nunca vira endereço. */
export function ehCumprimento(texto: string): boolean {
  const p = normalizar(texto).split(" ").filter(Boolean);
  if (!p.length) return true; // só emoji ou pontuação
  return p.length <= 6 && p.every((x) => CUMPRIMENTOS.has(x));
}

const RUA = /\b(rua|r|av|avenida|al|alameda|travessa|tv|praca|pca|rodovia|rod|estrada|estr|largo|viela|quadra|qd|lote|lt|bairro|condominio|cond|residencial|vila|jardim|jd|parque|setor|km|br|sp|rj|mg|pr|sc|rs|go|ba)\b/;

/** Tira as palavras de conversa do começo: "me pega na rua x" -> "rua x". */
export function limparEndereco(texto: string): string {
  return texto.trim()
    .replace(/^(?:(?:oi|ola|olá|bom dia|boa tarde|boa noite)[,!. ]+)?/i, "")
    .replace(/^(?:(?:eu\s+)?(?:to|tô|estou|t[oô])\s+(?:aqui\s+)?(?:na|no|em)|me\s+(?:pega|busca|buscar|pegar)\s+(?:na|no|em)|(?:quero|vou|preciso)\s+(?:ir\s+)?(?:pra|para|pro|ao|a|na|no)|(?:pra|para|pro)|(?:na|no|em))\s+/i, "")
    .replace(/\s+/g, " ").trim().slice(0, 200);
}

/** Parece endereço ou nome de lugar? Cumprimento e pergunta não são. */
export function pareceEndereco(texto: string): boolean {
  const t = limparEndereco(texto);
  const n = normalizar(t);
  if (n.length < 4 || ehCumprimento(t)) return false;
  if (/\?\s*$/.test(texto) && !/\d/.test(texto)) return false; // pergunta sem número
  if (pareceRua(t)) return true;
  if (PEDIDO.test(n)) return false; // "quero uma corrida" não é lugar
  const palavras = n.split(" ");
  return palavras.length >= 2 && palavras.length <= 10 && /[a-z]{3,}/.test(n); // "santa casa", "shopping center norte"
}

const PEDIDO = /\b(corrida|carro|motorista|taxi|moto|preciso|quero|pedir|chamar)\b/;

/** Endereço claro: tem tipo de rua ou nome com número ("pernambuco 402"). */
export function pareceRua(texto: string): boolean {
  const n = normalizar(limparEndereco(texto));
  if (n.length < 4 || ehCumprimento(n)) return false;
  return RUA.test(n) || (/\d/.test(n) && /[a-z]{3,}/.test(n));
}

/** Opção numerada ("1", "1 - sim", "opção 2") ou por palavra. Devolve o número (1..max) ou null. */
export function opcao(texto: string, max: number, palavras: Record<number, RegExp> = {}): number | null {
  const n = normalizar(texto);
  const m = n.match(/^(?:opcao\s+)?(\d{1,2})\b/);
  if (m) { const v = Number(m[1]); return v >= 1 && v <= max ? v : null; }
  for (const [num, re] of Object.entries(palavras)) if (re.test(n)) return Number(num);
  return null;
}

export const SIM = /^(s|sim|ss|isso|certo|correto|confirmo|confirmar|pode|ok|beleza|blz|ta certo|esta certo|isso mesmo)\b/;
export const NAO = /^(n|nao|errado|corrigir|mudar|alterar|editar)\b/;
export const CANCELAR = /^(cancelar|cancela|cancelo|quero cancelar|cancele)\b/;
export const MENU = /^(menu|inicio|voltar|recomecar|comecar de novo|0)$/;
export const SEM_DESTINO = /^(sem destino|nao sei|nao informar|nao quero informar|nenhum|combino com o motorista)\b/;

// ------------------------------------------------------------------ IA

export interface Intencao { intencao: "pedir" | "suporte" | "cumprimento" | "outro"; embarque?: string; destino?: string }
export type Classificador = (empresaId: string, texto: string) => Promise<Intencao | null>;

const SISTEMA = `Você entende mensagens de passageiros de uma central de corridas por WhatsApp, no Brasil.
Responda só um JSON: {"intencao":"pedir"|"suporte"|"cumprimento"|"outro","embarque":string|null,"destino":string|null}.
- "pedir": a pessoa quer um carro/moto/corrida. Copie o endereço de embarque e o de destino como ela escreveu (sem inventar).
- "suporte": reclamação, objeto esquecido, falar com atendente, dúvida sobre corrida passada.
- "cumprimento": só saudação ou conversa sem pedido. Cumprimento nunca é endereço.
- Não invente endereço. Se não tiver, use null.`;

/** Classifica uma frase livre com a IA da empresa. Sem chave ou com erro: null (o bot segue pelas regras). */
export const classificarComIa: Classificador = async (empresaId, texto) => {
  try {
    const r = await gerarJson({
      caso: "classificacao", sistema: SISTEMA, usuario: JSON.stringify({ mensagem: texto.slice(0, 500) }),
      maxTokens: 300, chavesEmpresa: D.segredos(empresaId).ia,
    });
    const d = (r.dados ?? {}) as Record<string, unknown>;
    const intencao = ["pedir", "suporte", "cumprimento", "outro"].includes(String(d.intencao)) ? (d.intencao as Intencao["intencao"]) : "outro";
    const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : undefined);
    return { intencao, embarque: s(d.embarque), destino: s(d.destino) };
  } catch {
    return null;
  }
};
