// (14/11/2026) "Não informar destino" opcional por conexão (fluxo.allow_skip_destination, padrão LIGADO).
// Ligado: o menu do destino mostra "2 - Não informar" e a corrida pode seguir com "DEFINIR NO CARRO".
// Desligado: o destino é obrigatório — não mostra a opção e, se o passageiro tentar pular, o bot explica e pergunta de novo.

export type DestOption = { id: string; label: string };

/** Só desliga se a conexão salvou false de propósito; ausente/null/qualquer outro valor = ligado (como sempre foi). */
export function allowSkipDestination(flow: { allow_skip_destination?: unknown } | null | undefined): boolean {
  return flow?.allow_skip_destination !== false;
}

/** Opções da pergunta "Para onde você vai?". Sem "Não informar" quando o destino é obrigatório. */
export function destinationOptions(allowSkip: boolean): DestOption[] {
  const base: DestOption[] = [{ id: "dest_digitar", label: "Digitar Endereco \u{1F4DD}" }];
  return allowSkip ? [...base, { id: "dest_nao_informar", label: "Nao informar \u{1F6AB}" }] : base;
}

function deaccent(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const SKIP_PHRASES = new Set([
  "2", "nao", "nao informar", "nao informar destino", "nao quero informar", "nao sei", "sei nao", "nao sei o destino",
  "sem destino", "dest_nao_informar", "definir no carro", "definir no carro com o motorista",
  "km livre", "kmlivre", "livre", "depois eu falo", "falo no carro", "falo com o motorista",
]);

/** O passageiro quis pular o destino? (texto ou id da opção) */
export function isSkipDestinationText(text: string | null | undefined): boolean {
  const d = deaccent(String(text ?? "")).replace(/[^a-z0-9_\s]/g, " ").replace(/\s+/g, " ").trim();
  return d !== "" && SKIP_PHRASES.has(d);
}

/** "skip" = segue sem destino; "required" = explicar e perguntar de novo; "none" = não é pedido para pular. */
export function decideSkip(allowSkip: boolean, text: string | null | undefined): "skip" | "required" | "none" {
  if (!isSkipDestinationText(text)) return "none";
  return allowSkip ? "skip" : "required";
}

/** Texto de quando o destino é obrigatório e o passageiro tentou pular. */
export const DEST_REQUIRED_TEXT =
  "\u{1F3AF} Para pedir a corrida eu preciso do destino.\n\n\u{1F4DD} Mande a rua e o número, o nome do lugar (ex.: \"Shopping\"), sua localização ou um áudio.";

/** Quando o passageiro mandou algo que não é endereço e o destino é obrigatório (sem a saída "envie 2"). */
export const DEST_RETRY_REQUIRED_TEXT =
  "\u{1F3AF} Este e o endereco pra onde voce quer IR (o destino da corrida) — nao o lugar onde voce esta agora.\n\n\u{1F4CD} Exemplo: se voce quer ir ao shopping, mande \"Shopping\".\nSe nao souber o endereco, mande um audio dizendo o nome do lugar ou envie sua localizacao.";
