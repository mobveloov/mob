// Mapa de engajamento: classifica motoristas e passageiros da empresa em Bom, Aceitável e Ruim em seis indicadores
// (solicitações, frequência de uso, cancelamento, estimativas, avaliações e tempo de casa), a partir das corridas,
// dos cadastros e das estimativas do app. Tudo por empresa: nenhuma função lê dados de outra empresa.
// Datas no padrão do painel: horário de Brasília gravado como UTC (AAAA-MM-DD...).

import { cadastroPorId } from "../comum/cadastros.ts";
import { listar } from "../cadastros/armazem.ts";
import { listarProprias, type CorridaPropria } from "../corridas/index.ts";
import { motoristasOnline } from "../apps/despacho.ts";
import { cotacoes } from "../operacao/radar.ts";
import { ondas } from "../operacao/ondas.ts";
import { gravarOperacao, lerOperacao } from "../operacao/armazem.ts";
import { agoraBr, normal } from "../servidor/util.ts";

export type Papel = "motoristas" | "passageiros";
export type Classe = "bom" | "aceitavel" | "ruim";
export type IdIndicador = "solicitacoes" | "frequencia" | "cancelamento" | "estimativas" | "avaliacoes" | "tempoCasa";
export const PAPEIS: Papel[] = ["motoristas", "passageiros"];
export const CLASSES: Classe[] = ["bom", "aceitavel", "ruim"];
export const CLASSE_TEXTO: Record<Classe, string> = { bom: "Bom", aceitavel: "Aceitável", ruim: "Ruim" };

/** "menor": quanto menor o número, melhor (cancelamento). "maior": quanto maior, melhor. */
export interface DefIndicador { id: IdIndicador; rotulo: string; unidade: string; sentido: "menor" | "maior"; explicacao: string; passo: number; max: number }
export interface Faixa { bom: number; aceitavel: number }
export type Faixas = Record<IdIndicador, Faixa>;
export interface Periodo { tipo: "7" | "15" | "30" | "90" | "personalizado"; inicio?: string; fim?: string }
export interface ConfigEngajamento { periodo: Periodo; faixas: Record<Papel, Faixas> }

export const INDICADORES: Record<Papel, DefIndicador[]> = {
  passageiros: [
    { id: "solicitacoes", rotulo: "Solicitações", unidade: "corridas", sentido: "maior", passo: 1, max: 100, explicacao: "Quantas corridas o passageiro pediu no período escolhido." },
    { id: "frequencia", rotulo: "Frequência de uso", unidade: "dias", sentido: "maior", passo: 1, max: 100, explicacao: "Em quantos dias diferentes o passageiro pediu corrida no período escolhido." },
    { id: "cancelamento", rotulo: "Cancelamento", unidade: "%", sentido: "menor", passo: 1, max: 100, explicacao: "De cada 100 corridas que o passageiro pediu no período escolhido, quantas ele mesmo cancelou." },
    { id: "estimativas", rotulo: "Estimativas", unidade: "%", sentido: "maior", passo: 1, max: 100, explicacao: "De cada 100 estimativas de preço feitas no app, quantas viraram corrida pedida no período escolhido." },
    { id: "avaliacoes", rotulo: "Avaliações", unidade: "estrelas", sentido: "maior", passo: 0.1, max: 5, explicacao: "Média das notas que os motoristas deram ao passageiro no período escolhido." },
    { id: "tempoCasa", rotulo: "Tempo de casa", unidade: "dias", sentido: "maior", passo: 1, max: 3650, explicacao: "Há quantos dias o passageiro está cadastrado." },
  ],
  motoristas: [
    { id: "solicitacoes", rotulo: "Solicitações", unidade: "corridas", sentido: "maior", passo: 1, max: 1000, explicacao: "Quantas corridas o motorista recebeu e atendeu no período escolhido." },
    { id: "frequencia", rotulo: "Frequência de uso", unidade: "dias", sentido: "maior", passo: 1, max: 100, explicacao: "Em quantos dias diferentes o motorista fez corrida no período escolhido." },
    { id: "cancelamento", rotulo: "Cancelamento", unidade: "%", sentido: "menor", passo: 1, max: 100, explicacao: "De cada 100 corridas que o motorista aceitou no período escolhido, quantas ele mesmo cancelou." },
    { id: "estimativas", rotulo: "Aceite de chamadas", unidade: "%", sentido: "maior", passo: 1, max: 100, explicacao: "De cada 100 chamadas que o motorista recebeu no período escolhido, quantas ele aceitou." },
    { id: "avaliacoes", rotulo: "Avaliações", unidade: "estrelas", sentido: "maior", passo: 0.1, max: 5, explicacao: "Média das notas que os passageiros deram ao motorista no período escolhido." },
    { id: "tempoCasa", rotulo: "Tempo de casa", unidade: "dias", sentido: "maior", passo: 1, max: 3650, explicacao: "Há quantos dias o motorista está cadastrado." },
  ],
};

