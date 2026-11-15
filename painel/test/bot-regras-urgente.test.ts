// Teste portado do sistema de referência (regras do bot), sem alterar as regras.
// Pedido urgente no bot.
// Rode com: node --experimental-strip-types supabase/functions/_shared/urgentRide.test.ts
import assert from "node:assert/strict";
import { detectUrgentRide } from "../src/bot/urgente.ts";

for (const t of ["urgente", "URGENTE!!", "preciso de um carro urgente", "é urgência", "emergência", "carro rápido por favor", "to com pressa", "socorro preciso de um taxi", "manda um carro o quanto antes"]) {
  assert.deepEqual(detectUrgentRide(t), { urgent: true, rest: null }, t);
}
for (const t of ["oi", "quero uma corrida", "Rua Sete de Setembro, 100", "rapadura", "Avenida Rápida", "", null]) {
  const r = detectUrgentRide(t as string);
  if (t === "Avenida Rápida") assert.deepEqual(r, { urgent: true, rest: null }, "'rápida' conta como urgência (raro), mas 'Avenida' sozinha não é embarque: o bot pergunta");
  else assert.equal(r.urgent, false, String(t));
}
assert.deepEqual(detectUrgentRide("urgente rua sete de setembro 100"), { urgent: true, rest: "rua sete de setembro 100" });
assert.deepEqual(detectUrgentRide("Urgente! Av. Brasil, 1500"), { urgent: true, rest: "Av. Brasil, 1500" });
assert.deepEqual(detectUrgentRide("preciso de um carro rápido na rodoviária"), { urgent: true, rest: "rodoviária" });
assert.deepEqual(detectUrgentRide("urgente rua 7 de setembro, 100 por favor"), { urgent: true, rest: "rua 7 de setembro, 100" });
assert.deepEqual(detectUrgentRide("to com pressa, estou no Hospital Santa Casa"), { urgent: true, rest: "Hospital Santa Casa" });
assert.equal(detectUrgentRide("x".repeat(400)).urgent, false, "texto enorme nao e pedido");

console.log("urgentRide ok");
