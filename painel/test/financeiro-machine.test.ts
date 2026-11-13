// Visão geral do financeiro, Extrato da central e Extrato de transações online (formato da Machine).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-finmachine-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "d".repeat(40);
delete process.env.BANCO_ARQUIVO;
delete process.env.OSRM_URL;

const express = (await import("express")).default;
const D = await import("../src/servidor/dados.ts");
const { criarCookie, exigirLogin } = await import("../src/servidor/sessao.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar } = await import("../src/cadastros/armazem.ts");
const B = await import("../src/servidor/banco.ts");
const { salvarCategoria } = await import("../src/config/categorias.ts");
const { lancar, pedirSaque, resolverSaque } = await import("../src/apps/extras.ts");
const C = await import("../src/corridas/index.ts");
const V = await import("../src/config/financeiro-visao.ts");
const { periodo } = await import("../src/config/financeiro.ts");
const { rotasConfig } = await import("../src/config/rotas.ts");

const app = express();
app.use(express.json());
app.post("/teste/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({ ok: true }); });
app.use("/api", exigirLogin);
app.use("/api/config", rotasConfig);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => { servidor.closeAllConnections(); servidor.close(); B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

const E = D.criarEmpresa("Fin Um").id, E2 = D.criarEmpresa("Fin Dois").id;
const adm = D.criarUsuario({ email: "adm@fin.test", nome: "Adm", senha: "senha-forte-1", empresaId: E, papel: "admin" });
const op = D.criarUsuario({ email: "op@fin.test", nome: "Op", senha: "senha-forte-1", empresaId: E, papel: "operador" });
async function entrar(id: string) {
  const r = await fetch(`${base}/teste/entrar/${id}`, { method: "POST" });
  return (r.headers.get("set-cookie") ?? "").split(";")[0];
}
const cookieAdm = await entrar(adm.id), cookieOp = await entrar(op.id);
async function api(cookie: string, metodo: string, url: string, corpo?: unknown) {
  const r = await fetch(`${base}/api/config${url}`, { method: metodo, headers: { cookie, "content-type": "application/json" }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  const tipo = r.headers.get("content-type") ?? "";
  return { status: r.status, tipo, texto: tipo.includes("json") ? "" : await r.text(), corpo: (tipo.includes("json") ? await r.json() : {}) as Record<string, any> };
}

const hoje = periodo("hoje").inicio;
const MOT = cadastroPorId("motoristas")!;
salvarCategoria(E, null, { nome: "Pop", taxaBase: 5, precoKm: 2, tarifaMinima: 8, comissaoTipo: "Percentual", comissaoValor: 10 }, "t");
const mot = criar(E, MOT, { nome: "Rita Rodas", telefone: "11980000001", status: "Ativo" }, "t");

async function corridaPaga(pagamento: string, valor: number, tel: string, nome = `Pass ${tel}`) {
  const c = await C.criarCorridaPropria(E, { passageiro: { nome, telefone: tel }, embarque: { texto: "Rua A, 1" }, destino: { texto: "Rua B, 2" }, categoria: "Pop", pagamento, canal: "painel", distanciaKm: 5 } as never, "t");
  C.atribuirMotorista(E, c.id, mot.id, "t");
  C.mudarStatus(E, c.id, "a_caminho"); C.mudarStatus(E, c.id, "no_local"); C.mudarStatus(E, c.id, "em_andamento");
  C.mudarStatus(E, c.id, "finalizada", { valor });
  return c;
}

test("CSV: células que começam com = + - @ ganham apóstrofo; números ficam como números", () => {
  assert.equal(V.celulaCsv("=1+1"), "'=1+1");
  assert.equal(V.celulaCsv("+55 11 9"), "'+55 11 9");
  assert.equal(V.celulaCsv("-cmd"), "'-cmd");
  assert.equal(V.celulaCsv("@SOMA(A1)"), "'@SOMA(A1)");
  assert.equal(V.celulaCsv("Ana; Maria"), '"Ana; Maria"');
  assert.equal(V.celulaCsv(-9.88), "-9,88");
  const csv = V.montarCsv(["a", "b"], [["=HYPERLINK(\"x\")", 1.5]]);
  assert.ok(csv.startsWith("﻿"));
  assert.ok(csv.includes("\"'=HYPERLINK(\"\"x\"\")\";1,5"));
});

test("períodos novos: últimos 7 e 30 dias, e o período anterior tem o mesmo tamanho", () => {
  const p7 = periodo("ultimos_7");
  assert.equal(p7.fim, hoje);
  assert.equal(V.diasDoPeriodo(p7).length, 7);
  assert.equal(V.diasDoPeriodo(periodo("ultimos_30")).length, 30);
  const ant = V.periodoAnterior({ inicio: "2026-11-08", fim: "2026-11-14" });
  assert.deepEqual(ant, { inicio: "2026-11-01", fim: "2026-11-07" });
  assert.equal(V.variacao(110, 100), 10);
  assert.equal(V.variacao(0, 0), 0);
  assert.equal(V.variacao(5, 0), null);
});

test("visão geral: corridas, recargas Pix, saques e variação, sempre por empresa", async () => {
  await corridaPaga("Pix", 40, "11911110001");
  await corridaPaga("Cartão no App", 60, "11911110002");
  await corridaPaga("Dinheiro", 25, "11911110003");
  lancar(E, "motorista", mot.id, 30, "Recarga Pix 30", "mercado pago");
  lancar(E, "passageiro", "11911110001", 20, "Recarga Pix 20", "mercado pago");
  lancar(E, "motorista", mot.id, 100, "Crédito manual", "adm@fin.test"); // manual não conta como Pix
  lancar(E, "motorista", mot.id, 200, "Ajuste", "sistema");
  pedirSaque(E, mot.id, "Rita Rodas", 50, "rita@pix.test");
});

test("visão geral: números do dia", async () => {
  const r = await api(cookieAdm, "GET", "/visao-geral?periodo=hoje");
  assert.equal(r.status, 200);
  const v = r.corpo;
  assert.equal(v.faturamento.valor, 125, "40 + 60 + 25 finalizadas");
  assert.equal(v.faturamento.corridas, 3);
  assert.equal(v.ganhosLiquidos.valor, 12.5, "10% de 125");
  assert.equal(v.recargasPix.total, 50);
  assert.equal(v.recargasPix.motoristas, 30);
  assert.equal(v.recargasPix.passageiros, 20);
  assert.equal(v.corridasApp.pix, 40);
  assert.equal(v.corridasApp.cartao, 60);
  assert.equal(v.corridasApp.total, 100, "dinheiro não entra");
  assert.equal(v.totalRecebido.valor, 150);
  assert.equal(v.saques.total, 0, "saque ainda pendente");
  assert.equal(v.proximoRepasse, 50);
  assert.equal(v.faturamento.variacao, null, "ontem não teve corridas");
  assert.equal(v.recargasPix.serie.length, 1);
});

test("visão geral: saque pago entra nos saques, na tendência e sai do próximo repasse", async () => {
  const saque = (await import("../src/apps/extras.ts")).saques(E)[0];
  resolverSaque(E, saque.id, true, "adm@fin.test");
  const v = (await api(cookieAdm, "GET", "/visao-geral?periodo=ultimos_7")).corpo;
  assert.equal(v.saques.total, 50);
  assert.equal(v.saques.qtd, 1);
  assert.equal(v.proximoRepasse, 0);
  assert.equal(v.saques.serie.length, 7);
  assert.equal(v.saques.serie.at(-1).acumulado, 50);
  // outra empresa não enxerga nada
  const outro = D.criarUsuario({ email: "adm2@fin.test", nome: "Adm2", senha: "senha-forte-1", empresaId: E2, papel: "admin" });
  const v2 = (await api(await entrar(outro.id), "GET", "/visao-geral?periodo=ultimos_7")).corpo;
  assert.equal(v2.faturamento.valor, 0);
  assert.equal(v2.saques.total, 0);
});

test("exportar: CSV da visão geral com cabeçalho de download e total", async () => {
  const r = await api(cookieAdm, "GET", "/visao-geral/csv?periodo=hoje");
  assert.equal(r.status, 200);
  assert.ok(r.tipo.includes("text/csv"));
  assert.ok(r.texto.includes("Recargas Pix motoristas"));
  assert.ok(r.texto.includes("TOTAL;30;20;60;40;50;1"));
});

test("extrato da central: entradas, saídas, saldo e pedido de recarga (só registra)", async () => {
  let e = (await api(cookieAdm, "GET", "/extrato-central?periodo=hoje")).corpo;
  assert.equal(e.totalEntradas, 62.5, "comissão 12,50 + recargas Pix 50");
  assert.equal(e.totalSaidas, 50, "saque pago");
  assert.equal(e.saldoInicial, 0);
  assert.equal(e.saldoFinal, 12.5);
  assert.equal(e.saldoAtual, 12.5);
  assert.equal(e.dias.length, 1);
  assert.ok(e.dias[0].movimentos.some((m: any) => /Comissão da central/.test(m.descricao) && /Qtde: 3/.test(m.descricao)));

  assert.equal((await api(cookieOp, "POST", "/extrato-central/recargas", { valor: 100 })).status, 403, "operador não pede recarga");
  assert.equal((await api(cookieAdm, "POST", "/extrato-central/recargas", { valor: 0 })).status, 400);
  const pedido = await api(cookieAdm, "POST", "/extrato-central/recargas", { valor: 100, observacao: "Pix do financeiro <b>" });
  assert.equal(pedido.status, 201);
  assert.equal(pedido.corpo.pedido.situacao, "Solicitado");
  assert.ok(!pedido.corpo.pedido.observacao.includes("<"));
  e = (await api(cookieOp, "GET", "/extrato-central?periodo=hoje")).corpo; // operador lê, como no resto do financeiro
  assert.equal(e.saldoAtual, 12.5, "pedido ainda não é entrada");
  assert.equal(e.aguardando, 100);

  assert.equal((await api(cookieAdm, "POST", `/extrato-central/recargas/${pedido.corpo.pedido.id}/confirmar`, {})).status, 200);
  assert.equal((await api(cookieAdm, "POST", `/extrato-central/recargas/${pedido.corpo.pedido.id}/cancelar`, {})).status, 400, "já resolvido");
  e = (await api(cookieAdm, "GET", "/extrato-central?periodo=hoje")).corpo;
  assert.equal(e.saldoAtual, 112.5);
  assert.equal(e.aguardando, 0);
});

test("extrato da central: saldo inicial vem dos dias anteriores", async () => {
  const e = (await api(cookieAdm, "GET", `/extrato-central?periodo=personalizado&inicio=${hoje}&fim=${hoje}`)).corpo;
  assert.equal(e.saldoInicial, 0);
  const amanha = new Date(Date.parse(`${hoje}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const f = (await api(cookieAdm, "GET", `/extrato-central?periodo=personalizado&inicio=${amanha}&fim=${amanha}`)).corpo;
  assert.equal(f.saldoInicial, 112.5, "tudo de hoje vira saldo inicial de amanhã");
  assert.equal(f.dias.length, 0);
});

test("extrato de transações online: tipos, status, repasse, ID e filtros", async () => {
  const todos = (await api(cookieAdm, "GET", "/transacoes-online?periodo=hoje")).corpo;
  const tipos = todos.itens.map((i: any) => i.tipo);
  for (const t of ["Pagamento", "Recarga motorista", "Recarga passageiro", "Saque", "Recarga empresa"]) assert.ok(tipos.includes(t), t);
  assert.equal(todos.totalCorridasRecargas, 40 + 60 + 30 + 20 + 100);
  assert.equal(todos.repassesHoje, 100, "pagamentos do app com repasse hoje");

  const saques = (await api(cookieAdm, "GET", "/transacoes-online?periodo=hoje&tipo=Saque")).corpo.itens;
  assert.equal(saques.length, 1);
  assert.equal(saques[0].valor, -50);
  assert.equal(saques[0].status, "Pago");

  const pag = (await api(cookieAdm, "GET", "/transacoes-online?periodo=hoje&tipo=Pagamento")).corpo.itens;
  assert.equal(pag.length, 2);
  assert.deepEqual(pag.map((i: any) => i.forma).sort(), ["Cartão no app", "Pix"]);
  const alvo = pag.find((i: any) => i.forma === "Pix");
  const porId = (await api(cookieAdm, "GET", `/transacoes-online?periodo=hoje&busca=${alvo.codigo.toLowerCase()}`)).corpo.itens;
  assert.equal(porId.length, 1);
  assert.equal(porId[0].id, alvo.id);
  const rep = (await api(cookieAdm, "GET", `/transacoes-online?periodo=hoje&repasse=${hoje}`)).corpo.itens;
  assert.ok(rep.length >= 2);
  assert.equal((await api(cookieAdm, "GET", "/transacoes-online?periodo=hoje&repasse=2020-01-01")).corpo.itens.length, 0);
});

test("chargeback e estorno: só admin marca, só em transação paga, e dá para desfazer", async () => {
  const pag = (await api(cookieAdm, "GET", "/transacoes-online?periodo=hoje&tipo=Pagamento&busca=Pass")).corpo.itens;
  const cartao = pag.find((i: any) => i.forma === "Cartão no app");
  assert.equal((await api(cookieOp, "POST", `/transacoes-online/${cartao.id}/status`, { status: "Chargeback" })).status, 403);
  assert.equal((await api(cookieAdm, "POST", `/transacoes-online/${cartao.id}/status`, { status: "Cancelado" })).status, 400);
  assert.equal((await api(cookieAdm, "POST", "/transacoes-online/nao-existe/status", { status: "Estornado" })).status, 400);
  const saque = (await api(cookieAdm, "GET", "/transacoes-online?periodo=hoje&tipo=Saque")).corpo.itens[0];
  assert.equal((await api(cookieAdm, "POST", `/transacoes-online/${saque.id}/status`, { status: "Estornado" })).status, 400, "saque tem fluxo próprio");

  assert.equal((await api(cookieAdm, "POST", `/transacoes-online/${cartao.id}/status`, { status: "Chargeback", motivo: "contestação" })).status, 200);
  let cb = (await api(cookieAdm, "GET", "/transacoes-online?periodo=hoje&status=Chargeback")).corpo;
  assert.equal(cb.itens.length, 1);
  assert.equal(cb.itens[0].marcadoPor, "adm@fin.test");
  assert.equal(cb.totalCorridasRecargas, 40 + 30 + 20 + 100, "chargeback sai do total");
  await api(cookieAdm, "POST", `/transacoes-online/${cartao.id}/status`, { status: "Estornado" });
  assert.equal((await api(cookieAdm, "GET", "/transacoes-online?periodo=hoje&status=Estornado")).corpo.itens.length, 1);
  await api(cookieAdm, "POST", `/transacoes-online/${cartao.id}/status`, { status: "Pago" });
  cb = (await api(cookieAdm, "GET", "/transacoes-online?periodo=hoje&status=Chargeback")).corpo;
  assert.equal(cb.itens.length, 0);
});

test("saque recusado aparece como Estornado e recarga de empresa cancelada como Cancelado", async () => {
  lancar(E, "motorista", mot.id, 100, "Ajuste 2", "sistema");
  const s = pedirSaque(E, mot.id, "Rita Rodas", 20, "rita@pix.test");
  const pendente = (await api(cookieAdm, "GET", "/transacoes-online?periodo=hoje&status=Pendente")).corpo;
  assert.equal(pendente.repassesAgendados, -20);
  resolverSaque(E, s.id, false, "adm@fin.test", "chave inválida");
  const est = (await api(cookieAdm, "GET", "/transacoes-online?periodo=hoje&status=Estornado&tipo=Saque")).corpo.itens;
  assert.equal(est.length, 1);
  const p = await api(cookieAdm, "POST", "/extrato-central/recargas", { valor: 10 });
  await api(cookieAdm, "POST", `/extrato-central/recargas/${p.corpo.pedido.id}/cancelar`, {});
  assert.equal((await api(cookieAdm, "GET", "/transacoes-online?periodo=hoje&status=Cancelado")).corpo.itens.length, 1);
});

test("CSV das transações: injeção de fórmula neutralizada nos textos", async () => {
  await corridaPaga("Pix", 15, "11911110099", "=CMD()|' /C calc'!A0");
  const r = await api(cookieAdm, "GET", "/transacoes-online/csv?periodo=hoje");
  assert.equal(r.status, 200);
  assert.ok(r.tipo.includes("text/csv"));
  assert.ok(r.texto.includes("ID da transação") && r.texto.includes("Valor líquido"));
  for (const linha of r.texto.split("\r\n").slice(1)) for (const cel of linha.split(";")) assert.ok(!/^[=+@]/.test(cel) && !/^-[^0-9]/.test(cel), `célula perigosa: ${cel}`);
  assert.ok(r.texto.includes("-50"), "valor negativo continua número");
});
