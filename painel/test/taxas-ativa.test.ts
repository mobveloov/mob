// Taxas da central: interruptor (ativa) e nome (21 letras, sem emoji), como na Machine.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanearTaxa } from "../src/config/taxas.ts";
import { limparNomeTaxa } from "../src/comum/taxas.ts";

const base = { nome: "Taxa APP", categorias: ["Pop"], pagamentos: ["pix"], faixas: [{ de: 0, ate: null, tipo: "porcentagem", valor: 10 }] };

test("nome da taxa: sem emoji e no máximo 21 caracteres", () => {
  assert.equal(limparNomeTaxa("Taxa 🚗 muito grande para caber aqui"), "Taxa muito grande par");
  assert.equal(sanearTaxa({ ...base, nome: "A🚗B" }, [], "t", "x").nome, "AB");
});

test("taxa nasce ativa e guarda o desligado", () => {
  assert.equal(sanearTaxa(base, [], "t", "x").ativa, true);
  assert.equal(sanearTaxa({ ...base, ativa: false }, [], "t", "x").ativa, false);
});
