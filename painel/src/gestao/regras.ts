// Regras da gestão de motoristas que o despacho respeita (sempre por empresa):
//
// - Situação: só "Ativo" recebe corrida (já era assim no despacho).
// - Punição em vigor: o motorista não recebe corrida até ser liberado (ou o prazo acabar).
// - Cerca eletrônica: "área de permissão" (só recebe corridas que partem de dentro dela) e "áreas de bloqueio"
//   (não recebe enquanto ele estiver dentro de uma delas).
// - Controle de créditos: saldo mínimo para receber corrida (padrão da empresa, desativado ou exclusivo do motorista).
// - Nível (prioridade de toque): prioritário, secundário, reserva — desempata quem recebe primeiro.
// - Modo fantasma: o motorista some do mapa da central, mas recebe corridas normalmente.

import crypto from "node:crypto";
import { cadastroPorId } from "../comum/cadastros.ts";
import { atualizar, listar } from "../cadastros/armazem.ts";
import type { CorridaPropria } from "../corridas/index.ts";
import { saldo, saldos } from "../apps/extras.ts";
import { hashSenha } from "../servidor/dados.ts";
import { arred, normal } from "../servidor/util.ts";
import { gravarG, lerG } from "./armazem.ts";
import { limparBloqueio, limparCor, limparPrioridade, type Bloqueio } from "../areas/areas.ts";

// ====================================================================== áreas (cidades e perímetros)

export type Ponto = [number, number];
export interface Area { id: string; nome: string; fuso: string; poligono: Ponto[]; criadoEm: string; prioridade?: number; cor?: string; bloqueio?: Bloqueio }
export const FUSOS: Record<string, string> = {
  "America/Sao_Paulo": "Brasília (UTC-3)", "America/Cuiaba": "Cuiabá (UTC-4)", "America/Manaus": "Manaus (UTC-4)",
  "America/Rio_Branco": "Acre (UTC-5)", "America/Noronha": "F. Noronha (UTC-2)",
};

export const areas = (empresaId: string) => lerG<Area[]>(empresaId, "areas", []);

function limparPoligono(v: unknown): Ponto[] {
  if (!Array.isArray(v)) return [];
  const pts = v.filter((p) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === "number" && Number.isFinite(n)) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180)
    .map((p) => [arred(p[0], 6), arred(p[1], 6)] as Ponto);
  if (pts.length > 500) throw new Error("Perímetro com pontos demais (máximo 500).");
  if (pts.length && pts.length < 3) throw new Error("Desenhe pelo menos 3 pontos no mapa.");
  return pts;
}

export function salvarArea(empresaId: string, entrada: { id?: string; nome?: unknown; fuso?: unknown; poligono?: unknown; prioridade?: unknown; cor?: unknown; bloqueio?: unknown }): Area {
  const nome = String(entrada.nome ?? "").replace(/[<>]/g, "").trim().slice(0, 80);
  if (nome.length < 2) throw new Error("Informe o nome da cidade.");
  const fuso = FUSOS[String(entrada.fuso)] ? String(entrada.fuso) : "America/Sao_Paulo";
  const poligono = limparPoligono(entrada.poligono);
  const l = areas(empresaId);
  if (l.some((a) => a.id !== entrada.id && normal(a.nome) === normal(nome))) throw new Error("Já existe uma área com este nome.");
  const extras = {
    ...(entrada.prioridade !== undefined ? { prioridade: limparPrioridade(entrada.prioridade) } : {}),
    ...(entrada.cor !== undefined ? { cor: limparCor(entrada.cor) } : {}),
    ...(entrada.bloqueio !== undefined ? { bloqueio: limparBloqueio(entrada.bloqueio, poligono) } : {}),
  };
  if (entrada.id) {
    const a = l.find((x) => x.id === entrada.id);
    if (!a) throw new Error("Área não encontrada.");
    Object.assign(a, { nome, fuso, poligono, ...extras });
    gravarG(empresaId, "areas", l);
    return a;
  }
  const a: Area = { id: crypto.randomUUID(), nome, fuso, poligono, criadoEm: new Date().toISOString(), prioridade: 1, ...extras };
  gravarG(empresaId, "areas", [...l, a]);
  return a;
}

