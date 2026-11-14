#!/usr/bin/env node
// Gera os sons originais dos apps (chamada, mensagem, aceite, alerta, cancelado, buzina) como arquivos WAV mono de 16 bits.
// São sintetizados aqui (ondas senoidais com envelope), então são do projeto e podem ser trocados à vontade:
//
//   node scripts/gerar-sons.mjs
//
// Saída: painel/src/apps/web/comum/sons/*.wav (usados pelos apps) e a mesma coisa vira recurso do Android no build.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SAIDA = path.join(RAIZ, "painel", "src", "apps", "web", "comum", "sons");
const TAXA = 22050;

/** Uma nota: frequência (Hz), início e duração (s), volume 0..1. Soma harmônicos leves para soar menos "bip de máquina". */
const nota = (freq, ini, dur, vol = 0.5, timbre = "suave") => ({ freq, ini, dur, vol, timbre });

function sintetizar(notas, total) {
  const n = Math.ceil(total * TAXA);
  const amostras = new Float32Array(n);
  for (const { freq, ini, dur, vol, timbre } of notas) {
    const a = Math.floor(ini * TAXA), b = Math.min(n, Math.floor((ini + dur) * TAXA));
    for (let i = a; i < b; i++) {
      const t = (i - a) / TAXA, x = (i - a) / (b - a);
      let env, onda;
      if (timbre === "forte") {
        // Toque cheio e metálico (campainha/buzina): harmônicos ímpares fortes, ataque de 5 ms, quase sem queda (sustenta e corta no fim).
        env = Math.min(1, t / 0.005) * Math.min(1, (b - i) / (TAXA * 0.02));
        onda = 0; for (let h = 1; h <= 9; h += 2) onda += Math.sin(2 * Math.PI * freq * h * t) / h;
        onda *= 1.25;
      } else {
        // ataque rápido (8 ms) e queda suave até o fim da nota
        env = Math.min(1, t / 0.008) * Math.pow(1 - x, 1.2);
        onda = Math.sin(2 * Math.PI * freq * t) + 0.3 * Math.sin(2 * Math.PI * freq * 2 * t) + 0.1 * Math.sin(2 * Math.PI * freq * 3 * t);
      }
      amostras[i] += onda * env * vol;
    }
  }
  // Compressão leve: levanta o volume médio sem estourar (sons curtos e bem audíveis no aparelho).
  for (let i = 0; i < n; i++) amostras[i] = Math.tanh(amostras[i] * 1.9);
  return amostras;
}

function wav(amostras) {
  const dados = Buffer.alloc(amostras.length * 2);
  let pico = 0;
  for (const v of amostras) pico = Math.max(pico, Math.abs(v));
  const ganho = pico > 0 ? 0.97 / pico : 1;
  amostras.forEach((v, i) => dados.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * ganho * 32767))), i * 2));
  const cab = Buffer.alloc(44);
  cab.write("RIFF", 0); cab.writeUInt32LE(36 + dados.length, 4); cab.write("WAVE", 8); cab.write("fmt ", 12);
  cab.writeUInt32LE(16, 16); cab.writeUInt16LE(1, 20); cab.writeUInt16LE(1, 22); cab.writeUInt32LE(TAXA, 24);
  cab.writeUInt32LE(TAXA * 2, 28); cab.writeUInt16LE(2, 32); cab.writeUInt16LE(16, 34); cab.write("data", 36); cab.writeUInt32LE(dados.length, 40);
  return Buffer.concat([cab, dados]);
}

const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5, A4 = 440, D5 = 587.33;

const F4 = 349.23, AS4 = 466.16, G4 = 392, B5 = 987.77, E6 = 1318.5;
/** Repete um grupo de notas em vários instantes. */
const repetir = (notas, inicios) => inicios.flatMap((t0) => notas.map((n) => ({ ...n, ini: n.ini + t0 })));

const SONS = {
  // Corrida nova (chamada do motorista): toque de telefone forte, dois tons alternados em rajadas — para ninguém perder. Dá para repetir em laço.
  chamada: { total: 2.6, notas: repetir([nota(B5, 0, 0.12, 0.7, "forte"), nota(E6, 0.13, 0.12, 0.7, "forte"), nota(B5, 0.26, 0.12, 0.7, "forte"), nota(E6, 0.39, 0.12, 0.7, "forte")], [0, 0.7, 1.4, 2.1]) },
  // Mensagem do chat: duas notas curtas, mais cheias.
  mensagem: { total: 0.7, notas: [nota(G5, 0, 0.2, 0.7, "forte"), nota(C6, 0.18, 0.36, 0.7, "forte")] },
  // Corrida aceita: fanfarra curta de três notas subindo e acorde final.
  aceite: { total: 1.1, notas: [nota(C5, 0, 0.16, 0.7, "forte"), nota(E5, 0.15, 0.16, 0.7, "forte"), nota(G5, 0.3, 0.16, 0.7, "forte"), nota(C6, 0.45, 0.6, 0.6, "forte"), nota(G5, 0.45, 0.6, 0.4, "forte"), nota(E5, 0.45, 0.6, 0.4, "forte")] },
  // Alerta insistente: três toques fortes iguais.
  alerta: { total: 1.3, notas: [0, 0.4, 0.8].map((t) => nota(A4 * 2, t, 0.28, 0.75, "forte")) },
  // Corrida cancelada: descida em duas notas.
  cancelado: { total: 0.95, notas: [nota(E5, 0, 0.3, 0.7, "forte"), nota(A4, 0.26, 0.6, 0.7, "forte")] },
  // Buzina de carro (motorista no local): dois tons juntos, "bi-bii" — curta e muito audível.
  buzina: { total: 1.35, notas: [
    nota(F4, 0, 0.32, 0.65, "forte"), nota(AS4, 0, 0.32, 0.65, "forte"),
    nota(F4, 0.5, 0.75, 0.65, "forte"), nota(AS4, 0.5, 0.75, 0.65, "forte"),
  ] },
};

fs.mkdirSync(SAIDA, { recursive: true });
for (const [nome, { total, notas }] of Object.entries(SONS)) {
  const buf = wav(sintetizar(notas, total));
  fs.writeFileSync(path.join(SAIDA, `${nome}.wav`), buf);
  console.log(`✔ ${nome}.wav  ${(buf.length / 1024).toFixed(0)} KB`);
}
void D5;
