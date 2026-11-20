// Tarifas dinâmicas no formato da Machine: área "No embarque" ou "No destino" e "Dinâmica sem área" (fator global) entrando no preço.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-dinamica-campos-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "d".repeat(40);
delete process.env.BANCO_ARQUIVO;

const D = await import("../src/servidor/dados.ts");
const B = await import("../src/servidor/banco.ts");
const C = await import("../src/config/categorias.ts");
const Din = await import("../src/config/dinamica.ts");
test.after(() => { B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

const E = D.criarEmpresa("Dinamica Campos").id;
const AREA: Array<[number, number]> = [[-21.0, -48.0], [-21.0, -47.9], [-20.9, -47.9], [-20.9, -48.0]];
const DENTRO = { lat: -20.95, lng: -47.95 }, FORA = { lat: -10, lng: -40 };

function categoria(dinamicas: string[], dinamicaAtiva = true) {
  return C.salvarCategoria(E, null, { nome: `Cat ${Math.random().toString(36).slice(2, 6)}`, descricao: "x", extra: { dinamicas, dinamicaAtiva } }, "t");
}

test("área de mapa vale no embarque ou no destino, conforme escolhido", () => {
  const embarque = Din.salvarDinamica(E, { tipo: "mapa", nome: "Centro embarque", cobranca: "fixo", valor: 5, poligono: AREA }).find((r) => r.nome === "Centro embarque")!;
  const destino = Din.salvarDinamica(E, { tipo: "mapa", nome: "Centro destino", cobranca: "fixo", valor: 7, poligono: AREA, aplicaEm: "destino" }).find((r) => r.nome === "Centro destino")!;
  assert.equal(embarque.aplicaEm, "embarque");
  assert.equal(destino.aplicaEm, "destino");
  const cat = categoria([embarque.id, destino.id]);
  const ap = (e: object) => Din.aplicarDinamica(E, { categoria: cat.nome, valor: 20, ...e });
  assert.equal(ap({ embarque: DENTRO, destino: FORA }).adicional, 5);
  assert.equal(ap({ embarque: FORA, destino: DENTRO }).adicional, 7);
  assert.equal(ap({ embarque: DENTRO, destino: DENTRO }).adicional, 12);
  assert.equal(ap({ embarque: FORA, destino: FORA }).adicional, 0);
  assert.equal(ap({ embarque: FORA }).adicional, 0, "sem destino conhecido a área de destino não vale");
});

test("dinâmica sem área: fator global em todas as categorias que usam dinâmica", () => {
  const cat = categoria([]);
  const off = categoria([], false);
  assert.equal(Din.aplicarDinamica(E, { categoria: cat.nome, valor: 20 }).valor, 20, "desligada por padrão");
  Din.salvarGlobal(E, { ativa: true, cobranca: "multiplicador", valor: 1.1 });
  const r = Din.aplicarDinamica(E, { categoria: cat.nome, valor: 20 });
  assert.equal(r.valor, 22);
  assert.deepEqual(r.regras, ["Dinâmica sem área"]);
  assert.equal(Din.aplicarDinamica(E, { categoria: off.nome, valor: 20 }).valor, 20, "categoria com dinâmica desligada não recebe");
  assert.throws(() => Din.salvarGlobal(E, { cobranca: "multiplicador", valor: 0.9 }));
  // prioridade: a manual ganha da sem área
  const manual = Din.salvarDinamica(E, { tipo: "mapa", nome: "Manual", cobranca: "fixo", valor: 1, poligono: AREA }).find((x) => x.nome === "Manual")!;
  const c2 = categoria([manual.id]);
  Din.salvarPrioridade(E, "manual");
  assert.deepEqual(Din.aplicarDinamica(E, { categoria: c2.nome, valor: 20, embarque: DENTRO }).regras, ["Manual"]);
  Din.salvarPrioridade(E, "somar");
  assert.equal(Din.aplicarDinamica(E, { categoria: c2.nome, valor: 20, embarque: DENTRO }).valor, 20 + 1 + 2);
});

test("a prioridade gravada não apaga o fator global (e vice-versa)", () => {
  Din.salvarPrioridade(E, "maior_valor");
  assert.equal(Din.dinamicaGlobal(E).ativa, true);
  Din.salvarGlobal(E, { ativa: false });
  assert.equal(Din.prioridadeDinamicas(E), "maior_valor");
});
