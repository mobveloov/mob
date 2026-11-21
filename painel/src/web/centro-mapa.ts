// Busca o centro, o zoom e a área de cobertura dos mapas no servidor (GET /api/filiais/centro), guardando por 30 s por filial.
import type * as Leaflet from "leaflet";
import { aplicarVista, CENTRO_BRASIL, mapaNaoMexido, type CentroDoMapa } from "../comum/mapa-centro.ts";
import { empresaEscolhidaAgora } from "./api";

const guardados = new Map<string, { em: number; p: Promise<CentroDoMapa | null> }>();

/** `filial` vazia = a empresa toda. O servidor já prende o operador à filial dele. */
export function buscarCentro(filial = ""): Promise<CentroDoMapa | null> {
  const chave = `${empresaEscolhidaAgora()}|${filial}`;
  const g = guardados.get(chave);
  if (g && Date.now() - g.em < 30_000) return g.p;
  const p = fetch(`/api/filiais/centro${filial ? `?filial=${encodeURIComponent(filial)}` : ""}`, { credentials: "same-origin", cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<CentroDoMapa>) : null)).catch(() => null);
  guardados.set(chave, { em: Date.now(), p });
  void p.then((v) => { if (!v) guardados.delete(chave); });
  return p;
}
/**
 * Para mapas criados com a vista do Brasil: leva o mapa para a cidade da empresa (ou da filial) quando o servidor responde,
 * se ninguém tiver mexido nele nem a tela tiver ajustado a vista (`jaAjustado`). Devolve para cancelar não é preciso: o mapa removido é ignorado.
 */
export function abrirNaCidade(L: typeof Leaflet, mapa: Leaflet.Map, filial = "", jaAjustado: () => boolean = () => false): void {
  void buscarCentro(filial).then((c) => { if (c && !jaAjustado() && mapaNaoMexido(mapa, CENTRO_BRASIL)) aplicarVista(L, mapa, c); });
}

/** Depois de mexer em filiais ou áreas. */
export const esquecerCentros = () => guardados.clear();
