// Proxy de imagens de mapa (tiles). O navegador e os apps pedem aqui; só este servidor fala com o provedor.
// Por quê: a política do OpenStreetMap exige um User-Agent que identifique o aplicativo, Referer, cache e pouco volume.
// Do navegador isso não dá (o Referer some com Referrer-Policy: no-referrer e o User-Agent é o do navegador de cada um).
//
// - Cópia em disco (DADOS_DIR/cache-tiles) com validade longa e teto de tamanho (apaga as mais antigas).
// - Pedidos iguais ao mesmo tempo viram um só. No máximo 2 conexões simultâneas com o provedor e fila curta.
// - Provedor que recusou (403/429) fica em pausa por alguns minutos: não insiste e não piora o bloqueio.
// - Rota pública (a imagem é pedida por <img>, sem cabeçalho de login), com limite por IP.
// - Se o provedor cair, serve a cópia vencida, se houver.

import express, { type Request, type Response } from "express";
import fs from "node:fs";
import path from "node:path";
import * as D from "./dados.ts";
import { ATRIBUICAO, ATRIBUICAO_SATELITE, chaveDoMapa, identificacao, provedorEfetivo, type Estilo, type Provedor } from "../config/mapas.ts";

const num = (v: string | undefined, padrao: number) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : padrao; };
const ajustes = () => ({
  concorrencia: Math.round(num(process.env.MAPA_CONCORRENCIA, 2)),
  fila: Math.round(num(process.env.MAPA_FILA, 400)),
  espera: num(process.env.MAPA_ESPERA_FILA_MS, 20_000),
  timeout: num(process.env.MAPA_TIMEOUT_MS, 10_000),
  validade: num(process.env.MAPA_CACHE_DIAS, 14) * 86_400_000,
  teto: num(process.env.MAPA_CACHE_MB, 500) * 1024 * 1024,
  porMinuto: Math.round(num(process.env.MAPA_LIMITE_IP, 900)),
  pausaBloqueio: num(process.env.MAPA_PAUSA_BLOQUEIO_MS, 5 * 60_000),
});

// ------------------------------------------------------------------ endereço de origem

/** Endereço do tile no provedor. MAPA_ORIGEM_URL (ex.: servidor próprio de tiles) vale para todos, com {estilo} {z} {x} {y}. */
export function urlDeOrigem(provedor: Provedor, estilo: Estilo, z: number, x: number, y: number, chave: string): string {
  const fixo = process.env.MAPA_ORIGEM_URL?.trim();
  if (fixo) return fixo.replace("{estilo}", estilo).replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
  if (estilo === "satelite") return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
  const k = encodeURIComponent(chave);
  switch (provedor) {
    case "carto": return `https://${"abcd"[(x + y) % 4]}.basemaps.cartocdn.com/rastertiles/${estilo === "escuro" ? "dark_all" : "voyager"}/${z}/${x}/${y}.png`;
    case "maptiler": return `https://api.maptiler.com/maps/${estilo === "escuro" ? "streets-v2-dark" : "streets-v2"}/${z}/${x}/${y}.png?key=${k}`;
    case "stadia": return `https://tiles.stadiamaps.com/tiles/${estilo === "escuro" ? "alidade_smooth_dark" : "alidade_smooth"}/${z}/${x}/${y}.png?api_key=${k}`;
    default: return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
  }
}

// ------------------------------------------------------------------ cópia em disco

const pastaCache = () => path.join(D.raiz(), "cache-tiles");
let total: number | null = null, pastaDoTotal = "";
function listarArquivos(dir: string, saida: Array<{ arq: string; tam: number; em: number }> = []) {
  let nomes: fs.Dirent[] = [];
  try { nomes = fs.readdirSync(dir, { withFileTypes: true }); } catch { return saida; }
  for (const n of nomes) {
    const p = path.join(dir, n.name);
    if (n.isDirectory()) listarArquivos(p, saida);
    else { try { const s = fs.statSync(p); saida.push({ arq: p, tam: s.size, em: s.mtimeMs }); } catch { /* sumiu */ } }
  }
  return saida;
}
function tamanhoTotal(): number {
  if (total === null || pastaDoTotal !== pastaCache()) { total = listarArquivos(pastaCache()).reduce((s, a) => s + a.tam, 0); pastaDoTotal = pastaCache(); }
  return total;
}
/** Apaga as cópias mais antigas até ficar com 80% do teto. */
function limparSeCheio() {
  const { teto } = ajustes();
  if (tamanhoTotal() <= teto) return;
  const todos = listarArquivos(pastaCache()).sort((a, b) => a.em - b.em);
  let t = todos.reduce((s, a) => s + a.tam, 0);
  for (const a of todos) { if (t <= teto * 0.8) break; try { fs.unlinkSync(a.arq); t -= a.tam; } catch { /* em uso */ } }
  total = t;
}
const arquivoDe = (chave: string) => path.join(pastaCache(), ...chave.split("/"));