export function removerArea(empresaId: string, id: string) {
  const l = areas(empresaId);
  if (!l.some((a) => a.id === id)) throw new Error("Área não encontrada.");
  gravarG(empresaId, "areas", l.filter((a) => a.id !== id));
  // Tira a área das cercas que a usavam.
  const cfg = configs(empresaId);
  for (const c of Object.values(cfg)) {
    if (c.cerca.permissao === id) c.cerca.permissao = null;
    c.cerca.bloqueios = c.cerca.bloqueios.filter((b) => b !== id);
  }
  gravarG(empresaId, "motoristas", cfg);
}

/** Ponto dentro do polígono (raio cruzando as arestas). */
export function dentro(lat: number, lng: number, pol: Ponto[]): boolean {
  if (pol.length < 3) return false;
  let d = false;
  for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
    const [yi, xi] = pol[i], [yj, xj] = pol[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) d = !d;
  }
  return d;
}

// ====================================================================== configuração por motorista

export type ModoTaxa = "padrao" | "personalizado" | "isento";
export type ModoSaldo = "padrao" | "desativado" | "personalizado";
export interface ConfigMotorista {
  taxa: { modo: ModoTaxa; tipo: "porcentagem" | "fixo"; valor: number };
  saldo: { modo: ModoSaldo; minimo: number };
  mensagens: { modo: ModoSaldo; valor: number };
  saque: boolean;
  cerca: { permissao: string | null; bloqueios: string[] };
  senhaHash: string;
  senhaEm: string;
}
const CONFIG_PADRAO: ConfigMotorista = {
  taxa: { modo: "padrao", tipo: "porcentagem", valor: 0 }, saldo: { modo: "padrao", minimo: -50 }, mensagens: { modo: "padrao", valor: 0 },
  saque: true, cerca: { permissao: null, bloqueios: [] }, senhaHash: "", senhaEm: "",
};

const configs = (empresaId: string) => lerG<Record<string, ConfigMotorista>>(empresaId, "motoristas", {});

/** Cobrança do motorista: vive no cadastro (cobranca, cobrancaTipo, cobrancaValor), para a comissão da central ler. */
function taxaDoCadastro(empresaId: string, motoristaId: string): ConfigMotorista["taxa"] {
  const m = listar(empresaId, cadastroPorId("motoristas")!).find((x) => x.id === motoristaId);
  const modo = m?.cobranca === "Isento" ? "isento" : m?.cobranca === "Personalizado" ? "personalizado" : "padrao";
  return { modo, tipo: m?.cobrancaTipo === "Valor fixo" ? "fixo" : "porcentagem", valor: modo === "personalizado" ? Number(m?.cobrancaValor) || 0 : 0 };
}

export function configMotorista(empresaId: string, motoristaId: string): ConfigMotorista {
  const c = configs(empresaId)[motoristaId];
  return { ...structuredClone(CONFIG_PADRAO), ...c, cerca: { ...CONFIG_PADRAO.cerca, ...c?.cerca }, taxa: taxaDoCadastro(empresaId, motoristaId) };
}

function gravarConfig(empresaId: string, motoristaId: string, c: ConfigMotorista) {
  const todas = configs(empresaId);
  todas[motoristaId] = c;
  gravarG(empresaId, "motoristas", todas);
}

const numeroOu = (v: unknown, padrao: number) => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? arred(n) : padrao;
};

/** Regras de cobrança (taxa) e de crédito (saldo mínimo, mensagem de recarga, saque) do motorista. */
export function salvarFinanceiro(empresaId: string, motoristaId: string, e: Record<string, unknown>, por = "Central"): ConfigMotorista {
  const c = configMotorista(empresaId, motoristaId);
  const taxa = (e.taxa ?? {}) as Record<string, unknown>, sal = (e.saldo ?? {}) as Record<string, unknown>, msg = (e.mensagens ?? {}) as Record<string, unknown>;
  if (e.taxa) {
    const modo = (["padrao", "personalizado", "isento"] as const).find((m) => m === taxa.modo) ?? "padrao";
    const tipo = (["porcentagem", "fixo"] as const).find((m) => m === taxa.tipo) ?? "porcentagem";
    const valor = numeroOu(taxa.valor, 0);
    if (modo === "personalizado" && (valor < 0 || (tipo === "porcentagem" && valor > 100))) throw new Error("Valor da taxa inválido.");
    c.taxa = { modo, tipo, valor: modo === "personalizado" ? valor : 0 };
    const atual = listar(empresaId, cadastroPorId("motoristas")!).find((x) => x.id === motoristaId);
    if (atual) atualizar(empresaId, cadastroPorId("motoristas")!, motoristaId, {
      ...atual, cobranca: modo === "isento" ? "Isento" : modo === "personalizado" ? "Personalizado" : "Padrão",
      cobrancaTipo: tipo === "fixo" ? "Valor fixo" : "Percentual", cobrancaValor: c.taxa.valor,
    }, por);
  }
  if (e.saldo) {
    const modo = (["padrao", "desativado", "personalizado"] as const).find((m) => m === sal.modo) ?? "padrao";
    const minimo = numeroOu(sal.minimo, NaN);
    if (modo === "personalizado" && !Number.isFinite(minimo)) throw new Error("Informe o saldo mínimo (use negativo para permitir dívida).");
    c.saldo = { modo, minimo: modo === "personalizado" ? minimo : -50 };
  }
  if (e.mensagens) {
    const modo = (["padrao", "desativado", "personalizado"] as const).find((m) => m === msg.modo) ?? "padrao";
    c.mensagens = { modo, valor: modo === "personalizado" ? numeroOu(msg.valor, 0) : 0 };
  }
  if (typeof e.saque === "boolean") c.saque = e.saque;
  gravarConfig(empresaId, motoristaId, c);
  return configMotorista(empresaId, motoristaId);
}

