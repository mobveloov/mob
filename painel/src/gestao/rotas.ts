// Rotas da gestão (grupo Cadastro): motoristas, destravar, passageiros, veículos, equipe, cupons, empresas,
// áreas, punições, desafios e indicações. Tudo por empresa (a do login). Montadas em /api/gestao.

import { Router } from "express";
import { atualizarUsuarioDaEquipe, criarUsuario, listarUsuarios, removerUsuario, type Papel } from "../servidor/dados.ts";
import { definirFilialDe, filialDe, filiaisPorPessoa, listarFiliais } from "../filiais/filiais.ts";
import { emp, ok, soAdmin } from "./comum.ts";
import { rotasMotoristas } from "./motoristas.ts";
import { rotasOutros } from "./outros.ts";

export { regraDeCobrancaDoMotorista } from "./cobranca.ts";

const PAPEIS: Papel[] = ["admin", "gestor", "operador"];

export const rotasGestao = Router();
rotasMotoristas(rotasGestao);
rotasOutros(rotasGestao);

// Equipe: os usuários do painel (cargos ADMIN, Gestor e Operador).
const publico = ({ hash: _h, ...u }: ReturnType<typeof listarUsuarios>[number], filiais?: Map<string, string>) => ({ ...u, filialId: filiais?.get(u.id) ?? filialDe(u.empresaId, "operador", u.id) ?? "" });
rotasGestao.get("/equipe", ok((req, res) => {
  const filiais = filiaisPorPessoa(emp(req), "operador");
  res.json({ equipe: listarUsuarios().filter((u) => u.empresaId === emp(req)).map((u) => publico(u, filiais)).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")), filiais: listarFiliais(emp(req)).map((f) => ({ id: f.id, nome: f.nome, ativa: f.ativa })) });
}));
rotasGestao.post("/equipe", soAdmin, ok((req, res) => {
  const b = req.body ?? {};
  const u = criarUsuario({ email: String(b.email ?? ""), nome: String(b.nome ?? ""), senha: String(b.senha ?? ""), empresaId: emp(req), papel: PAPEIS.find((p) => p === b.papel) ?? "operador" });
  if (b.filialId) definirFilialDe(emp(req), "operador", u.id, b.filialId);
  res.json({ usuario: publico(u) });
}));
rotasGestao.put("/equipe/:id", soAdmin, ok((req, res) => {
  const b = req.body ?? {};
  if (req.params.id === req.ctx!.usuario.id && b.papel && b.papel !== req.ctx!.usuario.papel) throw new Error("Você não pode mudar o próprio cargo.");
  const u = atualizarUsuarioDaEquipe(req.params.id, emp(req), {
    email: b.email == null ? undefined : String(b.email), nome: b.nome == null ? undefined : String(b.nome),
    senha: b.senha ? String(b.senha) : undefined, papel: PAPEIS.find((p) => p === b.papel),
  });
  if (b.filialId !== undefined) definirFilialDe(emp(req), "operador", u.id, b.filialId);
  res.json({ usuario: publico(u) });
}));
rotasGestao.delete("/equipe/:id", soAdmin, ok((req, res) => {
  if (req.params.id === req.ctx!.usuario.id) throw new Error("Você não pode remover o seu próprio usuário.");
  removerUsuario(req.params.id, emp(req));
  definirFilialDe(emp(req), "operador", req.params.id, "");
  res.json({ ok: true });
}));
