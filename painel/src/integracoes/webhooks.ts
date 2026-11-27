// Webhooks de saída (Configurações › Integrações): a empresa cadastra endereços e recebe, por POST, o que acontece nas corridas.
// Comportamento no estilo da Machine:
//  - dois tipos: "Status" (mudança de status e fase) e "Ocorrencia" (taxa de cancelamento, tarifa recalculada, sem aceite, atraso, nota baixa...);
//  - no máximo 5 endereços por tipo, por empresa;
//  - cabeçalho Signature-V2 = HMAC-SHA-512 (hexadecimal) do corpo exato, com o segredo do endereço (mostrado uma única vez);
//  - envelope com event_id (novo a cada tentativa) e source_event_id (estável: serve para o receptor descartar repetidos);
//  - entrega pelo menos uma vez: falhou, tenta de novo com espera crescente (10 s, 1 min, 5 min, 30 min, 2 h, 6 h).
// Tipos "Posição" e "Mensagens" da Machine não existem aqui (ver docs/CONFERENCIA_MACHINE.md).

import crypto from "node:crypto";
import net from "node:net";
import { gravarConfig, lerConfig } from "../config/armazem.ts";
import { banco, arquivoDoBanco } from "../servidor/banco.ts";
import * as D from "../servidor/dados.ts";
import { agoraBr } from "../servidor/util.ts";

export const TIPOS_WEBHOOK = ["Status", "Ocorrencia"] as const;
export type TipoWebhook = typeof TIPOS_WEBHOOK[number];
export const MAX_POR_TIPO = 5;
/** Espera (ms) antes de cada nova tentativa; passou do fim da lista, a entrega fica como "falhou". */
export const ESPERAS_MS = [10_000, 60_000, 300_000, 1_800_000, 7_200_000, 21_600_000];
const TIMEOUT_MS = 10_000;
const GUARDAR_DIAS = 14;

export interface Webhook { id: string; tipo: TipoWebhook; url: string; ativo: boolean; criadoEm: string }
export interface WebhookPublico extends Webhook { segredoFim: string }
const lista = (empresaId: string) => lerConfig<Webhook[]>(empresaId, "webhooks-saida", []);
const salvar = (empresaId: string, l: Webhook[]) => gravarConfig(empresaId, "webhooks-saida", l);

// ------------------------------------------------------------------ segredo

const chaveSegredo = (id: string) => `webhook-${id}`;
const segredoDe = (empresaId: string, id: string) => D.segredos(empresaId).integracoes[chaveSegredo(id)]?.segredo ?? "";
function gravarSegredo(empresaId: string, id: string, segredo: string | null) {
  const s = D.segredos(empresaId);
  if (segredo === null) delete s.integracoes[chaveSegredo(id)]; else s.integracoes[chaveSegredo(id)] = { segredo };
  D.salvarSegredos(empresaId, s);
}
const novoSegredo = () => "whsec_" + crypto.randomBytes(32).toString("hex");

/** Assinatura do cabeçalho Signature-V2: HMAC-SHA-512 do corpo, em hexadecimal. */
export const assinar = (corpo: string, segredo: string) => crypto.createHmac("sha512", segredo).update(corpo).digest("hex");

// ------------------------------------------------------------------ endereço

