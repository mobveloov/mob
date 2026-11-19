// Escolha da rua dentro da conversa (CNEFE): endereço que serve para mais de uma rua vira lista numerada.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

process.env.DADOS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "bot-ruas-"));
const CNEFE = fs.mkdtempSync(path.join(os.tmpdir(), "bot-ruas-cnefe-"));
process.env.CNEFE_DIR = CNEFE;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "y".repeat(40);
process.env.OSRM_PUBLICO = "0"; process.env.NOMINATIM_PUBLICO = "0";
for (const k of ["ANTHROPIC_API_KEY", "GROQ_API_KEYS", "GROQ_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY"]) delete process.env[k];

fs.mkdirSync(path.join(CNEFE, "_casas"));
fs.mkdirSync(path.join(CNEFE, "35_SP"));
fs.writeFileSync(path.join(CNEFE, "35_SP", "3599999_CIDADE_TESTE.zip"), "");
const linhas = [
  ["3599999", "100", "DAS FLORES", "CENTRO", "RUA", "-21.000000", "-48.000000", "14750000"],
  ["3599999", "200", "DAS FLORES", "CENTRO", "RUA", "-21.001000", "-48.000000", "14750000"],
  ["3599999", "10", "DAS FLORES", "VILA NOVA", "RUA", "-21.050000", "-48.050000", "14750001"],
  ["3599999", "50", "DAS FLORES", "VILA NOVA", "RUA", "-21.051000", "-48.050000", "14750001"],
  ["3599999", "5", "SAO JOAO", "VILA NOVA", "AVENIDA", "-21.010000", "-48.010000", "14750002"],
  ["3599999", "50", "SAO JOAO", "VILA NOVA", "AVENIDA", "-21.011000", "-48.010000", "14750002"],
].map((l) => l.join("\t")).join("\n");
fs.writeFileSync(path.join(CNEFE, "_casas", "35_SP.tsv.gz"), zlib.gzipSync(linhas));

const D = await import("../src/servidor/dados.ts");
const E = await import("../src/enderecos/index.ts");
const A = await import("../src/bot/armazem.ts");
const L = await import("../src/bot/lista-ruas.ts");
const { receber } = await import("../src/bot/fluxo.ts");
const { definirCorridasDoBot } = await import("../src/bot/corridas.ts");

const empresa = D.criarEmpresa("Central Ruas", { nomeExibido: "Central Ruas", assistente: { nome: "Lia", tom: "cordial" } });
E.salvarConfig(empresa.id, { municipios: ["3599999"] });
assert.equal(await E.prepararAgora("3599999"), true);
A.salvarConfig(empresa.id, { ativo: true, provedor: "simulado", instancia: "bot-ruas", agendar: false });
const criadas: Array<{ embarque: string; destino?: string }> = [];
definirCorridasDoBot({
  categorias: async () => [{ id: "c1", nome: "Comum" }],
  criar: async (_e, n) => { criadas.push({ embarque: n.embarque.texto, destino: n.destino?.texto }); return { id: `r${criadas.length}`, os: String(900 + criadas.length) }; },
  detalhar: async () => ({ status: "procurando", grupo: "aberta" }),
  cancelar: async () => undefined,
  avaliar: async () => undefined,
});
let seq = 0;
const msg = (tel: string, texto: string) => receber(empresa.id, { id: `r${++seq}`, telefone: tel, nome: "Rui", texto }, { classificar: async () => null });
const conv = (tel: string) => A.conversa(empresa.id, tel)!;

test("opcoesDeRua: mesma rua em dois bairros vira lista; rua única, bairro citado e texto curto não", () => {
  const l = L.opcoesDeRua(empresa.id, "Rua das Flores, 120");
  assert.equal(l?.length, 2);
  assert.match(l![0].texto, /^Rua das Flores, 120, Centro, Cidade Teste - SP$/);
  assert.match(l![1].texto, /^Rua das Flores, 120, Vila Nova, Cidade Teste - SP$/);
  assert.ok(l![0].lat != null, "com número o ponto vai junto");
  assert.equal(L.opcoesDeRua(empresa.id, "Rua das Flores")![0].lat, undefined, "sem número fica sem ponto (meio da rua)");
  assert.match(L.opcoesDeRua(empresa.id, "Rua das Flores")![0].texto, /^Rua das Flores, Centro, Cidade Teste - SP$/);
  assert.equal(L.opcoesDeRua(empresa.id, "Avenida Sao Joao 50"), null, "uma rua só");
  assert.equal(L.opcoesDeRua(empresa.id, "Rua das Flores 120 Vila Nova"), null, "o bairro citado resolve");
  assert.equal(L.opcoesDeRua(empresa.id, "ab"), null);
  assert.equal(L.opcoesDeRua(empresa.id, "Rua que não existe 12"), null);
});

