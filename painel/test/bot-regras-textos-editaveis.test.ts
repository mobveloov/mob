// Testes portados do sistema de referência (regras do bot).
import assert from "node:assert/strict";
import {
  BOT_TEXT_DEFS, customText, looksLikeQuestion, matchFaq, normalizeBotTexts, normalizeFaq, normalizeGreeting,
  parseKeywords, shouldSendGreetingImage,
} from "../src/bot/textos-editaveis.ts";
import { readFileSync } from "node:fs";

// Toda chave do painel é lida pelo fluxo (txt("chave", ...)) — evita voltar o bug de chaves que o bot não lê
const fluxo = readFileSync(new URL("../src/bot/fluxo.ts", import.meta.url), "utf8");
for (const d of BOT_TEXT_DEFS) assert.ok(fluxo.includes(`"${d.key}"`), `chave ${d.key} não usada pelo fluxo`);
assert.equal(new Set(BOT_TEXT_DEFS.map((d) => d.key)).size, BOT_TEXT_DEFS.length, "chaves repetidas");

assert.deepEqual(normalizeBotTexts({ welcome_menu: "  Oi!  ", ask_address: "", welcome: "antiga", confirm_address: "x", ask_payment: 3 }), { welcome_menu: "Oi!" });
assert.equal(customText({ welcome_menu: "Oi" }, "welcome_menu", "padrao"), "Oi");
assert.equal(customText({ welcome_menu: "  " }, "welcome_menu", "padrao"), "padrao");
assert.equal(customText({ confirm_address: "Confirma?" }, "confirm_address", "Confirma: Rua A"), "Confirma: Rua A", "dinamica ignora o personalizado");
assert.equal(customText(null, "x", "p"), "p");

// Saudacao
assert.deepEqual(normalizeGreeting({ imageUrl: " https://x.com/a.png ", caption: " Bem-vindo " }), { imageUrl: "https://x.com/a.png", caption: "Bem-vindo" });
assert.equal(normalizeGreeting({ imageUrl: "http://x.com/a.png" }).imageUrl, "", "so https");
assert.equal(normalizeGreeting({ imageUrl: "javascript:alert(1)" }).imageUrl, "");
assert.equal(normalizeGreeting(null).imageUrl, "");
const g = normalizeGreeting({ imageUrl: "https://x.com/a.png" });
const now = Date.parse("2026-10-06T12:00:00Z");
assert.equal(shouldSendGreetingImage(g, null, now), true);
assert.equal(shouldSendGreetingImage(g, "2026-10-06T05:00:00Z", now), false, "menos de 12 h");
assert.equal(shouldSendGreetingImage(g, "2026-10-05T23:00:00Z", now), true);
assert.equal(shouldSendGreetingImage(normalizeGreeting({}), null, now), false, "sem imagem");

// Base de conhecimento
assert.deepEqual(parseKeywords("Pet, cachorro; gato\nok, pet"), ["pet", "cachorro", "gato"], "minimo 3 letras, sem repetir");
assert.deepEqual(parseKeywords(["Mala", "bagagem grande"]), ["mala", "bagagem grande"]);
const faq = normalizeFaq([
  { question: "Aceita pet?", keywords: "pet, cachorro, gato, animal", answer: "Sim! Avise o motorista." },
  { question: "Pagamento", keywords: "pix, cartao, dinheiro, pagamento", answer: "Pix, cartão ou dinheiro." },
  { question: "Malas", keywords: "mala, malas, bagagem", answer: "Pode levar malas." },
  { keywords: "x", answer: "sem palavra valida" },
  { keywords: "vazio", answer: "  " },
  "lixo",
]);
assert.equal(faq.length, 3);
assert.equal(matchFaq("Vocês aceitam cachorro?", faq, false)?.question, "Aceita pet?");
assert.equal(matchFaq("aceita pix", faq, false)?.question, "Pagamento", "comeca com aceita: pergunta mesmo sem ?");
assert.equal(matchFaq("Posso levar 2 malas?", faq, false)?.question, "Malas");
assert.equal(matchFaq("Cartão de crédito vale?", faq, false)?.question, "Pagamento", "sem acento casa");
assert.equal(matchFaq("Rua do Pet Shop 120", faq, false), null, "endereco nao e pergunta");
assert.equal(matchFaq("moro em petrolina?", faq, false), null, "palavra inteira");
assert.equal(matchFaq("oi", faq, false), null);
// No meio do pedido (strict): so com ? e sem numero
assert.equal(matchFaq("aceita pet", faq, true), null);
assert.equal(matchFaq("aceita pet?", faq, true)?.question, "Aceita pet?");
assert.equal(matchFaq("Rua do pet 120?", faq, true), null);
assert.equal(matchFaq("aceita pet?", [], false), null);
assert.equal(looksLikeQuestion("x".repeat(250) + "?", false), false, "texto longo nao");

console.log("botTexts ok");
