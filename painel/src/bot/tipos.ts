// Tipos do bot de WhatsApp. Cada empresa tem o próprio número (instância) e as próprias conversas.

export type Etapa =
  | "inicio" | "menu" | "embarque" | "destino" | "confirmar" | "categoria" | "pagamento"
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
}

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
  criadaEm: string;
  atualizadaEm: string;
}

export type TipoProvedor = "evolution" | "simulado";

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
}

/** Mensagem recebida do provedor, já traduzida. */
export interface Recebida {
  id: string;
  telefone: string;
  nome?: string;
  texto?: string;
  local?: Local;
  /** Mensagem digitada pela central no próprio WhatsApp do bot (comandos #bloquear, #pausar...). */
  daCentral?: boolean;
}

export type SituacaoConexao = "conectado" | "aguardando_qr" | "desconectado" | "nao_configurado" | "erro";
