// Filiais: cadastro por empresa, isolamento entre empresas, cargos, vínculo de motoristas e operadores,
// filtro de corridas e relatórios por filial e Operador preso à própria filial.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-filiais-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "d".repeat(40);

const D = await import("../src/servidor/dados.ts");
const { app } = await import("../src/servidor/index.ts");
const B = await import("../src/servidor/banco.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar } = await import("../src/cadastros/armazem.ts");
const { salvarCategoria } = await import("../src/config/categorias.ts");
const C = await import("../src/corridas/index.ts");
const F = await import("../src/filiais/filiais.ts");

const A = D.criarEmpresa("Empresa A").id;
const Z = D.criarEmpresa("Empresa Z").id;
const SENHA = "senha-forte-1";
const usuarios = {
  admA: D.criarUsuario({ email: "admin-a@f.test", nome: "Admin A", senha: SENHA, empresaId: A, papel: "admin" }),
  gesA: D.criarUsuario({ email: "gestor-a@f.test", nome: "Gestor A", senha: SENHA, empresaId: A, papel: "gestor" }),
  opCentro: D.criarUsuario({ email: "op-centro@f.test", nome: "Operador Centro", senha: SENHA, empresaId: A, papel: "operador" }),
  opNorte: D.criarUsuario({ email: "op-norte@f.test", nome: "Operador Norte", senha: SENHA, empresaId: A, papel: "operador" }),
  opLivre: D.criarUsuario({ email: "op-livre@f.test", nome: "Operador Livre", senha: SENHA, empresaId: A, papel: "operador" }),
  admZ: D.criarUsuario({ email: "admin-z@f.test", nome: "Admin Z", senha: SENHA, empresaId: Z, papel: "admin" }),
};
const srv = app.listen(0);
const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
test.after(() => { srv.closeAllConnections(); srv.close(); B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

const cookies: Record<string, string> = {};
for (const [k, u] of Object.entries(usuarios)) {
  const r = await fetch(`${base}/api/entrar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: u.email, senha: SENHA }) });
  cookies[k] = (r.headers.get("set-cookie") ?? "").split(";")[0];
}
async function api(quem: string, metodo: string, url: string, corpo?: unknown) {
  const r = await fetch(base + url, { method: metodo, headers: { "Content-Type": "application/json", Cookie: cookies[quem] }, body: corpo === undefined || metodo === "GET" ? undefined : JSON.stringify(corpo) });
  return { status: r.status, corpo: (await r.json().catch(() => ({}))) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

let centro = "", norte = "", zFilial = "";
const motCentro = criar(A, cadastroPorId("motoristas")!, { nome: "Motorista Centro", telefone: "11980000001", status: "Ativo" }, "t");
const motNorte = criar(A, cadastroPorId("motoristas")!, { nome: "Motorista Norte", telefone: "11980000002", status: "Ativo" }, "t");
const motZ = criar(Z, cadastroPorId("motoristas")!, { nome: "Motorista Z", telefone: "11980000003", status: "Ativo" }, "t");
for (const e of [A, Z]) salvarCategoria(e, null, { nome: "Pop", taxaBase: 5, precoKm: 2, tarifaMinima: 8, comissaoTipo: "Percentual", comissaoValor: 10 }, "t");

test("cadastro: o Gestor cria e edita; o Operador não; nome repetido e vazio são recusados", async () => {
  assert.equal((await api("opCentro", "POST", "/api/filiais", { nome: "Centro" })).status, 403);
  assert.equal((await api("opCentro", "GET", "/api/filiais")).status, 403);
  const c = await api("gesA", "POST", "/api/filiais", { nome: "Centro", cidade: "Leme", endereco: "Rua A, 10", responsavel: "Maria", telefone: "(19) 99999-0000", ativa: true });
  assert.equal(c.status, 201);
  centro = c.corpo.filial.id;
  assert.equal(c.corpo.filial.cidade, "Leme");
  norte = (await api("admA", "POST", "/api/filiais", { nome: "Norte", cidade: "Pirassununga" })).corpo.filial.id;
  assert.equal((await api("admA", "POST", "/api/filiais", { nome: "centro" })).status, 400, "nome repetido");
  assert.equal((await api("admA", "POST", "/api/filiais", { nome: " " })).status, 400);
  const ed = await api("gesA", "PUT", `/api/filiais/${norte}`, { responsavel: "João", ativa: false });
  assert.equal(ed.corpo.filial.responsavel, "João");
  assert.equal(ed.corpo.filial.ativa, false);
  assert.equal(ed.corpo.filial.nome, "Norte", "o que não veio fica como está");
  await api("gesA", "PUT", `/api/filiais/${norte}`, { ativa: true });
});

test("isolamento: outra empresa não vê, não edita, não apaga e não liga ninguém a filial alheia", async () => {
  zFilial = (await api("admZ", "POST", "/api/filiais", { nome: "Centro" })).corpo.filial.id; // mesmo nome em outra empresa pode
  assert.ok(zFilial);
  const listaZ = (await api("admZ", "GET", "/api/filiais")).corpo.filiais;
  assert.deepEqual(listaZ.map((f: { id: string }) => f.id), [zFilial]);
  assert.equal((await api("admZ", "GET", `/api/filiais/${centro}`)).status, 404);
  assert.equal((await api("admZ", "PUT", `/api/filiais/${centro}`, { nome: "Invadida" })).status, 404);
  assert.equal((await api("admZ", "DELETE", `/api/filiais/${centro}`)).status, 404);
  assert.equal((await api("admZ", "POST", `/api/filiais/${centro}/motoristas`, { ids: [motZ.id] })).status, 404);
  // motorista de outra empresa não entra na minha filial
  assert.equal((await api("admA", "POST", `/api/filiais/${centro}/motoristas`, { ids: [motZ.id] })).status, 404);
  assert.equal((await api("admA", "GET", `/api/filiais/${centro}`)).corpo.filial.nome, "Centro");
  assert.equal(F.listarFiliais(A).length, 2);
  assert.equal(F.listarFiliais(Z).length, 1);
});

test("vínculos: motorista e operador ficam em uma filial só; soltar e remover limpam", async () => {
  assert.equal((await api("gesA", "POST", `/api/filiais/${centro}/motoristas`, { ids: [motCentro.id] })).corpo.ligados, 1);
  await api("gesA", "POST", `/api/filiais/${norte}/motoristas`, { ids: [motNorte.id] });
  await api("gesA", "POST", `/api/filiais/${centro}/operadores`, { ids: [usuarios.opCentro.id] });
  await api("gesA", "POST", `/api/filiais/${norte}/operadores`, { ids: [usuarios.opNorte.id] });
  assert.equal((await api("gesA", "POST", `/api/filiais/${centro}/motoristas`, { ids: [] })).status, 400);
  // mover o motorista de filial
  await api("gesA", "POST", `/api/filiais/${norte}/motoristas`, { ids: [motCentro.id] });
  assert.equal(F.filialDe(A, "motorista", motCentro.id), norte);
  await api("gesA", "POST", `/api/filiais/${centro}/motoristas`, { ids: [motCentro.id] });
  const lista = (await api("gesA", "GET", "/api/filiais")).corpo.filiais;
  const c = lista.find((f: { id: string }) => f.id === centro);
  assert.equal(c.motoristas, 1);
  assert.equal(c.operadores, 1);
  const det = await api("gesA", "GET", `/api/filiais/${centro}`);
  assert.equal(det.corpo.motoristas[0].nome, "Motorista Centro");
  assert.ok(det.corpo.equipeLivre.every((u: { papel: string }) => u.papel !== "plataforma"));
  // soltar
  await api("gesA", "DELETE", `/api/filiais/${centro}/motoristas/${motCentro.id}`);
  assert.equal(F.filialDe(A, "motorista", motCentro.id), null);
  await api("gesA", "POST", `/api/filiais/${centro}/motoristas`, { ids: [motCentro.id] });
});

test("Equipe: a tela mostra e muda a filial de cada usuário", async () => {
  const eq = await api("admA", "GET", "/api/gestao/equipe");
  assert.equal(eq.corpo.equipe.find((u: { id: string }) => u.id === usuarios.opCentro.id).filialId, centro);
  assert.ok(eq.corpo.filiais.length === 2);
  const novo = await api("admA", "POST", "/api/gestao/equipe", { nome: "Novo Op", email: "novo-op@f.test", senha: SENHA, papel: "operador", filialId: norte });
  assert.equal(novo.corpo.usuario.filialId, norte);
  const tira = await api("admA", "PUT", `/api/gestao/equipe/${novo.corpo.usuario.id}`, { filialId: "" });
  assert.equal(tira.corpo.usuario.filialId, "");
  assert.equal((await api("admA", "PUT", `/api/gestao/equipe/${novo.corpo.usuario.id}`, { filialId: zFilial })).status, 404, "filial de outra empresa");
});

async function corrida(empresa: string, tel: string, motorista: { id: string }, valor: number, filialId?: string) {
  const c = await C.criarCorridaPropria(empresa, { passageiro: { nome: `Pass ${tel}`, telefone: `1191${tel}` }, embarque: { texto: "Rua A, 1" }, destino: { texto: "Rua B, 2" }, categoria: "Pop", pagamento: "Pix", canal: "painel", distanciaKm: 5, ...(filialId ? { filialId } : {}) } as never, "t");
  C.atribuirMotorista(empresa, c.id, motorista.id, "t");
  C.mudarStatus(empresa, c.id, "a_caminho"); C.mudarStatus(empresa, c.id, "no_local"); C.mudarStatus(empresa, c.id, "em_andamento");
  C.mudarStatus(empresa, c.id, "finalizada", { valor });
  return c;
}

test("corrida: ganha a filial de quem pediu ou, sem ela, a do motorista", async () => {
  const c1 = await corrida(A, "00000001", motCentro, 10);
  const c2 = await corrida(A, "00000002", motNorte, 20);
  const c3 = await corrida(A, "00000003", motNorte, 40, centro); // pedida no Centro, atendida por motorista do Norte
  const guardada = (id: string) => C.listarProprias(A).find((x) => x.id === id)?.filialId;
  assert.equal(guardada(c1.id), centro);
  assert.equal(guardada(c2.id), norte);
  assert.equal(guardada(c3.id), centro, "quem pediu manda");
  // filial de outra empresa é ignorada
  const c4 = await corrida(A, "00000004", motCentro, 5, zFilial);
  assert.equal(guardada(c4.id), centro, "valeu o motorista; a filial alheia não gruda");
});

test("Histórico: filtrar por filial mostra só as corridas dela", async () => {
  const todas = await api("admA", "GET", "/api/operacao/historico?rapido=hoje&fonte=propria");
  assert.equal(todas.corpo.total, 4);
  assert.deepEqual(todas.corpo.opcoes.filiais.map((f: { nome: string }) => f.nome).sort(), ["Centro", "Norte"]);
  const c = await api("admA", "GET", `/api/operacao/historico?rapido=hoje&fonte=propria&filial=${centro}`);
  assert.equal(c.corpo.total, 3);
  const n = await api("admA", "GET", `/api/operacao/historico?rapido=hoje&fonte=propria&filial=${norte}`);
  assert.equal(n.corpo.total, 1);
  assert.equal((await api("admA", "GET", `/api/operacao/historico?rapido=hoje&fonte=propria&filial=${zFilial}`)).corpo.total, 0, "filial alheia não casa com nada");
});

test("Operador ligado a uma filial só enxerga as corridas dela, mesmo pedindo outra", async () => {
  const meu = await api("opNorte", "GET", `/api/operacao/historico?rapido=hoje&fonte=propria&filial=${centro}`);
  assert.equal(meu.corpo.total, 1, "o filtro forjado para outra filial é ignorado");
  assert.equal((await api("opCentro", "GET", "/api/operacao/historico?rapido=hoje&fonte=propria")).corpo.total, 3);
  assert.equal((await api("opLivre", "GET", "/api/operacao/historico?rapido=hoje&fonte=propria")).corpo.total, 4, "sem filial vê tudo");
});

test("Relatórios: filtro por filial e Operador preso à filial dele", async () => {
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const q = (extra = "") => `/api/relatorios/relatorio/os-motorista?inicio=${hoje}&fim=${hoje}${extra}`;
  const geral = await api("admA", "GET", q());
  const soNorte = await api("admA", "GET", q(`&filial=${norte}`));
  assert.equal(geral.status, 200);
  assert.ok(geral.corpo.total > soNorte.corpo.total, "a filial reduz o resultado");
  const def = await api("admA", "GET", "/api/relatorios/definicoes");
  assert.equal(def.corpo.opcoes.filiais.length, 2);
  // O Gestor não vê o relatório financeiro (403) nem com filtro; vale a regra do cargo antes da filial.
  assert.equal((await api("gesA", "GET", q())).status, 403);
});

test("remover a filial solta as pessoas e deixa as corridas como estão", async () => {
  const extra = (await api("admA", "POST", "/api/filiais", { nome: "Temporária" })).corpo.filial.id;
  await api("admA", "POST", `/api/filiais/${extra}/operadores`, { ids: [usuarios.opLivre.id] });
  assert.equal(F.filialDe(A, "operador", usuarios.opLivre.id), extra);
  assert.equal((await api("admA", "DELETE", `/api/filiais/${extra}`)).status, 200);
  assert.equal(F.filialDe(A, "operador", usuarios.opLivre.id), null);
  assert.equal(F.listarFiliais(A).length, 2);
});

test("filiais dos dois lados nunca se misturam (contagem do banco)", () => {
  assert.equal(F.pessoasDaFilial(Z, centro, "motorista").length, 0);
  assert.equal(F.pessoasDaFilial(A, centro, "motorista").length, 1);
});
