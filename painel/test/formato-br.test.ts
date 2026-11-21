// Números no formato brasileiro: vírgula nos decimais (ex.: "1,517 km", nunca "1.517 km").
import { test } from "node:test";
import assert from "node:assert/strict";
import { decimal, kmBr } from "../src/comum/formato-br.ts";

test("distância do trajeto usa vírgula", () => {
  assert.equal(kmBr(1.517), "1,517 km");
  assert.equal(kmBr(0), "0,000 km");
  assert.equal(kmBr(null), "---");
  assert.equal(kmBr(1234.5), "1.234,500 km");
});

test("decimal usa vírgula e casas fixas", () => {
  assert.equal(decimal(4.5, 1), "4,5");
  assert.equal(decimal(12.07, 2), "12,07");
  assert.equal(decimal(undefined), "—");
  assert.equal(decimal(Number.NaN), "—");
});
