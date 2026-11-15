// Cadastro de sugestões de endereço (apelidos) e uso no fluxo do bot. Sem rede.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DADOS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "bot-sug-"));
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "y".repeat(40);
for (const k of ["ANTHROPIC_API_KEY", "GROQ_API_KEYS", "GROQ_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY"]) delete process.env[k];

const D = await import("../src/servidor/dados.ts");
const A = await import("../src/bot/armazem.ts");
const S = await import("../src/bot/sugestoes-cadastro.ts");
const { receber } = await import("../src/bot/fluxo.ts");

const empresa = D.criarEmpresa("Central Sugestoes", { nomeExibido: "Central Sugestoes", assistente: { nome: "Lia", tom: "cordial" } });
const outra = D.criarEmpresa("Outra Sugestoes");
A.salvarConfig(empresa.id, { ativo: true, provedor: "simulado", instancia: "bot-sug" });

test("cadastro: ponto colado, endereço escrito, repetido recusado, busca e exclusão por empresa", () => {
  const a = S.adicionarSugestao(empresa.id, { nickname: "", address: "Espetinho do Gui : -21.026138, -48.227547" });
  assert.deepEqual([a.nickname, a.lat, a.lng, a.address_text], ["Espetinho do Gui", -21.026138, -48.227547, ""]);
  const b = S.adicionarSugestao(empresa.id, { nickname: "Padaria da Ana", address: "Rua Sergipe, 606" });
  assert.equal(b.address_text, "Rua Sergipe, 606");
  assert.throws(() => S.adicionarSugestao(empresa.id, { nickname: "espetinho do GUI", address: "-21.0, -48.2" }), /Já existe/);
  assert.throws(() => S.adicionarSugestao(empresa.id, { nickname: "", address: "" }), /Preencha/);
  assert.equal(S.contarSugestoes(empresa.id), 2);
  assert.equal(S.contarSugestoes(outra.id), 0);
  assert.deepEqual(S.buscarSugestoes(empresa.id, "gui").map((s) => s.nickname), ["Espetinho do Gui"]);
  assert.deepEqual(S.buscarSugestoes(empresa.id, "g"), [], "busca curta não lista tudo");
  assert.equal(S.localDaSugestao(outra.id, "espetinho do gui"), null, "outra empresa não vê");
  S.adicionarSugestao(outra.id, { nickname: "Espetinho do Gui", address: "Rua X, 1" }); // mesmo apelido em outra empresa pode
  S.excluirSugestao(empresa.id, b.id);
  assert.equal(S.contarSugestoes(empresa.id), 1);
  assert.throws(() => S.excluirSugestao(empresa.id, b.id), /não encontrada/);
});

test("no fluxo: o apelido vira o ponto cadastrado, no embarque e no destino", async () => {
  const tel = "5511960000001";
  const msg = (t: string) => receber(empresa.id, { id: `s${Math.random()}`, telefone: tel, nome: "Rui", texto: t }, { classificar: async () => null });
  await msg("oi"); await msg("1");
  await msg("espetinho do gui");
  const e = A.conversa(empresa.id, tel)!.rascunho.embarque!;
  assert.deepEqual([e.texto, e.lat, e.lng], ["Espetinho do Gui", -21.026138, -48.227547]);
  S.adicionarSugestao(empresa.id, { nickname: "Santa Casa", address: "-21.03, -48.22" });
  const r = await msg("santa casa");
  assert.match(r[0], /Espetinho do Gui/);
  assert.match(r[0], /Santa Casa/);
  assert.equal(A.conversa(empresa.id, tel)!.rascunho.destino?.lat, -21.03);
});
