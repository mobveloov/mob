// Filial: escolher a cidade preenche sozinho latitude, longitude, UF, zoom e raio (OpenStreetMap simulado aqui; nada sai para a internet).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import type { AddressInfo } from "node:net";

const falso = http.createServer((req, res) => {
  const q = new URL(req.url!, "http://x").searchParams;
  const cidades: Record<string, unknown> = {
    leme: [{ lat: "-22.1853", lon: "-47.3897", boundingbox: ["-22.30", "-22.07", "-47.52", "-47.29"], address: { "ISO3166-2-lvl4": "BR-SP", state: "São Paulo" } }],
    pitangueiras: [{ lat: "-21.0128", lon: "-48.2217", boundingbox: ["-21.07", "-20.96", "-48.30", "-48.17"], address: { "ISO3166-2-lvl4": "BR-SP", state: "São Paulo" } }],
  };
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(cidades[String(q.get("city")).toLowerCase()] ?? []));
});
await new Promise<void>((ok) => falso.listen(0, ok));
process.env.NOMINATIM_URL = `http://127.0.0.1:${(falso.address() as AddressInfo).port}`;
const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "filial-geocidade-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "g".repeat(40);

const D = await import("../src/servidor/dados.ts");
const { app } = await import("../src/servidor/index.ts");
const B = await import("../src/servidor/banco.ts");
const A = D.criarEmpresa("Empresa Geo").id;
const adm = D.criarUsuario({ email: "adm@geo.test", nome: "Adm", senha: "senha-forte-1", empresaId: A, papel: "admin" });
const srv = app.listen(0);
const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
test.after(() => { srv.closeAllConnections(); srv.close(); falso.close(); B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });
const r0 = await fetch(`${base}/api/entrar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: adm.email, senha: "senha-forte-1" }) });
const cookie = (r0.headers.get("set-cookie") ?? "").split(";")[0];
const geo = async (q: string) => { const r = await fetch(`${base}/api/filiais/geocidade?${q}`, { headers: { Cookie: cookie } }); return { status: r.status, corpo: (await r.json()) as Record<string, any> }; }; // eslint-disable-line @typescript-eslint/no-explicit-any

test("Leme: devolve centro, UF, zoom e raio da própria cidade", async () => {
  const r = await geo("cidade=Leme&uf=SP");
  assert.equal(r.status, 200);
  assert.equal(r.corpo.uf, "SP");
  assert.ok(Math.abs(r.corpo.lat - -22.1853) < 0.001 && Math.abs(r.corpo.lng - -47.3897) < 0.001);
  assert.ok(r.corpo.zoom >= 11 && r.corpo.zoom <= 14);
  assert.ok(r.corpo.raioKm >= 3 && r.corpo.raioKm <= 10);
});

test("Pitangueiras: aceita 'Pitangueiras - SP' e acha a UF sozinha", async () => {
  const r = await geo("cidade=" + encodeURIComponent("Pitangueiras - SP"));
  assert.equal(r.status, 200);
  assert.equal(r.corpo.uf, "SP");
  assert.ok(Math.abs(r.corpo.lat - -21.0128) < 0.001);
});

test("cidade que não existe: erro claro, sem inventar ponto", async () => {
  const r = await geo("cidade=Cidadeinexistente&uf=SP");
  assert.equal(r.status, 404);
  assert.match(r.corpo.erro, /Não achei/);
});
