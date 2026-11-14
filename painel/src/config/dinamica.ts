// Config › Tarifas Dinâmicas: regras por área (polígono no mapa), por horário e por alta demanda. Cada categoria liga as que valem
// para ela (Categorias › Dinâmica). aplicarDinamica entra no preço estimado da corrida (corridas/index.ts › estimarPreco).

import { agoraBr } from "../servidor/util.ts";
import { extraDaCategoria } from "./categorias.ts";
import { centavos, gravarConfig, lerConfig, lista, novoId, numero, sim, texto, umDe } from "./armazem.ts";

export type TipoDinamica = "mapa" | "horario" | "demanda";
export type CobrancaDinamica = "percentual" | "fixo" | "multiplicador";
export interface JanelaDia { dia: number; inicio: string; fim: string }
export interface RegraDinamica {
  id: string; tipo: TipoDinamica; nome: string; cidade: string; ativa: boolean;
  /** "percentual" = acréscimo em % sobre o preço (20 = +20%); "multiplicador" = vezes o preço (1,3 = 1,3x); "fixo" = reais a mais. */
  cobranca: CobrancaDinamica; valor: number; minimo: number;
  poligono: Array<[number, number]>; janelas: JanelaDia[]; gatilho: number;
}

/** Quando duas ou mais dinâmicas valem para a mesma corrida: "somar" (acumula todas) ou quem ganha (como na Machine). */
export const PRIORIDADES = ["somar", "maior_valor", "manual", "automatica", "sem_area"] as const;
export type PrioridadeDinamica = (typeof PRIORIDADES)[number];
export const ROTULO_PRIORIDADE: Record<PrioridadeDinamica, string> = {
  somar: "Somar todas as dinâmicas que valem",
  maior_valor: "A prioridade é sempre da dinâmica com maior valor",
  manual: "A prioridade é sempre da dinâmica manual",
  automatica: "A prioridade é sempre da dinâmica automática",
  sem_area: "A prioridade é sempre da dinâmica sem área",
};

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export function sanearDinamica(e: unknown, tipoPadrao?: TipoDinamica): RegraDinamica {
  const o = (e ?? {}) as Record<string, unknown>;
  const tipo = umDe(o.tipo ?? tipoPadrao, ["mapa", "horario", "demanda"] as const, "mapa");
  const nome = texto(o.nome, 60);
  if (!nome) throw new Error("Informe o nome da regra.");
  const cobranca = umDe(o.cobranca, ["percentual", "fixo", "multiplicador"] as const, "percentual");
  const valor = centavos(numero(o.valor, 0, 0, cobranca === "percentual" ? 500 : cobranca === "multiplicador" ? 10 : 1000));
  if (!(valor > 0)) throw new Error("Informe o valor extra.");
  if (cobranca === "multiplicador" && !(valor > 1)) throw new Error("O multiplicador precisa ser maior que 1 (exemplo: 1,3x).");
  const poligono = lista(o.poligono).map((p) => (Array.isArray(p) ? [numero(p[0], NaN, -90, 90), numero(p[1], NaN, -180, 180)] : [NaN, NaN]) as [number, number]).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])).slice(0, 200);
  if (tipo === "mapa" && poligono.length < 3) throw new Error("Desenhe a área no mapa (no mínimo 3 pontos).");
  const janelas = lista(o.janelas).map((j) => { const x = (j ?? {}) as Record<string, unknown>; return { dia: Math.round(numero(x.dia, 0, 0, 6)), inicio: String(x.inicio ?? ""), fim: String(x.fim ?? "") }; }).filter((j) => HORA.test(j.inicio) && HORA.test(j.fim)).slice(0, 70);
  if (tipo === "horario" && !janelas.length) throw new Error("Configure ao menos um dia e horário.");
  return {
    id: texto(o.id, 20) || novoId(), tipo, nome, cidade: texto(o.cidade, 80), ativa: sim(o.ativa, true), cobranca, valor, minimo: centavos(numero(o.minimo, 0, 0, 1000)),
    poligono: tipo === "mapa" ? poligono : [], janelas: tipo === "horario" ? janelas : [], gatilho: tipo === "demanda" ? Math.round(numero(o.gatilho, 10, 1, 10_000)) : 0,
  };
}

