// Banco do painel (SQLite do Node): migração dos JSON antigos sem perder nada, isolamento entre empresas,
// dados que sobrevivem a reabrir o banco, caminho pelo .env e a trava do disparo duplo.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-banco-"));
const ARQ_BANCO = path.join(DADOS, "outro-lugar", "meu-banco.db");
process.env.DADOS_DIR = DADOS;
process.env.BANCO_ARQUIVO = ARQ_BANCO;
process.env.NODE_ENV = "test";

const B = await import("../src/servidor/banco.ts");
const D = await import("../src/servidor/dados.ts");
const Bot = await import("../src/bot/armazem.ts");
const Crm = await import("../src/crm/armazem.ts");
const E = await import("../src/crm/envio.ts");
const W = await import("../src/crm/whatsapp.ts");
const Cad = await import("../src/cadastros/armazem.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");

const um = D.criarEmpresa("Banco Um").id;
const dois = D.criarEmpresa("Banco Dois").id;
const pastaEmp = (e: string, ...p: string[]) => path.join(DADOS, "empresas", e, ...p);

function conversaVelha(id: string, nome: string, aberta: boolean) {
  const c = Bot.novaConversa(id, nome);
  c.mensagens.push({ de: "passageiro", texto: `Oi, sou ${nome}`, em: "2026-11-01T10:00:00.000Z" });
  if (aberta) c.corrida = { id: `c-${id}`, os: "100001", status: "procurando", grupo: "aberta", criadaEm: "2026-11-01T10:00:00.000Z" };
  return c;
}

test("conversas do bot: o JSON antigo entra no banco na primeira vez, sem perder nada", () => {
  const velhas = { "5511911110001": conversaVelha("5511911110001", "Ana", true), "5511911110002": conversaVelha("5511911110002", "Beto", false) };
  fs.mkdirSync(pastaEmp(um, "bot"), { recursive: true });
  fs.writeFileSync(pastaEmp(um, "bot", "conversas.json"), JSON.stringify(velhas));

  const todas = Bot.conversas(um);
  assert.deepEqual(Object.keys(todas).sort(), Object.keys(velhas).sort());
  assert.deepEqual(todas["5511911110001"], velhas["5511911110001"], "a conversa volta igual");
  assert.ok(!fs.existsSync(pastaEmp(um, "bot", "conversas.json")), "o JSON sai do caminho");
  assert.ok(fs.existsSync(pastaEmp(um, "bot", "conversas.json.migrado")), "e fica guardado, não apagado");
  assert.deepEqual(Bot.conversasComCorridaAberta(um).map((c) => c.id), ["5511911110001"]);
  assert.ok(fs.existsSync(ARQ_BANCO), "o banco fica no caminho do BANCO_ARQUIVO");

  // Gravar uma conversa não mexe nas outras; outra empresa não vê nada.
  const ana = Bot.conversa(um, "5511911110001")!;
  ana.naoLidas = 7;
  Bot.salvarConversa(um, ana);
  assert.equal(Bot.conversa(um, "5511911110001")!.naoLidas, 7);
  assert.equal(Bot.conversa(um, "5511911110002")!.nome, "Beto");
  assert.deepEqual(Bot.conversas(dois), {});
  assert.equal(Bot.conversa(dois, "5511911110001"), null);
});

test("migração roda uma vez só e JSON estragado não some (tenta de novo depois)", () => {
  // Um JSON novo aparecendo depois não entra de novo (a empresa já foi migrada).
  fs.writeFileSync(pastaEmp(um, "bot", "conversas.json"), JSON.stringify({ "5511999990000": conversaVelha("5511999990000", "Fantasma", false) }));
  assert.equal(Bot.conversa(um, "5511999990000"), null);
  fs.rmSync(pastaEmp(um, "bot", "conversas.json"));

  // Arquivo estragado: não migra, não apaga, e a empresa segue funcionando.
  fs.mkdirSync(pastaEmp(dois, "crm"), { recursive: true });
  fs.writeFileSync(pastaEmp(dois, "crm", "fila.json"), "{ estragado");
  assert.deepEqual(Crm.fila(dois), []);
  assert.ok(fs.existsSync(pastaEmp(dois, "crm", "fila.json")), "arquivo estragado fica onde está");
  // Consertado, entra na próxima vez.
  fs.writeFileSync(pastaEmp(dois, "crm", "fila.json"), JSON.stringify([{ id: "x1", origem: { tipo: "teste", id: "t" }, chave: "p:1", nome: "Zé", telefone: "5511900000000", texto: "Oi", estado: "enviado", tentativas: 1, criadoEm: Date.now(), proximaEm: Date.now(), enviadoEm: Date.now(), erro: "" }]));
  assert.equal(Crm.fila(dois).length, 1);
  assert.ok(fs.existsSync(pastaEmp(dois, "crm", "fila.json.migrado")));
});

