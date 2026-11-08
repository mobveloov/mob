// Testes do totem e do apoio à tela "Solicitar corrida". Rodar: npm test (na pasta painel).
// A corrida é própria do painel (src/corridas): nenhum sistema externo, nenhuma chave, nenhuma chamada à internet.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "totem-teste-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "t".repeat(40);
/** Marcas de terceiros que nunca podem aparecer (montadas por partes para não ficarem escritas no código). */
const MARCAS = new RegExp([["mac", "hine"], ["8", "8 ?pop"], ["\\b8", "8\\b"], ["velo", "ov"]].map((p) => p.join("")).join("|"), "i");

const express = (await import("express")).default;
const D = await import("../src/servidor/dados.ts");
const { criarCookie } = await import("../src/servidor/sessao.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar, listar } = await import("../src/cadastros/armazem.ts");
const C = await import("../src/corridas/index.ts");
const { rotasCorridasProprias } = await import("../src/corridas/rotas.ts");
const { exigirLogin } = await import("../src/servidor/sessao.ts");
const { rotasTotem } = await import("../src/totem/rotas.ts");

// Servidor de teste igual ao index.ts: /api/totem antes do login; /api/corridas-proprias depois.
const app = express();
app.use(express.json());
app.post("/teste/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({ ok: true }); });
app.use("/api/totem", rotasTotem);
app.use("/api", exigirLogin);
app.use("/api/corridas-proprias", rotasCorridasProprias);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => servidor.close());

// Duas empresas, cada uma com seus usuários, categorias e motoristas.
const A = D.criarEmpresa("Rota Norte"), B = D.criarEmpresa("Leva Sul");
const adminA = D.criarUsuario({ email: "admin@a.test", nome: "Ana", senha: "senha-forte-1", empresaId: A.id, papel: "admin" });
const operA = D.criarUsuario({ email: "oper@a.test", nome: "Otávio", senha: "senha-forte-2", empresaId: A.id, papel: "operador" });
const adminB = D.criarUsuario({ email: "admin@b.test", nome: "Bia", senha: "senha-forte-3", empresaId: B.id, papel: "admin" });
const CAT = cadastroPorId("categorias")!, MOT = cadastroPorId("motoristas")!;
criar(A.id, CAT, { nome: "Econômico", descricao: "Até 4 pessoas", bandeirada: 5, valorKm: 2, valorMinimo: 9.9, ativa: true }, "teste");
criar(A.id, CAT, { nome: "Conforto", bandeirada: 8, valorKm: 3, valorMinimo: 15, ativa: true }, "teste");
criar(A.id, CAT, { nome: "Antiga", bandeirada: 1, ativa: false }, "teste");
const carlos = criar(A.id, MOT, { nome: "Carlos Souza", telefone: "11900000000", status: "Ativo", veiculo: "Hatch prata", placa: "ABC1D23" }, "teste");
criar(A.id, MOT, { nome: "Pedro Parado", telefone: "11900000001", status: "Inativo" }, "teste");

async function cookieDe(id: string) {
  const r = await fetch(`${base}/teste/entrar/${id}`, { method: "POST" });
  return (r.headers.get("set-cookie") ?? "").split(";")[0];
}
async function pedir(caminho: string, o: { metodo?: string; corpo?: unknown; cookie?: string; chave?: string } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (o.cookie) headers.cookie = o.cookie;
  if (o.chave) headers["X-Totem-Chave"] = o.chave;
  const r = await fetch(`${base}/api${caminho}`, { method: o.metodo ?? (o.corpo ? "POST" : "GET"), headers, body: o.corpo ? JSON.stringify(o.corpo) : undefined });
  const texto = await r.text();
  return { status: r.status, corpo: JSON.parse(texto || "{}"), texto };
}
const TP = (e: string = A.id) => `/totem/publico/${e}/hotel-praia`;

const ENDERECO = { texto: "Av. Central, 100 - Centro, Cidade Norte", lat: -23.5, lng: -46.6 };
let ca = "", co = "", cb = "", chave = "";

test("admin cadastra local do totem; senha só como hash; operador não cadastra", async () => {
  ca = await cookieDe(adminA.id); co = await cookieDe(operA.id); cb = await cookieDe(adminB.id);
  const novo = { nome: "Hotel Praia", endereco: ENDERECO, senha: "1234", categorias: ["Econômico", "Conforto"] };
  assert.equal((await pedir("/totem/locais", { corpo: novo, cookie: co })).status, 403);
  assert.equal((await pedir("/totem/locais", { corpo: { ...novo, senha: "12" }, cookie: ca })).status, 400);
  assert.equal((await pedir("/totem/locais", { corpo: { ...novo, endereco: { texto: "" } }, cookie: ca })).status, 400);
  const r = await pedir("/totem/locais", { corpo: novo, cookie: ca });
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.corpo.local.id, "hotel-praia");
  assert.equal(r.corpo.local.temSenha, true);
  assert.equal(r.corpo.local.senhaHash, undefined);
  assert.deepEqual(r.corpo.local.pagamentos, ["Dinheiro", "Pix", "Cartão na maquininha"]);
  const arq = fs.readFileSync(path.join(DADOS, "empresas", A.id, "totem", "locais.json"), "utf8");
  assert.ok(!arq.includes("\"1234\"") && arq.includes("scrypt$"));
  const lista = await pedir("/totem/locais", { cookie: co });
  assert.equal(lista.corpo.locais.length, 1);
  assert.ok(!lista.texto.includes("scrypt"));
  assert.deepEqual(lista.corpo.categorias.map((c: { nome: string }) => c.nome), ["Econômico", "Conforto"]); // a desligada não aparece
  assert.equal((await pedir("/totem/locais")).status, 401);
});

