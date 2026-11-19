// Cargos (ADMIN Mestre, ADMIN, Gestor, Operador): matriz de funções, recusa 403 no servidor com requisição forjada
// por cargo, equipe com o seletor de cargo e migração sem perder ninguém. Veja docs/CARGOS.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-cargos-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "c".repeat(40);

const D = await import("../src/servidor/dados.ts");
const { app } = await import("../src/servidor/index.ts");
const B = await import("../src/servidor/banco.ts");
const { esquecerJson } = await import("../src/servidor/jsoncache.ts");
const { CARGOS, cargoMinimoDaRota, ehCargo, podeCargo, NOME_CARGO } = await import("../src/comum/cargos.ts");
const { FUNCOES, funcoesDoCargo } = await import("../src/comum/funcoes.ts");

const emp = D.criarEmpresa("Cargos Ltda").id;
const outra = D.criarEmpresa("Outra Empresa").id;
const SENHA = "senha-forte-1";
const quem = {
  plataforma: D.criarUsuario({ email: "mestre@c.test", nome: "Mestre", senha: SENHA, empresaId: emp, papel: "plataforma" }),
  admin: D.criarUsuario({ email: "admin@c.test", nome: "Admin", senha: SENHA, empresaId: emp, papel: "admin" }),
  gestor: D.criarUsuario({ email: "gestor@c.test", nome: "Gestor", senha: SENHA, empresaId: emp, papel: "gestor" }),
  operador: D.criarUsuario({ email: "operador@c.test", nome: "Operador", senha: SENHA, empresaId: emp, papel: "operador" }),
  adminOutra: D.criarUsuario({ email: "admin2@c.test", nome: "Admin 2", senha: SENHA, empresaId: outra, papel: "admin" }),
};
const srv = app.listen(0);
const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
test.after(() => { srv.closeAllConnections(); srv.close(); B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

const cookies: Record<string, string> = {};
for (const k of Object.keys(quem)) {
  const r = await fetch(`${base}/api/entrar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `${(quem as Record<string, { email: string }>)[k].email}`, senha: SENHA }) });
  cookies[k] = (r.headers.get("set-cookie") ?? "").split(";")[0];
}
async function api(cargo: string, metodo: string, url: string, corpo?: unknown) {
  const r = await fetch(base + url, { method: metodo, headers: { "Content-Type": "application/json", Cookie: cookies[cargo] }, body: corpo === undefined || metodo === "GET" ? undefined : JSON.stringify(corpo) });
  return { status: r.status, corpo: (await r.json().catch(() => ({}))) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

test("hierarquia: quem está acima faz tudo o que os de baixo fazem", () => {
  assert.deepEqual(CARGOS, ["operador", "gestor", "admin", "plataforma"]);
  assert.equal(podeCargo("plataforma", "admin"), true);
  assert.equal(podeCargo("admin", "gestor"), true);
  assert.equal(podeCargo("gestor", "admin"), false);
  assert.equal(podeCargo("operador", "gestor"), false);
  assert.equal(podeCargo("qualquer-coisa", "operador"), false, "cargo desconhecido não passa");
  assert.equal(NOME_CARGO.plataforma, "ADMIN Mestre");
  assert.equal(ehCargo("gestor"), true);
});

test("menu por cargo: cada nível vê as funções dos de baixo e mais algumas", () => {
  const ids = (c: string) => new Set(funcoesDoCargo(c).map((f) => f.id));
  for (let i = 1; i < CARGOS.length; i++) for (const id of ids(CARGOS[i - 1])) assert.ok(ids(CARGOS[i]).has(id), `${CARGOS[i]} perdeu ${id}`);
  assert.equal(ids("plataforma").size >= FUNCOES.filter((f) => !f.minimo || f.minimo !== "plataforma").length, true);
  // operador: despacha, não vê financeiro, regras nem equipe
  for (const id of ["solicitar", "monitoramento", "motoristas", "conversas"]) assert.ok(ids("operador").has(id), id);
  for (const id of ["equipe", "carteiras", "visao-geral", "config-gerais", "cupons", "integracoes", "demonstrativo-mensal"]) assert.ok(!ids("operador").has(id), `operador não deveria ver ${id}`);
  // gestor (como na Machine): cadastros, config e Cobrança; sem contas a receber, relatórios e estatísticas financeiras
  for (const id of ["cupons", "config-gerais", "marca", "transacao-pix", "vouchers-motoristas", "km-rodados", "demonstrativo-mensal"]) assert.ok(ids("gestor").has(id), id);
  for (const id of ["equipe", "faturamento-empresa", "os-motorista", "visao-geral", "pagamentos-pendentes", "indicacoes", "integracoes"]) assert.ok(!ids("gestor").has(id), `gestor não deveria ver ${id}`);
  // admin vê o financeiro completo e a equipe
  for (const id of ["equipe", "faturamento-empresa", "os-motorista", "visao-geral", "integracoes"]) assert.ok(ids("admin").has(id), id);
});

test("toda rota de função com cargo mínimo tem o mesmo piso no servidor", () => {
  // Pontos de contato entre o menu e a API (amostra fixa, para o menu e o servidor não se afastarem).
  const casos: Array<[string, string, string]> = [
    ["GET", "/gestao/equipe", "admin"], ["POST", "/gestao/equipe", "admin"], ["GET", "/usuarios", "admin"],
    ["GET", "/relatorios/relatorio/faturamento-empresa", "admin"], ["GET", "/relatorios/relatorio/km-rodados", "gestor"],
    ["GET", "/config/visao-geral", "admin"], ["GET", "/config/carteiras", "gestor"], ["POST", "/config/carteiras/motorista/x/ajuste", "admin"],
    ["GET", "/operacao/pendencias", "admin"], ["GET", "/operacao/pix", "gestor"], ["GET", "/gestao/cupons", "gestor"],
    ["PUT", "/config/gerais", "gestor"], ["GET", "/config/integracao-financeira", "admin"], ["GET", "/centrais/rede", "gestor"],
    ["GET", "/crm/campanhas", "gestor"], ["POST", "/superadmin/empresas", "plataforma"], ["POST", "/empresas", "plataforma"],
  ];
  for (const [m, c, esperado] of casos) assert.equal(cargoMinimoDaRota(m, c), esperado, `${m} ${c}`);
  assert.equal(cargoMinimoDaRota("GET", "/corridas"), null, "o que não tem regra só pede login");
  assert.equal(cargoMinimoDaRota("GET", "/config/categorias"), null);
});

// Requisição forjada: o menu esconde, mas o servidor é quem manda. Cada linha: método, caminho, e a lista de cargos que levam 403.
const PROIBIDO: Array<[string, string, string[]]> = [
  ["GET", "/api/gestao/equipe", ["gestor", "operador"]],
  ["POST", "/api/gestao/equipe", ["gestor", "operador"]],
  ["GET", "/api/usuarios", ["gestor", "operador"]],
  ["GET", "/api/config/visao-geral", ["gestor", "operador"]],
  ["GET", "/api/config/transacoes-online", ["gestor", "operador"]],
  ["GET", "/api/relatorios/relatorio/faturamento-empresa", ["gestor", "operador"]],
  ["GET", "/api/relatorios/relatorio/os-operador", ["gestor", "operador"]],
  ["GET", "/api/operacao/pendencias", ["gestor", "operador"]],
  ["GET", "/api/integracoes", ["gestor", "operador"]],
  ["POST", "/api/relatorio", ["gestor", "operador"]],
  ["GET", "/api/config/carteiras", ["operador"]],
  ["GET", "/api/config/extrato", ["operador"]],
  ["GET", "/api/relatorios/relatorio/km-rodados", ["operador"]],
  ["GET", "/api/operacao/pix", ["operador"]],
  ["GET", "/api/gestao/cupons", ["operador"]],
  ["GET", "/api/gestao/empresas", ["operador"]],
  ["POST", "/api/gestao/areas", ["operador"]],
  ["PUT", "/api/config/gerais", ["operador"]],
  ["PUT", "/api/marca", ["operador"]],
  ["GET", "/api/centrais/rede", ["operador"]],
  ["GET", "/api/crm/campanhas", ["operador"]],
  ["GET", "/api/superadmin/empresas", ["admin", "gestor", "operador"]],
  ["POST", "/api/empresas", ["admin", "gestor", "operador"]],
];
for (const [metodo, url, bloqueados] of PROIBIDO) {
  test(`403 forjado: ${metodo} ${url}`, async () => {
    for (const cargo of bloqueados) assert.equal((await api(cargo, metodo, url, {})).status, 403, `${cargo} deveria levar 403`);
    // quem tem o cargo mínimo não leva 403 do porteiro (pode dar 400/404 por falta de dados, mas não 403)
    const liberados = (["operador", "gestor", "admin", "plataforma"] as const).filter((c) => !bloqueados.includes(c));
    for (const cargo of liberados.slice(0, 1)) assert.notEqual((await api(cargo, metodo, url, {})).status, 403, `${cargo} deveria passar`);
  });
}

test("o que o operador precisa para despachar continua liberado", async () => {
  for (const [m, u] of [["GET", "/api/sessao"], ["GET", "/api/operacao/monitoramento"], ["GET", "/api/gestao/motoristas"], ["GET", "/api/gestao/passageiros"], ["GET", "/api/config/categorias"], ["GET", "/api/cadastros/motoristas"], ["GET", "/api/indicadores"]] as const) {
    const r = await api("operador", m, u);
    assert.ok(r.status < 300, `${m} ${u} -> ${r.status}`);
  }
});

test("sessão informa o cargo com o nome da Machine", async () => {
  assert.equal((await api("plataforma", "GET", "/api/sessao")).corpo.usuario.cargo, "ADMIN Mestre");
  assert.equal((await api("gestor", "GET", "/api/sessao")).corpo.usuario.cargo, "Gestor");
  assert.equal((await api("admin", "GET", "/api/sessao")).corpo.usuario.papel, "admin");
});

test("Equipe: o ADMIN escolhe Gestor, Operador ou ADMIN; ninguém dá ADMIN Mestre", async () => {
  const novo = await api("admin", "POST", "/api/gestao/equipe", { nome: "Novo Gestor", email: "novo-gestor@c.test", senha: SENHA, papel: "gestor" });
  assert.equal(novo.status, 200);
  assert.equal(novo.corpo.usuario.papel, "gestor");
  const mestre = await api("admin", "POST", "/api/gestao/equipe", { nome: "Quer ser dono", email: "dono2@c.test", senha: SENHA, papel: "plataforma" });
  assert.equal(mestre.corpo.usuario?.papel, "operador", "cargo desconhecido ou alto demais vira operador, nunca ADMIN Mestre");
  const troca = await api("admin", "PUT", `/api/gestao/equipe/${novo.corpo.usuario.id}`, { papel: "admin" });
  assert.equal(troca.corpo.usuario.papel, "admin");
  const proprio = await api("admin", "PUT", `/api/gestao/equipe/${quem.admin.id}`, { papel: "operador" });
  assert.equal(proprio.status, 400, "ninguém muda o próprio cargo");
  const mexeDono = await api("admin", "PUT", `/api/gestao/equipe/${quem.plataforma.id}`, { papel: "operador" });
  assert.equal(mexeDono.status, 400, "o ADMIN Mestre não é mexido pela equipe");
});

test("Equipe: a lista é só da própria empresa", async () => {
  const l = await api("admin", "GET", "/api/gestao/equipe");
  assert.ok(l.corpo.equipe.every((u: { id: string }) => u.id !== quem.adminOutra.id));
  assert.ok(l.corpo.equipe.every((u: Record<string, unknown>) => !("hash" in u)));
});

test("cadastros: o Gestor edita cadastros de gestão; o Operador só os que a função permite", async () => {
  assert.equal((await api("operador", "POST", "/api/cadastros/cupons", { nome: "X" })).status, 400, "operador só consulta cupons");
  const g = await api("gestor", "POST", "/api/cadastros/cupons", { nome: "Cupom do gestor", codigo: "GEST10", tipo: "Percentual", valor: 10 });
  assert.notEqual(g.corpo.erro, "Seu usuário só pode consultar este cadastro.");
});

test("migração: cargo fora da lista vira operador, ninguém é apagado e os cargos antigos ficam como estão", () => {
  const arq = path.join(DADOS, "usuarios.json");
  const antes = JSON.parse(fs.readFileSync(arq, "utf8")) as Array<{ id: string; papel: string }>;
  const total = antes.length;
  antes.push({ ...(antes[0] as object), id: "legado-1", email: "legado@c.test", papel: "supervisor" } as never);
  fs.writeFileSync(arq, JSON.stringify(antes));
  esquecerJson(); // o cache de leitura do servidor precisa enxergar o arquivo mexido por fora
  assert.equal(D.migrarCargos(), 1);
  const depois = D.listarUsuarios();
  assert.equal(depois.length, total + 1, "ninguém sumiu");
  assert.equal(depois.find((u) => u.id === "legado-1")?.papel, "operador");
  assert.equal(D.migrarCargos(), 0, "rodar de novo não muda nada");
  for (const [k, u] of Object.entries(quem)) assert.equal(depois.find((x) => x.id === u.id)?.papel, k === "adminOutra" ? "admin" : k);
});

test("maiúsculas, barras duplicadas e /./ não burlam o cargo mínimo (Operador leva 403)", async () => {
  const rotas = [
    "/api/Relatorios/Relatorio/x", "/api/RELATORIOS/relatorio/x", "/api//relatorios/relatorio/x", "/api/relatorios/./relatorio/x",
    "/api/Usuarios", "/api/usuarios/", "/api/Superadmin/x", "/api/GESTAO/Equipe", "/api/Crm/campanhas", "/api/crm//campanhas",
    "/api/Filiais", "/api/filiais/", "/api/Centrais/x", "/api/Integracoes", "/api/Config/Pagamentos",
  ];
  for (const url of rotas) assert.equal((await api("operador", "GET", url)).status, 403, url);
  assert.equal(cargoMinimoDaRota("GET", "/Relatorios/Relatorio/x"), "admin");
  assert.equal(cargoMinimoDaRota("GET", "//crm/./x"), "gestor");
  const { moduloDaRota } = await import("../src/comum/modulos.ts");
  assert.equal(moduloDaRota("/CRM/campanhas"), "crm");
  assert.equal(moduloDaRota("//Filiais/"), "filiais");
});

test("Operador não muda a cobrança do motorista (Isento, tipo, valor), nem criando nem editando; Gestor muda", async () => {
  const criado = await api("gestor", "POST", "/api/cadastros/motoristas", { nome: "Zé", telefone: "11988887777", status: "Ativo", cobranca: "Personalizado", cobrancaTipo: "Percentual", cobrancaValor: 7 });
  assert.equal(criado.status, 200, JSON.stringify(criado.corpo));
  const id = criado.corpo.registro.id as string;
  const op = await api("operador", "PUT", `/api/cadastros/motoristas/${id}`, { nome: "Zé Silva", telefone: "11988887777", status: "Ativo", cobranca: "Isento", cobrancaTipo: "Valor fixo", cobrancaValor: 0 });
  assert.equal(op.status, 200, JSON.stringify(op.corpo));
  assert.equal(op.corpo.registro.nome, "Zé Silva", "o resto continua editável");
  assert.equal(op.corpo.registro.cobranca, "Personalizado");
  assert.equal(op.corpo.registro.cobrancaTipo, "Percentual");
  assert.equal(op.corpo.registro.cobrancaValor, 7);
  const op2 = await api("operador", "PUT", `/api/cadastros/motoristas/${id}`, { nome: "Zé S.", telefone: "11988887777", status: "Ativo" });
  assert.equal(op2.corpo.registro.cobranca, "Personalizado", "sem mandar a cobrança, ela não some");
  assert.equal(op2.corpo.registro.cobrancaValor, 7);
  const novo = await api("operador", "POST", "/api/cadastros/motoristas", { nome: "Ana", telefone: "11977776666", status: "Ativo", cobranca: "Isento" });
  assert.notEqual(novo.corpo.registro.cobranca, "Isento");
  const g = await api("gestor", "PUT", `/api/cadastros/motoristas/${id}`, { nome: "Zé S.", telefone: "11988887777", status: "Ativo", cobranca: "Isento" });
  assert.equal(g.corpo.registro.cobranca, "Isento");
});
