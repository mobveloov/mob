// Cria uma empresa a partir de tenants/<empresa>/brand.json + assets/ (uso: npm run empresa:importar -- ../tenants/exemplo).
// Opcional: --admin email@exemplo.com --nome "Fulano" (a senha é pedida pela variável ADMIN_SENHA, nunca na linha de comando).

import fs from "node:fs";
import path from "node:path";
import { sanearMarca, TIPOS_ARQUIVO } from "../comum/marca.ts";
import { criarEmpresa, criarUsuario, marca, salvarImagem, salvarMarca } from "./dados.ts";

if (fs.existsSync(".env")) process.loadEnvFile(".env");

const args = process.argv.slice(2);
const pasta = args.find((a) => !a.startsWith("--"));
const opt = (k: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
if (!pasta) { console.error("Uso: npm run empresa:importar -- <pasta da empresa> [--admin email --nome Nome]"); process.exit(1); }

const brand = JSON.parse(fs.readFileSync(path.join(pasta, "brand.json"), "utf8"));
const m = sanearMarca(brand);
const e = criarEmpresa(m.nomeExibido, m);
const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml", ico: "image/x-icon" };
const final = marca(e.id);
for (const tipo of TIPOS_ARQUIVO) {
  const arq = (brand.arquivos ?? {})[tipo];
  if (!arq) continue;
  const origem = path.join(pasta, "assets", path.basename(String(arq)));
  if (!fs.existsSync(origem)) { console.warn(`Aviso: ${origem} não existe.`); continue; }
  final.arquivos[tipo] = salvarImagem(e.id, tipo, MIME[origem.split(".").pop()!.toLowerCase()] ?? "", fs.readFileSync(origem));
}
salvarMarca(e.id, final);
const email = opt("admin");
if (email) {
  const senha = process.env.ADMIN_SENHA ?? "";
  if (!senha) { console.error("Defina ADMIN_SENHA para criar o administrador."); process.exit(1); }
  criarUsuario({ email, nome: opt("nome") ?? email, senha, empresaId: e.id, papel: "admin" });
}
console.log(`Empresa criada: ${e.nome} (id ${e.id}).`);
