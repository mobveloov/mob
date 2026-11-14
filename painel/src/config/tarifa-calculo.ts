// Tarifa da categoria no formato da Machine ("Editar tarifa"): método de cálculo (km e minuto, tabela de KM, bairro de destino ou
// hora parada), componentes principais e extras (parada adicional e bônus de deslocamento). Este arquivo só tem tipos, saneamento
// e o cálculo do preço (sem ler banco), para ser usado igual pelo painel, pelos apps e pelos testes.

import { normal } from "../servidor/util.ts";
import { centavos, lista, numero, sim, texto, umDe } from "./armazem.ts";

export const METODOS = ["km_minuto", "tabela_km", "bairro", "hora_parada"] as const;
export type MetodoTarifa = (typeof METODOS)[number];
export const ROTULO_METODO: Record<MetodoTarifa, string> = {
  km_minuto: "Por tarifa inicial, km e minuto", tabela_km: "Por tabela de KM", bairro: "Por bairro de destino", hora_parada: "Por tarifa inicial, km e hora parada",
};

export interface FaixaTabelaKm { ate: number; valor: number }
export interface TarifaBairro { nome: string; valor: number }
export interface BonusDeslocamento { ativo: boolean; minKm: number; tipo: "fixo" | "por_km"; valor: number; teto: number }

/** Tudo que o cálculo precisa de uma tarifa (a padrão da categoria ou uma extra). */
export interface TarifaCalculo {
  metodo: MetodoTarifa;
  precoBase: number; valorKm: number; valorMinuto: number; valorHoraParada: number; valorMinimo: number;
  /** Tabela de KM: cada faixa vale até "ate" km e cobra o valor fixo; passando da última cobra "kmAdicional" por km a mais. */
  tabelaKm: FaixaTabelaKm[]; kmAdicional: number;
  /** Maior percurso aceito (0 = sem limite): acima disso a corrida não pode ser solicitada. */
  limiteKm: number;
  bairros: TarifaBairro[];
  paradaAdicional: number;
  bonusDeslocamento: BonusDeslocamento;
}

/** Tarifa extra: vale só nos dias e horários marcados; fora deles vale a tarifa padrão. */
export interface TarifaExtra extends TarifaCalculo { id: string; nome: string; ativa: boolean; dias: number[]; inicio: string; fim: string }

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const reg = (v: unknown) => (v ?? {}) as Record<string, unknown>;

export const BONUS_PADRAO: BonusDeslocamento = { ativo: false, minKm: 0, tipo: "fixo", valor: 0, teto: 0 };
export const CALCULO_PADRAO: TarifaCalculo = {
  metodo: "km_minuto", precoBase: 0, valorKm: 0, valorMinuto: 0, valorHoraParada: 0, valorMinimo: 0,
  tabelaKm: [], kmAdicional: 0, limiteKm: 0, bairros: [], paradaAdicional: 0, bonusDeslocamento: BONUS_PADRAO,
};

export function sanearBonus(e: unknown, atual: BonusDeslocamento = BONUS_PADRAO): BonusDeslocamento {
  const o = { ...atual, ...reg(e) } as Record<string, unknown>;
  return { ativo: sim(o.ativo), minKm: numero(o.minKm, 0, 0, 1000), tipo: umDe(o.tipo, ["fixo", "por_km"] as const, "fixo"), valor: centavos(numero(o.valor, 0, 0, 1000)), teto: centavos(numero(o.teto, 0, 0, 10_000)) };
}

export function sanearTabelaKm(v: unknown): FaixaTabelaKm[] {
  const l = lista(v).map((f) => { const x = reg(f); return { ate: numero(x.ate, 0, 0, 10_000), valor: centavos(numero(x.valor, 0, 0, 100_000)) }; }).filter((f) => f.ate > 0);
  const ordenadas = l.sort((a, b) => a.ate - b.ate);
  for (let i = 1; i < ordenadas.length; i++) if (ordenadas[i].ate === ordenadas[i - 1].ate) throw new Error("A tabela de KM tem duas faixas com o mesmo limite de distância.");
  return ordenadas.slice(0, 40);
}

export function sanearBairros(v: unknown): TarifaBairro[] {
  const vistos = new Set<string>();
  return lista(v).map((b) => { const x = reg(b); return { nome: texto(x.nome, 80), valor: centavos(numero(x.valor, 0, 0, 100_000)) }; })
    .filter((b) => { const n = normal(b.nome); if (!n || vistos.has(n)) return false; vistos.add(n); return true; }).slice(0, 300);
}

