// Teste portado do sistema de referência (regras do bot), sem alterar as regras.
import assert from "node:assert/strict";
import { parseCoordPaste } from "../src/bot/coordenadas.ts";

assert.deepEqual(parseCoordPaste("Espetinho do Gui : -21.02613850144648, -48.22754715600412"),
  { name: "Espetinho do Gui", lat: -21.026139, lng: -48.227547 });
assert.deepEqual(parseCoordPaste("-21.02613850144648, -48.22754715600412"), { name: null, lat: -21.026139, lng: -48.227547 });
assert.deepEqual(parseCoordPaste("(-21.0261, -48.2275)"), { name: null, lat: -21.0261, lng: -48.2275 });
assert.deepEqual(parseCoordPaste("-21.0261 -48.2275"), { name: null, lat: -21.0261, lng: -48.2275 });
assert.deepEqual(parseCoordPaste("https://www.google.com/maps/place/X/@-21.026138,-48.227547,17z/data=x"), { name: null, lat: -21.026138, lng: -48.227547 });
assert.deepEqual(parseCoordPaste("Hospital - -21.0100, -48.2200"), { name: "Hospital", lat: -21.01, lng: -48.22 });
assert.equal(parseCoordPaste("Rua Sergipe, 606"), null, "endereco escrito nao e coordenada");
assert.equal(parseCoordPaste("-48.2275, -21.0261"), null, "invertido (fora do Brasil)");
assert.equal(parseCoordPaste(""), null);
console.log("coordPaste ok");
