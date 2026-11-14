// Testes portados do sistema de referência (regras do bot).
import assert from "node:assert/strict";
import { normalizeStatusMessages, renderStatusMessage, STATUS_MESSAGE_DEFS, statusKeyFor } from "../src/bot/mensagens-status.ts";

assert.deepEqual(normalizeStatusMessages({ accepted: "  Oi {passageiro}!  ", arrived: "", hack: "x", completed: 5 }), { accepted: "Oi {passageiro}!" });
assert.deepEqual(normalizeStatusMessages(null), {});

// Status da corrida própria do painel
assert.equal(statusKeyFor("a_caminho"), "accepted");
assert.equal(statusKeyFor("a_caminho", { driverChanged: true }), "driver_changed");
assert.equal(statusKeyFor("no_local"), "arrived");
assert.equal(statusKeyFor("em_andamento"), "in_progress");
assert.equal(statusKeyFor("finalizada"), "completed");
assert.equal(statusKeyFor("nao_atendida"), "no_driver");
assert.equal(statusKeyFor("cancelada", { canceladaPor: "Central" }), "canceled_central");
assert.equal(statusKeyFor("cancelada", { canceladaPor: "Passageiro" }), "canceled");
assert.equal(statusKeyFor("procurando", { anterior: "a_caminho" }), "driver_canceled");
assert.equal(statusKeyFor("procurando"), null, "primeira busca não avisa");

assert.equal(renderStatusMessage("accepted", { accepted: "Oi {passageiro}, {motorista} vai te buscar. {empresa}" }, { passageiro: "Ana", motorista: "João", empresa: "UP" }),
  "Oi Ana, João vai te buscar. UP");
assert.equal(renderStatusMessage("arrived", {}), STATUS_MESSAGE_DEFS.find((d) => d.key === "arrived")!.def, "sem texto da empresa = padrao");
assert.equal(renderStatusMessage("accepted", { accepted: "{motorista} aceitou" }), "seu motorista aceitou");
assert.equal(renderStatusMessage("xx", {}), null);

console.log("mensagens de status ok");
