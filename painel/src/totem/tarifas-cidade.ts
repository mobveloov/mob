// Preços por cidade (Totens & Preços › Preços › Preços por cidade): valor FIXO por trecho, com variação por horário,
// domingo e feriado, mais pedágio. Três tipos de tarifa: dentro da cidade, locais (zoológico, pesqueiro, sítio...) e
// entre cidades (vale nos dois sentidos). Usado quando a corrida cruza cidades ou vai a um local com valor próprio.
//
// Qual valor vale (o primeiro que se aplica E tem valor preenchido):
//   1) FERIADO -> feriado   2) DOMINGO -> domingo
//   3) FAIXAS EXTRAS de horário (ex.: 00:00-05:59 = R$ 25), valem antes da janela da noite
//   4) NOITE -> noite (janela noiteInicio..noiteFim, ex.: 22:00 a 06:00)   5) NORMAL -> normal (sempre existe)
// Horário de Brasília. Feriados: nacionais calculados aqui + os da empresa.
// Dados em DADOS_DIR/empresas/<id>/totem/tarifas-cidade.json (fora do Git). Teste: test/totem-tarifas-cidade.test.ts

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as D from "../servidor/dados.ts";

export interface Faixa { inicio: string; fim: string; valor: number }

export interface Tarifa {
  id: string;
  /** Cidade de origem. Vazia = qualquer origem (só entre cidades). */
  origemCidade: string;
  origemUf: string;
  destinoCidade: string;
  destinoUf: string;
  /** Local com valor próprio ("Zoológico"). Vazio = tarifa de cidade. */
  local: string;
  /** Categoria / tipo de corrida (ex.: CENTRAL). Vazio = todas. */
  categoria: string;
  normal: number;
  noite: number | null;
  noiteInicio: string;
  noiteFim: string;
  domingo: number | null;
  feriado: number | null;
  faixas: Faixa[];
  /** Pedágio por passagem (só entre cidades). */
  pedagio: number | null;
  pedagioIdaVolta: boolean;
  ativa: boolean;
  obs: string;
}

export type TipoTarifa = "dentro" | "local" | "cidades";
export interface Feriado { id: string; data: string; nome: string }
export interface DadosTarifas { tarifas: Tarifa[]; feriados: Feriado[]; esperaPorHora: number | null }

// ------------------------------------------------------------------ armazenamento

