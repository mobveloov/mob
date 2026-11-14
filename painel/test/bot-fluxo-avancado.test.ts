// Testes das regras do bot trazidas do sistema de referência: textos editáveis, etapas do fluxo, destino obrigatório,
// respostas prontas, imagem de saudação, comandos da central e mensagens de status. Sem rede (provedor simulado).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "bot-avancado-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "y".repeat(40);
for (const k of ["ANTHROPIC_API_KEY", "GROQ_API_KEYS", "GROQ_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "WHATSAPP_EVOLUTION_URL", "WHATSAPP_EVOLUTION_TOKEN"]) delete process.env[k];

const D = await import("../src/servidor/dados.ts");
const A = await import("../src/bot/armazem.ts");
const { receber } = await import("../src/bot/fluxo.ts");
const { atualizarStatus } = await import("../src/bot/status.ts");
const { caixaSimulada, provedorEvolution, limparCaixaSimulada } = await import("../src/bot/provedores.ts");
const { rotasBot } = await import("../src/bot/rotas.ts");
const { criarCookie } = await import("../src/servidor/sessao.ts");
const R = await import("../src/corridas/index.ts");
const { criar } = await import("../src/cadastros/armazem.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const express = (await import("express")).default;

const empresa = D.criarEmpresa("Central Avancada", { nomeExibido: "Central Avancada", assistente: { nome: "Lia", tom: "cordial" } });
const base = { ativo: true, provedor: "simulado" as const, instancia: "bot-avancada" };
A.salvarConfig(empresa.id, base);
const cad = (id: string) => cadastroPorId(id)!;
criar(empresa.id, cad("categorias"), { nome: "Econômico", bandeirada: 5, valorKm: 2, valorMinimo: 9, ativa: true }, "teste");
criar(empresa.id, cad("categorias"), { nome: "Moto", bandeirada: 3, valorKm: 1.5, valorMinimo: 6, ativa: true }, "teste");
const motorista = criar(empresa.id, cad("motoristas"), { nome: "Ana Souza", telefone: "11977776666", status: "Ativo", veiculo: "Carro prata", placa: "ABC1D23" }, "teste");

let seq = 0;
const semIa = async () => null;
const msg = (telefone: string, texto: string, extra: Record<string, unknown> = {}) =>
  receber(empresa.id, { id: `a${++seq}`, telefone, nome: "Maria Silva", texto, ...extra }, { classificar: semIa });
const mudar = (avancada: Record<string, unknown>) => A.salvarConfig(empresa.id, { ...base, ...A.sanearAvancada({ ...A.config(empresa.id), ...avancada }) });

test("textos editáveis: a empresa troca o texto; vazio volta ao padrão; chave desconhecida some", async () => {
  mudar({ textos: { ask_address: "📍 Manda o embarque aí!", address_retry: "Não deu. Manda de novo.", inventada: "x", welcome_menu: "  Fala, tudo bem?  " } });
  assert.deepEqual(Object.keys(A.config(empresa.id).textos).sort(), ["address_retry", "ask_address", "welcome_menu"]);
  const tel = "5511911110001";
  let r = await msg(tel, "olá");
  assert.match(r[0], /^Fala, tudo bem\?\n\*1\* - Pedir uma corrida\n\*2\* - Falar com o suporte$/);
  r = await msg(tel, "1");
  assert.equal(r[0], "📍 Manda o embarque aí!");
  r = await msg(tel, "blá");
  assert.equal(r[0], "Não deu. Manda de novo.");
  mudar({ textos: {} });
  r = await msg(tel, "blá");
  assert.match(r[0], /Preciso do endereço de embarque/);
});

test("etapas do fluxo desligadas: sem menu, sem destino, sem confirmação, sem categoria e sem pagamento", async () => {
  mudar({ fluxo: { show_welcome_menu: false, ask_destination: false, confirm_address: false, ask_category: false, ask_payment: false } });
  const tel = "5511911110002";
  let r = await msg(tel, "oi");
  assert.match(r[0], /embarque/i, "vai direto para o embarque");
  r = await msg(tel, "Rua das Flores, 120");
  // Sem destino, sem confirmar, sem categoria e sem pagamento: a corrida nasce na hora.
  assert.match(r.join("\n"), /Pedido feito/);
  const c = R.listarProprias(empresa.id).find((x) => x.passageiro.telefone === tel)!;
  assert.equal(c.canal, "bot");
  assert.equal(c.categoria, "Econômico", "primeira categoria disponível");
  assert.equal(c.pagamento, "Dinheiro", "sem perguntar o pagamento, vai Dinheiro");
  assert.equal(c.destino, undefined);
  await R.cancelarCorrida(empresa.id, c.id, "Central", "teste");
  mudar({ fluxo: {} }); // tudo ligado de novo
  assert.equal(A.config(empresa.id).fluxo.ask_destination, true);
});

test("destino obrigatório: não deixa pular e explica; opcional continua com a opção 2", async () => {
  mudar({ fluxo: { allow_skip_destination: false } });
  const tel = "5511911110003";
  await msg(tel, "olá");
  await msg(tel, "1");
  let r = await msg(tel, "Rua das Flores, 120");
  assert.doesNotMatch(r[0], /responda \*2\*/, "sem a saída 'não informar'");
  r = await msg(tel, "2");
  assert.match(r[0], /preciso do destino/i);
  assert.equal(A.conversa(empresa.id, tel)!.etapa, "destino");
  r = await msg(tel, "Av. Brasil, 500");
  assert.match(r[0], /Confira o pedido/);
  mudar({ fluxo: { allow_skip_destination: true } });
  const tel2 = "5511911110004";
  await msg(tel2, "olá"); await msg(tel2, "1"); await msg(tel2, "Rua das Flores, 120");
  r = await msg(tel2, "2");
  assert.match(r[0], /não informado/);
});

test("respostas prontas: pergunta com palavra-chave é respondida; no meio do pedido só com ? e volta à pergunta", async () => {
  mudar({ faq: [{ question: "Aceita pet?", keywords: ["pet", "cachorro"], answer: "Aceitamos pets pequenos na categoria Econômico. 🐶" }] });
  const tel = "5511911110005";
  let r = await msg(tel, "aceita pet?");
  assert.equal(r[0], "Aceitamos pets pequenos na categoria Econômico. 🐶");
  assert.equal(A.conversa(empresa.id, tel)!.corrida, undefined);
  await msg(tel, "oi");
  await msg(tel, "1");
  r = await msg(tel, "levo meu cachorro?");
  assert.equal(r[0], "Aceitamos pets pequenos na categoria Econômico. 🐶");
  assert.match(r[1], /embarque/i, "volta à pergunta do pedido");
  assert.equal(A.conversa(empresa.id, tel)!.etapa, "embarque");
  r = await msg(tel, "Rua do Pet, 10"); // "pet" sem "?" no meio do pedido é endereço
  assert.match(r[0], /destino/i);
  mudar({ faq: [] });
});

test("imagem de saudação: antes do menu, no máximo uma vez a cada 12 horas", async () => {
  limparCaixaSimulada(empresa.id);
  mudar({ saudacao: { imageUrl: "https://exemplo.test/boas-vindas.png", caption: "Bem-vindo!" } });
  const tel = "5511911110006";
  await msg(tel, "olá");
  const caixa = caixaSimulada(empresa.id).filter((m) => m.telefone === tel);
  assert.match(caixa[0].texto, /🖼️ https:\/\/exemplo\.test\/boas-vindas\.png\nBem-vindo!/);
  assert.match(caixa[1].texto, /Como posso ajudar/);
  await msg(tel, "menu");
  assert.equal(caixaSimulada(empresa.id).filter((m) => m.telefone === tel && m.texto.startsWith("🖼️")).length, 1, "não repete antes de 12 h");
  assert.equal(A.sanearAvancada({ saudacao: { imageUrl: "http://inseguro.test/a.png", caption: "" } }).saudacao.imageUrl, "", "só https");
  mudar({ saudacao: { imageUrl: "", caption: "" } });
});

test("comandos da central: #bloquear, #pausar, #voltar, #desbloquear (com e sem número)", async () => {
  const tel = "5511911110007";
  await msg(tel, "olá");
  const central = (texto: string, telefone = tel) => receber(empresa.id, { id: `a${++seq}`, telefone, texto, daCentral: true }, { classificar: semIa });
  assert.deepEqual(await central("#bloquear"), [], "o bot não responde ao comando");
  assert.equal(A.conversa(empresa.id, tel)!.bloqueado, true);
  assert.deepEqual(await msg(tel, "1"), [], "bloqueado: o bot fica quieto");
  assert.equal(A.conversa(empresa.id, tel)!.mensagens.at(-1)!.de, "passageiro", "a mensagem fica na conversa para a equipe");
  await central("#desbloquear");
  assert.equal((await msg(tel, "1")).length > 0, true);
  await central("#pausar");
  assert.ok(Date.parse(A.conversa(empresa.id, tel)!.pausadoAte!) > Date.now() + 50 * 60_000, "pausa de 60 min por padrão");
  assert.deepEqual(await msg(tel, "oi"), []);
  await central("#voltar");
  assert.equal((await msg(tel, "menu")).length > 0, true);
  // Com o número do contato, digitado em outra conversa.
  await central("#bloquear 11 91111-0007", "5511900000000");
  assert.equal(A.conversa(empresa.id, "5511911110007")!.bloqueado, true);
  await central("#desbloquear 5511911110007", "5511900000000");
  assert.equal(A.conversa(empresa.id, "5511911110007")!.bloqueado, false);
  // Palavras trocadas pela empresa.
  mudar({ controle: { blockWord: "#travar", pauseMinutes: 5 } });
  await central("#bloquear");
  assert.equal(A.conversa(empresa.id, tel)!.bloqueado, false, "a palavra antiga não vale mais");
  await central("#travar");
  assert.equal(A.conversa(empresa.id, tel)!.bloqueado, true);
  mudar({ controle: {} });
});

test("webhook da Evolution: ignora grupo; mensagem do próprio número só vale se for comando (#)", () => {
  const p = provedorEvolution({ urlApi: "https://wa.exemplo.test", token: "t", instancia: "bot-x" });
  const corpo = (jid: string, fromMe: boolean, text: string) => ({ event: "messages.upsert", data: { key: { remoteJid: jid, fromMe, id: `k${++seq}` }, message: { conversation: text } } });
  assert.deepEqual(p.lerWebhook(corpo("120363000000000000@g.us", false, "oi")), [], "grupo");
  assert.deepEqual(p.lerWebhook(corpo("5511900000001@s.whatsapp.net", true, "olá, tudo bem?")), [], "conversa normal da central");
  const cmd = p.lerWebhook(corpo("5511900000001@s.whatsapp.net", true, "#bloquear"));
  assert.equal(cmd.length, 1);
  assert.equal(cmd[0].daCentral, true);
  assert.equal(p.lerWebhook(corpo("5511900000001@s.whatsapp.net", false, "oi"))[0].daCentral, undefined);
});

test("mensagens de status: padrão da referência, personalizada pela empresa e troca de motorista", async () => {
  mudar({ textosStatus: { arrived: "Oi {passageiro}, {motorista} chegou! 🚗", hack: "x" } });
  assert.deepEqual(Object.keys(A.config(empresa.id).textosStatus), ["arrived"]);
  const tel = "5511911110008";
  await msg(tel, "olá"); await msg(tel, "1"); await msg(tel, "Rua das Flores, 120"); await msg(tel, "Av. Brasil, 500");
  await msg(tel, "1"); await msg(tel, "1"); // confirma e escolhe a categoria
  await msg(tel, "2"); // Pix
  const corrida = R.listarProprias(empresa.id).find((x) => x.passageiro.telefone === tel)!;
  assert.equal(await atualizarStatus(empresa.id, tel), null);
  await R.atribuirMotorista(empresa.id, corrida.id, motorista.id);
  const aceita = (await atualizarStatus(empresa.id, tel))!;
  assert.match(aceita, /^✅ Corrida confirmada! Seu motorista esta a caminho\.\n\n👤 Ana Souza\n🚘 Carro prata, placa ABC1D23$/);
  await R.mudarStatus(empresa.id, corrida.id, "no_local");
  assert.equal(await atualizarStatus(empresa.id, tel), "Oi Maria, Ana Souza chegou! 🚗");
  await R.cancelarCorrida(empresa.id, corrida.id, "Central", "teste");
  assert.match((await atualizarStatus(empresa.id, tel))!, /cancelada pela central/);
  mudar({ textosStatus: {} });
});

test("rotas: só admin muda a configuração avançada; dados vão sanitizados e isolados por empresa", async () => {
  const adm = D.criarUsuario({ email: "adm@avancada.test", nome: "Adm", senha: "senha-forte-1", empresaId: empresa.id, papel: "admin" });
  const op = D.criarUsuario({ email: "op@avancada.test", nome: "Op", senha: "senha-forte-1", empresaId: empresa.id, papel: "operador" });
  const app = express();
  app.use(express.json());
  app.post("/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({}); });
  app.use("/api/bot", rotasBot);
  const srv = app.listen(0);
  const url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  try {
    const cookieDe = async (id: string) => ((await fetch(`${url}/entrar/${id}`, { method: "POST" })).headers.get("set-cookie") ?? "").split(";")[0];
    const [cA, cO] = [await cookieDe(adm.id), await cookieDe(op.id)];
    const pedir = async (p: string, cookie: string, metodo = "GET", corpo?: unknown) => {
      const r = await fetch(url + p, { method: metodo, headers: { "Content-Type": "application/json", Cookie: cookie }, body: corpo ? JSON.stringify(corpo) : undefined });
      return { status: r.status, corpo: await r.json() as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
    };
    assert.equal((await pedir("/api/bot/config/avancada", cO, "PUT", { textos: { ask_address: "x" } })).status, 403);
    const r = await pedir("/api/bot/config/avancada", cA, "PUT", {
      textos: { ask_address: "Onde você está?", lixo: "x" }, fluxo: { ask_category: false, ask_payment: "sim" },
      faq: [{ question: "Q", keywords: "pet, gato", answer: "Sim" }, { question: "sem resposta", keywords: ["x"], answer: "" }],
      controle: { pauseMinutes: 99999, blockWord: "#x" },
    });
    assert.equal(r.status, 200);
    const c = r.corpo.config;
    assert.deepEqual(c.textos, { ask_address: "Onde você está?" });
    assert.equal(c.fluxo.ask_category, false);
    assert.equal(c.fluxo.ask_payment, true, "valor que não é verdadeiro/falso é ignorado");
    assert.equal(c.faq.length, 1);
    assert.deepEqual(c.faq[0].keywords, ["pet", "gato"]);
    assert.equal(c.controle.pauseMinutes, 60, "fora de 1 a 1440 volta ao padrão");
    assert.equal(c.controle.blockWord, "#blockword".length ? "#x" : "", "palavra de 2+ letras vale");
    // Mudar a conexão não apaga a configuração avançada.
    const conexao = await pedir("/api/bot/config", cA, "PUT", { ativo: true, provedor: "simulado" });
    assert.equal(conexao.status, 200);
    assert.deepEqual(A.config(empresa.id).textos, { ask_address: "Onde você está?" });
    const lida = await pedir("/api/bot/config", cO);
    assert.equal(lida.corpo.config.fluxo.ask_category, false);
  } finally { srv.closeAllConnections(); srv.close(); }
});
