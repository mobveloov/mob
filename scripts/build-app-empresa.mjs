#!/usr/bin/env node
// Gera o app de UMA empresa a partir de tenants/<empresa>/brand.json + tenants/<empresa>/assets/.
//
//   node scripts/build-app-empresa.mjs <empresa>            prepara o projeto (PWA + Android) em build/apps/<empresa>/
//   node scripts/build-app-empresa.mjs <empresa> --apk      ... e gera o APK (teste: assinado com chave de depuração)
//   node scripts/build-app-empresa.mjs <empresa> --aab      ... e gera o AAB assinado para a Play Store
//
// O app é um "casco" (Capacitor) que abre o painel da empresa (app.urlPainel) com o nome, ícone, tela de
// abertura e cores dela. Assinatura: só por variáveis de ambiente (nunca no repositório):
//   APP_KEYSTORE (caminho do .jks), APP_KEYSTORE_SENHA, APP_KEY_ALIAS, APP_KEY_SENHA
// Precisa: Node 20+, JDK 21 (JAVA_HOME) e Android SDK (ANDROID_HOME) para --apk/--aab.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");
const args = process.argv.slice(2);
const empresa = args.find((a) => !a.startsWith("--"));
const quer = (f) => args.includes(`--${f}`);

function falhar(msg) { console.error(`\n✖ ${msg}\n`); process.exit(1); }
function passo(msg) { console.log(`• ${msg}`); }

if (!empresa || !/^[a-z0-9][a-z0-9-]{1,40}$/.test(empresa)) falhar("Uso: node scripts/build-app-empresa.mjs <empresa> [--apk|--aab]  (nome da pasta em tenants/)");
const pastaEmpresa = path.join(RAIZ, "tenants", empresa);
const arqBrand = path.join(pastaEmpresa, "brand.json");
if (!fs.existsSync(arqBrand)) falhar(`Não achei ${path.relative(RAIZ, arqBrand)}. Baixe o brand.json em Marca e aparência e coloque lá.`);

