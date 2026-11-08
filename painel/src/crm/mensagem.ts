// Texto das mensagens: variáveis, cupom e variações (IA só pelo roteador, caso "chat").

import crypto from "node:crypto";
import { gerarJson, type PedidoIa } from "../ia/roteador.ts";
import { VARIAVEIS, type Contato } from "./tipos.ts";

export interface DadosTexto { contato: Pick<Contato, "nome" | "cidade" | "diasSemCorrida" | "corridas">; cupom: string; empresa: string }

/** Troca {variavel} pelo valor. Sem {cupom} no texto e com cupom definido, o cupom vai no fim. */
export function montarTexto(modelo: string, d: DadosTexto): string {
  const nome = d.contato.nome.trim();
  const valores: Record<string, string> = {
    nome: nome || "tudo bem", primeiro_nome: nome.split(/\s+/)[0] || "tudo bem", cidade: d.contato.cidade || "sua cidade",
    cupom: d.cupom, empresa: d.empresa, dias_sem_corrida: d.contato.diasSemCorrida == null ? "" : String(d.contato.diasSemCorrida),
    corridas: String(d.contato.corridas),
  };
  let t = modelo.replace(/\{(\w+)\}/g, (inteiro, k: string) => (k in valores ? valores[k] : inteiro));
  if (d.cupom && !/\{cupom\}/.test(modelo)) t = `${t.trimEnd()}\n\nCupom: ${d.cupom}`;
  return t.replace(/[ \t]+\n/g, "\n").trim();
}

/** Variáveis desconhecidas no texto (para avisar antes de salvar). */
export function variaveisDesconhecidas(texto: string): string[] {
  const conhecidas = new Set<string>(VARIAVEIS);
  return [...new Set([...texto.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((k) => !conhecidas.has(k)))];
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
