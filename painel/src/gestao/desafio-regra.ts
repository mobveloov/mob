// Que corrida conta para cada tipo de desafio (sem dependências: usado pelo app e pelo painel).
import type { CorridaPropria } from "../corridas/index.ts";

/** Tipos de desafio de corridas (os outros são de indicação). */
export const TIPOS_DESAFIO_CORRIDA = ["Desafio de corridas", "Corridas pendentes aceitas", "Corridas maçaneta"];

/** Minutos procurando motorista para a corrida contar como "pendência" salva. */
export const MINUTOS_PENDENCIA = 3;

export function corridaFicouPendente(c: CorridaPropria): boolean {
  const aceita = c.atribuidaEm ?? c.historico.find((h) => h.status === "a_caminho")?.em;
  return !!aceita && Date.parse(aceita) - Date.parse(c.solicitadaEm) >= MINUTOS_PENDENCIA * 60_000;
}

/** A corrida finalizada conta para o desafio deste tipo? */
export function contaParaDesafio(tipo: string, c: CorridaPropria): boolean {
  if (c.status !== "finalizada") return false;
  if (tipo === "Corridas maçaneta") return c.canal === "totem";
  if (tipo === "Corridas pendentes aceitas") return corridaFicouPendente(c);
  return tipo === "Desafio de corridas";
}