const marca = JSON.parse(fs.readFileSync(arqBrand, "utf8"));
const app = marca.app ?? {};
const erros = [];
if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(app.pacote ?? "")) erros.push('app.pacote (ex.: "br.com.suaempresa.painel")');
if (!app.nome) erros.push("app.nome");
if (!/^https:\/\/[^\s"'<>]+$/.test(app.urlPainel ?? "")) erros.push('app.urlPainel com https (ex.: "https://painel.suaempresa.com.br")');
const cor = (c, p) => (/^#[0-9a-fA-F]{6}$/.test(c ?? "") ? c : p);
const primaria = cor(marca.cores?.primaria, "#2563eb"), fundo = cor(marca.cores?.fundo, "#ffffff");
if (erros.length) falhar(`Falta no brand.json: ${erros.join("; ")}.`);

const asset = (tipo) => {
  const nome = marca.arquivos?.[tipo];
  const p = nome ? path.join(pastaEmpresa, "assets", path.basename(nome)) : null;
  return p && fs.existsSync(p) ? p : null;
};
const icone = asset("iconeApp") ?? asset("favicon");
if (!icone) falhar("Falta o ícone do app (arquivos.iconeApp em assets/, de preferência PNG 1024×1024).");

const saida = path.join(RAIZ, "build", "apps", empresa);
fs.mkdirSync(path.join(saida, "www"), { recursive: true });
fs.mkdirSync(path.join(saida, "assets"), { recursive: true });

// ---------------------------------------------------------------- imagens (ícone e abertura em PNG)
const sharp = (await import("sharp")).default;
passo("Preparando ícone e tela de abertura");
await sharp(icone, { density: 384 }).resize(1024, 1024, { fit: "contain", background: primaria }).png().toFile(path.join(saida, "assets", "icon-only.png"));
await sharp(icone, { density: 384 }).resize(1024, 1024, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(path.join(saida, "assets", "icon-foreground.png"));
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: primaria } }).png().toFile(path.join(saida, "assets", "icon-background.png"));
const abertura = asset("abertura");
const logoAbertura = abertura ?? icone;
const fundoAbertura = sharp({ create: { width: 2732, height: 2732, channels: 4, background: fundo } });
const meio = await sharp(logoAbertura, { density: 384 }).resize(abertura ? 2732 : 900, abertura ? 2732 : 900, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
await fundoAbertura.composite([{ input: meio, gravity: "center" }]).png().toFile(path.join(saida, "assets", "splash.png"));
fs.copyFileSync(path.join(saida, "assets", "splash.png"), path.join(saida, "assets", "splash-dark.png"));
await sharp(icone, { density: 384 }).resize(512, 512, { fit: "contain", background: primaria }).png().toFile(path.join(saida, "www", "icone-512.png"));

// ---------------------------------------------------------------- PWA + casco web
passo("Gerando manifest (PWA) e página de abertura");
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
fs.writeFileSync(path.join(saida, "www", "manifest.webmanifest"), JSON.stringify({
  name: marca.produto ?? app.nome, short_name: app.nome, start_url: app.urlPainel, display: "standalone",
  background_color: fundo, theme_color: primaria, lang: "pt-BR", icons: [{ src: "icone-512.png", sizes: "512x512", purpose: "any maskable" }],
}, null, 2));
fs.writeFileSync(path.join(saida, "www", "index.html"), `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(app.nome)}</title><link rel="manifest" href="manifest.webmanifest"><meta name="theme-color" content="${primaria}">
<style>body{margin:0;height:100vh;display:grid;place-items:center;background:${fundo};font-family:system-ui}img{width:120px}</style></head>
<body><img src="icone-512.png" alt=""><script>location.replace(${JSON.stringify(app.urlPainel)})</script></body></html>`);

// ---------------------------------------------------------------- projeto Capacitor
passo("Gerando projeto Capacitor");
const dominio = new URL(app.urlPainel).hostname;
fs.writeFileSync(path.join(saida, "capacitor.config.json"), JSON.stringify({
  appId: app.pacote, appName: app.nome, webDir: "www",
  server: { url: app.urlPainel, cleartext: false, allowNavigation: [dominio] },
  android: { backgroundColor: fundo },
  plugins: { SplashScreen: { backgroundColor: fundo, launchShowDuration: 1200 } },
}, null, 2));
const versao = (p) => JSON.parse(fs.readFileSync(path.join(AQUI, "node_modules", p, "package.json"), "utf8")).version;
fs.writeFileSync(path.join(saida, "package.json"), JSON.stringify({
  name: `app-${empresa}`, private: true, version: "1.0.0",
  dependencies: { "@capacitor/android": versao("@capacitor/android"), "@capacitor/core": versao("@capacitor/core") },
  devDependencies: { "@capacitor/cli": versao("@capacitor/cli"), "@capacitor/assets": versao("@capacitor/assets") },
}, null, 2));

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const rodar = (cmd, a, cwd = saida, env = process.env) => execFileSync(cmd, a, { cwd, stdio: "inherit", env, shell: process.platform === "win32" });

if (!quer("apk") && !quer("aab")) {
  console.log(`\n✔ Projeto pronto em ${path.relative(RAIZ, saida)}. Para gerar o app: node scripts/build-app-empresa.mjs ${empresa} --apk (ou --aab).\n`);
  process.exit(0);
}

passo("Instalando o Capacitor no projeto do app");
rodar(npm, ["install", "--no-audit", "--no-fund"]);
if (!fs.existsSync(path.join(saida, "android"))) { passo("Criando projeto Android"); rodar(npx, ["cap", "add", "android"]); }
passo("Gerando ícones e telas de abertura do Android");
rodar(npx, ["capacitor-assets", "generate", "--android", "--iconBackgroundColor", primaria, "--splashBackgroundColor", fundo]);
rodar(npx, ["cap", "sync", "android"]);

// cor da barra do app
const cores = path.join(saida, "android", "app", "src", "main", "res", "values", "colors.xml");
fs.mkdirSync(path.dirname(cores), { recursive: true });
fs.writeFileSync(cores, `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <color name="colorPrimary">${primaria}</color>\n  <color name="colorPrimaryDark">${primaria}</color>\n  <color name="colorAccent">${primaria}</color>\n</resources>\n`);

const gradlew = path.join(saida, "android", process.platform === "win32" ? "gradlew.bat" : "gradlew");
const tarefa = quer("aab") ? "bundleRelease" : "assembleDebug";
// Assinatura pelo ambiente (ORG_GRADLE_PROJECT_*): as senhas não aparecem na linha de comando nem em arquivo.
const envGradle = { ...process.env };
if (quer("aab")) {
  const { APP_KEYSTORE, APP_KEYSTORE_SENHA, APP_KEY_ALIAS, APP_KEY_SENHA } = process.env;
  if (!APP_KEYSTORE || !APP_KEYSTORE_SENHA || !APP_KEY_ALIAS || !APP_KEY_SENHA) falhar("Para --aab defina APP_KEYSTORE, APP_KEYSTORE_SENHA, APP_KEY_ALIAS e APP_KEY_SENHA (nunca coloque no repositório).");
  Object.assign(envGradle, {
    "ORG_GRADLE_PROJECT_android.injected.signing.store.file": path.resolve(APP_KEYSTORE),
    "ORG_GRADLE_PROJECT_android.injected.signing.store.password": APP_KEYSTORE_SENHA,
    "ORG_GRADLE_PROJECT_android.injected.signing.key.alias": APP_KEY_ALIAS,
    "ORG_GRADLE_PROJECT_android.injected.signing.key.password": APP_KEY_SENHA,
  });
}
passo(`Compilando (${tarefa})`);
rodar(gradlew, [tarefa, "--no-daemon"], path.join(saida, "android"), envGradle);
const gerado = quer("aab") ? path.join(saida, "android", "app", "build", "outputs", "bundle", "release", "app-release.aab") : path.join(saida, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk");
const final = path.join(saida, `${empresa}${quer("aab") ? ".aab" : "-teste.apk"}`);
fs.copyFileSync(gerado, final);
console.log(`\n✔ Pronto: ${path.relative(RAIZ, final)}\n`);
