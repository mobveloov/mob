// Endereços pelo CNEFE (cadastro público de endereços do IBGE) e rota entre dois pontos.
//
// CNEFE_DIR aponta para a pasta com:
//   _casas/<UF>.tsv.gz       um endereço por linha: município, número, rua, bairro, tipo, lat, lng (e um código interno)
//   <UF>/<código>_<NOME>.zip só o nome do arquivo é usado (lista de municípios com nome)
// Na primeira busca de um município, o painel lê o arquivo do estado uma vez e guarda só aquele
// município em DADOS_DIR/cnefe/<código>.json.gz. Depois disso, a busca é na memória.
//
// Rota: OSRM_URL (opcional, servidor OSRM) dá distância e tempo pelas ruas. Sem ele: linha reta × 1,3.
// Tudo é opcional: sem CNEFE e sem OSRM o painel continua funcionando (endereço em texto livre).

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import zlib from "node:zlib";
import { idValido, raiz } from "../servidor/dados.ts";

export interface Municipio { codigo: string; nome: string; uf: string }
export interface Endereco { texto: string; rua: string; numero: string; bairro: string; cidade: string; uf: string; cep: string; lat: number; lng: number; exato: boolean }

const UF: Record<string, string> = {
  "11": "RO", "12": "AC", "13": "AM", "14": "RR", "15": "PA", "16": "AP", "17": "TO", "21": "MA", "22": "PI", "23": "CE", "24": "RN", "25": "PB",
  "26": "PE", "27": "AL", "28": "SE", "29": "BA", "31": "MG", "32": "ES", "33": "RJ", "35": "SP", "41": "PR", "42": "SC", "43": "RS", "50": "MS",
  "51": "MT", "52": "GO", "53": "DF",
};

const pastaCnefe = () => (process.env.CNEFE_DIR ?? "").trim();
export const temCnefe = () => { const p = pastaCnefe(); return !!p && fs.existsSync(path.join(p, "_casas")); };

/** Sem acento, maiúsculo, só letras/números e espaço simples. */
export const normal = (s: string) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const TIPOS = new Set(["R", "RUA", "AV", "AVENIDA", "TV", "TRAV", "TRAVESSA", "AL", "ALAMEDA", "ESTR", "ESTRADA", "ROD", "RODOVIA", "PC", "PCA", "PRACA", "LARGO", "LG", "VIELA", "BECO", "VIA", "VILA", "PASSAGEM", "PRACETA", "LADEIRA", "CAMINHO", "SERVIDAO", "VICINAL", "ACESSO", "CONJUNTO", "QUADRA", "AREA"]);
const LIGA = new Set(["DE", "DA", "DO", "DAS", "DOS", "E"]);
const titulo = (s: string) => s.toLowerCase().replace(/(^|\s)(\S)/g, (_m, a, b) => a + b.toUpperCase()).replace(/\s(De|Da|Do|Das|Dos|E)\s/g, (m) => m.toLowerCase());

// ------------------------------------------------------------------ municípios

let municipiosCache: Municipio[] | null = null;
export function municipios(): Municipio[] {
  if (municipiosCache) return municipiosCache;
  const p = pastaCnefe(), lista: Municipio[] = [];
  if (p && fs.existsSync(p)) {
    for (const pasta of fs.readdirSync(p)) {
      const m = /^(\d{2})_([A-Z]{2})$/.exec(pasta);
      if (!m) continue;
      for (const arq of fs.readdirSync(path.join(p, pasta))) {
        const a = /^(\d{7})_(.+)\.zip$/i.exec(arq);
        if (a) lista.push({ codigo: a[1], nome: titulo(a[2].replace(/_/g, " ").replace(/-/g, "'")), uf: m[2] });
      }
    }
  }
  return (municipiosCache = lista.sort((a, b) => a.nome.localeCompare(b.nome)));
}
export const buscarMunicipios = (q: string) => {
  const n = normal(q);
  return n ? municipios().filter((m) => normal(m.nome).includes(n) || m.codigo === n).slice(0, 30) : [];
};
const nomeMunicipio = (cod: string) => municipios().find((m) => m.codigo === cod) ?? { codigo: cod, nome: cod, uf: UF[cod.slice(0, 2)] ?? "" };

