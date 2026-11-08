// Roteador de IA: escolhe o provedor e o modelo por CASO DE USO, com plano B se um falhar.
// Modelo e ordem vêm de variável de ambiente (IA_ROTA_<CASO>); chaves vêm da empresa (Integrações > IA)
// e, se permitido, da plataforma (.env). Nada disso fica no código.
//
// Padrões (o porquê está em docs/COMO_FUNCIONA.md):
//   relatorio     -> Claude Sonnet 5.5 (tabelas longas, raciocínio, texto bom)  | plano B: Groq gpt-oss-120b, Gemini Flash
//   chat          -> Groq gpt-oss-120b (rápido e barato)                        | plano B: Claude Haiku 5.5, Gemini Flash
//   classificacao -> Groq gpt-oss-120b                                          | plano B: Claude Haiku 5.5
//   voz           -> Gemini TTS (reservado; o painel ainda não usa voz)

import Anthropic from "@anthropic-ai/sdk";

export type CasoIa = "relatorio" | "chat" | "classificacao" | "voz";
export type Provedor = "anthropic" | "groq" | "openai" | "gemini";
export interface Rota { provedor: Provedor; modelo: string }

export const ROTAS_PADRAO: Record<CasoIa, string> = {
  relatorio: "anthropic:claude-sonnet-5-5,groq:openai/gpt-oss-120b,gemini:gemini-2.5-flash",
  chat: "groq:openai/gpt-oss-120b,anthropic:claude-haiku-5-5,gemini:gemini-2.5-flash",
  classificacao: "groq:openai/gpt-oss-120b,anthropic:claude-haiku-5-5",
  voz: "gemini:gemini-2.5-flash-preview-tts",
};

/** Nome da variável de cada provedor (na empresa e no .env da plataforma). */
export const VARIAVEL_CHAVE: Record<Provedor, string> = {
  anthropic: "ANTHROPIC_API_KEY", groq: "GROQ_API_KEYS", openai: "OPENAI_API_KEY", gemini: "GEMINI_API_KEY",
};

const PROVEDORES: Provedor[] = ["anthropic", "groq", "openai", "gemini"];

export function rotas(caso: CasoIa, env: Record<string, string | undefined> = process.env): Rota[] {
  const texto = (env[`IA_ROTA_${caso.toUpperCase()}`] ?? "").trim() || ROTAS_PADRAO[caso];
  return texto.split(",").map((p) => p.trim()).filter(Boolean).flatMap((p) => {
    const i = p.indexOf(":");
    const provedor = p.slice(0, i) as Provedor;
    const modelo = p.slice(i + 1).trim();
    return i > 0 && PROVEDORES.includes(provedor) && modelo ? [{ provedor, modelo }] : [];
  });
}

/** Chaves disponíveis por provedor: primeiro as da empresa; depois as da plataforma, se permitido. */
export function chavesDisponiveis(daEmpresa: Record<string, string>, env: Record<string, string | undefined> = process.env): Record<Provedor, string[]> {
  const usarPlataforma = (env.IA_USAR_CHAVES_DA_PLATAFORMA ?? "true").trim() !== "false";
  const lista = (v?: string) => String(v ?? "").split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
  const out = {} as Record<Provedor, string[]>;
  for (const p of PROVEDORES) {
    const nome = VARIAVEL_CHAVE[p];
    out[p] = [...new Set([...lista(daEmpresa[nome]), ...(usarPlataforma ? lista(env[nome] ?? (p === "groq" ? env.GROQ_API_KEY : undefined)) : [])])];
  }
  return out;
}

export interface PedidoIa {
  caso: CasoIa;
  sistema: string;
  usuario: string;
  maxTokens: number;
  chavesEmpresa: Record<string, string>;
  /** Para testes. */
  fetch?: typeof fetch;
  env?: Record<string, string | undefined>;
}

export interface RespostaIa { dados: unknown; provedor: Provedor; modelo: string }

const URL_COMPATIVEL: Record<Exclude<Provedor, "anthropic">, string> = {
  groq: "https://api.groq.com/openai/v1/chat/completions",
  openai: "https://api.openai.com/v1/chat/completions",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
};

