// Corrida como o painel usa (telas, filtros e análise). Vem do motor (motor/src/tipos.ts) já traduzida,
// de um CSV importado ou dos dados de exemplo. A tela não sabe de qual sistema veio, só pela etiqueta "origem".
//
// Horário: TODAS as datas guardam o HORÁRIO DE BRASÍLIA nos campos UTC (ex.: 04/11 10:43 -> "2026-11-04T10:43:00Z").
// Mostre sempre com timeZone "UTC". Assim ninguém erra o fuso.

export type GrupoStatus = "aberta" | "finalizada" | "cancelada" | "nao_atendida";

export interface CorridaPainel {
  id: string;
  /** Etiqueta de origem: id da integração da empresa (ex.: "principal", "arquivo", "exemplo"). */
  origem: string;
  /** Nome amigável da integração, definido pela empresa. */
  origemNome: string;
  os: string;
  grupo: GrupoStatus;
  statusTexto: string;
  solicitadaEm: string | null;
  iniciadaEm: string | null;
  finalizadaEm: string | null;
  cidade: string;
  categoria: string;
  pagamento: string;
  canal: string;
  tarifa: string;
  motorista: string;
  telefoneMotorista: string;
  passageiro: string;
  telefonePassageiro: string;
  embarque: string;
  destino: string;
  observacao: string;
  valor: number | null;
  valorSemDesconto: number | null;
  valorEstimado: number | null;
  desconto: number | null;
  cupom: string;
  distanciaKm: number | null;
  distanciaRealKm: number | null;
  distanciaMotoristaKm: number | null;
  fatorDinamico: number | null;
  avaliacao: number | null;
  canceladaPor: string;
  motivoCancelamento: string;
  operador: string;
  programada: boolean;
}

export interface Filtro {
  inicio?: string; // AAAA-MM-DD
  fim?: string;
  ultimasHoras?: number;
  os?: string;
  busca?: string;
  grupo?: GrupoStatus;
  cidade?: string;
  categoria?: string;
  pagamento?: string;
  canal?: string;
  origem?: string;
  programada?: boolean;
}

export const GRUPO_TEXTO: Record<GrupoStatus, string> = {
  finalizada: "Finalizada", cancelada: "Cancelada", nao_atendida: "Não atendida", aberta: "Em andamento",
};

/** Corrida vazia com os campos obrigatórios (para quem monta corridas a partir de fontes incompletas). */
export function corridaVazia(base: Pick<CorridaPainel, "id" | "origem" | "origemNome" | "os" | "grupo" | "statusTexto">): CorridaPainel {
  return {
    ...base, solicitadaEm: null, iniciadaEm: null, finalizadaEm: null, cidade: "", categoria: "", pagamento: "", canal: "", tarifa: "",
    motorista: "", telefoneMotorista: "", passageiro: "", telefonePassageiro: "", embarque: "", destino: "", observacao: "",
    valor: null, valorSemDesconto: null, valorEstimado: null, desconto: null, cupom: "", distanciaKm: null, distanciaRealKm: null,
    distanciaMotoristaKm: null, fatorDinamico: null, avaliacao: null, canceladaPor: "", motivoCancelamento: "", operador: "", programada: false,
  };
}
