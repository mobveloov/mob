// Rotas das filiais (montadas em /api/filiais, depois do login). A empresa vem SEMPRE do login (req.ctx).
//   GET    /opcoes                         lista curta (id e nome) para filtros: qualquer cargo
//   GET    /centro?filial=                 centro, zoom, limites e áreas de cobertura para os mapas (qualquer cargo; quem está preso a uma filial só recebe a dela)
//   GET    /                               lista com totais (Gestor e acima)
//   POST   /   PUT /:id   DELETE /:id      cadastro (Gestor e acima)
//   GET    /:id                            filial com motoristas e operadores ligados
//   POST   /:id/motoristas  { ids }        liga motoristas (cada um fica em uma filial só)
//   DELETE /:id/motoristas/:motoristaId    solta o motorista
//   POST   /:id/operadores  { ids }        liga usuários da equipe
//   DELETE /:id/operadores/:usuarioId      solta o usuário

import express, { type Request, type Response } from "express";
import { cadastroPorId } from "../comum/cadastros.ts";
import { listar } from "../cadastros/armazem.ts";
import { listarUsuarios } from "../servidor/dados.ts";
import { centroDoMapa } from "./centro.ts";
import { atualizarFilial, criarFilial, desvincular, ErroFilial, filial, filialForcada, listarFiliais, pessoasDaFilial, removerFilial, vincular } from "./filiais.ts";

export const rotasFiliais = express.Router();
const ok = (fn: (req: Request, res: Response) => unknown) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e) {
    if (!res.headersSent) res.status(e instanceof ErroFilial ? e.status : 400).json({ erro: e instanceof Error ? e.message : "Erro." });
  }
};
const emp = (req: Request) => req.ctx!.empresaId;

rotasFiliais.get("/opcoes", ok((req, res) => res.json({ filiais: listarFiliais(emp(req)).map((f) => ({ id: f.id, nome: f.nome, ativa: f.ativa })) })));
rotasFiliais.get("/centro", ok((req, res) => {
  const presa = filialForcada(emp(req), req.ctx!.usuario);
  res.json(centroDoMapa(emp(req), presa ?? String(req.query.filial ?? "").slice(0, 80)));
}));
rotasFiliais.get("/", ok((req, res) => res.json({ filiais: listarFiliais(emp(req)) })));
rotasFiliais.post("/", ok((req, res) => res.status(201).json({ filial: criarFilial(emp(req), req.body ?? {}, req.ctx!.usuario.email) })));

rotasFiliais.get("/:id", ok((req, res) => {
  const f = filial(emp(req), req.params.id);
  if (!f) throw new ErroFilial("Filial não encontrada.", 404);
  const motoristas = new Set(pessoasDaFilial(emp(req), f.id, "motorista"));
  const operadores = new Set(pessoasDaFilial(emp(req), f.id, "operador"));
  res.json({
    filial: f,
    motoristas: listar(emp(req), cadastroPorId("motoristas")!).filter((m) => motoristas.has(m.id)).map((m) => ({ id: m.id, nome: String(m.nome ?? ""), telefone: String(m.telefone ?? ""), status: String(m.status ?? "") })),
    operadores: listarUsuarios().filter((u) => u.empresaId === emp(req) && operadores.has(u.id)).map((u) => ({ id: u.id, nome: u.nome, email: u.email, papel: u.papel })),
    // Quem da equipe ainda pode ser ligado (o ADMIN Mestre não entra).
    equipeLivre: listarUsuarios().filter((u) => u.empresaId === emp(req) && u.papel !== "plataforma" && !operadores.has(u.id)).map((u) => ({ id: u.id, nome: u.nome, email: u.email, papel: u.papel })),
  });
}));
rotasFiliais.put("/:id", ok((req, res) => res.json({ filial: atualizarFilial(emp(req), req.params.id, req.body ?? {}) })));
rotasFiliais.delete("/:id", ok((req, res) => { removerFilial(emp(req), req.params.id); res.json({ ok: true }); }));

rotasFiliais.post("/:id/motoristas", ok((req, res) => res.json({ ligados: vincular(emp(req), req.params.id, "motorista", req.body?.ids) })));
rotasFiliais.delete("/:id/motoristas/:motoristaId", ok((req, res) => { desvincular(emp(req), req.params.id, "motorista", req.params.motoristaId); res.json({ ok: true }); }));
rotasFiliais.post("/:id/operadores", ok((req, res) => res.json({ ligados: vincular(emp(req), req.params.id, "operador", req.body?.ids) })));
rotasFiliais.delete("/:id/operadores/:usuarioId", ok((req, res) => { desvincular(emp(req), req.params.id, "operador", req.params.usuarioId); res.json({ ok: true }); }));
