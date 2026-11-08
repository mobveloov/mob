// Tipos comuns do motor. O painel só enxerga estes tipos: o modelo é o mesmo para Sistema A e Sistema B.
// O formato está descrito em docs/CONTRATO_MOTOR.md. Mudou aqui? Mude lá e avise o painel.
//
// Várias empresas: o motor NÃO guarda estado entre empresas. Cada chamada recebe a configuração da
// empresa (Empresa) com as integrações e credenciais dela. Nenhuma marca fica fixa no motor.

/** Tipo técnico da integração (usado em configuração e código). */
export type TipoIntegracao = "sistema-a" | "sistema-b";

/** Sistema de origem do dado, para mostrar e filtrar no painel. */
export type Origem = "sistema-a" | "sistema-b";

export const ORIGEM_DO_TIPO: Record<TipoIntegracao, Origem> = { "sistema-a": "sistema-a", "sistema-b": "sistema-b" };
export const NOME_DO_TIPO: Record<TipoIntegracao, string> = { "sistema-a": "Sistema A", "sistema-b": "sistema-b" };

// ---------------------------------------------------------------- empresas e credenciais

export interface CredenciaisSistemaA {
  apiKey: string;
  usuario: string;
  senha: string;
  /** Endereço da API de integração (termina em /api/v2/integracao). Obrigatório. */
  apiUrl?: string;
  /** Motivo usado quando o painel cancela sem escolher um. */
  motivoCancelamentoId?: number;
  /** Um ponto da cidade da empresa. A lista de categorias do Sistema A exige um local. */
  latPadrao?: number;
  lngPadrao?: number;
}

export interface CredenciaisSistemaB {
  /** Cookie PHPSESSID de uma sessão da empresa no painel do Sistema B. */
  cookie: string;
  /** Id da cidade no Sistema B (categorias, filtro e criar corrida). */
  cidadeId?: string;
  /** Endereço do painel web (pasta das páginas .php). Obrigatório. */
  painelUrl?: string;
  /** Endereço da API do app do passageiro (usado em categorias). */
  appApiUrl?: string;
}

export type Integracao =
  | { id: string; tipo: "sistema-a"; credenciais: Partial<CredenciaisSistemaA> }
  | { id: string; tipo: "sistema-b"; credenciais: Partial<CredenciaisSistemaB> };

/** Configuração de UMA empresa. Uma empresa pode ter Sistema A, Sistema B, os dois ou mais de uma de cada. */
export interface Empresa {
  id: string;
  integracoes: Integracao[];
}

// ---------------------------------------------------------------- modelo único

/** Situação da corrida, igual para os dois sistemas. */
export type StatusCorrida =
  | "distribuindo" // procurando motorista
  | "pendente" // ninguém aceitou ainda; esperando a central
  | "em_espera" // na fila (motorista termina outra corrida antes)
  | "aceita" // motorista a caminho do embarque
  | "no_local" // motorista chegou no embarque
  | "em_andamento" // passageiro a bordo
  | "aguardando_pagamento"
  | "finalizada"
  | "cancelada"
  | "nao_atendida"
  | "agrupada" // só Sistema A: juntada a outra corrida
  | "desconhecido";

/** Agrupamento simples, útil para filtros e contagens. */
export type GrupoStatus = "aberta" | "finalizada" | "cancelada" | "nao_atendida";

export type FormaPagamento = "dinheiro" | "pix" | "cartao_app" | "cartao_maquina" | "carteira" | "voucher" | "faturado" | "outro";

export interface Endereco {
  texto: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  lat?: number;
  lng?: number;
}

export interface Pessoa {
  id?: string;
  nome?: string;
  telefone?: string;
}

export interface Veiculo {
  modelo?: string;
  placa?: string;
  cor?: string;
}

/** Dado que não veio, com o motivo. Nada some em silêncio. */
export interface SemDado {
  campo: string;
  motivo: string;
  /** true = o sistema de origem nunca fornece este dado; false = só faltou nesta corrida. */
  doSistema: boolean;
}