export function salvarCerca(empresaId: string, motoristaId: string, e: { permissao?: unknown; bloqueios?: unknown }): ConfigMotorista {
  const ids = new Set(areas(empresaId).map((a) => a.id));
  const permissao = e.permissao ? String(e.permissao) : null;
  if (permissao && !ids.has(permissao)) throw new Error("Área de permissão não encontrada.");
  const bloqueios = [...new Set(Array.isArray(e.bloqueios) ? e.bloqueios.map(String) : [])];
  if (bloqueios.some((b) => !ids.has(b))) throw new Error("Área de bloqueio não encontrada.");
  const c = configMotorista(empresaId, motoristaId);
  c.cerca = { permissao, bloqueios };
  gravarConfig(empresaId, motoristaId, c);
  return c;
}

export function definirSenha(empresaId: string, motoristaId: string, senha: string) {
  if (senha.trim().length < 6) throw new Error("A senha precisa de pelo menos 6 caracteres.");
  const c = configMotorista(empresaId, motoristaId);
  c.senhaHash = hashSenha(senha.trim());
  c.senhaEm = new Date().toISOString();
  gravarConfig(empresaId, motoristaId, c);
}

// ====================================================================== créditos (padrão da empresa)

export interface ConfigCreditos {
  /** Saldo mínimo para receber corrida. null = sem bloqueio por saldo. */
  saldoMinimo: number | null;
  /** Avisar o motorista quando o saldo chegar a este valor. null = sem aviso. */
  avisoRecarga: number | null;
  taxa: { tipo: "porcentagem" | "fixo"; valor: number };
}
export const creditosPadrao = (empresaId: string): ConfigCreditos => ({ saldoMinimo: null, avisoRecarga: null, taxa: { tipo: "porcentagem", valor: 0 }, ...lerG<Partial<ConfigCreditos>>(empresaId, "creditos", {}) });

export function salvarCreditosPadrao(empresaId: string, e: Record<string, unknown>): ConfigCreditos {
  const t = (e.taxa ?? {}) as Record<string, unknown>;
  const opc = (v: unknown) => (v == null || v === "" ? null : numeroOu(v, NaN));
  const c: ConfigCreditos = {
    saldoMinimo: opc(e.saldoMinimo), avisoRecarga: opc(e.avisoRecarga),
    taxa: { tipo: (["porcentagem", "fixo"] as const).find((x) => x === t.tipo) ?? "porcentagem", valor: Math.max(0, numeroOu(t.valor, 0)) },
  };
  if (Number.isNaN(c.saldoMinimo) || Number.isNaN(c.avisoRecarga)) throw new Error("Valor inválido.");
  gravarG(empresaId, "creditos", c);
  return c;
}

/** Saldo mínimo que vale para o motorista (null = não bloqueia por saldo). */
export function saldoMinimoDe(c: ConfigMotorista, padrao: ConfigCreditos): number | null {
  if (c.saldo.modo === "desativado") return null;
  if (c.saldo.modo === "personalizado") return c.saldo.minimo;
  return padrao.saldoMinimo;
}

export function situacaoCreditos(empresaId: string, motoristaId: string) {
  const c = configMotorista(empresaId, motoristaId);
  const minimo = saldoMinimoDe(c, creditosPadrao(empresaId));
  const s = saldo(empresaId, "motorista", motoristaId);
  return { saldo: s, minimo, bloqueado: minimo != null && s < minimo, consumoAtivo: c.taxa.modo !== "isento" };
}

