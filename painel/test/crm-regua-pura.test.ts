// Testes da régua de reativação. Rodar: node --experimental-strip-types supabase/functions/_shared/crmRegua.test.ts
import assert from "node:assert/strict";
import {
  isBotNumber, normalizeTiers, reguaAllowedByNow, reguaBudgetNow, reguaCandidates, reguaDailyCap, renderReguaMessage,
  shouldAutoPause, tierFor, inReguaWindow, REGUA_MENSAGEM_PADRAO,
} from "../src/crm/regua-pura.ts";

const NOW = new Date("2026-11-10T15:00:00Z").getTime();
const ago = (d: number) => new Date(NOW - d * 86400000 - 3600000).toISOString();
const T = [1, 7, 30, 90, 365];

// faixas: maior faixa alcançada; fora = null
assert.equal(tierFor(0, T), null);
assert.equal(tierFor(1, T), 1);
assert.equal(tierFor(6, T), 1);
assert.equal(tierFor(7, T), 7);
assert.equal(tierFor(45, T), 30);
assert.equal(tierFor(100, T), 90);
assert.equal(tierFor(365, T), 365);
assert.equal(tierFor(394, T), 365);
assert.equal(tierFor(395, T), null); // mais de 1 ano (+ folga): não recebe
assert.equal(tierFor(null, T), null);
assert.deepEqual(normalizeTiers([30, 7, 7, "x", 0, -2, 1]), [1, 7, 30]);
assert.deepEqual(normalizeTiers([]), T);

// quem recebe: só quem está em faixa, ordem = parou há menos tempo primeiro
const contatos = [
  { phone: "5516900000001", name: "Ana", last_ride_at: ago(40), total_rides: 3 },   // faixa 30
  { phone: "5516900000002", name: "Bia", last_ride_at: ago(2), total_rides: 1 },    // faixa 1
  { phone: "5516900000003", name: "Cid", last_ride_at: ago(0), total_rides: 1 },    // pediu hoje: fora
  { phone: "5516900000004", name: "Dan", last_ride_at: null, total_rides: 0 },      // nunca pediu: fora
  { phone: "5516900000005", name: "Eva", last_ride_at: ago(500), total_rides: 9 },  // mais de 1 ano: fora
  { phone: "5516900000006", name: "Fer", last_ride_at: ago(8), total_rides: 2 },    // faixa 7
  { phone: "5516900000002", name: "Bia", last_ride_at: ago(2), total_rides: 1 },    // duplicado
];
let r = reguaCandidates(contatos, [], T, NOW);
assert.deepEqual(r.map((x) => [x.phone.slice(-1), x.tier]), [["2", 1], ["6", 7], ["1", 30]]);

// nunca repete a mesma faixa
const envios = [{ phone: "5516900000002", tier_days: 1, sent_at: new Date(NOW - 3600000).toISOString() }];
r = reguaCandidates(contatos, envios, T, NOW);
assert.deepEqual(r.map((x) => x.phone.slice(-1)), ["6", "1"]);

// pediu corrida depois do envio: recomeça a contagem (o envio antigo não vale mais)
const voltou = [{ phone: "5516900000002", name: "Bia", last_ride_at: ago(2), total_rides: 2 }];
const antigo = [{ phone: "5516900000002", tier_days: 1, sent_at: ago(20) }]; // enviado antes da última corrida
assert.equal(reguaCandidates(voltou, antigo, T, NOW).length, 1);

// outra faixa depois da primeira: pode (1 por faixa)
const depois = [{ phone: "5516900000006", tier_days: 1, sent_at: ago(7) }];
assert.equal(reguaCandidates(contatos, depois, T, NOW).find((x) => x.phone.endsWith("6"))?.tier, 7);

