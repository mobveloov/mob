#!/usr/bin/env node
// Captura cada tela do menu do painel (1280x800) e confere erros: console, página, 5xx da API e "em construção".
//   PAINEL_TESTE_SENHA=... node scripts/teste/painel-capturas.mjs http://localhost:8841 docs/provas/painel scripts/teste/_menu.json
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(new URL("./", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1") + "../package.json");
const { chromium } = require("playwright");
const [BASE, SAIDA, MENU] = process.argv.slice(2);
const itens = JSON.parse(fs.readFileSync(MENU, "utf8"));
fs.mkdirSync(SAIDA, { recursive: true });
const n = await chromium.launch();
const ctx = await n.newContext({ viewport: { width: 1280, height: 800 } });
const r = await ctx.request.post(`${BASE}/api/entrar`, { data: { email: "dono@teste.local", senha: process.env.PAINEL_TESTE_SENHA } });
if (!r.ok()) { console.error("login do painel falhou", r.status()); process.exit(2); }
const p = await ctx.newPage();
let atual = "", erros = [];
p.on("pageerror", (e) => erros.push(`${atual}: ${e.message.slice(0, 160)}`));
p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|favicon|tile|openstreetmap/i.test(m.text())) erros.push(`${atual}: console ${m.text().slice(0, 160)}`); });
p.on("response", (x) => { if (x.status() >= 500 && x.url().includes("/api/")) erros.push(`${atual}: ${x.status()} ${x.url().replace(BASE, "")}`); });
const res = [];
for (const it of itens) {
  atual = it.id;
  try {
    await p.goto(BASE + it.rota, { waitUntil: "domcontentloaded", timeout: 30000 });
    await p.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(900);
    const texto = (await p.locator("body").innerText()).slice(0, 4000);
    const construcao = /em constru[cç][aã]o|em breve/i.test(texto);
    await p.screenshot({ path: `${SAIDA}/${it.id}.jpg`, type: "jpeg", quality: 62 });
    res.push({ ...it, ok: !construcao && texto.trim().length > 40, construcao });
  } catch (e) { res.push({ ...it, ok: false, erro: String(e.message).slice(0, 120) }); }
}
await n.close();
fs.writeFileSync(`${SAIDA}/resultado.json`, JSON.stringify({ quando: new Date().toISOString(), res, erros }, null, 2));
console.log(`${res.filter((x) => x.ok).length}/${res.length} telas abriram com conteúdo; erros: ${erros.length}`);
for (const e of erros.slice(0, 15)) console.log("  -", e);
for (const x of res.filter((y) => !y.ok)) console.log("  ✖", x.id, x.erro ?? (x.construcao ? "em construção" : "vazia"));
