// Dados do totem de cada empresa. Ficam em DADOS_DIR/empresas/<id>/totem/ (fora do Git):
//
//   locais.json    locais do totem (endereço fixo, categorias, pagamentos, senha só como hash)
//   corridas.json  qual local pediu cada corrida (o totem só vê e só cancela as dele)
//
// A corrida em si é uma corrida própria do painel (src/corridas): nenhum sistema externo, nenhuma chave.
// Toda função recebe o id da empresa, validado com idValido: uma empresa nunca lê a pasta de outra.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as D from "../servidor/dados.ts";

/** Formas de pagamento que o totem e a central oferecem (texto gravado na corrida). */
export const PAGAMENTOS = ["Dinheiro", "Pix", "Cartão na maquininha", "Cartão de crédito", "Cartão de débito", "Voucher", "Faturado"];
export const PAGAMENTOS_PADRAO = ["Dinheiro", "Pix", "Cartão na maquininha"];

export interface Ponto { texto: string; lat?: number; lng?: number }

/** Categoria do totem (Totens e Preços › Preços): preço próprio deste local. */
export interface CategoriaLocal {
  nome: string;
  descricao: string;
  taxaBase: number;
  porKm: number;
  porMin: number;
  /** Corrida mínima. */
  minima: number;
  /** Tempo de espera mostrado (min). */
  espera: number;
  ordem: number;
  ativa: boolean;
}

export type ModoWhatsapp = "individual" | "compartilhado";

export interface Local {
  /** É o "slug" do link do totem: /totem/<empresa>/<id>. */
  id: string;
  nome: string;
  /** Endereço fixo de embarque. */
  endereco: Ponto;
  /** Nomes das categorias (cadastro "categorias") que o totem mostra. Vazio = todas as ativas. */
  categorias: string[];
  pagamentos: string[];
  senhaHash: string;
  cidade: string;
  uf: string;
  /** Imagem do topo e do rodapé (nome do arquivo em empresas/<id>/arquivos). Vazio = sem imagem. */
  logo: string;
  rodape: string;
  modoWhatsapp: ModoWhatsapp;
  /** Aparelho vinculado (identificador gerado no aparelho). Vazio = ainda sem aparelho. */
  aparelho: string;
  /** Preços deste local. Vazio = vale a tabela de "Categorias e tarifas" da empresa. */
  tabela: CategoriaLocal[];
  /** Multiplicador de demanda sobre a tabela do local (1 = preço normal). */
  surge: number;
  /** Sobe quando o admin salva ou manda recarregar: o totem recarrega sozinho. */
  versao: number;
  ativo: boolean;
  criadoEm: string;
}

export interface CorridaDoTotem { corridaId: string; os: string; localId: string; criadaEm: string }

const MAX_CORRIDAS = 5000;

