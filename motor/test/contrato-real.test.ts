// Teste de contrato contra as APIs REAIS. Só leitura: nunca cria nem cancela corrida.
// Roda só quando você pede:  MOTOR_TESTE_REAL=1  (credenciais de UMA empresa de teste no ambiente;
// veja motor/.env.example). Sem credencial, cada parte é pulada com o motivo.
//   node --test --experimental-strip-types motor/test/contrato-real.test.ts
//   deno test -A --no-check motor/test/contrato-real.test.ts

import assert from "node:assert/strict";
import { test } from "node:test";
import { MotorErro, criarMotor, empresaDoEnv } from "../src/index.ts";

const real = process.env.MOTOR_TESTE_REAL === "1";
const empresa = empresaDoEnv();
const motor = criarMotor(empresa);
const tem = (id: string) => motor.adaptadores.some((a) => a.integracaoId === id && a.configurado());

const pular = (cond: boolean, motivo: string) => (!real ? "defina MOTOR_TESTE_REAL=1" : cond ? false : motivo);

// Os endereços dos sistemas não ficam no código: vêm do ambiente (SISTEMA_A_API_URL, SISTEMA_B_PAINEL_URL, SISTEMA_B_APP_API_URL).
const env = (k: string) => (process.env[k] ?? "").trim();

test("Sistema A: com chave falsa o servidor recusa (HTTP 403) e o motor traduz para SEM_AUTORIZACAO", { skip: pular(!!env("SISTEMA_A_API_URL"), "defina SISTEMA_A_API_URL") }, async () => {
  const m = criarMotor({ id: "teste", integracoes: [{ id: "m", tipo: "sistema-a", credenciais: { apiUrl: env("SISTEMA_A_API_URL"), apiKey: "x", usuario: "x", senha: "x" } }] });
  await assert.rejects(m.categorias("m"), (e: MotorErro) => e.codigo === "SEM_AUTORIZACAO");
});

test("Sistema B: sem sessão o painel responde 'Acesso negado' e o motor traduz para SEM_AUTORIZACAO", { skip: pular(!!env("SISTEMA_B_PAINEL_URL"), "defina SISTEMA_B_PAINEL_URL") }, async () => {
  const m = criarMotor({ id: "teste", integracoes: [{ id: "o", tipo: "sistema-b", credenciais: { painelUrl: env("SISTEMA_B_PAINEL_URL"), cookie: "PHPSESSID=sessao-invalida-de-teste" } }] });
  await assert.rejects(m.listarCorridas("o"), (e: MotorErro) => e.codigo === "SEM_AUTORIZACAO");
});

test("Sistema A: categorias, corridas das últimas 24h e motoristas", { skip: pular(tem("sistema-a"), "credenciais do Sistema A ausentes") }, async () => {
  const cats = await motor.categorias("sistema-a");
  assert.ok(Array.isArray(cats.itens));
  const r = await motor.listarCorridas("sistema-a", { limite: 5 });
  for (const c of r.itens) {
    assert.match(c.id, /^sistema-a:\d+$/);
    assert.notEqual(c.status, "desconhecido", `status novo: ${c.statusOriginal}`);
  }
  if (r.itens[0]) assert.equal((await motor.detalharCorrida(r.itens[0].id)).id, r.itens[0].id);
  const ms = await motor.motoristas("sistema-a", { limite: 5 });
  assert.ok(Array.isArray(ms.itens));
});

/** Chama todas as leituras extras de uma integração. Função sem suporte deve dar NAO_SUPORTADO, nunca outro erro. */
async function leiturasExtras(integracaoId: string) {
  const falhas: string[] = [];
  const tentar = async (nome: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      if (!(e instanceof MotorErro && e.codigo === "NAO_SUPORTADO")) falhas.push(`${nome}: ${e instanceof Error ? e.message : e}`);
    }
  };
  await tentar("programadas", () => motor.programadas(integracaoId));
  await tentar("posicoes", () => motor.posicoesMotoristas(integracaoId));
  await tentar("passageiros", () => motor.passageiros(integracaoId, { limite: 5 }));
  await tentar("conveniadas", () => motor.conveniadas(integracaoId, { limite: 5 }));
  await tentar("extrato", () => motor.extrato(integracaoId));
  await tentar("carteiras", () => motor.carteiras(integracaoId));
  await tentar("cupons", () => motor.cupons(integracaoId));
  await tentar("dinamicas", () => motor.dinamicas(integracaoId));
  await tentar("punicoes", () => motor.punicoes(integracaoId));
  await tentar("areas", () => motor.areas(integracaoId));
  await tentar("veiculos", () => motor.veiculos(integracaoId));
  const ultima = (await motor.listarCorridas(integracaoId, { limite: 1 })).itens[0];
  if (ultima) {
    await tentar("linhaDoTempo", () => motor.linhaDoTempo(ultima.id));
    await tentar("mensagens", () => motor.mensagensCorrida(ultima.id));
    await tentar("rastreio", () => motor.rastrearCorrida(ultima.id));
  }
  assert.deepEqual(falhas, []);
}

test("Sistema A: leituras extras (só leitura)", { skip: pular(tem("sistema-a"), "credenciais do Sistema A ausentes") }, () => leiturasExtras("sistema-a"));
test("Sistema B: leituras extras (só leitura)", { skip: pular(tem("sistema-b"), "SISTEMA_B_COOKIE ausente") }, () => leiturasExtras("sistema-b"));

test("Sistema B: categorias pelo endpoint público do app", { skip: pular(!!env("SISTEMA_B_CIDADE_ID") && !!env("SISTEMA_B_APP_API_URL"), "defina SISTEMA_B_CIDADE_ID e SISTEMA_B_APP_API_URL") }, async () => {
  const m = criarMotor({ id: "teste", integracoes: [{ id: "sistema-b", tipo: "sistema-b", credenciais: { cidadeId: env("SISTEMA_B_CIDADE_ID"), appApiUrl: env("SISTEMA_B_APP_API_URL") } }] });
  const cats = await m.categorias("sistema-b");
  assert.ok(cats.itens.length > 0, "a cidade não tem categorias ativas");
  for (const c of cats.itens) {
    assert.match(c.id, /^sistema-b:\d+$/);
    assert.equal(c.origem, "sistema-b");
  }
});

test("Sistema B: corridas e motoristas pelo painel (cookie)", { skip: pular(tem("sistema-b"), "SISTEMA_B_COOKIE ausente") }, async () => {
  const r = await motor.listarCorridas("sistema-b");
  for (const c of r.itens) assert.notEqual(c.status, "desconhecido", `status novo: ${c.statusOriginal}`);
  if (r.itens[0]) assert.equal((await motor.detalharCorrida(r.itens[0].id)).id, r.itens[0].id);
  await motor.motoristas("sistema-b");
});
