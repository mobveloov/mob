// Testes das correções da revisão do bot, do totem e do CRM:
// endereço interno bloqueado, disparo duplo, jornada dupla, suspenso fora do envio, preço do bot e erro em JSON.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-rev-"));
const CNEFE = fs.mkdtempSync(path.join(os.tmpdir(), "painel-rev-cnefe-"));
process.env.DADOS_DIR = DADOS;
process.env.CNEFE_DIR = CNEFE;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "r".repeat(40);
delete process.env.CRM_PERMITIR_URL_LOCAL;
delete process.env.URL_LOCAL_LIBERADA;
delete process.env.OSRM_URL;

fs.mkdirSync(path.join(CNEFE, "_casas"));
fs.mkdirSync(path.join(CNEFE, "35_SP"));
fs.writeFileSync(path.join(CNEFE, "35_SP", "3599999_CIDADE_TESTE.zip"), "");
fs.writeFileSync(path.join(CNEFE, "_casas", "35_SP.tsv.gz"), zlib.gzipSync([
  ["3599999", "100", "DAS FLORES", "CENTRO", "RUA", "-21.000000", "-48.000000", "1"],
  ["3599999", "50", "SAO JOAO", "VILA NOVA", "AVENIDA", "-21.030000", "-48.030000", "2"],
].map((l) => l.join("\t")).join("\n")));

