#!/usr/bin/env node
// Gera, do zero (síntese própria, sem amostras de terceiros), os toques do motorista e os sons do passageiro:
//
//   node scripts/gerar-toques.mjs
//
// Saída em painel/src/apps/web/comum/sons/*.wav (mono, 16 bits, 22,05 kHz):
//   toque_corrida, toque_pulso, toque_campanario, toque_radar   toques da chamada do motorista: altos, brilhantes, feitos para tocar em laço dentro do carro
//   aceite, buzina, iniciada, finalizada, mensagem, cancelado   sons do passageiro: curtos, suaves, tipo app de mobilidade
//
// Os toques do motorista seguem a "vibe" de um toque de celular clássico (arpejo rápido subindo + sino brilhante + pausa), mas a melodia,
// o tom (Mi maior) e o timbre são originais. Nada aqui copia nota a nota nenhum arquivo de referência.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SAIDA = path.join(RAIZ, "painel", "src", "apps", "web", "comum", "sons");
const TAXA = 22050;

// Notas (Hz)
const N = { C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880, B4: 493.88, Gs5: 830.61, B5: 987.77, Cs6: 1108.7, E6: 1318.5, Fs6: 1480, Gs6: 1661.2, B6: 1975.5, A4: 440, E4: 329.63, G4: 392, C6: 1046.5, G6: 1568, C7: 2093 };

const TIMBRES = {
  // Sino brilhante: parciais inarmônicos com queda rápida nos agudos (som de campainha cristalina).
  sino: { parciais: [[1, 1, 3.2], [2.76, 0.5, 5], [5.4, 0.3, 8], [8.93, 0.14, 12]], ataque: 0.004 },
  // Sino cheio e quente (toque forte): mais corpo nos graves.
  sinoForte: { parciais: [[1, 1, 2.2], [2, 0.7, 3], [3, 0.5, 4], [4.07, 0.3, 6], [5.43, 0.2, 9]], ataque: 0.003 },
  // Som suave de app: seno com um toque do 2º harmônico, ataque macio.
  suave: { parciais: [[1, 1, 4], [2, 0.18, 6]], ataque: 0.014 },
};

/** Nota: freq (Hz), ini e dur (s), vol 0..1, timbre. A nota soa por `dur` com queda exponencial; `corte` apaga o final para não dar estalo. */
const nota = (freq, ini, dur, vol, timbre, extra = {}) => ({ freq, ini, dur, vol, timbre, ...extra });

function sintetizar(notas, total, drive = 1) {
  const n = Math.ceil(total * TAXA);
  const a = new Float32Array(n);
  for (const { freq, ini, dur, vol, timbre, de, ate } of notas) {
    const T = TIMBRES[timbre] ?? TIMBRES.suave;
    const i0 = Math.floor(ini * TAXA), i1 = Math.min(n, Math.floor((ini + dur) * TAXA));
    let fase = 0;
    for (let i = i0; i < i1; i++) {
      const t = (i - i0) / TAXA, x = (i - i0) / (i1 - i0);
      // Varredura (chirp) opcional: de → ate ao longo da nota.
      const f = de != null ? de + (ate - de) * x : freq;
      fase += (2 * Math.PI * f) / TAXA;
      const corte = Math.min(1, (i1 - i) / (TAXA * 0.012));
      const ataque = Math.min(1, t / T.ataque);
      let s = 0;
      for (const [razao, amp, queda] of T.parciais) s += amp * Math.sin(fase * razao) * Math.exp(-t * queda * (timbre === "suave" ? 1 : 1));
      a[i] += s * ataque * corte * vol;
    }
  }
  if (drive > 1) for (let i = 0; i < n; i++) a[i] = Math.tanh(a[i] * drive);
  return a;
}

