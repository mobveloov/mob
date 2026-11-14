// Config › Categorias (tarifas_categorias): o cadastro "categorias" guarda os valores básicos (nome, bandeirada, km, minuto,
// mínimo, taxa de cancelamento e a COMISSÃO DA CENTRAL: comissaoTipo/comissaoValor) que o cálculo de preço já usa;
// aqui ficam os campos a mais de cada categoria (cidade, grupo, negociação, faixas de km, bônus, dinâmicas ligadas).

import { cadastroPorId } from "../comum/cadastros.ts";
import { alterarCampos, atualizar, criar, listar, remover, type Registro } from "../cadastros/armazem.ts";
import { normal } from "../servidor/util.ts";
import { centavos, gravarConfig, lerConfig, lista, numero, sim, texto, umDe } from "./armazem.ts";
import { CALCULO_PADRAO, METODOS, conferirCalculo, escolherTarifa, sanearCalculo, sanearExtraTarifa, type MetodoTarifa, type FaixaTabelaKm, type TarifaBairro, type TarifaCalculo, type TarifaExtra } from "./tarifa-calculo.ts";

export interface FaixaKm { de: number; ate: number; valor: number }
export interface FaixaCompensacao { de: number; ate: number; modo: "diferenca" | "fixo"; valor: number }
/** Parte da tarifa padrão que não cabe no cadastro "categorias" (preço base, km, minuto e mínimo ficam lá). */
export interface TarifaPadraoExtra { metodo: MetodoTarifa; tabelaKm: FaixaTabelaKm[]; kmAdicional: number; limiteKm: number; bairros: TarifaBairro[]; valorHoraParada: number }
export interface ExtraCategoria {
  cidade: string; visivel: boolean; tipoFisico: "carro" | "moto" | "caminhao"; grupo: "Carro" | "Moto"; ordem: number; capacidade: number; raio: number;
  icone: { modo: "biblioteca" | "personalizado"; biblioteca: string; imagem: string };
  negociacao: { ativo: boolean; descontoMaxPax: number; acrescimoMaxMot: number };
  modoPrecoKm: "padrao" | "faixas"; faixasKm: FaixaKm[]; kmIncluso: number; tempoToque: number;
  paradas: { tipo: "fixo" | "rota_total"; valor: number };
  deslocamento: { ativo: boolean; minKm: number; tipo: "fixo" | "por_km"; valor: number; teto: number; junto: boolean };
  compensacao: { ativo: boolean; faixas: FaixaCompensacao[] };
  mostrarGanhoKm: boolean; permiteAgendamento: boolean;
  /** Detalhes adicionais mostrados no app (até 140 caracteres). */
  detalhes: string;
  /** Não mostrar a capacidade de pessoas no app do passageiro. */
  ocultarCapacidade: boolean;
  /** Motorista pode abrir corridas de maçaneta nesta categoria. */
  macaneta: boolean;
  /** Liga ou desliga as tarifas dinâmicas desta categoria sem perder as escolhidas. */
  dinamicaAtiva: boolean;
  /** Aumenta o valor sozinho quando a chance de aceite é baixa. */
  impulsionamentoAuto: boolean;
  /** Passageiro pode somar um valor extra para ser atendido (só imediatas). */
  valorExtraPassageiro: boolean;
  /** Mostrar só para passageiras (gênero feminino no cadastro). */
  segurancaMulheres: boolean;
  /** Que tipo de solicitação a categoria aceita. */
  solicitacoes: "ambas" | "imediatas" | "agendadas";
  /** Editar tarifa (Machine): método de cálculo da tarifa padrão e as tarifas extras por dia e horário. */
  tarifa: TarifaPadraoExtra; tarifasExtras: TarifaExtra[];
  /** ids das tarifas dinâmicas (Config › Tarifas Dinâmicas) que valem nesta categoria. */
  dinamicas: string[];
  /** Comissão por faixa de valor (Regras de Crédito): usa as regras marcadas em vez do tipo/valor fixos da categoria. */
  comissao: { usaFaixas: boolean; regras: string[] };
}

export const ICONES = ["carro-popular", "carro-conforto", "carro-premium", "moto", "moto-bau", "van", "caminhonete", "eletrico", "taxi", "mulher", "entregas", "pcd", "diversos"];

