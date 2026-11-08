// Rotas das corridas próprias (/api/corridas-proprias): pedir, estimar preço, atribuir motorista, mudar status,
// cancelar e avaliar. A empresa vem do usuário logado.

import { Router, type Request, type Response } from "express";
import { rota } from "../enderecos/index.ts";
import { atribuirMotorista, avaliar, cancelarCorrida, criarCorridaPropria, estimarPreco, distanciaEstimada, listarProprias, mudarStatus, STATUS_TEXTO, type StatusProprio } from "./index.ts";

export const rotasCorridasProprias = Router();

const ok = (fn: (req: Request, res: Response) => unknown) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e) { if (!res.headersSent) res.status(400).json({ erro: e instanceof Error ? e.message : "Erro." }); }
};
const emp = (req: Request) => req.ctx!.empresaId;
const quem = (req: Request) => req.ctx!.usuario.email;

rotasCorridasProprias.get("/estimativa", ok(async (req, res) => {
  const num = (k: string) => (req.query[k] == null || req.query[k] === "" ? undefined : Number(req.query[k]));
  const lat1 = num("latEmbarque"), lng1 = num("lngEmbarque"), lat2 = num("latDestino"), lng2 = num("lngDestino");
  let km = num("distanciaKm") ?? null, minutos: number | null = null;
  if (km == null && lat1 != null && lng1 != null && lat2 != null && lng2 != null) {
    const r = await rota({ lat: lat1, lng: lng1 }, { lat: lat2, lng: lng2 });
    km = r.distanciaKm; minutos = r.minutos;
  }
  km ??= distanciaEstimada({ texto: "", lat: lat1, lng: lng1 }, { texto: "", lat: lat2, lng: lng2 });
  res.json(estimarPreco(emp(req), { categoria: String(req.query.categoria ?? ""), distanciaKm: km ?? null, minutos }));
}));

rotasCorridasProprias.get("/:id", ok((req, res) => {
  const c = listarProprias(emp(req)).find((x) => x.id === req.params.id || x.os === req.params.id);
  if (!c) return res.status(404).json({ erro: "Corrida não encontrada." });
  res.json({ corrida: c, statusTexto: STATUS_TEXTO });
}));

rotasCorridasProprias.post("/", ok(async (req, res) => {
  const b = req.body ?? {};
  res.json({ corrida: await criarCorridaPropria(emp(req), { ...b, canal: "painel" }, quem(req)) });
}));

rotasCorridasProprias.post("/:id/motorista", ok(async (req, res) => {
  res.json({ corrida: await atribuirMotorista(emp(req), String(req.params.id), String(req.body?.motoristaId ?? ""), quem(req)) });
}));

rotasCorridasProprias.post("/:id/status", ok(async (req, res) => {
  const b = req.body ?? {};
  res.json({ corrida: await mudarStatus(emp(req), String(req.params.id), b.status as StatusProprio, { valor: b.valor == null || b.valor === "" ? undefined : Number(b.valor), nota: b.nota }, quem(req)) });
}));

rotasCorridasProprias.post("/:id/cancelar", ok(async (req, res) => {
  const q = ["Passageiro", "Motorista", "Central"].includes(req.body?.quem) ? req.body.quem : "Central";
  res.json({ corrida: await cancelarCorrida(emp(req), String(req.params.id), q, String(req.body?.motivo ?? ""), quem(req)) });
}));

rotasCorridasProprias.post("/:id/avaliar", ok(async (req, res) => {
  res.json({ corrida: await avaliar(emp(req), String(req.params.id), Number(req.body?.nota), quem(req)) });
}));