function wav(amostras, alvo = 0.95) {
  let pico = 0;
  for (const v of amostras) pico = Math.max(pico, Math.abs(v));
  const g = pico > 0 ? alvo / pico : 1;
  const dados = Buffer.alloc(amostras.length * 2);
  amostras.forEach((v, i) => dados.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * g * 32767))), i * 2));
  const cab = Buffer.alloc(44);
  cab.write("RIFF", 0); cab.writeUInt32LE(36 + dados.length, 4); cab.write("WAVE", 8); cab.write("fmt ", 12);
  cab.writeUInt32LE(16, 16); cab.writeUInt16LE(1, 20); cab.writeUInt16LE(1, 22); cab.writeUInt32LE(TAXA, 24);
  cab.writeUInt32LE(TAXA * 2, 28); cab.writeUInt16LE(2, 32); cab.writeUInt16LE(16, 34); cab.write("data", 36); cab.writeUInt32LE(dados.length, 40);
  return Buffer.concat([cab, dados]);
}

const repetir = (notas, inicios) => inicios.flatMap((t0) => notas.map((n) => ({ ...n, ini: n.ini + t0 })));

const SONS = {
  // ---------------------------------------------------------------- motorista (3 toques, altos, para laço)
  // Corrida (padrão): estilo dos apps de corrida (Uber, 99, Machine): arpejo agudo e urgente subindo duas vezes seguidas, depois dois pings de "atenda!".
  // Agudos e rápidos cortam o barulho do carro; pausa final de 0,5 s antes de repetir em laço.
  "toque_corrida": { total: 2.7, drive: 2.6, alvo: 0.99, notas: [
    ...[0, 0.78].flatMap((t) => [
      nota(N.C6, t + 0.00, 0.22, 0.85, "sinoForte"), nota(N.E6, t + 0.10, 0.22, 0.85, "sinoForte"), nota(N.G6, t + 0.20, 0.22, 0.9, "sinoForte"),
      nota(N.C7, t + 0.30, 0.42, 1.0, "sinoForte"), nota(N.C6, t + 0.30, 0.42, 0.45, "sinoForte"),
    ]),
    nota(N.G6, 1.62, 0.2, 0.9, "sinoForte"), nota(N.C7, 1.78, 0.62, 1.0, "sinoForte"), nota(N.E6, 1.78, 0.62, 0.5, "sinoForte"),
  ] },
  // Pulso: arpejo rápido subindo (Mi–Sol#–Si–Mi), sino longo e dois pings agudos. Pausa final de 0,6 s antes de repetir.
  "toque_pulso": { total: 3.2, drive: 2.4, alvo: 0.98, notas: [
    nota(N.E5, 0.00, 0.30, 0.8, "sinoForte"), nota(N.Gs5, 0.09, 0.30, 0.8, "sinoForte"), nota(N.B5, 0.18, 0.30, 0.8, "sinoForte"), nota(N.E6, 0.27, 1.0, 0.95, "sinoForte"),
    nota(N.E5, 0.27, 1.0, 0.45, "sinoForte"),
    nota(N.B5, 1.35, 0.22, 0.8, "sinoForte"), nota(N.E6, 1.5, 0.22, 0.8, "sinoForte"), nota(N.Gs6, 1.65, 0.7, 0.9, "sinoForte"),
    nota(N.B6, 2.05, 0.5, 0.55, "sino"),
  ] },
  // Campanário: "ding-dong" alternando duas notas em rajada, depois um acorde longo. Grave o bastante para vencer o barulho do motor.
  "toque_campanario": { total: 3.2, drive: 2.4, alvo: 0.98, notas: [
    ...repetir([nota(N.E6, 0, 0.16, 0.9, "sinoForte"), nota(N.B5, 0.17, 0.16, 0.9, "sinoForte")], [0, 0.36, 0.72, 1.08]),
    nota(N.E5, 1.5, 1.2, 0.8, "sinoForte"), nota(N.Gs5, 1.5, 1.2, 0.7, "sinoForte"), nota(N.B5, 1.5, 1.2, 0.7, "sinoForte"), nota(N.E6, 1.5, 1.2, 0.6, "sinoForte"),
  ] },
  // Radar: três varreduras rápidas subindo (tipo sonar), depois um ping no fim. Bem diferente dos outros dois (sem sino no começo).
  "toque_radar": { total: 3.2, drive: 3, alvo: 0.98, notas: [
    ...[0, 0.32, 0.64].map((t) => nota(0, t, 0.24, 0.9, "sinoForte", { de: 700, ate: 2100 })),
    nota(N.E6, 1.05, 0.9, 0.9, "sinoForte"), nota(N.B5, 1.05, 0.9, 0.5, "sinoForte"),
    ...[1.9, 2.2].map((t) => nota(0, t, 0.2, 0.85, "sinoForte", { de: 900, ate: 2400 })),
  ] },
  // ---------------------------------------------------------------- passageiro (curtos e suaves)
  // Motorista aceitou: duas notas subindo, leves.
  aceite: { total: 1.0, drive: 1, alvo: 0.6, notas: [nota(N.G5, 0, 0.5, 0.7, "suave"), nota(N.C6, 0.16, 0.8, 0.8, "suave")] },
  // Corrida iniciada: três notas subindo devagar.
  iniciada: { total: 1.2, drive: 1, alvo: 0.6, notas: [nota(N.C5, 0, 0.4, 0.7, "suave"), nota(N.E5, 0.14, 0.4, 0.7, "suave"), nota(N.G5, 0.28, 0.9, 0.8, "suave")] },
  // Corrida finalizada: acorde de Dó maior que desce em paz.
  finalizada: { total: 1.6, drive: 1, alvo: 0.6, notas: [nota(N.G5, 0, 1.2, 0.6, "suave"), nota(N.E5, 0.05, 1.2, 0.6, "suave"), nota(N.C5, 0.1, 1.4, 0.7, "suave"), nota(N.C6, 0.4, 1.0, 0.35, "suave")] },
  // Mensagem do chat: "plim" curto.
  mensagem: { total: 0.6, drive: 1, alvo: 0.55, notas: [nota(N.A5, 0, 0.35, 0.7, "suave"), nota(N.E6, 0.1, 0.45, 0.6, "suave")] },
  // Corrida cancelada: duas notas descendo, sem susto.
  cancelado: { total: 1.1, drive: 1, alvo: 0.55, notas: [nota(N.E5, 0, 0.5, 0.7, "suave"), nota(N.A4, 0.2, 0.8, 0.7, "suave")] },
};