export const EXTRA_PADRAO: ExtraCategoria = {
  cidade: "", visivel: true, tipoFisico: "carro", grupo: "Carro", ordem: 1, capacidade: 4, raio: 5000,
  icone: { modo: "biblioteca", biblioteca: "carro-popular", imagem: "" },
  negociacao: { ativo: false, descontoMaxPax: 20, acrescimoMaxMot: 50 },
  modoPrecoKm: "padrao", faixasKm: [], kmIncluso: 0, tempoToque: 30,
  paradas: { tipo: "fixo", valor: 0 },
  deslocamento: { ativo: false, minKm: 0, tipo: "fixo", valor: 0, teto: 0, junto: true },
  compensacao: { ativo: false, faixas: [] },
  mostrarGanhoKm: false, permiteAgendamento: true, dinamicas: [],
  detalhes: "", ocultarCapacidade: false, macaneta: true, dinamicaAtiva: true, impulsionamentoAuto: false, valorExtraPassageiro: false, segurancaMulheres: false, solicitacoes: "ambas",
  tarifa: { metodo: "km_minuto", tabelaKm: [], kmAdicional: 0, limiteKm: 0, bairros: [], valorHoraParada: 0 }, tarifasExtras: [],
  comissao: { usaFaixas: false, regras: [] },
};

type Mapa = Record<string, ExtraCategoria>;
const CAD = () => cadastroPorId("categorias")!;

function sanearTarifaPadrao(v: unknown, atual: TarifaPadraoExtra | undefined): TarifaPadraoExtra {
  const c = sanearCalculo(v, { ...CALCULO_PADRAO, ...(atual ?? {}) });
  return { metodo: c.metodo, tabelaKm: c.tabelaKm, kmAdicional: c.kmAdicional, limiteKm: c.limiteKm, bairros: c.bairros, valorHoraParada: c.valorHoraParada };
}

export function sanearExtra(e: unknown, atual: ExtraCategoria = EXTRA_PADRAO): ExtraCategoria {
  const o = (e ?? {}) as Record<string, unknown>;
  const raiz = { ...atual, ...o } as unknown as Record<string, unknown>;
  const g = (k: string) => ({ ...((atual as unknown as Record<string, object>)[k] ?? {}), ...((o[k] as object) ?? {}) }) as Record<string, unknown>;
  const ic = g("icone"), ng = g("negociacao"), pr = g("paradas"), ds = g("deslocamento"), cp = g("compensacao"), cm = g("comissao");
  const imagem = typeof ic.imagem === "string" && /^data:image\/png;base64,[A-Za-z0-9+/=]{20,260000}$/.test(ic.imagem) ? ic.imagem : "";
  const reg = (f: unknown) => (f ?? {}) as Record<string, unknown>;
  // Quem só manda o "permiteAgendamento" (versões antigas do painel e apps) continua valendo.
  let solic = umDe(raiz.solicitacoes, ["ambas", "imediatas", "agendadas"] as const, "ambas");
  if (!("solicitacoes" in o) && "permiteAgendamento" in o) solic = sim(o.permiteAgendamento, true) ? (atual.solicitacoes === "imediatas" ? "ambas" : atual.solicitacoes) : "imediatas";
  return {
    detalhes: texto(raiz.detalhes, 140), ocultarCapacidade: sim(raiz.ocultarCapacidade), macaneta: sim(raiz.macaneta, true), dinamicaAtiva: sim(raiz.dinamicaAtiva, true),
    impulsionamentoAuto: sim(raiz.impulsionamentoAuto), valorExtraPassageiro: sim(raiz.valorExtraPassageiro) && solic !== "agendadas", segurancaMulheres: sim(raiz.segurancaMulheres),
    solicitacoes: solic, cidade: texto(raiz.cidade, 80), visivel: sim(raiz.visivel, true), tipoFisico: umDe(raiz.tipoFisico, ["carro", "moto", "caminhao"] as const, "carro"),
    grupo: umDe(raiz.grupo, ["Carro", "Moto"] as const, "Carro"), ordem: Math.round(numero(raiz.ordem, 1, 1, 999)), capacidade: Math.round(numero(raiz.capacidade, 4, 1, 60)),
    raio: Math.round(numero(raiz.raio, 5000, 100, 100_000)),
    icone: { modo: umDe(ic.modo, ["biblioteca", "personalizado"] as const, "biblioteca"), biblioteca: ICONES.includes(String(ic.biblioteca)) ? String(ic.biblioteca) : ICONES[0], imagem },
    negociacao: { ativo: sim(ng.ativo), descontoMaxPax: numero(ng.descontoMaxPax, 20, 0, 100), acrescimoMaxMot: numero(ng.acrescimoMaxMot, 50, 0, 500) },
    modoPrecoKm: umDe(raiz.modoPrecoKm, ["padrao", "faixas"] as const, "padrao"),
    faixasKm: lista(raiz.faixasKm).map((f) => { const x = reg(f); return { de: numero(x.de, 0, 0, 10_000), ate: numero(x.ate, 0, 0, 10_000), valor: centavos(numero(x.valor, 0, 0, 1000)) }; }).filter((f) => f.ate > f.de).slice(0, 20),
    kmIncluso: numero(raiz.kmIncluso, 0, 0, 1000), tempoToque: Math.round(numero(raiz.tempoToque, 30, 5, 300)),
    paradas: { tipo: umDe(pr.tipo, ["fixo", "rota_total"] as const, "fixo"), valor: centavos(numero(pr.valor, 0, 0, 1000)) },
    deslocamento: { ativo: sim(ds.ativo), minKm: numero(ds.minKm, 0, 0, 1000), tipo: umDe(ds.tipo, ["fixo", "por_km"] as const, "fixo"), valor: centavos(numero(ds.valor, 0, 0, 1000)), teto: centavos(numero(ds.teto, 0, 0, 10_000)), junto: sim(ds.junto, true) },
    compensacao: {
      ativo: sim(cp.ativo),
      faixas: lista(cp.faixas).map((f) => { const x = reg(f); return { de: centavos(numero(x.de, 0, 0, 10_000)), ate: centavos(numero(x.ate, 0, 0, 10_000)), modo: umDe(x.modo, ["diferenca", "fixo"] as const, "diferenca"), valor: centavos(numero(x.valor, 0, 0, 10_000)) }; }).filter((f) => f.ate > f.de).slice(0, 20),
    },
    mostrarGanhoKm: sim(raiz.mostrarGanhoKm), permiteAgendamento: solic !== "imediatas",
    tarifa: sanearTarifaPadrao(raiz.tarifa, atual.tarifa),
    tarifasExtras: lista(raiz.tarifasExtras).map((t) => { try { return sanearExtraTarifa(t); } catch { return null; } }).filter((t): t is TarifaExtra => !!t).slice(0, 30),
    dinamicas: lista(raiz.dinamicas).map((x) => texto(x, 20)).filter(Boolean).slice(0, 50),
    comissao: { usaFaixas: sim(cm.usaFaixas), regras: lista(cm.regras).map((x) => texto(x, 20)).filter(Boolean).slice(0, 50) },
  };
}

