// Público do CRM: passageiros e motoristas do CADASTRO da empresa (cadastros "clientes" e "motoristas"),
// completados com as corridas (próprias e das integrações opcionais). Funciona sem nenhuma chave externa.
// Quem está no cadastro e ainda não pediu corrida também entra. Cidade e nome do cadastro valem mais.
// Regras de segmento são funções puras (testadas em test/crm.test.ts).

import type { Registro } from "../cadastros/armazem.ts";
import * as Cad from "../cadastros/armazem.ts";
import { cadastroPorId } from "../comum/cadastros.ts";
import type { CorridaPainel } from "../comum/corrida.ts";
import { buscarCorridas } from "../servidor/fontes/index.ts";
import { agoraBr, normal } from "../servidor/util.ts";
import * as A from "./armazem.ts";
import type { Contato, Lista, Regras, TipoPublico } from "./tipos.ts";

const DIA = 86_400_000;

/** Telefone só com dígitos e DDI 55 quando faltar (10 ou 11 dígitos = Brasil). */
export function telefoneWhatsApp(t: string): string {
  const d = String(t ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return d.length >= 12 && d.length <= 15 ? d : "";
}

function maisComum(m: Map<string, number>): string {
  let melhor = "", n = 0;
  for (const [k, v] of m) if (k && v > n) { melhor = k; n = v; }
  return melhor;
}

/** Chave da pessoa: telefone (últimos 11 dígitos) ou, sem telefone, o nome. */
export function chaveDe(tipo: TipoPublico, telefone: string, nome: string): string {
  const dig = String(telefone ?? "").replace(/\D/g, "");
  const id = dig.length >= 8 ? dig.slice(-11) : normal(nome);
  return id ? `${tipo === "passageiro" ? "p" : "m"}:${id}` : "";
}

/**
 * Junta cadastro e corridas por pessoa. `agora` no padrão do painel (Brasília nos campos UTC).
 * `cadastro`: registros de "clientes" (passageiros) ou "motoristas".
 */
export function montarContatos(corridas: CorridaPainel[], tipo: TipoPublico, agora: Date, optOut: Record<string, string> = {}, cadastro: Registro[] = []): Contato[] {
  type Acc = Contato & { _cid: Map<string, number>; _cat: Set<string>; _can: Set<string>; _ori: Set<string>; _cidCad: string };
  const m = new Map<string, Acc>();
  const novo = (chave: string, nome: string, tel: string): Acc => ({ chave, tipo, nome, telefone: tel, cidade: "", situacao: "", noCadastro: false, corridas: 0, finalizadas: 0, canceladas: 0, gasto: 0, ultimaCorrida: null, diasSemCorrida: null, ultimoGrupo: "", categorias: [], canais: [], origens: [], optOut: !!optOut[chave], _cid: new Map(), _cat: new Set(), _can: new Set(), _ori: new Set(), _cidCad: "" });
  for (const c of corridas) {
    const nome = (tipo === "passageiro" ? c.passageiro : c.motorista).trim();
    const tel = tipo === "passageiro" ? c.telefonePassageiro : c.telefoneMotorista;
    const chave = chaveDe(tipo, tel, nome);
    if (!chave) continue;
    let x = m.get(chave);
    if (!x) { x = novo(chave, nome, tel ?? ""); m.set(chave, x); }
    x.corridas++;
    if (c.grupo === "finalizada") { x.finalizadas++; x.gasto += c.valor ?? 0; }
    if (c.grupo === "cancelada") x.canceladas++;
    if (c.cidade) x._cid.set(c.cidade, (x._cid.get(c.cidade) ?? 0) + 1);
    if (c.categoria) x._cat.add(c.categoria);
    if (c.canal) x._can.add(c.canal);
    x._ori.add(c.origemNome);
    if (c.solicitadaEm && (!x.ultimaCorrida || c.solicitadaEm > x.ultimaCorrida)) {
      x.ultimaCorrida = c.solicitadaEm; x.ultimoGrupo = c.grupo;
      if (nome) x.nome = nome;
      if (tel) x.telefone = tel;
    }
  }
  for (const r of cadastro) {
    const nome = String(r.nome ?? "").trim(), tel = String(r.telefone ?? "");
    const chave = chaveDe(tipo, tel, nome);
    if (!chave) continue;
    let x = m.get(chave);
    if (!x) { x = novo(chave, nome, tel); m.set(chave, x); }
    if (nome) x.nome = nome;
    if (tel) x.telefone = tel;
    x._cidCad = String(r.cidade ?? "").trim();
    x.situacao = String(r.status ?? "");
    x.noCadastro = true;
    x._ori.add("Cadastro");
  }
  return [...m.values()].map(({ _cid, _cat, _can, _ori, _cidCad, ...x }) => ({
    ...x,
    cidade: _cidCad || maisComum(_cid),
    categorias: [..._cat].sort(), canais: [..._can].sort(), origens: [..._ori].sort(),
    gasto: Math.round(x.gasto * 100) / 100,
    diasSemCorrida: x.ultimaCorrida ? Math.max(0, Math.floor((agora.getTime() - Date.parse(x.ultimaCorrida)) / DIA)) : null,
  }));
}

const temAlgum = (l: string[] | undefined) => Array.isArray(l) && l.length > 0;
const contem = (lista: string[], alvo: string[]) => alvo.some((a) => lista.some((x) => normal(x) === normal(a)));

/** Aplica as regras. Listas fixas filtram pelas chaves; dinâmicas pelas regras delas (sem laço infinito). */
export function aplicarRegras(contatos: Contato[], r: Regras, listasSalvas: Lista[] = [], profundidade = 0): Contato[] {
  let out = contatos.filter((c) => c.tipo === r.tipo);
  if (temAlgum(r.cidades)) out = out.filter((c) => contem([c.cidade], r.cidades!));
  if (temAlgum(r.categorias)) out = out.filter((c) => contem(c.categorias, r.categorias!));
  if (temAlgum(r.canais)) out = out.filter((c) => contem(c.canais, r.canais!));
  if (r.inativoMinDias != null) out = out.filter((c) => (c.diasSemCorrida ?? Infinity) >= r.inativoMinDias!);
  if (r.inativoMaxDias != null) out = out.filter((c) => c.diasSemCorrida != null && c.diasSemCorrida <= r.inativoMaxDias!);
  if (r.corridasMin != null) out = out.filter((c) => c.corridas >= r.corridasMin!);
  if (r.corridasMax != null) out = out.filter((c) => c.corridas <= r.corridasMax!);
  const b = normal(r.busca);
  if (b) { const dig = b.replace(/\D/g, ""); out = out.filter((c) => normal(c.nome).includes(b) || (dig.length >= 3 && c.telefone.replace(/\D/g, "").includes(dig))); }
  if (r.listaId) {
    const l = listasSalvas.find((x) => x.id === r.listaId);
    if (!l) return [];
    if (l.modo === "fixa") { const s = new Set(l.chaves); out = out.filter((c) => s.has(c.chave)); }
    else if (profundidade < 3) { const s = new Set(aplicarRegras(contatos, { ...l.regras, tipo: r.tipo }, listasSalvas, profundidade + 1).map((c) => c.chave)); out = out.filter((c) => s.has(c.chave)); }
  }
  return out;
}

/** Situações do cadastro que não recebem mensagem (passageiro suspenso também não). */
const BLOQUEADOS = new Set(["Bloqueado", "Suspenso", "Bloqueio definitivo"]);

/** Quem pode receber WhatsApp: tem telefone válido, não pediu para sair e não está bloqueado nem suspenso no cadastro. Um envio por telefone. */
export function destinatarios(lista: Contato[]): Contato[] {
  const vistos = new Set<string>();
  return lista.filter((c) => {
    const t = telefoneWhatsApp(c.telefone);
    if (!t || c.optOut || BLOQUEADOS.has(c.situacao) || vistos.has(t)) return false;
    vistos.add(t);
    return true;
  });
}

/** Limpa regras vindas da tela. */
export function sanearRegras(o: unknown): Regras {
  const r = (o ?? {}) as Record<string, unknown>;
  const lista = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).trim().slice(0, 80)).filter(Boolean).slice(0, 50) : undefined);
  const num = (v: unknown) => (v === "" || v == null || !Number.isFinite(Number(v)) ? undefined : Math.max(0, Math.floor(Number(v))));
  const out: Regras = { tipo: r.tipo === "motorista" ? "motorista" : "passageiro" };
  const cid = lista(r.cidades), cat = lista(r.categorias), can = lista(r.canais);
  if (cid?.length) out.cidades = cid;
  if (cat?.length) out.categorias = cat;
  if (can?.length) out.canais = can;
  for (const k of ["inativoMinDias", "inativoMaxDias", "corridasMin", "corridasMax"] as const) { const n = num(r[k]); if (n !== undefined) out[k] = n; }
  if (typeof r.listaId === "string" && /^[\w-]{1,40}$/.test(r.listaId)) out.listaId = r.listaId;
  if (typeof r.busca === "string" && r.busca.trim()) out.busca = r.busca.trim().slice(0, 80);
  return out;
}

