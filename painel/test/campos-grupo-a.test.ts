// Grupo A, segunda passada: chat com "Carregar mais mensagens" (limite e total) e máscaras de data do painel.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DADOS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "campos-a-"));
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "t".repeat(40);
const D = await import("../src/servidor/dados.ts");
const Com = await import("../src/config/comunicacao.ts");
const { mascaraData, mascaraHora, brParaIso, isoParaBr } = await import("../src/web/componentes/DataBr.tsx");

test("chat: limite devolve só as últimas e o total conta todas", () => {
  const e = D.criarEmpresa("Chat Teste");
  for (let i = 0; i < 45; i++) Com.receberDaPessoa(e.id, "motorista", "m1", "Motorista Um", `mensagem ${i}`);
  const ult = Com.mensagensDaPessoa(e.id, "motorista", "m1", 30);
  assert.equal(ult.length, 30);
  assert.equal(ult[29].texto, "mensagem 44");
  assert.equal(Com.totalMensagens(e.id, "motorista", "m1"), 45);
  assert.equal(Com.mensagensDaPessoa(e.id, "motorista", "m1", 60).length, 45);
});

test("máscaras de data e hora como na Machine", () => {
  assert.equal(mascaraData("04112026"), "04/11/2026");
  assert.equal(mascaraData("0411"), "04/11");
  assert.equal(mascaraHora("1032"), "10:32");
  assert.equal(brParaIso("04/11/2026"), "2026-11-04");
  assert.equal(brParaIso("31/02/2026"), "");
  assert.equal(isoParaBr("2026-11-04"), "04/11/2026");
});
