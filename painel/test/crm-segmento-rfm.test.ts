// Segmento RFM dinâmico: "Criar segmento" guarda só a regra; a lista muda quando a análise RFM muda.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DADOS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "crm-segrfm-"));
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "s".repeat(40);

const D = await import("../src/servidor/dados.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar } = await import("../src/cadastros/armazem.ts");
const A = await import("../src/crm/armazem.ts");
const { publico, aplicarRegras, sanearRegras } = await import("../src/crm/publico.ts");
const { criarSegmentoRfm } = await import("../src/crm2/rfm.ts");
const { bd } = await import("../src/crm2/base.ts");

test("Criar segmento no RFM vira lista dinâmica e reavalia a cada uso", async () => {
  const e = D.criarEmpresa("Seg Rfm").id;
  const cli = cadastroPorId("clientes")!;
  criar(e, cli, { nome: "Ana", telefone: "11911111111", status: "Ativo" }, "t");
  criar(e, cli, { nome: "Bia", telefone: "11922222222", status: "Ativo" }, "t");
  const marca = (chave: string, seg: string) => bd().prepare("INSERT INTO crm_contatos (empresa, chave, telefone, nome, rfm_segmento, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, 1, 1) ON CONFLICT(empresa, chave) DO UPDATE SET rfm_segmento = excluded.rfm_segmento").run(e, chave, chave.slice(2), chave, seg);
  marca("p:11911111111", "champions");
  marca("p:11922222222", "em_risco");

  const s = criarSegmentoRfm(e, "champions");
  assert.equal(s.total, 1);
  const lista = A.listas(e).find((l) => l.id === s.id)!;
  assert.equal(lista.modo, "dinamica");
  assert.equal(lista.regras.rfmSegmento, "champions");
  assert.deepEqual(lista.chaves, []);
  assert.equal(criarSegmentoRfm(e, "champions").jaExistia, true, "não duplica");
  assert.equal(A.listas(e).length, 1);

  const doSeg = async () => {
    const { contatos } = await publico(e, "passageiro");
    return aplicarRegras(contatos, { tipo: "passageiro", listaId: lista.id }, A.listas(e)).map((c) => c.nome);
  };
  assert.deepEqual(await doSeg(), ["Ana"]);
  // A análise roda de novo e a Bia passa a campeã, a Ana cai: a lista acompanha sem ninguém mexer nela.
  marca("p:11911111111", "em_risco");
  marca("p:11922222222", "champions");
  assert.deepEqual(await doSeg(), ["Bia"]);
  assert.throws(() => criarSegmentoRfm(e, "inventado"), /inválido/);
});

test("sanearRegras aceita só o nome de segmento RFM válido", () => {
  assert.equal(sanearRegras({ tipo: "passageiro", rfmSegmento: "nao_pode_perder" }).rfmSegmento, "nao_pode_perder");
  assert.equal(sanearRegras({ tipo: "passageiro", rfmSegmento: "x'; DROP" }).rfmSegmento, undefined);
});
