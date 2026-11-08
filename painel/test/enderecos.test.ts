// Endereços pelo CNEFE com uma base pequena inventada (mesmo formato do arquivo real) e corrida com ponto no mapa.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-end-"));
const CNEFE = fs.mkdtempSync(path.join(os.tmpdir(), "painel-cnefe-"));
process.env.DADOS_DIR = DADOS;
process.env.CNEFE_DIR = CNEFE;
delete process.env.OSRM_URL;

// Cidade de teste 3599999 (SP) e uma de outro município que não pode aparecer.
fs.mkdirSync(path.join(CNEFE, "_casas"));
fs.mkdirSync(path.join(CNEFE, "35_SP"));
fs.writeFileSync(path.join(CNEFE, "35_SP", "3599999_CIDADE_TESTE.zip"), "");
fs.writeFileSync(path.join(CNEFE, "35_SP", "3588888_OUTRA_CIDADE.zip"), "");
const linhas = [
  ["3599999", "100", "DAS FLORES", "CENTRO", "RUA", "-21.000000", "-48.000000", "14750000"],
  ["3599999", "100", "DAS FLORES", "CENTRO", "RUA", "-21.000000", "-48.000000", "14750000"], // repetido (apartamentos)
  ["3599999", "200", "DAS FLORES", "CENTRO", "RUA", "-21.001000", "-48.000000", "14750000"],
  ["3599999", "0", "SAO JOAO", "VILA NOVA", "AVENIDA", "-21.010000", "-48.010000", "\\N"],
  ["3599999", "50", "SAO JOAO", "VILA NOVA", "AVENIDA", "-21.011000", "-48.010000", "14750001"],
  ["3588888", "1", "DAS FLORES", "CENTRO", "RUA", "-22.000000", "-47.000000", "14000000"],
].map((l) => l.join("\t")).join("\n");
fs.writeFileSync(path.join(CNEFE, "_casas", "35_SP.tsv.gz"), zlib.gzipSync(linhas));

const E = await import("../src/enderecos/index.ts");
const { criarEmpresa } = await import("../src/servidor/dados.ts");
const C = await import("../src/cadastros/armazem.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const R = await import("../src/corridas/index.ts");

const e1 = criarEmpresa("Empresa Endereço").id;
const e2 = criarEmpresa("Empresa Sem Cidade").id;

test("municípios pelo nome do arquivo", () => {
  const m = E.buscarMunicipios("cidade teste");
  assert.deepEqual(m, [{ codigo: "3599999", nome: "Cidade Teste", uf: "SP" }]);
});

test("busca rua e número só nas cidades da empresa", async () => {
  E.salvarConfig(e1, { municipios: ["3599999"] });
  assert.equal(await E.prepararAgora("3599999"), true);
  const r = E.buscarEndereco(e1, "R. das Flores, 200 - Centro");
  assert.equal(r.enderecos[0].texto, "Rua das Flores, 200 - Centro, Cidade Teste/SP");
  assert.equal(r.enderecos[0].exato, true);
  assert.equal(r.enderecos[0].lat, -21.001);
  assert.equal(r.enderecos[0].cep, "", "a última coluna não é CEP");
  assert.equal(r.enderecos.length, 1, "não traz a outra cidade");
  const aprox = E.buscarEndereco(e1, "rua das flores 150").enderecos[0];
  assert.equal(aprox.exato, false);
  assert.equal(E.buscarEndereco(e1, "av sao joao").enderecos[0].rua, "Avenida Sao Joao");
  assert.equal(E.situacao(e1).municipios[0].enderecos, 4, "endereço repetido conta uma vez");
  assert.equal(E.buscarEndereco(e2, "rua das flores").enderecos.length, 0, "outra empresa sem cidade não vê");
  assert.match(E.buscarEndereco(e2, "rua das flores").aviso ?? "", /cidades atendidas/);
});

test("ponto no mapa vira endereço e rota sem servidor de rotas", async () => {
  assert.equal(E.enderecoDoPonto(e1, -21.0009, -48.0001)?.rua, "Rua das Flores");
  const r = await E.rota({ lat: -21, lng: -48 }, { lat: -21.011, lng: -48.01 });
  assert.equal(r.pelasRuas, false);
  assert.ok(r.distanciaKm > 1.5 && r.distanciaKm < 2.5, String(r.distanciaKm));
});

test("corrida com endereço em texto ganha ponto, distância e preço", async () => {
  C.criar(e1, cadastroPorId("categorias")!, { nome: "Carro", bandeirada: "5", valorKm: "2", valorMinuto: "0", valorMinimo: "0", ativa: true }, "t");
  const c = await R.criarCorridaPropria(e1, { passageiro: { nome: "Ana", telefone: "11987654321" }, embarque: { texto: "Rua das Flores, 100" }, destino: { texto: "Avenida São João, 50" }, categoria: "Carro", pagamento: "Pix", canal: "painel" });
  assert.equal(c.embarque.lat, -21);
  assert.equal(c.destino?.lat, -21.011);
  assert.ok((c.estimativa.distanciaKm ?? 0) > 1.5);
  assert.ok((c.estimativa.valor ?? 0) > 5);
  const loc = await R.criarCorridaPropria(e1, { passageiro: { nome: "Bia", telefone: "11912345678" }, embarque: { texto: "Localização enviada", lat: -21.0009, lng: -48.0001 }, categoria: "Carro", pagamento: "Pix", canal: "bot" });
  assert.match(loc.embarque.texto, /^Rua das Flores, 200 - Centro, Cidade Teste\/SP \(localização\)$/);
  (await import("../src/servidor/banco.ts")).fecharBanco(); // no Windows, arquivo aberto não apaga
  fs.rmSync(DADOS, { recursive: true, force: true });
  fs.rmSync(CNEFE, { recursive: true, force: true });
});
