// Menu do painel: os mesmos grupos, seções, nomes e ordem do painel de referência (menu no topo),
// mais o grupo "Mais" no fim com as telas próprias (CRM, bot, totem, IA, apps, marca...).
// Os ids e as rotas são fixos: cada tela é ligada ao menu pelo id (src/web/App.tsx).

export type Grupo = "Painel" | "Cadastro" | "Corridas" | "Financeiro" | "Comunicação" | "Config" | "Avaliações" | "Ajuda" | "Mais" | "Usuário";

export interface Funcao {
  id: string;
  grupo: Grupo;
  /** Seção dentro do grupo (título pequeno no menu suspenso), quando houver. */
  secao?: string;
  nome: string;
  rota: string;
  /** Só administradores (e a plataforma) veem. */
  soAdmin?: boolean;
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
  { id: "equipe", grupo: "Cadastro", secao: "Principal", nome: "Equipe", rota: "/equipe", soAdmin: true, antigas: ["/usuarios"] },
  { id: "cupons", grupo: "Cadastro", secao: "Gestão", nome: "Cupons", rota: "/cupons" },
  { id: "empresas", grupo: "Cadastro", secao: "Gestão", nome: "Empresas", rota: "/empresas", antigas: ["/conveniadas"] },
  { id: "areas", grupo: "Cadastro", secao: "Gestão", nome: "Áreas", rota: "/areas" },
  { id: "punicoes", grupo: "Cadastro", secao: "Gestão", nome: "Punições", rota: "/punicoes" },
  { id: "desafios", grupo: "Cadastro", secao: "Gestão", nome: "Desafios", rota: "/desafios" },
  { id: "indicacoes", grupo: "Cadastro", secao: "Gestão", nome: "Indicações", rota: "/indicacoes", novo: true },

  { id: "solicitar", grupo: "Corridas", nome: "Nova Solicitação", rota: "/solicitar" },
  { id: "recuperacao", grupo: "Corridas", nome: "Recuperação de Vendas", rota: "/recuperacao", novo: true },
  { id: "monitoramento", grupo: "Corridas", nome: "Monitoramento", rota: "/monitoramento", antigas: ["/acompanhamento"] },
  { id: "mapa", grupo: "Corridas", nome: "Mapa Real-Time", rota: "/mapa" },
  { id: "historico", grupo: "Corridas", nome: "Histórico", rota: "/historico", antigas: ["/corridas", "/raiox"] },
  { id: "ocorrencias", grupo: "Corridas", nome: "Retorno/Ocorrências", rota: "/ocorrencias" },
  { id: "programadas", grupo: "Corridas", nome: "Programadas", rota: "/programadas" },
  { id: "pagamentos-pendentes", grupo: "Corridas", nome: "Pagamentos Pend.", rota: "/pagamentos-pendentes", antigas: ["/pendencias"] },
  { id: "objetos", grupo: "Corridas", nome: "Objetos Perdidos", rota: "/objetos" },
  { id: "engajamento", grupo: "Corridas", nome: "Mapa de engajamento", rota: "/engajamento", novo: true },

  { id: "carteiras", grupo: "Financeiro", secao: "Transações", nome: "Carteiras", rota: "/carteiras" },
  { id: "extrato", grupo: "Financeiro", secao: "Transações", nome: "Extrato Geral", rota: "/extrato" },
  { id: "saques", grupo: "Financeiro", secao: "Transações", nome: "Saques", rota: "/saques" },
  { id: "recargas", grupo: "Financeiro", secao: "Transações", nome: "Recargas", rota: "/recargas" },
  { id: "relatorios", grupo: "Financeiro", secao: "Análises", nome: "Relatórios & Stats", rota: "/relatorios", antigas: ["/financeiro", "/producao", "/estatisticas", "/funil"] },

  { id: "conversas", grupo: "Comunicação", nome: "Conversas", rota: "/conversas" },
  { id: "notificacoes", grupo: "Comunicação", nome: "Notificações Push", rota: "/notificacoes" },

  { id: "config-gerais", grupo: "Config", nome: "Gerais do App", rota: "/config-gerais", soAdmin: true },
  { id: "regras-credito", grupo: "Config", nome: "Regras de Crédito", rota: "/regras-credito", soAdmin: true },
  { id: "categorias", grupo: "Config", nome: "Categorias", rota: "/categorias", soAdmin: true, antigas: ["/tarifas"] },
  { id: "tarifas-dinamicas", grupo: "Config", nome: "Tarifas Dinâmicas", rota: "/tarifas-dinamicas", soAdmin: true },
  { id: "descontos", grupo: "Config", nome: "Descontos", rota: "/descontos", soAdmin: true },
  { id: "regras-despacho", grupo: "Config", nome: "Regras de Despacho", rota: "/regras-despacho", soAdmin: true, antigas: ["/despacho"] },
  { id: "transbordos", grupo: "Config", nome: "Transbordos", rota: "/transbordos", soAdmin: true },
  { id: "integracoes", grupo: "Config", nome: "Integrações", rota: "/integracoes", soAdmin: true },
  { id: "config-nps", grupo: "Config", nome: "Configuração NPS", rota: "/config-nps", soAdmin: true },
  { id: "termos-app", grupo: "Config", nome: "Termos de Uso App", rota: "/termos-app", soAdmin: true },

  { id: "avaliacoes", grupo: "Avaliações", nome: "Avaliações", rota: "/avaliacoes", antigas: ["/nps"] },

  { id: "juridico", grupo: "Ajuda", nome: "Jurídico & Leis", rota: "/juridico" },
  { id: "central-ajuda", grupo: "Ajuda", nome: "Central de Ajuda", rota: "/central-ajuda" },

  // Telas próprias (não existem na referência).
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

  // Menu do usuário (à direita).
  { id: "alterar-senha", grupo: "Usuário", nome: "Alterar Senha", rota: "/alterar-senha" },
];

/** Grupos do menu do topo, na ordem da referência ("Mais" no fim). "Usuário" fica no menu à direita. */
export const GRUPOS: Grupo[] = ["Painel", "Cadastro", "Corridas", "Financeiro", "Comunicação", "Config", "Avaliações", "Ajuda", "Mais"];

export const funcaoPorId = (id: string) => FUNCOES.find((f) => f.id === id) ?? null;
