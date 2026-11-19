// Módulos (recursos) que o dono da plataforma liga e desliga por empresa. Tudo começa ligado.
// Cada módulo diz quais funções do menu e quais caminhos da API ele cobre: desligado, some do menu e o servidor recusa com 403.
// Vale para o servidor e para o painel.

import { normalizarCaminho } from "./cargos.ts";

export interface Modulo {
  id: string;
  nome: string;
  descricao: string;
  /** ids das funções do menu (src/comum/funcoes.ts). */
  funcoes: string[];
  /** Caminhos da API (depois de /api) que só funcionam com o módulo ligado. */
  api: RegExp[];
}

export const MODULOS: Modulo[] = [
  { id: "crm", nome: "CRM e campanhas", descricao: "Campanhas, jornadas e público.", funcoes: ["crm"], api: [/^\/crm(\/|$)/] },
  { id: "bot", nome: "Bot de WhatsApp", descricao: "Atendimento e pedidos de corrida pelo WhatsApp.", funcoes: ["bot"], api: [] },
  { id: "totem", nome: "Totem", descricao: "Pedido de corrida por totem em locais parceiros.", funcoes: ["totem", "app-totem"], api: [] },
  { id: "analise", nome: "Análise com IA", descricao: "Relatórios e perguntas com o assistente de IA.", funcoes: ["analise"], api: [/^\/(relatorio|perguntar)$/] },
  { id: "engajamento", nome: "Engajamento", descricao: "Mapa de engajamento e ações para motoristas e passageiros.", funcoes: ["engajamento"], api: [/^\/engajamento(\/|$)/] },
  { id: "apps", nome: "Apps e carteiras", descricao: "Apps do passageiro e do motorista, SOS, carteiras e documentos.", funcoes: ["apps", "documentos", "carteiras"], api: [/^\/apps-central(\/|$)/] },
  { id: "centrais", nome: "Centrais e cobrança", descricao: "Rede de centrais, planos e demonstrativo mensal.", funcoes: ["controle-centrais", "demonstrativo-mensal", "meus-planos"], api: [/^\/centrais\/(?!seletor$)/] },
  { id: "filiais", nome: "Filiais", descricao: "Cadastro de filiais e vínculos de motoristas e operadores.", funcoes: ["filiais"], api: [/^\/filiais\/(?!opcoes$)/, /^\/filiais$/] },
];

export const moduloPorId = (id: string) => MODULOS.find((m) => m.id === id) ?? null;
export const moduloDaFuncao = (funcaoId: string): string | null => MODULOS.find((m) => m.funcoes.includes(funcaoId))?.id ?? null;
export const moduloDaRota = (caminho: string): string | null => {
  const c = normalizarCaminho(caminho);
  return MODULOS.find((m) => m.api.some((r) => r.test(c)))?.id ?? null;
};
