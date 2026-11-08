// Arquivos do CRM de cada empresa, em DADOS_DIR/empresas/<id>/crm/ (fora do Git):
//
//   listas.json      listas e segmentos
//   campanhas.json   campanhas
//   jornadas.json    jornadas (gatilhos)
//   (a fila de envio fica no banco do painel: servidor/banco.ts)
//   contatos.json    marcações por pessoa (não quer receber)
//   config.json      ritmo de envio e provedor de WhatsApp (sem segredos)
//   ritmo.json       estado do lote e da pausa do WhatsApp
//   disparos.json    quem já recebeu de cada jornada (para não repetir)
//
// URL e token do WhatsApp ficam em segredos.json da empresa (nunca vão para o navegador).
// O id da empresa é validado: uma empresa nunca lê a pasta de outra.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { banco, migrarUmaVez, transacao } from "../servidor/banco.ts";
import * as D from "../servidor/dados.ts";
import { validarUrlExterna } from "../servidor/url.ts";
import { CONFIG_PADRAO, type Campanha, type ConfigEnvio, type ItemFila, type Jornada, type Lista } from "./tipos.ts";

function pasta(empresaId: string) {
  if (!D.idValido(empresaId)) throw new Error("Empresa inválida.");
  return path.join(D.raiz(), "empresas", empresaId, "crm");
}
function ler<T>(empresaId: string, nome: string, padrao: T): T {
  try { return JSON.parse(fs.readFileSync(path.join(pasta(empresaId), nome), "utf8")) as T; } catch { return padrao; }
}
function gravar(empresaId: string, nome: string, valor: unknown) {
  const arq = path.join(pasta(empresaId), nome);
  fs.mkdirSync(path.dirname(arq), { recursive: true });
  const tmp = `${arq}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(valor, null, 2));
  fs.renameSync(tmp, arq);
}

export const novoId = () => crypto.randomUUID().slice(0, 8);

export const listas = (e: string) => ler<Lista[]>(e, "listas.json", []);
export const salvarListas = (e: string, l: Lista[]) => gravar(e, "listas.json", l);
export const campanhas = (e: string) => ler<Campanha[]>(e, "campanhas.json", []);
export const salvarCampanhas = (e: string, l: Campanha[]) => gravar(e, "campanhas.json", l);
export const jornadas = (e: string) => ler<Jornada[]>(e, "jornadas.json", []);
export const salvarJornadas = (e: string, l: Jornada[]) => gravar(e, "jornadas.json", l);

// Fila de envio: no banco (tabela crm_fila, uma linha por mensagem). O fila.json antigo é migrado na primeira vez
// que a empresa usa o CRM e vira fila.json.migrado.
const NOVENTA_DIAS = 90 * 86_400_000;

function filaPronta(e: string) {
  const arq = path.join(pasta(e), "fila.json"); // pasta() valida o id da empresa
  migrarUmaVez(e, "crm_fila", arq, (conteudo) => {
    const itens = Array.isArray(conteudo) ? (conteudo as ItemFila[]).filter((i) => i && typeof i.id === "string") : [];
    gravarItens(e, itens);
    return itens.length;
  });
}

function gravarItens(e: string, itens: ItemFila[]) {
  const st = banco().prepare(`INSERT INTO crm_fila (empresa, id, origem, estado, proxima_em, criado_em, enviado_em, dados) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (empresa, id) DO UPDATE SET origem = excluded.origem, estado = excluded.estado, proxima_em = excluded.proxima_em,
      criado_em = excluded.criado_em, enviado_em = excluded.enviado_em, dados = excluded.dados`);
  for (const i of itens) st.run(e, i.id, i.origem?.id ?? "", i.estado, i.proximaEm ?? 0, i.criadoEm ?? 0, i.enviadoEm ?? null, JSON.stringify(i));
}

const lerItem = (r: unknown) => JSON.parse(String((r as { dados: string }).dados)) as ItemFila;

/** Guarda no máximo 90 dias de mensagens já resolvidas. */
function podar(e: string) {
  banco().prepare("DELETE FROM crm_fila WHERE empresa = ? AND estado <> 'pendente' AND COALESCE(enviado_em, criado_em) <= ?").run(e, Date.now() - NOVENTA_DIAS);
}

/** Fila inteira da empresa (relatórios e telas). */
export function fila(e: string): ItemFila[] {
  filaPronta(e);
  return banco().prepare("SELECT dados FROM crm_fila WHERE empresa = ? ORDER BY criado_em, id").all(e).map(lerItem);
}

/** Mensagens de uma campanha ou jornada. */
export function filaDaOrigem(e: string, origemId: string): ItemFila[] {
  filaPronta(e);
  return banco().prepare("SELECT dados FROM crm_fila WHERE empresa = ? AND origem = ? ORDER BY criado_em, id").all(e, origemId).map(lerItem);
}

/** Põe mensagens novas na fila (tudo ou nada). */
export function adicionarNaFila(e: string, itens: ItemFila[]) {
  if (!itens.length) return;
  filaPronta(e);
  transacao(() => gravarItens(e, itens));
}

/** Próxima pendente que já pode sair (fora das campanhas pausadas). */
export function proximaPendente(e: string, agora: number, pausadas: Set<string>): ItemFila | null {
  filaPronta(e);
  const fora = [...pausadas];
  const r = banco().prepare(`SELECT dados FROM crm_fila WHERE empresa = ? AND estado = 'pendente' AND proxima_em <= ?
    ${fora.length ? `AND origem NOT IN (${fora.map(() => "?").join(",")})` : ""} ORDER BY proxima_em, criado_em LIMIT 1`).get(e, agora, ...fora);
  return r ? lerItem(r) : null;
}

/** Muda uma mensagem só (lê e grava juntas: nada se perde entre dois pedidos). */
export function alterarItem<T>(e: string, id: string, fn: (i: ItemFila | null) => T): T {
  filaPronta(e);
  return transacao(() => {
    const r = banco().prepare("SELECT dados FROM crm_fila WHERE empresa = ? AND id = ?").get(e, id);
    const item = r ? lerItem(r) : null;
    const antes = item && JSON.stringify(item);
    const out = fn(item);
    if (item && JSON.stringify(item) !== antes) gravarItens(e, [item]);
    return out;
  });
}

/** Lê, muda e grava a fila de uma vez (só as mensagens que mudaram são regravadas). */
export function alterarFila<T>(e: string, fn: (f: ItemFila[]) => T): T {
  filaPronta(e);
  return transacao(() => {
    const f = banco().prepare("SELECT dados FROM crm_fila WHERE empresa = ? ORDER BY criado_em, id").all(e).map(lerItem);
    const antes = new Map(f.map((i) => [i.id, JSON.stringify(i)]));
    const r = fn(f);
    const mudaram = f.filter((i) => antes.get(i.id) !== JSON.stringify(i));
    gravarItens(e, mudaram);
    const ficaram = new Set(f.map((i) => i.id));
    const del = banco().prepare("DELETE FROM crm_fila WHERE empresa = ? AND id = ?");
    for (const id of antes.keys()) if (!ficaram.has(id)) del.run(e, id);
    podar(e);
    return r;
  });
}

export const optOuts = (e: string) => ler<Record<string, string>>(e, "contatos.json", {});
export function marcarOptOut(e: string, chave: string, sair: boolean) {
  const m = optOuts(e);
  if (sair) m[chave] = new Date().toISOString(); else delete m[chave];
  gravar(e, "contatos.json", m);
}

export function config(e: string): ConfigEnvio {
  return sanearConfig(ler<Partial<ConfigEnvio>>(e, "config.json", {}));
}
export const salvarConfig = (e: string, c: ConfigEnvio) => gravar(e, "config.json", sanearConfig(c));

const inteiro = (v: unknown, min: number, max: number, padrao: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao;
};
export function sanearConfig(c: Partial<ConfigEnvio>): ConfigEnvio {
  const pausaMinMin = inteiro(c.pausaMinMin, 0, 240, CONFIG_PADRAO.pausaMinMin);
  return {
    provedor: c.provedor === "evolution" ? "evolution" : "simulado",
    lote: inteiro(c.lote, 0, 500, CONFIG_PADRAO.lote),
    pausaMinMin,
    pausaMaxMin: Math.max(pausaMinMin, inteiro(c.pausaMaxMin, 0, 240, CONFIG_PADRAO.pausaMaxMin)),
    limitePorMinuto: inteiro(c.limitePorMinuto, 1, 120, CONFIG_PADRAO.limitePorMinuto),
    diasHistorico: inteiro(c.diasHistorico, 7, 365, CONFIG_PADRAO.diasHistorico),
  };
}

export interface EstadoRitmo { loteContagem: number; pausaAte: number; ultimoEnvio: number; ultimos: number[] }
export const ritmo = (e: string) => ler<EstadoRitmo>(e, "ritmo.json", { loteContagem: 0, pausaAte: 0, ultimoEnvio: 0, ultimos: [] });
export const salvarRitmo = (e: string, r: EstadoRitmo) => gravar(e, "ritmo.json", r);

/** jornadaId -> chave da pessoa -> quando recebeu (ISO Brasília). */
export const disparos = (e: string) => ler<Record<string, Record<string, string>>>(e, "disparos.json", {});
export const salvarDisparos = (e: string, d: Record<string, Record<string, string>>) => gravar(e, "disparos.json", d);

// ------------------------------------------------------------------ segredos do WhatsApp

export interface CredWhatsApp { url: string; token: string; instancia: string }
const CHAVE_SEGREDO = "crm-whatsapp";

export function credWhatsApp(e: string): CredWhatsApp {
  const s = D.segredos(e).integracoes[CHAVE_SEGREDO] ?? {};
  return { url: s.url ?? "", token: s.token ?? "", instancia: s.instancia ?? "" };
}

/** Grava só o que veio preenchido. "••••••" = não mexe; texto vazio = apaga. */
export function salvarCredWhatsApp(e: string, novos: Partial<Record<keyof CredWhatsApp, unknown>>) {
  const seg = D.segredos(e);
  const atual = { ...(seg.integracoes[CHAVE_SEGREDO] ?? {}) };
  for (const k of ["url", "token", "instancia"] as const) {
    const v = novos[k];
    if (typeof v !== "string" || v === "••••••") continue;
    if (v.trim() === "") delete atual[k];
    else {
      if (k === "url") validarUrl(v.trim());
      atual[k] = v.trim().slice(0, 2000);
    }
  }
  seg.integracoes[CHAVE_SEGREDO] = atual;
  D.salvarSegredos(e, seg);
}

/** Só https e endereço público (o servidor não chama a rede interna). CRM_PERMITIR_URL_LOCAL=true libera para testes locais. */
export function validarUrl(u: string) {
  validarUrlExterna(u, "do WhatsApp");
}
