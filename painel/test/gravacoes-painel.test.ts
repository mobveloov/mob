// Gravações das corridas no painel: lista com nomes, toca a gravação inteira, registra quem abriu, "guardar", só admin, e o aviso do passageiro só vale se existe gravação.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-grav-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "h".repeat(40);

const D = await import("../src/servidor/dados.ts");
const { app } = await import("../src/servidor/index.ts");
const B = await import("../src/servidor/banco.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar } = await import("../src/cadastros/armazem.ts");
const C = await import("../src/corridas/index.ts");
const G = await import("../src/apps/gravacoes.ts");
const P = await import("../src/apps/despacho.ts");

const A = D.criarEmpresa("Empresa Grav").id;
const SENHA = "senha-forte-1";
const adm = D.criarUsuario({ email: "adm@g.test", nome: "Adm", senha: SENHA, empresaId: A, papel: "admin" });
const ope = D.criarUsuario({ email: "ope@g.test", nome: "Ope", senha: SENHA, empresaId: A, papel: "operador" });
const srv = app.listen(0);
const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
test.after(() => { srv.closeAllConnections(); srv.close(); B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });
async function entrar(email: string) {
  const r = await fetch(`${base}/api/entrar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, senha: SENHA }) });
  return (r.headers.get("set-cookie") ?? "").split(";")[0];
}
const cAdm = await entrar(adm.email), cOpe = await entrar(ope.email);
const get = (u: string, cookie: string) => fetch(`${base}/api/apps-central${u}`, { headers: { Cookie: cookie } });

const mot = criar(A, cadastroPorId("motoristas")!, { nome: "Carlos Motorista", telefone: "16990000001", status: "Ativo" }, "t");
const corrida = await C.criarCorridaPropria(A, { passageiro: { nome: "Maria Passageira", telefone: "16999990001" }, embarque: { texto: "Rua A, 1", lat: -21.01, lng: -48.22 }, categoria: "", pagamento: "Pix", canal: "app" });
const webm = (extra: string) => Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from(extra)]);

test("sem gravação: o aviso 'Esta corrida é gravada' do passageiro não aparece", () => {
  assert.equal(P.corridaParaApp(A, corrida, "passageiro").gravada, false);
});

test("o motorista envia dois pedaços: a lista mostra motorista, passageiro, duração e tamanho; o aviso passa a valer", async () => {
  G.salvarParte(A, corrida, mot.id, webm("AAAA"), "audio/webm", 0, 30, false);
  G.salvarParte(A, corrida, mot.id, Buffer.from("BBBB"), "audio/webm", 1, 20, false);
  assert.equal(P.corridaParaApp(A, corrida, "passageiro").gravada, true);
  const r = await get("/gravacoes", cAdm);
  assert.equal(r.status, 200);
  const j = (await r.json()) as { gravacoes: Array<Record<string, any>> }; // eslint-disable-line @typescript-eslint/no-explicit-any
  assert.equal(j.gravacoes.length, 1);
  const g = j.gravacoes[0];
  assert.equal(g.motorista, "Carlos Motorista"); assert.equal(g.passageiro, "Maria Passageira");
  assert.equal(g.segundos, 50); assert.equal(g.bytes, 4 + 4 + 4);
});

test("toca a gravação inteira (pedaços juntos), baixar usa attachment, e cada abertura fica registrada", async () => {
  const r = await get(`/gravacoes/${corrida.id}/completa`, cAdm);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "audio/webm");
  assert.equal(Buffer.from(await r.arrayBuffer()).toString("latin1").slice(4), "AAAABBBB");
  const d = await get(`/gravacoes/${corrida.id}/completa?baixar=1`, cAdm);
  assert.match(d.headers.get("content-disposition") ?? "", /^attachment; filename="gravacao-/);
  await d.arrayBuffer();
  const idx = G.listarGravacoes(A, corrida.id)[0];
  assert.equal(idx.acessos.length, 2);
  assert.equal(idx.acessos[0].por, "adm@g.test");
});

test("guardar sem prazo: marca e a limpeza por prazo não apaga", async () => {
  const r = await fetch(`${base}/api/apps-central/gravacoes/${corrida.id}/guardar`, { method: "POST", headers: { Cookie: cAdm, "Content-Type": "application/json" }, body: JSON.stringify({ guardar: true }) });
  assert.equal(r.status, 200);
  assert.equal(G.limparGravacoes(A, Date.now() + 400 * 86_400_000), 0, "marcada para guardar não é apagada");
});

test("só admin: operador não lista nem ouve", async () => {
  assert.equal((await get("/gravacoes", cOpe)).status, 403);
  assert.equal((await get(`/gravacoes/${corrida.id}/completa`, cOpe)).status, 403);
});
