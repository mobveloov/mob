// Foto da empresa: enviar, trocar e remover; só administrador; PNG, JPG ou WEBP até 2 MB; uma foto por empresa.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-foto-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "f".repeat(40);
delete process.env.BANCO_ARQUIVO;

const express = (await import("express")).default;
const D = await import("../src/servidor/dados.ts");
const { criarCookie, exigirLogin } = await import("../src/servidor/sessao.ts");
const { rotasFotoEmpresa } = await import("../src/servidor/foto-empresa.ts");

const app = express();
app.use(express.json());
app.post("/teste/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({ ok: true }); });
app.use("/api", exigirLogin);
app.use("/api/empresa", rotasFotoEmpresa);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => { servidor.closeAllConnections(); servidor.close(); fs.rmSync(DADOS, { recursive: true, force: true }); });

const E1 = D.criarEmpresa("Foto Um").id, E2 = D.criarEmpresa("Foto Dois").id;
const admin = D.criarUsuario({ email: "adm@foto.test", nome: "Adm", senha: "senha-forte-1", empresaId: E1, papel: "admin" });
const oper = D.criarUsuario({ email: "op@foto.test", nome: "Op", senha: "senha-forte-2", empresaId: E1, papel: "operador" });
const admin2 = D.criarUsuario({ email: "adm2@foto.test", nome: "Adm2", senha: "senha-forte-3", empresaId: E2, papel: "admin" });

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 2)]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(32, 3)]);