const todos = (empresaId: string): Mapa => lerConfig<Mapa>(empresaId, "categorias", {});
export const extraDaCategoriaId = (empresaId: string, id: string): ExtraCategoria => sanearExtra(todos(empresaId)[id], EXTRA_PADRAO);

export function registroDaCategoria(empresaId: string, nome: string): Registro | null {
  const n = normal(nome);
  return listar(empresaId, CAD()).find((r) => normal(String(r.nome ?? "")) === n) ?? null;
}
/** Campos a mais da categoria pelo NOME (é como as corridas guardam a categoria). Sem cadastro: padrão. */
export function extraDaCategoria(empresaId: string, nome: string): ExtraCategoria {
  const r = registroDaCategoria(empresaId, nome);
  if (!r) return EXTRA_PADRAO;
  const e = extraDaCategoriaId(empresaId, r.id);
  // Tarifas dinâmicas desligadas na categoria: o cálculo não enxerga nenhuma regra.
  return e.dinamicaAtiva ? e : { ...e, dinamicas: [] };
}

export interface CategoriaCompleta {
  id: string; nome: string; descricao: string; taxaBase: number; precoKm: number; precoMin: number; tarifaMinima: number; taxaCancelamento: number | null;
  comissaoTipo: "Percentual" | "Valor fixo"; comissaoValor: number; extra: ExtraCategoria;
}
const completa = (empresaId: string, r: Registro): CategoriaCompleta => ({
  id: r.id, nome: String(r.nome ?? ""), descricao: String(r.descricao ?? ""), taxaBase: Number(r.bandeirada) || 0, precoKm: Number(r.valorKm) || 0,
  precoMin: Number(r.valorMinuto) || 0, tarifaMinima: Number(r.valorMinimo) || 0, taxaCancelamento: typeof r.taxaCancelamento === "number" ? r.taxaCancelamento : null,
  comissaoTipo: r.comissaoTipo === "Valor fixo" ? "Valor fixo" : "Percentual", comissaoValor: Number(r.comissaoValor) || 0, extra: extraDaCategoriaId(empresaId, r.id),
});
export function categoriasCompletas(empresaId: string): CategoriaCompleta[] {
  return listar(empresaId, CAD()).map((r) => completa(empresaId, r)).sort((a, b) => a.extra.ordem - b.extra.ordem || a.nome.localeCompare(b.nome));
}

