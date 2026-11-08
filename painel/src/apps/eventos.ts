// Tempo real dos apps. Dois caminhos, com os mesmos eventos:
//  1. SSE: GET /api/apps/<empresa>/eventos (fluxo aberto). O mais rápido.
//  2. Espera longa: GET /api/apps/<empresa>/eventos/espera?desde=<n>. Responde na hora se já há evento novo,
//     senão espera até 25 s. Para redes, proxies e túneis que não repassam SSE (ex.: túnel rápido de teste).
// O destino é sempre { empresa, papel, chave } (chave = id do motorista ou telefone do passageiro), então um
// evento nunca vai para outra empresa nem para outra pessoa.

import type { PapelApp } from "./sessoes.ts";

export interface Alvo { papel: PapelApp; chave: string }
export type Envio = (tipo: string, dados: unknown) => void;
interface Ouvinte extends Alvo { enviar: Envio }
export interface EventoGuardado { seq: number; tipo: string; dados: unknown; em: number }

const ouvintes = new Map<string, Set<Ouvinte>>();

/** Últimos eventos de cada pessoa, para a espera longa (até 100 por pessoa, por 5 minutos). */
const guardados = new Map<string, EventoGuardado[]>();
const esperando = new Map<string, Set<() => void>>();
const GUARDA_MS = 5 * 60_000;
let seq = 0;
const chaveDe = (empresaId: string, a: Alvo) => `${empresaId}|${a.papel}|${a.chave}`;

export function ouvir(empresaId: string, alvo: Alvo, enviar: Envio): () => void {
  const o: Ouvinte = { ...alvo, enviar };
  const s = ouvintes.get(empresaId) ?? new Set<Ouvinte>();
  s.add(o);
  ouvintes.set(empresaId, s);
  return () => { s.delete(o); if (!s.size) ouvintes.delete(empresaId); };
}

/** Manda um evento para todos os aparelhos abertos dessa pessoa (SSE e espera longa). Devolve quantos SSE receberam. */
let limpezaEm = 0;
/** Apaga quem não recebe evento há mais de 5 minutos (senão o mapa cresce com cada pessoa que já usou o app). */
function limpar(agora: number) {
  if (agora - limpezaEm < 60_000) return;
  limpezaEm = agora;
  for (const [k, l] of guardados) if (!l.length || agora - l[l.length - 1].em >= GUARDA_MS) guardados.delete(k);
}

export function emitir(empresaId: string, alvo: Alvo, tipo: string, dados: unknown): number {
  const agora = Date.now();
  limpar(agora);
  const k = chaveDe(empresaId, alvo);
  const l = (guardados.get(k) ?? []).filter((e) => agora - e.em < GUARDA_MS).slice(-99);
  l.push({ seq: ++seq, tipo, dados, em: agora });
  guardados.set(k, l);
  for (const acordar of esperando.get(k) ?? []) acordar();
  let n = 0;
  for (const o of ouvintes.get(empresaId) ?? []) {
    if (o.papel !== alvo.papel || o.chave !== alvo.chave) continue;
    try { o.enviar(tipo, dados); n++; } catch { /* conexão caiu: sai sozinha */ }
  }
  return n;
}

/** Espera longa: eventos depois de `desde`. desde < 0: só devolve o número atual (para começar). */
export function aguardar(empresaId: string, alvo: Alvo, desde: number, ms = 25_000, cancelado?: Promise<void>): Promise<{ seq: number; eventos: EventoGuardado[] }> {
  const k = chaveDe(empresaId, alvo);
  const novos = () => (guardados.get(k) ?? []).filter((e) => e.seq > desde);
  if (desde < 0) return Promise.resolve({ seq, eventos: [] });
  // O servidor reiniciou (seq voltou): manda o app recomeçar do número atual.
  if (desde > seq) return Promise.resolve({ seq, eventos: [] });
  const ja = novos();
  if (ja.length) return Promise.resolve({ seq, eventos: ja });
  return new Promise((ok) => {
    const s = esperando.get(k) ?? new Set<() => void>();
    esperando.set(k, s);
    const fim = () => { clearTimeout(t); s.delete(acordar); if (!s.size) esperando.delete(k); ok({ seq, eventos: novos() }); };
    const acordar = () => fim();
    const t = setTimeout(fim, ms);
    s.add(acordar);
    cancelado?.then(fim);
  });
}

/** Esta pessoa está com o tempo real aberto agora (fluxo ou espera longa)? */
export function conectado(empresaId: string, a: Alvo): boolean {
  for (const o of ouvintes.get(empresaId) ?? []) if (o.papel === a.papel && o.chave === a.chave) return true;
  return esperando.has(chaveDe(empresaId, a));
}

export const empresasComOuvintes = () => [...new Set([...ouvintes.keys(), ...[...esperando.keys()].map((k) => k.split("|")[0])])];
export const temOuvinte = (empresaId: string) => (ouvintes.get(empresaId)?.size ?? 0) > 0 || [...esperando.keys()].some((k) => k.startsWith(`${empresaId}|`));
