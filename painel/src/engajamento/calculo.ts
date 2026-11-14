// Mapa de engajamento no formato da Machine: cada indicador divide motoristas ou passageiros em três faixas
// (dois limites, ajustáveis, mais período próprio quando faz sentido). Tudo por empresa: nenhuma função
// lê dados de outra empresa. Datas no padrão do painel: horário de Brasília gravado como UTC (AAAA-MM-DD...).
//
// Motoristas: Tempo online, Hora trabalhada, Corridas, Ausência, Frequência de trabalho, Avaliações, Tempo de casa.
// Passageiros: Solicitações, Frequência de uso, Cancelamento, Estimativas, Avaliações, Tempo de casa.

import crypto from "node:crypto";
import { cadastroPorId } from "../comum/cadastros.ts";
import { listar } from "../cadastros/armazem.ts";
import { listarProprias, type CorridaPropria } from "../corridas/index.ts";
import { estaOnline } from "../apps/despacho.ts";
import { cotacoes } from "../operacao/radar.ts";
import { gravarOperacao, lerOperacao } from "../operacao/armazem.ts";
import { banco } from "../servidor/banco.ts";
import { agoraBr } from "../servidor/util.ts";

export type Papel = "motoristas" | "passageiros";
export const PAPEIS: Papel[] = ["motoristas", "passageiros"];
export type Esquema = "sem" | "inv" | "neu";
export type TipoPeriodo = "dias" | "semanas" | "nenhum";
export interface Periodo { tipo: string; inicio?: string; fim?: string }

export interface DefIndicador {
  id: string; rotulo: string; icone: string;
  /** Nome das três faixas, do menor valor ao maior. */
  nomes: [string, string, string];
  /** "sem": menor valor é ruim; "inv": menor valor é bom; "neu": sem juízo de valor (cinzas). */
  esquema: Esquema;
  sufixo: string; passo: number; max: number; casas: number;
  periodoTipo: TipoPeriodo;
  explicacao: string;
  padrao: { a: number; b: number; periodo: Periodo };
}

const e = (d: Omit<DefIndicador, "casas"> & { casas?: number }): DefIndicador => ({ casas: 0, ...d });

