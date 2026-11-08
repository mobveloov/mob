// Análise com IA: números (estatisticas.ts) -> textos da IA (roteador, caso "relatorio") -> textos limpos.
// Sem chave ou com a IA fora do ar, a análise volta com textos = null e o relatório sai só com os números.

import type { Marca } from "../comum/marca.ts";
import { ErroIa, gerarJson } from "../ia/roteador.ts";
import type { Alerta, Estatisticas } from "./estatisticas.ts";
import { fatosParaIa, promptPergunta, promptPlano, promptRelatorio, SECOES, type SecaoId } from "./prompts.ts";

export interface Item { destaque: string; texto: string }
export interface TextosIa {
  titulo: string;
  resumo: Item[];
  alertas: Alerta[];
  secoes: Partial<Record<SecaoId, string>>;
  casos: Array<{ os: string; texto: string }>;
  recomendacoes: { operacionais: Item[]; comerciais: Item[]; dados: Item[] };
}
export interface Plano {
  titulo: string;
  diagnostico: string;
  problemas: Array<{ problema: string; impacto: string; causa: string; nivel: "critico" | "atencao" | "info" }>;
  acoesImediatas: Array<{ titulo: string; porque: string; oQueFazer: string; responsavel: string; prazo: string; meta: string; nivel: "critico" | "atencao" | "info" }>;
  curtoPrazo: Item[];
  medioPrazo: Item[];
  indicadores: Array<{ indicador: string; atual: string; meta: string }>;
  checklist: string[];
}

export interface Analise { textos: TextosIa | null; plano: Plano | null; modelos: string[]; aviso: string | null }

// ------------------------------------------------------------------ limpeza

const o = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const lista = (v: unknown) => (Array.isArray(v) ? v : []);
const t = (v: unknown, max = 800) => (typeof v === "string" || typeof v === "number" ? String(v).replace(/<[^>]*>/g, "").replace(/\*\*/g, "").trim().slice(0, max) : "");
const nivel = (v: unknown): Alerta["nivel"] => (v === "critico" || v === "atencao" || v === "ok" ? v : "atencao");
const nivel3 = (v: unknown): "critico" | "atencao" | "info" => (v === "critico" || v === "atencao" ? v : "info");
const itens = (v: unknown, n: number): Item[] => lista(v).slice(0, n).map((x) => ({ destaque: t(o(x).destaque, 160), texto: t(o(x).texto, 600) })).filter((x) => x.destaque || x.texto);

export function limparTextos(bruto: unknown, e: Estatisticas): TextosIa {
  const r = o(bruto), s = o(r.secoes), rec = o(r.recomendacoes);
  const osValidas = new Set(e.foraDoPadrao.map((c) => c.os));
  const secoes: Partial<Record<SecaoId, string>> = {};
  for (const k of SECOES) { const v = t(s[k], 900); if (v) secoes[k] = v; }
  return {
    titulo: t(r.titulo, 160),
    resumo: itens(r.resumo, 6),
    alertas: lista(r.alertas).slice(0, 4).map((a) => ({ nivel: nivel(o(a).nivel), titulo: t(o(a).titulo, 160), texto: t(o(a).texto, 600) })).filter((a) => a.titulo),
    secoes,
    casos: lista(r.casos).map((c) => ({ os: t(o(c).os, 30), texto: t(o(c).texto, 500) })).filter((c) => osValidas.has(c.os) && c.texto).slice(0, 12),
    recomendacoes: { operacionais: itens(rec.operacionais, 6), comerciais: itens(rec.comerciais, 5), dados: itens(rec.dados, 4) },
  };
}

export function limparPlano(bruto: unknown): Plano | null {
  const p0 = o(bruto), p = Object.keys(o(p0.plano)).length ? o(p0.plano) : p0;
  const acoes = lista(p.acoesImediatas).slice(0, 5).map((a) => {
    const x = o(a);
    return { titulo: t(x.titulo, 160), porque: t(x.porque ?? x.contexto, 600), oQueFazer: t(x.oQueFazer, 600), responsavel: t(x.responsavel, 120), prazo: t(x.prazo, 60), meta: t(x.meta, 300), nivel: nivel3(x.nivel) };
  }).filter((a) => a.titulo);
  if (!acoes.length) return null;
  return {
    titulo: t(p.titulo, 160) || "Plano de ação", diagnostico: t(p.diagnostico, 1200),
    problemas: lista(p.problemas).slice(0, 6).map((x) => ({ problema: t(o(x).problema, 120), impacto: t(o(x).impacto, 160), causa: t(o(x).causa, 300), nivel: nivel3(o(x).nivel) })).filter((x) => x.problema),
    acoesImediatas: acoes, curtoPrazo: itens(p.curtoPrazo, 5), medioPrazo: itens(p.medioPrazo, 5),
    indicadores: lista(p.indicadores).slice(0, 8).map((x) => ({ indicador: t(o(x).indicador, 120), atual: t(o(x).atual, 80), meta: t(o(x).meta, 80) })).filter((x) => x.indicador),
    checklist: lista(p.checklist).map((x) => t(x, 200)).filter(Boolean).slice(0, 8),
  };
}

