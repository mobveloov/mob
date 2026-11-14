// Tipos e funções de apoio do app do passageiro: horário de Brasília, datas, endereços, preço com paradas,
// chamadas às rotas novas da API (com plano B quando a rota ainda não existe) e fotos com o token.

import { api, ErroApi, hora, token, urlApi, urlArquivo } from "../comum/api";

export interface Ponto { texto: string; lat?: number; lng?: number }
export interface MotoristaDaCorrida {
  nome: string; veiculo: string; placa: string; telefone: string;
  foto?: string | null; nota?: number | null; viagens?: number | null; cor?: string;
}
export interface Corrida {
  id: string; os: string; status: string; statusTexto: string; aberta: boolean; embarque: Ponto; destino: Ponto | null; categoria: string; pagamento: string;
  estimativa: { valor: number | null; distanciaKm: number | null; minutos: number | null }; valor: number | null; desconto: number | null; avaliacao: number | null;
  solicitadaEm: string; iniciadaEm?: string | null; finalizadaEm?: string | null; canceladaPor?: string | null;
  motorista: MotoristaDaCorrida | null;
  paradas?: Ponto[]; agendadaPara?: string | null; comentario?: string; taxaCancelamento?: number | null; compartilhar?: string | null; motoristaId?: string | null;
  valorOferecido?: number | null; opcionais?: string[]; mensagensNaoLidas?: number;
  distanciaMotoristaKm?: number | null; minutosMotorista?: number | null; chegando?: boolean;
}
export interface Eu { nome: string; telefone: string; foto?: string | null; email?: string; genero?: string; cidadeId?: string | null }
export interface Endereco { texto: string; lat: number; lng: number; rua?: string; numero?: string; bairro?: string; cidade?: string; uf?: string }
export interface Categoria { nome: string; descricao: string; aPartirDe: number | null }
export interface Perfil { email: string; codigo: string; indicadoPor: string; favoritos?: string[]; bloqueados?: string[] }
export interface Lugares { casa: Ponto | null; trabalho: Ponto | null; favoritos: Array<{ id: string; nome: string; ponto: Ponto }>; recentes: Ponto[] }
export interface Rota { partida: Ponto; paradas: Ponto[]; destino: Ponto | null }
export interface ContraOferta {
  id: string; valor: number; distanciaKm?: number | null; expira?: string | null;
  motorista: { nome: string; nota?: number | null; viagens?: number | null; veiculo?: string; placa?: string; foto?: string | null };
}

export const temCoord = <T extends Ponto>(p: T | null | undefined): p is T & { lat: number; lng: number } => p?.lat != null && p?.lng != null;

// ------------------------------------------------------------------ rotas novas da API

/** A rota ainda não existe neste servidor (404) ou o servidor não entende o pedido: usa o plano B. */
export const rotaFaltando = (e: unknown) => e instanceof ErroApi && (e.status === 404 || e.status === 405 || e.status === 501);

/** Chama a API e, se a rota ainda não existir, devolve o valor padrão. Outros erros sobem. */
export async function apiOu<T>(caminho: string, padrao: T, o?: Parameters<typeof api>[1]): Promise<T> {
  try { return await api<T>(caminho, o); } catch (e) { if (rotaFaltando(e)) return padrao; throw e; }
}

// ------------------------------------------------------------------ lugares (casa, trabalho, favoritos, recentes)

const LUGARES_VAZIO: Lugares = { casa: null, trabalho: null, favoritos: [], recentes: [] };
const chaveLocal = () => `lugares-passageiro-${token()?.slice(-8) ?? ""}`;
function lerLocal(): Lugares {
  try { return { ...LUGARES_VAZIO, ...(JSON.parse(localStorage.getItem(chaveLocal()) ?? "{}") as Partial<Lugares>) }; } catch { return { ...LUGARES_VAZIO }; }
}
function gravarLocal(l: Lugares) { try { localStorage.setItem(chaveLocal(), JSON.stringify(l)); } catch { /* sem armazenamento */ } }
let lugaresNoServidor = true;