function pasta(empresaId: string) {
  if (!D.idValido(empresaId)) throw new Error("Empresa inválida.");
  return path.join(D.raiz(), "empresas", empresaId, "totem");
}
function ler<T>(arq: string, padrao: T): T {
  try { return JSON.parse(fs.readFileSync(arq, "utf8")) as T; } catch { return padrao; }
}
function gravar(arq: string, valor: unknown) {
  fs.mkdirSync(path.dirname(arq), { recursive: true });
  const tmp = `${arq}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(valor, null, 1), { mode: 0o600 });
  fs.renameSync(tmp, arq);
}

const txt = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[<>]/g, "").trim().slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined);

/** Endereço vindo de fora: texto e, se vierem válidas, coordenadas. */
export function lerPonto(v: unknown): Ponto {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const p: Ponto = { texto: txt(o.texto, 200) };
  const lat = num(o.lat), lng = num(o.lng);
  if (lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat || lng)) { p.lat = lat; p.lng = lng; }
  return p;
}

// ------------------------------------------------------------------ locais

/** Local gravado antes dos campos novos: completa o que falta. */
function completar(l: Partial<Local>): Local {
  return {
    ...(l as Local), cidade: l.cidade ?? "", uf: l.uf ?? "", logo: l.logo ?? "", rodape: l.rodape ?? "",
    modoWhatsapp: l.modoWhatsapp === "compartilhado" ? "compartilhado" : "individual", aparelho: l.aparelho ?? "",
    tabela: Array.isArray(l.tabela) ? l.tabela : [], surge: typeof l.surge === "number" && l.surge > 0 ? l.surge : 1,
  };
}
export const listarLocais = (empresaId: string) => ler<Local[]>(path.join(pasta(empresaId), "locais.json"), []).map(completar);
export const local = (empresaId: string, id: string) => (D.idValido(id) ? listarLocais(empresaId).find((l) => l.id === id) ?? null : null);
const salvarLocais = (empresaId: string, l: Local[]) => gravar(path.join(pasta(empresaId), "locais.json"), l);

/** Local sem o hash da senha (o que o painel pode ver). */
export const localPublico = ({ senhaHash, ...l }: Local) => ({ ...l, temSenha: !!senhaHash });

/** Texto -> slug do link (letras minúsculas, números e hífen). */
export const slugDe = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);

function criarIdLocal(nome: string, existentes: Local[]): string {
  const base = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "local";
  let id = base.length >= 2 ? base : `${base}-1`;
  for (let n = 2; existentes.some((l) => l.id === id); n++) id = `${base}-${n}`;
  return id;
}

/** Cria ou altera um local. A senha só muda quando vem preenchida (mínimo 4 caracteres). */
export function salvarLocal(empresaId: string, entrada: Record<string, unknown>, id?: string): Local {
  const lista = listarLocais(empresaId);
  const atual = id ? lista.find((l) => l.id === id) : undefined;
  if (id && !atual) throw new Error("Local não encontrado.");
  const nome = txt(entrada.nome, 60) || atual?.nome || "";
  if (nome.length < 2) throw new Error("Informe o nome do local.");
  const endereco = entrada.endereco !== undefined ? lerPonto(entrada.endereco) : atual?.endereco ?? { texto: "" };
  if (!endereco.texto) throw new Error("Informe o endereço fixo do local.");
  const pagamentos = Array.isArray(entrada.pagamentos)
    ? [...new Set(entrada.pagamentos.map(String).filter((p) => PAGAMENTOS.includes(p)))]
    : atual?.pagamentos ?? PAGAMENTOS_PADRAO;
  if (!pagamentos.length) throw new Error("Escolha pelo menos uma forma de pagamento.");
  const categorias = Array.isArray(entrada.categorias) ? [...new Set(entrada.categorias.map((c) => txt(c, 60)).filter(Boolean))].slice(0, 30) : atual?.categorias ?? [];
  let senhaHash = atual?.senhaHash ?? "";
  if (typeof entrada.senha === "string" && entrada.senha !== "") {
    if (entrada.senha.length < 4) throw new Error("A senha do totem precisa de pelo menos 4 caracteres.");
    senhaHash = D.hashSenha(entrada.senha);
  }
  if (!senhaHash) throw new Error("Defina a senha do totem.");
  let novoId = atual?.id;
  if (!novoId) {
    const pedido = typeof entrada.slug === "string" ? slugDe(entrada.slug) : "";
    if (pedido) {
      if (pedido.length < 2) throw new Error("O endereço do totem precisa de pelo menos 2 letras ou números.");
      if (lista.some((l) => l.id === pedido)) throw new Error("Já existe um local com este endereço (slug).");
      novoId = pedido;
    } else novoId = criarIdLocal(nome, lista);
  }
  const novo: Local = {
    id: novoId!, nome, endereco, categorias, pagamentos, senhaHash,
    cidade: entrada.cidade !== undefined ? txt(entrada.cidade, 60) : atual?.cidade ?? "",
    uf: entrada.uf !== undefined ? txt(entrada.uf, 2).toUpperCase() : atual?.uf ?? "",
    logo: atual?.logo ?? "", rodape: atual?.rodape ?? "", aparelho: atual?.aparelho ?? "",
    modoWhatsapp: entrada.modoWhatsapp === "compartilhado" ? "compartilhado" : entrada.modoWhatsapp === "individual" ? "individual" : atual?.modoWhatsapp ?? "individual",
    tabela: atual?.tabela ?? [], surge: atual?.surge ?? 1,
    versao: (atual?.versao ?? 0) + 1,
    ativo: typeof entrada.ativo === "boolean" ? entrada.ativo : atual?.ativo ?? true,
    criadoEm: atual?.criadoEm ?? new Date().toISOString(),
  };
  salvarLocais(empresaId, atual ? lista.map((l) => (l.id === novo.id ? novo : l)) : [...lista, novo]);
  return novo;
}

export function removerLocal(empresaId: string, id: string) {
  const l = local(empresaId, id);
  salvarLocais(empresaId, listarLocais(empresaId).filter((x) => x.id !== id));
  // As imagens do local não servem para mais nada.
  if (l?.logo) D.apagarImagem(empresaId, l.logo);
  if (l?.rodape) D.apagarImagem(empresaId, l.rodape);
}

/** Imagem do topo ("logo") ou do rodapé ("rodape") do totem. Nome do arquivo = totem-<local>-<tipo>.<ext>. */
export function definirImagem(empresaId: string, id: string, tipo: "logo" | "rodape", mime: string, bytes: Uint8Array): Local {
  const lista = listarLocais(empresaId);
  const l = lista.find((x) => x.id === id);
  if (!l) throw new Error("Local não encontrado.");
  if (!/^image\/(png|jpeg|webp)$/.test(mime)) throw new Error("Envie a imagem em PNG, JPG ou WEBP.");
  if (bytes.length > 2 * 1024 * 1024) throw new Error("A imagem pode ter no máximo 2 MB.");
  const nome = D.salvarImagem(empresaId, `totem-${id}-${tipo}`, mime, bytes);
  l[tipo] = nome;
  l.versao++;
  salvarLocais(empresaId, lista);
  return l;
}
export function tirarImagem(empresaId: string, id: string, tipo: "logo" | "rodape"): Local {
  const lista = listarLocais(empresaId);
  const l = lista.find((x) => x.id === id);
  if (!l) throw new Error("Local não encontrado.");
  if (l[tipo]) D.apagarImagem(empresaId, l[tipo]);
  l[tipo] = "";
  l.versao++;
  salvarLocais(empresaId, lista);
  return l;
}

/** Aparelho vinculado: o primeiro que entra com a senha fica com o link; outro aparelho é barrado. */
export function vincularAparelho(empresaId: string, id: string, aparelho: string): "ok" | "outro" {
  const lista = listarLocais(empresaId);
  const l = lista.find((x) => x.id === id);
  if (!l) throw new Error("Local não encontrado.");
  if (l.aparelho && l.aparelho !== aparelho) return "outro";
  if (!l.aparelho) { l.aparelho = aparelho; salvarLocais(empresaId, lista); }
  return "ok";
}
export function limparAparelho(empresaId: string, id: string): Local {
  const lista = listarLocais(empresaId);
  const l = lista.find((x) => x.id === id);
  if (!l) throw new Error("Local não encontrado.");
  l.aparelho = "";
  l.versao++;
  salvarLocais(empresaId, lista);
  return l;
}

// ------------------------------------------------------------------ preços do local (Totens e Preços › Preços)

const dinheiro = (v: unknown, max = 100000) => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? Math.min(max, Math.max(0, Math.round(n * 100) / 100)) : 0; };

/** Tabela de preços vinda da tela: confere e limpa cada categoria. */
export function lerTabela(v: unknown): CategoriaLocal[] {
  if (!Array.isArray(v)) throw new Error("Tabela de preços inválida.");
  const vistos = new Set<string>();
  const out: CategoriaLocal[] = [];
  for (const c of v.slice(0, 30) as Array<Record<string, unknown>>) {
    const nome = txt(c?.nome, 60);
    if (!nome) throw new Error("Toda categoria precisa de um nome.");
    if (vistos.has(nome.toLowerCase())) throw new Error(`A categoria "${nome}" aparece duas vezes.`);
    vistos.add(nome.toLowerCase());
    out.push({
      nome, descricao: txt(c?.descricao, 120), taxaBase: dinheiro(c?.taxaBase), porKm: dinheiro(c?.porKm), porMin: dinheiro(c?.porMin),
      minima: dinheiro(c?.minima), espera: Math.min(240, Math.max(0, Math.round(Number(c?.espera)) || 5)), ordem: Math.round(Number(c?.ordem)) || 0, ativa: c?.ativa !== false,
    });
  }
  return out;
}

/** Grava os preços do local. Com `copiarPara` ("todos" ou ids), copia a mesma tabela para os outros. */
export function salvarPrecos(empresaId: string, id: string, entrada: { tabela: unknown; surge?: unknown }, copiarPara: string[] | "todos" | null = null): Local {
  const lista = listarLocais(empresaId);
  const l = lista.find((x) => x.id === id);
  if (!l) throw new Error("Local não encontrado.");
  const tabela = lerTabela(entrada.tabela);
  const surge = entrada.surge === undefined ? l.surge : Number(String(entrada.surge).replace(",", "."));
  if (!Number.isFinite(surge) || surge < 0.5 || surge > 10) throw new Error("O multiplicador de demanda fica entre 0,5 e 10.");
  for (const x of lista) {
    if (x.id === id || copiarPara === "todos" || (Array.isArray(copiarPara) && copiarPara.includes(x.id))) {
      x.tabela = tabela.map((c) => ({ ...c }));
      x.surge = surge;
      x.versao++;
    }
  }
  salvarLocais(empresaId, lista);
  return lista.find((x) => x.id === id)!;
}

/** Preço de uma categoria do local: taxa base + km + minutos, nunca abaixo da mínima, vezes o multiplicador. Sem distância: "a partir de". */
export function precoDoLocal(l: Pick<Local, "surge">, c: CategoriaLocal, km: number | null, minutos: number | null): number {
  const rodando = km != null ? c.taxaBase + c.porKm * km + c.porMin * (minutos ?? km * 2.5) : c.taxaBase;
  return Math.round(Math.max(c.minima, rodando) * l.surge * 100) / 100;
}

/** Recarregar remoto: sobe a versão; o totem percebe em até 1 minuto. */
export function recarregarLocal(empresaId: string, id: string): Local {
  const lista = listarLocais(empresaId);
  const l = lista.find((x) => x.id === id);
  if (!l) throw new Error("Local não encontrado.");
  l.versao++;
  salvarLocais(empresaId, lista);
  return l;
}

// ------------------------------------------------------------------ acesso do aparelho (senha do local)

/**
 * Chave do aparelho: HMAC de empresa+local com o hash da senha. Trocar a senha troca o hash (sal novo),
 * então todos os aparelhos precisam digitar a senha nova. O hash nunca sai do servidor.
 */
export function chaveDoAparelho(empresaId: string, l: Local): string {
  return crypto.createHmac("sha256", l.senhaHash).update(`totem:${empresaId}:${l.id}`).digest("base64url");
}
export function chaveConfere(empresaId: string, l: Local, chave: string): boolean {
  const esperada = Buffer.from(chaveDoAparelho(empresaId, l));
  const recebida = Buffer.from(chave);
  return esperada.length === recebida.length && crypto.timingSafeEqual(esperada, recebida);
}

// ------------------------------------------------------------------ corridas pedidas pelo totem

const arqCorridas = (empresaId: string) => path.join(pasta(empresaId), "corridas.json");
export const corridasDoTotem = (empresaId: string) => ler<CorridaDoTotem[]>(arqCorridas(empresaId), []);
export const corridaDoTotem = (empresaId: string, corridaId: string) => corridasDoTotem(empresaId).find((c) => c.corridaId === corridaId) ?? null;
export function registrarCorrida(empresaId: string, c: CorridaDoTotem) {
  gravar(arqCorridas(empresaId), [c, ...corridasDoTotem(empresaId).filter((x) => x.corridaId !== c.corridaId)].slice(0, MAX_CORRIDAS));
}
