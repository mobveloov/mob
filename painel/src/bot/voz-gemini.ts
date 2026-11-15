// (20/10/2026) Voz do bot pela chave do GEMINI cadastrada em Integracoes Avancadas (pedido do dono: seguir as chaves
// cadastradas — 4 Groq + 1 Google). A Groq nao tem voz em portugues; o Gemini tem. Antes a voz caia numa
// OPENAI_API_KEY de exemplo do .env (HTTP 401 em todo audio).
// Medido na VPS (20/10): gemini-3.8-flash-lite-tts 2,2-2,8 s (devolve wav); 3.8-flash-tts 3,7-3,9 s; 2.5-flash 6 s.
//
// Teste: node --experimental-strip-types supabase/functions/_shared/geminiTts.test.ts

/** Modelo de voz mais rapido que a chave tem (o Google troca os nomes: escolhe pelo padrao). */
export function pickGeminiTtsModel(available: string[]): string | null {
  const tts = available.filter((id) => /tts/i.test(id));
  const versao = (id: string) => Number((/gemini-(\d+(?:\.\d+)?)/i.exec(id) ?? [])[1] ?? 0);
  const ordem = (id: string) => (/flash-lite/i.test(id) ? 0 : /flash/i.test(id) ? 1 : 2) * 100 - versao(id) + (/preview/i.test(id) ? 0.5 : 0);
  return [...tts].sort((a, b) => ordem(a) - ordem(b))[0] ?? null;
}

/** Vozes prontas do Gemini; a voz escolhida nas Opcoes da Corrida vale se for uma delas. */
const VOZES = ["Kore", "Puck", "Charon", "Fenrir", "Aoede", "Leda", "Orus", "Zephyr"];
export function geminiVoiceName(voice?: string | null): string {
  const v = String(voice ?? "").trim().toLowerCase();
  return VOZES.find((x) => x.toLowerCase() === v) ?? "Kore";
}

export function geminiTtsBody(text: string, voice?: string | null): Record<string, unknown> {
  return {
    contents: [{ parts: [{ text }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: geminiVoiceName(voice) } } },
    },
  };
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** PCM 16 bits mono (o que alguns modelos devolvem) -> arquivo WAV. */
export function pcmToWav(pcm: Uint8Array, rate = 24000): Uint8Array {
  const h = new DataView(new ArrayBuffer(44));
  const txt = (o: number, t: string) => { for (let i = 0; i < 4; i++) h.setUint8(o + i, t.charCodeAt(i)); };
  txt(0, "RIFF"); h.setUint32(4, 36 + pcm.length, true); txt(8, "WAVE"); txt(12, "fmt ");
  h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true); h.setUint32(24, rate, true);
  h.setUint32(28, rate * 2, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true); txt(36, "data");
  h.setUint32(40, pcm.length, true);
  const out = new Uint8Array(44 + pcm.length);
  out.set(new Uint8Array(h.buffer), 0);
  out.set(pcm, 44);
  return out;
}

/** Resposta do generateContent -> audio pronto para o WhatsApp (base64 + tipo). null = sem audio. */
export function geminiAudioFrom(json: unknown): { audioBase64: string; mimeType: string } | null {
  const parts = ((json as { candidates?: Array<{ content?: { parts?: unknown[] } }> } | null)?.candidates?.[0]?.content?.parts ?? []) as
    Array<{ inlineData?: { data?: string; mimeType?: string } }>;
  const inl = parts.find((p) => p?.inlineData?.data)?.inlineData;
  if (!inl?.data) return null;
  const mime = String(inl.mimeType ?? "").toLowerCase();
  if (/wav|mpeg|mp3|ogg|opus/.test(mime)) return { audioBase64: inl.data, mimeType: mime.split(";")[0] };
  // audio/L16;rate=24000 (PCM cru): poe o cabecalho WAV
  const rate = Number((/rate=(\d+)/.exec(mime) ?? [])[1] ?? 24000);
  return { audioBase64: bytesToB64(pcmToWav(b64ToBytes(inl.data), rate)), mimeType: "audio/wav" };
}