export const dinamicas = (empresaId: string): RegraDinamica[] =>
  lista(lerConfig<unknown[]>(empresaId, "dinamicas", [])).map((r) => { try { return sanearDinamica(r); } catch { return null; } }).filter((r): r is RegraDinamica => !!r);

export function salvarDinamica(empresaId: string, entrada: unknown): RegraDinamica[] {
  const r = sanearDinamica(entrada);
  const l = dinamicas(empresaId);
  gravarConfig(empresaId, "dinamicas", l.some((x) => x.id === r.id) ? l.map((x) => (x.id === r.id ? r : x)) : [...l, r].slice(0, 300));
  return dinamicas(empresaId);
}
export function removerDinamica(empresaId: string, id: string): RegraDinamica[] {
  gravarConfig(empresaId, "dinamicas", dinamicas(empresaId).filter((x) => x.id !== id));
  return dinamicas(empresaId);
}
export function ativarDinamica(empresaId: string, id: string, ativa: boolean): RegraDinamica[] {
  gravarConfig(empresaId, "dinamicas", dinamicas(empresaId).map((x) => (x.id === id ? { ...x, ativa } : x)));
  return dinamicas(empresaId);
}

/** Ponto dentro do polígono (lat, lng). */
export function dentroDoPoligono(lat: number, lng: number, poly: Array<[number, number]>): boolean {
  let dentro = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i], [yj, xj] = poly[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

const minutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3));
function noHorario(r: RegraDinamica, quando: Date): boolean {
  const dia = quando.getUTCDay(), min = quando.getUTCHours() * 60 + quando.getUTCMinutes();
  return r.janelas.some((j) => {
    const a = minutos(j.inicio), b = minutos(j.fim);
    if (a <= b) return j.dia === dia && min >= a && min <= b;
    // vira a meia-noite: de a até 24h no dia, e de 0 até b no dia seguinte
    return (j.dia === dia && min >= a) || ((j.dia + 1) % 7 === dia && min <= b);
  });
}

// ------------------------------------------------------------------ prioridade entre dinâmicas

export const prioridadeDinamicas = (empresaId: string): PrioridadeDinamica =>
  umDe(lerConfig<{ prioridade?: unknown }>(empresaId, "dinamicas-geral", {}).prioridade, PRIORIDADES, "somar");
export function salvarPrioridade(empresaId: string, v: unknown): PrioridadeDinamica {
  if (!PRIORIDADES.includes(v as PrioridadeDinamica)) throw new Error("Escolha uma prioridade válida.");
  gravarConfig(empresaId, "dinamicas-geral", { prioridade: v });
  return v as PrioridadeDinamica;
}

/** Faixa de cor da legenda do mapa: 1 = baixa, 2 = média, 3 = alta. */
export function nivelDinamica(r: { cobranca: CobrancaDinamica; valor: number }): 1 | 2 | 3 {
  if (r.cobranca === "fixo") return r.valor <= 10 ? 1 : r.valor <= 25 ? 2 : 3;
  const pct = r.cobranca === "multiplicador" ? (r.valor - 1) * 100 : r.valor;
  return pct <= 20 ? 1 : pct <= 50 ? 2 : 3;
}
export const LEGENDA_DINAMICA = [
  { nivel: 1, rotulo: "Baixa", detalhe: "até +20% (1,2x) ou R$ 10,00", cor: "#f59e0b" },
  { nivel: 2, rotulo: "Média", detalhe: "até +50% (1,5x) ou R$ 25,00", cor: "#f97316" },
  { nivel: 3, rotulo: "Alta", detalhe: "acima disso", cor: "#dc2626" },
];

// ------------------------------------------------------------------ automações (áreas automáticas por demanda)

/**
 * Automação: observa os pedidos recentes e, onde uma região (quadrado do mapa) passa do mínimo de pedidos na janela de tempo,
 * cria sozinha uma área de dinâmica ali. A área some quando a demanda cai. Cada categoria liga as automações que valem para ela.
 */
export interface Automacao {
  id: string; nome: string; cidade: string; ativa: boolean;
  /** Janela observada, em minutos. */
  janelaMin: number;
  /** Pedidos na região, dentro da janela, para abrir a área. */
  minPedidos: number;
  /** Lado de cada região, em km. */
  celulaKm: number;
  cobranca: CobrancaDinamica; valor: number; minimo: number;
}

