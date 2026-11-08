// Análise de corridas: TODOS os números do relatório são calculados aqui, em código.
// A IA só escreve textos em cima deles (prompts.ts). Funções puras, sem estado. Testes em test/painel.test.ts.

import type { CorridaPainel } from "../comum/corrida.ts";

export interface Distribuicao { n: number; soma: number; media: number | null; mediana: number | null; p25: number | null; p75: number | null; p90: number | null; min: number | null; max: number | null }
export interface Contagem { nome: string; qtd: number; pct: number }
export interface Alerta { nivel: "critico" | "atencao" | "ok"; titulo: string; texto: string }
export interface CasoForaDoPadrao { os: string; tipo: "valor_alto" | "finalizada_rapida" | "finalizada_sem_valor"; data: string; motorista: string; categoria: string; valor: number | null; distanciaKm: number | null; detalhe: string }

export interface Estatisticas {
  total: number;
  periodo: { inicio: string | null; fim: string | null; dias: number };
  origens: Contagem[];
  status: { finalizadas: number; canceladas: number; naoAtendidas: number; abertas: number; taxaFinalizacao: number; taxaCancelamento: number; taxaNaoAtendidas: number; textos: Contagem[] };
  valor: Distribuicao;
  faixasValor: Contagem[];
  porCategoria: Array<{ nome: string; corridas: number; finalizadas: number; canceladas: number; taxaCancelamento: number; faturamento: number; valorTipico: number | null }>;
  pagamentos: Contagem[];
  canais: Contagem[];
  cidades: Array<Contagem & { taxaCancelamento: number }>;
  tarifas: Contagem[];
  cancelamento: { total: number; porQuem: Contagem[]; motivos: Contagem[]; porDemora: number; porDemoraPct: number };
  motoristas: { ativos: number; top: Contagem[]; top3Pct: number; semMotoristaNaoAtendidas: number };
  descontos: { corridas: number; pct: number; valorTotal: number; cupons: Contagem[] };
  dinamica: { corridas: number; pct: number; fator: Distribuicao };
  distancia: Distribuicao;
  distanciaMotorista: Distribuicao & { acima4km: number; acima4kmPct: number; cancelamentoAte4km: number; cancelamentoAcima4km: number };
  avaliacao: { qtd: number; media: number | null; notas: Contagem[] };
  temporal: {
    porHora: Array<{ hora: number; total: number; canceladas: number; taxaCancelamento: number }>;
    porDiaSemana: Array<{ dia: string; total: number; canceladas: number; taxaCancelamento: number }>;
    porDia: Array<{ dia: string; total: number; finalizadas: number; faturamento: number }>;
    pico: { hora: number; total: number } | null;
    diaMaisMovimentado: { dia: string; total: number } | null;
    diaMenosMovimentado: { dia: string; total: number } | null;
    noturnas: number; noturnasPct: number;
  };
  passageiros: { identificados: number; distintos: number; recorrentes: number; top10Pct: number };
  programadas: number;
  foraDoPadrao: CasoForaDoPadrao[];
  qualidade: Array<{ campo: string; vazios: number; pct: number }>;
  /** Campos que nenhuma origem trouxe: a análise avisa que não pôde medir. */
  semDados: string[];
  alertas: Alerta[];
}

export const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const arred = (n: number, c = 2) => Math.round(n * 10 ** c) / 10 ** c;
const pct = (a: number, b: number) => (b > 0 ? arred((a / b) * 100, 1) : 0);
const normal = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function quantil(ord: number[], q: number): number | null {
  if (!ord.length) return null;
  const pos = (ord.length - 1) * q, b = Math.floor(pos), r = pos - b;
  return arred(ord[b + 1] !== undefined ? ord[b] + r * (ord[b + 1] - ord[b]) : ord[b]);
}

