// Dados de cada empresa (multiempresa). Tudo em arquivos dentro de DADOS_DIR (padrão painel/dados/, fora do Git):
//
//   dados/plataforma.json               lista de empresas
//   dados/usuarios.json                 usuários (senha só como hash)
//   dados/empresas/<id>/marca.json      marca e aparência
//   dados/empresas/<id>/integracoes.json  integrações (sem segredos)
//   dados/empresas/<id>/segredos.json   credenciais e chaves de IA (nunca vão para o navegador)
//   dados/empresas/<id>/arquivos/       logos, ícones
//   dados/empresas/<id>/planilhas/      CSVs importados
//
// Cada função recebe o id da empresa. O id é validado, então uma empresa nunca lê a pasta de outra.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { MARCA_PADRAO, sanearMarca, type Marca } from "../comum/marca.ts";
import { gravarJson, lerJson } from "./jsoncache.ts";

export type TipoIntegracao = "sistema-a" | "sistema-b" | "arquivo" | "exemplo";
export interface Integracao { id: string; tipo: TipoIntegracao; nome: string; ativa: boolean }
export interface Empresa { id: string; nome: string; criadaEm: string; ativa: boolean }
export type Papel = "plataforma" | "admin" | "operador";
export interface Usuario { id: string; email: string; nome: string; hash: string; empresaId: string; papel: Papel; criadoEm: string; telefone?: string }
export interface Segredos { integracoes: Record<string, Record<string, string>>; ia: Record<string, string> }

const ID = /^[a-z0-9][a-z0-9-]{1,40}$/;
export const idValido = (id: unknown): id is string => typeof id === "string" && ID.test(id);

export function raiz() {
  return path.resolve(process.env.DADOS_DIR || "dados");
}
function pastaEmpresa(id: string) {
  if (!idValido(id)) throw new Error("Empresa inválida.");
  return path.join(raiz(), "empresas", id);
}
function ler<T>(arq: string, padrao: T): T {
  return structuredClone(lerJson<T>(arq, padrao)); // cópia: quem chama pode mudar à vontade
}
/** Só leitura, sem cópia (os arquivos lidos em todo pedido: empresas e usuários). */
const lerFixo = <T>(arq: string, padrao: T): T => lerJson<T>(arq, padrao);
function gravar(arq: string, valor: unknown, secreto = false) {
  gravarJson(arq, valor, { espacos: 2, modo: secreto ? 0o600 : 0o644 });
}

/** "Rota Fácil Ltda" -> "rota-facil-ltda" */
export function criarId(nome: string): string {
  const base = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "empresa";
  let id = base.length >= 2 ? base : `${base}-1`;
  for (let n = 2; listarEmpresas().some((e) => e.id === id); n++) id = `${base}-${n}`;
  return id;
}

// ------------------------------------------------------------------ empresas

export const listarEmpresas = () => lerFixo<Empresa[]>(path.join(raiz(), "plataforma.json"), []);
export const empresa = (id: string) => listarEmpresas().find((e) => e.id === id) ?? null;

export function criarEmpresa(nome: string, marca?: Partial<Marca>): Empresa {
  const e: Empresa = { id: criarId(nome), nome: nome.trim().slice(0, 80) || "Empresa", criadaEm: new Date().toISOString(), ativa: true };
  gravar(path.join(raiz(), "plataforma.json"), [...listarEmpresas(), e]);
  salvarMarca(e.id, sanearMarca({ ...MARCA_PADRAO, produto: `Painel ${e.nome}`, nomeExibido: e.nome, ...marca }));
  salvarIntegracoes(e.id, [{ id: "exemplo", tipo: "exemplo", nome: "Dados de exemplo", ativa: true }]);
  return e;
}

/** Empresa pelo domínio do pedido (domínio próprio ou subdomínio cadastrado na marca). */
export function empresaDoDominio(host: string | undefined): Empresa | null {
  const h = String(host ?? "").toLowerCase().replace(/:\d+$/, "");
  if (!h) return null;
  return listarEmpresas().find((e) => e.ativa && marca(e.id).dominios.includes(h)) ?? null;
}

// ------------------------------------------------------------------ marca

export const marca = (id: string): Marca => sanearMarca(ler(path.join(pastaEmpresa(id), "marca.json"), MARCA_PADRAO));
export const salvarMarca = (id: string, m: Marca) => gravar(path.join(pastaEmpresa(id), "marca.json"), m);

const TIPOS_IMAGEM: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg", "image/x-icon": "ico", "image/vnd.microsoft.icon": "ico" };
export const MAX_IMAGEM = 2 * 1024 * 1024;

