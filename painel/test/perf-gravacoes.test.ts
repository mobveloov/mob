// Gravações do painel que antes reescreviam um JSON inteiro a cada evento (teste de carga): ondas, chat, sessões, cadastros e corridas.
// Cada uma agora grava só a linha que mudou no banco, e o JSON antigo entra uma vez e fica guardado como ".migrado".
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-perf-"));
process.env.DADOS_DIR = DADOS;
process.env.BANCO_ARQUIVO = path.join(DADOS, "painel.db");
process.env.NODE_ENV = "test";

const D = await import("../src/servidor/dados.ts");
const R = await import("../src/corridas/index.ts");
const O = await import("../src/operacao/ondas.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");

const um = D.criarEmpresa("Perf Um").id;
const dois = D.criarEmpresa("Perf Dois").id;
const pasta = (e: string, ...p: string[]) => path.join(DADOS, "empresas", e, ...p);

test("corridas: busca por id direto e a lista acompanha as gravações", async () => {
  const pedido = { passageiro: { nome: "Ana", telefone: "11911110001" }, embarque: { texto: "Rua A", lat: -21.01, lng: -48.22 }, categoria: "", pagamento: "Pix", canal: "painel" as const };
  const a = await R.criarCorridaPropria(um, pedido);
  const b = await R.criarCorridaPropria(um, { ...pedido, passageiro: { nome: "Beto", telefone: "11911110002" } });
  assert.equal(R.corridaPorId(um, a.id)?.passageiro.nome, "Ana");
  assert.equal(R.corridaPorId(dois, a.id), undefined, "outra empresa não vê");
  assert.equal(R.corridaPorId(um, "nao-existe"), undefined);
  assert.deepEqual(R.listarProprias(um).map((c) => c.id), [a.id, b.id]);
  await R.cancelarCorrida(um, a.id, "Central", "teste", "t");
  assert.equal(R.corridaPorId(um, a.id)?.status, "cancelada");
  assert.equal(R.listarProprias(um).find((c) => c.id === a.id)?.status, "cancelada");
  assert.equal(R.listarProprias(um).length, 2, "a corrida mudada não duplica");
  R.esquecerCorridasDaMemoria();
  assert.equal(R.corridaPorId(um, a.id)?.status, "cancelada", "o banco guardou");
});

test("ondas: o ondas.json antigo entra no banco e fica guardado; registrar atualiza só a oferta", () => {
  const velhas = [
    { id: "o1", corridaId: "c1", os: "1", motoristaId: "m1", nome: "Dora", placa: "", veiculo: "", distanciaKm: 1, etapa: "PROXIMIDADE", oferecidaEm: "2026-11-01T10:00:00.000Z", fim: "oferecida", fimEm: null },
    { id: "o2", corridaId: "c2", os: "2", motoristaId: "m2", nome: "Edu", placa: "", veiculo: "", distanciaKm: 2, etapa: "FAVORITOS", oferecidaEm: "2026-11-01T10:01:00.000Z", fim: "recusou", fimEm: "2026-11-01T10:02:00.000Z" },
  ];
  fs.mkdirSync(pasta(um, "operacao"), { recursive: true });
  fs.writeFileSync(pasta(um, "operacao", "ondas.json"), JSON.stringify(velhas));
  assert.deepEqual(O.ondas(um).map((o) => o.id), ["o1", "o2"]);
  assert.ok(!fs.existsSync(pasta(um, "operacao", "ondas.json")));
  assert.ok(fs.existsSync(pasta(um, "operacao", "ondas.json.migrado")), "o JSON antigo fica guardado");
  assert.deepEqual(O.ondasDaCorrida(um, "c2").map((o) => o.nome), ["Edu"]);
  assert.deepEqual(O.ondas(dois), []);

  O.registrarOnda(um, { id: "o1", corridaId: "c1", motoristaId: "m1", expira: 0, distanciaKm: 1 }, "aceitou");
  const o1 = O.ondas(um).find((o) => o.id === "o1")!;
  assert.equal(o1.fim, "aceitou");
  assert.ok(o1.fimEm);
  assert.equal(O.ondas(um).length, 2, "atualizar não cria outra linha");
  O.registrarOnda(um, { id: "o3", corridaId: "c1", motoristaId: "m1", expira: 0, distanciaKm: 3 }, "oferecida");
  assert.deepEqual(O.ondas(um).map((o) => o.id), ["o1", "o2", "o3"], "nova oferta entra no fim");
  assert.equal(O.ondas(um)[2].fimEm, null);
  O.esquecerOndasDaMemoria();
  assert.equal(O.ondas(um).length, 3, "tudo está no banco");
});

