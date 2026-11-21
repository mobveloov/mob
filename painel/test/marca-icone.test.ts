// Ícone da empresa: a mesma imagem vale para o topo, o menu, a aba e o manifest. Rodar: npx tsx --test test/marca-icone.test.ts
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-icone-"));
process.env.DADOS_DIR = DADOS;
process.env.BANCO_ARQUIVO = path.join(DADOS, "painel.db");
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = crypto.randomBytes(24).toString("hex");

const { app } = await import("../src/servidor/index.ts");
const { imagemDaEmpresa, MARCA_PADRAO } = await import("../src/comum/marca.ts");

let srv: Server, base = "";
before(() => { srv = app.listen(0); base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`; });
after(() => { srv.close(); });

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test("imagemDaEmpresa: foto, depois ícone, favicon e logos; vazio sem nenhuma", () => {
  const a = { ...MARCA_PADRAO.arquivos };
  assert.equal(imagemDaEmpresa(a), "");
  assert.equal(imagemDaEmpresa({ ...a, logoClaro: "l.png" }), "l.png");
  assert.equal(imagemDaEmpresa({ ...a, logoClaro: "l.png", favicon: "f.png" }), "f.png");
  assert.equal(imagemDaEmpresa({ ...a, favicon: "f.png", fotoEmpresa: "foto.png" }), "foto.png");
});

test("manifest usa a foto da empresa quando não há ícone do app", async () => {
  const senha = crypto.randomBytes(9).toString("base64url");
  const conf = await fetch(`${base}/api/configurar`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ empresa: "Central Icone", nome: "Dona", email: "dona@icone.test", senha }) });
  assert.equal(conf.status, 200);
  const cookie = (conf.headers.get("set-cookie") ?? "").split(";")[0];
  const sem = await (await fetch(`${base}/manifest.webmanifest`, { headers: { cookie } })).json() as { icons: unknown[] };
  assert.equal(sem.icons.length, 0, "sem imagem, sem ícone");
  const env = await fetch(`${base}/api/empresa/foto`, { method: "POST", headers: { cookie, "content-type": "image/png" }, body: PNG });
  assert.equal(env.status, 200);
  const { marca } = await env.json() as { marca: { arquivos: { fotoEmpresa: string } } };
  assert.ok(marca.arquivos.fotoEmpresa);
  const lista = await (await fetch(`${base}/api/sessao`, { headers: { cookie } })).json() as { empresa: { id: string } };
  const man = await (await fetch(`${base}/manifest.webmanifest?empresa=${lista.empresa.id}`, { headers: { cookie } })).json() as { icons: Array<{ src: string }> };
  assert.equal(man.icons.length, 1);
  assert.ok(man.icons[0].src.includes(`/${marca.arquivos.fotoEmpresa}?v=`), "a url do ícone leva a versão do arquivo");
  assert.ok(/\?v=[a-z0-9]+$/.test(man.icons[0].src), "versão vinda do arquivo (data de gravação e tamanho)");
});
