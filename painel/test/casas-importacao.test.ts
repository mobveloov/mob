// Importação das casas (TSV, CSV com cabeçalho e JSON) e aparição no mapa dos apps.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DADOS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "casas-"));
process.env.BANCO_ARQUIVO = path.join(process.env.DADOS_DIR, "t.db");
const { importarCorrecoes, totalCorrecoes, correcoesPerto } = await import("../src/enderecos/correcoes.ts");
const { fecharBanco } = await import("../src/servidor/banco.ts");

test("TSV, CSV com cabeçalho e JSON entram na mesma base, sem duplicar", () => {
  const tsv = "3539509\t10\tDas Flores\tCentro\tRua\t-21.0001\t-48.2201\n3539509\t12\tDas Flores\tCentro\tRua\t-21.0002\t-48.2202\n";
  assert.deepEqual(importarCorrecoes(tsv), { importadas: 2, ignoradas: 0 });
  const csv = "cod_municipio;numero;nome_logradouro;bairro;tipo;latitude;longitude\n3539509;14;Das Flores;Centro;Rua;-21,0003;-48,2203\n3539509;;sem numero;x;Rua;abc;1\n";
  assert.deepEqual(importarCorrecoes(csv), { importadas: 1, ignoradas: 1 });
  const json = JSON.stringify([{ municipio: "3539509", numero: 16, logradouro: "Das Flores", bairro: "Centro", tipo: "Rua", lat: -21.0004, lng: -48.2204 }, { municipio: "3539509", numero: 10, logradouro: "Das Flores", bairro: "Centro", tipo: "Rua", lat: -21.00011, lng: -48.22011 }]);
  assert.deepEqual(importarCorrecoes(json), { importadas: 2, ignoradas: 0 });
  assert.equal(totalCorrecoes(["3539509"]), 4, "o número 10 repetido atualiza, não duplica");
});

test("as casas importadas aparecem perto do ponto, com o nome da rua", () => {
  const c = correcoesPerto(["3539509"], -21.0002, -48.2202, 100);
  assert.equal(c.length, 4);
  assert.equal(c[0].rua, "Rua das Flores");
  assert.equal(correcoesPerto(["3539509"], -22, -48, 100).length, 0);
  fecharBanco();
});