test("fila do CRM: o JSON antigo entra no banco e as pendentes continuam saindo", async () => {
  const agora = Date.now();
  const item = (id: string, estado: string, extra = {}) => ({ id, origem: { tipo: "campanha", id: "velha" }, chave: `p:${id}`, nome: id, telefone: `55119000000${id.slice(-2)}`, texto: `Oi ${id}`, estado, tentativas: 0, criadoEm: agora - 1000, proximaEm: agora - 1000, enviadoEm: null, erro: "", ...extra });
  const velha = [item("i01", "pendente"), item("i02", "pendente"), item("i03", "enviado", { enviadoEm: agora - 5000, tentativas: 1 }), item("i04", "falha", { erro: "Número sem WhatsApp" })];
  fs.mkdirSync(pastaEmp(um, "crm"), { recursive: true });
  fs.writeFileSync(pastaEmp(um, "crm", "fila.json"), JSON.stringify(velha));

  assert.deepEqual(Crm.fila(um), velha, "a fila volta igual, item por item");
  const enviadas: string[] = [];
  W.definirProvedorDeTeste(() => ({ nome: "t", pendencias: async () => [], enviar: async (tel) => { enviadas.push(tel); return { ok: true }; } }));
  Crm.salvarConfig(um, { ...Crm.config(um), lote: 0, limitePorMinuto: 120 });
  const r = await E.processarFila(um, { dormir: async () => {}, maxItens: 10 });
  W.definirProvedorDeTeste(null);
  assert.equal(r.enviados, 2, "as duas pendentes migradas saem");
  assert.equal(Crm.fila(um).filter((i) => i.estado === "enviado").length, 3);
  assert.equal(Crm.fila(um).find((i) => i.id === "i04")!.erro, "Número sem WhatsApp", "a falha antiga continua no relatório");
});

test("os dados ficam no banco depois de fechar e abrir de novo", () => {
  const antes = Crm.fila(um).length;
  B.fecharBanco();
  assert.equal(Crm.fila(um).length, antes);
  assert.equal(Bot.conversa(um, "5511911110001")!.naoLidas, 7);
});

test("disparo duplo continua barrado com o banco (e cada pessoa recebe uma vez)", async () => {
  const cli = cadastroPorId("clientes")!;
  for (const [n, t] of [["Ana", "11911110001"], ["Beto", "11911110002"], ["Caio", "11911110003"]]) Cad.criar(dois, cli, { nome: n, telefone: t, status: "Ativo" }, "t");
  const agora = new Date().toISOString();
  Crm.salvarCampanhas(dois, [{ id: "dupla", nome: "Dupla", canal: "whatsapp", publico: { tipo: "passageiro" }, texto: "Oi {nome}", variacoes: [], cupom: "", agendadaPara: null, estado: "rascunho", criadaEm: agora, atualizadaEm: agora, disparadaEm: null, concluidaEm: null, destinatarios: 0 } as never]);
  const r = await Promise.allSettled([E.dispararCampanha(dois, "dupla"), E.dispararCampanha(dois, "dupla"), E.dispararCampanha(dois, "dupla")]);
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1, "só um disparo passa");
  const itens = Crm.filaDaOrigem(dois, "dupla");
  assert.ok(itens.length >= 3);
  assert.equal(new Set(itens.map((i) => i.telefone)).size, itens.length, "ninguém recebe duas vezes");
  assert.equal(Crm.filaDaOrigem(um, "dupla").length, 0, "a outra empresa não vê");
  await assert.rejects(E.dispararCampanha(dois, "dupla"), /já foi disparada/);

  // Cancelar pela fila inteira (alterarFila) só mexe nas pendentes desta campanha.
  E.cancelarCampanha(dois, "dupla");
  assert.ok(Crm.filaDaOrigem(dois, "dupla").every((i) => i.estado === "cancelado"));
  assert.equal(Crm.fila(dois).find((i) => i.id === "x1")!.estado, "enviado");
  B.fecharBanco();
  fs.rmSync(DADOS, { recursive: true, force: true });
});
