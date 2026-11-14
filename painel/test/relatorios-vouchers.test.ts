// Relatórios (faturamento, estatísticas, km rodados, modelos, CSV) e Vouchers (faixas, entrega) no formato da Machine.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-relvou-"));
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
const C = await import("../src/corridas/index.ts");
const R = await import("../src/relatorios/relatorios.ts");
const { rotasRelatorios } = await import("../src/relatorios/rotas.ts");

const app = express();
app.use(express.json());
app.post("/teste/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({ ok: true }); });
app.use("/api", exigirLogin);
app.use("/api/relatorios", rotasRelatorios);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => { servidor.closeAllConnections(); servidor.close(); B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

const E = D.criarEmpresa("Rel Um").id, E2 = D.criarEmpresa("Rel Dois").id;
const adm = D.criarUsuario({ email: "adm@rel.test", nome: "Adm Rel", senha: "senha-forte-1", empresaId: E, papel: "admin" });
const op = D.criarUsuario({ email: "op@rel.test", nome: "Op Rel", senha: "senha-forte-1", empresaId: E, papel: "operador" });
const adm2 = D.criarUsuario({ email: "adm2@rel.test", nome: "Adm Dois", senha: "senha-forte-1", empresaId: E2, papel: "admin" });
async function entrar(id: string) {
  const r = await fetch(`${base}/teste/entrar/${id}`, { method: "POST" });
  return (r.headers.get("set-cookie") ?? "").split(";")[0];
}
const cAdm = await entrar(adm.id), cOp = await entrar(op.id), cAdm2 = await entrar(adm2.id);
async function api(cookie: string, metodo: string, url: string, corpo?: unknown) {
  const r = await fetch(`${base}/api/relatorios${url}`, { method: metodo, headers: { cookie, "content-type": "application/json" }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  const tipo = r.headers.get("content-type") ?? "";
  return { status: r.status, texto: tipo.includes("json") ? "" : await r.text(), corpo: (tipo.includes("json") ? await r.json() : {}) as Record<string, any> };
}

salvarCategoria(E, null, { nome: "Pop", taxaBase: 5, precoKm: 2, tarifaMinima: 8, comissaoTipo: "Percentual", comissaoValor: 10 }, "t");
const MOT = cadastroPorId("motoristas")!, CONV = cadastroPorId("conveniadas")!;
const rita = criar(E, MOT, { nome: "Rita Rodas", telefone: "11980000001", status: "Ativo", viatura: "V1", placa: "ABC1D23", veiculo: "Onix" }, "t");
const caio = criar(E, MOT, { nome: "Caio Cabral", telefone: "11980000002", status: "Ativo", viatura: "V2" }, "t");
criar(E, CONV, { nome: "Acme Ltda", status: "Ativa", centrosCusto: "Vendas, TI" }, "t");
criar(E, CONV, { nome: "=Maliciosa", status: "Ativa" }, "t");

let tel = 11990000000;
async function corrida(mot: { id: string }, pagamento: string, valor: number, extra: Record<string, unknown> = {}, embarque = "Rua A, 10 - Centro, Leme/SP", fim: "finalizada" | "cancelada" = "finalizada") {
  const c = await C.criarCorridaPropria(E, { passageiro: { nome: `Pass ${++tel}`, telefone: String(tel) }, embarque: { texto: embarque }, destino: { texto: "Rua B, 2" }, categoria: "Pop", pagamento, canal: "painel", distanciaKm: 5, ...extra } as never, "op@rel.test");
  C.atribuirMotorista(E, c.id, mot.id, "t");
  if (fim === "cancelada") { C.cancelarCorrida(E, c.id, "Passageiro", "desistiu", "t"); return c; }
  C.mudarStatus(E, c.id, "a_caminho"); C.mudarStatus(E, c.id, "no_local"); C.mudarStatus(E, c.id, "em_andamento");
  C.mudarStatus(E, c.id, "finalizada", { valor });
  return c;
}
const o1 = await corrida(rita, "Voucher", 20, { empresaConveniada: "Acme Ltda", centroCusto: "Vendas", voucher: "A-105" });
const o2 = await corrida(rita, "Dinheiro", 30, { empresaConveniada: "Acme Ltda", centroCusto: "TI" }, "Rua C, 3 - Jardim Sol, Leme/SP");
await corrida(caio, "Pix", 50, {}, "Rua D, 4, Centro");
await corrida(caio, "Pix", 10, {}, "Rua D, 5 - Centro, Leme/SP", "cancelada");
const o5 = await corrida(caio, "Voucher", 40, { empresaConveniada: "=Maliciosa", voucher: "A-106" });

const q = (extra = "") => `inicio=2026-01-01&fim=2026-12-31${extra}`;

test("faturamento por empresa exige a empresa e soma só as corridas dela", async () => {
  assert.equal((await api(cAdm, "GET", `/relatorio/faturamento-empresa?${q()}`)).status, 400);
  const r = await api(cAdm, "GET", `/relatorio/faturamento-empresa?${q("&empresa=Acme Ltda")}`);
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(r.corpo.total, 2);
  assert.equal(r.corpo.totais.valor, 50);
  assert.deepEqual(r.corpo.linhas.map((l: any) => l.viatura), ["V1", "V1"]);
  const so = await api(cAdm, "GET", `/relatorio/faturamento-empresa?${q("&empresa=Acme Ltda&pagamento=Voucher")}`);
  assert.equal(so.corpo.total, 1);
});

test("centro de custo, faturamento por período com taxa e vouchers por motorista", async () => {
  const cc = await api(cAdm, "GET", `/relatorio/faturamento-centro-custo?${q()}`);
  assert.deepEqual(cc.corpo.linhas.map((l: any) => l.nome), ["TI", "Vendas"]);
  const fp = await api(cAdm, "GET", `/relatorio/faturamento-periodo?${q("&taxa=10&valorPorCorrida=1")}`);
  const rr = fp.corpo.linhas.find((l: any) => l.nome === "Rita Rodas");
  assert.equal(rr.faturamento, 50); assert.equal(rr.aPagar, 7); assert.equal(rr.totalMotorista, 43);
  assert.equal(fp.corpo.colunas[5].rotulo, "Valor a pagar (10%)");
  const vt = await api(cAdm, "GET", `/relatorio/vouchers-motoristas?${q()}`);
  assert.deepEqual(vt.corpo.linhas.map((l: any) => [l.motorista, l.voucher]), [["Caio Cabral", 40], ["Rita Rodas", 20]]);
});

test("estatísticas: bairro, empresa, forma de pagamento, motorista e operador", async () => {
  const b = await api(cAdm, "GET", `/relatorio/os-bairro?${q()}`);
  assert.equal(b.corpo.linhas[0].bairro, "Centro"); assert.equal(b.corpo.linhas[0].partidas, 2);
  const e = await api(cAdm, "GET", `/relatorio/os-empresa?${q()}`);
  assert.equal(e.corpo.total, 2);
  const p = await api(cAdm, "GET", `/relatorio/os-pagamento?${q()}`);
  assert.equal(p.corpo.linhas.reduce((s: number, l: any) => s + l.corridas, 0), 4);
  const m = await api(cAdm, "GET", `/relatorio/os-percentual-motorista?${q()}`);
  assert.equal(m.corpo.linhas[0].porcentagem, 50);
  const o = await api(cAdm, "GET", `/relatorio/os-operador?${q()}`);
  const linha = o.corpo.linhas.find((l: any) => l.operador === "Op Rel");
  assert.equal(linha.finalizadas, 4); assert.equal(linha.cancPass, 1); assert.equal(linha.totais, 5);
});

test("corrida por motorista e km rodados", async () => {
  const c = await api(cAdm, "GET", `/relatorio/os-motorista?${q("&motorista=rita")}`);
  assert.equal(c.corpo.total, 2); assert.equal(c.corpo.linhas.find((l: any) => l.os === o1.os).voucher, "A-105");
  const k = await api(cAdm, "GET", `/relatorio/km-rodados?${q()}`);
  const rita_ = k.corpo.linhas.find((l: any) => l.nome === "Rita Rodas");
  assert.equal(rita_.km, 10); assert.equal(rita_.placa, "ABC1D23"); assert.equal(rita_.modelo, "Onix");
  assert.equal((await api(cAdm, "GET", "/relatorio/inexistente?" + q())).status, 404);
  assert.equal((await api(cAdm, "GET", "/relatorio/km-rodados?inicio=2026-02-01&fim=2026-01-01")).status, 400);
});

test("CSV protege fórmula e segue o filtro", async () => {
  const r = await api(cAdm, "GET", `/relatorio/faturamento-empresa/csv?${q("&empresa=" + encodeURIComponent("=Maliciosa"))}`);
  assert.equal(r.status, 200);
  assert.ok(r.texto.startsWith("OS;Viatura;Nome;Valor"));
  const cc = await api(cAdm, "GET", `/relatorio/os-empresa/csv?${q()}`);
  assert.ok(cc.texto.includes("'=Maliciosa;1;40;"), cc.texto);
});

test("dados são por empresa: outra central não vê nada", async () => {
  const r = await api(cAdm2, "GET", `/relatorio/os-pagamento?${q()}`);
  assert.equal(r.corpo.total, 0);
  assert.equal((await api(cAdm2, "GET", "/vouchers/entrega")).corpo.itens.length, 0);
});

test("modelos: sugeridos vêm prontos; só admin cria e apaga", async () => {
  const ind = await api(cOp, "GET", "/indice");
  assert.equal(ind.corpo.padrao.length, 11);
  assert.equal(ind.corpo.modelos.filter((m: any) => m.sugerido).length, 3);
  assert.equal((await api(cOp, "POST", "/modelos", { nome: "X", base: "os-bairro" })).status, 403);
  const c = await api(cAdm, "POST", "/modelos", { nome: "Acme no Pix", base: "faturamento-empresa", filtros: { empresa: "Acme Ltda", pagamento: "Pix", malvado: "x" } });
  assert.equal(c.status, 201);
  assert.deepEqual(c.corpo.modelo.filtros, { empresa: "Acme Ltda", pagamento: "Pix" });
  assert.equal((await api(cAdm, "POST", "/modelos", { nome: "acme no pix", base: "os-bairro" })).status, 400);
  assert.equal((await api(cAdm, "POST", "/modelos", { nome: "Sem base", base: "nada" })).status, 400);
  assert.equal((await api(cAdm, "DELETE", `/modelos/${c.corpo.modelo.id}`)).status, 200);
  assert.equal((await api(cAdm2, "GET", "/indice")).corpo.modelos.length, 3);
});

test("faixas de vouchers: criar, validar, sobreposição, filtro e permissões", async () => {
  assert.equal((await api(cOp, "POST", "/vouchers/faixas", { conveniada: "Acme Ltda", serie: "A", inicial: 100, final: 200 })).status, 403);
  const f = await api(cAdm, "POST", "/vouchers/faixas", { conveniada: "Acme Ltda", serie: "A", inicial: "100", final: "200" });
  assert.equal(f.status, 201);
  assert.equal(f.corpo.faixa.bandeira, "Rel Um");
  assert.equal((await api(cAdm, "POST", "/vouchers/faixas", { conveniada: "Acme Ltda", serie: "A", inicial: 150, final: 300 })).status, 400);
  assert.equal((await api(cAdm, "POST", "/vouchers/faixas", { conveniada: "Acme Ltda", serie: "A", inicial: 9, final: 3 })).status, 400);
  assert.equal((await api(cAdm, "POST", "/vouchers/faixas", { conveniada: "Inexistente", serie: "A", inicial: 1, final: 3 })).status, 400);
  assert.equal((await api(cAdm, "POST", "/vouchers/faixas", { conveniada: "Acme Ltda", serie: "B", inicial: "1", final: "9999999" })).status, 400);
  assert.equal((await api(cAdm, "POST", "/vouchers/faixas", { conveniada: "=Maliciosa", serie: "A", inicial: 201, final: 300 })).status, 201);
  assert.equal((await api(cAdm, "GET", "/vouchers/faixas?empresa=Acme Ltda&inicial=150")).corpo.faixas.length, 1);
  assert.equal((await api(cAdm, "GET", "/vouchers/faixas")).corpo.faixas.length, 2);
  assert.equal((await api(cAdm2, "GET", "/vouchers/faixas")).corpo.faixas.length, 0);
  const id = (await api(cAdm, "GET", "/vouchers/faixas?empresa==Maliciosa")).corpo.faixas[0].id;
  assert.equal((await api(cAdm2, "DELETE", `/vouchers/faixas/${id}`)).status, 404);
  assert.equal((await api(cAdm, "DELETE", `/vouchers/faixas/${id}`)).status, 200);
});

test("voucher na corrida: precisa estar na faixa da empresa e não repetir", async () => {
  const V = await import("../src/relatorios/vouchers.ts");
  assert.equal(V.validarVoucher(E, "Acme Ltda", "A-150"), "A-150");
  assert.throws(() => V.validarVoucher(E, "Acme Ltda", "A-999"), /fora das faixas/);
  assert.throws(() => V.validarVoucher(E, "Acme Ltda", "B-150"), /fora das faixas/);
  assert.throws(() => V.validarVoucher(E, "Acme Ltda", "a-105"), /já foi usado/);
  assert.throws(() => V.validarVoucher(E, "Acme Ltda", ""), /Informe/);
});

test("entrega de voucher: lista pendentes, filtra, registra e não repete", async () => {
  const l = await api(cOp, "GET", "/vouchers/entrega");
  assert.deepEqual(l.corpo.itens.map((i: any) => i.os).sort(), [o1.os, o5.os].sort());
  assert.equal((await api(cOp, "GET", `/vouchers/entrega?osCompradas=${o1.os}`)).corpo.itens.length, 1);
  assert.equal((await api(cOp, "GET", "/vouchers/entrega?motorista=caio")).corpo.itens.length, 1);
  assert.equal((await api(cOp, "POST", "/vouchers/entrega", { ids: [] })).status, 400);
  const dinheiro = await api(cOp, "GET", `/relatorio/os-motorista?${q()}`);
  assert.ok(dinheiro.corpo.linhas.length);
  assert.equal((await api(cOp, "POST", "/vouchers/entrega", { ids: [C.listarProprias(E).find((c) => c.os === o2.os)!.id] })).status, 400);
  const id1 = l.corpo.itens.find((i: any) => i.os === o1.os).id;
  assert.equal((await api(cAdm2, "POST", "/vouchers/entrega", { ids: [id1] })).status, 400);
  assert.equal((await api(cOp, "POST", "/vouchers/entrega", { ids: [id1] })).corpo.registradas, 1);
  assert.equal((await api(cOp, "POST", "/vouchers/entrega", { ids: [id1] })).status, 400);
  assert.deepEqual((await api(cOp, "GET", "/vouchers/entrega")).corpo.itens.map((i: any) => i.os), [o5.os]);
});

test("bairro do endereço: formatos conhecidos", () => {
  assert.deepEqual(R.bairroDoEndereco("Rua A, 10 - Centro, Leme/SP"), { bairro: "Centro", cidade: "Leme" });
  assert.deepEqual(R.bairroDoEndereco("Rua A, 10, Vila Nova"), { bairro: "Vila Nova", cidade: "" });
  assert.equal(R.bairroDoEndereco("Rua A, 1").bairro, "Não informado");
});