const { hostInterno, validarUrlExterna } = await import("../src/servidor/url.ts");
const D = await import("../src/servidor/dados.ts");
const CrmA = await import("../src/crm/armazem.ts");
const E = await import("../src/crm/envio.ts");
const W = await import("../src/crm/whatsapp.ts");
const { destinatarios, limparCachePublico } = await import("../src/crm/publico.ts");
const Cad = await import("../src/cadastros/armazem.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const BotA = await import("../src/bot/armazem.ts");
const { provedorDe } = await import("../src/bot/fluxo.ts");
const { corridasProprias } = await import("../src/bot/corridas.ts");
const End = await import("../src/enderecos/index.ts");

const emp = D.criarEmpresa("Revisão").id;

test("endereço interno não passa (rede interna, próprio computador, formas escondidas)", () => {
  for (const h of ["localhost", "api.localhost", "127.0.0.1", "127.1", "2130706433", "0x7f000001", "10.0.0.5", "172.16.1.1", "192.168.0.10",
    "169.254.169.254", "0.0.0.0", "100.64.0.1", "[::1]", "[::]", "[::ffff:127.0.0.1]", "[::ffff:7f00:1]", "[fd00::1]", "[fe80::1]", "intranet", "servidor.local"]) {
    assert.equal(hostInterno(h), true, h);
  }
  for (const h of ["evolution.exemplo.com.br", "8.8.8.8", "[2001:4860:4860::8888]"]) assert.equal(hostInterno(h), false, h);
  assert.throws(() => validarUrlExterna("http://evolution.exemplo.com.br"), /https público/);
  assert.throws(() => validarUrlExterna("https://usuario:senha@evolution.exemplo.com.br"), /usuário e senha/);
  assert.throws(() => validarUrlExterna("file:///etc/passwd"), /inválido/);
  assert.equal(validarUrlExterna("https://evolution.exemplo.com.br").hostname, "evolution.exemplo.com.br");
});

test("CRM e bot recusam servidor de WhatsApp na rede interna", () => {
  assert.throws(() => CrmA.salvarCredWhatsApp(emp, { url: "https://169.254.169.254/" }), /https público/);
  // Endereço interno gravado antes da regra: o bot trata como "não configurado" e não chama.
  BotA.salvarConfig(emp, { ativo: true, provedor: "evolution", instancia: "bot-teste" });
  BotA.salvarSegredosBot(emp, { urlApi: "http://127.0.0.1:8080", token: "x" });
  return provedorDe(emp).situacao().then((s) => assert.equal(s.situacao, "nao_configurado"));
});

const cli = cadastroPorId("clientes")!;
Cad.criar(emp, cli, { nome: "Ana", telefone: "11911110001", status: "Ativo" }, "t");
Cad.criar(emp, cli, { nome: "Beto", telefone: "11911110002", status: "Ativo" }, "t");
Cad.criar(emp, cli, { nome: "Caio", telefone: "11911110003", status: "Suspenso" }, "t");

test("passageiro suspenso não recebe campanha", async () => {
  limparCachePublico(emp);
  const { contatos } = await (await import("../src/crm/publico.ts")).publico(emp, "passageiro");
  const nomes = destinatarios(contatos).map((c) => c.nome);
  assert.ok(nomes.includes("Ana") && nomes.includes("Beto"));
  assert.ok(!nomes.includes("Caio"), "suspenso fica de fora");
});

test("dois cliques em Disparar não mandam a campanha duas vezes", async () => {
  const agora = new Date().toISOString();
  CrmA.salvarCampanhas(emp, [{
    id: "camp1", nome: "Teste", canal: "whatsapp", publico: { tipo: "passageiro" }, texto: "Oi {nome}", variacoes: [], cupom: "",
    agendadaPara: null, estado: "rascunho", criadaEm: agora, atualizadaEm: agora, disparadaEm: null, concluidaEm: null, destinatarios: 0,
  } as never]);
  const [a, b] = await Promise.allSettled([E.dispararCampanha(emp, "camp1"), E.dispararCampanha(emp, "camp1")]);
  const ok = [a, b].filter((x) => x.status === "fulfilled");
  assert.equal(ok.length, 1, "só um disparo passa");
  const itens = CrmA.fila(emp).filter((i) => i.origem.id === "camp1");
  assert.ok(itens.length > 0);
  assert.equal(new Set(itens.map((i) => i.telefone)).size, itens.length, "uma mensagem por pessoa");
  await assert.rejects(E.dispararCampanha(emp, "camp1"), /já foi disparada/);
});

test("jornada rodada duas vezes ao mesmo tempo não repete ninguém", async () => {
  W.definirProvedorDeTeste(null);
  const agora = new Date().toISOString();
  const j = { id: "jor1", nome: "Volte", ativa: true, gatilho: { tipo: "sem-corrida", dias: 0 }, publico: { tipo: "passageiro" }, texto: "Volte, {nome}", cupom: "", criadaEm: agora, atualizadaEm: agora, ultimaRodada: null };
  CrmA.salvarJornadas(emp, [j as never]);
  const r = await Promise.all([E.rodarJornada(emp, j as never), E.rodarJornada(emp, j as never)]);
  const naFila = CrmA.fila(emp).filter((i) => i.origem.id === "jor1").length;
  assert.ok(naFila > 0);
  assert.equal(r[0] + r[1], naFila);
  assert.ok(r[0] === 0 || r[1] === 0, "a segunda rodada não põe ninguém");
  const itens = CrmA.fila(emp).filter((i) => i.origem.id === "jor1");
  assert.equal(new Set(itens.map((i) => i.telefone)).size, itens.length, "ninguém duas vezes");
});

test("bot mostra o preço com a distância (endereço só em texto, pelo CNEFE)", async () => {
  End.salvarConfig(emp, { municipios: ["3599999"] });
  await End.prepararAgora("3599999");
  Cad.criar(emp, cadastroPorId("categorias")!, { nome: "Carro", bandeirada: "5", valorKm: "2", valorMinuto: "0", valorMinimo: "0", ativa: true }, "t");
  const [cat] = await corridasProprias.categorias(emp, { texto: "Rua das Flores, 100" }, { texto: "Avenida São João, 50" });
  assert.equal(cat.estimado, true);
  assert.ok((cat.preco ?? 0) > 5 + 2 * 4, `preço com km (veio ${cat.preco})`);
});

test("pedido com JSON malformado volta erro curto em JSON", async () => {
  const { app } = await import("../src/servidor/index.ts");
  const srv = app.listen(0);
  try {
    const porta = (srv.address() as AddressInfo).port;
    const r = await fetch(`http://127.0.0.1:${porta}/api/entrar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{ruim" });
    assert.equal(r.status, 400);
    assert.deepEqual(await r.json(), { erro: "Dados mal formatados." });
  } finally {
    srv.closeAllConnections();
    srv.close();
    (await import("../src/servidor/banco.ts")).fecharBanco(); // no Windows, arquivo aberto não apaga
    fs.rmSync(DADOS, { recursive: true, force: true });
    fs.rmSync(CNEFE, { recursive: true, force: true });
  }
});
