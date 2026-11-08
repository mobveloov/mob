// Tipos do CRM. Servem ao servidor e às telas (as telas importam só tipos daqui).

export type TipoPublico = "passageiro" | "motorista";

/** Uma pessoa do público: cadastro da empresa + corridas (próprias e das integrações opcionais). */
export interface Contato {
  /** Chave estável: telefone (só dígitos) ou, sem telefone, o nome. Prefixo "p:" ou "m:". */
  chave: string;
  tipo: TipoPublico;
  nome: string;
  telefone: string;
  cidade: string;
  /** Situação no cadastro ("Ativo", "Bloqueado"...). Vazio = só nas corridas. */
  situacao: string;
  noCadastro: boolean;
  corridas: number;
  finalizadas: number;
  canceladas: number;
  gasto: number;
  ultimaCorrida: string | null;
  diasSemCorrida: number | null;
  /** Grupo da última corrida (para o gatilho "cancelou"). */
  ultimoGrupo: string;
  categorias: string[];
  canais: string[];
  origens: string[];
  /** Não quer receber mensagens. */
  optOut: boolean;
}

/** Regras de um segmento. Campo vazio = não filtra. */
export interface Regras {
  tipo: TipoPublico;
  cidades?: string[];
  /** Sem corrida há pelo menos X dias. */
  inativoMinDias?: number;
  /** Sem corrida há no máximo X dias. */
  inativoMaxDias?: number;
  corridasMin?: number;
  corridasMax?: number;
  categorias?: string[];
  canais?: string[];
  /** Só quem está nesta lista. */
  listaId?: string;
  busca?: string;
}

/** Lista salva. "fixa" guarda as pessoas do momento; "dinamica" (segmento) recalcula as regras a cada uso. */
export interface Lista {
  id: string;
  nome: string;
  modo: "fixa" | "dinamica";
  regras: Regras;
  chaves: string[];
  criadaEm: string;
  atualizadaEm: string;
}

export type EstadoCampanha = "rascunho" | "agendada" | "enviando" | "pausada" | "concluida" | "cancelada";

export interface Campanha {
  id: string;
  nome: string;
  canal: "whatsapp";
  publico: Regras;
  texto: string;
  /** Variações do texto (uma por pessoa, sorteada de forma fixa). O texto principal também entra no sorteio. */
  variacoes: string[];
  cupom: string;
  /** ISO no horário de Brasília (campos UTC), como as corridas. */
  agendadaPara: string | null;
  estado: EstadoCampanha;
  criadaEm: string;
  atualizadaEm: string;
  disparadaEm: string | null;
  concluidaEm: string | null;
  /** Total na hora do disparo. */
  destinatarios: number;
}

export type TipoGatilho = "sem-corrida" | "cancelou";

export interface Jornada {
  id: string;
  nome: string;
  ativa: boolean;
  gatilho: { tipo: TipoGatilho; dias: number };
  publico: Regras;
  texto: string;
  cupom: string;
  criadaEm: string;
  atualizadaEm: string;
  ultimaRodada: string | null;
}

export type EstadoItem = "pendente" | "enviado" | "falha" | "cancelado";

/** Uma mensagem na fila de envio da empresa. */
export interface ItemFila {
  id: string;
  origem: { tipo: "campanha" | "jornada" | "teste"; id: string };
  chave: string;
  nome: string;
  telefone: string;
  texto: string;
  estado: EstadoItem;
  tentativas: number;
  criadoEm: number;
  /** Não tentar antes disto (ms). */
  proximaEm: number;
  enviadoEm: number | null;
  erro: string;
}

export interface ConfigEnvio {
  provedor: "simulado" | "evolution";
  /** Mensagens por lote. 0 = sem lote (só o limite por minuto). */
  lote: number;
  pausaMinMin: number;
  pausaMaxMin: number;
  limitePorMinuto: number;
  /** Dias de corridas usados para montar o público. */
  diasHistorico: number;
}

export const CONFIG_PADRAO: ConfigEnvio = { provedor: "simulado", lote: 20, pausaMinMin: 5, pausaMaxMin: 10, limitePorMinuto: 20, diasHistorico: 90 };

/** Variáveis aceitas no texto. */
export const VARIAVEIS = ["nome", "primeiro_nome", "cidade", "cupom", "empresa", "dias_sem_corrida", "corridas"] as const;
