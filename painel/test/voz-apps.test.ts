// Voz dos avisos dos apps: escolha da melhor voz pt-BR do aparelho e voz do painel (Gemini) com cache e limite.
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
const { textoDeVoz, vozDoApp, vozDisponivel } = await import("../src/apps/voz.ts");
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

test("texto de voz: curto, sem link", () => {
  assert.equal(textoDeVoz("  Seu motorista   está a caminho. "), "Seu motorista está a caminho.");
  assert.equal(textoDeVoz("x".repeat(141)), null);
  assert.equal(textoDeVoz("veja https://exemplo.com"), null);
  assert.equal(textoDeVoz(42), null);
});

const gemini = (fetchs: string[]) => (async (url: string | URL | Request) => {
  fetchs.push(String(url));
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/wav", data: Buffer.from("RIFFfake").toString("base64") } }] } }] }), { status: 200 });
}) as unknown as typeof fetch;

test("voz do painel: sintetiza, guarda em cache e respeita o limite por pessoa", async () => {
  const chavesEmpresa = { GEMINI_API_KEY: "chave-de-teste" } as Record<string, string>;
  assert.equal(vozDisponivel("sem-chave", { chavesEmpresa: {}, env: {} }), false);
  assert.equal(vozDisponivel("com-chave", { chavesEmpresa, env: {} }), true);
  const chamadas: string[] = [];
  const deps = { fetch: gemini(chamadas), chavesEmpresa, env: {} };
  const a = await vozDoApp("emp", "pessoa-1", "Seu motorista está a caminho.", "Kore", deps);
  assert.ok(a && a !== "limite" && a.audio.bytes.length > 0 && !a.cache);
  const b = await vozDoApp("emp", "pessoa-1", "Seu motorista está a caminho.", "Kore", deps);
  assert.ok(b && b !== "limite" && b.cache, "segunda vez vem do cache");
  assert.equal(chamadas.length, 1, "o Gemini só foi chamado uma vez");
  let limite = false;
  for (let i = 0; i < 45 && !limite; i++) limite = (await vozDoApp("emp", "pessoa-2", `Frase número ${i}.`, "Kore", deps)) === "limite";
  assert.ok(limite, "mais de 40 pedidos novos por minuto são barrados");
});
