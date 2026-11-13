// Descontos (matriz por forma de pagamento e máximo por empresa) e Integrações (dados bancários, plano, quem recebe, taxa de cartão).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-descint-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "e".repeat(40);
delete process.env.BANCO_ARQUIVO;

const express = (await import("express")).default;
const D = await import("../src/servidor/dados.ts");
const { criarCookie, exigirLogin } = await import("../src/servidor/sessao.ts");
const B = await import("../src/servidor/banco.ts");
const M = await import("../src/config/descontos-matriz.ts");
const F = await import("../src/config/integracao-financeira.ts");
const { rotasConfig } = await import("../src/config/rotas.ts");

const app = express();
app.use(express.json());
app.post("/teste/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({ ok: true }); });
app.use("/api", exigirLogin);
app.use("/api/config", rotasConfig);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => { servidor.closeAllConnections(); servidor.close(); B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

const E = D.criarEmpresa("Desc Um").id, E2 = D.criarEmpresa("Desc Dois").id;
const adm = D.criarUsuario({ email: "adm@desc.test", nome: "Adm", senha: "senha-forte-1", empresaId: E, papel: "admin" });
const op = D.criarUsuario({ email: "op@desc.test", nome: "Op", senha: "senha-forte-1", empresaId: E, papel: "operador" });
const adm2 = D.criarUsuario({ email: "adm2@desc.test", nome: "Adm2", senha: "senha-forte-1", empresaId: E2, papel: "admin" });
async function entrar(id: string) {
  const r = await fetch(`${base}/teste/entrar/${id}`, { method: "POST" });
  return (r.headers.get("set-cookie") ?? "").split(";")[0];
}
const cAdm = await entrar(adm.id), cOp = await entrar(op.id), cAdm2 = await entrar(adm2.id);
async function api(cookie: string, metodo: string, url: string, corpo?: unknown) {
  const r = await fetch(`${base}/api/config${url}`, { method: metodo, headers: { cookie, "content-type": "application/json" }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  return { status: r.status, corpo: (await r.json().catch(() => ({}))) as Record<string, any> };
}
const CNPJ = "11222333000181";

test("matriz de descontos: começa vazia, grava por empresa e só o admin altera", async () => {
  const v = await api(cOp, "GET", "/descontos-matriz");
  assert.equal(v.status, 200);
  assert.equal(v.corpo.formas.length, 5);
  assert.equal(v.corpo.matriz.pix.site, 0);
  assert.equal((await api(cOp, "PUT", "/descontos-matriz", { matriz: { pix: { site: 5 } } })).status, 403);
  const r = await api(cAdm, "PUT", "/descontos-matriz", { matriz: { pix: { site: 5, app1: "7,5", app4: 3, maximo: 10 }, dinheiro: { app2: 2 } } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.corpo.matriz.pix, { site: 5, app1: 7.5, app2: 0, app3: 0, app4: 3, maximo: 10 });
  assert.equal(r.corpo.matriz.dinheiro.app2, 2);
  assert.equal(M.percentualDaMatriz(E, "pix", "app1"), 7.5);
  assert.equal(M.percentualDaMatriz(E2, "pix", "app1"), 0, "outra empresa não vê");
  assert.equal((await api(cAdm2, "GET", "/descontos-matriz")).corpo.matriz.pix.site, 0);
});

test("matriz de descontos: recusa percentual fora de 0 a 100 e acima do máximo da empresa", async () => {
  for (const matriz of [{ pix: { site: 101 } }, { pix: { site: -1 } }, { credito: { app3: 15, maximo: 10 } }]) {
    const r = await api(cAdm, "PUT", "/descontos-matriz", { matriz });
    assert.equal(r.status, 400, JSON.stringify(matriz));
    assert.ok(r.corpo.erro);
  }
  assert.equal(M.matrizDescontos(E).pix.site, 5, "a recusa não apaga o que estava gravado");
});

test("descontos por campanha continuam funcionando junto da matriz", async () => {
  const r = await api(cAdm, "POST", "/descontos", { nome: "Boas-vindas", tipo: "percentual", valor: 10 });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.descontos.length, 1);
  assert.equal((await api(cAdm, "GET", "/descontos-matriz")).corpo.matriz.pix.maximo, 10);
});

test("integração financeira: plano, quem recebe e taxa; sincroniza o cartão no app", async () => {
  const v = await api(cOp, "GET", "/integracao-financeira");
  assert.equal(v.status, 200);
  assert.equal(v.corpo.plano, "");
  assert.equal(v.corpo.planos.length, 2);
  assert.equal((await api(cOp, "PUT", "/integracao-financeira", { plano: "d1" })).status, 403);
  const r = await api(cAdm, "PUT", "/integracao-financeira", { plano: "d30", quemRecebe: "motorista", taxaDe: "central", pixRecargas: true });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.taxa.percentual, 4.4);
  assert.equal(r.corpo.taxa.pagaPor, "central");
  const p = (await api(cAdm, "GET", "/pagamentos")).corpo;
  assert.equal(p.cartaoApp.modelo, "split");
  assert.equal(p.cartaoApp.quemPaga, "plataforma");
  assert.equal(p.recarga.motorista, true);
  assert.equal((await api(cAdm2, "GET", "/integracao-financeira")).corpo.plano, "", "por empresa");
});

test("dados bancários: só o admin vê, valida, mascara e não vaza em texto simples", async () => {
  const antes = await api(cOp, "GET", "/integracao-financeira");
  assert.equal(antes.corpo.banco, undefined);
  assert.equal((await api(cOp, "PUT", "/integracao-financeira", { banco: { banco: "237" } })).status, 403);
  const ruim = await api(cAdm, "PUT", "/integracao-financeira", { banco: { cnpj: "11222333000199" } });
  assert.equal(ruim.status, 400);
  const bom = await api(cAdm, "PUT", "/integracao-financeira", { banco: { banco: "237", agencia: "1234", agenciaDv: "5", conta: "998877", contaDv: "0", correntista: "Desc Um Ltda", cnpj: CNPJ } });
  assert.equal(bom.status, 200);
  assert.equal(bom.corpo.bancoPreenchido, true);
  assert.equal(bom.corpo.banco.banco, "237");
  assert.ok(!JSON.stringify(bom.corpo).includes("998877"), "conta mascarada");
  assert.ok(!JSON.stringify(bom.corpo).includes(CNPJ), "CNPJ mascarado");
  assert.ok(bom.corpo.banco.conta.endsWith("77"));
  const op2 = await api(cOp, "GET", "/integracao-financeira");
  assert.equal(op2.corpo.bancoPreenchido, true);
  assert.ok(!JSON.stringify(op2.corpo).includes("998877") && op2.corpo.banco === undefined);
  // reenviar a máscara mantém o valor guardado
  await api(cAdm, "PUT", "/integracao-financeira", { banco: { ...bom.corpo.banco, correntista: "Novo Nome" } });
  assert.equal(D.segredos(E).integracoes["bancario"].conta, "998877");
  assert.equal(D.segredos(E).integracoes["bancario"].correntista, "Novo Nome");
  // a configuração comum (config/) nunca recebe os dados bancários
  const cfg = path.join(DADOS, "empresas", E, "config", "integracao-financeira.json");
  assert.ok(!fs.readFileSync(cfg, "utf8").includes("998877"));
  assert.equal((await api(cAdm2, "GET", "/integracao-financeira")).corpo.bancoPreenchido, false);
});

test("atualizar cadastro: exige plano e dados bancários; muda a situação e volta a pendente ao trocar o plano", async () => {
  assert.equal((await api(cAdm2, "POST", "/integracao-financeira/atualizar-cadastro")).status, 400);
  assert.equal((await api(cOp, "POST", "/integracao-financeira/atualizar-cadastro")).status, 403);
  const r = await api(cAdm, "POST", "/integracao-financeira/atualizar-cadastro");
  assert.equal(r.status, 200);
  assert.equal(r.corpo.cadastro.situacao, "em_analise");
  assert.ok(r.corpo.cadastro.atualizadoEm);
  const t = await api(cAdm, "PUT", "/integracao-financeira", { plano: "d1" });
  assert.equal(t.corpo.cadastro.situacao, "pendente");
});

test("CNPJ: valida os dígitos verificadores", () => {
  assert.equal(F.cnpjValido(CNPJ), true);
  assert.equal(F.cnpjValido("11.222.333/0001-81"), true);
  assert.equal(F.cnpjValido("11222333000182"), false);
  assert.equal(F.cnpjValido("00000000000000"), false);
});
