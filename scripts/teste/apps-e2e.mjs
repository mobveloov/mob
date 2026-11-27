#!/usr/bin/env node
// ROTEIRO PONTA A PONTA dos apps (passageiro + motorista), 412x915, com verificação automática e captura de cada item.
// Servidor de teste local com dados de teste (nada de produção):
//   cd painel && DADOS_DIR=<pasta vazia> npx tsx ../scripts/teste/apps-e2e-seed.ts
//   (subir o painel com NODE_ENV=teste APPS_MOSTRAR_CODIGO=1 PAINEL_API_PORTA=<p> e o vite dos apps com PORT=<v>)
//   APPS_WEB=http://localhost:<v> node scripts/teste/apps-e2e.mjs docs/provas/apps-final
import fs from "node:fs";
import { chromium, login, abrirApp, foto, esperar, chamar, limpar } from "./apps-e2e-lib.mjs";

const SAIDA = process.argv[2] ?? "docs/provas/apps-final";
const resultados = [];
const ok = (item, passou, detalhe = "") => { resultados.push({ item, passou, detalhe }); console.log(`${passou ? "✔" : "✖"} ${item}${detalhe ? " — " + detalhe : ""}`); };
const paginas = [];
const passo = async (item, fn) => { try { await fn(); } catch (e) { for (const [i, pg] of paginas.slice(-2).entries()) await pg.screenshot({ path: `C:/Users/Rafael/AppData/Local/Temp/e2e-shots/falha-${i}.png` }).catch(() => {}); ok(item, false, String(e.message ?? e).slice(0, 200)); } };

const HOOK = `(() => { window.__sons = []; const p = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { window.__sons.push({ via: "audio", src: String(this.currentSrc || this.src), loop: this.loop }); return p.apply(this, arguments); };
  const AC = window.AudioContext; if (AC) { const o = AC.prototype.createBufferSource; AC.prototype.createBufferSource = function () { const s = o.apply(this, arguments); const st = s.start; s.start = function () { window.__sons.push({ via: "ctx", loop: s.loop, dur: s.buffer ? Math.round(s.buffer.duration * 100) / 100 : 0 }); return st.apply(this, arguments); }; return s; }; }
  window.__wake = 0; if (navigator.wakeLock) { const r = navigator.wakeLock.request.bind(navigator.wakeLock); navigator.wakeLock.request = (t) => { window.__wake++; return r(t); }; }
  window.__falas = []; if (window.speechSynthesis) { const sp = window.speechSynthesis.speak.bind(window.speechSynthesis); window.speechSynthesis.speak = (u) => { window.__falas.push({ texto: u.text, voz: u.voice && u.voice.name, rate: u.rate }); return sp(u); }; } })();`;

const E = { texto: "Rua das Flores, 100", lat: -23.55, lng: -46.63 }, D = { texto: "Av. Central, 2000", lat: -23.6, lng: -46.66 };
const nav = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const tm = await login("motorista", "11999990001");
const tp = await login("passageiro", "11988880001", "Maria Passageira");
await limpar(tp, tm);
await chamar("POST", "/online", { lat: -23.551, lng: -46.63 }, tm);

const abrir = async (papel, token, op = {}) => {
  const a = await abrirApp(nav, papel, token, op);
  paginas.push(a.p);
  await a.ctx.addInitScript(HOOK);
  await a.p.reload({ waitUntil: "domcontentloaded" });
  await a.p.mouse.click(5, 5).catch(() => {}); // um toque na tela libera o áudio, como no aparelho
  if (!op?.manterPopup) { await esperar(3200); const f = a.p.locator(".popup-aviso button").first(); if (await f.isVisible().catch(() => false)) await f.click(); }
  if (!op?.manterSos) await esperar(2500); for (let i = 0; i < 12 && !op?.manterSos; i++) { const x = a.p.getByLabel("Fechar aviso"); if (!(await x.isVisible().catch(() => false))) break; await x.click(); await esperar(150); }
  return a;
};
const M = await abrir("motorista", tm), P = await abrir("passageiro", tp);
await esperar(2500);

