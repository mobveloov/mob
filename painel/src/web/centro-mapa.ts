// Busca o centro, o zoom e a área de cobertura dos mapas no servidor (GET /api/filiais/centro), guardando por 30 s por filial.
import type { CentroDoMapa } from "../comum/mapa-centro.ts";
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
/** Depois de mexer em filiais ou áreas. */
export const esquecerCentros = () => guardados.clear();