export function distribuicao(valores: number[]): Distribuicao {
  const v = valores.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  const soma = v.reduce((a, b) => a + b, 0);
  return { n: v.length, soma: arred(soma), media: v.length ? arred(soma / v.length) : null, mediana: quantil(v, 0.5), p25: quantil(v, 0.25), p75: quantil(v, 0.75), p90: quantil(v, 0.9), min: v[0] ?? null, max: v.length ? v[v.length - 1] : null };
}

export function contar(valores: string[], total = valores.length, limite = 0, outros = "Demais"): Contagem[] {
  const m = new Map<string, number>();
  for (const v of valores) m.set(v, (m.get(v) ?? 0) + 1);
  let l = [...m.entries()].sort((a, b) => b[1] - a[1]).map(([nome, qtd]) => ({ nome, qtd, pct: pct(qtd, total) }));
  if (limite && l.length > limite) {
    const resto = l.slice(limite).reduce((a, x) => a + x.qtd, 0);
    l = [...l.slice(0, limite), { nome: outros, qtd: resto, pct: pct(resto, total) }];
  }
  return l;
}

const hora = (iso: string) => new Date(iso).getUTCHours();
const diaSemana = (iso: string) => new Date(iso).getUTCDay();
const diaBr = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const dataHoraBr = (iso: string | null) => (iso ? `${diaBr(iso)} ${iso.slice(11, 16)}` : "");
export const ehDemora = (motivo: string) => /demor|espera|aguard|nao chegou|longe|atras/.test(normal(motivo));

const CAMPOS_QUALIDADE: Array<[string, (c: CorridaPainel) => unknown]> = [
  ["Telefone do passageiro", (c) => c.telefonePassageiro], ["Destino", (c) => c.destino], ["Motorista", (c) => c.motorista],
  ["Categoria", (c) => c.categoria], ["Forma de pagamento", (c) => c.pagamento], ["Distância estimada", (c) => c.distanciaKm],
  ["Valor (finalizadas)", (c) => (c.grupo === "finalizada" ? c.valor : "ok")], ["Cidade", (c) => c.cidade],
];

