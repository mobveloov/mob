// Cadastra um anúncio (banner "app") de TESTE na pasta de dados de teste: DADOS_DIR=<pasta> npx tsx ../scripts/teste/apps-banner-seed.ts up-corridas
import fs from "node:fs";
import { adicionarBanner } from "../../painel/src/config/gerais.ts";
const b = adicionarBanner(process.argv[2] ?? "up-corridas", "image/png", fs.readFileSync(new URL("./_anuncio.png", import.meta.url)), "", "app");
console.log("anúncio de teste criado", b.id);
