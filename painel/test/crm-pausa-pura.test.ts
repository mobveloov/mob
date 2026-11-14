// Pausar/continuar do CRM: a decisão de enviar ou esperar e a retomada.
// Rode com: node --experimental-strip-types supabase/functions/_shared/crmPause.test.ts
import assert from "node:assert/strict";
import { allowedActions, resumeStatus, sendDecision, CRM_PAUSED, isWaBusy } from "../src/crm/pausa-pura.ts";


// Campanha
assert.equal(sendDecision({ kind: "campaign", itemStatus: "running", globalPaused: false }), "send");
assert.equal(sendDecision({ kind: "campaign", itemStatus: "scheduled", globalPaused: false }), "send");
assert.equal(sendDecision({ kind: "campaign", itemStatus: "running", globalPaused: true }), "wait", "pausa geral segura");
assert.equal(sendDecision({ kind: "campaign", itemStatus: "paused", globalPaused: false }), "wait", "campanha pausada espera");
assert.equal(sendDecision({ kind: "campaign", itemStatus: "canceled", globalPaused: false }), "stop");
assert.equal(sendDecision({ kind: "campaign", itemStatus: "canceled", globalPaused: true }), "stop");
assert.equal(sendDecision({ kind: "campaign", itemStatus: "completed", globalPaused: false }), "stop");
assert.equal(sendDecision({ kind: "campaign", itemStatus: null, globalPaused: false }), "stop", "sumiu: não envia");
// Motoristas
assert.equal(sendDecision({ kind: "driver", itemStatus: "sending", globalPaused: false }), "send");
assert.equal(sendDecision({ kind: "driver", itemStatus: "queued", globalPaused: false }), "send");
assert.equal(sendDecision({ kind: "driver", itemStatus: "sending", globalPaused: true }), "wait");
assert.equal(sendDecision({ kind: "driver", itemStatus: "paused", globalPaused: false }), "wait");
assert.equal(sendDecision({ kind: "driver", itemStatus: "canceled", globalPaused: false }), "stop");
assert.equal(sendDecision({ kind: "driver", itemStatus: "done", globalPaused: false }), "stop");

// Botões
assert.deepEqual(allowedActions("campaign", "running", 10), ["pause", "cancel"]);
assert.deepEqual(allowedActions("campaign", "paused", 10), ["resume", "cancel"]);
assert.deepEqual(allowedActions("campaign", "running", 0), []);
assert.deepEqual(allowedActions("campaign", "scheduled", 0), ["pause"]);
assert.deepEqual(allowedActions("campaign", "completed", 0), []);
assert.deepEqual(allowedActions("campaign", "canceled", 5), []);
assert.deepEqual(allowedActions("driver", "sending", 3), ["pause", "cancel"]);
assert.deepEqual(allowedActions("driver", "paused", 3), ["resume", "cancel"]);
assert.deepEqual(allowedActions("driver", "done", 0), []);

// Continuar retoma de onde parou
assert.equal(resumeStatus("campaign", { frequency: "once", pending: 40 }), "running");
assert.equal(resumeStatus("campaign", { frequency: "daily", pending: 40 }), "scheduled");
assert.equal(resumeStatus("campaign", { frequency: "once", pending: 0 }), "completed");
assert.equal(resumeStatus("driver", { pending: 5 }), "sending");
assert.equal(resumeStatus("driver", { pending: 0 }), "done");

// A pausa não é falha: quem chama devolve o item para a fila
assert.ok(isWaBusy(CRM_PAUSED));
assert.ok(isWaBusy("WhatsApp em pausa entre lotes ou no limite por minuto: sai na próxima rodada"));
assert.ok(!isWaBusy("Falha no envio"));
console.log("crmPause: ok");

// Pausa automática por falhas seguidas de WhatsApp
{
  const { waFailStreak, WA_FAIL_LIMIT } = await import("../src/crm/pausa-pura.ts");
  const f = "failed", ok = "sent";
  if (WA_FAIL_LIMIT !== 5) throw new Error("limite mudou");
  if (waFailStreak([f, f, f, f]) !== false) throw new Error("4 falhas: ainda nao pausa");
  if (waFailStreak([f, f, f, f, f]) !== true) throw new Error("5 falhas seguidas: pausa");
  if (waFailStreak([f, f, ok, f, f, f]) !== false) throw new Error("um envio certo no meio zera a sequencia");
  if (waFailStreak([ok, f, f, f, f, f]) !== false) throw new Error("ultimo deu certo: nao pausa");
  if (waFailStreak([]) !== false) throw new Error("sem historico");
  console.log("ok: pausa automatica por falhas seguidas");
}