test("escolha pelo número, pelo nome e pela posição", () => {
  const l = [{ texto: "Rua das Flores, 120, Centro, Cidade Teste - SP" }, { texto: "Rua das Flores, 120, Vila Nova, Cidade Teste - SP" }];
  assert.equal(L.escolhaDaLista("2", l), 2);
  assert.equal(L.escolhaDaLista("3", l), 0);
  assert.equal(L.escolhaDaLista("vila nova", l), 2);
  assert.equal(L.escolhaDaLista("a primeira", l), 1);
  assert.equal(L.escolhaDaLista("flores", l), 0, "serve para as duas");
  assert.equal(L.servePraMais("flores", l), true);
});

test("fluxo: embarque ambíguo mostra a lista, o número escolhe, e a conversa segue para o destino", async () => {
  const tel = "5511950000001";
  await msg(tel, "oi"); await msg(tel, "1");
  const r = await msg(tel, "Rua das Flores, 120");
  assert.match(r[0], /Encontrei mais de uma opção para "Rua das Flores, 120"\. Qual é o local de embarque correto\?/);
  assert.match(r[0], /1 - Rua das Flores, 120, Centro/);
  assert.match(r[0], /2 - Rua das Flores, 120, Vila Nova/);
  assert.equal(conv(tel).etapa, "selecao_rua");
  assert.match((await msg(tel, "9"))[0], /Opção inválida\. Responda com o número da rua correta \(1 a 2\)/);
  const d = await msg(tel, "2");
  assert.match(d[0], /endereço de destino/);
  assert.equal(conv(tel).rascunho.embarque?.texto, "Rua das Flores, 120, Vila Nova, Cidade Teste - SP");
  assert.equal(conv(tel).etapa, "destino");
});

test("fluxo: destino ambíguo com a lista de destinos; escolha pelo nome do bairro", async () => {
  const tel = "5511950000002";
  await msg(tel, "oi"); await msg(tel, "1"); await msg(tel, "Avenida Sao Joao, 50");
  const r = await msg(tel, "Rua das Flores, 200");
  assert.match(r[0], /Encontrei 2 destinos possíveis para "Rua das Flores, 200"\. Responda com o número do local correto:/);
  assert.equal(conv(tel).etapa, "selecao_rua_destino");
  assert.match((await msg(tel, "talvez"))[0], /Opção inválida\. Responda com o número do local correto \(1 a 2\)/);
  const c = await msg(tel, "centro");
  assert.match(c[0], /Confira o pedido/);
  assert.match(c[0], /Rua das Flores, 200, Centro/);
});

test("fluxo: rua sem número e ambígua: escolhe e o bot pede o número; depois a corrida sai com o endereço completo", async () => {
  const tel = "5511950000003";
  await msg(tel, "oi"); await msg(tel, "1");
  const r = await msg(tel, "Rua das Flores");
  assert.match(r[0], /Encontrei mais de uma opção/);
  const n = await msg(tel, "1");
  assert.match(n[0], /Qual é o NÚMERO do embarque/);
  assert.equal(conv(tel).etapa, "numero_embarque");
  await msg(tel, "120");
  assert.equal(conv(tel).rascunho.embarque?.texto, "Rua das Flores, 120, Centro, Cidade Teste - SP");
  await msg(tel, "2"); // sem destino
  await msg(tel, "1"); await msg(tel, "1");
  const fim = await msg(tel, "1");
  assert.match(fim[0], /Pedido feito/);
  assert.equal(criadas.at(-1)?.embarque, "Rua das Flores, 120, Centro, Cidade Teste - SP");
});

test("fluxo: digitar outro endereço em vez de escolher volta a pedir o embarque; rua única não pergunta", async () => {
  const tel = "5511950000004";
  await msg(tel, "oi"); await msg(tel, "1"); await msg(tel, "Rua das Flores, 120");
  const r = await msg(tel, "Avenida São João, 50");
  assert.match(r[0], /Preciso do endereço de embarque/);
  assert.equal(conv(tel).etapa, "embarque");
  const u = await msg(tel, "Avenida Sao Joao, 50");
  assert.match(u[0], /endereço de destino/);
  assert.equal(conv(tel).etapa, "destino");
});
