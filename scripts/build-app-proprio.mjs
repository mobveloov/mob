#!/usr/bin/env node
// Gera o APP PRÓPRIO do passageiro ou do motorista de UMA empresa (React + Capacitor, código em painel/src/apps/web/).
//
//   node scripts/build-app-empresa.mjs <empresa> --app=passageiro [--apk|--aab]
//   node scripts/build-app-empresa.mjs <empresa> --app=motorista  [--apk|--aab]
//
// Sai em build/apps/<empresa>-<app>/ (APK: <empresa>-<app>-teste.apk).
// Marca: tenants/<empresa>/brand.json + assets/ (ícone, abertura, cores), igual ao casco do painel.
//   app.passageiro / app.motorista: { "nome", "pacote" } (opcional). Sem eles: o nome do app (+ " Motorista") e
//   o pacote com ".passageiro" / ".motorista" no lugar de ".painel".
//   app.empresaId: id da empresa no painel (padrão: o nome da pasta em tenants/).
// API: APP_URL_API (ex.: http://10.0.2.2:8787 no emulador) ou app.urlApi ou app.urlPainel.
// Push (opcional): google-services.json do Firebase DA EMPRESA, fora do Git, em FIREBASE_GOOGLE_SERVICES_PASSAGEIRO /
//   FIREBASE_GOOGLE_SERVICES_MOTORISTA (caminho) ou em tenants/<empresa>/firebase/google-services-<app>.json.
//   Sem o arquivo, o app sai sem push e segue pelo tempo real com o app aberto.
// Assinatura do AAB: APP_KEYSTORE, APP_KEYSTORE_SENHA, APP_KEY_ALIAS, APP_KEY_SENHA (só no ambiente).
// Precisa: Node 20+, npm install em painel/ e scripts/, JDK 21 (JAVA_HOME) e Android SDK (ANDROID_HOME).

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");
const args = process.argv.slice(2);
const empresa = args.find((a) => !a.startsWith("--"));
const quer = (f) => args.includes(`--${f}`);
const papel = args.find((a) => a.startsWith("--app="))?.slice(6);

function falhar(msg) { console.error(`\n✖ ${msg}\n`); process.exit(1); }
function passo(msg) { console.log(`• ${msg}`); }

if (!empresa || !/^[a-z0-9][a-z0-9-]{1,40}$/.test(empresa)) falhar("Uso: node scripts/build-app-empresa.mjs <empresa> --app=passageiro|motorista [--apk|--aab]");
if (!["passageiro", "motorista"].includes(papel)) falhar("--app precisa ser passageiro ou motorista.");
const pastaEmpresa = path.join(RAIZ, "tenants", empresa);
const arqBrand = path.join(pastaEmpresa, "brand.json");
if (!fs.existsSync(arqBrand)) falhar(`Não achei ${path.relative(RAIZ, arqBrand)}.`);

