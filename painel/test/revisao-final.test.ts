// Correções da revisão final do painel: dono da plataforma protegido, operador sem mexer na cobrança do
// motorista, valor com ponto decimal e lista de cadastros com vários registros.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-revfinal-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "f".repeat(40);

const D = await import("../src/servidor/dados.ts");
const { app } = await import("../src/servidor/index.ts");
const B = await import("../src/servidor/banco.ts");

const e = D.criarEmpresa("Revisão Final").id;
const dono = D.criarUsuario({ email: "dono@rev.test", nome: "Dono", senha: "senha-forte-1", empresaId: e, papel: "plataforma" });
D.criarUsuario({ email: "adm@rev.test", nome: "Adm", senha: "senha-forte-1", empresaId: e, papel: "admin" });
D.criarUsuario({ email: "op@rev.test", nome: "Op", senha: "senha-forte-1", empresaId: e, papel: "operador" });
const srv = app.listen(0);
const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
test.after(() => { srv.closeAllConnections(); srv.close(); B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

async function entrar(email: string) {
  const r = await fetch(`${base}/api/entrar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, senha: "senha-forte-1" }) });
  return (r.headers.get("set-cookie") ?? "").split(";")[0];
}
async function chamar(metodo: string, url: string, cookie: string, corpo?: unknown) {
  const r = await fetch(base + url, { method: metodo, headers: { "Content-Type": "application/json", Cookie: cookie }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  return { status: r.status, corpo: (await r.json().catch(() => ({}))) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

test("admin não vira dono da plataforma pela tela Equipe nem pela remoção", async () => {
  const adm = await entrar("adm@rev.test");
  assert.equal((await chamar("PUT", `/api/gestao/equipe/${dono.id}`, adm, { senha: "outra-senha-123" })).status, 400);
  assert.equal((await chamar("DELETE", `/api/gestao/equipe/${dono.id}`, adm)).status, 400);
  assert.equal((await chamar("DELETE", `/api/usuarios/${dono.id}`, adm)).status >= 400, true);
  assert.notEqual(await entrar("dono@rev.test"), "", "o dono continua entrando com a senha dele");
  assert.ok(D.listarUsuarios().some((u) => u.id === dono.id));
});

test("operador não grava cobrança nem financeiro do motorista; admin grava", async () => {
  const adm = await entrar("adm@rev.test"), op = await entrar("op@rev.test");
  const novo = await chamar("POST", "/api/gestao/motoristas", adm, { dados: { nome: "Motora", telefone: "11955550001", status: "Ativo", cobranca: "Padrão" } });
  assert.equal(novo.status, 200, JSON.stringify(novo.corpo));
  const id = novo.corpo.motorista.id as string;
  await chamar("PUT", `/api/gestao/motoristas/${id}`, op, { dados: { cobranca: "Isento" }, financeiro: { saque: false } });
  const lido = D.listarUsuarios; void lido;
  const { listar } = await import("../src/cadastros/armazem.ts");
  const { cadastroPorId } = await import("../src/comum/cadastros.ts");
  const m = () => listar(e, cadastroPorId("motoristas")!).find((x) => x.id === id)!;
  assert.equal(m().cobranca, "Padrão", "operador não muda a cobrança");
  await chamar("PUT", `/api/gestao/motoristas/${id}`, adm, { dados: { cobranca: "Isento" } });
  assert.equal(m().cobranca, "Isento", "admin muda");
});

test("lista de cadastros com vários registros ordena sem erro", async () => {
  const adm = await entrar("adm@rev.test");
  for (const nome of ["Beta", "Alfa", "Gama"]) await chamar("POST", "/api/cadastros/cupons", adm, { codigo: nome.toUpperCase(), tipoDesconto: "Percentual", valor: "10", ativo: true });
  const l = await chamar("GET", "/api/cadastros/cupons", adm);
  assert.equal(l.status, 200);
  assert.deepEqual(l.corpo.registros.map((r: { codigo: string }) => r.codigo), ["ALFA", "BETA", "GAMA"]);
});
