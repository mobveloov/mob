// Rota pelas ruas e busca de endereço fora da base: com servidor de mentira, sem internet.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

process.env.NODE_ENV = "test";
delete process.env.OSRM_URL;
delete process.env.NOMINATIM_URL;

const { caminhoPelasRuas, buscarFora, pontoFora } = await import("../src/apps/../enderecos/externo.ts");

const A = { lat: -21.0105, lng: -48.2215 }, B = { lat: -21.0052, lng: -48.2168 };

test("sem servidor de rotas, volta a linha reta e avisa que não é pelas ruas", async () => {
  const r = await caminhoPelasRuas([A, B]);
  assert.equal(r.pelasRuas, false);
  assert.equal(r.caminho.length, 2);
  assert.ok(r.distanciaKm > 0);
});

test("com OSRM, devolve o desenho pelas ruas, a distância e o tempo da rota", async () => {
  let pedido = "";
  const osrm = http.createServer((req, res) => {
    pedido = req.url ?? "";
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ code: "Ok", routes: [{ distance: 1234, duration: 300, geometry: { coordinates: [[-48.2215, -21.0105], [-48.221, -21.008], [-48.2168, -21.0052]] } }] }));
  }).listen(0);
  try {
    process.env.OSRM_URL = `http://127.0.0.1:${(osrm.address() as AddressInfo).port}`;
    const r = await caminhoPelasRuas([A, { lat: -21.0053, lng: -48.2169 }]);
    assert.equal(r.pelasRuas, true);
    assert.equal(r.distanciaKm, 1.23);
    assert.equal(r.minutos, 5);
    assert.equal(r.caminho.length, 3);
    assert.deepEqual(r.caminho[1], [-21.008, -48.221]); // [lat, lng]: o OSRM manda [lng, lat]
    assert.match(pedido, /^\/route\/v1\/driving\/-48\.2215,-21\.0105;-48\.2169,-21\.0053\?/);
  } finally { delete process.env.OSRM_URL; osrm.close(); }
});

test("busca de fora (Nominatim): monta o endereço com rua, número digitado, bairro e cidade", async () => {
  const nom = http.createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url?.startsWith("/reverse")) return res.end(JSON.stringify({ lat: "-21.01", lon: "-48.22", address: { road: "Rua Pernambuco", house_number: "40", suburb: "Centro", town: "Pitangueiras", "ISO3166-2-lvl4": "BR-SP" } }));
    res.end(JSON.stringify([{ lat: "-21.01", lon: "-48.22", address: { road: "Rua Pernambuco", suburb: "Centro", town: "Pitangueiras", state: "São Paulo" } }]));
  }).listen(0);
  try {
    process.env.NOMINATIM_URL = `http://127.0.0.1:${(nom.address() as AddressInfo).port}`;
    const l = await buscarFora("Rua Pernambuco 402", { lat: -21.01, lng: -48.22 });
    assert.equal(l.length, 1);
    assert.equal(l[0].texto, "Rua Pernambuco, 402 - Centro, Pitangueiras - SP");
    assert.equal(l[0].exato, false);
    const p = await pontoFora(-21.01, -48.22);
    assert.equal(p?.rua, "Rua Pernambuco");
    assert.equal(p?.numero, "40");
    assert.equal(p?.uf, "SP");
  } finally { delete process.env.NOMINATIM_URL; nom.close(); }
});

test("nos testes, sem servidor configurado, a busca de fora não chama a internet", async () => {
  assert.deepEqual(await buscarFora("Avenida Paulista 1000"), []);
  assert.equal(await pontoFora(-23.5, -46.6), null);
});
