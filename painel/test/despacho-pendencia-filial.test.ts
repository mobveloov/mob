// Tempo em Pendência por filial: a filial sem valor próprio herda o da empresa; com valor próprio usa o dela.
import { test } from "node:test";
import assert from "node:assert/strict";

test("sanear guarda só valores válidos por filial e limita a 0..1440", async () => {
  const { sanearDespacho, DESPACHO_PADRAO } = await import("../src/config/despacho.ts");
  const r = sanearDespacho({ pendenciaFilial: { a: 3, b: "7", c: 99999, d: -5, e: "", f: null, g: "x", __proto__: 1 } });
  assert.deepEqual(r.pendenciaFilial, { a: 3, b: 7, c: 1440, d: 0 });
  assert.deepEqual(DESPACHO_PADRAO.pendenciaFilial, {});
  assert.deepEqual(sanearDespacho({ pendenciaFilial: [1, 2] }).pendenciaFilial, {}, "lista não vale");
  assert.deepEqual(sanearDespacho({ pendenciaFilial: "x" }).pendenciaFilial, {});
});

test("filial herda o tempo da empresa; com valor próprio usa o dela (inclusive 0)", async () => {
  const { sanearDespacho, tempoPendenciaDaFilial } = await import("../src/config/despacho.ts");
  const r = sanearDespacho({ tempoPendencia: 10, pendenciaFilial: { f1: 3, f2: 0 } });
  assert.equal(tempoPendenciaDaFilial(r, "f1"), 3);
  assert.equal(tempoPendenciaDaFilial(r, "f2"), 0, "zero próprio = cancela direto, não herda");
  assert.equal(tempoPendenciaDaFilial(r, "f3"), 10, "sem valor próprio herda");
  assert.equal(tempoPendenciaDaFilial(r, undefined), 10, "sem filial na corrida vale o da empresa");
  assert.equal(tempoPendenciaDaFilial(r, "constructor"), 10, "nome de protótipo não vaza");
});

test("salvar mantém as filiais e mudar a empresa não apaga as filiais", async () => {
  const { sanearDespacho } = await import("../src/config/despacho.ts");
  const atual = sanearDespacho({ pendenciaFilial: { f1: 4 } });
  const depois = sanearDespacho({ tempoPendencia: 15 }, atual);
  assert.equal(depois.tempoPendencia, 15);
  assert.deepEqual(depois.pendenciaFilial, { f1: 4 });
});
