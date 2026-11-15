// Tipos do bot de WhatsApp. Cada empresa tem o próprio número (instância) e as próprias conversas.

export type Etapa =
  | "inicio" | "menu" | "embarque" | "numero_embarque" | "destino" | "numero_destino" | "confirmar" | "categoria" | "pagamento"
  | "criando" | "em_corrida" | "avaliacao" | "suporte";

export interface Local { texto: string; lat?: number; lng?: number }

export interface Mensagem {
  de: "passageiro" | "bot" | "operador";
  texto: string;
  em: string;
  /** Nome do operador que respondeu. */
  autor?: string;
}

export interface CategoriaBot {
  id: string; nome: string; descricao?: string;
  /** Preço pela tarifa da categoria. */
  preco?: number;
  /** true = preço calculado pela distância; false = só a tarifa mínima/bandeirada. */
  estimado?: boolean;
}

/** Corrida própria do painel ligada à conversa. */
export interface CorridaBot {
  id: string; os: string;
  status: string; grupo: "aberta" | "finalizada" | "cancelada" | "nao_atendida";
  criadaEm: string; valor?: number; motorista?: string;
  nota?: number;
}

export interface Rascunho {
  embarque?: Local; destino?: Local; semDestino?: boolean;
  categorias?: CategoriaBot[]; categoria?: CategoriaBot; pagamento?: string;
  /** Pedido urgente: só pergunta o embarque e chama o carro (sem destino, categoria nem pagamento). */
  urgente?: boolean;
  /** Endereços salvos oferecidos na pergunta do embarque (na ordem das opções). */
  salvos?: Local[];
}

/** Endereço de embarque que o passageiro já usou (o bot oferece os mais usados). */
export interface EnderecoUsado { texto: string; lat?: number; lng?: number; usos: number; em: string }

export interface Conversa {
  /** Telefone só com dígitos (é o id da conversa dentro da empresa). */
  id: string;
  nome: string;
  etapa: Etapa;
  rascunho: Rascunho;
  corrida?: CorridaBot;
  /** Corridas anteriores (as últimas). */
  historico: CorridaBot[];
  mensagens: Mensagem[];
  /** Ids das mensagens já recebidas (para não processar duas vezes). */
  vistas: string[];
  naoLidas: number;
  /** Central bloqueou (#bloquear): o contato não pede corrida pelo bot. */
  bloqueado?: boolean;
  /** Central pausou o bot (#pausar) até esta hora (ISO). */
  pausadoAte?: string;
  /** Última vez que a imagem de saudação foi enviada (no máximo uma a cada 12 h). */
  imagemEm?: string;
  /** Conexão (número) por onde o passageiro escreveu; as respostas saem por ela. */
  conexao?: string;
  /** Embarques já usados em corridas pedidas pelo bot (os mais usados viram opções). */
  enderecos?: EnderecoUsado[];
  criadaEm: string;
  atualizadaEm: string;
}

export type TipoProvedor = "evolution" | "zapi" | "zpro" | "meta" | "simulado";
export const TIPOS_PROVEDOR: TipoProvedor[] = ["evolution", "zapi", "zpro", "meta", "simulado"];

/** Uma conexão de WhatsApp da empresa (número). A principal usa o provedor e a instância do topo da config. */
export interface ConexaoBot {
  id: string; nome: string; ativa: boolean;
  provedor: TipoProvedor; instancia: string;
  /** Meta: o phone number id (não é segredo). */
  phoneId?: string;
}
export const ID_PRINCIPAL = "principal";

/** Etapas do fluxo (todas ligadas por padrão). Mesmos nomes do sistema de referência. */
export interface FluxoBot {
  show_welcome_menu: boolean; ask_destination: boolean; allow_skip_destination: boolean;
  confirm_address: boolean; ask_category: boolean; ask_payment: boolean;
}
export const FLUXO_PADRAO: FluxoBot = { show_welcome_menu: true, ask_destination: true, allow_skip_destination: true, confirm_address: true, ask_category: true, ask_payment: true };

export interface ConfigBot {
  ativo: boolean;
  /** Etapas do fluxo que o bot executa. */
  fluxo: FluxoBot;
  /** Textos trocados pela empresa (Bot de WhatsApp › Mensagens). Só chaves conhecidas. */
  textos: Record<string, string>;
  /** Imagem de saudação (antes do menu, no máximo uma a cada 12 h por passageiro). */
  saudacao: { imageUrl: string; caption: string };
  /** Respostas prontas para perguntas ("aceita pet?"). */
  faq: Array<{ question: string; keywords: string[]; answer: string }>;
  /** Palavras que a central digita no WhatsApp do bot (#bloquear, #pausar...). */
  controle: { blockWord: string; unblockWord: string; pauseWord: string; resumeWord: string; pauseMinutes: number };
  /** Textos das mensagens de status da corrida trocados pela empresa. */
  textosStatus: Record<string, string>;
  provedor: TipoProvedor;
  /** Nome da instância no provedor (única por empresa). No servidor da plataforma é sempre bot-<empresa>. */
  instancia: string;
  /** Outros números da empresa (além do principal). Cada um com a própria instância e os próprios segredos. */
  conexoes: ConexaoBot[];
}

/** Mensagem recebida do provedor, já traduzida. */
export interface Recebida {
  id: string;
  telefone: string;
  nome?: string;
  texto?: string;
  local?: Local;
  /** Áudio recebido. Sem texto, o bot transcreve (quando há chave) e segue como se fosse digitado. */
  audio?: AudioRecebido;
  /** Conexão (número) por onde a mensagem chegou. */
  conexao?: string;
  /** Mensagem digitada pela central no próprio WhatsApp do bot (comandos #bloquear, #pausar...). */
  daCentral?: boolean;
}

export interface AudioRecebido {
  /** Endereço do arquivo (Z-API) ou id da mídia (Meta, Evolution). */
  url?: string; id?: string; base64?: string; mimetype: string;
  /** Texto já pronto (modo simulado / testes). */
  transcricao?: string;
}

export type SituacaoConexao = "conectado" | "aguardando_qr" | "desconectado" | "nao_configurado" | "erro";
