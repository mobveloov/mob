// "Enviar mais de um carro": a corrida marcada recebe a oferta de vários motoristas ao mesmo tempo (até CARROS_SIMULTANEOS),
// vale o primeiro que aceitar e os outros perdem a chamada na hora. Sem a marcação, continua uma oferta por vez.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-varios-carros-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "v".repeat(40);
delete process.env.BANCO_ARQUIVO;
delete process.env.OSRM_URL;

const D = await import("../src/servidor/dados.ts");
const B = await import("../src/servidor/banco.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar } = await import("../src/cadastros/armazem.ts");
const R = await import("../src/corridas/index.ts");
const P = await import("../src/apps/despacho.ts");
const { ondasDaCorrida } = await import("../src/operacao/ondas.ts");
test.after(() => { B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

const E = D.criarEmpresa("Varios Carros").id;
criar(E, cadastroPorId("categorias")!, { nome: "Carro", bandeirada: 5, valorKm: 2, valorMinimo: 8, ativa: true }, "t");
const MOT = cadastroPorId("motoristas")!;
const m = [1, 2, 3, 4, 5].map((i) => criar(E, MOT, { nome: `Motorista ${i}`, telefone: `1191000000${i}`, status: "Ativo" }, "t"));
const EMB = { texto: "Rua A, 1", lat: -23.55, lng: -46.63 };
const pedir = (tel: string, varios: boolean) => R.criarCorridaPropria(E, {
  passageiro: { nome: "Paula", telefone: tel }, embarque: EMB, destino: { texto: "Rua B", lat: -23.58, lng: -46.65 },
  categoria: "Carro", pagamento: "Pix", canal: "painel", ...(varios ? { enviarVariosCarros: true } : {}),
} as never, "t");
const comOferta = () => m.filter((x) => P.ofertaDoMotorista(E, x.id) != null).map((x) => x.id);
const todosOnline = () => m.forEach((x, i) => P.ficarOnline(E, x.id, -23.551 - i * 0.001, -46.631));
const todosOffline = () => m.forEach((x) => P.ficarOffline(E, x.id));

test("sem a marcação: uma oferta por vez, só para o mais perto", async () => {
  todosOnline();
  const c = await pedir("11920000001", false);
  P.despachar(E);
  assert.deepEqual(comOferta(), [m[0].id]);
  P.despachar(E); // outra volta não manda para mais ninguém
  assert.deepEqual(comOferta(), [m[0].id]);
  await R.cancelarCorrida(E, c.id, "Passageiro", "teste", "t");
  P.vigiar(E);
  todosOffline();
});

test("com a marcação: vai para os mais perto ao mesmo tempo, no máximo CARROS_SIMULTANEOS", async () => {
  todosOnline();
  const c = await pedir("11920000002", true);
  P.despachar(E);
  assert.equal(P.CARROS_SIMULTANEOS, 3);
  assert.deepEqual(comOferta(), [m[0].id, m[1].id, m[2].id], "os três mais perto");
  P.despachar(E);
  assert.equal(comOferta().length, 3, "não passa do limite em outra volta");
  assert.equal(P.ofertaDoMotorista(E, m[0].id)?.corridaId, c.id);
  // um recusa: entra o próximo para completar os três
  P.recusar(E, m[1].id, P.ofertaDoMotorista(E, m[1].id)!.id);
  assert.deepEqual(comOferta().sort(), [m[0].id, m[2].id, m[3].id].sort());
  // o primeiro a aceitar leva; os outros perdem a chamada na hora
  const o2 = P.ofertaDoMotorista(E, m[2].id)!;
  const feita = await P.aceitar(E, m[2].id, o2.id);
  assert.equal(feita.motoristaId, m[2].id);
  assert.deepEqual(comOferta(), [], "ninguém mais fica com a chamada");
  const fins = ondasDaCorrida(E, c.id).map((o) => o.fim).sort();
  assert.deepEqual(fins, ["aceitou", "perdeu", "perdeu", "recusou"]);
  // quem perdeu não consegue aceitar depois
  await assert.rejects(() => P.aceitar(E, m[0].id, "oferta-qualquer"), /já passou/);
  await R.cancelarCorrida(E, c.id, "Passageiro", "teste", "t");
  todosOffline();
});

test("o limite de motoristas do Despacho também vale para a marcação", async () => {
  const { salvarDespacho } = await import("../src/config/despacho.ts");
  salvarDespacho(E, { limiteMotoristas: 2 });
  todosOnline();
  const c = await pedir("11920000003", true);
  P.despachar(E);
  assert.equal(comOferta().length, 2);
  await R.cancelarCorrida(E, c.id, "Passageiro", "teste", "t");
  P.vigiar(E);
  assert.deepEqual(comOferta(), [], "corrida cancelada some das chamadas");
  todosOffline();
});
