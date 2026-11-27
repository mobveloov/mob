// Peças comuns do roteiro ponta a ponta dos apps (Playwright, 412x915, servidor de teste local).
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(new URL("./", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1") + "../package.json");
export const { chromium } = require("playwright");
export const WEB = process.env.APPS_WEB ?? "http://localhost:5174";
export const EMP = process.env.APPS_EMPRESA ?? "up-corridas";
export const API = `${WEB}/api/apps/${EMP}`;
export const POS = { latitude: -23.55, longitude: -46.63 };
export const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
export async function chamar(metodo, caminho, corpo, token) {
  const r = await fetch(API + caminho, { method: metodo, headers: { ...(corpo !== undefined ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  return { status: r.status, corpo: await r.json().catch(() => ({})) };
}
export async function login(papel, telefone, nome) {
  const c = await chamar("POST", "/entrar/codigo", { papel, telefone });
  const t = (await chamar("POST", "/entrar", { papel, telefone, codigo: c.corpo.codigoTeste })).corpo.token;
  if (papel === "passageiro" && nome) await chamar("POST", "/eu", { nome }, t);
  return t;
}
/** Abre o app já logado (token injetado no armazenamento, como depois do login). */
export async function abrirApp(navegador, papel, token, { escuro = false, cacheAbertura = true } = {}) {
  const ctx = await navegador.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1, geolocation: POS, permissions: ["geolocation", "notifications", "microphone"], colorScheme: escuro ? "dark" : "light" });
  await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* ok */ } }, [`token-${papel}-${EMP}`, token]);
  const p = await ctx.newPage();
  const erros = [];
  p.on("pageerror", (e) => erros.push(e.message.slice(0, 200)));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|favicon/.test(m.text())) erros.push(m.text().slice(0, 200)); });
  await p.goto(`${WEB}/${papel}/?empresa=${EMP}`, { waitUntil: "domcontentloaded" });
  return { ctx, p, erros };
}
export const foto = async (p, pasta, nome) => { fs.mkdirSync(pasta, { recursive: true }); await p.screenshot({ path: `${pasta}/${nome}.png` }); };