export function sanearAutomacao(e: unknown): Automacao {
  const o = (e ?? {}) as Record<string, unknown>;
  const nome = texto(o.nome, 60);
  if (!nome) throw new Error("Informe o nome da automação.");
  const cobranca = umDe(o.cobranca, ["percentual", "fixo", "multiplicador"] as const, "multiplicador");
  const valor = centavos(numero(o.valor, 0, 0, cobranca === "percentual" ? 500 : cobranca === "multiplicador" ? 10 : 1000));
  if (!(valor > 0)) throw new Error("Informe o valor extra da automação.");
  if (cobranca === "multiplicador" && !(valor > 1)) throw new Error("O multiplicador precisa ser maior que 1 (exemplo: 1,3x).");
  return {
    id: texto(o.id, 20) || novoId(), nome, cidade: texto(o.cidade, 80), ativa: sim(o.ativa, true),
    janelaMin: Math.round(numero(o.janelaMin, 15, 5, 240)), minPedidos: Math.round(numero(o.minPedidos, 5, 2, 1000)), celulaKm: numero(o.celulaKm, 1, 0.3, 10),
    cobranca, valor, minimo: centavos(numero(o.minimo, 0, 0, 1000)),
  };
}

export const automacoes = (empresaId: string): Automacao[] =>
  lista(lerConfig<unknown[]>(empresaId, "dinamicas-automacoes", [])).map((r) => { try { return sanearAutomacao(r); } catch { return null; } }).filter((r): r is Automacao => !!r);

export function salvarAutomacao(empresaId: string, entrada: unknown): Automacao[] {
  const a = sanearAutomacao(entrada);
  const l = automacoes(empresaId);
  gravarConfig(empresaId, "dinamicas-automacoes", l.some((x) => x.id === a.id) ? l.map((x) => (x.id === a.id ? a : x)) : [...l, a].slice(0, 50));
  return automacoes(empresaId);
}
export function removerAutomacao(empresaId: string, id: string): Automacao[] {
  gravarConfig(empresaId, "dinamicas-automacoes", automacoes(empresaId).filter((x) => x.id !== id));
  return automacoes(empresaId);
}
export function ativarAutomacao(empresaId: string, id: string, ativa: boolean): Automacao[] {
  gravarConfig(empresaId, "dinamicas-automacoes", automacoes(empresaId).map((x) => (x.id === id ? { ...x, ativa } : x)));
  return automacoes(empresaId);
}

/** Um pedido recente: onde o passageiro embarcaria e quando pediu (milissegundos, no mesmo relógio de "agora"). */
export interface PedidoRecente { lat: number; lng: number; em: number }
export interface AreaAutomatica {
  id: string; automacaoId: string; nome: string; cidade: string; pedidos: number;
  cobranca: CobrancaDinamica; valor: number; minimo: number; nivel: 1 | 2 | 3;
  centro: [number, number]; poligono: Array<[number, number]>;
}

const KM_POR_GRAU = 111.32;
function celulaDe(lat: number, lng: number, km: number) {
  const dLat = km / KM_POR_GRAU;
  const linha = Math.floor(lat / dLat);
  const dLng = dLat / Math.max(0.05, Math.cos((((linha + 0.5) * dLat) * Math.PI) / 180));
  return { linha, coluna: Math.floor(lng / dLng), dLat, dLng };
}

