// Menu do painel: os mesmos grupos, seções, nomes e ordem do painel de referência (menu no topo),
// mais o grupo "Mais" no fim com as telas próprias (CRM, bot, totem, IA, apps, marca...).
// Os ids e as rotas são fixos: cada tela é ligada ao menu pelo id (src/web/App.tsx).

import { podeCargo, type Cargo } from "./cargos.ts";

export type Grupo = "Painel" | "Cadastro" | "Corridas" | "Financeiro" | "Comunicação" | "Config" | "Cobrança" | "Avaliações" | "Ajuda" | "Mais" | "Usuário";

export interface Funcao {
  id: string;
  grupo: Grupo;
  /** Seção dentro do grupo (título pequeno no menu suspenso), quando houver. */
  secao?: string;
  nome: string;
  rota: string;
  /** Cargo mínimo para ver e usar (padrão: operador). Veja src/comum/cargos.ts e docs/CARGOS.md. */
  minimo?: Cargo;
  /** Etiqueta "NOVO" no menu, como na referência. */
  novo?: boolean;
  /** Caminhos antigos que agora levam a esta tela. */
  antigas?: string[];
}

export const FUNCOES: Funcao[] = [
  { id: "painel", grupo: "Painel", nome: "Painel", rota: "/" },

  { id: "motoristas", grupo: "Cadastro", secao: "Principal", nome: "Motoristas", rota: "/motoristas" },
  { id: "destravar", grupo: "Cadastro", secao: "Principal", nome: "Destravar Motoristas", rota: "/destravar" },
  { id: "passageiros", grupo: "Cadastro", secao: "Principal", nome: "Passageiros", rota: "/passageiros", antigas: ["/clientes"] },
  { id: "veiculos", grupo: "Cadastro", secao: "Principal", nome: "Veículos", rota: "/veiculos" },
  { id: "equipe", grupo: "Cadastro", secao: "Principal", nome: "Equipe", rota: "/equipe", antigas: ["/usuarios"], minimo: "admin" },
  { id: "cupons", grupo: "Cadastro", secao: "Gestão", nome: "Cupons", rota: "/cupons", minimo: "gestor" },
  { id: "empresas", grupo: "Cadastro", secao: "Gestão", nome: "Empresas", rota: "/empresas", antigas: ["/conveniadas"], minimo: "gestor" },
  { id: "areas", grupo: "Cadastro", secao: "Gestão", nome: "Áreas", rota: "/areas", minimo: "gestor" },
  { id: "plantao", grupo: "Cadastro", secao: "Gestão", nome: "Plantão", rota: "/plantao" },
  { id: "ruas", grupo: "Cadastro", secao: "Gestão", nome: "Ruas", rota: "/ruas", minimo: "gestor" },
  { id: "punicoes", grupo: "Cadastro", secao: "Gestão", nome: "Punições", rota: "/punicoes", minimo: "gestor" },
  { id: "desafios", grupo: "Cadastro", secao: "Gestão", nome: "Desafios", rota: "/desafios", minimo: "gestor" },
  { id: "indicacoes", grupo: "Cadastro", secao: "Gestão", nome: "Indicações", rota: "/indicacoes", novo: true, minimo: "admin" },
  { id: "filiais", grupo: "Cadastro", secao: "Gestão", nome: "Filiais", rota: "/filiais", minimo: "gestor", novo: true },
  { id: "faixas-vouchers", grupo: "Cadastro", secao: "Gestão", nome: "Faixa de Vouchers", rota: "/faixas-vouchers", minimo: "gestor" },

  { id: "solicitar", grupo: "Corridas", nome: "Nova Solicitação", rota: "/solicitar" },
  { id: "recuperacao", grupo: "Corridas", nome: "Recuperação de Vendas", rota: "/recuperacao", novo: true },
  { id: "monitoramento", grupo: "Corridas", nome: "Monitoramento", rota: "/monitoramento", antigas: ["/acompanhamento"] },
  { id: "mapa", grupo: "Corridas", nome: "Mapa Real-Time", rota: "/mapa" },
  { id: "historico", grupo: "Corridas", nome: "Histórico", rota: "/historico", antigas: ["/corridas", "/raiox"] },
  { id: "ocorrencias", grupo: "Corridas", nome: "Retorno/Ocorrências", rota: "/ocorrencias" },
  { id: "programadas", grupo: "Corridas", nome: "Programadas", rota: "/programadas" },
  { id: "pagamentos-pendentes", grupo: "Corridas", nome: "Pagamentos pendentes", rota: "/pagamentos-pendentes", antigas: ["/pendencias"], minimo: "admin" },
  { id: "taxas-cancelamento", grupo: "Corridas", nome: "Taxas de cancelamento", rota: "/taxas-cancelamento", novo: true },
  { id: "objetos", grupo: "Corridas", nome: "Objetos Perdidos", rota: "/objetos" },
  { id: "engajamento", grupo: "Corridas", nome: "Mapa de engajamento", rota: "/engajamento", novo: true },
  { id: "funil-clientes", grupo: "Corridas", nome: "Funil de Clientes", rota: "/funil-clientes", novo: true, minimo: "gestor" },
  { id: "mapa-bairros", grupo: "Corridas", nome: "Mapa de Bairros e Demanda", rota: "/mapa-bairros", novo: true, minimo: "gestor" },
  { id: "entrega-voucher", grupo: "Corridas", nome: "Entrega de voucher", rota: "/entrega-voucher" },

  { id: "visao-geral", grupo: "Financeiro", secao: "Relatórios", nome: "Visão geral do financeiro", rota: "/visao-geral", minimo: "admin" },
  { id: "extrato-central", grupo: "Financeiro", secao: "Relatórios", nome: "Extrato da central", rota: "/extrato-central", minimo: "gestor" },
  { id: "extrato-online", grupo: "Financeiro", secao: "Relatórios", nome: "Extrato de transações online", rota: "/extrato-online", minimo: "admin" },
  { id: "transacao-pix", grupo: "Financeiro", secao: "Pix", nome: "Transação com Pix", rota: "/transacao-pix", novo: true, minimo: "gestor" },
  { id: "indice-relatorios", grupo: "Financeiro", secao: "Relatórios", nome: "Relatórios", rota: "/indice-relatorios", minimo: "admin" },
  { id: "faturamento-empresa", grupo: "Financeiro", secao: "Contas a receber", nome: "Faturamento por empresa", rota: "/faturamento-empresa", minimo: "admin" },
  { id: "faturamento-centro-custo", grupo: "Financeiro", secao: "Contas a receber", nome: "Faturamento de centro de custo", rota: "/faturamento-centro-custo", minimo: "admin" },
  { id: "faturamento-periodo", grupo: "Financeiro", secao: "Contas a receber", nome: "Faturamento por período", rota: "/faturamento-periodo", minimo: "admin" },
  { id: "vouchers-motoristas", grupo: "Financeiro", secao: "Contas a pagar", nome: "Vouchers e tickets por motoristas", rota: "/vouchers-motoristas", minimo: "gestor" },
  { id: "os-motorista", grupo: "Financeiro", secao: "Estatísticas", nome: "OS por motorista", rota: "/os-motorista", minimo: "admin" },
  { id: "os-empresa", grupo: "Financeiro", secao: "Estatísticas", nome: "OS por empresa", rota: "/os-empresa", minimo: "admin" },
  { id: "os-bairro", grupo: "Financeiro", secao: "Estatísticas", nome: "OS por bairro", rota: "/os-bairro", minimo: "admin" },
  { id: "os-pagamento", grupo: "Financeiro", secao: "Estatísticas", nome: "OS por forma de pagamento", rota: "/os-pagamento", minimo: "admin" },
  { id: "os-operador", grupo: "Financeiro", secao: "Estatísticas", nome: "OS por operador", rota: "/os-operador", minimo: "admin" },
  { id: "os-percentual-motorista", grupo: "Financeiro", secao: "Estatísticas", nome: "% de OS por motorista", rota: "/os-percentual-motorista", minimo: "admin" },
  { id: "km-rodados", grupo: "Financeiro", secao: "Estatísticas", nome: "Km rodados por motorista", rota: "/km-rodados", minimo: "gestor" },
  { id: "carteiras", grupo: "Financeiro", secao: "Transações", nome: "Carteiras", rota: "/carteiras", minimo: "gestor" },
  { id: "extrato", grupo: "Financeiro", secao: "Transações", nome: "Extrato Geral", rota: "/extrato", minimo: "gestor" },
  { id: "saques", grupo: "Financeiro", secao: "Transações", nome: "Saques", rota: "/saques", minimo: "gestor" },
  { id: "recargas", grupo: "Financeiro", secao: "Transações", nome: "Recargas", rota: "/recargas", minimo: "gestor" },
  { id: "relatorios", grupo: "Financeiro", secao: "Análises", nome: "Relatórios & Stats", rota: "/relatorios", antigas: ["/financeiro", "/producao", "/estatisticas", "/funil"], minimo: "admin" },

  { id: "conversas", grupo: "Comunicação", nome: "Conversas", rota: "/conversas" },
  { id: "notificacoes", grupo: "Comunicação", nome: "Notificações Push", rota: "/notificacoes" },
  { id: "alertas-empresas", grupo: "Comunicação", nome: "Alertas para empresas", rota: "/alertas-empresas", novo: true },

  { id: "config-gerais", grupo: "Config", nome: "Gerais do App", rota: "/config-gerais", minimo: "gestor" },
  { id: "regras-credito", grupo: "Config", nome: "Regras de Crédito", rota: "/regras-credito", minimo: "gestor" },
  { id: "categorias", grupo: "Config", nome: "Categorias", rota: "/categorias", antigas: ["/tarifas"], minimo: "gestor" },
  { id: "tarifas-dinamicas", grupo: "Config", nome: "Tarifas Dinâmicas", rota: "/tarifas-dinamicas", minimo: "gestor" },
  { id: "descontos", grupo: "Config", nome: "Descontos", rota: "/descontos", minimo: "gestor" },
  { id: "regras-despacho", grupo: "Config", nome: "Regras de Despacho", rota: "/regras-despacho", antigas: ["/despacho"], minimo: "gestor" },
  { id: "transbordos", grupo: "Config", nome: "Transbordos", rota: "/transbordos", minimo: "gestor" },
  { id: "integracoes", grupo: "Config", nome: "Integrações", rota: "/integracoes", minimo: "admin" },
  { id: "config-nps", grupo: "Config", nome: "Configuração NPS", rota: "/config-nps", minimo: "gestor" },
  { id: "termos-app", grupo: "Config", nome: "Termos de Uso App", rota: "/termos-app", minimo: "gestor" },

  { id: "demonstrativo-mensal", grupo: "Cobrança", nome: "Demonstrativo Mensal", rota: "/demonstrativo-mensal", minimo: "gestor" },
  { id: "meus-planos", grupo: "Cobrança", nome: "Meus planos", rota: "/meus-planos", minimo: "gestor" },
  { id: "controle-centrais", grupo: "Cobrança", nome: "Controle financeiro de centrais", rota: "/controle-centrais", novo: true, minimo: "gestor" },

  { id: "avaliacoes", grupo: "Avaliações", nome: "Avaliações", rota: "/avaliacoes", antigas: ["/nps"] },

  { id: "juridico", grupo: "Ajuda", nome: "Jurídico & Leis", rota: "/juridico" },
  { id: "central-ajuda", grupo: "Ajuda", nome: "Central de Ajuda", rota: "/central-ajuda" },

  // Telas próprias (não existem na referência).
  { id: "crm-campanhas", grupo: "Mais", secao: "CRM", nome: "Campanhas", rota: "/crm/campanhas", minimo: "gestor" },
  { id: "crm-jornadas", grupo: "Mais", secao: "CRM", nome: "Jornadas", rota: "/crm/jornadas", minimo: "gestor" },
  { id: "crm-publico", grupo: "Mais", secao: "CRM", nome: "Público", rota: "/crm/publico", minimo: "gestor" },
  { id: "bot", grupo: "Mais", secao: "Atendimento", nome: "Bot de WhatsApp", rota: "/bot" },
  { id: "totem", grupo: "Mais", secao: "Atendimento", nome: "Totem", rota: "/totem" },
  { id: "analise", grupo: "Mais", secao: "Operação", nome: "Análise com IA", rota: "/analise", minimo: "admin" },
  { id: "apps", grupo: "Mais", secao: "Operação", nome: "Apps e SOS", rota: "/apps" },
  { id: "documentos", grupo: "Mais", secao: "Operação", nome: "Documentos dos motoristas", rota: "/documentos" },
  { id: "enderecos", grupo: "Mais", secao: "Configurações", nome: "Endereços", rota: "/enderecos" },
  { id: "marca", grupo: "Mais", secao: "Configurações", nome: "Marca e aparência", rota: "/marca", minimo: "gestor" },

  // Menu do usuário (à direita).
  { id: "alterar-senha", grupo: "Usuário", nome: "Alterar Senha", rota: "/alterar-senha" },
];

/** Grupos do menu do topo, na ordem da referência ("Mais" no fim). "Usuário" fica no menu à direita. */
export const GRUPOS: Grupo[] = ["Painel", "Cadastro", "Corridas", "Financeiro", "Comunicação", "Config", "Cobrança", "Avaliações", "Ajuda", "Mais"];

export const funcaoPorId = (id: string) => FUNCOES.find((f) => f.id === id) ?? null;

/** Funções que o cargo vê no menu. */
export const funcoesDoCargo = (cargo: unknown): Funcao[] => FUNCOES.filter((f) => podeCargo(cargo, f.minimo ?? "operador"));
