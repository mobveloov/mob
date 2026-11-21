// Números no formato brasileiro (vírgula nos decimais, ponto nos milhares) para qualquer tela.

/** 1.517 -> "1,517" (com `casas` fixas). Usa sempre pt-BR, não o idioma do navegador. */
export const decimal = (n: number | null | undefined, casas = 1): string =>
  n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

/** Distância em km com 3 casas: "1,517 km". */
export const kmBr = (n: number | null | undefined, casas = 3): string => (n == null || !Number.isFinite(n) ? "---" : `${decimal(n, casas)} km`);
