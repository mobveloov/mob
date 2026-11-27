// Voz dos apps gerada no servidor: rota pública (GET/POST), mp3, limite por IP, cache em disco por hash, motor falso, texto longo, config.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-voz-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "p".repeat(40);
delete process.env.BANCO_ARQUIVO;
process.env.APPS_VOZ_POR_IP = "1000";
process.env.APPS_VOZ_NOVAS_POR_IP = "1000";

const express = (await import("express")).default;
const D = await import("../src/servidor/dados.ts");
const B = await import("../src/servidor/banco.ts");
const { criarCookie, exigirLogin } = await import("../src/servidor/sessao.ts");
const { rotasConfig } = await import("../src/config/rotas.ts");
const { rotasApps } = await import("../src/apps/rotas.ts");
const V = await import("../src/apps/voz.ts");
const { dadosParaOApp } = await import("../src/config/personalizacao.ts");
const { dadosParaOAppMotorista } = await import("../src/config/personalizacao-motorista.ts");
const { sanearVoz, FRASES_FIXAS, vozDoApp } = await import("../src/config/voz-app.ts");

const app = express();
app.use(express.json({ limit: "1mb" }));
app.post("/teste/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({ ok: true }); });
app.use("/api/apps", rotasApps);
app.use("/api", exigirLogin);
app.use("/api/config", rotasConfig);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => { V.definirMotoresVoz(null); servidor.closeAllConnections(); servidor.close(); B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

const E = D.criarEmpresa("Voz Um");
const adm = D.criarUsuario({ email: "adm@voz.test", nome: "Adm", senha: "senha-forte-1", empresaId: E.id, papel: "admin" });
const op = D.criarUsuario({ email: "op@voz.test", nome: "Op", senha: "senha-forte-1", empresaId: E.id, papel: "operador" });
const entrar = async (id: string) => (await fetch(`${base}/teste/entrar/${id}`, { method: "POST" })).headers.get("set-cookie")!.split(";")[0];
const cAdm = await entrar(adm.id), cOp = await entrar(op.id);

// Motor falso: devolve bytes que começam como um mp3 e conta as chamadas.
const MP3 = (t: string) => Buffer.concat([Buffer.from([0xff, 0xf3, 0x64, 0xc4]), Buffer.from(t)]);
let chamadas: Array<{ texto: string; genero: string; velocidade: number }> = [];
let falhar = false;
const falso = (id: "gemini" | "edge", disponivel = true): import("../src/apps/voz.ts").Motor => ({
  id, disponivel: () => disponivel,
  async gerar(p) { chamadas.push({ texto: p.texto, genero: p.genero, velocidade: p.velocidade }); if (falhar) throw new Error("falha"); return MP3(`${id}:${p.texto}`); },
});
const usar = (...m: Array<import("../src/apps/voz.ts").Motor>) => { V.definirMotoresVoz(m); chamadas = []; falhar = false; };

const q = (o: Record<string, string>) => new URLSearchParams(o).toString();
const pedir = (o: Record<string, string>) => fetch(`${base}/api/apps/${E.id}/voz?${q(o)}`);
const painel = (cookie: string, metodo: string, url: string, corpo?: unknown) =>
  fetch(`${base}/api/config${url}`, { method: metodo, headers: { cookie, "content-type": "application/json" }, body: corpo === undefined ? undefined : JSON.stringify(corpo) })
    .then(async (r) => ({ status: r.status, corpo: (await r.json().catch(() => ({}))) as Record<string, any> }));
const limparCache = () => fs.rmSync(path.join(DADOS, "empresas", E.id, "apps", "voz"), { recursive: true, force: true });

test("GET devolve mp3 com cabeçalhos de cache e gera a frase uma vez só (cache em disco)", async () => {
  usar(falso("edge")); limparCache();
  const a = await pedir({ texto: "Seu motorista está a caminho." });
  assert.equal(a.status, 200);
  assert.equal(a.headers.get("content-type"), "audio/mpeg");
  assert.equal(a.headers.get("x-voz-motor"), "edge");
  assert.match(a.headers.get("cache-control") ?? "", /max-age=\d+/);
  const etag = a.headers.get("etag")!;
  assert.ok(etag);
  assert.deepEqual([...Buffer.from(await a.arrayBuffer()).subarray(0, 3)], [0xff, 0xf3, 0x64]);
  const b = await pedir({ texto: "Seu motorista está a caminho." });
  assert.equal(b.status, 200);
  assert.equal(b.headers.get("x-voz-motor"), "cache");
  assert.equal(chamadas.length, 1, "o motor só roda na primeira vez");
  const c = await fetch(`${base}/api/apps/${E.id}/voz?${q({ texto: "Seu motorista está a caminho." })}`, { headers: { "if-none-match": etag } });
  assert.equal(c.status, 304);
  const arquivos = fs.readdirSync(path.join(DADOS, "empresas", E.id, "apps", "voz"));
  assert.equal(arquivos.length, 1);
  assert.match(arquivos[0], /^[0-9a-f]{40}\.mp3$/);
});

test("o cache é por texto + voz + velocidade (e muda com o texto)", async () => {
  usar(falso("edge")); limparCache();
  await pedir({ texto: "Olá" }); await pedir({ texto: "Olá" });
  await pedir({ texto: "Olá", voz: "masculina" }); await pedir({ texto: "Olá", velocidade: "1.2" }); await pedir({ texto: "Tchau" });
  assert.equal(chamadas.length, 4);
  assert.equal(chamadas[1].genero, "masculina");
  assert.equal(chamadas[2].velocidade, 1.2);
  assert.equal(fs.readdirSync(path.join(DADOS, "empresas", E.id, "apps", "voz")).length, 4);
  assert.notEqual(V.hashVoz("a", "feminina", 1, "auto"), V.hashVoz("a", "masculina", 1, "auto"));
  assert.notEqual(V.hashVoz("a", "feminina", 1, "auto"), V.hashVoz("a", "feminina", 1.1, "auto"));
});

test("POST equivale ao GET", async () => {
  usar(falso("edge")); limparCache();
  const r = await fetch(`${base}/api/apps/${E.id}/voz`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ texto: "Corrida finalizada.", voz: "masculina", velocidade: 0.9 }) });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "audio/mpeg");
  assert.deepEqual(chamadas, [{ texto: "Corrida finalizada.", genero: "masculina", velocidade: 0.9 }]);
});

