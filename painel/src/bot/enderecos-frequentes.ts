// (25/10/2026) Enderecos salvos do passageiro no menu "Encontrei seus enderecos salvos". Caso real: o mesmo endereco
// salvo 2x (digitado "r. santa catarina, 284" e "r. santa catarina", os dois viraram "Rua Joaquim Bernardino Batista,
// 105") aparecia repetido, cortado em 20 letras: "RUA JOAQUIM BERNARDI" e "Rua Joaquim Bernardi".

export interface FreqAddress {
  id: string;
  address_text: string;
  address_formatted?: string | null;
  origin_reference?: string | null;
  use_count?: number | null;
}

/** Busca alguns a mais e passa por aqui: tira os repetidos (mesmo endereco, maiuscula/acento diferentes). */
export function uniqueFreqAddresses<T extends FreqAddress>(rows: T[] | null | undefined, max = 3): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows ?? []) {
    const key = String(r.origin_reference || r.address_formatted || r.address_text || "")
      .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(r);
    if (out.length >= max) break;
  }
  return out;
}

const LOWER = new Set(["de", "da", "do", "das", "dos", "e"]);

/** Texto da opcao: rua e numero (sem bairro/cidade), sem caixa alta, ate 40 letras. */
export function freqLabel(a: FreqAddress): string {
  let s = String(a.origin_reference || a.address_formatted || a.address_text || "").trim();
  const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2 && /^\d+[a-z]?$/i.test(parts[1])) s = `${parts[0]}, ${parts[1]}`;
  else if (parts.length) s = parts[0];
  if (s === s.toUpperCase()) {
    s = s.toLowerCase().split(" ").map((w, i) => (i > 0 && LOWER.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }
  return s.length > 40 ? `${s.slice(0, 39).trimEnd()}…` : s;
}