export interface Corrida {
  /** "<id da integração>:<id original>", ex.: "sistema-a:785954409". */
  id: string;
  integracaoId: string;
  tipo: TipoIntegracao;
  origem: Origem;
  idOriginal: string;
  status: StatusCorrida;
  grupo: GrupoStatus;
  /** Código como o sistema manda (ex.: "F" no Sistema A, "4" no Sistema B). */
  statusOriginal: string;
  /** Texto pronto para mostrar ("Finalizada", "Cancelada pelo motorista"...). */
  statusTexto: string;
  canceladaPor?: "passageiro" | "motorista" | "central";
  motivoCancelamento?: string;
  /** Datas em ISO 8601 com fuso (Sistema A: UTC "Z"; Sistema B: horário de Brasília "-03:00"). */
  solicitadaEm?: string;
  aceitaEm?: string;
  chegadaEm?: string;
  iniciadaEm?: string;
  finalizadaEm?: string;
  canceladaEm?: string;
  passageiro: Pessoa;
  motorista?: Pessoa;
  veiculo?: Veiculo;
  partida: Endereco;
  destino?: Endereco;
  paradas: Endereco[];
  categoria?: { id?: string; nome: string };
  pagamento: FormaPagamento;
  pagamentoOriginal?: string;
  /** Valores em reais. */
  valor?: number;
  valorSemDesconto?: number;
  distanciaKm?: number;
  duracaoMin?: number;
  /** Distância do motorista até o embarque no momento do aceite. */
  distanciaMotoristaKm?: number;
  /** Nome da tarifa aplicada. */
  tarifa?: string;
  cupom?: string;
  descontoPct?: number;
  descontoValor?: number;
  /** Nota que o passageiro deu ao motorista (1 a 5). */
  avaliacao?: { nota: number; comentario?: string };
  dinamica?: { ativa: boolean; fator?: number; descricao?: string };
  /** Atendente da central que lançou a corrida. */
  operador?: string;
  /** true quando a corrida foi agendada. */
  programada: boolean;
  /** "app", "macaneta", "central"... quando o sistema informa. */
  canal?: string;
  observacao?: string;
  linkAcompanhamento?: string;
  /** Campos que faltam nesta corrida e por quê. */
  semDado: SemDado[];
  /** Resposta original, para quem precisar de um campo que o motor ainda não traduz. */
  bruto: unknown;
}

export interface FiltroCorridas {
  /** ISO 8601. Sem "de", o padrão é as últimas 24 horas. */
  de?: string;
  ate?: string;
  status?: StatusCorrida[];
  motoristaId?: string;
  pagina?: number; // começa em 1
  limite?: number; // padrão 50
}

/** Uma integração que não respondeu (as outras vêm normalmente). */
export interface Aviso {
  integracaoId: string;
  origem: Origem;
  codigo: string;
  mensagem: string;
}

export interface Pagina<T> {
  itens: T[];
  pagina: number;
  /** true quando pode haver mais itens na próxima página. */
  temMais: boolean;
  total?: number;
  avisos?: Aviso[];
}

export interface Motorista {
  id: string; // "<integração>:<id>"
  integracaoId: string;
  tipo: TipoIntegracao;
  origem: Origem;
  idOriginal: string;
  nome: string;
  telefone?: string;
  cpf?: string;
  ativo: boolean;
  online?: boolean;
  avaliacao?: number;
  categorias: string[];
  veiculo?: Veiculo;
  semDado: SemDado[];
  bruto: unknown;
}

export interface FiltroMotoristas {
  busca?: string; // nome, telefone ou CPF
  pagina?: number;
  limite?: number;
}

export interface Categoria {
  id: string; // "<integração>:<id>"
  integracaoId: string;
  tipo: TipoIntegracao;
  origem: Origem;
  idOriginal: string;
  nome: string;
  descricao?: string;
  tarifa?: { base?: number; km?: number; minuto?: number; minima?: number };
  semDado: SemDado[];
  bruto: unknown;
}

export interface NovaCorrida {
  passageiro: { nome: string; telefone: string }; // telefone com DDD, só números ou +55...
  partida: Endereco;
  destino?: Endereco;
  /** Id original da categoria ou o id do motor ("sistema-a:71"). */
  categoriaId?: string;
  pagamento: FormaPagamento;
  observacao?: string;
  /** Seu identificador, para achar a corrida depois. */
  idExterno?: string;
  /** Só Sistema B: valor combinado (o Sistema B deixa a central definir). */
  valor?: number;
}

export interface CorridaCriada {
  id: string;
  integracaoId: string;
  origem: Origem;
  idOriginal: string;
  valor?: number;
  bruto: unknown;
}

export type TipoEvento = "status" | "posicao" | "mensagem" | "parada";

