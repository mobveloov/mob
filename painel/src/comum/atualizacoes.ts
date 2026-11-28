// Novidades do painel, mostradas na janelinha "Atualizações" da barra de cima. Texto curto, em português,
// tirado de docs/ESTADO_PAINEL.md (últimas entregas). Mais novo primeiro.

export interface Atualizacao { data: string; titulo: string; texto: string }

export const ATUALIZACOES: Atualizacao[] = [
  { data: "20/11/2026", titulo: "Menu reorganizado", texto: "O menu lateral ganhou novos grupos, nomes e submenus. Taxas da central, categorias e as demais configurações aparecem direto em Configurações. Ctrl K busca qualquer tela." },
  { data: "19/11/2026", titulo: "Taxas, comissão e carteira", texto: "A comissão da categoria e as taxas do motorista saem da carteira ao finalizar a corrida. O passageiro vê a taxa de serviço na estimativa e no recibo." },
  { data: "19/11/2026", titulo: "Mais de um carro por corrida", texto: "A corrida marcada é oferecida a até 3 motoristas ao mesmo tempo; o primeiro que aceita leva." },
  { data: "19/11/2026", titulo: "Filial nos mapas e listas", texto: "Acompanhamento, Mapa de motoristas e Programadas ganharam o filtro por filial." },
  { data: "19/11/2026", titulo: "Desconto e observação da empresa", texto: "O desconto da empresa por forma de pagamento entra na corrida. A observação da empresa aparece para o motorista." },
  { data: "19/11/2026", titulo: "Carteiras de crédito", texto: "Novo item em Configurações, ao lado de Taxas da central." },
  { data: "15/11/2026", titulo: "Centrais e cobrança", texto: "Controle financeiro de centrais, Meus planos e Demonstrativo Mensal, com a rede de centrais associadas." },
  { data: "14/11/2026", titulo: "Painel inicial e Mapa de engajamento", texto: "Painel e Mapa de engajamento com dados reais da empresa." },
  { data: "13/11/2026", titulo: "Financeiro, Pix e pendências", texto: "Visão geral do financeiro, Transações com Pix, Pagamentos pendentes, Taxas de cancelamento e Alertas para empresas." },
];
