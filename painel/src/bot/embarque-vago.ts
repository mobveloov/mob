// "Estou em casa", "pode vir aqui", "quero uma corrida, to em casa": o passageiro disse ONDE esta sem dar o endereco.
// O bot nao pode aceitar isso como embarque (antes ia direto perguntar o destino com o embarque "CASA").
// Modulo puro. Teste: vaguePickup.test.ts

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Palavras de pedido/cortesia que nao dizem nada sobre o lugar
const FILLER = /\b(oi|ola|bom dia|boa tarde|boa noite|por favor|pf|pfv|quero|queria|preciso|precisava|gostaria|de|pedir|solicitar|chamar|chama|manda|mandar|me|um|uma|corrida|carro|taxi|motorista|uber|agora|ja|rapido|urgente|e|pra|para|mim|ai|vem|vir|pode|podem|buscar|pegar|me pega)\b/g;

/** O texto e so "estou em casa / aqui / no trabalho" (sem rua, numero ou nome de lugar)? */
export function isVaguePickup(text: string | null | undefined): boolean {
  let t = strip(String(text ?? "")).replace(/[^a-z0-9\s]/g, " ");
  if (!t.trim() || /\d/.test(t)) return false; // tem numero: e endereco
  t = t.replace(FILLER, " ").replace(/\s+/g, " ").trim();
  if (!t) return false;
  return /^(eu )?((estou|to|tou|esto|fico|tamo|estamos) )?(aqui )?((em|na|no|da|do) )?(minha |nossa )?(casa|residencia|aqui|trabalho|serviço|servico|lugar de sempre)( aqui)?$/.test(t);
}
