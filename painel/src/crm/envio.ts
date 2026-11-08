// Fila de envio por empresa, disparo de campanhas e rodada das jornadas.
//
// - Disparar uma campanha calcula o público NAQUELA hora e põe uma mensagem por telefone na fila.
// - processarFila manda as pendentes respeitando o ritmo (ritmo.ts). Caiu na pausa ou no limite: para e continua
//   pendente (não é falha). Erro passageiro do provedor: volta para a fila em 2 min (até 3 tentativas).
// - O trabalhador (iniciarTrabalhador) roda a cada 15 s: agendadas, jornadas (1x por hora) e fila.

import * as D from "../servidor/dados.ts";
import { agoraBr } from "../servidor/util.ts";
import * as A from "./armazem.ts";
import { conferirCupom } from "./cupons.ts";
import { escolherVariacao, montarTexto } from "./mensagem.ts";
import { aplicarRegras, destinatarios, publico, selecionar, telefoneWhatsApp } from "./publico.ts";
import { reservar } from "./ritmo.ts";
import type { Campanha, Contato, ItemFila, Jornada } from "./tipos.ts";
import { provedorDaEmpresa, type ProvedorWhatsApp } from "./whatsapp.ts";

const MAX_TENTATIVAS = 3;
const ESPERA_ERRO_MS = 2 * 60_000;

function novoItem(origem: ItemFila["origem"], c: Contato, texto: string, agora: number): ItemFila {
  return { id: A.novoId(), origem, chave: c.chave, nome: c.nome, telefone: telefoneWhatsApp(c.telefone), texto, estado: "pendente", tentativas: 0, criadoEm: agora, proximaEm: agora, enviadoEm: null, erro: "" };
}

const nomeEmpresa = (empresaId: string) => D.marca(empresaId).nomeExibido || D.empresa(empresaId)?.nome || "";

// ------------------------------------------------------------------ campanhas

/**
 * Disparos e rodadas em andamento. Sem esta trava, dois cliques em "Disparar" (ou o clique e o agendamento ao mesmo
 * tempo) passavam juntos pela conferência do estado e cada pessoa recebia a mensagem duas vezes.
 */
const emAndamento = new Set<string>();
async function sozinho<T>(chave: string, ocupado: () => T, fn: () => Promise<T>): Promise<T> {
  if (emAndamento.has(chave)) return ocupado();
  emAndamento.add(chave);
  try { return await fn(); } finally { emAndamento.delete(chave); }
}

/** Põe a campanha na fila. Devolve quantas mensagens entraram. */
export function dispararCampanha(empresaId: string, campanhaId: string, agora = Date.now()): Promise<number> {
  return sozinho(`campanha:${empresaId}:${campanhaId}`, () => { throw new Error("Esta campanha já está sendo disparada."); }, () => disparar(empresaId, campanhaId, agora));
}

async function disparar(empresaId: string, campanhaId: string, agora: number): Promise<number> {
  const c = A.campanhas(empresaId).find((x) => x.id === campanhaId);
  if (!c) throw new Error("Campanha não encontrada.");
  if (c.estado !== "rascunho" && c.estado !== "agendada") throw new Error("Esta campanha já foi disparada.");
  if (!c.texto.trim()) throw new Error("Escreva a mensagem.");
  const cupom = conferirCupom(empresaId, c.cupom, true);
  const { lista } = await selecionar(empresaId, c.publico);
  const alvo = destinatarios(lista);
  const empresa = nomeEmpresa(empresaId);
  const textos = [c.texto, ...c.variacoes];
  const itens = alvo.map((p) => novoItem({ tipo: "campanha", id: c.id }, p, montarTexto(escolherVariacao(textos, `${c.id}:${p.chave}`), { contato: p, cupom, empresa }), agora));
  A.alterarFila(empresaId, (f) => { f.push(...itens); });
  atualizarCampanha(empresaId, c.id, (x) => {
    x.estado = itens.length ? "enviando" : "concluida";
    x.disparadaEm = agoraBr().toISOString();
    x.destinatarios = itens.length;
    if (!itens.length) x.concluidaEm = x.disparadaEm;
  });
  return itens.length;
}

