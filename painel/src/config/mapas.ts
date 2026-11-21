// Config › Integrações › Mapas: de onde vêm as imagens (tiles) dos mapas do painel e dos apps.
// O navegador nunca fala com o provedor: pede ao servidor (/api/mapa/<empresa>/tiles/...), que guarda cópia em disco,
// limita os pedidos e se identifica como a política do provedor exige. A chave (MapTiler, Stadia) fica só em segredos.

import * as D from "../servidor/dados.ts";
import { gravarConfig, lerConfig, texto, umDe } from "./armazem.ts";

export const PROVEDORES = ["osm", "carto", "maptiler", "stadia"] as const;
export type Provedor = (typeof PROVEDORES)[number];
export const ESTILOS = ["claro", "escuro", "satelite"] as const;
export type Estilo = (typeof ESTILOS)[number];

export const NOME_PROVEDOR: Record<Provedor, string> = { osm: "OpenStreetMap (pelo servidor)", carto: "CARTO (claro e escuro, sem chave)", maptiler: "MapTiler (com chave)", stadia: "Stadia Maps (com chave)" };
export const PEDE_CHAVE: Record<Provedor, boolean> = { osm: false, carto: false, maptiler: true, stadia: true };
export const ATRIBUICAO: Record<Provedor, string> = {
  osm: "© OpenStreetMap",
  carto: "© OpenStreetMap © CARTO",
  maptiler: "© MapTiler © OpenStreetMap",
  stadia: "© Stadia Maps © OpenMapTiles © OpenStreetMap",
};
export const ATRIBUICAO_SATELITE = "Imagens © Esri";

export interface ConfigMapas { provedor: Provedor }
export const MASCARA = "••••••";

export const configMapas = (empresaId: string): ConfigMapas => ({ provedor: umDe(lerConfig<Record<string, unknown>>(empresaId, "mapas", {}).provedor, PROVEDORES, "osm") });
/** Só o servidor lê a chave. */
export const chaveDoMapa = (empresaId: string): string => String((D.segredos(empresaId).integracoes["mapas"] ?? {}).chave ?? "");

/** Provedor que vale de fato: os que pedem chave, sem chave cadastrada, caem para o OpenStreetMap. */
export function provedorEfetivo(empresaId: string): Provedor {
  const p = configMapas(empresaId).provedor;
  return PEDE_CHAVE[p] && !chaveDoMapa(empresaId) ? "osm" : p;
}

export function salvarConfigMapas(empresaId: string, entrada: Record<string, unknown>) {
  const novo = configMapas(empresaId);
  if (entrada.provedor !== undefined) novo.provedor = umDe(entrada.provedor, PROVEDORES, novo.provedor);
  gravarConfig(empresaId, "mapas", novo);
  const c = entrada.chave;
  if (typeof c === "string" && c !== MASCARA) {
    const seg = D.segredos(empresaId);
    const atual = { ...(seg.integracoes["mapas"] ?? {}) };
    const t = texto(c, 200).replace(/\s/g, "");
    if (t) atual.chave = t; else delete atual.chave;
    seg.integracoes["mapas"] = atual;
    D.salvarSegredos(empresaId, seg);
  }
}

/** Identificação enviada ao provedor (política do OpenStreetMap): "<produto da marca> painel (<contato do suporte>)". Tudo vem da marca. */
export function identificacao(empresaId: string): { agente: string; referer: string; temContato: boolean } {
  const m = D.marca(empresaId);
  const limpo = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "").replace(/[()]/g, "").trim();
  const contato = limpo(m.textos.suporteEmail || m.textos.suporteSite || m.app.urlPainel || "");
  const produto = limpo(m.produto || m.nomeExibido || "Painel") || "Painel";
  const dom = m.dominios?.[0];
  const referer = /^https?:\/\//i.test(m.app.urlPainel || "") ? m.app.urlPainel : dom ? `https://${dom}/` : "";
  return { agente: contato ? `${produto} painel (${contato})` : `${produto} painel`, referer: /^[\x21-\x7e]*$/.test(referer) ? referer : "", temContato: !!contato };
}

/** Visão para a tela: nunca devolve a chave inteira. */
export function visaoMapas(empresaId: string) {
  const c = configMapas(empresaId), id = identificacao(empresaId);
  return {
    provedor: c.provedor, efetivo: provedorEfetivo(empresaId), chave: chaveDoMapa(empresaId) ? MASCARA : "",
    provedores: PROVEDORES.map((p) => ({ id: p, nome: NOME_PROVEDOR[p], pedeChave: PEDE_CHAVE[p] })),
    identificacao: id.agente, temContato: id.temContato,
  };
}
