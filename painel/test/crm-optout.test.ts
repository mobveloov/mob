// Descadastro do WhatsApp do CRM (v16.122). Rode com:
// node --experimental-strip-types supabase/functions/_shared/waOptOut.test.ts
import assert from "node:assert/strict";
import {
  shouldOptOut, splitWaOptOut, waOptOutKey,
  waOptOutKind, waPhoneVariants, withOptOutFooter, WA_OPTOUT_FOOTER,
} from "../src/crm/optout.ts";

const livre = { recentCampaign: false, botBusy: false };
const campanha = { recentCampaign: true, botBusy: false };
const pedido = { recentCampaign: true, botBusy: true };

// 1. FORTES: descadastram sempre (com ou sem campanha, minúsculas, sem acento, pequenas variações)
for (const t of ["NÃO QUERO MAIS", "não quero mais", "nao quero mais", "Nao quero mais.", "NÃO QUERO MAIS!!!", "naaao quero mais",
  "n quero mais", "naum quero mais", "Não quero mais receber", "não quero mais mensagens", "Não quero mais, obrigado",
  "DESCADASTRAR", "descadastrar", "Descadastra", "me descadastra", "quero me descadastrar", "descadastro", "descadastar",
  "descadastrar por favor", "por favor descadastrar", "parar mensagens", "não quero receber mensagens", "stop",
  "me tira dessa lista", "para de me mandar mensagem", "cancelar mensagens", "sair da lista"]) {
  assert.equal(waOptOutKind(t), "forte", t);
  assert.equal(shouldOptOut(t, livre), true, `${t} (sem campanha)`);
  assert.equal(shouldOptOut(t, campanha), true, `${t} (campanha)`);
}

// 2. FRACAS: PARAR / SAIR / CANCELAR só com campanha recente e sem pedido/corrida
for (const t of ["PARAR", "parar", "Parar.", "pare", "SAIR", "sair", "Sair!", "CANCELAR", "cancelar", "Cancela", "canselar", "parar por favor", "ok sair"]) {
  assert.equal(waOptOutKind(t), "fraca", t);
  assert.equal(shouldOptOut(t, campanha), true, `${t} responde campanha`);
  assert.equal(shouldOptOut(t, livre), false, `${t} sem campanha = comando do bot`);
  assert.equal(shouldOptOut(t, pedido), false, `${t} com pedido = comando do bot`);
  assert.equal(shouldOptOut(t, { recentCampaign: false, botBusy: true }), false, t);
}

// 3. "não quero mais" sozinho no meio de um pedido vai para o bot (pode ser sobre a corrida)
assert.equal(shouldOptOut("não quero mais", pedido), false);
assert.equal(shouldOptOut("NÃO QUERO MAIS", pedido), false);
assert.equal(shouldOptOut("nao quero mais nada", pedido), false);
// ...mas quando fala de mensagens, descadastra mesmo com pedido
assert.equal(shouldOptOut("não quero mais receber mensagens", pedido), true);
assert.equal(shouldOptOut("descadastrar", pedido), true);

// 4. Frases do dia a dia e do bot NÃO descadastram, com ou sem campanha
for (const t of ["cancelar corrida", "Cancelar a corrida", "quero cancelar", "sair do suporte", "não quero", "nao quero mais a corrida",
  "não quero mais esperar", "não quero esperar", "parar aqui na esquina", "pode parar no portão", "para na padaria", "stop car",
  "quero uma corrida", "menu", "voltar", "sim", "não", "1", "rua parar 10", "sair às 8h", "", null, undefined]) {
  assert.equal(shouldOptOut(t as string, campanha), false, `${String(t)} (campanha)`);
  assert.equal(shouldOptOut(t as string, livre), false, `${String(t)} (livre)`);
}

// 5. Rodapé do template
assert.equal(withOptOutFooter("Promo de hoje!", true), `Promo de hoje!\n\n${WA_OPTOUT_FOOTER}`);
assert.equal(withOptOutFooter("Promo de hoje!", false), "Promo de hoje!");
assert.equal(withOptOutFooter(withOptOutFooter("Oi", true), true), `Oi\n\n${WA_OPTOUT_FOOTER}`, "não repete");
assert.ok(WA_OPTOUT_FOOTER.includes("NÃO QUERO MAIS"));

// 6. Mesmo número em formatos diferentes = mesma chave
for (const p of ["5516991234567", "16991234567", "551691234567", "1691234567", "+55 (16) 99123-4567"]) assert.equal(waOptOutKey(p), "1691234567", p);
assert.ok(waPhoneVariants("16991234567").includes("5516991234567"));
assert.ok(waPhoneVariants("551691234567").includes("5516991234567"), "sem o 9 acha o com 9");

