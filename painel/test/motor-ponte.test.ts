// Ponte painel -> motor (contrato 3.1): período longo em pedaços de até 30 dias e ponto padrão do Sistema A.
import { test } from "node:test";
import assert from "node:assert/strict";

const { pedacos, credenciaisV2, CAMPOS } = await import("../src/servidor/fontes/motor.ts");
const { criarAdaptador } = await import("../../motor/src/index.ts");

test("período longo vira pedaços de até 30 dias, sem buraco e sem sobrar dia", () => {
  const de = new Date("2026-08-01T00:00:00Z"), ate = new Date("2026-11-08T23:59:59Z");
  const p = pedacos(de, ate, 30);
  assert.equal(p.length, 4);
  assert.equal(p[0][0].getTime(), de.getTime());
  assert.equal(p.at(-1)![1].getTime(), ate.getTime());
  for (let i = 1; i < p.length; i++) assert.equal(p[i][0].getTime(), p[i - 1][1].getTime(), "um começa onde o outro termina");
  for (const [a, b] of p) assert.ok(b.getTime() - a.getTime() <= 30 * 86_400_000);
  // Um dia só continua sendo um pedaço.
  assert.equal(pedacos(new Date("2026-11-08T00:00:00Z"), new Date("2026-11-08T23:59:59Z"), 30).length, 1);
});

test("Sistema A: ponto padrão da tela vai para o motor (vírgula aceita, valor ruim ignorado)", () => {
  assert.ok(CAMPOS["sistema-a"].some((c) => c.chave === "latPadrao" && c.opcional));
  const c = credenciaisV2("sistema-a", { chaveApi: "k", usuario: "u", senha: "s", urlApi: "https://x.test/api/v2/integracao", latPadrao: "-21,0106", lngPadrao: "-48.2196" });
  assert.equal(c.latPadrao, -21.0106);
  assert.equal(c.lngPadrao, -48.2196);
  const ruim = credenciaisV2("sistema-a", { latPadrao: "abc", lngPadrao: "500" });
  assert.equal(ruim.latPadrao, undefined);
  assert.equal(ruim.lngPadrao, undefined);
});

test("o motor 3.1 aceita as credenciais do painel e usa o ponto nas categorias", async () => {
  const pedidos: string[] = [];
  const fetchFalso = (async (url: string | URL) => {
    pedidos.push(String(url));
    return new Response(JSON.stringify({ success: true, data: [{ id: 1, nome: "Carro" }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  const original = globalThis.fetch;
  globalThis.fetch = fetchFalso;
  try {
    const a = criarAdaptador({ id: "sistema-a", tipo: "sistema-a", credenciais: credenciaisV2("sistema-a", { chaveApi: "k", usuario: "u", senha: "s", urlApi: "https://x.test/api/v2/integracao", latPadrao: "-21,01", lngPadrao: "-48,21" }) }) as unknown as { categorias(): Promise<unknown[]> };
    const cats = await a.categorias();
    assert.equal(cats.length, 1);
    assert.match(pedidos[0], /configuracoes\/categorias\?lat=-21\.01&lng=-48\.21/);
  } finally {
    globalThis.fetch = original;
  }
});
