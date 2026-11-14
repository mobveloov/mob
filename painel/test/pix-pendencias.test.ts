// Transação com Pix, Gestão de pendências de pagamentos, Gestão de taxas de cancelamento, Alertas para empresas e Central de notificações.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-pixpend-"));
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
const C = await import("../src/corridas/index.ts");
const { aposCancelar, saldo } = await import("../src/apps/extras.ts");
const { rotasOperacao } = await import("../src/operacao/rotas.ts");
const { rotasConfig } = await import("../src/config/rotas.ts");

const app = express();
app.use(express.json());
app.post("/teste/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({ ok: true }); });
app.use("/api", exigirLogin);
app.use("/api/operacao", rotasOperacao);
app.use("/api/config", rotasConfig);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => { servidor.closeAllConnections(); servidor.close(); B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

const E = D.criarEmpresa("Pix Um").id, E2 = D.criarEmpresa("Pix Dois").id;
const adm = D.criarUsuario({ email: "adm@pix.test", nome: "Adm", senha: "senha-forte-1", empresaId: E, papel: "admin" });
const op = D.criarUsuario({ email: "op@pix.test", nome: "Op", senha: "senha-forte-1", empresaId: E, papel: "operador" });
const adm2 = D.criarUsuario({ email: "adm@pix2.test", nome: "Adm2", senha: "senha-forte-1", empresaId: E2, papel: "admin" });
async function entrar(id: string) {
  const r = await fetch(`${base}/teste/entrar/${id}`, { method: "POST" });
  return (r.headers.get("set-cookie") ?? "").split(";")[0];
}
const cAdm = await entrar(adm.id), cOp = await entrar(op.id), cAdm2 = await entrar(adm2.id);
async function chamar(cookie: string, prefixo: "operacao" | "config", metodo: string, url: string, corpo?: unknown) {
  const r = await fetch(`${base}/api/${prefixo}${url}`, { method: metodo, headers: { cookie, "content-type": "application/json" }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  const tipo = r.headers.get("content-type") ?? "";
  return { status: r.status, texto: tipo.includes("json") ? "" : await r.text(), corpo: (tipo.includes("json") ? await r.json() : {}) as Record<string, any> };
}
const oper = (c: string, m: string, u: string, b?: unknown) => chamar(c, "operacao", m, u, b);
const conf = (c: string, m: string, u: string, b?: unknown) => chamar(c, "config", m, u, b);

criar(E, cadastroPorId("categorias")!, { nome: "Pop", bandeirada: 5, valorKm: 2, valorMinimo: 8, ativa: true, taxaCancelamento: 6, toleranciaCancelamento: 0, comissaoTipo: "Percentual", comissaoValor: 10 }, "t");
const mot = criar(E, cadastroPorId("motoristas")!, { nome: "Rita Rodas", telefone: "11980000001", status: "Ativo" }, "t");
criar(E, cadastroPorId("conveniadas")!, { nome: "Padaria Ltda", status: "Ativa" }, "t");

async function corrida(pagamento: string, tel: string, nome: string) {
  return C.criarCorridaPropria(E, { passageiro: { nome, telefone: tel }, embarque: { texto: "Rua A, 1" }, destino: { texto: "Rua B, 2" }, categoria: "Pop", pagamento, canal: "painel", distanciaKm: 5 } as never, "t");
}
async function finalizada(pagamento: string, valor: number, tel: string, nome: string) {
  const c = await corrida(pagamento, tel, nome);
  await C.atribuirMotorista(E, c.id, mot.id, "t");
  for (const s of ["no_local", "em_andamento"] as const) await C.mudarStatus(E, c.id, s);
  await C.mudarStatus(E, c.id, "finalizada", { valor });
  return C.listarProprias(E).find((x) => x.id === c.id)!;
}

let pixOk: Awaited<ReturnType<typeof finalizada>>, pixDisputa: Awaited<ReturnType<typeof finalizada>>, pixAberta: Awaited<ReturnType<typeof corrida>>;

test("Transação com Pix: situação nasce da corrida e valores líquidos separam bandeira e motorista", async () => {
  pixOk = await finalizada("Pix", 50, "11911110001", "Ana Pix");
  pixDisputa = await finalizada("Pix", 30, "11911110002", "Beto Pix");
  pixAberta = await corrida("Pix", "11911110003", "Caio Pix");
  await finalizada("Dinheiro", 20, "11911110004", "Dora Dinheiro");
  const r = await oper(cOp, "GET", "/pix");
  assert.equal(r.status, 200);
  assert.equal(r.corpo.total, 3, "só corridas pagas com Pix");
  assert.equal(r.corpo.resumo.Paga.qtd, 2);
  assert.equal(r.corpo.resumo.Processando.qtd, 1);
  const l = r.corpo.itens.find((x: any) => x.os === pixOk.os);
  assert.equal(l.valor, 50); assert.equal(l.liquidoBandeira, 5); assert.equal(l.liquidoMotorista, 45);
  assert.equal(r.corpo.totalPago, 80);
  assert.equal((await oper(cOp, "GET", `/pix?busca=${pixOk.os}`)).corpo.total, 1, "busca por OS");
  assert.equal((await oper(cOp, "GET", "/pix?situacao=Processando")).corpo.total, 1);
  assert.equal((await oper(cOp, "GET", "/pix?motorista=rita")).corpo.total, 2);
  assert.equal((await oper(cOp, "GET", "/pix?periodo=ontem")).corpo.total, 0);
  assert.equal((await oper(cAdm2, "GET", "/pix")).corpo.total, 0, "outra empresa não vê");
});

test("Pix: só o administrador marca; situação inválida recusada; CSV protegido", async () => {
  const url = `/pix/${pixDisputa.id}/situacao`;
  assert.equal((await oper(cOp, "POST", url, { situacao: "Chargeback" })).status, 403);
  assert.equal((await oper(cAdm2, "POST", url, { situacao: "Chargeback" })).status, 404, "outra empresa não acha");
  assert.equal((await oper(cAdm, "POST", url, { situacao: "Qualquer" })).status, 400);
  assert.equal((await oper(cAdm, "POST", url, { situacao: "Em disputa", motivo: "=SOMA(A1)" })).status, 200);
  const r = await oper(cOp, "GET", "/pix");
  assert.equal(r.corpo.resumo["Em disputa"].qtd, 1);
  assert.equal(r.corpo.totalPago, 50);
  const csv = await oper(cOp, "GET", "/pix/exportar");
  assert.equal(csv.status, 200);
  assert.match(csv.texto, /'=SOMA\(A1\)/, "apóstrofo contra injeção de fórmula");
  assert.match(csv.texto, /Valor líquido da bandeira/);
});

test("Pix com chargeback vira pendência Pix no app e segue os estados novos", async () => {
  await oper(cAdm, "POST", `/pix/${pixDisputa.id}/situacao`, { situacao: "Chargeback", motivo: "contestado" });
  const p = await oper(cOp, "GET", "/pendencias?status=todos&tipo=Pix no app");
  assert.equal(p.corpo.total, 1);
  const it = p.corpo.itens[0];
  assert.equal(it.valor, 30); assert.equal(it.situacaoGestao, "pendente");
  assert.equal((await oper(cOp, "POST", `/pendencias/${it.id}/processar`, {})).status, 403);
  assert.equal((await oper(cAdm, "POST", `/pendencias/${it.id}/repassar`, {})).status, 400, "repasse só em taxa");
  assert.equal((await oper(cAdm, "POST", `/pendencias/${it.id}/processar`, {})).status, 200);
  assert.equal((await oper(cOp, "GET", "/pendencias?status=processando")).corpo.total, 1);
  assert.equal((await oper(cAdm, "POST", `/pendencias/${it.id}/abonar`, {})).status, 200);
  assert.equal((await oper(cAdm, "POST", `/pendencias/${it.id}/baixar`, {})).status, 400, "estado final");
  const c = (await oper(cOp, "GET", "/pendencias?status=todos")).corpo.contagens;
  assert.equal(c.abonado.qtd, 1);
});

test("Pagamento insuficiente: registro manual só do admin, validado e por empresa", async () => {
  assert.equal((await oper(cOp, "POST", "/pendencias", { tipo: "Pagamento insuficiente", passageiro: "Eva", valor: 10 })).status, 403);
  assert.equal((await oper(cAdm, "POST", "/pendencias", { tipo: "Taxa de cancelamento", passageiro: "Eva", valor: 10 })).status, 400);
  assert.equal((await oper(cAdm, "POST", "/pendencias", { tipo: "Pagamento insuficiente", passageiro: "Eva", valor: -1 })).status, 400);
  assert.equal((await oper(cAdm, "POST", "/pendencias", { tipo: "Pagamento insuficiente", passageiro: "Eva", valor: 10, os: "999999" })).status, 400);
  const r = await oper(cAdm, "POST", "/pendencias", { tipo: "Pagamento insuficiente", os: pixOk.os, valor: 12.5, observacao: "Faltou troco" });
  assert.equal(r.status, 201);
  assert.equal(r.corpo.pendencia.passageiro, "Ana Pix", "preenche pelo OS");
  assert.equal((await oper(cOp, "GET", "/pendencias?tipo=Pagamento insuficiente")).corpo.total, 1);
  assert.equal((await oper(cAdm2, "GET", "/pendencias?status=todos")).corpo.total, 0);
  const csv = await oper(cOp, "GET", "/pendencias/exportar?status=todos");
  assert.match(csv.texto, /Pagamento insuficiente/);
});

let idTaxa = "", idTaxa2 = "";
test("Taxas de cancelamento: abas, Repassado, baixar devolve o valor debitado e abonar não repete", async () => {
  for (const [tel, nome] of [["11922220001", "Fabi"], ["11922220002", "Gil"]]) {
    const c = await corrida("Dinheiro", tel, nome);
    await C.atribuirMotorista(E, c.id, mot.id, "t");
    await new Promise((r) => setTimeout(r, 30)); // a tolerância é 0 minuto: precisa passar um instante
    await C.cancelarCorrida(E, c.id, "Passageiro", "Desistiu");
    aposCancelar(E, C.listarProprias(E).find((x) => x.id === c.id)!);
    if (nome === "Fabi") idTaxa = c.id; else idTaxa2 = c.id;
  }
  const r = await oper(cOp, "GET", "/taxas-cancelamento");
  assert.equal(r.corpo.taxas.qtd, 2); assert.equal(r.corpo.pendentes.qtd, 2); assert.equal(r.corpo.taxas.valor, 12);
  assert.equal(saldo(E, "passageiro", "11922220001"), -6);
  assert.equal((await oper(cOp, "POST", `/pendencias/${idTaxa}/repassar`, {})).status, 403);
  assert.equal((await oper(cAdm, "POST", `/pendencias/${idTaxa}/repassar`, {})).status, 200);
  const rep = await oper(cOp, "GET", "/taxas-cancelamento?aba=repassados");
  assert.equal(rep.corpo.total, 1); assert.equal(rep.corpo.repassados.qtd, 1);
  assert.equal((await oper(cOp, "GET", "/taxas-cancelamento?aba=pendentes")).corpo.total, 1);
  assert.equal((await oper(cOp, "GET", "/taxas-cancelamento?cliente=gil")).corpo.total, 1);
  // Mesmo se a taxa da corrida mudar depois, volta o que foi debitado (6), não o valor editado.
  const cat = cadastroPorId("categorias")!;
  const reg = (await import("../src/cadastros/armazem.ts")).listar(E, cat).find((x) => x.nome === "Pop")!;
  (await import("../src/cadastros/armazem.ts")).atualizar(E, cat, reg.id, { ...reg, taxaCancelamento: 99 }, "t");
  assert.equal((await oper(cAdm, "POST", `/pendencias/${idTaxa}/baixar`, { osColeta: "000" })).status, 400, "OS de coleta inexistente");
  assert.equal((await oper(cAdm, "POST", `/pendencias/${idTaxa}/baixar`, { osColeta: pixOk.os })).status, 200);
  assert.equal(saldo(E, "passageiro", "11922220001"), 0);
  assert.equal((await oper(cAdm, "POST", `/pendencias/${idTaxa2}/abonar`, {})).status, 200);
  assert.equal(saldo(E, "passageiro", "11922220002"), 0);
  assert.equal((await oper(cAdm, "POST", `/pendencias/${idTaxa2}/abonar`, {})).status, 400);
  const fim = await oper(cOp, "GET", "/taxas-cancelamento?aba=resolvidos");
  assert.equal(fim.corpo.itens[0].motoristaColeta, "Rita Rodas");
  assert.equal((await oper(cOp, "GET", "/taxas-cancelamento?aba=abonados")).corpo.total, 1);
  assert.match((await oper(cOp, "GET", "/taxas-cancelamento/exportar?aba=todos")).texto, /Motorista a receber/);
  assert.equal((await oper(cAdm2, "GET", "/taxas-cancelamento")).corpo.taxas.qtd, 0);
});

test("Alertas para empresas: criar valida, lista filtra por status e tipo, encerrar", async () => {
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const ok = { empresaAlvoId: "todos", tipo: "Urgente", conteudo: "Manutenção hoje", data: hoje, hora: "00:00", duracao: 2, unidade: "Dias" };
  assert.equal((await conf(cOp, "POST", "/alertas", { ...ok, tipo: "Grave" })).status, 400);
  assert.equal((await conf(cOp, "POST", "/alertas", { ...ok, conteudo: " " })).status, 400);
  assert.equal((await conf(cOp, "POST", "/alertas", { ...ok, duracao: 0 })).status, 400);
  assert.equal((await conf(cOp, "POST", "/alertas", { ...ok, hora: "25:00" })).status, 400);
  assert.equal((await conf(cOp, "POST", "/alertas", { ...ok, empresaAlvoId: "inexistente" })).status, 400);
  const a = await conf(cOp, "POST", "/alertas", ok);
  assert.equal(a.status, 201, JSON.stringify(a.corpo));
  const emp = (await conf(cOp, "GET", "/alertas")).corpo.empresas[0];
  assert.equal(emp.nome, "Padaria Ltda");
  const b = await conf(cAdm, "POST", "/alertas", { ...ok, empresaAlvoId: emp.id, tipo: "Aviso", conteudo: "Fechamos cedo", data: "2020-01-01", duracao: 1, unidade: "Horas" });
  assert.equal(b.status, 201);
  const todos = await conf(cOp, "GET", "/alertas");
  assert.equal(todos.corpo.itens.length, 2);
  assert.equal((await conf(cOp, "GET", "/alertas?status=Ativo")).corpo.itens.length, 1);
  assert.equal((await conf(cOp, "GET", "/alertas?status=Inativo&tipo=Aviso")).corpo.itens[0].empresaAlvo, "Padaria Ltda");
  assert.equal((await conf(cOp, "GET", `/alertas?empresa=${emp.id}`)).corpo.itens.length, 1);
  assert.equal((await conf(cOp, "GET", "/alertas?conteudo=manut")).corpo.itens.length, 1);
  assert.equal((await conf(cAdm2, "GET", "/alertas")).corpo.itens.length, 0, "por empresa");
  assert.equal((await conf(cOp, "GET", "/alertas/ativos")).corpo.alertas.length, 1);
  assert.equal((await conf(cAdm, "POST", `/alertas/${b.corpo.alerta.id}/encerrar`, {})).status, 400, "já terminou");
  assert.equal((await conf(cOp, "POST", `/alertas/${a.corpo.alerta.id}/encerrar`, {})).status, 200);
  assert.equal((await conf(cOp, "GET", "/alertas/ativos")).corpo.alertas.length, 0);
});

test("Central de notificações: avisos do que está pendente, leitura por pessoa e somente não lidas", async () => {
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  await conf(cAdm, "POST", "/alertas", { empresaAlvoId: "todos", tipo: "Atenção", conteudo: "Aviso para o sino", data: hoje, hora: "00:00", duracao: 1, unidade: "Dias" });
  const r = await conf(cOp, "GET", "/central-notificacoes");
  assert.equal(r.status, 200);
  assert.ok(r.corpo.total >= 3);
  assert.equal(r.corpo.naoLidas, r.corpo.total);
  const chaves: string[] = r.corpo.itens.map((i: any) => i.chave);
  assert.ok(chaves.some((c) => c.startsWith("alerta:")) && chaves.some((c) => c.startsWith("pendencia:")) && chaves.some((c) => c.startsWith("ocorrencias:")));
  const um = await conf(cOp, "POST", "/central-notificacoes/lidas", { chaves: [chaves[0], "inventada"] });
  assert.equal(um.corpo.marcadas, 1);
  assert.equal(um.corpo.naoLidas, r.corpo.total - 1);
  const so = await conf(cOp, "GET", "/central-notificacoes?somenteNaoLidas=1");
  assert.equal(so.corpo.itens.length, r.corpo.total - 1);
  assert.equal((await conf(cAdm, "GET", "/central-notificacoes")).corpo.naoLidas, r.corpo.total, "leitura é de cada pessoa");
  const todas = await conf(cOp, "POST", "/central-notificacoes/lidas", { todas: true });
  assert.equal(todas.corpo.naoLidas, 0);
  assert.equal((await conf(cOp, "GET", "/central-notificacoes?somenteNaoLidas=1")).corpo.itens.length, 0);
  assert.equal((await conf(cAdm2, "GET", "/central-notificacoes")).corpo.total, 0, "outra empresa não vê");
});
