// Teste portado do sistema de referência (regras do bot), sem alterar as regras.
// Rode com: node --experimental-strip-types supabase/functions/_shared/voiceReply.test.ts
import assert from "node:assert/strict";
import { buildWhisperPrompt, bytesToBase64, cleanVoice, speakableText, VOICE_MAX_CHARS } from "../src/bot/voz-texto.ts";

assert.equal(speakableText("✅ Corrida *confirmada*!\nMotorista: João"), "Corrida confirmada! Motorista: João");
assert.equal(speakableText("Acompanhe: https://veloov.com/r/abc"), "Acompanhe:");
assert.equal(speakableText("🚗🚗"), null, "so emoji nao vira audio");
assert.equal(speakableText("x".repeat(VOICE_MAX_CHARS + 10)), null, "texto longo fica so escrito");
assert.equal(speakableText(""), null);
assert.equal(speakableText("1️⃣ Pedir corrida\n2️⃣ Falar com suporte"), "1 Pedir corrida. 2 Falar com suporte");

const big = new Uint8Array(300_000).map((_, i) => i % 256);
assert.equal(Buffer.from(bytesToBase64(big), "base64").length, 300_000, "audio grande sem estourar a pilha");
assert.equal(bytesToBase64(new Uint8Array([104, 105])), "aGk=");

assert.equal(buildWhisperPrompt(["Leme", "leme", "Araras"], ["Rodoviária"], ["Rua Sete de Setembro", "Avenida Joaquim Lopes"]),
  "Corrida em Leme, Araras. Lugares: Rodoviária. Ruas: Rua Sete de Setembro, Avenida Joaquim Lopes.");
assert.equal(buildWhisperPrompt([], [], []), "");
const longP = buildWhisperPrompt(["Leme"], [], Array.from({ length: 200 }, (_, i) => `Rua Número ${i}`));
assert.ok(longP.length <= 601 && longP.endsWith("."), "dica curta");
assert.equal(cleanVoice("pm_alex"), "pm_alex");
assert.equal(cleanVoice("af_bella"), "pf_dora");

console.log("voiceReply ok");