export interface Evento {
  tipo: TipoEvento;
  integracaoId: string;
  origem: Origem;
  /** Id da corrida no motor ("sistema-a:123"), quando o evento é de uma corrida. */
  corridaId?: string;
  em: string; // ISO 8601
  status?: StatusCorrida;
  statusAnterior?: StatusCorrida;
  posicao?: { lat: number; lng: number; motoristaId?: string };
  mensagem?: { texto: string; de?: string };
  /** Id do evento no sistema, para não processar duas vezes. */
  idEvento?: string;
  /** Só em status "cancelada": true = a mesma corrida volta para a distribuição (não abra outra). */
  reabre?: boolean;
  bruto: unknown;
}

// ---------------------------------------------------------------- funções extras (v3)

/** Base comum de tudo que vem de um sistema. */
export interface DoSistema {
  /** "<integração>:<id original>" */
  id: string;
  integracaoId: string;
  origem: Origem;
  idOriginal: string;
  semDado: SemDado[];
  bruto: unknown;
}

export interface PedidoEstimativa {
  partida: Endereco;
  destino?: Endereco;
  /** Sem categoria: estima todas as categorias. */
  categoriaId?: string;
}

export interface Estimativa {
  integracaoId: string;
  origem: Origem;
  categoriaId?: string;
  categoria?: string;
  valor?: number;
  valorSemDesconto?: number;
  distanciaKm?: number;
  duracaoMin?: number;
  tarifa?: string;
  dinamica?: { ativa: boolean; fator?: number };
  bruto: unknown;
}

export interface Programada extends DoSistema {
  statusTexto: string;
  statusOriginal: string;
  /** Quando a corrida vai sair (ISO 8601). */
  agendadaPara?: string;
  passageiro: Pessoa;
  partida: Endereco;
  destino?: Endereco;
  categoria?: string;
  pagamento?: string;
  valorEstimado?: number;
  observacao?: string;
  /** Id da corrida gerada, quando já foi despachada. */
  corridaId?: string;
}

export interface PosicaoMotorista {
  integracaoId: string;
  origem: Origem;
  motoristaId: string; // "<integração>:<id>"
  nome?: string;
  lat: number;
  lng: number;
  em?: string;
  livre?: boolean;
  inativo?: boolean;
}

export interface Rastreio {
  corridaId: string;
  motoristaId?: string;
  lat?: number;
  lng?: number;
  /** false quando o sistema não tem a posição agora (motivo em `motivo`). */
  disponivel: boolean;
  motivo?: string;
}

export interface LinhaDoTempo {
  corridaId: string;
  eventos: { em?: string; texto: string }[];
  /** Ofertas da corrida aos motoristas (o "raio-x"). */
  ofertas: { motorista?: string; placa?: string; distanciaKm?: number; etapa?: string; resultado: "aceitou" | "recusou" | "tentou" | "sem_resposta" }[];
  semDado: SemDado[];
  bruto: unknown;
}

export interface MensagemCorrida {
  em?: string;
  de: "passageiro" | "motorista" | "central" | "outro";
  nome?: string;
  texto: string;
  midiaUrl?: string;
}

export interface Passageiro extends DoSistema {
  nome: string;
  telefone?: string;
  email?: string;
  cpf?: string;
  ativo: boolean;
  avaliacao?: number;
  corridasFinalizadas?: number;
  ultimaCorridaEm?: string;
  cadastradoEm?: string;
  origemCadastro?: string;
  aparelho?: string;
}

export interface Conveniada extends DoSistema {
  nome: string;
  documento?: string;
  telefone?: string;
  cidade?: string;
  ativa: boolean;
  funcionarios?: number;
  categorias: string[];
}

export interface Lancamento {
  integracaoId: string;
  origem: Origem;
  em?: string;
  valor: number;
  pessoa?: { tipo: string; nome?: string };
  operacao: string;
  descricao?: string;
  estornado: boolean;
  bruto: unknown;
}

export interface Carteira extends DoSistema {
  tipoPessoa: "motorista" | "passageiro" | "empresa" | "outro";
  nome: string;
  telefone?: string;
  saldo: number;
}

export interface Cupom extends DoSistema {
  codigo: string;
  descricao?: string;
  ativo: boolean;
  tipoDesconto: "percentual" | "valor";
  desconto?: number;
  inicio?: string;
  fim?: string;
  usos?: number;
  limiteTotal?: number;
  limitePorPessoa?: number;
  valorMinimoCorrida?: number;
  valorMaximoDesconto?: number;
}

