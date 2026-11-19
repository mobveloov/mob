// Pergunta de preço no bot: detecção da pergunta e resposta com a tabela "Preços por cidade" do totem.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

process.env.DADOS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "bot-preco-"));
const CNEFE = fs.mkdtempSync(path.join(os.tmpdir(), "bot-preco-cnefe-"));
process.env.CNEFE_DIR = CNEFE;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "y".repeat(40);
process.env.OSRM_PUBLICO = "0"; process.env.NOMINATIM_PUBLICO = "0";
for (const k of ["ANTHROPIC_API_KEY", "GROQ_API_KEYS", "GROQ_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY"]) delete process.env[k];

// Cidade de teste (3599999, SP) e uma vizinha (3588888) que não está na tabela de preços.
fs.mkdirSync(path.join(CNEFE, "_casas"));
fs.mkdirSync(path.join(CNEFE, "35_SP"));
fs.writeFileSync(path.join(CNEFE, "35_SP", "3599999_CIDADE_TESTE.zip"), "");
fs.writeFileSync(path.join(CNEFE, "35_SP", "3588888_LEME_DE_TESTE.zip"), "");
fs.writeFileSync(path.join(CNEFE, "_casas", "35_SP.tsv.gz"), zlib.gzipSync(["3599999", "100", "DAS FLORES", "CENTRO", "RUA", "-21.0", "-48.0", "14750000"].join("\t")));

const P = await import("../src/bot/pergunta-preco.ts");
const D = await import("../src/servidor/dados.ts");
const E = await import("../src/enderecos/index.ts");
const A = await import("../src/bot/armazem.ts");
const T = await import("../src/totem/tarifas-cidade.ts");
const { receber } = await import("../src/bot/fluxo.ts");
const { definirCorridasDoBot } = await import("../src/bot/corridas.ts");

test("detecta a pergunta de preço em várias formas e ignora tempo, distância e pessoas", () => {
  for (const t of ["qual o valor?", "quanto custa pra Ribeirão", "qto fica", "vlr da corrida", "quanto vai dar", "tem tabela?", "o uber tá 15?", "vocês fazem corrida para Ribeirão?", "quanto cobra", "preço"]) {
    assert.equal(P.isPriceQuestion(t), true, t);
  }
  for (const t of ["quanto tempo demora", "quantos minutos", "chega em 15 minutos?", "quantas pessoas cabem", "o quanto antes", "Rua das Flores 120", "oi", "1"]) {
    assert.equal(P.isPriceQuestion(t), false, t);
  }
  assert.equal(P.isPriceQuestionOnly("qual o valor?"), true);
  assert.equal(P.isPriceQuestionOnly("Rua X 10, quanto fica?"), false, "com endereço segue o pedido");
  assert.equal(P.isPriceQuestionOnly("Pix, quanto fica?"), false, "a resposta da etapa vale primeiro");
});

const empresa = D.criarEmpresa("Central Preco", { nomeExibido: "Central Preco", assistente: { nome: "Lia", tom: "cordial" } });
E.salvarConfig(empresa.id, { municipios: ["3599999"] });
A.salvarConfig(empresa.id, { ativo: true, provedor: "simulado", instancia: "bot-preco", agendar: false, cidades: { principal: "3599999" } });
definirCorridasDoBot({
  categorias: async () => [{ id: "c1", nome: "Comum" }],
  criar: async () => ({ id: "r1", os: "1" }),
  detalhar: async () => ({ status: "procurando", grupo: "aberta" }),
  cancelar: async () => undefined,
  avaliar: async () => undefined,
});
let seq = 0;
const msg = (tel: string, texto: string) => receber(empresa.id, { id: `p${++seq}`, telefone: tel, nome: "Rui", texto }, { classificar: async () => null });

test("sem nada cadastrado a pergunta segue o fluxo normal", async () => {
  const r = await msg("5511920000001", "quanto custa a corrida?");
  assert.doesNotMatch(r.join("\n"), /TABELA DE VALORES/);
});