fs.mkdirSync(SAIDA, { recursive: true });
for (const [nome, { total, drive, alvo, notas }] of Object.entries(SONS)) {
  const buf = wav(sintetizar(notas, total, drive), alvo);
  fs.writeFileSync(path.join(SAIDA, `${nome}.wav`), buf);
  console.log(`✔ ${nome}.wav  ${(buf.length / 1024).toFixed(0)} KB`);
}

// BUZINA DE CARRO DE VERDADE (motorista chegou): dois tons de buzina (~415 e ~523 Hz, a terça menor das buzinas de carro), cada um uma onda
// "serra" (harmônicos 1/h, o timbre áspero da membrana) com um leve ronco de 110 Hz. Toca "bi-biiiip": curta e longa.
function buzinaDeCarro() {
  const total = 1.45, n = Math.ceil(total * TAXA), a = new Float32Array(n);
  const buzinadas = [[0.0, 0.24], [0.36, 1.05]]; // [início, fim] em segundos
  for (const [t0, t1] of buzinadas) {
    const i0 = Math.floor(t0 * TAXA), i1 = Math.min(n, Math.floor(t1 * TAXA));
    for (let i = i0; i < i1; i++) {
      const t = (i - i0) / TAXA, resto = (i1 - i) / TAXA;
      const env = Math.min(1, t / 0.012) * Math.min(1, resto / 0.045);
      let s = 0;
      for (const f of [415, 523]) for (let h = 1; h <= 12; h++) s += Math.sin(2 * Math.PI * f * h * (i / TAXA) + h * 0.7) / h;
      s *= 1 - 0.18 + 0.18 * Math.sin(2 * Math.PI * 110 * (i / TAXA)); // ronco da membrana
      a[i] += s * env * 0.5;
    }
  }
  for (let i = 0; i < n; i++) a[i] = Math.tanh(a[i] * 1.6);
  return a;
}
fs.writeFileSync(path.join(SAIDA, "buzina.wav"), wav(buzinaDeCarro(), 0.95));
console.log("✔ buzina.wav  (buzina de carro)");
