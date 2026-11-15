// CRM › Configurações › Governança: consentimento (LGPD), métricas de entrega dos últimos 30 dias e regras de envio
// (janela de horário e opt-in explícito). As regras valem de verdade no envio: ver "barrarEnvio", chamado pela fila do CRM.

import * as A from "../crm/armazem.ts";
import type { ItemFila } from "../crm/tipos.ts";
import { agoraBr } from "../servidor/util.ts";
import { bd, config2, config2Salva, dentroDaJanela, DIA } from "./base.ts";

export function resumoDeGovernanca(empresa: string, agora = Date.now()) {
  const db = bd();
  const conta = (s: string) => (db.prepare("SELECT COUNT(*) AS n FROM crm_contatos WHERE empresa = ? AND opt_in_status = ?").get(empresa, s) as { n: number }).n;
  const total = (db.prepare("SELECT COUNT(*) AS n FROM crm_contatos WHERE empresa = ?").get(empresa) as { n: number }).n;
  const desde = agora - 30 * DIA;
  let enviadas = 0, falhas = 0, puladas = 0;
  for (const i of A.fila(empresa)) {
    if (i.estado === "enviado" && (i.enviadoEm ?? 0) >= desde) enviadas++;
    else if (i.estado === "falha" && i.criadoEm >= desde) falhas++;
    else if (i.estado === "cancelado" && i.criadoEm >= desde) puladas++;
  }
  const soma = enviadas + falhas + puladas;
  const optIn = conta("in"), optOut = conta("out"), pendentes = conta("pending");
  return {
    totalContacts: total, optIn, optOut, pending: pendentes, sentCount: enviadas, failedCount: falhas, skippedCount: puladas,
    deliveryRate: soma > 0 ? Math.round((enviadas / soma) * 100) : 0,
    consentRate: total > 0 ? Math.round(((optIn + pendentes) / total) * 100) : 0,
    settings: config2(empresa),
  };
}

export interface Barrar { barrar: "janela" | "optin" | null; motivo: string }

/**
 * A fila pode mandar esta mensagem agora? Fora da janela de horário a mensagem espera (continua pendente).
 * Com "exigir opt-in", quem não confirmou o opt-in não recebe: a mensagem é cancelada com o motivo.
 */
export function barrarEnvio(empresa: string, item: Pick<ItemFila, "chave">, brasilia = agoraBr()): Barrar {
  const c = config2Salva(empresa);
  if (!c) return { barrar: null, motivo: "" }; // a empresa nunca mexeu na Governança: nada é restringido
  if (!dentroDaJanela(c, brasilia)) return { barrar: "janela", motivo: `Fora da janela de envio (${c.janelaInicio} às ${c.janelaFim})` };
  if (c.exigirOptIn) {
    const r = bd().prepare("SELECT opt_in_status AS s FROM crm_contatos WHERE empresa = ? AND chave = ?").get(empresa, item.chave) as { s: string } | undefined;
    if (r?.s !== "in") return { barrar: "optin", motivo: "Sem opt-in confirmado (regra da Governança)" };
  }
  return { barrar: null, motivo: "" };
}
