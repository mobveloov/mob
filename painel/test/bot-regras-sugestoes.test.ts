// Teste portado do sistema de referência (regras do bot), sem alterar as regras.
import assert from "node:assert/strict";
import { parenPlaceMatches, pickSuggestion } from "../src/bot/sugestoes.ts";

const S = [
  { nickname: "Amarelinha da Avenida", address_text: "Rua sergipe, 606", lat: null, lng: null },
  { nickname: "Espetinho do Gui", address_text: "Rua Minas Gerais, 1612", lat: null, lng: null },
  { nickname: "Rodoviária", address_text: "Av. Brasil, 100", lat: null, lng: null },
];
const nick = (i: string) => pickSuggestion(S, i)?.nickname ?? null;

// acha pelo apelido, com abreviacao e erro de digitacao comum
assert.equal(nick("Amarelinha da Avenida"), "Amarelinha da Avenida");
assert.equal(nick("AMARELINHA AVENIDA"), "Amarelinha da Avenida");
assert.equal(nick("amarelinha da av"), "Amarelinha da Avenida");
assert.equal(nick("amarelinha"), "Amarelinha da Avenida");
assert.equal(nick("espetin do gui"), "Espetinho do Gui");
assert.equal(nick("Espetinho do Gui, Pitangueiras - SP"), "Espetinho do Gui");
assert.equal(nick("rodoviaria"), "Rodoviária");
// NAO casa (casos reais de 07/10)
assert.equal(nick("Jardim Santa Vitoria, Pitangueiras - SP"), null);
assert.equal(nick("Rua Sergipe 10"), null);          // rua real nao vira a Amarelinha
assert.equal(nick("Lojas Cem"), null);
assert.equal(nick("LANCHONETE DO BEDÉ"), null);
assert.equal(nick("Rua Minas Gerais, 1612"), null);  // endereco digitado segue o fluxo de rua
console.log("suggestionMatch ok");

// (21/10/2026) "Em frente a escola Lucimara" -> "EMEF Lucimara Cristina Viana Rossi"
{
  const escola = { nickname: "EMEF Lucimara Cristina Viana Rossi", address_text: "EMEF Lucimara Cristina Viana Rossi", lat: -21.0034, lng: -48.2148 };
  const posto = { nickname: "Posto Lucimara", address_text: "x", lat: 1, lng: 1 };
  assert.equal(pickSuggestion([escola], "Em frente a escola Lucimara"), escola);
  assert.equal(pickSuggestion([escola], "colegio lucimara"), escola);
  assert.equal(pickSuggestion([escola], "Rua Lucimara, 10"), null, "rua com o mesmo nome nao vira a escola");
  assert.equal(pickSuggestion([escola], "escola Maria"), null);
  assert.equal(pickSuggestion([posto, escola], "escola lucimara"), escola, "tipo diferente nao casa");
  console.log("OK - escola = EMEF (tipo do lugar)");
}
// (23/10/2026) lugar com nome de pessoa x rua com o mesmo nome
{
  const { isPersonNamedPlace, mentionsPlaceType } = await import("../src/bot/sugestoes.ts");
  assert.ok(isPersonNamedPlace("EMEF Doutor Maurício Montecchi") && isPersonNamedPlace("UBS Dr. Clovis de Carvalho") && isPersonNamedPlace("EMEI Professora Rosa Furlan Bertoni"));
  assert.ok(!isPersonNamedPlace("Amarelinha Supermercados") && !isPersonNamedPlace("Rodoviária") && !isPersonNamedPlace("Pesqueiro do Diu"));
  assert.ok(mentionsPlaceType("escola Mauricio Montecchi") && mentionsPlaceType("na emef clovis") && mentionsPlaceType("posto de saude"));
  assert.ok(!mentionsPlaceType("Maurício Montecchi (Bar do Carlão)") && !mentionsPlaceType("Rua Clóvis Guimarães Espínola centro"));
  console.log("OK - lugar com nome de pessoa");
}

// (08/11/2026) bairro entre parenteses nao vira sugestao pelo endereco dela
{
  assert.equal(parenPlaceMatches("bela vista", "Padaria Bella Vista", true), false, "bairro com numero");
  assert.equal(parenPlaceMatches("bela vista", "Padaria Bella Vista", false), false, "bairro sem numero");
  assert.equal(parenPlaceMatches("Bela Vista", "Mercado Bela Vista", true), false, "nome parcial com numero");
  assert.equal(parenPlaceMatches("Bar do Carlão", "Bar do Carlão", false), true, "caso de 23/10");
  assert.equal(parenPlaceMatches("bar do carlao", "Bar do Carlão", true), true, "nome inteiro com numero");
  assert.equal(parenPlaceMatches("amarelinha", "Amarelinha da Avenida", false), true, "sem numero, apelido");
  console.log("OK - lugar entre parenteses");
}
