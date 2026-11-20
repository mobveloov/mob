// Casa e trabalho do passageiro: o texto fica em enderecoCasa/enderecoTrabalho e a posição no mapa em
// enderecoCasaPos/enderecoTrabalhoPos ("lat,lng"). Painel e app gravam nos mesmos campos.

export interface PosicaoMapa { lat: number; lng: number }

/** "lat,lng" válido vira posição; qualquer outra coisa vira null. */
export function lerPosicao(v: unknown): PosicaoMapa | null {
  const m = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(String(v ?? ""));
  if (!m) return null;
  const lat = Number(m[1]), lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

export const gravarPosicao = (p?: { lat?: number | null; lng?: number | null } | null): string | null =>
  p && typeof p.lat === "number" && typeof p.lng === "number" ? `${p.lat},${p.lng}` : null;

/**
 * Regra do painel: se o texto não mudou, a posição que já existe fica; se mudou, vale a posição enviada
 * (escolhida na sugestão de endereço) ou nenhuma.
 */
export function posicaoAoEditar(textoAntes: unknown, textoDepois: unknown, posicaoAntes: unknown, posicaoEnviada: unknown): string | null {
  const igual = String(textoAntes ?? "").trim() === String(textoDepois ?? "").trim();
  const p = lerPosicao(igual ? posicaoAntes : posicaoEnviada);
  return p && String(textoDepois ?? "").trim() ? gravarPosicao(p) : null;
}