export function calcular(lista: CorridaPainel[]): Estatisticas {
  const total = lista.length;
  const com = lista.filter((c) => c.solicitadaEm).sort((a, b) => a.solicitadaEm!.localeCompare(b.solicitadaEm!));
  const ini = com[0]?.solicitadaEm ?? null, fim = com[com.length - 1]?.solicitadaEm ?? null;
  const fin = lista.filter((c) => c.grupo === "finalizada"), can = lista.filter((c) => c.grupo === "cancelada");
  const nat = lista.filter((c) => c.grupo === "nao_atendida"), abe = lista.filter((c) => c.grupo === "aberta");
  const valores = fin.map((c) => c.valor).filter((v): v is number => v != null && v > 0);
  const val = distribuicao(valores);
  const taxa = (l: CorridaPainel[]) => pct(l.filter((c) => c.grupo === "cancelada").length, l.length);

  // faixas de valor pelos quartis (corridas finalizadas)
  const faixas: Contagem[] = [];
  if (val.p25 != null && val.p75 != null && val.mediana != null) {
    const rot = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;
    const limites: Array<[string, (v: number) => boolean]> = [
      [`Até ${rot(val.p25)}`, (v) => v <= val.p25!], [`${rot(val.p25)} a ${rot(val.mediana)}`, (v) => v > val.p25! && v <= val.mediana!],
      [`${rot(val.mediana)} a ${rot(val.p75)}`, (v) => v > val.mediana! && v <= val.p75!], [`Acima de ${rot(val.p75)}`, (v) => v > val.p75!],
    ];
    for (const [nome, ok] of limites) { const q = valores.filter(ok).length; faixas.push({ nome, qtd: q, pct: pct(q, valores.length) }); }
  }

  const categorias = [...new Set(lista.map((c) => c.categoria || "Sem categoria"))].map((nome) => {
    const l = lista.filter((c) => (c.categoria || "Sem categoria") === nome);
    const f = l.filter((c) => c.grupo === "finalizada");
    return { nome, corridas: l.length, finalizadas: f.length, canceladas: l.filter((c) => c.grupo === "cancelada").length, taxaCancelamento: taxa(l), faturamento: arred(f.reduce((a, c) => a + (c.valor ?? 0), 0)), valorTipico: distribuicao(f.map((c) => c.valor ?? NaN)).mediana };
  }).sort((a, b) => b.corridas - a.corridas);

  const comMot = lista.filter((c) => c.motorista);
  const topMot = contar(comMot.map((c) => c.motorista), comMot.length);
  const top3 = topMot.slice(0, 3).reduce((a, x) => a + x.qtd, 0);

  const dMot = lista.filter((c) => c.distanciaMotoristaKm != null);
  const longe = dMot.filter((c) => c.distanciaMotoristaKm! > 4), perto = dMot.filter((c) => c.distanciaMotoristaKm! <= 4);

  const porHora = Array.from({ length: 24 }, (_, h) => {
    const l = com.filter((c) => hora(c.solicitadaEm!) === h);
    return { hora: h, total: l.length, canceladas: l.filter((c) => c.grupo === "cancelada").length, taxaCancelamento: taxa(l) };
  });
  const porDiaSemana = DIAS.map((dia, i) => {
    const l = com.filter((c) => diaSemana(c.solicitadaEm!) === i);
    return { dia, total: l.length, canceladas: l.filter((c) => c.grupo === "cancelada").length, taxaCancelamento: taxa(l) };
  });
  const diasMap = new Map<string, CorridaPainel[]>();
  for (const c of com) { const d = c.solicitadaEm!.slice(0, 10); diasMap.set(d, [...(diasMap.get(d) ?? []), c]); }
  const porDia = [...diasMap.entries()].sort().map(([d, l]) => ({ dia: diaBr(d), total: l.length, finalizadas: l.filter((c) => c.grupo === "finalizada").length, faturamento: arred(l.filter((c) => c.grupo === "finalizada").reduce((a, c) => a + (c.valor ?? 0), 0)) }));
  const ordDias = [...porDia].sort((a, b) => b.total - a.total);
  const pico = [...porHora].sort((a, b) => b.total - a.total)[0];
  const noturnas = com.filter((c) => { const h = hora(c.solicitadaEm!); return h >= 23 || h < 6; }).length;

  const pax = lista.map((c) => c.telefonePassageiro.replace(/\D/g, "") || c.passageiro.trim()).filter(Boolean);
  const paxCont = contar(pax);
  const top10 = paxCont.slice(0, 10).reduce((a, x) => a + x.qtd, 0);

  // casos fora do padrão (só finalizadas)
  const fora: CasoForaDoPadrao[] = [];
  const limiteAlto = val.p75 != null && val.p25 != null ? Math.max(val.p75 + 3 * (val.p75 - val.p25), (val.mediana ?? 0) * 3) : Infinity;
  const caso = (c: CorridaPainel, tipo: CasoForaDoPadrao["tipo"], detalhe: string): CasoForaDoPadrao => ({ os: c.os, tipo, data: dataHoraBr(c.solicitadaEm), motorista: c.motorista, categoria: c.categoria, valor: c.valor, distanciaKm: c.distanciaKm, detalhe });
  for (const c of fin) {
    if (c.valor != null && c.valor > limiteAlto) fora.push(caso(c, "valor_alto", `valor muito acima do típico (R$ ${val.mediana?.toFixed(2).replace(".", ",")})`));
    if (c.iniciadaEm && c.finalizadaEm) {
      const min = (Date.parse(c.finalizadaEm) - Date.parse(c.iniciadaEm)) / 60_000;
      if (min >= 0 && min < 2 && (c.distanciaKm ?? 0) > 1) fora.push(caso(c, "finalizada_rapida", `encerrada em ${min.toFixed(1).replace(".", ",")} min para ${c.distanciaKm} km estimados`));
    }
    if (c.valor == null || c.valor <= 0) fora.push(caso(c, "finalizada_sem_valor", "finalizada sem valor registrado"));
  }

  const qualidade = CAMPOS_QUALIDADE.map(([campo, f]) => {
    const vazios = lista.filter((c) => { const v = f(c); return v == null || v === ""; }).length;
    return { campo, vazios, pct: pct(vazios, total) };
  }).filter((q) => q.vazios > 0).sort((a, b) => b.vazios - a.vazios);

  const semDados: string[] = [];
  if (!lista.some((c) => c.distanciaMotoristaKm != null)) semDados.push("distância do motorista no aceite");
  if (!lista.some((c) => c.fatorDinamico != null)) semDados.push("tarifa dinâmica");
  if (!lista.some((c) => c.avaliacao != null)) semDados.push("avaliações");
  if (!lista.some((c) => c.canal)) semDados.push("canal do pedido");
  if (!lista.some((c) => c.motivoCancelamento)) semDados.push("motivo do cancelamento");

  const est: Estatisticas = {
    total,
    periodo: { inicio: ini ? diaBr(ini) : null, fim: fim ? diaBr(fim) : null, dias: diasMap.size },
    origens: contar(lista.map((c) => c.origemNome || c.origem), total),
    status: {
      finalizadas: fin.length, canceladas: can.length, naoAtendidas: nat.length, abertas: abe.length,
      taxaFinalizacao: pct(fin.length, total), taxaCancelamento: pct(can.length, total), taxaNaoAtendidas: pct(nat.length, total),
      textos: contar(lista.map((c) => c.statusTexto), total, 8),
    },
    valor: val, faixasValor: faixas, porCategoria: categorias.slice(0, 12),
    pagamentos: contar(lista.map((c) => c.pagamento || "Não informado"), total, 8),
    canais: contar(lista.map((c) => c.canal || "Não informado"), total, 8),
    cidades: contar(lista.map((c) => c.cidade || "Não informada"), total, 8).map((x) => ({ ...x, taxaCancelamento: taxa(lista.filter((c) => (c.cidade || "Não informada") === x.nome)) })),
    tarifas: contar(lista.filter((c) => c.tarifa).map((c) => c.tarifa), total, 6),
    cancelamento: {
      total: can.length, porQuem: contar(can.map((c) => c.canceladaPor || "Não informado"), can.length),
      motivos: contar(can.map((c) => c.motivoCancelamento || "Sem motivo"), can.length, 8),
      porDemora: can.filter((c) => ehDemora(c.motivoCancelamento)).length, porDemoraPct: pct(can.filter((c) => ehDemora(c.motivoCancelamento)).length, can.length),
    },
    motoristas: { ativos: topMot.length, top: topMot.slice(0, 10), top3Pct: pct(top3, comMot.length), semMotoristaNaoAtendidas: nat.length },
    descontos: {
      corridas: lista.filter((c) => (c.desconto ?? 0) > 0 || c.cupom).length, pct: pct(lista.filter((c) => (c.desconto ?? 0) > 0 || c.cupom).length, total),
      valorTotal: arred(lista.reduce((a, c) => a + (c.desconto ?? 0), 0)), cupons: contar(lista.filter((c) => c.cupom).map((c) => c.cupom), total, 6),
    },
    dinamica: { corridas: lista.filter((c) => (c.fatorDinamico ?? 1) > 1).length, pct: pct(lista.filter((c) => (c.fatorDinamico ?? 1) > 1).length, total), fator: distribuicao(lista.map((c) => c.fatorDinamico ?? NaN).filter((x) => x > 1)) },
    distancia: distribuicao(lista.map((c) => c.distanciaKm ?? NaN)),
    distanciaMotorista: { ...distribuicao(dMot.map((c) => c.distanciaMotoristaKm!)), acima4km: longe.length, acima4kmPct: pct(longe.length, dMot.length), cancelamentoAte4km: taxa(perto), cancelamentoAcima4km: taxa(longe) },
    avaliacao: { qtd: lista.filter((c) => c.avaliacao != null).length, media: distribuicao(lista.map((c) => c.avaliacao ?? NaN)).media, notas: contar(lista.filter((c) => c.avaliacao != null).map((c) => String(c.avaliacao))) },
    temporal: {
      porHora, porDiaSemana, porDia,
      pico: pico?.total ? { hora: pico.hora, total: pico.total } : null,
      diaMaisMovimentado: ordDias[0] ? { dia: ordDias[0].dia, total: ordDias[0].total } : null,
      diaMenosMovimentado: ordDias.length > 1 ? { dia: ordDias[ordDias.length - 1].dia, total: ordDias[ordDias.length - 1].total } : null,
      noturnas, noturnasPct: pct(noturnas, total),
    },
    passageiros: { identificados: pax.length, distintos: paxCont.length, recorrentes: paxCont.filter((p) => p.qtd > 1).length, top10Pct: pct(top10, pax.length) },
    programadas: lista.filter((c) => c.programada).length,
    foraDoPadrao: fora.slice(0, 12),
    qualidade, semDados,
    alertas: [],
  };
  est.alertas = alertasCalculados(est);
  return est;
}

