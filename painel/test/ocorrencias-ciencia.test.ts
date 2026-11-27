// Retorno e Ocorrências: registrar ciência (a ocorrência sai do aviso fixo do painel). Sem rede e sem chaves.
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

test("registrar ciência tira a ocorrência da contagem do aviso e pode ser desfeita", async () => {
  const cookie = await entrar(oper.id), cookieB = await entrar(operB.id);
  const c = await C.criarCorridaPropria(A.id, { passageiro: { nome: "Rita", telefone: "11955554444" }, embarque: { texto: "Rua A, 1" }, categoria: "Econômico", pagamento: "Pix" } as never, "teste");
  C.cancelarCorrida(A.id, c.id, "Passageiro", "Mudei de ideia", "teste");
  const antes = (await pedir("/ocorrencias?horas=1", cookie)).corpo;
  const meu = (l: any) => l.itens.find((i: any) => i.os === c.os);
  assert.ok(meu(antes), "a corrida cancelada é uma ocorrência");
  assert.equal(antes.semCiencia, antes.total);
  assert.equal(meu(antes).ciencia, null);

  const id = meu(antes).id;
  const r = await pedir(`/ocorrencias/${encodeURIComponent(id)}/ciencia`, cookie, {});
  assert.equal(r.status, 200);
  assert.equal(r.corpo.ciencia.por, "oper@a.test");
  const depois = (await pedir("/ocorrencias?horas=1", cookie)).corpo;
  assert.equal(depois.total, antes.total, "a ocorrência continua na lista");
  assert.equal(depois.semCiencia, antes.semCiencia - 1, "mas não conta mais no aviso");
  assert.equal(meu(depois).ciencia.por, "oper@a.test");

  // Outra empresa não vê nem altera a ciência.
  assert.equal((await pedir(`/ocorrencias/${encodeURIComponent(id)}/ciencia`, cookieB, {})).status, 404);
  assert.ok(!meu((await pedir("/ocorrencias?horas=1", cookieB)).corpo), "a outra empresa não vê a corrida");
  assert.equal((await pedir("/ocorrencias/nao-existe/ciencia", cookie, {})).status, 404);

  const desfeita = await pedir(`/ocorrencias/${encodeURIComponent(id)}/ciencia`, cookie, { desfazer: true });
  assert.equal(desfeita.status, 200);
  assert.equal(desfeita.corpo.ciencia, null);
  assert.equal((await pedir("/ocorrencias?horas=1", cookie)).corpo.semCiencia, antes.semCiencia);
});
