// Cadastros do painel: uma definição por cadastro (campos, colunas, quem edita, de onde importa).
// O mesmo motor de cadastro (servidor) e a mesma tela (navegador) servem para todos.
// Os dados ficam no painel, por empresa. "importa" diz de onde o botão "Importar" puxa os registros.

export type TipoCampo = "texto" | "textoLongo" | "numero" | "dinheiro" | "telefone" | "email" | "cpf" | "data" | "selecao" | "booleano";

export interface Campo {
  chave: string;
  rotulo: string;
  tipo: TipoCampo;
  obrigatorio?: boolean;
  opcoes?: string[];
  /** Preenchido pelo painel (ex.: total de corridas): aparece, mas não se edita. */
  calculado?: boolean;
  dica?: string;
}

export interface Cadastro {
  id: string;
  /** id da função em funcoes.ts (menu). */
  funcao: string;
  nome: string;
  singular: string;
  descricao: string;
  campos: Campo[];
  /** Chaves mostradas na lista. */
  colunas: string[];
  /** Campo que identifica o registro ao importar (evita duplicar). */
  chaveUnica?: string;
  importa?: "motoristas" | "passageiros" | "categorias";
  /** Operador também pode criar e editar (senão só admin). */
  operadorEdita?: boolean;
}

/** Situações do motorista (iguais às abas da tela Motoristas). "Aguardando aprovação" fica por compatibilidade (conta como análise). */
export const SITUACOES_MOTORISTA = ["Ativo", "Em análise", "Fila de espera", "Bloqueado", "Rejeitado", "Inativo", "Lixeira", "Aguardando aprovação"];
/** Nível (prioridade de toque): quem é oferecido primeiro no despacho. */
export const NIVEIS_MOTORISTA = ["Prioritário", "Secundário", "Reserva"];

