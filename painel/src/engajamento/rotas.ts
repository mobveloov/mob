// Rotas do Mapa de engajamento (/api/engajamento). Registrar DEPOIS do app.use("/api", exigirLogin) do index.ts.
// A empresa vem SEMPRE do login (req.ctx): operador e administrador só enxergam a própria empresa.
//
//   GET /mapa?papel=motoristas|passageiros   indicadores, faixas, contagens e pontos do mapa
//   GET /historico                           dia a dia do período e pontos de embarque
//   GET /config                              período e faixas da empresa (com os padrões)
//   PUT /config                              salva período e/ou faixas ({ periodo?, papel?, faixas? }); só administrador

import { Router, type Request, type Response } from "express";
import { exigirPapel } from "../servidor/sessao.ts";
import { FAIXAS_PADRAO, INDICADORES, PAPEIS, historicoEngajamento, lerConfig, mapaEngajamento, salvarConfig, type Papel } from "./calculo.ts";

export const rotasEngajamento = Router();

const ok = (fn: (req: Request, res: Response) => unknown) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e) { if (!res.headersSent) res.status(400).json({ erro: e instanceof Error ? e.message : "Erro." }); }
};
const emp = (req: Request) => req.ctx!.empresaId;

rotasEngajamento.use(exigirPapel("admin", "operador"));

rotasEngajamento.get("/mapa", ok((req, res) => {
  const papel = String(req.query.papel ?? "passageiros") as Papel;
  if (!PAPEIS.includes(papel)) return res.status(400).json({ erro: "Escolha motoristas ou passageiros." });
  res.json(mapaEngajamento(emp(req), papel));
}));

rotasEngajamento.get("/historico", ok((req, res) => res.json(historicoEngajamento(emp(req)))));

rotasEngajamento.get("/config", ok((req, res) => res.json({ ...lerConfig(emp(req)), padrao: FAIXAS_PADRAO, indicadores: INDICADORES })));

rotasEngajamento.put("/config", exigirPapel("admin"), ok((req, res) => {
  const b = (req.body ?? {}) as { periodo?: unknown; papel?: Papel; faixas?: unknown };
  res.json(salvarConfig(emp(req), { periodo: b.periodo, papel: b.papel, faixas: b.faixas }));
}));
