// Gestão do grupo Cadastro: motoristas (situações, contadores, senha, financeiro), cerca eletrônica e saldo mínimo respeitados
// pelo despacho, punições, destravar, regra de cobrança, equipe e isolamento por empresa.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-gestao-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "g".repeat(40);
delete process.env.BANCO_ARQUIVO;
delete process.env.OSRM_URL;

const express = (await import("express")).default;
const D = await import("../src/servidor/dados.ts");
const { criarCookie, exigirLogin } = await import("../src/servidor/sessao.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar } = await import("../src/cadastros/armazem.ts");
const R = await import("../src/corridas/index.ts");
const P = await import("../src/apps/despacho.ts");
const B = await import("../src/servidor/banco.ts");
const G = await import("../src/gestao/rotas.ts");
const { lancar } = await import("../src/apps/extras.ts");

const app = express();
app.use(express.json());
app.post("/teste/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({ ok: true }); });
app.use("/api", exigirLogin);
app.use("/api/gestao", G.rotasGestao);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => { servidor.closeAllConnections(); servidor.close(); B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

const E = D.criarEmpresa("Gestao Um").id, E2 = D.criarEmpresa("Gestao Dois").id;
const admin = D.criarUsuario({ email: "adm@gestao.test", nome: "Adm", senha: "senha-forte-1", empresaId: E, papel: "admin" });
const oper = D.criarUsuario({ email: "op@gestao.test", nome: "Op", senha: "senha-forte-2", empresaId: E, papel: "operador" });
const admin2 = D.criarUsuario({ email: "adm2@gestao.test", nome: "Adm2", senha: "senha-forte-3", empresaId: E2, papel: "admin" });
const MOT = cadastroPorId("motoristas")!, CAT = cadastroPorId("categorias")!;
criar(E, CAT, { nome: "Carro", bandeirada: 5, valorKm: 2, valorMinimo: 8, ativa: true }, "t");
const ana = criar(E, MOT, { nome: "Ana Ativa", telefone: "11910000001", cpf: "11111111111", status: "Ativo", nivel: "Secundário" }, "t");
const bia = criar(E, MOT, { nome: "Bia Analise", telefone: "11910000002", status: "Em análise" }, "t");
criar(E, MOT, { nome: "Caio Bloq", telefone: "11910000003", status: "Bloqueado" }, "t");
criar(E, MOT, { nome: "Duda Lixo", telefone: "11910000004", status: "Lixeira" }, "t");
const outra = criar(E2, MOT, { nome: "Eva Outra", telefone: "11910000005", status: "Ativo" }, "t");

async function cookie(id: string) { return ((await fetch(`${base}/teste/entrar/${id}`, { method: "POST" })).headers.get("set-cookie") ?? "").split(";")[0]; }
async function chamar(metodo: string, url: string, quem: string, corpo?: unknown) {
  const r = await fetch(base + url, { method: metodo, headers: { cookie: quem, ...(corpo !== undefined ? { "content-type": "application/json" } : {}) }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  return { status: r.status, corpo: (await r.json().catch(() => ({}))) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const EMB = { texto: "Rua A, 1", lat: -23.55, lng: -46.63 };
async function pedir(tel: string) {
  return R.criarCorridaPropria(E, { passageiro: { nome: "Paula", telefone: tel }, embarque: EMB, destino: { texto: "Rua B", lat: -23.58, lng: -46.65 }, categoria: "Carro", pagamento: "Pix", canal: "painel" });
}
const recebe = (id: string) => P.ofertaDoMotorista(E, id) != null;
function limparOfertas() { P.ficarOffline(E, ana.id); }

test("motoristas: contadores por situação e filtros", async () => {
  const c = await cookie(admin.id);
  const r = await chamar("GET", "/api/gestao/motoristas", c);
  assert.equal(r.status, 200);
  assert.equal(r.corpo.contadores.todos, 3, "todos não conta a lixeira");
  assert.equal(r.corpo.contadores.ativos, 1);
  assert.equal(r.corpo.contadores.analise, 1);
  assert.equal(r.corpo.contadores.bloqueados, 1);
  assert.equal(r.corpo.contadores.lixeira, 1);
  const so = await chamar("GET", "/api/gestao/motoristas?aba=analise", c);
  assert.deepEqual(so.corpo.motoristas.map((m: { nome: string }) => m.nome), ["Bia Analise"]);
  const nome = await chamar("GET", "/api/gestao/motoristas?nome=ativa", c);
  assert.equal(nome.corpo.motoristas.length, 1);
  const cpf = await chamar("GET", "/api/gestao/motoristas?cpf=111.111.111-11", c);
  assert.equal(cpf.corpo.motoristas[0].nome, "Ana Ativa");
});

test("motoristas: alterar situação, nova senha e isolamento entre empresas", async () => {
  const c = await cookie(admin.id), c2 = await cookie(admin2.id);
  assert.equal((await chamar("POST", `/api/gestao/motoristas/${bia.id}/status`, c, { status: "Ativo" })).status, 200);
  assert.equal((await chamar("POST", `/api/gestao/motoristas/${bia.id}/status`, c, { status: "Voando" })).status, 400);
  assert.equal((await chamar("POST", `/api/gestao/motoristas/${bia.id}/senha`, c, { senha: "123" })).status, 400, "senha curta");
  assert.equal((await chamar("POST", `/api/gestao/motoristas/${bia.id}/senha`, c, { senha: "segredo-bia" })).status, 200);
  assert.equal((await chamar("GET", `/api/gestao/motoristas/${bia.id}`, c)).corpo.financeiro.temSenha, true);
  assert.equal((await chamar("GET", `/api/gestao/motoristas/${bia.id}`, c2)).status, 404, "outra empresa não enxerga");
  assert.equal((await chamar("GET", `/api/gestao/motoristas/${outra.id}`, c)).status, 404);
  assert.equal((await chamar("POST", `/api/gestao/motoristas/${bia.id}/status`, c, { status: "Em análise" })).status, 200);
});

test("cobrança: Padrão, Personalizado e Isento ficam no cadastro e na função regraDeCobrancaDoMotorista", async () => {
  const c = await cookie(admin.id);
  assert.deepEqual(G.regraDeCobrancaDoMotorista(E, ana.id), { tipo: "padrao" });
  const p = await chamar("PUT", `/api/gestao/motoristas/${ana.id}`, c, { financeiro: { taxa: { modo: "personalizado", tipo: "porcentagem", valor: 12.5 } } });
  assert.equal(p.status, 200, JSON.stringify(p.corpo));
  assert.deepEqual(G.regraDeCobrancaDoMotorista(E, ana.id), { tipo: "personalizado", modelo: "percentual", valor: 12.5 });
  const cad = (await chamar("GET", `/api/gestao/motoristas/${ana.id}`, c)).corpo.motorista;
  assert.equal(cad.cobranca, "Personalizado"); assert.equal(cad.cobrancaTipo, "Percentual"); assert.equal(cad.cobrancaValor, 12.5);
  await chamar("PUT", `/api/gestao/motoristas/${ana.id}`, c, { financeiro: { taxa: { modo: "personalizado", tipo: "fixo", valor: 3 } } });
  assert.deepEqual(G.regraDeCobrancaDoMotorista(E, ana.id), { tipo: "personalizado", modelo: "fixo", valor: 3 });
  assert.equal((await chamar("PUT", `/api/gestao/motoristas/${ana.id}`, c, { financeiro: { taxa: { modo: "personalizado", tipo: "porcentagem", valor: 150 } } })).status, 400, "percentual acima de 100");
  await chamar("PUT", `/api/gestao/motoristas/${ana.id}`, c, { financeiro: { taxa: { modo: "isento" } } });
  assert.deepEqual(G.regraDeCobrancaDoMotorista(E, ana.id), { tipo: "isento" });
  await chamar("PUT", `/api/gestao/motoristas/${ana.id}`, c, { financeiro: { taxa: { modo: "padrao" } } });
  assert.deepEqual(G.regraDeCobrancaDoMotorista(E, ana.id), { tipo: "padrao" });
  assert.deepEqual(G.regraDeCobrancaDoMotorista(E2, outra.id), { tipo: "padrao" });
});

test("despacho: só motorista Ativo, sem punição, dentro da cerca e com saldo mínimo recebe corrida", async () => {
  const c = await cookie(admin.id);
  // Ativo e livre recebe.
  P.ficarOnline(E, ana.id, -23.551, -46.631);
  const c1 = await pedir("11920000001");
  P.despachar(E);
  assert.ok(recebe(ana.id), "motorista ativo recebe");
  R.cancelarCorrida(E, c1.id, "Central", "teste"); limparOfertas();

  // Punido não recebe; liberado volta.
  const pu = await chamar("POST", "/api/gestao/punicoes", c, { motoristaId: ana.id, tempo: 2, unidade: "horas", motivo: "Teste" });
  assert.equal(pu.status, 200, JSON.stringify(pu.corpo));
  assert.equal((await chamar("GET", "/api/gestao/punicoes", c)).corpo.punicoes.length, 1);
  P.ficarOnline(E, ana.id, -23.551, -46.631);
  const c2 = await pedir("11920000002"); P.despachar(E);
  assert.equal(recebe(ana.id), false, "punido não recebe");
  assert.equal((await chamar("DELETE", `/api/gestao/punicoes/${pu.corpo.punicao.id}`, c)).status, 200);
  P.despachar(E);
  assert.ok(recebe(ana.id), "liberado recebe");
  R.cancelarCorrida(E, c2.id, "Central", "teste"); limparOfertas();

  // Cerca eletrônica: área de permissão longe do embarque bloqueia; área que cobre o embarque libera.
  const longe = await chamar("POST", "/api/gestao/areas", c, { nome: "Longe", poligono: [[-22, -45], [-22, -44.5], [-21.5, -44.5]] });
  const cobre = await chamar("POST", "/api/gestao/areas", c, { nome: "Cobre", poligono: [[-23.5, -46.7], [-23.5, -46.5], [-23.7, -46.6]] });
  assert.equal(longe.status, 200, JSON.stringify(longe.corpo));
  assert.equal((await chamar("PUT", `/api/gestao/motoristas/${ana.id}/cerca`, c, { permissao: longe.corpo.area.id, bloqueios: [] })).status, 200);
  P.ficarOnline(E, ana.id, -23.551, -46.631);
  const c3 = await pedir("11920000003"); P.despachar(E);
  assert.equal(recebe(ana.id), false, "fora da área de permissão");
  await chamar("PUT", `/api/gestao/motoristas/${ana.id}/cerca`, c, { permissao: cobre.corpo.area.id, bloqueios: [] });
  P.despachar(E);
  assert.ok(recebe(ana.id), "dentro da área de permissão");
  R.cancelarCorrida(E, c3.id, "Central", "teste"); limparOfertas();
  // Área de bloqueio: dentro dela não recebe.
  await chamar("PUT", `/api/gestao/motoristas/${ana.id}/cerca`, c, { permissao: null, bloqueios: [cobre.corpo.area.id] });
  P.ficarOnline(E, ana.id, -23.551, -46.631);
  const c4 = await pedir("11920000004"); P.despachar(E);
  assert.equal(recebe(ana.id), false, "dentro da área de bloqueio");
  R.cancelarCorrida(E, c4.id, "Central", "teste"); limparOfertas();
  assert.equal((await chamar("PUT", `/api/gestao/motoristas/${ana.id}/cerca`, c, { permissao: "inexistente", bloqueios: [] })).status, 400);
  await chamar("PUT", `/api/gestao/motoristas/${ana.id}/cerca`, c, { permissao: null, bloqueios: [] });
  // Operador não grava cerca.
  assert.equal((await chamar("PUT", `/api/gestao/motoristas/${ana.id}/cerca`, await cookie(oper.id), { permissao: null, bloqueios: [] })).status, 403);

  // Saldo mínimo: padrão da empresa bloqueia quem está abaixo; "desativado" no motorista libera.
  lancar(E, "motorista", ana.id, -30, "teste", "t");
  assert.equal((await chamar("PUT", "/api/gestao/config-creditos", c, { saldoMinimo: -10 })).status, 200);
  assert.equal((await chamar("GET", `/api/gestao/motoristas/${ana.id}/creditos`, c)).corpo.creditos.bloqueado, true);
  P.ficarOnline(E, ana.id, -23.551, -46.631);
  const c5 = await pedir("11920000005"); P.despachar(E);
  assert.equal(recebe(ana.id), false, "saldo abaixo do mínimo");
  await chamar("PUT", `/api/gestao/motoristas/${ana.id}/creditos`, c, { saldo: { modo: "desativado" } });
  P.despachar(E);
  assert.ok(recebe(ana.id), "sem bloqueio por saldo para este motorista");
  R.cancelarCorrida(E, c5.id, "Central", "teste"); limparOfertas();
  await chamar("PUT", `/api/gestao/motoristas/${ana.id}/creditos`, c, { saldo: { modo: "personalizado", minimo: -100 } });
  assert.equal((await chamar("GET", `/api/gestao/motoristas/${ana.id}/creditos`, c)).corpo.creditos.bloqueado, false, "limite exclusivo mais folgado");
  const l = await chamar("POST", `/api/gestao/motoristas/${ana.id}/creditos/lancar`, c, { valor: 50, descricao: "Recarga" });
  assert.equal(l.status, 200); assert.equal(l.corpo.creditos.saldo, 20);
  assert.equal((await chamar("POST", `/api/gestao/motoristas/${ana.id}/creditos/lancar`, c, { valor: 0 })).status, 400);
});

test("modo fantasma: some do mapa mas continua recebendo", async () => {
  const c = await cookie(admin.id);
  P.ficarOnline(E, ana.id, -23.551, -46.631);
  assert.ok(P.motoristasOnline(E).some((m) => m.id === ana.id));
  await chamar("PUT", `/api/gestao/motoristas/${ana.id}`, c, { dados: { fantasma: true } });
  assert.equal(P.motoristasOnline(E).some((m) => m.id === ana.id), false);
  await chamar("PUT", `/api/gestao/motoristas/${ana.id}`, c, { dados: { fantasma: false } });
  limparOfertas();
});

test("destravar: encerra a corrida parada do motorista", async () => {
  const c = await cookie(admin.id);
  process.env.GESTAO_MINUTOS_TRAVADO = "0.001";
  const corrida = await pedir("11920000009");
  R.atribuirMotorista(E, corrida.id, ana.id);
  R.mudarStatus(E, corrida.id, "a_caminho");
  await new Promise((r) => setTimeout(r, 200));
  const t = await chamar("GET", "/api/gestao/destravar", c);
  assert.equal(t.corpo.travados.length, 1);
  assert.equal(t.corpo.travados[0].nome, "Ana Ativa");
  assert.equal((await chamar("POST", `/api/gestao/destravar/${corrida.id}`, c, {})).status, 200);
  assert.equal((await chamar("GET", "/api/gestao/destravar", c)).corpo.travados.length, 0);
  assert.equal((await chamar("GET", "/api/gestao/destravar", await cookie(admin2.id))).corpo.travados.length, 0);
  delete process.env.GESTAO_MINUTOS_TRAVADO;
});

test("veículos: um em uso por motorista e o cadastro do motorista acompanha", async () => {
  const c = await cookie(admin.id);
  const v1 = await chamar("POST", "/api/gestao/veiculos", c, { motoristaId: bia.id, modelo: "Onix", cor: "Branco", placa: "abc1d23", ano: 2020 });
  const v2 = await chamar("POST", "/api/gestao/veiculos", c, { motoristaId: bia.id, modelo: "HB20", cor: "Preto", placa: "DEF4G56", ano: 2022 });
  assert.equal(v1.corpo.veiculo.emUso, true); assert.equal(v2.corpo.veiculo.emUso, false);
  await chamar("POST", `/api/gestao/veiculos/${v2.corpo.veiculo.id}/uso`, c, { emUso: true });
  const l = (await chamar("GET", "/api/gestao/veiculos", c)).corpo;
  assert.equal(l.contadores.emUso, 1); assert.equal(l.contadores.guardados, 1);
  const m = (await chamar("GET", "/api/gestao/motoristas?aba=analise", c)).corpo.motoristas[0];
  assert.equal(m.placa, "DEF4G56");
});

test("equipe: administrador cria, edita e remove; operador só consulta; outra empresa não aparece", async () => {
  const c = await cookie(admin.id), co = await cookie(oper.id);
  assert.equal((await chamar("GET", "/api/gestao/equipe", c)).corpo.equipe.length, 2);
  assert.equal((await chamar("GET", "/api/gestao/equipe", await cookie(admin2.id))).corpo.equipe.length, 1);
  assert.equal((await chamar("POST", "/api/gestao/equipe", co, { nome: "X", email: "x@gestao.test", senha: "senha-forte-9", papel: "admin" })).status, 403);
  const n = await chamar("POST", "/api/gestao/equipe", c, { nome: "Novo", email: "novo@gestao.test", senha: "senha-forte-9", papel: "operador" });
  assert.equal(n.status, 200, JSON.stringify(n.corpo));
  assert.equal(n.corpo.usuario.hash, undefined, "a senha nunca vai para o navegador");
  assert.equal((await chamar("PUT", `/api/gestao/equipe/${n.corpo.usuario.id}`, c, { papel: "admin", nome: "Novo Chefe" })).corpo.usuario.papel, "admin");
  assert.equal((await chamar("PUT", `/api/gestao/equipe/${n.corpo.usuario.id}`, c, { email: "adm@gestao.test" })).status, 400, "e-mail repetido");
  assert.equal((await chamar("PUT", `/api/gestao/equipe/${n.corpo.usuario.id}`, await cookie(admin2.id), { nome: "Invasor" })).status, 400, "outra empresa não altera");
  assert.equal((await chamar("DELETE", `/api/gestao/equipe/${admin.id}`, c)).status, 400, "não remove a si mesmo");
  assert.equal((await chamar("DELETE", `/api/gestao/equipe/${n.corpo.usuario.id}`, c)).status, 200);
});

test("passageiros, cupons, empresas, desafios e indicações respondem por empresa", async () => {
  const c = await cookie(admin.id);
  const p = await chamar("POST", "/api/gestao/passageiros", c, { nome: "Paula Passageira", telefone: "11930000001", genero: "Feminino" });
  assert.equal(p.status, 200, JSON.stringify(p.corpo));
  const lista = (await chamar("GET", "/api/gestao/passageiros", c)).corpo;
  assert.ok(lista.passageiros.some((x: { nome: string }) => x.nome === "Paula Passageira")); assert.ok(lista.contadores.Painel >= 1);
  assert.equal((await chamar("GET", "/api/gestao/passageiros", await cookie(admin2.id))).corpo.passageiros.length, 0, "outra empresa não vê");
  assert.equal((await chamar("POST", `/api/gestao/passageiros/${p.corpo.passageiro.id}/status`, c, { bloqueado: true })).corpo.passageiro.status, "Bloqueado");
  const r = await chamar("POST", `/api/gestao/passageiros/${p.corpo.passageiro.id}/restricoes`, c, { motoristaId: ana.id });
  assert.equal(r.corpo.restritos[0].nome, "Ana Ativa");

  criar(E, cadastroPorId("cupons")!, { codigo: "OLA10", tipoDesconto: "Percentual", valor: 10, ativo: true }, "t");
  const cu = (await chamar("GET", "/api/gestao/cupons", c)).corpo;
  assert.equal(cu.kpis.total, 1); assert.equal(cu.cupons[0].situacao, "Ativo");

  criar(E, cadastroPorId("conveniadas")!, { nome: "Padaria Ltda", cnpj: "12345678000100", status: "Ativa" }, "t");
  assert.equal((await chamar("GET", "/api/gestao/empresas", c)).corpo.kpis.ativas, 1);

  const d = await chamar("POST", "/api/gestao/desafios", c, { nome: "Dez corridas", tipo: "Desafio de corridas", meta: 10, premio: 20, inicio: "2026-01-01", fim: "2026-12-31" });
  assert.equal(d.status, 200, JSON.stringify(d.corpo));
  const det = await chamar("GET", `/api/gestao/desafios/${d.corpo.desafio.id}`, c);
  assert.equal(det.corpo.resumo.desafiados, 1, "só motoristas ativos da empresa");
  assert.equal((await chamar("POST", `/api/gestao/desafios/${d.corpo.desafio.id}/cancelar`, c, {})).corpo.desafio.cancelado, true);
  assert.equal((await chamar("GET", "/api/gestao/indicacoes", c)).status, 200);
});
