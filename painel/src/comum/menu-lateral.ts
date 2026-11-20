// Menu lateral: os mesmos itens, ids e rotas de funcoes.ts, nos MESMOS grupos, submenus, nomes e ordem do menu da Machine
// (Painel, Cadastro, Corridas, Financeiro, Comunicação, Configurações, Cobrança, Avaliações, Ajuda), cada grupo com sua cor
// como no painel de referência do dono. Depois vêm os grupos que só existem aqui (Bot & Totem, CRM, Mais telas).
// Aqui só fica o arranjo; os ícones e a aparência ficam em src/web/menu/MenuLateral.tsx.
// Todo item de FUNCOES precisa aparecer aqui: os testes test/menu-lateral.test.ts e test/menu-machine.test.ts conferem.

import { FUNCOES, type Funcao } from "./funcoes.ts";

export type CorMenu = "laranja" | "azul" | "verde" | "roxo" | "rosa" | "lima" | "ciano" | "ambar" | "indigo" | "teal" | "ardosia" | "fucsia";

export interface BlocoMenu {
  /** Título do submenu (recolhível), igual ao da Machine. Sem título, os itens ficam soltos no grupo. */
  titulo?: string;
  ids: string[];
}
export interface GrupoMenu { id: string; nome: string; cor: CorMenu; blocos: BlocoMenu[] }

export const GRUPOS_MENU: GrupoMenu[] = [
  { id: "painel", nome: "Painel", cor: "laranja", blocos: [{ ids: ["painel"] }] },
  {
    id: "cadastro", nome: "Cadastro", cor: "verde", blocos: [
      { ids: ["equipe", "cupons", "passe-livre", "empresas", "faixas-vouchers"] },
      { titulo: "Gestão de áreas", ids: ["areas", "plantao"] },
      { ids: ["motoristas", "punicoes"] },
      { titulo: "Clientes", ids: ["passageiros", "consulta-cartoes"] },
      { ids: ["ruas", "desafios"] },
    ],
  },
  {
    id: "corridas", nome: "Corridas", cor: "azul", blocos: [
      { ids: ["solicitar", "monitoramento", "ocorrencias", "alertas-seguranca", "historico", "mapa", "programadas", "taxas-cancelamento", "indice-relatorios", "alterar-os", "entrega-voucher", "objetos", "engajamento"] },
    ],
  },
  {
    id: "financeiro", nome: "Financeiro", cor: "roxo", blocos: [
      { titulo: "Créditos", ids: ["carteiras", "creditos-recargas-saques", "creditos-extrato"] },
      { titulo: "Cartão", ids: ["cartao-painel", "cartao-transacoes", "cartao-saldo-central", "cartao-saldo-motorista"] },
      { titulo: "Pix", ids: ["transacao-pix"] },
      { titulo: "Contas a receber", ids: ["faturamento-empresa", "faturamento-centro-custo", "faturamento-periodo"] },
      { titulo: "Contas a pagar", ids: ["vouchers-motoristas", "pagamentos-pendentes"] },
      { titulo: "Relatórios", ids: ["visao-geral", "relatorio-faturamento", "extrato-online"] },
      { titulo: "Estatísticas", ids: ["os-motorista", "os-empresa", "os-bairro", "os-pagamento", "os-operador", "os-percentual-motorista"] },
      { titulo: "Poder público", ids: ["km-rodados"] },
      { ids: ["indicacoes"] },
    ],
  },
  { id: "comunicacao", nome: "Comunicação", cor: "ciano", blocos: [{ ids: ["conversas", "notificacoes", "alertas-empresas"] }] },
  {
    id: "configuracoes", nome: "Configurações", cor: "rosa", blocos: [
      { ids: ["config-gerais", "personalizacao-app", "personalizacao-motorista", "carteiras-credito", "taxas-central", "regras-despacho", "transbordos", "categorias", "tarifas-dinamicas", "descontos", "integracoes", "config-nps", "termos-app", "regras-credito"] },
    ],
  },
  { id: "cobranca", nome: "Cobrança", cor: "ambar", blocos: [{ ids: ["ultimo-boleto", "demonstrativo-mensal", "meus-planos", "extrato-central", "controle-centrais"] }] },
  { id: "avaliacoes", nome: "Avaliações", cor: "lima", blocos: [{ ids: ["avaliacoes"] }] },
  { id: "ajuda", nome: "Ajuda", cor: "teal", blocos: [{ ids: ["ajuda-termos", "juridico", "central-suporte", "ouvidoria", "central-ajuda"] }] },
  // Só existem aqui (não são da Machine).
  { id: "bot-totem", nome: "Bot & Totem", cor: "indigo", blocos: [{ ids: ["bot", "totem", "app-totem", "apps", "enderecos"] }] },
  { id: "crm", nome: "CRM", cor: "fucsia", blocos: [{ ids: ["crm", "recuperacao", "funil-clientes", "mapa-bairros"] }] },
  {
    id: "mais", nome: "Mais telas", cor: "ardosia", blocos: [
      { titulo: "Operação", ids: ["analise", "documentos", "destravar", "veiculos", "filiais"] },
      { titulo: "Financeiro", ids: ["extrato", "saques", "recargas", "relatorios"] },
      { titulo: "Conta e plataforma", ids: ["marca", "superadmin", "alterar-senha"] },
    ],
  },
];

/** Nome mostrado no menu lateral quando difere do nome da tela. */
export const ROTULO_MENU: Record<string, string> = { marca: "Dados da Empresa" };

export interface GrupoMenuVisivel { id: string; nome: string; cor: CorMenu; blocos: Array<{ titulo?: string; itens: Funcao[] }> }

/** Menu do usuário: recebe só as funções que o cargo pode ver (funcoesDoCargo). Bloco ou grupo sem item some. */
export function menuLateral(funcoes: Funcao[] = FUNCOES): GrupoMenuVisivel[] {
  const porId = new Map(funcoes.map((f) => [f.id, f]));
  return GRUPOS_MENU.map((g) => ({
    id: g.id, nome: g.nome, cor: g.cor,
    blocos: g.blocos.map((b) => ({ titulo: b.titulo, itens: b.ids.map((i) => porId.get(i)).filter((f): f is Funcao => !!f) })).filter((b) => b.itens.length),
  })).filter((g) => g.blocos.length);
}

/** Uma tela do menu com o caminho "Grupo > Submenu" (usado pela busca e pela tabela de comparação). */
export interface ItemBusca { id: string; nome: string; rota: string; caminho: string }

export function itensParaBusca(funcoes: Funcao[] = FUNCOES, assistente = "IA"): ItemBusca[] {
  return menuLateral(funcoes).flatMap((g) => g.blocos.flatMap((b) => b.itens.map((f) => {
    const nome = f.id === "analise" ? `Análise com ${assistente}` : ROTULO_MENU[f.id] ?? f.nome;
    return { id: f.id, nome, rota: f.rota, caminho: [g.nome, b.titulo].filter(Boolean).join(" > ") };
  })));
}
