// Comissão da central sobre cada corrida: percentual ou valor fixo definidos na categoria (campos comissaoTipo e comissaoValor
// do cadastro "categorias"), por faixa de valor (Config › Regras de Crédito) ou pela regra própria do motorista
// (campos cobranca, cobrancaTipo e cobrancaValor do cadastro "motoristas": Padrão, Personalizado ou Isento).

import { cadastroPorId } from "../comum/cadastros.ts";
import { listar } from "../cadastros/armazem.ts";
import { normal } from "../servidor/util.ts";
import { credito } from "./credito.ts";
import { extraDaCategoria, registroDaCategoria } from "./categorias.ts";

export interface ResultadoComissao { valorBruto: number; taxaCentral: number; valorLiquido: number }

const cent = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const positivo = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };

function taxaDe(tipo: string, valor: number, bruto: number): number {
  const t = normal(tipo);
  if (t.startsWith("percent") || t.startsWith("porcent")) return (bruto * valor) / 100;
  if (t.startsWith("fixo") || t.startsWith("valor")) return valor;
  return 0;
}

/** Regra de cobrança própria do motorista, lida do cadastro (null = Padrão: vale a da categoria). */
function regraDoMotorista(empresaId: string, motoristaId?: string) {
  if (!motoristaId) return null;
  const m = listar(empresaId, cadastroPorId("motoristas")!).find((x) => x.id === motoristaId);
  if (!m) return null;
  const c = normal(String(m.cobranca ?? ""));
  if (c.startsWith("isent")) return { isento: true as const };
  if (c.startsWith("personaliz")) return { isento: false as const, tipo: String(m.cobrancaTipo ?? "Percentual"), valor: positivo(m.cobrancaValor) };
  return null;
}

/** Quanto a central fica da corrida e quanto sobra para o motorista. Nunca passa do valor bruto; centavos arredondados. */
export function calcularComissao(empresaId: string, categoria: string, valorBruto: number, motoristaId?: string): ResultadoComissao {
  const bruto = Number.isFinite(valorBruto) && valorBruto > 0 ? cent(valorBruto) : 0;
  let taxa = 0;
  const mot = regraDoMotorista(empresaId, motoristaId);
  if (mot?.isento) taxa = 0;
  else if (mot) taxa = taxaDe(mot.tipo, mot.valor, bruto);
  else {
    const reg = registroDaCategoria(empresaId, categoria);
    const faixas = extraDaCategoria(empresaId, categoria).comissao;
    if (faixas.usaFaixas) {
      const cat = normal(categoria);
      const regras = credito(empresaId).regras.filter((r) => (faixas.regras.length ? faixas.regras.includes(r.id) : !r.categoria || normal(r.categoria) === cat));
      const r = regras.find((x) => bruto >= x.de && bruto <= x.ate);
      if (r) taxa = taxaDe(r.tipo, r.valor, bruto);
    } else if (reg) taxa = taxaDe(String(reg.comissaoTipo ?? "Percentual"), positivo(reg.comissaoValor), bruto);
  }
  const taxaCentral = cent(Math.min(Math.max(taxa, 0), bruto));
  return { valorBruto: bruto, taxaCentral, valorLiquido: cent(bruto - taxaCentral) };
}