/** Guarda uma imagem da marca. Devolve o nome do arquivo salvo. */
export function salvarImagem(id: string, tipo: string, mime: string, bytes: Uint8Array): string {
  const ext = TIPOS_IMAGEM[mime];
  if (!ext) throw new Error("Envie PNG, JPG, WEBP, SVG ou ICO.");
  if (bytes.length > MAX_IMAGEM) throw new Error("Imagem grande demais (máximo 2 MB).");
  const pasta = path.join(pastaEmpresa(id), "arquivos");
  fs.mkdirSync(pasta, { recursive: true });
  for (const antigo of fs.readdirSync(pasta).filter((n) => n.startsWith(`${tipo}.`))) fs.rmSync(path.join(pasta, antigo));
  const nome = `${tipo}.${ext}`;
  fs.writeFileSync(path.join(pasta, nome), bytes);
  return nome;
}

export function caminhoImagem(id: string, nome: string): { arquivo: string; mime: string } | null {
  if (!/^[\w-]+\.(png|jpg|webp|svg|ico)$/.test(nome)) return null;
  const arquivo = path.join(pastaEmpresa(id), "arquivos", nome);
  if (!fs.existsSync(arquivo)) return null;
  const ext = nome.split(".").pop()!;
  const mime = Object.entries(TIPOS_IMAGEM).find(([, e]) => e === ext)?.[0] ?? "application/octet-stream";
  return { arquivo, mime };
}

// ------------------------------------------------------------------ integrações e segredos

export const integracoes = (id: string) => ler<Integracao[]>(path.join(pastaEmpresa(id), "integracoes.json"), []);
export const salvarIntegracoes = (id: string, l: Integracao[]) => gravar(path.join(pastaEmpresa(id), "integracoes.json"), l);
export const segredos = (id: string): Segredos => {
  const s = ler<Partial<Segredos>>(path.join(pastaEmpresa(id), "segredos.json"), {});
  return { integracoes: s.integracoes ?? {}, ia: s.ia ?? {} };
};
export const salvarSegredos = (id: string, s: Segredos) => gravar(path.join(pastaEmpresa(id), "segredos.json"), s, true);

// ------------------------------------------------------------------ planilhas

export function pastaPlanilhas(id: string) {
  return path.join(pastaEmpresa(id), "planilhas");
}

// ------------------------------------------------------------------ usuários

const arqUsuarios = () => path.join(raiz(), "usuarios.json");
export const listarUsuarios = () => lerFixo<Usuario[]>(arqUsuarios(), []);

export function hashSenha(senha: string, sal = crypto.randomBytes(16).toString("hex")): string {
  return `scrypt$${sal}$${crypto.scryptSync(senha, sal, 64).toString("hex")}`;
}
export function senhaConfere(senha: string, hash: string): boolean {
  const [, sal, h] = hash.split("$");
  if (!sal || !h) return false;
  const a = Buffer.from(hashSenha(senha, sal).split("$")[2], "hex"), b = Buffer.from(h, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function criarUsuario(u: { email: string; nome: string; senha: string; empresaId: string; papel: Papel }): Usuario {
  const email = u.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("E-mail inválido.");
  if (u.senha.length < 8) throw new Error("A senha precisa de pelo menos 8 caracteres.");
  if (listarUsuarios().some((x) => x.email === email)) throw new Error("Já existe um usuário com este e-mail.");
  if (!empresa(u.empresaId)) throw new Error("Empresa inválida.");
  const novo: Usuario = { id: crypto.randomUUID(), email, nome: u.nome.trim().slice(0, 80) || email, hash: hashSenha(u.senha), empresaId: u.empresaId, papel: u.papel, criadoEm: new Date().toISOString() };
  gravar(arqUsuarios(), [...listarUsuarios(), novo], true);
  return novo;
}

export function removerUsuario(id: string, empresaId: string) {
  gravar(arqUsuarios(), listarUsuarios().filter((u) => !(u.id === id && u.empresaId === empresaId)), true);
}

/** Muda os dados do próprio usuário (tela Alterar Senha). Senha nova só com pelo menos 8 caracteres. */
export function atualizarUsuario(id: string, d: { nome?: string; email?: string; telefone?: string; senha?: string }): Usuario {
  const lista = listarUsuarios();
  const atual = lista.find((u) => u.id === id);
  if (!atual) throw new Error("Usuário não encontrado.");
  const novo: Usuario = { ...atual };
  if (d.nome !== undefined) {
    const nome = d.nome.replace(/[<>]/g, "").trim().slice(0, 80);
    if (nome.length < 2) throw new Error("Informe o nome.");
    novo.nome = nome;
  }
  if (d.email !== undefined) {
    const email = d.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("E-mail inválido.");
    if (lista.some((x) => x.email === email && x.id !== id)) throw new Error("Já existe um usuário com este e-mail.");
    novo.email = email;
  }
  if (d.telefone !== undefined) novo.telefone = d.telefone.replace(/[^\d()+\s-]/g, "").trim().slice(0, 20);
  if (d.senha !== undefined) {
    if (d.senha.length < 8) throw new Error("A senha precisa de pelo menos 8 caracteres.");
    novo.hash = hashSenha(d.senha);
  }
  gravar(arqUsuarios(), lista.map((u) => (u.id === id ? novo : u)), true);
  return novo;
}
