// Preços por cidade do totem: regras de horário, domingo, feriado, faixas e pedágio; cadastro; valor no pedido do totem.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

process.env.DADOS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "totem-tarifas-"));
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "t".repeat(40);

const express = (await import("express")).default;
const D = await import("../src/servidor/dados.ts");
const { criarCookie, exigirLogin } = await import("../src/servidor/sessao.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar } = await import("../src/cadastros/armazem.ts");
const C = await import("../src/corridas/index.ts");
const { rotasTotem } = await import("../src/totem/rotas.ts");
const TC = await import("../src/totem/tarifas-cidade.ts");

// "Quando" em horário de Brasília -> instante UTC (Brasília = UTC-3).
const quando = (iso: string) => Date.parse(`${iso}:00-03:00`);
const base = (o: Partial<import("../src/totem/tarifas-cidade.ts").Tarifa> = {}): import("../src/totem/tarifas-cidade.ts").Tarifa => ({
  id: "x", origemCidade: "", origemUf: "", destinoCidade: "Ribeirão Preto", destinoUf: "SP", local: "", categoria: "", normal: 15, noite: null, noiteInicio: "22:00", noiteFim: "06:00",
  domingo: null, feriado: null, faixas: [], pedagio: null, pedagioIdaVolta: true, ativa: true, obs: "", ...o,
});

test("valor do horário: normal, noite que atravessa a meia-noite, faixas extras, domingo e feriado (nacional e da empresa)", () => {
  const t = base({ noite: 20, domingo: 18, feriado: 25 });
  assert.equal(TC.valorDaTarifa(t, quando("2026-11-10T14:00")).valor, 15); // terça
  assert.equal(TC.valorDaTarifa(t, quando("2026-11-10T23:30")).tipo, "noite");
  assert.equal(TC.valorDaTarifa(t, quando("2026-11-10T05:59")).valor, 20); // "termina 05:59" ainda é noite
  assert.equal(TC.valorDaTarifa(t, quando("2026-11-10T06:00")).valor, 15);
  assert.deepEqual(TC.valorDaTarifa(t, quando("2026-11-15T14:00")), { valor: 25, tipo: "feriado" }); // 15/11 é feriado nacional (e domingo): feriado vence
  assert.deepEqual(TC.valorDaTarifa(t, quando("2026-11-08T14:00")), { valor: 18, tipo: "domingo" });
  assert.equal(TC.valorDaTarifa(t, quando("2026-11-08T23:00")).valor, 18); // domingo vence a noite
  assert.equal(TC.valorDaTarifa(t, quando("2026-03-10T14:00"), new Set(["2026-03-10"])).valor, 25); // feriado da empresa
  assert.equal(TC.valorDaTarifa(base({ domingo: 18 }), quando("2026-11-15T14:00")).valor, 18); // feriado vazio cai para o domingo
  const f = base({ noite: 20, noiteFim: "23:59", faixas: [{ inicio: "00:00", fim: "05:59", valor: 25 }] });
  assert.equal(TC.valorDaTarifa(f, quando("2026-11-10T02:00")).valor, 25);
  assert.equal(TC.valorDaTarifa(f, quando("2026-11-10T22:30")).valor, 20);
});

test("feriados nacionais: Sexta-feira Santa calculada, Consciência Negra só de 2024 em diante", () => {
  assert.ok(TC.feriadosNacionais(2026).has("2026-04-03"));
  assert.ok(TC.feriadosNacionais(2026).has("2026-11-20"));
  assert.ok(!TC.feriadosNacionais(2023).has("2023-11-20"));
});

test("pedágio: por passagem, ida e volta dobra; soma ao total", () => {
  const t = base({ pedagio: 8.5 });
  assert.equal(TC.pedagioDa(t), 17);
  assert.equal(TC.pedagioDa({ ...t, pedagioIdaVolta: false }), 8.5);
  assert.equal(TC.totalDaTarifa(t, quando("2026-11-10T14:00")).total, 32);
});

test("trajeto vale nos dois sentidos; origem específica vence 'qualquer origem'; categoria igual vence a sem categoria", () => {
  const todas = [
    base({ id: "a", origemCidade: "Pitangueiras", origemUf: "SP", normal: 40 }),
    base({ id: "b", normal: 55 }),
    base({ id: "c", origemCidade: "Pitangueiras", origemUf: "SP", categoria: "CENTRAL", normal: 45 }),
  ];
  const ida = TC.tarifasDoTrajeto(todas, { cidade: "Pitangueiras", uf: "SP" }, { cidade: "Ribeirao Preto", uf: "SP" });
  assert.deepEqual(ida.map((t) => t.id), ["c", "a", "b"]);
  assert.equal(TC.tarifaDaCategoria(ida, "central")!.id, "c");
  assert.equal(TC.tarifaDaCategoria(ida, "Outra")!.id, "a");
  const volta = TC.tarifasDoTrajeto(todas, { cidade: "Ribeirão Preto", uf: "SP" }, { cidade: "Pitangueiras", uf: "SP" });
  assert.deepEqual(volta.map((t) => t.id), ["c", "a"]); // "qualquer origem" não tem volta
  assert.deepEqual(TC.tarifasDoTrajeto(todas, { cidade: "Pitangueiras", uf: "MG" }, { cidade: "Ribeirão Preto", uf: "SP" }).map((t) => t.id), ["b"]);
  assert.deepEqual(TC.tarifasDoTrajeto([base({ ativa: false })], { cidade: null, uf: null }, { cidade: "Ribeirão Preto", uf: "SP" }), []);
});

test("local com valor próprio: casa pelas palavras do nome; cidade citada só pelo primeiro nome quando é única", () => {
  assert.ok(TC.localCitado("Pesqueiro do Diu", "quero ir pro pesqueiro do Diu"));
  assert.ok(!TC.localCitado("Pesqueiro do Diu", "quero ir no pesqueiro"));
  assert.ok(!TC.localCitado("", "qualquer"));
  const cidades = [base({ origemCidade: "Pitangueiras", origemUf: "SP", destinoCidade: "Ribeirão Preto" }), base({ origemCidade: "Pitangueiras", origemUf: "SP", destinoCidade: "Viradouro" })];
  assert.equal(TC.cidadeCitada(cidades, { cidade: "Pitangueiras" }, "vou pra ribeirao")!.cidade, "Ribeirão Preto");
  const duas = [...cidades, base({ origemCidade: "Pitangueiras", origemUf: "SP", destinoCidade: "Ribeirão Pires" })];
  assert.equal(TC.cidadeCitada(duas, { cidade: "Pitangueiras" }, "vou pra ribeirao"), null);
  assert.equal(TC.cidadeCitada(duas, { cidade: "Pitangueiras" }, "vou pra Ribeirão Pires")!.cidade, "Ribeirão Pires");
});

test("textos: título, resumo e bloco com todos os horários", () => {
  const t = base({ origemCidade: "Pitangueiras", origemUf: "SP", noite: 20, domingo: 20, feriado: 20, pedagio: 4 });
  assert.equal(TC.tituloDaTarifa(t), "Pitangueiras ⇄ Ribeirão Preto");
  assert.equal(TC.resumoDaTarifa(t), "R$ 15,00 · noite R$ 20,00 (22:00-06:00) · domingo R$ 20,00 · feriado R$ 20,00 + pedágio R$ 8,00");
  assert.deepEqual(TC.blocoDaTarifa(t, "Corrida", "🚗"), ["🚗 *Corrida*", "☀️ Dia: *R$ 15,00*", "🌙 Noite (22h às 6h): *R$ 20,00*", "📅 Domingo e feriado: *R$ 20,00*", "🚧 + pedágio: *R$ 8,00*"]);
  assert.deepEqual(TC.blocoDaTarifa(base(), "Corrida", "🚗"), ["🚗 *Corrida*", "💵 Qualquer dia e horário: *R$ 15,00*"]);
});

// ------------------------------------------------------------------ cadastro e pedido pelo totem

const app = express();
app.use(express.json());
app.post("/teste/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({ ok: true }); });
app.use("/api/totem", rotasTotem);
app.use("/api", exigirLogin);
const servidor = app.listen(0);
const url = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api`;
test.after(() => servidor.close());

const A = D.criarEmpresa("Rota Norte");
const admin = D.criarUsuario({ email: "a@a.test", nome: "Ana", senha: "senha-forte-1", empresaId: A.id, papel: "admin" });
const oper = D.criarUsuario({ email: "o@a.test", nome: "Otávio", senha: "senha-forte-2", empresaId: A.id, papel: "operador" });
criar(A.id, cadastroPorId("categorias")!, { nome: "Econômico", bandeirada: 5, valorKm: 2, valorMinimo: 9.9, ativa: true }, "teste");
const cookie = async (id: string) => ((await fetch(`${url.replace("/api", "")}/teste/entrar/${id}`, { method: "POST" })).headers.get("set-cookie") ?? "").split(";")[0];
async function pedir(caminho: string, o: { metodo?: string; corpo?: unknown; cookie?: string; chave?: string } = {}) {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (o.cookie) h.cookie = o.cookie;
  if (o.chave) h["X-Totem-Chave"] = o.chave;
  const r = await fetch(`${url}${caminho}`, { method: o.metodo ?? (o.corpo ? "POST" : "GET"), headers: h, body: o.corpo ? JSON.stringify(o.corpo) : undefined });
  const texto = await r.text();
  return { status: r.status, corpo: JSON.parse(texto || "{}"), texto };
}
let ca = "", co = "";

test("cadastro: só admin; valor normal e nome do local obrigatórios; tarifa repetida (nos dois sentidos) é recusada", async () => {
  ca = await cookie(admin.id); co = await cookie(oper.id);
  const entre = { origemCidade: "Pitangueiras", origemUf: "sp", destinoCidade: "Ribeirão Preto", destinoUf: "SP", normal: 50, noite: 60, pedagio: 8, pedagioIdaVolta: true };
  assert.equal((await pedir("/totem/tarifas-cidade/cidades", { corpo: entre, cookie: co })).status, 403);
  assert.equal((await pedir("/totem/tarifas-cidade/cidades", { corpo: { ...entre, normal: 0 }, cookie: ca })).corpo.erro, "Preencha o valor normal (dia)");
  assert.equal((await pedir("/totem/tarifas-cidade/cidades", { corpo: { ...entre, destinoCidade: "" }, cookie: ca })).corpo.erro, "Escolha a cidade (e o estado)");
  assert.match((await pedir("/totem/tarifas-cidade/cidades", { corpo: { ...entre, faixas: [{ inicio: "00:00", fim: "00:00", valor: 25 }] }, cookie: ca })).corpo.erro, /preencha quando começa/);
  assert.equal((await pedir("/totem/tarifas-cidade/local", { corpo: { destinoCidade: "Pitangueiras", destinoUf: "SP", normal: 20 }, cookie: ca })).corpo.erro, "Escreva o nome do local (ex.: Zoológico)");
  const ok = await pedir("/totem/tarifas-cidade/cidades", { corpo: entre, cookie: ca });
  assert.equal(ok.status, 200, ok.texto);
  assert.equal(ok.corpo.tarifa.origemUf, "SP");
  const volta = await pedir("/totem/tarifas-cidade/cidades", { corpo: { ...entre, origemCidade: "Ribeirão Preto", destinoCidade: "Pitangueiras" }, cookie: ca });
  assert.equal(volta.status, 400);
  assert.match(volta.corpo.erro, /^Já existe essa tarifa/);
  // Dentro da cidade e local usam a mesma cidade na origem e no destino.
  const dentro = await pedir("/totem/tarifas-cidade/dentro", { corpo: { destinoCidade: "Pitangueiras", destinoUf: "SP", normal: 12, categoria: "CENTRAL" }, cookie: ca });
  assert.equal(dentro.corpo.tarifa.origemCidade, "Pitangueiras");
  const local = await pedir("/totem/tarifas-cidade/local", { corpo: { destinoCidade: "Pitangueiras", destinoUf: "SP", local: "Pesqueiro do Diu", normal: 30, domingo: 40 }, cookie: ca });
  assert.equal(local.status, 200, local.texto);
  const lista = await pedir("/totem/tarifas-cidade", { cookie: ca });
  assert.deepEqual(lista.corpo.tarifas.map((t: { tipo: string }) => t.tipo).sort(), ["cidades", "dentro", "local"]);
  assert.equal((await pedir("/totem/tarifas-cidade", { cookie: co })).status, 403);
  // Editar a própria tarifa não conta como repetida; excluir remove.
  const edit = await pedir(`/totem/tarifas-cidade/cidades/${ok.corpo.tarifa.id}`, { metodo: "PUT", corpo: { ...entre, normal: 52 }, cookie: ca });
  assert.equal(edit.corpo.tarifa.normal, 52);
  const extra = await pedir("/totem/tarifas-cidade/local", { corpo: { destinoCidade: "Pitangueiras", destinoUf: "SP", local: "Zoológico", normal: 22 }, cookie: ca });
  assert.equal((await pedir(`/totem/tarifas-cidade/${extra.corpo.tarifa.id}`, { metodo: "DELETE", cookie: ca })).status, 200);
  assert.equal((await pedir("/totem/tarifas-cidade", { cookie: ca })).corpo.tarifas.length, 3);
});

test("feriados da empresa e hora de espera", async () => {
  assert.equal((await pedir("/totem/tarifas-cidade-feriados", { corpo: { data: "2026-13-40" }, cookie: ca })).status, 400);
  const f = await pedir("/totem/tarifas-cidade-feriados", { corpo: { data: "2026-06-18", nome: "Aniversário da cidade" }, cookie: ca });
  assert.equal(f.status, 200);
  assert.equal((await pedir("/totem/tarifas-cidade-feriados", { corpo: { data: "2026-06-18" }, cookie: ca })).corpo.erro, "Esse feriado já está na lista.");
  await pedir("/totem/tarifas-cidade-espera", { metodo: "PUT", corpo: { valor: "30,00" }, cookie: ca });
  const l = (await pedir("/totem/tarifas-cidade", { cookie: ca })).corpo;
  assert.equal(l.esperaPorHora, 30);
  assert.equal(l.feriados.length, 1);
  assert.equal((await pedir(`/totem/tarifas-cidade-feriados/${f.corpo.feriado.id}`, { metodo: "DELETE", cookie: ca })).status, 200);
});

test("totem: destino em outra cidade ou num local com valor próprio vai com o valor fixo; cotação mostra o preço", async () => {
  await pedir("/totem/locais", { corpo: { nome: "Hotel", slug: "hotel", cidade: "Pitangueiras", uf: "SP", endereco: { texto: "Av. Central, 100" }, senha: "1234" }, cookie: ca });
  const chave = (await pedir(`/totem/publico/${A.id}/hotel/entrar`, { corpo: { senha: "1234" } })).corpo.chave;
  const P = `/totem/publico/${A.id}/hotel`;
  const cot = await pedir(`${P}/cotacao`, { corpo: { destino: "Rodoviária de Ribeirão" }, chave });
  assert.equal(cot.status, 200, cot.texto);
  assert.equal(cot.corpo.categorias[0].fixo, true);
  assert.ok(cot.corpo.categorias[0].preco >= 66); // 52 (dia) ou 60 (noite), mais o pedágio de ida e volta (16)
  assert.equal((await pedir(`${P}/cotacao`, { corpo: { destino: "Rua das Flores, 10" }, chave })).corpo.categorias[0].fixo, false);
  assert.equal((await pedir(`${P}/cotacao`, { corpo: { destino: "Pesqueiro do Diu" }, chave })).corpo.categorias[0].fixo, true);
  const r = await pedir(`${P}/corridas`, { corpo: { pedidoId: "pedido-cidade-01", destino: { texto: "Rodoviária de Ribeirão" }, categoria: "Econômico", pagamento: "Pix", nome: "Paula", telefone: "(11) 98888-7777" }, chave });
  assert.equal(r.status, 200, r.texto);
  const c = C.listarProprias(A.id).find((x) => x.id === r.corpo.corrida.id)!;
  assert.equal(c.valorFinal?.modo, "prefixado");
  assert.ok((c.valorFinal?.valor ?? 0) >= 66); // 52 (dia) ou 60 (noite) ou mais, + pedágio ida e volta de 16
});
