// Cupons automáticos da Machine: PRIMEIRA CORRIDA e DE VOLTA valem sozinhos, uma vez por passageiro, e não podem ser digitados.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-cupauto-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
delete process.env.BANCO_ARQUIVO;
delete process.env.OSRM_URL;

const { criarEmpresa } = await import("../src/servidor/dados.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const C = await import("../src/cadastros/armazem.ts");
const R = await import("../src/corridas/index.ts");
const B = await import("../src/servidor/banco.ts");
test.after(() => { B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

const e = criarEmpresa("Cupom Auto").id;
const cat = cadastroPorId("categorias")!, cup = cadastroPorId("cupons")!, mot = cadastroPorId("motoristas")!;
C.criar(e, cat, { nome: "Econômico", bandeirada: "5", valorKm: "2", valorMinuto: "0,5", valorMinimo: "10", ativa: true }, "t");
const m = C.criar(e, mot, { nome: "Bruno", telefone: "11955556666", status: "Ativo" }, "t");

async function corrida(tel: string, extra: Record<string, unknown> = {}) {
  return R.criarCorridaPropria(e, { passageiro: { nome: `P ${tel}`, telefone: tel }, embarque: { texto: "Rua A, 10" }, destino: { texto: "Rua B" }, categoria: "Econômico", pagamento: "Pix", canal: "bot", distanciaKm: 4, ...extra } as never, "t");
}
async function finalizar(id: string) {
  await R.atribuirMotorista(e, id, m.id);
  for (const s of ["no_local", "em_andamento"]) await R.mudarStatus(e, id, s as never);
  await R.mudarStatus(e, id, "finalizada", { valor: 20 });
}

test("cupom automático desligado não dá desconto", async () => {
  const c = await corrida("11911110001");
  assert.equal(c.desconto, null);
  assert.equal(c.cupom, "");
  await R.mudarStatus(e, c.id, "cancelada", { por: "t" } as never).catch(() => {});
});

test("PRIMEIRA CORRIDA: só na primeira, uma vez, e não vale digitado por outro passageiro", async () => {
  C.criar(e, cup, { codigo: "PRIMEIRA CORRIDA", automatico: true, tipoDesconto: "Percentual", valor: "10", ativo: true }, "t");
  const c1 = await corrida("11911110002");
  assert.equal(c1.cupom, "PRIMEIRA CORRIDA");
  assert.ok((c1.desconto ?? 0) > 0);
  await finalizar(c1.id);
  const c2 = await corrida("11911110002");
  assert.equal(c2.desconto, null, "segunda corrida não ganha");
  // outro passageiro já com corrida finalizada não pode digitar o código automático
  const c3 = await corrida("11911110002", { cupom: "PRIMEIRA CORRIDA" }).catch(() => null);
  assert.ok(!c3 || !c3.desconto, "digitado não vale");
});

test("DE VOLTA: cliente inativo há 30 dias ganha uma vez", async () => {
  C.criar(e, cup, { codigo: "DE VOLTA", automatico: true, tipoDesconto: "Valor fixo", valor: "3", ativo: true }, "t");
  const antiga = await corrida("11911110003");
  await finalizar(antiga.id);
  const nova = await corrida("11911110003");
  assert.equal(nova.desconto, null, "ainda ativo: sem desconto");
  await R.mudarStatus(e, nova.id, "cancelada", { por: "t" } as never).catch(() => {});
  // envelhece a corrida finalizada para 40 dias atrás (cópia: as corridas guardadas são imutáveis)
  const velha = { ...R.listarProprias(e).find((c) => c.id === antiga.id)!, finalizadaEm: new Date(Date.now() - 40 * 86_400_000).toISOString() };
  const vale = R.cupomAutomatico(e, [velha], 20, "Econômico");
  assert.equal(vale?.codigo, "DE VOLTA");
  assert.equal(vale?.desconto, 3);
  const jaUsou = R.cupomAutomatico(e, [velha, { ...velha, id: "x", cupom: "DE VOLTA", status: "finalizada" }], 20, "Econômico");
  assert.equal(jaUsou, null, "só uma vez por passageiro");
});
