// Regra de cobrança de cada motorista, usada para calcular a comissão da central.

import { configMotorista } from "./regras.ts";

export interface RegraDeCobranca { tipo: "padrao" | "personalizado" | "isento"; modelo?: "percentual" | "fixo"; valor?: number }

/**
 * Padrão = vale a regra da empresa (comissão por categoria); Isento = a central não cobra;
 * Personalizado = percentual ou valor fixo por corrida. Lê os campos do cadastro: cobranca, cobrancaTipo e cobrancaValor.
 */
export function regraDeCobrancaDoMotorista(empresaId: string, motoristaId: string): RegraDeCobranca {
  const t = configMotorista(empresaId, motoristaId).taxa;
  if (t.modo === "padrao") return { tipo: "padrao" };
  if (t.modo === "isento") return { tipo: "isento" };
  if (t.tipo === "porcentagem") return { tipo: "personalizado", modelo: "percentual", valor: t.valor };
  return { tipo: "personalizado", modelo: "fixo", valor: t.valor };
}
