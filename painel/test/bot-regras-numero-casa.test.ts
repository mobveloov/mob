// Teste portado do sistema de referência (regras do bot), sem alterar as regras.
// node --experimental-strip-types supabase/functions/_shared/houseNumber.test.ts
import assert from "node:assert/strict";
import { sameStreetNumber, addressHasNumber, fixHouseNumberTypo, insertHouseNumber, looseHouseNumber, romanizeBairroNumber } from "../src/bot/numero-casa.ts";

assert.equal(looseHouseNumber("43"), "43");
assert.equal(looseHouseNumber("n 43"), "43");
assert.equal(looseHouseNumber("nº 43"), "43");
assert.equal(looseHouseNumber("numero 50"), "50");
assert.equal(looseHouseNumber("Rua 7"), null);
assert.equal(looseHouseNumber("sim"), null);

assert.equal(insertHouseNumber("RUA AMAZONAS, CENTRO, Pitangueiras - SP", "43"), "RUA AMAZONAS, 43, CENTRO, Pitangueiras - SP");
assert.equal(insertHouseNumber("Rua Pernambuco", "50"), "Rua Pernambuco, 50");
assert.equal(insertHouseNumber("RUA PERNAMBUCO, Pitangueiras - SP", "50"), "RUA PERNAMBUCO, 50, Pitangueiras - SP");
assert.equal(insertHouseNumber("Rua Amazonas, 53", "43"), "Rua Amazonas, 53", "ja tem numero: nao mexe");

assert.equal(addressHasNumber("RUA AMAZONAS, CENTRO, Pitangueiras - SP"), false);
assert.equal(addressHasNumber("Rua Amazonas, 53, Centro, Pitangueiras - SP"), true);
// 2a auditoria: numero do nome da rua
assert.equal(addressHasNumber("Rua 7 de Setembro, Centro, Pitangueiras - SP"), false);
assert.equal(addressHasNumber("Rua 7 de Setembro, 43, Centro"), true);
assert.equal(insertHouseNumber("Rua 7 de Setembro, Centro", "43"), "Rua 7 de Setembro, 43, Centro");
assert.equal(addressHasNumber("Av. 9 de Julho"), false);
assert.equal(fixHouseNumberTypo("José Martins da Silva 70fd bairro São Sebastião"), "José Martins da Silva 70 bairro São Sebastião");
assert.equal(fixHouseNumberTypo("Rua X 10A"), "Rua X 10A");
assert.equal(fixHouseNumberTypo("Rua X 10 B"), "Rua X 10 B");
assert.equal(fixHouseNumberTypo("km 5 rodovia 10km"), "km 5 rodovia 10km");
assert.equal(romanizeBairroNumber("Petrina Pórfiro Fernandes Gumercindo 2 N342"), "Petrina Pórfiro Fernandes Gumercindo II N342");
assert.equal(romanizeBairroNumber("Rua Álvaro da Costa 340 Gumercindo 2"), "Rua Álvaro da Costa 340 Gumercindo II");
assert.equal(romanizeBairroNumber("Rua Amazonas 2"), "Rua Amazonas 2", "um numero so: e a casa");
assert.equal(romanizeBairroNumber("Rua 3 de Maio 20"), "Rua 3 de Maio 20");
assert.equal(romanizeBairroNumber("Rua Ceara 990 casa 2"), "Rua Ceara 990 casa 2");
console.log("houseNumber ok");

// (20/10/2026) numero colado no N: "Rua Pernambuco N402" tem numero (destino pedia o numero de novo)
{
  const { soltaNumeroColado, addressHasNumber: temNum } = await import("../src/bot/numero-casa.ts");
  assert.equal(soltaNumeroColado("Rua Pernambuco N402"), "Rua Pernambuco 402");
  assert.equal(soltaNumeroColado("Rua Bahia nº 200"), "Rua Bahia 200");
  assert.equal(soltaNumeroColado("Rua Bahia n°200"), "Rua Bahia 200");
  assert.equal(soltaNumeroColado("Rua Nova Esperanca 10"), "Rua Nova Esperanca 10", "palavra com n no comeco nao muda");
  assert.equal(soltaNumeroColado("Rua do Centro no 5"), "Rua do Centro no 5", "\"no\" sozinho e palavra comum: nao mexe");
  assert.ok(temNum("Rua Pernambuco N402"));
  assert.ok(!temNum("Rua Pernambuco"));
  console.log("soltaNumeroColado ok");
}
// (25/10/2026) resposta ao "qual o numero?" repetindo a rua
assert.equal(sameStreetNumber("Avenida Cafe, Centro, Pitangueiras - SP", "Avenida café 485"), "485");
assert.equal(sameStreetNumber("Avenida Cafe", "av cafe, 485"), "485");
assert.equal(sameStreetNumber("Avenida Cafe", "aqui na avenida café nº485"), "485");
assert.equal(sameStreetNumber("Rua 7 de Setembro, Centro", "Rua 7 de Setembro 120"), "120");
assert.equal(sameStreetNumber("Avenida Cafe", "Rua Pernambuco 402"), null);
assert.equal(sameStreetNumber("Avenida Cafe", "Avenida Cafe"), null);
assert.equal(sameStreetNumber("Estrada Fazenda Primavera", "Rua Pernambuco 402"), null);