export const FAIXAS_PADRAO: Record<Papel, Faixas> = {
  passageiros: {
    solicitacoes: { bom: 4, aceitavel: 2 }, frequencia: { bom: 3, aceitavel: 2 }, cancelamento: { bom: 8, aceitavel: 30 },
    estimativas: { bom: 50, aceitavel: 25 }, avaliacoes: { bom: 4.5, aceitavel: 4 }, tempoCasa: { bom: 180, aceitavel: 30 },
  },
  motoristas: {
    solicitacoes: { bom: 20, aceitavel: 8 }, frequencia: { bom: 15, aceitavel: 7 }, cancelamento: { bom: 5, aceitavel: 15 },
    estimativas: { bom: 70, aceitavel: 40 }, avaliacoes: { bom: 4.7, aceitavel: 4.3 }, tempoCasa: { bom: 180, aceitavel: 30 },
  },
};
export const PERIODO_PADRAO: Periodo = { tipo: "30" };

// ------------------------------------------------------------------ configuração (salva por empresa)

const ARQ = "engajamento.json";
const copia = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/** Confere as faixas de um papel. Lança erro em português quando algum limite não faz sentido. */
export function validarFaixas(papel: Papel, entrada: unknown): Faixas {
  const base = copia(FAIXAS_PADRAO[papel]);
  const o = (entrada && typeof entrada === "object" ? entrada : {}) as Record<string, unknown>;
  for (const def of INDICADORES[papel]) {
    const f = o[def.id];
    if (f == null) continue;
    const { bom, aceitavel } = f as Record<string, unknown>;
    const b = Number(bom), a = Number(aceitavel);
    if (!Number.isFinite(b) || !Number.isFinite(a) || bom === "" || aceitavel === "") throw new Error(`"${def.rotulo}": informe os dois limites em números.`);
    if (b < 0 || a < 0 || b > def.max || a > def.max) throw new Error(`"${def.rotulo}": os limites ficam entre 0 e ${def.max}.`);
    if (def.sentido === "menor" && !(b < a)) throw new Error(`"${def.rotulo}": o limite de "Bom" precisa ser menor que o de "Aceitável".`);
    if (def.sentido === "maior" && !(b > a)) throw new Error(`"${def.rotulo}": o limite de "Bom" precisa ser maior que o de "Aceitável".`);
    base[def.id] = { bom: Math.round(b * 100) / 100, aceitavel: Math.round(a * 100) / 100 };
  }
  return base;
}

const dataOk = (s: unknown) => (typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : "");

export function validarPeriodo(entrada: unknown): Periodo {
  const o = (entrada && typeof entrada === "object" ? entrada : {}) as Record<string, unknown>;
  const tipo = String(o.tipo ?? "30");
  if (tipo === "7" || tipo === "15" || tipo === "30" || tipo === "90") return { tipo };
  if (tipo !== "personalizado") throw new Error("Período inválido.");
  const inicio = dataOk(o.inicio), fim = dataOk(o.fim);
  if (!inicio || !fim) throw new Error("Informe as datas inicial e final do período.");
  if (inicio > fim) throw new Error("A data inicial não pode ser depois da final.");
  if ((Date.parse(fim) - Date.parse(inicio)) / 86_400_000 > 365) throw new Error("O período pode ter no máximo 366 dias.");
  return { tipo, inicio, fim };
}

export function lerConfig(empresaId: string): ConfigEngajamento {
  const salvo = lerOperacao<Partial<ConfigEngajamento>>(empresaId, ARQ, {});
  let periodo = PERIODO_PADRAO;
  try { periodo = validarPeriodo(salvo.periodo ?? PERIODO_PADRAO); } catch { /* guardado inválido: volta ao padrão */ }
  const faixas = {} as Record<Papel, Faixas>;
  for (const p of PAPEIS) { try { faixas[p] = validarFaixas(p, salvo.faixas?.[p]); } catch { faixas[p] = copia(FAIXAS_PADRAO[p]); } }
  return { periodo, faixas };
}

