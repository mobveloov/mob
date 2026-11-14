// Onde o bot guarda os dados de cada empresa: dados/empresas/<id>/bot/ (fora do Git).
//   config.json      provedor e instância (sem segredos)
//   (conversas e mensagens ficam no banco do painel: servidor/banco.ts)
// URL e token do provedor e o segredo do webhook ficam nos segredos da empresa (segredos.json),
// na chave "bot-whatsapp". Nunca vão para o navegador.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { banco, migrarUmaVez } from "../servidor/banco.ts";
import * as D from "../servidor/dados.ts";
import { normalizeBotControl } from "./controle.ts";
import { normalizeBotTexts, normalizeFaq, normalizeGreeting } from "./textos-editaveis.ts";
import { normalizeStatusMessages } from "./mensagens-status.ts";
import { FLUXO_PADRAO, ID_PRINCIPAL, TIPOS_PROVEDOR, type ConexaoBot, type ConfigBot, type Conversa, type FluxoBot, type TipoProvedor } from "./tipos.ts";

export const CHAVE_SEGREDOS = "bot-whatsapp";
const MAX_MENSAGENS = 300;
const MAX_HISTORICO = 20;

function pasta(empresaId: string) {
  if (!D.idValido(empresaId)) throw new Error("Empresa inválida.");
  return path.join(D.raiz(), "empresas", empresaId, "bot");
}
function ler<T>(arq: string, padrao: T): T {
  try { return JSON.parse(fs.readFileSync(arq, "utf8")) as T; } catch { return padrao; }
}
function gravar(arq: string, valor: unknown) {
  fs.mkdirSync(path.dirname(arq), { recursive: true });
  const tmp = `${arq}.${process.pid}.${crypto.randomBytes(3).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(valor, null, 2));
  fs.renameSync(tmp, arq);
}

// ------------------------------------------------------------------ configuração

export const instanciaPadrao = (empresaId: string) => `bot-${empresaId}`;

export function configPadrao(empresaId: string): ConfigBot {
  return { ativo: false, provedor: "simulado", instancia: instanciaPadrao(empresaId), conexoes: [], ...avancadaPadrao() };
}

const avancadaPadrao = () => ({
  fluxo: { ...FLUXO_PADRAO }, textos: {}, saudacao: normalizeGreeting(null), faq: [], controle: normalizeBotControl(null), textosStatus: {},
});

/** Confere as configurações avançadas (fluxo, textos, saudação, respostas prontas, comandos, status). */
export function sanearAvancada(c: Partial<ConfigBot>): Pick<ConfigBot, "fluxo" | "textos" | "saudacao" | "faq" | "controle" | "textosStatus"> {
  const f = (c.fluxo ?? {}) as Partial<FluxoBot>;
  const fluxo = { ...FLUXO_PADRAO };
  for (const k of Object.keys(FLUXO_PADRAO) as Array<keyof FluxoBot>) if (typeof f[k] === "boolean") fluxo[k] = f[k]!;
  return { fluxo, textos: normalizeBotTexts(c.textos), saudacao: normalizeGreeting(c.saudacao), faq: normalizeFaq(c.faq), controle: normalizeBotControl(c.controle), textosStatus: normalizeStatusMessages(c.textosStatus) };
}

export function config(empresaId: string): ConfigBot {
  const c = ler<Partial<ConfigBot>>(path.join(pasta(empresaId), "config.json"), {});
  const p = configPadrao(empresaId);
  return {
    ativo: c.ativo ?? p.ativo,
    provedor: TIPOS_PROVEDOR.includes(c.provedor as TipoProvedor) ? (c.provedor as TipoProvedor) : "simulado",
    instancia: typeof c.instancia === "string" && c.instancia ? c.instancia : p.instancia,
    conexoes: sanearConexoes(c.conexoes),
    ...sanearAvancada(c),
  };
}

// ------------------------------------------------------------------ várias conexões (números) por empresa

export const MAX_CONEXOES = 10;
const ID_CONEXAO = /^[a-z0-9][a-z0-9-]{1,23}$/;

/** Confere a lista de conexões extras (a principal fica nos campos do topo da config). */
export function sanearConexoes(lista: unknown): ConexaoBot[] {
  if (!Array.isArray(lista)) return [];
  const vistos = new Set<string>([ID_PRINCIPAL]);
  const out: ConexaoBot[] = [];
  for (const x of lista as Array<Partial<ConexaoBot>>) {
    const id = String(x?.id ?? "");
    if (!ID_CONEXAO.test(id) || vistos.has(id)) continue;
    vistos.add(id);
    out.push({
      id, nome: String(x.nome ?? "").trim().slice(0, 60) || id, ativa: x.ativa !== false,
      provedor: TIPOS_PROVEDOR.includes(x.provedor as TipoProvedor) ? (x.provedor as TipoProvedor) : "simulado",
      instancia: String(x.instancia ?? "").trim().slice(0, 40) || `bot-${id}`,
      ...(x.phoneId ? { phoneId: String(x.phoneId).trim().slice(0, 40) } : {}),
    });
    if (out.length >= MAX_CONEXOES) break;
  }
  return out;
}

/** Todas as conexões da empresa, a principal primeiro. */
export function conexoesDe(empresaId: string): ConexaoBot[] {
  const c = config(empresaId);
  return [{ id: ID_PRINCIPAL, nome: "Principal", ativa: true, provedor: c.provedor, instancia: c.instancia }, ...c.conexoes];
}

export function conexao(empresaId: string, id: string = ID_PRINCIPAL): ConexaoBot | null {
  return conexoesDe(empresaId).find((x) => x.id === id) ?? null;
}

/** Cria ou muda uma conexão extra. O id é sorteado na criação. */
export function salvarConexao(empresaId: string, dados: Partial<ConexaoBot> & { id?: string }): ConexaoBot {
  const c = config(empresaId);
  const lista = [...c.conexoes];
  const i = dados.id ? lista.findIndex((x) => x.id === dados.id) : -1;
  if (dados.id && i < 0) throw new Error("Conexão não encontrada.");
  if (i < 0 && lista.length >= MAX_CONEXOES) throw new Error(`No máximo ${MAX_CONEXOES} conexões por empresa.`);
  const id = i >= 0 ? lista[i].id : `n${crypto.randomBytes(4).toString("hex")}`;
  const nova = sanearConexoes([{ ...(i >= 0 ? lista[i] : {}), ...dados, id }])[0];
  if (!nova) throw new Error("Conexão inválida.");
  if (instanciaEmUso(empresaId, nova.instancia, nova.id)) throw new Error("Já existe uma conexão com este nome de instância.");
  if (i >= 0) lista[i] = nova; else lista.push(nova);
  salvarConfig(empresaId, { ativo: c.ativo, provedor: c.provedor, instancia: c.instancia, conexoes: lista });
  return nova;
}

export function removerConexao(empresaId: string, id: string) {
  if (id === ID_PRINCIPAL) throw new Error("A conexão principal não pode ser removida.");
  const c = config(empresaId);
  if (!c.conexoes.some((x) => x.id === id)) throw new Error("Conexão não encontrada.");
  salvarConfig(empresaId, { ativo: c.ativo, provedor: c.provedor, instancia: c.instancia, conexoes: c.conexoes.filter((x) => x.id !== id) });
  const s = D.segredos(empresaId);
  const { [`${CHAVE_SEGREDOS}-${id}`]: _fora, ...resto } = s.integracoes;
  D.salvarSegredos(empresaId, { ...s, integracoes: resto });
}

/** Duas conexões da mesma empresa não podem usar a mesma instância. */
function instanciaEmUso(empresaId: string, instancia: string, exceto: string) {
  return conexoesDe(empresaId).some((x) => x.id !== exceto && x.instancia.toLowerCase() === instancia.toLowerCase());
}

/** Grava a config. Campos que não vierem ficam como estão (as configurações avançadas não somem ao mudar só a conexão). */
export function salvarConfig(empresaId: string, c: Pick<ConfigBot, "ativo" | "provedor" | "instancia"> & Partial<ConfigBot>) {
  const arq = path.join(pasta(empresaId), "config.json");
  gravar(arq, { ...ler<Record<string, unknown>>(arq, {}), ...c });
}

/** Segredos do bot da empresa: urlApi e token (só se a empresa usa servidor próprio) e segredoWebhook. */
const chaveDe = (conexaoId: string) => (conexaoId === ID_PRINCIPAL ? CHAVE_SEGREDOS : `${CHAVE_SEGREDOS}-${conexaoId}`);

export function segredosBot(empresaId: string, conexaoId: string = ID_PRINCIPAL): Record<string, string> {
  return D.segredos(empresaId).integracoes[chaveDe(conexaoId)] ?? {};
}

export function salvarSegredosBot(empresaId: string, novos: Record<string, string | undefined>, conexaoId: string = ID_PRINCIPAL) {
  const s = D.segredos(empresaId);
  const chave = chaveDe(conexaoId);
  const atual = { ...(s.integracoes[chave] ?? {}) };
  for (const [k, v] of Object.entries(novos)) if (v !== undefined) { if (v === "") delete atual[k]; else atual[k] = v; }
  D.salvarSegredos(empresaId, { ...s, integracoes: { ...s.integracoes, [chave]: atual } });
}

/** Segredo da URL do webhook. Criado na primeira vez. */
export function segredoWebhook(empresaId: string): string {
  const atual = segredosBot(empresaId).segredoWebhook;
  if (atual && atual.length >= 24) return atual;
  const novo = crypto.randomBytes(24).toString("base64url");
  salvarSegredosBot(empresaId, { segredoWebhook: novo });
  return novo;
}

export function segredoConfere(empresaId: string, recebido: string): boolean {
  const atual = segredosBot(empresaId).segredoWebhook ?? "";
  if (!atual || atual.length !== recebido.length) return false;
  return crypto.timingSafeEqual(Buffer.from(atual), Buffer.from(recebido));
}

// ------------------------------------------------------------------ conversas

// Conversas ficam no banco (tabela bot_conversas, uma linha por conversa). O conversas.json antigo é migrado
// na primeira vez que a empresa usa o bot e vira conversas.json.migrado.
const arqConversas = (empresaId: string) => path.join(pasta(empresaId), "conversas.json");

function prontoParaUsar(empresaId: string) {
  pasta(empresaId); // valida o id da empresa
  migrarUmaVez(empresaId, "bot_conversas", arqConversas(empresaId), (conteudo) => {
    const todas = (conteudo && typeof conteudo === "object" ? conteudo : {}) as Record<string, Conversa>;
    let n = 0;
    for (const c of Object.values(todas)) if (c && typeof c.id === "string") { gravarConversa(empresaId, c); n++; }
    return n;
  });
}

function gravarConversa(empresaId: string, c: Conversa) {
  banco().prepare(`INSERT INTO bot_conversas (empresa, id, atualizada, aberta, dados) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (empresa, id) DO UPDATE SET atualizada = excluded.atualizada, aberta = excluded.aberta, dados = excluded.dados`)
    .run(empresaId, c.id, c.atualizadaEm ?? new Date().toISOString(), c.corrida?.grupo === "aberta" ? 1 : 0, JSON.stringify(c));
}

const lerLinha = (r: unknown) => JSON.parse(String((r as { dados: string }).dados)) as Conversa;

/** Todas as conversas da empresa (mais novas primeiro). `limite` corta a lista. */
export function conversas(empresaId: string, limite?: number): Record<string, Conversa> {
  prontoParaUsar(empresaId);
  const sql = `SELECT dados FROM bot_conversas WHERE empresa = ? ORDER BY atualizada DESC${limite ? " LIMIT ?" : ""}`;
  const linhas = limite ? banco().prepare(sql).all(empresaId, limite) : banco().prepare(sql).all(empresaId);
  return Object.fromEntries(linhas.map((r) => { const c = lerLinha(r); return [c.id, c]; }));
}

/** Só as conversas com corrida aberta (o aviso de status olha estas). */
export function conversasComCorridaAberta(empresaId: string): Conversa[] {
  prontoParaUsar(empresaId);
  return banco().prepare("SELECT dados FROM bot_conversas WHERE empresa = ? AND aberta = 1").all(empresaId).map(lerLinha);
}

export function conversa(empresaId: string, id: string): Conversa | null {
  prontoParaUsar(empresaId);
  const r = banco().prepare("SELECT dados FROM bot_conversas WHERE empresa = ? AND id = ?").get(empresaId, id);
  return r ? lerLinha(r) : null;
}

export function novaConversa(id: string, nome: string): Conversa {
  const agora = new Date().toISOString();
  return { id, nome: nome || id, etapa: "inicio", rascunho: {}, historico: [], mensagens: [], vistas: [], naoLidas: 0, criadaEm: agora, atualizadaEm: agora };
}

/** Grava só esta conversa (antes o arquivo inteiro era reescrito a cada mensagem). */
export function salvarConversa(empresaId: string, c: Conversa) {
  prontoParaUsar(empresaId);
  c.mensagens = c.mensagens.slice(-MAX_MENSAGENS);
  c.historico = c.historico.slice(-MAX_HISTORICO);
  c.vistas = c.vistas.slice(-200);
  c.atualizadaEm = new Date().toISOString();
  gravarConversa(empresaId, c);
}

// ------------------------------------------------------------------ trava por conversa

const filas = new Map<string, Promise<unknown>>();

/**
 * Roda `fn` sozinho para aquela conversa: mensagens do mesmo passageiro saem em ordem, e um toque duplo
 * espera o primeiro terminar (assim nunca nascem duas corridas). Conversas diferentes não esperam umas às outras.
 */
export function naFila<T>(empresaId: string, conversaId: string, fn: () => Promise<T>): Promise<T> {
  const chave = `${empresaId}/${conversaId}`;
  const antes = filas.get(chave) ?? Promise.resolve();
  const agora = antes.catch(() => undefined).then(fn);
  const fim = agora.finally(() => { if (filas.get(chave) === fim) filas.delete(chave); });
  filas.set(chave, fim);
  return agora;
}

/** Espera todas as filas esvaziarem (testes e desligamento). */
export async function aguardarFilas() {
  while (filas.size) await Promise.allSettled([...filas.values()]);
}

/** Empresas com o bot ligado. */
export const empresasComBot = () => D.listarEmpresas().filter((e) => e.ativa && config(e.id).ativo).map((e) => e.id);
