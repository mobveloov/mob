// Comissão da central: quanto fica com a central e quanto sobra para o motorista numa corrida.
//
//   valorLiquido = valorBruto − taxaCentral
//
// A regra vem da CATEGORIA da corrida (campos "comissaoTipo" e "comissaoValor" no cadastro de categorias) e, se o
// motorista tiver uma cobrança própria, ela vale no lugar (campos "cobranca", "cobrancaTipo" e "cobrancaValor" no
// cadastro de motoristas: "Padrão" segue a categoria, "Personalizado" usa a taxa dele, "Isento" não paga nada).
// Tipo "Percentual": taxa = bruto × valor ÷ 100. Tipo "Valor fixo": taxa = valor. A taxa nunca passa do bruto.
// Tudo arredondado em centavos.
//
// Este é o ÚNICO ponto que lê esses nomes de campo. Quando o painel trouxer o cálculo dele
// (painel/src/config/comissao.ts, com a mesma assinatura), basta trocar o corpo de calcularComissao.

import { cadastroPorId } from "../comum/cadastros.ts";
import { listar } from "../cadastros/armazem.ts";
import { normal } from "../servidor/util.ts";

export interface RegraComissao { tipo: "Percentual" | "Valor fixo" | ""; valor: number }
export interface Comissao { valorBruto: number; taxaCentral: number; valorLiquido: number; regra: "categoria" | "motorista" | "isento" | "nenhuma" }

const centavos = (n: number) => Math.round(n * 100) / 100;

/** Conta pura (sem cadastro): usada pelo cálculo e pelos testes. */
export function comissaoDe(regra: RegraComissao | null, valorBruto: number): { taxaCentral: number; valorLiquido: number; valorBruto: number } {
  const bruto = centavos(Math.max(0, Number.isFinite(valorBruto) ? valorBruto : 0));
  let taxa = 0;
  if (regra && regra.valor > 0) {
    if (regra.tipo === "Percentual") taxa = (bruto * Math.min(regra.valor, 100)) / 100;
    else if (regra.tipo === "Valor fixo") taxa = regra.valor;
  }
  taxa = centavos(Math.min(Math.max(taxa, 0), bruto));
  return { valorBruto: bruto, taxaCentral: taxa, valorLiquido: centavos(bruto - taxa) };
}

const tipoDe = (v: unknown): RegraComissao["tipo"] => {
  const t = normal(String(v ?? ""));
  return t.startsWith("percent") ? "Percentual" : t.startsWith("valor") || t === "fixo" ? "Valor fixo" : "";
};
const numeroDe = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(String(v ?? "").replace(",", ".")) || 0);

/** Só para os testes: troca a leitura do cadastro. */
let fonte: ((empresaId: string, categoria: string, motoristaId?: string) => { categoria: RegraComissao | null; motorista: "Padrão" | "Personalizado" | "Isento"; propria: RegraComissao | null }) | null = null;
export const definirFonteDeComissaoParaTeste = (f: typeof fonte) => { fonte = f; };

function regras(empresaId: string, categoria: string, motoristaId?: string) {
  if (fonte) return fonte(empresaId, categoria, motoristaId);
  const cat = listar(empresaId, cadastroPorId("categorias")!).find((c) => normal(String(c.nome ?? "")) === normal(categoria));
  const mot = motoristaId ? listar(empresaId, cadastroPorId("motoristas")!).find((m) => m.id === motoristaId) : undefined;
  const modo = normal(String(mot?.cobranca ?? ""));
  return {
    categoria: cat ? { tipo: tipoDe(cat.comissaoTipo), valor: numeroDe(cat.comissaoValor) } : null,
    motorista: (modo.startsWith("isento") ? "Isento" : modo.startsWith("personal") ? "Personalizado" : "Padrão") as "Padrão" | "Personalizado" | "Isento",
    propria: mot ? { tipo: tipoDe(mot.cobrancaTipo), valor: numeroDe(mot.cobrancaValor) } : null,
  };
}

/** A regra que vale para este motorista nesta categoria (o app usa para mostrar o líquido de uma contra-oferta). */
export function regraDeComissao(empresaId: string, categoria: string, motoristaId?: string): RegraComissao {
  const r = regras(empresaId, categoria, motoristaId);
  if (r.motorista === "Isento") return { tipo: "", valor: 0 };
  if (r.motorista === "Personalizado" && r.propria && r.propria.valor > 0) return r.propria;
  return r.categoria ?? { tipo: "", valor: 0 };
}

/** Quanto a central fica e quanto sobra para o motorista numa corrida de `valorBruto`. */
export function calcularComissao(empresaId: string, categoria: string, valorBruto: number, motoristaId?: string): Comissao {
  const r = regras(empresaId, categoria, motoristaId);
  if (r.motorista === "Isento") return { ...comissaoDe(null, valorBruto), regra: "isento" };
  if (r.motorista === "Personalizado" && r.propria && r.propria.valor > 0) return { ...comissaoDe(r.propria, valorBruto), regra: "motorista" };
  const c = comissaoDe(r.categoria, valorBruto);
  return { ...c, regra: c.taxaCentral > 0 ? "categoria" : "nenhuma" };
}