/** Salva período e/ou faixas (de um papel) da empresa. */
export function salvarConfig(empresaId: string, p: { periodo?: unknown; papel?: Papel; faixas?: unknown }): ConfigEngajamento {
  const atual = lerConfig(empresaId);
  if (p.periodo !== undefined) atual.periodo = validarPeriodo(p.periodo);
  if (p.faixas !== undefined) {
    if (!p.papel || !PAPEIS.includes(p.papel)) throw new Error("Escolha motoristas ou passageiros.");
    atual.faixas[p.papel] = validarFaixas(p.papel, p.faixas);
  }
  gravarOperacao(empresaId, ARQ, atual);
  return atual;
}

// ------------------------------------------------------------------ período

const DIA_MS = 86_400_000;
export const hojeBrasilia = () => agoraBr().toISOString().slice(0, 10);
const somarDias = (d: string, n: number) => new Date(Date.parse(d) + n * DIA_MS).toISOString().slice(0, 10);

export function intervalo(p: Periodo, hoje = hojeBrasilia()): { inicio: string; fim: string; dias: number } {
  if (p.tipo === "personalizado" && p.inicio && p.fim) return { inicio: p.inicio, fim: p.fim, dias: Math.round((Date.parse(p.fim) - Date.parse(p.inicio)) / DIA_MS) + 1 };
  const dias = Number(p.tipo) || 30;
  return { inicio: somarDias(hoje, -(dias - 1)), fim: hoje, dias };
}

// ------------------------------------------------------------------ classificação

export function classificar(def: Pick<DefIndicador, "sentido">, f: Faixa, valor: number): Classe {
  if (def.sentido === "menor") return valor <= f.bom ? "bom" : valor <= f.aceitavel ? "aceitavel" : "ruim";
  return valor >= f.bom ? "bom" : valor >= f.aceitavel ? "aceitavel" : "ruim";
}

const media = (l: number[]) => (l.length ? l.reduce((s, n) => s + n, 0) / l.length : null);
const arred = (n: number, c = 1) => Math.round(n * 10 ** c) / 10 ** c;
const diasEntre = (de: string, ate: string) => Math.max(0, Math.floor((Date.parse(ate) - Date.parse(de)) / DIA_MS));
const media3 = (pts: Array<[number, number]>): [number, number] | null => (pts.length ? [arred(pts.reduce((s, p) => s + p[0], 0) / pts.length, 5), arred(pts.reduce((s, p) => s + p[1], 0) / pts.length, 5)] : null);
const pontoDe = (c: CorridaPropria): [number, number] | null => (c.embarque?.lat != null && c.embarque.lng != null ? [c.embarque.lat, c.embarque.lng] : null);
const soNumeros = (v: string) => v.replace(/\D/g, "");
const dentro = (em: string | undefined | null, inicio: string, fim: string) => !!em && em.slice(0, 10) >= inicio && em.slice(0, 10) <= fim;
const horaOuPedido = (c: CorridaPropria) => c.finalizadaEm ?? c.iniciadaEm ?? c.solicitadaEm;

export interface PontoEngajamento {
  id: string; nome: string; lat: number | null; lng: number | null; corridas: number;
  valores: Partial<Record<IdIndicador, number>>;
  classes: Partial<Record<IdIndicador, Classe>>;
}

type Valores = Partial<Record<IdIndicador, number>>;
interface Base { id: string; nome: string; ponto: [number, number] | null; corridas: number; valores: Valores }

/** Valores brutos por passageiro (sem classificar). Quem não tem dado num indicador fica sem ele. */
function valoresPassageiros(empresaId: string, inicio: string, fim: string): Base[] {
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
  const estim = new Map<string, number>();
  for (const q of cotacoes(empresaId)) if (dentro(q.em, inicio, fim)) { const t = soNumeros(q.telefone); estim.set(t, (estim.get(t) ?? 0) + 1); }
  const cadPorTel = new Map(clientes.map((c) => [soNumeros(String(c.telefone ?? "")), c]));
  const telefones = new Set<string>([...cadPorTel.keys(), ...porTel.keys()]);
  telefones.delete("");
  const saida: Base[] = [];
  for (const tel of telefones) {
    const todasDele = porTel.get(tel) ?? [];
    const doPeriodo = todasDele.filter((c) => dentro(c.solicitadaEm, inicio, fim));
    const nEstim = estim.get(tel) ?? 0;
    const cad = cadPorTel.get(tel);
    const v: Valores = {};
    if (doPeriodo.length || nEstim) {
      v.solicitacoes = doPeriodo.length;
      v.frequencia = new Set(doPeriodo.map((c) => c.solicitadaEm.slice(0, 10))).size;
      if (doPeriodo.length) v.cancelamento = arred((doPeriodo.filter((c) => c.status === "cancelada" && normal(c.canceladaPor) === "passageiro").length / doPeriodo.length) * 100);
      v.estimativas = arred((doPeriodo.length / Math.max(doPeriodo.length, nEstim)) * 100);
    }
    const notas = doPeriodo.map((c) => c.avaliacaoPassageiro?.nota).filter((n): n is number => typeof n === "number" && n > 0);
    if (notas.length) v.avaliacoes = arred(media(notas)!, 2);
    const desde = String(cad?.criadoEm ?? "") || todasDele[0]?.solicitadaEm || "";
    if (desde) v.tempoCasa = diasEntre(desde.slice(0, 10), fim);
    if (!Object.keys(v).length) continue;
    const pts = (doPeriodo.length ? doPeriodo : todasDele).map(pontoDe).filter((p): p is [number, number] => !!p);
    saida.push({ id: tel, nome: String(cad?.nome ?? todasDele.at(-1)?.passageiro.nome ?? "Passageiro"), ponto: media3(pts), corridas: doPeriodo.length, valores: v });
  }
  return saida;
}

