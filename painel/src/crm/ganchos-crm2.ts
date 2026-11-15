// Liga os envios de gatilhos e da régua às abas Conversão e Auditoria (CRM › Análises e Configurações).

import { registrarEntidadeAuditada } from "../crm2/auditoria.ts";
import { registrarFonteDeEnvios, type Envio } from "../crm2/conversao.ts";
import { banco } from "../servidor/banco.ts";
import { gatilhos } from "./gatilhos.ts";
import { segmentos } from "./segmentos.ts";
import { chaveDe } from "./publico.ts";

registrarFonteDeEnvios((empresa, desde): Envio[] => {
  const nomes = new Map(gatilhos(empresa).map((g) => [g.id, g.name]));
  const linhas = banco().prepare("SELECT id, origem, origem_id, telefone, nome, em FROM crm_envios WHERE empresa = ? AND estado = 'sent' AND origem IN ('trigger','regua') AND em >= ?").all(empresa, desde) as Array<{ id: string; origem: string; origem_id: string; telefone: string; nome: string; em: number }>;
  return linhas.map((l) => ({
    id: l.id, chave: chaveDe("passageiro", l.telefone, l.nome), em: l.em, origem: l.origem === "regua" ? "regua" : "trigger",
    fonteId: l.origem === "regua" ? "" : l.origem_id, fonteNome: l.origem === "regua" ? "Régua de reativação" : nomes.get(l.origem_id) ?? "(removido)",
  }));
});

registrarEntidadeAuditada("/gatilhos", "gatilho", (e) => gatilhos(e) as unknown as Array<Record<string, unknown>>, "is_active");
registrarEntidadeAuditada("/segmentos", "segmento", (e) => segmentos(e).map((x) => ({ ...x, nome: x.name })) as unknown as Array<Record<string, unknown>>);
