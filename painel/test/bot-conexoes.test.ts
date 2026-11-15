// Testes das conexões do bot: provedores Z-API, Z-Pro e Meta, várias conexões por empresa e áudio. Sem rede (fetch de mentira).
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "bot-conexoes-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "y".repeat(40);
for (const k of ["ANTHROPIC_API_KEY", "GROQ_API_KEYS", "GROQ_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "WHATSAPP_EVOLUTION_URL", "WHATSAPP_EVOLUTION_TOKEN"]) delete process.env[k];

const D = await import("../src/servidor/dados.ts");
const A = await import("../src/bot/armazem.ts");
const { receber, provedorDe, servidorWhatsApp } = await import("../src/bot/fluxo.ts");
const { provedorZapi, provedorMeta, lerWebhookZapi, lerWebhookMeta, metaAssinaturaOk, metaAtrasada } = await import("../src/bot/provedores-api.ts");
const { caixaSimulada } = await import("../src/bot/provedores.ts");
const { transcrever, textoDoAudio, podeTranscrever } = await import("../src/bot/audio.ts");
const { rotasBot, guardarCorpoCru } = await import("../src/bot/rotas.ts");
const { criarCookie } = await import("../src/servidor/sessao.ts");
const express = (await import("express")).default;

const empresa = D.criarEmpresa("Central Numeros", { nomeExibido: "Central Numeros", assistente: { nome: "Lia", tom: "cordial" } });
const outra = D.criarEmpresa("Outra Central Numeros");
A.salvarConfig(empresa.id, { ativo: true, provedor: "simulado", instancia: "bot-numeros" });
A.salvarConfig(outra.id, { ativo: true, provedor: "simulado", instancia: "bot-outra-n" });

type Chamada = { url: string; metodo: string; corpo: unknown; cab: Headers };
function fetchFalso(resp: (url: string, metodo: string) => Response | undefined = () => undefined) {
  const chamadas: Chamada[] = [];
  const f = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url), metodo = init?.method ?? "GET";
    chamadas.push({ url: u, metodo, corpo: typeof init?.body === "string" ? JSON.parse(init.body) : init?.body, cab: new Headers(init?.headers) });
    return resp(u, metodo) ?? new Response("{}");
  }) as typeof fetch;
  return { f, chamadas };
}

test("Z-API: lê texto, localização e áudio; ignora grupo, eco e status; envia pelo endereço da instância", async () => {
  const lidas = lerWebhookZapi({ type: "ReceivedCallback", phone: "5511988887777", messageId: "Z1", senderName: "João", text: { message: "oi" } });
  assert.deepEqual([lidas[0].id, lidas[0].telefone, lidas[0].nome, lidas[0].texto], ["Z1", "5511988887777", "João", "oi"]);
  assert.equal(lerWebhookZapi({ type: "ReceivedCallback", phone: "5511988887777", messageId: "Z2", location: { latitude: -23.5, longitude: -46.6, name: "Padaria" } })[0].local?.lat, -23.5);
  const au = lerWebhookZapi({ type: "ReceivedCallback", phone: "5511988887777", messageId: "Z3", audio: { audioUrl: "https://z.test/a.ogg", mimeType: "audio/ogg; codecs=opus" } })[0];
  assert.equal(au.audio?.url, "https://z.test/a.ogg");
  assert.deepEqual(lerWebhookZapi({ type: "ReceivedCallback", phone: "120363-group", isGroup: true, text: { message: "grupo" } }), []);
  assert.deepEqual(lerWebhookZapi({ type: "ReceivedCallback", phone: "5511988887777", isGroup: false, fromMe: true, text: { message: "eco" } }), []);
  assert.equal(lerWebhookZapi({ type: "ReceivedCallback", phone: "5511988887777", fromMe: true, text: { message: "#bloquear" } })[0].daCentral, true);
  assert.deepEqual(lerWebhookZapi({ type: "MessageStatusCallback", phone: "5511988887777" }), []);

  const { f, chamadas } = fetchFalso();
  const p = provedorZapi({ urlApi: "https://api.z.test/instances/I1/", token: "tk", clientToken: "ct", fetch: f }, "zpro");
  assert.equal(p.tipo, "zpro");
  await p.enviarTexto("+55 (11) 98888-7777", "Olá");
  assert.equal(chamadas[0].url, "https://api.z.test/instances/I1/token/tk/send-text");
  assert.deepEqual(chamadas[0].corpo, { phone: "5511988887777", message: "Olá" });
  assert.equal(chamadas[0].cab.get("client-token"), "ct");
  await p.enviarImagem("5511988887777", "https://img.test/a.png", "Oi");
  assert.deepEqual(chamadas[1].corpo, { phone: "5511988887777", image: "https://img.test/a.png", caption: "Oi" });
  assert.equal((await provedorZapi({ urlApi: "", token: "" }).situacao()).situacao, "nao_configurado");
});