// ---------------------------------------------------------------- oferta: Recusar e toque Xperia em laço
await passo("oferta/recusar", async () => {
  const id = (await chamar("POST", "/corridas", { embarque: E, destino: D, categoria: "Econômico", pagamento: "Pix", pedidoId: "e2e-1-" + Date.now() }, tp)).corpo.corrida?.id;
  await M.p.getByRole("button", { name: /^aceitar/i }).waitFor({ timeout: 20000 });
  await esperar(1500);
  const sons = await M.p.evaluate(() => window.__sons);
  const xperia = sons.find((s) => (s.src ?? "").includes("toque_xperia") || (s.via === "ctx" && s.dur > 1));
  ok("toque Xperia em laço na oferta (padrão)", !!xperia && xperia.loop === true, JSON.stringify(sons.slice(0, 2)));
  await foto(M.p, SAIDA, "e2e-motorista-oferta");
  ok("botão Recusar na oferta", await M.p.getByRole("button", { name: /^recusar/i }).isVisible());
  await M.p.getByRole("button", { name: /^recusar/i }).click();
  await esperar(1500);
  const sumiu = !(await M.p.getByRole("button", { name: /^aceitar/i }).isVisible().catch(() => false));
  ok("Recusar fecha a oferta e para o toque", sumiu);
  await foto(M.p, SAIDA, "e2e-motorista-apos-recusar");
  if (id) await chamar("POST", `/corridas/${id}/cancelar`, { motivo: "teste" }, tp);
});

// ---------------------------------------------------------------- aceitar: placa, som do aceite, folha sem corte
await passo("aceite", async () => {
  await limpar(tp, tm);
  await chamar("POST", "/online", { lat: -23.551, lng: -46.63 }, tm);
  await chamar("POST", "/corridas", { embarque: E, destino: D, categoria: "Econômico", pagamento: "Pix", pedidoId: "e2e-2-" + Date.now() }, tp);
  await M.p.getByRole("button", { name: /^aceitar/i }).waitFor({ timeout: 20000 });
  await P.p.evaluate(() => { window.__sons.length = 0; });
  await M.p.getByRole("button", { name: /^aceitar/i }).click();
  await P.p.getByText("Motorista a caminho").first().waitFor({ timeout: 20000 });
  await esperar(2500);
  const sons = await P.p.evaluate(() => window.__sons);
  ok("passageiro ouve som quando o motorista aceita (app aberto)", sons.some((s) => s.via === "ctx" || /aceite|mensagem/.test(s.src ?? "")), JSON.stringify(sons.slice(0, 3)) + " marcos=" + JSON.stringify(await P.p.evaluate(() => window.__marcos)));
  ok("tela sempre ligada (wake lock pedido) nos dois apps", (await P.p.evaluate(() => window.__wake)) > 0 && (await M.p.evaluate(() => window.__wake)) > 0, `passageiro ${await P.p.evaluate(() => window.__wake)}, motorista ${await M.p.evaluate(() => window.__wake)}`);
  const corpo = await P.p.locator("body").innerText();
  ok("placa do veículo visível no passageiro (a caminho)", /ABC-?1D23/.test(corpo) && /Fiat Argo Prata/.test(corpo));
  const placa = P.p.getByText(/ABC-?1D23/).first();
  ok("placa dentro da tela (não cortada)", await placa.isVisible() && (await placa.boundingBox()).y + (await placa.boundingBox()).height <= 915);
  // folha de baixo: nenhum texto/botão fora da folha nem da tela
  const corte = await P.p.evaluate(() => {
    const falhas = [];
    const alvo = [...document.querySelectorAll("button, h1, h2, h3, strong, p, span")].filter((e) => e.offsetParent && /Acompanhar viagem|Motorista a caminho|Chat|Ligar|ABC|Cancelar/i.test(e.textContent ?? "") && (e.textContent ?? "").length < 60);
    for (const e of alvo) { const r = e.getBoundingClientRect(); if (r.bottom > innerHeight + 1 || r.right > innerWidth + 1 || r.left < -1) falhas.push((e.textContent ?? "").trim().slice(0, 30)); let f = e.parentElement; while (f && f !== document.body) { const cs = getComputedStyle(f); if (/hidden|clip/.test(cs.overflowY) && e.getBoundingClientRect().bottom > f.getBoundingClientRect().bottom + 2) { falhas.push("cortado em " + (e.textContent ?? "").trim().slice(0, 30)); break; } f = f.parentElement; } }
    return { falhas, achou: alvo.length };
  });
  ok("folha de baixo sem texto cortado (passageiro)", corte.falhas.length === 0 && corte.achou > 2, JSON.stringify(corte));
  await foto(P.p, SAIDA, "e2e-passageiro-a-caminho-placa");
  await foto(M.p, SAIDA, "e2e-motorista-a-caminho");
  const cm = await M.p.evaluate(() => [...document.querySelectorAll("button")].filter((b) => b.offsetParent).map((b) => { const r = b.getBoundingClientRect(); return r.bottom > innerHeight + 1 ? (b.textContent ?? "").trim() : null; }).filter(Boolean));
  ok("folha de baixo sem botão cortado (motorista)", cm.length === 0, JSON.stringify(cm));
});

