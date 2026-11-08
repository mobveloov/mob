// Rotas de endereços (/api/enderecos), com login. A empresa vem do usuário logado.
import { Router, type Request, type Response } from "express";
import { exigirPapel } from "../servidor/sessao.ts";
import { buscarEndereco, buscarMunicipios, enderecoDoPonto, lerConfig, rota, salvarConfig, situacao } from "./index.ts";

export const rotasEnderecos = Router();
const emp = (req: Request) => req.ctx!.empresaId;
const ok = (fn: (req: Request, res: Response) => unknown) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e) { if (!res.headersSent) res.status(400).json({ erro: e instanceof Error ? e.message : "Erro." }); }
};

rotasEnderecos.get("/situacao", ok((req, res) => res.json(situacao(emp(req)))));
rotasEnderecos.get("/municipios", ok((req, res) => res.json({ municipios: buscarMunicipios(String(req.query.q ?? "")) })));
rotasEnderecos.put("/config", exigirPapel("admin"), ok((req, res) => res.json(salvarConfig(emp(req), { municipios: req.body?.municipios ?? lerConfig(emp(req)).municipios }))));
rotasEnderecos.get("/buscar", ok((req, res) => res.json(buscarEndereco(emp(req), String(req.query.q ?? "").slice(0, 200)))));
rotasEnderecos.get("/ponto", ok((req, res) => res.json({ endereco: enderecoDoPonto(emp(req), Number(req.query.lat), Number(req.query.lng)) })));
rotasEnderecos.get("/rota", ok(async (req, res) => {
  const n = (k: string) => Number(req.query[k]);
  if (![n("lat1"), n("lng1"), n("lat2"), n("lng2")].every(Number.isFinite)) throw new Error("Pontos inválidos.");
  res.json(await rota({ lat: n("lat1"), lng: n("lng1") }, { lat: n("lat2"), lng: n("lng2") }));
}));