test("texto vazio = 400; texto acima de 200 caracteres = 413 e o motor nem é chamado", async () => {
  usar(falso("edge"));
  assert.equal((await pedir({ texto: "   " })).status, 400);
  assert.equal((await pedir({})).status, 400);
  assert.equal((await pedir({ texto: "a".repeat(200) })).status, 200);
  const longo = await pedir({ texto: "a".repeat(201) });
  assert.equal(longo.status, 413);
  assert.match(((await longo.json()) as { erro: string }).erro, /200/);
  const post = await fetch(`${base}/api/apps/${E.id}/voz`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ texto: "b".repeat(5000) }) });
  assert.equal(post.status, 413);
  assert.equal(chamadas.length, 1);
});

test("sem path traversal: texto e voz esquisitos só viram hash; empresa inexistente ou inválida = 404", async () => {
  usar(falso("edge")); limparCache();
  const r = await pedir({ texto: "../../../etc/passwd", voz: "../../x" });
  assert.equal(r.status, 200);
  assert.equal(chamadas[0].genero, "feminina");
  const pasta = path.join(DADOS, "empresas", E.id, "apps", "voz");
  for (const n of fs.readdirSync(pasta)) assert.match(n, /^[0-9a-f]{40}\.mp3$/);
  assert.equal((await fetch(`${base}/api/apps/nao-existe/voz?texto=oi`)).status, 404);
  assert.equal((await fetch(`${base}/api/apps/..%2F..%2Fx/voz?texto=oi`)).status, 404);
});

