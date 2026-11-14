// Testes do Mapa de engajamento no formato da Machine (src/engajamento): faixas, limites por empresa, filtros, ações e isolamento.
// Rodar: npm test (na pasta painel). Sem rede e sem chaves.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "engajamento-teste-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "t".repeat(40);

const express = (await import("express")).default;
const D = await import("../src/servidor/dados.ts");
const { criarCookie, exigirLogin } = await import("../src/servidor/sessao.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar } = await import("../src/cadastros/armazem.ts");
const C = await import("../src/corridas/index.ts");
const E = await import("../src/engajamento/calculo.ts");
const { rotasEngajamento } = await import("../src/engajamento/rotas.ts");

const app = express();
app.use(express.json());
app.post("/teste/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({ ok: true }); });
app.use("/api", exigirLogin);
app.use("/api/engajamento", rotasEngajamento);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => servidor.close());

const A = D.criarEmpresa("Rota Norte"), B = D.criarEmpresa("Leva Sul");
const adminA = D.criarUsuario({ email: "admin@a.test", nome: "Ana", senha: "senha-forte-1", empresaId: A.id, papel: "admin" });
const operA = D.criarUsuario({ email: "oper@a.test", nome: "Otávio", senha: "senha-forte-2", empresaId: A.id, papel: "operador" });
const adminB = D.criarUsuario({ email: "admin@b.test", nome: "Bia", senha: "senha-forte-3", empresaId: B.id, papel: "admin" });

async function pedir(caminho: string, o: { metodo?: string; corpo?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (o.cookie) headers.cookie = o.cookie;
  const r = await fetch(`${base}/api/engajamento${caminho}`, { method: o.metodo ?? (o.corpo ? "POST" : "GET"), headers, body: o.corpo ? JSON.stringify(o.corpo) : undefined });
  const texto = await r.text();
  let corpo: Record<string, any> = {};
  try { corpo = JSON.parse(texto || "{}"); } catch { /* resposta sem JSON */ }
  return { status: r.status, corpo, texto };
}
async function cookieDe(id: string) {
  const r = await fetch(`${base}/teste/entrar/${id}`, { method: "POST" });
  return (r.headers.get("set-cookie") ?? "").split(";")[0];
}

const MOT = cadastroPorId("motoristas")!, CAT = cadastroPorId("categorias")!;
criar(A.id, CAT, { nome: "Econômico", bandeirada: 5, valorKm: 2, valorMinimo: 9.9, ativa: true, taxaCancelamento: 0, toleranciaCancelamento: 0 }, "teste");
criar(B.id, CAT, { nome: "Econômico", bandeirada: 5, valorKm: 2, valorMinimo: 9.9, ativa: true, taxaCancelamento: 0, toleranciaCancelamento: 0 }, "teste");
const carlos = criar(A.id, MOT, { nome: "Carlos Souza", telefone: "11900000000", status: "Ativo", veiculo: "Hatch", placa: "ABC1D23" }, "teste");

const pedido = (nome: string, tel: string, lat: number, lng: number) => ({
  passageiro: { nome, telefone: tel }, embarque: { texto: "Rua das Flores, 10", lat, lng }, destino: { texto: "Av. Brasil, 500", lat: lat + 0.01, lng: lng + 0.01 },
  categoria: "Econômico", pagamento: "Pix", canal: "painel" as const,
});

let ca = "", co = "", cb = "";

test("faixas: três faixas por dois limites, texto no jeito da Machine", () => {
  const c = { a: 8, b: 30 };
  assert.equal(E.faixaDe(c, 8), 0);
  assert.equal(E.faixaDe(c, 8.1), 1);
  assert.equal(E.faixaDe(c, 30), 1);
  assert.equal(E.faixaDe(c, 30.1), 2);
  const canc = E.INDICADORES.passageiros.find((d) => d.id === "cancelamento")!;
  assert.deepEqual([0, 1, 2].map((i) => E.textoFaixa(canc, c, i as 0 | 1 | 2)), ["≤ 8%", "> 8 – 30%", "> 30%"]);
  const on = E.INDICADORES.motoristas.find((d) => d.id === "tempoOnline")!;
  assert.deepEqual([0, 1, 2].map((i) => E.textoFaixa(on, { a: 4, b: 8.5 }, i as 0 | 1 | 2)), ["≤ 4 h", "> 4 – 8,5 h", "> 8,5 h"]);
});

test("indicadores iguais aos da Machine, com os limites padrão", () => {
  assert.deepEqual(E.INDICADORES.motoristas.map((d) => d.rotulo), ["Tempo online", "Hora trabalhada", "Corridas", "Ausência", "Frequência de trabalho", "Avaliações", "Tempo de casa"]);
  assert.deepEqual(E.INDICADORES.passageiros.map((d) => d.rotulo), ["Solicitações", "Frequência de uso", "Cancelamento", "Estimativas", "Avaliações", "Tempo de casa"]);
  const sol = E.INDICADORES.passageiros[0];
  assert.deepEqual(sol.nomes, ["Baixo", "Médio", "Alto"]);
  assert.deepEqual([sol.padrao.a, sol.padrao.b], [4, 10]);
});

test("período e limites: validação em português", () => {
  const corr = E.INDICADORES.motoristas.find((d) => d.id === "corridas")!;
  const freq = E.INDICADORES.motoristas.find((d) => d.id === "frequenciaTrabalho")!;
  const aus = E.INDICADORES.motoristas.find((d) => d.id === "ausencia")!;
  assert.deepEqual(E.validarPeriodo(corr, { tipo: "7" }), { tipo: "7" });
  assert.deepEqual(E.validarPeriodo(freq, { tipo: "8" }), { tipo: "8" });
  assert.throws(() => E.validarPeriodo(corr, { tipo: "8" }), /Período inválido/);
  assert.deepEqual(E.validarPeriodo(aus, { tipo: "30" }), { tipo: "nenhum" });
  assert.throws(() => E.validarPeriodo(corr, { tipo: "personalizado", inicio: "2026-02-10", fim: "2026-02-01" }), /data inicial/);
  assert.throws(() => E.validarPeriodo(corr, { tipo: "personalizado", inicio: "2024-01-01", fim: "2026-01-01" }), /366 dias/);
  assert.deepEqual(E.intervalo(corr, { tipo: "7" }, "2026-03-10"), { inicio: "2026-03-04", fim: "2026-03-10", dias: 7 });
  assert.deepEqual(E.intervalo(freq, { tipo: "2" }, "2026-03-14"), { inicio: "2026-03-01", fim: "2026-03-14", dias: 14 });
  assert.throws(() => E.validarLimites(corr, 80, 20), /menor que o segundo/);
  assert.throws(() => E.validarLimites(corr, "x", 20), /números/);
  assert.throws(() => E.validarLimites(corr, 10, 5000), /entre 0 e 1000/);
});

test("exige login e papel; padrão da configuração", async () => {
  ca = await cookieDe(adminA.id); co = await cookieDe(operA.id); cb = await cookieDe(adminB.id);
  assert.equal((await pedir("/mapa")).status, 401);
  const c = await pedir("/config", { cookie: co });
  assert.equal(c.status, 200, c.texto);
  assert.deepEqual(c.corpo.config.passageiros.cancelamento, { a: 8, b: 30, periodo: { tipo: "30" } });
  assert.equal((await pedir("/mapa?papel=outro", { cookie: ca })).status, 400);
});

test("passageiros: contagem por faixa calculada das corridas da empresa", async () => {
  // Maria: 5 corridas, 1 cancelada por ela (20%). João: 1 corrida cancelada por ele (100%).
  for (let i = 0; i < 5; i++) {
    const c = await C.criarCorridaPropria(A.id, pedido("Maria Teste", "11988887777", -21.12 + i * 0.001, -48.3));
    if (i === 0) { await C.cancelarCorrida(A.id, c.id, "Passageiro", "Desisti"); continue; }
    if (i === 1) {
      await C.atribuirMotorista(A.id, c.id, String(carlos.id));
      await C.mudarStatus(A.id, c.id, "em_andamento");
      await C.mudarStatus(A.id, c.id, "finalizada", { avaliacao: 5 });
    } else await C.cancelarCorrida(A.id, c.id, "Central", "Teste");
  }
  const joao = await C.criarCorridaPropria(A.id, pedido("João Outro", "11977776666", -21.2, -48.4));
  await C.cancelarCorrida(A.id, joao.id, "Passageiro", "Desisti");
  await C.criarCorridaPropria(B.id, pedido("Estranha Sul", "11955554444", -23.5, -46.6));

  const r = await pedir("/mapa?papel=passageiros", { cookie: co });
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.corpo.total, 2, "só as duas pessoas da empresa A");
  const sol = r.corpo.indicadores.find((i: { id: string }) => i.id === "solicitacoes");
  assert.deepEqual(sol.contagem, [1, 1, 0]); // João 1 (baixo), Maria 5 (médio)
  assert.deepEqual(sol.limites, ["≤ 4 solicitações", "> 4 – 10 solicitações", "> 10 solicitações"]);
  const canc = r.corpo.indicadores.find((i: { id: string }) => i.id === "cancelamento");
  assert.deepEqual(canc.contagem, [0, 1, 1]); // Maria 20% (aceitável), João 100% (ruim)
  assert.equal(canc.barras.length, 20);
  const lista = await pedir("/lista?papel=passageiros&indicador=cancelamento&faixa=2", { cookie: co });
  assert.deepEqual(lista.corpo.pessoas.map((p: { nome: string }) => p.nome), ["João Outro"]);
  assert.equal((await pedir("/lista?papel=passageiros&indicador=nada&faixa=2", { cookie: co })).status, 400);
});

test("motoristas: filtro por situação e valores", async () => {
  criar(A.id, MOT, { nome: "Dora Bloqueada", telefone: "11911110000", status: "Bloqueado", veiculo: "Sedã", placa: "XYZ1A11" }, "teste");
  const so = await pedir("/mapa?papel=motoristas", { cookie: co });
  assert.equal(so.corpo.total, 1, "padrão: só ativos");
  assert.deepEqual(so.corpo.indicadores.map((i: { id: string }) => i.id), E.INDICADORES.motoristas.map((d) => d.id));
  assert.equal(so.corpo.filtros.situacoes[0].rotulo, "Ativos");
  const todos = await pedir("/mapa?papel=motoristas&situacao=A,S", { cookie: co });
  assert.equal(todos.corpo.total, 2);
  const corr = todos.corpo.indicadores.find((i: { id: string }) => i.id === "corridas");
  assert.deepEqual(corr.contagem, [2, 0, 0]); // 1 corrida finalizada hoje; limite padrão "Ruim ≤ 20"
  assert.equal(corr.predominante.nome, "Ruim");
});

test("só o administrador salva limites; ficam por empresa", async () => {
  const corpo = { papel: "passageiros", indicador: "cancelamento", a: 10, b: 50, periodo: { tipo: "15" } };
  assert.equal((await pedir("/config", { metodo: "PUT", corpo, cookie: co })).status, 403);
  assert.equal((await pedir("/config", { metodo: "PUT", corpo: { ...corpo, a: 60 }, cookie: ca })).status, 400);
  assert.equal((await pedir("/config", { metodo: "PUT", corpo, cookie: ca })).status, 200);
  const a = await pedir("/config", { cookie: ca }), b = await pedir("/config", { cookie: cb });
  assert.deepEqual(a.corpo.config.passageiros.cancelamento, { a: 10, b: 50, periodo: { tipo: "15" } });
  assert.deepEqual(b.corpo.config.passageiros.cancelamento, { a: 8, b: 30, periodo: { tipo: "30" } });
  const r = await pedir("/mapa?papel=passageiros", { cookie: cb });
  assert.equal(r.corpo.total, 1, "a empresa B só vê a própria passageira");
});

test("ações: mensagem e mudança de situação ficam no histórico; operador não muda situação", async () => {
  const sem = await pedir("/acao", { corpo: { papel: "motoristas", indicador: "corridas", faixa: 0, tipo: "mensagem", texto: "Oi {nome}, vamos rodar mais?" }, cookie: co });
  assert.equal(sem.status, 200, sem.texto);
  assert.equal(sem.corpo.destinatarios, 1);
  assert.equal((await pedir("/acao", { corpo: { papel: "motoristas", indicador: "corridas", faixa: 0, tipo: "status", status: "Inativo" }, cookie: co })).status, 400);
  assert.equal((await pedir("/acao", { corpo: { papel: "passageiros", indicador: "solicitacoes", faixa: 2, tipo: "mensagem", texto: "x" }, cookie: ca })).status, 400, "faixa vazia");
  assert.equal((await pedir("/acao", { corpo: { papel: "passageiros", indicador: "solicitacoes", faixa: 1, tipo: "desafio", titulo: "t", texto: "x" }, cookie: ca })).status, 400, "desafio é só de motorista");
  const h = await pedir("/historico", { cookie: ca });
  assert.equal(h.corpo.acoes.length, 1);
  assert.equal(h.corpo.acoes[0].tipo, "mensagem");
  assert.equal((await pedir("/historico", { cookie: cb })).corpo.acoes.length, 0);
  const alt = await pedir("/acao", { corpo: { papel: "motoristas", indicador: "corridas", faixa: 0, tipo: "status", status: "Inativo" }, cookie: ca });
  assert.equal(alt.status, 200, alt.texto);
  assert.equal((await pedir("/mapa?papel=motoristas", { cookie: ca })).corpo.total, 0);
});