/** Lê os campos de cálculo de uma entrada solta; o que faltar vem de "atual". */
export function sanearCalculo(e: unknown, atual: TarifaCalculo = CALCULO_PADRAO): TarifaCalculo {
  const o = reg(e);
  const tem = (k: string) => o[k] !== undefined;
  return {
    metodo: umDe(o.metodo, METODOS, atual.metodo),
    precoBase: tem("precoBase") ? centavos(numero(o.precoBase, 0, 0, 10_000)) : atual.precoBase,
    valorKm: tem("valorKm") ? centavos(numero(o.valorKm, 0, 0, 1000)) : atual.valorKm,
    valorMinuto: tem("valorMinuto") ? centavos(numero(o.valorMinuto, 0, 0, 1000)) : atual.valorMinuto,
    valorHoraParada: tem("valorHoraParada") ? centavos(numero(o.valorHoraParada, 0, 0, 10_000)) : atual.valorHoraParada,
    valorMinimo: tem("valorMinimo") ? centavos(numero(o.valorMinimo, 0, 0, 10_000)) : atual.valorMinimo,
    tabelaKm: tem("tabelaKm") ? sanearTabelaKm(o.tabelaKm) : atual.tabelaKm,
    kmAdicional: tem("kmAdicional") ? centavos(numero(o.kmAdicional, 0, 0, 1000)) : atual.kmAdicional,
    limiteKm: tem("limiteKm") ? numero(o.limiteKm, 0, 0, 10_000) : atual.limiteKm,
    bairros: tem("bairros") ? sanearBairros(o.bairros) : atual.bairros,
    paradaAdicional: tem("paradaAdicional") ? centavos(numero(o.paradaAdicional, 0, 0, 1000)) : atual.paradaAdicional,
    bonusDeslocamento: sanearBonus(o.bonusDeslocamento, atual.bonusDeslocamento),
  };
}

/** Confere o que a Machine exige no "Editar tarifa": o método escolhido precisa dos seus campos. */
export function conferirCalculo(t: TarifaCalculo): void {
  if (t.metodo === "tabela_km") {
    if (!t.tabelaKm.length) throw new Error("Adicione ao menos uma faixa na tabela de KM.");
    if (t.tabelaKm.some((f) => !(f.valor > 0))) throw new Error("Informe o valor fixo de cada faixa da tabela de KM.");
    if (t.limiteKm > 0 && t.limiteKm < t.tabelaKm[0].ate) throw new Error("O percurso máximo não pode ser menor que a primeira faixa da tabela de KM.");
  }
  if (t.metodo === "bairro" && !t.bairros.length && !(t.precoBase || t.valorKm || t.valorMinuto)) throw new Error("Cadastre ao menos um bairro com valor.");
  if (t.metodo === "km_minuto" && !(t.precoBase || t.valorKm || t.valorMinuto || t.valorMinimo)) throw new Error("Informe o preço base, o valor do km ou o do minuto.");
  if (t.metodo === "hora_parada" && !(t.precoBase || t.valorKm || t.valorHoraParada || t.valorMinimo)) throw new Error("Informe o preço base, o valor do km ou o da hora parada.");
}

export function sanearExtraTarifa(e: unknown, atual?: TarifaExtra): TarifaExtra {
  const o = reg(e);
  const base = sanearCalculo(e, atual ?? CALCULO_PADRAO);
  const nome = texto(o.nome ?? atual?.nome, 60);
  if (!nome) throw new Error("Informe o nome da tarifa extra.");
  const dias = [...new Set(lista(o.dias ?? atual?.dias).map((d) => Math.round(numero(d, -1, -1, 6))).filter((d) => d >= 0))].sort();
  if (!dias.length) throw new Error("Escolha ao menos um dia da semana para a tarifa extra.");
  const inicio = String(o.inicio ?? atual?.inicio ?? "00:00"), fim = String(o.fim ?? atual?.fim ?? "23:59");
  if (!HORA.test(inicio) || !HORA.test(fim)) throw new Error("Informe o horário inicial e o final da tarifa extra.");
  conferirCalculo(base);
  return { ...base, id: texto(o.id ?? atual?.id, 20) || Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4), nome, ativa: sim(o.ativa, atual?.ativa ?? true), dias, inicio, fim };
}

