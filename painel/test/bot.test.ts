// Testes do bot de WhatsApp. Rodar: npm test (na pasta painel). Sem rede: provedor simulado e corridas próprias do painel.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "bot-teste-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "y".repeat(40);
for (const k of ["ANTHROPIC_API_KEY", "GROQ_API_KEYS", "GROQ_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "WHATSAPP_EVOLUTION_URL", "WHATSAPP_EVOLUTION_TOKEN"]) delete process.env[k];
/** Marcas de terceiros que nunca podem aparecer (montadas por partes para não ficarem escritas no código). */
const MARCAS = new RegExp([["mac", "hine"], ["8", "8"], ["velo", "ov"]].map((p) => p.join("")).join("|"), "i");

const D = await import("../src/servidor/dados.ts");
const A = await import("../src/bot/armazem.ts");
const { receber, responderOperador, encerrarAtendimento, servidorWhatsApp } = await import("../src/bot/fluxo.ts");
const { atualizarStatus } = await import("../src/bot/status.ts");
const { definirCorridasDoBot } = await import("../src/bot/corridas.ts");
const { caixaSimulada, provedorEvolution, provedorSimulado } = await import("../src/bot/provedores.ts");
const { ehCumprimento, pareceEndereco, limparEndereco, opcao } = await import("../src/bot/entender.ts");
const { rotasBot } = await import("../src/bot/rotas.ts");
const R = await import("../src/corridas/index.ts");
const { criar } = await import("../src/cadastros/armazem.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const express = (await import("express")).default;

const empresa = D.criarEmpresa("Rota Teste", { nomeExibido: "Rota Teste", assistente: { nome: "Lia", tom: "cordial" } });
const outra = D.criarEmpresa("Outra Central");
A.salvarConfig(empresa.id, { ativo: true, provedor: "simulado", instancia: "bot-rota" });
A.salvarConfig(outra.id, { ativo: true, provedor: "simulado", instancia: "bot-outra" });
// Cadastros da empresa: categorias com tarifa, um motorista e um passageiro bloqueado.
const cad = (id: string) => cadastroPorId(id)!;
criar(empresa.id, cad("categorias"), { nome: "Econômico", descricao: "Carro comum", bandeirada: 5, valorKm: 2, valorMinimo: 9, ativa: true }, "teste");
criar(empresa.id, cad("categorias"), { nome: "Moto", bandeirada: 3, valorKm: 1.5, valorMinimo: 6, ativa: true }, "teste");
criar(empresa.id, cad("categorias"), { nome: "Executivo", bandeirada: 10, ativa: false }, "teste");
const motorista = criar(empresa.id, cad("motoristas"), { nome: "Ana Souza", telefone: "11977776666", status: "Ativo", veiculo: "Carro prata", placa: "ABC1D23" }, "teste");
criar(empresa.id, cad("clientes"), { nome: "Bruno Bloqueado", telefone: "11900000008", status: "Bloqueado" }, "teste");
const propria = (tel: string) => R.listarProprias(empresa.id).filter((c) => c.passageiro.telefone === tel);

let seq = 0;
const semIa = async () => null;
const msg = (telefone: string, texto: string, extra: Record<string, unknown> = {}) =>
  receber(empresa.id, { id: `m${++seq}`, telefone, nome: "Maria Silva", texto, ...extra }, { classificar: semIa });

test("cumprimento nunca vira endereço; endereço e lugar viram", () => {
  for (const t of ["oi", "oi lindo", "Bom dia!!", "boa noite, tudo bem?", "obrigado", "👍"]) assert.equal(ehCumprimento(t), true, t);
  for (const t of ["oi lindo", "bom dia", "tudo bem?", "quero uma corrida", "onde vocês ficam?"]) assert.equal(pareceEndereco(t), false, t);
  for (const t of ["Rua das Flores, 120", "pernambuco 402", "Santa Casa", "me pega na Av. Brasil 500"]) assert.equal(pareceEndereco(t), true, t);
  assert.equal(limparEndereco("me pega na Av. Brasil 500"), "Av. Brasil 500");
  assert.equal(limparEndereco("tô aqui na rua X, 10"), "rua X, 10");
  assert.equal(opcao("1 - sim", 2), 1);
  assert.equal(opcao("9", 2), null);
});

test("conversa completa: menu, embarque, destino, confirmação, categoria, pagamento, corrida própria, status e avaliação", async () => {
  const tel = "5511900000001";
  let r = await msg(tel, "oi lindo");
  assert.match(r[0], /Lia/);
  assert.match(r[0], /Rota Teste/);
  assert.match(r[0], /Maria/);
  r = await msg(tel, "1");
  assert.match(r[0], /embarque/i);
  r = await msg(tel, "bom dia");
  assert.match(r[0], /Preciso do endereço de embarque/);
  r = await msg(tel, "Rua das Flores, 120");
  assert.match(r[0], /destino/i);
  r = await msg(tel, "quero ir pra Av. Brasil 500");
  assert.match(r[0], /Rua das Flores, 120/);
  assert.match(r[0], /Av\. Brasil 500/);
  r = await msg(tel, "sim");
  assert.match(r[0], /Econômico \(a partir de R\$ 9,00\) · Carro comum/);
  assert.match(r[0], /Moto \(a partir de R\$ 6,00\)/);
  assert.doesNotMatch(r[0], /Executivo/); // categoria desligada não aparece
  r = await msg(tel, "1");
  assert.match(r[0], /pagar/);
  r = await msg(tel, "pix");
  assert.match(r[0], /Pedido feito! Número \*\d+\*.*R\$ 9,00/s);
  let c = A.conversa(empresa.id, tel)!;
  assert.equal(c.etapa, "em_corrida");
  assert.equal(c.corrida?.grupo, "aberta");
  // A corrida nasceu no próprio painel, canal bot.
  const [corrida] = propria(tel);
  assert.equal(corrida.canal, "bot");
  assert.equal(corrida.categoria, "Econômico");
  assert.equal(corrida.pagamento, "Pix");
  assert.equal(corrida.embarque.texto, "Rua das Flores, 120");
  assert.equal(corrida.destino?.texto, "Av. Brasil 500");
  assert.equal(corrida.os, c.corrida?.os);

  // Uma corrida por conversa: pedir de novo não cria outra.
  r = await msg(tel, "1");
  assert.match(r[0], /já tem uma corrida/);
  assert.equal(propria(tel).length, 1);

  // Status mudado no painel -> mensagem ao passageiro.
  assert.equal(await atualizarStatus(empresa.id, tel), null); // ainda procurando
  await R.atribuirMotorista(empresa.id, corrida.id, motorista.id);
  assert.match((await atualizarStatus(empresa.id, tel))!, /Ana Souza aceitou.*Carro prata, placa ABC1D23/s);
  await R.mudarStatus(empresa.id, corrida.id, "no_local");
  assert.match((await atualizarStatus(empresa.id, tel))!, /chegou/);
  await R.mudarStatus(empresa.id, corrida.id, "em_andamento");
  assert.match((await atualizarStatus(empresa.id, tel))!, /iniciada/);
  await R.mudarStatus(empresa.id, corrida.id, "finalizada");
  assert.match((await atualizarStatus(empresa.id, tel))!, /finalizada.*R\$ 9,00/s);
  assert.equal(await atualizarStatus(empresa.id, tel), null); // nada mais a olhar
  c = A.conversa(empresa.id, tel)!;
  assert.equal(c.etapa, "avaliacao");
  assert.equal(c.corrida, undefined);

  r = await msg(tel, "5");
  assert.match(r[0], /Rota Teste/);
  c = A.conversa(empresa.id, tel)!;
  assert.equal(c.historico.at(-1)?.nota, 5);
  assert.equal(c.historico.at(-1)?.grupo, "finalizada");
  assert.equal(c.etapa, "inicio");
  assert.equal(propria(tel)[0].avaliacao, 5); // a nota vai para a corrida própria

  // Tudo foi registrado e enviado pelo provedor simulado, sem marca de terceiros.
  const enviadas = caixaSimulada(empresa.id).filter((m) => m.telefone === tel);
  assert.equal(enviadas.length, c.mensagens.filter((m) => m.de === "bot").length);
  for (const m of c.mensagens) assert.doesNotMatch(m.texto, MARCAS);
  // A outra empresa não vê nada.
  assert.equal(A.conversa(outra.id, tel), null);
  assert.equal(R.listarProprias(outra.id).length, 0);
});

test("toque duplo no pagamento cria uma corrida só (trava por conversa)", async () => {
  let criadas = 0, canceladas = 0;
  definirCorridasDoBot({
    categorias: async () => [{ id: "x1", nome: "Comum" }],
    criar: async () => { criadas++; await new Promise((ok) => setTimeout(ok, 30)); return { id: "x500", os: "500" }; },
    detalhar: async () => ({ status: "procurando", grupo: "aberta" }),
    cancelar: async () => { canceladas++; },
    avaliar: async () => {},
  });
  try {
    const tel = "5511900000002";
    for (const t of ["oi", "1", "Rua A, 10", "2", "1", "1"]) await msg(tel, t);
    assert.equal(A.conversa(empresa.id, tel)!.etapa, "pagamento");
    const [a, b] = await Promise.all([msg(tel, "1"), msg(tel, "1")]);
    assert.equal(criadas, 1);
    assert.match(a[0], /Pedido feito/);
    assert.match(b[0], /já tem uma corrida/);
    // Mesma mensagem repetida pelo provedor é ignorada.
    const rep = { id: "repetida", telefone: tel, texto: "cancelar" };
    const r1 = await receber(empresa.id, rep, { classificar: semIa });
    const r2 = await receber(empresa.id, rep, { classificar: semIa });
    assert.match(r1[0], /cancelada/);
    assert.deepEqual(r2, []);
    assert.equal(canceladas, 1);
  } finally {
    definirCorridasDoBot(null);
  }
});

test("localização no embarque, sem destino, e erro não trava a conversa", async () => {
  const tel = "5511900000003";
  await msg(tel, "olá");
  await msg(tel, "1");
  let r = await receber(empresa.id, { id: `m${++seq}`, telefone: tel, local: { lat: -23.5, lng: -46.6, texto: "Praça Central" } }, { classificar: semIa });
  assert.match(r[0], /destino/i);
  r = await msg(tel, "2");
  assert.match(r[0], /não informado/);
  definirCorridasDoBot({
    categorias: async () => { throw new Error("falha"); },
    criar: async () => { throw new Error("falha"); },
    detalhar: async () => null, cancelar: async () => {}, avaliar: async () => {},
  });
  try {
    r = await msg(tel, "1");
    assert.match(r[0], /categoria padrão/);
    assert.match(r[1], /pagar/);
    r = await msg(tel, "dinheiro");
    assert.match(r[0], /Não consegui criar/);
    assert.equal(A.conversa(empresa.id, tel)!.etapa, "pagamento");
    assert.equal(A.conversa(empresa.id, tel)!.corrida, undefined);
  } finally {
    definirCorridasDoBot(null);
  }
  // Sem categoria escolhida e com categorias cadastradas, o painel recusa; o bot avisa e segue.
  r = await msg(tel, "1");
  assert.match(r[0], /Não consegui criar/);
  r = await msg(tel, "menu");
  assert.match(r[0], /Como posso ajudar/);
});

test("cancelar pelo WhatsApp cancela a corrida própria; cancelamento da central avisa o passageiro", async () => {
  const tel = "5511900000010";
  for (const t of ["oi", "1", "Rua C, 30", "2", "1", "2", "1"]) await msg(tel, t);
  let [c] = propria(tel);
  assert.equal(c.status, "procurando");
  assert.equal(c.categoria, "Moto");
  const r = await msg(tel, "cancelar");
  assert.match(r[0], /Corrida cancelada/);
  [c] = propria(tel);
  assert.equal(c.status, "cancelada");
  assert.equal(c.canceladaPor, "Passageiro");

  for (const t of ["oi", "1", "Rua C, 30", "2", "1", "1", "3"]) await msg(tel, t);
  const nova = propria(tel).find((x) => x.status === "procurando")!;
  assert.equal(nova.pagamento, "Cartão na maquininha");
  await R.cancelarCorrida(empresa.id, nova.id, "Central", "Sem carro");
  assert.match((await atualizarStatus(empresa.id, tel))!, /cancelada \(central\)/);
  assert.equal(A.conversa(empresa.id, tel)!.etapa, "inicio");
});

test("passageiro bloqueado não pede corrida; corrida já aberta no painel não duplica", async () => {
  let r = await msg("5511900000008", "oi");
  assert.match(r[0], /Bruno/); // nome vem do cadastro de passageiros
  r = await msg("5511900000008", "1");
  assert.match(r[0], /Não consigo pedir corrida/);
  assert.equal(propria("5511900000008").length, 0);
  r = await msg("5511900000008", "2");
  assert.match(r[0], /atendente/); // suporte continua liberado

  const tel = "5511900000011";
  await R.criarCorridaPropria(empresa.id, { passageiro: { nome: "Carla", telefone: tel }, embarque: { texto: "Rua D, 1" }, categoria: "Econômico", pagamento: "Pix", canal: "painel" });
  for (const t of ["oi", "1", "Rua D, 1", "2", "1", "1"]) await msg(tel, t);
  r = await msg(tel, "1");
  assert.match(r[0], /Você já tem uma corrida em aberto \(OS \d+\)/);
  assert.equal(propria(tel).length, 1);
});

test("frase livre: a IA (caso classificação) tira embarque e destino; cumprimento da IA não vira endereço", async () => {
  const tel = "5511900000004";
  const classificar = async (_e: string, t: string) =>
    /carro/.test(t) ? { intencao: "pedir" as const, embarque: "rua Pernambuco 402", destino: "Santa Casa" } : { intencao: "cumprimento" as const, embarque: "oi lindo" };
  let r = await receber(empresa.id, { id: `m${++seq}`, telefone: tel, texto: "preciso de um carro na rua pernambuco 402 pra santa casa" }, { classificar });
  assert.match(r[0], /Confira o pedido/);
  assert.match(r[0], /Pernambuco 402/);
  assert.match(r[0], /Santa Casa/);
  const tel2 = "5511900000005";
  r = await receber(empresa.id, { id: `m${++seq}`, telefone: tel2, texto: "e aí, sumido" }, { classificar });
  assert.match(r[0], /Como posso ajudar/);
  // Sem IA (sem chave): pedido sem endereço vai para o embarque.
  r = await msg("5511900000006", "quero um carro");
  assert.match(r[0], /embarque/i);
});

test("suporte e resposta manual do operador", async () => {
  const tel = "5511900000007";
  await msg(tel, "oi");
  let r = await msg(tel, "2");
  assert.match(r[0], /atendente/);
  r = await msg(tel, "esqueci minha bolsa no carro");
  assert.deepEqual(r, []); // o bot fica quieto: quem responde é o operador
  const antes = caixaSimulada(empresa.id).length;
  await responderOperador(empresa.id, tel, "Oi! Vou ver com o motorista.", "Carla");
  assert.equal(caixaSimulada(empresa.id).length, antes + 1);
  let c = A.conversa(empresa.id, tel)!;
  assert.equal(c.mensagens.at(-1)?.de, "operador");
  assert.equal(c.naoLidas, 0);
  await encerrarAtendimento(empresa.id, tel);
  c = A.conversa(empresa.id, tel)!;
  assert.equal(c.etapa, "inicio");
});

test("servidor de WhatsApp: da plataforma com instância fixa da empresa, ou próprio da empresa", () => {
  process.env.WHATSAPP_EVOLUTION_URL = "https://wa.plataforma.test";
  process.env.WHATSAPP_EVOLUTION_TOKEN = "tok-plataforma";
  try {
    A.salvarConfig(outra.id, { ativo: true, provedor: "evolution", instancia: "bot-rota" }); // tenta usar a instância de outra empresa
    const s = servidorWhatsApp(outra.id);
    assert.equal(s.daPlataforma, true);
    assert.equal(s.instancia, `bot-${outra.id}`); // no servidor da plataforma a instância é sempre a da empresa
    A.salvarSegredosBot(outra.id, { urlApi: "https://wa.outra.test", token: "tok-outra" });
    const p = servidorWhatsApp(outra.id);
    assert.deepEqual([p.daPlataforma, p.urlApi, p.instancia], [false, "https://wa.outra.test", "bot-rota"]);
  } finally {
    delete process.env.WHATSAPP_EVOLUTION_URL;
    delete process.env.WHATSAPP_EVOLUTION_TOKEN;
    A.salvarSegredosBot(outra.id, { urlApi: "", token: "" });
    A.salvarConfig(outra.id, { ativo: true, provedor: "simulado", instancia: "bot-outra" });
  }
});

test("Evolution: lê o webhook, envia texto e cria a instância com o webhook da empresa", async () => {
  const chamadas: Array<{ url: string; metodo: string; corpo: unknown; apikey: string | null }> = [];
  const fetchFalso = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    chamadas.push({ url: u, metodo: init?.method ?? "GET", corpo: init?.body ? JSON.parse(String(init.body)) : undefined, apikey: new Headers(init?.headers).get("apikey") });
    if (u.includes("/instance/connectionState/")) return new Response(JSON.stringify({ message: "not found" }), { status: 404 });
    if (u.endsWith("/instance/create")) return new Response(JSON.stringify({ qrcode: { base64: "data:image/png;base64,AAA", pairingCode: "ABCD1234" } }));
    return new Response("{}");
  }) as typeof fetch;
  const p = provedorEvolution({ urlApi: "https://wa.exemplo.test/", token: "tok-teste", instancia: "bot-rota", fetch: fetchFalso });
  const lidas = p.lerWebhook({
    event: "messages.upsert",
    data: [
      { key: { remoteJid: "5511988887777@s.whatsapp.net", fromMe: false, id: "A1" }, pushName: "João", message: { conversation: "oi" } },
      { key: { remoteJid: "5511988887777@s.whatsapp.net", fromMe: true, id: "A2" }, message: { conversation: "eco" } },
      { key: { remoteJid: "123-456@g.us", fromMe: false, id: "A3" }, message: { conversation: "grupo" } },
      { key: { remoteJid: "5511988887777@s.whatsapp.net", id: "A4" }, message: { locationMessage: { degreesLatitude: -23.5, degreesLongitude: -46.6, name: "Padaria" } } },
    ],
  });
  assert.equal(lidas.length, 2);
  assert.deepEqual([lidas[0].telefone, lidas[0].nome, lidas[0].texto], ["5511988887777", "João", "oi"]);
  assert.equal(lidas[1].local?.lat, -23.5);
  assert.deepEqual(p.lerWebhook({ event: "connection.update", data: {} }), []);

  await p.enviarTexto("+55 (11) 98888-7777", "Olá");
  assert.equal(chamadas[0].url, "https://wa.exemplo.test/message/sendText/bot-rota");
  assert.deepEqual(chamadas[0].corpo, { number: "5511988887777", text: "Olá" });
  assert.equal(chamadas[0].apikey, "tok-teste");

  const conexao = await p.conectar("https://painel.test/api/bot/webhook/rota-teste/abc");
  assert.equal(conexao.situacao, "aguardando_qr");
  assert.equal(conexao.codigo, "ABCD1234");
  const criarInst = chamadas.find((c) => c.url.endsWith("/instance/create"))!;
  assert.equal((criarInst.corpo as { instanceName: string }).instanceName, "bot-rota");
  assert.equal((criarInst.corpo as { webhook: { url: string } }).webhook.url, "https://painel.test/api/bot/webhook/rota-teste/abc");
  const semConfig = provedorEvolution({ urlApi: "", token: "", instancia: "x" });
  assert.equal((await semConfig.situacao()).situacao, "nao_configurado");
  assert.equal(provedorSimulado("x").tipo, "simulado");
});

test("webhook HTTP: segredo da empresa, resposta imediata e login nas outras rotas", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/bot", rotasBot);
  const srv = app.listen(0);
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/api/bot`;
  try {
    const segredo = A.segredoWebhook(empresa.id);
    assert.ok(segredo.length >= 24);
    assert.ok(!fs.readFileSync(path.join(DADOS, "empresas", empresa.id, "bot", "config.json"), "utf8").includes(segredo)); // segredo fora da config
    const corpo = JSON.stringify({ telefone: "5511900000099", nome: "Pedro", texto: "oi", id: "w1" });
    const h = { "Content-Type": "application/json" };
    assert.equal((await fetch(`${base}/webhook/${empresa.id}/errado-${"x".repeat(20)}`, { method: "POST", headers: h, body: corpo })).status, 404);
    assert.equal((await fetch(`${base}/webhook/${outra.id}/${segredo}`, { method: "POST", headers: h, body: corpo })).status, 404); // segredo de outra empresa
    const r = await fetch(`${base}/webhook/${empresa.id}/${segredo}`, { method: "POST", headers: h, body: corpo });
    assert.equal(r.status, 200);
    await A.aguardarFilas();
    assert.match(A.conversa(empresa.id, "5511900000099")!.mensagens.at(-1)!.texto, /Lia/);
    assert.equal((await fetch(`${base}/conversas`)).status, 401);
    assert.equal((await fetch(`${base}/config`)).status, 401);
  } finally {
    srv.close();
  }
});

test("código do bot sem marca de terceiros e sem chave escrita", () => {
  const arquivos: string[] = [];
  const andar = (d: string) => { for (const n of fs.readdirSync(d, { withFileTypes: true })) n.isDirectory() ? andar(path.join(d, n.name)) : arquivos.push(path.join(d, n.name)); };
  const raiz = path.resolve(import.meta.dirname, "..");
  andar(path.join(raiz, "src", "bot"));
  andar(path.join(raiz, "src", "web", "bot"));
  assert.ok(arquivos.length >= 10);
  for (const a of arquivos) {
    const t = fs.readFileSync(a, "utf8");
    assert.doesNotMatch(t, MARCAS, a);
    assert.doesNotMatch(t, /sk-ant-|gsk_[A-Za-z0-9]{10}|AIza[0-9A-Za-z_-]{20}/, a);
  }
});
