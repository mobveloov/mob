// Teste portado do sistema de referência (regras do bot), sem alterar as regras.
// node --experimental-strip-types supabase/functions/_shared/freqAddresses.test.ts
import assert from "node:assert/strict";
import { freqLabel, uniqueFreqAddresses } from "../src/bot/enderecos-frequentes.ts";

// caso real (25/10/2026): mesmo endereco 2x, maiuscula diferente
const rows = [
  { id: "a", address_text: "r. santa catarina, 284", origin_reference: "RUA JOAQUIM BERNARDINO BATISTA, 105, CONJUNTO HABITACIONAL PLACIDO HORTH, Pitangueiras - SP", use_count: 5 },
  { id: "b", address_text: "r. santa catarina", origin_reference: "Rua Joaquim Bernardino Batista, 105, Conjunto Habitacional Placido Horth, Pitangueiras - SP", use_count: 3 },
  { id: "c", address_text: "rua lidia adami soares", origin_reference: "Rua Lidia Adami Soares, 537, Jardim Gumercindo Hentz Soares I, Pitangueiras - SP", use_count: 1 },
];
assert.deepEqual(uniqueFreqAddresses(rows).map((r) => r.id), ["a", "c"]);
assert.deepEqual(uniqueFreqAddresses(rows, 1).map((r) => r.id), ["a"]);
assert.deepEqual(uniqueFreqAddresses(null), []);

assert.equal(freqLabel(rows[0]), "Rua Joaquim Bernardino Batista, 105");
assert.equal(freqLabel(rows[2]), "Rua Lidia Adami Soares, 537");
assert.equal(freqLabel({ id: "x", address_text: "Adega do Tom" }), "Adega do Tom");
assert.equal(freqLabel({ id: "x", address_text: "x", origin_reference: "RUA DOM PEDRO DE ALCANTARA, 12, Centro" }), "Rua Dom Pedro de Alcantara, 12");
assert.ok(freqLabel({ id: "x", address_text: "Avenida Presidente Juscelino Kubitschek de Oliveira Sobrinho Neto" }).length <= 40);
console.log("freqAddresses ok");
