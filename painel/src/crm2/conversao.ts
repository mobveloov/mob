// CRM › Análises › Conversão (portado de crm_conversion_report do sistema de referência).
// Uma mensagem "converteu" quando o passageiro finalizou uma corrida em até N horas depois de recebê-la.
// A receita é o valor da 1ª corrida depois da mensagem. Sem Machine: as corridas são as do próprio painel.

import * as A from "../crm/armazem.ts";
import { bd, config2, DIA, HORA } from "./base.ts";

export interface Envio { id: string; chave: string; em: number; origem: string; fonteId: string; fonteNome: string }
export interface Corrida { chave: string; em: number; valor: number }
export interface LinhaConversao { origin: string; source_id: string | null; source_name: string; sent: number; converted: number; conversion_rate: number; revenue: number }

/**
 * Outras origens de mensagem (gatilhos, régua, comportamental...) entram aqui: cada uma devolve os envios feitos desde `desdeMs`.
 * Campanhas, jornadas e testes já vêm da fila do CRM.
 */
type Fonte = (empresa: string, desdeMs: number) => Envio[];
const fontes: Fonte[] = [];
export const registrarFonteDeEnvios = (f: Fonte) => { if (!fontes.includes(f)) fontes.push(f); };

const ORIGEM_FILA: Record<string, string> = { campanha: "campaign", jornada: "journey", teste: "manual" };

export function enviosDaFila(empresa: string, desdeMs: number): Envio[] {
  const nomes = new Map<string, string>();
  for (const c of A.campanhas(empresa)) nomes.set(`campaign:${c.id}`, c.nome);
  for (const j of A.jornadas(empresa)) nomes.set(`journey:${j.id}`, j.nome);
  const saida: Envio[] = [];
  for (const i of A.fila(empresa)) {
    if (i.estado !== "enviado" || !i.enviadoEm || i.enviadoEm < desdeMs) continue;
    const origem = ORIGEM_FILA[i.origem.tipo] ?? "manual";
    const fonteId = origem === "manual" ? "" : i.origem.id;
    saida.push({ id: i.id, chave: i.chave, em: i.enviadoEm, origem, fonteId, fonteNome: origem === "manual" ? "Envio manual" : nomes.get(`${origem}:${i.origem.id}`) ?? "(removido)" });
  }
  return saida;
}

/** Cálculo puro: envios e corridas finalizadas -> uma linha por campanha, jornada, gatilho ou envio manual. */
export function relatorioDeConversao(envios: Envio[], corridas: Corrida[], horas: number): LinhaConversao[] {
  const porPessoa = new Map<string, Corrida[]>();
  for (const c of corridas) { const l = porPessoa.get(c.chave) ?? []; l.push(c); porPessoa.set(c.chave, l); }
  for (const l of porPessoa.values()) l.sort((a, b) => a.em - b.em);
  const janela = horas * HORA;
  const grupos = new Map<string, LinhaConversao>();
  for (const e of envios) {
    const k = `${e.origem}|${e.fonteId}`;
    const g = grupos.get(k) ?? { origin: e.origem, source_id: e.fonteId || null, source_name: e.fonteNome, sent: 0, converted: 0, conversion_rate: 0, revenue: 0 };
    g.sent++;
    const primeira = (porPessoa.get(e.chave) ?? []).find((c) => c.em > e.em && c.em <= e.em + janela);
    if (primeira) { g.converted++; g.revenue += primeira.valor; }
    grupos.set(k, g);
  }
  return [...grupos.values()].map((g) => ({ ...g, conversion_rate: g.sent ? Math.round((100 * g.converted / g.sent) * 100) / 100 : 0, revenue: Math.round(g.revenue * 100) / 100 }))
    .sort((a, b) => b.revenue - a.revenue || b.converted - a.converted || b.sent - a.sent);
}

export function corridasConcluidas(empresa: string, desdeMs: number): Corrida[] {
  return (bd().prepare("SELECT chave, quando AS em, dados FROM crm_eventos WHERE empresa = ? AND tipo = 'concluiu' AND quando >= ?").all(empresa, desdeMs) as Array<{ chave: string; em: number; dados: string }>)
    .map((r) => { let v = 0; try { v = Number(JSON.parse(r.dados).valor) || 0; } catch { /* sem valor */ } return { chave: r.chave, em: r.em, valor: v }; });
}

/** Relatório da empresa nos últimos `dias` (7, 30 ou 90). */
export function conversaoDaEmpresa(empresa: string, dias: number, agora = Date.now()) {
  const d = Math.min(365, Math.max(1, Math.floor(dias) || 30));
  const desde = agora - d * DIA;
  const horas = config2(empresa).atribuicaoHoras;
  const envios = [...enviosDaFila(empresa, desde), ...fontes.flatMap((f) => f(empresa, desde))];
  return { horas, linhas: relatorioDeConversao(envios, corridasConcluidas(empresa, desde), horas) };
}
