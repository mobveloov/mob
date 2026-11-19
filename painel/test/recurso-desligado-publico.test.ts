// "Recurso desligado" também vale nas partes públicas e nos trabalhadores: webhook do bot, lista de empresas com bot,
// trabalhador do CRM, tela do totem e páginas públicas dos prêmios.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-recurso-pub-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "r".repeat(40);

const express = (await import("express")).default;
const D = await import("../src/servidor/dados.ts");
const B = await import("../src/servidor/banco.ts");
const BA = await import("../src/bot/armazem.ts");
const { rotasBot } = await import("../src/bot/rotas.ts");
const { rotasTotem } = await import("../src/totem/rotas.ts");
const TD = await import("../src/totem/dados.ts");
const S = await import("../src/superadmin/recursos.ts");
const CRM = await import("../src/crm/envio.ts");

const app = express();
app.use(express.json());
app.use("/api/bot", rotasBot);
app.use("/api/totem", rotasTotem);
const srv = app.listen(0);
const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/api`;
test.after(() => { srv.closeAllConnections(); srv.close(); B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

const e = D.criarEmpresa("Recurso Publico").id;
BA.salvarConfig(e, { ativo: true, provedor: "simulado", instancia: "" });
TD.salvarLocal(e, { nome: "Hotel Praia", endereco: { texto: "Rua A, 1", lat: -23.5, lng: -46.6 }, senha: "1234", pagamentos: ["Dinheiro"] });
const local = TD.listarLocais(e)[0].id;

test("bot: webhook e lista de empresas com bot ignoram a empresa com o recurso desligado", async () => {
  const url = `${base}/bot/webhook/${e}/${BA.segredoWebhook(e)}`;
  const corpo = JSON.stringify({ telefone: "5511900000077", nome: "Pedro", texto: "oi", id: "w1" });
  const h = { "Content-Type": "application/json" };
  assert.ok(BA.empresasComBot().includes(e));
  assert.equal((await (await fetch(url, { method: "POST", headers: h, body: corpo })).json() as { ignorado?: boolean }).ignorado, undefined);
  await BA.aguardarFilas();
  S.definirRecursos(e, ["bot"]);
  assert.ok(!BA.empresasComBot().includes(e), "fora da lista do bot");
  assert.equal((await (await fetch(url, { method: "POST", headers: h, body: corpo.replace("w1", "w2") })).json() as { ignorado?: boolean }).ignorado, true);
  S.definirRecursos(e, []);
});

test("totem: a tela pública do local some (404) com o recurso desligado", async () => {
  assert.equal((await fetch(`${base}/totem/publico/${e}/${local}`)).status, 200);
  S.definirRecursos(e, ["totem"]);
  assert.equal((await fetch(`${base}/totem/publico/${e}/${local}`)).status, 404);
  const pub = await fetch(`${base}/totem/premios/publico/${e}/info`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: "a".repeat(40) }) });
  assert.equal(pub.status, 404);
  assert.match(((await pub.json()) as { erro: string }).erro, /inválido/i, "mesma resposta de link inválido");
  S.definirRecursos(e, []);
});

test("CRM: o trabalhador pula a empresa com o recurso desligado", () => {
  assert.equal(CRM.empresaPodeRodarCrm(e), true);
  S.definirRecursos(e, ["crm"]);
  assert.equal(CRM.empresaPodeRodarCrm(e), false);
  S.definirRecursos(e, []);
});
