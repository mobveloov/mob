// Formas de pagamento marcadas ao solicitar uma corrida pela central (Corridas > Solicitar nova corrida).
// Voucher vale sozinho (exige empresa e número do voucher); as outras podem ser marcadas juntas.

export function marcarPagamento(atual: string[], forma: string, marcar: boolean): string[] {
  if (!marcar) return atual.filter((x) => x !== forma);
  return forma === "Voucher" ? ["Voucher"] : [...atual.filter((x) => x !== "Voucher" && x !== forma), forma];
}
