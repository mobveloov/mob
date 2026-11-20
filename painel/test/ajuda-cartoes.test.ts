// Ajuda › Termos de uso, Central de suporte e Ouvidoria; Cadastro › Clientes › Consulta de cartões.
// Telas sem página de referência da Machine: valem como suposição para o dono validar.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-ajuda-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "h".repeat(40);
delete process.env.BANCO_ARQUIVO;
delete process.env.SUPORTE_WHATSAPP; delete process.env.SUPORTE_EMAIL; delete process.env.SUPORTE_TELEFONE; delete process.env.SUPORTE_SITE; delete process.env.SUPORTE_HORARIO;

const express = (await import("express")).default;
const D = await import("../src/servidor/dados.ts");
const { criarCookie, exigirLogin, exigirCargoDaRota } = await import("../src/servidor/sessao.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar } = await import("../src/cadastros/armazem.ts");
const { rotasGestao } = await import("../src/gestao/rotas.ts");
const { registrarCartaoTokenizado } = await import("../src/gestao/cadastros-machine.ts");
const B = await import("../src/servidor/banco.ts");

const app = express();
app.use(express.json());
app.post("/teste/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({ ok: true }); });
app.use("/api", exigirLogin, exigirCargoDaRota);
app.use("/api/gestao", rotasGestao);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => { servidor.closeAllConnections(); servidor.close(); B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

const E = D.criarEmpresa("Ajuda Um").id, E2 = D.criarEmpresa("Ajuda Dois").id;
const adm = D.criarUsuario({ email: "adm@ajuda.test", nome: "Adm", senha: "senha-forte-1", empresaId: E, papel: "admin" });
const ges = D.criarUsuario({ email: "ges@ajuda.test", nome: "Ges", senha: "senha-forte-1", empresaId: E, papel: "gestor" });
const op = D.criarUsuario({ email: "op@ajuda.test", nome: "Op", senha: "senha-forte-1", empresaId: E, papel: "operador" });
const adm2 = D.criarUsuario({ email: "adm2@ajuda.test", nome: "Adm2", senha: "senha-forte-1", empresaId: E2, papel: "admin" });
const dono = D.criarUsuario({ email: "dono@ajuda.test", nome: "Dono", senha: "senha-forte-1", empresaId: E, papel: "plataforma" });
criar(E, cadastroPorId("clientes")!, { nome: "Paula Passageira", telefone: "11920000001", status: "Ativo" }, "t");

async function entrar(id: string) { return ((await fetch(`${base}/teste/entrar/${id}`, { method: "POST" })).headers.get("set-cookie") ?? "").split(";")[0]; }
const cAdm = await entrar(adm.id), cGes = await entrar(ges.id), cOp = await entrar(op.id), cAdm2 = await entrar(adm2.id), cDono = await entrar(dono.id);
async function api(cookie: string, metodo: string, url: string, corpo?: unknown) {
  const r = await fetch(`${base}${url}`, { method: metodo, headers: { cookie, "content-type": "application/json" }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  return { status: r.status, corpo: (await r.json().catch(() => ({}))) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

// ------------------------------------------------------------------ termos de uso do painel

test("termos de uso: texto e versão; cada usuário aceita a versão em vigor; admin vê quem aceitou", async () => {
  const antes = await api(cOp, "GET", "/api/gestao/termos-painel");
  assert.equal(antes.status, 200);
  assert.ok(antes.corpo.versao && antes.corpo.texto.includes("1. Aceite"));
  assert.equal(antes.corpo.aceite, null);
  assert.equal(antes.corpo.aceitos, undefined, "operador não vê a lista");
  const ac = await api(cOp, "POST", "/api/gestao/termos-painel/aceitar");
  assert.equal(ac.status, 200);
  assert.equal(ac.corpo.aceite.versao, antes.corpo.versao);
  assert.equal((await api(cOp, "GET", "/api/gestao/termos-painel")).corpo.aceite.versao, antes.corpo.versao);
  assert.equal((await api(cGes, "GET", "/api/gestao/termos-painel")).corpo.aceite, null, "o aceite é pessoal");
  const lista = (await api(cAdm, "GET", "/api/gestao/termos-painel")).corpo.aceitos;
  assert.deepEqual(lista.map((a: { email: string }) => a.email), ["op@ajuda.test"]);
  assert.equal((await api(cAdm2, "GET", "/api/gestao/termos-painel")).corpo.aceitos.length, 0, "outra empresa não vê");
});

// ------------------------------------------------------------------ central de suporte

test("central de suporte: sem contato configurado nada é inventado; só o dono da plataforma grava", async () => {
  const s = await api(cOp, "GET", "/api/gestao/suporte");
  assert.equal(s.status, 200);
  assert.deepEqual(s.corpo.plataforma, { whatsapp: "", email: "", telefone: "", site: "", horario: "" });
  assert.equal(s.corpo.editavel, false);
  assert.equal((await api(cAdm, "PUT", "/api/gestao/suporte", { email: "a@b.com" })).status, 403, "nem o admin da empresa");
  assert.equal((await api(cDono, "PUT", "/api/gestao/suporte", { email: "invalido" })).status, 400);
  assert.equal((await api(cDono, "PUT", "/api/gestao/suporte", { site: "javascript:alert(1)" })).status, 400);
  const ok = await api(cDono, "PUT", "/api/gestao/suporte", { whatsapp: "+55 (11) 91234-5678", email: "suporte@exemplo.test", horario: "Seg a sex, 8h às 18h" });
  assert.equal(ok.status, 200);
  assert.equal(ok.corpo.plataforma.whatsapp, "+5511912345678");
  const outra = await api(cOp, "GET", "/api/gestao/suporte");
  assert.equal(outra.corpo.plataforma.email, "suporte@exemplo.test", "vale para todas as empresas");
  assert.equal(outra.corpo.matriz.nome, "", "contato da matriz (Central de Ajuda) vem à parte");
});

// ------------------------------------------------------------------ ouvidoria

test("ouvidoria: qualquer usuário registra e recebe protocolo; admin lista tudo, responde e muda o status", async () => {
  assert.equal((await api(cOp, "POST", "/api/gestao/ouvidoria", { tipo: "Xingamento", assunto: "abc", mensagem: "mensagem longa o bastante" })).status, 400);
  assert.equal((await api(cOp, "POST", "/api/gestao/ouvidoria", { tipo: "Reclamação", assunto: "", mensagem: "mensagem longa o bastante" })).status, 400);
  assert.equal((await api(cOp, "POST", "/api/gestao/ouvidoria", { tipo: "Reclamação", assunto: "Painel lento", mensagem: "curta" })).status, 400);
  const a = await api(cOp, "POST", "/api/gestao/ouvidoria", { tipo: "Reclamação", assunto: "Painel lento", mensagem: "O painel demora para abrir o mapa de motoristas." });
  assert.equal(a.status, 200, JSON.stringify(a.corpo));
  assert.match(a.corpo.manifestacao.protocolo, /^OUV-\d{4}-000001$/);
  assert.equal(a.corpo.manifestacao.status, "Aberto");
  assert.equal(a.corpo.manifestacao.email, "op@ajuda.test");
  const b = await api(cGes, "POST", "/api/gestao/ouvidoria", { tipo: "Elogio", assunto: "Ótimo atendimento", mensagem: "A equipe de suporte resolveu rápido." });
  assert.match(b.corpo.manifestacao.protocolo, /-000002$/);
  const c = await api(cAdm2, "POST", "/api/gestao/ouvidoria", { tipo: "Sugestão", assunto: "Relatório novo", mensagem: "Seria bom ter um relatório por bairro." });
  assert.match(c.corpo.manifestacao.protocolo, /-000001$/, "a sequência é por empresa");

  // cada um vê só as suas; admin vê todas da empresa
  const minhas = await api(cOp, "GET", "/api/gestao/ouvidoria");
  assert.equal(minhas.corpo.manifestacoes.length, 1);
  assert.equal(minhas.corpo.todas, false);
  const todas = await api(cAdm, "GET", "/api/gestao/ouvidoria");
  assert.equal(todas.corpo.manifestacoes.length, 2);
  assert.equal(todas.corpo.kpis.abertas, 2);
  assert.equal((await api(cAdm, "GET", "/api/gestao/ouvidoria?tipo=Elogio")).corpo.manifestacoes.length, 1);
  assert.equal((await api(cAdm, "GET", `/api/gestao/ouvidoria?busca=${a.corpo.manifestacao.protocolo}`)).corpo.manifestacoes.length, 1);

  // só o admin responde
  const id = a.corpo.manifestacao.id;
  assert.equal((await api(cOp, "PUT", `/api/gestao/ouvidoria/${id}`, { status: "Respondido", resposta: "ok" })).status, 403);
  assert.equal((await api(cAdm, "PUT", `/api/gestao/ouvidoria/${id}`, { status: "Respondido" })).status, 400, "respondido exige resposta");
  const em = await api(cAdm, "PUT", `/api/gestao/ouvidoria/${id}`, { status: "Em análise" });
  assert.equal(em.corpo.manifestacao.status, "Em análise");
  const r = await api(cAdm, "PUT", `/api/gestao/ouvidoria/${id}`, { status: "Respondido", resposta: "Vamos olhar o mapa." });
  assert.equal(r.corpo.manifestacao.status, "Respondido");
  assert.equal(r.corpo.manifestacao.respondidoPor, "adm@ajuda.test");
  assert.equal((await api(cOp, "GET", "/api/gestao/ouvidoria")).corpo.manifestacoes[0].resposta, "Vamos olhar o mapa.", "quem registrou lê a resposta");
  assert.equal((await api(cAdm2, "PUT", `/api/gestao/ouvidoria/${id}`, { status: "Encerrado" })).status, 404, "outra empresa não mexe");
});

// ------------------------------------------------------------------ consulta de cartões

test("consulta de cartões: vazia sem integração; só final, bandeira e validade; filtros; nunca número completo", async () => {
  assert.equal((await api(cOp, "GET", "/api/gestao/cartoes-clientes")).status, 403);
  const vazio = await api(cGes, "GET", "/api/gestao/cartoes-clientes");
  assert.equal(vazio.status, 200);
  assert.deepEqual(vazio.corpo.cartoes, []);
  assert.equal(vazio.corpo.kpis.total, 0);

  assert.throws(() => registrarCartaoTokenizado(E, { telefone: "11920000001", bandeira: "Visa", final: "4111111111111111" }), /4 últimos/);
  assert.throws(() => registrarCartaoTokenizado(E, { telefone: "11920000001", bandeira: "Visa", final: "411" }), /4 últimos/);
  assert.throws(() => registrarCartaoTokenizado(E, { telefone: "11920000001", bandeira: "Visa", final: "1111", validade: "13/30" }), /MM\/AA/);
  registrarCartaoTokenizado(E, { telefone: "5511920000001", bandeira: "visa", final: "1111", validade: "12/30", validado: true, gateway: "teste" });
  registrarCartaoTokenizado(E, { telefone: "11999990000", nome: "Sem cadastro", bandeira: "Mastercard", final: "2222", validade: "01/29", validado: false });
  registrarCartaoTokenizado(E2, { telefone: "11920000001", bandeira: "Elo", final: "3333" });

  const l = await api(cGes, "GET", "/api/gestao/cartoes-clientes");
  assert.equal(l.corpo.cartoes.length, 2, "só os da empresa");
  assert.deepEqual(l.corpo.kpis, { total: 2, validados: 1, naoValidados: 1 });
  const visa = l.corpo.cartoes.find((c: { bandeira: string }) => c.bandeira === "Visa");
  assert.equal(visa.nome, "Paula Passageira", "nome vem do cadastro de clientes");
  assert.equal(visa.telefone, "11920000001");
  assert.deepEqual(Object.keys(visa).sort(), ["bandeira", "criadoEm", "final", "gateway", "id", "nome", "telefone", "validade", "validado"]);
  assert.equal((await api(cGes, "GET", "/api/gestao/cartoes-clientes?bandeira=Mastercard")).corpo.cartoes.length, 1);
  assert.equal((await api(cGes, "GET", "/api/gestao/cartoes-clientes?status=Validado")).corpo.cartoes[0].final, "1111");
  assert.equal((await api(cGes, "GET", "/api/gestao/cartoes-clientes?status=Não validado")).corpo.cartoes[0].final, "2222");
  assert.equal((await api(cGes, "GET", "/api/gestao/cartoes-clientes?busca=paula")).corpo.cartoes.length, 1);
  assert.equal((await api(cGes, "GET", "/api/gestao/cartoes-clientes?busca=2222")).corpo.cartoes.length, 1);

  // remover: só admin, e só da própria empresa
  assert.equal((await api(cGes, "DELETE", `/api/gestao/cartoes-clientes/${visa.id}`)).status, 403);
  assert.equal((await api(cAdm2, "DELETE", `/api/gestao/cartoes-clientes/${visa.id}`)).status, 404);
  assert.equal((await api(cAdm, "DELETE", `/api/gestao/cartoes-clientes/${visa.id}`)).status, 200);
  assert.equal((await api(cGes, "GET", "/api/gestao/cartoes-clientes")).corpo.cartoes.length, 1);
});