export function atualizarCampanha(empresaId: string, id: string, fn: (c: Campanha) => void): Campanha {
  const l = A.campanhas(empresaId);
  const c = l.find((x) => x.id === id);
  if (!c) throw new Error("Campanha não encontrada.");
  fn(c);
  c.atualizadaEm = new Date().toISOString();
  A.salvarCampanhas(empresaId, l);
  return c;
}

/** Cancela as pendentes da campanha (as já enviadas continuam no relatório). */
export function cancelarCampanha(empresaId: string, id: string) {
  A.alterarFila(empresaId, (f) => { for (const i of f) if (i.origem.id === id && i.estado === "pendente") { i.estado = "cancelado"; i.erro = "Campanha cancelada."; } });
  atualizarCampanha(empresaId, id, (c) => { c.estado = "cancelada"; c.concluidaEm = agoraBr().toISOString(); });
}

/** Campanha sem pendentes vira concluída. */
function fecharConcluidas(empresaId: string) {
  const l = A.campanhas(empresaId);
  const abertas = l.filter((c) => c.estado === "enviando");
  if (!abertas.length) return;
  const f = A.fila(empresaId);
  let mudou = false;
  for (const c of abertas) if (!f.some((i) => i.origem.id === c.id && i.estado === "pendente")) { c.estado = "concluida"; c.concluidaEm = agoraBr().toISOString(); mudou = true; }
  if (mudou) A.salvarCampanhas(empresaId, l);
}

/** Números da campanha (tudo calculado em código). */
export function relatorioCampanha(empresaId: string, id: string) {
  const c = A.campanhas(empresaId).find((x) => x.id === id);
  if (!c) throw new Error("Campanha não encontrada.");
  const itens = A.fila(empresaId).filter((i) => i.origem.tipo === "campanha" && i.origem.id === id);
  const conta = (e: ItemFila["estado"]) => itens.filter((i) => i.estado === e).length;
  const erros = new Map<string, number>();
  for (const i of itens) if (i.estado === "falha") erros.set(i.erro || "Erro", (erros.get(i.erro || "Erro") ?? 0) + 1);
  const enviados = itens.filter((i) => i.enviadoEm).map((i) => i.enviadoEm!);
  const total = itens.length;
  return {
    campanha: c, total, enviados: conta("enviado"), pendentes: conta("pendente"), falhas: conta("falha"), cancelados: conta("cancelado"),
    taxaEntrega: total ? Math.round((conta("enviado") / total) * 1000) / 10 : 0,
    primeiroEnvio: enviados.length ? new Date(Math.min(...enviados)).toISOString() : null,
    ultimoEnvio: enviados.length ? new Date(Math.max(...enviados)).toISOString() : null,
    erros: [...erros.entries()].map(([erro, n]) => ({ erro, total: n })).sort((a, b) => b.total - a.total),
    itens: itens.slice(0, 300).map(({ id: i, nome, telefone, estado, erro, enviadoEm, tentativas }) => ({ id: i, nome, telefone: mascarar(telefone), estado, erro, enviadoEm, tentativas })),
  };
}

/** Telefone com o meio escondido (relatórios e telas). */
export const mascarar = (t: string) => (t.length > 6 ? `${t.slice(0, 4)}•••••${t.slice(-4)}` : t);

// ------------------------------------------------------------------ jornadas

/**
 * Roda uma jornada: quem atende ao gatilho, às regras e ainda não recebeu desde a última corrida entra na fila.
 * "sem-corrida": sem corrida há pelo menos X dias. "cancelou": a última corrida foi cancelada há no máximo X dias.
 */
export function rodarJornada(empresaId: string, j: Jornada, agora = Date.now()): Promise<number> {
  // Rodada em andamento (trabalhador e botão "Rodar" juntos): a segunda não põe ninguém na fila de novo.
  return sozinho(`jornada:${empresaId}:${j.id}`, () => 0, () => rodar(empresaId, j, agora));
}

