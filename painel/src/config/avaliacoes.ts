// Configuração NPS e Avaliações (passageiro e motorista): o app pergunta a nota do aplicativo (loja) depois de algumas corridas;
// quem recusa avaliar fica marcado e só volta a ser perguntado depois de "Resetar Recusas".

import { cadastroPorId } from "../comum/cadastros.ts";
import { listar } from "../cadastros/armazem.ts";
import { agoraBr } from "../servidor/util.ts";
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
