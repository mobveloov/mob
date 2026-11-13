// Configuração NPS e Avaliações (passageiro e motorista): o app pergunta a nota do aplicativo (loja) depois de algumas corridas;
// quem recusa avaliar fica marcado e só volta a ser perguntado depois de "Resetar Recusas".

import { cadastroPorId } from "../comum/cadastros.ts";
import { listar } from "../cadastros/armazem.ts";
import { agoraBr, celulaCsv, normal } from "../servidor/util.ts";
import { bancoConfig, gravarConfig, lerConfig, numero, sim, texto } from "./armazem.ts";

export type PapelNps = "passageiro" | "motorista";
export interface ConfigNps { ativo: boolean; aposCorridas: number; intervaloDias: number; notaParaLoja: number; linkLoja: string; pergunta: string; etiquetas: string[] }
export const NPS_PADRAO: ConfigNps = { ativo: true, aposCorridas: 5, intervaloDias: 30, notaParaLoja: 5, linkLoja: "", pergunta: "O que você acha do aplicativo?", etiquetas: ["Atendimento", "Preço", "Segurança", "Aplicativo", "Pontualidade"] };

export function sanearNps(e: unknown, atual: ConfigNps = NPS_PADRAO): ConfigNps {
  const o = { ...atual, ...((e ?? {}) as object) } as Record<string, unknown>;
  const link = texto(o.linkLoja, 300);
  return {
    ativo: sim(o.ativo, true), aposCorridas: Math.round(numero(o.aposCorridas, 5, 1, 1000)), intervaloDias: Math.round(numero(o.intervaloDias, 30, 1, 365)),
    notaParaLoja: Math.round(numero(o.notaParaLoja, 5, 1, 5)), linkLoja: /^https?:\/\//i.test(link) ? link : "", pergunta: texto(o.pergunta, 120) || NPS_PADRAO.pergunta,
    etiquetas: (Array.isArray(o.etiquetas) ? o.etiquetas : atual.etiquetas).map((x) => texto(x, 40)).filter(Boolean).slice(0, 12),
  };
}
const arq = (p: PapelNps) => `nps-${p}`;
export const configNps = (empresaId: string, papel: PapelNps): ConfigNps => sanearNps(lerConfig(empresaId, arq(papel), {}), NPS_PADRAO);
export function salvarConfigNps(empresaId: string, papel: PapelNps, entrada: unknown): ConfigNps {
  const c = sanearNps(entrada, configNps(empresaId, papel));
  gravarConfig(empresaId, arq(papel), c);
  return c;
}

/** O app registra a resposta: nota (1 a 5) ou recusa. Uma por pessoa (a mais nova vale). */
export function registrarNps(empresaId: string, papel: PapelNps, chave: string, nome: string, situacao: "Avaliou" | "Recusou", nota?: number, comentario = "") {
  if (situacao === "Avaliou" && !(Number.isInteger(nota) && nota! >= 1 && nota! <= 5)) throw new Error("A nota vai de 1 a 5.");
  bancoConfig().prepare("INSERT OR REPLACE INTO nps_app (empresa, papel, chave, nome, situacao, nota, comentario, em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(empresaId, papel, chave, texto(nome, 80), situacao, situacao === "Avaliou" ? nota! : null, texto(comentario, 300), agoraBr().toISOString());
}
/** O app deve perguntar agora? (ligado, passou das corridas, sem resposta recente) */
export function deveAvaliar(empresaId: string, papel: PapelNps, chave: string, corridasFeitas: number): boolean {
  const c = configNps(empresaId, papel);
  if (!c.ativo || corridasFeitas < c.aposCorridas) return false;
  const r = bancoConfig().prepare("SELECT situacao, em FROM nps_app WHERE empresa = ? AND papel = ? AND chave = ?").get(empresaId, papel, chave) as { situacao: string; em: string } | undefined;
  if (!r) return true;
  if (r.situacao === "Recusou") return false;
  return agoraBr().getTime() - new Date(r.em).getTime() > c.intervaloDias * 86_400_000;
}
export function resetarRecusas(empresaId: string, papel: PapelNps): number {
  return Number(bancoConfig().prepare("DELETE FROM nps_app WHERE empresa = ? AND papel = ? AND situacao = 'Recusou'").run(empresaId, papel).changes);
}

export function resumoNps(empresaId: string, papel: PapelNps) {
  const db = bancoConfig();
  const linhas = db.prepare("SELECT chave, nome, situacao, nota, comentario, em FROM nps_app WHERE empresa = ? AND papel = ? ORDER BY em DESC").all(empresaId, papel) as Array<{ chave: string; nome: string; situacao: string; nota: number | null; comentario: string; em: string }>;
  const notas = linhas.filter((l) => l.nota != null).map((l) => l.nota!);
  const contagem = Object.fromEntries([5, 4, 3, 2, 1].map((n) => [n, notas.filter((x) => x === n).length]));
  const tel = new Map(listar(empresaId, cadastroPorId(papel === "motorista" ? "motoristas" : "clientes")!).map((r) => [papel === "motorista" ? r.id : String(r.telefone), String(r.telefone ?? "")]));
  return {
    media: notas.length ? Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 10) / 10 : null, votos: notas.length,
    recusaram: linhas.filter((l) => l.situacao === "Recusou").length, detratores: notas.filter((n) => n <= 3).length, contagem,
    ultimas: linhas.slice(0, 50).map((l) => ({ nome: l.nome, telefone: tel.get(l.chave) ?? (papel === "passageiro" ? l.chave : ""), situacao: l.situacao, nota: l.nota, comentario: l.comentario, em: l.em })),
  };
}

