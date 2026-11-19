// Quem se descadastrou DEPOIS de entrar na fila não recebe: a conferência é feita na hora do envio.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-crm-fila-optout-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "o".repeat(40);

const D = await import("../src/servidor/dados.ts");
const B = await import("../src/servidor/banco.ts");
const T = await import("../src/crm/templates.ts");
const E = await import("../src/crm/envio.ts");
const A = await import("../src/crm/armazem.ts");
test.after(() => { B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

test("descadastrou com a mensagem já na fila: não envia e cancela com o código de opt-out", async () => {
  const e = D.criarEmpresa("Fila Optout").id;
  const item = (n: number, tel: string) => ({ id: `i${n}`, origem: { tipo: "campanha" as const, id: "camp1" }, chave: `p:${n}`, nome: `P${n}`, telefone: tel, texto: "Oi", estado: "pendente" as const, tentativas: 0, criadoEm: Date.now(), proximaEm: Date.now(), enviadoEm: null, erro: "" });
  A.adicionarNaFila(e, [item(1, "5511900000001"), item(2, "5511900000002")]);
  T.descadastrar(e, { telefone: "5511900000001", origem: "teste" });
  const mandados: string[] = [];
  const provedor = { nome: "simulado", enviar: async (tel: string) => { mandados.push(tel); return { ok: true as const }; }, pendencias: async () => [] };
  const r = await E.processarFila(e, { dormir: async () => {}, provedor });
  assert.deepEqual(mandados, ["5511900000002"], "só quem não saiu da lista");
  assert.equal(r.enviados, 1);
  const f = A.fila(e);
  const cancelado = f.find((i) => i.id === "i1")!;
  assert.equal(cancelado.estado, "cancelado");
  assert.equal(cancelado.erro, "Descadastrado do WhatsApp");
});
