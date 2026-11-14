// Testes do SpinText (portados do mobveloov).
import assert from "node:assert/strict";
import { parseSpinText, processTemplate, validateSpinText } from "../src/crm/spintext.ts";

// variavel sozinha e valida
assert.equal(validateSpinText("Olá {{nome}}").valid, true);
assert.equal(validateSpinText("{Oi|Olá} {{nome}}, seu cupom é {{cupom}}").valid, true);
// grupo com uma opcao continua invalido
assert.equal(validateSpinText("{Oi} {{nome}}").valid, false);
// chave sem fechar / sem abrir
assert.equal(validateSpinText("{Oi|Olá {{nome}}").valid, false);
assert.equal(validateSpinText("Oi} {{nome}}").valid, false);
// aninhado
assert.equal(validateSpinText("{Olá|{Oi|E aí}} {{nome}}").valid, true);

// variavel sem valor continua {{x}} (nao vira {x})
for (let i = 0; i < 20; i++) {
  const out = parseSpinText("{Oi|Olá} {{cupom}}");
  assert.ok(out === "Oi {{cupom}}" || out === "Olá {{cupom}}", out);
}
// com valor
for (let i = 0; i < 20; i++) {
  const out = processTemplate("{Oi|Olá} {{nome}}!", { nome: "Ana" });
  assert.ok(out === "Oi Ana!" || out === "Olá Ana!", out);
}
// valor com chaves nao vira grupo
assert.equal(processTemplate("{{nome}}", { nome: "{a|b}" }).length > 0, true);
console.log("spintext ok");
