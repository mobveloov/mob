// Garante que nenhum texto visível ao usuário cite a marca de concorrentes
// (Machine, Taximachine, Lélio, 88 Pop). Só olha literais de texto, nunca comentários.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";

const RAIZ = join(import.meta.dirname, "..", "src");
const PROIBIDO = /machine|taximachine|lélio|lelio|88 pop/i;

// Exceções justificadas: literais técnicos que o usuário não lê como marca.
// (arquivo relativo a src, trecho exato do literal)
const EXCECOES: Array<{ arquivo: string; literal: string; motivo: string }> = [
  // Nenhuma hoje. Se a integração técnica externa precisar do nome da API, liste aqui com o motivo.
];

function arquivos(dir: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) {
      if (relative(RAIZ, p).split(sep).join("/") === "apps/web") continue; // apps: outra sessão
      arquivos(p, saida);
    } else if (/\.(ts|tsx)$/.test(nome)) saida.push(p);
  }
  return saida;
}

function textos(arq: string): Array<{ texto: string; linha: number }> {
  const src = readFileSync(arq, "utf8");
  const sf = ts.createSourceFile(arq, src, ts.ScriptTarget.Latest, true, arq.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const achados: Array<{ texto: string; linha: number }> = [];
  const visita = (n: ts.Node) => {
    let texto: string | null = null;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      const pai = n.parent;
      const modulo = (ts.isImportDeclaration(pai) || ts.isExportDeclaration(pai) || ts.isExternalModuleReference(pai) || ts.isImportTypeNode(pai) || ts.isLiteralTypeNode(pai)) && true;
      if (!modulo) texto = n.text;
    } else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) texto = n.text;
    else if (ts.isJsxText(n)) texto = n.text;
    if (texto !== null && PROIBIDO.test(texto)) {
      achados.push({ texto, linha: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1 });
    }
    ts.forEachChild(n, visita);
  };
  visita(sf);
  return achados;
}

test("nenhum texto visível cita Machine, Taximachine, Lélio ou 88 Pop", () => {
  const erros: string[] = [];
  for (const arq of arquivos(RAIZ)) {
    const rel = relative(RAIZ, arq).split(sep).join("/");
    for (const a of textos(arq)) {
      if (EXCECOES.some((e) => e.arquivo === rel && e.literal === a.texto)) continue;
      erros.push(`${rel}:${a.linha}  ${a.texto.slice(0, 120).replace(/\s+/g, " ")}`);
    }
  }
  assert.deepEqual(erros, [], "textos com marca de concorrente:\n" + erros.join("\n"));
});
