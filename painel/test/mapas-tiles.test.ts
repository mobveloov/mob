// Proxy de mapas: o servidor fala com o provedor (aqui, um servidor falso), guarda cópia em disco e respeita limites.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-mapas-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "f".repeat(40);
delete process.env.BANCO_ARQUIVO;

// ---- provedor falso
const PNG = (n: number) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(n, 7)]);
const pedidosAoProvedor: Array<{ url: string; ua: string; referer: string }> = [];
let modo: "ok" | "403" | "429" | "500" | "lixo" = "ok", atraso = 0, simultaneos = 0, maxSimultaneos = 0, tamanhoTile = 200;
const origem = http.createServer((req, res) => {
  pedidosAoProvedor.push({ url: req.url ?? "", ua: String(req.headers["user-agent"] ?? ""), referer: String(req.headers.referer ?? "") });
  simultaneos++; maxSimultaneos = Math.max(maxSimultaneos, simultaneos);
  setTimeout(() => {
    simultaneos--;
    if (modo === "403") { res.statusCode = 403; return res.end("Access blocked"); }
    if (modo === "429") { res.statusCode = 429; return res.end("slow down"); }
    if (modo === "500") { res.statusCode = 500; return res.end("erro"); }
    if (modo === "lixo") { res.setHeader("content-type", "text/html"); return res.end("<html>oi</html>"); }
    res.setHeader("content-type", "image/png"); res.end(PNG(tamanhoTile));
  }, atraso);
});
await new Promise<void>((ok) => origem.listen(0, "127.0.0.1", ok));
process.env.MAPA_ORIGEM_URL = `http://127.0.0.1:${(origem.address() as AddressInfo).port}/{estilo}/{z}/{x}/{y}.png`;

const express = (await import("express")).default;
const D = await import("../src/servidor/dados.ts");
const { rotasMapa, zerarMapasParaTeste, estatisticas, urlDeOrigem } = await import("../src/servidor/mapas-tiles.ts");
const { salvarConfigMapas, visaoMapas, identificacao, provedorEfetivo } = await import("../src/config/mapas.ts");

