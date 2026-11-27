// Solicitar nova corrida: várias formas de pagamento marcadas e exigências (opcionais) reais. Sem rede e sem chaves.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

process.env.DADOS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ciencia-teste-"));
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "t".repeat(40);

const express = (await import("express")).default;
const D = await import("../src/servidor/dados.ts");
const { criarCookie, exigirLogin } = await import("../src/servidor/sessao.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar } = await import("../src/cadastros/armazem.ts");
const C = await import("../src/corridas/index.ts");
const { marcarPagamento } = await import("../src/comum/pagamento-marcado.ts");
const { rotasOperacao } = await import("../src/operacao/rotas.ts");

const app = express();
app.use(express.json());
app.post("/teste/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({ ok: true }); });
app.use("/api", exigirLogin);
app.use("/api/operacao", rotasOperacao);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => servidor.close());

const A = D.criarEmpresa("Rota Norte"), B = D.criarEmpresa("Leva Sul");
const oper = D.criarUsuario({ email: "oper@a.test", nome: "Otávio", senha: "senha-forte-2", empresaId: A.id, papel: "operador" });
const operB = D.criarUsuario({ email: "oper@b.test", nome: "Bia", senha: "senha-forte-3", empresaId: B.id, papel: "operador" });
criar(A.id, cadastroPorId("categorias")!, { nome: "Econômico", bandeirada: 5, valorKm: 2, valorMinimo: 9.9, ativa: true }, "teste");

async function pedir(caminho: string, cookie: string, corpo?: unknown) {
  const r = await fetch(`${base}/api/operacao${caminho}`, { method: corpo ? "POST" : "GET", headers: { "Content-Type": "application/json", cookie }, body: corpo ? JSON.stringify(corpo) : undefined });
  return { status: r.status, corpo: (await r.json().catch(() => ({}))) as Record<string, any> };
}
const entrar = async (id: string) => ((await fetch(`${base}/teste/entrar/${id}`, { method: "POST" })).headers.get("set-cookie") ?? "").split(";")[0];


test("marcarPagamento: voucher vale sozinho e as outras formas somam", () => {
  assert.deepEqual(marcarPagamento([], "Pix", true), ["Pix"]);
  assert.deepEqual(marcarPagamento(["Pix"], "Dinheiro", true), ["Pix", "Dinheiro"]);
  assert.deepEqual(marcarPagamento(["Pix", "Dinheiro"], "Voucher", true), ["Voucher"]);
  assert.deepEqual(marcarPagamento(["Voucher"], "Pix", true), ["Pix"]);
  assert.deepEqual(marcarPagamento(["Pix", "Dinheiro"], "Pix", false), ["Dinheiro"]);
});

test("solicitação com várias formas de pagamento e exigências do cadastro", async () => {
  const cookie = await entrar(oper.id);
  const lista = (await pedir("/opcionais", cookie)).corpo.opcionais as Array<{ id: string; nome: string }>;
  assert.ok(lista.length > 0, "os opcionais vêm da configuração dos apps");
  const pedido = { passageiro: { nome: "Rita", telefone: "11955554444" }, embarque: { texto: "Rua A, 1" }, categoria: "Econômico", pagamento: "Pix", pagamentosAceitos: ["Pix", "Dinheiro", "Cartão no app", "Pix"], opcionais: [lista[0].id, "inventado"] };
  const r = await pedir("/solicitar", cookie, pedido);
  assert.equal(r.status, 200);
  const d = (await pedir(`/corridas/${r.corpo.corrida.id}`, cookie)).corpo.corrida;
  assert.equal(d.pagamento, "Pix");
  assert.deepEqual(d.pagamentosAceitos, ["Pix", "Dinheiro"], "só formas conhecidas, sem repetir");
  assert.deepEqual(d.opcionais, [lista[0].id], "opcional que não existe é descartado");
  const so = await pedir("/solicitar", cookie, { ...pedido, passageiro: { nome: "Davi", telefone: "11933332222" }, pagamentosAceitos: ["Pix"], opcionais: [] });
  const d2 = (await pedir(`/corridas/${so.corpo.corrida.id}`, cookie)).corpo.corrida;
  assert.equal(d2.pagamentosAceitos, undefined);
});
