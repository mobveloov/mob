// Menu lateral: os mesmos itens, ids e rotas de funcoes.ts, arranjados em 6 grupos coloridos (como no painel de referência
// do dono). Aqui só fica o arranjo; os ícones e a aparência ficam em src/web/menu/MenuLateral.tsx.
// Todo item de FUNCOES (menos o menu do usuário) precisa aparecer aqui: o teste test/menu-lateral.test.ts confere.

import { FUNCOES, type Funcao } from "./funcoes.ts";

export type CorMenu = "laranja" | "azul" | "verde" | "roxo" | "rosa" | "lima";

export interface BlocoMenu {
  /** Título do bloco recolhível. Sem título, os itens ficam soltos no grupo. */
  titulo?: string;
  ids: string[];
}
export interface GrupoMenu { id: string; nome: string; cor: CorMenu; blocos: BlocoMenu[] }

export const GRUPOS_MENU: GrupoMenu[] = [
  {
    id: "operacao", nome: "Operação", cor: "laranja", blocos: [
      { ids: ["painel", "conversas"] },
      { titulo: "Corridas", ids: ["solicitar", "monitoramento", "mapa", "historico", "programadas", "ocorrencias", "recuperacao", "pagamentos-pendentes", "taxas-cancelamento", "objetos", "entrega-voucher"] },
      { titulo: "Frota", ids: ["motoristas", "destravar", "veiculos", "plantao", "areas", "ruas", "punicoes", "desafios", "documentos"] },
    ],
  },
  {
    id: "bot-totem", nome: "Bot & Totem", cor: "azul", blocos: [
      { ids: ["bot", "totem", "notificacoes", "alertas-empresas", "apps", "enderecos"] },
    ],
  },
  {
    id: "clientes", nome: "Clientes", cor: "verde", blocos: [
      { ids: ["passageiros", "empresas", "cupons", "indicacoes", "faixas-vouchers", "crm-publico", "crm-campanhas", "crm-jornadas", "engajamento", "funil-clientes", "mapa-bairros", "avaliacoes"] },
    ],
  },
  {
    id: "gestao", nome: "Gestão", cor: "roxo", blocos: [
      { ids: ["analise"] },
      { titulo: "Financeiro", ids: ["visao-geral", "extrato-central", "extrato-online", "transacao-pix", "indice-relatorios", "faturamento-empresa", "faturamento-centro-custo", "faturamento-periodo", "vouchers-motoristas", "os-motorista", "os-empresa", "os-bairro", "os-pagamento", "os-operador", "os-percentual-motorista", "km-rodados", "carteiras", "extrato", "saques", "recargas", "relatorios"] },
      { titulo: "Cobrança", ids: ["demonstrativo-mensal", "meus-planos", "controle-centrais"] },
    ],
  },
  {
    id: "configuracao", nome: "Configuração", cor: "rosa", blocos: [
      { ids: ["marca", "equipe", "alterar-senha"] },
      { titulo: "Regras e integrações", ids: ["config-gerais", "regras-credito", "categorias", "tarifas-dinamicas", "descontos", "regras-despacho", "transbordos", "integracoes", "config-nps", "termos-app"] },
    ],
  },
  {
    id: "ajuda", nome: "Ajuda", cor: "lima", blocos: [
      { ids: ["juridico", "central-ajuda"] },
    ],
  },
];

/** Nome mostrado no menu lateral quando difere do nome da tela. */
export const ROTULO_MENU: Record<string, string> = { painel: "Visão Geral", marca: "Dados da Empresa" };

export interface GrupoMenuVisivel { id: string; nome: string; cor: CorMenu; blocos: Array<{ titulo?: string; itens: Funcao[] }> }

/** Menu do usuário: só entra o que o cargo pode ver. Bloco ou grupo sem item some. */
export function menuLateral(admin: boolean, funcoes: Funcao[] = FUNCOES): GrupoMenuVisivel[] {
  const porId = new Map(funcoes.filter((f) => admin || !f.soAdmin).map((f) => [f.id, f]));
  return GRUPOS_MENU.map((g) => ({
    id: g.id, nome: g.nome, cor: g.cor,
    blocos: g.blocos.map((b) => ({ titulo: b.titulo, itens: b.ids.map((i) => porId.get(i)).filter((f): f is Funcao => !!f) })).filter((b) => b.itens.length),
  })).filter((g) => g.blocos.length);
}