export interface Dinamica extends DoSistema {
  nome: string;
  ativa: boolean;
  /** Onde ou quando vale: área, horário, demanda... */
  tipo: string;
  fator?: number;
  adicional?: number;
}

export interface Punicao extends DoSistema {
  motorista: Pessoa & { email?: string };
  motivo?: string;
  inicio?: string;
  ate?: string;
  situacao: "ativa" | "concluida" | "revogada" | "desconhecida";
  automatica?: boolean;
}

export interface Area extends DoSistema {
  nome: string;
}

export interface VeiculoCadastro extends DoSistema {
  placa?: string;
  modelo?: string;
  ano?: string;
  cor?: string;
  emUso: boolean;
  motorista?: Pessoa;
}

export interface FiltroLista {
  busca?: string;
  pagina?: number;
  limite?: number;
  /** ISO 8601, para listas com data (extrato). */
  de?: string;
  ate?: string;
}

// ---------------------------------------------------------------- capacidades

/** Funções que o painel pode pedir. */
export type Funcao =
  | "listarCorridas"
  | "detalharCorrida"
  | "criarCorrida"
  | "cancelarCorrida"
  | "motoristas"
  | "categorias"
  | "webhook"
  | "observador"
  | "estimativa"
  | "programadas"
  | "posicoes"
  | "rastreio"
  | "linhaDoTempo"
  | "chat"
  | "passageiros"
  | "conveniadas"
  | "extrato"
  | "carteiras"
  | "cupons"
  | "dinamicas"
  | "punicoes"
  | "areas"
  | "veiculos"
  | "ocorrencias"
  | "objetosPerdidos"
  | "pagamentosPendentes"
  | "notificacoes";

export interface Capacidade {
  disponivel: boolean;
  /** Por que não está disponível, ou observação importante quando está. */
  motivo?: string;
}

/** O que cada plataforma (Sistema A, Sistema B) precisa saber fazer. */
export interface Adaptador {
  integracaoId: string;
  tipo: TipoIntegracao;
  origem: Origem;
  nome: string;
  configurado(): boolean;
  /** O que falta configurar, em português simples. Lista vazia = pronto. */
  pendencias(): string[];
  capacidades(): Record<Funcao, Capacidade>;
  listarCorridas(f?: FiltroCorridas): Promise<Pagina<Corrida>>;
  detalharCorrida(idOriginal: string): Promise<Corrida>;
  criarCorrida(n: NovaCorrida): Promise<CorridaCriada>;
  cancelarCorrida(idOriginal: string, motivo?: string): Promise<void>;
  motoristas(f?: FiltroMotoristas): Promise<Pagina<Motorista>>;
  categorias(): Promise<Categoria[]>;
  /** Traduz o corpo de um webhook recebido. Lança NAO_SUPORTADO onde não existe (Sistema B). */
  lerWebhook(corpo: string, cabecalhos?: Record<string, string | undefined>): Evento[];
  // Funções extras: onde o sistema não tem, lançam NAO_SUPORTADO com o motivo (o mesmo de capacidades()).
  estimarCorrida(p: PedidoEstimativa): Promise<Estimativa[]>;
  programadas(f?: FiltroLista): Promise<Pagina<Programada>>;
  posicoesMotoristas(): Promise<PosicaoMotorista[]>;
  rastrearCorrida(idOriginal: string): Promise<Rastreio>;
  linhaDoTempo(idOriginal: string): Promise<LinhaDoTempo>;
  mensagensCorrida(idOriginal: string): Promise<MensagemCorrida[]>;
  passageiros(f?: FiltroLista): Promise<Pagina<Passageiro>>;
  conveniadas(f?: FiltroLista): Promise<Pagina<Conveniada>>;
  extrato(f?: FiltroLista): Promise<Pagina<Lancamento>>;
  carteiras(f?: FiltroLista): Promise<Pagina<Carteira>>;
  cupons(f?: FiltroLista): Promise<Pagina<Cupom>>;
  dinamicas(): Promise<Dinamica[]>;
  punicoes(f?: FiltroLista): Promise<Pagina<Punicao>>;
  areas(): Promise<Area[]>;
  veiculos(f?: FiltroLista): Promise<Pagina<VeiculoCadastro>>;
}

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface OpcoesRede {
  /** fetch a usar (padrão: o global). Os testes passam um fetch falso. */
  fetch?: FetchLike;
  /** Tempo máximo de cada chamada, em ms (padrão 30000). */
  timeoutMs?: number;
}
