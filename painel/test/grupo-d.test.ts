// Telas do grupo D no formato da Machine: filtros do Alertas para empresas (vários tipos e situações) e filtros da
// tela "Criando Notificação" (título opcional, quantidade de corridas, cadastro, gênero, categorias e status).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-grupod-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "g".repeat(40);
delete process.env.BANCO_ARQUIVO;

const D = await import("../src/servidor/dados.ts");
const B = await import("../src/servidor/banco.ts");
const { criarAlerta, encerrarAlerta, listarAlertas } = await import("../src/config/alertas.ts");
const { sanearPedido, sanearFiltrosPush, dispararNotificacao } = await import("../src/config/comunicacao.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar } = await import("../src/cadastros/armazem.ts");

test.after(() => { B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });
const E = D.criarEmpresa("Grupo D").id;

test("Alertas: tipo e status aceitam mais de um valor", () => {
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const a = criarAlerta(E, { tipo: "Urgente", conteudo: "Um", data: hoje, hora: "00:00", duracao: 1, unidade: "Semanas" }, "adm");
  criarAlerta(E, { tipo: "Aviso", conteudo: "Dois", data: hoje, hora: "00:00", duracao: 1, unidade: "Semanas" }, "adm");
  criarAlerta(E, { tipo: "Atenção", conteudo: "Três", data: hoje, hora: "00:00", duracao: 1, unidade: "Semanas" }, "adm");
  assert.equal(listarAlertas(E, {}).itens.length, 3);
  assert.deepEqual(listarAlertas(E, { tipo: "Urgente,Aviso" }).itens.map((x) => x.tipo).sort(), ["Aviso", "Urgente"]);
  assert.equal(listarAlertas(E, { tipo: "Atenção" }).itens.length, 1);
  encerrarAlerta(E, a.id, "adm");
  assert.equal(listarAlertas(E, { status: "Ativo" }).itens.length, 2);
  assert.equal(listarAlertas(E, { status: "Inativo" }).itens.length, 1);
  assert.equal(listarAlertas(E, { status: "Ativo,Inativo" }).itens.length, 3);
});

test("Notificação: título é opcional quando a tela pede, mensagem vai até 255", () => {
  assert.throws(() => sanearPedido({ papel: "motorista", titulo: "", mensagem: "oi" }), /título/);
  const p = sanearPedido({ papel: "motorista", titulo: "", tituloOpcional: true, mensagem: "x".repeat(300) });
  assert.equal(p.mensagem.length, 255);
  assert.equal(p.titulo, "Aviso da central");
  assert.throws(() => sanearPedido({ papel: "motorista", tituloOpcional: true, mensagem: "" }), /mensagem/);
});

test("Notificação: filtros são limpos e conferidos", () => {
  assert.equal(sanearFiltrosPush({}), undefined);
  assert.deepEqual(sanearFiltrosPush({ corridasMin: "2", corridasMax: "", genero: ["Feminino"], cadastroDe: "lixo" }), { corridasMin: 2, genero: ["Feminino"] });
  assert.throws(() => sanearFiltrosPush({ corridasMin: 5, corridasMax: 2 }), /mínima/);
  assert.throws(() => sanearFiltrosPush({ cadastroDe: "2026-02-01", cadastroAte: "2026-01-01" }), /data inicial/);
});

test("Notificação: filtros escolhem quem recebe", async () => {
  const mot = cadastroPorId("motoristas")!, cli = cadastroPorId("clientes")!;
  criar(E, mot, { nome: "Ana", telefone: "11911110001", status: "Ativo", genero: "Feminino", categorias: "Econômico, Luxo" }, "t");
  criar(E, mot, { nome: "Beto", telefone: "11911110002", status: "Em análise", genero: "Masculino", categorias: "Luxo" }, "t");
  criar(E, mot, { nome: "Caio", telefone: "11911110003", status: "Ativo", genero: "Masculino", categorias: "Econômico" }, "t");
  criar(E, cli, { nome: "Dani", telefone: "11922220001", status: "Ativo", genero: "Feminino" }, "t");
  criar(E, cli, { nome: "Edu", telefone: "11922220002", status: "Ativo", genero: "Masculino" }, "t");
  const usar = (o: Record<string, unknown>) => dispararNotificacao(E, sanearPedido({ segmento: "todos", tituloOpcional: true, mensagem: "oi", ...o }), "t");
  assert.equal((await usar({ papel: "motorista" })).destinatarios, 2); // só ativos, como sempre
  assert.equal((await usar({ papel: "motorista", filtros: { categorias: ["Luxo"] } })).destinatarios, 1); // Ana (Beto não está ativo)
  assert.equal((await usar({ papel: "motorista", filtros: { status: ["Em análise"] } })).destinatarios, 1); // com status marcado, vale o status
  assert.equal((await usar({ papel: "motorista", filtros: { genero: ["Masculino"] } })).destinatarios, 1);
  assert.equal((await usar({ papel: "passageiro", filtros: { genero: ["Feminino"] } })).destinatarios, 1);
  assert.equal((await usar({ papel: "passageiro" })).destinatarios, 2);
  await assert.rejects(() => usar({ papel: "passageiro", filtros: { corridasMin: 1 } }), /Nenhum destinatário/); // ninguém fez corrida
  assert.equal((await usar({ papel: "passageiro", filtros: { corridasMax: 0 } })).destinatarios, 2);
});

test("Notificações app: lista mostra envio agendado, ordena por coluna e a prévia conta quem recebe", async () => {
  const { listaNotificacoes, criarAgendamento, previaDestinatarios } = await import("../src/config/comunicacao.ts");
  criar(E, cadastroPorId("motoristas")!, { nome: "Prévia A", telefone: "11955550001", status: "Ativo" }, "t");
  criar(E, cadastroPorId("motoristas")!, { nome: "Prévia B", telefone: "11955550002", status: "Ativo" }, "t");
  const pedido = sanearPedido({ papel: "motorista", titulo: "Zeta", mensagem: "primeiro", tituloOpcional: true });
  const previa = previaDestinatarios(E, pedido);
  assert.ok(previa.total >= 2);
  assert.ok(previa.nomes.includes("Prévia A"));
  await dispararNotificacao(E, pedido, "adm");
  criarAgendamento(E, { papel: "motorista", titulo: "Futura", mensagem: "depois", tituloOpcional: true, regra: "unico", data: "2099-01-01", hora: "10:00" });
  const l = listaNotificacoes(E, {}, 1);
  assert.ok(l.itens.some((i) => i.status === "Agendada" && i.titulo === "Futura" && i.enviadoEm.startsWith("2099-01-01")));
  assert.ok(l.itens.some((i) => i.status === "Concluído" && i.titulo === "Zeta"));
  const asc = listaNotificacoes(E, { ordem: "titulo", sentido: "asc" }, 1).itens.map((i) => i.titulo);
  assert.deepEqual(asc, [...asc].sort((a, b) => a.localeCompare(b, "pt-BR")));
  assert.equal(listaNotificacoes(E, { titulo: "futu" }, 1).itens.length, 1);
});