async function cookie(id: string) { return ((await fetch(`${base}/teste/entrar/${id}`, { method: "POST" })).headers.get("set-cookie") ?? "").split(";")[0]; }
async function enviar(quem: string, corpo: Buffer, tipo: string) {
  const r = await fetch(`${base}/api/empresa/foto`, { method: "POST", headers: { cookie: quem, "content-type": tipo }, body: new Uint8Array(corpo) });
  return { status: r.status, corpo: (await r.json().catch(() => ({}))) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
async function remover(quem: string) {
  const r = await fetch(`${base}/api/empresa/foto`, { method: "DELETE", headers: { cookie: quem } });
  return { status: r.status, corpo: (await r.json().catch(() => ({}))) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
const pastaArquivos = (id: string) => path.join(DADOS, "empresas", id, "arquivos");
const arquivosDaFoto = (id: string) => (fs.existsSync(pastaArquivos(id)) ? fs.readdirSync(pastaArquivos(id)).filter((n) => n.startsWith("fotoEmpresa.")) : []);

test("admin envia PNG, a foto vira da empresa e aparece na marca", async () => {
  const c = await cookie(admin.id);
  const r = await enviar(c, PNG, "image/png");
  assert.equal(r.status, 200);
  assert.equal(r.corpo.fotoEmpresa, "fotoEmpresa.png");
  assert.equal(D.marca(E1).arquivos.fotoEmpresa, "fotoEmpresa.png");
  assert.deepEqual(arquivosDaFoto(E1), ["fotoEmpresa.png"]);
  assert.ok(D.caminhoImagem(E1, "fotoEmpresa.png"));
});

test("trocar a foto apaga a anterior (JPG depois WEBP)", async () => {
  const c = await cookie(admin.id);
  assert.equal((await enviar(c, JPG, "image/jpeg")).corpo.fotoEmpresa, "fotoEmpresa.jpg");
  assert.deepEqual(arquivosDaFoto(E1), ["fotoEmpresa.jpg"]);
  assert.equal((await enviar(c, WEBP, "image/webp")).corpo.fotoEmpresa, "fotoEmpresa.webp");
  assert.deepEqual(arquivosDaFoto(E1), ["fotoEmpresa.webp"]);
});

test("recusa tipos que não são PNG, JPG ou WEBP", async () => {
  const c = await cookie(admin.id);
  for (const tipo of ["image/svg+xml", "image/x-icon", "image/gif", "text/html", "application/octet-stream"]) {
    const r = await enviar(c, PNG, tipo);
    assert.equal(r.status, 400, tipo);
    assert.match(r.corpo.erro, /PNG, JPG ou WEBP/);
  }
});

test("recusa arquivo que diz ser imagem mas não é", async () => {
  const c = await cookie(admin.id);
  const r = await enviar(c, Buffer.from("<script>alert(1)</script>".repeat(10)), "image/png");
  assert.equal(r.status, 400);
  assert.match(r.corpo.erro, /não é uma imagem válida/);
  const vazio = await enviar(c, Buffer.alloc(0), "image/png");
  assert.equal(vazio.status, 400);
});

test("limite de 2 MB: acima recusa, exatamente 2 MB aceita", async () => {
  const c = await cookie(admin.id);
  const MAX = 2 * 1024 * 1024;
  const grande = Buffer.concat([PNG, Buffer.alloc(MAX - PNG.length + 1, 7)]);
  const r = await enviar(c, grande, "image/png");
  assert.equal(r.status, 413);
  assert.match(r.corpo.erro, /máximo 2 MB/);
  const limite = Buffer.concat([PNG, Buffer.alloc(MAX - PNG.length, 7)]);
  assert.equal((await enviar(c, limite, "image/png")).status, 200);
  const enorme = Buffer.concat([PNG, Buffer.alloc(MAX * 2, 7)]);
  assert.equal((await enviar(c, enorme, "image/png")).status, 413);
});

test("operador não envia nem remove; sem login também não", async () => {
  const o = await cookie(oper.id);
  assert.equal((await enviar(o, PNG, "image/png")).status, 403);
  assert.equal((await remover(o)).status, 403);
  const semLogin = await fetch(`${base}/api/empresa/foto`, { method: "POST", headers: { "content-type": "image/png" }, body: new Uint8Array(PNG) });
  assert.equal(semLogin.status, 401);
});

test("cada empresa tem a sua foto; remover só mexe na própria", async () => {
  const c1 = await cookie(admin.id), c2 = await cookie(admin2.id);
  await enviar(c1, PNG, "image/png");
  await enviar(c2, JPG, "image/jpeg");
  assert.equal(D.marca(E1).arquivos.fotoEmpresa, "fotoEmpresa.png");
  assert.equal(D.marca(E2).arquivos.fotoEmpresa, "fotoEmpresa.jpg");
  const r = await remover(c1);
  assert.equal(r.status, 200);
  assert.equal(r.corpo.marca.arquivos.fotoEmpresa, "");
  assert.deepEqual(arquivosDaFoto(E1), []);
  assert.equal(D.caminhoImagem(E1, "fotoEmpresa.png"), null);
  assert.deepEqual(arquivosDaFoto(E2), ["fotoEmpresa.jpg"]);
  assert.equal(D.marca(E2).arquivos.fotoEmpresa, "fotoEmpresa.jpg");
  assert.equal((await remover(c1)).status, 200, "remover sem foto não dá erro");
});

test("a foto sobrevive a salvar a marca e não aceita nome de arquivo malicioso", async () => {
  const c = await cookie(admin.id);
  await enviar(c, PNG, "image/png");
  const m = D.marca(E1);
  D.salvarMarca(E1, { ...m, produto: "Outro nome" });
  assert.equal(D.marca(E1).arquivos.fotoEmpresa, "fotoEmpresa.png");
  const { sanearMarca } = await import("../src/comum/marca.ts");
  const s = sanearMarca({ arquivos: { fotoEmpresa: "../../segredo.json" } }, m);
  assert.notEqual(s.arquivos.fotoEmpresa, "../../segredo.json");
  D.apagarImagem(E1, "../../marca.json"); // nome fora do padrão é ignorado
  assert.ok(fs.existsSync(path.join(DADOS, "empresas", E1, "marca.json")));
});
