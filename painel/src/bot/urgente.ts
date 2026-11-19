// Pedido URGENTE no bot: "urgente", "rapido", "com pressa", "emergencia"... O bot pula destino, confirmacao,
// categoria (usa a primeira), pagamento e preferencias: pede so o embarque e chama o carro.
// Se o embarque ja veio na mesma frase ("urgente rua sete de setembro 100"), devolve esse texto em `rest`.
// Teste: urgentRide.test.ts

const deaccent = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const URGENT = [
  /\burgent[ea]s?\b/, /\burgencia\b/, /\bemergencia\b/, /\bsocorro\b/,
  /\brapid[oa]\b/, /\brapidinho\b/, /\bcom pressa\b/, /\bpressa\b/, /\bcorrendo\b/, /\bcorre\b/,
  /\bo quanto antes\b/, /\bagora mesmo\b/, /\bo mais rapido\b/,
];

// Palavras de pedido que sobram nas pontas ("preciso de um carro urgente na rodoviaria", "... por favor")
const FILLER = new Set([
  "preciso", "precisando", "quero", "queria", "manda", "mande", "mandar", "chama", "chame", "chamar", "pede", "peca",
  "pedir", "de", "do", "da", "um", "uma", "carro", "corrida", "uber", "taxi", "motorista", "moto", "por", "favor",
  "pfv", "pf", "pra", "para", "ja", "agora", "aqui", "no", "na", "em", "o", "a", "me", "e", "eh", "to", "estou", "com",
  "socorro", "mesmo", "antes", "quanto", "mais",
]);

const STREET = /\b(rua|r|av|avenida|travessa|tv|alameda|al|rodovia|rod|estrada|praca|pca|largo|via|vila|condominio|cond|bairro|rodoviaria|hospital|shopping|posto|mercado|terminal|aeroporto|igreja|escola|faculdade|clinica|hotel)\b/;

export function detectUrgentRide(text: string | null | undefined): { urgent: boolean; rest: string | null } {
  const raw = String(text ?? "").trim();
  if (!raw || raw.length > 300) return { urgent: false, rest: null };
  const t = deaccent(raw);
  if (!URGENT.some((re) => re.test(t))) return { urgent: false, rest: null };

  // Tira as palavras de urgencia (em qualquer lugar) e as palavras de pedido so nas pontas;
  // o meio fica intacto ("Rua Sete de Setembro" nao perde o "de").
  const tokens = raw.split(/\s+/).filter((tok) => {
    const d = deaccent(tok).replace(/[^a-z0-9]/g, "");
    return !URGENT.some((re) => re.test(d)) && !/^(urgencia|emergencia|rapid[oa]|rapidinho|pressa|correndo|corre)$/.test(d);
  });
  const isFiller = (tok: string) => {
    const d = deaccent(tok).replace(/[^a-z0-9]/g, "");
    return d === "" || FILLER.has(d);
  };
  while (tokens.length && isFiller(tokens[0])) tokens.shift();
  while (tokens.length && isFiller(tokens[tokens.length - 1])) tokens.pop();
  const rest = tokens.join(" ").replace(/^[\s!?.,;:-]+|[\s!?.,;:-]+$/g, "").trim();
  const d = deaccent(rest);
  const words = d.split(/\s+/).filter(Boolean).length;
  // Parece endereco: tem numero, ou tem tipo de logradouro/lugar e mais de uma palavra (ou e um lugar conhecido)
  const looksLikeAddress = d.length >= 5 && (/\d/.test(d) || (STREET.test(d) && (words >= 2 || /rodoviaria|aeroporto|terminal/.test(d))));
  return { urgent: true, rest: looksLikeAddress ? rest : null };
}

/** Etapas desligadas no modo urgente (mesmo formato dos interruptores "Etapas do fluxo" do painel). */
export const URGENT_FLOW = {
  show_welcome_menu: false,
  ask_destination: false,
  ask_payment: false,
  ask_category: false,
  confirm_address: false,
} as const;

export const URGENT_ASK_ADDRESS =
  "\u{1F6A8} *Corrida urgente!* Mande só o *endereço de embarque* (ou a sua localização) que eu já chamo o carro.";
