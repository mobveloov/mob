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

export interface Local {
  id: string;
  nome: string;
  /** Endereço fixo de embarque. */
  endereco: Ponto;
  /** Nomes das categorias (cadastro "categorias") que o totem mostra. Vazio = todas as ativas. */
  categorias: string[];
  pagamentos: string[];
  senhaHash: string;
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

export const listarLocais = (empresaId: string) => ler<Local[]>(path.join(pasta(empresaId), "locais.json"), []);
export const local = (empresaId: string, id: string) => (D.idValido(id) ? listarLocais(empresaId).find((l) => l.id === id) ?? null : null);
const salvarLocais = (empresaId: string, l: Local[]) => gravar(path.join(pasta(empresaId), "locais.json"), l);

/** Local sem o hash da senha (o que o painel pode ver). */
export const localPublico = ({ senhaHash, ...l }: Local) => ({ ...l, temSenha: !!senhaHash });

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
  const novo: Local = {
    id: atual?.id ?? criarIdLocal(nome, lista), nome, endereco, categorias, pagamentos, senhaHash,
    versao: (atual?.versao ?? 0) + 1,
    ativo: typeof entrada.ativo === "boolean" ? entrada.ativo : atual?.ativo ?? true,
    criadoEm: atual?.criadoEm ?? new Date().toISOString(),
  };
  salvarLocais(empresaId, atual ? lista.map((l) => (l.id === novo.id ? novo : l)) : [...lista, novo]);
  return novo;
}

export function removerLocal(empresaId: string, id: string) {
  salvarLocais(empresaId, listarLocais(empresaId).filter((l) => l.id !== id));
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
