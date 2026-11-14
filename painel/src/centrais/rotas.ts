// Rotas das centrais (montadas em /api/centrais, depois do login). Tudo é cobrança e rede: só administrador (e a plataforma).
// A central consultada vem de ?central=ID e é conferida em rede.ts: só a própria ou uma associada. Senão: 404, sem dizer se existe.

import express, { type Request, type Response } from "express";
import { periodo } from "../config/financeiro.ts";
import { extratoDaCentral, montarCsv } from "../config/financeiro-visao.ts";
import { exigirPapel } from "../servidor/sessao.ts";
import { agoraBr } from "../servidor/util.ts";
import { csvDemonstrativo, demonstrativo, escolherPlano, escolherServicos, meusPlanos } from "./cobranca.ts";
import { centraisVisiveis, criarAssociada, desvincular, empresasLivres, ErroCentral, exigirVisivel, linhasDeControle, controleDe, salvarControle, vincular } from "./rede.ts";

export const rotasCentrais = express.Router();
const ok = (fn: (req: Request, res: Response) => unknown) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e) {
    if (!(e instanceof ErroCentral)) console.error("[centrais]", req.method, req.path, e instanceof Error ? e.message : e);
    if (!res.headersSent) res.status(e instanceof ErroCentral ? e.status : 400).json({ erro: e instanceof Error ? e.message : "Erro." });
  }
};
const emp = (req: Request) => req.ctx!.empresaId;
const plataforma = (req: Request) => req.ctx!.usuario.papel === "plataforma";
const q = (req: Request, k: string) => String(req.query[k] ?? "");
const admin = exigirPapel("admin");
const csv = (res: Response, nome: string, texto: string) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${nome}-${agoraBr().toISOString().slice(0, 10)}.csv"`);
  res.send(texto);
};

/** Seletor "Central principal e centrais associadas" do topo. Operador não recebe lista (não tem acesso a cobrança). */
rotasCentrais.get("/seletor", ok((req, res) => {
  const p = req.ctx!.usuario.papel;
  const lista = p === "operador" ? [] : centraisVisiveis(emp(req));
  res.json({ atual: emp(req), centrais: lista.length > 1 ? lista : [] });
}));

rotasCentrais.use(admin);

rotasCentrais.get("/rede", ok((req, res) => res.json({
  centrais: centraisVisiveis(emp(req)),
  podeAbrir: !centraisVisiveis(emp(req)).some((c) => c.id === emp(req) && c.tipo === "associada"),
  livres: plataforma(req) ? empresasLivres(emp(req)) : [],
})));
rotasCentrais.post("/associadas", ok((req, res) => res.status(201).json({ central: criarAssociada(emp(req), req.body ?? {}) })));
// Ligar uma empresa que já existe a uma principal mexe em outra empresa: só a plataforma.
rotasCentrais.post("/vincular", exigirPapel(), ok((req, res) => {
  if (!plataforma(req)) throw new ErroCentral("Só a plataforma liga uma empresa existente a uma principal.", 403);
  vincular(emp(req), String(req.body?.centralId ?? "")); res.json({ centrais: centraisVisiveis(emp(req)) });
}));
rotasCentrais.delete("/associadas/:id", ok((req, res) => {
  if (!plataforma(req)) throw new ErroCentral("Só a plataforma desfaz o vínculo de uma central.", 403);
  exigirVisivel(emp(req), req.params.id);
  desvincular(req.params.id); res.json({ centrais: centraisVisiveis(emp(req)) });
}));

rotasCentrais.get("/controle", ok((req, res) => res.json({ linhas: linhasDeControle(emp(req), plataforma(req)) })));
rotasCentrais.put("/controle/:id", ok((req, res) => res.json({ controle: salvarControle(emp(req), req.params.id, req.body ?? {}, plataforma(req)) })));

/** Extrato de uma central. A própria vê tudo; a principal só vê o da associada que permitiu, sem nomes de pessoas. */
function extratoVisivel(req: Request) {
  const alvo = exigirVisivel(emp(req), req.params.id);
  const p = periodo(q(req, "periodo"), q(req, "inicio"), q(req, "fim"));
  const x = extratoDaCentral(alvo, p);
  if (alvo === emp(req)) return { alvo, x };
  if (controleDe(alvo).exibirExtrato !== "Permitir") throw new ErroCentral("Esta central não permitiu exibir o extrato dela.", 403);
  const dias = x.dias.map((d) => ({ ...d, movimentos: d.movimentos.map((m) => ({ ...m, detalhe: "" })) }));
  return { alvo, x: { ...x, dias, pedidos: [], aguardando: 0 } };
}
rotasCentrais.get("/extrato/:id", ok((req, res) => res.json(extratoVisivel(req).x)));
rotasCentrais.get("/extrato/:id/csv", ok((req, res) => {
  const { alvo, x } = extratoVisivel(req);
  const linhas = x.dias.flatMap((d) => [...d.movimentos].reverse().map((m) => [d.dia, m.em, m.tipo === "entrada" ? "Entrada" : "Saída", m.descricao, m.detalhe, m.tipo === "entrada" ? m.valor : -m.valor]));
  csv(res, `extrato-central-${alvo}`, montarCsv(["Dia", "Momento", "Tipo", "Descrição", "Detalhe", "Valor"], linhas));
}));

rotasCentrais.get("/planos", ok((req, res) => res.json(meusPlanos(emp(req), q(req, "central") || undefined))));
rotasCentrais.put("/planos", ok((req, res) => { const p = escolherPlano(emp(req), req.body?.central, req.body?.plano); res.json({ ...meusPlanos(emp(req), req.body?.central), plano: p }); }));
rotasCentrais.put("/servicos", ok((req, res) => { escolherServicos(emp(req), req.body?.central, req.body?.servicos); res.json(meusPlanos(emp(req), req.body?.central)); }));

rotasCentrais.get("/demonstrativo", ok((req, res) => res.json(demonstrativo(emp(req), q(req, "central") || undefined, q(req, "competencia")))));
rotasCentrais.get("/demonstrativo/csv", ok((req, res) => csv(res, "demonstrativo-mensal", csvDemonstrativo(emp(req), q(req, "central") || undefined, q(req, "competencia")))));