export const INDICADORES: Record<Papel, DefIndicador[]> = {
  motoristas: [
    e({ id: "tempoOnline", rotulo: "Tempo online", icone: "schedule", nomes: ["Ruim", "Aceitável", "Bom"], esquema: "sem", sufixo: " h", passo: 0.5, max: 24, casas: 1, periodoTipo: "dias",
      explicacao: "Quantas horas por dia o motorista fica com o aplicativo aberto, esperando corrida. Escolha um período e o número mostrado é a média de horas por dia nesse período. Por exemplo: com Últimos 30 dias, quem ficou 90 horas online no mês aparece como 3 horas por dia.",
      padrao: { a: 4, b: 8.5, periodo: { tipo: "30" } } }),
    e({ id: "horaTrabalhada", rotulo: "Hora trabalhada", icone: "timer", nomes: ["Ruim", "Aceitável", "Bom"], esquema: "sem", sufixo: " h", passo: 0.1, max: 24, casas: 1, periodoTipo: "dias",
      explicacao: "Quantas horas por dia o motorista passa de fato dentro de uma corrida, com passageiro no carro. É sempre menor que o tempo online, porque não conta a espera. Comparar os dois mostra quanto do tempo dele virou corrida.",
      padrao: { a: 0.5, b: 1.5, periodo: { tipo: "30" } } }),
    e({ id: "corridas", rotulo: "Corridas", icone: "directions_car", nomes: ["Ruim", "Aceitável", "Bom"], esquema: "sem", sufixo: " corridas", passo: 1, max: 1000, periodoTipo: "dias",
      explicacao: "Quantas corridas o motorista terminou no período escolhido. Aqui é o total somado, não uma média por dia. Se você trocar o período, o número muda de tamanho — 30 corridas é pouco em um mês e muito em uma semana — então confira as faixas depois de trocar.",
      padrao: { a: 20, b: 80, periodo: { tipo: "30" } } }),
    e({ id: "ausencia", rotulo: "Ausência", icone: "pause_circle_outline", nomes: ["Curta", "Média", "Longa"], esquema: "inv", sufixo: " dias", passo: 1, max: 365, periodoTipo: "nenhum",
      explicacao: "Quantos dias faz que o motorista não abre o aplicativo. Não tem período para escolher: a contagem vai até hoje e cresce sozinha a cada dia que ele não aparece.",
      padrao: { a: 4, b: 30, periodo: { tipo: "nenhum" } } }),
    e({ id: "frequenciaTrabalho", rotulo: "Frequência de trabalho", icone: "event", nomes: ["Esporádico", "Recorrente", "Dedicado"], esquema: "sem", sufixo: " dias/semana", passo: 0.5, max: 7, casas: 1, periodoTipo: "semanas",
      explicacao: "Em quantos dias da semana o motorista faz pelo menos uma corrida. Escolha um período e o número mostrado é a média por semana. Por exemplo: com Últimas 4 semanas, quem rodou em 12 dias aparece como 3 dias por semana.",
      padrao: { a: 2, b: 4, periodo: { tipo: "4" } } }),
    e({ id: "avaliacoes", rotulo: "Avaliações", icone: "star", nomes: ["Ruim", "Aceitável", "Bom"], esquema: "sem", sufixo: " estrelas", passo: 0.1, max: 5, casas: 1, periodoTipo: "nenhum",
      explicacao: "A nota que os passageiros dão para o motorista, de 1 a 5 estrelas. O sistema já mantém essa média pronta, olhando as corridas mais recentes. Não tem período para escolher: é a nota que vale hoje.",
      padrao: { a: 4.6, b: 4.8, periodo: { tipo: "nenhum" } } }),
    e({ id: "tempoCasa", rotulo: "Tempo de casa", icone: "person", nomes: ["Novato", "Regular", "Experiente"], esquema: "neu", sufixo: " dias", passo: 1, max: 3650, periodoTipo: "nenhum",
      explicacao: "Há quantos dias o motorista se cadastrou. Não tem período para escolher: a conta vai da data do cadastro até hoje.",
      padrao: { a: 45, b: 240, periodo: { tipo: "nenhum" } } }),
  ],
  passageiros: [
    e({ id: "solicitacoes", rotulo: "Solicitações", icone: "place", nomes: ["Baixo", "Médio", "Alto"], esquema: "sem", sufixo: " solicitações", passo: 1, max: 1000, periodoTipo: "dias",
      explicacao: "Quantas corridas o passageiro pediu no período escolhido. É o total somado. Se você trocar o período, o número muda de tamanho, então confira as faixas depois de trocar.",
      padrao: { a: 4, b: 10, periodo: { tipo: "30" } } }),
    e({ id: "frequenciaUso", rotulo: "Frequência de uso", icone: "event", nomes: ["Esporádico", "Recorrente", "Frequente"], esquema: "sem", sufixo: " dias/semana", passo: 0.5, max: 7, casas: 1, periodoTipo: "semanas",
      explicacao: "Em quantos dias da semana o passageiro pede pelo menos uma corrida. Escolha um período e o número mostrado é a média por semana. Solicitações conta quantas vezes ele pediu; aqui conta com que constância.",
      padrao: { a: 1, b: 3, periodo: { tipo: "4" } } }),
    e({ id: "cancelamento", rotulo: "Cancelamento", icone: "cancel", nomes: ["Bom", "Aceitável", "Ruim"], esquema: "inv", sufixo: "%", passo: 1, max: 100, periodoTipo: "dias",
      explicacao: "De cada 100 corridas que o passageiro pediu no período escolhido, quantas ele mesmo cancelou.",
      padrao: { a: 8, b: 30, periodo: { tipo: "30" } } }),
    e({ id: "estimativas", rotulo: "Estimativas", icone: "local_offer", nomes: ["Ruim", "Aceitável", "Bom"], esquema: "sem", sufixo: "%", passo: 1, max: 100, periodoTipo: "dias",
      explicacao: "Quando o passageiro consulta o preço antes de pedir, isso é uma estimativa. Aqui aparece, de cada 100 consultas, quantas viraram pedido de corrida. Faixa baixa é quem olha o preço e desiste.",
      padrao: { a: 30, b: 60, periodo: { tipo: "30" } } }),
    e({ id: "avaliacoes", rotulo: "Avaliações", icone: "star", nomes: ["Ruim", "Aceitável", "Bom"], esquema: "sem", sufixo: " estrelas", passo: 0.1, max: 5, casas: 1, periodoTipo: "nenhum",
      explicacao: "A nota que os motoristas dão para o passageiro, de 1 a 5 estrelas. O sistema já mantém essa média pronta. Não tem período para escolher: é a nota que vale hoje.",
      padrao: { a: 4.4, b: 4.8, periodo: { tipo: "nenhum" } } }),
    e({ id: "tempoCasa", rotulo: "Tempo de casa", icone: "person", nomes: ["Novato", "Regular", "Fiel"], esquema: "neu", sufixo: " dias", passo: 1, max: 3650, periodoTipo: "nenhum",
      explicacao: "Há quantos dias o passageiro se cadastrou. Não tem período para escolher: a conta vai da data do cadastro até hoje.",
      padrao: { a: 45, b: 240, periodo: { tipo: "nenhum" } } }),
  ],
};

