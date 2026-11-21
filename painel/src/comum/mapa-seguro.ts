// Cuidados com o Leaflet para não estourar "Cannot read properties of undefined (reading '_leaflet_pos')":
// o erro aparece quando um temporizador ou um ajuste de vista roda DEPOIS de o mapa ser removido (tela trocada)
// ou quando a caixa do mapa ainda não tem tamanho (tela estreita, aba escondida).
import type * as Leaflet from "leaflet";

/** O mapa ainda está montado (não foi removido) e a caixa dele está no documento. */
export function mapaVivo(m: Leaflet.Map | null | undefined): m is Leaflet.Map {
  const x = m as unknown as { _loaded?: boolean; _mapPane?: unknown; _container?: HTMLElement } | null | undefined;
  return !!x && !!x._mapPane && !!x._container && x._container.isConnected !== false;
}

/** Recalcula o tamanho do mapa depois de `ms`, só se ele ainda existir. Devolve a função que cancela (use no cleanup do efeito). */
export function invalidarDepois(m: Leaflet.Map, ms: number, depois?: () => void): () => void {
  const t = setTimeout(() => {
    if (!mapaVivo(m)) return;
    try { m.invalidateSize(); depois?.(); } catch { /* o mapa saiu da tela no meio do ajuste */ }
  }, ms);
  return () => clearTimeout(t);
}

/** Ajusta a vista aos limites sem estourar: ignora mapa removido ou sem tamanho (nesse caso o ajuste fica para o próximo invalidateSize). */
export function ajustarSeguro(m: Leaflet.Map, limites: Leaflet.LatLngBoundsExpression, opcoes?: Leaflet.FitBoundsOptions): boolean {
  if (!mapaVivo(m)) return false;
  try {
    const t = m.getSize();
    if (!t.x || !t.y) return false;
    m.fitBounds(limites, opcoes);
    return true;
  } catch { return false; }
}
