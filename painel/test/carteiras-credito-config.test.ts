// Configurações > Carteiras de crédito: grava nas fontes de sempre (saldo mínimo, aviso, recarga, saque) e o app do motorista lê o mesmo.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-carteiras-credito-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "c".repeat(40);
delete process.env.BANCO_ARQUIVO;

const D = await import("../src/servidor/dados.ts");
const B = await import("../src/servidor/banco.ts");
const { carteirasCredito, salvarCarteirasCredito, carteiraParaApp } = await import("../src/config/carteiras-credito.ts");
const { creditosPadrao } = await import("../src/gestao/regras.ts");
const { pagamentos } = await import("../src/config/pagamentos.ts");
const { regrasDeSaque } = await import("../src/apps/extras.ts");
const { cargoMinimoDaRota } = await import("../src/comum/cargos.ts");

test.after(() => { B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });
const E = D.criarEmpresa("Carteiras Config").id;

const completo = (m: Record<string, unknown> = {}, passageiro = { recargaApp: false }) => ({
  motorista: {
    saldoMinimoAtivo: true, saldoMinimo: "-10,00", mensagemRecargaAtiva: true, mensagemRecargaValor: "5,00", recarga: true, saque: true, pix: true,
    minimoRecargaPix: "20,00", saqueAutomaticoPix: false, presencial: false, telefoneAtivo: false, telefone: "", repasseTaxaCancelamento: false, ...m,
  }, passageiro,
});

test("padrão: sem bloqueio por saldo, saque ligado, Pix marcado, repasse imediato", () => {
  const c = carteirasCredito(E);
  assert.equal(c.motorista.saldoMinimoAtivo, false);
  assert.equal(c.motorista.saque, true);
  assert.equal(c.motorista.pix, true);
  assert.equal(c.passageiro.recargaApp, false);
});

test("salvar grava o saldo mínimo e o aviso onde o despacho lê, e a recarga e o saque onde o app lê", () => {
  salvarCarteirasCredito(E, completo({ presencial: true, telefoneAtivo: true, telefone: "(19) 99999-0000", saqueAutomaticoPix: true }, { recargaApp: true }));
  assert.equal(creditosPadrao(E).saldoMinimo, -10);
  assert.equal(creditosPadrao(E).avisoRecarga, 5);
  assert.equal(pagamentos(E).recarga.motorista, true);
  assert.equal(pagamentos(E).recarga.minimoMotorista, 20);
  assert.equal(pagamentos(E).recarga.passageiro, true);
  const c = carteirasCredito(E);
  assert.equal(c.motorista.presencial, true);
  assert.equal(c.motorista.telefone, "(19) 99999-0000");
  assert.equal(c.motorista.repasseTaxaCancelamento, false);
});

test("Não no saldo mínimo desliga o bloqueio mas lembra o valor; Saque desligado barra o saque do app", () => {
  salvarCarteirasCredito(E, completo({ saldoMinimoAtivo: false, saldoMinimo: "-25", saque: false }));
  assert.equal(creditosPadrao(E).saldoMinimo, null);
  assert.equal(regrasDeSaque(E).ativo, false);
  const c = carteirasCredito(E);
  assert.equal(c.motorista.saldoMinimoAtivo, false);
  assert.equal(c.motorista.saldoMinimo, -25);
});

test("o app recebe os botões, o telefone e o aviso de saldo baixo", () => {
  salvarCarteirasCredito(E, completo({ telefoneAtivo: true, telefone: "(19) 3333-4444", presencial: true, saque: false }));
  const baixo = carteiraParaApp(E, 3);
  assert.equal(baixo.movimentos.recarga, true);
  assert.equal(baixo.movimentos.saque, false);
  assert.equal(baixo.movimentos.telefone, "(19) 3333-4444");
  assert.match(baixo.avisoRecarga, /saldo está baixo/);
  assert.equal(carteiraParaApp(E, 50).avisoRecarga, "");
  salvarCarteirasCredito(E, completo({ mensagemRecargaAtiva: false }));
  assert.equal(carteiraParaApp(E, 3).avisoRecarga, "");
});

test("valores inválidos são recusados", () => {
  assert.throws(() => salvarCarteirasCredito(E, completo({ saldoMinimo: "" })), /saldo mínimo/);
  assert.throws(() => salvarCarteirasCredito(E, completo({ saldoMinimo: "abc" })), /inválido/);
  assert.throws(() => salvarCarteirasCredito(E, completo({ minimoRecargaPix: "" })), /mínimo para recarga/);
  assert.throws(() => salvarCarteirasCredito(E, completo({ telefoneAtivo: true, telefone: "12" })), /telefone/i);
});

test("só administrador grava; gestor lê", () => {
  assert.equal(cargoMinimoDaRota("PUT", "/config/carteiras-credito"), "admin");
  assert.equal(cargoMinimoDaRota("GET", "/config/carteiras-credito"), "gestor");
});