function valoresMotoristas(empresaId: string, inicio: string, fim: string): Base[] {
  const todas = listarProprias(empresaId);
  const cad = listar(empresaId, cadastroPorId("motoristas")!);
  const aovivo = new Map(motoristasOnline(empresaId).map((m) => [m.id, m]));
  const listaOndas = ondas(empresaId).filter((o) => dentro(o.oferecidaEm, inicio, fim) && o.fim !== "oferecida");
  const saida: Base[] = [];
  for (const m of cad) {
    const suas = todas.filter((c) => c.motoristaId === m.id);
    const doPeriodo = suas.filter((c) => dentro(horaOuPedido(c), inicio, fim));
    const aceitas = doPeriodo.filter((c) => c.status !== "procurando" && c.status !== "nao_atendida" && (c.status !== "cancelada" || !!c.atribuidaEm));
    const ofertas = listaOndas.filter((o) => o.motoristaId === m.id);
    const v: Valores = {};
    if (aceitas.length || ofertas.length) {
      v.solicitacoes = aceitas.length;
      v.frequencia = new Set(aceitas.map((c) => horaOuPedido(c).slice(0, 10))).size;
      if (aceitas.length) v.cancelamento = arred((aceitas.filter((c) => c.status === "cancelada" && normal(c.canceladaPor) === "motorista").length / aceitas.length) * 100);
      if (ofertas.length) v.estimativas = arred((ofertas.filter((o) => o.fim === "aceitou").length / ofertas.length) * 100);
    }
    const notas = doPeriodo.map((c) => c.avaliacao).filter((n): n is number => typeof n === "number" && n > 0);
    if (notas.length) v.avaliacoes = arred(media(notas)!, 2);
    const desde = String(m.criadoEm ?? "");
    if (desde) v.tempoCasa = diasEntre(desde.slice(0, 10), fim);
    if (!Object.keys(v).length) continue;
    const vivo = aovivo.get(String(m.id));
    const pts = (doPeriodo.length ? doPeriodo : suas).map(pontoDe).filter((p): p is [number, number] => !!p);
    const ponto: [number, number] | null = vivo ? [vivo.lat, vivo.lng] : media3(pts);
    saida.push({ id: String(m.id), nome: String(m.nome ?? "Motorista"), ponto, corridas: aceitas.length, valores: v });
  }
  return saida;
}

export interface ResumoIndicador extends DefIndicador {
  faixa: Faixa;
  /** Quantas pessoas caíram em cada faixa e o total com dado neste indicador. */
  contagem: Record<Classe, number>; total: number;
  /** Faixa com mais gente e a fatia dela (%). */
  predominante: { classe: Classe; percentual: number } | null;
  /** Quantidade de pessoas por intervalo de valor (para o gráfico de "Ajustar faixas"). */
  histograma: Array<{ de: number; ate: number; qtd: number }>;
}

