// Centro, zoom, limites e áreas de cobertura dos mapas, por filial: GET /api/filiais/centro.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-filiais-centro-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "e".repeat(40);

const D = await import("../src/servidor/dados.ts");
const { app } = await import("../src/servidor/index.ts");
const B = await import("../src/servidor/banco.ts");
const { salvarArea } = await import("../src/gestao/regras.ts");

const A = D.criarEmpresa("Empresa A").id;
const Z = D.criarEmpresa("Empresa Z").id;
const SENHA = "senha-forte-1";
const usuarios = {
  admA: D.criarUsuario({ email: "admin-a@c.test", nome: "Admin A", senha: SENHA, empresaId: A, papel: "admin" }),
  opPit: D.criarUsuario({ email: "op-pit@c.test", nome: "Operador Pit", senha: SENHA, empresaId: A, papel: "operador" }),
  admZ: D.criarUsuario({ email: "admin-z@c.test", nome: "Admin Z", senha: SENHA, empresaId: Z, papel: "admin" }),
};
const srv = app.listen(0);
const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
test.after(() => { srv.closeAllConnections(); srv.close(); B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });
const cookies: Record<string, string> = {};
for (const [k, u] of Object.entries(usuarios)) {
  const r = await fetch(`${base}/api/entrar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: u.email, senha: SENHA }) });
  cookies[k] = (r.headers.get("set-cookie") ?? "").split(";")[0];
}
async function api(quem: string, metodo: string, url: string, corpo?: unknown) {
  const r = await fetch(base + url, { method: metodo, headers: { "Content-Type": "application/json", Cookie: cookies[quem] }, body: corpo === undefined || metodo === "GET" ? undefined : JSON.stringify(corpo) });
  return { status: r.status, corpo: (await r.json().catch(() => ({}))) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

// Pitangueiras-SP: lat -21.01, lng -48.22. Quadrado de ~4 km em volta.
const PIT = { lat: -21.0128, lng: -48.2217 };
const quadrado = (c: { lat: number; lng: number }, d: number) => [[c.lat + d, c.lng - d], [c.lat + d, c.lng + d], [c.lat - d, c.lng + d], [c.lat - d, c.lng - d]];
let pit = "", leme = "";

test("sem filial, sem área e sem corridas: centro nulo (nunca Brasília)", async () => {
  const r = await api("admA", "GET", "/api/filiais/centro");
  assert.equal(r.status, 200);
  assert.equal(r.corpo.centro, null);
  assert.equal(r.corpo.fonte, "nenhuma");
});

test("filial com coordenadas: centro e zoom dela; cobertura = área que a contém + raio", async () => {
  const area = salvarArea(A, { nome: "Pitangueiras", poligono: quadrado(PIT, 0.03), cor: "#22c55e" });
  const c = await api("admA", "POST", "/api/filiais", { nome: "Pitangueiras", cidade: "Pitangueiras", uf: "sp", lat: PIT.lat, lng: PIT.lng, zoom: 13, raioKm: 5 });
  assert.equal(c.status, 201);
  pit = c.corpo.filial.id;
  assert.equal(c.corpo.filial.uf, "SP");
  const r = await api("admA", "GET", `/api/filiais/centro?filial=${pit}`);
  assert.equal(r.corpo.fonte, "filial");
  assert.ok(Math.abs(r.corpo.centro.lat - PIT.lat) < 1e-6 && Math.abs(r.corpo.centro.lng - PIT.lng) < 1e-6);
  assert.ok(r.corpo.centro.lat > -22 && r.corpo.centro.lat < -20 && r.corpo.centro.lng < -47 && r.corpo.centro.lng > -49); // não é Brasília (-15.78, -47.93)
  assert.equal(r.corpo.zoom, 13);
  const tipos = r.corpo.areas.map((a: { tipo: string }) => a.tipo).sort();
  assert.deepEqual(tipos, ["area", "raio"]);
  assert.equal(r.corpo.areas.find((a: { tipo: string }) => a.tipo === "area").id, area.id);
});

test("filial sem coordenadas: usa o meio das áreas escolhidas e o zoom que faz a área caber", async () => {
  const area = salvarArea(A, { nome: "Leme", poligono: quadrado({ lat: -22.18, lng: -47.38 }, 0.05) });
  const c = await api("admA", "POST", "/api/filiais", { nome: "Leme", cidade: "Leme", areaIds: [area.id] });
  leme = c.corpo.filial.id;
  const r = await api("admA", "GET", `/api/filiais/centro?filial=${leme}`);
  assert.equal(r.corpo.fonte, "area");
  assert.ok(Math.abs(r.corpo.centro.lat + 22.18) < 1e-6);
  assert.ok(r.corpo.zoom >= 10 && r.corpo.zoom <= 13);
  assert.ok(r.corpo.limites);
});

test("todas as filiais: limites que cobrem as duas cidades", async () => {
  const r = await api("admA", "GET", "/api/filiais/centro");
  const [[sul, oeste], [norte, leste]] = r.corpo.limites;
  assert.ok(sul <= -22.2 && norte >= -21.0 && oeste <= -48.2 && leste >= -47.34);
  assert.ok(r.corpo.zoom < 11);
  assert.equal(r.corpo.nome, "Todas as filiais");
});

test("operador preso a uma filial só recebe o centro da dela", async () => {
  await api("admA", "POST", `/api/filiais/${pit}/operadores`, { ids: [usuarios.opPit.id] });
  const r = await api("opPit", "GET", `/api/filiais/centro?filial=${leme}`);
  assert.equal(r.status, 200);
  assert.equal(r.corpo.filialId, pit);
  const todas = await api("opPit", "GET", "/api/filiais/centro");
  assert.equal(todas.corpo.filialId, pit);
});

test("isolamento: outra empresa não vê filial nem área da primeira", async () => {
  const r = await api("admZ", "GET", `/api/filiais/centro?filial=${pit}`);
  assert.equal(r.status, 200);
  assert.equal(r.corpo.centro, null);
  assert.equal(r.corpo.areas.length, 0);
  assert.deepEqual(r.corpo.filiais, []);
});

test("cadastro recusa coordenadas inválidas e metade do par", async () => {
  assert.equal((await api("admA", "POST", "/api/filiais", { nome: "Ruim", lat: 200, lng: 1 })).status, 400);
  assert.equal((await api("admA", "POST", "/api/filiais", { nome: "Ruim", lat: -21 })).status, 400);
  const e = await api("admA", "PUT", `/api/filiais/${pit}`, { zoom: 30 });
  assert.equal(e.status, 400);
});