/** Lugares do passageiro. Sem a rota nova, ficam guardados no aparelho. */
export async function lerLugares(): Promise<Lugares> {
  try { lugaresNoServidor = true; return { ...LUGARES_VAZIO, ...(await api<Lugares>("/lugares")) }; } catch (e) {
    if (!rotaFaltando(e)) throw e;
    lugaresNoServidor = false;
    return lerLocal();
  }
}
export async function salvarLugar(tipo: "casa" | "trabalho" | "favorito", ponto: Ponto, nome?: string): Promise<Lugares> {
  if (lugaresNoServidor) {
    try { return { ...LUGARES_VAZIO, ...(await api<Lugares>("/lugares", { corpo: { tipo, nome, ponto } })) }; } catch (e) { if (!rotaFaltando(e)) throw e; lugaresNoServidor = false; }
  }
  const l = lerLocal();
  if (tipo === "casa") l.casa = ponto; else if (tipo === "trabalho") l.trabalho = ponto;
  else l.favoritos = [...l.favoritos.filter((f) => f.ponto.texto !== ponto.texto), { id: `${Date.now()}`, nome: nome || ponto.texto, ponto }];
  gravarLocal(l);
  return l;
}
export async function removerLugar(id: string): Promise<Lugares> {
  if (lugaresNoServidor) {
    try { return { ...LUGARES_VAZIO, ...(await api<Lugares>(`/lugares/${encodeURIComponent(id)}/remover`, { corpo: {} })) }; } catch (e) { if (!rotaFaltando(e)) throw e; lugaresNoServidor = false; }
  }
  const l = lerLocal();
  if (id === "casa") l.casa = null; else if (id === "trabalho") l.trabalho = null; else l.favoritos = l.favoritos.filter((f) => f.id !== id);
  gravarLocal(l);
  return l;
}
/** Guarda o destino como recente no aparelho (o servidor novo já faz isso sozinho). */
export function lembrarRecente(p: Ponto | null) {
  if (!p?.texto || lugaresNoServidor) return;
  const l = lerLocal();
  l.recentes = [p, ...l.recentes.filter((x) => x.texto !== p.texto)].slice(0, 8);
  gravarLocal(l);
}

// ------------------------------------------------------------------ fotos (precisam do token)

const fotos = new Map<string, Promise<string>>();
/** Endereço local da foto. As fotos das rotas dos apps só abrem com o token, por isso são baixadas antes. */
export function urlDaFoto(foto: string): Promise<string> {
  if (/^(data|blob):/.test(foto)) return Promise.resolve(foto);
  const completa = /^https?:/.test(foto) ? foto : foto.startsWith("/api/") ? urlArquivo(foto) : urlApi(foto.startsWith("/") ? foto : `/${foto}`);
  if (!completa.includes("/api/apps/")) return Promise.resolve(completa);
  let p = fotos.get(completa);
  if (!p) {
    p = fetch(completa, { headers: { authorization: `Bearer ${token() ?? ""}` } })
      .then((r) => { if (!r.ok) throw new Error(); return r.blob(); })
      .then((b) => URL.createObjectURL(b));
    p.catch(() => fotos.delete(completa));
    fotos.set(completa, p);
  }
  return p;
}

/** Diminui a foto (até 800 px) e devolve em JPEG, para mandar rápido. */
export async function prepararFoto(arquivo: Blob, lado = 800): Promise<Blob> {
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, falha) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => falha(new Error("Não deu para abrir a foto.")); i.src = url; });
    const k = Math.min(1, lado / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise<Blob>((ok, falha) => c.toBlob((b) => (b ? ok(b) : falha(new Error("Não deu para preparar a foto."))), "image/jpeg", 0.85));
  } finally { URL.revokeObjectURL(url); }
}

// ------------------------------------------------------------------ datas e horas