const marca = JSON.parse(fs.readFileSync(arqBrand, "utf8"));
const base = marca.app ?? {};
const nome = base[papel]?.nome ?? (papel === "motorista" ? `${base.nome ?? ""} Motorista`.trim() : base.nome);
const pacote = base[papel]?.pacote ?? (base.pacote ? `${base.pacote.replace(/\.painel$/, "")}.${papel}` : "");
const urlApi = String(process.env.APP_URL_API ?? base.urlApi ?? base.urlPainel ?? "").replace(/\/+$/, "");
const empresaId = base.empresaId ?? empresa;
const erros = [];
if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(pacote)) erros.push(`app.${papel}.pacote ou app.pacote`);
if (!nome) erros.push("app.nome");
if (!/^https?:\/\/[^\s"'<>]+$/.test(urlApi)) erros.push("app.urlApi ou app.urlPainel (ou a variável APP_URL_API)");
if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(empresaId)) erros.push("app.empresaId");
if (erros.length) falhar(`Falta no brand.json: ${erros.join("; ")}.`);
const cleartext = urlApi.startsWith("http://");
if (cleartext && quer("aab")) falhar("A loja não aceita API sem https. Use https no AAB.");
const cor = (c, p) => (/^#[0-9a-fA-F]{6}$/.test(c ?? "") ? c : p);
const primaria = cor(marca.cores?.primaria, "#2563eb"), fundo = cor(marca.cores?.fundo, "#ffffff");

const asset = (tipo) => {
  const n = marca.arquivos?.[tipo];
  const p = n ? path.join(pastaEmpresa, "assets", path.basename(n)) : null;
  return p && fs.existsSync(p) ? p : null;
};
const icone = asset("iconeApp") ?? asset("favicon");
if (!icone) falhar("Falta o ícone do app (arquivos.iconeApp em assets/, de preferência PNG 1024×1024).");

const saida = path.join(RAIZ, "build", "apps", `${empresa}-${papel}`);
fs.mkdirSync(path.join(saida, "assets"), { recursive: true });
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const rodar = (cmd, a, cwd = saida, env = process.env) => execFileSync(cmd, a, { cwd, stdio: "inherit", env, shell: process.platform === "win32" });
const versao = (p) => JSON.parse(fs.readFileSync(path.join(AQUI, "node_modules", p, "package.json"), "utf8")).version;

// ---------------------------------------------------------------- telas (React) compiladas para dentro do APK
passo(`Compilando o app do ${papel} (${nome})`);
const painel = path.join(RAIZ, "painel");
if (!fs.existsSync(path.join(painel, "node_modules"))) falhar("Rode npm install na pasta painel antes.");
rodar(npx, ["vite", "build", "--config", "vite.apps.config.ts", "--logLevel", "warn"], painel, { ...process.env, APP: papel, SAIDA: path.join(saida, "www") });
fs.writeFileSync(path.join(saida, "www", "config.json"), JSON.stringify({ empresaId, api: urlApi }, null, 2));

// ---------------------------------------------------------------- ícone e abertura
const sharp = (await import("sharp")).default;
passo("Preparando ícone e tela de abertura");
await sharp(icone, { density: 384 }).resize(1024, 1024, { fit: "contain", background: primaria }).png().toFile(path.join(saida, "assets", "icon-only.png"));
await sharp(icone, { density: 384 }).resize(1024, 1024, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(path.join(saida, "assets", "icon-foreground.png"));
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: primaria } }).png().toFile(path.join(saida, "assets", "icon-background.png"));
const abertura = asset("abertura") ?? icone;
const meio = await sharp(abertura, { density: 384 }).resize(asset("abertura") ? 2732 : 900, asset("abertura") ? 2732 : 900, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
await sharp({ create: { width: 2732, height: 2732, channels: 4, background: fundo } }).composite([{ input: meio, gravity: "center" }]).png().toFile(path.join(saida, "assets", "splash.png"));
fs.copyFileSync(path.join(saida, "assets", "splash.png"), path.join(saida, "assets", "splash-dark.png"));

// ---------------------------------------------------------------- projeto Capacitor
const googleServices = [process.env[`FIREBASE_GOOGLE_SERVICES_${papel.toUpperCase()}`], path.join(pastaEmpresa, "firebase", `google-services-${papel}.json`)].find((p) => p && fs.existsSync(p));
passo("Gerando projeto Capacitor");
fs.writeFileSync(path.join(saida, "capacitor.config.json"), JSON.stringify({
  appId: pacote, appName: nome, webDir: "www",
  server: { androidScheme: "https", cleartext },
  android: { backgroundColor: fundo, allowMixedContent: cleartext },
  plugins: { SplashScreen: { backgroundColor: fundo, launchShowDuration: 1200 }, ...(googleServices ? { PushNotifications: { presentationOptions: ["badge", "sound", "alert"] } } : {}) },
}, null, 2));
const deps = { "@capacitor/android": versao("@capacitor/android"), "@capacitor/core": versao("@capacitor/core") };
if (papel === "motorista") deps["@capacitor-community/background-geolocation"] = "1.3.1";
if (googleServices) deps["@capacitor/push-notifications"] = "8.1.3";
fs.writeFileSync(path.join(saida, "package.json"), JSON.stringify({
  name: `app-${empresa}-${papel}`, private: true, version: "1.0.0", dependencies: deps,
  devDependencies: { "@capacitor/cli": versao("@capacitor/cli"), "@capacitor/assets": versao("@capacitor/assets") },
}, null, 2));

if (!quer("apk") && !quer("aab")) {
  console.log(`\n✔ Projeto pronto em ${path.relative(RAIZ, saida)}. Para o APK: node scripts/build-app-empresa.mjs ${empresa} --app=${papel} --apk\n`);
  process.exit(0);
}

passo("Instalando o Capacitor no projeto do app");
rodar(npm, ["install", "--no-audit", "--no-fund"]);
if (!fs.existsSync(path.join(saida, "android"))) { passo("Criando projeto Android"); rodar(npx, ["cap", "add", "android"]); }
passo("Gerando ícones e telas de abertura do Android");
rodar(npx, ["capacitor-assets", "generate", "--android", "--iconBackgroundColor", primaria, "--splashBackgroundColor", fundo]);
rodar(npx, ["cap", "sync", "android"]);

// Permissões: GPS, microfone (áudio do chat) e notificações; motorista também GPS em segundo plano.
const manifesto = path.join(saida, "android", "app", "src", "main", "AndroidManifest.xml");
const perms = ["ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION", "RECORD_AUDIO", "MODIFY_AUDIO_SETTINGS", "POST_NOTIFICATIONS", "VIBRATE"];
if (papel === "motorista") perms.push("ACCESS_BACKGROUND_LOCATION", "FOREGROUND_SERVICE", "FOREGROUND_SERVICE_LOCATION", "WAKE_LOCK");
let xml = fs.readFileSync(manifesto, "utf8");
const faltam = perms.filter((p) => !xml.includes(`android.permission.${p}"`));
if (faltam.length) xml = xml.replace("</manifest>", `${faltam.map((p) => `    <uses-permission android:name="android.permission.${p}" />`).join("\n")}\n</manifest>`);
if (cleartext && !xml.includes("usesCleartextTraffic")) xml = xml.replace("<application", '<application android:usesCleartextTraffic="true"');
fs.writeFileSync(manifesto, xml);

const cores = path.join(saida, "android", "app", "src", "main", "res", "values", "colors.xml");
fs.writeFileSync(cores, `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <color name="colorPrimary">${primaria}</color>\n  <color name="colorPrimaryDark">${primaria}</color>\n  <color name="colorAccent">${primaria}</color>\n</resources>\n`);

const destinoGs = path.join(saida, "android", "app", "google-services.json");
if (googleServices) { passo("Firebase da empresa (push) ligado"); fs.copyFileSync(googleServices, destinoGs); }
else { if (fs.existsSync(destinoGs)) fs.rmSync(destinoGs); passo("Sem google-services.json: o app sai sem push."); }

const gradlew = path.join(saida, "android", process.platform === "win32" ? "gradlew.bat" : "gradlew");
const tarefa = quer("aab") ? "bundleRelease" : "assembleDebug";
const envGradle = { ...process.env };
if (quer("aab")) {
  const { APP_KEYSTORE, APP_KEYSTORE_SENHA, APP_KEY_ALIAS, APP_KEY_SENHA } = process.env;
  if (!APP_KEYSTORE || !APP_KEYSTORE_SENHA || !APP_KEY_ALIAS || !APP_KEY_SENHA) falhar("Para --aab defina APP_KEYSTORE, APP_KEYSTORE_SENHA, APP_KEY_ALIAS e APP_KEY_SENHA (nunca no repositório).");
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
const final = path.join(saida, `${empresa}-${papel}${quer("aab") ? ".aab" : "-teste.apk"}`);
fs.copyFileSync(gerado, final);
console.log(`\n✔ Pronto: ${path.relative(RAIZ, final)}\n`);