export const PERIODOS_DIAS = ["7", "15", "30", "90"];
export const PERIODOS_SEMANAS = ["1", "2", "3", "4", "8"];

// ------------------------------------------------------------------ configuração (salva por empresa)

export interface ConfigIndicador { a: number; b: number; periodo: Periodo }
export type ConfigEngajamento = Record<Papel, Record<string, ConfigIndicador>>;

const ARQ = "engajamento-faixas.json";
const copia = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const defDe = (papel: Papel, id: string) => INDICADORES[papel].find((d) => d.id === id);
const dataOk = (s: unknown) => (typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : "");

export function validarPeriodo(def: DefIndicador, entrada: unknown): Periodo {
  if (def.periodoTipo === "nenhum") return { tipo: "nenhum" };
  const o = (entrada && typeof entrada === "object" ? entrada : {}) as Record<string, unknown>;
  const tipo = String(o.tipo ?? def.padrao.periodo.tipo);
  if ((def.periodoTipo === "dias" ? PERIODOS_DIAS : PERIODOS_SEMANAS).includes(tipo)) return { tipo };
  if (tipo !== "personalizado") throw new Error("Período inválido.");
  const inicio = dataOk(o.inicio), fim = dataOk(o.fim);
  if (!inicio || !fim) throw new Error("Informe as datas inicial e final do período.");
  if (inicio > fim) throw new Error("A data inicial não pode ser depois da final.");
  if ((Date.parse(fim) - Date.parse(inicio)) / 86_400_000 > 365) throw new Error("O período pode ter no máximo 366 dias.");
  return { tipo, inicio, fim };
}

/** Confere os dois limites de um indicador. Lança erro em português quando algum não faz sentido. */
export function validarLimites(def: DefIndicador, a: unknown, b: unknown) {
  const x = Number(a), y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y) || a === "" || b === "" || a == null || b == null) throw new Error(`"${def.rotulo}": informe os dois limites em números.`);
  if (x < 0 || y < 0 || x > def.max || y > def.max) throw new Error(`"${def.rotulo}": os limites ficam entre 0 e ${def.max}.`);
  if (!(x < y)) throw new Error(`"${def.rotulo}": o primeiro limite precisa ser menor que o segundo.`);
  return { a: Math.round(x * 100) / 100, b: Math.round(y * 100) / 100 };
}

