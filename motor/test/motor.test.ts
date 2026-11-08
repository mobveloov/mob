import assert from "node:assert/strict";
import { test } from "node:test";
import { MotorErro, capacidadesPorSistema, criarMotor, empresaDoEnv, type Empresa } from "../src/index.ts";
import { buscarCorridas } from "../src/busca.ts";
import { A_URL, B_APP, B_PAINEL, fetchFalso, rota } from "./fetch-falso.ts";

const EMPRESA: Empresa = {
  id: "empresa-a",
  integracoes: [
    { id: "sistema-a", tipo: "sistema-a", credenciais: { apiUrl: A_URL, apiKey: "k", usuario: "u", senha: "s" } },
    { id: "sistema-b", tipo: "sistema-b", credenciais: { painelUrl: B_PAINEL, appApiUrl: B_APP, cookie: "PHPSESSID=x" } },
  ],
};

const maquina = { id: "1", status_solicitacao: "F", data_hora_solicitacao_utc: "2026-11-07T12:00:00Z", partida: { endereco: "A" }, paradas: [] };
const corridaB = { id: 2, status: "4", date: "2026-11-07 10:00:00", endereco_ini_txt: "B" }; // 13:00Z

test("todas: junta as duas integrações, mais nova primeiro (datas com fusos diferentes)", async () => {
  const f = fetchFalso(
    rota("POST", "/corridas/consultar", { json: { success: true, data: [maquina] } }),
    rota("POST", "/consultar_corridas_api.php", { json: { data: [corridaB], total_pags: 1 } }),
  );
  const r = await criarMotor(EMPRESA, { fetch: f.fetch }).listarCorridas("todas");
  assert.deepEqual(r.itens.map((c) => [c.id, c.origem]), [["sistema-b:2", "sistema-b"], ["sistema-a:1", "sistema-a"]]);
  assert.equal(r.avisos, undefined);
});

test("todas: uma integração com erro vira aviso, a outra continua", async () => {
  const f = fetchFalso(
    rota("POST", "/corridas/consultar", { status: 503, texto: "" }),
    rota("POST", "/consultar_corridas_api.php", { json: { data: [corridaB], total_pags: 1 } }),
  );
  const r = await criarMotor(EMPRESA, { fetch: f.fetch }).listarCorridas("todas");
  assert.deepEqual(r.itens.map((c) => c.id), ["sistema-b:2"]);
  assert.deepEqual(r.avisos?.map((a) => [a.integracaoId, a.origem, a.codigo]), [["sistema-a", "sistema-a", "INDISPONIVEL"]]);
});

test("todas: integração sem credencial vira aviso NAO_CONFIGURADO; nenhuma = erro", async () => {
  const f = fetchFalso(rota("POST", "/consultar_corridas_api.php", { json: { data: [corridaB] } }));
  const emp: Empresa = { id: "b", integracoes: [{ id: "m", tipo: "sistema-a", credenciais: {} }, { id: "o", tipo: "sistema-b", credenciais: { painelUrl: B_PAINEL, appApiUrl: B_APP, cookie: "x" } }] };
  const r = await criarMotor(emp, { fetch: f.fetch }).listarCorridas("todas");
  assert.equal(f.pedidos.length, 1);
  assert.deepEqual(r.itens.map((c) => c.id), ["o:2"]);
  assert.equal(r.avisos?.[0].codigo, "NAO_CONFIGURADO");
  await assert.rejects(criarMotor({ id: "c", integracoes: [] }, { fetch: f.fetch }).listarCorridas("todas"), (e: MotorErro) => e.codigo === "NAO_CONFIGURADO");
});

