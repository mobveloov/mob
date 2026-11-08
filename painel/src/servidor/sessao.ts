// Login e regras de acesso. A sessão fica num cookie assinado (HttpOnly). A empresa de cada pedido vem SEMPRE
// do usuário logado, nunca da URL: assim uma empresa não consegue ver dados de outra.
// Só o papel "plataforma" (dono do SaaS) pode trocar de empresa, pelo cabeçalho X-Empresa.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { NextFunction, Request, Response } from "express";
import { empresa, listarUsuarios, raiz, type Papel, type Usuario } from "./dados.ts";

const DURACAO_MS = 12 * 3600_000;

let segredoCache: string | null = null;
function segredo(): string {
  if (segredoCache) return segredoCache;
  const env = (process.env.SESSAO_SEGREDO ?? "").trim();
  if (env.length >= 32) return (segredoCache = env);
  // Sem SESSAO_SEGREDO: gera um e guarda na pasta de dados (fora do Git). Em produção, defina no .env.
  const arq = path.join(raiz(), ".segredo-sessao");
  try { segredoCache = fs.readFileSync(arq, "utf8").trim(); } catch { /* cria */ }
  if (!segredoCache || segredoCache.length < 32) {
    segredoCache = crypto.randomBytes(48).toString("hex");
    fs.mkdirSync(raiz(), { recursive: true });
    fs.writeFileSync(arq, segredoCache, { mode: 0o600 });
  }
  return segredoCache;
}

const assinar = (s: string) => crypto.createHmac("sha256", segredo()).update(s).digest("base64url");

export function criarCookie(res: Response, req: Request, usuarioId: string) {
  const dados = Buffer.from(JSON.stringify({ u: usuarioId, x: Date.now() + DURACAO_MS })).toString("base64url");
  const seguro = req.secure || req.headers["x-forwarded-proto"] === "https";
  res.cookie("sessao", `${dados}.${assinar(dados)}`, { httpOnly: true, sameSite: "lax", secure: seguro, maxAge: DURACAO_MS, path: "/" });
}

export const apagarCookie = (res: Response) => res.clearCookie("sessao", { path: "/" });

function lerCookie(req: Request): string | null {
  const bruto = req.headers.cookie ?? "";
  const m = bruto.split(/;\s*/).find((c) => c.startsWith("sessao="));
  if (!m) return null;
  const [dados, sig] = decodeURIComponent(m.slice(7)).split(".");
  if (!dados || !sig) return null;
  const esperado = assinar(dados);
  if (esperado.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(sig))) return null;
  try {
    const { u, x } = JSON.parse(Buffer.from(dados, "base64url").toString()) as { u: string; x: number };
    return x > Date.now() ? u : null;
  } catch { return null; }
}

export interface Contexto { usuario: Usuario; empresaId: string }
declare module "express-serve-static-core" { interface Request { ctx?: Contexto } }

/** Exige login. Define req.ctx com a empresa do usuário. */
export function exigirLogin(req: Request, res: Response, next: NextFunction) {
  const id = lerCookie(req);
  const usuario = id ? listarUsuarios().find((u) => u.id === id) : undefined;
  if (!usuario) return res.status(401).json({ erro: "Entre de novo." });
  let empresaId = usuario.empresaId;
  const pedida = String(req.headers["x-empresa"] ?? "");
  if (usuario.papel === "plataforma" && pedida && empresa(pedida)) empresaId = pedida;
  const e = empresa(empresaId);
  if (!e || (!e.ativa && usuario.papel !== "plataforma")) return res.status(403).json({ erro: "Empresa desativada." });
  req.ctx = { usuario, empresaId };
  next();
}

/** Exige um dos papéis. "plataforma" sempre passa. */
export const exigirPapel = (...papeis: Papel[]) => (req: Request, res: Response, next: NextFunction) => {
  const p = req.ctx?.usuario.papel;
  if (p === "plataforma" || (p && papeis.includes(p))) return next();
  res.status(403).json({ erro: "Seu usuário não tem acesso a esta parte." });
};

// Tentativas de login: no máximo 8 por 10 minutos por IP.
const tentativas = new Map<string, number[]>();
export function podeTentar(ip: string): boolean {
  const agora = Date.now();
  const l = (tentativas.get(ip) ?? []).filter((t) => agora - t < 600_000);
  l.push(agora);
  tentativas.set(ip, l);
  return l.length <= 8;
}