export function lerConfig(empresaId: string): ConfigEngajamento {
  const salvo = lerOperacao<Partial<ConfigEngajamento>>(empresaId, ARQ, {});
  const saida = {} as ConfigEngajamento;
  for (const p of PAPEIS) {
    saida[p] = {};
    for (const d of INDICADORES[p]) {
      const s = salvo[p]?.[d.id];
      let c: ConfigIndicador = copia(d.padrao);
      try { if (s) c = { ...validarLimites(d, s.a, s.b), periodo: validarPeriodo(d, s.periodo) }; } catch { /* guardado inválido: volta ao padrão */ }
      saida[p][d.id] = c;
    }
  }
  return saida;
}

/** Salva limites e período de um indicador da empresa. */
export function salvarConfig(empresaId: string, p: { papel: Papel; indicador: string; a: unknown; b: unknown; periodo?: unknown }): ConfigEngajamento {
  if (!PAPEIS.includes(p.papel)) throw new Error("Escolha motoristas ou passageiros.");
  const def = defDe(p.papel, p.indicador);
  if (!def) throw new Error("Indicador desconhecido.");
  const atual = lerConfig(empresaId);
  atual[p.papel][def.id] = { ...validarLimites(def, p.a, p.b), periodo: validarPeriodo(def, p.periodo) };
  gravarOperacao(empresaId, ARQ, atual);
  return atual;
}

// ------------------------------------------------------------------ período e faixas

const DIA_MS = 86_400_000;
export const hojeBrasilia = () => agoraBr().toISOString().slice(0, 10);
const somarDias = (d: string, n: number) => new Date(Date.parse(d) + n * DIA_MS).toISOString().slice(0, 10);
const diasEntre = (de: string, ate: string) => Math.max(0, Math.floor((Date.parse(ate) - Date.parse(de)) / DIA_MS));

export function intervalo(def: DefIndicador, p: Periodo, hoje = hojeBrasilia()): { inicio: string; fim: string; dias: number } {
  if (p.tipo === "personalizado" && p.inicio && p.fim) return { inicio: p.inicio, fim: p.fim, dias: diasEntre(p.inicio, p.fim) + 1 };
  const n = Number(p.tipo) || 30;
  const dias = def.periodoTipo === "semanas" ? n * 7 : n;
  return { inicio: somarDias(hoje, -(dias - 1)), fim: hoje, dias };
}

/** 0 = faixa de menores valores (até o limite "a"), 1 = do meio (até "b"), 2 = acima de "b". */
export const faixaDe = (c: { a: number; b: number }, v: number): 0 | 1 | 2 => (v <= c.a ? 0 : v <= c.b ? 1 : 2);

/** Texto do limite de cada faixa, no jeito da Machine: "≤ 8%", "> 8 – 30%", "> 30%". */
export function textoFaixa(def: Pick<DefIndicador, "sufixo" | "casas">, c: { a: number; b: number }, i: 0 | 1 | 2): string {
  const n = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: Math.max(def.casas, 1) });
  const u = def.sufixo;
  if (i === 0) return `≤ ${n(c.a)}${u}`;
  if (i === 1) return `> ${n(c.a)} – ${n(c.b)}${u}`;
  return `> ${n(c.b)}${u}`;
}

// ------------------------------------------------------------------ valores por pessoa

const arred = (n: number, c = 1) => Math.round(n * 10 ** c) / 10 ** c;
const soNumeros = (v: string) => v.replace(/\D/g, "");
const dentro = (em: string | undefined | null, inicio: string, fim: string) => !!em && em.slice(0, 10) >= inicio && em.slice(0, 10) <= fim;
const media = (l: number[]) => (l.length ? l.reduce((s, n) => s + n, 0) / l.length : null);

export interface Pessoa { id: string; nome: string; telefone: string; conectado: boolean; valores: Record<string, number | undefined> }

