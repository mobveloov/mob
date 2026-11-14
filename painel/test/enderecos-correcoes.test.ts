// Base extra de endereços (casas que o CNEFE não tem): importar, buscar e achar pelo ponto.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-casas-"));
process.env.DADOS_DIR = DADOS;
process.env.BANCO_ARQUIVO = path.join(DADOS, "painel.db");
delete process.env.CNEFE_DIR;

const C = await import("../src/enderecos/correcoes.ts");
const E = await import("../src/enderecos/index.ts");
const { fecharBanco } = await import("../src/servidor/banco.ts");

const ARQUIVO = [
  "# cod_municipio\tnumero\tnome_logradouro\tbairro\ttipo\tlatitude\tlongitude\tcod_unico",
  "3599999\t0\tMINAS GERAIS\tJARDIM PRIMAVERA\tRUA\t-21.029246\t-48.233052\t\N",
  "3599999\t2182\tMINAS GERAIS\tJARDIM PRIMAVERA\tRUA\t-21.029245\t-48.232484\t\N",
  "3599999\t2192\tMINAS GERAIS\tJARDIM PRIMAVERA\tRUA\t-21.029248\t-48.232531\t\N",
  "linha estragada",
  "3599999\t5\tSEM COORDENADA\tCENTRO\tRUA\tabc\t-48.0",
  "3588888\t10\tMINAS GERAIS\tCENTRO\tRUA\t-22.0\t-47.0\t\N",
].join("\n");

test("importa, ignora linha ruim e não duplica ao repetir", () => {
  assert.deepEqual(C.importarCorrecoes(ARQUIVO), { importadas: 4, ignoradas: 2 });
  assert.deepEqual(C.importarCorrecoes(ARQUIVO), { importadas: 4, ignoradas: 2 });
  assert.equal(C.totalCorrecoes(), 4);
});

test("busca a casa exata e só nas cidades da empresa", () => {
  E.salvarConfig("empresa-a", { municipios: ["3599999"] });
  E.salvarConfig("empresa-b", { municipios: ["3588888"] });
  const a = E.buscarEndereco("empresa-a", "Rua Minas Gerais 2192");
  assert.equal(a.enderecos[0].exato, true);
  assert.equal(a.enderecos[0].numero, "2192");
  assert.ok(Math.abs(a.enderecos[0].lat - -21.029248) < 1e-6);
  assert.match(a.enderecos[0].texto, /Jardim Primavera/);
  // A empresa B só atende a outra cidade: não vê a rua da cidade A.
  assert.match(E.buscarEndereco("empresa-b", "Minas Gerais 10").enderecos[0].texto, /Centro/);
  assert.doesNotMatch(E.buscarEndereco("empresa-b", "Minas Gerais 10").enderecos[0].texto, /Jardim Primavera/);
});

test("número que não existe cai na casa mais próxima e sem número usa o ponto da rua", () => {
  const perto = E.buscarEndereco("empresa-a", "Minas Gerais 2190").enderecos[0];
  assert.equal(perto.exato, false);
  const rua = E.buscarEndereco("empresa-a", "Minas Gerais").enderecos[0];
  assert.ok(Math.abs(rua.lat - -21.029246) < 1e-6);
});

test("acha o endereço pelo ponto do mapa e mostra quantas correções a empresa tem", () => {
  const e = E.enderecoDoPonto("empresa-a", -21.029248, -48.232531);
  assert.equal(e?.numero, "2192");
  assert.equal(E.situacao("empresa-a").correcoes, 3);
  assert.equal(E.situacao("empresa-b").correcoes, 1);
});

test("limpeza", () => { fecharBanco(); });
