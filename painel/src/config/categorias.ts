// Config › Categorias (tarifas_categorias): o cadastro "categorias" guarda os valores básicos (nome, bandeirada, km, minuto,
// mínimo, taxa de cancelamento e a COMISSÃO DA CENTRAL: comissaoTipo/comissaoValor) que o cálculo de preço já usa;
// aqui ficam os campos a mais de cada categoria (cidade, grupo, negociação, faixas de km, bônus, dinâmicas ligadas).

import { cadastroPorId } from "../comum/cadastros.ts";
import { atualizar, criar, listar, remover, type Registro } from "../cadastros/armazem.ts";
import { normal } from "../servidor/util.ts";
import { centavos, gravarConfig, lerConfig, lista, numero, sim, texto, umDe } from "./armazem.ts";

export interface FaixaKm { de: number; ate: number; valor: number }
export interface FaixaCompensacao { de: number; ate: number; modo: "diferenca" | "fixo"; valor: number }
export interface ExtraCategoria {
  cidade: string; visivel: boolean; tipoFisico: "carro" | "moto" | "caminhao"; grupo: "Carro" | "Moto"; ordem: number; capacidade: number; raio: number;
  icone: { modo: "biblioteca" | "personalizado"; biblioteca: string; imagem: string };
  negociacao: { ativo: boolean; descontoMaxPax: number; acrescimoMaxMot: number };
  modoPrecoKm: "padrao" | "faixas"; faixasKm: FaixaKm[]; kmIncluso: number; tempoToque: number;
  paradas: { tipo: "fixo" | "rota_total"; valor: number };
  deslocamento: { ativo: boolean; minKm: number; tipo: "fixo" | "por_km"; valor: number; teto: number; junto: boolean };
  compensacao: { ativo: boolean; faixas: FaixaCompensacao[] };
  mostrarGanhoKm: boolean; permiteAgendamento: boolean;
  /** ids das tarifas dinâmicas (Config › Tarifas Dinâmicas) que valem nesta categoria. */
  dinamicas: string[];
  /** Comissão por faixa de valor (Regras de Crédito): usa as regras marcadas em vez do tipo/valor fixos da categoria. */
  comissao: { usaFaixas: boolean; regras: string[] };
}

export const ICONES = ["carro-popular", "carro-conforto", "carro-premium", "moto", "moto-bau", "van", "caminhonete", "eletrico"];

export const EXTRA_PADRAO: ExtraCategoria = {
  cidade: "", visivel: true, tipoFisico: "carro", grupo: "Carro", ordem: 1, capacidade: 4, raio: 5000,
  icone: { modo: "biblioteca", biblioteca: "carro-popular", imagem: "" },
  negociacao: { ativo: false, descontoMaxPax: 20, acrescimoMaxMot: 50 },
  modoPrecoKm: "padrao", faixasKm: [], kmIncluso: 0, tempoToque: 30,
  paradas: { tipo: "fixo", valor: 0 },
  deslocamento: { ativo: false, minKm: 0, tipo: "fixo", valor: 0, teto: 0, junto: true },
  compensacao: { ativo: false, faixas: [] },
  mostrarGanhoKm: false, permiteAgendamento: true, dinamicas: [],
  comissao: { usaFaixas: false, regras: [] },
};

type Mapa = Record<string, ExtraCategoria>;
const CAD = () => cadastroPorId("categorias")!;

export function sanearExtra(e: unknown, atual: ExtraCategoria = EXTRA_PADRAO): ExtraCategoria {
  const o = (e ?? {}) as Record<string, unknown>;
  const raiz = { ...atual, ...o } as unknown as Record<string, unknown>;
  const g = (k: string) => ({ ...((atual as unknown as Record<string, object>)[k] ?? {}), ...((o[k] as object) ?? {}) }) as Record<string, unknown>;
  const ic = g("icone"), ng = g("negociacao"), pr = g("paradas"), ds = g("deslocamento"), cp = g("compensacao"), cm = g("comissao");
  const imagem = typeof ic.imagem === "string" && /^data:image\/png;base64,[A-Za-z0-9+/=]{20,260000}$/.test(ic.imagem) ? ic.imagem : "";
  const reg = (f: unknown) => (f ?? {}) as Record<string, unknown>;
  return {
    cidade: texto(raiz.cidade, 80), visivel: sim(raiz.visivel, true), tipoFisico: umDe(raiz.tipoFisico, ["carro", "moto", "caminhao"] as const, "carro"),
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
    mostrarGanhoKm: sim(raiz.mostrarGanhoKm), permiteAgendamento: sim(raiz.permiteAgendamento, true),
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
  return r ? extraDaCategoriaId(empresaId, r.id) : EXTRA_PADRAO;
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
  return completa(empresaId, listar(empresaId, CAD()).find((x) => x.id === r.id)!);
}

export function removerCategoria(empresaId: string, id: string) {
  remover(empresaId, CAD(), id);
  const t = { ...todos(empresaId) };
  delete t[id];
  gravarConfig(empresaId, "categorias", t);
}