const app = express();
app.use("/api/mapa", rotasMapa);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api/mapa`;
test.after(() => { servidor.closeAllConnections(); servidor.close(); origem.closeAllConnections(); origem.close(); fs.rmSync(DADOS, { recursive: true, force: true }); });

const E = D.criarEmpresa("Rota Fácil", { produto: "Painel Rota Fácil" }).id;
D.salvarMarca(E, { ...D.marca(E), textos: { ...D.marca(E).textos, suporteEmail: "suporte@rotafacil.test" }, app: { ...D.marca(E).app, urlPainel: "https://painel.rotafacil.test/" } });
const pedir = (caminho: string) => fetch(`${base}/${caminho}`);
const limpar = () => { zerarMapasParaTeste(); pedidosAoProvedor.length = 0; modo = "ok"; atraso = 0; maxSimultaneos = 0; tamanhoTile = 200; fs.rmSync(path.join(DADOS, "cache-tiles"), { recursive: true, force: true }); delete process.env.MAPA_LIMITE_IP; delete process.env.MAPA_CACHE_MB; delete process.env.MAPA_CACHE_DIAS; };

test("o servidor se identifica com o produto e o contato da marca, e manda o Referer", async () => {
  limpar();
  const r = await pedir(`${E}/tiles/claro/5/10/12.png`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "image/png");
  assert.equal(r.headers.get("x-mapa-origem"), "origem");
  assert.equal(pedidosAoProvedor.length, 1);
  assert.equal(pedidosAoProvedor[0].ua, "Painel Rota Facil painel (suporte@rotafacil.test)");
  assert.equal(pedidosAoProvedor[0].referer, "https://painel.rotafacil.test/");
  assert.equal(pedidosAoProvedor[0].url, "/claro/5/10/12.png");
});

test("sem contato configurado o código não inventa e-mail algum", () => {
  const sem = D.criarEmpresa("Sem Contato").id;
  const ua = identificacao(sem);
  assert.equal(ua.temContato, false);
  assert.ok(!ua.agente.includes("@"));
  assert.match(ua.agente, /painel$/);
});

test("o segundo pedido vem da cópia em disco, sem ir ao provedor", async () => {
  limpar();
  const a = await pedir(`${E}/tiles/claro/6/20/30.png`);
  const b = await pedir(`${E}/tiles/claro/6/20/30.png`);
  assert.equal(a.headers.get("x-mapa-origem"), "origem");
  assert.equal(b.headers.get("x-mapa-origem"), "cache");
  assert.deepEqual(Buffer.from(await b.arrayBuffer()), PNG(200));
  assert.equal(pedidosAoProvedor.length, 1);
  assert.ok(fs.existsSync(path.join(DADOS, "cache-tiles", "osm", "claro", "6", "20", "30.bin")));
});

test("pedidos iguais ao mesmo tempo viram um só no provedor", async () => {
  limpar(); atraso = 120;
  const rs = await Promise.all(Array.from({ length: 8 }, () => pedir(`${E}/tiles/claro/4/3/3.png`)));
  assert.ok(rs.every((r) => r.status === 200));
  assert.equal(pedidosAoProvedor.length, 1);
});

test("no máximo 2 conexões ao mesmo tempo com o provedor", async () => {
  limpar(); atraso = 60;
  const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => pedir(`${E}/tiles/claro/8/${i}/1.png`)));
  assert.ok(rs.every((r) => r.status === 200));
  assert.equal(pedidosAoProvedor.length, 10);
  assert.ok(maxSimultaneos <= 2, `chegou a ${maxSimultaneos} conexões`);
});

test("provedor que bloqueia (403): erro claro e pausa, sem insistir", async () => {
  limpar(); modo = "403";
  const a = await pedir(`${E}/tiles/claro/7/1/1.png`);
  assert.equal(a.status, 502);
  assert.match(((await a.json()) as { erro: string }).erro, /bloqueou/);
  const b = await pedir(`${E}/tiles/claro/7/2/2.png`);
  assert.equal(b.status, 502);
  assert.equal(pedidosAoProvedor.length, 1, "na pausa não vai de novo ao provedor");
  assert.equal(b.headers.get("cache-control"), "no-store");
  modo = "ok";
});

test("429 também pausa; resposta que não é imagem é recusada e não vai para a cópia", async () => {
  limpar(); modo = "429";
  assert.equal((await pedir(`${E}/tiles/claro/7/3/3.png`)).status, 502);
  limpar(); modo = "lixo";
  assert.equal((await pedir(`${E}/tiles/claro/7/4/4.png`)).status, 502);
  assert.ok(!fs.existsSync(path.join(DADOS, "cache-tiles")) || listar(path.join(DADOS, "cache-tiles")).length === 0);
});

function listar(d: string): string[] { return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listar(path.join(d, e.name)) : [path.join(d, e.name)])); }

test("com o provedor fora do ar, serve a cópia vencida", async () => {
  limpar(); process.env.MAPA_CACHE_DIAS = "0.0000001";
  assert.equal((await pedir(`${E}/tiles/claro/9/5/5.png`)).status, 200);
  await new Promise((ok) => setTimeout(ok, 30));
  modo = "500";
  const r = await pedir(`${E}/tiles/claro/9/5/5.png`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("x-mapa-origem"), "cache-vencida");
  assert.equal(estatisticas.falhas, 1);
});

test("a cópia em disco tem teto de tamanho: apaga as mais antigas", async () => {
  limpar(); process.env.MAPA_CACHE_MB = "0.001"; tamanhoTile = 300; // ~1 KB
  for (let i = 0; i < 8; i++) { assert.equal((await pedir(`${E}/tiles/claro/10/${i}/0.png`)).status, 200); await new Promise((ok) => setTimeout(ok, 5)); }
  const arqs = listar(path.join(DADOS, "cache-tiles"));
  const bytes = arqs.reduce((s, a) => s + fs.statSync(a).size, 0);
  assert.ok(bytes <= 1048, `ficou com ${bytes} bytes`);
  assert.ok(arqs.length >= 1 && arqs.length < 8);
  assert.ok(arqs.some((a) => a.endsWith(path.join("10", "7", "0.bin"))), "a mais nova fica");
});

test("limite por IP devolve 429", async () => {
  limpar(); process.env.MAPA_LIMITE_IP = "3";
  const st: number[] = [];
  for (let i = 0; i < 5; i++) st.push((await pedir(`${E}/tiles/claro/3/1/1.png`)).status);
  assert.deepEqual(st, [200, 200, 200, 429, 429]);
});

test("pedido inválido e empresa inexistente", async () => {
  limpar();
  assert.equal((await pedir(`${E}/tiles/claro/25/1/1.png`)).status, 400);
  assert.equal((await pedir(`${E}/tiles/claro/2/9/1.png`)).status, 400);
  assert.equal((await pedir(`${E}/tiles/claro/2/1/-1.png`)).status, 400);
  assert.equal((await pedir(`${E}/tiles/estranho/2/1/1.png`)).status, 400);
  assert.equal((await pedir(`../../x/tiles/claro/2/1/1.png`)).status, 404);
  assert.equal((await pedir(`inexistente/tiles/claro/2/1/1.png`)).status, 404);
  assert.equal(pedidosAoProvedor.length, 0);
});

test("no OpenStreetMap o escuro usa o mesmo tile do claro (o filtro é no navegador)", async () => {
  limpar();
  await pedir(`${E}/tiles/claro/5/1/1.png`);
  const r = await pedir(`${E}/tiles/escuro/5/1/1.png`);
  assert.equal(r.headers.get("x-mapa-origem"), "cache");
  assert.equal(pedidosAoProvedor.length, 1);
});

test("config pública não expõe segredo; provedor com chave sem chave cai para o OpenStreetMap", async () => {
  limpar();
  assert.deepEqual(await (await pedir(`${E}/config`)).json(), { provedor: "osm", atribuicao: "© OpenStreetMap", atribuicaoSatelite: "Imagens © Esri", escuroComFiltro: true });
  salvarConfigMapas(E, { provedor: "maptiler" });
  assert.equal(provedorEfetivo(E), "osm");
  salvarConfigMapas(E, { provedor: "maptiler", chave: "CHAVE-SECRETA-123" });
  assert.equal(provedorEfetivo(E), "maptiler");
  const publica = JSON.stringify(await (await pedir(`${E}/config`)).json());
  assert.ok(!publica.includes("CHAVE-SECRETA"));
  const v = visaoMapas(E);
  assert.equal(v.chave, "••••••");
  assert.ok(!JSON.stringify(v).includes("CHAVE-SECRETA"));
  // salvar com a máscara não apaga a chave; vazio apaga
  salvarConfigMapas(E, { provedor: "maptiler", chave: "••••••" });
  assert.equal(provedorEfetivo(E), "maptiler");
  salvarConfigMapas(E, { provedor: "carto", chave: "" });
  assert.equal(provedorEfetivo(E), "carto");
});

test("endereços de origem de cada provedor (sem o servidor falso)", () => {
  const guardado = process.env.MAPA_ORIGEM_URL; delete process.env.MAPA_ORIGEM_URL;
  try {
    assert.equal(urlDeOrigem("osm", "claro", 3, 1, 2, ""), "https://tile.openstreetmap.org/3/1/2.png");
    assert.match(urlDeOrigem("carto", "escuro", 3, 1, 2, ""), /^https:\/\/[a-d]\.basemaps\.cartocdn\.com\/rastertiles\/dark_all\/3\/1\/2\.png$/);
    assert.match(urlDeOrigem("carto", "claro", 3, 1, 2, ""), /rastertiles\/voyager\/3\/1\/2\.png$/);
    assert.equal(urlDeOrigem("maptiler", "claro", 3, 1, 2, "K1"), "https://api.maptiler.com/maps/streets-v2/3/1/2.png?key=K1");
    assert.equal(urlDeOrigem("stadia", "escuro", 3, 1, 2, "K2"), "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/3/1/2.png?api_key=K2");
    assert.match(urlDeOrigem("carto", "satelite", 3, 1, 2, ""), /arcgisonline\.com.*\/tile\/3\/2\/1$/);
  } finally { process.env.MAPA_ORIGEM_URL = guardado; }
});
