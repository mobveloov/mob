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
    { id: "m1", de: "passageiro", nome: "Ana", texto: "Oi", em: "2025-11-01T10:00:00.000Z" },
    { id: "m2", de: "motorista", nome: "Dora", audio: { id: "a1", mime: "audio/ogg", bytes: 10, segundos: 2 }, em: "2025-11-01T10:01:00.000Z" },
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
  assert.equal(C.naoLidas(um, id, "passageiro"), 1, "só a do motorista (o áudio)");

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

test("sessões: o sessoes.json antigo entra no banco (só as válidas); entrar e sair mexem numa linha só", async () => {
  const S = await import("../src/apps/sessoes.ts");
  const Cad = await import("../src/cadastros/armazem.ts");
  const m = Cad.criar(um, cadastroPorId("motoristas")!, { nome: "Sess", telefone: "11955550001", status: "Ativo" }, "t");
  const agora = Date.now();
  const antiga = { hash: "h-antiga", empresaId: um, papel: "motorista", telefone: "11955550001", chave: m.id, criadaEm: agora, expira: agora + 100000 };
  const vencida = { ...antiga, hash: "h-vencida", expira: agora - 1 };
  fs.mkdirSync(pasta(um, "apps"), { recursive: true });
  fs.writeFileSync(pasta(um, "apps", "sessoes.json"), JSON.stringify([vencida, antiga]));
  const { token } = S.criarSessao(um, "motorista", "11955550001");
  assert.ok(!fs.existsSync(pasta(um, "apps", "sessoes.json")));
  assert.ok(fs.existsSync(pasta(um, "apps", "sessoes.json.migrado")), "o JSON antigo fica guardado");
  assert.equal(S.sessaoDoToken(um, token)?.chave, m.id);
  assert.equal(S.sessaoDoToken(dois, token), null, "outra empresa não reconhece o token");
  assert.equal(S.sessaoDoToken(um, "token-que-nao-existe"), null);
  S.sair(um, token);
  assert.equal(S.sessaoDoToken(um, token), null);
  const n = (banco: { prepare: (s: string) => { get: (...a: string[]) => unknown } }) => (banco.prepare("SELECT COUNT(*) AS n FROM app_sessoes WHERE empresa = ?").get(um) as { n: number }).n;
  const { banco } = await import("../src/servidor/banco.ts");
  assert.equal(n(banco()), 1, "sobrou só a sessão antiga válida (a vencida não entrou)");
});

test("cadastros: o JSON antigo entra no banco; criar, editar, mesclar e remover gravam só os registros mexidos", async () => {
  const Cad = await import("../src/cadastros/armazem.ts");
  const { banco } = await import("../src/servidor/banco.ts");
  const cli = cadastroPorId("clientes")!;
  const velho = [{ id: "r1", criadoEm: "2025-01-01T00:00:00.000Z", atualizadoEm: "2025-01-01T00:00:00.000Z", atualizadoPor: "t", nome: "Velho", telefone: "11944440001", status: "Ativo" }];
  fs.mkdirSync(pasta(dois, "cadastros"), { recursive: true });
  fs.writeFileSync(pasta(dois, "cadastros", "clientes.json"), JSON.stringify(velho));
  assert.deepEqual(Cad.listar(dois, cli).map((r) => r.id), ["r1"]);
  assert.ok(fs.existsSync(pasta(dois, "cadastros", "clientes.json.migrado")), "o JSON antigo fica guardado");
  assert.deepEqual(Cad.listar(um, cli).filter((r) => r.id === "r1"), [], "outra empresa não vê");

  const novo = Cad.criar(dois, cli, { nome: "Novo", telefone: "11944440002", status: "Ativo" }, "t");
  assert.deepEqual(Cad.listar(dois, cli).map((r) => r.id), ["r1", novo.id], "ordem de criação mantida");
  const ed = Cad.atualizar(dois, cli, "r1", { nome: "Velho Editado", telefone: "11944440001", status: "Ativo" }, "t");
  assert.equal(ed.nome, "Velho Editado");
  assert.deepEqual(Cad.listar(dois, cli).map((r) => r.id), ["r1", novo.id], "editar não muda a posição");
  assert.equal(Cad.alterarCampos(dois, cli, novo.id, { nome: "Novo 2" }, "t").nome, "Novo 2");
  assert.throws(() => Cad.criar(dois, cli, { nome: "Dup", telefone: "11944440002", status: "Ativo" }, "t"), /Já existe/);

  const mudancas = () => (banco().prepare("SELECT total_changes() AS n").get() as { n: number }).n;
  const antes = mudancas();
  const r = Cad.mesclar(dois, cli, [{ nome: "Merge", telefone: "11944440003", status: "Ativo" }, { nome: "", telefone: "11944440001", email: "velho@teste.com" }], "t");
  assert.deepEqual(r, { criados: 1, atualizados: 1 });
  assert.equal(mudancas() - antes, 2, "só as duas linhas mexidas foram gravadas");

  Cad.remover(dois, cli, novo.id);
  assert.equal(Cad.listar(dois, cli).length, 2);
  assert.throws(() => Cad.remover(dois, cli, novo.id), /não encontrado/);
  // Tudo está no banco (reabre a memória).
  const { fecharBanco } = await import("../src/servidor/banco.ts");
  fecharBanco();
  assert.deepEqual(Cad.listar(dois, cli).map((r) => r.nome), ["Velho Editado", "Merge"]);
});