/** Tira cercas de código e pega o primeiro objeto JSON do texto. */
export function extrairJson(texto: string): unknown {
  const t = texto.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  try { return JSON.parse(t); } catch { /* segue */ }
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
  throw new Error("a IA não devolveu JSON");
}

async function chamarClaude(r: Rota, chave: string, p: PedidoIa): Promise<unknown> {
  const client = new Anthropic({ apiKey: chave, fetch: p.fetch, maxRetries: 1, timeout: 120_000 });
  // Sonnet/Opus: se o filtro de segurança recusar, o próprio servidor tenta outro modelo ("fallbacks: default").
  const comReserva = /sonnet|opus/.test(r.modelo);
  const resp = await client.beta.messages.create({
    model: r.modelo,
    max_tokens: p.maxTokens,
    system: p.sistema,
    messages: [{ role: "user", content: p.usuario }],
    output_config: { effort: p.caso === "relatorio" ? "medium" : "low" },
    ...(comReserva ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
  });
  if (resp.stop_reason === "refusal") throw new Error("o modelo recusou o pedido");
  if (resp.stop_reason === "max_tokens") throw new Error("a resposta passou do limite de tamanho");
  const texto = resp.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return extrairJson(texto);
}

async function chamarCompativel(r: Rota, chave: string, p: PedidoIa): Promise<unknown> {
  const f = p.fetch ?? fetch;
  const corpo: Record<string, unknown> = {
    model: r.modelo, max_tokens: p.maxTokens, response_format: { type: "json_object" },
    messages: [{ role: "system", content: p.sistema }, { role: "user", content: p.usuario }],
  };
  if (/gpt-oss/.test(r.modelo)) corpo.reasoning_effort = "low";
  const resp = await f(URL_COMPATIVEL[r.provedor as Exclude<Provedor, "anthropic">], {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${chave}` },
    body: JSON.stringify(corpo), signal: AbortSignal.timeout(90_000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return extrairJson(String(data.choices?.[0]?.message?.content ?? ""));
}

/**
 * Pede um JSON à IA do caso. Tenta cada rota (e cada chave dela) até dar certo.
 * Erro só quando todas falham; a mensagem não traz chave nem conteúdo.
 */
export async function gerarJson(p: PedidoIa): Promise<RespostaIa> {
  const env = p.env ?? process.env;
  const chaves = chavesDisponiveis(p.chavesEmpresa, env);
  const tentativas: string[] = [];
  for (const r of rotas(p.caso, env)) {
    const lista = chaves[r.provedor];
    if (!lista.length) { tentativas.push(`${r.provedor}: sem chave`); continue; }
    for (const chave of lista.slice(0, 3)) {
      try {
        const dados = r.provedor === "anthropic" ? await chamarClaude(r, chave, p) : await chamarCompativel(r, chave, p);
        return { dados, provedor: r.provedor, modelo: r.modelo };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        tentativas.push(`${r.provedor}/${r.modelo}: ${msg.slice(0, 120)}`);
        console.error("[ia]", p.caso, r.provedor, r.modelo, msg.slice(0, 200));
      }
    }
  }
  throw new ErroIa(tentativas);
}

export class ErroIa extends Error {
  semChave: boolean;
  constructor(public tentativas: string[]) {
    super(tentativas.every((t) => t.endsWith("sem chave")) ? "Nenhuma chave de IA configurada." : "A IA não respondeu agora.");
    this.semChave = tentativas.length > 0 && tentativas.every((t) => t.endsWith("sem chave"));
  }
}

/** Situação para a tela de integrações: qual rota de cada caso tem chave. */
export function situacaoIa(chavesEmpresa: Record<string, string>, env: Record<string, string | undefined> = process.env) {
  const ch = chavesDisponiveis(chavesEmpresa, env);
  return (Object.keys(ROTAS_PADRAO) as CasoIa[]).map((caso) => ({
    caso,
    rotas: rotas(caso, env).map((r) => ({ ...r, temChave: ch[r.provedor].length > 0 })),
  }));
}