export const SITUACOES: Array<{ id: string; rotulo: string; valores: string[] }> = [
  { id: "A", rotulo: "Ativos", valores: ["Ativo"] },
  { id: "S", rotulo: "Suspensos", valores: ["Bloqueado"] },
  { id: "E", rotulo: "Em análise", valores: ["Em análise", "Aguardando aprovação"] },
  { id: "F", rotulo: "Fila de espera", valores: ["Fila de espera"] },
  { id: "R", rotulo: "Rejeitados", valores: ["Rejeitado"] },
  { id: "I", rotulo: "Inativos", valores: ["Inativo"] },
];

export interface FiltroMotoristas { situacoes: string[]; categorias: string[] | null }

function segundosOnline(empresaId: string, inicio: string, fim: string) {
  const m = new Map<string, number>();
  try {
    for (const r of banco().prepare("SELECT motorista, SUM(segundos) AS s FROM app_online WHERE empresa = ? AND dia BETWEEN ? AND ? GROUP BY motorista").all(empresaId, inicio, fim) as Array<{ motorista: string; s: number }>) m.set(r.motorista, r.s);
  } catch { /* sem contagem */ }
  return m;
}
function ultimoDiaOnline(empresaId: string) {
  const m = new Map<string, string>();
  try {
    for (const r of banco().prepare("SELECT motorista, MAX(dia) AS d FROM app_online WHERE empresa = ? GROUP BY motorista").all(empresaId) as Array<{ motorista: string; d: string }>) m.set(r.motorista, r.d);
  } catch { /* sem contagem */ }
  return m;
}

const horaOuPedido = (c: CorridaPropria) => c.finalizadaEm ?? c.iniciadaEm ?? c.solicitadaEm;
const duracaoH = (c: CorridaPropria) => {
  if (!c.iniciadaEm || !c.finalizadaEm) return 0;
  const h = (Date.parse(c.finalizadaEm) - Date.parse(c.iniciadaEm)) / 3_600_000;
  return h > 0 && h < 24 ? h : 0;
};

export function situacoesDoMotorista(empresaId: string) {
  const cad = listar(empresaId, cadastroPorId("motoristas")!).filter((m) => m.status !== "Lixeira");
  const total = cad.length || 1;
  return SITUACOES.map((s) => ({ id: s.id, rotulo: s.rotulo, pct: Math.round((cad.filter((m) => s.valores.includes(String(m.status))).length / total) * 100) }));
}
export function categoriasDaEmpresa(empresaId: string) {
  return listar(empresaId, cadastroPorId("categorias")!).map((c) => ({ id: String(c.id), nome: String(c.nome ?? "") }));
}

