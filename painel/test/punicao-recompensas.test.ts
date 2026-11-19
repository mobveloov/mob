// Gerenciar Punição (tempo de 15 min a 48 h, motivo opcional, histórico por motorista) e Recompensas por indicação (filtros, CSV seguro,
// paginação), sempre por empresa.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-punrec-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "p".repeat(40);
delete process.env.BANCO_ARQUIVO;

const express = (await import("express")).default;
const D = await import("../src/servidor/dados.ts");
const { criarCookie, exigirLogin } = await import("../src/servidor/sessao.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar } = await import("../src/cadastros/armazem.ts");
const B = await import("../src/servidor/banco.ts");
const G = await import("../src/gestao/rotas.ts");

const app = express();
app.use(express.json());
app.post("/teste/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({ ok: true }); });
app.use("/api", exigirLogin);
app.use("/api/gestao", G.rotasGestao);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => { servidor.closeAllConnections(); servidor.close(); B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

const E = D.criarEmpresa("Pun Um").id, E2 = D.criarEmpresa("Pun Dois").id;
const admin = D.criarUsuario({ email: "adm@pun.test", nome: "Adm", senha: "senha-forte-1", empresaId: E, papel: "admin" });
const admin2 = D.criarUsuario({ email: "adm2@pun.test", nome: "Adm2", senha: "senha-forte-3", empresaId: E2, papel: "admin" });
const mot = criar(E, cadastroPorId("motoristas")!, { nome: "Motorista Teste", telefone: "11999990001", status: "Ativo", cidade: "Leme", placa: "ABC1D23" }, "t");
const tel = (n: number) => `1199999${String(n).padStart(4, "0")}`;
async function cookie(id: string) { return ((await fetch(`${base}/teste/entrar/${id}`, { method: "POST" })).headers.get("set-cookie") ?? "").split(";")[0]; }
const cA = await cookie(admin.id), cA2 = await cookie(admin2.id);
async function chamar(metodo: string, url: string, quem: string, corpo?: unknown) {
  const r = await fetch(base + url, { method: metodo, headers: { cookie: quem, ...(corpo !== undefined ? { "content-type": "application/json" } : {}) }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  const tipo = r.headers.get("content-type") ?? "";
  return { status: r.status, corpo: (tipo.includes("json") ? await r.json().catch(() => ({})) : await r.text()) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

test("punição: 15 minutos, motivo opcional e histórico do motorista", async () => {
  const busca = await chamar("GET", "/api/gestao/motoristas-busca?q=Motorista", cA);
  assert.equal(busca.corpo.motoristas[0].telefone, "11999990001");
  assert.equal(busca.corpo.motoristas[0].cidade, "Leme");
  const r = await chamar("POST", "/api/gestao/punicoes", cA, { motoristaId: mot.id, tempo: 15, unidade: "minutos", motivo: "" });
  assert.equal(r.status, 200);
  const minutos = (Date.parse(r.corpo.punicao.fim) - Date.parse(r.corpo.punicao.inicio)) / 60_000;
  assert.equal(Math.round(minutos), 15);
  assert.equal(r.corpo.punicao.motivo, "Motivo não informado");
  await chamar("POST", "/api/gestao/punicoes", cA, { motoristaId: mot.id, tempo: 48, unidade: "horas", motivo: "Atraso" });
  const h = await chamar("GET", `/api/gestao/punicoes-historico/${mot.id}`, cA);
  assert.equal(h.corpo.punicoes.length, 2);
  assert.equal(h.corpo.punicoes.every((p: any) => p.emVigor), true);
  assert.equal((await chamar("GET", `/api/gestao/punicoes-historico/${mot.id}`, cA2)).corpo.punicoes.length, 0, "outra empresa não vê");
  assert.equal((await chamar("POST", "/api/gestao/punicoes", cA, { motoristaId: mot.id, tempo: 0, unidade: "minutos" })).status, 400);
});

test("recompensas por indicação: lista dos indicados, status, busca, CSV e isolamento", async () => {
  const db = B.banco();
  db.prepare("INSERT INTO app_pessoas (empresa, papel, chave, codigo, indicado_por, dados) VALUES (?, 'motorista', ?, 'COD1', '', '{}')").run(E, mot.id);
  const novo = criar(E, cadastroPorId("motoristas")!, { nome: "=Indicado Teste", telefone: tel(2), status: "Ativo" }, "t");
  db.prepare("INSERT INTO app_pessoas (empresa, papel, chave, codigo, indicado_por, dados) VALUES (?, 'motorista', ?, 'COD2', 'COD1', '{}')").run(E, novo.id);
  const r = await chamar("GET", "/api/gestao/recompensas-indicacao?tipo=motorista&periodo=todo", cA);
  assert.equal(r.status, 200);
  assert.equal(r.corpo.itens.length, 1);
  assert.equal(r.corpo.itens[0].quemIndicou, "Motorista Teste");
  assert.equal(r.corpo.itens[0].tipoUsuario, "Motorista");
  assert.equal(r.corpo.itens[0].concluido, false);
  assert.equal(r.corpo.itens[0].meta >= 1, true);
  assert.equal((await chamar("GET", "/api/gestao/recompensas-indicacao?tipo=motorista&status=concluido", cA)).corpo.itens.length, 0);
  assert.equal((await chamar("GET", "/api/gestao/recompensas-indicacao?tipo=motorista&status=pendente&busca=Indicado", cA)).corpo.itens.length, 1);
  assert.equal((await chamar("GET", "/api/gestao/recompensas-indicacao?tipo=passageiro", cA)).corpo.itens.length, 0, "a aba Clientes não mistura motoristas");
  const csv = await chamar("GET", "/api/gestao/recompensas-indicacao?tipo=motorista&csv=1", cA);
  assert.equal(typeof csv.corpo, "string");
  assert.match(csv.corpo, /Quem indicou/);
  assert.match(csv.corpo, /'=Indicado Teste/, "apóstrofo contra injeção de fórmula");
  assert.equal((await chamar("GET", "/api/gestao/recompensas-indicacao?tipo=motorista", cA2)).corpo.itens.length, 0, "outra empresa não vê");
});