test("Z-API: conectar aponta o webhook e devolve o QR quando falta ler", async () => {
  const { f, chamadas } = fetchFalso((u) => u.endsWith("/status") ? new Response(JSON.stringify({ connected: false })) : u.endsWith("/qr-code/image") ? new Response(JSON.stringify({ value: "data:image/png;base64,QQ" })) : undefined);
  const r = await provedorZapi({ urlApi: "https://api.z.test/instances/I1", token: "tk", fetch: f }).conectar("https://painel.test/api/bot/webhook/e/s/n1");
  assert.equal(r.situacao, "aguardando_qr");
  assert.equal(r.qr, "data:image/png;base64,QQ");
  const hook = chamadas.find((c) => c.url.endsWith("/update-every-webhooks"))!;
  assert.equal(hook.metodo, "PUT");
  assert.equal((hook.corpo as { value: string }).value, "https://painel.test/api/bot/webhook/e/s/n1");
  const { f: f2 } = fetchFalso((u) => u.endsWith("/status") ? new Response(JSON.stringify({ connected: true })) : undefined);
  assert.equal((await provedorZapi({ urlApi: "https://api.z.test/instances/I1", token: "tk", fetch: f2 }).conectar("https://x.test")).situacao, "conectado");
  const { f: f3 } = fetchFalso(() => new Response(JSON.stringify({ error: "token inválido" }), { status: 401 }));
  const ruim = await provedorZapi({ urlApi: "https://api.z.test/instances/I1", token: "tk", fetch: f3 }).situacao();
  assert.equal(ruim.situacao, "erro");
  assert.match(ruim.detalhe ?? "", /401/);
});

const corpoMeta = (mensagens: unknown[], phoneId = "109876543210", contatos: unknown[] = [{ wa_id: "5511977776666", profile: { name: "Maria" } }]) =>
  ({ entry: [{ changes: [{ value: { metadata: { phone_number_id: phoneId }, contacts: contatos, messages: mensagens } }] }] });

test("Meta: lê texto, botão, localização e áudio; ignora outro número e mensagem atrasada", () => {
  const agora = Date.now();
  const seg = (d = 0) => String(Math.floor((agora - d) / 1000));
  const lidas = lerWebhookMeta(corpoMeta([
    { from: "5511977776666", id: "wamid.1", timestamp: seg(), type: "text", text: { body: "oi" } },
    { from: "5511977776666", id: "wamid.2", timestamp: seg(), type: "interactive", interactive: { button_reply: { title: "Pedir corrida" } } },
    { from: "5511977776666", id: "wamid.3", timestamp: seg(), type: "location", location: { latitude: -23.5, longitude: -46.6, name: "Praça" } },
    { from: "5511977776666", id: "wamid.4", timestamp: seg(), type: "audio", audio: { id: "MID", mime_type: "audio/ogg; codecs=opus" } },
    { from: "5511977776666", id: "wamid.5", timestamp: seg(3 * 24 * 3600_000), type: "text", text: { body: "antiga" } },
    { from: "5511977776666", id: "wamid.6", timestamp: seg(), type: "image", image: { id: "X" } },
  ]), "109876543210", agora);
  assert.deepEqual(lidas.map((l) => l.id), ["wamid.1", "wamid.2", "wamid.3", "wamid.4"]);
  assert.equal(lidas[0].nome, "Maria");
  assert.equal(lidas[1].texto, "Pedir corrida");
  assert.equal(lidas[2].local?.lng, -46.6);
  assert.equal(lidas[3].audio?.id, "MID");
  assert.deepEqual(lerWebhookMeta(corpoMeta([{ from: "5511977776666", id: "w", timestamp: seg(), type: "text", text: { body: "oi" } }], "999"), "109876543210", agora), []);
  assert.equal(metaAtrasada(String(Math.floor(agora / 1000) - 3600), agora), true);
  assert.equal(metaAtrasada(undefined, agora), false);
});

