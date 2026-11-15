// v14.40.10: numero da casa mandado SOZINHO depois do endereco ("Rua Amazonas" ... "43").
// O numero vai logo depois do nome da rua: "RUA AMAZONAS, CENTRO, Pitangueiras - SP" + 43
// -> "RUA AMAZONAS, 43, CENTRO, Pitangueiras - SP". Antes ia para o fim (depois da cidade) e
// so no endereco interno; a confirmacao e a Machine recebiam o endereco SEM numero.

/** "43", "n 43", "nº 43", "numero 43" -> "43". Outra coisa -> null. */
export function looseHouseNumber(text: string | null | undefined): string | null {
  const t = String(text ?? "").trim();
  const m = /^(?:n[º°o.]?\s*|n[uú]mero\s+)?(\d{1,6}[A-Za-z]?)$/i.exec(t);
  return m ? m[1] : null;
}

/** Numero que e parte do NOME da rua ("7 de Setembro", "13 de Maio") vira "#" (mesmo tamanho), para nao ser lido
 * como numero da casa. */
export function maskNameNumbers(s: string): string {
  return s.replace(/\b\d{1,2}(?=\s+de\s+(?:janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b)/gi,
    (d) => "#".repeat(d.length));
}

/** (16/10/2026) Numero com letras grudadas por erro de digitacao: "Jose Martins da Silva 70fd" -> "... 70".
 * Uma letra so (casa "10A", "10 B") continua valendo; 2 a 3 letras grudadas sao erro. */
/** (20/10/2026) "N402", "nº402", "n° 402", "no. 402" -> " 402": o numero colado no "N" passa a ser numero da casa
 * (no destino "Rua Pernambuco N402" o bot pedia o numero de novo). So com algarismo logo depois. */
export function soltaNumeroColado(text: string): string {
  return text.replace(/\bn(?:[º°]|o\.|\.)?\s*(?=\d)/gi, " ").replace(/\s{2,}/g, " ").trim();
}

export function fixHouseNumberTypo(text: string): string {
  return soltaNumeroColado(text).replace(/\b(\d{1,5})([a-zA-Z]{2,3})\b/g, (m, num: string, letras: string) =>
    /^(?:km|hs|hr|min|ml|kg)$/i.test(letras) ? m : num);
}

/** (20/10/2026) Numero de BAIRRO ("Gumercindo 2" = Jardim Gumercindo Hentz Soares II) nao e numero da casa.
 * Com 2+ numeros no texto, algarismo 1 a 3 logo depois de um nome (4+ letras, que nao e tipo de via) vira romano.
 * "Petrina Porfiro Fernandes Gumercindo 2 N342" -> "... Gumercindo II N342"; "Alvaro da Costa 340 Gumercindo 2" -> "... II". */
export function romanizeBairroNumber(text: string): string {
  const nums = text.match(/\d{1,6}/g) ?? []; // "N342" tambem conta
  if (nums.length < 2) return text;
  const ROMAN = ["", "I", "II", "III"];
  return text.replace(/\b([A-Za-zÀ-ÿ]{4,})\s+([1-3])\b(?!\s*(?:de|da|do)\b)/g, (m, nome: string, d: string) =>
    /^(?:rua|avenida|travessa|alameda|estrada|rodovia|viela|praca|praça|casa|numero|número)$/i.test(nome) ? m : `${nome} ${ROMAN[Number(d)]}`);
}

/** Endereco ja tem numero de casa? (digito no trecho da rua, antes da cidade). */
export function addressHasNumber(addr: string | null | undefined): boolean {
  const a = String(addr ?? "");
  const noRegion = a.replace(/,?\s*[^,]*\s-\s[A-Z]{2}\s*$/i, ""); // tira ", Cidade - UF"
  // (2a auditoria) "Rua 7 de Setembro" nao tem numero de casa: o 7 e do nome.
  return /\b\d{1,6}[A-Za-z]?\b/.test(maskNameNumbers(soltaNumeroColado(noRegion))); // (20/10/2026) "N402" vale
}

/** Poe o numero logo depois do nome da rua (1o trecho antes da virgula). */
export function insertHouseNumber(addr: string, num: string): string {
  const a = String(addr ?? "").trim();
  if (!a) return num;
  if (addressHasNumber(a)) return a;
  const parts = a.split(",").map((p) => p.trim()).filter(Boolean);
  return [`${parts[0]}, ${num}`, ...parts.slice(1)].join(", ");
}

const VIA = /^(?:rua|r|avenida|av|travessa|tv|alameda|al|estrada|rodovia|praca|largo|viela)$/;
const LIGA = /^(?:aqui|na|no|em|a|o|de|da|do|das|dos|e|fica|fico|to|estou|moro)$/;
function streetKey(s: string): string {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w && !VIA.test(w) && !LIGA.test(w)).join(" ");
}

/**
 * (25/10/2026) Caso real: o bot pediu o numero de "Avenida Cafe" e a passageira respondeu "Avenida cafe 485"; a
 * resposta virou DESTINO e a corrida foi sem numero. Resposta com a MESMA rua do embarque + numero = numero do
 * embarque. Devolve o numero (ou null se e outra rua / sem numero).
 */
export function sameStreetNumber(pickup: string | null | undefined, reply: string | null | undefined): string | null {
  const rua = streetKey(String(pickup ?? "").split(",")[0]);
  const r = String(reply ?? "");
  const num = (maskNameNumbers(soltaNumeroColado(r)).match(/\b(\d{1,6}[A-Za-z]?)\b/) ?? [])[1];
  if (!rua || !num) return null;
  const resto = streetKey(r);
  return resto === rua || resto.startsWith(`${rua} `) ? num : null;
}
