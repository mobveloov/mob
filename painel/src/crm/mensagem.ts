// Texto das mensagens: variáveis, cupom e variações (IA só pelo roteador, caso "chat").

import crypto from "node:crypto";
import { gerarJson, type PedidoIa } from "../ia/roteador.ts";
import { processTemplate } from "./spintext.ts";
import { VARIAVEIS, type Contato } from "./tipos.ts";

export interface DadosTexto { contato: Pick<Contato, "nome" | "cidade" | "diasSemCorrida" | "corridas">; cupom: string; empresa: string; os?: string; valor?: string; motorista?: string }

/** Troca {variavel} pelo valor. Sem {cupom} no texto e com cupom definido, o cupom vai no fim. */
export function montarTexto(modelo: string, d: DadosTexto): string {
  const nome = d.contato.nome.trim();
  const valores: Record<string, string> = {
    nome: nome || "tudo bem", primeiro_nome: nome.split(/\s+/)[0] || "tudo bem", cidade: d.contato.cidade || "sua cidade",
    cupom: d.cupom, empresa: d.empresa, dias_sem_corrida: d.contato.diasSemCorrida == null ? "" : String(d.contato.diasSemCorrida),
    corridas: String(d.contato.corridas),
  };
  // Estilo do mobveloov: {{variavel}} e SpinText {a|b}. Primeiro nome em {{nome}}; {{nome_completo}} traz o nome todo.
  const duplas: Record<string, string> = { ...valores, nome: valores.primeiro_nome, nome_completo: nome || "tudo bem", os: d.os ?? "", valor: d.valor ?? "", motorista: d.motorista ?? "" };
  let t = modelo.replace(/\{\{(\w+)\}\}/g, (inteiro, k: string) => (k in duplas ? duplas[k] : inteiro));
  t = t.replace(/\{(\w+)\}/g, (inteiro, k: string) => (k in valores ? valores[k] : inteiro));
  t = processTemplate(t.replace(/\{(\w+)\}/g, "$1")).replace(/(\w+)/g, "{$1}"); // variável desconhecida fica como está
  if (d.cupom && !/\{\{?cupom\}?\}/.test(modelo)) t = `${t.trimEnd()}\n\nCupom: ${d.cupom}`;
  return t.replace(/[ \t]+\n/g, "\n").trim();
}

/** Variáveis desconhecidas no texto (para avisar antes de salvar). */
export function variaveisDesconhecidas(texto: string): string[] {
  const conhecidas = new Set<string>(VARIAVEIS);
  const extras = new Set(["os", "valor", "motorista", "nome_completo"]);
  return [...new Set([...texto.matchAll(/\{\{?(\w+)\}?\}/g)].map((m) => m[1]).filter((k) => !conhecidas.has(k) && !extras.has(k)))];
}

/** Escolhe a variação de cada pessoa sempre igual (mesma pessoa, mesma campanha, mesmo texto). */
export function escolherVariacao(textos: string[], semente: string): string {
  const l = textos.map((t) => t.trim()).filter(Boolean);
  if (!l.length) return "";
  const h = crypto.createHash("sha1").update(semente).digest().readUInt32BE(0);
  return l[h % l.length];
}

const vars = (t: string) => [...new Set([...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort().join(",");

/**
 * Pede variações do texto à IA. Só aceita variação que mantém as mesmas variáveis e não é cópia.
 * `extra` serve aos testes (fetch e env simulados).
 */
export async function variacoesComIa(texto: string, quantidade: number, empresa: string, chavesEmpresa: Record<string, string>, extra: Pick<PedidoIa, "fetch" | "env"> = {}) {
  const n = Math.min(5, Math.max(1, Math.floor(quantidade) || 3));
  const sistema = [
    "Você escreve mensagens curtas de WhatsApp para uma empresa de transporte por aplicativo, em português do Brasil.",
    "Reescreva a mensagem do usuário em variações com o mesmo sentido, tom amigável e frases curtas.",
    "Mantenha EXATAMENTE as mesmas variáveis entre chaves (ex.: {primeiro_nome}, {cupom}). Não invente variáveis, links, preços ou prazos.",
    "Não cite outras marcas. A empresa se chama \"" + empresa.replace(/"/g, "") + "\".",
    `Responda só JSON: {"variacoes": ["...", "..."]} com ${n} itens.`,
  ].join("\n");
  const r = await gerarJson({ caso: "chat", sistema, usuario: texto.slice(0, 2000), maxTokens: 1500, chavesEmpresa, ...extra });
  const lista = (r.dados as { variacoes?: unknown })?.variacoes;
  const alvo = vars(texto);
  const base = texto.trim().toLowerCase();
  const variacoes = (Array.isArray(lista) ? lista : [])
    .map((v) => String(v ?? "").trim().slice(0, 2000))
    .filter((v) => v && v.toLowerCase() !== base && vars(v) === alvo)
    .slice(0, n);
  return { variacoes: [...new Set(variacoes)], modelo: `${r.provedor}/${r.modelo}` };
}

/**
 * "Corrigir com IA + SpinText" (portado do mobveloov): corrige a ortografia e põe {opcao1|opcao2} nas saudações e verbos.
 * Só aceita a resposta se as {{variáveis}} ficaram iguais e o SpinText é válido.
 */
export async function spintextComIa(texto: string, chavesEmpresa: Record<string, string>, extra: Pick<PedidoIa, "fetch" | "env"> = {}) {
  const sistema = [
    "Você é uma IA de um sistema de mensagens de WhatsApp. Receba uma mensagem, corrija erros de ortografia e digitação e aplique SpinText {opcao1|opcao2|opcao3} nas saudações, verbos e termos principais, para o WhatsApp não bloquear o número por spam.",
    "Regras: 1) corrija ortografia e gramática; 2) use de 2 a 4 opções por bloco; 3) NUNCA altere as tags {{...}}; 4) mantenha o sentido; 5) não invente links, preços ou prazos.",
    "Exemplo: entrada \"ola cliente seu login ira vencer amanha\" -> saída \"{Olá|Oi|Opa} {{nome}} seu login {irá vencer|expira|vence} amanhã\".",
    'Responda só JSON: {"spintext": "..."}',
  ].join("\n");
  const r = await gerarJson({ caso: "chat", sistema, usuario: texto.slice(0, 2000), maxTokens: 1000, chavesEmpresa, ...extra });
  const novo = String((r.dados as { spintext?: unknown })?.spintext ?? "").trim().slice(0, 4000);
  const dupla = (t: string) => [...new Set([...t.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))].sort().join(",");
  if (!novo || dupla(novo) !== dupla(texto)) return { spintext: "" };
  return { spintext: novo };
}
