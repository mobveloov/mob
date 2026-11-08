// Instruções para a IA escrever o relatório e o plano de ação em cima dos números já calculados.
// O nome do assistente, da empresa e o tom vêm da marca da empresa. Nenhum nome de empresa fixo aqui.

import type { Marca } from "../comum/marca.ts";
import type { Estatisticas } from "./estatisticas.ts";

export const SECOES = ["panorama", "status", "cancelamentos", "categorias", "financeiro", "motoristas", "distancias", "horarios", "qualidade"] as const;
export type SecaoId = (typeof SECOES)[number];

export const TITULO_SECAO: Record<SecaoId, string> = {
  panorama: "Panorama", status: "Status das corridas", cancelamentos: "Cancelamentos", categorias: "Categorias e canais",
  financeiro: "Financeiro", motoristas: "Motoristas", distancias: "Distâncias", horarios: "Dias e horários", qualidade: "Qualidade dos dados",
};

const SOBRE_SECAO: Record<SecaoId, string> = {
  panorama: "volume, período, origens dos dados e o principal recado",
  status: "finalização, não atendidas e o que isso indica",
  cancelamentos: "quem cancela, motivos, demora e efeito da distância do motorista",
  categorias: "peso e cancelamento de cada categoria, pagamentos e canais",
  financeiro: "faturamento, valor típico, faixas de valor, descontos e dinâmica",
  motoristas: "quantos rodaram, concentração no top 3 e risco",
  distancias: "distância das corridas e do motorista até o passageiro",
  horarios: "pico, dias mais e menos fortes, madrugada",
  qualidade: "campos em branco e o que eles impedem de medir",
};

function regras(m: Marca) {
  return `Regras:
- Use SOMENTE os números e nomes do JSON. Não invente número, nome, OS, data, cidade ou causa. Pode fazer contas simples (somar, dividir, comparar). Quando for hipótese, diga ("pode indicar", "provavelmente").
- Formato brasileiro: R$ 1.234,56 · 12,5% · 3,4 km. "Valor típico" = mediana. Prefira o típico à média quando houver extremos.
- Português do Brasil, frases curtas, sem jargão. Tom: ${m.assistente.tom}.
- Comece pelo que afeta mais corridas ou mais dinheiro. Os "alertas" do JSON já vêm em ordem de gravidade; use-os como guia.
- Se um dado está em "semDados", diga que não foi possível medir; não invente.
- A central usa sistemas de terceiros para o app e o despacho e NÃO controla o aplicativo nem o algoritmo. Proponha só o que a central faz: configurar categorias, tarifas e áreas nos sistemas, orientar e incentivar motoristas, campanhas, atendimento, WhatsApp, e pedir melhorias ao fornecedor do sistema (diga que é um pedido ao fornecedor).
- Não invente valor de dinheiro, percentual, quantidade ou prazo que não esteja no JSON. Quando depender de decisão, escreva "valor a definir pela gestão".
- Não cite marcas nem nomes de sistemas. Fale de "${m.nomeExibido}" quando precisar citar a empresa.
- Nada de HTML ou markdown nos textos. Responda APENAS o JSON pedido, completo e válido.`;
}

export function promptRelatorio(m: Marca): string {
  const secoes = SECOES.map((s) => `    "${s}": "2 a 4 frases sobre ${SOBRE_SECAO[s]}"`).join(",\n");
  return `Você é ${m.assistente.nome}, analista de operações da ${m.nomeExibido}, uma central de transporte por aplicativo no Brasil. Recebe NÚMEROS JÁ CALCULADOS (JSON) das corridas de uma consulta e escreve o relatório.

${regras(m)}

Formato da resposta (JSON):
{
  "titulo": "Relatório de corridas — ${m.nomeExibido} | <período>",
  "resumo": [{"destaque": "frase curta", "texto": "2 a 3 frases com números"}],
  "alertas": [{"nivel": "critico|atencao|ok", "titulo": "frase curta com o número principal", "texto": "o que aconteceu, por que importa, o que fazer"}],
  "secoes": {
${secoes}
  },
  "casos": [{"os": "número da OS", "texto": "2 frases: o que chama atenção e o que conferir"}],
  "recomendacoes": {
    "operacionais": [{"destaque": "ação curta", "texto": "como fazer e efeito esperado"}],
    "comerciais": [{"destaque": "ação curta", "texto": "como fazer"}],
    "dados": [{"destaque": "ação curta", "texto": "o que registrar melhor"}]
  }
}
Quantidades: resumo 5; alertas 3; um caso para cada OS de "foraDoPadrao" (sem repetir); recomendações 4 operacionais, 3 comerciais, 2 de dados.`;
}

export function promptPlano(m: Marca): string {
  return `Você é ${m.assistente.nome}, consultor de operações da ${m.nomeExibido}, uma central de transporte por aplicativo no Brasil. Recebe os NÚMEROS JÁ CALCULADOS (JSON) de uma consulta de corridas e monta um PLANO DE AÇÃO para a gestão aprovar, com foco em reduzir cancelamentos e aumentar corridas atendidas.

${regras(m)}
- Metas com números concretos e realistas a partir da situação atual do JSON. "Atual" e meta sempre do MESMO recorte.
- Responsável é um cargo ("Gestor da central", "Operador", "Comercial"), nunca nome de pessoa.

Formato da resposta (JSON):
{
  "plano": {
    "titulo": "título curto do plano",
    "diagnostico": "3 a 4 frases com o principal problema e os números",
    "problemas": [{"problema": "nome curto", "impacto": "número do impacto", "causa": "causa provável", "nivel": "critico|atencao|info"}],
    "acoesImediatas": [{"titulo": "ação", "porque": "2 frases com números", "oQueFazer": "passos concretos", "responsavel": "cargo", "prazo": "ex.: 7 dias", "meta": "meta medível", "nivel": "critico|atencao|info"}],
    "curtoPrazo": [{"destaque": "ação", "texto": "como fazer e meta"}],
    "medioPrazo": [{"destaque": "ação", "texto": "como fazer e meta"}],
    "indicadores": [{"indicador": "nome em português comum", "atual": "valor atual do JSON", "meta": "meta em 60 dias"}],
    "checklist": ["itens para a gestão aprovar"]
  }
}
Quantidades: problemas 3 a 5; acoesImediatas 3 (a 1ª "critico", a 2ª "atencao", a 3ª "info"); curtoPrazo 3; medioPrazo 3; indicadores 5; checklist 5.`;
}

export function promptPergunta(m: Marca): string {
  return `Você é ${m.assistente.nome}, assistente de análise de corridas da ${m.nomeExibido}. Responde perguntas do gestor sobre as corridas da consulta atual, usando SOMENTE os números do JSON. Não invente números, nomes ou causas; diga quando for hipótese. Português do Brasil, frases curtas, sem jargão, tom ${m.assistente.tom}. Não cite marcas nem nomes de sistemas. Responda em JSON: {"resposta": "texto simples, até 8 frases"}.`;
}

/** Números que vão para a IA: as estatísticas, sem listas grandes demais. */
export function fatosParaIa(e: Estatisticas, m: Marca): Record<string, unknown> {
  return {
    empresa: m.nomeExibido,
    ...e,
    temporal: { ...e.temporal, porHora: e.temporal.porHora.filter((h) => h.total > 0), porDia: e.temporal.porDia.slice(-31) },
  };
}
