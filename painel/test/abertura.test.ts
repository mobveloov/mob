// Imagem de abertura dos apps: envio (PNG→WebP), rota pública com versão, dentro da personalização, voltar ao padrão e permissão.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import sharp from "sharp";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-abertura-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "p".repeat(40);
process.env.APPS_MOSTRAR_CODIGO = "1";
delete process.env.BANCO_ARQUIVO;

const express = (await import("express")).default;
const D = await import("../src/servidor/dados.ts");
const B = await import("../src/servidor/banco.ts");
const { criarCookie, exigirLogin } = await import("../src/servidor/sessao.ts");
const { rotasConfig } = await import("../src/config/rotas.ts");
const { rotasApps } = await import("../src/apps/rotas.ts");
const { dadosParaOApp } = await import("../src/config/personalizacao.ts");
const { dadosParaOAppMotorista } = await import("../src/config/personalizacao-motorista.ts");

const app = express();
app.use(express.json({ limit: "1mb" }));
app.post("/teste/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({ ok: true }); });
app.use("/api/apps", rotasApps);
app.use("/api", exigirLogin);
app.use("/api/config", rotasConfig);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => { servidor.closeAllConnections(); servidor.close(); B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

const E = D.criarEmpresa("Abertura Um");
const adm = D.criarUsuario({ email: "adm@abertura.test", nome: "Adm", senha: "senha-forte-1", empresaId: E.id, papel: "admin" });
const op = D.criarUsuario({ email: "op@abertura.test", nome: "Op", senha: "senha-forte-1", empresaId: E.id, papel: "operador" });
const entrar = async (id: string) => (await fetch(`${base}/teste/entrar/${id}`, { method: "POST" })).headers.get("set-cookie")!.split(";")[0];
const cAdm = await entrar(adm.id), cOp = await entrar(op.id);
const png = await sharp({ create: { width: 400, height: 800, channels: 3, background: "#cc3300" } }).png().toBuffer();

const painel = (cookie: string, metodo: string, url: string, corpo?: Uint8Array) =>
  fetch(`${base}/api/config${url}`, { method: metodo, headers: { cookie, ...(corpo ? { "content-type": "image/png" } : {}) }, body: corpo as unknown as BodyInit })
    .then(async (r) => ({ status: r.status, corpo: (await r.json().catch(() => ({}))) as Record<string, any> }));
const publica = (app2: string) => fetch(`${base}/api/apps/${E.id}/abertura/${app2}`).then(async (r) => ({ status: r.status, corpo: (await r.json()) as Record<string, any> }));

test("sem imagem: rota pública devolve url null e a personalização traz abertura null", async () => {
  const r = await publica("passageiro");
  assert.equal(r.status, 200);
  assert.equal(r.corpo.url, null);
  assert.equal(dadosParaOApp(E.id).abertura ?? null, null);
});

test("envio de PNG vira WebP, ganha versão e aparece na rota pública e na personalização", async () => {
  const r = await painel(cAdm, "POST", "/abertura/passageiro", new Uint8Array(png));
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.match(r.corpo.abertura.url, /aberturaPassageiro\.webp\?v=/);
  const pub = await publica("passageiro");
  assert.equal(pub.corpo.url, r.corpo.abertura.url);
  assert.ok(pub.corpo.versao);
  const arq = D.caminhoImagem(E.id, "aberturaPassageiro.webp")!; // o arquivo é servido por /api/publico/arquivo (index.ts)
  assert.equal(arq.mime, "image/webp");
  assert.equal((await sharp(fs.readFileSync(arq.arquivo)).metadata()).format, "webp");
  assert.equal(dadosParaOApp(E.id).abertura?.url, pub.corpo.url);
  assert.equal(dadosParaOAppMotorista(E.id).abertura ?? null, null, "a do motorista é independente");
});

test("o motorista tem a própria imagem; app inválido dá erro", async () => {
  assert.equal((await painel(cAdm, "POST", "/abertura/motorista", new Uint8Array(png))).status, 200);
  assert.match((await publica("motorista")).corpo.url, /aberturaMotorista\.webp/);
  assert.equal((await fetch(`${base}/api/apps/${E.id}/abertura/outro`)).status, 404);
});

test("arquivo que não é imagem é recusado", async () => {
  const r = await painel(cAdm, "POST", "/abertura/passageiro", new Uint8Array([1, 2, 3, 4, 5, 6]));
  assert.notEqual(r.status, 200);
});

test("operador sem papel de gestor não altera", async () => {
  assert.equal((await painel(cOp, "POST", "/abertura/passageiro", new Uint8Array(png))).status, 403);
  assert.equal((await painel(cOp, "DELETE", "/abertura/passageiro")).status, 403);
});

test("Voltar ao padrão remove o arquivo", async () => {
  const r = await painel(cAdm, "DELETE", "/abertura/passageiro");
  assert.equal(r.status, 200);
  assert.equal((await publica("passageiro")).corpo.url, null);
  assert.equal((await publica("motorista")).corpo.url !== null, true);
});