const arq = (e: string) => {
  if (!D.idValido(e)) throw new Error("Empresa inválida.");
  return path.join(D.raiz(), "empresas", e, "totem", "tarifas-cidade.json");
};
export function dados(e: string): DadosTarifas {
  try {
    const j = JSON.parse(fs.readFileSync(arq(e), "utf8")) as Partial<DadosTarifas>;
    return { tarifas: j.tarifas ?? [], feriados: j.feriados ?? [], esperaPorHora: j.esperaPorHora ?? null };
  } catch { return { tarifas: [], feriados: [], esperaPorHora: null }; }
}
function gravar(e: string, d: DadosTarifas) {
  fs.mkdirSync(path.dirname(arq(e)), { recursive: true });
  const tmp = `${arq(e)}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(d, null, 1), { mode: 0o600 });
  fs.renameSync(tmp, arq(e));
}

// ------------------------------------------------------------------ nomes

/** Nome de cidade/local sem acento, minúsculo e com espaços simples. */
export const normCidade = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const ufIgual = (a?: string | null, b?: string | null) => !a || !b || a.toUpperCase() === b.toUpperCase();

export function tipoDaTarifa(t: Pick<Tarifa, "local" | "origemCidade" | "destinoCidade">): TipoTarifa {
  if (t.local.trim()) return "local";
  return t.origemCidade && normCidade(t.origemCidade) === normCidade(t.destinoCidade) ? "dentro" : "cidades";
}
export const ehDentroDaCidade = (t: Tarifa) => tipoDaTarifa(t) === "dentro";

/** Chave para achar tarifa repetida. Entre cidades vale nos dois sentidos: A⇄B = B⇄A. */
export function chaveDaTarifa(tipo: TipoTarifa, t: Pick<Tarifa, "origemCidade" | "destinoCidade" | "categoria" | "local">): string {
  const cat = normCidade(t.categoria);
  if (tipo === "local") return `local|${normCidade(t.destinoCidade)}|${normCidade(t.local)}|${cat}`;
  if (tipo === "dentro") return `dentro|${normCidade(t.destinoCidade)}|${cat}`;
  return `cidades|${[normCidade(t.origemCidade), normCidade(t.destinoCidade)].sort().join("<>")}|${cat}`;
}

// ------------------------------------------------------------------ feriados e horários

const BRT_MS = 3 * 3600_000;
const pad = (n: number) => String(n).padStart(2, "0");
function partesBrt(ms: number) {
  const d = new Date(ms - BRT_MS);
  return { a: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), dow: d.getUTCDay() };
}

/** Domingo de Páscoa (Meeus/Jones/Butcher). */
function pascoa(ano: number) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  return { m: Math.floor((h + l - 7 * m + 114) / 31), d: ((h + l - 7 * m + 114) % 31) + 1 };
}

/** Feriados NACIONAIS ("AAAA-MM-DD"). Carnaval e Corpus Christi são ponto facultativo: ficam por conta da lista da empresa. */
export function feriadosNacionais(ano: number): Set<string> {
  const s = new Set<string>();
  const fixos: Array<[number, number]> = [[1, 1], [4, 21], [5, 1], [9, 7], [10, 12], [11, 2], [11, 15], [12, 25]];
  if (ano >= 2024) fixos.push([11, 20]);
  for (const [m, d] of fixos) s.add(`${ano}-${pad(m)}-${pad(d)}`);
  const p = pascoa(ano);
  const sexta = new Date(Date.UTC(ano, p.m - 1, p.d - 2));
  s.add(`${sexta.getUTCFullYear()}-${pad(sexta.getUTCMonth() + 1)}-${pad(sexta.getUTCDate())}`);
  return s;
}

const emMin = (t: string | null, padrao: number) => { const m = String(t ?? "").match(/^(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : padrao; };
/** O minuto do dia está na janela? "termina 05:59" vale até o fim desse minuto; início > fim atravessa a meia-noite. */
function naJanela(m: number, ini: string | null, fim: string | null, padIni: number, padFim: number) {
  const s = emMin(ini, padIni);
  let e = emMin(fim, padFim);
  if (e % 60 === 59) e += 1;
  return s > e ? m >= s || m < e : m >= s && m < e;
}

export const faixasValidas = (t: Pick<Tarifa, "faixas">): Faixa[] =>
  (Array.isArray(t.faixas) ? t.faixas : []).filter((b) => b && /^\d{1,2}:\d{2}/.test(String(b.inicio)) && /^\d{1,2}:\d{2}/.test(String(b.fim)) && Number(b.valor) > 0)
    .map((b) => ({ inicio: String(b.inicio).slice(0, 5), fim: String(b.fim).slice(0, 5), valor: Number(b.valor) }));

/** Pedágio a somar: valor por passagem x2 quando cobra ida e volta (padrão). */
export function pedagioDa(t: Tarifa): number {
  const v = Number(t.pedagio ?? 0);
  return !Number.isFinite(v) || v <= 0 ? 0 : Math.round(v * (t.pedagioIdaVolta === false ? 1 : 2) * 100) / 100;
}

export type TipoValor = "normal" | "noite" | "domingo" | "feriado";

/** Valor da tarifa no instante `quandoMs`. `feriadosEmpresa` = datas "AAAA-MM-DD". */
export function valorDaTarifa(t: Tarifa, quandoMs: number, feriadosEmpresa: Set<string> = new Set()): { valor: number; tipo: TipoValor } {
  const p = partesBrt(quandoMs);
  const data = `${p.a}-${pad(p.m)}-${pad(p.d)}`;
  if ((feriadosEmpresa.has(data) || feriadosNacionais(p.a).has(data)) && t.feriado != null) return { valor: Number(t.feriado), tipo: "feriado" };
  if (p.dow === 0 && t.domingo != null) return { valor: Number(t.domingo), tipo: "domingo" };
  const m = p.h * 60 + p.mi;
  for (const b of faixasValidas(t)) if (naJanela(m, b.inicio, b.fim, 0, 0)) return { valor: b.valor, tipo: "noite" };
  if (t.noite != null && naJanela(m, t.noiteInicio, t.noiteFim, 22 * 60, 6 * 60)) return { valor: Number(t.noite), tipo: "noite" };
  return { valor: Number(t.normal), tipo: "normal" };
}

/** Valor final ao passageiro: tarifa do horário/dia + pedágio. */
export function totalDaTarifa(t: Tarifa, quandoMs: number, feriadosEmpresa: Set<string> = new Set()) {
  const b = valorDaTarifa(t, quandoMs, feriadosEmpresa);
  const pedagio = pedagioDa(t);
  return { ...b, pedagio, total: Math.round((b.valor + pedagio) * 100) / 100 };
}

// ------------------------------------------------------------------ escolha da tarifa

/** A tarifa vale para origem -> destino? Direto, ou ao contrário (sempre vale nos dois sentidos). 2 = origem específica, 0 = qualquer origem, -1 = não vale. */
function pontuacao(t: Tarifa, oKey: string, oUf: string | null, dKey: string, dUf: string): number {
  if (normCidade(t.destinoCidade) === dKey && t.destinoUf.toUpperCase() === dUf.toUpperCase()) {
    if (!t.origemCidade) return 0;
    if (normCidade(t.origemCidade) === oKey && ufIgual(t.origemUf, oUf)) return 2;
  }
  if (t.origemCidade && oKey && normCidade(t.origemCidade) === dKey && ufIgual(t.origemUf, dUf) && normCidade(t.destinoCidade) === oKey && ufIgual(t.destinoUf, oUf)) return 2;
  return -1;
}

/** Tarifas que valem para o trajeto (origem vazia = qualquer origem), da mais específica para a menos. */
export function tarifasDoTrajeto(tarifas: Tarifa[], origem: { cidade: string | null; uf: string | null }, destino: { cidade: string; uf: string }): Tarifa[] {
  const dKey = normCidade(destino.cidade), oKey = origem.cidade ? normCidade(origem.cidade) : "";
  const out: Array<{ t: Tarifa; pontos: number }> = [];
  for (const t of tarifas) {
    if (!t.ativa || t.local.trim()) continue; // LOCAL casa pelo nome (tarifasDeLocal)
    let pontos = pontuacao(t, oKey, origem.uf, dKey, destino.uf);
    if (pontos < 0) continue;
    if (t.categoria.trim()) pontos += 1;
    out.push({ t, pontos });
  }
  // empate: a tarifa COM valor primeiro
  return out.sort((a, b) => b.pontos - a.pontos || (b.t.normal > 0 ? 1 : 0) - (a.t.normal > 0 ? 1 : 0)).map((x) => x.t);
}

/** Tarifa que vale para a categoria: a de categoria igual; senão a sem categoria; senão nenhuma. */
export function tarifaDaCategoria(doTrajeto: Tarifa[], categoria: string): Tarifa | null {
  const k = normCidade(categoria);
  return doTrajeto.find((t) => t.categoria.trim() && normCidade(t.categoria) === k) ?? doTrajeto.find((t) => !t.categoria.trim()) ?? null;
}

const PARADAS = new Set(["de", "da", "do", "das", "dos", "e", "o", "a", "os", "as", "no", "na"]);
const palavras = (s: string) => normCidade(s).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !PARADAS.has(w));

/** O texto fala do LOCAL? Todas as palavras do nome do local aparecem no texto ("pesqueiro do diu" em "pro pesqueiro do Diu"). */
export function localCitado(local: string, texto: string): boolean {
  const querem = palavras(local);
  if (!querem.length) return false;
  const tem = palavras(texto);
  return querem.every((w) => tem.includes(w) || tem.some((h) => h.length >= 5 && w.length >= 5 && (h.startsWith(w) || w.startsWith(h))));
}

/** Tarifas de LOCAL citadas no texto do embarque ou do destino. As de nome mais longo primeiro. */
export function tarifasDeLocal(tarifas: Tarifa[], ...textos: Array<string | null | undefined>): Tarifa[] {
  const t = textos.filter(Boolean).join(" | ");
  if (!t) return [];
  return tarifas.filter((x) => x.ativa && x.local.trim() && localCitado(x.local, t)).sort((a, b) => b.local.length - a.local.length);
}

/**
 * Cidade da TABELA citada no texto do destino. Vale o nome inteiro ou só o primeiro nome (4+ letras) quando só UMA cidade
 * da tabela começa com ele (Ribeirão Preto e Ribeirão Pires juntas: nenhuma).
 */
export function cidadeCitada(tarifas: Tarifa[], base: { cidade: string | null }, texto: string): { cidade: string; uf: string } | null {
  const bKey = base.cidade ? normCidade(base.cidade) : "";
  const t = ` ${normCidade(texto).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()} `;
  const inteiro = new Map<string, { cidade: string; uf: string }>(), comeco = new Map<string, { cidade: string; uf: string }>();
  for (const x of tarifas) {
    if (!x.ativa || x.local.trim() || ehDentroDaCidade(x)) continue;
    const usaOrigem = !!x.origemCidade && !!bKey && normCidade(x.destinoCidade) === bKey;
    const cidade = usaOrigem ? x.origemCidade : x.destinoCidade;
    const uf = usaOrigem ? x.origemUf : x.destinoUf;
    const k = normCidade(cidade);
    if (!k || k === bKey) continue;
    if (t.includes(` ${k} `)) inteiro.set(k, { cidade, uf });
    const primeiro = k.split(" ")[0];
    if (primeiro.length >= 4 && t.includes(` ${primeiro} `)) comeco.set(k, { cidade, uf });
  }
  if (inteiro.size === 1) return [...inteiro.values()][0];
  if (inteiro.size > 1) return null;
  return comeco.size === 1 ? [...comeco.values()][0] : null;
}

/**
 * Valor fixo para o destino digitado no totem: primeiro um LOCAL com valor próprio, depois uma cidade da tabela
 * (a partir da cidade do totem). null = sem tarifa (vale a tabela de preços do totem ou a tarifa da empresa).
 */
export function valorFixoDoDestino(
  empresaId: string, totem: { cidade: string; uf: string; embarque?: string }, destinoTexto: string, categoria: string, quandoMs = Date.now(),
): { total: number; valor: number; pedagio: number; tipo: TipoValor; tarifa: Tarifa } | null {
  const d = dados(empresaId);
  if (!d.tarifas.length || !destinoTexto.trim()) return null;
  const feriados = new Set(d.feriados.map((f) => f.data));
  const dosLocais = tarifasDeLocal(d.tarifas, destinoTexto, totem.embarque).filter((t) => t.normal > 0);
  let t: Tarifa | null = dosLocais.length ? tarifaDaCategoria(dosLocais, categoria) : null;
  if (!t && totem.cidade) {
    const c = cidadeCitada(d.tarifas, { cidade: totem.cidade }, destinoTexto);
    if (c) t = tarifaDaCategoria(tarifasDoTrajeto(d.tarifas, { cidade: totem.cidade, uf: totem.uf || null }, { cidade: c.cidade, uf: c.uf }).filter((x) => x.normal > 0), categoria);
  }
  if (!t) return null;
  return { ...totalDaTarifa(t, quandoMs, feriados), tarifa: t };
}

// ------------------------------------------------------------------ texto (resposta do bot e tabela)

export const reaisTxt = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;
const hm = (t: string | null, p: string) => String(t ?? p).slice(0, 5);
/** "22:00" -> "22h", "05:59" -> "5h59". */
const horaCurta = (t: string | null, p: string) => { const [h, m] = hm(t, p).split(":"); return `${Number(h)}h${m && m !== "00" ? m : ""}`; };
const nomeFaixa = (ini: string) => { const h = parseInt(ini, 10); return h < 6 ? "Madrugada" : h >= 18 ? "Noite" : "Horário especial"; };

/** Valores por horário: "R$ 15,00 · noite R$ 20,00 (22:00-06:00) · domingo R$ 18,00 · feriado R$ 20,00 + pedágio R$ 8,00". */
export function resumoDaTarifa(t: Tarifa): string {
  const p = [reaisTxt(t.normal)];
  if (Number(t.noite) > 0) p.push(`noite ${reaisTxt(Number(t.noite))} (${hm(t.noiteInicio, "22:00")}-${hm(t.noiteFim, "06:00")})`);
  for (const b of faixasValidas(t)) p.push(`${nomeFaixa(b.inicio).toLowerCase()} ${reaisTxt(b.valor)} (${b.inicio}-${b.fim})`);
  if (Number(t.domingo) > 0) p.push(`domingo ${reaisTxt(Number(t.domingo))}`);
  if (Number(t.feriado) > 0) p.push(`feriado ${reaisTxt(Number(t.feriado))}`);
  const ped = pedagioDa(t);
  return p.join(" · ") + (ped > 0 ? ` + pedágio ${reaisTxt(ped)}` : "");
}

/** Nome mostrado na busca: "CENTRAL", "Pesqueiro do Diu (Supermercado)", "Pitangueiras ⇄ Ribeirão Preto". */
export function tituloDaTarifa(t: Tarifa): string {
  const cat = t.categoria.trim(), k = tipoDaTarifa(t);
  const base = k === "local" ? t.local.trim() : k === "dentro" ? cat || "Corrida" : `${t.origemCidade || "Qualquer cidade"} ⇄ ${t.destinoCidade}`;
  return k !== "dentro" && cat ? `${base} (${cat})` : base;
}

// ------------------------------------------------------------------ cadastro (tela)

const dinheiro = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n <= 100000 ? Math.round(n * 100) / 100 : null;
};
const txt = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[<>]/g, "").trim().slice(0, max) : "");
const hora = (v: unknown, padrao: string) => (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d/.test(v) ? v.slice(0, 5) : padrao);

/** Tarifa vinda da tela: confere, limpa e aplica as regras do tipo (dentro/local usam a mesma cidade na origem e no destino). */
export function lerTarifa(e: Record<string, unknown>, tipo: TipoTarifa, id: string): Tarifa {
  const destinoCidade = txt(e.destinoCidade, 80), destinoUf = txt(e.destinoUf, 2).toUpperCase();
  if (!destinoCidade || !destinoUf) throw new Error("Escolha a cidade (e o estado)");
  const local = tipo === "local" ? txt(e.local, 80) : "";
  if (tipo === "local" && !local) throw new Error("Escreva o nome do local (ex.: Zoológico)");
  const normal = dinheiro(e.normal);
  if (!(normal != null && normal > 0)) throw new Error("Preencha o valor normal (dia)");
  const faixas: Faixa[] = [];
  for (const b of (Array.isArray(e.faixas) ? e.faixas : []) as Array<Record<string, unknown>>) {
    if (!b || (!b.inicio && !b.fim && (b.valor == null || b.valor === ""))) continue; // linha em branco some
    const valor = dinheiro(b.valor);
    if (!/^\d{1,2}:\d{2}/.test(String(b.inicio ?? "")) || !/^\d{1,2}:\d{2}/.test(String(b.fim ?? "")) || !(valor && valor > 0) || String(b.inicio).slice(0, 5) === String(b.fim).slice(0, 5)) {
      throw new Error("Em cada faixa de horário preencha quando começa, quando termina (diferente do começo) e o valor");
    }
    faixas.push({ inicio: String(b.inicio).slice(0, 5), fim: String(b.fim).slice(0, 5), valor });
  }
  const entre = tipo === "cidades";
  return {
    id, origemCidade: entre ? txt(e.origemCidade, 80) : destinoCidade, origemUf: entre ? txt(e.origemUf, 2).toUpperCase() : destinoUf,
    destinoCidade, destinoUf, local, categoria: txt(e.categoria, 60), normal, noite: dinheiro(e.noite),
    noiteInicio: hora(e.noiteInicio, "22:00"), noiteFim: hora(e.noiteFim, "06:00"), domingo: dinheiro(e.domingo), feriado: dinheiro(e.feriado), faixas,
    pedagio: entre ? dinheiro(e.pedagio) : null, pedagioIdaVolta: e.pedagioIdaVolta !== false, ativa: e.ativa !== false, obs: txt(e.obs, 200),
  };
}

export class TarifaRepetida extends Error { constructor(public existente: Tarifa) { super(`Já existe essa tarifa: "${tituloDaTarifa(existente)}" (${resumoDaTarifa(existente)}). Use a busca abaixo para editar.`); } }

export function salvarTarifa(empresaId: string, tipo: TipoTarifa, entrada: Record<string, unknown>, id?: string): Tarifa {
  const d = dados(empresaId);
  if (id && !d.tarifas.some((t) => t.id === id)) throw new Error("Tarifa não encontrada.");
  const nova = lerTarifa(entrada, tipo, id ?? crypto.randomUUID());
  const igual = d.tarifas.find((t) => t.id !== nova.id && tipoDaTarifa(t) === tipo && chaveDaTarifa(tipo, t) === chaveDaTarifa(tipo, nova));
  if (igual) throw new TarifaRepetida(igual);
  if (d.tarifas.length >= 2000 && !id) throw new Error("Limite de tarifas atingido.");
  gravar(empresaId, { ...d, tarifas: id ? d.tarifas.map((t) => (t.id === id ? nova : t)) : [...d.tarifas, nova] });
  return nova;
}
export function removerTarifa(empresaId: string, id: string) {
  const d = dados(empresaId);
  gravar(empresaId, { ...d, tarifas: d.tarifas.filter((t) => t.id !== id) });
}
export function adicionarFeriado(empresaId: string, data: string, nome: string): Feriado {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || Number.isNaN(Date.parse(data))) throw new Error("Data inválida.");
  const d = dados(empresaId);
  if (d.feriados.some((f) => f.data === data)) throw new Error("Esse feriado já está na lista.");
  const f = { id: crypto.randomUUID(), data, nome: txt(nome, 60) };
  gravar(empresaId, { ...d, feriados: [...d.feriados, f].sort((a, b) => a.data.localeCompare(b.data)) });
  return f;
}
export function removerFeriado(empresaId: string, id: string) {
  const d = dados(empresaId);
  gravar(empresaId, { ...d, feriados: d.feriados.filter((f) => f.id !== id) });
}
export function definirEspera(empresaId: string, v: unknown) {
  const n = dinheiro(v);
  gravar(empresaId, { ...dados(empresaId), esperaPorHora: n != null && n > 0 ? n : null });
}

// ------------------------------------------------------------------ texto da tabela (bot e tela)

/** Bloco de valores: 🚗 *CENTRAL* / ☀️ Dia / 🌙 Noite / 📅 Domingo e feriado / 🚧 pedágio. Valores iguais ao do dia não repetem. */
export function blocoDaTarifa(t: Tarifa, titulo: string, emoji: string): string[] {
  const dia = t.normal;
  const noite = Number(t.noite) > 0 ? Number(t.noite) : null, dom = Number(t.domingo) > 0 ? Number(t.domingo) : null, fer = Number(t.feriado) > 0 ? Number(t.feriado) : null;
  const faixas = faixasValidas(t);
  const out = [`${emoji} *${titulo}*`];
  if ([noite, dom, fer, ...faixas.map((b) => b.valor)].every((v) => v == null || v === dia)) out.push(`💵 Qualquer dia e horário: *${reaisTxt(dia)}*`);
  else {
    out.push(`☀️ Dia: *${reaisTxt(dia)}*`);
    if (noite != null && noite !== dia) out.push(`🌙 Noite (${horaCurta(t.noiteInicio, "22:00")} às ${horaCurta(t.noiteFim, "06:00")}): *${reaisTxt(noite)}*`);
    for (const b of faixas) {
      if (b.valor === dia) continue;
      const n = nomeFaixa(b.inicio);
      out.push(`${n === "Madrugada" ? "🌌" : n === "Noite" ? "🌙" : "⏰"} ${n} (${horaCurta(b.inicio, "00:00")} às ${horaCurta(b.fim, "00:00")}): *${reaisTxt(b.valor)}*`);
    }
    const dd = dom != null && dom !== dia ? dom : null, ff = fer != null && fer !== dia ? fer : null;
    if (dd != null && ff != null && dd === ff) out.push(`📅 Domingo e feriado: *${reaisTxt(dd)}*`);
    else { if (dd != null) out.push(`📅 Domingo: *${reaisTxt(dd)}*`); if (ff != null) out.push(`🎉 Feriado: *${reaisTxt(ff)}*`); }
  }
  const ped = pedagioDa(t);
  if (ped > 0) out.push(`🚧 + pedágio: *${reaisTxt(ped)}*`);
  return out;
}