test("Meta: assinatura do aviso e envio pela API", async () => {
  const corpo = JSON.stringify(corpoMeta([]));
  const boa = `sha256=${crypto.createHmac("sha256", "segredo-do-app").update(corpo).digest("hex")}`;
  assert.equal(metaAssinaturaOk(corpo, boa, "segredo-do-app"), true);
  assert.equal(metaAssinaturaOk(corpo, boa, "outro"), false);
  assert.equal(metaAssinaturaOk(corpo + " ", boa, "segredo-do-app"), false);
  assert.equal(metaAssinaturaOk(corpo, undefined, "segredo-do-app"), false);
  assert.equal(metaAssinaturaOk(corpo, "sha256=zz", "segredo-do-app"), false);

  const { f, chamadas } = fetchFalso((u) => u.includes("fields=display_phone_number") ? new Response(JSON.stringify({ display_phone_number: "+55 11 97777-6666" })) : undefined);
  const p = provedorMeta({ token: "tk-meta", phoneId: "109876543210", fetch: f });
  await p.enviarTexto("+55 11 97777-6666", "Olá");
  assert.equal(chamadas[0].url, "https://graph.facebook.com/v20.0/109876543210/messages");
  assert.deepEqual(chamadas[0].corpo, { messaging_product: "whatsapp", to: "5511977776666", type: "text", text: { body: "Olá" } });
  assert.equal(chamadas[0].cab.get("authorization"), "Bearer tk-meta");
  const s = await p.situacao();
  assert.equal(s.situacao, "conectado");
  assert.match((await p.conectar("https://x.test")).detalhe ?? "", /webhook/i);
  const { f: f2 } = fetchFalso(() => new Response(JSON.stringify({ error: { message: "Token vencido" } }), { status: 401 }));
  await assert.rejects(provedorMeta({ token: "x", phoneId: "1", fetch: f2 }).enviarTexto("5511977776666", "oi"), /401.*Token vencido/);
  assert.equal((await provedorMeta({ token: "", phoneId: "" }).situacao()).situacao, "nao_configurado");
});

