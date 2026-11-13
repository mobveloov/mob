// Testes do Mapa de engajamento (src/engajamento): classificação, faixas por empresa, período e isolamento entre empresas.
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

test("classificação: menor é melhor no cancelamento e maior é melhor nos demais", () => {
  const menor = { sentido: "menor" as const }, maior = { sentido: "maior" as const };
  assert.equal(E.classificar(menor, { bom: 8, aceitavel: 30 }, 8), "bom");
  assert.equal(E.classificar(menor, { bom: 8, aceitavel: 30 }, 8.1), "aceitavel");
  assert.equal(E.classificar(menor, { bom: 8, aceitavel: 30 }, 30), "aceitavel");
  assert.equal(E.classificar(menor, { bom: 8, aceitavel: 30 }, 30.5), "ruim");
  assert.equal(E.classificar(maior, { bom: 4.5, aceitavel: 4 }, 4.5), "bom");
  assert.equal(E.classificar(maior, { bom: 4.5, aceitavel: 4 }, 4), "aceitavel");
  assert.equal(E.classificar(maior, { bom: 4.5, aceitavel: 4 }, 3.9), "ruim");
});

test("período e faixas: validação em português", () => {
  assert.deepEqual(E.validarPeriodo({ tipo: "7" }), { tipo: "7" });
  assert.throws(() => E.validarPeriodo({ tipo: "1000" }), /Período inválido/);
  assert.throws(() => E.validarPeriodo({ tipo: "personalizado", inicio: "2026-02-10", fim: "2026-02-01" }), /data inicial/);
  assert.throws(() => E.validarPeriodo({ tipo: "personalizado", inicio: "2024-01-01", fim: "2026-01-01" }), /366 dias/);
  assert.deepEqual(E.intervalo({ tipo: "7" }, "2026-03-10"), { inicio: "2026-03-04", fim: "2026-03-10", dias: 7 });
  assert.throws(() => E.validarFaixas("passageiros", { cancelamento: { bom: 30, aceitavel: 8 } }), /menor que o de "Aceitável"/);
  assert.throws(() => E.validarFaixas("passageiros", { avaliacoes: { bom: 3, aceitavel: 4 } }), /maior que o de "Aceitável"/);
  assert.throws(() => E.validarFaixas("passageiros", { avaliacoes: { bom: 9, aceitavel: 4 } }), /entre 0 e 5/);
  assert.throws(() => E.validarFaixas("passageiros", { cancelamento: { bom: "x", aceitavel: 4 } }), /números/);
});

test("exige login e papel; padrão da configuração", async () => {
  ca = await cookieDe(adminA.id); co = await cookieDe(operA.id); cb = await cookieDe(adminB.id);
  assert.equal((await pedir("/mapa")).status, 401);
  const c = await pedir("/config", { cookie: co });
  assert.equal(c.status, 200);
  assert.deepEqual(c.corpo.periodo, { tipo: "30" });
  assert.deepEqual(c.corpo.faixas.passageiros.cancelamento, { bom: 8, aceitavel: 30 });
  assert.equal((await pedir("/mapa?papel=outro", { cookie: ca })).status, 400);
});

test("passageiros: indicadores calculados das corridas da empresa", async () => {
  // Maria: 5 corridas hoje, 1 cancelada por ela (20%). João: 1 corrida cancelada por ele (100%).
  const ids: string[] = [];
  for (let i = 0; i < 5; i++) {
    const c = await C.criarCorridaPropria(A.id, pedido("Maria Teste", "11988887777", -21.12 + i * 0.001, -48.3));
    ids.push(c.id);
    if (i === 0) { await C.cancelarCorrida(A.id, c.id, "Passageiro", "Desisti"); continue; }
    if (i === 1) {
      await C.atribuirMotorista(A.id, c.id, String(carlos.id));
      await C.mudarStatus(A.id, c.id, "em_andamento");
      await C.mudarStatus(A.id, c.id, "finalizada", { avaliacao: 5 });
    } else await C.cancelarCorrida(A.id, c.id, "Central", "Teste");
  }
  const joao = await C.criarCorridaPropria(A.id, pedido("João Outro", "11977776666", -21.2, -48.4));
  await C.cancelarCorrida(A.id, joao.id, "Passageiro", "Desisti");
  // Outra empresa: uma corrida que nunca pode aparecer na empresa A.
  await C.criarCorridaPropria(B.id, pedido("Estranha Sul", "11955554444", -23.5, -46.6));

  const r = await pedir("/mapa?papel=passageiros", { cookie: co });
  assert.equal(r.status, 200, r.texto);
  const nomes = r.corpo.pontos.map((p: { nome: string }) => p.nome).sort();
  assert.deepEqual(nomes, ["João Outro", "Maria Teste"]);
  const maria = r.corpo.pontos.find((p: { nome: string }) => p.nome === "Maria Teste");
  assert.equal(maria.valores.solicitacoes, 5);
  assert.equal(maria.valores.cancelamento, 20);
  assert.equal(maria.classes.cancelamento, "aceitavel");
  assert.equal(maria.classes.solicitacoes, "bom");
  assert.ok(maria.lat != null && maria.lng != null);
  const joaoPt = r.corpo.pontos.find((p: { nome: string }) => p.nome === "João Outro");
  assert.equal(joaoPt.classes.cancelamento, "ruim");
  const canc = r.corpo.indicadores.find((i: { id: string }) => i.id === "cancelamento");
  assert.deepEqual(canc.contagem, { bom: 0, aceitavel: 1, ruim: 1 });
  assert.equal(canc.total, 2);
  assert.equal(r.corpo.indicadores.length, 6);
  assert.ok(!r.texto.includes("Estranha"), "dados de outra empresa não aparecem");
});

