// Validações dos cadastros de Motorista e Empresa (CPF e CNPJ com dígitos verificadores, e-mail, telefone, CEP, placa...).
// Todas devolvem texto em português quando algo está errado e nada (undefined) quando está certo.

export const soDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

export const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

export function cpfValido(v: unknown): boolean {
  const c = soDigitos(v);
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  const dv = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(c[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}

export function cnpjValido(v: unknown): boolean {
  const c = soDigitos(v);
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const dv = (n: number) => {
    let soma = 0, peso = n - 7;
    for (let i = 0; i < n; i++) { soma += Number(c[i]) * peso; peso = peso === 2 ? 9 : peso - 1; }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13]);
}

export const emailValido = (v: unknown) => /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(String(v ?? "").trim());

/** Telefone brasileiro com DDD (10 ou 11 dígitos; aceita o 55 na frente). */
export function telefoneValido(v: unknown): boolean {
  let d = soDigitos(v);
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return false;
  if (Number(d.slice(0, 2)) < 11) return false;
  return d.length === 10 || d[2] === "9";
}

export const cepValido = (v: unknown) => soDigitos(v).length === 8;
/** Placa antiga (ABC1234) ou Mercosul (ABC1D23). */
export const placaValida = (v: unknown) => /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, ""));
/** RENAVAM: 9 a 11 números. */
export const renavamValido = (v: unknown) => /^\d{9,11}$/.test(soDigitos(v));

/** Confere só o que veio preenchido (vazio passa; obrigatoriedade é conferida à parte). */
export function conferir(regras: Array<[unknown, (v: unknown) => boolean, string]>): string | undefined {
  for (const [valor, ok, msg] of regras) if (String(valor ?? "").trim() !== "" && !ok(valor)) return msg;
  return undefined;
}
