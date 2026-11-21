// Imagem da empresa: a versão (data de gravação + tamanho) vem do servidor na marca, muda ao trocar a imagem pelo mesmo nome
// e não é gravada no marca.json. Assim a url da imagem (?v=) renova na hora, mesmo depois de F5.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-imgver-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "i".repeat(40);
delete process.env.BANCO_ARQUIVO;

const D = await import("../src/servidor/dados.ts");
const B = await import("../src/servidor/banco.ts");

const PNG = (extra: number) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array.from({ length: extra }, (_, i) => i % 250)]);
test.after(() => { B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

test("a marca traz a versão de cada imagem, que muda quando a imagem é trocada", async () => {
  const e = D.criarEmpresa("Imagem Versao").id;
  assert.deepEqual(D.marca(e).versoes, {}, "sem imagem, sem versão");
  const m = D.marca(e);
  m.arquivos.fotoEmpresa = D.salvarImagem(e, "fotoEmpresa", "image/png", PNG(10));
  D.salvarMarca(e, m);
  const v1 = D.marca(e).versoes?.["fotoEmpresa.png"];
  assert.ok(v1, "a versão aparece na marca");
  assert.equal(D.versaoImagem(e, "fotoEmpresa.png"), v1);
  // O mesmo nome de arquivo, outro conteúdo: a versão muda (o tamanho entra na conta).
  await new Promise((r) => setTimeout(r, 15));
  D.salvarImagem(e, "fotoEmpresa", "image/png", PNG(40));
  const v2 = D.marca(e).versoes?.["fotoEmpresa.png"];
  assert.ok(v2 && v2 !== v1, `versão nova (${v1} -> ${v2})`);
  // A versão não vai para o marca.json.
  const gravado = JSON.parse(fs.readFileSync(path.join(DADOS, "empresas", e, "marca.json"), "utf8"));
  assert.equal("versoes" in gravado, false);
  assert.equal(D.versaoImagem(e, "../x.png"), "", "nome fora do padrão não tem versão");
});