export interface EntradaCategoria {
  nome: string; descricao?: string; taxaBase?: unknown; precoKm?: unknown; precoMin?: unknown; tarifaMinima?: unknown; taxaCancelamento?: unknown;
  comissaoTipo?: unknown; comissaoValor?: unknown; extra?: unknown;
  /** Só na criação: vincular motoristas à categoria (nenhum, todos ou copiar de outra categoria pelo id). */
  vinculo?: { modo?: unknown; deCategoriaId?: unknown };
}
export function salvarCategoria(empresaId: string, id: string | null, e: EntradaCategoria, por: string): CategoriaCompleta {
  const nome = texto(e.nome, 60);
  if (nome.length < 2) throw new Error("Informe o nome da categoria.");
  const tipo = umDe(e.comissaoTipo, ["Percentual", "Valor fixo"] as const, "Percentual");
  const valor = centavos(numero(e.comissaoValor, 0, 0, tipo === "Percentual" ? 100 : 100_000));
  const extra = sanearExtra(e.extra, id ? extraDaCategoriaId(empresaId, id) : EXTRA_PADRAO);
  const basico = {
    nome, descricao: texto(e.descricao, 120), bandeirada: centavos(numero(e.taxaBase, 0, 0, 10_000)), valorKm: centavos(numero(e.precoKm, 0, 0, 1000)),
    valorMinuto: centavos(numero(e.precoMin, 0, 0, 1000)), valorMinimo: centavos(numero(e.tarifaMinima, 0, 0, 10_000)),
    taxaCancelamento: e.taxaCancelamento === "" || e.taxaCancelamento == null ? null : centavos(numero(e.taxaCancelamento, 0, 0, 10_000)),
    comissaoTipo: tipo, comissaoValor: valor, ativa: true,
  };
  const r = id ? atualizar(empresaId, CAD(), id, basico, por) : criar(empresaId, CAD(), basico, por);
  gravarConfig(empresaId, "categorias", { ...todos(empresaId), [r.id]: extra });
  if (!id) vincularMotoristas(empresaId, nome, e.vinculo, por);
  return completa(empresaId, listar(empresaId, CAD()).find((x) => x.id === r.id)!);
}

const separar = (v: unknown) => String(v ?? "").split(",").map((x) => x.trim()).filter(Boolean);

/** Vincula motoristas à categoria nova (campo "categorias" do motorista, separado por vírgula). */
function vincularMotoristas(empresaId: string, nome: string, v: EntradaCategoria["vinculo"], por: string) {
  const modo = umDe(v?.modo, ["nenhum", "todos", "copiar"] as const, "nenhum");
  if (modo === "nenhum") return;
  const cadMot = cadastroPorId("motoristas")!;
  let origem: string | null = null;
  if (modo === "copiar") {
    const c = listar(empresaId, CAD()).find((x) => x.id === String(v?.deCategoriaId ?? ""));
    if (!c) throw new Error("Escolha a categoria de onde copiar os motoristas.");
    origem = normal(String(c.nome ?? ""));
  }
  for (const m of listar(empresaId, cadMot)) {
    const atuais = separar(m.categorias);
    if (atuais.some((x) => normal(x) === normal(nome))) continue;
    if (origem && !atuais.some((x) => normal(x) === origem)) continue;
    alterarCampos(empresaId, cadMot, m.id, { categorias: [...atuais, nome].join(", ") }, por);
  }
}

export function removerCategoria(empresaId: string, id: string) {
  remover(empresaId, CAD(), id);
  const t = { ...todos(empresaId) };
  delete t[id];
  gravarConfig(empresaId, "categorias", t);
}

// ------------------------------------------------------------------ Editar tarifa (tarifa padrão e tarifas extras)

