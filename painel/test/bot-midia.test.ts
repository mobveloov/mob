// Voz do bot e repasse de mensagens entre passageiro e motorista. Sem rede (fetch de mentira, provedor simulado).
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DADOS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "bot-midia-"));
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "y".repeat(40);
for (const k of ["ANTHROPIC_API_KEY", "GROQ_API_KEYS", "GROQ_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY"]) delete process.env[k];

const D = await import("../src/servidor/dados.ts");
const A = await import("../src/bot/armazem.ts");
const { receber } = await import("../src/bot/fluxo.ts");
const { atualizarStatus } = await import("../src/bot/status.ts");
const { definirCorridasDoBot } = await import("../src/bot/corridas.ts");
const { caixaSimulada, provedorEvolution } = await import("../src/bot/provedores.ts");
const { provedorZapi, provedorMeta } = await import("../src/bot/provedores-api.ts");
const { sintetizar, podeFalar } = await import("../src/bot/voz.ts");
const Chat = await import("../src/apps/chat.ts");

const empresa = D.criarEmpresa("Central Midia", { nomeExibido: "Central Midia", assistente: { nome: "Lia", tom: "cordial" } });
A.salvarConfig(empresa.id, { ativo: true, provedor: "simulado", instancia: "bot-midia" });

type Chamada = { url: string; metodo: string; corpo: unknown; cab: Headers };
function fetchFalso(resp: (url: string) => Response | undefined = () => undefined) {
  const chamadas: Chamada[] = [];
  const f = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    chamadas.push({ url: u, metodo: init?.method ?? "GET", corpo: typeof init?.body === "string" ? JSON.parse(init.body) : init?.body, cab: new Headers(init?.headers) });
    return resp(u) ?? new Response("{}");
  }) as typeof fetch;
  return { f, chamadas };
}
const WAV = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVEfmt "), Buffer.alloc(32)]);
const gemini = (u: string) => u.includes("generativelanguage") ? new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { data: WAV.toString("base64"), mimeType: "audio/wav" } }] } }] })) : undefined;

test("voz: Gemini com chave devolve áudio; sem chave, texto longo ou erro devolvem null", async () => {
  assert.equal(podeFalar(empresa.id, { env: {}, chavesEmpresa: {} }), false);
  assert.equal(await sintetizar(empresa.id, "Olá!", "Kore", { env: {}, chavesEmpresa: {} }), null);
  const { f, chamadas } = fetchFalso(gemini);
  const a = await sintetizar(empresa.id, "*Olá!* Pedido feito. Valor: R$ 12,50 😀", "Puck", { fetch: f, env: { GEMINI_API_KEY: "g-teste" }, chavesEmpresa: {} });
  assert.equal(a?.mimetype, "audio/wav");
  assert.equal(a?.bytes.subarray(0, 4).toString(), "RIFF");
  assert.equal(chamadas[0].cab.get("x-goog-api-key"), "g-teste");
  const fala = JSON.stringify(chamadas[0].corpo);
  assert.match(fala, /12 reais e 50 centavos/);
  assert.match(fala, /Puck/);
  assert.ok(!chamadas[0].url.includes("g-teste"), "a chave não vai na URL");
  assert.equal(await sintetizar(empresa.id, "x".repeat(600), "Kore", { fetch: f, env: { GEMINI_API_KEY: "g" }, chavesEmpresa: {} }), null, "texto longo não vira áudio");
  const { f: ruim } = fetchFalso(() => new Response("{}", { status: 500 }));
  assert.equal(await sintetizar(empresa.id, "Olá!", "Kore", { fetch: ruim, env: { GEMINI_API_KEY: "g" }, chavesEmpresa: {} }), null);
});

