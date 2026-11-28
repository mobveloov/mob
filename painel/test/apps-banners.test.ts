// Anúncios (Configurações › Gerais › Banners) chegam nos apps: o banner cadastrado volta na lista pública e a imagem é entregue.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-banners-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
delete process.env.BANCO_ARQUIVO;

const G = await import("../src/config/gerais.ts");
const B = await import("../src/servidor/banco.ts");
test.after(() => { B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test("banner cadastrado aparece em gerais(), por tipo, e sobrevive a salvar a aba", () => {
  const b = G.adicionarBanner("emp-b", "image/png", PNG, "https://exemplo.com", "app");
  G.adicionarBanner("emp-b", "image/png", PNG, "", "login");
  assert.equal(G.gerais("emp-b").banners.filter((x) => x.tipo === "app").length, 1);
  assert.equal(G.gerais("emp-b").banners.filter((x) => x.tipo === "login").length, 1);
  G.salvarGerais("emp-b", { ...G.gerais("emp-b"), suporte: { ...G.gerais("emp-b").suporte, telefone: "1133334444" } });
  assert.equal(G.gerais("emp-b").banners.length, 2, "salvar a aba não apaga os banners");
  assert.ok(G.arquivoDoBanner("emp-b", b.id), "a imagem do banner é encontrada");
});

test("arquivo de banner com nome estranho no arquivo de configuração é ignorado", () => {
  const p = path.join(DADOS, "empresas", "emp-c", "config");
  fs.mkdirSync(p, { recursive: true });
  fs.writeFileSync(path.join(p, "gerais.json"), JSON.stringify({ banners: [{ id: "x", arquivo: "../../segredo.png", mime: "image/png", tipo: "app", link: "" }] }));
  assert.equal(G.gerais("emp-c").banners.length, 0);
});