// ====================================================================== punições

export interface Punicao { id: string; motoristaId: string; motivo: string; inicio: string; fim: string; por: string; liberadaEm: string | null; liberadaPor: string }

export const punicoes = (empresaId: string) => lerG<Punicao[]>(empresaId, "punicoes", []);
const emVigor = (p: Punicao, agora = Date.now()) => !p.liberadaEm && Date.parse(p.fim) > agora;
export const punicoesEmVigor = (empresaId: string) => punicoes(empresaId).filter((p) => emVigor(p));

export function punir(empresaId: string, motoristaId: string, tempo: number, unidade: "horas" | "dias", motivo: string, por: string): Punicao {
  if (!listar(empresaId, cadastroPorId("motoristas")!).some((m) => m.id === motoristaId)) throw new Error("Escolha o motorista.");
  if (!Number.isFinite(tempo) || tempo <= 0 || tempo > (unidade === "dias" ? 3650 : 24 * 3650)) throw new Error("Tempo inválido.");
  const m = motivo.replace(/[<>]/g, "").trim().slice(0, 300);
  if (!m) throw new Error("Escreva o motivo.");
  const inicio = new Date();
  const p: Punicao = { id: crypto.randomUUID(), motoristaId, motivo: m, inicio: inicio.toISOString(), fim: new Date(inicio.getTime() + tempo * (unidade === "dias" ? 86_400_000 : 3_600_000)).toISOString(), por, liberadaEm: null, liberadaPor: "" };
  gravarG(empresaId, "punicoes", [...punicoes(empresaId), p]);
  return p;
}

export function liberarPunicao(empresaId: string, id: string, por: string) {
  const l = punicoes(empresaId);
  const p = l.find((x) => x.id === id);
  if (!p) throw new Error("Punição não encontrada.");
  p.liberadaEm = new Date().toISOString(); p.liberadaPor = por;
  gravarG(empresaId, "punicoes", l);
  return p;
}

// ====================================================================== despacho

const RANK_NIVEL: Record<string, number> = { "Prioritário": 0, "Secundário": 1, Reserva: 2 };

/**
 * Foto das regras para uma rodada do despacho (lida uma vez por rodada).
 * `pode` diz se o motorista pode receber a corrida; `nivel` dá a ordem de prioridade (0 = primeiro).
 */
export function regrasDoDespacho(empresaId: string, cadastro: Map<string, Record<string, unknown>>) {
  const cfg = configs(empresaId);
  const padrao = creditosPadrao(empresaId);
  const porArea = new Map(areas(empresaId).map((a) => [a.id, a]));
  const punidos = new Set(punicoesEmVigor(empresaId).map((p) => p.motoristaId));
  const saldoDe = new Map(saldos(empresaId).filter((s) => s.papel === "motorista").map((s) => [s.chave, s.saldo]));
  return {
    pode(motoristaId: string, c: CorridaPropria, pos: { lat: number; lng: number }): boolean {
      if (punidos.has(motoristaId)) return false;
      const conf = cfg[motoristaId];
      if (conf) {
        const cerca = { ...CONFIG_PADRAO.cerca, ...conf.cerca };
        const perm = cerca.permissao ? porArea.get(cerca.permissao) : null;
        if (perm && perm.poligono.length >= 3) {
          if (c.embarque.lat == null || c.embarque.lng == null || !dentro(c.embarque.lat, c.embarque.lng, perm.poligono)) return false;
        }
        for (const b of cerca.bloqueios) { const a = porArea.get(b); if (a && dentro(pos.lat, pos.lng, a.poligono)) return false; }
      }
      const minimo = saldoMinimoDe({ ...CONFIG_PADRAO, ...conf, saldo: { ...CONFIG_PADRAO.saldo, ...conf?.saldo } }, padrao);
      if (minimo != null && (saldoDe.get(motoristaId) ?? 0) < minimo) return false;
      return true;
    },
    nivel: (motoristaId: string) => RANK_NIVEL[String(cadastro.get(motoristaId)?.nivel ?? "")] ?? 1,
  };
}

/** Motoristas em modo fantasma (somem do mapa da central). */
export const fantasmas = (empresaId: string) => new Set(listar(empresaId, cadastroPorId("motoristas")!).filter((m) => m.fantasma === true).map((m) => m.id));