test("voz no fluxo: quem fala por áudio ouve a resposta em áudio; quem escreve não", async () => {
  A.salvarConfig(empresa.id, { ativo: true, provedor: "simulado", instancia: "bot-midia", ...A.sanearAvancada({ ...A.config(empresa.id), voz: { ligada: true, nome: "Kore" } }) });
  const { f } = fetchFalso(gemini);
  const voz = { fetch: f, env: { GEMINI_API_KEY: "g-teste" }, chavesEmpresa: {} };
  const tel = "5511980000001";
  const antes = caixaSimulada(empresa.id).length;
  await receber(empresa.id, { id: "v1", telefone: tel, nome: "Rui", texto: "oi" }, { classificar: async () => null, voz });
  assert.equal(caixaSimulada(empresa.id).slice(antes).filter((m) => m.texto.startsWith("🎤")).length, 0, "texto não gera áudio");
  const r = await receber(empresa.id, { id: "v2", telefone: tel, nome: "Rui", audio: { mimetype: "audio/ogg", transcricao: "menu" } }, { classificar: async () => null, voz });
  assert.ok(r.length);
  const saidas = caixaSimulada(empresa.id).slice(antes).filter((m) => m.telefone === tel);
  assert.ok(saidas.some((m) => m.texto.startsWith("🎤 audio (audio/wav")), "o áudio saiu depois do texto");
  // Sem chave: só o texto.
  const antes2 = caixaSimulada(empresa.id).length;
  await receber(empresa.id, { id: "v3", telefone: tel, nome: "Rui", audio: { mimetype: "audio/ogg", transcricao: "menu" } }, { classificar: async () => null, voz: { env: {}, chavesEmpresa: {} } });
  assert.equal(caixaSimulada(empresa.id).slice(antes2).filter((m) => m.texto.startsWith("🎤")).length, 0);
});

const CORRIDA = crypto.randomUUID();
const prepararCorrida = (tel: string, status: string) => {
  const c = A.novaConversa(tel, "Rui"); c.etapa = "em_corrida";
  c.corrida = { id: CORRIDA, os: "901", status, grupo: "aberta", criadaEm: new Date(Date.now() - 60_000).toISOString() };
  A.salvarConversa(empresa.id, c);
};
definirCorridasDoBot({
  categorias: async () => [{ id: "c1", nome: "Comum" }],
  criar: async () => ({ id: CORRIDA, os: "901" }),
  detalhar: async () => ({ status: "a_caminho", grupo: "aberta" }),
  cancelar: async () => undefined, avaliar: async () => undefined,
});

test("repasse: passageiro -> motorista (texto, localização e áudio) só com motorista a caminho", async () => {
  const tel = "5511980000002";
  prepararCorrida(tel, "procurando");
  const r0 = await receber(empresa.id, { id: "p0", telefone: tel, texto: "estou na porta" }, { classificar: async () => null });
  assert.match(r0[0], /corrida em andamento/, "procurando: ninguém para ler, o bot só avisa");
  assert.equal(Chat.mensagens(empresa.id, CORRIDA).length, 0);

  prepararCorrida(tel, "a_caminho");
  const r1 = await receber(empresa.id, { id: "p1", telefone: tel, texto: "estou na porta azul" }, { classificar: async () => null });
  assert.match(r1[0], /chega ao motorista/);
  await receber(empresa.id, { id: "p2", telefone: tel, local: { lat: -21.02, lng: -48.22, texto: "Praça" } }, { classificar: async () => null });
  const ogg = Buffer.concat([Buffer.from("OggS"), Buffer.alloc(60)]);
  const r3 = await receber(empresa.id, { id: "p3", telefone: tel, audio: { mimetype: "audio/ogg", id: "a1" } },
    { classificar: async () => null, provedor: { ...provedorEvolution({ urlApi: "", token: "", instancia: "x" }), baixarAudio: async () => ({ bytes: ogg, mimetype: "audio/ogg; codecs=opus" }) }, audio: { env: {}, chavesEmpresa: {} } });
  assert.deepEqual(r3, [], "sem aviso repetido");
  const ms = Chat.mensagens(empresa.id, CORRIDA);
  assert.equal(ms.length, 3);
  assert.deepEqual(ms.map((m) => m.de), ["passageiro", "passageiro", "passageiro"]);
  assert.equal(ms[0].texto, "estou na porta azul");
  assert.match(ms[1].texto!, /google\.com\/maps\?q=-21\.02,-48\.22/);
  assert.equal(ms[2].audio?.mime, "audio/ogg");
  // Cancelar continua cancelando.
  assert.match((await receber(empresa.id, { id: "p4", telefone: tel, texto: "cancelar" }, { classificar: async () => null }))[0], /cancelada/i);
});

