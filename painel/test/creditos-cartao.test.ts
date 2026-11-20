// Financeiro > Créditos (Recargas e Saques, Extrato), Financeiro > Cartão (Painel, Transações, Saldo da Central, Saldo do Motorista)
// e Cobrança > Último boleto. Tudo por empresa, só Gestor e acima.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-credcartao-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "e".repeat(40);
delete process.env.BANCO_ARQUIVO;
delete process.env.OSRM_URL;

const express = (await import("express")).default;
const D = await import("../src/servidor/dados.ts");
const { criarCookie, exigirLogin } = await import("../src/servidor/sessao.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar } = await import("../src/cadastros/armazem.ts");
const B = await import("../src/servidor/banco.ts");
const { salvarCategoria } = await import("../src/config/categorias.ts");
const { lancar, pedirSaque } = await import("../src/apps/extras.ts");
const C = await import("../src/corridas/index.ts");
const { salvarIntegracaoFinanceira } = await import("../src/config/integracao-financeira.ts");
const { rotasConfig } = await import("../src/config/rotas.ts");
const { rotasCentrais } = await import("../src/centrais/rotas.ts");
const { FUNCOES } = await import("../src/comum/funcoes.ts");

const app = express();
app.use(express.json());
app.post("/teste/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({ ok: true }); });
app.use("/api", exigirLogin);
app.use("/api/config", rotasConfig);
app.use("/api/centrais", rotasCentrais);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => { servidor.closeAllConnections(); servidor.close(); B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

const E = D.criarEmpresa("Cred Um").id, E2 = D.criarEmpresa("Cred Dois").id;
const adm = D.criarUsuario({ email: "adm@cred.test", nome: "Adm", senha: "senha-forte-1", empresaId: E, papel: "admin" });
const ges = D.criarUsuario({ email: "ges@cred.test", nome: "Ges", senha: "senha-forte-1", empresaId: E, papel: "gestor" });
const op = D.criarUsuario({ email: "op@cred.test", nome: "Op", senha: "senha-forte-1", empresaId: E, papel: "operador" });
const adm2 = D.criarUsuario({ email: "adm2@cred.test", nome: "Adm2", senha: "senha-forte-1", empresaId: E2, papel: "admin" });
async function entrar(id: string) {
  const r = await fetch(`${base}/teste/entrar/${id}`, { method: "POST" });
  return (r.headers.get("set-cookie") ?? "").split(";")[0];
}
const cookieAdm = await entrar(adm.id), cookieGes = await entrar(ges.id), cookieOp = await entrar(op.id), cookieAdm2 = await entrar(adm2.id);
async function api(cookie: string, metodo: string, url: string, corpo?: unknown, prefixo = "config") {
  const r = await fetch(`${base}/api/${prefixo}${url}`, { method: metodo, headers: { cookie, "content-type": "application/json" }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  const tipo = r.headers.get("content-type") ?? "";
  return { status: r.status, tipo, texto: tipo.includes("json") ? "" : await r.text(), corpo: (tipo.includes("json") ? await r.json() : {}) as Record<string, any> };
}

salvarCategoria(E, null, { nome: "Pop", taxaBase: 5, precoKm: 2, tarifaMinima: 8, comissaoTipo: "Percentual", comissaoValor: 10 }, "t");
salvarIntegracaoFinanceira(E, { plano: "d1", taxaDe: "motorista" });
const mot = criar(E, cadastroPorId("motoristas")!, { nome: "Rita Rodas", telefone: "11980000001", cidade: "Santos", status: "Ativo" }, "t");

async function corridaPaga(pagamento: string, valor: number, tel: string) {
  const c = await C.criarCorridaPropria(E, { passageiro: { nome: `Pass ${tel}`, telefone: tel }, embarque: { texto: "Rua A, 1" }, destino: { texto: "Rua B, 2" }, categoria: "Pop", pagamento, canal: "painel", distanciaKm: 5 } as never, "t");
  C.atribuirMotorista(E, c.id, mot.id, "t");
  C.mudarStatus(E, c.id, "a_caminho"); C.mudarStatus(E, c.id, "no_local"); C.mudarStatus(E, c.id, "em_andamento");
  C.mudarStatus(E, c.id, "finalizada", { valor });
  return c;
}

test("dados de base: recargas, saque e corridas por cartão", async () => {
  lancar(E, "motorista", mot.id, 30, "Recarga Pix 30", "mercado pago");
  lancar(E, "passageiro", "11911110001", 20, "Recarga Pix 20", "mercado pago");
  lancar(E, "motorista", mot.id, 100, "Crédito manual", "adm@cred.test");
  lancar(E, "motorista", mot.id, -10, "Débito manual", "adm@cred.test");
  pedirSaque(E, mot.id, "Rita Rodas", 50, "rita@pix.test");
  await corridaPaga("Cartão no App", 60, "11911110002");
  await corridaPaga("Maquininha de Crédito", 30, "11911110003");
  await corridaPaga("Dinheiro", 25, "11911110004");
});

test("Recargas e Saques: recargas Pix e manuais de motoristas e passageiros mais o pedido de saque", async () => {
  const r = await api(cookieGes, "GET", "/creditos/recargas-saques?periodo=hoje");
  assert.equal(r.status, 200);
  assert.equal(r.corpo.recargas.valor, 150, "30 + 20 + 100 (débito manual não é recarga)");
  assert.equal(r.corpo.recargas.pix, 50);
  assert.equal(r.corpo.recargas.manual, 100);
  assert.equal(r.corpo.saques.pendente, 50);
  assert.equal(r.corpo.saques.qtdPendentes, 1);
  assert.equal(r.corpo.itens.filter((i: any) => i.tipo === "Saque").length, 1);
  const so = (await api(cookieGes, "GET", "/creditos/recargas-saques?periodo=hoje&tipo=saque")).corpo;
  assert.deepEqual(so.itens.map((i: any) => i.tipo), ["Saque"]);
  const pass = (await api(cookieGes, "GET", "/creditos/recargas-saques?periodo=hoje&papel=passageiro")).corpo;
  assert.equal(pass.recargas.valor, 20);
  assert.equal(pass.saques.qtd, 0, "passageiro não tem saque");
  const busca = (await api(cookieGes, "GET", "/creditos/recargas-saques?periodo=hoje&busca=rita")).corpo;
  assert.ok(busca.itens.length >= 1 && busca.itens.every((i: any) => /rita/i.test(i.pessoa)));
});

test("Recargas e Saques: aprovar saque (admin) usa a rota existente, gestor não aprova", async () => {
  const id = (await api(cookieGes, "GET", "/creditos/recargas-saques?periodo=hoje&tipo=saque")).corpo.itens[0].saqueId;
  assert.equal((await api(cookieGes, "POST", `/saques/${id}/pagar`, {})).status, 403);
  assert.equal((await api(cookieAdm, "POST", `/saques/${id}/pagar`, {})).status, 200);
  const r = (await api(cookieGes, "GET", "/creditos/recargas-saques?periodo=hoje&situacao=Pago")).corpo;
  assert.equal(r.saques.pago, 50);
});

test("Recargas e Saques: CSV com proteção e cabeçalho de download", async () => {
  const r = await api(cookieGes, "GET", "/creditos/recargas-saques/csv?periodo=hoje");
  assert.equal(r.status, 200);
  assert.ok(r.tipo.includes("text/csv"));
  assert.ok(r.texto.includes("Data e hora;Tipo;Papel;Pessoa"));
  assert.ok(r.texto.includes("Saque"));
});

test("Extrato: filtros por pessoa, tipo e período, totais e CSV", async () => {
  const todos = (await api(cookieGes, "GET", "/creditos/extrato?periodo=hoje")).corpo;
  assert.equal(todos.entradas, 150 + 0, "30 + 20 + 100");
  assert.equal(todos.saidas, 60, "débito manual 10 + saque pago 50");
  const pix = (await api(cookieGes, "GET", "/creditos/extrato?periodo=hoje&tipo=pix")).corpo;
  assert.equal(pix.total, 2);
  const pessoa = (await api(cookieGes, "GET", "/creditos/extrato?periodo=hoje&busca=rita&papel=motorista")).corpo;
  assert.ok(pessoa.total >= 3 && pessoa.itens.every((i: any) => i.papel === "motorista"));
  const antigo = (await api(cookieGes, "GET", "/creditos/extrato?periodo=ontem")).corpo;
  assert.equal(antigo.total, 0);
  const csv = await api(cookieGes, "GET", "/creditos/extrato/csv?periodo=hoje&tipo=manual");
  assert.ok(csv.tipo.includes("text/csv"));
  assert.ok(csv.texto.includes("Crédito manual") && csv.texto.includes("Débito manual") && !csv.texto.includes("Recarga Pix"));
});

test("Painel de Controle do cartão: app com taxa do plano, maquininha sem taxa, dinheiro fora", async () => {
  const r = (await api(cookieGes, "GET", "/cartao/painel?periodo=hoje")).corpo;
  assert.equal(r.app.qtd, 1);
  assert.equal(r.app.bruto, 60);
  assert.equal(r.app.taxa, 2.99, "4,99% de 60");
  assert.equal(r.app.liquido, 57.01);
  assert.equal(r.maquininha.bruto, 30);
  assert.equal(r.total, 90);
  assert.equal(r.porStatus.find((s: any) => s.status === "Pago").qtd, 2);
  assert.equal(r.repasses.aRepassar, 57.01, "repasse em 1 dia: ainda a repassar hoje");
  assert.equal(r.repasses.repassado, 0);
  assert.equal(r.taxa.percentual, 4.99);
});

test("Transações do cartão: filtros por origem e status e CSV", async () => {
  const t = (await api(cookieGes, "GET", "/cartao/transacoes?periodo=hoje")).corpo;
  assert.equal(t.total, 2);
  assert.equal(t.bruto, 90);
  assert.equal(t.taxas, 2.99);
  const app = (await api(cookieGes, "GET", "/cartao/transacoes?periodo=hoje&origem=App")).corpo;
  assert.equal(app.total, 1);
  assert.equal(app.itens[0].forma, "Cartão no App");
  const maq = (await api(cookieGes, "GET", "/cartao/transacoes?periodo=hoje&origem=Maquininha&repasse=todos")).corpo;
  assert.equal(maq.itens[0].taxa, 0);
  assert.equal((await api(cookieGes, "GET", "/cartao/transacoes?periodo=hoje&status=Chargeback")).corpo.total, 0);
  const csv = await api(cookieGes, "GET", "/cartao/transacoes/csv?periodo=hoje");
  assert.ok(csv.tipo.includes("text/csv") && csv.texto.includes("Cartão no App") && csv.texto.includes("Maquininha de Crédito"));
});

test("Saldo da Central: usa o extrato da central e o cartão a repassar", async () => {
  const r = (await api(cookieGes, "GET", "/cartao/saldo-central?periodo=hoje")).corpo;
  assert.equal(typeof r.saldoAtual, "number");
  assert.equal(r.aReceber, 57.01);
  assert.equal(r.repassado, 0);
  assert.equal(r.totalSaidas, 50, "saque pago");
  assert.ok(Array.isArray(r.movimentos) && r.movimentos.length >= 1);
});

test("Saldo do Motorista: saldo da carteira, saque pendente e cartão, com busca", async () => {
  const r = (await api(cookieGes, "GET", "/cartao/saldo-motorista?periodo=hoje")).corpo;
  const rita = r.itens.find((i: any) => i.nome === "Rita Rodas");
  assert.ok(rita);
  assert.equal(rita.saldo, 70, "30 + 100 - 10 - 50 (saque pago)");
  assert.equal(rita.cartaoARepassar, 57.01);
  assert.equal(rita.saquePendente, 0);
  assert.equal((await api(cookieGes, "GET", "/cartao/saldo-motorista?periodo=hoje&busca=zzzz")).corpo.total, 0);
  const csv = await api(cookieGes, "GET", "/cartao/saldo-motorista/csv?periodo=hoje");
  assert.ok(csv.texto.includes("Rita Rodas"));
});

test("cargo mínimo: operador não acessa nenhuma tela nova; outra empresa não enxerga os dados", async () => {
  for (const u of ["/creditos/recargas-saques", "/creditos/extrato", "/cartao/painel", "/cartao/transacoes", "/cartao/saldo-central", "/cartao/saldo-motorista", "/creditos/extrato/csv", "/cartao/transacoes/csv"]) {
    assert.equal((await api(cookieOp, "GET", `${u}?periodo=hoje`)).status, 403, u);
    assert.equal((await api(cookieGes, "GET", `${u}?periodo=hoje`)).status, 200, u);
  }
  assert.equal((await api(cookieOp, "GET", "/ultimo-boleto", undefined, "centrais")).status, 403);
  const o = (await api(cookieAdm2, "GET", "/cartao/transacoes?periodo=hoje")).corpo;
  assert.equal(o.total, 0);
  assert.equal((await api(cookieAdm2, "GET", "/creditos/extrato?periodo=hoje")).corpo.total, 0);
  assert.equal((await api(cookieAdm2, "GET", "/cartao/saldo-motorista?periodo=hoje")).corpo.total, 0);
});

test("Último boleto: competência do mês anterior, vencimento previsto, não emitido", async () => {
  const r = await api(cookieGes, "GET", "/ultimo-boleto", undefined, "centrais");
  assert.equal(r.status, 200);
  const hoje = new Date(Date.now() - 3 * 3600_000), anterior = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  assert.equal(r.corpo.competencia, anterior);
  assert.equal(r.corpo.status, "Não emitido");
  assert.equal(r.corpo.emitido, false);
  assert.equal(r.corpo.linhaDigitavel, null);
  assert.equal(r.corpo.vencimentoPrevisto, true);
  assert.match(r.corpo.vencimento, /^\d{4}-\d{2}-10$/);
  assert.ok(r.corpo.vencimento.slice(0, 7) > anterior);
  const dem = (await api(cookieGes, "GET", `/demonstrativo?competencia=${anterior}`, undefined, "centrais")).corpo;
  assert.equal(r.corpo.valor, dem.totalAPagar, "valor igual ao do Demonstrativo Mensal");
  assert.equal((await api(cookieGes, "GET", "/ultimo-boleto?central=inexistente", undefined, "centrais")).status, 404);
});

test("menu: ids, nomes, seções e cargo das telas novas", () => {
  const por = (id: string) => FUNCOES.find((f) => f.id === id)!;
  const esperado: Array<[string, string, string | undefined, string]> = [
    ["creditos-recargas-saques", "Financeiro", "Créditos", "Recargas e Saques"], ["creditos-extrato", "Financeiro", "Créditos", "Extrato"],
    ["cartao-painel", "Financeiro", "Cartão", "Painel de Controle"], ["cartao-transacoes", "Financeiro", "Cartão", "Transações"],
    ["cartao-saldo-central", "Financeiro", "Cartão", "Saldo da Central"], ["cartao-saldo-motorista", "Financeiro", "Cartão", "Saldo do Motorista"],
    ["ultimo-boleto", "Cobrança", undefined, "Último boleto"],
  ];
  for (const [id, grupo, secao, nome] of esperado) {
    const f = por(id);
    assert.ok(f, id);
    assert.equal(f.grupo, grupo); assert.equal(f.secao, secao); assert.equal(f.nome, nome); assert.equal(f.minimo, "gestor"); assert.equal(f.rota, `/${id}`);
  }
});
