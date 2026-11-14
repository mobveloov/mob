// Importa um arquivo de correções de endereços (casas) para o banco do painel:
//   npm run importar-casas -- caminho/do/arquivo.tsv
// Pode rodar de novo com o mesmo arquivo (atualiza, não duplica). Só lê o arquivo que você passar.
import fs from "node:fs";
import { importarCorrecoes, totalCorrecoes } from "./correcoes.ts";
import { fecharBanco } from "../servidor/banco.ts";

const arquivo = process.argv[2];
if (!arquivo || !fs.existsSync(arquivo)) { console.error("Uso: npm run importar-casas -- caminho/do/arquivo.tsv"); process.exit(1); }
const r = importarCorrecoes(fs.readFileSync(arquivo, "utf8"));
console.log(`Casas importadas: ${r.importadas}. Linhas ignoradas: ${r.ignoradas}. Total na base: ${totalCorrecoes()}.`);
fecharBanco();