test("com a tabela cadastrada: sem destino mostra dentro da cidade e locais, com todos os horários e a hora de espera", async () => {
  T.salvarTarifa(empresa.id, "dentro", { destinoCidade: "Cidade Teste", destinoUf: "SP", categoria: "CENTRAL", normal: 12, noite: 18, domingo: 15, feriado: 15 });
  T.salvarTarifa(empresa.id, "local", { destinoCidade: "Cidade Teste", destinoUf: "SP", local: "Zoológico", normal: 30 });
  T.salvarTarifa(empresa.id, "cidades", { origemCidade: "Cidade Teste", origemUf: "SP", destinoCidade: "Ribeirão Preto", destinoUf: "SP", normal: 80, noite: 100, pedagio: 8 });
  T.definirEspera(empresa.id, 40);
  const tel = "5511920000002";
  const r = await msg(tel, "qual o valor da corrida?");
  assert.match(r[0], /TABELA DE VALORES/);
  assert.match(r[0], /DENTRO DE CIDADE TESTE/);
  assert.match(r[0], /CENTRAL/);
  assert.match(r[0], /Dia: \*R\$ 12,00\*/);
  assert.match(r[0], /Noite .*\*R\$ 18,00\*/);
  assert.match(r[0], /Domingo e feriado: \*R\$ 15,00\*/);
  assert.match(r[0], /LOCAIS/);
  assert.match(r[0], /Zoológico/);
  assert.doesNotMatch(r[0], /Ribeirão/, "outras cidades só quando perguntam daquela cidade");
  assert.match(r[0], /Hora de espera:\* R\$ 40,00 por hora/);
  assert.match(r[0], /valor final pode mudar/);
  assert.match(r[1], /Quer pedir a corrida/);
  assert.equal(A.conversa(empresa.id, tel)!.etapa, "menu");
});

test("pergunta de outra cidade da tabela: só o valor daquela cidade, com pedágio, e 'Fazemos sim' para quem pergunta se atendem", async () => {
  const r = await msg("5511920000003", "quanto custa pra Ribeirão?");
  assert.match(r[0], /Valor de Cidade Teste\/SP até Ribeirão Preto\/SP/);
  assert.match(r[0], /Dia: \*R\$ 80,00\*/);
  assert.match(r[0], /Noite .*\*R\$ 100,00\*/);
  assert.match(r[0], /pedágio: \*R\$ 16,00\*/);
  assert.doesNotMatch(r[0], /Fazemos sim/);
  const f = await msg("5511920000004", "vocês fazem corrida para Ribeirão Preto?");
  assert.match(f[0], /^✅ \*Fazemos sim!\*/);
  const v = await msg("5511920000005", "quanto é ir e voltar de Ribeirão Preto?");
  assert.match(v[0], /Esse é o valor da \*ida\*/);
});

test("local com valor próprio e cidade fora da tabela", async () => {
  const z = await msg("5511920000006", "quanto custa pro zoológico?");
  assert.match(z[0], /TABELA DE VALORES/);
  assert.match(z[0], /Zoológico/);
  const tel = "5511920000007";
  const l = await msg(tel, "quanto custa pra Leme de Teste?");
  assert.match(l[0], /Não tenho o valor de Cidade Teste\/SP até \*Leme de Teste\/SP\* cadastrado/);
  assert.match(l[0], /atendente/);
  assert.equal(A.conversa(empresa.id, tel)!.etapa, "suporte");
});

test("no meio do pedido responde o preço, lembra a etapa e o pedido continua", async () => {
  const tel = "5511920000008";
  await msg(tel, "oi"); await msg(tel, "1");
  const r = await msg(tel, "qual o valor?");
  assert.match(r[0], /TABELA DE VALORES/);
  assert.match(r[1], /Para continuar o pedido, me envie a \*rua e o número\* de embarque/);
  assert.equal(A.conversa(empresa.id, tel)!.etapa, "embarque");
  // com endereço junto segue como endereço
  const e = await msg(tel, "Rua das Flores, 120, quanto fica?");
  assert.doesNotMatch(e.join("\n"), /TABELA DE VALORES/);
  assert.equal(A.conversa(empresa.id, tel)!.etapa, "destino");
});
