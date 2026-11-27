// Voz dos avisos dos apps: escolha da voz do aparelho (opção manual). A voz do servidor é testada em voz-servidor.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-voz-apps-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
delete process.env.BANCO_ARQUIVO;

const { escolherVoz, notaDaVoz } = await import("../src/apps/web/comum/voz.ts");
const B = await import("../src/servidor/banco.ts");
test.after(() => { B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

test("escolhe a voz neural/de rede pt-BR antes da compacta e ignora outros idiomas", () => {
  const vozes = [
    { name: "English US", lang: "en-US", localService: true },
    { name: "Portuguese Brazil compact", lang: "pt-BR", localService: true },
    { name: "Português (Brasil) Google", lang: "pt-BR", localService: false },
    { name: "Microsoft Francisca Online (Natural)", lang: "pt-BR", localService: false },
    { name: "Português Portugal", lang: "pt-PT", localService: true },
  ];
  assert.equal(escolherVoz(vozes)?.name, "Microsoft Francisca Online (Natural)");
  assert.equal(escolherVoz(vozes.slice(0, 3))?.name, "Português (Brasil) Google");
  assert.equal(escolherVoz(vozes, "Portuguese Brazil compact")?.name, "Portuguese Brazil compact", "a escolha da pessoa vale");
  assert.equal(escolherVoz([vozes[0]]), null, "sem português: só toque");
  assert.ok(notaDaVoz(vozes[4]) < notaDaVoz(vozes[1]), "pt-PT fica atrás de pt-BR");
});