test("várias empresas ao mesmo tempo: cada uma usa só as próprias credenciais", async () => {
  const f = fetchFalso(rota("POST", "/corridas/consultar", { json: { success: true, data: [maquina] } }));
  const a = criarMotor({ id: "a", integracoes: [{ id: "mA", tipo: "sistema-a", credenciais: { apiUrl: A_URL, apiKey: "chave-A", usuario: "u", senha: "s" } }] }, { fetch: f.fetch });
  const b = criarMotor({ id: "b", integracoes: [{ id: "mB", tipo: "sistema-a", credenciais: { apiUrl: A_URL, apiKey: "chave-B", usuario: "u", senha: "s" } }] }, { fetch: f.fetch });
  const [ra, rb] = await Promise.all([a.listarCorridas("todas"), b.listarCorridas("todas")]);
  assert.deepEqual(f.pedidos.map((p) => p.cabecalhos["api-key"]).sort(), ["chave-A", "chave-B"]);
  assert.equal(ra.itens[0].id, "mA:1");
  assert.equal(rb.itens[0].id, "mB:1");
  await assert.rejects(a.detalharCorrida("mB:1"), (e: MotorErro) => e.codigo === "NAO_ENCONTRADO");
});

test("uma empresa pode ter duas integrações do mesmo tipo", async () => {
  const f = fetchFalso(rota("POST", "/corridas/consultar", { json: { success: true, data: [maquina] } }));
  const emp: Empresa = {
    id: "x",
    integracoes: [
      { id: "central-a", tipo: "sistema-a", credenciais: { apiUrl: A_URL, apiKey: "1", usuario: "u", senha: "s" } },
      { id: "central-b", tipo: "sistema-a", credenciais: { apiUrl: A_URL, apiKey: "2", usuario: "u", senha: "s" } },
    ],
  };
  const r = await criarMotor(emp, { fetch: f.fetch }).listarCorridas("todas");
  assert.deepEqual(r.itens.map((c) => c.id).sort(), ["central-a:1", "central-b:1"]);
  assert.throws(() => criarMotor({ id: "y", integracoes: [emp.integracoes[0], emp.integracoes[0]] }), (e: MotorErro) => e.codigo === "DADOS_INVALIDOS");
});

test("detalhar/cancelar escolhem a integração pelo prefixo do id", async () => {
  const f = fetchFalso(
    rota("GET", "/corridas/1", { json: { success: true, data: [maquina] } }),
    rota("POST", "/cancelar_corrida_painel.php", { json: { success: true } }),
  );
  const m = criarMotor(EMPRESA, { fetch: f.fetch });
  assert.equal((await m.detalharCorrida("sistema-a:1")).origem, "sistema-a");
  await m.cancelarCorrida("sistema-b:2");
  assert.ok(f.pedidos[1].url.pathname.endsWith("cancelar_corrida_painel.php"));
  await assert.rejects(m.detalharCorrida("123"), (e: MotorErro) => e.codigo === "DADOS_INVALIDOS");
});

test("capacidades: explícitas por sistema, com motivo quando não há", async () => {
  const caps = capacidadesPorSistema();
  const m = caps.find((c) => c.tipo === "sistema-a")!;
  const o = caps.find((c) => c.tipo === "sistema-b")!;
  assert.equal(o.origem, "sistema-b");
  assert.equal(m.funcoes.webhook.disponivel, true);
  assert.equal(o.funcoes.webhook.disponivel, false);
  assert.match(o.funcoes.webhook.motivo!, /não envia/);
  for (const c of caps) for (const [nome, cap] of Object.entries(c.funcoes)) if (!cap.disponivel) assert.ok(cap.motivo, `${c.tipo}.${nome} sem motivo`);
  // O Sistema B não envia webhook: chamar dá erro explícito.
  await assert.rejects(criarMotor(EMPRESA).lerWebhook("sistema-b", "{}"), (e: MotorErro) => e.codigo === "NAO_SUPORTADO");
});

test("status(): mostra o que falta configurar, por integração", () => {
  const s = criarMotor({ id: "z", integracoes: [{ id: "m", tipo: "sistema-a", credenciais: { apiUrl: A_URL, apiKey: "k" } }] }).status();
  assert.equal(s[0].configurado, false);
  assert.equal(s[0].pendencias.length, 2);
  assert.equal(s[0].origem, "sistema-a");
});