// ------------------------------------------------------------------ índice de um município

interface Rua { nome: string; tipo: string; bairro: string; chave: string; palavras: string[]; cep: string; ini: number; fim: number }
interface Indice { cod: string; ruas: Rua[]; num: Int32Array; lat: Float64Array; lng: Float64Array; ruaDe: Int32Array; celulas: Map<string, number[]> }

const indices = new Map<string, Indice>();
const preparando = new Map<string, Promise<void>>();
const situacaoPreparo = new Map<string, string>();
const arquivoCache = (cod: string) => path.join(raiz(), "cnefe", `${cod}.json.gz`);
const CELULA = 0.003; // ~300 m
const chaveCelula = (lat: number, lng: number) => `${Math.floor(lat / CELULA)}:${Math.floor(lng / CELULA)}`;

type Linha = [number, string, string, string, number, number, string]; // número, rua, bairro, tipo, lat, lng, cep

/** Lê o arquivo do estado uma vez e grava o cache de cada município pedido. */
async function prepararMunicipios(cods: string[]): Promise<void> {
  const uf = cods[0].slice(0, 2), sigla = UF[uf];
  const origem = path.join(pastaCnefe(), "_casas", `${uf}_${sigla}.tsv.gz`);
  if (!fs.existsSync(origem)) throw new Error(`Arquivo do CNEFE não encontrado para ${sigla}.`);
  const quer = new Set(cods), juntos = new Map<string, Map<string, Linha>>();
  for (const c of cods) { juntos.set(c, new Map()); situacaoPreparo.set(c, "lendo o arquivo do estado"); }
  const rl = readline.createInterface({ input: fs.createReadStream(origem).pipe(zlib.createGunzip()), crlfDelay: Infinity });
  let linhas = 0;
  for await (const l of rl) {
    if (++linhas % 1_000_000 === 0) for (const c of cods) situacaoPreparo.set(c, `lendo o arquivo do estado (${linhas / 1_000_000} milhões de linhas)`);
    const t = l.indexOf("\t");
    const cod = l.slice(0, t);
    if (!quer.has(cod)) continue;
    const p = l.split("\t");
    const lat = Number(p[5]), lng = Number(p[6]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !p[2]) continue;
    const num = Number(p[1]) || 0;
    const k = `${p[2]}|${p[3]}|${num}`;
    const m = juntos.get(cod)!;
    if (!m.has(k)) m.set(k, [num, p[2], p[3] ?? "", p[4] ?? "", Math.round(lat * 1e6) / 1e6, Math.round(lng * 1e6) / 1e6, ""]); // a 8ª coluna do arquivo é um código interno, não o CEP
  }
  fs.mkdirSync(path.join(raiz(), "cnefe"), { recursive: true });
  for (const [cod, m] of juntos) {
    const tmp = `${arquivoCache(cod)}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, zlib.gzipSync(JSON.stringify([...m.values()])));
    fs.renameSync(tmp, arquivoCache(cod));
    situacaoPreparo.delete(cod);
  }
}

function montarIndice(cod: string): Indice {
  const linhas = JSON.parse(zlib.gunzipSync(fs.readFileSync(arquivoCache(cod))).toString("utf8")) as Linha[];
  linhas.sort((a, b) => (a[1] + a[2]).localeCompare(b[1] + b[2]) || a[0] - b[0]);
  const n = linhas.length, num = new Int32Array(n), lat = new Float64Array(n), lng = new Float64Array(n), ruaDe = new Int32Array(n);
  const ruas: Rua[] = [], celulas = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const [nr, nome, bairro, tipo, la, ln, cep] = linhas[i];
    let r = ruas[ruas.length - 1];
    if (!r || r.nome !== nome || r.bairro !== bairro) {
      const chave = normal(nome);
      r = { nome, tipo, bairro, chave, palavras: chave.split(" ").filter((w) => !LIGA.has(w)), cep, ini: i, fim: i };
      ruas.push(r);
    }
    r.fim = i + 1; if (!r.cep && cep) r.cep = cep;
    num[i] = nr; lat[i] = la; lng[i] = ln; ruaDe[i] = ruas.length - 1;
    const k = chaveCelula(la, ln);
    const cel = celulas.get(k); if (cel) cel.push(i); else celulas.set(k, [i]);
  }
  return { cod, ruas, num, lat, lng, ruaDe, celulas };
}

/** Índice pronto do município, ou null enquanto prepara (a preparação segue sozinha). */
export function indice(cod: string): Indice | null {
  const pronto = indices.get(cod);
  if (pronto) return pronto;
  if (!/^\d{7}$/.test(cod) || !temCnefe()) return null;
  if (fs.existsSync(arquivoCache(cod))) { const i = montarIndice(cod); indices.set(cod, i); return i; }
  if (!preparando.has(cod)) {
    const p = prepararMunicipios([cod]).catch((e) => { situacaoPreparo.set(cod, `erro: ${e instanceof Error ? e.message : e}`); }).finally(() => preparando.delete(cod));
    preparando.set(cod, p);
  }
  return null;
}
/** Espera o município ficar pronto (para testes e para o primeiro uso). */
export async function prepararAgora(cod: string): Promise<boolean> {
  if (indice(cod)) return true;
  await preparando.get(cod);
  return !!indice(cod);
}

// ------------------------------------------------------------------ configuração da empresa

export interface ConfigEnderecos { municipios: string[] }
const arqConfig = (empresaId: string) => { if (!idValido(empresaId)) throw new Error("Empresa inválida."); return path.join(raiz(), "empresas", empresaId, "enderecos.json"); };
export function lerConfig(empresaId: string): ConfigEnderecos {
  try { const c = JSON.parse(fs.readFileSync(arqConfig(empresaId), "utf8")); return { municipios: Array.isArray(c.municipios) ? c.municipios.filter((x: unknown) => typeof x === "string" && /^\d{7}$/.test(x)).slice(0, 20) : [] }; } catch { return { municipios: [] }; }
}
export function salvarConfig(empresaId: string, c: ConfigEnderecos): ConfigEnderecos {
  const limpo = { municipios: [...new Set((c.municipios ?? []).map(String).filter((x) => /^\d{7}$/.test(x)))].slice(0, 20) };
  fs.mkdirSync(path.dirname(arqConfig(empresaId)), { recursive: true });
  fs.writeFileSync(arqConfig(empresaId), JSON.stringify(limpo, null, 2));
  for (const m of limpo.municipios) indice(m); // já começa a preparar
  return limpo;
}
/** Cidades atendidas pela empresa (escolhidas em Endereços), com nome e UF. */
export function cidadesAtendidas(empresaId: string): Municipio[] {
  return lerConfig(empresaId).municipios.map((cod) => nomeMunicipio(cod));
}

/**
 * Rua, bairro e cidade de um CEP, pela base de endereços das cidades da empresa. Só acha quando a base tem o CEP
 * (o arquivo do CNEFE em uso nem sempre traz). Sem base ou sem o CEP: null (o app deixa preencher à mão).
 */
export function buscarCep(empresaId: string, cepBruto: string): { rua: string; bairro: string; cidade: string; uf: string } | null {
  const cep = String(cepBruto ?? "").replace(/\D/g, "");
  if (cep.length !== 8 || !temCnefe()) return null;
  for (const cod of lerConfig(empresaId).municipios) {
    const ix = indice(cod);
    const r = ix?.ruas.find((x) => x.cep.replace(/\D/g, "") === cep);
    if (ix && r) { const m = nomeMunicipio(cod); return { rua: titulo(`${r.tipo} ${r.nome}`.trim()), bairro: titulo(r.bairro), cidade: m.nome, uf: m.uf }; }
  }
  return null;
}

export function situacao(empresaId: string) {
  return {
    cnefe: temCnefe(), osrm: !!process.env.OSRM_URL?.trim(),
    municipios: lerConfig(empresaId).municipios.map((cod) => ({ ...nomeMunicipio(cod), pronto: indices.has(cod) || fs.existsSync(arquivoCache(cod)), preparo: situacaoPreparo.get(cod) ?? null, enderecos: indices.get(cod)?.num.length ?? null })),
  };
}

// ------------------------------------------------------------------ busca

function separar(texto: string) {
  const partes = String(texto ?? "").split(/[,;\-–]/).map((s) => s.trim()).filter(Boolean);
  let numero = "", rua = partes[0] ?? "", resto = partes.slice(1);
  const noFim = /^(.*?)\s+(?:N[º°o.]?\s*)?(\d{1,6})\s*$/i.exec(rua);
  if (noFim) { rua = noFim[1]; numero = noFim[2]; }
  else { const i = resto.findIndex((p) => /^(?:N[º°o.]?\s*)?\d{1,6}$/i.test(p)); if (i >= 0) { numero = resto[i].replace(/\D/g, ""); resto = resto.filter((_, j) => j !== i); } }
  const palavras = normal(rua).split(" ").filter((w) => w && !LIGA.has(w));
  while (palavras.length > 1 && TIPOS.has(palavras[0])) palavras.shift();
  return { palavras, numero, bairro: normal(resto.join(" ")) };
}

function pontuar(r: Rua, palavras: string[], bairro: string): number {
  if (!palavras.length) return 0;
  let acertos = 0;
  for (const w of palavras) {
    if (r.palavras.includes(w)) acertos += 1;
    else if (r.palavras.some((x) => x.startsWith(w))) acertos += w.length >= 3 ? 0.8 : 0.4;
    else return 0;
  }
  let s = acertos / Math.max(palavras.length, r.palavras.length);
  if (r.chave === palavras.join(" ")) s += 0.3;
  if (bairro && normal(r.bairro).includes(bairro)) s += 0.4;
  return s;
}

function montar(ix: Indice, r: Rua, i: number, exato: boolean, numero: string): Endereco {
  const m = nomeMunicipio(ix.cod);
  const rua = titulo(`${r.tipo} ${r.nome}`.trim());
  const nr = numero || (ix.num[i] ? String(ix.num[i]) : "");
  return { texto: `${rua}${nr ? `, ${nr}` : ""}${r.bairro ? ` - ${titulo(r.bairro)}` : ""}, ${m.nome}/${m.uf}`, rua, numero: nr, bairro: titulo(r.bairro), cidade: m.nome, uf: m.uf, cep: r.cep, lat: ix.lat[i], lng: ix.lng[i], exato };
}

/** Ponto da rua mais perto do número pedido (ou o meio da rua sem número). */
function pontoNaRua(ix: Indice, r: Rua, numero: string): { i: number; exato: boolean } {
  const alvo = Number(numero) || 0;
  let melhor = r.ini, dif = Infinity;
  for (let i = r.ini; i < r.fim; i++) {
    const d = alvo ? Math.abs(ix.num[i] - alvo) : 0;
    if (d < dif) { dif = d; melhor = i; if (!d && alvo) break; }
  }
  if (!alvo) melhor = r.ini + Math.floor((r.fim - r.ini) / 2);
  return { i: melhor, exato: !!alvo && dif === 0 };
}

/** Busca o endereço nos municípios da empresa. Devolve até `limite` opções, a melhor primeiro. */
export function buscarEndereco(empresaId: string, texto: string, limite = 8): { enderecos: Endereco[]; aviso: string | null } {
  const cods = lerConfig(empresaId).municipios;
  if (!temCnefe()) return { enderecos: [], aviso: "Base de endereços (CNEFE) não configurada." };
  if (!cods.length) return { enderecos: [], aviso: "Escolha as cidades atendidas em Endereços." };
  const { palavras, numero, bairro } = separar(texto);
  if (!palavras.length || palavras.join("").length < 3) return { enderecos: [], aviso: null };
  const achados: Array<{ s: number; ix: Indice; r: Rua }> = [];
  let preparandoAlgum = false;
  for (const cod of cods) {
    const ix = indice(cod);
    if (!ix) { preparandoAlgum = true; continue; }
    for (const r of ix.ruas) { const s = pontuar(r, palavras, bairro); if (s > 0.3) achados.push({ s, ix, r }); }
  }
  achados.sort((a, b) => b.s - a.s);
  const vistos = new Set<string>(), enderecos: Endereco[] = [];
  for (const a of achados) {
    const k = `${a.ix.cod}|${a.r.nome}|${a.r.bairro}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    const p = pontoNaRua(a.ix, a.r, numero);
    enderecos.push(montar(a.ix, a.r, p.i, p.exato, numero));
    if (enderecos.length >= limite) break;
  }
  return { enderecos, aviso: preparandoAlgum ? "Preparando a base de endereços de uma cidade (só na primeira vez). Tente de novo em alguns minutos." : null };
}

