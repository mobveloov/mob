// Menu lateral: todo item do menu aparece uma vez, nos 6 grupos, e o cargo esconde o que não pode.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FUNCOES } from "../src/comum/funcoes.ts";
import { GRUPOS_MENU, menuLateral } from "../src/comum/menu-lateral.ts";

const ids = (admin: boolean) => menuLateral(admin).flatMap((g) => g.blocos.flatMap((b) => b.itens.map((f) => f.id)));

test("os 6 grupos, na ordem e com cores diferentes", () => {
  assert.deepEqual(GRUPOS_MENU.map((g) => g.nome), ["Operação", "Bot & Totem", "Clientes", "Gestão", "Configuração", "Ajuda"]);
  assert.equal(new Set(GRUPOS_MENU.map((g) => g.cor)).size, 6);
});

test("administrador: todo item de funcoes.ts entra uma vez só (menos o menu do usuário)", () => {
  const no = ids(true);
  const esperados = FUNCOES.map((f) => f.id);
  assert.equal(new Set(no).size, no.length, "item repetido no menu lateral");
  assert.deepEqual([...no].sort(), [...esperados].sort(), "item faltando ou sobrando no menu lateral");
});

test("operador não vê o que é só do administrador", () => {
  const op = ids(false);
  for (const f of FUNCOES.filter((x) => x.soAdmin)) assert.ok(!op.includes(f.id), `${f.id} apareceu para o operador`);
  assert.ok(op.includes("painel") && op.includes("motoristas") && op.includes("juridico"));
  // Grupo sem nenhum item permitido some.
  const soAdminGrupo = menuLateral(false, FUNCOES.filter((f) => f.grupo === "Cobrança" || f.id === "painel"));
  assert.deepEqual(soAdminGrupo.map((g) => g.id), ["operacao"]);
});

test("rotas e ids continuam os de funcoes.ts", () => {
  for (const g of menuLateral(true)) for (const b of g.blocos) for (const f of b.itens) assert.equal(FUNCOES.find((x) => x.id === f.id)?.rota, f.rota);
});