test("ondas: guarda só as últimas 5000 por empresa", () => {
  for (let i = 0; i < 5003; i++) O.registrarOnda(dois, { id: `x${i}`, corridaId: "cx", motoristaId: "m", expira: 0, distanciaKm: null }, "oferecida");
  const l = O.ondas(dois);
  assert.equal(l.length, 5000);
  assert.equal(l[0].id, "x3");
  assert.equal(l[4999].id, "x5002");
});

test("chat: o JSON antigo da corrida entra no banco, mensagens novas só acrescentam e os limites valem", async () => {
  const C = await import("../src/apps/chat.ts");
  const id = "11111111-1111-4111-8111-111111111111", outra = "22222222-2222-4222-8222-222222222222";
  const velhas = [
    { id: "m1", de: "passageiro", nome: "Ana", texto: "Oi", em: "2026-11-01T10:00:00.000Z" },
    { id: "m2", de: "motorista", nome: "Dora", audio: { id: "a1", mime: "audio/ogg", bytes: 10, segundos: 2 }, em: "2026-11-01T10:01:00.000Z" },
  ];
  fs.mkdirSync(pasta(um, "apps", "chat"), { recursive: true });
  fs.writeFileSync(pasta(um, "apps", "chat", `${id}.json`), JSON.stringify(velhas));
  assert.deepEqual(C.mensagens(um, id), velhas);
  assert.ok(!fs.existsSync(pasta(um, "apps", "chat", `${id}.json`)));
  assert.ok(fs.existsSync(pasta(um, "apps", "chat", `${id}.json.migrado`)), "o JSON antigo fica guardado");
  assert.deepEqual(C.mensagens(dois, id), [], "outra empresa não vê");

  C.enviarTexto(um, id, "passageiro", "Ana", "Já cheguei");
  const l = C.mensagens(um, id);
  assert.equal(l.length, 3);
  assert.equal(l[2].texto, "Já cheguei");
  assert.deepEqual(C.mensagens(um, outra), [], "outra corrida não mistura");
  assert.throws(() => C.enviarTexto(um, "../x", "passageiro", "A", "oi"), /Corrida inválida/);

  // Não lidas: só as do outro lado depois da última leitura.
  assert.equal(C.naoLidas(um, id, "motorista"), 2, "do passageiro, ainda não lidas pelo motorista");
  C.marcarLida(um, id, "motorista");
  assert.equal(C.naoLidas(um, id, "motorista"), 0);
  await new Promise((r) => setTimeout(r, 5));
  C.enviarTexto(um, id, "passageiro", "Ana", "Estou aqui");
  assert.equal(C.naoLidas(um, id, "motorista"), 1);
  assert.equal(C.naoLidas(um, id, "passageiro"), 0);

  // Áudio guardado e achado pelo id, só na corrida certa.
  const ogg = Buffer.concat([Buffer.from("OggS"), Buffer.alloc(40)]);
  const m = C.enviarAudio(um, outra, "motorista", "Dora", "audio/ogg", ogg, 3);
  assert.ok(C.arquivoDoAudio(um, outra, m.audio!.id));
  assert.equal(C.arquivoDoAudio(um, id, m.audio!.id), null);

  // Limite de mensagens por corrida.
  const cheia = "33333333-3333-4333-8333-333333333333";
  for (let i = 0; i < 500; i++) C.enviarTexto(um, cheia, "passageiro", "Ana", `msg ${i}`);
  assert.throws(() => C.enviarTexto(um, cheia, "passageiro", "Ana", "mais uma"), /limite de mensagens/);
  assert.equal(C.mensagens(um, cheia).length, 500);
});
