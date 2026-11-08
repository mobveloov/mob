// Login dos apps pelo telefone, com código de 6 dígitos.
//
// 1. O app pede o código (POST /entrar/codigo). O código vai pelo WhatsApp da empresa (o mesmo provedor do CRM).
//    Em desenvolvimento também aparece no console do servidor. Com APPS_MOSTRAR_CODIGO=1 (nunca em produção)
//    o código volta na resposta, para testes e demonstração.
// 2. O app manda o código (POST /entrar) e recebe um token. O token vai no cabeçalho Authorization: Bearer <token>.
//    No servidor só fica o hash do token. A sessão dura 60 dias e é sempre de UMA empresa.
//
// Motorista: só entra quem está no cadastro Motoristas com situação "Ativo".
// Passageiro: qualquer telefone; bloqueado ou suspenso no cadastro Passageiros não entra.

import crypto from "node:crypto";
import { cadastroPorId } from "../comum/cadastros.ts";
import { listar, mesclar } from "../cadastros/armazem.ts";
import { provedorDaEmpresa } from "../crm/whatsapp.ts";
import { arquivo, gravar, ler, limitador, soDigitos } from "./armazem.ts";

export type PapelApp = "passageiro" | "motorista";
export const PAPEIS: PapelApp[] = ["passageiro", "motorista"];

export interface SessaoApp {
  hash: string;
  empresaId: string;
  papel: PapelApp;
  telefone: string;
  /** Motorista: id no cadastro Motoristas. Passageiro: o telefone. */
  chave: string;
  criadaEm: number;
  expira: number;
}

const DURACAO_MS = 60 * 24 * 3600_000;
const CODIGO_MS = 10 * 60_000;
const MAX_SESSOES = 20_000;

const hash = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const arqSessoes = (empresaId: string) => arquivo(empresaId, "sessoes.json");

export function telefoneValido(t: string) {
  return t.length >= 10 && t.length <= 13;
}

const motoristaDoTelefone = (empresaId: string, telefone: string) =>
  listar(empresaId, cadastroPorId("motoristas")!).find((m) => soDigitos(m.telefone) === telefone);
const clienteDoTelefone = (empresaId: string, telefone: string) =>
  listar(empresaId, cadastroPorId("clientes")!).find((c) => soDigitos(c.telefone) === telefone);

/** Confere se o telefone pode entrar no app desse papel. Devolve o erro ou null. */
function impedimento(empresaId: string, papel: PapelApp, telefone: string): string | null {
  if (papel === "motorista") {
    const m = motoristaDoTelefone(empresaId, telefone);
    if (!m) return "Este telefone não está no cadastro de motoristas. Fale com a central.";
    if (m.status !== "Ativo") return "Seu cadastro de motorista não está ativo. Fale com a central.";
    return null;
  }
  const c = clienteDoTelefone(empresaId, telefone);
  if (c && (c.status === "Bloqueado" || c.status === "Suspenso")) return "Este telefone está bloqueado. Fale com a central.";
  return null;
}

// ------------------------------------------------------------------ código

interface Codigo { hash: string; expira: number; erros: number }
const codigos = new Map<string, Codigo>();
const podePedirPorTelefone = limitador(5, 60 * 60_000);
// Pedidos de código por IP por hora (APPS_CODIGOS_POR_IP, padrão 30). Atrás de proxy, ligue CONFIAR_PROXY.
const podePedirPorIp = limitador(() => Number(process.env.APPS_CODIGOS_POR_IP) || 30, 60 * 60_000);

/** Só para os testes. */
export const limparCodigos = () => codigos.clear();

