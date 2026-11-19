// Teste portado do sistema de referência (regras do bot), sem alterar as regras.
import assert from "node:assert/strict";
import { avisosDevidos, textoAviso } from "../src/bot/agendamento-avisos.ts";

const MIN = 60_000;
const H = Date.UTC(2026, 9, 8, 13, 45); // corrida 10:45 (BRT)
const base = { scheduledMs: H, createdMs: H - 3 * 60 * MIN, enviados: {} };

assert.deepEqual(avisosDevidos({ ...base, nowMs: H - 16 * MIN }), [], "10:29: nada ainda");
assert.deepEqual(avisosDevidos({ ...base, nowMs: H - 15 * MIN }), [{ minutos: 15, enviar: true }], "10:30: aviso de 15 min");
assert.deepEqual(avisosDevidos({ ...base, nowMs: H - 5 * MIN, enviados: { 15: true } }), [{ minutos: 5, enviar: true }], "10:40: aviso de 5 min");
assert.deepEqual(avisosDevidos({ ...base, nowMs: H - 4 * MIN, enviados: { 15: true, 5: true } }), []);
// rotina atrasada: os dois devidos juntos -> so o de 5 sai
assert.deepEqual(avisosDevidos({ ...base, nowMs: H - 4 * MIN }), [{ minutos: 15, enviar: false }, { minutos: 5, enviar: true }]);
// ja passou do horario: so marca
assert.deepEqual(avisosDevidos({ ...base, nowMs: H + MIN }), [{ minutos: 15, enviar: false }, { minutos: 5, enviar: false }]);
// agendou para daqui a 10 min: o de 15 nao manda, o de 5 manda na hora certa
assert.deepEqual(avisosDevidos({ ...base, createdMs: H - 10 * MIN, nowMs: H - 10 * MIN }), [{ minutos: 15, enviar: false }]);
assert.deepEqual(avisosDevidos({ ...base, createdMs: H - 10 * MIN, nowMs: H - 5 * MIN, enviados: { 15: true } }), [{ minutos: 5, enviar: true }]);
assert.match(textoAviso(15, "10:45", "10:35"), /15 minutos.*10:35/);
assert.match(textoAviso(5, "10:45", "10:35"), /5 minutos/);
console.log("scheduleReminders ok");
