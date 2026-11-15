// Teste portado do sistema de referência (regras do bot), sem alterar as regras.
import assert from "node:assert/strict";
import { supportCloseDecision, SUPPORT_THANKS_DEFAULT } from "../src/bot/fim-suporte.ts";

assert.deepEqual(supportCloseDecision("attendant"), { sendMenu: false, textKey: "support_thanks" });
assert.deepEqual(supportCloseDecision("timeout"), { sendMenu: false, textKey: "support_thanks" });
for (const w of ["fim", "encerrar", "finalizar suporte", "terminar"]) assert.equal(supportCloseDecision("passenger", w).sendMenu, false, w);
for (const w of ["sair", "Voltar", "CORRIDA!", "1", "menu"]) assert.deepEqual(supportCloseDecision("passenger", w), { sendMenu: true, textKey: "support_exit" }, w);
assert.ok(/obrigad/i.test(SUPPORT_THANKS_DEFAULT));
console.log("supportClose ok");
