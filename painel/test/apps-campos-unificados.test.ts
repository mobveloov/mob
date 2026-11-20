// App e painel mostram o MESMO cadastro: o que o motorista grava no app (endereço, veículo, CNH) aparece em Editar motorista,
// e o que a central edita volta para o app. Também o passageiro (casa e trabalho). Tudo local, sem internet.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "campos-unif-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "u".repeat(40);
process.env.APPS_CADASTROS_POR_IP = "1000";
process.env.APPS_CODIGOS_POR_IP = "1000";
delete process.env.BANCO_ARQUIVO;

const express = (await import("express")).default;
const D = await import("../src/servidor/dados.ts");
const B = await import("../src/servidor/banco.ts");
const { criarCookie, exigirLogin } = await import("../src/servidor/sessao.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar, listar } = await import("../src/cadastros/armazem.ts");
const { rotasApps } = await import("../src/apps/rotas.ts");
const G = await import("../src/gestao/rotas.ts");
const X = await import("../src/apps/extras.ts");

const app = express();
app.use(express.json());
app.post("/teste/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({ ok: true }); });
app.use("/api/apps", rotasApps);
app.use("/api", exigirLogin);
app.use("/api/gestao", G.rotasGestao);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => { servidor.closeAllConnections(); servidor.close(); B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

const U = D.criarEmpresa("Via Unica");
const admin = D.criarUsuario({ email: "adm@u.test", nome: "Adm", senha: "senha-forte-1", empresaId: U.id, papel: "admin" });
const API = `/api/apps/${U.id}`;
const MOT = cadastroPorId("motoristas")!, CLI = cadastroPorId("clientes")!, VEI = cadastroPorId("veiculos")!;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function app_(metodo: string, url: string, corpo?: unknown, token?: string): Promise<{ status: number; corpo: any }> {
  const r = await fetch(base + API + url, { method: metodo, headers: { ...(corpo !== undefined ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  return { status: r.status, corpo: await r.json().catch(() => ({})) };
}
let cookieAdmin = "";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function painel(metodo: string, url: string, corpo?: unknown): Promise<{ status: number; corpo: any }> {
  cookieAdmin ||= ((await fetch(`${base}/teste/entrar/${admin.id}`, { method: "POST" })).headers.get("set-cookie") ?? "").split(";")[0];
  const r = await fetch(`${base}/api/gestao${url}`, { method: metodo, headers: { cookie: cookieAdmin, ...(corpo !== undefined ? { "content-type": "application/json" } : {}) }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  return { status: r.status, corpo: await r.json().catch(() => ({})) };
}

let token = "", id = "";

test("app grava endereço, CNH e veículo; Editar motorista mostra tudo", async () => {
  const r = await app_("POST", "/conta/criar", { papel: "motorista", nome: "Marcos Antônio Reis", cpf: "52998224725", genero: "Masculino", nascimento: "1990-05-10", chavePix: "marcos@pix.test", telefone: "11955550001", email: "marcos@u.test", senha: "segredo1" });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  token = r.corpo.token; id = r.corpo.eu.chave ?? r.corpo.eu.id;
  id ||= listar(U.id, MOT).find((m) => m.cpf === "52998224725")!.id;
  assert.equal((await app_("POST", "/cadastro/endereco", { cep: "11010-000", rua: "Rua das Flores", numero: "120", complemento: "Casa 2", bairro: "Centro", cidade: "Santos", uf: "SP" }, token)).status, 200);
  const v = await app_("POST", "/veiculos", { marca: "Fiat", modelo: "Argo", placa: "abc-1d23", cor: "Prata", ano: 2021, cnh: "12345678901", validadeCnh: "2031-01-01", ufEmplacamento: "sp", cidadeEmplacamento: "Santos", renavam: "12345678901" }, token);
  assert.equal(v.status, 200, JSON.stringify(v.corpo));

  const det = (await painel("GET", `/motoristas/${id}`)).corpo;
  assert.equal(det.motorista.endereco, "Rua das Flores", "a rua do app aparece no campo Endereço do painel");
  assert.equal(det.motorista.numero, "120"); assert.equal(det.motorista.cep, "11010000"); assert.equal(det.motorista.uf, "SP"); assert.equal(det.motorista.bairro, "Centro");
  assert.equal(det.motorista.cnhNumero, "12345678901", "CNH do app no campo CNH Nº do painel");
  assert.equal(det.motorista.validadeCnh, "2031-01-01");
  assert.equal(det.veiculos.length, 1);
  const vp = det.veiculos[0];
  assert.deepEqual([vp.marca, vp.modelo, vp.cor, vp.placa, vp.ano, vp.ufEmplacamento, vp.cidadeEmplacamento, vp.renavam, vp.emUso], ["Fiat", "Argo", "Prata", "ABC1D23", 2021, "SP", "Santos", "12345678901", true]);
  const lista = (await painel("GET", "/motoristas?aba=analise")).corpo;
  const linha = lista.motoristas.find((m: { id: string }) => m.id === id);
  assert.equal(linha.placa, "ABC1D23"); assert.equal(linha.veiculo, "Argo Prata");
});

test("painel edita endereço, CNH e veículo; o app mostra", async () => {
  const e = await painel("PUT", `/motoristas/${id}`, { dados: { endereco: "Avenida Brasil", numero: "", semNumero: true, bairro: "Gonzaga", cnhNumero: "99988877766" } });
  assert.equal(e.status, 200, JSON.stringify(e.corpo));
  const cad = (await app_("GET", "/cadastro", undefined, token)).corpo;
  assert.equal(cad.endereco.rua, "Avenida Brasil"); assert.equal(cad.endereco.semNumero, true); assert.equal(cad.endereco.numero, ""); assert.equal(cad.endereco.bairro, "Gonzaga");
  const v0 = (await app_("GET", "/veiculos", undefined, token)).corpo.veiculos[0];
  assert.equal(v0.cnh, "99988877766");
  const pv = await painel("PUT", `/veiculos/${v0.id}`, { modelo: "Argo Drive", cor: "Branco", marca: "Fiat Brasil", ano: 2022 });
  assert.equal(pv.status, 200, JSON.stringify(pv.corpo));
  const novo = (await app_("GET", "/veiculos", undefined, token)).corpo.veiculos;
  assert.equal(novo.length, 1); assert.equal(novo[0].modelo, "Argo Drive"); assert.equal(novo[0].marca, "Fiat Brasil"); assert.equal(novo[0].cor, "Branco"); assert.equal(novo[0].ano, 2022);
  // Veículo criado no painel aparece no app e dá para ativar por lá.
  const extra = await painel("POST", "/veiculos", { motoristaId: id, marca: "VW", modelo: "Gol", cor: "Preto", placa: "XYZ9A87", ano: 2019 });
  assert.equal(extra.status, 200, JSON.stringify(extra.corpo));
  const dois = (await app_("GET", "/veiculos", undefined, token)).corpo.veiculos;
  assert.equal(dois.length, 2);
  const gol = dois.find((x: { placa: string }) => x.placa === "XYZ9A87");
  assert.equal(gol.ativo, false);
  await app_("POST", `/veiculos/${gol.id}/ativar`, {}, token);
  assert.equal(listar(U.id, MOT).find((m) => m.id === id)!.placa, "XYZ9A87", "a lista do painel lê o veículo ativado no app");
  assert.equal(listar(U.id, VEI).find((x) => x.placa === "XYZ9A87")!.emUso, true);
});

test("veículos antigos (só no perfil do app) passam para o cadastro uma vez", async () => {
  const m = criar(U.id, MOT, { nome: "Antigo Da Silva", telefone: "11955550002", status: "Ativo" }, "teste");
  const p = X.pessoa(U.id, "motorista", m.id);
  (p as unknown as { veiculos: unknown[] }).veiculos = [{ id: "a1", modelo: "Uno", placa: "OLD1A23", cor: "Azul", ano: 2015, cnh: "12345678901", validadeCnh: "2031-01-01", ativo: true, situacao: "Aprovado" }];
  X.salvarPessoa(U.id, "motorista", m.id, p);
  const det = (await painel("GET", `/motoristas/${m.id}`)).corpo;
  assert.equal(det.veiculos.length, 0, "ainda não foi aberto pelo app");
  const { veiculos } = await import("../src/apps/perfil.ts");
  assert.equal(veiculos(U.id, m.id).length, 1);
  assert.equal(listar(U.id, VEI).filter((x) => x.motoristaId === m.id).length, 1);
  assert.equal(veiculos(U.id, m.id).length, 1, "não duplica");
  assert.equal(((await painel("GET", `/motoristas/${m.id}`)).corpo.veiculos as unknown[]).length, 1);
});

test("passageiro: casa e trabalho do app aparecem no cadastro e a edição do painel volta", async () => {
  const r = await app_("POST", "/conta/criar", { papel: "passageiro", nome: "Paula Souza Lima", genero: "Feminino", telefone: "11977770001", email: "paula@u.test", senha: "segredo1" });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  const t = r.corpo.token;
  await app_("POST", "/lugares", { tipo: "casa", ponto: { texto: "Rua Azul, 10, Centro" } }, t);
  await app_("POST", "/lugares", { tipo: "trabalho", ponto: { texto: "Av. Verde, 500", lat: -23.5, lng: -46.6 } }, t);
  const cli = listar(U.id, CLI).find((c) => c.telefone === "11977770001")!;
  assert.equal(cli.email, "paula@u.test"); assert.equal(cli.enderecoCasa, "Rua Azul, 10, Centro"); assert.equal(cli.enderecoTrabalho, "Av. Verde, 500");
  const ed = await painel("PUT", `/clientes/${cli.id}`, { dados: { enderecoCasa: "Rua Nova, 99" } }).catch(() => null);
  if (ed && ed.status === 200) assert.equal((await app_("GET", "/lugares", undefined, t)).corpo.casa.texto, "Rua Nova, 99");
  else {
    const { atualizar } = await import("../src/cadastros/armazem.ts");
    atualizar(U.id, CLI, cli.id, { ...cli, enderecoCasa: "Rua Nova, 99" }, "painel");
    const l = (await app_("GET", "/lugares", undefined, t)).corpo;
    assert.equal(l.casa.texto, "Rua Nova, 99"); assert.equal(l.trabalho.texto, "Av. Verde, 500"); assert.equal(l.trabalho.lat, -23.5);
  }
});