test("perfis dos apps: filtros do despacho e consulta acompanham o que foi salvo, sem reler o banco todo", async () => {
  const X = await import("../src/apps/extras.ts");
  const p = X.pessoa(um, "passageiro", "11933330001");
  assert.ok(p.codigo, "perfil novo ganha código");
  const f1 = X.filtrosDoDespacho(um);
  assert.equal(f1.ehFavorito("11933330001", "mot-1"), false);
  const mexida = X.pessoa(um, "passageiro", "11933330001");
  mexida.favoritos.push("mot-1");
  assert.equal(X.ehFavorito(um, "11933330001", "mot-1"), false, "mexer na cópia não muda nada sem salvar");
  X.salvarPessoa(um, "passageiro", "11933330001", mexida);
  assert.equal(X.ehFavorito(um, "11933330001", "mot-1"), true);
  assert.equal(X.filtrosDoDespacho(um).ehFavorito("11933330001", "mot-1"), true);
  assert.equal(X.ehFavorito(dois, "11933330001", "mot-1"), false, "outra empresa não vê");
  X.esquecerPerfisDaMemoria();
  assert.equal(X.ehFavorito(um, "11933330001", "mot-1"), true, "ficou no banco");
  assert.equal(X.pessoa(um, "passageiro", "11933330001").codigo, p.codigo);
});

test("banco: gravações do mesmo ciclo dividem uma confirmação, chegam ao disco, e transacao desfaz só o que falhou", async () => {
  const B = await import("../src/servidor/banco.ts");
  const { DatabaseSync } = await import("node:sqlite");
  const db = B.banco();
  db.prepare("INSERT INTO migracoes (empresa, nome, em, itens) VALUES (?, ?, ?, ?)").run(um, "lote-a", "agora", 1);
  assert.throws(() => B.transacao(() => {
    db.prepare("INSERT INTO migracoes (empresa, nome, em, itens) VALUES (?, ?, ?, ?)").run(um, "lote-b", "agora", 1);
    throw new Error("falhou");
  }), /falhou/);
  B.transacao(() => B.transacao(() => { db.prepare("INSERT INTO migracoes (empresa, nome, em, itens) VALUES (?, ?, ?, ?)").run(um, "lote-c", "agora", 1); }));
  await new Promise((r) => setImmediate(r)); // fim do ciclo: confirma
  await new Promise((r) => setImmediate(r));
  const outra = new DatabaseSync(process.env.BANCO_ARQUIVO!, { readOnly: true }); // outra conexão só enxerga o que foi confirmado
  try {
    const nomes = (outra.prepare("SELECT nome FROM migracoes WHERE nome LIKE 'lote-%' ORDER BY nome").all() as Array<{ nome: string }>).map((r) => r.nome);
    assert.deepEqual(nomes, ["lote-a", "lote-c"]);
  } finally { outra.close(); }
  // confirmar() à mão também vale (usado antes de renomear os JSON antigos).
  B.banco().prepare("INSERT INTO migracoes (empresa, nome, em, itens) VALUES (?, ?, ?, ?)").run(um, "lote-d", "agora", 1);
  B.confirmar();
  const outra2 = new DatabaseSync(process.env.BANCO_ARQUIVO!, { readOnly: true });
  try { assert.ok(outra2.prepare("SELECT 1 FROM migracoes WHERE nome = 'lote-d'").get()); } finally { outra2.close(); }
});