/** As áreas que as automações ativas abrem agora, com os pedidos recentes. "so" limita a estas automações (as da categoria). */
export function areasAutomaticas(empresaId: string, pedidos: PedidoRecente[], agora: number = agoraBr().getTime(), so?: Set<string>): AreaAutomatica[] {
  const saida: AreaAutomatica[] = [];
  for (const a of automacoes(empresaId)) {
    if (!a.ativa || (so && !so.has(a.id))) continue;
    const contagem = new Map<string, { n: number; c: ReturnType<typeof celulaDe> }>();
    for (const p of pedidos) {
      if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng) || p.em < agora - a.janelaMin * 60_000 || p.em > agora + 60_000) continue;
      const c = celulaDe(p.lat, p.lng, a.celulaKm);
      const chave = `${c.linha}:${c.coluna}`;
      const x = contagem.get(chave);
      if (x) x.n += 1; else contagem.set(chave, { n: 1, c });
    }
    for (const [chave, { n, c }] of contagem) {
      if (n < a.minPedidos) continue;
      const s = c.linha * c.dLat, w = c.coluna * c.dLng, no = s + c.dLat, l = w + c.dLng;
      const r6 = (v: number) => Number(v.toFixed(6));
      saida.push({
        id: `${a.id}:${chave}`, automacaoId: a.id, nome: a.nome, cidade: a.cidade, pedidos: n, cobranca: a.cobranca, valor: a.valor, minimo: a.minimo, nivel: nivelDinamica(a),
        centro: [r6((s + no) / 2), r6((w + l) / 2)], poligono: [[r6(s), r6(w)], [r6(s), r6(l)], [r6(no), r6(l)], [r6(no), r6(w)]],
      });
    }
  }
  return saida;
}

// ------------------------------------------------------------------ preço

export interface EntradaDinamica {
  categoria: string; valor: number; embarque?: { lat?: number; lng?: number }; demanda?: number; quando?: Date;
  /** Pedidos recentes da empresa (para as áreas automáticas). */
  pedidos?: PedidoRecente[];
}
export type GrupoDinamica = "manual" | "automatica" | "sem_area";
export interface CandidataDinamica { nome: string; adicional: number; grupo: GrupoDinamica }

function adicionalDe(r: { cobranca: CobrancaDinamica; valor: number; minimo: number }, base: number): number {
  const bruto = r.cobranca === "percentual" ? (base * r.valor) / 100 : r.cobranca === "multiplicador" ? base * (r.valor - 1) : r.valor;
  return Math.max(bruto, r.minimo);
}

/** Escolhe o que entra no preço entre as dinâmicas que valem, pela prioridade da empresa. */
export function resolverPrioridade(c: CandidataDinamica[], prioridade: PrioridadeDinamica): CandidataDinamica[] {
  if (c.length <= 1 || prioridade === "somar") return c;
  const maior = (l: CandidataDinamica[]) => l.reduce((a, b) => (b.adicional > a.adicional ? b : a));
  if (prioridade === "maior_valor") return [maior(c)];
  const doGrupo = c.filter((x) => x.grupo === prioridade);
  return [maior(doGrupo.length ? doGrupo : c)];
}

/** Soma o acréscimo das regras ligadas à categoria que valem agora, ali e com esta demanda (respeitando a prioridade entre elas). */
export function aplicarDinamica(empresaId: string, e: EntradaDinamica): { valor: number; adicional: number; regras: string[] } {
  const ids = new Set(extraDaCategoria(empresaId, e.categoria).dinamicas);
  if (!ids.size || !(e.valor > 0)) return { valor: e.valor, adicional: 0, regras: [] };
  const quando = e.quando ?? agoraBr();
  const tem = e.embarque?.lat != null && e.embarque.lng != null;
  const candidatas: CandidataDinamica[] = [];
  for (const r of dinamicas(empresaId)) {
    if (!r.ativa || !ids.has(r.id)) continue;
    const vale = r.tipo === "horario" ? noHorario(r, quando)
      : r.tipo === "mapa" ? tem && dentroDoPoligono(e.embarque!.lat!, e.embarque!.lng!, r.poligono)
      : (e.demanda ?? 0) > r.gatilho;
    if (vale) candidatas.push({ nome: r.nome, adicional: adicionalDe(r, e.valor), grupo: r.tipo === "mapa" ? "manual" : "sem_area" });
  }
  if (tem && e.pedidos?.length) {
    for (const a of areasAutomaticas(empresaId, e.pedidos, quando.getTime(), ids)) {
      if (dentroDoPoligono(e.embarque!.lat!, e.embarque!.lng!, a.poligono)) candidatas.push({ nome: a.nome, adicional: adicionalDe(a, e.valor), grupo: "automatica" });
    }
  }
  const escolhidas = resolverPrioridade(candidatas, prioridadeDinamicas(empresaId));
  const adicional = centavos(escolhidas.reduce((s, x) => s + x.adicional, 0));
  return { valor: centavos(e.valor + adicional), adicional, regras: escolhidas.map((x) => x.nome) };
}
