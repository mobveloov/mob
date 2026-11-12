// Painel "Indicadores": os 7 cartões e os comparativos de desempenho, com a variação em % contra o
// período anterior do mesmo tamanho. Datas no horário de Brasília (guardado nos campos UTC, como no resto do painel).

import type { CorridaPainel } from "../comum/corrida.ts";
import { agoraBr, arred, isoDia, normal, pct } from "./util.ts";

export type Periodo = "hoje" | "ontem" | "semana" | "mes" | "mes_passado" | "ano_passado" | "personalizado";
export const PERIODOS: Periodo[] = ["hoje", "ontem", "semana", "mes", "mes_passado", "ano_passado", "personalizado"];

const DIA = 86_400_000;
const diaUtc = (s: string) => Date.parse(`${s}T00:00:00Z`);
const somar = (s: string, dias: number) => isoDia(new Date(diaUtc(s) + dias * DIA));
const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Começo e fim (AAAA-MM-DD) do período e do período anterior, do mesmo número de dias. */
export function datasDoPeriodo(p: Periodo, ini?: string, fim?: string, agora = agoraBr()) {
  const hoje = isoDia(agora);
  const [a, m] = [agora.getUTCFullYear(), agora.getUTCMonth()];
  let inicio = hoje, final = hoje;
  if (p === "ontem") inicio = final = somar(hoje, -1);
  else if (p === "semana") inicio = somar(hoje, -((agora.getUTCDay() + 6) % 7)); // desde segunda-feira
  else if (p === "mes") inicio = isoDia(new Date(Date.UTC(a, m, 1)));
  else if (p === "mes_passado") { inicio = isoDia(new Date(Date.UTC(a, m - 1, 1))); final = isoDia(new Date(Date.UTC(a, m, 0))); }
  else if (p === "ano_passado") { inicio = `${a - 1}-01-01`; final = `${a - 1}-12-31`; }
  else if (p === "personalizado" && ini && DATA.test(ini)) {
    inicio = ini; final = fim && DATA.test(fim) && fim >= ini ? fim : ini;
    if ((diaUtc(final) - diaUtc(inicio)) / DIA > 731) final = somar(inicio, 731);
  }
  const dias = Math.round((diaUtc(final) - diaUtc(inicio)) / DIA) + 1;
  return { inicio, fim: final, dias, antInicio: somar(inicio, -dias), antFim: somar(inicio, -1) };
}

/** Variação em % (null quando o período anterior é zero: não dá para comparar). */
export const variacao = (atual: number, anterior: number) => (anterior > 0 ? arred(((atual - anterior) / anterior) * 100, 1) : null);

const resumo = (lista: CorridaPainel[]) => {
  const fin = lista.filter((c) => c.grupo === "finalizada");
  const ganhos = arred(fin.reduce((s, c) => s + (c.valor ?? 0), 0));
  const motoristas = new Set(fin.map((c) => normal(c.motorista)).filter(Boolean)).size;
  return { total: lista.length, fin, ganhos, ticket: fin.length ? arred(ganhos / fin.length) : 0, motoristas, porMotorista: motoristas ? arred(fin.length / motoristas) : 0 };
};

function contagem(nomes: string[], valores?: number[]) {
  const m = new Map<string, number>();
  nomes.forEach((n, i) => m.set(n, (m.get(n) ?? 0) + (valores ? valores[i] : 1)));
  const total = [...m.values()].reduce((a, b) => a + b, 0);
  return [...m.entries()].map(([nome, v]) => ({ nome, valor: arred(v), pct: pct(v, total) })).sort((a, b) => b.valor - a.valor);
}

/** Quem cancelou: motorista, passageiro ou central (o resto conta como central). */
function quemCancelou(s: string): "motorista" | "passageiro" | "central" {
  const n = normal(s);
  if (n.includes("motor")) return "motorista";
  if (n.includes("passag") || n.includes("client")) return "passageiro";
  return "central";
}

