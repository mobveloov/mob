// Pendências do painel (Machine): desconto da empresa por forma de pagamento, observação da empresa para o motorista,
// trava de OS paga e "Editar OS" aplicando taxas e carteira, comissão da categoria na carteira sem dupla cobrança
// e taxa de serviço do passageiro na API dos apps e no recibo. Sem rede e sem chaves.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-pendencias-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "p".repeat(40);
delete process.env.BANCO_ARQUIVO;
delete process.env.OSRM_URL;

const express = (await import("express")).default;
const D = await import("../src/servidor/dados.ts");
const B = await import("../src/servidor/banco.ts");
const { criarCookie, exigirLogin } = await import("../src/servidor/sessao.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar, alterarCampos } = await import("../src/cadastros/armazem.ts");
const R = await import("../src/corridas/index.ts");
const P = await import("../src/apps/despacho.ts");
const X = await import("../src/apps/extras.ts");
const { salvarTaxa, removerTaxa, taxas } = await import("../src/config/taxas.ts");
const { rotasOperacao } = await import("../src/operacao/rotas.ts");
const S = await import("../src/operacao/servico.ts");

const app = express();
app.use(express.json());
app.post("/teste/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({ ok: true }); });
app.use("/api", exigirLogin);
app.use("/api/operacao", rotasOperacao);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => { servidor.closeAllConnections(); servidor.close(); B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

const E = D.criarEmpresa("Pendencias Um").id;
const adm = D.criarUsuario({ email: "adm@pend.test", nome: "Adm", senha: "senha-forte-1", empresaId: E, papel: "admin" });
const cookie = ((await fetch(`${base}/teste/entrar/${adm.id}`, { method: "POST" })).headers.get("set-cookie") ?? "").split(";")[0];
async function api(metodo: string, url: string, corpo?: unknown) {
  const r = await fetch(base + url, { method: metodo, headers: { cookie, "content-type": "application/json" }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  return { status: r.status, corpo: (await r.json().catch(() => ({}))) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const CAT = cadastroPorId("categorias")!, MOT = cadastroPorId("motoristas")!;
// Tarifa simples: R$ 20 de bandeirada + R$ 2 por km, mínimo R$ 20; a central fica com 10% (comissão da categoria).
criar(E, CAT, { nome: "Carro", bandeirada: 20, valorKm: 2, valorMinimo: 20, ativa: true, comissaoTipo: "Percentual", comissaoValor: 10 }, "t");
const mot = criar(E, MOT, { nome: "Pedro Perto", telefone: "11910000001", status: "Ativo", placa: "AAA1A11" }, "t");
criar(E, cadastroPorId("conveniadas")!, {
  nome: "Acme Ltda", cnpj: null, status: "Ativa", obsMotorista: "Entrar pela portaria B e pedir o crachá.",
  pagamentosPermitidos: JSON.stringify([{ tipo: "Pix", desconto: 10 }, { tipo: "Dinheiro", desconto: 0 }]),
}, "t");
criar(E, cadastroPorId("conveniadas")!, { nome: "Sem Obs Ltda", cnpj: null, status: "Ativa" }, "t");

const EMB = { texto: "Rua A, 1", lat: -23.55, lng: -46.63 }, DEST = { texto: "Rua B, 2", lat: -23.58, lng: -46.65 };
let tel = 0;
const pedir = (extra: Record<string, unknown> = {}) => R.criarCorridaPropria(E, {
  passageiro: { nome: "Paula", telefone: `1192000${String(++tel).padStart(4, "0")}` }, embarque: EMB, destino: DEST,
  categoria: "Carro", pagamento: "Pix", canal: "painel", distanciaKm: 10, ...extra,
} as never, "t");
async function finalizar(id: string, valor: number, motoristaId = mot.id) {
  await R.atribuirMotorista(E, id, motoristaId, "t");
  await R.mudarStatus(E, id, "no_local"); await R.mudarStatus(E, id, "em_andamento");
  return R.mudarStatus(E, id, "finalizada", { valor });
}
const lancamentos = (os: string) => X.extrato(E, "motorista", mot.id, 200).filter((l) => l.descricao.includes(`OS ${os}`));
const somaDe = (os: string) => Math.round(lancamentos(os).reduce((s, l) => s + l.valor, 0) * 100) / 100;

// ------------------------------------------------------------------ 3. desconto da empresa por forma de pagamento

test("desconto da empresa: entra no preço da corrida só na forma de pagamento que tem desconto", async () => {
  const pix = await pedir({ empresaConveniada: "Acme Ltda", pagamento: "Pix" });
  assert.equal(pix.estimativa.valor, 40);
  assert.deepEqual(pix.descontoEmpresa, { pct: 10, valor: 4 });
  assert.equal(pix.desconto, 4);
  const dinheiro = await pedir({ empresaConveniada: "Acme Ltda", pagamento: "Dinheiro" });
  assert.equal(dinheiro.desconto, null, "Dinheiro está com 0%");
  assert.equal(dinheiro.descontoEmpresa, undefined);
  const outraEmpresa = await pedir({ empresaConveniada: "Sem Obs Ltda", pagamento: "Pix" });
  assert.equal(outraEmpresa.desconto, null);
  const semEmpresa = await pedir({ pagamento: "Pix" });
  assert.equal(semEmpresa.desconto, null);
  // O valor final já sai com o desconto.
  const feita = await finalizar(pix.id, pix.estimativa.valor!);
  assert.equal(feita.valor, 36);
  // A corrida de um passageiro cadastrado na empresa também ganha o desconto.
  criar(E, cadastroPorId("clientes")!, { nome: "Corporativa", telefone: "11933330000", conveniada: "Acme Ltda", status: "Ativo" }, "t");
  const doCadastro = await pedir({ passageiro: { nome: "Corporativa", telefone: "11933330000" }, pagamento: "Pix" });
  assert.equal(doCadastro.empresaConveniada, "Acme Ltda");
  assert.equal(doCadastro.desconto, 4);
  // Pelo painel (Solicitar) a resposta traz o desconto.
  const r = await api("POST", "/api/operacao/solicitar", { passageiro: { nome: "Via Painel", telefone: "11944440000" }, embarque: EMB, destino: DEST, categoria: "Carro", pagamento: "Pix", empresaConveniada: "Acme Ltda" });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(r.corpo.corrida.descontoEmpresa.pct, 10);
});

// ------------------------------------------------------------------ 4. observação da empresa para o motorista

test("observação da empresa: o app do motorista recebe na corrida e na chamada; o do passageiro não", async () => {
  const c = await pedir({ empresaConveniada: "Acme Ltda" });
  assert.equal(P.corridaParaApp(E, c, "motorista").obsEmpresa, "Entrar pela portaria B e pedir o crachá.");
  assert.equal("obsEmpresa" in P.corridaParaApp(E, c, "passageiro"), false, "o passageiro não vê a observação interna");
  P.ficarOnline(E, mot.id, -23.551, -46.631);
  P.despachar(E);
  const o = P.ofertaDoMotorista(E, mot.id);
  assert.ok(o, "o motorista recebeu a chamada");
  const paraApp = P.ofertaParaApp(E, o!)!;
  assert.equal(paraApp.obsEmpresa, "Entrar pela portaria B e pedir o crachá.");
  assert.equal(paraApp.corrida.obsEmpresa, "Entrar pela portaria B e pedir o crachá.");
  P.ficarOffline(E, mot.id);
  await R.cancelarCorrida(E, c.id, "Passageiro", "teste", "t");
  const sem = await pedir({ empresaConveniada: "Sem Obs Ltda" });
  assert.equal(P.corridaParaApp(E, sem, "motorista").obsEmpresa, "");
  assert.equal(P.corridaParaApp(E, await pedir(), "motorista").obsEmpresa, "", "sem empresa");
});

// ------------------------------------------------------------------ 5. trava de OS paga e "Editar OS" aplicando a carteira

test("trava de OS paga: vale no Editar OS do Histórico e nas Programadas, no servidor", async () => {
  const paga = await pedir({ pagamento: "Cartão no App" });
  const r1 = await api("PUT", `/api/operacao/corridas/${paga.id}`, { valorInicial: 50 });
  assert.equal(r1.status, 400);
  assert.match(r1.corpo.erro, /não podem ser alteradas/);
  const carteira = await pedir({ pagamento: "Saldo da carteira" });
  assert.match((await api("PUT", `/api/operacao/corridas/${carteira.id}`, { nome: "Outro Nome" })).corpo.erro, /não podem ser alteradas/);
  // Trocar uma OS comum para "Cartão no App" também é recusado.
  const comum = await pedir({ pagamento: "Dinheiro" });
  assert.match((await api("PUT", `/api/operacao/corridas/${comum.id}`, { pagamento: "Cartão no App" })).corpo.erro, /não podem ser alteradas/);
  assert.equal((await api("PUT", `/api/operacao/corridas/${comum.id}`, { nome: "Nome Novo" })).status, 200, "OS comum continua editável");
  const quando = new Date(Date.now() - 3 * 3600_000 + 3 * 86400_000).toISOString().slice(0, 16);
  const prog = await pedir({ pagamento: "Cartão no App", agendadaPara: quando });
  assert.match((await api("PUT", `/api/operacao/programadas/${prog.id}`, { valor: 60 })).corpo.erro, /não podem ser alteradas/);
  const prog2 = await pedir({ pagamento: "Pix", agendadaPara: quando });
  assert.equal((await api("PUT", `/api/operacao/programadas/${prog2.id}`, { valor: 60 })).status, 200);
});

test("Editar OS: finalizar pela edição aplica as taxas da central e a carteira, uma vez só; mudar o valor lança só a diferença", async () => {
  salvarTaxa(E, { nome: "Taxa APP", quemPaga: "motorista", categorias: ["Carro"], pagamentos: ["dinheiro", "debito", "credito", "cartao_app", "pix"], faixas: [{ de: 0, ate: null, tipo: "porcentagem", valor: 10 }] }, "t");
  const c = await pedir({ pagamento: "Dinheiro" });
  await R.atribuirMotorista(E, c.id, mot.id, "t");
  const ed = await api("PUT", `/api/operacao/corridas/${c.id}`, { status: "finalizada", valorFinal: 50 });
  assert.equal(ed.status, 200, JSON.stringify(ed.corpo));
  assert.equal(somaDe(c.os), -5, "10% de R$ 50 saiu da carteira do motorista");
  assert.equal(lancamentos(c.os).length, 1);
  // Corrigir o valor: só a diferença (R$ 100 -> taxa de R$ 10, já saiu R$ 5).
  await api("PUT", `/api/operacao/corridas/${c.id}`, { valorFinal: 100 });
  assert.equal(somaDe(c.os), -10);
  assert.equal(lancamentos(c.os).length, 2);
  // Rodar de novo (qualquer número de vezes) não muda nada.
  const feita = R.listarProprias(E).find((x) => x.id === c.id)!;
  X.aposFinalizar(E, feita); X.aposFinalizar(E, feita);
  assert.equal(somaDe(c.os), -10);
  // Editar só o nome de uma finalizada não mexe na carteira.
  await api("PUT", `/api/operacao/corridas/${c.id}`, { nome: "Paula Souza" });
  assert.equal(somaDe(c.os), -10);
  for (const t of taxas(E)) removerTaxa(E, t.id);
});

// ------------------------------------------------------------------ 6. comissão antiga da categoria na carteira

test("comissão da categoria sai da carteira do motorista junto das taxas, sem cobrar duas vezes", async () => {
  // Sem taxas da central: vale a comissão da categoria (10%).
  const c1 = await pedir({ pagamento: "Dinheiro" });
  X.aposFinalizar(E, await finalizar(c1.id, 50));
  assert.equal(somaDe(c1.os), -5);
  assert.equal(lancamentos(c1.os)[0].descricao, `Comissão da central · OS ${c1.os}`);
  X.aposFinalizar(E, R.listarProprias(E).find((x) => x.id === c1.id)!);
  assert.equal(lancamentos(c1.os).length, 1, "idempotente");
  // Com taxa do motorista: ela substitui a comissão (uma cobrança só, a da taxa).
  salvarTaxa(E, { nome: "Taxa APP", quemPaga: "motorista", categorias: ["Carro"], pagamentos: ["dinheiro", "debito", "credito", "cartao_app", "pix"], faixas: [{ de: 0, ate: null, tipo: "porcentagem", valor: 20 }] }, "t");
  const c2 = await pedir({ pagamento: "Dinheiro" });
  X.aposFinalizar(E, await finalizar(c2.id, 50));
  assert.equal(somaDe(c2.os), -10, "só os 20% da taxa, sem os 10% da comissão");
  assert.deepEqual(lancamentos(c2.os).map((l) => l.descricao), [`Taxa APP · OS ${c2.os}`]);
  // Motorista com regra própria (Personalizado): vale a regra dele, sem a taxa nem a comissão da categoria.
  alterarCampos(E, MOT, mot.id, { cobranca: "Personalizado", cobrancaTipo: "Valor fixo", cobrancaValor: 3 }, "t");
  const c3 = await pedir({ pagamento: "Dinheiro" });
  X.aposFinalizar(E, await finalizar(c3.id, 50));
  assert.equal(somaDe(c3.os), -3);
  alterarCampos(E, MOT, mot.id, { cobranca: "Isento" }, "t");
  const c4 = await pedir({ pagamento: "Dinheiro" });
  X.aposFinalizar(E, await finalizar(c4.id, 50));
  assert.equal(somaDe(c4.os), 0, "isento não paga nada");
  alterarCampos(E, MOT, mot.id, { cobranca: "Padrão" }, "t");
  for (const t of taxas(E)) removerTaxa(E, t.id);
});

test("corrida com desconto: a taxa e a comissão contam sobre o que o passageiro pagou (sem descontar duas vezes)", async () => {
  const c = await pedir({ empresaConveniada: "Acme Ltda", pagamento: "Pix" }); // 40 com 10% de desconto = 36
  X.aposFinalizar(E, await finalizar(c.id, 40));
  assert.equal(R.listarProprias(E).find((x) => x.id === c.id)!.valor, 36);
  assert.equal(somaDe(c.os), -3.6, "10% de R$ 36");
});

// ------------------------------------------------------------------ 7. taxa de serviço do passageiro na API

test("taxa de serviço do passageiro: vem na estimativa, na corrida do app do passageiro e no recibo", async () => {
  salvarTaxa(E, { nome: "Taxa Passageiro", quemPaga: "passageiro", categorias: ["Carro"], pagamentos: ["dinheiro", "debito", "credito", "cartao_app", "pix"], faixas: [{ de: 0, ate: null, tipo: "fixo", valor: 1.5 }] }, "t");
  assert.equal(R.estimarPreco(E, { categoria: "Carro", distanciaKm: 10, pagamento: "Pix" }).taxaServico, 1.5);
  const c = await pedir({ pagamento: "Pix" });
  assert.equal(P.corridaParaApp(E, c, "passageiro").taxaServico, 1.5);
  assert.equal("taxaServico" in P.corridaParaApp(E, c, "motorista"), false);
  const feita = await finalizar(c.id, 40);
  assert.equal(P.corridaParaApp(E, feita, "passageiro").taxaServico, 1.5);
  const html = S.recibo(E, c.id);
  assert.match(html, /Taxa de serviço/);
  assert.match(html, /R\$ 1,50/);
  assert.match(html, /Total: R\$ 41,50/);
  // Sem a taxa, o recibo continua como era.
  for (const t of taxas(E)) removerTaxa(E, t.id);
  const c2 = await pedir({ pagamento: "Pix" });
  await finalizar(c2.id, 40);
  assert.doesNotMatch(S.recibo(E, c2.id), /Taxa de serviço/);
  assert.match(S.recibo(E, c2.id), /Total: R\$ 40,00/);
});