/** A tarifa padrão da categoria: valores do cadastro + método, tabela de KM, bairros e extras guardados na configuração. */
export function tarifaPadraoDe(r: Registro, extra: ExtraCategoria): TarifaCalculo {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return {
    ...CALCULO_PADRAO, ...extra.tarifa,
    precoBase: n(r.bandeirada), valorKm: n(r.valorKm), valorMinuto: n(r.valorMinuto), valorMinimo: n(r.valorMinimo),
    paradaAdicional: extra.paradas.tipo === "fixo" ? extra.paradas.valor : 0,
    bonusDeslocamento: { ativo: extra.deslocamento.ativo, minKm: extra.deslocamento.minKm, tipo: extra.deslocamento.tipo, valor: extra.deslocamento.valor, teto: extra.deslocamento.teto },
  };
}

/** Tarifa que vale agora para a categoria (pelo nome): uma extra do dia e horário, ou a padrão. Sem cadastro: null. */
export function tarifaVigente(empresaId: string, nome: string, quando: Date): { tarifa: TarifaCalculo; extra: TarifaExtra | null; registro: Registro } | null {
  const r = registroDaCategoria(empresaId, nome);
  if (!r) return null;
  const ex = extraDaCategoriaId(empresaId, r.id);
  return { ...escolherTarifa(tarifaPadraoDe(r, ex), ex.tarifasExtras, quando), registro: r };
}

const registroPorId = (empresaId: string, id: string): Registro => {
  const r = listar(empresaId, CAD()).find((x) => x.id === id);
  if (!r) throw new Error("Categoria não encontrada.");
  return r;
};

/** Editar tarifa (padrão): método de cálculo, componentes principais e extras. Só mexe nesta parte da categoria. */
export function salvarTarifaPadrao(empresaId: string, id: string, entrada: unknown, por: string): CategoriaCompleta {
  const r = registroPorId(empresaId, id);
  const ex = extraDaCategoriaId(empresaId, id);
  const t = sanearCalculo(entrada, tarifaPadraoDe(r, ex));
  conferirCalculo(t);
  alterarCampos(empresaId, CAD(), id, { bandeirada: t.precoBase, valorKm: t.valorKm, valorMinuto: t.valorMinuto, valorMinimo: t.valorMinimo }, por);
  const novo: ExtraCategoria = {
    ...ex,
    tarifa: { metodo: t.metodo, tabelaKm: t.tabelaKm, kmAdicional: t.kmAdicional, limiteKm: t.limiteKm, bairros: t.bairros, valorHoraParada: t.valorHoraParada },
    paradas: { tipo: "fixo", valor: t.paradaAdicional }, deslocamento: { ...ex.deslocamento, ...t.bonusDeslocamento },
  };
  gravarConfig(empresaId, "categorias", { ...todos(empresaId), [id]: novo });
  return completa(empresaId, registroPorId(empresaId, id));
}

/** Cria ou edita uma tarifa extra (dias e horários próprios). Com "id" no corpo, troca a que já existe. */
export function salvarTarifaExtra(empresaId: string, id: string, entrada: unknown): CategoriaCompleta {
  const r = registroPorId(empresaId, id);
  const ex = extraDaCategoriaId(empresaId, id);
  const idExtra = texto((entrada as Record<string, unknown> | null)?.id, 20);
  const atual = ex.tarifasExtras.find((x) => x.id === idExtra);
  if (idExtra && !atual) throw new Error("Tarifa extra não encontrada.");
  const t = sanearExtraTarifa(entrada, atual);
  const lista2 = atual ? ex.tarifasExtras.map((x) => (x.id === t.id ? t : x)) : [...ex.tarifasExtras, t];
  if (lista2.length > 30) throw new Error("No máximo 30 tarifas extras por categoria.");
  gravarConfig(empresaId, "categorias", { ...todos(empresaId), [id]: { ...ex, tarifasExtras: lista2 } });
  return completa(empresaId, r);
}

export function removerTarifaExtra(empresaId: string, id: string, idExtra: string): CategoriaCompleta {
  const r = registroPorId(empresaId, id);
  const ex = extraDaCategoriaId(empresaId, id);
  if (!ex.tarifasExtras.some((x) => x.id === idExtra)) throw new Error("Tarifa extra não encontrada.");
  gravarConfig(empresaId, "categorias", { ...todos(empresaId), [id]: { ...ex, tarifasExtras: ex.tarifasExtras.filter((x) => x.id !== idExtra) } });
  return completa(empresaId, r);
}

export const METODOS_TARIFA = METODOS;