// repetir a mesma faixa depois de N dias (0 = nunca); descadastro nunca volta
const um = [{ phone: "5516900000002", name: "Bia", last_ride_at: ago(40), total_rides: 1 }]; // faixa 30
const env = (d: number, status = "sent") => [{ phone: "5516900000002", tier_days: 30, status, sent_at: new Date(NOW - d * 86400000).toISOString() }];
assert.equal(reguaCandidates(um, env(5), T, NOW, 0).length, 0); // sem repetição: nunca
assert.equal(reguaCandidates(um, env(20), T, NOW, 0).length, 0);
assert.equal(reguaCandidates(um, env(5), T, NOW, 15).length, 0); // só 5 dias: ainda não
assert.equal(reguaCandidates(um, env(16), T, NOW, 15).length, 1); // 16 dias: pode de novo
assert.equal(reguaCandidates(um, env(60), T, NOW, 15).length, 1); // envio antigo, mas depois da corrida? (60 dias é antes da última corrida: recomeça)
assert.equal(reguaCandidates(um, env(16, "skipped"), T, NOW, 15).length, 0); // descadastro nunca volta

// limite diário + aquecimento
const base = { maxPerDay: 60, warmupStart: 10, warmupStep: 5 };
const dia0 = NOW - 3600000;
assert.equal(reguaDailyCap({ ...base, warmupStartedAtMs: dia0 }, NOW), 10);
assert.equal(reguaDailyCap({ ...base, warmupStartedAtMs: NOW - 3 * 86400000 - 1000 }, NOW), 25);
assert.equal(reguaDailyCap({ ...base, warmupStartedAtMs: NOW - 30 * 86400000 }, NOW), 60); // nunca passa do máximo
assert.equal(reguaDailyCap({ ...base, warmupStartedAtMs: null }, NOW), 10);
assert.equal(reguaDailyCap({ maxPerDay: 5, warmupStart: 10, warmupStep: 5, warmupStartedAtMs: null }, NOW), 5);

// horário comercial
const w = { windowStart: "09:00", windowEnd: "18:00", days: ["mon", "tue", "wed", "thu", "fri", "sat"] };
assert.equal(inReguaWindow("10:00", "mon", w), true);
assert.equal(inReguaWindow("08:59", "mon", w), false);
assert.equal(inReguaWindow("18:00", "mon", w), false);
assert.equal(inReguaWindow("10:00", "sun", w), false);

// espalha o limite no dia: sem rajada na abertura
assert.equal(reguaAllowedByNow(60, "09:00", w), 1);
assert.ok(reguaAllowedByNow(60, "13:30", w) >= 25 && reguaAllowedByNow(60, "13:30", w) <= 35);
assert.equal(reguaAllowedByNow(60, "18:30", w), 60);
assert.equal(reguaAllowedByNow(60, "07:00", w), 0);

// orçamento da rodada: nunca passa do limite do dia nem do permitido agora, máximo 2 por rodada
const b = { cap: 60, hhmm: "13:30", ...w };
assert.equal(reguaBudgetNow({ ...b, sentToday: 0 }), 2);
assert.equal(reguaBudgetNow({ ...b, sentToday: 60 }), 0);
assert.equal(reguaBudgetNow({ ...b, sentToday: 59, hhmm: "17:59" }), 1);
assert.equal(reguaBudgetNow({ ...b, sentToday: 40 }), 0); // já saiu mais do que cabia até agora: espera
assert.equal(reguaBudgetNow({ cap: 10, sentToday: 10, hhmm: "17:00", ...w }), 0);

// parada automática
assert.equal(shouldAutoPause(3, 4), false);
assert.equal(shouldAutoPause(4, 4), true);
assert.equal(shouldAutoPause(99, 0), false);

// nunca o número do bot
assert.equal(isBotNumber("T-upcorridas", ["t-upcorridas", "B-x"]), true);
assert.equal(isBotNumber("C-upcorridas", ["T-upcorridas"]), false);
assert.equal(isBotNumber("", ["T-upcorridas"]), false);

// mensagem
const m = renderReguaMessage(null, "maria silva", "UP Corridas");
assert.ok(m.startsWith("*Maria, faz tempo que você não pede corrida* 🚗"));
assert.ok(m.includes("anda com a UP Corridas"));
assert.ok(m.includes("NÃO QUERO MAIS"));
assert.ok(renderReguaMessage("{{nome}} oi", "JOÃO", "X").startsWith("João oi"));
assert.ok(renderReguaMessage(null, null, "UP Corridas").startsWith("*Faz tempo que você não pede corrida*"));
assert.ok(renderReguaMessage(null, "5516999", "UP").startsWith("*Faz tempo"));
assert.ok(REGUA_MENSAGEM_PADRAO.includes("{nome}"));
console.log("crmRegua.test.ts OK");
