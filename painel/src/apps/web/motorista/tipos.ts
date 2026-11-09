// Formatos que o servidor manda para o app do motorista.

import { hora } from "../comum/api";

export interface Ponto { texto: string; lat?: number; lng?: number }
export interface Estimativa { valor: number | null; distanciaKm: number | null; minutos: number | null }
export interface Corrida {
  id: string; os: string; status: string; statusTexto: string; aberta: boolean; embarque: Ponto; destino: Ponto | null; categoria: string; pagamento: string; observacao: string;
  estimativa: Estimativa; valor: number | null; desconto: number | null; solicitadaEm: string; finalizadaEm: string | null;
  passageiro: { nome: string; telefone: string };
  paradas?: Ponto[]; agendadaPara?: string | null;
  avaliacaoPassageiro?: { nota: number; comentario: string } | null; taxaCancelamento?: number | null;
}
export interface Oferta {
  id: string; expira: number; segundos: number; distanciaKm: number | null;
  corrida: { id: string; os: string; embarque: Ponto; destino: Ponto | null; categoria: string; pagamento: string; observacao: string; estimativa: Estimativa; passageiro: string; paradas?: Ponto[]; agendadaPara?: string | null };
}
export interface Eu { nome: string; telefone: string; veiculo: string; placa: string; categorias: string; validadeCnh: string | null; validadeLicenciamento: string | null }

/** "08/11 14:30" (o servidor guarda no horário de Brasília). */
export const diaHora = (iso: string | null | undefined) => hora(iso ?? null).replace(",", "");

/** Abre o app de mapas do aparelho com o endereço (link geo:, qualquer app de navegação). */
export function linkNavegar(p: Ponto) {
  if (p.lat != null && p.lng != null) return `geo:${p.lat},${p.lng}?q=${p.lat},${p.lng}(${encodeURIComponent(p.texto)})`;
  return `geo:0,0?q=${encodeURIComponent(p.texto)}`;
}