export const CADASTROS: Cadastro[] = [
  {
    id: "motoristas", funcao: "motoristas", nome: "Motoristas", singular: "motorista", operadorEdita: true,
    descricao: "Cadastro dos motoristas. Importe dos sistemas conectados e das corridas, e complete aqui.",
    chaveUnica: "telefone", importa: "motoristas",
    campos: [
      { chave: "nome", rotulo: "Nome", tipo: "texto", obrigatorio: true },
      { chave: "telefone", rotulo: "Telefone", tipo: "telefone", obrigatorio: true },
      { chave: "cpf", rotulo: "CPF", tipo: "cpf" },
      { chave: "email", rotulo: "E-mail", tipo: "email" },
      { chave: "status", rotulo: "Situação", tipo: "selecao", opcoes: SITUACOES_MOTORISTA, obrigatorio: true },
      { chave: "nascimento", rotulo: "Nascimento", tipo: "data" },
      { chave: "genero", rotulo: "Sexo", tipo: "selecao", opcoes: ["Masculino", "Feminino"] },
      { chave: "nivel", rotulo: "Prioridade de toque", tipo: "selecao", opcoes: NIVEIS_MOTORISTA },
      { chave: "endereco", rotulo: "Endereço", tipo: "texto" },
      { chave: "numero", rotulo: "Nº", tipo: "texto" },
      { chave: "cep", rotulo: "CEP", tipo: "texto" },
      { chave: "bairro", rotulo: "Bairro", tipo: "texto" },
      { chave: "chavePix", rotulo: "Chave PIX", tipo: "texto" },
      { chave: "cnhNumero", rotulo: "CNH Nº", tipo: "texto" },
      { chave: "fantasma", rotulo: "Modo fantasma (oculto no mapa)", tipo: "booleano" },
      { chave: "cobranca", rotulo: "Cobrança da central", tipo: "selecao", opcoes: ["Padrão", "Personalizado", "Isento"], dica: "Padrão = comissão da categoria; Isento = não paga; Personalizado = vale no lugar da comissão da categoria." },
      { chave: "cobrancaTipo", rotulo: "Modelo de cobrança", tipo: "selecao", opcoes: ["Percentual", "Valor fixo"] },
      { chave: "cobrancaValor", rotulo: "Valor da cobrança", tipo: "numero" },
      { chave: "categorias", rotulo: "Categorias habilitadas", tipo: "texto", dica: "Separe por vírgula." },
      { chave: "veiculo", rotulo: "Veículo (modelo e cor)", tipo: "texto" },
      { chave: "placa", rotulo: "Placa", tipo: "texto" },
      { chave: "anoVeiculo", rotulo: "Ano do veículo", tipo: "numero" },
      { chave: "viatura", rotulo: "Número da viatura", tipo: "texto" },
      { chave: "validadeCnh", rotulo: "Validade da CNH", tipo: "data" },
      { chave: "validadeLicenciamento", rotulo: "Validade do licenciamento", tipo: "data" },
      { chave: "cidade", rotulo: "Cidade", tipo: "texto" },
      { chave: "observacao", rotulo: "Observação", tipo: "textoLongo" },
      { chave: "origem", rotulo: "Origem", tipo: "texto", calculado: true },
      { chave: "corridas", rotulo: "Corridas (30 dias)", tipo: "numero", calculado: true },
      { chave: "avaliacao", rotulo: "Avaliação", tipo: "numero", calculado: true },
      { chave: "ultimaCorrida", rotulo: "Última corrida", tipo: "data", calculado: true },
    ],
    colunas: ["nome", "telefone", "placa", "categorias", "status", "validadeCnh", "corridas", "avaliacao"],
  },
  {
    id: "clientes", funcao: "clientes", nome: "Passageiros", singular: "passageiro", operadorEdita: true,
    descricao: "Cadastro dos passageiros. Importe das corridas e complete aqui. Bloqueado não pede pelo bot nem pelo totem.",
    chaveUnica: "telefone", importa: "passageiros",
    campos: [
      { chave: "nome", rotulo: "Nome", tipo: "texto", obrigatorio: true },
      { chave: "telefone", rotulo: "Telefone", tipo: "telefone", obrigatorio: true },
      { chave: "cpf", rotulo: "CPF", tipo: "cpf" },
      { chave: "email", rotulo: "E-mail", tipo: "email" },
      { chave: "status", rotulo: "Situação", tipo: "selecao", opcoes: ["Ativo", "Inativo", "Bloqueado", "Suspenso"], obrigatorio: true },
      { chave: "genero", rotulo: "Gênero", tipo: "selecao", opcoes: ["Masculino", "Feminino", "Outro"] },
      { chave: "dispositivo", rotulo: "Dispositivo", tipo: "selecao", opcoes: ["Android", "iOS", "Não identificado"] },
      { chave: "origemCadastro", rotulo: "Origem", tipo: "selecao", opcoes: ["App", "Painel", "Motorista"] },
      { chave: "motoristaOrigem", rotulo: "Motorista (origem)", tipo: "texto", dica: "Id do motorista que cadastrou (origem Motorista)." },
      { chave: "avaliouApp", rotulo: "Avaliou o app?", tipo: "selecao", opcoes: ["Pendente", "Avaliou", "Não quis avaliar", "Adiou"] },
      { chave: "notaApp", rotulo: "Nota para o app", tipo: "numero" },
      { chave: "conveniada", rotulo: "Empresa conveniada", tipo: "texto" },
      { chave: "enderecoFavorito", rotulo: "Endereço favorito", tipo: "texto" },
      { chave: "cidade", rotulo: "Cidade", tipo: "texto" },
      { chave: "observacao", rotulo: "Observação", tipo: "textoLongo" },
      { chave: "corridas", rotulo: "Corridas (90 dias)", tipo: "numero", calculado: true },
      { chave: "gasto", rotulo: "Gasto (90 dias)", tipo: "dinheiro", calculado: true },
      { chave: "ultimaCorrida", rotulo: "Última corrida", tipo: "data", calculado: true },
    ],
    colunas: ["nome", "telefone", "cidade", "status", "conveniada", "corridas", "gasto", "ultimaCorrida"],
  },
  {
    id: "veiculos", funcao: "veiculos", nome: "Veículos", singular: "veículo",
    descricao: "Frota: veículos, documentos e a quem estão ligados.",
    chaveUnica: "placa",
    campos: [
      { chave: "placa", rotulo: "Placa", tipo: "texto", obrigatorio: true },
      { chave: "modelo", rotulo: "Modelo", tipo: "texto", obrigatorio: true },
      { chave: "cor", rotulo: "Cor", tipo: "texto" },
      { chave: "ano", rotulo: "Ano", tipo: "numero" },
      { chave: "categoria", rotulo: "Categoria", tipo: "texto" },
      { chave: "motorista", rotulo: "Motorista", tipo: "texto" },
      { chave: "motoristaId", rotulo: "Motorista proprietário (id)", tipo: "texto" },
      { chave: "emUso", rotulo: "Em uso", tipo: "booleano", dica: "Cada motorista tem um veículo em uso; os outros ficam guardados." },
      { chave: "validadeLicenciamento", rotulo: "Validade do licenciamento", tipo: "data" },
      { chave: "status", rotulo: "Situação", tipo: "selecao", opcoes: ["Ativo", "Em manutenção", "Inativo"], obrigatorio: true },
      { chave: "observacao", rotulo: "Observação", tipo: "textoLongo" },
    ],
    colunas: ["placa", "modelo", "cor", "ano", "categoria", "motorista", "validadeLicenciamento", "status"],
  },
  {
    id: "conveniadas", funcao: "empresas", nome: "Empresas", singular: "empresa",
    descricao: "Empresas que pagam corridas faturadas, com centro de custo e limite.",
    chaveUnica: "cnpj",
    campos: [
      { chave: "nome", rotulo: "Nome Fantasia", tipo: "texto", obrigatorio: true },
      { chave: "razaoSocial", rotulo: "Razão Social", tipo: "texto" },
      { chave: "cnpj", rotulo: "CNPJ", tipo: "texto" },
      { chave: "contato", rotulo: "Responsável", tipo: "texto" },
      { chave: "telefone", rotulo: "Telefone", tipo: "telefone" },
      { chave: "email", rotulo: "E-mail Responsável", tipo: "email" },
      { chave: "cidade", rotulo: "Cidade Sede", tipo: "texto" },
      { chave: "centrosCusto", rotulo: "Centros de custo", tipo: "texto", dica: "Separe por vírgula." },
      { chave: "limiteMensal", rotulo: "Limite mensal", tipo: "dinheiro" },
      { chave: "desconto", rotulo: "Desconto (%)", tipo: "numero" },
      { chave: "diaFechamento", rotulo: "Dia de fechamento", tipo: "numero" },
      { chave: "status", rotulo: "Situação", tipo: "selecao", opcoes: ["Ativa", "Suspensa", "Encerrada"], obrigatorio: true },
      { chave: "observacao", rotulo: "Observação", tipo: "textoLongo" },
    ],
    colunas: ["nome", "cnpj", "contato", "telefone", "limiteMensal", "desconto", "status"],
  },
  {
    id: "categorias", funcao: "tarifas", nome: "Categorias e tarifas", singular: "categoria",
    descricao: "Categorias e valores de tarifa. Importe dos sistemas conectados e das corridas.",
    chaveUnica: "nome", importa: "categorias",
    campos: [
      { chave: "nome", rotulo: "Nome", tipo: "texto", obrigatorio: true },
      { chave: "descricao", rotulo: "Descrição", tipo: "texto" },
      { chave: "bandeirada", rotulo: "Bandeirada", tipo: "dinheiro" },
      { chave: "valorKm", rotulo: "Valor por km", tipo: "dinheiro" },
      { chave: "valorMinuto", rotulo: "Valor por minuto", tipo: "dinheiro" },
      { chave: "valorMinimo", rotulo: "Valor mínimo", tipo: "dinheiro" },
      { chave: "tarifaNoturna", rotulo: "Acréscimo noturno (%)", tipo: "numero" },
      { chave: "dinamicaMaxima", rotulo: "Fator dinâmico máximo", tipo: "numero" },
      { chave: "taxaCancelamento", rotulo: "Taxa de cancelamento", tipo: "dinheiro", dica: "Cobrada do passageiro que cancela depois que o motorista aceitou. Vazio = sem taxa." },
      { chave: "toleranciaCancelamento", rotulo: "Tolerância para cancelar sem taxa (min)", tipo: "numero", dica: "Padrão: 2 minutos." },
      { chave: "comissaoTipo", rotulo: "Comissão da central (tipo)", tipo: "selecao", opcoes: ["Percentual", "Valor fixo"], dica: "Como a central cobra do motorista em cada corrida desta categoria." },
      { chave: "comissaoValor", rotulo: "Comissão da central (valor)", tipo: "numero", dica: "Percentual (ex.: 10 = 10%) ou valor fixo em reais, conforme o tipo." },
      { chave: "ativa", rotulo: "Ativa", tipo: "booleano" },
      { chave: "origem", rotulo: "Origem", tipo: "texto", calculado: true },
      { chave: "corridas", rotulo: "Corridas (30 dias)", tipo: "numero", calculado: true },
    ],
    colunas: ["nome", "bandeirada", "valorKm", "valorMinuto", "valorMinimo", "ativa", "origem", "corridas"],
  },
  {
    id: "cupons", funcao: "cupons", nome: "Cupons", singular: "cupom",
    descricao: "Cupons de desconto (usados no bot, no totem e nas campanhas). O uso nas corridas aparece em Estatísticas.",
    chaveUnica: "codigo",
    campos: [
      { chave: "codigo", rotulo: "Código", tipo: "texto", obrigatorio: true, dica: "Ex.: BEMVINDO10" },
      { chave: "descricao", rotulo: "Descrição", tipo: "texto" },
      { chave: "tipoDesconto", rotulo: "Tipo", tipo: "selecao", opcoes: ["Percentual", "Valor fixo"], obrigatorio: true },
      { chave: "valor", rotulo: "Valor do desconto", tipo: "numero", obrigatorio: true },
      { chave: "valorMaximo", rotulo: "Teto Máx (R$)", tipo: "dinheiro" },
      { chave: "cidade", rotulo: "Cidade", tipo: "texto", dica: "Vazio = todas." },
      { chave: "clienteTelefone", rotulo: "Cliente exclusivo (VIP)", tipo: "telefone", dica: "Vazio = liberado para todos." },
      { chave: "clienteNome", rotulo: "Nome do cliente VIP", tipo: "texto" },
      { chave: "minimoCorrida", rotulo: "Mínimo da corrida", tipo: "dinheiro" },
      { chave: "inicio", rotulo: "Vale a partir de", tipo: "data" },
      { chave: "fim", rotulo: "Vale até", tipo: "data" },
      { chave: "limiteUsos", rotulo: "Limite de usos", tipo: "numero" },
      { chave: "usoPorPassageiro", rotulo: "Usos por passageiro", tipo: "numero" },
      { chave: "categorias", rotulo: "Só nas categorias", tipo: "texto", dica: "Vazio = todas. Separe por vírgula." },
      { chave: "ativo", rotulo: "Ativo", tipo: "booleano" },
    ],
    colunas: ["codigo", "tipoDesconto", "valor", "inicio", "fim", "limiteUsos", "ativo"],
  },
  {
    id: "areas", funcao: "areas", nome: "Áreas", singular: "área",
    descricao: "Regiões da cidade para despacho, bloqueio ou tarifa diferente.",
    chaveUnica: "nome",
    campos: [
      { chave: "nome", rotulo: "Nome", tipo: "texto", obrigatorio: true },
      { chave: "cidade", rotulo: "Cidade", tipo: "texto" },
      { chave: "bairros", rotulo: "Bairros", tipo: "textoLongo", dica: "Um por linha ou separados por vírgula." },
      { chave: "uso", rotulo: "Uso", tipo: "selecao", opcoes: ["Despacho", "Bloqueio", "Tarifa diferente", "Ponto fixo"], obrigatorio: true },
      { chave: "acrescimo", rotulo: "Acréscimo na tarifa (%)", tipo: "numero" },
      { chave: "ativa", rotulo: "Ativa", tipo: "booleano" },
      { chave: "observacao", rotulo: "Observação", tipo: "textoLongo" },
    ],
    colunas: ["nome", "cidade", "uso", "acrescimo", "ativa"],
  },
  {
    id: "punicoes", funcao: "punicoes", nome: "Punições e bloqueios", singular: "punição",
    descricao: "Bloqueios e advertências de motoristas e passageiros, com prazo.",
    campos: [
      { chave: "pessoa", rotulo: "Motorista ou passageiro", tipo: "texto", obrigatorio: true },
      { chave: "tipoPessoa", rotulo: "Quem", tipo: "selecao", opcoes: ["Motorista", "Passageiro"], obrigatorio: true },
      { chave: "tipo", rotulo: "Tipo", tipo: "selecao", opcoes: ["Advertência", "Bloqueio temporário", "Bloqueio definitivo"], obrigatorio: true },
      { chave: "motivo", rotulo: "Motivo", tipo: "textoLongo", obrigatorio: true },
      { chave: "inicio", rotulo: "Início", tipo: "data", obrigatorio: true },
      { chave: "fim", rotulo: "Fim", tipo: "data" },
      { chave: "os", rotulo: "Corrida relacionada (OS)", tipo: "texto" },
      { chave: "situacao", rotulo: "Situação", tipo: "selecao", opcoes: ["Em vigor", "Encerrada", "Revogada"], obrigatorio: true },
    ],
    colunas: ["pessoa", "tipoPessoa", "tipo", "inicio", "fim", "situacao"],
  },
  {
    id: "ocorrencias", funcao: "ocorrencias", nome: "Retorno e ocorrências", singular: "ocorrência", operadorEdita: true,
    descricao: "Reclamações, retornos e problemas em corridas, com acompanhamento até resolver.",
    campos: [
      { chave: "os", rotulo: "Corrida (OS)", tipo: "texto" },
      { chave: "data", rotulo: "Data", tipo: "data", obrigatorio: true },
      { chave: "quem", rotulo: "Quem relatou", tipo: "selecao", opcoes: ["Passageiro", "Motorista", "Central", "Empresa conveniada"], obrigatorio: true },
      { chave: "contato", rotulo: "Nome e telefone", tipo: "texto" },
      { chave: "assunto", rotulo: "Assunto", tipo: "selecao", opcoes: ["Cobrança", "Comportamento", "Atraso", "Rota", "Veículo", "Outro"], obrigatorio: true },
      { chave: "descricao", rotulo: "Descrição", tipo: "textoLongo", obrigatorio: true },
      { chave: "responsavel", rotulo: "Responsável", tipo: "texto" },
      { chave: "situacao", rotulo: "Situação", tipo: "selecao", opcoes: ["Aberta", "Em andamento", "Resolvida"], obrigatorio: true },
      { chave: "solucao", rotulo: "Solução", tipo: "textoLongo" },
    ],
    colunas: ["data", "os", "quem", "assunto", "responsavel", "situacao"],
  },
  {
    id: "objetos", funcao: "objetos", nome: "Objetos perdidos", singular: "objeto", operadorEdita: true,
    descricao: "Objetos esquecidos nos carros, do registro até a devolução.",
    campos: [
      { chave: "descricao", rotulo: "Objeto", tipo: "texto", obrigatorio: true },
      { chave: "os", rotulo: "Corrida (OS)", tipo: "texto" },
      { chave: "data", rotulo: "Data", tipo: "data", obrigatorio: true },
      { chave: "passageiro", rotulo: "Passageiro (nome e telefone)", tipo: "texto" },
      { chave: "motorista", rotulo: "Motorista", tipo: "texto" },
      { chave: "ondeEsta", rotulo: "Onde está", tipo: "texto" },
      { chave: "situacao", rotulo: "Situação", tipo: "selecao", opcoes: ["Procurando", "Com o motorista", "Na central", "Devolvido"], obrigatorio: true },
      { chave: "observacao", rotulo: "Observação", tipo: "textoLongo" },
    ],
    colunas: ["data", "descricao", "os", "passageiro", "motorista", "situacao"],
  },
  {
    id: "desafios", funcao: "desafios", nome: "Desafios", singular: "desafio",
    descricao: "Metas com prêmio para motoristas e recompensas por indicação.",
    chaveUnica: "nome",
    campos: [
      { chave: "nome", rotulo: "Nome", tipo: "texto", obrigatorio: true },
      { chave: "tipo", rotulo: "Tipo", tipo: "selecao", opcoes: ["Desafio de corridas", "Corridas pendentes aceitas", "Corridas maçaneta", "Indicação de motorista", "Indicação de passageiro"], obrigatorio: true },
      { chave: "meta", rotulo: "Meta (nº de corridas ou indicações)", tipo: "numero", obrigatorio: true },
      { chave: "premio", rotulo: "Prêmio", tipo: "dinheiro" },
      { chave: "inicio", rotulo: "Início", tipo: "data", obrigatorio: true },
      { chave: "fim", rotulo: "Fim", tipo: "data" },
      { chave: "horaInicio", rotulo: "Hora de início", tipo: "texto" },
      { chave: "horaFim", rotulo: "Hora final", tipo: "texto" },
      { chave: "categorias", rotulo: "Categorias", tipo: "texto", dica: "Vazio = todas." },
      { chave: "aprovacao", rotulo: "Aprovação da recompensa", tipo: "selecao", opcoes: ["Automático", "Manual"] },
      { chave: "corridasMin", rotulo: "Finalizaram no mínimo (corridas)", tipo: "numero" },
      { chave: "corridasMax", rotulo: "Finalizaram no máximo (corridas)", tipo: "numero" },
      { chave: "cancelado", rotulo: "Cancelado", tipo: "booleano" },
      { chave: "ativo", rotulo: "Ativo", tipo: "booleano" },
      { chave: "regras", rotulo: "Regras", tipo: "textoLongo" },
    ],
    colunas: ["nome", "tipo", "meta", "premio", "inicio", "fim", "ativo"],
  },
  {
    id: "notificacoes", funcao: "notificacoes", nome: "Notificações do app", singular: "notificação", operadorEdita: true,
    descricao: "Avisos que aparecem na caixa de notificações dos apps do passageiro e do motorista.",
    campos: [
      { chave: "titulo", rotulo: "Título", tipo: "texto", obrigatorio: true },
      { chave: "texto", rotulo: "Texto", tipo: "textoLongo", obrigatorio: true },
      { chave: "publico", rotulo: "Para quem", tipo: "selecao", opcoes: ["Todos", "Passageiros", "Motoristas"], obrigatorio: true },
      { chave: "inicio", rotulo: "Mostrar a partir de", tipo: "data" },
      { chave: "fim", rotulo: "Mostrar até", tipo: "data" },
      { chave: "ativa", rotulo: "Ativa", tipo: "booleano" },
    ],
    colunas: ["titulo", "publico", "inicio", "fim", "ativa"],
  },
];

export const cadastroPorId = (id: string) => CADASTROS.find((c) => c.id === id) ?? null;
export const cadastroDaFuncao = (funcao: string) => CADASTROS.find((c) => c.funcao === funcao) ?? null;