test("empresaDoEnv: monta a empresa a partir do .env (uso com uma empresa só)", () => {
  const e = empresaDoEnv({ SISTEMA_A_API_KEY: "k", SISTEMA_A_USUARIO: "u", SISTEMA_A_SENHA: "s", SISTEMA_B_COOKIE: "c", SISTEMA_B_CIDADE_ID: "1" });
  assert.deepEqual(e.integracoes.map((i) => i.id), ["sistema-a", "sistema-b"]);
  assert.deepEqual(empresaDoEnv({}).integracoes, []);
});

test("observador: primeira leitura só memoriza; depois gera evento quando o status muda", async () => {
  let status = "1";
  const f = fetchFalso(() => ({ json: { data: [{ ...corridaB, status }], total_pags: 1 } }));
  const obs = criarMotor(EMPRESA, { fetch: f.fetch }).observador("sistema-b");
  assert.deepEqual(await obs.verificar(), []);
  assert.deepEqual(await obs.verificar(), []);
  status = "2";
  const ev = await obs.verificar();
  assert.equal(ev.length, 1);
  assert.equal(ev[0].corridaId, "sistema-b:2");
  assert.equal(ev[0].origem, "sistema-b");
  assert.equal(ev[0].statusAnterior, "aceita");
  assert.equal(ev[0].status, "no_local");
});

test("buscarCorridas (filtro do painel): datas, grupo, busca livre e integração indisponível", async () => {
  const c1 = { ...corridaB, id: 10, status: "4", nome_cliente: "Maria Souza", f_pagamento: "Pix" };
  const c2 = { ...corridaB, id: 11, status: "4", nome_cliente: "João", f_pagamento: "Dinheiro" };
  const f = fetchFalso(
    rota("POST", "/consultar_corridas_api.php", { json: { data: [c1, c2], total_pags: 1 } }),
    rota("POST", "/corridas/consultar", { status: 401, json: { error: { message: "Access credentials are invalid" } } }),
  );
  const r = await buscarCorridas(criarMotor(EMPRESA, { fetch: f.fetch }), { inicio: "2026-11-07", fim: "2026-11-07", status: "finalizada", busca: "maria", pagamento: "pix" });
  assert.deepEqual(r.corridas.map((c) => c.id), ["sistema-b:10"]);
  assert.deepEqual(r.indisponivel.map((i) => [i.integracaoId, i.codigo]), [["sistema-a", "SEM_AUTORIZACAO"]]);
  const corpoA = JSON.parse(f.pedidos.find((p) => p.url.pathname.endsWith("/corridas/consultar"))!.corpo!);
  assert.equal(corpoA.data_hora_solicitacao_min, "2026-11-07T00:00:00-03:00");
  assert.equal(corpoA.data_hora_solicitacao_max, "2026-11-07T23:59:59-03:00");
  assert.equal(corpoA.status_solicitacao, "F");
});

test("buscarCorridas: programadas ainda não existem no motor e isso vem explícito", async () => {
  const f = fetchFalso();
  const r = await buscarCorridas(criarMotor(EMPRESA, { fetch: f.fetch }), { programada: true });
  assert.equal(f.pedidos.length, 0);
  assert.equal(r.indisponivel.length, 2);
  assert.ok(r.indisponivel.every((i) => i.codigo === "NAO_SUPORTADO" && i.motivo));
});

test("MotorErro.paraJson não vaza detalhe interno", () => {
  const e = new MotorErro("LIMITE", "espere", { integracaoId: "sistema-a", tentarEmSegundos: 5, detalhe: { segredo: 1 } });
  assert.deepEqual(e.paraJson(), { codigo: "LIMITE", mensagem: "espere", integracaoId: "sistema-a", statusHttp: undefined, tentarEmSegundos: 5 });
});
