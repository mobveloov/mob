// Rotas do Mapa de engajamento (/api/engajamento). Registrar DEPOIS do app.use("/api", exigirLogin) do index.ts.
// A empresa vem SEMPRE do login (req.ctx): operador e administrador só enxergam a própria empresa.
//
//   GET  /mapa?papel=&situacao=A,S&categoria=id,id   indicadores, faixas, contagens e régua (motoristas aceita filtros)
//   GET  /lista?papel=&indicador=&faixa=0|1|2        pessoas de uma faixa ("Ver motoristas / Ver passageiros")
//   GET  /config                                    limites e período de cada indicador da empresa
//   PUT  /config                                    { papel, indicador, a, b, periodo? }; só administrador
//   POST /acao                                      { papel, indicador, faixa, tipo, titulo?, texto?, status? } sobre a faixa
//   GET  /historico                                 ações já feitas pelo mapa

import { Router, type Request, type Response } from "express";
import { cadastroPorId } from "../comum/cadastros.ts";
import { atualizar, listar } from "../cadastros/armazem.ts";
import { dispararPara } from "./acoes.ts";
import { exigirPapel } from "../servidor/sessao.ts";
import { INDICADORES, PAPEIS, SITUACOES, historicoAcoes, lerConfig, listaDaFaixa, mapaEngajamento, registrarAcao, salvarConfig, type FiltroMotoristas, type Papel } from "./calculo.ts";

export const rotasEngajamento = Router();

const ok = (fn: (req: Request, res: Response) => unknown) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e) { if (!res.headersSent) res.status(400).json({ erro: e instanceof Error ? e.message : "Erro." }); }
};
const emp = (req: Request) => req.ctx!.empresaId;
const papelDe = (v: unknown): Papel => {
  const p = String(v ?? "passageiros") as Papel;
  if (!PAPEIS.includes(p)) throw new Error("Escolha motoristas ou passageiros.");
  return p;
};
const lista = (v: unknown) => String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const filtroDe = (q: Record<string, unknown>): FiltroMotoristas => {
  const sit = lista(q.situacao).filter((s) => SITUACOES.some((x) => x.id === s));
  const cat = q.categoria === undefined ? null : lista(q.categoria);
  return { situacoes: q.situacao === undefined ? ["A"] : sit, categorias: cat };
};

rotasEngajamento.use(exigirPapel("admin", "operador"));

rotasEngajamento.get("/mapa", ok((req, res) => res.json(mapaEngajamento(emp(req), papelDe(req.query.papel), filtroDe(req.query)))));

rotasEngajamento.get("/lista", ok((req, res) => {
  const faixa = Number(req.query.faixa);
  res.json(listaDaFaixa(emp(req), papelDe(req.query.papel), String(req.query.indicador ?? ""), faixa, filtroDe(req.query)));
}));

rotasEngajamento.get("/config", ok((req, res) => res.json({ config: lerConfig(emp(req)), indicadores: INDICADORES })));

rotasEngajamento.put("/config", exigirPapel("admin"), ok((req, res) => {
  const b = (req.body ?? {}) as { papel?: string; indicador?: string; a?: unknown; b?: unknown; periodo?: unknown };
  res.json(salvarConfig(emp(req), { papel: papelDe(b.papel), indicador: String(b.indicador ?? ""), a: b.a, b: b.b, periodo: b.periodo }));
}));

rotasEngajamento.get("/historico", ok((req, res) => res.json({ acoes: historicoAcoes(emp(req)).slice().reverse() })));

rotasEngajamento.post("/acao", ok(async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const papel = papelDe(b.papel);
  const indicador = String(b.indicador ?? "");
  const tipo = String(b.tipo ?? "");
  const tiposOk = papel === "motoristas" ? ["notificacao", "mensagem", "desafio", "status"] : ["notificacao", "cupom", "mensagem"];
  if (!tiposOk.includes(tipo)) throw new Error("Ação inválida para este grupo.");
  const alvo = listaDaFaixa(emp(req), papel, indicador, Number(b.faixa), filtroDe(b));
  if (!alvo.pessoas.length) throw new Error("Não há ninguém nesta faixa.");
  const por = req.ctx!.usuario.nome || req.ctx!.usuario.email;
  let detalhe = "";
  let enviados = 0;
  if (tipo === "status") {
    const novo = String(b.status ?? "");
    if (req.ctx!.usuario.papel !== "admin") throw new Error("Só o administrador altera a situação.");
    if (!["Ativo", "Bloqueado", "Inativo", "Em análise", "Fila de espera"].includes(novo)) throw new Error("Escolha a nova situação.");
    const cad = cadastroPorId("motoristas")!;
    const registros = new Map(listar(emp(req), cad).map((r) => [r.id, r]));
    for (const p of alvo.pessoas) atualizar(emp(req), cad, p.id, { ...registros.get(p.id), status: novo }, por);
    enviados = alvo.pessoas.length;
    detalhe = `Situação alterada para ${novo}.`;
  } else {
    const titulo = String(b.titulo ?? "").trim().slice(0, 60);
    const texto = String(b.texto ?? "").trim().slice(0, 500);
    if (tipo !== "mensagem" && !titulo) throw new Error("Preencha o título.");
    if (!texto && tipo !== "cupom") throw new Error("Escreva a mensagem.");
    const codigo = String(b.cupom ?? "").trim().slice(0, 30);
    if (tipo === "cupom" && !codigo) throw new Error("Informe o código do cupom.");
    enviados = await dispararPara(emp(req), papel, tipo as "notificacao" | "mensagem" | "desafio" | "cupom", alvo.pessoas.map((p) => ({ chave: p.id, nome: p.nome })), { titulo, texto, cupom: codigo });
    detalhe = (tipo === "mensagem" ? texto : `${titulo}: ${texto || `cupom ${codigo}`}`).slice(0, 200);
  }
  registrarAcao(emp(req), { por, papel, indicador: alvo.indicador, faixa: `${alvo.faixa} (${alvo.limite})`, tipo, destinatarios: enviados, detalhe });
  res.json({ ok: true, destinatarios: enviados });
}));