export function mapaEngajamento(empresaId: string, papel: Papel, cfg = lerConfig(empresaId), hoje = hojeBrasilia()) {
  const { inicio, fim } = intervalo(cfg.periodo, hoje);
  const base = papel === "passageiros" ? valoresPassageiros(empresaId, inicio, fim) : valoresMotoristas(empresaId, inicio, fim);
  const defs = INDICADORES[papel];
  const faixas = cfg.faixas[papel];
  const pontos: PontoEngajamento[] = base.map((b) => {
    const classes: Partial<Record<IdIndicador, Classe>> = {};
    for (const d of defs) { const val = b.valores[d.id]; if (val != null) classes[d.id] = classificar(d, faixas[d.id], val); }
    return { id: b.id, nome: b.nome, lat: b.ponto?.[0] ?? null, lng: b.ponto?.[1] ?? null, corridas: b.corridas, valores: b.valores, classes };
  });
  const indicadores: ResumoIndicador[] = defs.map((d) => {
    const contagem: Record<Classe, number> = { bom: 0, aceitavel: 0, ruim: 0 };
    const valores: number[] = [];
    for (const p of pontos) { const c = p.classes[d.id]; if (c) { contagem[c]++; valores.push(p.valores[d.id]!); } }
    const total = valores.length;
    const maior = CLASSES.reduce((a, c) => (contagem[c] > contagem[a] ? c : a), "bom" as Classe);
    return { ...d, faixa: faixas[d.id], contagem, total, predominante: total ? { classe: maior, percentual: arred((contagem[maior] / total) * 100) } : null, histograma: histograma(valores, d.max) };
  });
  return { papel, periodo: { ...cfg.periodo, ...intervalo(cfg.periodo, hoje) }, indicadores, pontos, total: pontos.length, semPosicao: pontos.filter((p) => p.lat == null).length };
}

/** 12 intervalos de largura igual, do menor ao maior valor. */
function histograma(valores: number[], max: number) {
  if (!valores.length) return [];
  const topo = Math.min(max, Math.max(...valores));
  const baixo = Math.min(...valores);
  const n = 12, larg = (topo - baixo) / n || 1;
  const caixas = Array.from({ length: n }, (_, i) => ({ de: arred(baixo + i * larg, 2), ate: arred(baixo + (i + 1) * larg, 2), qtd: 0 }));
  for (const v of valores) caixas[Math.min(n - 1, Math.max(0, Math.floor((v - baixo) / larg)))].qtd++;
  return caixas;
}

// ------------------------------------------------------------------ histórico

/** Dia a dia do período: pedidas, finalizadas, canceladas, passageiros ativos e novos, mais os pontos de embarque. */
export function historicoEngajamento(empresaId: string, cfg = lerConfig(empresaId), hoje = hojeBrasilia()) {
  const { inicio, fim, dias } = intervalo(cfg.periodo, hoje);
  const todas = listarProprias(empresaId);
  const doPeriodo = todas.filter((c) => dentro(c.solicitadaEm, inicio, fim));
  const primeira = new Map<string, string>();
  for (const c of todas) { const t = soNumeros(c.passageiro.telefone); const d = c.solicitadaEm.slice(0, 10); if (t && (!primeira.has(t) || d < primeira.get(t)!)) primeira.set(t, d); }
  const serie = Array.from({ length: dias }, (_, i) => ({ dia: somarDias(inicio, i), pedidas: 0, finalizadas: 0, canceladas: 0, passageirosAtivos: 0, passageirosNovos: 0 }));
  const idx = new Map(serie.map((s, i) => [s.dia, i]));
  const ativos = serie.map(() => new Set<string>());
  for (const c of doPeriodo) {
    const i = idx.get(c.solicitadaEm.slice(0, 10));
    if (i == null) continue;
    serie[i].pedidas++;
    if (c.status === "finalizada") serie[i].finalizadas++;
    if (c.status === "cancelada") serie[i].canceladas++;
    ativos[i].add(soNumeros(c.passageiro.telefone));
  }
  serie.forEach((s, i) => {
    s.passageirosAtivos = ativos[i].size;
    for (const t of ativos[i]) if (primeira.get(t) === s.dia) s.passageirosNovos++;
  });
  const pontos = doPeriodo.slice(-2000).map((c) => ({ id: c.id, os: c.os, status: c.status, em: c.solicitadaEm, lat: c.embarque?.lat ?? null, lng: c.embarque?.lng ?? null })).filter((p) => p.lat != null);
  const finalizadas = doPeriodo.filter((c) => c.status === "finalizada").length;
  return {
    periodo: { ...cfg.periodo, inicio, fim, dias }, serie, pontos,
    totais: {
      pedidas: doPeriodo.length, finalizadas, canceladas: doPeriodo.filter((c) => c.status === "cancelada").length,
      passageiros: new Set(doPeriodo.map((c) => soNumeros(c.passageiro.telefone))).size,
      taxaFinalizacao: doPeriodo.length ? arred((finalizadas / doPeriodo.length) * 100) : null,
    },
  };
}
