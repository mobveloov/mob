// Menu do painel: os mesmos grupos, submenus, nomes e ordem do painel Machine (menu no topo),
// mais o que só existe aqui: itens extras no fim de cada grupo (seção "Outras telas") e os grupos
// "Cobrança" e "Mais" (CRM, bot, totem, IA, apps, marca...).
// Os ids e as rotas são fixos: cada tela é ligada ao menu pelo id (src/web/App.tsx).

import { podeCargo, type Cargo } from "./cargos.ts";

export type Grupo = "Painel" | "Cadastro" | "Corridas" | "Financeiro" | "Comunicação" | "Configurações" | "Cobrança" | "Avaliações" | "Ajuda" | "Mais" | "Usuário";

export interface Funcao {
  id: string;
  grupo: Grupo;
  /** Submenu dentro do grupo (título pequeno no menu suspenso), quando houver. Itens seguidos com a mesma seção ficam juntos. */
  secao?: string;
  nome: string;
  rota: string;
  /** Cargo mínimo para ver e usar (padrão: operador). Veja src/comum/cargos.ts e docs/CARGOS.md. */
  minimo?: Cargo;
  /** Caminhos antigos que agora levam a esta tela. */
  antigas?: string[];
}

/** Seção das telas que só existem aqui (ficam no fim do grupo). */
const EXTRA = "Outras telas";

