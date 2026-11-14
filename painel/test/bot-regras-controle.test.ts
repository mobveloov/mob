// Testes portados do sistema de referência (regras do bot).
import assert from "node:assert/strict";
import { botSilencedFor, brPhoneVariants, DEFAULT_BOT_CONTROL, normalizeBotControl, parseBotCommand, parseBotCommandWithPhone, parseSupportReply, supportCode } from "../src/bot/controle.ts";

const cfg = normalizeBotControl(null);
assert.deepEqual(cfg, DEFAULT_BOT_CONTROL);
assert.equal(parseBotCommand("#bloquear", cfg), "block");
assert.equal(parseBotCommand("  #BLOQUEAR. ", cfg), "block");
assert.equal(parseBotCommand("#desbloquear", cfg), "unblock");
assert.equal(parseBotCommand("#pausar", cfg), "pause");
assert.equal(parseBotCommand("#voltar", cfg), "resume");
assert.equal(parseBotCommand("vou #bloquear voce", cfg), null, "so a palavra inteira");
assert.equal(parseBotCommand("bom dia", cfg), null);

const custom = normalizeBotControl({ blockWord: "Bloqueio", unblockWord: "libera", pauseWord: "Opa", resumeWord: "Obrigado", pauseMinutes: "30" });
assert.equal(parseBotCommand("opa", custom), "pause");
assert.equal(parseBotCommand("Obrigado!", custom), "resume");
assert.equal(parseBotCommand("bloqueio", custom), "block");
assert.equal(custom.pauseMinutes, 30);
assert.equal(normalizeBotControl({ pauseMinutes: 0, blockWord: "x" }).blockWord, "#bloquear", "palavra curta demais volta ao padrao");
assert.equal(normalizeBotControl({ pauseMinutes: 5000 }).pauseMinutes, 60);

const now = Date.parse("2026-10-03T12:00:00Z");
assert.equal(botSilencedFor({ blocked: true }, now), "blocked");
assert.equal(botSilencedFor({ paused_until: "2026-10-03T12:30:00Z" }, now), "paused");
assert.equal(botSilencedFor({ paused_until: "2026-10-03T11:30:00Z" }, now), null, "pausa vencida volta sozinha");
assert.equal(botSilencedFor(null, now), null);

assert.equal(supportCode("a1b2c3d4-0000"), "A1B2");
assert.deepEqual(parseSupportReply("A1B2 pode vir agora", ["A1B2", "FFFF"]), { code: "A1B2", body: "pode vir agora" });
assert.deepEqual(parseSupportReply("#ffff: ok", ["A1B2", "FFFF"]), { code: "FFFF", body: "ok" });
assert.deepEqual(parseSupportReply("CAFE com leite", ["A1B2"]), { code: null, body: "CAFE com leite" }, "codigo que nao e de atendimento aberto");
assert.deepEqual(parseSupportReply("oi", []), { code: null, body: "oi" });

console.log("botControl ok");

// Comando com numero (conversa com voce mesmo: o contato nao ve nada)
assert.deepEqual(parseBotCommandWithPhone("#bloquear 16 99293-0774", cfg), { cmd: "block", phone: "5516992930774" });
assert.deepEqual(parseBotCommandWithPhone("#Desbloquear +55 (16) 99293-0774", cfg), { cmd: "unblock", phone: "5516992930774" });
assert.deepEqual(parseBotCommandWithPhone("#pausar 1632221234", cfg), { cmd: "pause", phone: "551632221234" });
assert.equal(parseBotCommandWithPhone("#bloquear", cfg), null);
assert.equal(parseBotCommandWithPhone("#bloquear 123", cfg), null);
assert.equal(parseBotCommandWithPhone("oi 16992930774", cfg), null);
assert.deepEqual(brPhoneVariants("5516992930774").sort(), ["551692930774", "5516992930774"].sort());
assert.deepEqual(brPhoneVariants("551692930774").sort(), ["551692930774", "5516992930774"].sort());
assert.deepEqual(brPhoneVariants("551632221234"), ["551632221234"]);
console.log("botControl comando com numero ok");
