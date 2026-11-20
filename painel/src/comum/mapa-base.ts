// Base dos mapas (imagens de ruas ou satélite) para o painel e para os apps web.
// Nunca fala com o provedor: pede as imagens ao servidor da central (/api/mapa/<empresa>/tiles/...), que guarda cópia,
// limita os pedidos e se identifica como a política do provedor exige. Escolha do provedor: Configurações > Integrações > Mapas.
// Segue o tema claro/escuro (no OpenStreetMap, que só tem mapa claro, aplica um filtro) e avisa na tela quando o mapa falha.

import type * as Leaflet from "leaflet";

type L = typeof Leaflet;
interface ConfigPublica { provedor: string; atribuicao: string; atribuicaoSatelite: string; escuroComFiltro: boolean }
export interface OpcoesBase {
  /** Endereço do servidor (nos apps pode ser outro; no painel é vazio). */
  api?: string;
  /** Empresa dona do mapa. No painel, vem do login. */
  empresaId?: string;
  satelite?: boolean;
  /** Nos apps a mensagem de erro não manda ir às configurações do painel. */
  app?: boolean;
}
export interface BaseDoMapa { satelite(ligado: boolean): void; remover(): void }

let empresaDoPainel = "";
/** O painel avisa a empresa logada (ou a escolhida pelo dono da plataforma). */
export function definirEmpresaDoMapa(id: string) { empresaDoPainel = id; }

const guardadas = new Map<string, { em: number; p: Promise<ConfigPublica> }>();
const PADRAO: ConfigPublica = { provedor: "osm", atribuicao: "© OpenStreetMap", atribuicaoSatelite: "Imagens © Esri", escuroComFiltro: true };
/** Depois de mudar o provedor nas configurações. */
export function esquecerConfigDoMapa() { guardadas.clear(); }
function configDoMapa(api: string, empresa: string): Promise<ConfigPublica> {
  const chave = `${api}|${empresa}`, g = guardadas.get(chave);
  if (g && Date.now() - g.em < 300_000) return g.p;
  const p = fetch(`${api}/api/mapa/${encodeURIComponent(empresa)}/config`, { cache: "no-store" }).then((r) => (r.ok ? (r.json() as Promise<ConfigPublica>) : PADRAO)).catch(() => PADRAO);
  guardadas.set(chave, { em: Date.now(), p });
  return p;
}

export const temaEscuro = () => {
  const d = typeof document !== "undefined" ? document.documentElement.dataset : null;
  return d?.theme === "dark" || d?.tema === "escuro";
};

function estiloUmaVez() {
  if (document.getElementById("mapa-base-estilo")) return;
  const s = document.createElement("style");
  s.id = "mapa-base-estilo";
  s.textContent = ".mapa-base-escura{filter:invert(1) hue-rotate(180deg) brightness(.92) contrast(.88) saturate(.8)}"
    + ".mapa-aviso{position:absolute;left:8px;right:8px;top:8px;z-index:1000;background:#fff7ed;color:#7c2d12;border:1px solid #fdba74;border-radius:8px;padding:8px 10px;font:13px/1.35 system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.2)}";
  document.head.appendChild(s);
}

/** Põe a base no mapa. Devolve como trocar para satélite e como desligar. */
export function baseDoMapa(L: L, mapa: Leaflet.Map, o: OpcoesBase = {}): BaseDoMapa {
  const api = (o.api ?? "").replace(/\/+$/, ""), empresa = () => o.empresaId || empresaDoPainel;
  let camada: Leaflet.TileLayer | null = null, cfg = PADRAO, sat = !!o.satelite, fim = false, avisoEl: HTMLDivElement | null = null, motivo = "", seguidos = 0, atribuicaoAtual = "";
  estiloUmaVez();

  const esconderAviso = () => { avisoEl?.remove(); avisoEl = null; };
  const mostrarAviso = () => {
    if (fim || avisoEl) return;
    const div = document.createElement("div");
    div.className = "mapa-aviso"; div.setAttribute("role", "alert");
    const dica = o.app ? "Tente de novo em instantes. Se continuar, avise a central." : "Avise o administrador: Configurações > Integrações > Mapas.";
    div.textContent = `O mapa não carregou. ${motivo ? motivo + " " : ""}${dica}`;
    mapa.getContainer().appendChild(div); avisoEl = div;
  };

  const montar = () => {
    if (fim) return;
    camada?.remove();
    const estilo = sat ? "satelite" : temaEscuro() ? "escuro" : "claro";
    const filtro = !sat && estilo === "escuro" && cfg.escuroComFiltro;
    seguidos = 0; esconderAviso();
    const nova = L.tileLayer(`${api}/api/mapa/${encodeURIComponent(empresa())}/tiles/${estilo}/{z}/{x}/{y}.png`, {
      maxZoom: sat ? 18 : 19, className: filtro ? "mapa-base-escura" : "",
    });
    // Aviso quando as imagens falham em sequência (a primeira que carrega bem tira o aviso).
    nova.on("tileload", () => { seguidos = 0; esconderAviso(); });
    nova.on("tileerror", (e: Leaflet.TileErrorEvent) => {
      seguidos++;
      if (seguidos === 1) {
        const src = (e.tile as HTMLImageElement).src;
        fetch(src, { cache: "no-store" }).then((r) => r.json()).then((j: { erro?: string }) => { if (j?.erro) { motivo = j.erro; if (avisoEl) { esconderAviso(); mostrarAviso(); } } }).catch(() => { /* sem rede: fica sem motivo */ });
      }
      if (seguidos >= 3) mostrarAviso();
    });
    nova.addTo(mapa); nova.bringToBack();
    camada = nova;
    const attr = sat ? cfg.atribuicaoSatelite : cfg.atribuicao;
    if (attr !== atribuicaoAtual) { if (atribuicaoAtual) mapa.attributionControl?.removeAttribution(atribuicaoAtual); mapa.attributionControl?.addAttribution(attr); atribuicaoAtual = attr; }
  };

  configDoMapa(api, empresa()).then((c) => { cfg = c; montar(); });
  // Tema trocado com o mapa aberto: troca a imagem.
  const obs = typeof MutationObserver !== "undefined" ? new MutationObserver(() => { if (camada && !sat) montar(); }) : null;
  obs?.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-tema"] });
  mapa.on("unload", () => { fim = true; obs?.disconnect(); esconderAviso(); });

  return {
    satelite(ligado) { if (ligado === sat) return; sat = ligado; if (camada) montar(); },
    remover() { fim = true; obs?.disconnect(); esconderAviso(); camada?.remove(); camada = null; },
  };
}
