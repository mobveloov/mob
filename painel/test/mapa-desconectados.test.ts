// Mapa de motoristas: quem está desconectado aparece na última posição conhecida, com o horário do último contato, e respeita a filial.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-mapa-off-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "f".repeat(40);

const D = await import("../src/servidor/dados.ts");
const { app } = await import("../src/servidor/index.ts");
const B = await import("../src/servidor/banco.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar } = await import("../src/cadastros/armazem.ts");
const P = await import("../src/apps/despacho.ts");
const F = await import("../src/filiais/filiais.ts");
const { registrarContato } = await import("../src/apps/sessoes.ts");

const A = D.criarEmpresa("Empresa A").id;
const SENHA = "senha-forte-1";
const adm = D.criarUsuario({ email: "adm@m.test", nome: "Adm", senha: SENHA, empresaId: A, papel: "admin" });
const srv = app.listen(0);
const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
test.after(() => { srv.closeAllConnections(); srv.close(); B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });
const r0 = await fetch(`${base}/api/entrar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: adm.email, senha: SENHA }) });
const cookie = (r0.headers.get("set-cookie") ?? "").split(";")[0];
const mapa = async (q = "") => (await (await fetch(`${base}/api/operacao/mapa${q}`, { headers: { Cookie: cookie } })).json()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const mot = (nome: string, tel: string) => criar(A, cadastroPorId("motoristas")!, { nome, telefone: tel, status: "Ativo" }, "t");
const on = mot("Fica Online", "16990000011"), off = mot("Ficou Offline", "16990000012"), nunca = mot("Nunca Entrou", "16990000013");

test("conectado tem posição de agora; desconectado guarda a última posição e o contato", async () => {
  P.ficarOnline(A, on.id, -21.01, -48.22);
  P.ficarOnline(A, off.id, -21.02, -48.23);
  P.ficarOffline(A, off.id);
  registrarContato(A, "motorista", off.id, Date.now() - 12 * 60_000);
  const j = await mapa();
  const por = (id: string) => j.motoristas.find((m: { id: string }) => m.id === id);
  assert.equal(por(on.id).situacao, "livre");
  assert.equal(por(off.id).situacao, "offline");
  assert.equal(por(off.id).lat, -21.02);
  assert.equal(por(off.id).lng, -48.23);
  assert.ok(por(off.id).ultimoContatoEm);
  assert.equal(por(nunca.id).situacao, "offline");
  assert.equal(por(nunca.id).lat, null);
  assert.equal(por(nunca.id).ultimoContatoEm, null);
  assert.equal(j.stats.conectados, 1);
  assert.equal(j.stats.desconectados, 2);
  assert.equal(j.stats.cadastrosAtivos, 3);
});

test("o filtro de filial vale também para os desconectados", async () => {
  const f = F.criarFilial(A, { nome: "Pitangueiras", lat: -21.0128, lng: -48.2217 }, "t");
  F.vincular(A, f.id, "motorista", [off.id]);
  const j = await mapa(`?filial=${f.id}`);
  assert.deepEqual(j.motoristas.map((m: { id: string }) => m.id), [off.id]);
  assert.equal(j.stats.conectados, 0);
  assert.equal(j.stats.desconectados, 1);
});
