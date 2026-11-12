// Rotas da gestão (grupo Cadastro): motoristas, destravar, passageiros, veículos, equipe, cupons, empresas,
// áreas, punições, desafios e indicações. Tudo por empresa (a do login). Montadas em /api/gestao.

import { Router } from "express";
import { atualizarUsuario, criarUsuario, listarUsuarios, removerUsuario, type Papel } from "../servidor/dados.ts";
import { emp, ok, soAdmin } from "./comum.ts";
import { rotasMotoristas } from "./motoristas.ts";
import { rotasOutros } from "./outros.ts";

export { regraDeCobrancaDoMotorista } from "./cobranca.ts";

const PAPEIS: Papel[] = ["admin", "operador"];

export const rotasGestao = Router();
rotasMotoristas(rotasGestao);
rotasOutros(rotasGestao);

// Equipe: os usuários do painel (cargos Administrador e Operador).
const publico = ({ hash: _h, ...u }: ReturnType<typeof listarUsuarios>[number]) => u;
rotasGestao.get("/equipe", ok((req, res) => {
  res.json({ equipe: listarUsuarios().filter((u) => u.empresaId === emp(req)).map(publico).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")) });
}));
rotasGestao.post("/equipe", soAdmin, ok((req, res) => {
  const b = req.body ?? {};
  const u = criarUsuario({ email: String(b.email ?? ""), nome: String(b.nome ?? ""), senha: String(b.senha ?? ""), empresaId: emp(req), papel: PAPEIS.find((p) => p === b.papel) ?? "operador" });
  res.json({ usuario: publico(u) });
}));
rotasGestao.put("/equipe/:id", soAdmin, ok((req, res) => {
  const b = req.body ?? {};
  if (req.params.id === req.ctx!.usuario.id && b.papel && b.papel !== req.ctx!.usuario.papel) throw new Error("Você não pode mudar o próprio cargo.");
  const u = atualizarUsuario(req.params.id, emp(req), {
    email: b.email == null ? undefined : String(b.email), nome: b.nome == null ? undefined : String(b.nome),
    senha: b.senha ? String(b.senha) : undefined, papel: PAPEIS.find((p) => p === b.papel),
  });
  res.json({ usuario: publico(u) });
}));
rotasGestao.delete("/equipe/:id", soAdmin, ok((req, res) => {
  if (req.params.id === req.ctx!.usuario.id) throw new Error("Você não pode remover o seu próprio usuário.");
  removerUsuario(req.params.id, emp(req));
  res.json({ ok: true });
}));