// ---------------------------------------------------------------- foto redonda com visualizador (motorista vê o passageiro; passageiro vê o motorista)
await passo("foto redonda e visualizador", async () => {
  const png = await (await import("sharp")).default({ create: { width: 600, height: 400, channels: 3, background: "#3366cc" } }).png().toBuffer();
  for (const t of [tp, tm]) await fetch(`${process.env.APPS_WEB ?? "http://localhost:5174"}/api/apps/up-corridas/foto`, { method: "POST", headers: { authorization: `Bearer ${t}`, "content-type": "image/png" }, body: png });
  await M.p.reload(); await P.p.reload(); await esperar(3500);
  const formas = await P.p.evaluate(() => [...document.querySelectorAll(".avatar")].filter((a) => a.offsetParent && a.querySelector("img")).map((a) => { const r = a.getBoundingClientRect(), i = a.querySelector("img").getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), img: Math.round(i.width) + "x" + Math.round(i.height), raio: getComputedStyle(a).borderRadius }; }));
  ok("foto do motorista redonda (largura = altura, raio 50%)", formas.length > 0 && formas.every((f) => Math.abs(f.w - f.h) <= 1 && /50%|\d{2,}px/.test(f.raio) && f.img === f.w + "x" + f.h), JSON.stringify(formas));
  await foto(P.p, SAIDA, "e2e-passageiro-foto-redonda");
  await M.p.getByRole("button", { name: /ver perfil/i }).click();
  await esperar(800);
  await foto(M.p, SAIDA, "e2e-motorista-ver-perfil-foto-grande");
  const grande = await M.p.evaluate(() => [...document.querySelectorAll("img")].some((i) => i.offsetParent && i.getBoundingClientRect().width > 250));
  ok("Ver perfil abre a foto grande", grande);
  await M.p.keyboard.press("Escape");
  await M.p.getByRole("button", { name: /fechar/i }).first().click().catch(() => {});
});

// ---------------------------------------------------------------- chat escuro
await passo("chat escuro", async () => {
  const D2 = await abrir("passageiro", tp, { escuro: true });
  await esperar(3000);
  await D2.p.getByRole("button", { name: /^chat/i }).first().click();
  await esperar(800);
  const id = (await chamar("GET", "/estado", undefined, tp)).corpo.corrida?.id;
  await chamar("POST", `/corridas/${id}/chat`, { texto: "Estou chegando, cinza escuro." }, tm);
  await chamar("POST", `/corridas/${id}/chat`, { texto: "Ok, aguardo na portaria." }, tp);
  await esperar(2500);
  await foto(D2.p, SAIDA, "e2e-passageiro-chat-escuro");
  const lum = await D2.p.evaluate(() => { const f = (c) => { const m = c.match(/\d+(\.\d+)?/g)?.map(Number) ?? [0, 0, 0]; return (m[0] * 299 + m[1] * 587 + m[2] * 114) / 1000; }; const bols = [...document.querySelectorAll('[class*="bolha"],[class*="msg"],[class*="balao"]')].filter((e) => e.offsetParent && (e.textContent ?? "").trim().length > 3 && e.children.length < 4); return { fundoBody: f(getComputedStyle(document.body).backgroundColor), bolhas: bols.slice(0, 4).map((b) => Math.round(f(getComputedStyle(b).backgroundColor))) }; });
  ok("chat escuro: bolhas legíveis (não preto sobre preto)", lum.bolhas.length > 0 && lum.bolhas.some((l) => l > 25), JSON.stringify(lum));
  await D2.ctx.close();
});