function lerCopia(chave: string): { dados: Buffer; vencida: boolean } | null {
  const arq = arquivoDe(chave);
  try { const s = fs.statSync(arq); return { dados: fs.readFileSync(arq), vencida: Date.now() - s.mtimeMs > ajustes().validade }; } catch { return null; }
}
function gravarCopia(chave: string, dados: Buffer) {
  const arq = arquivoDe(chave);
  try {
    fs.mkdirSync(path.dirname(arq), { recursive: true });
    const tmp = `${arq}.${process.pid}.${Date.now()}.tmp`;
    let antes = 0; try { antes = fs.statSync(arq).size; } catch { /* nova */ }
    fs.writeFileSync(tmp, dados); fs.renameSync(tmp, arq);
    total = tamanhoTotal() - antes + dados.length;
    limparSeCheio();
  } catch (e) { console.error("[mapa] não guardei a cópia:", e instanceof Error ? e.message : e); }
}

const tipoDaImagem = (b: Buffer) => (b[0] === 0x89 && b[1] === 0x50 ? "image/png" : b[0] === 0xff && b[1] === 0xd8 ? "image/jpeg" : b.subarray(0, 4).toString() === "RIFF" ? "image/webp" : "");

// ------------------------------------------------------------------ fila e pausa do provedor

let ativos = 0;
const fila: Array<{ vai: () => void; sair: (e: Error) => void }> = [];
function entrarNaFila(): Promise<() => void> {
  const a = ajustes();
  const liberar = () => { ativos--; const prox = fila.shift(); if (prox) { ativos++; prox.vai(); } };
  if (ativos < a.concorrencia) { ativos++; return Promise.resolve(liberar); }
  if (fila.length >= a.fila) return Promise.reject(new ErroMapa(503, "Fila de mapas cheia."));
  return new Promise((resolve, reject) => {
    const item = { vai: () => { clearTimeout(t); resolve(liberar); }, sair: reject };
    const t = setTimeout(() => { const i = fila.indexOf(item); if (i >= 0) fila.splice(i, 1); reject(new ErroMapa(503, "O servidor de mapas está ocupado.")); }, a.espera);
    fila.push(item);
  });
}

class ErroMapa extends Error { constructor(public status: number, msg: string) { super(msg); } }
const pausas = new Map<string, { ate: number; motivo: string }>();
const ultimoErro = new Map<string, { em: string; motivo: string }>();
const emVoo = new Map<string, Promise<Buffer>>();
export const estatisticas = { acertos: 0, buscas: 0, falhas: 0 };

export function ultimoErroDoProvedor(provedor: string) { return ultimoErro.get(provedor) ?? null; }
/** Só para testes. */
export function zerarMapasParaTeste() { pausas.clear(); ultimoErro.clear(); emVoo.clear(); limites.clear(); total = null; estatisticas.acertos = estatisticas.buscas = estatisticas.falhas = 0; }

async function buscarNaOrigem(empresaId: string, provedor: Provedor, estilo: Estilo, z: number, x: number, y: number): Promise<Buffer> {
  const a = ajustes();
  const pausa = pausas.get(provedor);
  if (pausa && pausa.ate > Date.now()) throw new ErroMapa(502, pausa.motivo);
  const liberar = await entrarNaFila();
  try {
    const id = identificacao(empresaId);
    const cab: Record<string, string> = { "User-Agent": id.agente, Accept: "image/png,image/jpeg,image/webp,image/*;q=0.8" };
    if (id.referer) cab.Referer = id.referer;
    const r = await fetch(urlDeOrigem(provedor, estilo, z, x, y, chaveDoMapa(empresaId)), { headers: cab, signal: AbortSignal.timeout(a.timeout), redirect: "follow" });
    if (r.status === 403 || r.status === 429 || r.status === 401) {
      const motivo = r.status === 429 ? "O provedor do mapa pediu para diminuir o ritmo (muitos pedidos)." : r.status === 401 ? "O provedor do mapa recusou a chave." : "O provedor do mapa bloqueou o acesso deste servidor.";
      pausas.set(provedor, { ate: Date.now() + a.pausaBloqueio, motivo });
      throw new ErroMapa(502, motivo);
    }
    if (!r.ok) throw new ErroMapa(502, `O provedor do mapa respondeu ${r.status}.`);
    const dados = Buffer.from(await r.arrayBuffer());
    if (dados.length > 1_000_000 || !tipoDaImagem(dados)) throw new ErroMapa(502, "O provedor do mapa devolveu algo que não é imagem.");
    return dados;
  } catch (e) {
    const motivo = e instanceof ErroMapa ? e.message : "Não consegui falar com o provedor do mapa.";
    ultimoErro.set(provedor, { em: new Date().toISOString(), motivo });
    if (e instanceof ErroMapa) throw e;
    throw new ErroMapa(502, motivo);
  } finally { liberar(); }
}

