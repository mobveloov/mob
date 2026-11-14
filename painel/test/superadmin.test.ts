// Painel do dono (ADMIN Mestre): só o papel plataforma entra; criar, suspender e reativar empresas (suspensa não loga),
// planos e recursos por empresa, marca e domínio, uso e faturamento e centrais. Os outros cargos levam 403.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-superadmin-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "s".repeat(40);

const D = await import("../src/servidor/dados.ts");
const { app } = await import("../src/servidor/index.ts");
const B = await import("../src/servidor/banco.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar } = await import("../src/cadastros/armazem.ts");
const { salvarCategoria } = await import("../src/config/categorias.ts");
const C = await import("../src/corridas/index.ts");
const { MODULOS, moduloDaRota, moduloDaFuncao } = await import("../src/comum/modulos.ts");
const { FUNCOES } = await import("../src/comum/funcoes.ts");

const SENHA = "senha-forte-1";
const dono = D.criarEmpresa("Plataforma Dona").id;
const alvo = D.criarEmpresa("Cliente Alvo").id;
const outra = D.criarEmpresa("Outra Cliente").id;
const u = {
  mestre: D.criarUsuario({ email: "mestre@s.test", nome: "Mestre", senha: SENHA, empresaId: dono, papel: "plataforma" }),
  admin: D.criarUsuario({ email: "admin@s.test", nome: "Admin", senha: SENHA, empresaId: alvo, papel: "admin" }),
  gestor: D.criarUsuario({ email: "gestor@s.test", nome: "Gestor", senha: SENHA, empresaId: alvo, papel: "gestor" }),
  operador: D.criarUsuario({ email: "op@s.test", nome: "Op", senha: SENHA, empresaId: alvo, papel: "operador" }),
  adminOutra: D.criarUsuario({ email: "admin2@s.test", nome: "Admin 2", senha: SENHA, empresaId: outra, papel: "admin" }),
};
const srv = app.listen(0);
const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
test.after(() => { srv.closeAllConnections(); srv.close(); B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

async function login(email: string) {
  const r = await fetch(`${base}/api/entrar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, senha: SENHA }) });
  return { status: r.status, cookie: (r.headers.get("set-cookie") ?? "").split(";")[0], corpo: (await r.json().catch(() => ({}))) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
const cookies: Record<string, string> = {};
for (const k of Object.keys(u)) cookies[k] = (await login((u as Record<string, { email: string }>)[k].email)).cookie;
async function api(quem: string, metodo: string, url: string, corpo?: unknown, extra: Record<string, string> = {}) {
  const r = await fetch(base + url, { method: metodo, headers: { "Content-Type": "application/json", Cookie: cookies[quem], ...extra }, body: corpo === undefined || metodo === "GET" ? undefined : JSON.stringify(corpo) });
  const tipo = r.headers.get("content-type") ?? "";
  return { status: r.status, texto: tipo.includes("json") ? "" : await r.text(), corpo: (tipo.includes("json") ? await r.json() : {}) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

test("só o ADMIN Mestre: todos os outros cargos levam 403 em todas as rotas do painel do dono", async () => {
  const rotas: Array<[string, string, unknown?]> = [
    ["GET", "/api/superadmin/empresas"], ["POST", "/api/superadmin/empresas", { nome: "Invasora" }],
    ["POST", `/api/superadmin/empresas/${alvo}/suspender`, {}], ["POST", `/api/superadmin/empresas/${alvo}/reativar`],
    ["POST", `/api/superadmin/empresas/${alvo}/entrar`], ["PUT", `/api/superadmin/empresas/${alvo}/plano`, { plano: "ultra" }],
    ["PUT", `/api/superadmin/empresas/${alvo}/recursos`, { desligados: [] }], ["PUT", `/api/superadmin/empresas/${alvo}/marca`, { produto: "X" }],
    ["GET", "/api/superadmin/uso"], ["GET", "/api/superadmin/uso/csv"], ["GET", "/api/superadmin/centrais"],
    ["POST", "/api/superadmin/centrais/vincular", { principalId: alvo, associadaId: outra }], ["DELETE", `/api/superadmin/centrais/associadas/${outra}`],
    ["POST", `/api/superadmin/centrais/${alvo}/associadas`, { nome: "Nova" }],
  ];
  for (const quem of ["admin", "gestor", "operador", "adminOutra"]) for (const [m, url, corpo] of rotas) assert.equal((await api(quem, m, url, corpo)).status, 403, `${quem} ${m} ${url}`);
  // com X-Empresa forjado também (o cabeçalho só vale para o ADMIN Mestre)
  assert.equal((await api("admin", "GET", "/api/superadmin/empresas", undefined, { "X-Empresa": dono })).status, 403);
  // sem login
  assert.equal((await fetch(`${base}/api/superadmin/empresas`)).status, 401);
  // o dono passa
  assert.equal((await api("mestre", "GET", "/api/superadmin/empresas")).status, 200);
});

test("lista de empresas traz plano, recursos, marca, rede e uso", async () => {
  const r = await api("mestre", "GET", "/api/superadmin/empresas");
  assert.equal(r.corpo.empresas.length, 3);
  const e = r.corpo.empresas.find((x: { id: string }) => x.id === alvo);
  assert.equal(e.plano.id, "essencial");
  assert.deepEqual(e.recursosDesligados, []);
  assert.equal(e.rede.tipo, "isolada");
  assert.equal(e.uso.usuarios, 3);
  assert.equal(r.corpo.recursos.length, MODULOS.length);
  assert.ok(r.corpo.planos.some((p: { id: string }) => p.id === "ultra"));
});

test("criar empresa: com ADMIN e plano; confere antes, sem deixar empresa pela metade", async () => {
  const antes = D.listarEmpresas().length;
  assert.equal((await api("mestre", "POST", "/api/superadmin/empresas", { nome: "A", adminEmail: "" })).status, 400);
  assert.equal((await api("mestre", "POST", "/api/superadmin/empresas", { nome: "Boa Empresa", adminEmail: "novo@s.test", adminSenha: "curta" })).status, 400);
  assert.equal((await api("mestre", "POST", "/api/superadmin/empresas", { nome: "Boa Empresa", adminEmail: "admin@s.test", adminSenha: SENHA })).status, 400, "e-mail repetido");
  assert.equal((await api("mestre", "POST", "/api/superadmin/empresas", { nome: "Boa Empresa", plano: "inexistente" })).status, 400);
  assert.equal(D.listarEmpresas().length, antes, "nada foi criado nas tentativas com erro");
  const ok = await api("mestre", "POST", "/api/superadmin/empresas", { nome: "Boa Empresa", plano: "plus", adminNome: "Nova Admin", adminEmail: "nova-admin@s.test", adminSenha: SENHA });
  assert.equal(ok.status, 201);
  assert.equal(ok.corpo.empresa.plano.id, "plus");
  assert.equal((await login("nova-admin@s.test")).status, 200, "o ADMIN novo consegue entrar");
});

test("suspensa não loga: nem quem já estava logado; reativar devolve o acesso; nada é apagado", async () => {
  assert.equal((await api("admin", "GET", "/api/sessao")).status, 200);
  const s = await api("mestre", "POST", `/api/superadmin/empresas/${alvo}/suspender`, { motivo: "Mensalidade em atraso" });
  assert.equal(s.status, 200);
  assert.equal(s.corpo.empresa.ativa, false);
  assert.equal(s.corpo.empresa.suspensao.motivo, "Mensalidade em atraso");
  const novo = await login("admin@s.test");
  assert.equal(novo.status, 403, "não entra");
  assert.match(String(novo.corpo.erro), /suspensa/i);
  assert.equal((await login("op@s.test")).status, 403);
  assert.equal((await api("admin", "GET", "/api/sessao")).status, 403, "sessão antiga também cai");
  assert.equal((await api("mestre", "GET", "/api/sessao", undefined, { "X-Empresa": alvo })).status, 200, "o dono entra para dar suporte");
  assert.equal(D.listarUsuarios().filter((x) => x.empresaId === alvo).length, 3, "ninguém foi apagado");
  const r = await api("mestre", "POST", `/api/superadmin/empresas/${alvo}/reativar`);
  assert.equal(r.corpo.empresa.ativa, true);
  assert.equal(r.corpo.empresa.suspensao, null);
  assert.equal((await login("admin@s.test")).status, 200);
  cookies.admin = (await login("admin@s.test")).cookie;
  cookies.gestor = (await login("gestor@s.test")).cookie;
  cookies.operador = (await login("op@s.test")).cookie;
});

test("a empresa do dono não pode ser suspensa; empresa que não existe dá 404", async () => {
  assert.equal((await api("mestre", "POST", `/api/superadmin/empresas/${dono}/suspender`, {})).status, 400);
  assert.equal((await api("mestre", "POST", "/api/superadmin/empresas/nao-existe/suspender", {})).status, 404);
  assert.equal((await api("mestre", "POST", "/api/superadmin/empresas/nao-existe/entrar")).status, 404);
});

test("entrar como a empresa: o ADMIN Mestre passa a ver os dados dela pelo cabeçalho; os outros cargos não", async () => {
  assert.equal((await api("mestre", "POST", `/api/superadmin/empresas/${alvo}/entrar`)).status, 200);
  const s = await api("mestre", "GET", "/api/sessao", undefined, { "X-Empresa": alvo });
  assert.equal(s.corpo.empresa.id, alvo);
  const forjado = await api("admin", "GET", "/api/sessao", undefined, { "X-Empresa": outra });
  assert.equal(forjado.corpo.empresa.id, alvo, "o ADMIN não troca de empresa");
});

test("planos: o dono muda o plano da empresa; plano inválido é recusado", async () => {
  assert.equal((await api("mestre", "PUT", `/api/superadmin/empresas/${alvo}/plano`, { plano: "ultra" })).corpo.empresa.plano.id, "ultra");
  assert.equal((await api("mestre", "PUT", `/api/superadmin/empresas/${alvo}/plano`, { plano: "ouro" })).status, 400);
  const demo = await api("admin", "GET", "/api/centrais/demonstrativo");
  assert.equal(demo.corpo.plano.id, "ultra", "a central enxerga o plano que o dono escolheu");
});

test("recursos: desligado some do menu (sessão) e o servidor recusa com 403; ligar de novo devolve", async () => {
  assert.equal((await api("admin", "GET", "/api/crm/campanhas")).status, 200);
  const off = await api("mestre", "PUT", `/api/superadmin/empresas/${alvo}/recursos`, { desligados: ["crm", "filiais", "analise"] });
  assert.deepEqual(off.corpo.empresa.recursosDesligados.sort(), ["analise", "crm", "filiais"]);
  assert.deepEqual((await api("admin", "GET", "/api/sessao")).corpo.recursosDesligados.sort(), ["analise", "crm", "filiais"]);
  for (const [m, url] of [["GET", "/api/crm/campanhas"], ["GET", "/api/filiais"], ["POST", "/api/relatorio"], ["POST", "/api/perguntar"]] as const) assert.equal((await api("admin", m, url, {})).status, 403, url);
  assert.equal((await api("admin", "GET", "/api/filiais/opcoes")).status, 200, "a lista curta de filtro continua");
  // outra empresa não é afetada
  assert.equal((await api("adminOutra", "GET", "/api/crm/campanhas")).status, 200);
  assert.equal((await api("mestre", "PUT", `/api/superadmin/empresas/${alvo}/recursos`, { desligados: ["nao-existe"] })).status, 400);
  await api("mestre", "PUT", `/api/superadmin/empresas/${alvo}/recursos`, { desligados: [] });
  assert.equal((await api("admin", "GET", "/api/crm/campanhas")).status, 200);
});

test("recursos: todo módulo aponta para funções e caminhos que existem", () => {
  const ids = new Set(FUNCOES.map((f) => f.id));
  for (const m of MODULOS) for (const f of m.funcoes) { assert.ok(ids.has(f), `${m.id}: função ${f} não existe`); assert.equal(moduloDaFuncao(f), m.id); }
  assert.equal(moduloDaRota("/crm/campanhas"), "crm");
  assert.equal(moduloDaRota("/centrais/seletor"), null);
  assert.equal(moduloDaRota("/centrais/rede"), "centrais");
  assert.equal(moduloDaRota("/filiais/opcoes"), null);
  assert.equal(moduloDaRota("/gestao/motoristas"), null);
});

test("marca e domínio: salva, valida e nunca deixa o mesmo domínio em duas empresas", async () => {
  const ok = await api("mestre", "PUT", `/api/superadmin/empresas/${alvo}/marca`, { produto: "Painel do Alvo", nomeExibido: "Alvo", corPrimaria: "#112233", dominios: ["painel.alvo.com.br", "https://app.alvo.com.br/"] });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.corpo.empresa.marca.dominios, ["painel.alvo.com.br", "app.alvo.com.br"]);
  assert.equal(ok.corpo.empresa.marca.corPrimaria, "#112233");
  assert.equal(D.marca(alvo).produto, "Painel do Alvo");
  assert.equal((await api("mestre", "PUT", `/api/superadmin/empresas/${outra}/marca`, { dominios: ["painel.alvo.com.br"] })).status, 400, "domínio de outra empresa");
  assert.equal((await api("mestre", "PUT", `/api/superadmin/empresas/${alvo}/marca`, { dominios: ["sem ponto"] })).status, 400);
  assert.equal(D.empresaDoDominio("painel.alvo.com.br")?.id, alvo);
});

test("uso e faturamento: corridas, receita e valor a pagar por empresa, com total e CSV", async () => {
  salvarCategoria(alvo, null, { nome: "Pop", taxaBase: 5, precoKm: 2, tarifaMinima: 8, comissaoTipo: "Percentual", comissaoValor: 10 }, "t");
  const mot = criar(alvo, cadastroPorId("motoristas")!, { nome: "Mot Alvo", telefone: "11970000001", status: "Ativo" }, "t");
  const c = await C.criarCorridaPropria(alvo, { passageiro: { nome: "Pax", telefone: "11910000001" }, embarque: { texto: "Rua A, 1" }, destino: { texto: "Rua B, 2" }, categoria: "Pop", pagamento: "Pix", canal: "painel", distanciaKm: 5 } as never, "t");
  C.atribuirMotorista(alvo, c.id, mot.id, "t");
  C.mudarStatus(alvo, c.id, "a_caminho"); C.mudarStatus(alvo, c.id, "no_local"); C.mudarStatus(alvo, c.id, "em_andamento");
  C.mudarStatus(alvo, c.id, "finalizada", { valor: 50 });
  const r = await api("mestre", "GET", "/api/superadmin/uso");
  assert.equal(r.status, 200);
  const linha = r.corpo.empresas.find((x: { id: string }) => x.id === alvo);
  assert.equal(linha.corridasFinalizadas, 1);
  assert.equal(linha.receitaBruta, 50);
  assert.equal(linha.motoristas, 1);
  assert.ok(linha.tarifas > 0);
  assert.ok(linha.aPagar >= linha.tarifas, "a pagar inclui a mensalidade do plano");
  assert.equal(r.corpo.totais.corridasFinalizadas, 1);
  assert.equal(r.corpo.totais.empresas, D.listarEmpresas().length);
  const outro = r.corpo.empresas.find((x: { id: string }) => x.id === outra);
  assert.equal(outro.corridasFinalizadas, 0, "uma empresa não soma corridas da outra");
  const csv = await api("mestre", "GET", "/api/superadmin/uso/csv");
  assert.equal(csv.status, 200);
  assert.match(csv.texto, /Cliente Alvo/);
  assert.match(csv.texto, /Total/);
  assert.equal((await api("mestre", "GET", "/api/superadmin/uso?competencia=2026-13")).status, 400);
});

test("centrais e franquias: o dono liga, abre e solta associadas", async () => {
  const r = await api("mestre", "POST", "/api/superadmin/centrais/vincular", { principalId: alvo, associadaId: outra });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.principais[0].associadas[0].id, outra);
  const nova = await api("mestre", "POST", `/api/superadmin/centrais/${alvo}/associadas`, { nome: "Franquia Nova", adminEmail: "franquia@s.test", adminSenha: SENHA });
  assert.equal(nova.status, 201);
  assert.equal(nova.corpo.principais[0].associadas.length, 2);
  assert.equal((await api("mestre", "POST", "/api/superadmin/centrais/vincular", { principalId: outra, associadaId: alvo })).status, 400);
  assert.equal((await api("mestre", "DELETE", `/api/superadmin/centrais/associadas/${outra}`)).status, 200);
  const lista = await api("mestre", "GET", "/api/superadmin/empresas");
  assert.equal(lista.corpo.empresas.find((x: { id: string }) => x.id === alvo).rede.tipo, "principal");
});

test("cargos: a função do painel do dono só aparece para o ADMIN Mestre", async () => {
  const { funcoesDoCargo } = await import("../src/comum/funcoes.ts");
  for (const c of ["operador", "gestor", "admin"]) assert.ok(!funcoesDoCargo(c).some((f) => f.id === "superadmin"), c);
  assert.ok(funcoesDoCargo("plataforma").some((f) => f.id === "superadmin"));
});
