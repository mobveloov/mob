// Tempo real dos apps: cada app abre GET /api/apps/<empresa>/eventos (SSE) e recebe só os eventos dele.
// O destino é sempre { empresa, papel, chave } (chave = id do motorista ou telefone do passageiro), então um
// evento nunca vai para outra empresa nem para outra pessoa.

import type { PapelApp } from "./sessoes.ts";

export interface Alvo { papel: PapelApp; chave: string }
export type Envio = (tipo: string, dados: unknown) => void;
interface Ouvinte extends Alvo { enviar: Envio }

const ouvintes = new Map<string, Set<Ouvinte>>();

export function ouvir(empresaId: string, alvo: Alvo, enviar: Envio): () => void {
  const o: Ouvinte = { ...alvo, enviar };
  const s = ouvintes.get(empresaId) ?? new Set<Ouvinte>();
  s.add(o);
  ouvintes.set(empresaId, s);
  return () => { s.delete(o); if (!s.size) ouvintes.delete(empresaId); };
}

/** Manda um evento para todos os aparelhos abertos dessa pessoa. Devolve quantos receberam. */
export function emitir(empresaId: string, alvo: Alvo, tipo: string, dados: unknown): number {
  let n = 0;
  for (const o of ouvintes.get(empresaId) ?? []) {
    if (o.papel !== alvo.papel || o.chave !== alvo.chave) continue;
    try { o.enviar(tipo, dados); n++; } catch { /* conexão caiu: sai sozinha */ }
  }
  return n;
}

export const empresasComOuvintes = () => [...ouvintes.keys()];
export const temOuvinte = (empresaId: string) => (ouvintes.get(empresaId)?.size ?? 0) > 0;