/** Endereço mais perto de um ponto (localização enviada pelo WhatsApp, por exemplo). */
export function enderecoDoPonto(empresaId: string, lat: number, lng: number): Endereco | null {
  let melhor: { d: number; ix: Indice; i: number } | null = null;
  for (const cod of lerConfig(empresaId).municipios) {
    const ix = indice(cod);
    if (!ix) continue;
    const cy = Math.floor(lat / CELULA), cx = Math.floor(lng / CELULA);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      for (const i of ix.celulas.get(`${cy + dy}:${cx + dx}`) ?? []) {
        const d = (ix.lat[i] - lat) ** 2 + ((ix.lng[i] - lng) * Math.cos((lat * Math.PI) / 180)) ** 2;
        if (!melhor || d < melhor.d) melhor = { d, ix, i };
      }
    }
  }
  if (!melhor) return null;
  const r = melhor.ix.ruas[melhor.ix.ruaDe[melhor.i]];
  return { ...montar(melhor.ix, r, melhor.i, true, ""), lat, lng };
}

// ------------------------------------------------------------------ rota

export function linhaReta(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/**
 * Servidor de rotas (OSRM). OSRM_URL aponta para o servidor próprio. Sem ele, usa o OSRM público do OpenStreetMap,
 * que serve SÓ PARA TESTE (sem garantia e com limite de uso): em produção suba um OSRM próprio. OSRM_PUBLICO=0 desliga
 * o público (aí a distância volta a ser linha reta × 1,3). Nos testes automáticos não há chamada à internet.
 */
export function servidorOsrm(): string {
  const proprio = process.env.OSRM_URL?.trim().replace(/\/+$/, "");
  if (proprio) return proprio;
  if (process.env.NODE_ENV === "test" || process.env.OSRM_PUBLICO === "0") return "";
  return "https://router.project-osrm.org";
}

/** Distância (km) e tempo (min) pelas ruas, com OSRM; sem OSRM, linha reta × 1,3 e 2,5 min/km. */
export async function rota(a: { lat: number; lng: number }, b: { lat: number; lng: number }): Promise<{ distanciaKm: number; minutos: number; pelasRuas: boolean }> {
  const url = servidorOsrm();
  if (url) {
    try {
      const r = await fetch(`${url}/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false`, { signal: AbortSignal.timeout(4000) });
      const j = (await r.json()) as { code?: string; routes?: Array<{ distance: number; duration: number }> };
      if (j.code === "Ok" && j.routes?.[0]) return { distanciaKm: Math.round(j.routes[0].distance / 10) / 100, minutos: Math.max(1, Math.round(j.routes[0].duration / 60)), pelasRuas: true };
    } catch { /* cai na linha reta */ }
  }
  const km = Math.round(linhaReta(a, b) * 1.3 * 100) / 100;
  return { distanciaKm: km, minutos: Math.max(1, Math.round(km * 2.5)), pelasRuas: false };
}

/** Completa um ponto só com texto: acha a coordenada no CNEFE (se der). */
export function completarPonto<T extends { texto: string; lat?: number; lng?: number }>(empresaId: string, p: T | undefined): T | undefined {
  if (p && p.lat != null && p.lng != null) {
    // Localização sem texto útil (ex.: enviada pelo WhatsApp): põe o endereço mais perto.
    if (p.texto?.trim() && !/^localiza/i.test(p.texto.trim())) return p;
    const e = enderecoDoPonto(empresaId, p.lat, p.lng);
    return e ? { ...p, texto: `${e.texto} (localização)` } : p;
  }
  if (!p || !p.texto?.trim()) return p;
  const e = buscarEndereco(empresaId, p.texto, 1).enderecos[0];
  return e ? { ...p, lat: e.lat, lng: e.lng } : p;
}
