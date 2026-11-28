#!/usr/bin/env node
// Capturas 412x915 das telas iniciais dos dois apps: node scripts/teste/apps-telas-inicio.mjs <pasta> <prefixo>   (APPS_WEB=http://localhost:5188)
import { chromium, login, abrirApp, foto, esperar, chamar, limpar } from "./apps-e2e-lib.mjs";
const [PASTA, PREF] = [process.argv[2] ?? "docs/provas/design", process.argv[3] ?? "antes"];
const nav = await chromium.launch();
const tm = await login("motorista", "11999990001");
const tp = await login("passageiro", "11988880001", "Maria Passageira");
await limpar(tp, tm);
const fechar = async (p) => { for (let i = 0; i < 12; i++) { const x = p.getByLabel("Fechar aviso"); if (!(await x.isVisible().catch(() => false))) break; await x.click(); await esperar(150); } };
await chamar("POST", "/offline", {}, tm).catch(() => {});
const P = await abrirApp(nav, "passageiro", tp); await esperar(9000); await fechar(P.p); await foto(P.p, PASTA, `${PREF}-passageiro-inicio`);
await P.p.getByRole("button", { name: /Conta/ }).click().catch(() => {}); await esperar(1200); await foto(P.p, PASTA, `${PREF}-passageiro-conta`);
const Mo = await abrirApp(nav, "motorista", tm); await esperar(8000); await fechar(Mo.p); await foto(Mo.p, PASTA, `${PREF}-motorista-offline`);
await chamar("POST", "/online", { lat: -23.551, lng: -46.63 }, tm);
await Mo.p.reload(); await esperar(8000); await fechar(Mo.p); await foto(Mo.p, PASTA, `${PREF}-motorista-online`);
await nav.close(); console.log("ok");
