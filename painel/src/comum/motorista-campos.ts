// App e painel guardam o motorista no MESMO cadastro, mas por muito tempo usaram nomes diferentes para a mesma coisa:
// rua ("rua" no app, "endereco" no painel), CNH ("cnh" no app, "cnhNumero" no painel) e número do endereço
// ("S/N" no app, "semNumero" no painel). Aqui os pares ficam iguais nos dois sentidos.

type Dados = Record<string, unknown>;
const t = (v: unknown) => (v == null ? "" : String(v).trim());

/** Antes de gravar: o que veio por um nome vale também para o outro. Mexe no próprio objeto e o devolve. */
export function espelharCamposDoMotorista<T extends Dados>(d: T): T {
  const o = d as Dados;
  if ("endereco" in o && !("rua" in o)) o.rua = o.endereco;
  else if ("rua" in o && !("endereco" in o)) o.endereco = o.rua;
  if ("cnhNumero" in o && !("cnh" in o)) o.cnh = o.cnhNumero;
  else if ("cnh" in o && !("cnhNumero" in o)) o.cnhNumero = o.cnh;
  if (o.semNumero === true) o.numero = "S/N";
  else if (o.numero === "S/N" && !("semNumero" in o)) o.semNumero = true;
  else if ("semNumero" in o && o.semNumero !== true && t(o.numero) === "S/N") o.numero = null;
  return d;
}

/** Ao mostrar: o registro com os dois nomes preenchidos (cadastros antigos têm só um deles). */
export function visaoDoMotorista<T extends Dados>(m: T): T {
  const o: Dados = { ...m };
  const rua = t(o.endereco) || t(o.rua), cnh = t(o.cnhNumero) || t(o.cnh);
  o.endereco = rua || null; o.rua = rua || null;
  o.cnhNumero = cnh || null; o.cnh = cnh || null;
  o.semNumero = o.semNumero === true || t(o.numero) === "S/N";
  return o as T;
}