test("motoristas: corridas atendidas e avaliação", async () => {
  const r = await pedir("/mapa?papel=motoristas", { cookie: ca });
  assert.equal(r.status, 200, r.texto);
  const c = r.corpo.pontos.find((p: { nome: string }) => p.nome === "Carlos Souza");
  assert.ok(c);
  assert.equal(c.valores.solicitacoes, 1);
  assert.equal(c.valores.avaliacoes, 5);
  assert.equal(c.classes.avaliacoes, "bom");
  assert.equal(c.classes.solicitacoes, "ruim"); // 1 corrida, abaixo do aceitável (8)
});

test("faixas e período salvos por empresa; só administrador altera", async () => {
  const salvo = await pedir("/config", { metodo: "PUT", cookie: ca, corpo: { periodo: { tipo: "7" }, papel: "passageiros", faixas: { cancelamento: { bom: 25, aceitavel: 60 } } } });
  assert.equal(salvo.status, 200, salvo.texto);
  assert.deepEqual(salvo.corpo.periodo, { tipo: "7" });
  assert.equal((await pedir("/config", { metodo: "PUT", cookie: co, corpo: { periodo: { tipo: "90" } } })).status, 403);
  assert.equal((await pedir("/config", { metodo: "PUT", cookie: ca, corpo: { papel: "passageiros", faixas: { cancelamento: { bom: 50, aceitavel: 10 } } } })).status, 400);

  const r = await pedir("/mapa?papel=passageiros", { cookie: co });
  assert.equal(r.corpo.periodo.dias, 7);
  const maria = r.corpo.pontos.find((p: { nome: string }) => p.nome === "Maria Teste");
  assert.equal(maria.classes.cancelamento, "bom", "com o novo limite de 25%, 20% é bom");
  // A outra empresa continua com o padrão.
  const b = await pedir("/config", { cookie: cb });
  assert.deepEqual(b.corpo.periodo, { tipo: "30" });
  assert.deepEqual(b.corpo.faixas.passageiros.cancelamento, { bom: 8, aceitavel: 30 });
  // Fica gravado em disco, na pasta da empresa.
  assert.ok(fs.existsSync(path.join(DADOS, "empresas", A.id, "operacao", "engajamento.json")));
  assert.ok(!fs.existsSync(path.join(DADOS, "empresas", B.id, "operacao", "engajamento.json")));
});

test("histórico: dia a dia, totais e pontos de embarque", async () => {
  await pedir("/config", { metodo: "PUT", cookie: ca, corpo: { periodo: { tipo: "personalizado", inicio: "2000-01-01", fim: "2000-01-02" } } });
  assert.equal((await pedir("/historico", { cookie: ca })).corpo.totais.pedidas, 0);
  await pedir("/config", { metodo: "PUT", cookie: ca, corpo: { periodo: { tipo: "7" } } });
  const h = await pedir("/historico", { cookie: ca });
  assert.equal(h.status, 200, h.texto);
  assert.equal(h.corpo.serie.length, 7);
  assert.equal(h.corpo.totais.pedidas, 6);
  assert.equal(h.corpo.totais.finalizadas, 1);
  assert.equal(h.corpo.totais.canceladas, 5);
  assert.equal(h.corpo.totais.passageiros, 2);
  assert.equal(h.corpo.pontos.length, 6);
  assert.equal((await pedir("/historico", { cookie: cb })).corpo.totais.pedidas, 1);
});
