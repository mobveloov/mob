// Cadastros completos da Machine: motorista (validações, dados bancários só do admin, pagamentos e exigências, documentos,
// deslogar, excluir, alteração em massa, filtros novos, exportar) e empresa (documento, endereço, categorias e pagamentos
// permitidos, situação), sempre por empresa.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-cadmot-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "c".repeat(40);
delete process.env.BANCO_ARQUIVO;
delete process.env.OSRM_URL;

const express = (await import("express")).default;
const D = await import("../src/servidor/dados.ts");
const { criarCookie, exigirLogin } = await import("../src/servidor/sessao.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar } = await import("../src/cadastros/armazem.ts");
const B = await import("../src/servidor/banco.ts");
const G = await import("../src/gestao/rotas.ts");
const V = await import("../src/gestao/validacao.ts");
const P = await import("../src/apps/despacho.ts");
const X = await import("../src/apps/extras.ts");

const app = express();
app.use(express.json());
app.post("/teste/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({ ok: true }); });
app.use("/api", exigirLogin);
app.use("/api/gestao", G.rotasGestao);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => { servidor.closeAllConnections(); servidor.close(); B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

const E = D.criarEmpresa("Cad Um").id, E2 = D.criarEmpresa("Cad Dois").id;
const admin = D.criarUsuario({ email: "adm@cad.test", nome: "Adm", senha: "senha-forte-1", empresaId: E, papel: "admin" });
const oper = D.criarUsuario({ email: "op@cad.test", nome: "Op", senha: "senha-forte-2", empresaId: E, papel: "operador" });
const admin2 = D.criarUsuario({ email: "adm2@cad.test", nome: "Adm2", senha: "senha-forte-3", empresaId: E2, papel: "admin" });
criar(E, cadastroPorId("categorias")!, { nome: "Carro", bandeirada: 5, valorKm: 2, valorMinimo: 8, ativa: true }, "t");
criar(E, cadastroPorId("categorias")!, { nome: "Moto", bandeirada: 3, valorKm: 1, valorMinimo: 5, ativa: true }, "t");

async function cookie(id: string) { return ((await fetch(`${base}/teste/entrar/${id}`, { method: "POST" })).headers.get("set-cookie") ?? "").split(";")[0]; }
async function chamar(metodo: string, url: string, quem: string, corpo?: unknown) {
  const r = await fetch(base + url, { method: metodo, headers: { cookie: quem, ...(corpo !== undefined ? { "content-type": "application/json" } : {}) }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  const tipo = r.headers.get("content-type") ?? "";
  return { status: r.status, corpo: (tipo.includes("json") ? await r.json().catch(() => ({})) : await r.text()) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const CPF_OK = "529.982.247-25", CNPJ_OK = "11.222.333/0001-81";

test("validações: CPF, CNPJ, telefone, placa e RENAVAM", () => {
  assert.equal(V.cpfValido(CPF_OK), true);
  assert.equal(V.cpfValido("529.982.247-26"), false);
  assert.equal(V.cpfValido("111.111.111-11"), false);
  assert.equal(V.cnpjValido(CNPJ_OK), true);
  assert.equal(V.cnpjValido("11222333000182"), false);
  assert.equal(V.telefoneValido("(19) 99756-6226"), true);
  assert.equal(V.telefoneValido("+55 19 99756-6226"), true);
  assert.equal(V.telefoneValido("12345"), false);
  assert.equal(V.placaValida("ABC-1234"), true);
  assert.equal(V.placaValida("ABC1D23"), true);
  assert.equal(V.placaValida("AB12"), false);
  assert.equal(V.renavamValido("12345678901"), true);
  assert.equal(V.renavamValido("123"), false);
});

test("motorista: cria com dados completos, valida em português e não repete CPF", async () => {
  const c = await cookie(admin.id);
  const ruim = await chamar("POST", "/api/gestao/motoristas", c, { dados: { nome: "Zeca", telefone: "19997566226", cpf: "529.982.247-26", status: "Ativo" } });
  assert.equal(ruim.status, 400); assert.match(ruim.corpo.erro, /CPF inválido/);
  assert.equal((await chamar("POST", "/api/gestao/motoristas", c, { dados: { nome: "Zeca", telefone: "123", status: "Ativo" } })).status, 400);
  assert.equal((await chamar("POST", "/api/gestao/motoristas", c, { dados: { nome: "Zeca", telefone: "19997566226", email: "sem-arroba", status: "Ativo" } })).status, 400);
  const ok = await chamar("POST", "/api/gestao/motoristas", c, { dados: {
    nome: "Zeca Motorista", telefone: "(19) 99756-6226", cpf: CPF_OK, email: "Zeca@Teste.com", nascimento: "1990-05-10", genero: "Prefiro não responder", nivel: "Prioritário", tipoVinculo: "Auxiliar",
    endereco: "Rua das Flores", numero: "10", cep: "13610-000", uf: "sp", cidade: "Leme", bairro: "Centro", referencia: "Perto da praça", tipoChavePix: "CPF", chavePix: CPF_OK,
    bancoCpfTitular: CPF_OK, bancoNomeTitular: "Zeca", ocupacao: "Motorista", renda: "3500,50", bancoNumero: "341", bancoAgencia: "1234", bancoConta: "998877", bancoContaDv: "0",
    obsInterna1: "Chegou por indicação", status: "Em análise",
  }, pagamentos: ["Dinheiro", "Pix"] });
  assert.equal(ok.status, 200, JSON.stringify(ok.corpo));
  const m = ok.corpo.motorista;
  assert.equal(m.cpf, "52998224725"); assert.equal(m.telefone, "19997566226"); assert.equal(m.uf, "SP"); assert.equal(m.tipoVinculo, "Auxiliar"); assert.equal(m.renda, 3500.5);
  assert.equal(m.aceitaPagamentos, "Dinheiro, Pix"); assert.ok(m.statusMudouEm);
  const rep = await chamar("POST", "/api/gestao/motoristas", c, { dados: { nome: "Outro", telefone: "19988887777", cpf: CPF_OK, status: "Ativo" } });
  assert.equal(rep.status, 400); assert.match(rep.corpo.erro, /CPF/);
  // aparece na lista e na edição
  const det = (await chamar("GET", `/api/gestao/motoristas/${m.id}`, c)).corpo;
  assert.equal(det.motorista.bancoNumero, "341"); assert.deepEqual(det.preferencias.pagamentos, ["Dinheiro", "Pix"]);
  assert.ok(X.pessoa(E, "motorista", m.id).pagamentos.includes("Pix"), "o despacho lê o perfil do app");
  assert.equal(det.status.logado, false);
  assert.equal((await chamar("GET", `/api/gestao/motoristas/${m.id}`, await cookie(admin2.id))).status, 404, "outra empresa não enxerga");
});

test("motorista: dados bancários só o administrador grava e o operador vê mascarado", async () => {
  const ca = await cookie(admin.id), co = await cookie(oper.id);
  const m = (await chamar("POST", "/api/gestao/motoristas", ca, { dados: { nome: "Bia Banco", telefone: "19911112222", status: "Ativo", bancoConta: "998877", bancoAgencia: "1234", renda: 100 } })).corpo.motorista;
  const op = await chamar("PUT", `/api/gestao/motoristas/${m.id}`, co, { dados: { bancoConta: "111111", renda: 9999, ocupacao: "X", observacao: "ok do operador" } });
  assert.equal(op.status, 200);
  const v = (await chamar("GET", `/api/gestao/motoristas/${m.id}`, ca)).corpo.motorista;
  assert.equal(v.bancoConta, "998877"); assert.equal(v.renda, 100); assert.equal(v.observacao, "ok do operador");
  const vo = (await chamar("GET", `/api/gestao/motoristas/${m.id}`, co)).corpo.motorista;
  assert.equal(vo.bancoConta, "****77", "operador vê só o fim da conta");
  assert.equal((await chamar("PUT", `/api/gestao/motoristas/${m.id}`, ca, { dados: { bancoConta: "abc" } })).status, 400);
});

test("motorista: veículo com RENAVAM e licenciamento, filtros por relação e licenciamento, exportar", async () => {
  const c = await cookie(admin.id);
  const m = (await chamar("POST", "/api/gestao/motoristas", c, { dados: { nome: "Caio Carro", telefone: "19922223333", status: "Ativo", nivel: "Secundário" } })).corpo.motorista;
  assert.equal((await chamar("POST", "/api/gestao/veiculos", c, { motoristaId: m.id, modelo: "Onix", cor: "Branco", placa: "XX", ano: 2020 })).status, 400);
  assert.equal((await chamar("POST", "/api/gestao/veiculos", c, { motoristaId: m.id, modelo: "Onix", cor: "Branco", placa: "ABC1D23", ano: 2020, renavam: "12" })).status, 400);
  const v = await chamar("POST", "/api/gestao/veiculos", c, { motoristaId: m.id, modelo: "Onix", cor: "Branco", placa: "abc-1d23", ano: 2020, anoExercicio: 2026, ufEmplacamento: "sp", cidadeEmplacamento: "Leme", renavam: "12345678901", validadeLicenciamento: "2020-01-01", veiculoProprio: "Sim" });
  assert.equal(v.status, 200, JSON.stringify(v.corpo));
  assert.equal(v.corpo.veiculo.placa, "ABC1D23"); assert.equal(v.corpo.veiculo.ufEmplacamento, "SP");
  const ed = await chamar("PUT", `/api/gestao/veiculos/${v.corpo.veiculo.id}`, c, { modelo: "Onix Plus", validadeLicenciamento: "2999-01-01" });
  assert.equal(ed.status, 200, JSON.stringify(ed.corpo)); assert.equal(ed.corpo.veiculo.modelo, "Onix Plus");
  const venc = await chamar("GET", "/api/gestao/motoristas?licenciamento=valida", c);
  assert.ok(venc.corpo.motoristas.some((x: { id: string }) => x.id === m.id), "licenciamento válido");
  assert.ok(!(await chamar("GET", "/api/gestao/motoristas?licenciamento=vencida", c)).corpo.motoristas.some((x: { id: string }) => x.id === m.id));
  assert.ok((await chamar("GET", "/api/gestao/motoristas?relacao=Secundário", c)).corpo.motoristas.some((x: { id: string }) => x.id === m.id));
  assert.ok(!(await chamar("GET", "/api/gestao/motoristas?relacao=Prioritário", c)).corpo.motoristas.some((x: { id: string }) => x.id === m.id));
  const csv = await chamar("GET", "/api/gestao/motoristas-exportar?nome=caio", c);
  assert.equal(csv.status, 200); assert.match(csv.corpo, /Caio Carro/); assert.match(csv.corpo, /Validade do licenciamento/);
});

test("motorista: documentos extras, excluir documento, deslogar, excluir e alteração em massa", async () => {
  const c = await cookie(admin.id);
  const a = (await chamar("POST", "/api/gestao/motoristas", c, { dados: { nome: "Dani Doc", telefone: "19933334444", status: "Ativo" } })).corpo.motorista;
  const b = (await chamar("POST", "/api/gestao/motoristas", c, { dados: { nome: "Edu Em Massa", telefone: "19944445555", status: "Ativo" } })).corpo.motorista;
  const det = (await chamar("GET", `/api/gestao/motoristas/${a.id}`, c)).corpo;
  for (const t of ["cnh", "residencia", "antecedentes", "alvara", "autonomiaFrente", "autonomiaVerso", "fotoVeiculo"]) assert.ok(det.documentos.some((d: { tipo: string }) => d.tipo === t), `documento ${t}`);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==", "base64");
  const env = await fetch(`${base}/api/gestao/motoristas/${a.id}/documentos/alvara`, { method: "POST", headers: { cookie: c, "content-type": "image/png" }, body: png });
  assert.equal(env.status, 200, await env.text());
  assert.equal((await chamar("GET", `/api/gestao/motoristas/${a.id}`, c)).corpo.documentos.find((d: { tipo: string }) => d.tipo === "alvara").enviado, true);
  assert.equal((await chamar("DELETE", `/api/gestao/motoristas/${a.id}/documentos/alvara`, c)).status, 200);
  assert.equal((await chamar("DELETE", `/api/gestao/motoristas/${a.id}/documentos/alvara`, c)).status, 400, "já excluído");
  assert.equal((await chamar("GET", `/api/gestao/motoristas/${a.id}`, c)).corpo.documentos.find((d: { tipo: string }) => d.tipo === "alvara").enviado, false);

  // deslogar
  assert.equal((await chamar("POST", `/api/gestao/motoristas/${a.id}/deslogar`, c, {})).status, 400, "não está logado");
  P.ficarOnline(E, a.id, -23.55, -46.63);
  assert.equal((await chamar("GET", `/api/gestao/motoristas/${a.id}`, c)).corpo.status.logado, true);
  assert.equal((await chamar("POST", `/api/gestao/motoristas/${a.id}/deslogar`, c, {})).status, 200);
  assert.equal(P.estaOnline(E, a.id), false);

  // massa
  const m1 = await chamar("POST", "/api/gestao/motoristas-massa", c, { ids: [a.id, b.id, "inexistente"], acao: "nivel", valor: "Reserva" });
  assert.equal(m1.status, 200); assert.equal(m1.corpo.alterados, 2);
  assert.equal((await chamar("GET", `/api/gestao/motoristas/${b.id}`, c)).corpo.motorista.nivel, "Reserva");
  assert.equal((await chamar("POST", "/api/gestao/motoristas-massa", c, { ids: [a.id], acao: "status", valor: "Voando" })).status, 400);
  assert.equal((await chamar("POST", "/api/gestao/motoristas-massa", c, { ids: [], acao: "status", valor: "Ativo" })).status, 400);
  assert.equal((await chamar("POST", "/api/gestao/motoristas-massa", await cookie(admin2.id), { ids: [a.id], acao: "status", valor: "Inativo" })).corpo.alterados, 0, "outra empresa não altera");

  // excluir = lixeira
  const ex = await chamar("DELETE", `/api/gestao/motoristas/${b.id}`, c);
  assert.equal(ex.status, 200); assert.equal(ex.corpo.motorista.status, "Lixeira");
});

test("empresa: cria com CNPJ válido, endereço, categorias e pagamentos permitidos; só admin grava", async () => {
  const c = await cookie(admin.id), co = await cookie(oper.id);
  const base0 = { nome: "Padaria Pão Quente", cnpj: CNPJ_OK, numeroContrato: "CT-001", razaoSocial: "Pão Quente Ltda" };
  assert.equal((await chamar("POST", "/api/gestao/empresas", co, base0)).status, 403, "operador não grava");
  assert.match((await chamar("POST", "/api/gestao/empresas", c, { ...base0, cnpj: "11222333000182" })).corpo.erro, /CNPJ inválido/);
  assert.match((await chamar("POST", "/api/gestao/empresas", c, { ...base0, tipoDocumento: "CPF" })).corpo.erro, /CPF inválido/);
  assert.match((await chamar("POST", "/api/gestao/empresas", c, { nome: "Sem contrato", cnpj: CNPJ_OK })).corpo.erro, /contrato/);
  assert.match((await chamar("POST", "/api/gestao/empresas", c, { ...base0, email: "x" })).corpo.erro, /E-mail/);
  assert.match((await chamar("POST", "/api/gestao/empresas", c, { ...base0, categoriasPermitidas: "Foguete" })).corpo.erro, /Categoria/);
  assert.match((await chamar("POST", "/api/gestao/empresas", c, { ...base0, pagamentosPermitidos: [{ tipo: "Ouro", desconto: 1 }] })).corpo.erro, /inválido/);
  assert.match((await chamar("POST", "/api/gestao/empresas", c, { ...base0, pagamentosPermitidos: [{ tipo: "Pix", desconto: 150 }] })).corpo.erro, /Desconto/);
  const ok = await chamar("POST", "/api/gestao/empresas", c, { ...base0, email: "contato@pao.com", telefone: "(19) 3553-1000", cep: "13610-000", uf: "SP", cidade: "Leme", bairro: "Centro", endereco: "Rua A", enderecoNumero: "5",
    status: "Aguardando ativação", permiteEspecificarMotorista: "Não", categoriasPermitidas: "Carro", pagamentosPermitidos: [{ tipo: "Dinheiro", desconto: 5 }, { tipo: "Pix", desconto: 10 }],
    obsMotorista: "Entrar pelos fundos", dadosExtras: [{ chave: "Setor", valor: "Compras" }] });
  assert.equal(ok.status, 200, JSON.stringify(ok.corpo));
  const e = ok.corpo.empresa;
  assert.equal(e.cnpj, "11222333000181"); assert.equal(e.cep, "13610000"); assert.equal(e.bandeira, "Cad Um");
  assert.deepEqual(JSON.parse(e.pagamentosPermitidos), [{ tipo: "Dinheiro", desconto: 5 }, { tipo: "Pix", desconto: 10 }]);
  assert.match((await chamar("POST", "/api/gestao/empresas", c, { ...base0, nome: "Outra" })).corpo.erro, /Já existe/, "documento repetido");

  // lista, filtros e exportar
  const l = (await chamar("GET", "/api/gestao/empresas?documento=11.222.333&status=Aguardando%20ativa%C3%A7%C3%A3o", c)).corpo;
  assert.equal(l.empresas.length, 1); assert.deepEqual(l.opcoes.categorias, ["Carro", "Moto"]);
  assert.equal((await chamar("GET", "/api/gestao/empresas?status=Ativa", c)).corpo.empresas.length, 0);
  assert.match((await chamar("GET", "/api/gestao/empresas-exportar", c)).corpo, /Padaria Pão Quente/);
  assert.equal((await chamar("GET", "/api/gestao/empresas", await cookie(admin2.id))).corpo.empresas.length, 0, "outra empresa não vê");

  // edição e exclusão (Encerrada)
  const ed = await chamar("PUT", `/api/gestao/empresas/${e.id}`, c, { status: "Ativa", desconto: 3 });
  assert.equal(ed.status, 200, JSON.stringify(ed.corpo)); assert.equal(ed.corpo.empresa.status, "Ativa"); assert.equal(ed.corpo.empresa.categoriasPermitidas, "Carro");
  assert.equal((await chamar("PUT", `/api/gestao/empresas/${e.id}`, c, { desconto: 500 })).status, 400);
  assert.equal((await chamar("DELETE", `/api/gestao/empresas/${e.id}`, co)).status, 403);
  assert.equal((await chamar("DELETE", `/api/gestao/empresas/${e.id}`, c)).corpo.empresa.status, "Encerrada");
});
