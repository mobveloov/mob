#!/usr/bin/env node
// Gera os sons originais dos apps (chamada, mensagem, aceite, alerta, cancelado) como arquivos WAV mono de 16 bits.
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
const nota = (freq, ini, dur, vol = 0.5) => ({ freq, ini, dur, vol });

function sintetizar(notas, total) {
  const n = Math.ceil(total * TAXA);
  const amostras = new Float32Array(n);
  for (const { freq, ini, dur, vol } of notas) {
    const a = Math.floor(ini * TAXA), b = Math.min(n, Math.floor((ini + dur) * TAXA));
    for (let i = a; i < b; i++) {
      const t = (i - a) / TAXA, x = (i - a) / (b - a);
      // ataque rápido (8 ms) e queda suave até o fim da nota
      const env = Math.min(1, t / 0.008) * Math.pow(1 - x, 1.6);
      const onda = Math.sin(2 * Math.PI * freq * t) + 0.3 * Math.sin(2 * Math.PI * freq * 2 * t) + 0.1 * Math.sin(2 * Math.PI * freq * 3 * t);
      amostras[i] += onda * env * vol;
    }
  }
  return amostras;
}

function wav(amostras) {
  const dados = Buffer.alloc(amostras.length * 2);
  let pico = 0;
  for (const v of amostras) pico = Math.max(pico, Math.abs(v));
  const ganho = pico > 0.9 ? 0.9 / pico : 1;
  amostras.forEach((v, i) => dados.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * ganho * 32767))), i * 2));
  const cab = Buffer.alloc(44);
  cab.write("RIFF", 0); cab.writeUInt32LE(36 + dados.length, 4); cab.write("WAVE", 8); cab.write("fmt ", 12);
  cab.writeUInt32LE(16, 16); cab.writeUInt16LE(1, 20); cab.writeUInt16LE(1, 22); cab.writeUInt32LE(TAXA, 24);
  cab.writeUInt32LE(TAXA * 2, 28); cab.writeUInt16LE(2, 32); cab.writeUInt16LE(16, 34); cab.write("data", 36); cab.writeUInt32LE(dados.length, 40);
  return Buffer.concat([cab, dados]);
}

const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5, A4 = 440, D5 = 587.33;

const SONS = {
  // Corrida nova: arpejo ascendente em dois ciclos, para chamar a atenção e dar para repetir em laço.
  chamada: { total: 2.4, notas: [C5, E5, G5, C6, 0, C5, E5, G5, C6].flatMap((f, i) => (f ? [nota(f, i * 0.22, 0.34, 0.55)] : [])) },
  // Mensagem do chat: duas notas curtas.
  mensagem: { total: 0.7, notas: [nota(G5, 0, 0.22, 0.5), nota(C6, 0.16, 0.4, 0.5)] },
  // Corrida aceita / confirmação: subida curta e alegre.
  aceite: { total: 0.8, notas: [nota(C5, 0, 0.18, 0.5), nota(E5, 0.14, 0.18, 0.5), nota(G5, 0.28, 0.45, 0.55)] },
  // Alerta (motorista chegou, aviso insistente): três toques iguais.
  alerta: { total: 1.3, notas: [0, 0.4, 0.8].map((t) => nota(A4 * 2, t, 0.28, 0.55)) },
  // Corrida cancelada: descida em duas notas.
  cancelado: { total: 0.9, notas: [nota(E5, 0, 0.3, 0.5), nota(A4, 0.26, 0.55, 0.5)] },
};

fs.mkdirSync(SAIDA, { recursive: true });
for (const [nome, { total, notas }] of Object.entries(SONS)) {
  const buf = wav(sintetizar(notas, total));
  fs.writeFileSync(path.join(SAIDA, `${nome}.wav`), buf);
  console.log(`✔ ${nome}.wav  ${(buf.length / 1024).toFixed(0)} KB`);
}
void D5;
