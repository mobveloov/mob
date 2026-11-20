// Menu lateral: todo item do menu aparece uma vez, nos 6 grupos, e o cargo esconde o que não pode.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FUNCOES, funcoesDoCargo } from "../src/comum/funcoes.ts";
import { GRUPOS_MENU, menuLateral } from "../src/comum/menu-lateral.ts";

const ids = (cargo: string) => menuLateral(funcoesDoCargo(cargo)).flatMap((g) => g.blocos.flatMap((b) => b.itens.map((f) => f.id)));

test("grupos da Machine na ordem, depois os nossos, cada um com cor diferente", () => {
  assert.deepEqual(GRUPOS_MENU.map((g) => g.nome), ["Painel", "Cadastro", "Corridas", "Financeiro", "Comunicação", "Configurações", "Cobrança", "Avaliações", "Ajuda", "Bot & Totem", "CRM", "Mais telas"]);
  assert.equal(new Set(GRUPOS_MENU.map((g) => g.cor)).size, GRUPOS_MENU.length);
});

test("administrador: todo item de funcoes.ts entra uma vez só (menos o menu do usuário)", () => {
  const no = ids("plataforma");
  const esperados = FUNCOES.map((f) => f.id);
  assert.equal(new Set(no).size, no.length, "item repetido no menu lateral");
  assert.deepEqual([...no].sort(), [...esperados].sort(), "item faltando ou sobrando no menu lateral");
});

test("operador não vê o que é só do administrador", () => {
  const op = ids("operador");
  for (const f of FUNCOES.filter((x) => x.minimo && x.minimo !== "operador")) assert.ok(!op.includes(f.id), `${f.id} apareceu para o operador`);
  assert.ok(op.includes("painel") && op.includes("motoristas") && op.includes("juridico"));
  // Grupo sem nenhum item permitido some.
  const soAdminGrupo = menuLateral(funcoesDoCargo("operador").filter((f) => f.grupo === "Cobrança" || f.id === "painel"));
  assert.deepEqual(soAdminGrupo.map((g) => g.id), ["painel"]);
});

test("Configurações tem o item \"Carteiras de crédito\" direto (rota própria; em Financeiro > Créditos tem outro com o mesmo nome)", () => {
  const f = FUNCOES.find((x) => x.id === "carteiras-credito");
  assert.ok(f);
  assert.equal(f.grupo, "Configurações");
  assert.equal(f.nome, "Carteiras de crédito");
  assert.notEqual(f.rota, FUNCOES.find((x) => x.id === "carteiras")!.rota);
  assert.equal(FUNCOES.find((x) => x.id === "carteiras")!.grupo, "Financeiro");
  const config = menuLateral(funcoesDoCargo("gestor")).find((g) => g.id === "configuracoes")!;
  assert.ok(config.blocos.every((b) => !b.titulo), "Configurações não esconde itens em bloco recolhido");
  assert.ok(config.blocos.some((b) => b.itens.some((i) => i.id === "carteiras-credito")));
  assert.ok(!ids("operador").includes("carteiras-credito"));
});

test("rotas e ids continuam os de funcoes.ts", () => {
  for (const g of menuLateral(funcoesDoCargo("plataforma"))) for (const b of g.blocos) for (const f of b.itens) assert.equal(FUNCOES.find((x) => x.id === f.id)?.rota, f.rota);
});
