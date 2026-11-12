// Config › Descontos: promoções automáticas por categoria, forma de pagamento, dia da semana e horário (sem código de cupom).
// Seguem o padrão de Cupons (Gestão de Cupons): desconto fixo ou percentual, teto, validade, mínimo da corrida e limite de uso.

import { agoraBr } from "../servidor/util.ts";
import { normal } from "../servidor/util.ts";
import { centavos, gravarConfig, lerConfig, lista, novoId, numero, sim, texto, umDe } from "./armazem.ts";

export interface Desconto {
  id: string; nome: string; tipo: "fixo" | "percentual"; valor: number; teto: number; minimo: number;
  categoria: string; pagamento: string; dias: number[]; inicio: string; fim: string; horaInicio: string; horaFim: string;
  limiteTotal: number; usos: number; ativo: boolean;
}
const DATA = /^\d{4}-\d{2}-\d{2}$/, HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export function sanearDesconto(e: unknown, atual?: Desconto): Desconto {
  const o = (e ?? {}) as Record<string, unknown>;
  const nome = texto(o.nome, 60);
  if (!nome) throw new Error("Informe o nome do desconto.");
  const tipo = umDe(o.tipo, ["fixo", "percentual"] as const, "percentual");
  const valor = centavos(numero(o.valor, 0, 0, tipo === "percentual" ? 100 : 10_000));
  if (!(valor > 0)) throw new Error("Informe o valor do desconto.");
  const d = (v: unknown) => (DATA.test(String(v ?? "")) ? String(v) : "");
  const h = (v: unknown) => (HORA.test(String(v ?? "")) ? String(v) : "");
  return {
    id: texto(o.id, 20) || novoId(), nome, tipo, valor, teto: centavos(numero(o.teto, 0, 0, 10_000)), minimo: centavos(numero(o.minimo, 0, 0, 10_000)),
    categoria: texto(o.categoria, 60), pagamento: texto(o.pagamento, 40), dias: [...new Set(lista(o.dias).map((x) => Math.round(numero(x, -1, -1, 6))).filter((x) => x >= 0))],
    inicio: d(o.inicio), fim: d(o.fim), horaInicio: h(o.horaInicio), horaFim: h(o.horaFim),
    limiteTotal: Math.round(numero(o.limiteTotal, 0, 0, 1_000_000)), usos: atual?.usos ?? 0, ativo: sim(o.ativo, true),
  };
}

export const descontos = (empresaId: string): Desconto[] =>
  lista(lerConfig<unknown[]>(empresaId, "descontos", [])).map((d) => { try { return sanearDesconto(d, d as Desconto); } catch { return null; } }).filter((d): d is Desconto => !!d);

export function salvarDesconto(empresaId: string, entrada: unknown): Desconto[] {
  const id = texto((entrada as Record<string, unknown>)?.id, 20);
  const l = descontos(empresaId);
  const atual = l.find((x) => x.id === id);
  const d = sanearDesconto(entrada, atual);
  gravarConfig(empresaId, "descontos", atual ? l.map((x) => (x.id === d.id ? d : x)) : [...l, d].slice(0, 200));
  return descontos(empresaId);
}
export function removerDesconto(empresaId: string, id: string): Desconto[] {
  gravarConfig(empresaId, "descontos", descontos(empresaId).filter((x) => x.id !== id));
  return descontos(empresaId);
}

/** Maior desconto automático que vale agora para a corrida (em reais, nunca passa do valor). */
export function descontoAutomatico(empresaId: string, p: { categoria: string; pagamento: string; valor: number; quando?: Date }): { valor: number; nome: string } | null {
  const q = p.quando ?? agoraBr();
  const dia = q.getUTCDay(), hoje = q.toISOString().slice(0, 10), hm = q.toISOString().slice(11, 16);
  let melhor: { valor: number; nome: string } | null = null;
  for (const d of descontos(empresaId)) {
    if (!d.ativo || p.valor < d.minimo) continue;
    if (d.categoria && normal(d.categoria) !== normal(p.categoria)) continue;
    if (d.pagamento && normal(d.pagamento) !== normal(p.pagamento)) continue;
    if (d.dias.length && !d.dias.includes(dia)) continue;
    if ((d.inicio && hoje < d.inicio) || (d.fim && hoje > d.fim)) continue;
    if (d.horaInicio && d.horaFim && (d.horaInicio <= d.horaFim ? hm < d.horaInicio || hm > d.horaFim : hm < d.horaInicio && hm > d.horaFim)) continue;
    if (d.limiteTotal && d.usos >= d.limiteTotal) continue;
    let v = d.tipo === "percentual" ? (p.valor * d.valor) / 100 : d.valor;
    if (d.teto > 0) v = Math.min(v, d.teto);
    v = centavos(Math.min(v, p.valor));
    if (!melhor || v > melhor.valor) melhor = { valor: v, nome: d.nome };
  }
  return melhor;
}
