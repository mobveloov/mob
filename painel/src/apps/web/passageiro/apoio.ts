// Tipos e funções de apoio do app do passageiro (horário de Brasília, link de compartilhar, estimativa com paradas).

import { api, hora, urlApi } from "../comum/api";

export interface Ponto { texto: string; lat?: number; lng?: number }
export interface Corrida {
  id: string; os: string; status: string; statusTexto: string; aberta: boolean; embarque: Ponto; destino: Ponto | null; categoria: string; pagamento: string;
  estimativa: { valor: number | null; distanciaKm: number | null; minutos: number | null }; valor: number | null; desconto: number | null; avaliacao: number | null;
  solicitadaEm: string; finalizadaEm?: string | null; canceladaPor?: string | null;
  motorista: { nome: string; veiculo: string; placa: string; telefone: string } | null;
  paradas?: Ponto[]; agendadaPara?: string | null; comentario?: string; taxaCancelamento?: number | null; compartilhar?: string | null; motoristaId?: string | null;
}
export interface Eu { nome: string; telefone: string }
export interface Endereco { texto: string; lat: number; lng: number }
export interface Categoria { nome: string; descricao: string; aPartirDe: number | null }
export interface Perfil { email: string; codigo: string; indicadoPor: string; favoritos?: string[]; bloqueados?: string[] }

/** Agora no horário de Brasília, no formato "AAAA-MM-DDTHH:MM" (o mesmo que o servidor usa no agendamento). */
export function agoraBrasilia(somarMinutos = 0) {
  return new Date(Date.now() - 3 * 3600_000 + somarMinutos * 60_000).toISOString().slice(0, 16);
}

/** "AAAA-MM-DDTHH:MM" → "25/12 às 14:30". */
export function quandoAgendada(s: string | null | undefined) {
  if (!s) return "";
  return `${s.slice(8, 10)}/${s.slice(5, 7)} às ${s.slice(11, 16)}`;
}

/** A corrida ainda está esperando o horário marcado (não procura motorista antes da hora). */
export const esperandoHorario = (c: Corrida) => c.status === "procurando" && !!c.agendadaPara && c.agendadaPara > agoraBrasilia();

/** Data curta: só dia ("AAAA-MM-DD") ou dia e hora. */
export function dataCurta(s: string | null | undefined) {
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
  return hora(s);
}

/** Link público para a família acompanhar a viagem. */
export function linkPublico(compartilhar: string) {
  return new URL(urlApi(`/${compartilhar}`), location.href).href;
}

/** Abre o compartilhar do aparelho ou copia o texto. Devolve "copiado" quando copiou. */
export async function compartilharTexto(texto: string, url?: string): Promise<"compartilhado" | "copiado" | "nada"> {
  try {
    if (navigator.share) { await navigator.share(url ? { text: texto, url } : { text: texto }); return "compartilhado"; }
    await navigator.clipboard.writeText(url ? `${texto} ${url}` : texto);
    return "copiado";
  } catch { return "nada"; }
}

interface Est { valor: number | null; distanciaKm: number | null; minutos: number | null }
const estimar = (categoria: string, a: Ponto, b: Ponto) =>
  api<Est>(`/estimativa?categoria=${encodeURIComponent(categoria)}&latEmbarque=${a.lat}&lngEmbarque=${a.lng}&latDestino=${b.lat}&lngDestino=${b.lng}`);

/**
 * Preço de uma categoria passando pelas paradas (aproximado). O servidor estima um trecho por vez: parte do preço do
 * caminho direto e soma os km a mais pelo preço por km da categoria, achado pelos trechos que passaram do valor
 * mínimo ("piso" = preço "a partir de" da categoria). Nunca passa da soma dos trechos.
 */
export async function estimarComParadas(categoria: string, pontos: Ponto[], piso: number | null): Promise<number | null> {
  if (pontos.length < 2 || pontos.some((p) => p.lat == null || p.lng == null)) return null;
  const direto = await estimar(categoria, pontos[0], pontos[pontos.length - 1]);
  if (pontos.length === 2 || direto.valor == null || direto.distanciaKm == null) return direto.valor;
  const trechos = await Promise.all(pontos.slice(1).map((p, i) => estimar(categoria, pontos[i], p)));
  if (trechos.some((t) => t.valor == null || t.distanciaKm == null)) return direto.valor;
  const kmTotal = trechos.reduce((s, t) => s + t.distanciaKm!, 0);
  const soma = trechos.reduce((s, t) => s + t.valor!, 0);
  // Pares (km, preço) acima do mínimo: estão na parte em que o preço cresce com a distância.
  const pares = [...trechos, direto].map((t) => ({ km: t.distanciaKm!, valor: t.valor! })).filter((t) => t.km > 0 && t.valor > (piso ?? 0) + 0.01).sort((a, b) => a.km - b.km);
  let porKm = 0;
  if (pares.length >= 2 && pares[pares.length - 1].km - pares[0].km >= 0.3) porKm = (pares[pares.length - 1].valor - pares[0].valor) / (pares[pares.length - 1].km - pares[0].km);
  else if (pares.length) porKm = (pares[pares.length - 1].valor - (piso ?? 0)) / pares[pares.length - 1].km;
  const valor = direto.valor + Math.max(0, porKm) * Math.max(0, kmTotal - direto.distanciaKm);
  return Math.round(Math.min(Math.max(valor, direto.valor), Math.max(soma, direto.valor)) * 100) / 100;
}
