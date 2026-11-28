#!/usr/bin/env node
// Motorista online: arrastar a barra de baixo para cima abre a folha (Desconectar) e o anúncio do painel aparece. 412x915.
//   APPS_WEB=http://localhost:5188 node scripts/teste/apps-motorista-deslizar.mjs docs/provas/apps-final
import { chromium, login, abrirApp, foto, esperar, chamar } from "./apps-e2e-lib.mjs";
const SAIDA = process.argv[2] ?? "docs/provas/apps-final";
const res = []; const ok = (i, p, d = "") => { res.push({ i, p }); console.log(`${p ? "✔" : "✖"} ${i}${d ? " — " + d : ""}`); };
const nav = await chromium.launch();
const tm = await login("motorista", "11999990001");
await chamar("POST", "/online", { lat: -23.551, lng: -46.63 }, tm);
const M = await abrirApp(nav, "motorista", tm);
await esperar(7000);
for (let i = 0; i < 12; i++) { const x = M.p.getByLabel("Fechar aviso"); if (!(await x.isVisible().catch(() => false))) break; await x.click(); await esperar(150); }
await foto(M.p, SAIDA, "motorista-online-recolhida");
const puxador = M.p.locator(".puxador-inicio");
ok("barra de puxar existe com o motorista online", await puxador.isVisible().catch(() => false));
const b = await puxador.boundingBox();
ok("área de toque do puxador >= 40 px de altura", !!b && b.height >= 40, `${Math.round(b?.height ?? 0)} px`);
await M.p.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
await M.p.mouse.down(); await M.p.mouse.move(b.x + b.width / 2, b.y - 60, { steps: 8 }); await M.p.mouse.up();
await esperar(900);
const desc = M.p.getByRole("button", { name: "Desconectar" });
ok("arrastar para cima abre a folha com Desconectar", await desc.isVisible().catch(() => false));
ok("anúncio cadastrado no painel aparece", await M.p.locator(".faixa-banners img").first().isVisible().catch(() => false));
await foto(M.p, SAIDA, "motorista-folha-aberta-anuncio");
await desc.click(); await esperar(600);
await foto(M.p, SAIDA, "motorista-desconectar-confirmar");
await M.p.getByRole("button", { name: /^Desligar$/ }).last().click().catch(() => {});
await esperar(2000);
const est = (await chamar("GET", "/estado", undefined, tm)).corpo;
ok("depois de confirmar, o motorista fica OFFLINE no servidor", est.online === false || est.motorista?.online === false, JSON.stringify(est.online ?? est.motorista?.online));
await foto(M.p, SAIDA, "motorista-offline");
await nav.close();
console.log(`${res.filter((r) => r.p).length}/${res.length} verificações passaram.`);
process.exit(res.every((r) => r.p) ? 0 : 1);