/** Agora no horário de Brasília, no formato "AAAA-MM-DDTHH:MM" (o mesmo que o servidor usa no agendamento). */
export function agoraBrasilia(somarMinutos = 0) {
  return new Date(Date.now() - 3 * 3600_000 + somarMinutos * 60_000).toISOString().slice(0, 16);
}

const DIAS = ["dom.", "seg.", "ter.", "qua.", "qui.", "sex.", "sáb."];
const MESES = ["jan.", "fev.", "mar.", "abr.", "mai.", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."];
export const MESES_LONGOS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "AAAA-MM-DD" → "seg., 09 de nov." */
export function diaBonito(dia: string) {
  const d = new Date(`${dia}T12:00:00Z`);
  return `${DIAS[d.getUTCDay()]}, ${dia.slice(8, 10)} de ${MESES[Number(dia.slice(5, 7)) - 1]}`;
}

/** "AAAA-MM-DDTHH:MM" → "seg., 09 de nov. às 00:09". */
export function quandoAgendada(s: string | null | undefined) {
  if (!s) return "";
  return `${diaBonito(s.slice(0, 10))} às ${s.slice(11, 16)}`;
}

/** A corrida ainda está esperando o horário marcado (não procura motorista antes da hora). */
export const esperandoHorario = (c: Corrida) => c.status === "procurando" && !!c.agendadaPara && c.agendadaPara > agoraBrasilia();

/** Data curta: só dia ("AAAA-MM-DD") ou dia e hora. */
export function dataCurta(s: string | null | undefined) {
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
  return hora(s);
}

/** "8 de novembro de 2026" (separador de dias do chat). */
export function diaPorExtenso(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} de ${MESES_LONGOS[d.getMonth()]} de ${d.getFullYear()}`;
}

export function saudacao() {
  const h = new Date().getHours();
  return h < 5 ? "Boa noite" : h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

// ------------------------------------------------------------------ endereços

/** Separa o endereço em duas linhas: rua e número em cima; bairro, cidade e UF embaixo. */
export function linhasDoEndereco(e: Partial<Endereco> & { texto: string }): [string, string] {
  if (e.rua) return [`${e.rua}${e.numero ? `, ${e.numero}` : ""}`, [e.bairro, e.cidade && e.uf ? `${e.cidade} - ${e.uf}` : e.cidade].filter(Boolean).join(", ")];
  const i = e.texto.indexOf(" - ");
  if (i > 0) return [e.texto.slice(0, i), e.texto.slice(i + 3).replace("/", " - ")];
  const v = e.texto.split(",");
  return v.length > 2 ? [v.slice(0, 2).join(",").trim(), v.slice(2).join(",").trim()] : [e.texto, ""];
}

/** Só a primeira linha do endereço (rua e número). */
export const ruaCurta = (p: Ponto | null | undefined) => (p ? linhasDoEndereco(p)[0] : "");

/** Distância em km entre dois pontos (linha reta). */
export function distanciaKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// ------------------------------------------------------------------ compartilhar e contatos

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

/** Link do WhatsApp para um telefone brasileiro. */
export function linkWhatsapp(telefone: string, texto = "") {
  let n = telefone.replace(/\D/g, "");
  if (!n) return "";
  if (n.length <= 11) n = `55${n}`;
  return `https://wa.me/${n}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`;
}

export interface Contatos { whatsapp: string; telefone: string; site: string; termosUrl: string; privacidadeUrl: string; email: string }

// ------------------------------------------------------------------ preço

interface Est { valor: number | null; distanciaKm: number | null; minutos: number | null }
export const estimar = (categoria: string, a: Ponto, b: Ponto) =>
  api<Est>(`/estimativa?categoria=${encodeURIComponent(categoria)}&latEmbarque=${a.lat}&lngEmbarque=${a.lng}&latDestino=${b.lat}&lngDestino=${b.lng}`);

/**
 * Preço de uma categoria passando pelas paradas (aproximado). O servidor estima um trecho por vez: parte do preço do
 * caminho direto e soma os km a mais pelo preço por km da categoria, achado pelos trechos que passaram do valor
 * mínimo ("piso" = preço "a partir de" da categoria). Nunca passa da soma dos trechos.
 */