/** Série dos gráficos: por hora (um dia), por dia (até 62 dias) ou por mês. */
function serie(lista: CorridaPainel[], inicio: string, fim: string, dias: number) {
  const modo = dias === 1 ? "hora" : dias <= 62 ? "dia" : "mes";
  const chaves: string[] = [];
  if (modo === "hora") for (let h = 0; h < 24; h++) chaves.push(String(h).padStart(2, "0"));
  else if (modo === "dia") for (let d = inicio; d <= fim; d = somar(d, 1)) chaves.push(d);
  else for (let d = inicio.slice(0, 7); d <= fim.slice(0, 7);) {
    chaves.push(d);
    const [a, m] = d.split("-").map(Number);
    d = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
  }
  const chave = (s: string) => (modo === "hora" ? s.slice(11, 13) : modo === "dia" ? s.slice(0, 10) : s.slice(0, 7));
  const rotulo = (k: string) => (modo === "hora" ? `${k}h` : modo === "dia" ? `${k.slice(8, 10)}/${k.slice(5, 7)}` : `${k.slice(5, 7)}/${k.slice(2, 4)}`);
  const b = new Map(chaves.map((k) => [k, { solicitadas: 0, finalizadas: 0, naoAtendidas: 0, canceladas: 0, ganhos: 0, notas: [] as number[] }]));
  for (const c of lista) {
    const x = c.solicitadaEm ? b.get(chave(c.solicitadaEm)) : undefined;
    if (!x) continue;
    x.solicitadas++;
    if (c.grupo === "finalizada") { x.finalizadas++; x.ganhos += c.valor ?? 0; }
    if (c.grupo === "nao_atendida") x.naoAtendidas++;
    if (c.grupo === "cancelada") x.canceladas++;
    if (c.avaliacao != null) x.notas.push(c.avaliacao);
  }
  return chaves.map((k) => {
    const x = b.get(k)!;
    return {
      rotulo: rotulo(k), solicitadas: x.solicitadas, finalizadas: x.finalizadas, naoAtendidas: x.naoAtendidas, canceladas: x.canceladas,
      ganhos: arred(x.ganhos), nps: nps(x.notas),
    };
  });
}

/** NPS = % promotores − % detratores. Notas de 1 a 5 estrelas: 5 promove, 4 é neutro, até 3 é detrator.
 *  Notas de 0 a 10 (quando vierem assim): 9-10 promove, 7-8 neutro, até 6 detrator. */
export function nps(notas: number[]): number | null {
  if (!notas.length) return null;
  const dez = notas.some((n) => n > 5);
  const prom = notas.filter((n) => (dez ? n >= 9 : n >= 5)).length, detr = notas.filter((n) => (dez ? n <= 6 : n <= 3)).length;
  return Math.round(((prom - detr) / notas.length) * 100);
}

/** Dia (AAAA-MM-DD, Brasília) de uma data ISO real (ex.: criadoEm dos cadastros). */
export const diaBrasilia = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "" : isoDia(new Date(t - 3 * 3600_000));
};

export function calcularIndicadores(atual: CorridaPainel[], anterior: CorridaPainel[], p: ReturnType<typeof datasDoPeriodo>, passageiros: { atual: number; anterior: number }) {
  const a = resumo(atual), b = resumo(anterior);
  const can = atual.filter((c) => c.grupo === "cancelada");
  const porQuem = { motorista: 0, passageiro: 0, central: 0 };
  for (const c of can) porQuem[quemCancelou(c.canceladaPor)]++;
  const notas = atual.filter((c) => c.avaliacao != null).map((c) => c.avaliacao!);
  return {
    periodo: { inicio: p.inicio, fim: p.fim, anteriorInicio: p.antInicio, anteriorFim: p.antFim },
    corridas: {
      total: a.total, finalizadas: a.fin.length, canceladas: can.length, naoAtendidas: atual.filter((c) => c.grupo === "nao_atendida").length,
      emAndamento: atual.filter((c) => c.grupo === "aberta").length, canceladasPor: porQuem, variacao: variacao(a.total, b.total),
    },
    origens: contagem(a.fin.map((c) => c.canal || c.origemNome || "Não informada")),
    ganhos: { total: a.ganhos, variacao: variacao(a.ganhos, b.ganhos), porPagamento: contagem(a.fin.map((c) => c.pagamento || "Não informado"), a.fin.map((c) => c.valor ?? 0)) },
    ticketMedio: { valor: a.ticket, variacao: variacao(a.ticket, b.ticket) },
    motoristasAtivos: { valor: a.motoristas, variacao: variacao(a.motoristas, b.motoristas) },
    corridasPorMotorista: { valor: a.porMotorista, variacao: variacao(a.porMotorista, b.porMotorista) },
    passageirosCadastrados: { valor: passageiros.atual, variacao: variacao(passageiros.atual, passageiros.anterior) },
    nota: { media: notas.length ? arred(notas.reduce((x, y) => x + y, 0) / notas.length) : null, avaliacoes: notas.length, nps: nps(notas) },
    serie: serie(atual, p.inicio, p.fim, p.dias),
  };
}
export type Indicadores = ReturnType<typeof calcularIndicadores>;
