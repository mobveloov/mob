// Teste portado do sistema de referência (regras do bot), sem alterar as regras.
// node --experimental-strip-types supabase/functions/_shared/geminiTts.test.ts
import assert from "node:assert/strict";
import { geminiAudioFrom, geminiTtsBody, geminiVoiceName, pcmToWav, pickGeminiTtsModel } from "../src/bot/voz-gemini.ts";

// modelos que a chave tinha em 20/10/2026: o flash-lite mais novo e o mais rapido
const IDS = ["gemini-2.5-flash", "gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts", "gemini-3.1-flash-tts-preview",
  "gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts"];
assert.equal(pickGeminiTtsModel(IDS), "gemini-3.8-flash-lite-tts");
assert.equal(pickGeminiTtsModel(["gemini-2.5-flash-preview-tts", "gemini-3.8-flash-tts"]), "gemini-3.8-flash-tts");
assert.equal(pickGeminiTtsModel(["gemini-2.5-flash"]), null, "sem modelo de voz");

assert.equal(geminiVoiceName("puck"), "Puck");
assert.equal(geminiVoiceName("nova"), "Kore", "voz da OpenAI nao existe no Gemini: padrao");
assert.deepEqual((geminiTtsBody("oi") as any).generationConfig.responseModalities, ["AUDIO"]);

// wav pronto passa direto
const wav = geminiAudioFrom({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/wav", data: "UklGRg==" } }] } }] });
assert.deepEqual(wav, { audioBase64: "UklGRg==", mimeType: "audio/wav" });
// PCM cru ganha o cabecalho WAV (44 bytes)
const pcm = btoa(String.fromCharCode(1, 2, 3, 4));
const conv = geminiAudioFrom({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/L16;codec=pcm;rate=24000", data: pcm } }] } }] });
assert.equal(conv?.mimeType, "audio/wav");
assert.equal(atob(conv!.audioBase64).slice(0, 4), "RIFF");
assert.equal(atob(conv!.audioBase64).length, 48);
assert.equal(pcmToWav(new Uint8Array(10)).length, 54);
assert.equal(geminiAudioFrom({ candidates: [] }), null);
console.log("geminiTts ok");
