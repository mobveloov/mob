import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { criarServidor } from "../src/servidor.ts";
import { A_URL, B_APP, B_PAINEL, fetchFalso, rota } from "./fetch-falso.ts";

const fetchReal = globalThis.fetch;

async function comServidor(op: Parameters<typeof criarServidor>[0], fn: (base: string, log: string[]) => Promise<void>) {
  const log: string[] = [];
  const s = criarServidor({ ...op, registrar: (l) => log.push(l) });
  await new Promise<void>((ok) => s.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
  try {
    await fn(base, log);
  } finally {
    await new Promise<void>((ok) => s.close(() => ok()));
  }
}

const CORPO = {
  empresaId: "empresa-a",
  integracoes: [{ id: "sistema-b", tipo: "sistema-b", credenciais: { painelUrl: B_PAINEL, appApiUrl: B_APP, cookie: "PHPSESSID=segredo-nao-pode-ir-pro-log" } }],
};

test("servidor: capacidades, busca e erros no formato { erro }", async () => {
  const f = fetchFalso(rota("POST", "/consultar_corridas_api.php", { json: { data: [{ id: 5, status: "4", date: "2026-11-07 10:00:00", endereco_ini_txt: "Rua X" }], total_pags: 1 } }));
  await comServidor({ token: "t0k3n", rede: { fetch: f.fetch } }, async (base, log) => {
    const h = { Authorization: "Bearer t0k3n", "Content-Type": "application/json" };

    assert.equal((await fetchReal(`${base}/v1/saude`)).status, 401); // sem token

    const caps = await (await fetchReal(`${base}/v1/capacidades`, { headers: h })).json();
    assert.ok(caps.fontes.find((x: { tipo: string }) => x.tipo === "sistema-b").funcoes.includes("listarCorridas"));
    assert.equal(caps.sistemas.find((x: { tipo: string }) => x.tipo === "sistema-b").funcoes.webhook.disponivel, false);

    const r = await fetchReal(`${base}/v1/corridas/buscar`, { method: "POST", headers: h, body: JSON.stringify({ ...CORPO, filtro: { ultimasHoras: 2 } }) });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.corridas[0].id, "sistema-b:5");
    assert.equal(j.corridas[0].origem, "sistema-b");

    const sem = await fetchReal(`${base}/v1/corridas/buscar`, { method: "POST", headers: h, body: JSON.stringify({ integracoes: [] }) });
    assert.equal(sem.status, 400);
    assert.match((await sem.json()).erro, /empresaId/);

    const ruim = await fetchReal(`${base}/v1/corridas/detalhe`, { method: "POST", headers: h, body: JSON.stringify({ ...CORPO, id: "semprefixo" }) });
    assert.equal(ruim.status, 400);

    const wh = await fetchReal(`${base}/v1/webhooks/ler`, { method: "POST", headers: h, body: JSON.stringify({ ...CORPO, integracaoId: "sistema-b", corpo: "{}" }) });
    assert.equal(wh.status, 501);
    assert.equal((await wh.json()).codigo, "NAO_SUPORTADO");

    // O log nunca leva corpo nem credencial.
    assert.ok(log.length >= 5);
    assert.ok(log.every((l) => !l.includes("segredo") && !l.includes("PHPSESSID")));
  });
});

test("servidor: credencial recusada pelo sistema vira 502 (não confunde com o token do motor)", async () => {
  const f = fetchFalso(() => ({ json: { success: false, msg: "Acesso negado" } }));
  await comServidor({ rede: { fetch: f.fetch } }, async (base) => {
    const r = await fetchReal(`${base}/v1/corridas/detalhe`, { method: "POST", body: JSON.stringify({ ...CORPO, id: "sistema-b:1" }) });
    assert.equal(r.status, 502);
    assert.equal((await r.json()).codigo, "SEM_AUTORIZACAO");
  });
});