test("sem nenhum motor: 503 com motivo; motor que falha cai para o seguinte; falha total = 503", async () => {
  usar(falso("gemini", false), falso("edge", false)); limparCache();
  const a = await pedir({ texto: "Sem motor" });
  assert.equal(a.status, 503);
  assert.equal(((await a.json()) as { motivo: string }).motivo, "sem_motor");
  const ruim: import("../src/apps/voz.ts").Motor = { id: "gemini", disponivel: () => true, async gerar() { throw new Error("cota"); } };
  usar(ruim, falso("edge"));
  const b = await pedir({ texto: "Cai para o Edge" });
  assert.equal(b.status, 200);
  assert.equal(b.headers.get("x-voz-motor"), "edge");
  usar(ruim, { ...falso("edge"), async gerar() { throw new Error("sem rede"); } });
  assert.equal((await pedir({ texto: "Tudo falha" })).status, 503);
  assert.equal(fs.existsSync(path.join(DADOS, "empresas", E.id, "apps", "voz")) ? fs.readdirSync(path.join(DADOS, "empresas", E.id, "apps", "voz")).length : 0, 1, "falha não grava no cache");
});

test("limite por IP: frases novas demais = 429 (o cache continua saindo) e pedidos demais = 429 com Retry-After", async () => {
  usar(falso("edge"));
  // o limite é por empresa + IP e a janela é de 10 min: cada parte usa uma empresa nova para começar do zero
  const E2 = D.criarEmpresa("Voz Dois"), E3 = D.criarEmpresa("Voz Tres");
  const ped = (id: string, texto: string) => fetch(`${base}/api/apps/${id}/voz?${q({ texto })}`);
  process.env.APPS_VOZ_NOVAS_POR_IP = "2";
  try {
    assert.equal((await ped(E2.id, "um")).status, 200);
    assert.equal((await ped(E2.id, "dois")).status, 200);
    const t = await ped(E2.id, "tres");
    assert.equal(t.status, 429);
    assert.ok(t.headers.get("retry-after"));
    assert.equal((await ped(E2.id, "um")).status, 200, "cache não conta como geração");
  } finally { process.env.APPS_VOZ_NOVAS_POR_IP = "1000"; }
  process.env.APPS_VOZ_POR_IP = "3";
  try {
    const ir = () => ped(E3.id, "oi").then((r) => r.status);
    assert.deepEqual([await ir(), await ir(), await ir(), await ir()], [200, 200, 200, 429]);
  } finally { process.env.APPS_VOZ_POR_IP = "1000"; }
});

test("vários pedidos juntos da mesma frase geram uma vez só", async () => {
  usar(falso("edge")); limparCache();
  const rs = await Promise.all([1, 2, 3, 4, 5].map(() => pedir({ texto: "Frase concorrente" })));
  assert.ok(rs.every((r) => r.status === 200));
  assert.equal(chamadas.length, 1);
});

test("config: padrão, saneamento, salvar na personalização e JSON público dos dois apps", async () => {
  assert.deepEqual(sanearVoz(undefined), { ligada: true, motor: "auto", genero: "feminina", velocidade: 1 });
  assert.deepEqual(sanearVoz({ ligada: false, motor: "xx", genero: "masculina", velocidade: 9 }), { ligada: false, motor: "auto", genero: "masculina", velocidade: 1.5 });
  assert.equal(sanearVoz({ velocidade: "0,3" }).velocidade, 0.7, "vírgula vira ponto e o mínimo vale");
  assert.equal(sanearVoz({ velocidade: 0.1 }).velocidade, 0.7);
  assert.equal(sanearVoz({ velocidade: 1.234 }).velocidade, 1.25);
  const pass = dadosParaOApp(E.id).voz as Record<string, any>;
  assert.equal(pass.url, `/api/apps/${E.id}/voz`);
  assert.equal(pass.app, "passageiro");
  assert.equal(pass.ligada, true);
  assert.equal(pass.maxCaracteres, 200);
  assert.equal(pass.formato, "audio/mpeg");
  const atual = (await painel(cAdm, "GET", "/personalizacao")).corpo;
  const r = await painel(cAdm, "PUT", "/personalizacao", { ...atual, voz: { ligada: true, motor: "edge", genero: "masculina", velocidade: 1.1 } });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.deepEqual(r.corpo.voz, { ligada: true, motor: "edge", genero: "masculina", velocidade: 1.1 });
  assert.equal((dadosParaOApp(E.id).voz as Record<string, any>).genero, "masculina");
  assert.equal(vozDoApp(E.id, "passageiro").motor, "edge");
  assert.equal(vozDoApp(E.id, "motorista").genero, "feminina", "cada app tem a sua voz");
  const m = (await painel(cAdm, "GET", "/personalizacao-motorista")).corpo;
  const rm = await painel(cAdm, "PUT", "/personalizacao-motorista", { ...m, voz: { ligada: false, motor: "gemini", genero: "feminina", velocidade: 0.9 } });
  assert.equal(rm.status, 200, JSON.stringify(rm.corpo));
  const pub = dadosParaOAppMotorista(E.id).voz as Record<string, any>;
  assert.equal(pub.ligada, false); assert.equal(pub.motor, "gemini"); assert.equal(pub.app, "motorista");
  assert.equal(vozDoApp(E.id, "passageiro").genero, "masculina");
});

