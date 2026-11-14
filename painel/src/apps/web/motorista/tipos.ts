// Formatos que o servidor manda para o app do motorista (contrato em docs/APPS_API.md).
// Os campos novos da versão 2 são opcionais: o app funciona com o servidor antigo e com o novo.

import { hora } from "../comum/api";

export interface Ponto { texto: string; lat?: number; lng?: number }
export interface Estimativa { valor: number | null; distanciaKm: number | null; minutos: number | null }

export interface PassageiroCorrida { nome: string; telefone: string; foto?: string | null; nota?: number | null; corridas?: number | null }

export interface Corrida {
  id: string; os: string; status: string; statusTexto: string; aberta: boolean; embarque: Ponto; destino: Ponto | null; categoria: string; pagamento: string; observacao: string;
  estimativa: Estimativa; valor: number | null; desconto: number | null; solicitadaEm: string; iniciadaEm?: string | null; finalizadaEm: string | null;
  passageiro: PassageiroCorrida;
  paradas?: Ponto[]; agendadaPara?: string | null;
  avaliacaoPassageiro?: { nota: number; comentario: string } | null; taxaCancelamento?: number | null;
  valorOferecido?: number | null; opcionais?: string[]; canal?: string; modo?: "taximetro" | "destino"; distanciaPercorridaKm?: number | null;
}

export interface DadosChamada {
  id: string; os: string; embarque: Ponto; destino: Ponto | null; categoria: string; pagamento: string; observacao: string; estimativa: Estimativa;
  passageiro: string | { nome: string; nota?: number | null }; paradas?: Ponto[]; agendadaPara?: string | null;
  valorOferecido?: number | null; opcionais?: string[]; nota?: number | null; viagens?: number | null;
  /** Calculados no servidor: bruto (o que o passageiro paga), taxa da central e líquido (o que o motorista recebe). */
  valorBruto?: number | null; taxaCentral?: number | null; valorLiquido?: number | null; ganhoPorKm?: number | null;
  tabelaLiquido?: Array<{ valor: number; bruto: number; taxa: number; liquido: number }>;
  minutosAteEmbarque?: number | null; distanciaViagemKm?: number | null;
}
export interface Oferta { id: string; expira: number; segundos: number; distanciaKm: number | null; corrida: DadosChamada }

/** Corrida das abas Disp., Pend. e Prog. */
export interface CorridaAberta extends Partial<Omit<DadosChamada, "id" | "embarque">> {
  id: string; embarque: Ponto; distanciaKm?: number | null; status?: string; statusTexto?: string; solicitadaEm?: string;
}
export interface CorridasAbertas { disponiveis: CorridaAberta[]; pendentes: CorridaAberta[]; programadas: CorridaAberta[] }

export interface Eu {
  nome: string; telefone: string; veiculo: string; placa: string; categorias: string; validadeCnh: string | null; validadeLicenciamento: string | null;
  foto?: string | null; email?: string; genero?: string; situacao?: string; aprovado?: boolean; pendencias?: string[]; nota?: number | null;
}

export interface Veiculo { id: string; modelo: string; placa: string; cor: string; ano: string | number; cnh?: string; validadeCnh?: string; ativo: boolean; situacao?: string }

/** Valor que vale para o motorista: o oferecido pelo passageiro ou a estimativa. */
export const valorDe = (c: { valorOferecido?: number | null; estimativa?: Estimativa | null }) => c.valorOferecido ?? c.estimativa?.valor ?? null;
export const nomePassageiro = (p: DadosChamada["passageiro"] | undefined) => (typeof p === "string" ? p : p?.nome ?? "Passageiro");
export const notaPassageiro = (c: Partial<DadosChamada>) => c.nota ?? (typeof c.passageiro === "object" ? c.passageiro?.nota : null) ?? null;

/** "08/11 14:30" (o servidor guarda no horário de Brasília). */
export const diaHora = (iso: string | null | undefined) => hora(iso ?? null).replace(",", "");
/** "14:30" */
export const soHora = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" }) : "");
export const iniciais = (nome: string) => nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
export const temPosicao = (p: Ponto | null | undefined): p is Ponto & { lat: number; lng: number } => !!p && p.lat != null && p.lng != null;

/** Distância em km entre dois pontos (linha reta). */
export function distanciaKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
export const distanciaTexto = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1).replace(".", ",")} km`);
