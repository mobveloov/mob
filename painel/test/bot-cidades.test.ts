// Cidades ativas do bot: cada conexão completa o endereço com a cidade dela. Sem rede.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DADOS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "bot-cidades-"));
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "y".repeat(40);
for (const k of ["ANTHROPIC_API_KEY", "GROQ_API_KEYS", "GROQ_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY"]) delete process.env[k];

const D = await import("../src/servidor/dados.ts");
const A = await import("../src/bot/armazem.ts");
const E = await import("../src/enderecos/index.ts");
const { comCidade, citaCidade } = await import("../src/bot/cidades.ts");
const { receber } = await import("../src/bot/fluxo.ts");

test("comCidade: completa só quando o passageiro não citou cidade atendida", () => {
  const rp = { codigo: "3543402", nome: "Ribeirão Preto", uf: "SP" };
  const outra = [{ nome: "Sertãozinho" }];
  assert.equal(comCidade("Rua das Flores, 120", rp, outra), "Rua das Flores, 120, Ribeirão Preto - SP");
  assert.equal(comCidade("Rua das Flores, 120.", rp, outra), "Rua das Flores, 120, Ribeirão Preto - SP");
  assert.equal(comCidade("Rua das Flores 120 ribeirao preto", rp, outra), "Rua das Flores 120 ribeirao preto");
  assert.equal(comCidade("Av Brasil 5, Sertãozinho", rp, outra), "Av Brasil 5, Sertãozinho");
  assert.equal(comCidade("Rua X, 1", null, outra), "Rua X, 1");
  assert.equal(citaCidade("rua tal em sertaozinho", outra), true);
});

test("a cidade vale por conexão e some ao remover a conexão", async () => {
  const empresa = D.criarEmpresa("Central Cidades", { nomeExibido: "Central Cidades", assistente: { nome: "Lia", tom: "cordial" } });
  A.salvarConfig(empresa.id, { ativo: true, provedor: "simulado", instancia: "bot-cidades" });
  E.salvarConfig(empresa.id, { municipios: ["3543402", "3552205"] });
  const outra = A.salvarConexao(empresa.id, { nome: "Segundo", provedor: "simulado" });
  A.definirCidade(empresa.id, "principal", "3543402");
  A.definirCidade(empresa.id, outra.id, "3552205");
  assert.equal(A.cidadeDaConexao(empresa.id), "3543402");
  assert.equal(A.cidadeDaConexao(empresa.id, outra.id), "3552205");

  const tel = "5511970000001";
  const msg = (t: string, conexao?: string) => receber(empresa.id, { id: `c${Math.random()}`, telefone: tel, nome: "Rui", texto: t, conexao }, { classificar: async () => null });
  await msg("oi"); await msg("1");
  await msg("Rua das Flores, 120");
  assert.match(A.conversa(empresa.id, tel)!.rascunho.embarque!.texto, /^Rua das Flores, 120, .+ - SP$/);
  assert.match(A.conversa(empresa.id, tel)!.rascunho.embarque!.texto, /3543402/);

  const tel2 = "5511970000002";
  const m2 = (t: string) => receber(empresa.id, { id: `d${Math.random()}`, telefone: tel2, nome: "Ana", texto: t, conexao: outra.id }, { classificar: async () => null });
  await m2("oi"); await m2("1");
  await m2("Rua das Flores, 120");
  assert.match(A.conversa(empresa.id, tel2)!.rascunho.embarque!.texto, /3552205/);

  A.removerConexao(empresa.id, outra.id);
  assert.equal(A.cidadeDaConexao(empresa.id, outra.id), null);
  assert.equal(A.cidadeDaConexao(empresa.id), "3543402", "a principal continua");
});