const minutosDe = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3));
/** A tarifa extra vale neste momento? (vira a meia-noite quando o fim é menor que o início). "quando" é a hora de Brasília em UTC. */
export function extraVale(t: TarifaExtra, quando: Date): boolean {
  if (!t.ativa) return false;
  const dia = quando.getUTCDay(), min = quando.getUTCHours() * 60 + quando.getUTCMinutes();
  const a = minutosDe(t.inicio), b = minutosDe(t.fim);
  if (a <= b) return t.dias.includes(dia) && min >= a && min <= b;
  return (t.dias.includes(dia) && min >= a) || (t.dias.includes((dia + 6) % 7) && min <= b);
}

/** A primeira tarifa extra que vale agora; sem nenhuma, a padrão. */
export function escolherTarifa(padrao: TarifaCalculo, extras: TarifaExtra[], quando: Date): { tarifa: TarifaCalculo; extra: TarifaExtra | null } {
  const e = extras.find((x) => extraVale(x, quando)) ?? null;
  return { tarifa: e ?? padrao, extra: e };
}

/** A tarifa tem o que precisa para calcular? Senão o preço fica a combinar com o operador. */
export function tarifaPreenchida(t: TarifaCalculo): boolean {
  if (t.metodo === "tabela_km") return t.tabelaKm.length > 0;
  if (t.metodo === "bairro") return t.bairros.length > 0 || !!(t.precoBase || t.valorKm || t.valorMinuto || t.valorMinimo);
  return !!(t.precoBase || t.valorKm || t.valorMinuto || t.valorHoraParada || t.valorMinimo);
}

export interface EntradaCalculo {
  km: number | null; minutos: number | null;
  /** Minutos com o carro parado em espera (só o método "hora parada" cobra). */
  minutosParado?: number;
  /** Quantas paradas intermediárias a corrida tem. */
  paradas?: number;
  destinoTexto?: string;
  /** Acréscimo noturno em % (o que a categoria já tinha antes desta tela). */
  noturno?: number;
}
export interface ResultadoCalculo { valor: number | null; erro?: string; metodoUsado: MetodoTarifa; faixa?: number }

const dois = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Preço da corrida pela tarifa. O erro só aparece quando o percurso passa do máximo permitido. */
export function calcularTarifa(t: TarifaCalculo, e: EntradaCalculo): ResultadoCalculo {
  const km = e.km, minutos = e.minutos ?? 0;
  const r = (valor: number | null, extra: Partial<ResultadoCalculo> = {}): ResultadoCalculo => ({ valor, metodoUsado: t.metodo, ...extra });
  if (t.limiteKm > 0 && km != null && km > t.limiteKm) {
    return r(null, { erro: `Não é possível solicitar corridas com percurso maior que ${String(t.limiteKm).replace(".", ",")} km nesta categoria.` });
  }
  if (!tarifaPreenchida(t)) return r(null);
  let sub: number | null;
  let faixa: number | undefined;
  const porKm = () => t.precoBase + (km ?? 0) * t.valorKm;
  if (t.metodo === "tabela_km") {
    if (km == null) return r(null);
    const l = [...t.tabelaKm].sort((a, b) => a.ate - b.ate);
    const i = l.findIndex((f) => km <= f.ate);
    if (i >= 0) { sub = l[i].valor; faixa = i; }
    else { const u = l[l.length - 1]; sub = u.valor + (km - u.ate) * t.kmAdicional; faixa = l.length - 1; }
  } else if (t.metodo === "bairro") {
    const alvo = normal(e.destinoTexto ?? "");
    const b = alvo ? t.bairros.find((x) => normal(x.nome) && alvo.includes(normal(x.nome))) : undefined;
    sub = b ? b.valor : porKm() + minutos * t.valorMinuto;
  } else if (t.metodo === "hora_parada") sub = porKm() + ((e.minutosParado ?? 0) / 60) * t.valorHoraParada;
  else sub = porKm() + minutos * t.valorMinuto;
  if (e.noturno && e.noturno > 0) sub *= 1 + e.noturno / 100;
  sub += Math.max(0, e.paradas ?? 0) * t.paradaAdicional;
  return r(dois(Math.max(sub, t.valorMinimo)), { faixa });
}

/** Quanto a central paga ao motorista pelo deslocamento até o passageiro (0 quando não passa do mínimo de km). */
export function bonusDeDeslocamento(b: BonusDeslocamento, kmAteOPassageiro: number): number {
  if (!b.ativo || !(kmAteOPassageiro > b.minKm)) return 0;
  const bruto = b.tipo === "por_km" ? (kmAteOPassageiro - b.minKm) * b.valor : b.valor;
  return dois(b.teto > 0 ? Math.min(bruto, b.teto) : bruto);
}
