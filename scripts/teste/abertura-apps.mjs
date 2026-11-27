#!/usr/bin/env node
// Prova da imagem de abertura dos apps (412x915): 1º início (sem cache), 2º início (do cache, com a rede lenta) e sem imagem no painel.
//   node scripts/teste/abertura-apps.mjs http://localhost:5174 up-corridas docs/provas/apps-final
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(new URL("./", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1") + "../package.json");
const { chromium } = require("playwright");
const [BASE, EMP, SAIDA] = [process.argv[2], process.argv[3], process.argv[4]];
fs.mkdirSync(SAIDA, { recursive: true });
const falhas = [];
const b = await chromium.launch();
for (const app of ["passageiro", "motorista"]) {
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const url = `${BASE}/${app}/?empresa=${EMP}`;
  // 1º início: a imagem chega pelo painel e fica guardada (marca lenta 3 s para dar para ver)
  await p.route("**/api/apps/*/marca", async (r) => { await new Promise((o) => setTimeout(o, 3000)); r.continue().catch(() => {}); });
  await p.goto(url, { waitUntil: "commit" }); await p.waitForSelector('[data-testid="abertura"] img', { timeout: 60000 });
  await p.waitForFunction(() => document.querySelector('[data-testid="abertura"] .abertura-img'), null, { timeout: 15000 }).catch(() => falhas.push(`${app}: imagem não apareceu no 1º início`));
  await p.screenshot({ path: `${SAIDA}/abertura-${app}-1-inicio.png` });
  const guardou = await p.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith("abertura-") && JSON.parse(localStorage[k]).img?.startsWith("data:image")));
  if (!guardou) falhas.push(`${app}: imagem não ficou guardada`);
  // 2º início: servidor da abertura LENTO (8 s) — a imagem tem que estar na tela na hora
  await p.route("**/abertura/**", async (r) => { await new Promise((o) => setTimeout(o, 8000)); r.continue().catch(() => {}); });
  await p.route("**/api/apps/*/marca", async (r) => { await new Promise((o) => setTimeout(o, 8000)); r.continue().catch(() => {}); });
  await p.goto(url, { waitUntil: "commit" });
  await p.waitForSelector('[data-testid="abertura"] .abertura-img', { timeout: 1500 }).catch(() => falhas.push(`${app}: 2º início sem a imagem do cache em 1,5 s`));
  await p.screenshot({ path: `${SAIDA}/abertura-${app}-2-do-cache.png` });
  // sem imagem no painel: o painel devolve url null; no início seguinte aparece o ícone da marca no fundo da marca
  await p.unroute("**/abertura/**"); await p.unroute("**/api/apps/*/marca");
  await p.route("**/abertura/**", (r) => r.fulfill({ json: { url: null, versao: "" } }));
  await p.goto(url, { waitUntil: "commit" });
  await p.waitForFunction(() => Object.keys(localStorage).some((k) => k.startsWith("abertura-") && JSON.parse(localStorage[k]).img === null), null, { timeout: 15000 }).catch(() => falhas.push(`${app}: cache sem imagem não gravado`));
  await p.goto(url, { waitUntil: "commit" });
  await p.waitForSelector('[data-testid="abertura"] .abertura-icone', { timeout: 3000 }).catch(() => falhas.push(`${app}: sem imagem não mostrou o ícone da marca`));
  await new Promise((o) => setTimeout(o, 300));
  await p.screenshot({ path: `${SAIDA}/abertura-${app}-3-sem-imagem.png` });
  await ctx.close();
}
await b.close();
console.log(falhas.length ? "FALHAS:\n" + falhas.join("\n") : "OK: abertura 1º início, do cache e sem imagem nos dois apps.");
process.exit(falhas.length ? 1 : 0);