test("várias conexões: cada uma com a própria instância e segredos, isoladas por empresa", () => {
  const a = A.salvarConexao(empresa.id, { nome: "Central 2", provedor: "evolution", instancia: "numero-dois" });
  const b = A.salvarConexao(empresa.id, { nome: "Atendimento Z", provedor: "zapi" });
  assert.equal(A.conexoesDe(empresa.id).length, 3);
  assert.equal(A.conexoesDe(empresa.id)[0].id, "principal");
  assert.throws(() => A.salvarConexao(empresa.id, { nome: "Repetida", provedor: "evolution", instancia: "numero-dois" }), /instância/);
  assert.equal(A.conexao(outra.id, a.id), null, "outra empresa não enxerga a conexão");
  // Segredos separados por conexão.
  A.salvarSegredosBot(empresa.id, { urlApi: "https://wa.exemplo.test", token: "TOKEN-A" }, a.id);
  A.salvarSegredosBot(empresa.id, { token: "TOKEN-PRINCIPAL" });
  assert.equal(A.segredosBot(empresa.id, a.id).token, "TOKEN-A");
  assert.equal(A.segredosBot(empresa.id).token, "TOKEN-PRINCIPAL");
  assert.deepEqual(A.segredosBot(outra.id, a.id), {});
  // Evolution própria usa a instância escolhida; no servidor da plataforma, uma instância por conexão.
  assert.equal(servidorWhatsApp(empresa.id, a.id).instancia, "numero-dois");
  assert.equal(servidorWhatsApp(empresa.id, a.id).daPlataforma, false);
  assert.equal(servidorWhatsApp(empresa.id, b.id).instancia, `bot-${empresa.id}-${b.id}`);
  assert.equal(provedorDe(empresa.id, a.id).tipo, "evolution");
  assert.equal(provedorDe(empresa.id, b.id).tipo, "zapi");
  assert.equal(provedorDe(empresa.id, "nao-existe").tipo, "simulado", "conexão apagada cai na principal");
  // Remover apaga também os segredos.
  A.removerConexao(empresa.id, a.id);
  assert.equal(A.conexao(empresa.id, a.id), null);
  assert.deepEqual(A.segredosBot(empresa.id, a.id), {});
  assert.throws(() => A.removerConexao(empresa.id, "principal"), /principal/);
  A.removerConexao(empresa.id, b.id);
  for (let i = 0; i < A.MAX_CONEXOES; i++) A.salvarConexao(empresa.id, { nome: `N${i}`, provedor: "simulado" });
  assert.throws(() => A.salvarConexao(empresa.id, { nome: "demais", provedor: "simulado" }), /No máximo/);
  for (const c of A.config(empresa.id).conexoes) A.removerConexao(empresa.id, c.id);
});

test("a conversa responde pelo número por onde o passageiro escreveu", async () => {
  const sec = A.salvarConexao(empresa.id, { nome: "Segundo número", provedor: "simulado" });
  const enviados: Array<{ por: string; texto: string }> = [];
  const fake = (por: string) => ({ ...provedorDe(empresa.id), enviarTexto: async (_t: string, texto: string) => { enviados.push({ por, texto }); } });
  await receber(empresa.id, { id: "c1", telefone: "5511911110001", nome: "Rui", texto: "oi", conexao: sec.id }, { provedor: fake(sec.id), classificar: async () => null });
  assert.equal(A.conversa(empresa.id, "5511911110001")!.conexao, sec.id);
  assert.match(enviados[0].texto, /Lia/);
  // Sem provedor injetado, usa o da conexão da conversa (simulado: cai na caixa da empresa).
  limpar();
  await receber(empresa.id, { id: "c2", telefone: "5511911110001", nome: "Rui", texto: "menu" }, { classificar: async () => null });
  assert.equal(A.conversa(empresa.id, "5511911110001")!.conexao, sec.id, "continua no mesmo número");
  assert.ok(caixaSimulada(empresa.id).some((m) => m.telefone === "5511911110001"));
  A.removerConexao(empresa.id, sec.id);
});
function limpar() { /* a caixa simulada acumula; os testes só procuram mensagens novas do telefone */ }