// ------------------------------------------------------------------ Avaliações (NPS): nota, promotores, neutros e detratores

/** Notas de 1 a 5 estrelas: 5 promove, 4 é neutro, até 3 é detrator (a mesma regra dos indicadores do painel). */
export const classeNps = (nota: number) => (nota >= 5 ? "Promotor" : nota === 4 ? "Neutro" : "Detrator");
export const TIPOS_NPS: Record<string, string> = { T: "Tudo", P: "Promotores", N: "Neutros", D: "Detratores" };
export const PERIODOS_NPS: Record<string, string> = { TD: "Hoje", LW: "Semana passada", LM: "Mês passado", LS: "Últimos 7 dias", LT: "Últimos 30 dias", CT: "Personalizado" };

export interface FiltroAvaliacoes { periodo?: string; inicio?: string; fim?: string; tipo?: string; email?: string; telefone?: string }

/** Período do filtro (dias AAAA-MM-DD, horário de Brasília). Sem período: últimos 30 dias. */
export function periodoNps(chave = "LT", inicio = "", fim = ""): { inicio: string; fim: string; rotulo: string } {
  const h = agoraBr(), dia = (d: Date) => d.toISOString().slice(0, 10), somar = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
  const ok = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (chave === "TD") return { inicio: dia(h), fim: dia(h), rotulo: PERIODOS_NPS.TD };
  if (chave === "LS") return { inicio: dia(somar(h, -6)), fim: dia(h), rotulo: PERIODOS_NPS.LS };
  if (chave === "LW") { const seg = somar(h, -((h.getUTCDay() + 6) % 7) - 7); return { inicio: dia(seg), fim: dia(somar(seg, 6)), rotulo: PERIODOS_NPS.LW }; }
  if (chave === "LM") return { inicio: dia(new Date(Date.UTC(h.getUTCFullYear(), h.getUTCMonth() - 1, 1))), fim: dia(new Date(Date.UTC(h.getUTCFullYear(), h.getUTCMonth(), 0))), rotulo: PERIODOS_NPS.LM };
  if (chave === "CT" && (ok(inicio) || ok(fim))) { const i = ok(inicio) ? inicio : fim, f = ok(fim) ? fim : inicio; return { inicio: i <= f ? i : f, fim: i <= f ? f : i, rotulo: PERIODOS_NPS.CT }; }
  return { inicio: dia(somar(h, -29)), fim: dia(h), rotulo: PERIODOS_NPS.LT };
}

/** Quem avaliou, com e-mail e telefone do cadastro (passageiro pelo telefone, motorista pelo id). */
function pessoasNps(empresaId: string, papel: PapelNps) {
  const m = new Map<string, { email: string; telefone: string }>();
  for (const r of listar(empresaId, cadastroPorId(papel === "motorista" ? "motoristas" : "clientes")!)) {
    const tel = String(r.telefone ?? "");
    m.set(papel === "motorista" ? r.id : tel.replace(/\D/g, ""), { email: String(r.email ?? ""), telefone: tel });
  }
  return m;
}

