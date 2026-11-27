// Nenhum item do menu pode cair em "Em breve": todo id de src/comum/funcoes.ts tem tela (registro das frentes ou provisória do Autenticado).
// O teste lê os arquivos como texto (o registro usa import.meta.glob, que só existe no Vite).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { FUNCOES } from "../src/comum/funcoes.ts";

const src = path.resolve(import.meta.dirname, "../src/web");

function idsDasFrentes(): Set<string> {
  const ids = new Set<string>();
  for (const d of fs.readdirSync(path.join(src, "telas"), { withFileTypes: true })) {
    const p = path.join(src, "telas", d.name, "index.tsx");
    if (!d.isDirectory() || !fs.existsSync(p)) continue;
    const t = fs.readFileSync(p, "utf8");
    const i = t.search(/export const TELAS_/);
    if (i < 0) continue;
    for (const m of t.slice(i).matchAll(/^\s*(?:"([^"]+)"|([A-Za-z_][\w]*))\s*:/gm)) ids.add(m[1] ?? m[2]);
  }
  return ids;
}
function idsProvisorias(): Set<string> {
  const t = fs.readFileSync(path.join(src, "Autenticado.tsx"), "utf8");
  const bloco = t.slice(t.indexOf("const PROVISORIAS"), t.indexOf("const tela ="));
  return new Set([...bloco.matchAll(/(?:"([^"]+)"|\b([A-Za-z][\w-]*)):\s*(?:<|cad\()/g)].map((m) => m[1] ?? m[2]));
}

test("todo item do menu tem tela (nada de 'Em breve')", () => {
  const tem = new Set([...idsDasFrentes(), ...idsProvisorias()]);
  const sem = FUNCOES.filter((f) => !tem.has(f.id)).map((f) => f.id);
  assert.deepEqual(sem, [], `itens do menu sem tela: ${sem.join(", ")}`);
  assert.ok(FUNCOES.length > 95);
});

test("não existe tela 'Cidades' no menu (não existe na Machine)", () => {
  assert.ok(!FUNCOES.some((f) => /^cidades$/i.test(f.id) || /^cidades$/i.test(f.nome)));
});

test("o painel não tem mais o texto 'Em breve nesta versão' nem o componente Em construção", () => {
  const achados: string[] = [];
  const varrer = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) varrer(p);
      else if (/\.tsx?$/.test(e.name) && /Em breve nesta versão|EmConstrucao|Em construção/.test(fs.readFileSync(p, "utf8").replace(/Todo item do menu.*|Em construção/g, (x) => (x === "Em construção" ? "Em construção" : "")))) achados.push(p);
    }
  };
  varrer(src);
  assert.deepEqual(achados.map((p) => path.relative(src, p)), []);
});
