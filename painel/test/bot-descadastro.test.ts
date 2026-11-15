// Descadastro por resposta no WhatsApp ligado ao opt-out do CRM. Sem rede.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DADOS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "bot-descad-"));
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "y".repeat(40);
for (const k of ["ANTHROPIC_API_KEY", "GROQ_API_KEYS", "GROQ_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY"]) delete process.env[k];

const D = await import("../src/servidor/dados.ts");
const A = await import("../src/bot/armazem.ts");
const CRM = await import("../src/crm/armazem.ts");
const { receber } = await import("../src/bot/fluxo.ts");
const { WA_OPTOUT_CONFIRM } = await import("../src/crm/optout.ts");

const empresa = D.criarEmpresa("Central Descadastro", { nomeExibido: "Central Descadastro", assistente: { nome: "Lia", tom: "cordial" } });
A.salvarConfig(empresa.id, { ativo: true, provedor: "simulado", instancia: "bot-descad" });

let seq = 0;
const msg = (tel: string, texto: string) => receber(empresa.id, { id: `d${++seq}`, telefone: tel, nome: "Rui", texto }, { classificar: async () => null });
const chave = (tel: string) => `p:${tel.slice(-11)}`;

test("'NÃO QUERO MAIS' descadastra e confirma, sem campanha recente", async () => {
  const tel = "5511950000001";
  const r = await msg(tel, "NÃO QUERO MAIS");
  assert.deepEqual(r, [WA_OPTOUT_CONFIRM]);
  assert.ok(CRM.optOuts(empresa.id)[chave(tel)], "opt-out gravado no CRM");
});

test("'PARAR' só descadastra com campanha recente do CRM; sem ela segue o menu", async () => {
  const tel = "5511950000002";
  const r = await msg(tel, "parar");
  assert.notDeepEqual(r, [WA_OPTOUT_CONFIRM]);
  assert.equal(CRM.optOuts(empresa.id)[chave(tel)], undefined);
  CRM.adicionarNaFila(empresa.id, [{ id: "f1", origem: { tipo: "campanha", id: "c1" }, chave: chave(tel), nome: "Rui", telefone: tel, texto: "oi", estado: "enviado", tentativas: 1, criadoEm: Date.now(), proximaEm: 0, enviadoEm: Date.now() - 3_600_000, erro: "" }]);
  const tel2 = tel;
  const c = A.conversa(empresa.id, tel2)!; c.etapa = "inicio"; A.salvarConversa(empresa.id, c);
  assert.deepEqual(await msg(tel2, "PARAR"), [WA_OPTOUT_CONFIRM]);
  assert.ok(CRM.optOuts(empresa.id)[chave(tel)]);
});

test("'não quero mais' no meio de um pedido é sobre a corrida: não descadastra", async () => {
  const tel = "5511950000003";
  await msg(tel, "oi"); await msg(tel, "1"); // pedido em andamento (embarque)
  const r = await msg(tel, "não quero mais");
  assert.notDeepEqual(r, [WA_OPTOUT_CONFIRM]);
  assert.equal(CRM.optOuts(empresa.id)[chave(tel)], undefined);
});
