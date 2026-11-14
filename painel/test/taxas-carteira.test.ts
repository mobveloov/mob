// Taxas da central (motorista e passageiro) aplicadas no repasse e na carteira, e ajuste manual da carteira
// (motivo obrigatório, histórico com quem e quando, sem lançar duas vezes, só admin) lido pelo mesmo saldo do app.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-taxas-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "f".repeat(40);
process.env.APPS_MOSTRAR_CODIGO = "1";
delete process.env.BANCO_ARQUIVO;
delete process.env.OSRM_URL;

const express = (await import("express")).default;
const D = await import("../src/servidor/dados.ts");
const { criarCookie, exigirLogin } = await import("../src/servidor/sessao.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar } = await import("../src/cadastros/armazem.ts");
const R = await import("../src/corridas/index.ts");
const { rotasApps, rotasAppsCentral } = await import("../src/apps/rotas.ts");
const { rotasExtrasCentral, saldo, extrato, ajustarCarteira } = await import("../src/apps/extras.ts");
const { rotasConfig } = await import("../src/config/rotas.ts");
const P = await import("../src/apps/despacho.ts");
const B = await import("../src/servidor/banco.ts");
const { calcularComissao } = await import("../src/config/comissao.ts");
const { sanearFaixas } = await import("../src/config/taxas.ts");
const { valorDaTaxa, simular } = await import("../src/comum/taxas.ts");

const app = express();
app.use(express.json());
app.post("/teste/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({ ok: true }); });
app.use("/api/apps", rotasApps);
app.use("/api", exigirLogin);
app.use("/api/apps-central", rotasAppsCentral);
app.use("/api/apps-central", rotasExtrasCentral);
app.use("/api/config", rotasConfig);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => { servidor.closeAllConnections(); servidor.close(); B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

const E = D.criarEmpresa("Taxas Um").id, E2 = D.criarEmpresa("Taxas Dois").id;
const adm = D.criarUsuario({ email: "adm@taxas.test", nome: "Adm", senha: "senha-forte-1", empresaId: E, papel: "admin" });
const op = D.criarUsuario({ email: "op@taxas.test", nome: "Op", senha: "senha-forte-1", empresaId: E, papel: "operador" });
const CAT = cadastroPorId("categorias")!, MOT = cadastroPorId("motoristas")!, CLI = cadastroPorId("clientes")!;
criar(E, CAT, { nome: "Carro", bandeirada: 20, valorKm: 2, valorMinimo: 20, ativa: true }, "t");
criar(E, CAT, { nome: "Moto", bandeirada: 8, valorKm: 1, ativa: true }, "t");
const mot = criar(E, MOT, { nome: "Pedro Perto", telefone: "11910000001", status: "Ativo", placa: "AAA1A11" }, "t");
criar(E, CLI, { nome: "Paula", telefone: "11920000001", status: "Ativo" }, "t");

async function entrar(id: string) { return ((await fetch(`${base}/teste/entrar/${id}`, { method: "POST" })).headers.get("set-cookie") ?? "").split(";")[0]; }
const cookieAdm = await entrar(adm.id), cookieOp = await entrar(op.id);
async function api(cookie: string, metodo: string, url: string, corpo?: unknown) {
  const r = await fetch(`${base}${url}`, { method: metodo, headers: { cookie, "content-type": "application/json" }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  return { status: r.status, corpo: (await r.json().catch(() => ({}))) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
async function app_(metodo: string, url: string, corpo?: unknown, token?: string) {
  const r = await fetch(base + url, { method: metodo, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  return { status: r.status, corpo: (await r.json().catch(() => ({}))) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
async function loginApp(papel: "passageiro" | "motorista", telefone: string) {
  const c = await app_("POST", `/api/apps/${E}/entrar/codigo`, { papel, telefone });
  const e = await app_("POST", `/api/apps/${E}/entrar`, { papel, telefone, codigo: c.corpo.codigoTeste });
  assert.equal(e.status, 200, JSON.stringify(e.corpo));
  return e.corpo.token as string;
}
const TODAS = ["dinheiro", "debito", "credito", "cartao_app", "pix"];
const taxa = (o: Record<string, unknown>) => ({ nome: "Taxa", quemPaga: "motorista", categorias: ["Carro"], pagamentos: TODAS, faixas: [{ de: 0, ate: null, tipo: "porcentagem", valor: 10 }], ...o });

// ------------------------------------------------------------------ cálculo e validação

test("cálculo: porcentagem, valor fixo, faixas e simulador", () => {
  const faixas = [{ de: 0, ate: 20, tipo: "fixo" as const, valor: 2 }, { de: 20, ate: null, tipo: "porcentagem" as const, valor: 10 }];
  assert.equal(valorDaTaxa(faixas, 10), 2);
  assert.equal(valorDaTaxa(faixas, 20), 2);
  assert.equal(valorDaTaxa(faixas, 50), 5);
  assert.equal(valorDaTaxa([{ de: 0, ate: null, tipo: "fixo", valor: 30 }], 10), 10, "nunca passa do valor da corrida");
  assert.deepEqual(simular("motorista", [{ de: 0, ate: null, tipo: "porcentagem", valor: 50 }], 20), { passageiroPaga: 20, motoristaRecebe: 10, central: 10 });
  assert.deepEqual(simular("passageiro", [{ de: 0, ate: null, tipo: "fixo", valor: 1.5 }], 20), { passageiroPaga: 21.5, motoristaRecebe: 20, central: 1.5 });
});

test("faixas: começam em zero, sem buraco, só a última sem limite, até 10", () => {
  assert.throws(() => sanearFaixas([]), /ao menos uma faixa/);
  assert.throws(() => sanearFaixas([{ de: 5, ate: null, tipo: "fixo", valor: 1 }]), /começa em R\$ 0,00/);
  assert.throws(() => sanearFaixas([{ de: 0, ate: 10, tipo: "fixo", valor: 1 }, { de: 12, ate: null, tipo: "fixo", valor: 1 }]), /igual ao "Até"/);
  assert.throws(() => sanearFaixas([{ de: 0, ate: null, tipo: "fixo", valor: 1 }, { de: 0, ate: null, tipo: "fixo", valor: 1 }]), /só a última/);
  assert.throws(() => sanearFaixas([{ de: 0, ate: null, tipo: "porcentagem", valor: 0 }]), /valor da taxa/);
  const onze = Array.from({ length: 11 }, (_, i) => ({ de: i, ate: i + 1, tipo: "fixo", valor: 1 }));
  assert.throws(() => sanearFaixas(onze), /No máximo 10/);
  assert.equal(sanearFaixas([{ de: "0", ate: "10,5", tipo: "fixo", valor: "1,30" }])[0].valor, 1.3);
});

// ------------------------------------------------------------------ API das taxas

test("API: só admin grava; nome repetido, categoria e pagamento obrigatórios; cada empresa tem as suas", async () => {
  assert.equal((await api(cookieOp, "POST", "/api/config/taxas", taxa({ nome: "Do operador" }))).status, 403);
  assert.equal((await api(cookieOp, "GET", "/api/config/taxas")).status, 200, "o operador consegue ver");
  const a = await api(cookieAdm, "POST", "/api/config/taxas", taxa({ nome: "Taxa APP" }));
  assert.equal(a.status, 200, JSON.stringify(a.corpo));
  assert.equal(a.corpo.taxas[0].atualizadoPor, "adm@taxas.test");
  assert.match((await api(cookieAdm, "POST", "/api/config/taxas", taxa({ nome: "taxa app" }))).corpo.erro, /Já existe/);
  assert.match((await api(cookieAdm, "POST", "/api/config/taxas", taxa({ nome: "Sem cat", categorias: [] }))).corpo.erro, /categoria/);
  assert.match((await api(cookieAdm, "POST", "/api/config/taxas", taxa({ nome: "Sem pag", pagamentos: [] }))).corpo.erro, /forma de pagamento/);
  // editar a mesma (mesmo id) não é nome repetido
  const id = a.corpo.taxas[0].id;
  const ed = await api(cookieAdm, "POST", "/api/config/taxas", taxa({ id, nome: "Taxa APP", faixas: [{ de: 0, ate: null, tipo: "porcentagem", valor: 12 }] }));
  assert.equal(ed.corpo.taxas.length, 1);
  assert.equal(ed.corpo.taxas[0].faixas[0].valor, 12);
  const lista = await api(cookieAdm, "GET", "/api/config/taxas");
  assert.ok(lista.corpo.categorias.includes("Carro"));
  assert.equal(lista.corpo.pagamentos.length, 5);
  assert.equal((await api(cookieOp, "DELETE", `/api/config/taxas/${id}`)).status, 403);
  assert.equal((await api(cookieAdm, "DELETE", `/api/config/taxas/${id}`)).corpo.taxas.length, 0);
  assert.equal((await api(cookieAdm, "DELETE", `/api/config/taxas/${id}`)).status, 400, "já foi removida");
  const outra = D.criarUsuario({ email: "adm2@taxas.test", nome: "Adm2", senha: "senha-forte-1", empresaId: E2, papel: "admin" });
  await api(cookieAdm, "POST", "/api/config/taxas", taxa({ nome: "Só da um" }));
  assert.equal((await api(await entrar(outra.id), "GET", "/api/config/taxas")).corpo.taxas.length, 0, "a outra empresa não vê");
  await api(cookieAdm, "DELETE", `/api/config/taxas/${(await api(cookieAdm, "GET", "/api/config/taxas")).corpo.taxas[0].id}`);
});

// ------------------------------------------------------------------ repasse e carteira

test("comissão: sem taxa vale a da categoria; com taxas do motorista elas substituem, somam e respeitam forma e categoria", async () => {
  assert.equal(calcularComissao(E, "Carro", 100, mot.id, "Pix").taxaCentral, 0, "sem nada configurado: zero");
  await api(cookieAdm, "POST", "/api/config/taxas", taxa({ nome: "Taxa APP" })); // 10%
  await api(cookieAdm, "POST", "/api/config/taxas", taxa({ nome: "Taxa de Serviço", faixas: [{ de: 0, ate: null, tipo: "fixo", valor: 1.3 }], pagamentos: ["pix"] }));
  await api(cookieAdm, "POST", "/api/config/taxas", taxa({ nome: "Taxa Passageiro", quemPaga: "passageiro", faixas: [{ de: 0, ate: null, tipo: "fixo", valor: 1.5 }] }));
  const pix = calcularComissao(E, "Carro", 100, mot.id, "Pix");
  assert.equal(pix.taxaCentral, 11.3);
  assert.equal(pix.valorLiquido, 88.7);
  assert.equal(calcularComissao(E, "Carro", 100, mot.id, "Dinheiro").taxaCentral, 10, "a taxa fixa só vale no Pix");
  assert.equal(calcularComissao(E, "Moto", 100, mot.id, "Pix").taxaCentral, 0, "categoria fora da taxa");
  // Motorista com regra própria não paga as taxas
  const isento = criar(E, MOT, { nome: "Isento", telefone: "11910000003", status: "Ativo", cobranca: "Isento" }, "t");
  assert.equal(calcularComissao(E, "Carro", 100, isento.id, "Pix").taxaCentral, 0);
  // Passageiro: aparece na estimativa
  assert.equal(R.estimarPreco(E, { categoria: "Carro", distanciaKm: 5, minutos: 10, pagamento: "Pix" }).taxaServico, 1.5);
  assert.equal(R.estimarPreco(E, { categoria: "Moto", distanciaKm: 5, minutos: 10, pagamento: "Pix" }).taxaServico, 0);
});

const EMB = { texto: "Rua A, 1", lat: -23.55, lng: -46.63 }, DEST = { texto: "Rua B, 2", lat: -23.58, lng: -46.65 };
async function corridaFinalizada(tp: string, tm: string, pagamento: string, pedidoId: string) {
  const c = await app_("POST", `/api/apps/${E}/corridas`, { pedidoId, embarque: EMB, destino: DEST, categoria: "Carro", pagamento }, tp);
  assert.equal(c.status, 200, JSON.stringify(c.corpo));
  const o = P.ofertaDoMotorista(E, mot.id);
  assert.ok(o, "o motorista recebe a oferta");
  assert.equal((await app_("POST", `/api/apps/${E}/ofertas/${o!.id}/aceitar`, {}, tm)).status, 200);
  for (const s of ["no_local", "em_andamento", "finalizada"]) assert.equal((await app_("POST", `/api/apps/${E}/corridas/${c.corpo.corrida.id}/status`, { status: s }, tm)).status, 200);
  return R.listarProprias(E).find((x) => x.id === c.corpo.corrida.id)!;
}

test("finalizar: taxa do motorista sai da carteira dele; a do passageiro sai de quem recebeu o dinheiro; sem repetir", async () => {
  const tp = await loginApp("passageiro", "11920000001"), tm = await loginApp("motorista", "11910000001");
  assert.equal((await app_("POST", `/api/apps/${E}/online`, { lat: -23.551, lng: -46.631 }, tm)).status, 200);
  const antes = saldo(E, "motorista", mot.id);
  const c = await corridaFinalizada(tp, tm, "Pix", "pedido-taxa-pix-1");
  assert.ok(c.valor && c.valor > 0);
  const lanc = extrato(E, "motorista", mot.id, 20).filter((l) => l.corridaId === c.id);
  const app10 = Math.round(c.valor! * 10) / 10 / 1; // 10%
  const porNome = Object.fromEntries(lanc.map((l) => [l.descricao.split(" · ")[0], l.valor]));
  assert.equal(porNome["Taxa APP"], -Math.round(c.valor! * 10) / 100);
  assert.equal(porNome["Taxa de Serviço"], -1.3);
  assert.equal(porNome["Taxa Passageiro (do passageiro)"], -1.5, "paga em Pix ao motorista: ele deve a taxa do passageiro");
  assert.ok(app10 > 0);
  const depois = saldo(E, "motorista", mot.id);
  assert.equal(Math.round((antes - depois) * 100) / 100, Math.round((Math.round(c.valor! * 10) / 100 + 1.3 + 1.5) * 100) / 100);
  // O app do motorista lê o mesmo saldo
  assert.equal((await app_("GET", `/api/apps/${E}/carteira`, undefined, tm)).corpo.saldo, depois);
  // Chamar de novo não lança outra vez
  const { aposFinalizar } = await import("../src/apps/extras.ts");
  aposFinalizar(E, c);
  assert.equal(saldo(E, "motorista", mot.id), depois);
});

test("finalizar pago com saldo: passageiro paga a corrida e a taxa dele; motorista recebe e paga a taxa do motorista", async () => {
  const tp = await loginApp("passageiro", "11920000001"), tm = await loginApp("motorista", "11910000001");
  ajustarCarteira(E, { papel: "passageiro", chave: "11920000001", valor: 500, motivo: "Recarga de teste", chaveUnica: "recarga-teste-0001", por: "adm@taxas.test" });
  const pAntes = saldo(E, "passageiro", "11920000001"), mAntes = saldo(E, "motorista", mot.id);
  const c = await corridaFinalizada(tp, tm, "Saldo da carteira", "pedido-taxa-saldo-1");
  const taxaMot = Math.round(c.valor! * 10) / 100;
  assert.equal(saldo(E, "passageiro", "11920000001"), Math.round((pAntes - c.valor! - 1.5) * 100) / 100);
  assert.equal(saldo(E, "motorista", mot.id), Math.round((mAntes + c.valor! - taxaMot) * 100) / 100, "a taxa fixa do Pix não vale aqui; a do passageiro não é do motorista");
});

// ------------------------------------------------------------------ carteira: ajuste manual

test("ajuste: motivo obrigatório, só admin, quem e quando no histórico, e o app lê o mesmo saldo", async () => {
  const tm = await loginApp("motorista", "11910000001");
  const url = `/api/config/carteiras/motorista/${mot.id}/ajuste`;
  const base0 = saldo(E, "motorista", mot.id);
  assert.equal((await api(cookieOp, "POST", url, { acao: "adicionar", valor: 10, motivo: "Teste do operador", chaveUnica: "op-0000001" })).status, 403);
  assert.match((await api(cookieAdm, "POST", url, { acao: "adicionar", valor: 10, chaveUnica: "sem-motivo-1" })).corpo.erro, /motivo/);
  assert.match((await api(cookieAdm, "POST", url, { acao: "adicionar", valor: 10, motivo: "abc", chaveUnica: "motivo-curto1" })).corpo.erro, /motivo/);
  assert.match((await api(cookieAdm, "POST", url, { acao: "adicionar", valor: 10, motivo: "Bônus da semana" })).corpo.erro, /identificador/);
  assert.match((await api(cookieAdm, "POST", url, { acao: "adicionar", valor: 0, motivo: "Bônus da semana", chaveUnica: "zero-000001" })).corpo.erro, /Valor inválido/);
  assert.match((await api(cookieAdm, "POST", url, { acao: "adicionar", valor: 20_000, motivo: "Bônus da semana", chaveUnica: "grande-0001" })).corpo.erro, /Valor inválido/);
  assert.equal(saldo(E, "motorista", mot.id), base0, "nada foi lançado nos erros");

  const ok = await api(cookieAdm, "POST", url, { acao: "adicionar", valor: 50, motivo: "Bônus da semana", chaveUnica: "bonus-semana-1" });
  assert.equal(ok.status, 201, JSON.stringify(ok.corpo));
  assert.equal(ok.corpo.lancamento.por, "adm@taxas.test");
  assert.ok(Date.parse(ok.corpo.lancamento.em) > 0);
  assert.equal(ok.corpo.saldo, base0 + 50);
  // o app do motorista vê o mesmo saldo e o lançamento
  const noApp = await app_("GET", `/api/apps/${E}/carteira`, undefined, tm);
  assert.equal(noApp.corpo.saldo, base0 + 50);
  assert.ok(noApp.corpo.extrato.some((l: { descricao: string; valor: number }) => l.descricao === "Bônus da semana" && l.valor === 50));
  // histórico no painel: quem e quando
  const hist = await api(cookieAdm, "GET", `/api/config/carteiras/motorista/${mot.id}?periodo=mes`);
  const l = hist.corpo.transacoes.find((t: { descricao: string }) => t.descricao === "Bônus da semana");
  assert.ok(l && l.por === "adm@taxas.test" && l.em);

  // débito reduz o saldo no app
  const deb = await api(cookieAdm, "POST", url, { acao: "remover", valor: 20, motivo: "Multa por atraso", chaveUnica: "multa-atraso-1" });
  assert.equal(deb.status, 201);
  assert.equal((await app_("GET", `/api/apps/${E}/carteira`, undefined, tm)).corpo.saldo, base0 + 30);
  assert.match((await api(cookieAdm, "POST", url, { acao: "remover", valor: 99_999, motivo: "Muito grande", chaveUnica: "grande-0002" })).corpo.erro, /Valor inválido/);
  assert.match((await api(cookieAdm, "POST", url, { acao: "remover", valor: 9_000, motivo: "Mais que o saldo", chaveUnica: "maior-saldo-1" })).corpo.erro, /saldo não cobre/);
});

test("ajuste: clique duplo e pedidos ao mesmo tempo lançam uma vez só", async () => {
  const url = `/api/config/carteiras/passageiro/11920000001/ajuste`;
  const antes = saldo(E, "passageiro", "11920000001");
  const corpo = { acao: "adicionar", valor: 25, motivo: "Recarga por Pix", chaveUnica: "duplo-clique-1" };
  const r = await Promise.all([api(cookieAdm, "POST", url, corpo), api(cookieAdm, "POST", url, corpo), api(cookieAdm, "POST", url, corpo)]);
  assert.deepEqual(r.map((x) => x.status).sort(), [200, 200, 201]);
  assert.equal(saldo(E, "passageiro", "11920000001"), antes + 25);
  assert.equal(r.filter((x) => x.corpo.repetido).length, 2);
  assert.equal(new Set(r.map((x) => x.corpo.lancamento.id)).size, 1, "todos devolvem o mesmo lançamento");
  // a mesma chave com outro valor é recusada
  assert.match((await api(cookieAdm, "POST", url, { ...corpo, valor: 26 })).corpo.erro, /já foi usado/);
  assert.equal(saldo(E, "passageiro", "11920000001"), antes + 25);
  // o app do passageiro vê o saldo novo
  const tp = await loginApp("passageiro", "11920000001");
  assert.equal((await app_("GET", `/api/apps/${E}/carteira`, undefined, tp)).corpo.saldo, antes + 25);
});

test("ajuste: rota antiga /apps-central/carteiras/lancar segue as mesmas regras; pessoa inexistente e outra empresa são recusadas", async () => {
  const lancar = (cookie: string, corpo: unknown) => api(cookie, "POST", "/api/apps-central/carteiras/lancar", corpo);
  assert.equal((await lancar(cookieOp, { papel: "passageiro", chave: "11920000001", valor: 5, motivo: "Teste operador", chaveUnica: "antiga-op-01" })).status, 403);
  assert.match((await lancar(cookieAdm, { papel: "passageiro", chave: "11920000001", valor: 5, descricao: "", chaveUnica: "antiga-sem-1" })).corpo.erro, /motivo/);
  const ok = await lancar(cookieAdm, { papel: "passageiro", chave: "(11) 92000-0001", valor: 5, motivo: "Cortesia de boas-vindas", chaveUnica: "antiga-ok-001" });
  assert.equal(ok.status, 201, JSON.stringify(ok.corpo));
  assert.match((await lancar(cookieAdm, { papel: "passageiro", chave: "11999999999", valor: 5, motivo: "Não existe", chaveUnica: "antiga-nao-01" })).corpo.erro, /não encontrado/);
  assert.match((await lancar(cookieAdm, { papel: "motorista", chave: "id-que-nao-existe", valor: 5, motivo: "Não existe", chaveUnica: "antiga-nao-02" })).corpo.erro, /não encontrado/);
  const outra = D.criarUsuario({ email: "adm3@taxas.test", nome: "Adm3", senha: "senha-forte-1", empresaId: E2, papel: "admin" });
  assert.match((await lancar(await entrar(outra.id), { papel: "motorista", chave: mot.id, valor: 5, motivo: "Outra empresa", chaveUnica: "antiga-out-01" })).corpo.erro, /não encontrado/);
});