export async function pedirCodigo(empresaId: string, papel: PapelApp, telefoneBruto: string, ip = ""): Promise<{ enviado: boolean; codigoTeste?: string }> {
  const telefone = soDigitos(telefoneBruto);
  if (!PAPEIS.includes(papel)) throw new Error("App inválido.");
  if (!telefoneValido(telefone)) throw new Error("Informe o telefone com DDD.");
  if (!podePedirPorTelefone(`${empresaId}:${telefone}`) || !podePedirPorIp(ip)) throw new Error("Muitos pedidos de código. Espere um pouco.");
  const erro = impedimento(empresaId, papel, telefone);
  if (erro) throw new Error(erro);
  const codigo = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  codigos.set(`${empresaId}:${papel}:${telefone}`, { hash: hash(codigo), expira: Date.now() + CODIGO_MS, erros: 0 });
  const r = await provedorDaEmpresa(empresaId).enviar(telefone, `Seu código para entrar no app: ${codigo}. Vale por 10 minutos. Não passe para ninguém.`).catch(() => ({ ok: false as const }));
  const producao = process.env.NODE_ENV === "production";
  if (!producao && process.env.NODE_ENV !== "test") console.log(`[apps] código de ${papel} ${telefone.slice(0, -4)}****: ${codigo}`);
  const mostrar = !producao && process.env.APPS_MOSTRAR_CODIGO === "1";
  return { enviado: r.ok, ...(mostrar ? { codigoTeste: codigo } : {}) };
}

// ------------------------------------------------------------------ sessão

export function entrar(empresaId: string, papel: PapelApp, telefoneBruto: string, codigo: string): { token: string; sessao: SessaoApp } {
  const telefone = soDigitos(telefoneBruto);
  const k = `${empresaId}:${papel}:${telefone}`;
  const c = codigos.get(k);
  if (!c || c.expira < Date.now()) throw new Error("Código vencido. Peça outro.");
  const igual = c.hash.length === hash(String(codigo ?? "")).length && crypto.timingSafeEqual(Buffer.from(c.hash), Buffer.from(hash(String(codigo ?? ""))));
  if (!igual) {
    if (++c.erros >= 5) codigos.delete(k);
    throw new Error("Código errado.");
  }
  codigos.delete(k);
  const erro = impedimento(empresaId, papel, telefone);
  if (erro) throw new Error(erro);
  const chave = papel === "motorista" ? motoristaDoTelefone(empresaId, telefone)!.id : telefone;
  const token = crypto.randomBytes(32).toString("base64url");
  const agora = Date.now();
  const sessao: SessaoApp = { hash: hash(token), empresaId, papel, telefone, chave, criadaEm: agora, expira: agora + DURACAO_MS };
  const lista = ler<SessaoApp[]>(arqSessoes(empresaId), []).filter((s) => s.expira > agora).slice(-MAX_SESSOES);
  gravar(arqSessoes(empresaId), [...lista, sessao]);
  return { token, sessao };
}

/** Sessão do token, só se for da empresa pedida e o cadastro ainda deixar entrar. */
export function sessaoDoToken(empresaId: string, token: string): SessaoApp | null {
  if (!token || token.length > 100) return null;
  const h = hash(token);
  const s = ler<SessaoApp[]>(arqSessoes(empresaId), []).find((x) => x.hash === h);
  if (!s || s.empresaId !== empresaId || s.expira < Date.now()) return null;
  if (impedimento(empresaId, s.papel, s.telefone)) return null;
  return s;
}

export function sair(empresaId: string, token: string) {
  const h = hash(token);
  gravar(arqSessoes(empresaId), ler<SessaoApp[]>(arqSessoes(empresaId), []).filter((s) => s.hash !== h));
}

// ------------------------------------------------------------------ quem sou eu

export function eu(empresaId: string, s: SessaoApp) {
  if (s.papel === "motorista") {
    const m = listar(empresaId, cadastroPorId("motoristas")!).find((x) => x.id === s.chave);
    return {
      papel: s.papel, telefone: s.telefone, nome: String(m?.nome ?? ""),
      veiculo: String(m?.veiculo ?? ""), placa: String(m?.placa ?? ""), categorias: String(m?.categorias ?? ""),
      validadeCnh: m?.validadeCnh ?? null, validadeLicenciamento: m?.validadeLicenciamento ?? null,
    };
  }
  const c = clienteDoTelefone(empresaId, s.telefone);
  return { papel: s.papel, telefone: s.telefone, nome: String(c?.nome ?? "") };
}

export function salvarNomePassageiro(empresaId: string, s: SessaoApp, nome: string) {
  const n = nome.replace(/[<>]/g, "").trim().slice(0, 80);
  if (n.length < 2) throw new Error("Informe seu nome.");
  mesclar(empresaId, cadastroPorId("clientes")!, [{ nome: n, telefone: s.telefone, status: "Ativo" }], "app");
  return eu(empresaId, s);
}
