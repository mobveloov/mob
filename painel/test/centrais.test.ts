// Centrais: rede principal/associadas, isolamento entre centrais e papéis, controle financeiro, planos e Demonstrativo Mensal.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-centrais-"));
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
const R = await import("../src/centrais/rede.ts");
const CO = await import("../src/centrais/cobranca.ts");
const { rotasCentrais } = await import("../src/centrais/rotas.ts");
const { celulaCsv } = await import("../src/config/financeiro-visao.ts");

const app = express();
app.use(express.json());
app.post("/teste/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({ ok: true }); });
app.use("/api", exigirLogin);
app.use("/api/centrais", rotasCentrais);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => { servidor.closeAllConnections(); servidor.close(); B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

// Rede 1: P (principal) com A e B. Rede 2: X (isolada). Y fica livre para o teste de vínculo da plataforma.
const P = D.criarEmpresa("Rede Principal").id, A = D.criarEmpresa("Rede Filha A").id, Bc = D.criarEmpresa("Rede Filha B").id;
const X = D.criarEmpresa("Outra Rede").id, Y = D.criarEmpresa("Livre Y").id;
R.vincular(P, A); R.vincular(P, Bc);
const usuario = (email: string, empresaId: string, papel: "admin" | "operador" | "plataforma") => D.criarUsuario({ email, nome: email, senha: "senha-forte-1", empresaId, papel });
const ids = {
  admP: usuario("adm-p@c.test", P, "admin"), opP: usuario("op-p@c.test", P, "operador"), admA: usuario("adm-a@c.test", A, "admin"),
  admB: usuario("adm-b@c.test", Bc, "admin"), admX: usuario("adm-x@c.test", X, "admin"), plat: usuario("plat@c.test", P, "plataforma"),
};
const cookies: Record<string, string> = {};
for (const [k, u] of Object.entries(ids)) cookies[k] = ((await fetch(`${base}/teste/entrar/${u.id}`, { method: "POST" })).headers.get("set-cookie") ?? "").split(";")[0];
async function api(quem: string, metodo: string, url: string, corpo?: unknown, extra: Record<string, string> = {}) {
  const r = await fetch(`${base}/api/centrais${url}`, { method: metodo, headers: { cookie: cookies[quem], "content-type": "application/json", ...extra }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  const tipo = r.headers.get("content-type") ?? "";
  return { status: r.status, tipo, texto: tipo.includes("json") ? "" : await r.text(), corpo: (tipo.includes("json") ? await r.json() : {}) as Record<string, any> };
}

// corridas finalizadas por empresa (para o demonstrativo)
async function corridaFinalizada(emp: string, valor: number, tel: string, nomeMot: string) {
  const mot = criar(emp, cadastroPorId("motoristas")!, { nome: nomeMot, telefone: `1198${tel}`, status: "Ativo" }, "t");
  const c = await C.criarCorridaPropria(emp, { passageiro: { nome: `Pass ${tel}`, telefone: `1191${tel}` }, embarque: { texto: "Rua A, 1" }, destino: { texto: "Rua B, 2" }, categoria: "Pop", pagamento: "Pix", canal: "painel", distanciaKm: 5 } as never, "t");
  C.atribuirMotorista(emp, c.id, mot.id, "t");
  C.mudarStatus(emp, c.id, "a_caminho"); C.mudarStatus(emp, c.id, "no_local"); C.mudarStatus(emp, c.id, "em_andamento");
  C.mudarStatus(emp, c.id, "finalizada", { valor });
}
for (const e of [P, A, Bc, X]) salvarCategoria(e, null, { nome: "Pop", taxaBase: 5, precoKm: 2, tarifaMinima: 8, comissaoTipo: "Percentual", comissaoValor: 10 }, "t");
await corridaFinalizada(A, 10, "00000001", "Motorista Sigilo Alfa");
await corridaFinalizada(A, 40, "00000002", "Motorista Sigilo Alfa");
await corridaFinalizada(Bc, 20, "00000003", "Motorista Beta");
await corridaFinalizada(P, 30, "00000004", "Motorista Principal");
const COMP = CO.competenciaAtual();

test("vínculos: só um nível, sem ciclo e sem pegar central de outra rede", () => {
  assert.equal(R.papelNaRede(P), "principal");
  assert.equal(R.papelNaRede(A), "associada");
  assert.equal(R.papelNaRede(X), "isolada");
  assert.throws(() => R.vincular(A, Y), /já é associada/);
  assert.throws(() => R.vincular(Y, P), /principal de outras/);
  assert.throws(() => R.vincular(P, A), /já está associada/);
  assert.throws(() => R.vincular(Y, Y), /dela mesma/);
  assert.throws(() => R.vincular("nao-existe", Y), /não encontrada/);
  assert.throws(() => R.vincular(X, Bc), /já está associada/, "B continua só na rede do P");
  assert.deepEqual(R.associadasDe(P).sort(), [A, Bc].sort());
});

test("podeVer: própria e principal sim; irmã, outra rede e a principal vista pela filha não", () => {
  assert.ok(R.podeVer(P, P) && R.podeVer(P, A) && R.podeVer(P, Bc) && R.podeVer(A, A));
  assert.ok(!R.podeVer(A, Bc) && !R.podeVer(A, P) && !R.podeVer(A, X) && !R.podeVer(P, X) && !R.podeVer(X, A) && !R.podeVer(P, "nao-existe"));
});

test("seletor: a principal vê a rede; a associada, o operador e a central isolada não recebem lista", async () => {
  const p = await api("admP", "GET", "/seletor");
  assert.equal(p.status, 200);
  assert.equal(p.corpo.centrais[0].id, P);
  assert.deepEqual(p.corpo.centrais.slice(1).map((c: any) => c.id).sort(), [A, Bc].sort());
  assert.equal(p.corpo.centrais[0].tipo, "principal");
  assert.match(p.corpo.centrais[0].rotulo, /^\d+ - Rede Principal$/);
  for (const quem of ["admA", "admX", "opP"]) assert.deepEqual((await api(quem, "GET", "/seletor")).corpo.centrais, [], quem);
});

test("papéis: operador não acessa nada de cobrança; sem login nem entra", async () => {
  for (const url of ["/rede", "/controle", "/planos", "/demonstrativo", `/extrato/${P}`]) assert.equal((await api("opP", "GET", url)).status, 403, url);
  assert.equal((await api("opP", "POST", "/associadas", { nome: "Nova" })).status, 403);
  const sem = await fetch(`${base}/api/centrais/rede`);
  assert.equal(sem.status, 401);
});

test("isolamento: central de outra rede, irmã, principal vista pela filha e inexistente dão a mesma resposta 404", async () => {
  const casos: Array<[string, string]> = [["admA", Bc], ["admA", P], ["admA", X], ["admP", X], ["admX", A], ["admB", A], ["admP", "nao-existe"]];
  for (const [quem, alvo] of casos) {
    for (const url of [`/extrato/${alvo}`, `/planos?central=${alvo}`, `/demonstrativo?central=${alvo}`]) {
      const r = await api(quem, "GET", url);
      assert.equal(r.status, 404, `${quem} ${url}`);
      assert.equal(r.corpo.erro, "Central não encontrada.");
    }
    assert.equal((await api(quem, "PUT", `/controle/${alvo}`, { exibirExtrato: "Permitir" })).status, 404, `controle ${quem}->${alvo}`);
    assert.equal((await api(quem, "PUT", "/planos", { central: alvo, plano: "ultra" })).status, 404);
    assert.equal((await api(quem, "PUT", "/servicos", { central: alvo, servicos: ["url"] })).status, 404);
  }
  // X-Empresa de quem não é plataforma é ignorado: a empresa vem sempre do login
  const r = await api("admA", "GET", "/planos", undefined, { "x-empresa": Bc });
  assert.equal(r.corpo.central.id, A);
});

test("controle financeiro: consentimento do extrato é da associada; débito e conta online são da principal", async () => {
  const p = await api("admP", "GET", "/controle");
  assert.equal(p.status, 200);
  assert.equal(p.corpo.linhas[0].id, P);
  assert.equal(p.corpo.linhas[0].tipo, "principal");
  assert.equal(p.corpo.linhas.length, 3);
  const linhaA = p.corpo.linhas.find((l: any) => l.id === A);
  assert.deepEqual(linhaA.controle, R.CONTROLE_PADRAO);
  assert.deepEqual(linhaA.pode, { exibirExtrato: false, debitoAutomatico: true, contaOnline: true });
  // a principal não se dá o consentimento
  assert.equal((await api("admP", "PUT", `/controle/${A}`, { exibirExtrato: "Permitir" })).status, 403);
  // a associada não muda o débito
  assert.equal((await api("admA", "PUT", `/controle/${A}`, { debitoAutomatico: "Usar conta da central principal" })).status, 403);
  assert.equal((await api("admA", "PUT", `/controle/${A}`, { exibirExtrato: "Qualquer coisa" })).status, 400);
  assert.equal((await api("admA", "PUT", `/controle/${A}`, { exibirExtrato: "Permitir" })).status, 200);
  assert.equal((await api("admP", "PUT", `/controle/${A}`, { contaOnline: "Conta da central principal" })).status, 200);
  assert.equal(R.controleDe(A).exibirExtrato, "Permitir");
  assert.equal(R.controleDe(A).contaOnline, "Conta da central principal");
  // a principal não tem controle sobre si mesma, e a associada vê só a própria linha
  assert.equal((await api("admP", "PUT", `/controle/${P}`, { contaOnline: "Conta própria" })).status, 400);
  const a = await api("admA", "GET", "/controle");
  assert.deepEqual(a.corpo.linhas.map((l: any) => l.id), [A]);
  assert.deepEqual(a.corpo.linhas[0].pode, { exibirExtrato: true, debitoAutomatico: false, contaOnline: false });
});

test("extrato: a principal só vê o da associada que permitiu, e sem nomes de pessoas", async () => {
  const antes = await api("admP", "GET", `/extrato/${Bc}?periodo=mes_atual`);
  assert.equal(antes.status, 403, "B nunca permitiu");
  const pA = await api("admP", "GET", `/extrato/${A}?periodo=mes_atual`);
  assert.equal(pA.status, 200);
  assert.ok(!JSON.stringify(pA.corpo).includes("Sigilo"), "nenhum nome de motorista da associada");
  assert.ok(pA.corpo.dias.every((d: any) => d.movimentos.every((m: any) => m.detalhe === "")));
  assert.deepEqual(pA.corpo.pedidos, []);
  const propria = await api("admA", "GET", `/extrato/${A}?periodo=mes_atual`);
  assert.equal(propria.status, 200);
  const csv = await api("admP", "GET", `/extrato/${A}/csv?periodo=mes_atual`);
  assert.equal(csv.status, 200);
  assert.ok(csv.tipo.includes("text/csv"));
  assert.ok(!csv.texto.includes("Sigilo"));
  assert.equal((await api("admA", "GET", `/extrato/${Bc}`)).status, 404);
  // se a associada retira o consentimento, a principal perde o acesso
  await api("admA", "PUT", `/controle/${A}`, { exibirExtrato: "Não permitir" });
  assert.equal((await api("admP", "GET", `/extrato/${A}`)).status, 403);
});

test("meus planos: cada central escolhe o próprio; a rede só aparece para a principal", async () => {
  const p = await api("admP", "GET", "/planos");
  assert.equal(p.corpo.plano.id, "essencial");
  assert.ok(p.corpo.rede, "principal vê a categoria da rede");
  assert.equal(p.corpo.rede.finalizadasRede, 4, "quatro corridas na rede (só a quantidade)");
  assert.equal(p.corpo.rede.categoria, "Bronze");
  assert.ok(p.corpo.podeEditar);
  const a = await api("admA", "GET", "/planos");
  assert.equal(a.corpo.rede, null);
  assert.equal((await api("admA", "PUT", "/planos", { plano: "ultra" })).corpo.plano.id, "ultra");
  assert.equal(CO.planoDe(A).id, "ultra");
  assert.equal(CO.planoDe(P).id, "essencial", "não mexeu na principal");
  // a principal olha o plano da associada, mas não muda
  const vista = await api("admP", "GET", `/planos?central=${A}`);
  assert.equal(vista.corpo.plano.id, "ultra");
  assert.equal(vista.corpo.podeEditar, false);
  assert.equal(vista.corpo.rede, null);
  assert.equal((await api("admP", "PUT", "/planos", { central: A, plano: "essencial" })).status, 403);
  assert.equal((await api("admP", "PUT", "/servicos", { central: A, servicos: [] })).status, 403);
  assert.equal((await api("admP", "PUT", "/planos", { plano: "inexistente" })).status, 400);
  assert.equal((await api("admP", "PUT", "/servicos", { servicos: ["nao-existe"] })).status, 400);
  // a associada A ativa serviços para o demonstrativo
  const s = await api("admA", "PUT", "/servicos", { servicos: ["url", "url", "anuncio-ciclo"] });
  assert.equal(s.status, 200);
  assert.deepEqual(s.corpo.servicos.filter((x: any) => x.ativo).map((x: any) => x.id), ["url", "anuncio-ciclo"]);
});

test("tarifa por corrida: fixa + percentual, limitada ao teto", () => {
  const ess = CO.planoPorId("essencial")!;
  assert.equal(CO.tarifaDaCorrida(ess, 10), 0.95);
  assert.equal(CO.tarifaDaCorrida(ess, 40), 1.2, "0,55 + 1,60 passa do teto");
  assert.equal(CO.tarifaDaCorrida(ess, null), 0.55);
});

test("demonstrativo: valores do mês e visibilidade (associada própria; principal só se o débito for dela)", async () => {
  const b = await api("admB", "GET", `/demonstrativo?competencia=${COMP}`);
  assert.equal(b.status, 200);
  assert.equal(b.corpo.diasAtivos, 1);
  assert.equal(b.corpo.linhas[0].quantidade, 1);
  assert.equal(b.corpo.linhas[0].debito, 1.2, "R$ 20 no Essencial: 0,55 + 0,80 = 1,35, limitado ao teto de 1,20");
  assert.equal(b.corpo.totalAPagar, 1.2);
  // A está no Ultra (0,40 + 3%, teto 0,95) com URL e anúncio de ciclo: 10 -> 0,70 e 40 -> 0,95 (teto)
  const a = await api("admA", "GET", `/demonstrativo?competencia=${COMP}`);
  assert.equal(a.corpo.linhas[0].debito, 1.65);
  assert.equal(a.corpo.linhas.find((l: any) => l.descricao === "Mensalidade do plano Ultra").debito, 199);
  assert.equal(a.corpo.linhas.find((l: any) => l.descricao === "URL personalizada").debito, 99);
  assert.equal(a.corpo.linhas.find((l: any) => l.descricao === "Anúncio no ciclo da corrida").debito, 0.01, "2 corridas: 2/1000 x R$ 5");
  assert.equal(a.corpo.subtotal, 299.66);
  // a principal não vê o demonstrativo da associada que paga com conta própria
  assert.equal((await api("admP", "GET", `/demonstrativo?central=${Bc}&competencia=${COMP}`)).status, 403);
  assert.equal((await api("admP", "PUT", `/controle/${Bc}`, { debitoAutomatico: "Usar conta da central principal" })).status, 200);
  const paga = await api("admP", "GET", `/demonstrativo?central=${Bc}&competencia=${COMP}`);
  assert.equal(paga.status, 200);
  assert.equal(paga.corpo.quemPaga, "principal");
  assert.equal(paga.corpo.central.id, Bc);
  // competência inválida e antiga
  const ruim = await api("admB", "GET", "/demonstrativo?competencia=2026-13");
  assert.equal(ruim.status, 400);
  assert.equal(ruim.corpo.erro, "Competência inválida (use AAAA-MM).");
  assert.equal((await api("admB", "GET", "/demonstrativo?competencia=2020-01")).corpo.linhas[0].quantidade, 0);
});

test("demonstrativo da principal: sem bonificação enquanto a rede é Bronze", () => {
  const d = CO.demonstrativo(P, P, COMP);
  assert.equal(d.linhas[0].quantidade, 1);
  assert.equal(d.competencias.length, 12);
  const bon = CO.bonificacaoDaRede(P, COMP);
  assert.equal(bon.percentual, 0);
  assert.equal(bon.proxima?.nome, "Prata");
  assert.equal(bon.proxima?.faltam, 2000 - 4);
  assert.ok(!d.linhas.some((l) => l.credito));
});

test("Exportar CSV: proteção contra fórmula no nome da central e nas células", async () => {
  assert.equal(celulaCsv("=1+1"), "'=1+1");
  assert.equal(celulaCsv("@SOMA(A1)"), "'@SOMA(A1)");
  const nova = await api("admP", "POST", "/associadas", { nome: "=CMD|calc!A0" });
  assert.equal(nova.status, 201);
  const id = nova.corpo.central.id as string;
  await api("admP", "PUT", `/controle/${id}`, { debitoAutomatico: "Usar conta da central principal" });
  const csv = await api("admP", "GET", `/demonstrativo/csv?central=${id}&competencia=${COMP}`);
  assert.equal(csv.status, 200);
  assert.ok(csv.tipo.includes("text/csv"));
  assert.ok(csv.texto.includes("'=CMD"), "apóstrofo na frente");
  assert.ok(!/(^|;)=CMD/m.test(csv.texto), "nenhuma célula começa com =");
  // sem permissão, nada de CSV
  assert.equal((await api("admP", "GET", `/demonstrativo/csv?central=${X}`)).status, 404);
  assert.equal((await api("admA", "GET", `/demonstrativo/csv?central=${Bc}`)).status, 404);
  assert.equal((await api("admP", "GET", `/demonstrativo/csv?central=${A}&competencia=${COMP}`)).status, 403, "A paga com conta própria");
});

test("abrir central associada: cria empresa e administrador próprios, isolados da principal e das irmãs", async () => {
  const r = await api("admP", "POST", "/associadas", { nome: "Filha Nova", adminEmail: "novo@c.test", adminNome: "Novo", adminSenha: "senha-forte-1" });
  assert.equal(r.status, 201);
  const nova = r.corpo.central.id as string;
  assert.equal(R.principalDe(nova), P);
  const adm = D.listarUsuarios().find((u) => u.email === "novo@c.test")!;
  assert.equal(adm.empresaId, nova);
  assert.equal(adm.papel, "admin");
  assert.equal(D.listarUsuarios().filter((u) => u.empresaId === nova).length, 1);
  assert.ok(!R.podeVer(nova, A) && !R.podeVer(A, nova) && R.podeVer(P, nova));
  // erros não deixam central pela metade
  const total = D.listarEmpresas().length;
  assert.equal((await api("admP", "POST", "/associadas", { nome: "Duplicada", adminEmail: "novo@c.test", adminSenha: "senha-forte-1" })).status, 400);
  assert.equal((await api("admP", "POST", "/associadas", { nome: "Sem senha", adminEmail: "x@c.test", adminSenha: "curta" })).status, 400);
  assert.equal((await api("admP", "POST", "/associadas", { nome: "A" })).status, 400);
  assert.equal(D.listarEmpresas().length, total);
  // associada não abre associadas; central isolada pode e passa a ser principal
  assert.equal((await api("admA", "POST", "/associadas", { nome: "Neta" })).status, 400);
  assert.equal((await api("admX", "POST", "/associadas", { nome: "Filha do X" })).status, 201);
  assert.equal(R.papelNaRede(X), "principal");
});

test("vincular e desvincular: só a plataforma, e só dentro dos limites da rede", async () => {
  assert.equal((await api("admP", "POST", "/vincular", { centralId: Y })).status, 403);
  assert.equal((await api("admP", "DELETE", `/associadas/${A}`)).status, 403);
  const lista = await api("plat", "GET", "/rede", undefined, { "x-empresa": P });
  assert.ok(lista.corpo.livres.some((e: any) => e.id === Y));
  assert.ok(!lista.corpo.livres.some((e: any) => e.id === A || e.id === X), "quem já está em rede não é oferecido");
  assert.equal((await api("plat", "POST", "/vincular", { centralId: Y }, { "x-empresa": P })).status, 200);
  assert.equal(R.principalDe(Y), P);
  assert.equal((await api("plat", "POST", "/vincular", { centralId: Y }, { "x-empresa": Bc })).status, 400, "Y já tem principal");
  assert.equal((await api("plat", "DELETE", `/associadas/${Y}`, undefined, { "x-empresa": P })).status, 200);
  assert.equal(R.principalDe(Y), null);
  // desvincular uma central que não é da empresa escolhida: não encontrada
  assert.equal((await api("plat", "DELETE", `/associadas/${A}`, undefined, { "x-empresa": X })).status, 404);
  assert.equal(R.principalDe(A), P);
});