test("config manda: voz desligada = 204; motor escolhido restringe; voz/velocidade padrão vêm da config", async () => {
  usar(falso("gemini"), falso("edge")); limparCache();
  // motorista está desligado (teste anterior)
  const d = await fetch(`${base}/api/apps/${E.id}/voz?${q({ texto: "Chegando", app: "motorista" })}`);
  assert.equal(d.status, 204);
  assert.equal(chamadas.length, 0);
  // passageiro: motor edge, masculina, 1.1
  const r = await pedir({ texto: "Config manda" });
  assert.equal(r.headers.get("x-voz-motor"), "edge");
  assert.deepEqual(chamadas, [{ texto: "Config manda", genero: "masculina", velocidade: 1.1 }]);
  // motor gemini sem a chave disponível = 503 (não cai para o Edge de propósito)
  usar(falso("gemini", false), falso("edge"));
  const m = (await painel(cAdm, "GET", "/personalizacao")).corpo;
  await painel(cAdm, "PUT", "/personalizacao", { ...m, voz: { ...m.voz, motor: "gemini" } });
  assert.equal((await pedir({ texto: "So gemini" })).status, 503);
  await painel(cAdm, "PUT", "/personalizacao", { ...m, voz: { ...m.voz, motor: "auto" } });
  assert.equal((await pedir({ texto: "So gemini" })).headers.get("x-voz-motor"), "edge", "automático cai para o Edge");
});

test("pré-geração das frases fixas: rota de gestor, só gestor, cache reaproveitado", async () => {
  usar(falso("edge")); limparCache();
  const m = (await painel(cAdm, "GET", "/personalizacao-motorista")).corpo;
  await painel(cAdm, "PUT", "/personalizacao-motorista", { ...m, voz: { ...m.voz, ligada: true, motor: "auto" } });
  const aguardado = await painel(cAdm, "POST", "/voz/pre-gerar", { app: "passageiro", aguardar: true });
  assert.equal(aguardado.status, 200);
  assert.equal(aguardado.corpo.total, FRASES_FIXAS.passageiro.length);
  assert.equal(aguardado.corpo.geradas, FRASES_FIXAS.passageiro.length);
  const outra = await painel(cAdm, "POST", "/voz/pre-gerar", { app: "passageiro", aguardar: true });
  assert.equal(outra.corpo.jaNoCache, FRASES_FIXAS.passageiro.length);
  assert.equal(outra.corpo.geradas, 0);
  const antes = chamadas.length;
  assert.equal((await pedir({ texto: "Seu motorista está a caminho." })).headers.get("x-voz-motor"), "cache");
  assert.equal(chamadas.length, antes);
  assert.equal((await painel(cOp, "POST", "/voz/pre-gerar", { aguardar: true })).status, 403);
  const bg = await painel(cAdm, "POST", "/voz/pre-gerar", { app: "motorista" });
  assert.equal(bg.status, 202);
});

test("pré-geração sem motor não lança, para cedo e relata as falhas", async () => {
  usar({ ...falso("edge"), async gerar() { throw new Error("sem rede"); } }); limparCache();
  const r = await V.preGerarFrases(E.id, "motorista");
  assert.equal(r.total, FRASES_FIXAS.motorista.length);
  assert.equal(r.falhas, r.total);
  assert.equal(r.geradas, 0);
});

