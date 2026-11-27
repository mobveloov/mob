import { chromium, login, abrirApp, foto, esperar, chamar } from "./apps-e2e-lib.mjs";
const nav = await chromium.launch();
const tm = await login("motorista", "11999990001"); const tp = await login("passageiro", "11988880001", "Maria Passageira");
const M = await abrirApp(nav, "motorista", tm), P = await abrirApp(nav, "passageiro", tp);
await esperar(5000);
await foto(M.p, "C:/Users/Rafael/AppData/Local/Temp/e2e-shots", "m-inicio"); await foto(P.p, "C:/Users/Rafael/AppData/Local/Temp/e2e-shots", "p-inicio");
console.log("M:", (await M.p.locator("body").innerText()).slice(0,300).replace(/\n/g," | ")); console.log("P:", (await P.p.locator("body").innerText()).slice(0,300).replace(/\n/g," | "));
console.log(M.erros, P.erros);
await nav.close();