async function rodar(empresaId: string, j: Jornada, agora: number): Promise<number> {
  if (!j.texto.trim()) return 0;
  const cupom = conferirCupom(empresaId, j.cupom, true);
  const { contatos } = await publico(empresaId, j.publico.tipo);
  let alvo = aplicarRegras(contatos, j.publico, A.listas(empresaId));
  if (j.gatilho.tipo === "sem-corrida") alvo = alvo.filter((c) => c.diasSemCorrida != null && c.diasSemCorrida >= j.gatilho.dias);
  else alvo = alvo.filter((c) => c.ultimoGrupo === "cancelada" && c.diasSemCorrida != null && c.diasSemCorrida <= j.gatilho.dias);
  const d = A.disparos(empresaId);
  const ja = d[j.id] ?? {};
  // Já recebeu depois da última corrida: não repete (volta a valer quando a pessoa pedir de novo).
  alvo = destinatarios(alvo).filter((c) => !ja[c.chave] || (c.ultimaCorrida != null && ja[c.chave] < c.ultimaCorrida));
  const empresa = nomeEmpresa(empresaId);
  const quando = agoraBr().toISOString();
  const itens = alvo.map((c) => novoItem({ tipo: "jornada", id: j.id }, c, montarTexto(j.texto, { contato: c, cupom, empresa }), agora));
  for (const c of alvo) ja[c.chave] = quando;
  d[j.id] = ja;
  A.salvarDisparos(empresaId, d);
  if (itens.length) A.alterarFila(empresaId, (f) => { f.push(...itens); });
  const l = A.jornadas(empresaId);
  const x = l.find((y) => y.id === j.id);
  if (x) { x.ultimaRodada = quando; A.salvarJornadas(empresaId, l); }
  return itens.length;
}

// ------------------------------------------------------------------ fila

export interface Opcoes {
  agora?: () => number;
  dormir?: (ms: number) => Promise<void>;
  sorteio?: () => number;
  provedor?: ProvedorWhatsApp;
  /** Espera no máximo isto dentro de uma rodada (intervalo do lote); acima disso, para e volta depois. */
  esperaMaxMs?: number;
  maxItens?: number;
}

export interface ResumoRodada { enviados: number; falhas: number; adiados: number; pausaAte: number | null; motivo: "vazia" | "pausa" | "limite" | "fim" }

const travas = new Map<string, Promise<ResumoRodada>>();

/** Manda as pendentes da empresa. Uma rodada por empresa de cada vez. */
export function processarFila(empresaId: string, o: Opcoes = {}): Promise<ResumoRodada> {
  const atual = travas.get(empresaId);
  if (atual) return atual;
  const p = rodada(empresaId, o).finally(() => travas.delete(empresaId));
  travas.set(empresaId, p);
  return p;
}

async function rodada(empresaId: string, o: Opcoes): Promise<ResumoRodada> {
  const agora = o.agora ?? Date.now;
  const dormir = o.dormir ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const esperaMax = o.esperaMaxMs ?? 10_000;
  const maxItens = o.maxItens ?? 60;
  const cfg = A.config(empresaId);
  const provedor = o.provedor ?? provedorDaEmpresa(empresaId);
  const pausadas = new Set(A.campanhas(empresaId).filter((c) => c.estado === "pausada").map((c) => c.id));
  const r: ResumoRodada = { enviados: 0, falhas: 0, adiados: 0, pausaAte: null, motivo: "vazia" };
  for (let n = 0; n < maxItens; n++) {
    const t = agora();
    const item = A.fila(empresaId).filter((i) => i.estado === "pendente" && i.proximaEm <= t && !pausadas.has(i.origem.id)).sort((a, b) => a.proximaEm - b.proximaEm || a.criadoEm - b.criadoEm)[0];
    if (!item) { r.motivo = n ? "fim" : "vazia"; break; }
    const res = reservar(cfg, A.ritmo(empresaId), t, o.sorteio);
    if (!res.ok) {
      if (res.motivo === "limite" && res.ate - t <= esperaMax) { await dormir(res.ate - t); n--; continue; }
      r.motivo = res.motivo; r.pausaAte = res.ate;
      break;
    }
    A.salvarRitmo(empresaId, res.estado);
    const envio = await provedor.enviar(item.telefone, item.texto);
    A.alterarFila(empresaId, (f) => {
      const i = f.find((x) => x.id === item.id);
      if (!i || i.estado !== "pendente") return; // cancelada no meio do envio
      i.tentativas++;
      if (envio.ok) { i.estado = "enviado"; i.enviadoEm = agora(); i.erro = ""; r.enviados++; }
      else if (envio.temporario && i.tentativas < MAX_TENTATIVAS) { i.proximaEm = agora() + ESPERA_ERRO_MS; i.erro = envio.erro; r.adiados++; }
      else { i.estado = "falha"; i.erro = envio.erro; i.enviadoEm = null; r.falhas++; }
    });
    r.motivo = "fim";
  }
  fecharConcluidas(empresaId);
  return r;
}