export function pessoasMotoristas(empresaId: string, f: FiltroMotoristas, hoje = hojeBrasilia()): Pessoa[] {
  const cfg = lerConfig(empresaId).motoristas;
  const defs = INDICADORES.motoristas;
  const todas = listarProprias(empresaId);
  const permitidas = new Set(SITUACOES.filter((s) => f.situacoes.includes(s.id)).flatMap((s) => s.valores));
  const cats = categoriasDaEmpresa(empresaId);
  const escolhidas = f.categorias ? new Set(f.categorias.map((id) => cats.find((c) => c.id === id)?.nome.toLowerCase()).filter(Boolean) as string[]) : null;
  const ultimoOnline = ultimoDiaOnline(empresaId);
  const porMotorista = new Map<string, CorridaPropria[]>();
  for (const c of todas) if (c.motoristaId) { const l = porMotorista.get(c.motoristaId) ?? []; l.push(c); porMotorista.set(c.motoristaId, l); }
  const janelas = new Map(defs.map((d) => [d.id, intervalo(d, cfg[d.id].periodo, hoje)]));
  const online = new Map(defs.filter((d) => d.id === "tempoOnline").map((d) => { const j = janelas.get(d.id)!; return [d.id, segundosOnline(empresaId, j.inicio, j.fim)]; }));
  const saida: Pessoa[] = [];
  for (const m of listar(empresaId, cadastroPorId("motoristas")!)) {
    if (!permitidas.has(String(m.status))) continue;
    if (escolhidas) {
      const dele = String(m.categorias ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
      if (dele.length ? !dele.some((n) => escolhidas.has(n)) : escolhidas.size < cats.length) continue;
    }
    const suas = porMotorista.get(String(m.id)) ?? [];
    const fin = suas.filter((c) => c.status === "finalizada");
    const v: Record<string, number | undefined> = {};
    const jO = janelas.get("tempoOnline")!;
    v.tempoOnline = arred(((online.get("tempoOnline")!.get(String(m.id)) ?? 0) / 3600) / jO.dias, 2);
    const jH = janelas.get("horaTrabalhada")!;
    v.horaTrabalhada = arred(fin.filter((c) => dentro(c.finalizadaEm, jH.inicio, jH.fim)).reduce((s, c) => s + duracaoH(c), 0) / jH.dias, 2);
    const jC = janelas.get("corridas")!;
    v.corridas = fin.filter((c) => dentro(horaOuPedido(c), jC.inicio, jC.fim)).length;
    const desde = String(m.criadoEm ?? "").slice(0, 10);
    const ultimaCorrida = suas.map((c) => horaOuPedido(c).slice(0, 10)).sort().at(-1) ?? "";
    const ultima = [ultimoOnline.get(String(m.id)) ?? "", ultimaCorrida].sort().at(-1) || desde;
    if (ultima) v.ausencia = diasEntre(ultima, hoje);
    const jF = janelas.get("frequenciaTrabalho")!;
    v.frequenciaTrabalho = arred(new Set(fin.filter((c) => dentro(horaOuPedido(c), jF.inicio, jF.fim)).map((c) => horaOuPedido(c).slice(0, 10))).size / (jF.dias / 7), 2);
    const notas = suas.map((c) => c.avaliacao).filter((n): n is number => typeof n === "number" && n > 0);
    if (notas.length) v.avaliacoes = arred(media(notas)!, 2);
    if (desde) v.tempoCasa = diasEntre(desde, hoje);
    saida.push({ id: String(m.id), nome: String(m.nome ?? "Motorista"), telefone: String(m.telefone ?? ""), conectado: estaOnline(empresaId, String(m.id)), valores: v });
  }
  return saida;
}

export function pessoasPassageiros(empresaId: string, hoje = hojeBrasilia()): Pessoa[] {
  const cfg = lerConfig(empresaId).passageiros;
  const defs = INDICADORES.passageiros;
  const janelas = new Map(defs.map((d) => [d.id, intervalo(d, cfg[d.id].periodo, hoje)]));
  const todas = listarProprias(empresaId);
  const clientes = listar(empresaId, cadastroPorId("clientes")!);
  const porTel = new Map<string, CorridaPropria[]>();
  for (const c of todas) {
    const t = soNumeros(c.passageiro.telefone);
    if (!t) continue;
    const l = porTel.get(t) ?? [];
    l.push(c);
    porTel.set(t, l);
  }
  const cotas = cotacoes(empresaId);
  const cadPorTel = new Map(clientes.map((c) => [soNumeros(String(c.telefone ?? "")), c]));
  const telefones = new Set<string>([...cadPorTel.keys(), ...porTel.keys()]);
  telefones.delete("");
  const saida: Pessoa[] = [];
  for (const tel of telefones) {
    const dele = porTel.get(tel) ?? [];
    const cad = cadPorTel.get(tel);
    const v: Record<string, number | undefined> = {};
    const noPeriodo = (id: string) => { const j = janelas.get(id)!; return dele.filter((c) => dentro(c.solicitadaEm, j.inicio, j.fim)); };
    v.solicitacoes = noPeriodo("solicitacoes").length;
    const jF = janelas.get("frequenciaUso")!;
    v.frequenciaUso = arred(new Set(noPeriodo("frequenciaUso").map((c) => c.solicitadaEm.slice(0, 10))).size / (jF.dias / 7), 2);
    const pc = noPeriodo("cancelamento");
    if (pc.length) v.cancelamento = arred((pc.filter((c) => c.status === "cancelada" && String(c.canceladaPor).toLowerCase().includes("passag")).length / pc.length) * 100);
    const jE = janelas.get("estimativas")!;
    const nEstim = cotas.filter((q) => soNumeros(q.telefone) === tel && dentro(q.em, jE.inicio, jE.fim)).length;
    const pedidas = noPeriodo("estimativas").length;
    if (nEstim || pedidas) v.estimativas = arred((pedidas / Math.max(pedidas, nEstim)) * 100);
    const notas = dele.map((c) => c.avaliacaoPassageiro?.nota).filter((n): n is number => typeof n === "number" && n > 0);
    if (notas.length) v.avaliacoes = arred(media(notas)!, 2);
    const desde = String(cad?.criadoEm ?? "").slice(0, 10) || dele[0]?.solicitadaEm?.slice(0, 10) || "";
    if (desde) v.tempoCasa = diasEntre(desde, hoje);
    saida.push({ id: tel, nome: String(cad?.nome ?? dele.at(-1)?.passageiro.nome ?? "Passageiro"), telefone: String(cad?.telefone ?? dele.at(-1)?.passageiro.telefone ?? tel), conectado: false, valores: v });
  }
  return saida;
}

// ------------------------------------------------------------------ resumo por indicador

export interface ResumoIndicador extends Omit<DefIndicador, "padrao"> {
  a: number; b: number; periodo: Periodo & { inicio?: string; fim?: string };
  /** Texto de cada faixa ("≤ 8%"...). */
  limites: [string, string, string];
  contagem: [number, number, number]; percentuais: [number, number, number]; total: number;
  conectados: [number, number, number];
  predominante: { indice: 0 | 1 | 2; nome: string; percentual: number } | null;
  /** Barras da régua: quantidade por intervalo (de 0 até escalaMax) e altura relativa (0 a 100). */
  barras: Array<{ de: number; ate: number; qtd: number; altura: number; faixa: 0 | 1 | 2 }>;
  escalaMax: number;
}

const NBARRAS = 20;
function barras(valores: number[], c: { a: number; b: number }, def: DefIndicador) {
  const maxV = valores.length ? Math.max(...valores) : 0;
  const escalaMax = Math.min(def.max, Math.max(c.b * 1.5, maxV, c.b + def.passo)) || 1;
  const larg = escalaMax / NBARRAS;
  const caixas = Array.from({ length: NBARRAS }, (_, i) => ({ de: arred(i * larg, 2), ate: arred((i + 1) * larg, 2), qtd: 0, altura: 0, faixa: faixaDe(c, (i + 0.5) * larg) }));
  for (const v of valores) caixas[Math.min(NBARRAS - 1, Math.max(0, Math.floor(v / larg)))].qtd++;
  const topo = Math.max(1, ...caixas.map((x) => x.qtd));
  for (const x of caixas) x.altura = arred((x.qtd / topo) * 100);
  return { barras: caixas, escalaMax: arred(escalaMax, 2) };
}

export function resumir(papel: Papel, pessoas: Pessoa[], cfg: Record<string, ConfigIndicador>, hoje = hojeBrasilia()): ResumoIndicador[] {
  return INDICADORES[papel].map((d) => {
    const c = cfg[d.id];
    const contagem: [number, number, number] = [0, 0, 0], conectados: [number, number, number] = [0, 0, 0];
    const valores: number[] = [];
    for (const p of pessoas) {
      const v = p.valores[d.id];
      if (v == null) continue;
      const f = faixaDe(c, v);
      contagem[f]++; if (p.conectado) conectados[f]++;
      valores.push(v);
    }
    const total = valores.length;
    const percentuais = contagem.map((n) => (total ? arred((n / total) * 100) : 0)) as [number, number, number];
    const ind = ([0, 1, 2] as const).reduce((x, i) => (contagem[i] > contagem[x] ? i : x), 0 as 0 | 1 | 2);
    const { padrao, ...resto } = d;
    void padrao;
    const periodo = d.periodoTipo === "nenhum" ? c.periodo : { ...c.periodo, ...intervalo(d, c.periodo, hoje) };
    return {
      ...resto, a: c.a, b: c.b, periodo, limites: [textoFaixa(d, c, 0), textoFaixa(d, c, 1), textoFaixa(d, c, 2)],
      contagem, percentuais, total, conectados,
      predominante: total ? { indice: ind, nome: d.nomes[ind], percentual: percentuais[ind] } : null,
      ...barras(valores, c, d),
    };
  });
}

export function mapaEngajamento(empresaId: string, papel: Papel, filtro: FiltroMotoristas = { situacoes: ["A"], categorias: null }, hoje = hojeBrasilia()) {
  const cfg = lerConfig(empresaId)[papel];
  const pessoas = papel === "motoristas" ? pessoasMotoristas(empresaId, filtro, hoje) : pessoasPassageiros(empresaId, hoje);
  return {
    papel, total: pessoas.length, indicadores: resumir(papel, pessoas, cfg, hoje),
    filtros: papel === "motoristas" ? { situacoes: situacoesDoMotorista(empresaId), categorias: categoriasDaEmpresa(empresaId) } : null,
  };
}

/** Pessoas de uma faixa de um indicador (janela "Ver motoristas" / "Ver passageiros"). */
export function listaDaFaixa(empresaId: string, papel: Papel, indicador: string, faixa: number, filtro: FiltroMotoristas, hoje = hojeBrasilia()) {
  const def = defDe(papel, indicador);
  if (!def || ![0, 1, 2].includes(faixa)) throw new Error("Indicador ou faixa desconhecidos.");
  const c = lerConfig(empresaId)[papel][indicador];
  const pessoas = papel === "motoristas" ? pessoasMotoristas(empresaId, filtro, hoje) : pessoasPassageiros(empresaId, hoje);
  const dela = pessoas.filter((p) => p.valores[indicador] != null && faixaDe(c, p.valores[indicador]!) === faixa);
  return {
    indicador: def.rotulo, faixa: def.nomes[faixa], limite: textoFaixa(def, c, faixa as 0 | 1 | 2), sufixo: def.sufixo, casas: def.casas,
    pessoas: dela.sort((x, y) => (y.valores[indicador]! - x.valores[indicador]!)).slice(0, 500).map((p) => ({ id: p.id, nome: p.nome, telefone: p.telefone, conectado: p.conectado, valor: p.valores[indicador]! })),
    total: dela.length,
  };
}

/** Resumo usado na página inicial: um indicador por vez, com o filtro padrão (motoristas ativos). */
export function resumoParaPainel(empresaId: string) {
  const m = mapaEngajamento(empresaId, "motoristas");
  return { total: m.total, indicadores: m.indicadores };
}

// ------------------------------------------------------------------ ações e histórico

export interface AcaoLog { id: string; em: string; por: string; papel: Papel; indicador: string; faixa: string; tipo: string; destinatarios: number; detalhe: string }
const ARQ_LOG = "engajamento-acoes.json";
export const historicoAcoes = (empresaId: string) => lerOperacao<AcaoLog[]>(empresaId, ARQ_LOG, []);
export function registrarAcao(empresaId: string, a: Omit<AcaoLog, "id" | "em">) {
  const lista = [...historicoAcoes(empresaId), { ...a, id: crypto.randomUUID(), em: agoraBr().toISOString() }].slice(-500);
  gravarOperacao(empresaId, ARQ_LOG, lista);
}