function montarNps(empresaId: string, papel: PapelNps, f: FiltroAvaliacoes, comTipo: boolean) {
  const per = periodoNps(f.periodo, f.inicio, f.fim);
  const w = ["empresa = ?", "papel = ?", "situacao = 'Avaliou'", "nota IS NOT NULL", "substr(em, 1, 10) >= ?", "substr(em, 1, 10) <= ?"];
  const p: Array<string | number> = [empresaId, papel, per.inicio, per.fim];
  const email = normal(f.email), tel = String(f.telefone ?? "").replace(/\D/g, "");
  if (email || tel) {
    const chaves = [...pessoasNps(empresaId, papel)].filter(([, v]) => (!email || normal(v.email).includes(email)) && (!tel || v.telefone.replace(/\D/g, "").includes(tel))).map(([k]) => k);
    w.push("chave IN (SELECT value FROM json_each(?))"); p.push(JSON.stringify(chaves));
  }
  if (comTipo && f.tipo === "P") w.push("nota >= 5"); else if (comTipo && f.tipo === "N") w.push("nota = 4"); else if (comTipo && f.tipo === "D") w.push("nota <= 3");
  return { onde: w.join(" AND "), p, per };
}

/** Nota NPS (% promotores - % detratores), totais e a lista paginada de avaliações do filtro. */
export function avaliacoesNps(empresaId: string, papel: PapelNps, f: FiltroAvaliacoes, pagina = 1, porPagina = 50) {
  const db = bancoConfig();
  const tot = montarNps(empresaId, papel, f, false);
  const t = db.prepare(`SELECT count(*) AS total, coalesce(sum(nota >= 5), 0) AS prom, coalesce(sum(nota = 4), 0) AS neu, coalesce(sum(nota <= 3), 0) AS det, avg(nota) AS media FROM nps_app WHERE ${tot.onde}`).get(...tot.p) as Record<string, number | null>;
  const lista = montarNps(empresaId, papel, f, true);
  const total = Number((db.prepare(`SELECT count(*) AS n FROM nps_app WHERE ${lista.onde}`).get(...lista.p) as { n: number }).n);
  const paginas = Math.max(1, Math.ceil(total / porPagina)), pg = Math.min(Math.max(1, Math.floor(pagina) || 1), paginas);
  const pessoas = pessoasNps(empresaId, papel);
  const itens = db.prepare(`SELECT chave, nome, nota, comentario, em FROM nps_app WHERE ${lista.onde} ORDER BY em DESC LIMIT ? OFFSET ?`).all(...lista.p, porPagina, (pg - 1) * porPagina)
    .map((l) => {
      const r = l as { chave: string; nome: string; nota: number; comentario: string; em: string }, x = pessoas.get(r.chave);
      return { nome: r.nome, telefone: x?.telefone || (papel === "passageiro" ? r.chave : ""), email: x?.email ?? "", nota: r.nota, classe: classeNps(r.nota), comentario: r.comentario, em: r.em };
    });
  const n = Number(t.total), prom = Number(t.prom), det = Number(t.det);
  return {
    periodo: tot.per, tipo: TIPOS_NPS[f.tipo ?? ""] ? f.tipo : "T",
    nps: n ? Math.round(((prom - det) / n) * 100) : null, media: n ? Math.round(Number(t.media) * 10) / 10 : null,
    total: n, promotores: prom, neutros: Number(t.neu), detratores: det,
    lista: { total, pagina: pg, paginas, itens },
  };
}

/** Planilha CSV das avaliações do filtro (com proteção contra fórmula). */
export function csvAvaliacoes(empresaId: string, papel: PapelNps, f: FiltroAvaliacoes): string {
  const { onde, p } = montarNps(empresaId, papel, f, true);
  const pessoas = pessoasNps(empresaId, papel);
  const linhas = bancoConfig().prepare(`SELECT chave, nome, nota, comentario, em FROM nps_app WHERE ${onde} ORDER BY em DESC LIMIT 20000`).all(...p) as Array<{ chave: string; nome: string; nota: number; comentario: string; em: string }>;
  const cab = ["Data", "Hora", papel === "motorista" ? "Motorista" : "Passageiro", "Telefone", "E-mail", "Nota", "Classificação", "Comentário"];
  return "﻿" + [cab, ...linhas.map((l) => {
    const x = pessoas.get(l.chave);
    return [`${l.em.slice(8, 10)}/${l.em.slice(5, 7)}/${l.em.slice(0, 4)}`, l.em.slice(11, 16), l.nome, x?.telefone || (papel === "passageiro" ? l.chave : ""), x?.email ?? "", l.nota, classeNps(l.nota), l.comentario];
  })].map((c) => c.map(celulaCsv).join(";")).join("\n");
}
