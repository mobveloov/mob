#!/usr/bin/env node
// Publica os APKs gerados de uma empresa na página de download (/apps/baixar/), sem pôr nada no Git.
//
//   node scripts/publicar-apks.mjs <empresa>                      copia para DADOS_DIR (padrão painel/dados) deste computador
//   node scripts/publicar-apks.mjs <empresa> --docker <contêiner>  copia para dentro de um contêiner do painel (docker cp)
//
// Lê build/apps/<empresa>-passageiro/<empresa>-passageiro-teste.apk (ou o .aab não serve: só APK) e o do motorista.
// Grava <DADOS_DIR>/empresas/<empresa>/apps/apks/<app>.apk e <app>.json (nome, pacote e versão).

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const empresa = args.find((a) => !a.startsWith("--"));
const iDocker = args.indexOf("--docker");
const conteiner = iDocker >= 0 ? args[iDocker + 1] : null;
if (!empresa || !/^[a-z0-9][a-z0-9-]{1,40}$/.test(empresa)) { console.error("Uso: node scripts/publicar-apks.mjs <empresa> [--docker <contêiner>]"); process.exit(1); }

const marca = JSON.parse(fs.readFileSync(path.join(RAIZ, "tenants", empresa, "brand.json"), "utf8"));
const base = marca.app ?? {};
const destinoLocal = path.resolve(process.env.DADOS_DIR || path.join(RAIZ, "painel", "dados"), "empresas", empresa, "apps", "apks");
const preparo = conteiner ? fs.mkdtempSync(path.join(os.tmpdir(), "apks-")) : destinoLocal;
fs.mkdirSync(preparo, { recursive: true });

let n = 0;
for (const app of ["passageiro", "motorista"]) {
  const apk = path.join(RAIZ, "build", "apps", `${empresa}-${app}`, `${empresa}-${app}-teste.apk`);
  if (!fs.existsSync(apk)) { console.log(`• ${app}: sem APK em ${path.relative(RAIZ, apk)} (gere com build-app-empresa.mjs ${empresa} --app=${app} --apk)`); continue; }
  fs.copyFileSync(apk, path.join(preparo, `${app}.apk`));
  const nome = base[app]?.nome ?? (app === "motorista" ? `${base.nome ?? ""} Motorista`.trim() : base.nome);
  fs.writeFileSync(path.join(preparo, `${app}.json`), JSON.stringify({ nome, pacote: base[app]?.pacote, versao: "1.0", publicadoEm: new Date().toISOString() }, null, 2));
  console.log(`✔ ${app}: ${(fs.statSync(apk).size / 1048576).toFixed(1)} MB`); n++;
}
if (conteiner && n) {
  const destino = `/dados/empresas/${empresa}/apps/apks`;
  const docker = (a) => execFileSync("docker", a, { stdio: "inherit", env: { ...process.env, MSYS_NO_PATHCONV: "1" } });
  docker(["exec", conteiner, "mkdir", "-p", destino]);
  docker(["cp", `${preparo}${path.sep}.`, `${conteiner}:${destino}`]);
  fs.rmSync(preparo, { recursive: true, force: true });
  console.log(`✔ Publicado no contêiner ${conteiner}.`);
} else if (n) console.log(`✔ Publicado em ${destinoLocal}`);
else { console.error("Nada para publicar."); process.exit(1); }
console.log(`Página: /apps/baixar/?empresa=${empresa}`);
