// Preenche a filial a partir da cidade: latitude, longitude, UF, zoom e raio de cobertura (sem o usuário digitar nada).
// Ordem: cidade já cadastrada no CRM (com coordenada) > OpenStreetMap (Nominatim, sem chave) > base de endereços da empresa (CNEFE).

import { buscarCidade } from "../enderecos/externo.ts";
import { listarCidades } from "../crm2/cidades.ts";
import { normal } from "../enderecos/index.ts";
import { geocodificar, zoomParaLimites } from "./centro.ts";

export interface CidadeGeo { cidade: string; uf: string; lat: number; lng: number; zoom: number; raioKm: number; fonte: "crm" | "mapa" | "enderecos" }
const RAIO_PADRAO_KM = 5;
const arred = (n: number, c: number) => Math.round(n * 10 ** c) / 10 ** c;

export async function geoDaCidade(empresaId: string, cidade: string, uf = ""): Promise<CidadeGeo | null> {
  const nome = cidade.replace(/\s*[-,/]\s*[A-Za-z]{2}\s*$/, "").trim(); // "Leme - SP" / "Leme, SP" -> "Leme"
  const ufDigitada = (uf || /[-,/]\s*([A-Za-z]{2})\s*$/.exec(cidade)?.[1] || "").toUpperCase();
  if (nome.length < 2) return null;
  const n = normal(nome);
  const doCrm = listarCidades(empresaId).find((c) => c.lat != null && c.lng != null && normal(c.name) === n && (!ufDigitada || !c.state || c.state.toUpperCase() === ufDigitada));
  if (doCrm) return { cidade: nome, uf: (doCrm.state || ufDigitada).toUpperCase(), lat: arred(doCrm.lat!, 5), lng: arred(doCrm.lng!, 5), zoom: 13, raioKm: doCrm.radius_km > 0 ? doCrm.radius_km : RAIO_PADRAO_KM, fonte: "crm" };
  const mapa = await buscarCidade(nome, ufDigitada);
  if (mapa) {
    const c = mapa.caixa;
    // Zoom em que a cidade inteira cabe (entre 11 e 14); raio: metade da menor dimensão da cidade, entre 3 e 10 km.
    const zoom = c ? Math.max(11, Math.min(14, zoomParaLimites([[c[0], c[1]], [c[2], c[3]]]))) : 13;
    const km = c ? Math.min((c[2] - c[0]) * 111.32, (c[3] - c[1]) * 111.32 * Math.cos((mapa.lat * Math.PI) / 180)) / 2 : RAIO_PADRAO_KM;
    return { cidade: nome, uf: mapa.uf || ufDigitada, lat: arred(mapa.lat, 5), lng: arred(mapa.lng, 5), zoom, raioKm: arred(Math.max(3, Math.min(10, km)), 1), fonte: "mapa" };
  }
  const base = geocodificar(empresaId, nome, ufDigitada);
  return base ? { cidade: nome, uf: ufDigitada, lat: arred(base.lat, 5), lng: arred(base.lng, 5), zoom: 13, raioKm: RAIO_PADRAO_KM, fonte: "enderecos" } : null;
}
