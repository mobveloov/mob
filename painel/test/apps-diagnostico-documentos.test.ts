// Diagnóstico "APP ON/OFF" pelo último contato do app e documentos obrigatórios (Configurações Gerais) validados no servidor.
// Tudo local, sem internet.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "diag-docs-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "d".repeat(40);
process.env.APPS_MOSTRAR_CODIGO = "1";
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
const { registrarContato } = await import("../src/apps/sessoes.ts");

const app = express();
app.use(express.json());
app.post("/teste/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({ ok: true }); });
app.use("/api/apps", rotasApps);
app.use("/api", exigirLogin);
app.use("/api/gestao", G.rotasGestao);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => { servidor.closeAllConnections(); servidor.close(); B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

const U = D.criarEmpresa("Via Diag");
const admin = D.criarUsuario({ email: "adm@d.test", nome: "Adm", senha: "senha-forte-1", empresaId: U.id, papel: "admin" });
const API = `/api/apps/${U.id}`;
const MOT = cadastroPorId("motoristas")!;
const PNG = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, ...Array.from({ length: 200 }, (_, i) => i)]);
const JPG = () => new Uint8Array([0xff, 0xd8, 0xff, ...Array.from({ length: 200 }, (_, i) => i)]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function app_(metodo: string, url: string, corpo?: unknown, token?: string, tipo?: string): Promise<{ status: number; corpo: any }> {
  const bruto = corpo instanceof Uint8Array;
  const r = await fetch(base + API + url, { method: metodo, headers: { ...(corpo !== undefined ? { "content-type": bruto ? tipo! : "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: corpo === undefined ? undefined : bruto ? (corpo as unknown as BodyInit) : JSON.stringify(corpo) });
  return { status: r.status, corpo: await r.json().catch(() => ({})) };
}
let cookie = "";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function painel(metodo: string, url: string): Promise<{ status: number; corpo: any }> {
  cookie ||= ((await fetch(`${base}/teste/entrar/${admin.id}`, { method: "POST" })).headers.get("set-cookie") ?? "").split(";")[0];
  const r = await fetch(`${base}/api/gestao${url}`, { method: metodo, headers: { cookie } });
  const corpo = await r.json().catch(() => ({}));
  return { status: r.status, corpo };
}
const diag = async (id: string) => (await painel("GET", `/motoristas?aba=ativos&nome=${encodeURIComponent(String(listar(U.id, MOT).find((m) => m.id === id)!.nome))}`)).corpo.motoristas.find((m: { id: string }) => m.id === id).diagnostico;

test("diagnóstico: APP OFF só sem contato há mais de 7 dias, sem sessão e sem token de push", async () => {
  const novo = criar(U.id, MOT, { nome: "Nunca Abriu", telefone: "11944440001", status: "Ativo" }, "teste");
  assert.equal((await diag(novo.id)).app, false, "nunca instalou");
  const antigo = criar(U.id, MOT, { nome: "Contato Antigo", telefone: "11944440002", status: "Ativo" }, "teste");
  registrarContato(U.id, "motorista", antigo.id, Date.now() - 10 * 86_400_000);
  assert.equal((await diag(antigo.id)).app, false, "sem contato há 10 dias");
  const recente = criar(U.id, MOT, { nome: "Contato Recente", telefone: "11944440003", status: "Ativo" }, "teste");
  registrarContato(U.id, "motorista", recente.id, Date.now() - 2 * 86_400_000);
  const d = await diag(recente.id);
  assert.equal(d.app, true, "contato há 2 dias"); assert.ok(d.ultimoContato);
});

test("diagnóstico: os dias sem contato vêm de Configurações > Gerais e ficam entre 1 e 90", async () => {
  const { salvarGerais, gerais } = await import("../src/config/gerais.ts");
  const m = criar(U.id, MOT, { nome: "Dez Dias Fora", telefone: "11944440099", status: "Ativo" }, "teste");
  registrarContato(U.id, "motorista", m.id, Date.now() - 10 * 86_400_000);
  try {
    assert.equal(gerais(U.id).motorista.diasSemContatoApp, 7, "padrão 7");
    assert.equal((await diag(m.id)).app, false, "10 dias > 7");
    salvarGerais(U.id, { motorista: { diasSemContatoApp: 15 } });
    assert.equal((await diag(m.id)).app, true, "10 dias < 15");
    salvarGerais(U.id, { motorista: { diasSemContatoApp: 5 } });
    assert.equal((await diag(m.id)).app, false, "10 dias > 5");
    assert.equal(salvarGerais(U.id, { motorista: { diasSemContatoApp: 500 } }).motorista.diasSemContatoApp, 90, "máximo 90");
    assert.equal(salvarGerais(U.id, { motorista: { diasSemContatoApp: 0 } }).motorista.diasSemContatoApp, 1, "mínimo 1");
    assert.equal(salvarGerais(U.id, { motorista: { diasSemContatoApp: 12.6 } }).motorista.diasSemContatoApp, 13, "inteiro");
    assert.equal(salvarGerais(U.id, { motorista: { diasSemContatoApp: "abc" } }).motorista.diasSemContatoApp, 7, "lixo volta ao padrão");
  } finally { salvarGerais(U.id, { motorista: { diasSemContatoApp: 7 } }); }
});

test("diagnóstico: o login e qualquer chamada do app contam como contato; o ping também", async () => {
  const m = criar(U.id, MOT, { nome: "Logou Agora", telefone: "11944440004", status: "Ativo" }, "teste");
  assert.equal((await diag(m.id)).app, false);
  const c = await app_("POST", "/entrar/codigo", { papel: "motorista", telefone: "11944440004" });
  const e = await app_("POST", "/entrar", { papel: "motorista", telefone: "11944440004", codigo: c.corpo.codigoTeste });
  assert.equal(e.status, 200, JSON.stringify(e.corpo));
  assert.equal((await app_("POST", "/ping", {}, e.corpo.token)).status, 200);
  const d = await diag(m.id);
  assert.equal(d.app, true); assert.ok(d.ultimoContato, "o ping gravou o último contato");
});

test("diagnóstico: grava no banco no máximo 1 vez a cada 5 minutos por pessoa", () => {
  const t0 = Date.now() - 3_600_000;
  registrarContato(U.id, "motorista", "pessoa-limite", t0);
  registrarContato(U.id, "motorista", "pessoa-limite", t0 + 60_000);
  registrarContato(U.id, "motorista", "pessoa-limite", t0 + 4 * 60_000);
  const em = () => (B.banco().prepare("SELECT em FROM app_contato WHERE empresa = ? AND chave = 'pessoa-limite'").get(U.id) as { em: number }).em;
  assert.equal(em(), t0);
  registrarContato(U.id, "motorista", "pessoa-limite", t0 + 6 * 60_000);
  assert.equal(em(), t0 + 6 * 60_000);
});

test("documentos obrigatórios: o servidor recusa concluir sem os marcados e lista o que falta", async () => {
  const r = await app_("POST", "/conta/criar", { papel: "motorista", nome: "Docs Do Motorista", cpf: "52998224725", genero: "Masculino", nascimento: "1990-05-10", chavePix: "d@pix.test", telefone: "11944440009", email: "docs@d.test", senha: "segredo1" });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  const t = r.corpo.token;
  const lista = (await app_("GET", "/documentos", undefined, t)).corpo;
  assert.deepEqual([...lista.obrigatorios].sort(), ["cnh", "veiculo"], "os marcados em Configurações Gerais (CNH e CRLV por padrão)");
  const falta = await app_("POST", "/cadastro/concluir", {}, t);
  assert.equal(falta.status, 400);
  assert.match(falta.corpo.erro, /Faltam documentos obrigatórios/);
  assert.match(falta.corpo.erro, /Foto do rosto/); assert.match(falta.corpo.erro, /CNH/); assert.match(falta.corpo.erro, /CRLV/);
  assert.ok(!/residência/i.test(falta.corpo.erro), "documento não marcado não é exigido");
  await app_("POST", "/foto", PNG(), t, "image/png");
  await app_("POST", "/documentos/cnh", JPG(), t, "image/jpeg");
  const meio = await app_("POST", "/cadastro/concluir", {}, t);
  assert.equal(meio.status, 400); assert.match(meio.corpo.erro, /CRLV/); assert.ok(!/CNH/.test(meio.corpo.erro));
  await app_("POST", "/documentos/veiculo", JPG(), t, "image/jpeg");
  const ok = await app_("POST", "/cadastro/concluir", {}, t);
  assert.equal(ok.status, 200, JSON.stringify(ok.corpo));
  const m = listar(U.id, MOT).find((x) => x.cpf === "52998224725")!;
  assert.ok(m.cadastroConcluidoEm);
  // O painel mostra a mesma marca em Documentos.
  const det = (await painel("GET", `/motoristas/${m.id}`)).corpo;
  assert.equal(det.documentos.find((d: { tipo: string }) => d.tipo === "cnh").obrigatorio, true);
  assert.equal(det.documentos.find((d: { tipo: string }) => d.tipo === "residencia").obrigatorio, false);
});

test("documentos obrigatórios: mudar a lista em Configurações Gerais muda a exigência", async () => {
  const { salvarGerais, gerais } = await import("../src/config/gerais.ts");
  const g = gerais(U.id);
  salvarGerais(U.id, { motorista: { documentos: g.motorista.documentos.map((d) => (d.id === "residencia" ? { ...d, exigir: true } : d.id === "veiculo" ? { ...d, exigir: false } : d)) } });
  const r = await app_("POST", "/conta/criar", { papel: "motorista", nome: "Outro Motorista Teste", cpf: "11144477735", genero: "Masculino", nascimento: "1991-05-10", chavePix: "o@pix.test", telefone: "11944440010", email: "o@d.test", senha: "segredo1" });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  const t = r.corpo.token;
  const lista = (await app_("GET", "/documentos", undefined, t)).corpo;
  assert.deepEqual([...lista.obrigatorios].sort(), ["cnh", "residencia"]);
  const falta = await app_("POST", "/cadastro/concluir", {}, t);
  assert.match(falta.corpo.erro, /Comprovante de residência/); assert.ok(!/CRLV/.test(falta.corpo.erro));
});