/** Alertas que saem só da conta, sem IA (o relatório tem eles mesmo se a IA falhar). */
export function alertasCalculados(e: Estatisticas): Alerta[] {
  const a: Alerta[] = [];
  const n = (x: number) => x.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  if (e.total === 0) return [{ nivel: "atencao", titulo: "Sem corridas no período", texto: "Mude o filtro para ver a análise." }];
  if (e.status.taxaCancelamento >= 15) a.push({ nivel: e.status.taxaCancelamento >= 25 ? "critico" : "atencao", titulo: `Cancelamento em ${n(e.status.taxaCancelamento)}%`, texto: `${e.status.canceladas} de ${e.total} corridas foram canceladas.${e.cancelamento.porDemora ? ` ${e.cancelamento.porDemora} citam demora ou espera.` : ""}` });
  if (e.status.taxaNaoAtendidas >= 5) a.push({ nivel: e.status.taxaNaoAtendidas >= 10 ? "critico" : "atencao", titulo: `${n(e.status.taxaNaoAtendidas)}% sem atendimento`, texto: `${e.status.naoAtendidas} pedidos ficaram sem motorista.` });
  if (e.motoristas.top3Pct >= 40 && e.motoristas.ativos > 3) a.push({ nivel: "atencao", titulo: `3 motoristas fazem ${n(e.motoristas.top3Pct)}% das corridas`, texto: `Operação concentrada em ${e.motoristas.top.slice(0, 3).map((m) => m.nome).join(", ")}.` });
  if (e.distanciaMotorista.n && e.distanciaMotorista.cancelamentoAcima4km - e.distanciaMotorista.cancelamentoAte4km >= 5) a.push({ nivel: "atencao", titulo: "Motorista longe cancela mais", texto: `Com o motorista a mais de 4 km, o cancelamento é ${n(e.distanciaMotorista.cancelamentoAcima4km)}%; até 4 km, ${n(e.distanciaMotorista.cancelamentoAte4km)}%.` });
  if (e.foraDoPadrao.length) a.push({ nivel: "atencao", titulo: `${e.foraDoPadrao.length} corridas fora do padrão`, texto: "Confira a lista de casos fora do padrão no fim do relatório." });
  if (!a.length) a.push({ nivel: "ok", titulo: `Finalização em ${n(e.status.taxaFinalizacao)}%`, texto: "Nenhum número fora do esperado no período." });
  return a;
}
