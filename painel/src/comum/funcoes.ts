// Matriz de funções: o painel tem a UNIÃO do que existe nos dois sistemas de origem.
// Uma tela por função, igual para qualquer sistema. Função que ainda depende do motor aparece no menu
// marcada ("em integração"), nunca escondida. A mesma lista gera a tabela de docs/ANALISE_PAINEIS.md.

export type Situacao = "pronto" | "parcial" | "aguarda-motor" | "planejado";

export interface Funcao {
  id: string;
  grupo: "Operação" | "Cadastros" | "Financeiro" | "Relatórios" | "Comunicação" | "CRM" | "Atendimento" | "Configurações";
  nome: string;
  rota: string;
  /** Existe no painel de referência do Sistema A / do Sistema B? Só para a matriz de funções. */
  emA: boolean;
  emB: boolean;
  situacao: Situacao;
  /** O que o painel precisa do motor para ficar completo (lacuna). */
  falta?: string;
}

export const FUNCOES: Funcao[] = [
  { id: "painel", grupo: "Operação", nome: "Painel", rota: "/", emA: true, emB: true, situacao: "pronto" },
  { id: "corridas", grupo: "Operação", nome: "Consultar corridas", rota: "/corridas", emA: true, emB: true, situacao: "pronto" },
  { id: "acompanhamento", grupo: "Operação", nome: "Acompanhamento", rota: "/acompanhamento", emA: true, emB: true, situacao: "pronto" },
  { id: "programadas", grupo: "Operação", nome: "Programadas", rota: "/programadas", emA: true, emB: true, situacao: "parcial", falta: "Campo 'programada' e data agendada na Corrida do motor." },
  { id: "solicitar", grupo: "Operação", nome: "Solicitar corrida", rota: "/solicitar", emA: true, emB: true, situacao: "aguarda-motor", falta: "Uso de criarCorrida() do motor pelo painel, com estimativa de preço." },
  { id: "mapa", grupo: "Operação", nome: "Mapa de motoristas", rota: "/mapa", emA: true, emB: true, situacao: "aguarda-motor", falta: "Posição dos motoristas (eventos 'posicao') no motor." },
  { id: "raiox", grupo: "Operação", nome: "Auditoria da corrida (raio-x)", rota: "/raiox", emA: false, emB: true, situacao: "aguarda-motor", falta: "Histórico de ofertas e linha do tempo por corrida no motor." },
  { id: "despacho", grupo: "Operação", nome: "Despacho", rota: "/despacho", emA: true, emB: true, situacao: "aguarda-motor", falta: "Leitura e gravação das regras de despacho." },
  { id: "ocorrencias", grupo: "Operação", nome: "Retorno e ocorrências", rota: "/ocorrencias", emA: true, emB: true, situacao: "pronto" },
  { id: "objetos", grupo: "Operação", nome: "Objetos perdidos", rota: "/objetos", emA: true, emB: true, situacao: "pronto" },
  { id: "cancelamentos", grupo: "Operação", nome: "Taxas de cancelamento", rota: "/cancelamentos", emA: true, emB: false, situacao: "aguarda-motor", falta: "Taxas de cancelamento cobradas por corrida." },
  { id: "motoristas", grupo: "Cadastros", nome: "Motoristas", rota: "/motoristas", emA: true, emB: true, situacao: "pronto" },
  { id: "clientes", grupo: "Cadastros", nome: "Passageiros", rota: "/passageiros", emA: true, emB: true, situacao: "pronto" },
  { id: "empresas", grupo: "Cadastros", nome: "Empresas conveniadas", rota: "/conveniadas", emA: true, emB: true, situacao: "pronto" },
  { id: "veiculos", grupo: "Cadastros", nome: "Veículos", rota: "/veiculos", emA: false, emB: true, situacao: "pronto" },
  { id: "areas", grupo: "Cadastros", nome: "Áreas", rota: "/areas", emA: true, emB: true, situacao: "pronto" },
  { id: "punicoes", grupo: "Cadastros", nome: "Punições e bloqueios", rota: "/punicoes", emA: true, emB: true, situacao: "pronto" },
  { id: "financeiro", grupo: "Financeiro", nome: "Faturamento", rota: "/financeiro", emA: true, emB: true, situacao: "pronto" },
  { id: "pendencias", grupo: "Financeiro", nome: "Pagamentos pendentes", rota: "/pendencias", emA: true, emB: true, situacao: "aguarda-motor", falta: "Pendências de pagamento no motor." },
  { id: "carteiras", grupo: "Financeiro", nome: "Carteiras, saques e recargas", rota: "/carteiras", emA: true, emB: true, situacao: "aguarda-motor", falta: "Extrato de carteira, saques e recargas Pix no motor." },
  { id: "cupons", grupo: "Financeiro", nome: "Cupons e descontos", rota: "/cupons", emA: true, emB: true, situacao: "pronto" },
  { id: "tarifas", grupo: "Financeiro", nome: "Tarifas e categorias", rota: "/tarifas", emA: true, emB: true, situacao: "pronto" },
  { id: "producao", grupo: "Relatórios", nome: "Produção dos motoristas", rota: "/producao", emA: true, emB: false, situacao: "pronto" },
  { id: "estatisticas", grupo: "Relatórios", nome: "Estatísticas", rota: "/estatisticas", emA: true, emB: false, situacao: "pronto" },
  { id: "analise", grupo: "Relatórios", nome: "Análise com IA", rota: "/analise", emA: false, emB: false, situacao: "pronto" },
  { id: "funil", grupo: "Relatórios", nome: "Funil de passageiros", rota: "/funil", emA: false, emB: true, situacao: "aguarda-motor", falta: "Cadastros e primeiro pedido dos passageiros no motor. A recorrência já aparece em Estatísticas." },
  { id: "nps", grupo: "Relatórios", nome: "Avaliações (NPS)", rota: "/avaliacoes", emA: true, emB: true, situacao: "pronto" },
  { id: "desafios", grupo: "Relatórios", nome: "Desafios e indicações", rota: "/desafios", emA: true, emB: true, situacao: "pronto" },
  { id: "conversas", grupo: "Comunicação", nome: "Conversas", rota: "/conversas", emA: true, emB: true, situacao: "aguarda-motor", falta: "Mensagens (eventos 'mensagem') e envio no motor." },
  { id: "notificacoes", grupo: "Comunicação", nome: "Notificações do app", rota: "/notificacoes", emA: true, emB: true, situacao: "aguarda-motor", falta: "Envio de notificação push no motor." },
  { id: "crm-campanhas", grupo: "CRM", nome: "Campanhas", rota: "/crm/campanhas", emA: false, emB: false, situacao: "planejado", falta: "Fase 3 do docs/PLANO_FASES.md: campanhas, segmentos, cupons e envio em lote com ritmo." },
  { id: "crm-jornadas", grupo: "CRM", nome: "Jornadas e gatilhos", rota: "/crm/jornadas", emA: false, emB: false, situacao: "planejado", falta: "Fase 3 do docs/PLANO_FASES.md (precisa dos eventos de status do motor)." },
  { id: "crm-publico", grupo: "CRM", nome: "Público e listas", rota: "/crm/publico", emA: false, emB: false, situacao: "planejado", falta: "Fase 3 do docs/PLANO_FASES.md (passageiros das corridas + cadastro do motor)." },
  { id: "bot", grupo: "Atendimento", nome: "Bot de WhatsApp", rota: "/bot", emA: false, emB: false, situacao: "planejado", falta: "Fase 4 do docs/PLANO_FASES.md: pedido de corrida pelo WhatsApp, um número por empresa." },
  { id: "totem", grupo: "Atendimento", nome: "Totem", rota: "/totem", emA: false, emB: false, situacao: "planejado", falta: "Fase 5 do docs/PLANO_FASES.md: tela de pedido no totem com a marca da empresa." },
  { id: "marca", grupo: "Configurações", nome: "Marca e aparência", rota: "/marca", emA: true, emB: false, situacao: "pronto" },
  { id: "integracoes", grupo: "Configurações", nome: "Integrações", rota: "/integracoes", emA: true, emB: true, situacao: "pronto" },
  { id: "usuarios", grupo: "Configurações", nome: "Usuários", rota: "/usuarios", emA: true, emB: true, situacao: "pronto" },
];

export const GRUPOS: Funcao["grupo"][] = ["Operação", "Cadastros", "Financeiro", "Relatórios", "Comunicação", "CRM", "Atendimento", "Configurações"];
