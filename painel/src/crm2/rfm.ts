// CRM › Análises › RFM (portado de crm_refresh_rfm e crm_rfm_summary do sistema de referência).
// Nota de 1 a 5 em Recência, Frequência e Monetário, repartindo em quintis quem já fez corrida. Depois vira um segmento.

import * as A from "../crm/armazem.ts";
import { bd, DIA } from "./base.ts";
import { RFM_SEGMENTOS } from "./catalogo.ts";

/** Divide uma lista já ordenada em `n` grupos do mesmo tamanho (como o ntile do banco): os primeiros ficam com a sobra. Devolve 1..n por posição. */
export function ntile(total: number, n: number): number[] {
  const base = Math.floor(total / n), sobra = total % n;
  const saida: number[] = [];
  for (let g = 1; g <= n; g++) for (let i = 0; i < base + (g <= sobra ? 1 : 0); i++) saida.push(g);
  return saida;
}

export function segmentoRfm(r: number, f: number): string {
  if (r >= 4 && f >= 4) return "champions";
  if (r >= 3 && f >= 3) return "leais";
  if (r >= 4 && f <= 2) return "novos_promissores";
  if (r === 3 && f <= 2) return "precisam_atencao";
  if (r <= 2 && f >= 4) return "nao_pode_perder";
  if (r <= 2 && f === 3) return "em_risco";
  return "hibernando_perdidos";
}

export interface BaseRfm { chave: string; ultima: number | null; corridas: number; gasto: number }
export interface NotaRfm { chave: string; r: number; f: number; m: number; segmento: string; pontos: number }

/** Notas de quem já tem corrida. Empate desfeito pela chave, para o resultado ser sempre o mesmo. */
export function calcularRfm(base: BaseRfm[]): NotaRfm[] {
  const com = base.filter((b) => b.corridas > 0);
  const nota = (ordem: (a: BaseRfm, b: BaseRfm) => number) => {
    const ord = [...com].sort((a, b) => ordem(a, b) || a.chave.localeCompare(b.chave));
    const g = ntile(ord.length, 5);
    return new Map(ord.map((c, i) => [c.chave, g[i]]));
  };
  const r = nota((a, b) => (a.ultima ?? -Infinity) - (b.ultima ?? -Infinity));
  const f = nota((a, b) => a.corridas - b.corridas);
  const m = nota((a, b) => a.gasto - b.gasto);
  return com.map((c) => {
    const nr = r.get(c.chave)!, nf = f.get(c.chave)!, nm = m.get(c.chave)!;
    return { chave: c.chave, r: nr, f: nf, m: nm, segmento: segmentoRfm(nr, nf), pontos: nr * 100 + nf * 10 + nm };
  });
}

/** Recalcula as notas da empresa. Devolve quantos passageiros foram analisados. */
export function atualizarRfm(empresa: string): number {
  const db = bd();
  const linhas = db.prepare("SELECT chave, ultima_corrida AS ultima, total_corridas AS corridas, total_gasto AS gasto FROM crm_contatos WHERE empresa = ?").all(empresa) as unknown as BaseRfm[];
  const notas = calcularRfm(linhas);
  const up = db.prepare("UPDATE crm_contatos SET rfm_r = ?, rfm_f = ?, rfm_m = ?, rfm_segmento = ?, rfm_pontos = ? WHERE empresa = ? AND chave = ?");
  db.exec("SAVEPOINT rfm");
  try {
    for (const n of notas) up.run(n.r, n.f, n.m, n.segmento, n.pontos, empresa, n.chave);
    db.prepare("UPDATE crm_contatos SET rfm_r = NULL, rfm_f = NULL, rfm_m = NULL, rfm_segmento = 'sem_corrida', rfm_pontos = 0 WHERE empresa = ? AND total_corridas = 0").run(empresa);
    db.exec("RELEASE rfm");
  } catch (e) { db.exec("ROLLBACK TO rfm"); db.exec("RELEASE rfm"); throw e; }
  return notas.length;
}

export interface LinhaRfm { segment: string; contacts: number; avg_recency_days: number | null; avg_rides: number | null; avg_ticket: number | null; ltv: number }

/** Resumo por segmento: pessoas, recência média, corridas médias, ticket médio e LTV (maior primeiro). */
export function resumoRfm(empresa: string, agora = Date.now()): LinhaRfm[] {
  const r = (bd().prepare("SELECT COALESCE(rfm_segmento, 'sem_analise') AS segmento, ultima_corrida AS ultima, total_corridas AS corridas, ticket_medio AS ticket, total_gasto AS gasto FROM crm_contatos WHERE empresa = ?").all(empresa)) as Array<{ segmento: string; ultima: number | null; corridas: number; ticket: number; gasto: number }>;
  const grupos = new Map<string, typeof r>();
  for (const x of r) { const l = grupos.get(x.segmento) ?? []; l.push(x); grupos.set(x.segmento, l); }
  const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
  const arred = (n: number | null, c: number) => (n == null ? null : Math.round(n * 10 ** c) / 10 ** c);
  return [...grupos.entries()].map(([segment, l]) => ({
    segment, contacts: l.length,
    avg_recency_days: arred(media(l.filter((x) => x.ultima != null).map((x) => (agora - x.ultima!) / DIA)), 1),
    avg_rides: arred(media(l.map((x) => x.corridas)), 1),
    avg_ticket: arred(media(l.filter((x) => x.ticket > 0).map((x) => x.ticket)), 2),
    ltv: Math.round(l.reduce((a, x) => a + x.gasto, 0) * 100) / 100,
  })).sort((a, b) => b.ltv - a.ltv);
}

/** Todos os passageiros com nota, para exportar CSV. */
export function contatosParaCsv(empresa: string) {
  return bd().prepare("SELECT nome, telefone, rfm_segmento AS segmento, rfm_r AS r, rfm_f AS f, rfm_m AS m, total_corridas AS corridas, total_gasto AS gasto, ultima_corrida AS ultima FROM crm_contatos WHERE empresa = ? ORDER BY rfm_pontos DESC, chave").all(empresa) as Array<{ nome: string; telefone: string; segmento: string | null; r: number | null; f: number | null; m: number | null; corridas: number; gasto: number; ultima: number | null }>;
}

/** "Criar segmento": segmento dinâmico. Guarda só a regra (RFM = este segmento); a lista é reavaliada a cada uso, com a análise mais recente. */
export function criarSegmentoRfm(empresa: string, segmento: string) {
  const info = RFM_SEGMENTOS[segmento];
  if (!info || segmento === "sem_analise") throw new Error("Segmento inválido.");
  const total = (bd().prepare("SELECT COUNT(*) AS n FROM crm_contatos WHERE empresa = ? AND rfm_segmento = ?").get(empresa, segmento) as { n: number }).n;
  const agora = new Date().toISOString();
  const nome = `RFM: ${info.label}`;
  const existente = A.listas(empresa).find((l) => l.modo === "dinamica" && l.regras.rfmSegmento === segmento);
  if (existente) return { id: existente.id, nome: existente.nome, total, jaExistia: true };
  const lista = { id: A.novoId(), nome, modo: "dinamica" as const, regras: { tipo: "passageiro" as const, rfmSegmento: segmento }, chaves: [], criadaEm: agora, atualizadaEm: agora };
  A.salvarListas(empresa, [...A.listas(empresa), lista]);
  return { id: lista.id, nome: lista.nome, total, jaExistia: false };
}