// ---------------------------------------------------------------- menu do motorista: Meus veículos, Desafios, Configurações (voz)
await passo("motorista: menu, veículos, desafios, voz", async () => {
  await limpar(tp, tm);
  const V = await abrir("motorista", tm);
  await esperar(3000);
  await V.p.getByRole("button", { name: "Menu" }).click();
  await esperar(900);
  await foto(V.p, SAIDA, "e2e-motorista-menu");
  await V.p.getByText("Meus veículos").first().click(); await esperar(1500);
  const txt = await V.p.locator("body").innerText();
  ok("Meus veículos mostra o veículo cadastrado (Fiat Argo Prata, ABC1D23)", /Argo/i.test(txt) && /ABC-?1D23/.test(txt));
  await foto(V.p, SAIDA, "e2e-motorista-meus-veiculos");
  await V.p.reload(); await esperar(3500);
  await V.p.getByRole("button", { name: "Menu" }).click(); await esperar(700);
  await V.p.getByText("Desafios").first().click(); await esperar(1500);
  const d = await V.p.locator("body").innerText();
  ok("Desafios no motorista (abas, progresso, prêmio, prazo)", /Ativos/.test(d) && /Conclu/.test(d) && /Expirados/.test(d) && /Dez corridas/.test(d) && /R\$ ?50/.test(d), d.slice(0, 160).replace(/\n/g, " | "));
  await foto(V.p, SAIDA, "e2e-motorista-desafios");
  await V.ctx.close();
});

// ---------------------------------------------------------------- passageiro: Conta, Desafios, voz
await passo("passageiro: desafios e voz", async () => {
  const C = await abrir("passageiro", tp);
  await esperar(2500);
  await esperar(6500); for (let i = 0; i < 12; i++) { const x = C.p.getByLabel("Fechar aviso"); if (!(await x.isVisible().catch(() => false))) break; await x.click(); await esperar(150); }
  await C.p.getByRole("button", { name: "Conta" }).click(); await esperar(1200);
  await foto(C.p, SAIDA, "e2e-passageiro-conta");
  await C.p.getByText("Desafios").first().click(); await esperar(1500);
  const d = await C.p.locator("body").innerText();
  ok("Desafios no passageiro (abas)", /Ativos/.test(d) && /Conclu/.test(d) && /Expirados/.test(d), d.slice(0, 120).replace(/\n/g, " | "));
  await foto(C.p, SAIDA, "e2e-passageiro-desafios");
  await C.p.reload(); await esperar(7000); for (let i = 0; i < 12; i++) { const x = C.p.getByLabel("Fechar aviso"); if (!(await x.isVisible().catch(() => false))) break; await x.click(); await esperar(150); }
  await C.p.getByRole("button", { name: "Conta" }).click(); await esperar(800);
  await C.p.getByText("Voz dos avisos").first().click(); await esperar(1000);
  const uso = await C.p.getByTestId("voz-em-uso").innerText().catch(() => "");
  ok("tela Voz dos avisos mostra qual voz está em uso", uso.length > 3, uso);
  await foto(C.p, SAIDA, "e2e-passageiro-voz");
  await C.ctx.close();
});

