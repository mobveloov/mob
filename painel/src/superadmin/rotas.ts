// Rotas do painel do dono da plataforma (/api/superadmin). SÓ o ADMIN Mestre (papel "plataforma"): o porteiro geral
// (REGRAS_API) e este roteador conferem, então quem não é dono leva 403 mesmo com requisição forjada.
//
//   GET    /empresas?competencia=AAAA-MM         lista com plano, recursos, marca, rede e uso
//   POST   /empresas                              cria empresa (e o primeiro ADMIN, se vier e-mail e senha)
//   POST   /empresas/:id/suspender {motivo}       suspensa não loga (painel nem apps)
//   POST   /empresas/:id/reativar
//   POST   /empresas/:id/entrar                   confere e devolve a empresa: o painel passa a mandar X-Empresa
//   PUT    /empresas/:id/plano {plano}
//   PUT    /empresas/:id/recursos {desligados}    liga e desliga módulos
//   PUT    /empresas/:id/marca {produto, nomeExibido, corPrimaria, dominios}
//   GET    /uso?competencia=AAAA-MM  e  /uso/csv  uso e faturamento por empresa
//   GET    /centrais   POST /centrais/vincular   DELETE /centrais/associadas/:id   POST /centrais/:principal/associadas

import express, { type Request, type Response } from "express";
import { exigirPapel } from "../servidor/sessao.ts";
import { empresa } from "../servidor/dados.ts";
import { montarCsv } from "../config/financeiro-visao.ts";
import { criarAssociada, desvincular, ErroCentral, vincular } from "../centrais/rede.ts";
import { agoraBr } from "../servidor/util.ts";
import { criarNovaEmpresa, definirMarca, definirPlano, definirRecursos, ErroSuperadmin, listarResumos, MODULOS, PLANOS, reativar, redeDeCentrais, resumoDaEmpresa, suspender, usoEFaturamento } from "./superadmin.ts";

export const rotasSuperadmin = express.Router();
rotasSuperadmin.use(exigirPapel()); // sem argumentos: só o ADMIN Mestre

const ok = (fn: (req: Request, res: Response) => unknown) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e) {
    if (!res.headersSent) res.status(e instanceof ErroSuperadmin || e instanceof ErroCentral ? e.status : 400).json({ erro: e instanceof Error ? e.message : "Erro." });
  }
};
const id = (req: Request) => String(req.params.id ?? "");
const q = (req: Request, k: string) => String(req.query[k] ?? "");

rotasSuperadmin.get("/empresas", ok((req, res) => res.json({
  empresas: listarResumos(q(req, "competencia")),
  planos: PLANOS.map((p) => ({ id: p.id, nome: p.nome, mensalidade: p.mensalidade })),
  recursos: MODULOS.map((m) => ({ id: m.id, nome: m.nome, descricao: m.descricao })),
})));
rotasSuperadmin.post("/empresas", ok((req, res) => res.status(201).json({ empresa: criarNovaEmpresa(req.body ?? {}) })));
rotasSuperadmin.post("/empresas/:id/suspender", ok((req, res) => res.json({ empresa: suspender(id(req), req.body?.motivo, req.ctx!.usuario.email) })));
rotasSuperadmin.post("/empresas/:id/reativar", ok((req, res) => res.json({ empresa: reativar(id(req)) })));
rotasSuperadmin.post("/empresas/:id/entrar", ok((req, res) => {
  if (!empresa(id(req))) throw new ErroSuperadmin("Empresa não encontrada.", 404);
  console.log(`[superadmin] ${req.ctx!.usuario.email} entrou como a empresa ${id(req)}`);
  res.json({ empresa: resumoDaEmpresa(id(req)) });
}));
rotasSuperadmin.put("/empresas/:id/plano", ok((req, res) => res.json({ empresa: definirPlano(id(req), req.body?.plano) })));
rotasSuperadmin.put("/empresas/:id/recursos", ok((req, res) => { definirRecursos(id(req), req.body?.desligados); res.json({ empresa: resumoDaEmpresa(id(req)) }); }));
rotasSuperadmin.put("/empresas/:id/marca", ok((req, res) => res.json({ empresa: definirMarca(id(req), req.body ?? {}) })));

rotasSuperadmin.get("/uso", ok((req, res) => res.json(usoEFaturamento(q(req, "competencia")))));
rotasSuperadmin.get("/uso/csv", ok((req, res) => {
  const u = usoEFaturamento(q(req, "competencia"));
  const linhas = u.empresas.map((e) => [e.nome, e.ativa ? "Ativa" : "Suspensa", e.plano, e.corridasFinalizadas, e.receitaBruta, e.tarifas, e.aPagar, e.motoristas, e.motoristasAtivos, e.passageiros, e.usuarios]);
  linhas.push(["Total", "", "", u.totais.corridasFinalizadas, u.totais.receitaBruta, u.totais.tarifas, u.totais.aPagar, u.totais.motoristas, u.totais.motoristasAtivos, "", ""]);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="uso-plataforma-${u.competencia}-${agoraBr().toISOString().slice(0, 10)}.csv"`);
  res.send(montarCsv(["Empresa", "Situação", "Plano", "Corridas finalizadas", "Receita bruta", "Tarifas", "A pagar à plataforma", "Motoristas", "Motoristas ativos", "Passageiros", "Usuários"], linhas));
}));

rotasSuperadmin.get("/centrais", ok((_req, res) => res.json(redeDeCentrais())));
rotasSuperadmin.post("/centrais/vincular", ok((req, res) => { vincular(String(req.body?.principalId ?? ""), String(req.body?.associadaId ?? "")); res.json(redeDeCentrais()); }));
rotasSuperadmin.delete("/centrais/associadas/:id", ok((req, res) => { desvincular(id(req)); res.json(redeDeCentrais()); }));
rotasSuperadmin.post("/centrais/:id/associadas", ok((req, res) => { const central = criarAssociada(id(req), req.body ?? {}); res.status(201).json({ central, ...redeDeCentrais() }); }));
