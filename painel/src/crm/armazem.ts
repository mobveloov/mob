// Arquivos do CRM de cada empresa, em DADOS_DIR/empresas/<id>/crm/ (fora do Git):
//
//   listas.json      listas e segmentos
//   campanhas.json   campanhas
//   jornadas.json    jornadas (gatilhos)
//   fila.json        fila de envio (mensagens pendentes, enviadas e com falha)
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

export const fila = (e: string) => ler<ItemFila[]>(e, "fila.json", []);
/** Lê, muda e grava a fila de uma vez (sem espera no meio: nada se perde entre dois pedidos). */
export function alterarFila<T>(e: string, fn: (f: ItemFila[]) => T): T {
  const f = fila(e);
  const r = fn(f);
  // Guarda no máximo 90 dias de mensagens já resolvidas.
  const limite = Date.now() - 90 * 86_400_000;
  gravar(e, "fila.json", f.filter((i) => i.estado === "pendente" || (i.enviadoEm ?? i.criadoEm) > limite));
  return r;
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