test("outra empresa não vê os locais nem abre o totem fora da URL dela", async () => {
  assert.equal((await pedir("/totem/locais", { cookie: cb })).corpo.locais.length, 0);
  assert.equal((await pedir(TP(B.id))).status, 404);
  assert.equal((await pedir(`/totem/publico/${A.id}/..%2F..%2Fsegredos`)).status, 404);
  assert.equal((await pedir("/totem/publico/nao-existe/hotel-praia")).status, 404);
});

test("totem: marca sem senha, resto só com a chave da senha do local", async () => {
  const p = await pedir(TP());
  assert.equal(p.status, 200);
  assert.equal(p.corpo.local.nome, "Hotel Praia");
  assert.equal(p.corpo.marca.nomeExibido, "Rota Norte");
  assert.equal(p.corpo.local.endereco, undefined);
  assert.equal((await pedir(`${TP()}/config`)).status, 401);
  assert.equal((await pedir(`${TP()}/config`, { chave: "x".repeat(43) })).status, 401);
  assert.equal((await pedir(`${TP()}/entrar`, { corpo: { senha: "errada" } })).status, 401);
  const e = await pedir(`${TP()}/entrar`, { corpo: { senha: "1234" } });
  assert.equal(e.status, 200);
  chave = e.corpo.chave;
  const c = await pedir(`${TP()}/config`, { chave });
  assert.equal(c.status, 200, c.texto);
  assert.equal(c.corpo.local.endereco, ENDERECO.texto);
  assert.deepEqual(c.corpo.categorias.map((x: { nome: string; preco: number }) => [x.nome, x.preco]), [["Econômico", 9.9], ["Conforto", 15]]);
  assert.equal((await pedir(`${TP(B.id)}/config`, { chave })).status, 404);
});

let corridaId = "";
test("totem pede corrida própria no endereço fixo; toque duplo não cria duas", async () => {
  const antes = C.listarProprias(A.id).length;
  const corpo = { pedidoId: "pedido-teste-0001", destino: { texto: "Rodoviária" }, categoria: "Econômico", pagamento: "Pix", nome: "Paula", telefone: "(11) 98888-7777" };
  assert.equal((await pedir(`${TP()}/corridas`, { corpo: { ...corpo, pagamento: "Faturado" }, chave })).corpo.erro, "Escolha a forma de pagamento.");
  assert.equal((await pedir(`${TP()}/corridas`, { corpo: { ...corpo, categoria: "Antiga" }, chave })).status, 400);
  assert.equal((await pedir(`${TP()}/corridas`, { corpo: { ...corpo, telefone: "123" }, chave })).status, 400);
  const [r1, r2] = await Promise.all([pedir(`${TP()}/corridas`, { corpo, chave }), pedir(`${TP()}/corridas`, { corpo, chave })]);
  assert.equal(r1.status, 200, r1.texto);
  assert.equal(r1.corpo.corrida.id, r2.corpo.corrida.id);
  assert.equal(C.listarProprias(A.id).length, antes + 1);
  corridaId = r1.corpo.corrida.id;
  const c = C.listarProprias(A.id).find((x) => x.id === corridaId)!;
  assert.equal(c.canal, "totem");
  assert.equal(c.embarque.texto, ENDERECO.texto);
  assert.equal(c.passageiro.telefone, "11988887777");
  assert.equal(c.estimativa.valor, 9.9);
  assert.ok(c.observacao.includes("Hotel Praia"));
  // O passageiro entrou no cadastro de clientes.
  assert.ok(listar(A.id, cadastroPorId("clientes")!).some((x) => x.telefone === "11988887777"));
  // Mesmo passageiro com corrida aberta: o módulo de corridas não deixa pedir outra.
  const outra = await pedir(`${TP()}/corridas`, { corpo: { ...corpo, pedidoId: "pedido-teste-0002" }, chave });
  assert.equal(outra.status, 400);
  assert.match(outra.corpo.erro, /corrida em aberto/);
});