test("áudio: transcrição pela nuvem com chave; sem chave, o bot pede para escrever", async () => {
  const bytes = Buffer.from("OggS-fake");
  assert.equal(podeTranscrever(empresa.id, { env: {}, chavesEmpresa: {} }), false);
  assert.equal(await transcrever(empresa.id, bytes, "audio/ogg", { env: {}, chavesEmpresa: {} }), null);

  const { f, chamadas } = fetchFalso((u) => u.includes("api.groq.com") ? new Response(JSON.stringify({ text: " rua das flores 120 " })) : undefined);
  const dito = await transcrever(empresa.id, bytes, "audio/ogg; codecs=opus", { fetch: f, env: { GROQ_API_KEYS: "g-teste-1" }, chavesEmpresa: {} });
  assert.equal(dito, "rua das flores 120");
  assert.equal(chamadas[0].url, "https://api.groq.com/openai/v1/audio/transcriptions");
  assert.equal(chamadas[0].cab.get("authorization"), "Bearer g-teste-1");
  // Groq falha: tenta a OpenAI.
  const { f: f2, chamadas: c2 } = fetchFalso((u) => u.includes("groq") ? new Response("{}", { status: 500 }) : new Response(JSON.stringify({ text: "oi" })));
  assert.equal(await transcrever(empresa.id, bytes, "audio/ogg", { fetch: f2, env: { GROQ_API_KEYS: "g", OPENAI_API_KEY: "o" }, chavesEmpresa: {} }), "oi");
  assert.equal(c2.length >= 2, true);

  // Texto pronto (simulado) não usa rede; o arquivo vem do provedor.
  const sim = provedorDe(empresa.id);
  assert.equal(await textoDoAudio(empresa.id, { mimetype: "audio/ogg", transcricao: "  oi  " }, sim), "oi");
  assert.equal(await textoDoAudio(empresa.id, { mimetype: "audio/ogg", id: "x" }, sim, { env: {}, chavesEmpresa: {} }), null);
  const comArquivo = { ...sim, baixarAudio: async () => ({ bytes, mimetype: "audio/ogg" }) };
  assert.equal(await textoDoAudio(empresa.id, { mimetype: "audio/ogg", id: "x" }, comArquivo, { fetch: f, env: { GROQ_API_KEYS: "g-teste-1" }, chavesEmpresa: {} }), "rua das flores 120");
});

test("áudio no fluxo: vira texto e segue o pedido; sem transcrição avisa; operador na conversa fica quieto", async () => {
  const tel = "5511922220001";
  const base = { classificar: async () => null };
  const r1 = await receber(empresa.id, { id: "au1", telefone: tel, nome: "Ana", audio: { mimetype: "audio/ogg", transcricao: "oi" } }, base);
  assert.match(r1[0], /Lia/);
  assert.equal(A.conversa(empresa.id, tel)!.mensagens[0].texto, '🎤 Áudio: "oi"');
  const r2 = await receber(empresa.id, { id: "au2", telefone: tel, nome: "Ana", audio: { mimetype: "audio/ogg", transcricao: "1" } }, base);
  assert.match(r2[0], /endereço de embarque/i);
  const r3 = await receber(empresa.id, { id: "au3", telefone: tel, nome: "Ana", audio: { mimetype: "audio/ogg", id: "sem-chave" } }, { ...base, audio: { env: {}, chavesEmpresa: {} } });
  assert.deepEqual(r3, ["Não consegui entender esse áudio agora. Pode enviar novamente ou escrever sua mensagem?"]);
  assert.equal(A.conversa(empresa.id, tel)!.etapa, "embarque", "a etapa não muda");
  assert.equal(A.conversa(empresa.id, tel)!.mensagens.some((m) => m.texto === "🎤 Áudio (não deu para transcrever)"), true);
  // Em atendimento do operador, o bot não responde.
  const c = A.conversa(empresa.id, tel)!; c.etapa = "suporte"; A.salvarConversa(empresa.id, c);
  assert.deepEqual(await receber(empresa.id, { id: "au4", telefone: tel, audio: { mimetype: "audio/ogg", id: "x" } }, { ...base, audio: { env: {}, chavesEmpresa: {} } }), []);
});