test("salvar a voz na Personalização dispara a pré-geração em segundo plano, sem segurar a resposta", async () => {
  usar(falso("edge")); limparCache();
  const m = (await painel(cAdm, "GET", "/personalizacao")).corpo;
  const novaVel = m.voz.velocidade === 0.8 ? 0.85 : 0.8;
  const r = await painel(cAdm, "PUT", "/personalizacao", { ...m, voz: { ...m.voz, velocidade: novaVel } });
  assert.equal(r.status, 200);
  for (let i = 0; i < 60 && chamadas.length < FRASES_FIXAS.passageiro.length; i++) await new Promise((ok) => setTimeout(ok, 50));
  assert.equal(chamadas.length, FRASES_FIXAS.passageiro.length);
  assert.ok(chamadas.every((c) => c.velocidade === novaVel));
});

test("WAV (como o Gemini devolve) vira MP3 de verdade", async () => {
  const { pcmToWav } = await import("../src/bot/voz-gemini.ts");
  const pcm = new Uint8Array(24000 * 2); // 1 s de silêncio com um tom simples
  const v = new DataView(pcm.buffer);
  for (let i = 0; i < 24000; i++) v.setInt16(i * 2, Math.round(Math.sin(i / 10) * 8000), true);
  const mp3 = await V.wavParaMp3(Buffer.from(pcmToWav(pcm, 24000)));
  assert.ok(mp3.length > 1000 && mp3.length < pcm.length);
  assert.equal(mp3[0], 0xff);
  await assert.rejects(() => V.wavParaMp3(Buffer.from("isto não é wav".repeat(10))));
});

test("motor Gemini real com fetch falso: chama gemini-*-tts com a chave da empresa e entrega mp3", async () => {
  V.definirMotoresVoz(null); limparCache();
  const { pcmToWav } = await import("../src/bot/voz-gemini.ts");
  const pcm = new Uint8Array(24000); for (let i = 0; i < 12000; i++) new DataView(pcm.buffer).setInt16(i * 2, Math.round(Math.sin(i / 8) * 6000), true);
  const wav = Buffer.from(pcmToWav(pcm, 24000)).toString("base64");
  const vistos: Array<{ url: string; chave: string; corpo: any }> = [];
  V.definirFetchVoz((async (url: string, init: RequestInit) => {
    vistos.push({ url: String(url), chave: String((init.headers as Record<string, string>)["x-goog-api-key"]), corpo: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/L16;rate=24000", data: wav } }] } }] }), { status: 200 });
  }) as unknown as typeof fetch);
  const seg = D.segredos(E.id);
  D.salvarSegredos(E.id, { ...seg, ia: { ...seg.ia, GEMINI_API_KEY: "chave-de-teste-gemini" } });
  const m = (await painel(cAdm, "GET", "/personalizacao")).corpo;
  await painel(cAdm, "PUT", "/personalizacao", { ...m, voz: { ligada: true, motor: "gemini", genero: "feminina", velocidade: 1 } });
  await new Promise((ok) => setTimeout(ok, 1500)); // a pré-geração em segundo plano termina antes
  try {
    const r = await pedir({ texto: "Teste do Gemini" });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("x-voz-motor"), "gemini");
    const corpo = Buffer.from(await r.arrayBuffer());
    assert.equal(corpo[0], 0xff, "mp3, não wav");
    const v0 = vistos.find((x) => /Teste do Gemini$/.test(x.corpo.contents[0].parts[0].text));
    assert.ok(v0, "pediu a frase ao Gemini");
    assert.match(v0.url, /models\/gemini-[^/]*tts[^/]*:generateContent/);
    assert.equal(v0.chave, "chave-de-teste-gemini");
    assert.equal(v0.corpo.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, "Kore");
    assert.match(v0.corpo.contents[0].parts[0].text, /Teste do Gemini$/);
  } finally { V.definirFetchVoz(null); D.salvarSegredos(E.id, seg); }
});
