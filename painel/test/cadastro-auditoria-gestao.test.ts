// Auditoria Cadastro (rotas): filtros de cartão e cartões de resumo em Clientes, Tipo de operação em Empresas, Desafios para clientes.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-cadaud-"));
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
const M = await import("../src/gestao/cadastros-machine.ts");
const DC = await import("../src/gestao/desafio-cliente.ts");

const app = express();
app.use(express.json());
app.post("/teste/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({ ok: true }); });
app.use("/api", exigirLogin);
app.use("/api/gestao", G.rotasGestao);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => { servidor.closeAllConnections(); servidor.close(); B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

const E = D.criarEmpresa("Cad Aud").id;
const admin = D.criarUsuario({ email: "adm@cadaud.test", nome: "Adm", senha: "senha-forte-1", empresaId: E, papel: "admin" });
const cookie = ((await fetch(`${base}/teste/entrar/${admin.id}`, { method: "POST" })).headers.get("set-cookie") ?? "").split(";")[0];
async function chamar(metodo: string, url: string, corpo?: unknown) {
  const r = await fetch(base + url, { method: metodo, headers: { cookie, ...(corpo !== undefined ? { "content-type": "application/json" } : {}) }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  return { status: r.status, corpo: (await r.json().catch(() => ({}))) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
const CLI = cadastroPorId("clientes")!;
const ana = criar(E, CLI, { nome: "Ana Cartao", telefone: "19990000001", status: "Ativo", origemCadastro: "App", cpf: "52998224725" }, "t");
criar(E, CLI, { nome: "Bia Sem", telefone: "19990000002", status: "Ativo", origemCadastro: "App" }, "t");
criar(E, CLI, { nome: "Caio Pendente", telefone: "19990000003", status: "Ativo", origemCadastro: "App" }, "t");
M.registrarCartaoTokenizado(E, { telefone: "(19) 99000-0001", bandeira: "Visa", final: "1234", validade: "12/30", validado: true });
M.registrarCartaoTokenizado(E, { telefone: "19990000003", bandeira: "Visa", final: "9999", validado: false });

test("clientes: filtro por cartão ativo e não validado vem do dado real dos cartões", async () => {
  const nomes = async (q: string) => (await chamar("GET", `/api/gestao/passageiros?${q}`)).corpo.passageiros.map((p: { nome: string }) => p.nome).sort();
  assert.deepEqual(await nomes("cartaoAtivo=1"), ["Ana Cartao"]);
  assert.deepEqual(await nomes("cartaoNaoValidado=1"), ["Caio Pendente"]);
  assert.deepEqual(await nomes("cartaoAtivo=1&cartaoNaoValidado=1"), ["Ana Cartao", "Caio Pendente"]);
  assert.equal((await nomes("")).length, 3);
});

test("clientes: cartões de resumo, CPF validado e e-mail (validado e bloqueado) guardados", async () => {
  const r = (await chamar("GET", `/api/gestao/passageiros/${ana.id}`)).corpo;
  assert.equal(r.resumo.corridas, 0);
  assert.equal(r.resumo.cpfValidado, true);
  assert.equal(r.resumo.emailValidado, false);
  assert.ok(r.resumo.cadastradoEm);
  const salvo = await chamar("PUT", `/api/gestao/passageiros/${ana.id}`, { email: "ana@teste.com", emailValidado: true, emailBloqueado: true });
  assert.equal(salvo.status, 200, JSON.stringify(salvo.corpo));
  const depois = (await chamar("GET", `/api/gestao/passageiros/${ana.id}`)).corpo;
  assert.equal(depois.resumo.emailValidado, true);
  assert.equal(depois.resumo.emailBloqueado, true);
  await chamar("PUT", `/api/gestao/passageiros/${ana.id}`, { email: "outro@teste.com" });
  assert.equal((await chamar("GET", `/api/gestao/passageiros/${ana.id}`)).corpo.resumo.emailValidado, false, "trocar o e-mail zera a validação");
});

test("empresas: Tipo de operação é guardado e vai para a lista", async () => {
  const r = await chamar("POST", "/api/gestao/empresas", { nome: "Padaria Voucher", cnpj: "11222333000181", numeroContrato: "000123", tipoOperacao: "Voucher" });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  const l = (await chamar("GET", "/api/gestao/empresas")).corpo.empresas;
  assert.equal(l.find((x: { nome: string }) => x.nome === "Padaria Voucher").tipoOperacao, "Voucher");
  const sem = await chamar("POST", "/api/gestao/empresas", { nome: "Loja Padrao", cnpj: "45723174000110", numeroContrato: "000124" });
  assert.equal(sem.status, 200, JSON.stringify(sem.corpo));
  const l2 = (await chamar("GET", "/api/gestao/empresas")).corpo.empresas;
  assert.equal(l2.find((x: { nome: string }) => x.nome === "Loja Padrao").tipoOperacao, "Corporativo");
});

test("desafios de clientes: lista separada, prévia, detalhe e aprovação só depois de completar", async () => {
  const c = await chamar("POST", "/api/gestao/desafios", { publico: "Clientes", nome: "Peca 3", meta: 3, premio: 10, inicio: "2026-01-01", fim: "2026-12-31", aprovacao: "Manual" });
  assert.equal(c.status, 200, JSON.stringify(c.corpo));
  assert.equal(c.corpo.desafio.tipo, "Desafio de clientes");
  assert.equal((await chamar("GET", "/api/gestao/desafios?publico=Clientes")).corpo.desafios.length, 1);
  assert.equal((await chamar("GET", "/api/gestao/desafios")).corpo.desafios.length, 0, "não aparece nos desafios dos motoristas");
  assert.equal((await chamar("GET", "/api/gestao/desafios-previa?publico=Clientes&premio=10")).corpo.motoristas, 3);
  const det = (await chamar("GET", `/api/gestao/desafios/${c.corpo.desafio.id}`)).corpo;
  assert.equal(det.resumo.desafiados, 3);
  assert.equal((await chamar("POST", `/api/gestao/desafios/${c.corpo.desafio.id}/aprovar/${ana.telefone}`, {})).status, 400, "ainda não completou");
});

test("desafios de clientes: progresso, filtro por corridas e pagamento só uma vez", () => {
  const cli = [{ id: "1", telefone: "19990000001", nome: "Ana", status: "Ativo" }, { id: "2", telefone: "19990000002", nome: "Bia", status: "Ativo" }, { id: "3", telefone: "19990000003", nome: "Cai", status: "Suspenso" }] as any[];
  const corr = (tel: string, dia: string) => ({ status: "finalizada", canal: "app", passageiro: { telefone: tel }, finalizadaEm: `${dia}T10:00:00.000Z`, solicitadaEm: `${dia}T09:00:00.000Z` }) as any;
  const corridas = [corr("19990000001", "2026-05-01"), corr("19990000001", "2026-05-02"), corr("19990000002", "2026-05-02"), corr("19990000001", "2025-01-01")];
  const d = { id: "d", meta: 2, premio: 10, inicio: "2026-05-01", fim: "2026-05-31", aprovacao: "Manual" } as any;
  const p = DC.progressoClientes(cli, d, corridas, () => false);
  assert.equal(p.length, 2, "suspenso não é desafiado");
  assert.equal(p[0].situacao, "Concluído");
  assert.equal(p[0].aguardandoAprovacao, true);
  assert.equal(p[0].feito, 2);
  assert.equal(p[1].situacao, "Participando");
  assert.equal(DC.progressoClientes(cli, d, corridas, (t) => t === "19990000001")[0].pago, true);
  assert.equal(DC.clientesDesafiados(cli, { corridasMin: 3, corridasMax: 10 }, corridas).length, 1, "filtro por corridas finalizadas (todo o período)");
});