const permitirLocal = () => process.env.WEBHOOK_PERMITIR_LOCAL === "1" || (process.env.NODE_ENV === "test" && process.env.WEBHOOK_PERMITIR_LOCAL !== "0");
/** Endereço de rede interna (o servidor não pode ser usado para bater em serviços de dentro da casa). */
function enderecoInterno(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (net.isIPv4(h)) {
    const [a, b] = h.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (net.isIPv6(h)) return h === "::1" || h === "::" || /^f[cd]/.test(h) || /^fe[89ab]/.test(h) || h.startsWith("::ffff:");
  return false;
}
export function validarUrl(entrada: unknown): string {
  let u: URL;
  try { u = new URL(String(entrada ?? "").trim()); } catch { throw new Error("Informe o endereço completo, por exemplo https://sua-empresa.com.br/webhook."); }
  if (u.username || u.password) throw new Error("O endereço não pode ter usuário e senha.");
  if (u.protocol !== "https:" && !(u.protocol === "http:" && permitirLocal())) throw new Error("O endereço precisa começar com https://.");
  if (enderecoInterno(u.hostname) && !permitirLocal()) throw new Error("Este endereço é de rede interna e não pode receber webhooks.");
  return u.toString().slice(0, 500);
}

// ------------------------------------------------------------------ cadastro

const publico = (empresaId: string, w: Webhook): WebhookPublico => ({ ...w, segredoFim: segredoDe(empresaId, w.id).slice(-4) });
export const listarWebhooks = (empresaId: string): WebhookPublico[] => lista(empresaId).map((w) => publico(empresaId, w));

/** Cria um webhook. O segredo só volta aqui (e ao girar): guarde. Limite de 5 por tipo. */
export function criarWebhook(empresaId: string, e: { tipo?: unknown; url?: unknown }): { webhook: WebhookPublico; segredo: string } {
  const tipo = TIPOS_WEBHOOK.find((t) => t === e.tipo);
  if (!tipo) throw new Error("Escolha o tipo: Status ou Ocorrencia.");
  const url = validarUrl(e.url);
  const l = lista(empresaId);
  if (l.filter((w) => w.tipo === tipo).length >= MAX_POR_TIPO) throw new Error(`Cada tipo aceita no máximo ${MAX_POR_TIPO} endereços. Remova um para cadastrar outro.`);
  const w: Webhook = { id: crypto.randomUUID().slice(0, 8), tipo, url, ativo: true, criadoEm: agoraBr().toISOString() };
  const segredo = novoSegredo();
  gravarSegredo(empresaId, w.id, segredo);
  salvar(empresaId, [...l, w]);
  return { webhook: publico(empresaId, w), segredo };
}

export function alterarWebhook(empresaId: string, id: string, e: { url?: unknown; ativo?: unknown }): WebhookPublico {
  const l = lista(empresaId);
  const w = l.find((x) => x.id === id);
  if (!w) throw new Error("Webhook não encontrado.");
  if (e.url !== undefined) w.url = validarUrl(e.url);
  if (e.ativo !== undefined) w.ativo = e.ativo === true || e.ativo === "true";
  salvar(empresaId, l);
  return publico(empresaId, w);
}

export function removerWebhook(empresaId: string, id: string) {
  const l = lista(empresaId);
  if (!l.some((x) => x.id === id)) throw new Error("Webhook não encontrado.");
  salvar(empresaId, l.filter((x) => x.id !== id));
  gravarSegredo(empresaId, id, null);
  banco().prepare("DELETE FROM webhook_entregas WHERE empresa = ? AND webhook_id = ? AND estado = 'pendente'").run(empresaId, id);
}

export function girarSegredo(empresaId: string, id: string): { webhook: WebhookPublico; segredo: string } {
  const w = lista(empresaId).find((x) => x.id === id);
  if (!w) throw new Error("Webhook não encontrado.");
  const segredo = novoSegredo();
  gravarSegredo(empresaId, id, segredo);
  return { webhook: publico(empresaId, w), segredo };
}

// ------------------------------------------------------------------ fila de entregas

const criadas = new Set<string>();
function tabela() {
  const db = banco();
  const arq = arquivoDoBanco();
  if (!criadas.has(arq)) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS webhook_entregas (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, empresa TEXT NOT NULL, webhook_id TEXT NOT NULL, source_event_id TEXT NOT NULL,
        tipo TEXT NOT NULL, corpo TEXT NOT NULL, tentativas INTEGER NOT NULL DEFAULT 0, proxima_em INTEGER NOT NULL,
        estado TEXT NOT NULL DEFAULT 'pendente', ultimo_status INTEGER, ultimo_erro TEXT NOT NULL DEFAULT '', criado_em TEXT NOT NULL, entregue_em TEXT);
      CREATE INDEX IF NOT EXISTS webhook_entregas_fila ON webhook_entregas (estado, proxima_em);
      CREATE INDEX IF NOT EXISTS webhook_entregas_empresa ON webhook_entregas (empresa, seq);
    `);
    criadas.add(arq);
  }
  return db;
}

/** Põe o evento na fila de cada webhook ativo do tipo. Nunca atrapalha a corrida: erro só vai para o log. Devolve o source_event_id (ou "" se ninguém ouve). */
export function enfileirar(empresaId: string, tipo: TipoWebhook, codigo: string, dados: Record<string, unknown>, agora = Date.now()): string {
  try {
    const alvos = lista(empresaId).filter((w) => w.ativo && w.tipo === tipo);
    if (!alvos.length) return "";
    const source = crypto.randomUUID();
    const corpo = JSON.stringify({ source_event_id: source, tipo, evento: codigo, occurred_at: new Date(agora).toISOString(), data: dados });
    const db = tabela(), ins = db.prepare("INSERT INTO webhook_entregas (empresa, webhook_id, source_event_id, tipo, corpo, proxima_em, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?)");
    for (const w of alvos) ins.run(empresaId, w.id, source, tipo, corpo, agora, agoraBr().toISOString());
    return source;
  } catch (err) { console.error("[webhooks] fila:", err instanceof Error ? err.message : err); return ""; }
}

export type Envio = (url: string, corpo: string, cabecalhos: Record<string, string>) => Promise<{ status: number }>;
const envioPadrao: Envio = async (url, corpo, cabecalhos) => {
  const r = await fetch(url, { method: "POST", headers: cabecalhos, body: corpo, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
  return { status: r.status };
};
let envio: Envio = envioPadrao;
/** Só para os testes: troca (ou volta, com undefined) a função que faz o POST. */
export const definirEnvio = (f?: Envio) => { envio = f ?? envioPadrao; };

interface Linha { seq: number; empresa: string; webhook_id: string; source_event_id: string; tipo: string; corpo: string; tentativas: number }
let processando = false;
let ultimaLimpeza = 0;

/** Entrega o que está na hora. Cada tentativa leva um event_id novo; o source_event_id é o mesmo. Devolve quantas entregas foram tentadas. */
export async function processarEntregas(agora = Date.now()): Promise<number> {
  if (processando) return 0;
  processando = true;
  try {
    const db = tabela();
    if (agora - ultimaLimpeza > 3600_000) {
      ultimaLimpeza = agora;
      db.prepare("DELETE FROM webhook_entregas WHERE estado <> 'pendente' AND criado_em < ?").run(new Date(agoraBr().getTime() - GUARDAR_DIAS * 86_400_000).toISOString());
    }
    const devidas = db.prepare("SELECT seq, empresa, webhook_id, source_event_id, tipo, corpo, tentativas FROM webhook_entregas WHERE estado = 'pendente' AND proxima_em <= ? ORDER BY seq LIMIT 50").all(agora) as unknown as Linha[];
    for (const l of devidas) {
      const w = lista(l.empresa).find((x) => x.id === l.webhook_id);
      if (!w || !w.ativo) { db.prepare("UPDATE webhook_entregas SET estado = 'falhou', ultimo_erro = ? WHERE seq = ?").run("Webhook removido ou desligado.", l.seq); continue; }
      const corpo = JSON.stringify({ event_id: crypto.randomUUID(), ...(JSON.parse(l.corpo) as object) });
      let status = 0, erro = "";
      try {
        status = (await envio(w.url, corpo, { "content-type": "application/json", "Signature-V2": assinar(corpo, segredoDe(l.empresa, w.id)), "user-agent": "mob-webhooks/1" })).status;
        if (status < 200 || status >= 300) erro = `O endereço respondeu ${status}.`;
      } catch (e) { erro = e instanceof Error ? e.message.slice(0, 200) : "Falha de rede."; }
      const n = l.tentativas + 1;
      if (!erro) db.prepare("UPDATE webhook_entregas SET estado = 'entregue', tentativas = ?, ultimo_status = ?, ultimo_erro = '', entregue_em = ? WHERE seq = ?").run(n, status, agoraBr().toISOString(), l.seq);
      else if (n > ESPERAS_MS.length) db.prepare("UPDATE webhook_entregas SET estado = 'falhou', tentativas = ?, ultimo_status = ?, ultimo_erro = ? WHERE seq = ?").run(n, status || null, erro, l.seq);
      else db.prepare("UPDATE webhook_entregas SET tentativas = ?, ultimo_status = ?, ultimo_erro = ?, proxima_em = ? WHERE seq = ?").run(n, status || null, erro, agora + ESPERAS_MS[n - 1], l.seq);
    }
    return devidas.length;
  } finally { processando = false; }
}

/** Últimas entregas da empresa (para a tela). */
export function entregasRecentes(empresaId: string, limite = 30) {
  return (tabela().prepare("SELECT seq, webhook_id, source_event_id, tipo, corpo, tentativas, estado, ultimo_status, ultimo_erro, criado_em, entregue_em FROM webhook_entregas WHERE empresa = ? ORDER BY seq DESC LIMIT ?").all(empresaId, Math.min(100, limite)) as unknown as Array<Record<string, unknown>>)
    .map((r) => ({ id: r.seq as number, webhookId: r.webhook_id as string, sourceEventId: r.source_event_id as string, tipo: r.tipo as string, evento: String((JSON.parse(String(r.corpo)) as { evento?: string }).evento ?? ""), tentativas: r.tentativas as number, estado: r.estado as string, ultimoStatus: (r.ultimo_status as number | null) ?? null, ultimoErro: r.ultimo_erro as string, criadoEm: r.criado_em as string, entregueEm: (r.entregue_em as string | null) ?? null }));
}

/** Manda um evento de teste na hora para o endereço (sem fila). Devolve o que o endereço respondeu. */
export async function testarWebhook(empresaId: string, id: string): Promise<{ ok: boolean; status: number; erro: string }> {
  const w = lista(empresaId).find((x) => x.id === id);
  if (!w) throw new Error("Webhook não encontrado.");
  const corpo = JSON.stringify({ event_id: crypto.randomUUID(), source_event_id: crypto.randomUUID(), tipo: w.tipo, evento: "TESTE", occurred_at: new Date().toISOString(), data: { teste: true } });
  try {
    const { status } = await envio(w.url, corpo, { "content-type": "application/json", "Signature-V2": assinar(corpo, segredoDe(empresaId, w.id)), "user-agent": "mob-webhooks/1" });
    return { ok: status >= 200 && status < 300, status, erro: status >= 200 && status < 300 ? "" : `O endereço respondeu ${status}.` };
  } catch (e) { return { ok: false, status: 0, erro: e instanceof Error ? e.message.slice(0, 200) : "Falha de rede." }; }
}

let relogio: NodeJS.Timeout | null = null;
/** Liga a entrega (index.ts chama uma vez ao subir). */
export function iniciarWebhooks(intervaloMs = 5000) {
  if (relogio) return;
  relogio = setInterval(() => { processarEntregas().catch((e) => console.error("[webhooks]", e instanceof Error ? e.message : e)); }, intervaloMs);
  relogio.unref();
}
