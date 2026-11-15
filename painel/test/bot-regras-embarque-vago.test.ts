// Teste portado do sistema de referência (regras do bot), sem alterar as regras.
import assert from "node:assert/strict";
import { isVaguePickup } from "../src/bot/embarque-vago.ts";

for (const t of ["estou em casa", "Estou em casa!", "to em casa", "quero uma corrida, estou em casa", "pode vir aqui", "manda um carro aqui", "em casa", "minha casa", "tô no trabalho", "preciso de um carro estou aqui", "Bom dia, quero um carro, to em casa"]) {
  assert.equal(isVaguePickup(t), true, t);
}
for (const t of ["Rua Sergipe 606", "estou na rua sergipe 606", "casa da maria", "santa casa", "estou na rodoviaria", "quero uma corrida", "", "oi", "estou em casa e vou pro centro", "casa 2"]) {
  assert.equal(isVaguePickup(t), false, t);
}
console.log("vaguePickup ok");
