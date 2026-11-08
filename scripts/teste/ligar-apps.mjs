#!/usr/bin/env node
// SÓ PARA O AMBIENTE DE TESTE NO DOCKER (docker-compose.apps-teste.yml): liga as rotas dos apps no
// painel/src/servidor/index.ts DENTRO DA IMAGEM, com as mesmas linhas de docs/APPS.md ("Ligações nos arquivos comuns").
// Não muda nada no Git. Se a sessão Base já tiver ligado (o arquivo já tem "rotasApps"), não faz nada.
//
//   node scripts/teste/ligar-apps.mjs painel/src/servidor/index.ts

import fs from "node:fs";

const arq = process.argv[2] ?? "painel/src/servidor/index.ts";
let s = fs.readFileSync(arq, "utf8").replace(/\r\n/g, "\n"); // checkout no Windows vem com CRLF
if (s.includes("rotasApps")) { console.log("• index.ts já tem as rotas dos apps: nada a fazer."); process.exit(0); }

const trocas = [
  ['import { rotasEnderecos } from "../enderecos/rotas.ts";\n',
    'import { rotasEnderecos } from "../enderecos/rotas.ts";\nimport { rotasApps, rotasAppsCentral } from "../apps/rotas.ts";\nimport { iniciarApps } from "../apps/despacho.ts";\n'],
  ['app.use("/api/totem", rotasTotem);\n', 'app.use("/api/totem", rotasTotem);\napp.use("/api/apps", rotasApps);\n'],
  ['app.use("/api/enderecos", rotasEnderecos);\n', 'app.use("/api/enderecos", rotasEnderecos);\napp.use("/api/apps-central", rotasAppsCentral);\n'],
  ["// Produção: serve o painel compilado",
    'const distApps = path.resolve("dist-apps");\nif (fs.existsSync(distApps)) app.use("/apps", express.static(distApps));\n\n// Produção: serve o painel compilado'],
  ["encerrarSemMotorista(e.id).catch(() => undefined); }, 60_000).unref();\n",
    "encerrarSemMotorista(e.id).catch(() => undefined); }, 60_000).unref();\n  iniciarApps();\n"],
];
for (const [de, para] of trocas) {
  if (!s.includes(de)) { console.error(`✖ Não achei no index.ts: ${de.trim().slice(0, 60)}… Ligue à mão (docs/APPS.md).`); process.exit(1); }
  s = s.replace(de, para);
}
fs.writeFileSync(arq, s);
console.log("• Rotas dos apps ligadas no index.ts da imagem de teste.");