export async function estimarComParadas(categoria: string, pontos: Ponto[], piso: number | null): Promise<Est> {
  const vazio = { valor: null, distanciaKm: null, minutos: null };
  if (pontos.length < 2 || pontos.some((p) => p.lat == null || p.lng == null)) return vazio;
  const direto = await estimar(categoria, pontos[0], pontos[pontos.length - 1]);
  if (pontos.length === 2 || direto.valor == null || direto.distanciaKm == null) return direto;
  const trechos = await Promise.all(pontos.slice(1).map((p, i) => estimar(categoria, pontos[i], p)));
  if (trechos.some((t) => t.valor == null || t.distanciaKm == null)) return direto;
  const kmTotal = trechos.reduce((s, t) => s + t.distanciaKm!, 0);
  const minutos = trechos.reduce((s, t) => s + (t.minutos ?? 0), 0) || direto.minutos;
  const soma = trechos.reduce((s, t) => s + t.valor!, 0);
  // Pares (km, preço) acima do mínimo: estão na parte em que o preço cresce com a distância.
  const pares = [...trechos, direto].map((t) => ({ km: t.distanciaKm!, valor: t.valor! })).filter((t) => t.km > 0 && t.valor > (piso ?? 0) + 0.01).sort((a, b) => a.km - b.km);
  let porKm = 0;
  if (pares.length >= 2 && pares[pares.length - 1].km - pares[0].km >= 0.3) porKm = (pares[pares.length - 1].valor - pares[0].valor) / (pares[pares.length - 1].km - pares[0].km);
  else if (pares.length) porKm = (pares[pares.length - 1].valor - (piso ?? 0)) / pares[pares.length - 1].km;
  const valor = direto.valor + Math.max(0, porKm) * Math.max(0, kmTotal - direto.distanciaKm);
  return { valor: Math.round(Math.min(Math.max(valor, direto.valor), Math.max(soma, direto.valor)) * 100) / 100, distanciaKm: Math.round(kmTotal * 10) / 10, minutos };
}

/** Passo do − e + no preço oferecido. */
export const PASSO_OFERTA = 0.5;
/** Faixa do valor oferecido: não fica abaixo do mínimo da categoria nem passa de 3× a estimativa. */
export function faixaDaOferta(estimativa: number, minimo: number | null) {
  const piso = Math.max(minimo ?? 0, Math.round(estimativa * 0.8 * 2) / 2);
  return { min: Math.min(piso, estimativa), max: Math.round(estimativa * 3 * 100) / 100 };
}
export const arredondar = (v: number) => Math.round(v * 100) / 100;

/** Valor mostrado da corrida: o oferecido (se houver) ou a estimativa, já com o desconto. */
export function valorDaCorrida(c: Corrida) {
  if (c.valor != null) return c.valor;
  const base = c.valorOferecido ?? c.estimativa.valor;
  return base == null ? null : Math.max(0, base - (c.desconto ?? 0));
}

/** Placa no formato da placa Mercosul do print: "ABC-1D23". */
export function placaBonita(p: string) {
  const s = p.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return s.length === 7 ? `${s.slice(0, 3)}-${s.slice(3)}` : p.toUpperCase();
}

export const ehMoto = (categoria: string) => /moto/i.test(categoria);

/** Duração da viagem em minutos: a real (início até o fim), ou a estimada quando não houve. */
export function duracaoDaViagem(c: Pick<Corrida, "iniciadaEm" | "finalizadaEm" | "estimativa">): number | null {
  if (c.iniciadaEm && c.finalizadaEm) { const m = Math.round((Date.parse(c.finalizadaEm) - Date.parse(c.iniciadaEm)) / 60000); if (Number.isFinite(m) && m >= 0) return Math.max(1, m); }
  return c.estimativa?.minutos ?? null;
}
