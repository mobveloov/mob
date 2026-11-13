// Ajudas das rotas da gestão: tratamento de erro, empresa do login, permissão de escrita e leitura dos cadastros.

import type { NextFunction, Request, Response } from "express";
import { cadastroPorId } from "../comum/cadastros.ts";
import { listar, type Registro } from "../cadastros/armazem.ts";
import { banco } from "../servidor/banco.ts";
import type { PapelApp } from "../apps/sessoes.ts";
import { agoraBr, normal } from "../servidor/util.ts";

export const ok = (fn: (req: Request, res: Response) => unknown) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e) {
    const status = (e as { status?: number }).status ?? 400;
    if (!res.headersSent) res.status(status).json({ erro: e instanceof Error ? e.message : "Erro." });
  }
};
export const emp = (req: Request) => req.ctx!.empresaId;
export const quem = (req: Request) => req.ctx!.usuario.email;

/** Só administrador (e plataforma). */
export function soAdmin(req: Request, res: Response, next: NextFunction) {
  const p = req.ctx?.usuario.papel;
  if (p === "plataforma" || p === "admin") return next();
  res.status(403).json({ erro: "Seu usuário só pode consultar esta parte." });
}

export const cad = (id: string) => cadastroPorId(id)!;
export const registros = (empresaId: string, id: string): Registro[] => listar(empresaId, cad(id));
export const texto = (v: unknown, max = 200) => (v == null ? "" : String(v).replace(/[<>]/g, "").trim().slice(0, max));
export const digitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");
export const contem = (v: unknown, busca: string) => !busca || normal(v).includes(normal(busca));
export const hojeBr = () => agoraBr().toISOString().slice(0, 10);

/** Página da lista (20 por página, como na referência). */
export function paginar<T>(l: T[], pagina: unknown, porPagina = 20) {
  const total = Math.max(1, Math.ceil(l.length / porPagina));
  const atual = Math.min(total, Math.max(1, Number(pagina) || 1));
  return { itens: l.slice((atual - 1) * porPagina, atual * porPagina), paginacao: { atual, totalPaginas: total, totalItens: l.length } };
}

/** Perfis dos apps (sem criar ninguém): favoritos, bloqueios, indicação, prêmios. */
export function perfisApp(empresaId: string, papel: PapelApp) {
  const linhas = banco().prepare("SELECT chave, codigo, indicado_por AS indicadoPor, dados FROM app_pessoas WHERE empresa = ? AND papel = ?").all(empresaId, papel) as Array<{ chave: string; codigo: string; indicadoPor: string; dados: string }>;
  return new Map(linhas.map((l) => {
    const d = JSON.parse(l.dados) as { bloqueados?: string[]; premios?: string[]; email?: string };
    return [l.chave, { codigo: l.codigo, indicadoPor: l.indicadoPor, bloqueados: d.bloqueados ?? [], premios: d.premios ?? [], email: d.email ?? "" }];
  }));
}

/** Período rápido -> [inicio, fim] (datas do painel, Brasília). */
export function periodo(nome: string, inicio?: unknown, fim?: unknown): [string, string] {
  const hoje = hojeBr();
  const dia = (n: number) => new Date(Date.parse(hoje) - n * 86_400_000).toISOString().slice(0, 10);
  const d = new Date(Date.parse(hoje));
  const semana = d.getUTCDay();
  switch (nome) {
    case "hoje": return [hoje, hoje];
    case "ontem": return [dia(1), dia(1)];
    case "esta_semana": return [dia(semana), hoje];
    case "semana_passada": return [dia(semana + 7), dia(semana + 1)];
    case "este_mes": return [`${hoje.slice(0, 7)}-01`, hoje];
    case "mes_passado": { const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)); const f = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0)); return [m.toISOString().slice(0, 10), f.toISOString().slice(0, 10)]; }
    case "este_ano": return [`${hoje.slice(0, 4)}-01-01`, hoje];
    case "personalizado": return [/^\d{4}-\d{2}-\d{2}$/.test(String(inicio)) ? String(inicio) : hoje, /^\d{4}-\d{2}-\d{2}$/.test(String(fim)) ? String(fim) : hoje];
    default: return ["0000-01-01", "9999-12-31"];
  }
}