test("totem acompanha e cancela só a própria corrida, antes de começar", async () => {
  const s = await pedir(`${TP()}/corridas/${corridaId}`, { chave });
  assert.equal(s.status, 200, s.texto);
  assert.equal(s.corpo.corrida.statusTexto, "Procurando motorista");
  assert.equal(s.corpo.corrida.podeCancelar, true);
  // A central atribui o motorista pela rota das corridas próprias.
  assert.equal((await pedir(`/corridas-proprias/${corridaId}/motorista`, { corpo: { motoristaId: carlos.id }, cookie: co })).status, 200);
  const s2 = await pedir(`${TP()}/corridas/${corridaId}`, { chave });
  assert.equal(s2.corpo.corrida.statusTexto, "Motorista a caminho");
  assert.deepEqual(s2.corpo.corrida.motorista, { nome: "Carlos Souza" }); // sem telefone no totem
  assert.deepEqual(s2.corpo.corrida.veiculo, { modelo: "Hatch prata", placa: "ABC1D23" });
  await C.mudarStatus(A.id, corridaId, "no_local");
  await C.mudarStatus(A.id, corridaId, "em_andamento");
  assert.equal((await pedir(`${TP()}/corridas/${corridaId}/cancelar`, { corpo: {}, chave })).status, 409);
  await C.mudarStatus(A.id, corridaId, "finalizada");
  const fim = await pedir(`${TP()}/corridas/${corridaId}`, { chave });
  assert.equal(fim.corpo.corrida.grupo, "finalizada");
  assert.equal(fim.corpo.corrida.valor, 9.9);

  const nova = await pedir(`${TP()}/corridas`, { corpo: { pedidoId: "pedido-teste-0003", semDestino: true, categoria: "Conforto", pagamento: "Dinheiro", nome: "Paula", telefone: "11988887777" }, chave });
  assert.equal(nova.status, 200, nova.texto);
  assert.equal((await pedir(`${TP()}/corridas/${nova.corpo.corrida.id}/cancelar`, { corpo: {}, chave })).status, 200);
  const cancelada = C.listarProprias(A.id).find((x) => x.id === nova.corpo.corrida.id)!;
  assert.equal(cancelada.status, "cancelada");
  assert.equal(cancelada.canceladaPor, "Passageiro");
  // Corrida da central não aparece no totem.
  const central = await C.criarCorridaPropria(A.id, { passageiro: { nome: "Rui", telefone: "11977776666" }, embarque: { texto: "Rua B, 2" }, categoria: "Econômico", pagamento: "Pix", canal: "painel" });
  assert.equal((await pedir(`${TP()}/corridas/${central.id}`, { chave })).status, 404);
});

test("central: opções com motoristas ativos, lista com o local do totem, outra empresa não vê", async () => {
  const op = await pedir("/totem/opcoes", { cookie: co });
  assert.deepEqual(op.corpo.motoristas.map((m: { nome: string }) => m.nome), ["Carlos Souza"]);
  assert.equal(op.corpo.locais[0].endereco.texto, ENDERECO.texto);
  assert.ok(op.corpo.pagamentos.includes("Pix"));
  const l = await pedir("/totem/corridas", { cookie: co });
  assert.equal(l.status, 200);
  assert.ok(l.corpo.corridas.length >= 3);
  assert.ok(l.corpo.corridas.some((c: { canal: string; local: string }) => c.canal === "totem" && c.local === "Hotel Praia"));
  assert.ok(l.corpo.corridas.every((c: { canal: string }) => (c.canal === "totem") === (c.canal !== "painel")));
  assert.equal((await pedir("/totem/corridas?canal=totem", { cookie: co })).corpo.corridas.length, 2);
  assert.equal((await pedir("/totem/corridas", { cookie: cb })).corpo.corridas.length, 0);
  assert.equal((await pedir("/totem/opcoes", { cookie: cb })).corpo.motoristas.length, 0);
});

test("recarregar remoto sobe a versão; trocar a senha derruba a chave antiga; desligar tira do ar", async () => {
  const v = (await pedir(`${TP()}/versao`, { chave })).corpo.versao;
  assert.equal((await pedir("/totem/locais/hotel-praia/recarregar", { corpo: {}, cookie: co })).status, 403);
  await pedir("/totem/locais/hotel-praia/recarregar", { corpo: {}, cookie: ca });
  assert.equal((await pedir(`${TP()}/versao`, { chave })).corpo.versao, v + 1);
  assert.equal((await pedir("/totem/locais/hotel-praia", { metodo: "PUT", corpo: { nome: "Hotel Praia Mar" }, cookie: ca })).status, 200);
  assert.equal((await pedir(`${TP()}/versao`, { chave })).status, 200); // salvar sem senha mantém a chave
  await pedir("/totem/locais/hotel-praia", { metodo: "PUT", corpo: { senha: "9876" }, cookie: ca });
  assert.equal((await pedir(`${TP()}/versao`, { chave })).status, 401);
  await pedir("/totem/locais/hotel-praia", { metodo: "PUT", corpo: { ativo: false }, cookie: ca });
  assert.equal((await pedir(TP())).status, 404);
});

test("nenhum nome de sistema ou marca de terceiro nos arquivos do totem", () => {
  const arquivos = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? arquivos(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  for (const a of [...arquivos("src/totem"), ...arquivos("src/web/totem"), path.resolve("../docs/TOTEM.md")]) {
    assert.ok(!MARCAS.test(fs.readFileSync(a, "utf8")), `marca de terceiro em ${a}`);
  }
});