/** Envio de teste: sai na hora, sem esperar a pausa (não conta no lote). */
export async function enviarTeste(empresaId: string, telefone: string, texto: string, provedor = provedorDaEmpresa(empresaId)) {
  const t = telefoneWhatsApp(telefone);
  if (!t) throw new Error("Telefone inválido. Use DDD + número.");
  if (!texto.trim()) throw new Error("Escreva a mensagem.");
  return provedor.enviar(t, texto.trim());
}

export function resumoFila(empresaId: string, agora = Date.now()) {
  const f = A.fila(empresaId);
  const r = A.ritmo(empresaId);
  const conta = (e: ItemFila["estado"]) => f.filter((i) => i.estado === e).length;
  return {
    pendentes: conta("pendente"), enviados: conta("enviado"), falhas: conta("falha"), cancelados: conta("cancelado"),
    emPausaAte: r.pausaAte > agora ? new Date(r.pausaAte).toISOString() : null, loteAtual: r.loteContagem,
    ultimos: [...f].sort((a, b) => (b.enviadoEm ?? b.criadoEm) - (a.enviadoEm ?? a.criadoEm)).slice(0, 50)
      .map((i) => ({ id: i.id, origem: i.origem, nome: i.nome, telefone: mascarar(i.telefone), estado: i.estado, erro: i.erro, quando: new Date(i.enviadoEm ?? i.criadoEm).toISOString() })),
  };
}

// ------------------------------------------------------------------ trabalhador

const HORA = 3600_000;

/** Uma volta para uma empresa: agendadas que venceram, jornadas (1x por hora) e a fila. */
export async function volta(empresaId: string) {
  const agoraIso = agoraBr().toISOString();
  for (const c of A.campanhas(empresaId)) {
    if (c.estado === "agendada" && c.agendadaPara && c.agendadaPara <= agoraIso) {
      try { await dispararCampanha(empresaId, c.id); } catch (e) { console.error("[crm] agendada", empresaId, c.id, e instanceof Error ? e.message : e); }
    }
  }
  for (const j of A.jornadas(empresaId)) {
    if (!j.ativa) continue;
    if (j.ultimaRodada && Date.parse(agoraIso) - Date.parse(j.ultimaRodada) < HORA) continue;
    try { await rodarJornada(empresaId, j); } catch (e) { console.error("[crm] jornada", empresaId, j.id, e instanceof Error ? e.message : e); }
  }
  await processarFila(empresaId);
}

let relogio: NodeJS.Timeout | null = null;
export function iniciarTrabalhador(intervaloMs = 15_000) {
  if (relogio) return;
  let ocupado = false;
  relogio = setInterval(async () => {
    if (ocupado) return;
    ocupado = true;
    try {
      for (const e of D.listarEmpresas().filter((x) => x.ativa)) {
        try { await volta(e.id); } catch (err) { console.error("[crm]", e.id, err instanceof Error ? err.message : err); }
      }
    } finally { ocupado = false; }
  }, intervaloMs);
  relogio.unref();
}
export function pararTrabalhador() { if (relogio) clearInterval(relogio); relogio = null; }
