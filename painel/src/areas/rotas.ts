// Rotas de Plantão, Ruas, Funil de Clientes e Mapa de Bairros (/api/areas), montadas depois do login.
// A empresa vem SEMPRE do login (req.ctx). Plantão: admin e operador mudam; Ruas: só admin. Leitura: quem está logado.
//
//   GET    /plantoes?dataInicial&horaInicial&dataFinal&horaFinal        lista (filtros)
//   POST   /plantoes                                                    criar
//   GET    /plantoes/:id            PUT /plantoes/:id    DELETE /plantoes/:id
//   POST   /plantoes/:id/motoristas {motoristaId}     DELETE /plantoes/:id/motoristas/:motoristaId
//   GET    /motoristas/busca?q=                                         campo "Vtr / Motorista"
//   GET    /ruas      POST /ruas      PUT /ruas/:id      DELETE /ruas/:id
//   GET    /funil?inicio&fim&canal            resumo e funil       GET /funil/lista?aba&pagina...     GET /funil/csv?aba...
//   GET    /bairros?inicio&fim                bairros e passageiros GET /bairros/csv|xml?situacao&bairro

import express, { type Request, type Response } from "express";
import { exigirPapel } from "../servidor/sessao.ts";
import { agoraBr } from "../servidor/util.ts";
import { abaDoFunil, csvDoFunil, csvDoMapa, lerPeriodo, mapaDeBairros, resumoDoFunil, xmlDoMapa, type AbaFunil } from "./demanda.ts";
import { adicionarMotorista, atualizarPlantao, buscarMotoristas, criarPlantao, detalharPlantao, listarPlantoes, removerMotorista, removerPlantao } from "./plantao.ts";
import { atualizarRegra, criarRegra, regrasDeVia, removerRegra } from "./ruas.ts";

export const rotasAreas = express.Router();
const ok = (fn: (req: Request, res: Response) => unknown) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro.";
    if (!res.headersSent) res.status(/não encontrad/i.test(msg) ? 404 : 400).json({ erro: msg });
  }
};
const emp = (req: Request) => req.ctx!.empresaId;
const admin = exigirPapel("admin");
const central = exigirPapel("admin", "operador");
const q = (req: Request, k: string) => String(req.query[k] ?? "").slice(0, 200);
const id = (req: Request, k = "id") => String(req.params[k] ?? "").slice(0, 80);
const hoje = () => agoraBr().toISOString().slice(0, 10);

// ------------------------------------------------------------------ plantão
rotasAreas.get("/plantoes", ok((req, res) => {
  res.json({ plantoes: listarPlantoes(emp(req), { dataInicial: q(req, "dataInicial"), horaInicial: q(req, "horaInicial"), dataFinal: q(req, "dataFinal"), horaFinal: q(req, "horaFinal") }) });
}));
rotasAreas.post("/plantoes", central, ok((req, res) => res.json({ plantao: criarPlantao(emp(req), req.body ?? {}) })));
rotasAreas.get("/plantoes/:id", ok((req, res) => res.json({ plantao: detalharPlantao(emp(req), id(req)) })));
rotasAreas.put("/plantoes/:id", central, ok((req, res) => { atualizarPlantao(emp(req), id(req), req.body ?? {}); res.json({ plantao: detalharPlantao(emp(req), id(req)) }); }));
rotasAreas.delete("/plantoes/:id", central, ok((req, res) => { removerPlantao(emp(req), id(req)); res.json({ ok: true }); }));
rotasAreas.post("/plantoes/:id/motoristas", central, ok((req, res) => res.json({ plantao: adicionarMotorista(emp(req), id(req), String(req.body?.motoristaId ?? "")) })));
rotasAreas.delete("/plantoes/:id/motoristas/:motoristaId", central, ok((req, res) => res.json({ plantao: removerMotorista(emp(req), id(req), id(req, "motoristaId")) })));
rotasAreas.get("/motoristas/busca", ok((req, res) => res.json({ motoristas: buscarMotoristas(emp(req), q(req, "q")) })));

// ------------------------------------------------------------------ ruas (regras de via)
rotasAreas.get("/ruas", ok((req, res) => res.json({ regras: regrasDeVia(emp(req)) })));
rotasAreas.post("/ruas", admin, ok((req, res) => res.json({ regra: criarRegra(emp(req), req.body ?? {}) })));
rotasAreas.put("/ruas/:id", admin, ok((req, res) => res.json({ regra: atualizarRegra(emp(req), id(req), req.body ?? {}) })));
rotasAreas.delete("/ruas/:id", admin, ok((req, res) => { removerRegra(emp(req), id(req)); res.json({ ok: true }); }));

// ------------------------------------------------------------------ funil de clientes
const CANAIS = ["painel", "bot", "totem", "app", "macaneta"];
const filtroFunil = (req: Request) => ({ ...lerPeriodo(req.query.inicio, req.query.fim), canal: CANAIS.includes(q(req, "canal")) ? q(req, "canal") : undefined, pagina: Number(req.query.pagina) || 1 });
const abaDe = (req: Request): AbaFunil => (["abandono", "corridas", "leads"].includes(q(req, "aba")) ? q(req, "aba") as AbaFunil : "abandono");
const baixar = (res: Response, tipo: string, nome: string, corpo: string) => {
  res.setHeader("Content-Type", `${tipo}; charset=utf-8`);
  res.setHeader("Content-Disposition", `attachment; filename="${nome}-${hoje()}.${tipo.includes("xml") ? "xml" : "csv"}"`);
  res.send(corpo);
};
rotasAreas.get("/funil", ok((req, res) => res.json(resumoDoFunil(emp(req), filtroFunil(req)))));
rotasAreas.get("/funil/lista", ok((req, res) => res.json(abaDoFunil(emp(req), abaDe(req), filtroFunil(req)))));
rotasAreas.get("/funil/csv", ok((req, res) => baixar(res, "text/csv", `funil-${abaDe(req)}`, csvDoFunil(emp(req), abaDe(req), filtroFunil(req)))));

// ------------------------------------------------------------------ mapa de bairros e demanda
rotasAreas.get("/bairros", ok((req, res) => res.json(mapaDeBairros(emp(req), lerPeriodo(req.query.inicio, req.query.fim)))));
rotasAreas.get("/bairros/csv", ok((req, res) => baixar(res, "text/csv", "bairros", csvDoMapa(emp(req), lerPeriodo(req.query.inicio, req.query.fim), q(req, "situacao"), q(req, "bairro")))));
rotasAreas.get("/bairros/xml", ok((req, res) => baixar(res, "application/xml", "bairros", xmlDoMapa(emp(req), lerPeriodo(req.query.inicio, req.query.fim), q(req, "situacao"), q(req, "bairro")))));