/**
 * Troca valores em reais que NÃO aparecem nos números por "valor a definir pela gestão".
 * Evita a IA inventar preço, bônus ou meta em dinheiro.
 */
export function protegerValores<T>(valor: T, fatos: unknown): T {
  const conhecidos = new Set<string>();
  JSON.stringify(fatos).replace(/-?\d+(\.\d+)?/g, (n) => { const x = Number(n); conhecidos.add(x.toFixed(2)); conhecidos.add(Math.round(x).toFixed(2)); return n; });
  const troca = (s: string) => s.replace(/R\$\s?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/g, (todo, n: string) => {
    const x = Number(n.replace(/\./g, "").replace(",", "."));
    return conhecidos.has(x.toFixed(2)) ? todo : "valor a definir pela gestão";
  });
  const andar = (v: unknown): unknown => (typeof v === "string" ? troca(v) : Array.isArray(v) ? v.map(andar) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, andar(x)])) : v);
  return andar(valor) as T;
}

// ------------------------------------------------------------------ IA

export async function analisarComIa(e: Estatisticas, m: Marca, chavesEmpresa: Record<string, string>, opcoes: { fetch?: typeof fetch; env?: Record<string, string | undefined> } = {}): Promise<Analise> {
  const fatos = fatosParaIa(e, m);
  const usuario = `Números calculados da consulta (JSON):\n${JSON.stringify(fatos)}`;
  const pedir = (sistema: string, maxTokens: number) => gerarJson({ caso: "relatorio", sistema, usuario, maxTokens, chavesEmpresa, ...opcoes });
  const [rel, pla] = await Promise.allSettled([pedir(promptRelatorio(m), 12_000), pedir(promptPlano(m), 8_000)]);
  const modelos = [rel, pla].flatMap((r) => (r.status === "fulfilled" ? [`${r.value.provedor}:${r.value.modelo}`] : []));
  const textos = rel.status === "fulfilled" ? protegerValores(limparTextos(rel.value.dados, e), fatos) : null;
  const plano = pla.status === "fulfilled" ? limparPlano(protegerValores(pla.value.dados, fatos)) : null;
  const semChave = [rel, pla].every((r) => r.status === "rejected" && r.reason instanceof ErroIa && r.reason.semChave);
  const aviso = semChave
    ? `${m.assistente.nome} está sem chave de IA: o relatório saiu com os números e os alertas calculados. Configure a IA em Integrações.`
    : !textos ? `A IA não respondeu agora: o relatório saiu só com os números e os alertas calculados. Tente de novo em 1 minuto.`
      : !plano ? "O plano de ação não saiu agora. Tente de novo em 1 minuto." : null;
  return { textos, plano, modelos: [...new Set(modelos)], aviso };
}

export async function responderPergunta(e: Estatisticas, m: Marca, pergunta: string, chavesEmpresa: Record<string, string>, opcoes: { fetch?: typeof fetch; env?: Record<string, string | undefined> } = {}) {
  try {
    const r = await gerarJson({
      caso: "chat", sistema: promptPergunta(m), maxTokens: 1500, chavesEmpresa, ...opcoes,
      usuario: `Números da consulta (JSON):\n${JSON.stringify(fatosParaIa(e, m))}\n\nPergunta do gestor: ${pergunta.slice(0, 600)}`,
    });
    const resposta = t(o(r.dados).resposta, 2000);
    return resposta ? { resposta: protegerValores(resposta, e), modelo: `${r.provedor}:${r.modelo}` } : { erro: "A IA respondeu vazio. Tente perguntar de outro jeito." };
  } catch (err) {
    return { erro: err instanceof ErroIa && err.semChave ? `${m.assistente.nome} está sem chave de IA. Configure em Integrações.` : "A IA não respondeu agora. Tente de novo em 1 minuto." };
  }
}