test("rotas por conexão: só admin cria; tokens não voltam; webhook entra pela conexão certa; Meta verifica e confere a assinatura", async () => {
  const adm = D.criarUsuario({ email: "adm@numeros.test", nome: "Adm", senha: "senha-forte-1", empresaId: empresa.id, papel: "admin" });
  const op = D.criarUsuario({ email: "op@numeros.test", nome: "Op", senha: "senha-forte-1", empresaId: empresa.id, papel: "operador" });
  const app = express();
  app.use(express.json({ verify: guardarCorpoCru })); // como no servidor de verdade
  app.post("/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({}); });
  app.use("/api/bot", rotasBot);
  const srv = app.listen(0);
  const url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  try {
    const cookieDe = async (id: string) => ((await fetch(`${url}/entrar/${id}`, { method: "POST" })).headers.get("set-cookie") ?? "").split(";")[0];
    const [cA, cO] = [await cookieDe(adm.id), await cookieDe(op.id)];
    const pedir = async (p: string, cookie: string, metodo = "GET", corpo?: unknown) => {
      const r = await fetch(`${url}/api/bot${p}`, { method: metodo, headers: { "Content-Type": "application/json", Cookie: cookie }, body: corpo ? JSON.stringify(corpo) : undefined });
      return { status: r.status, corpo: await r.json() as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
    };
    assert.equal((await pedir("/conexoes", cO, "POST", { nome: "x", provedor: "simulado" })).status, 403);

    // Z-API: precisa de endereço https público; dado inválido não deixa conexão pela metade; o token nunca volta.
    { const rr = await pedir("/conexoes", cA, "POST", { nome: "Z", provedor: "zapi", token: "tk" }); assert.equal(rr.status, 400, JSON.stringify(rr.corpo)); }
    assert.equal((await pedir("/conexoes", cA, "POST", { nome: "Z", provedor: "zapi", urlApi: "http://localhost/x", token: "tk" })).status, 400);
    assert.equal(A.config(empresa.id).conexoes.length, 0);
    const z = await pedir("/conexoes", cA, "POST", { nome: "Fila Z", provedor: "zapi", urlApi: "https://api.z.test/instances/I1", token: "TOKEN-SECRETO", clientToken: "CLIENTE-SECRETO" });
    assert.equal(z.status, 200, JSON.stringify(z.corpo));
    assert.ok(!JSON.stringify(z.corpo).includes("TOKEN-SECRETO") && !JSON.stringify(z.corpo).includes("CLIENTE-SECRETO"));
    assert.equal(z.corpo.conexao.servidor.tokenSalvo, true);
    assert.equal(z.corpo.conexao.servidor.clientTokenSalvo, true);
    const idZ = z.corpo.conexao.id as string;
    const segredo = A.segredoWebhook(empresa.id);
    assert.ok(z.corpo.conexao.webhook.endsWith(`/api/bot/webhook/${empresa.id}/${segredo}/${idZ}`));
    const lista = await pedir("/conexoes", cO);
    assert.equal(lista.corpo.conexoes.length, 2);
    assert.equal(lista.corpo.conexoes[0].id, "principal");
    assert.equal(lista.corpo.conexoes[1].webhook, null, "só o admin vê o endereço de entrada");
    assert.ok(!JSON.stringify(lista.corpo).includes("TOKEN-SECRETO"));
    // Mudar sem mandar o token mantém o que estava salvo.
    await pedir(`/conexoes/${idZ}`, cA, "PUT", { nome: "Fila Z2" });
    assert.equal(A.segredosBot(empresa.id, idZ).token, "TOKEN-SECRETO");
    assert.equal(A.conexao(empresa.id, idZ)!.nome, "Fila Z2");

    // Webhook por conexão (simulada): a mensagem entra e a conversa guarda a conexão.
    const s2 = await pedir("/conexoes", cA, "POST", { nome: "Segundo", provedor: "simulado" });
    const id2 = s2.corpo.conexao.id as string;
    const h = { "Content-Type": "application/json" };
    const corpo = JSON.stringify({ telefone: "5511933330001", nome: "Lia", texto: "oi", id: "w-1" });
    assert.equal((await fetch(`${url}/api/bot/webhook/${empresa.id}/${segredo}/naoexiste`, { method: "POST", headers: h, body: corpo })).status, 404);
    assert.equal((await fetch(`${url}/api/bot/webhook/${outra.id}/${segredo}/${id2}`, { method: "POST", headers: h, body: corpo })).status, 404);
    assert.equal((await fetch(`${url}/api/bot/webhook/${empresa.id}/${segredo}/${id2}`, { method: "POST", headers: h, body: corpo })).status, 200);
    await A.aguardarFilas();
    assert.equal(A.conversa(empresa.id, "5511933330001")!.conexao, id2);
    const det = await pedir("/conversas/5511933330001", cA);
    assert.equal(det.corpo.conversa.conexaoNome, "Segundo");
    assert.equal((await pedir("/conversas", cA)).corpo.conversas.find((c: { id: string }) => c.id === "5511933330001").conexao, "Segundo");
    // Conexão desligada ignora a mensagem.
    await pedir(`/conexoes/${id2}`, cA, "PUT", { ativa: false });
    const off = await fetch(`${url}/api/bot/webhook/${empresa.id}/${segredo}/${id2}`, { method: "POST", headers: h, body: JSON.stringify({ telefone: "5511933330002", texto: "oi", id: "w-2" }) });
    assert.equal((await off.json() as { ignorado?: boolean }).ignorado, true);
    assert.equal(A.conversa(empresa.id, "5511933330002"), null);

    // Meta: senha de verificação gerada; a Meta confere no GET; o POST precisa da assinatura do App Secret.
    const m = await pedir("/conexoes", cA, "POST", { nome: "Oficial", provedor: "meta", token: "TOKEN-META", phoneId: "109876543210", wabaId: "55", appSecret: "SEGREDO-DO-APP" });
    assert.equal(m.status, 200, JSON.stringify(m.corpo));
    assert.ok(!JSON.stringify(m.corpo).includes("TOKEN-META") && !JSON.stringify(m.corpo).includes("SEGREDO-DO-APP"));
    assert.equal(m.corpo.conexao.servidor.appSecretSalvo, true);
    const senha = m.corpo.conexao.senhaVerificacao as string;
    assert.match(senha, /^vlv_[0-9a-f]{32}$/);
    const hookM = `${url}/api/bot/webhook/${empresa.id}/${segredo}/${m.corpo.conexao.id}`;
    const ver = await fetch(`${hookM}?hub.mode=subscribe&hub.verify_token=${senha}&hub.challenge=12345`);
    assert.equal(await ver.text(), "12345");
    assert.equal((await fetch(`${hookM}?hub.mode=subscribe&hub.verify_token=errada&hub.challenge=12345`)).status, 404);
    const aviso = JSON.stringify(corpoMeta([]));
    assert.equal((await fetch(hookM, { method: "POST", headers: h, body: aviso })).status, 401, "sem assinatura");
    assert.equal((await fetch(hookM, { method: "POST", headers: { ...h, "X-Hub-Signature-256": `sha256=${"0".repeat(64)}` }, body: aviso })).status, 401);
    const boa = `sha256=${crypto.createHmac("sha256", "SEGREDO-DO-APP").update(aviso).digest("hex")}`;
    assert.equal((await fetch(hookM, { method: "POST", headers: { ...h, "X-Hub-Signature-256": boa }, body: aviso })).status, 200);
    // O GET só serve para a Meta: conexão que não é Meta não responde.
    assert.equal((await fetch(`${url}/api/bot/webhook/${empresa.id}/${segredo}/${id2}?hub.mode=subscribe&hub.verify_token=${senha}&hub.challenge=1`)).status, 404);

    // Apagar a conexão: some da lista e os segredos também.
    assert.equal((await pedir(`/conexoes/${idZ}`, cO, "DELETE")).status, 403);
    assert.equal((await pedir(`/conexoes/${idZ}`, cA, "DELETE")).status, 200);
    assert.deepEqual(A.segredosBot(empresa.id, idZ), {});
    assert.equal((await pedir("/conexoes/principal", cA, "DELETE")).status, 400);
  } finally { srv.closeAllConnections(); srv.close(); }
});
