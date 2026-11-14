// Menu do painel: os mesmos grupos, submenus, nomes e ordem do painel Machine (menu no topo),
// mais o que só existe aqui: itens extras no fim de cada grupo (seção "Outras telas") e os grupos
// "Cobrança" e "Mais" (CRM, bot, totem, IA, apps, marca...).
// Os ids e as rotas são fixos: cada tela é ligada ao menu pelo id (src/web/App.tsx).

export type Grupo = "Painel" | "Cadastro" | "Corridas" | "Financeiro" | "Comunicação" | "Configurações" | "Cobrança" | "Avaliações" | "Ajuda" | "Mais" | "Usuário";

export interface Funcao {
  id: string;
  grupo: Grupo;
  /** Submenu dentro do grupo (título pequeno no menu suspenso), quando houver. Itens seguidos com a mesma seção ficam juntos. */
  secao?: string;
  nome: string;
  rota: string;
  /** Só administradores (e a plataforma) veem. */
  soAdmin?: boolean;
  /** Etiqueta "NOVO" no menu. */
  novo?: boolean;
  /** Caminhos antigos que agora levam a esta tela. */
  antigas?: string[];
}

/** Seção das telas que só existem aqui (ficam no fim do grupo). */
const EXTRA = "Outras telas";

// A ordem das linhas é a ordem do menu da Machine.
export const FUNCOES: Funcao[] = [
  { id: "painel", grupo: "Painel", nome: "Painel", rota: "/" },

  { id: "cupons", grupo: "Cadastro", nome: "Cupons", rota: "/cupons" },
  { id: "empresas", grupo: "Cadastro", nome: "Empresas", rota: "/empresas", antigas: ["/conveniadas"] },
  { id: "faixas-vouchers", grupo: "Cadastro", nome: "Faixa de Vouchers", rota: "/faixas-vouchers" },
  { id: "areas", grupo: "Cadastro", secao: "Gestão de Áreas", nome: "Áreas", rota: "/areas" },
  { id: "plantao", grupo: "Cadastro", secao: "Gestão de Áreas", nome: "Plantão", rota: "/plantao" },
  { id: "motoristas", grupo: "Cadastro", nome: "Motoristas", rota: "/motoristas" },
  { id: "punicoes", grupo: "Cadastro", nome: "Punições", rota: "/punicoes" },
  { id: "passageiros", grupo: "Cadastro", nome: "Clientes", rota: "/passageiros", antigas: ["/clientes"] },
  { id: "ruas", grupo: "Cadastro", nome: "Ruas", rota: "/ruas", novo: true },
  { id: "desafios", grupo: "Cadastro", nome: "Desafios", rota: "/desafios", novo: true },
  { id: "destravar", grupo: "Cadastro", secao: EXTRA, nome: "Destravar Motoristas", rota: "/destravar" },
  { id: "veiculos", grupo: "Cadastro", secao: EXTRA, nome: "Veículos", rota: "/veiculos" },
  { id: "equipe", grupo: "Cadastro", secao: EXTRA, nome: "Equipe", rota: "/equipe", soAdmin: true, antigas: ["/usuarios"] },

  { id: "solicitar", grupo: "Corridas", nome: "Solicitar nova corrida", rota: "/solicitar" },
  { id: "monitoramento", grupo: "Corridas", nome: "Acompanhamento", rota: "/monitoramento", antigas: ["/acompanhamento"] },
  { id: "ocorrencias", grupo: "Corridas", nome: "Retorno e Ocorrências", rota: "/ocorrencias" },
  { id: "historico", grupo: "Corridas", nome: "Consultar corridas", rota: "/historico", antigas: ["/corridas", "/raiox"] },
  { id: "mapa", grupo: "Corridas", nome: "Mapa de motoristas", rota: "/mapa" },
  { id: "programadas", grupo: "Corridas", nome: "Consultar programadas", rota: "/programadas" },
  { id: "taxas-cancelamento", grupo: "Corridas", nome: "Taxas de cancelamento", rota: "/taxas-cancelamento" },
  { id: "indice-relatorios", grupo: "Corridas", nome: "Relatórios", rota: "/indice-relatorios" },
  { id: "alterar-os", grupo: "Corridas", nome: "Alteração de dados da OS", rota: "/alterar-os", soAdmin: true },
  { id: "entrega-voucher", grupo: "Corridas", nome: "Entrega de voucher", rota: "/entrega-voucher" },
  { id: "objetos", grupo: "Corridas", nome: "Objetos perdidos", rota: "/objetos" },
  { id: "engajamento", grupo: "Corridas", nome: "Mapa de engajamento", rota: "/engajamento", novo: true },
  { id: "recuperacao", grupo: "Corridas", secao: EXTRA, nome: "Recuperação de Vendas", rota: "/recuperacao", novo: true },
  { id: "funil-clientes", grupo: "Corridas", secao: EXTRA, nome: "Funil de Clientes", rota: "/funil-clientes", novo: true },
  { id: "mapa-bairros", grupo: "Corridas", secao: EXTRA, nome: "Mapa de Bairros e Demanda", rota: "/mapa-bairros", novo: true },

  { id: "transacao-pix", grupo: "Financeiro", secao: "Pix", nome: "Transações", rota: "/transacao-pix" },
  { id: "faturamento-empresa", grupo: "Financeiro", secao: "Contas a receber", nome: "Faturamento por empresa", rota: "/faturamento-empresa" },
  { id: "faturamento-centro-custo", grupo: "Financeiro", secao: "Contas a receber", nome: "Faturamento de centro de custo", rota: "/faturamento-centro-custo" },
  { id: "faturamento-periodo", grupo: "Financeiro", secao: "Contas a receber", nome: "Faturamento por período", rota: "/faturamento-periodo" },
  { id: "vouchers-motoristas", grupo: "Financeiro", secao: "Contas a pagar", nome: "Vouchers e tickets por motoristas", rota: "/vouchers-motoristas" },
  { id: "pagamentos-pendentes", grupo: "Financeiro", nome: "Pagamentos pendentes", rota: "/pagamentos-pendentes", antigas: ["/pendencias"] },
  { id: "visao-geral", grupo: "Financeiro", secao: "Relatórios", nome: "Visão geral", rota: "/visao-geral" },
  { id: "relatorio-faturamento", grupo: "Financeiro", secao: "Relatórios", nome: "Faturamento", rota: "/relatorio-faturamento" },
  { id: "extrato-online", grupo: "Financeiro", secao: "Relatórios", nome: "Transações online", rota: "/extrato-online" },
  { id: "os-motorista", grupo: "Financeiro", secao: "Estatísticas", nome: "OS por motorista", rota: "/os-motorista" },
  { id: "os-empresa", grupo: "Financeiro", secao: "Estatísticas", nome: "OS por empresa", rota: "/os-empresa" },
  { id: "os-bairro", grupo: "Financeiro", secao: "Estatísticas", nome: "OS por bairro", rota: "/os-bairro" },
  { id: "os-pagamento", grupo: "Financeiro", secao: "Estatísticas", nome: "OS por forma de pagamento", rota: "/os-pagamento" },
  { id: "os-operador", grupo: "Financeiro", secao: "Estatísticas", nome: "OS por operador", rota: "/os-operador" },
  { id: "os-percentual-motorista", grupo: "Financeiro", secao: "Estatísticas", nome: "% de OS por motorista", rota: "/os-percentual-motorista" },
  { id: "km-rodados", grupo: "Financeiro", secao: "Poder público", nome: "Km rodados por motorista", rota: "/km-rodados" },
  { id: "indicacoes", grupo: "Financeiro", nome: "Recompensas por indicação", rota: "/indicacoes", antigas: ["/recompensas-indicacao"] },
  { id: "extrato-central", grupo: "Financeiro", secao: EXTRA, nome: "Extrato da central", rota: "/extrato-central" },
  { id: "carteiras", grupo: "Financeiro", secao: EXTRA, nome: "Carteiras", rota: "/carteiras" },
  { id: "extrato", grupo: "Financeiro", secao: EXTRA, nome: "Extrato Geral", rota: "/extrato" },
  { id: "saques", grupo: "Financeiro", secao: EXTRA, nome: "Saques", rota: "/saques" },
  { id: "recargas", grupo: "Financeiro", secao: EXTRA, nome: "Recargas", rota: "/recargas" },
  { id: "relatorios", grupo: "Financeiro", secao: EXTRA, nome: "Relatórios & Stats", rota: "/relatorios", antigas: ["/financeiro", "/producao", "/estatisticas", "/funil"] },

  { id: "conversas", grupo: "Comunicação", nome: "Conversas", rota: "/conversas" },
  { id: "notificacoes", grupo: "Comunicação", nome: "Notificações app", rota: "/notificacoes" },
  { id: "alertas-empresas", grupo: "Comunicação", nome: "Alertas para empresas", rota: "/alertas-empresas" },

  { id: "config-gerais", grupo: "Configurações", nome: "Gerais", rota: "/config-gerais", soAdmin: true },
  { id: "personalizacao-app", grupo: "Configurações", nome: "Personalização app passageiro", rota: "/personalizacao-app", soAdmin: true },
  { id: "regras-despacho", grupo: "Configurações", nome: "Despacho", rota: "/regras-despacho", soAdmin: true, antigas: ["/despacho"] },
  { id: "transbordos", grupo: "Configurações", nome: "Transbordos", rota: "/transbordos", soAdmin: true },
  { id: "categorias", grupo: "Configurações", nome: "Tarifas e categorias", rota: "/categorias", soAdmin: true, antigas: ["/tarifas"] },
  { id: "tarifas-dinamicas", grupo: "Configurações", nome: "Tarifas dinâmicas", rota: "/tarifas-dinamicas", soAdmin: true },
  { id: "descontos", grupo: "Configurações", nome: "Descontos", rota: "/descontos", soAdmin: true },
  { id: "integracoes", grupo: "Configurações", nome: "Integrações", rota: "/integracoes", soAdmin: true },
  { id: "config-nps", grupo: "Configurações", nome: "NPS", rota: "/config-nps", soAdmin: true },
  { id: "termos-app", grupo: "Configurações", nome: "Termos de uso", rota: "/termos-app", soAdmin: true },
  { id: "regras-credito", grupo: "Configurações", secao: EXTRA, nome: "Regras de Crédito", rota: "/regras-credito", soAdmin: true },

  { id: "avaliacoes", grupo: "Avaliações", nome: "NPS", rota: "/avaliacoes", antigas: ["/nps"] },

  { id: "juridico", grupo: "Ajuda", nome: "Política de privacidade", rota: "/juridico" },
  { id: "central-ajuda", grupo: "Ajuda", secao: EXTRA, nome: "Central de Ajuda", rota: "/central-ajuda" },

  // Cobrança entre centrais (grupo nosso, fora da Machine).
  { id: "demonstrativo-mensal", grupo: "Cobrança", nome: "Demonstrativo Mensal", rota: "/demonstrativo-mensal", soAdmin: true },
  { id: "meus-planos", grupo: "Cobrança", nome: "Meus planos", rota: "/meus-planos", soAdmin: true },
  { id: "controle-centrais", grupo: "Cobrança", nome: "Controle financeiro de centrais", rota: "/controle-centrais", soAdmin: true, novo: true },

  // Telas próprias (não existem na Machine).
  { id: "crm-campanhas", grupo: "Mais", secao: "CRM", nome: "Campanhas", rota: "/crm/campanhas" },
  { id: "crm-jornadas", grupo: "Mais", secao: "CRM", nome: "Jornadas", rota: "/crm/jornadas" },
  { id: "crm-publico", grupo: "Mais", secao: "CRM", nome: "Público", rota: "/crm/publico" },
  { id: "bot", grupo: "Mais", secao: "Atendimento", nome: "Bot de WhatsApp", rota: "/bot" },
  { id: "totem", grupo: "Mais", secao: "Atendimento", nome: "Totem", rota: "/totem" },
  { id: "analise", grupo: "Mais", secao: "Operação", nome: "Análise com IA", rota: "/analise" },
  { id: "apps", grupo: "Mais", secao: "Operação", nome: "Apps e SOS", rota: "/apps" },
  { id: "documentos", grupo: "Mais", secao: "Operação", nome: "Documentos dos motoristas", rota: "/documentos" },
  { id: "enderecos", grupo: "Mais", secao: "Configurações", nome: "Endereços", rota: "/enderecos" },
  { id: "marca", grupo: "Mais", secao: "Configurações", nome: "Marca e aparência", rota: "/marca", soAdmin: true },

  // Menu do usuário (à direita): "Trocar senha", como na Machine.
  { id: "alterar-senha", grupo: "Usuário", nome: "Trocar senha", rota: "/alterar-senha" },
];

/** Grupos do menu do topo, na ordem da Machine; depois os extras nossos ("Cobrança" e "Mais"). "Usuário" fica no menu à direita. */
export const GRUPOS: Grupo[] = ["Painel", "Cadastro", "Corridas", "Financeiro", "Comunicação", "Configurações", "Avaliações", "Ajuda", "Cobrança", "Mais"];

export const funcaoPorId = (id: string) => FUNCOES.find((f) => f.id === id) ?? null;