test("repasse: motorista -> passageiro (texto e áudio), uma vez só, pelo número do passageiro", async () => {
  const tel = "5511980000003";
  const corrida = crypto.randomUUID();
  const c = A.novaConversa(tel, "Rui"); c.etapa = "em_corrida";
  c.corrida = { id: corrida, os: "902", status: "a_caminho", grupo: "aberta", criadaEm: new Date(Date.now() - 60_000).toISOString() };
  A.salvarConversa(empresa.id, c);
  Chat.enviarTexto(empresa.id, corrida, "motorista", "Ana Souza", "Estou chegando, carro prata");
  const wav = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVE"), Buffer.alloc(40)]);
  Chat.enviarAudio(empresa.id, corrida, "motorista", "Ana Souza", "audio/wav", wav);
  Chat.enviarTexto(empresa.id, corrida, "passageiro", "Rui", "ok, te espero"); // do passageiro: não volta para ele
  const antes = caixaSimulada(empresa.id).length;
  await atualizarStatus(empresa.id, tel);
  const saidas = caixaSimulada(empresa.id).slice(antes).filter((m) => m.telefone === tel);
  assert.equal(saidas.length, 2);
  assert.equal(saidas[0].texto, "🚗 Ana: Estou chegando, carro prata");
  assert.match(saidas[1].texto, /^🎤 audio \(audio\/wav/);
  await atualizarStatus(empresa.id, tel);
  assert.equal(caixaSimulada(empresa.id).slice(antes).filter((m) => m.telefone === tel).length, 2, "não repete");
  Chat.enviarTexto(empresa.id, corrida, "motorista", "Ana Souza", "Cheguei");
  await atualizarStatus(empresa.id, tel);
  assert.equal(caixaSimulada(empresa.id).slice(antes).filter((m) => m.telefone === tel).at(-1)!.texto, "🚗 Ana: Cheguei");
  assert.ok(A.conversa(empresa.id, tel)!.mensagens.some((m) => m.texto === "🚗 Ana: Cheguei"), "fica no histórico da conversa");
});

test("provedores: envio de arquivo (Evolution, Z-API, Meta)", async () => {
  const bytes = Buffer.from("conteudo");
  const e = fetchFalso();
  await provedorEvolution({ urlApi: "https://wa.test", token: "t", instancia: "i1", fetch: e.f }).enviarMidia!("5511900000001", { tipo: "audio", bytes, mimetype: "audio/wav" });
  assert.equal(e.chamadas[0].url, "https://wa.test/message/sendWhatsAppAudio/i1");
  assert.deepEqual(e.chamadas[0].corpo, { number: "5511900000001", audio: bytes.toString("base64") });
  await provedorEvolution({ urlApi: "https://wa.test", token: "t", instancia: "i1", fetch: e.f }).enviarMidia!("5511900000001", { tipo: "image", bytes, mimetype: "image/png", legenda: "foto" });
  assert.equal(e.chamadas[1].url, "https://wa.test/message/sendMedia/i1");
  const z = fetchFalso();
  await provedorZapi({ urlApi: "https://z.test/instances/I", token: "tk", fetch: z.f }).enviarMidia!("5511900000001", { tipo: "audio", bytes, mimetype: "audio/wav" });
  assert.equal(z.chamadas[0].url, "https://z.test/instances/I/token/tk/send-audio");
  assert.equal((z.chamadas[0].corpo as { audio: string }).audio, `data:audio/wav;base64,${bytes.toString("base64")}`);
  const m = fetchFalso((u) => u.endsWith("/media") ? new Response(JSON.stringify({ id: "MID1" })) : undefined);
  await provedorMeta({ token: "tm", phoneId: "123456", fetch: m.f }).enviarMidia!("5511900000001", { tipo: "audio", bytes, mimetype: "audio/ogg" });
  assert.equal(m.chamadas[0].url, "https://graph.facebook.com/v20.0/123456/media");
  assert.deepEqual(m.chamadas[1].corpo, { messaging_product: "whatsapp", to: "5511900000001", type: "audio", audio: { id: "MID1" } });
});
