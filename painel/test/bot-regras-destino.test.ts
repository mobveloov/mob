// Testes portados do sistema de referência (regras do bot).
import assert from "node:assert/strict";
import { allowSkipDestination, destinationOptions, decideSkip, isSkipDestinationText } from "../src/bot/destino.ts";

assert.equal(allowSkipDestination(undefined), true);
assert.equal(allowSkipDestination({}), true);
assert.equal(allowSkipDestination({ allow_skip_destination: null }), true);
assert.equal(allowSkipDestination({ allow_skip_destination: true }), true);
assert.equal(allowSkipDestination({ allow_skip_destination: false }), false);

assert.equal(destinationOptions(true).length, 2);
assert.ok(destinationOptions(true).some((o) => o.id === "dest_nao_informar"));
assert.equal(destinationOptions(false).length, 1);
assert.ok(!destinationOptions(false).some((o) => o.id === "dest_nao_informar"));

for (const t of ["2", "Não informar", "nao informar", "NÃO SEI", "km livre", "Km Livre", "dest_nao_informar", "sem destino", "definir no carro"]) {
  assert.equal(isSkipDestinationText(t), true, t);
  assert.equal(decideSkip(true, t), "skip", t);
  assert.equal(decideSkip(false, t), "required", t);
}
for (const t of ["Rua Amazonas, 53", "Shopping", "1", "22", "", null, undefined, "Avenida Brasil 2"]) {
  assert.equal(decideSkip(true, t as string), "none", String(t));
  assert.equal(decideSkip(false, t as string), "none", String(t));
}
console.log("destSkip ok");
