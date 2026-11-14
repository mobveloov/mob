// Correções do teste de carga: cache de leitura, corridas no banco (migração e pedidos ao mesmo tempo),
// limite de login que só conta erro, e cadastro que não regrava sem mudança.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-desemp-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
delete process.env.BANCO_ARQUIVO;

const J = await import("../src/servidor/jsoncache.ts");
const D = await import("../src/servidor/dados.ts");
const R = await import("../src/corridas/index.ts");
const C = await import("../src/cadastros/armazem.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const S = await import("../src/servidor/sessao.ts");
const B = await import("../src/servidor/banco.ts");

test("cache de leitura: só leitura, atualiza ao gravar e percebe mudança de fora", async () => {
  const arq = path.join(DADOS, "x", "teste.json");
  J.gravarJson(arq, [{ a: 1 }]);
  const v = J.lerJson<Array<{ a: number }>>(arq, []);
  assert.deepEqual(v, [{ a: 1 }]);
  assert.throws(() => { (v as Array<{ a: number }>).push({ a: 2 }); }, TypeError, "não deixa mudar sem gravar");
  assert.throws(() => { v[0].a = 9; }, TypeError);
  J.gravarJson(arq, [{ a: 2 }]);
  assert.deepEqual(J.lerJson(arq, []), [{ a: 2 }], "gravar atualiza o cache na hora");
  fs.writeFileSync(arq, JSON.stringify([{ a: 3 }, { a: 4 }])); // mudança de fora
  await new Promise((r) => setTimeout(r, 1100));
  assert.deepEqual(J.lerJson(arq, []), [{ a: 3 }, { a: 4 }], "em até 1 s lê de novo do disco");
  fs.rmSync(path.join(DADOS, "x"), { recursive: true });
  J.gravarJson(arq, [{ a: 5 }]); // pasta apagada por fora: cria de novo
  assert.deepEqual(J.lerJson(arq, []), [{ a: 5 }]);
});

test("corridas próprias: o corridas.json antigo entra no banco sem perder nada", async () => {
  const e = D.criarEmpresa("Migra Corridas").id;
  const pasta = path.join(DADOS, "empresas", e);
  fs.mkdirSync(pasta, { recursive: true });
  const velha = { id: "c-velha", os: "100007", status: "finalizada", canal: "painel", passageiro: { nome: "Antiga", telefone: "11911112222" }, embarque: { texto: "Rua A" }, categoria: "", pagamento: "Pix", observacao: "", motoristaId: null, motorista: "", telefoneMotorista: "", estimativa: { valor: 20, distanciaKm: 4, minutos: 10 }, valor: 20, cupom: "", desconto: null, canceladaPor: "", motivoCancelamento: "", avaliacao: 4, solicitadaEm: "2026-11-01T10:00:00.000Z", iniciadaEm: null, finalizadaEm: "2026-11-01T10:20:00.000Z", historico: [{ em: "2026-11-01T10:00:00.000Z", status: "procurando", por: "x" }] };
  fs.writeFileSync(path.join(pasta, "corridas.json"), JSON.stringify([velha]));
  const l = R.listarProprias(e);
  assert.equal(l.length, 1);
  assert.deepEqual(l[0], velha, "a corrida volta igual");
  assert.ok(fs.existsSync(path.join(pasta, "corridas.json.migrado")), "o JSON fica guardado");
  // A próxima OS continua depois da migrada.
  const nova = await R.criarCorridaPropria(e, { passageiro: { nome: "Nova", telefone: "11933334444" }, embarque: { texto: "Rua B" }, categoria: "", pagamento: "Pix", canal: "painel" });
  assert.equal(nova.os, "100008");
  R.esquecerCorridasDaMemoria();
  assert.equal(R.listarProprias(e).length, 2, "lido de novo do banco");
});

test("200 pedidos ao mesmo tempo em 2 empresas: nada se perde, OS não repete, empresas não misturam", async () => {
  const a = D.criarEmpresa("Carga A").id, b = D.criarEmpresa("Carga B").id;
  const pedidos = Array.from({ length: 200 }, (_, i) => {
    const e = i % 2 ? b : a;
    return R.criarCorridaPropria(e, { passageiro: { nome: `P${i}`, telefone: `119${String(10000000 + i)}` }, embarque: { texto: `Rua ${i}` }, categoria: "", pagamento: "Pix", canal: "app" });
  });
  const feitas = await Promise.all(pedidos);
  assert.equal(feitas.length, 200);
  for (const e of [a, b]) {
    const l = R.listarProprias(e);
    assert.equal(l.length, 100);
    assert.equal(new Set(l.map((c) => c.os)).size, 100, "OS sem repetir");
    assert.equal(new Set(l.map((c) => c.passageiro.telefone)).size, 100);
  }
  assert.ok(R.listarProprias(a).every((c) => Number(c.passageiro.telefone.slice(-1)) % 2 === 0), "empresa A só tem as dela");
  // Mudanças ao mesmo tempo na mesma empresa: todas gravadas.
  const l = R.listarProprias(a);
  await Promise.all(l.slice(0, 50).map((c) => R.cancelarCorrida(a, c.id, "Central", "teste")));
  R.esquecerCorridasDaMemoria();
  assert.equal(R.listarProprias(a).filter((c) => c.status === "cancelada").length, 50);
});

test("login do painel: só tentativa errada conta (entrar certo várias vezes não tranca)", async () => {
  const e = D.criarEmpresa("Login Limite").id;
  D.criarUsuario({ email: "op@limite.test", nome: "Op", senha: "senha-certa-123", empresaId: e, papel: "operador" });
  const { app } = await import("../src/servidor/index.ts");
  const srv = app.listen(0);
  try {
    const url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/api/entrar`;
    const entrar = (senha: string, email = "op@limite.test") => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, senha }) }).then((r) => r.status);
    for (let i = 0; i < 12; i++) assert.equal(await entrar("senha-certa-123"), 200, `login certo ${i + 1}`);
    for (let i = 0; i < 8; i++) assert.equal(await entrar("errada"), 401);
    assert.equal(await entrar("senha-certa-123"), 429, "depois de 8 erros, tranca este e-mail neste IP");
    assert.equal(await entrar("qualquer", "outro@limite.test"), 401, "outro e-mail não fica trancado");
  } finally {
    srv.closeAllConnections();
    srv.close();
  }
});

test("cadastro: importar o que já está igual não grava nada no banco", async () => {
  const e = D.criarEmpresa("Sem Regravar").id;
  const cli = cadastroPorId("clientes")!;
  C.mesclar(e, cli, [{ nome: "Ana", telefone: "11955556666", status: "Ativo" }], "t");
  const { banco } = await import("../src/servidor/banco.ts");
  const mudancas = () => (banco().prepare("SELECT total_changes() AS n").get() as { n: number }).n;
  const antes = mudancas();
  const r = C.mesclar(e, cli, [{ nome: "Ana", telefone: "11955556666", status: "Ativo" }], "t");
  assert.deepEqual(r, { criados: 0, atualizados: 0 });
  assert.equal(mudancas(), antes);
});

test("despacho: motorista que fechou o app (sem sinal há mais de 90 s) não recebe a oferta", async (t) => {
  const P = await import("../src/apps/despacho.ts");
  const e = D.criarEmpresa("Fantasma").id;
  const mot = cadastroPorId("motoristas")!;
  const sumido = C.criar(e, mot, { nome: "Sumido", telefone: "11977770001", status: "Ativo" }, "t");
  const ativo = C.criar(e, mot, { nome: "Ativo", telefone: "11977770002", status: "Ativo" }, "t");
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
  P.ficarOnline(e, sumido.id, -21.0100, -48.2200); // bem em cima do embarque
  P.ficarOnline(e, ativo.id, -21.0300, -48.2400); // mais longe
  t.mock.timers.tick(100_000); // 100 s sem nenhum pedido do app do "sumido"
  P.atualizarPosicao(e, ativo.id, -21.0300, -48.2400); // o ativo continua mandando posição
  P.marcarVisto(e, ativo.id);
  const c = await R.criarCorridaPropria(e, { passageiro: { nome: "Pa", telefone: "11977779999" }, embarque: { texto: "Rua X", lat: -21.0101, lng: -48.2201 }, categoria: "", pagamento: "Pix", canal: "app" });
  P.despachar(e);
  assert.equal(P.ofertaDoMotorista(e, sumido.id), null, "o sumido não recebe");
  assert.equal(P.ofertaDoMotorista(e, ativo.id)?.corridaId, c.id, "vai para quem está com o app aberto");
  // Voltou a abrir o app: volta a contar.
  P.marcarVisto(e, sumido.id);
  t.mock.timers.reset();
});

test.after(() => {
  B.fecharBanco();
  fs.rmSync(DADOS, { recursive: true, force: true });
});
