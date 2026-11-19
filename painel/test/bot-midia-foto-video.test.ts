// Foto e vídeo entre passageiro (WhatsApp) e motorista (chat da corrida): limites, tipos e repasse nos dois sentidos.
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DADOS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "bot-foto-video-"));
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "y".repeat(40);
process.env.APPS_FOTO_MAX_KB = "64";
process.env.APPS_VIDEO_MAX_MB = "1";
for (const k of ["ANTHROPIC_API_KEY", "GROQ_API_KEYS", "GROQ_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY"]) delete process.env[k];

const D = await import("../src/servidor/dados.ts");
const A = await import("../src/bot/armazem.ts");
const Chat = await import("../src/apps/chat.ts");
const { receber } = await import("../src/bot/fluxo.ts");
const { atualizarStatus } = await import("../src/bot/status.ts");
const { definirCorridasDoBot } = await import("../src/bot/corridas.ts");
const { caixaSimulada, provedorEvolution, provedorSimulado } = await import("../src/bot/provedores.ts");
const { lerWebhookZapi, lerWebhookMeta } = await import("../src/bot/provedores-api.ts");

const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), crypto.randomBytes(2000)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), crypto.randomBytes(500)]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]), crypto.randomBytes(5000)]);
const CORRIDA = crypto.randomUUID();
const empresa = D.criarEmpresa("Central Foto", { nomeExibido: "Central Foto", assistente: { nome: "Lia", tom: "cordial" } });
A.salvarConfig(empresa.id, { ativo: true, provedor: "simulado", instancia: "bot-foto" });
definirCorridasDoBot({
  categorias: async () => [{ id: "c1", nome: "Comum" }],
  criar: async () => ({ id: CORRIDA, os: "901" }),
  detalhar: async () => ({ status: "a_caminho", grupo: "aberta" }),
  cancelar: async () => undefined, avaliar: async () => undefined,
});

test("chat da corrida: foto e vídeo conferem tipo, começo do arquivo e tamanho", () => {
  const c = crypto.randomUUID();
  const m1 = Chat.enviarMidia(empresa.id, c, "passageiro", "Rui", "image/jpeg", JPG, " Portão <azul> ");
  assert.equal(m1.midia?.tipo, "imagem");
  assert.equal(m1.midia?.legenda, "Portão azul");
  assert.equal(Chat.enviarMidia(empresa.id, c, "motorista", "Ana", "image/png", PNG).midia?.mime, "image/png");
  assert.equal(Chat.enviarMidia(empresa.id, c, "motorista", "Ana", "video/mp4", MP4).midia?.tipo, "video");
  assert.throws(() => Chat.enviarMidia(empresa.id, c, "passageiro", "Rui", "application/pdf", JPG), /Tipo de arquivo não aceito/);
  assert.throws(() => Chat.enviarMidia(empresa.id, c, "passageiro", "Rui", "image/png", JPG), /não é uma foto válida/);
  assert.throws(() => Chat.enviarMidia(empresa.id, c, "passageiro", "Rui", "video/mp4", JPG), /não é um vídeo válido/);
  assert.throws(() => Chat.enviarMidia(empresa.id, c, "passageiro", "Rui", "image/jpeg", Buffer.alloc(0)), /vazio/);
  assert.throws(() => Chat.enviarMidia(empresa.id, c, "passageiro", "Rui", "image/jpeg", Buffer.concat([JPG, Buffer.alloc(70 * 1024)])), /Foto grande demais \(máximo 64 KB\)/);
  assert.throws(() => Chat.enviarMidia(empresa.id, c, "passageiro", "Rui", "video/mp4", Buffer.concat([MP4, Buffer.alloc(1100 * 1024)])), /Vídeo grande demais \(máximo 1 MB\)/);
  // O arquivo é da corrida certa e só serve como foto/vídeo (não como áudio).
  assert.ok(Chat.arquivoDaMidia(empresa.id, c, m1.midia!.id));
  assert.equal(Chat.arquivoDaMidia(empresa.id, crypto.randomUUID(), m1.midia!.id), null);
  assert.equal(Chat.arquivoDoAudio(empresa.id, c, m1.midia!.id), null);
  assert.equal(Chat.resumoDaMensagem(m1), "Foto");
  assert.equal(Chat.mensagens(empresa.id, c).length, 3);
});

test("provedores traduzem foto e vídeo recebidos (simulado, Evolution, Z-API e Meta)", () => {
  const sim = provedorSimulado(empresa.id).lerWebhook({ telefone: "5511970000001", midia: { tipo: "imagem", base64: JPG.toString("base64"), mimetype: "image/jpeg", legenda: "olha" } });
  assert.equal(sim[0].midia?.tipo, "imagem");
  assert.equal(sim[0].midia?.legenda, "olha");
  const evo = provedorEvolution({ urlApi: "https://wa.test", token: "t", instancia: "i" }).lerWebhook({
    event: "messages.upsert", data: { key: { remoteJid: "5511970000001@s.whatsapp.net", id: "E1" }, message: { videoMessage: { mimetype: "video/mp4", caption: "veja" }, base64: "AAAA" } },
  });
  assert.equal(evo[0].midia?.tipo, "video");
  assert.equal(evo[0].midia?.base64, "AAAA");
  const z = lerWebhookZapi({ type: "ReceivedCallback", phone: "5511970000001", messageId: "Z1", image: { imageUrl: "https://z.test/f.jpg", mimeType: "image/jpeg", caption: "foto" } });
  assert.equal(z[0].midia?.url, "https://z.test/f.jpg");
  const meta = lerWebhookMeta({ entry: [{ changes: [{ value: { messages: [{ id: "M1", from: "5511970000001", timestamp: String(Math.floor(Date.now() / 1000)), type: "video", video: { id: "MEDIA9", mime_type: "video/mp4" } }] } }] }] });
  assert.equal(meta[0].midia?.id, "MEDIA9");
  assert.equal(meta[0].midia?.tipo, "video");
});