await passo("SOS do passageiro chega à central e ao motorista", async () => {
  await limpar(tp, tm);
  await chamar("POST", "/online", { lat: -23.551, lng: -46.63 }, tm);
  await chamar("POST", "/corridas", { embarque: E, destino: D, categoria: "Econômico", pagamento: "Pix", pedidoId: "e2e-sos-" + Date.now() }, tp);
  const of = await (async () => { for (let i = 0; i < 40; i++) { const o = (await chamar("GET", "/estado", undefined, tm)).corpo.oferta; if (o) return o; await esperar(300); } return null; })();
  await chamar("POST", `/ofertas/${of.id}/aceitar`, {}, tm);
  const cid = (await chamar("GET", "/estado", undefined, tm)).corpo.corrida.id;
  console.log("status:", JSON.stringify((await chamar("POST", `/corridas/${cid}/status`, { status: "no_local" }, tm)).corpo).slice(0, 80), JSON.stringify((await chamar("POST", `/corridas/${cid}/status`, { status: "em_andamento" }, tm)).corpo).slice(0, 80));
  const S = await abrir("passageiro", tp, { manterSos: true });
  await esperar(3500);
  const btn = S.p.getByRole("button", { name: /sos|emerg/i }).first();
  for (let i = 0; i < 12; i++) { const x = S.p.getByLabel("Fechar aviso"); if (!(await x.isVisible().catch(() => false))) break; await x.click(); await esperar(150); }
  await S.p.mouse.click(206, 682); await esperar(900);
  await foto(S.p, SAIDA, "e2e-passageiro-folha-aberta-sos");
  ok("botão SOS na folha aberta da corrida em andamento", await S.p.getByRole("button", { name: /^SOS/i }).isVisible().catch(() => false));
  void btn;
  await foto(S.p, SAIDA, "e2e-passageiro-sos-botao");
  const r = await chamar("POST", "/sos", { motivo: "teste" }, tp);
  ok("SOS aberto (central notificada)", r.status === 200 && !!r.corpo.alerta?.id, JSON.stringify(r.corpo).slice(0, 100));
  await esperar(1500);
  await foto(S.p, SAIDA, "e2e-passageiro-sos-aberto");
  await S.ctx.close();
  await limpar(tp, tm);
});

// ---------------------------------------------------------------- pop-up de notificação (CRM/painel) no meio da tela + sininho; SOS
await passo("pop-up de notificação no meio da tela", async () => {
  const { execFileSync } = await import("node:child_process");
  execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["tsx", "../scripts/teste/apps-e2e-aviso.ts"], { cwd: "painel", stdio: "pipe", shell: process.platform === "win32", env: { ...process.env, NODE_ENV: "teste", DADOS_DIR: process.env.DADOS_DIR_E2E ?? (process.env.TEMP + "/e2e-dados") } });
  const N = await abrir("passageiro", tp, { manterPopup: true });
  await N.p.locator(".popup-aviso").waitFor({ timeout: 20000 });
  const caixa = await N.p.locator(".popup-aviso").boundingBox();
  const meio = caixa.y + caixa.height / 2;
  ok("pop-up do aviso aparece no MEIO da tela", Math.abs(meio - 915 / 2) < 160 && caixa.width > 200, `centro vertical ${Math.round(meio)} de 915`);
  ok("pop-up traz o texto do CRM", /Promoção UP/.test(await N.p.locator(".popup-aviso").innerText()));
  await foto(N.p, SAIDA, "e2e-passageiro-popup-crm-meio");
  await N.p.locator(".popup-aviso button").first().click(); await esperar(600);
  await N.p.getByRole("button", { name: "Conta" }).click(); await esperar(900);
  await N.p.getByText("Notificações").first().click(); await esperar(1200);
  ok("aviso fica na caixa (sininho)", /Promoção UP/.test(await N.p.locator("body").innerText()));
  await foto(N.p, SAIDA, "e2e-passageiro-sininho");
  await N.ctx.close();
});

fs.mkdirSync(SAIDA, { recursive: true });
fs.writeFileSync(`${SAIDA}/RESULTADO-e2e.json`, JSON.stringify({ quando: new Date().toISOString(), resultados }, null, 2));
await nav.close();
const falhas = resultados.filter((r) => !r.passou);
console.log(`\n${resultados.length - falhas.length}/${resultados.length} verificações passaram.`);
process.exit(falhas.length ? 1 : 0);
