// Descadastro por resposta no WhatsApp ("PARAR", "SAIR", "NÃO QUERO MAIS"), ligado ao opt-out do CRM.
// As regras de texto são as do sistema de referência (crm/optout.ts); a gravação usa a interface pública do CRM.

import { fila, marcarOptOut } from "../crm/armazem.ts";
import { BOT_BUSY_MINUTES, RECENT_HOURS, shouldOptOut, WA_OPTOUT_CONFIRM, waOptOutKey } from "../crm/optout.ts";
import { chaveDe } from "../crm/publico.ts";
import { mudarOptOut } from "../crm2/contatos.ts";
import type { Conversa } from "./tipos.ts";

/** Recebeu uma mensagem do CRM por WhatsApp nas últimas RECENT_HOURS? */
export function recebeuCampanhaRecente(empresaId: string, telefone: string, agora = Date.now()): boolean {
  const k = waOptOutKey(telefone);
  const desde = agora - RECENT_HOURS * 3_600_000;
  return fila(empresaId).some((i) => i.estado === "enviado" && (i.enviadoEm ?? 0) >= desde && waOptOutKey(i.telefone) === k);
}

/** Tem pedido em andamento no bot (corrida aberta ou conversa de pedido ativa)? */
export function botOcupado(c: Conversa, agora = Date.now()): boolean {
  if (c.corrida?.grupo === "aberta") return true;
  const pedido = !["inicio", "menu", "suporte", "avaliacao"].includes(c.etapa);
  return pedido && agora - Date.parse(c.atualizadaEm) < BOT_BUSY_MINUTES * 60_000;
}

/** Se o texto pede descadastro, grava o opt-out no CRM e devolve a confirmação. Senão, null. */
export function tratarDescadastro(empresaId: string, c: Conversa, texto: string, agora = Date.now()): string | null {
  const ctx = { recentCampaign: recebeuCampanhaRecente(empresaId, c.id, agora), botBusy: botOcupado(c, agora) };
  if (!shouldOptOut(texto, ctx)) return null;
  const chave = chaveDe("passageiro", c.id, c.nome);
  if (!chave) return null;
  try { mudarOptOut(empresaId, chave, true, "WhatsApp (resposta do passageiro)"); }
  catch { marcarOptOut(empresaId, chave, true); } // contato ainda não está na base do CRM: a marca vale igual
  return WA_OPTOUT_CONFIRM;
}
