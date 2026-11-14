// Categoria completa (campos da Machine, vinculação de motoristas) e Nova Solicitação (informações, valor final, exigências).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-cadcat-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "f".repeat(40);
delete process.env.BANCO_ARQUIVO;
delete process.env.OSRM_URL;

const D = await import("../src/servidor/dados.ts");
const B = await import("../src/servidor/banco.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar, listar } = await import("../src/cadastros/armazem.ts");
const K = await import("../src/config/categorias.ts");
const C = await import("../src/corridas/index.ts");
test.after(() => { B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

const E = D.criarEmpresa("Cad Um").id, E2 = D.criarEmpresa("Cad Dois").id;
const mot = (e: string, nome: string, cats: string, placa: string, status = "Ativo") =>
  criar(e, cadastroPorId("motoristas")!, { nome, telefone: `1199${Math.floor(Math.random() * 9e6 + 1e6)}`, placa, categorias: cats, status }, "teste");

test("categoria guarda os campos novos e valida nome e detalhes", () => {
  assert.throws(() => K.salvarCategoria(E, null, { nome: "A" }, "t"), /nome da categoria/);
  const c = K.salvarCategoria(E, null, {
    nome: "Comum", extra: { detalhes: "x".repeat(200), ocultarCapacidade: true, macaneta: false, dinamicaAtiva: false, impulsionamentoAuto: true, valorExtraPassageiro: true, segurancaMulheres: true, solicitacoes: "imediatas", icone: { modo: "biblioteca", biblioteca: "pcd" } },
  }, "t");
  const x = c.extra;
  assert.equal(x.detalhes.length, 140);
  assert.deepEqual([x.ocultarCapacidade, x.macaneta, x.dinamicaAtiva, x.impulsionamentoAuto, x.valorExtraPassageiro, x.segurancaMulheres, x.solicitacoes], [true, false, false, true, true, true, "imediatas"]);
  assert.equal(x.permiteAgendamento, false);
  assert.equal(x.icone.biblioteca, "pcd");
  // Sempre por empresa.
  assert.equal(K.categoriasCompletas(E2).length, 0);
  // Versão antiga que só manda permiteAgendamento continua valendo.
  const velha = K.sanearExtra({ permiteAgendamento: false });
  assert.equal(velha.solicitacoes, "imediatas");
  // Valor extra não vale em categoria só de agendamentos.
  assert.equal(K.sanearExtra({ solicitacoes: "agendadas", valorExtraPassageiro: true }).valorExtraPassageiro, false);
});

test("vinculação de motoristas ao criar categoria", () => {
  const a = K.salvarCategoria(E, null, { nome: "Origem" }, "t");
  mot(E, "Ana", "Origem", "AAA1A11"); mot(E, "Beto", "Outra", "BBB2B22", "Bloqueado"); mot(E2, "Cris", "Origem", "CCC3C33");
  K.salvarCategoria(E, null, { nome: "Copiada", vinculo: { modo: "copiar", deCategoriaId: a.id } }, "t");
  const c = (n: string) => String(listar(E, cadastroPorId("motoristas")!).find((m) => m.nome === n)?.categorias);
  assert.match(c("Ana"), /Copiada/); assert.doesNotMatch(c("Beto"), /Copiada/);
  assert.throws(() => K.salvarCategoria(E, null, { nome: "Sem", vinculo: { modo: "copiar", deCategoriaId: "nada" } }, "t"), /categoria de onde copiar/);
  K.salvarCategoria(E, null, { nome: "Todos", vinculo: { modo: "todos" } }, "t");
  assert.match(c("Beto"), /Todos/);
  assert.equal(String(listar(E2, cadastroPorId("motoristas")!)[0].categorias), "Origem"); // outra empresa intacta
});

const PED = (extra: object = {}) => ({ passageiro: { nome: "Teste Um", telefone: "11955550001" }, embarque: { texto: "Rua A, 10" }, categoria: "Comum", pagamento: "Dinheiro", canal: "painel" as const, ...extra });

test("solicitação guarda informações, valor prefixado e respeita o tipo de solicitação", async () => {
  const c = await C.criarCorridaPropria(E, PED({ infoAntes: "Portão azul", infoDepois: "Ligar ao chegar", infoInterna: "Cliente VIP", enviarVariosCarros: true, telefoneContato: "(11) 98888-7777", valorFinal: { modo: "prefixado", valor: 42.5 } }) as never, "t");
  assert.equal(c.infoAntes, "Portão azul"); assert.equal(c.infoDepois, "Ligar ao chegar"); assert.equal(c.infoInterna, "Cliente VIP");
  assert.equal(c.enviarVariosCarros, true); assert.equal(c.telefoneContato, "11988887777");
  assert.deepEqual(c.valorFinal, { modo: "prefixado", valor: 42.5 });
  const amanha = new Date(Date.now() + 86_400_000 - 3 * 3600_000).toISOString().slice(0, 16);
  await assert.rejects(C.criarCorridaPropria(E, PED({ passageiro: { nome: "Dois", telefone: "11955550002" }, agendadaPara: amanha }) as never, "t"), /apenas solicitações imediatas/);
  await assert.rejects(C.criarCorridaPropria(E, PED({ passageiro: { nome: "Três", telefone: "11955550003" }, valorFinal: { modo: "prefixado" } }) as never, "t"), /valor prefixado/);
  K.salvarCategoria(E, null, { nome: "Agenda", extra: { solicitacoes: "agendadas" } }, "t");
  await assert.rejects(C.criarCorridaPropria(E, PED({ categoria: "Agenda", passageiro: { nome: "Quatro", telefone: "11955550004" } }) as never, "t"), /apenas corridas agendadas/);
});