// A ordem das linhas é a ordem do menu da Machine.
export const FUNCOES: Funcao[] = [
  { id: "painel", grupo: "Painel", nome: "Painel", rota: "/" },

  { id: "cupons", grupo: "Cadastro", nome: "Cupons", rota: "/cupons", minimo: "gestor" },
  { id: "empresas", grupo: "Cadastro", nome: "Empresas", rota: "/empresas", antigas: ["/conveniadas"], minimo: "gestor" },
  { id: "faixas-vouchers", grupo: "Cadastro", nome: "Faixa de Vouchers", rota: "/faixas-vouchers", minimo: "gestor" },
  { id: "areas", grupo: "Cadastro", secao: "Gestão de Áreas", nome: "Áreas", rota: "/areas", minimo: "gestor" },
  { id: "plantao", grupo: "Cadastro", secao: "Gestão de Áreas", nome: "Plantão", rota: "/plantao" },
  { id: "filiais", grupo: "Cadastro", secao: "Gestão de Áreas", nome: "Filiais", rota: "/filiais", minimo: "gestor" },
  { id: "motoristas", grupo: "Cadastro", nome: "Motoristas", rota: "/motoristas" },
  { id: "punicoes", grupo: "Cadastro", nome: "Punições", rota: "/punicoes", minimo: "gestor" },
  { id: "passageiros", grupo: "Cadastro", nome: "Clientes", rota: "/passageiros", antigas: ["/clientes"] },
  { id: "ruas", grupo: "Cadastro", nome: "Ruas", rota: "/ruas", minimo: "gestor" },
  { id: "desafios", grupo: "Cadastro", nome: "Desafios", rota: "/desafios", minimo: "gestor" },
  { id: "destravar", grupo: "Cadastro", secao: EXTRA, nome: "Destravar Motoristas", rota: "/destravar" },
  { id: "veiculos", grupo: "Cadastro", secao: EXTRA, nome: "Veículos", rota: "/veiculos" },
  { id: "equipe", grupo: "Cadastro", secao: EXTRA, nome: "Equipe", rota: "/equipe", antigas: ["/usuarios"], minimo: "admin" },

  { id: "solicitar", grupo: "Corridas", nome: "Solicitar nova corrida", rota: "/solicitar" },
  { id: "monitoramento", grupo: "Corridas", nome: "Acompanhamento", rota: "/monitoramento", antigas: ["/acompanhamento"] },
  { id: "ocorrencias", grupo: "Corridas", nome: "Retorno e Ocorrências", rota: "/ocorrencias" },
  { id: "historico", grupo: "Corridas", nome: "Consultar corridas", rota: "/historico", antigas: ["/corridas", "/raiox"] },
  { id: "mapa", grupo: "Corridas", nome: "Mapa de motoristas", rota: "/mapa" },
  { id: "programadas", grupo: "Corridas", nome: "Consultar programadas", rota: "/programadas" },
  { id: "taxas-cancelamento", grupo: "Corridas", nome: "Taxas de cancelamento", rota: "/taxas-cancelamento" },
  { id: "indice-relatorios", grupo: "Corridas", nome: "Relatórios", rota: "/indice-relatorios", minimo: "admin" },
  { id: "alterar-os", grupo: "Corridas", nome: "Alteração de dados da OS", rota: "/alterar-os", minimo: "admin" },
  { id: "entrega-voucher", grupo: "Corridas", nome: "Entrega de voucher", rota: "/entrega-voucher" },
  { id: "objetos", grupo: "Corridas", nome: "Objetos perdidos", rota: "/objetos" },
  { id: "engajamento", grupo: "Corridas", nome: "Mapa de engajamento", rota: "/engajamento" },
  { id: "recuperacao", grupo: "Corridas", secao: EXTRA, nome: "Recuperação de Vendas", rota: "/recuperacao" },
  { id: "funil-clientes", grupo: "Corridas", secao: EXTRA, nome: "Funil de Clientes", rota: "/funil-clientes", minimo: "gestor" },
  { id: "mapa-bairros", grupo: "Corridas", secao: EXTRA, nome: "Mapa de Bairros e Demanda", rota: "/mapa-bairros", minimo: "gestor" },

  { id: "transacao-pix", grupo: "Financeiro", secao: "Pix", nome: "Transações", rota: "/transacao-pix", minimo: "gestor" },
  { id: "faturamento-empresa", grupo: "Financeiro", secao: "Contas a receber", nome: "Faturamento por empresa", rota: "/faturamento-empresa", minimo: "admin" },
  { id: "faturamento-centro-custo", grupo: "Financeiro", secao: "Contas a receber", nome: "Faturamento de centro de custo", rota: "/faturamento-centro-custo", minimo: "admin" },
  { id: "faturamento-periodo", grupo: "Financeiro", secao: "Contas a receber", nome: "Faturamento por período", rota: "/faturamento-periodo", minimo: "admin" },
  { id: "vouchers-motoristas", grupo: "Financeiro", secao: "Contas a pagar", nome: "Vouchers e tickets por motoristas", rota: "/vouchers-motoristas", minimo: "gestor" },
  { id: "pagamentos-pendentes", grupo: "Financeiro", nome: "Pagamentos pendentes", rota: "/pagamentos-pendentes", antigas: ["/pendencias"], minimo: "admin" },
  { id: "visao-geral", grupo: "Financeiro", secao: "Relatórios", nome: "Visão geral", rota: "/visao-geral", minimo: "admin" },
  { id: "relatorio-faturamento", grupo: "Financeiro", secao: "Relatórios", nome: "Faturamento", rota: "/relatorio-faturamento" },
  { id: "extrato-online", grupo: "Financeiro", secao: "Relatórios", nome: "Transações online", rota: "/extrato-online", minimo: "admin" },
  { id: "os-motorista", grupo: "Financeiro", secao: "Estatísticas", nome: "OS por motorista", rota: "/os-motorista", minimo: "admin" },
  { id: "os-empresa", grupo: "Financeiro", secao: "Estatísticas", nome: "OS por empresa", rota: "/os-empresa", minimo: "admin" },
  { id: "os-bairro", grupo: "Financeiro", secao: "Estatísticas", nome: "OS por bairro", rota: "/os-bairro", minimo: "admin" },
  { id: "os-pagamento", grupo: "Financeiro", secao: "Estatísticas", nome: "OS por forma de pagamento", rota: "/os-pagamento", minimo: "admin" },
  { id: "os-operador", grupo: "Financeiro", secao: "Estatísticas", nome: "OS por operador", rota: "/os-operador", minimo: "admin" },
  { id: "os-percentual-motorista", grupo: "Financeiro", secao: "Estatísticas", nome: "% de OS por motorista", rota: "/os-percentual-motorista", minimo: "admin" },
  { id: "km-rodados", grupo: "Financeiro", secao: "Poder público", nome: "Km rodados por motorista", rota: "/km-rodados", minimo: "gestor" },
  { id: "indicacoes", grupo: "Financeiro", nome: "Recompensas por indicação", rota: "/indicacoes", antigas: ["/recompensas-indicacao"], minimo: "admin" },
  { id: "extrato-central", grupo: "Financeiro", secao: EXTRA, nome: "Extrato da central", rota: "/extrato-central", minimo: "gestor" },
  { id: "carteiras", grupo: "Financeiro", secao: EXTRA, nome: "Carteiras", rota: "/carteiras", minimo: "gestor" },
  { id: "extrato", grupo: "Financeiro", secao: EXTRA, nome: "Extrato Geral", rota: "/extrato", minimo: "gestor" },
  { id: "saques", grupo: "Financeiro", secao: EXTRA, nome: "Saques", rota: "/saques", minimo: "gestor" },
  { id: "recargas", grupo: "Financeiro", secao: EXTRA, nome: "Recargas", rota: "/recargas", minimo: "gestor" },
  { id: "relatorios", grupo: "Financeiro", secao: EXTRA, nome: "Relatórios & Stats", rota: "/relatorios", antigas: ["/financeiro", "/producao", "/estatisticas", "/funil"], minimo: "admin" },

  { id: "conversas", grupo: "Comunicação", nome: "Conversas", rota: "/conversas" },
  { id: "notificacoes", grupo: "Comunicação", nome: "Notificações app", rota: "/notificacoes" },
  { id: "alertas-empresas", grupo: "Comunicação", nome: "Alertas para empresas", rota: "/alertas-empresas" },

  { id: "config-gerais", grupo: "Configurações", nome: "Gerais", rota: "/config-gerais", minimo: "gestor" },
  { id: "taxas-central", grupo: "Configurações", nome: "Taxas da central", rota: "/taxas-central", minimo: "admin" },
  { id: "personalizacao-app", grupo: "Configurações", nome: "Personalização app passageiro", rota: "/personalizacao-app", minimo: "admin" },
  { id: "regras-despacho", grupo: "Configurações", nome: "Despacho", rota: "/regras-despacho", antigas: ["/despacho"], minimo: "gestor" },
  { id: "transbordos", grupo: "Configurações", nome: "Transbordos", rota: "/transbordos", minimo: "gestor" },
  { id: "categorias", grupo: "Configurações", nome: "Tarifas e categorias", rota: "/categorias", antigas: ["/tarifas"], minimo: "gestor" },
  { id: "tarifas-dinamicas", grupo: "Configurações", nome: "Tarifas dinâmicas", rota: "/tarifas-dinamicas", minimo: "gestor" },
  { id: "descontos", grupo: "Configurações", nome: "Descontos", rota: "/descontos", minimo: "gestor" },
  { id: "integracoes", grupo: "Configurações", nome: "Integrações", rota: "/integracoes", minimo: "admin" },
  { id: "config-nps", grupo: "Configurações", nome: "NPS", rota: "/config-nps", minimo: "gestor" },
  { id: "termos-app", grupo: "Configurações", nome: "Termos de uso", rota: "/termos-app", minimo: "gestor" },
  { id: "regras-credito", grupo: "Configurações", secao: EXTRA, nome: "Regras de Crédito", rota: "/regras-credito", minimo: "gestor" },

  { id: "avaliacoes", grupo: "Avaliações", nome: "NPS", rota: "/avaliacoes", antigas: ["/nps"] },

  { id: "juridico", grupo: "Ajuda", nome: "Política de privacidade", rota: "/juridico" },
  { id: "central-ajuda", grupo: "Ajuda", secao: EXTRA, nome: "Central de Ajuda", rota: "/central-ajuda" },

  // Cobrança entre centrais (grupo nosso, fora da Machine).
  { id: "demonstrativo-mensal", grupo: "Cobrança", nome: "Demonstrativo Mensal", rota: "/demonstrativo-mensal", minimo: "gestor" },
  { id: "meus-planos", grupo: "Cobrança", nome: "Meus planos", rota: "/meus-planos", minimo: "gestor" },
  { id: "controle-centrais", grupo: "Cobrança", nome: "Controle financeiro de centrais", rota: "/controle-centrais", minimo: "gestor" },

  // Telas próprias (não existem na Machine).
  { id: "crm", grupo: "Mais", secao: "CRM", nome: "CRM & Engajamento", rota: "/crm", minimo: "gestor", antigas: ["/crm/campanhas", "/crm/jornadas", "/crm/publico"] },
  { id: "bot", grupo: "Mais", secao: "Atendimento", nome: "Bot de WhatsApp", rota: "/bot" },
  { id: "totem", grupo: "Mais", secao: "Atendimento", nome: "Totens & Preços", rota: "/totem" },
  { id: "app-totem", grupo: "Mais", secao: "Atendimento", nome: "App do Totem", rota: "/app-totem" },
  { id: "analise", grupo: "Mais", secao: "Operação", nome: "Análise com IA", rota: "/analise", minimo: "admin" },
  { id: "apps", grupo: "Mais", secao: "Operação", nome: "Apps e SOS", rota: "/apps" },
  { id: "documentos", grupo: "Mais", secao: "Operação", nome: "Documentos dos motoristas", rota: "/documentos" },
  { id: "enderecos", grupo: "Mais", secao: "Configurações", nome: "Endereços", rota: "/enderecos" },
  { id: "marca", grupo: "Mais", secao: "Configurações", nome: "Marca e aparência", rota: "/marca", minimo: "gestor" },
  { id: "superadmin", grupo: "Mais", secao: "Plataforma", nome: "Painel do dono", rota: "/superadmin", minimo: "plataforma" },

  // Menu do usuário (à direita): "Trocar senha", como na Machine.
  { id: "alterar-senha", grupo: "Usuário", nome: "Trocar senha", rota: "/alterar-senha" },
];

/** Grupos do menu do topo, na ordem da Machine; depois os extras nossos ("Cobrança" e "Mais"). "Usuário" fica no menu à direita. */
export const GRUPOS: Grupo[] = ["Painel", "Cadastro", "Corridas", "Financeiro", "Comunicação", "Configurações", "Avaliações", "Ajuda", "Cobrança", "Mais"];

export const funcaoPorId = (id: string) => FUNCOES.find((f) => f.id === id) ?? null;

/** Funções que o cargo vê no menu. */
export const funcoesDoCargo = (cargo: unknown): Funcao[] => FUNCOES.filter((f) => podeCargo(cargo, f.minimo ?? "operador"));
