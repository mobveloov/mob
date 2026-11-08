// Testes do núcleo próprio: cadastros e corridas próprias (sem nenhuma chave de sistema externo).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-nucleo-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";

const { criarEmpresa } = await import("../src/servidor/dados.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const C = await import("../src/cadastros/armazem.ts");
const R = await import("../src/corridas/index.ts");
const { buscarCorridas } = await import("../src/servidor/fontes/index.ts");

const e1 = criarEmpresa("Empresa Um").id;
const e2 = criarEmpresa("Empresa Dois").id;
const mot = cadastroPorId("motoristas")!, cli = cadastroPorId("clientes")!, cat = cadastroPorId("categorias")!, cup = cadastroPorId("cupons")!;

test("cadastro: cria, valida, não duplica, edita e exclui", () => {
  const m = C.criar(e1, mot, { nome: "Ana", telefone: "(11) 98888-7777", status: "Ativo", cpf: "123.456.789-01" }, "t");
  assert.equal(m.telefone, "11988887777");
  assert.equal(m.cpf, "12345678901");
  assert.throws(() => C.criar(e1, mot, { nome: "Outra", telefone: "11988887777", status: "Ativo" }, "t"), /Já existe/);
  assert.throws(() => C.criar(e1, mot, { nome: "Sem fone", status: "Ativo" }, "t"), /Telefone/);
  assert.throws(() => C.criar(e1, mot, { nome: "X", telefone: "11977776666", status: "Inventado" }, "t"), /opções/);
  const ed = C.atualizar(e1, mot, m.id, { ...m, placa: "ABC1D23", corridas: 999 }, "t");
  assert.equal(ed.placa, "ABC1D23");
  assert.equal(ed.corridas, null, "campo calculado não vem do formulário");
  assert.equal(C.listar(e2, mot).length, 0, "outra empresa não vê");
  C.remover(e1, mot, m.id);
  assert.equal(C.listar(e1, mot).length, 0);
});

test("importação mescla sem apagar o que foi editado", () => {
  C.criar(e1, cli, { nome: "Maria", telefone: "11911112222", status: "Bloqueado", observacao: "caloteira" }, "t");
  const r = C.mesclar(e1, cli, [{ nome: "Maria S.", telefone: "11911112222", status: "Ativo", corridas: 7 }, { nome: "João", telefone: "11933334444", status: "Ativo" }], "imp");
  assert.deepEqual(r, { criados: 1, atualizados: 1 });
  const maria = C.listar(e1, cli).find((x) => x.telefone === "11911112222")!;
  assert.equal(maria.status, "Bloqueado", "mantém o que a central editou");
  assert.equal(maria.nome, "Maria");
  assert.equal(maria.corridas, 7, "atualiza o calculado");
});

test("corrida própria: preço pela tarifa, cupom, motorista, status, finalizar e aparecer na consulta", async () => {
  C.criar(e1, cat, { nome: "Econômico", bandeirada: "5", valorKm: "2", valorMinuto: "0,5", valorMinimo: "10", ativa: true }, "t");
  C.criar(e1, cup, { codigo: "DEZ", tipoDesconto: "Percentual", valor: "10", ativo: true }, "t");
  const m = C.criar(e1, mot, { nome: "Bruno", telefone: "11955556666", status: "Ativo" }, "t");
  const est = R.estimarPreco(e1, { categoria: "econômico", distanciaKm: 4 });
  assert.equal(est.minutos, 10);
  assert.ok(est.valor === 18 || est.valor! > 18, "5 + 4×2 + 10×0,5 = 18 (ou mais à noite)");

  const c = await R.criarCorridaPropria(e1, { passageiro: { nome: "João", telefone: "(11) 93333-4444" }, embarque: { texto: "Rua A, 10" }, destino: { texto: "Rua B" }, categoria: "Econômico", pagamento: "Pix", canal: "bot", distanciaKm: 4, cupom: "dez" }, "bot");
  assert.equal(c.status, "procurando");
  assert.ok((c.desconto ?? 0) > 0, "cupom aplicado");
  await assert.rejects(R.criarCorridaPropria(e1, { passageiro: { nome: "João", telefone: "11933334444" }, embarque: { texto: "Rua A" }, categoria: "Econômico", pagamento: "Pix", canal: "bot" }), /já tem uma corrida em aberto/);
  await assert.rejects(R.criarCorridaPropria(e1, { passageiro: { nome: "Maria", telefone: "11911112222" }, embarque: { texto: "Rua A" }, categoria: "Econômico", pagamento: "Pix", canal: "totem" }), /bloqueado/);
  await assert.rejects(R.mudarStatus(e1, c.id, "em_andamento"), /Não dá para ir/);

  await R.atribuirMotorista(e1, c.id, m.id);
  await R.mudarStatus(e1, c.id, "em_andamento");
  const fim = await R.mudarStatus(e1, c.id, "finalizada", { valor: 20 });
  assert.equal(fim.valor, 20 - (c.desconto ?? 0));
  await assert.rejects(R.cancelarCorrida(e1, c.id, "Central", "x"), /já terminou/);
  await R.avaliar(e1, c.id, 5);

  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const r = await buscarCorridas(e1, { inicio: hoje, fim: hoje, origem: "propria" });
  assert.equal(r.corridas.length, 1);
  assert.equal(r.corridas[0].grupo, "finalizada");
  assert.equal(r.corridas[0].motorista, "Bruno");
  assert.equal(r.corridas[0].avaliacao, 5);
  assert.equal((await buscarCorridas(e2, { inicio: hoje, fim: hoje, origem: "propria" })).corridas.length, 0, "outra empresa não vê");
  fs.rmSync(DADOS, { recursive: true, force: true });
});