// ------------------------------------------------------------------ busca com cache curto

const cache = new Map<string, { em: number; corridas: CorridaPainel[]; avisos: string[] }>();
const VALIDADE_MS = 2 * 60_000;

export function limparCachePublico(empresaId?: string) {
  if (!empresaId) cache.clear(); else cache.delete(empresaId);
}

/** Corridas dos últimos N dias (config da empresa) de todas as integrações ativas. */
export async function corridasDoPublico(empresaId: string): Promise<{ corridas: CorridaPainel[]; avisos: string[] }> {
  const c = cache.get(empresaId);
  if (c && Date.now() - c.em < VALIDADE_MS) return c;
  const dias = A.config(empresaId).diasHistorico;
  const agora = agoraBr();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const r = await buscarCorridas(empresaId, { inicio: iso(new Date(agora.getTime() - dias * DIA)), fim: iso(agora) });
  const novo = { em: Date.now(), corridas: r.corridas, avisos: r.avisos };
  cache.set(empresaId, novo);
  return novo;
}

export async function publico(empresaId: string, tipo: TipoPublico): Promise<{ contatos: Contato[]; avisos: string[] }> {
  const r = await corridasDoPublico(empresaId);
  const cad = cadastroPorId(tipo === "passageiro" ? "clientes" : "motoristas");
  const registros = cad ? Cad.listar(empresaId, cad) : [];
  return { contatos: montarContatos(r.corridas, tipo, agoraBr(), A.optOuts(empresaId), registros), avisos: r.avisos };
}

/** Público já filtrado pelas regras. */
export async function selecionar(empresaId: string, regras: Regras) {
  const { contatos, avisos } = await publico(empresaId, regras.tipo);
  return { todos: contatos, lista: aplicarRegras(contatos, regras, A.listas(empresaId)), avisos };
}

/** Opções para os filtros da tela (valores que existem no público). */
export function opcoes(contatos: Contato[]) {
  const conta = (f: (c: Contato) => string[]) => {
    const m = new Map<string, number>();
    for (const c of contatos) for (const v of f(c)) if (v) m.set(v, (m.get(v) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([valor, total]) => ({ valor, total }));
  };
  return { cidades: conta((c) => [c.cidade]), categorias: conta((c) => c.categorias), canais: conta((c) => c.canais) };
}