const preparar = (tel: string, status: string, corrida = CORRIDA) => {
  const c = A.novaConversa(tel, "Rui"); c.etapa = "em_corrida";
  c.corrida = { id: corrida, os: "901", status, grupo: "aberta", criadaEm: new Date(Date.now() - 60_000).toISOString() };
  A.salvarConversa(empresa.id, c);
};
const midia = (tipo: "imagem" | "video", bytes: Buffer, mimetype: string, legenda?: string) => ({ tipo, base64: bytes.toString("base64"), mimetype, ...(legenda ? { legenda } : {}) });
const dele = (extra: Record<string, unknown>, id: string, tel: string) => receber(empresa.id, { id, telefone: tel, nome: "Rui", ...extra } as never, { classificar: async () => null });

test("passageiro -> motorista: foto e vídeo vão ao chat com motorista a caminho; recusa tem motivo; sem motorista o bot explica", async () => {
  const tel = "5511970000002";
  // Procurando motorista: ninguém para ver, o bot explica.
  preparar(tel, "procurando");
  const r0 = await dele({ midia: midia("imagem", JPG, "image/jpeg") }, "f0", tel);
  assert.match(r0[0], /durante a corrida/);
  assert.equal(Chat.mensagens(empresa.id, CORRIDA).length, 0);

  preparar(tel, "a_caminho");
  const r1 = await dele({ midia: midia("imagem", JPG, "image/jpeg", "estou de camisa vermelha") }, "f1", tel);
  assert.match(r1[0], /chega ao motorista/);
  const r2 = await dele({ midia: midia("video", MP4, "video/mp4") }, "f2", tel);
  assert.deepEqual(r2, [], "sem aviso repetido");
  const ms = Chat.mensagens(empresa.id, CORRIDA);
  assert.equal(ms.length, 2);
  assert.deepEqual(ms.map((m) => m.de), ["passageiro", "passageiro"]);
  assert.equal(ms[0].midia?.tipo, "imagem");
  assert.equal(ms[0].midia?.legenda, "estou de camisa vermelha");
  assert.equal(ms[1].midia?.tipo, "video");
  // Foto grande demais e tipo não aceito voltam com o motivo (nada vai ao chat).
  const grande = await dele({ midia: midia("imagem", Buffer.concat([JPG, Buffer.alloc(70 * 1024)]), "image/jpeg") }, "f3", tel);
  assert.match(grande[0], /Foto grande demais/);
  assert.match(grande[0], /JPG, PNG, WEBP/);
  const gif = await dele({ midia: midia("imagem", JPG, "image/gif") }, "f4", tel);
  assert.match(gif[0], /Tipo de arquivo não aceito/);
  assert.equal(Chat.mensagens(empresa.id, CORRIDA).length, 2);
  // No histórico da conversa aparece como foto/vídeo, não como mensagem vazia.
  const hist = A.conversa(empresa.id, tel)!.mensagens.filter((m) => m.de === "passageiro").map((m) => m.texto);
  assert.ok(hist.includes("🖼️ Foto: estou de camisa vermelha"));
  assert.ok(hist.includes("🎬 Vídeo"));
});

test("sem corrida, foto com legenda vale como texto e foto sem legenda recebe a explicação", async () => {
  const tel = "5511970000003";
  const r = await dele({ midia: midia("imagem", JPG, "image/jpeg", "oi") }, "g1", tel);
  assert.match(r[0], /Solicitar corrida/, "a legenda 'oi' abriu o menu");
  const s = await dele({ midia: midia("video", MP4, "video/mp4") }, "g2", tel);
  assert.match(s[0], /Só consigo encaminhar foto e vídeo ao motorista durante a corrida/);
});

test("motorista -> passageiro: foto e vídeo saem pelo WhatsApp com legenda, uma vez só", async () => {
  const tel = "5511970000004";
  const corrida = crypto.randomUUID();
  preparar(tel, "a_caminho", corrida);
  Chat.enviarMidia(empresa.id, corrida, "motorista", "Ana Souza", "image/jpeg", JPG, "Meu carro");
  Chat.enviarMidia(empresa.id, corrida, "motorista", "Ana Souza", "video/mp4", MP4);
  Chat.enviarMidia(empresa.id, corrida, "passageiro", "Rui", "image/jpeg", JPG); // do passageiro: não volta para ele
  const antes = caixaSimulada(empresa.id).length;
  await atualizarStatus(empresa.id, tel);
  const saidas = caixaSimulada(empresa.id).slice(antes).filter((m) => m.telefone === tel);
  assert.equal(saidas.length, 2);
  assert.match(saidas[0].texto, /^🖼️ image \(image\/jpeg, \d+ bytes\)\nMeu carro$/);
  assert.match(saidas[1].texto, /^🎬 video \(video\/mp4, \d+ bytes\)$/);
  await atualizarStatus(empresa.id, tel);
  assert.equal(caixaSimulada(empresa.id).slice(antes).filter((m) => m.telefone === tel).length, 2, "não repete");
  const hist = A.conversa(empresa.id, tel)!.mensagens.map((m) => m.texto);
  assert.ok(hist.includes("🖼️ Foto do motorista: Meu carro"));
  assert.ok(hist.includes("🎬 Vídeo do motorista"));
});
