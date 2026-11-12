#!/usr/bin/env node
// TESTE DAS TELAS com navegador automatizado (Playwright). Abre cada tela do menu do painel e clica nos botões que
// não apagam nem enviam nada. Falha se aparecer erro no console, erro de página ou resposta 5xx da API.
// Depois abre os apps do passageiro e do motorista e faz o login com o código (só em ambiente de teste/carga).
//
//   cd scripts && npm install && npx playwright install chromium
//   TELAS_EMAIL=... TELAS_SENHA=... node scripts/teste/telas.mjs http://localhost:8790 [http://localhost:8796 empresa telPassageiro telMotorista]
//
// A senha vem só da variável de ambiente (nunca na linha de comando nem no código).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const BASE = (process.argv[2] ?? "http://localhost:8790").replace(/\/+$/, "");
const [APPS_BASE, APPS_EMPRESA, TEL_P, TEL_M] = process.argv.slice(3);
const EMAIL = process.env.TELAS_EMAIL, SENHA = process.env.TELAS_SENHA;
if (!EMAIL || !SENHA) { console.error("Defina TELAS_EMAIL e TELAS_SENHA."); process.exit(1); }

// Botões que mudam ou apagam dados, mandam mensagem ou saem: não clicar.
const PERIGO = /excluir|apagar|remover|disparar|enviar|cancelar|desconectar|conectar|sair|finalizar|atribuir|trocar|importar|salvar|criar|pedir|solicitar|recarregar|duplicar|pausar|retomar|rodar|resolver|marcar|iniciar|chegou|aceitar|recusar|online|offline|exportar|baixar|planilha|gerar|relat[óo]rio|perguntar|testar|processar/i;

const falhas = [];
const visitadas = [];

function vigiar(page, onde) {
  const doAtual = () => onde.atual;
  page.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource: the server responded with a status of 4\d\d/.test(m.text())) falhas.push(`${doAtual()}: console: ${m.text().slice(0, 200)}`); });
  page.on("pageerror", (e) => falhas.push(`${doAtual()}: erro na página: ${e.message.slice(0, 200)}`));
  page.on("response", (r) => { if (r.status() >= 500 && r.url().includes("/api/")) falhas.push(`${doAtual()}: ${r.status()} em ${r.url().replace(BASE, "")}`); });
  page.on("dialog", (d) => d.dismiss().catch(() => {}));
}

const navegador = await chromium.launch();
try {
  // ---------------------------------------------------------------- painel
  const ctx = await navegador.newContext({ viewport: { width: 1366, height: 860 } });
  const page = await ctx.newPage();
  const onde = { atual: "entrar" };
  vigiar(page, onde);
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', SENHA);
  await page.click('button:has-text("Entrar")');
  await page.waitForSelector("nav", { timeout: 15_000 });
  const rotas = await page.$$eval("header a[href], nav a[href]", (as) => [...new Set(as.map((a) => new URL(a.href).pathname).filter((r) => r.startsWith("/") && !r.startsWith("/apps") && !r.startsWith("/api")))]);
  console.log(`Painel: ${rotas.length} telas no menu.`);
  for (const rota of rotas) {
    onde.atual = rota;
    await page.goto(BASE + rota, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    const titulo = (await page.locator("main h1, h1, main h2").first().textContent({ timeout: 4000 }).catch(() => ""))?.trim();
    if (!titulo) falhas.push(`${rota}: tela sem título (não abriu?)`);
    if (await page.locator("text=Página não encontrada").count()) falhas.push(`${rota}: "Página não encontrada"`);
    if (await page.locator("text=Em construção").count()) falhas.push(`${rota}: ainda "Em construção"`);
    // Clica nos botões seguros, um por um (abre gavetas, abas, filtros), fechando o que abrir.
    const botoes = await page.locator("main button:visible").all();
    let clicados = 0;
    for (const b of botoes.slice(0, 25)) {
      // O botão pode sumir depois do clique anterior (gaveta fechou, lista mudou): pula sem travar.
      const t = ((await b.textContent({ timeout: 1500 }).catch(() => "")) ?? "").trim() || (await b.getAttribute("aria-label", { timeout: 1500 }).catch(() => "")) || "";
      if (!t || PERIGO.test(t) || (await b.isDisabled({ timeout: 1500 }).catch(() => true))) continue;
      onde.atual = `${rota} [${t.slice(0, 30)}]`;
      await b.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(250);
      await page.keyboard.press("Escape").catch(() => {});
      const fechar = page.locator('[aria-label="Fechar"]:visible');
      if (await fechar.count()) await fechar.first().click({ timeout: 2000 }).catch(() => {});
      clicados++;
    }
    onde.atual = rota;
    visitadas.push({ rota, titulo, botoesClicados: clicados });
    console.log(`  ok ${rota.padEnd(28)} ${String(clicados).padStart(2)} botões  ${titulo ?? ""}`);
  }
  await ctx.close();

  // ---------------------------------------------------------------- apps (só em ambiente de teste/carga)
  if (APPS_BASE && APPS_EMPRESA && TEL_P && TEL_M) {
    for (const [papel, tel] of [["passageiro", TEL_P], ["motorista", TEL_M]]) {
      const c = await navegador.newContext({ viewport: { width: 400, height: 860 }, geolocation: { latitude: -21.0106, longitude: -48.2196 }, permissions: ["geolocation"] });
      const p = await c.newPage();
      const o = { atual: `app ${papel}` };
      vigiar(p, o);
      await p.goto(`${APPS_BASE}/apps/${papel}/?empresa=${APPS_EMPRESA}&servidor=${encodeURIComponent(APPS_BASE)}`, { waitUntil: "networkidle" });
      await p.locator('input[type="tel"], input[inputmode="tel"]').first().fill(tel);
      const resp = p.waitForResponse((r) => r.url().includes("/entrar/codigo"));
      await p.locator("button").filter({ hasText: /c[óo]digo|continuar|entrar/i }).first().click();
      const codigo = (await (await resp).json()).codigoTeste;
      if (!codigo) { falhas.push(`app ${papel}: o código não veio (ambiente não é de teste?)`); await c.close(); continue; }
      await p.locator('input[inputmode="numeric"], input[autocomplete="one-time-code"]').first().fill(codigo);
      await p.locator("button").filter({ hasText: /entrar|confirmar|continuar/i }).last().click();
      await p.waitForTimeout(2500);
      const corpo = (await p.locator("body").innerText()).slice(0, 400);
      if (/c[óo]digo (errado|vencido)|entre de novo/i.test(corpo)) falhas.push(`app ${papel}: login falhou`);
      const texto = await p.locator("button:visible").allInnerTexts();
      visitadas.push({ rota: `app ${papel}`, titulo: corpo.split("\n")[0], botoesClicados: 0, botoes: texto.slice(0, 12) });
      console.log(`  ok app ${papel}: ${texto.slice(0, 8).join(" | ")}`);
      await c.close();
    }
  }
} finally {
  await navegador.close();
}

const arq = path.join(os.tmpdir(), `telas-${Date.now()}.json`);
fs.writeFileSync(arq, JSON.stringify({ base: BASE, visitadas, falhas }, null, 2));
console.log(`\nTelas: ${visitadas.length}. Falhas: ${falhas.length}`);
for (const f of falhas) console.log(`  - ${f}`);
console.log(`Resultado: ${arq}`);
process.exit(falhas.length ? 2 : 0);