/** Devolve o tile da cópia ou da origem. */
export async function tile(empresaId: string, estilo: Estilo, z: number, x: number, y: number): Promise<{ dados: Buffer; origem: "cache" | "origem" | "cache-vencida" }> {
  const provedor = provedorEfetivo(empresaId);
  // OpenStreetMap só tem um desenho: o escuro é o mesmo tile com filtro no navegador.
  const estiloReal: Estilo = provedor === "osm" && estilo === "escuro" ? "claro" : estilo;
  const chave = `${estiloReal === "satelite" ? "esri" : provedor}/${estiloReal}/${z}/${x}/${y}.bin`;
  const copia = lerCopia(chave);
  if (copia && !copia.vencida) { estatisticas.acertos++; return { dados: copia.dados, origem: "cache" }; }
  let busca = emVoo.get(chave);
  if (!busca) {
    estatisticas.buscas++;
    busca = buscarNaOrigem(empresaId, provedor, estiloReal, z, x, y).then((d) => { gravarCopia(chave, d); return d; }).finally(() => emVoo.delete(chave));
    emVoo.set(chave, busca);
  }
  try { return { dados: await busca, origem: "origem" }; } catch (e) {
    estatisticas.falhas++;
    if (copia) return { dados: copia.dados, origem: "cache-vencida" };
    throw e;
  }
}

// ------------------------------------------------------------------ limite por IP

const limites = new Map<string, { inicio: number; n: number }>();
function passouDoLimite(ip: string): boolean {
  const agora = Date.now(), a = ajustes();
  if (limites.size > 5000) for (const [k, v] of limites) if (agora - v.inicio > 60_000) limites.delete(k);
  const l = limites.get(ip);
  if (!l || agora - l.inicio > 60_000) { limites.set(ip, { inicio: agora, n: 1 }); return false; }
  return ++l.n > a.porMinuto;
}

// ------------------------------------------------------------------ rotas públicas (/api/mapa)

export const rotasMapa = express.Router();
const empresaAtiva = (id: string) => { try { const e = D.empresa(id); return e && e.ativa ? e : null; } catch { return null; } };

/** O que o navegador e os apps precisam saber: provedor em uso (para o filtro escuro e a atribuição). Nada secreto. */
rotasMapa.get("/:empresa/config", (req: Request, res: Response) => {
  if (!empresaAtiva(req.params.empresa)) return res.status(404).json({ erro: "Empresa não encontrada." });
  const provedor = provedorEfetivo(req.params.empresa);
  res.setHeader("Cache-Control", "no-store");
  res.json({ provedor, atribuicao: ATRIBUICAO[provedor], atribuicaoSatelite: ATRIBUICAO_SATELITE, escuroComFiltro: provedor === "osm" });
});

rotasMapa.get("/:empresa/tiles/:estilo/:z/:x/:y", async (req: Request, res: Response) => {
  const { empresa, estilo } = req.params;
  const z = Number(req.params.z), x = Number(req.params.x), m = /^(\d{1,8})(?:\.(?:png|jpg))?$/.exec(req.params.y), y = m ? Number(m[1]) : NaN;
  if (!["claro", "escuro", "satelite"].includes(estilo) || !Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y) || z < 0 || z > 19 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z || !/^\d+$/.test(req.params.x))
    return res.status(400).json({ erro: "Pedido de mapa inválido." });
  if (!empresaAtiva(empresa)) return res.status(404).json({ erro: "Empresa não encontrada." });
  if (passouDoLimite(req.ip ?? "")) { res.setHeader("Retry-After", "30"); return res.status(429).json({ erro: "Muitos pedidos de mapa. Espere um pouco." }); }
  try {
    const r = await tile(empresa, estilo as Estilo, z, x, y);
    res.set({ "Content-Type": tipoDaImagem(r.dados), "Content-Length": String(r.dados.length), "Cache-Control": r.origem === "cache-vencida" ? "no-store" : "public, max-age=86400", "X-Mapa-Origem": r.origem, "X-Content-Type-Options": "nosniff" });
    res.end(r.dados);
  } catch (e) {
    const s = e instanceof ErroMapa ? e.status : 502;
    res.setHeader("Cache-Control", "no-store");
    res.status(s).json({ erro: e instanceof Error ? e.message : "O mapa não está disponível." });
  }
});
