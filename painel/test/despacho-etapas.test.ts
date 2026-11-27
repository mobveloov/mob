// O número de motoristas que recebem a chamada segue as configurações de Despacho do painel (nada fixo no código):
// ilimitado (0), limite, método, "enviar mais de um carro", etapas sem limite percorridas em ordem e migração da config antiga.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-despacho-etapas-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "e".repeat(40);
delete process.env.BANCO_ARQUIVO;
delete process.env.OSRM_URL;

const D = await import("../src/servidor/dados.ts");
const B = await import("../src/servidor/banco.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar } = await import("../src/cadastros/armazem.ts");
const R = await import("../src/corridas/index.ts");
const P = await import("../src/apps/despacho.ts");
const { salvarDespacho, regrasDespacho } = await import("../src/config/despacho.ts");
const { gravarConfig } = await import("../src/config/armazem.ts");
test.after(() => { B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

const E = D.criarEmpresa("Etapas").id;
criar(E, cadastroPorId("categorias")!, { nome: "Carro", bandeirada: 5, valorKm: 2, valorMinimo: 8, ativa: true }, "t");
const MOT = cadastroPorId("motoristas")!;
const m = Array.from({ length: 12 }, (_, i) => criar(E, MOT, { nome: `Motorista ${i + 1}`, telefone: `119100000${String(i + 10)}`, status: "Ativo" }, "t"));
const EMB = { texto: "Rua A, 1", lat: -23.55, lng: -46.63 };
let tel = 0;
const pedir = (varios = false) => R.criarCorridaPropria(E, {
  passageiro: { nome: "Paula", telefone: `1192000${String(++tel).padStart(4, "0")}` }, embarque: EMB, destino: { texto: "Rua B", lat: -23.58, lng: -46.65 },
  categoria: "Carro", pagamento: "Pix", canal: "painel", ...(varios ? { enviarVariosCarros: true } : {}),
} as never, "t");
const comOferta = () => m.filter((x) => P.ofertaDoMotorista(E, x.id) != null);
const online = (n = 12) => m.slice(0, n).forEach((x, i) => P.ficarOnline(E, x.id, -23.551 - i * 0.001, -46.631));
const offline = () => m.forEach((x) => P.ficarOffline(E, x.id));
const limpar = async (id: string) => { await R.cancelarCorrida(E, id, "Passageiro", "teste", "t"); P.vigiar(E); offline(); P.limparDespacho(); };
const config = (c: Record<string, unknown>) => { gravarConfig(E, "despacho", {}); salvarDespacho(E, { raioMetros: 20000, ...c }); };

test("limite ilimitado (0): os 12 motoristas online recebem a chamada", async () => {
  config({ metodo: "primeiro_aceitar", notificarGrupo: "todos", limiteMotoristas: 0, etapas: [{ quantidade: 0 }] });
  online();
  const c = await pedir();
  P.despachar(E);
  assert.equal(comOferta().length, 12);
  await limpar(c.id);
});

test("limite 5: só 5 recebem; limite 1 no mais próximo: um por vez", async () => {
  config({ metodo: "primeiro_aceitar", notificarGrupo: "todos", limiteMotoristas: 5, etapas: [{ quantidade: 0 }] });
  online();
  let c = await pedir();
  P.despachar(E);
  assert.equal(comOferta().length, 5);
  assert.deepEqual(comOferta().map((x) => x.id), m.slice(0, 5).map((x) => x.id), "os 5 mais perto");
  await limpar(c.id);
  config({ metodo: "mais_proximo", limiteMotoristas: 0, etapas: [{ quantidade: 0 }] });
  online();
  c = await pedir();
  P.despachar(E);
  assert.equal(comOferta().length, 1, "mais próximo: 1 por vez, mesmo ilimitado");
  assert.equal(comOferta()[0].id, m[0].id);
  await limpar(c.id);
});

test("quantidade da etapa limita o grupo (0 = ilimitado)", async () => {
  config({ metodo: "primeiro_aceitar", notificarGrupo: "todos", limiteMotoristas: 0, etapas: [{ quantidade: 4 }] });
  online();
  const c = await pedir();
  P.despachar(E);
  assert.equal(comOferta().length, 4);
  await limpar(c.id);
});

test("\"enviar mais de um carro\" segue o limite do Despacho: ilimitado = todos, 4 = 4", async () => {
  config({ metodo: "mais_proximo", limiteMotoristas: 0 });
  online();
  let c = await pedir(true);
  P.despachar(E);
  assert.equal(comOferta().length, 12, "ilimitado: todos");
  P.despachar(E);
  assert.equal(comOferta().length, 12, "outra volta não repete nem conta rodada à toa");
  await limpar(c.id);
  config({ metodo: "mais_proximo", limiteMotoristas: 4 });
  online();
  c = await pedir(true);
  P.despachar(E);
  assert.equal(comOferta().length, 4);
  await limpar(c.id);
});

test("5 etapas (e mais): percorridas na ordem, uma por rodada", async () => {
  const quantidades = [1, 2, 1, 3, 2, 1];
  salvarDespacho(E, { metodo: "primeiro_aceitar", notificarGrupo: "todos", limiteMotoristas: 0, etapas: quantidades.map((quantidade) => ({ quantidade })) });
  assert.equal(regrasDespacho(E).etapas.length, 6, "sem limite de etapas");
  assert.ok(regrasDespacho(E).maxTentativas >= 6, "as tentativas sobem até o número de etapas");
  online();
  const c = await pedir();
  const vistos: string[] = [];
  for (const q of quantidades) {
    P.despachar(E);
    const l = comOferta();
    assert.equal(l.length, q, `etapa com ${q} motorista(s)`);
    for (const x of l) { assert.ok(!vistos.includes(x.id), "ninguém repete"); vistos.push(x.id); }
    for (const x of l) P.recusar(E, x.id, P.ofertaDoMotorista(E, x.id)!.id);
  }
  assert.equal(vistos.length, 10);
  assert.deepEqual(vistos, m.slice(0, 10).map((x) => x.id), "na ordem de proximidade, etapa após etapa");
  await limpar(c.id);
});

test("etapa sem ninguém no raio dela passa para a próxima; raio da etapa vale no lugar do inicial", async () => {
  salvarDespacho(E, { metodo: "primeiro_aceitar", notificarGrupo: "todos", limiteMotoristas: 0, etapas: [{ quantidade: 0, raioKm: 0.05 }, { quantidade: 0, raioKm: 0.35 }, { quantidade: 0, raioKm: 0 }] });
  online();
  const c = await pedir();
  P.despachar(E);
  // motorista 1 está a ~110 m: fora da 1ª (50 m); a 2ª (350 m) pega os 3 primeiros
  const l = comOferta();
  assert.ok(l.length >= 2 && l.length <= 4, `2ª etapa (350 m): ${l.length}`);
  assert.ok(l.length < 12, "o raio da etapa limitou");
  await limpar(c.id);
});

test("config antiga (prioritarios, secundarios, reserva) vira três etapas sem perder nada", () => {
  gravarConfig(E, "despacho", { metodo: "primeiro_aceitar", raioMetros: 4000, limiteMotoristas: 9, prioritarios: 7, secundarios: 5, reserva: 3, maxTentativas: 3 });
  const r = regrasDespacho(E);
  assert.deepEqual(r.etapas.map((x) => x.quantidade), [7, 5, 3]);
  assert.equal(r.raioMetros, 4000);
  assert.equal(r.limiteMotoristas, 9);
  assert.equal(r.maxTentativas, 3);
  // gravar de novo mantém a lista nova
  const s = salvarDespacho(E, { tempoTela: 30 });
  assert.deepEqual(s.etapas.map((x) => x.quantidade), [7, 5, 3]);
  assert.equal("prioritarios" in s, false);
});

test("0 é aceito em limite, raio e quantidade (ilimitado)", () => {
  const r = salvarDespacho(E, { limiteMotoristas: 0, raioMetros: 0, etapas: [{ quantidade: 0, raioKm: 0 }] });
  assert.equal(r.limiteMotoristas, 0);
  assert.equal(r.raioMetros, 0);
  assert.equal(r.etapas[0].quantidade, 0);
});
