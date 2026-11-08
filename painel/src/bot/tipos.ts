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
  criadaEm: string;
  atualizadaEm: string;
}

export type TipoProvedor = "evolution" | "simulado";

export interface ConfigBot {
  ativo: boolean;
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
}

export type SituacaoConexao = "conectado" | "aguardando_qr" | "desconectado" | "nao_configurado" | "erro";
