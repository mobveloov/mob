// O que o cadastro da empresa conveniada (Cadastro › Empresas) manda na corrida: desconto por forma de pagamento e
// observação para o motorista. Fica separado de corridas/index.ts e gestao/empresas.ts para os dois poderem usar sem dependência circular.

import { cadastroPorId } from "../comum/cadastros.ts";
import { listar, type Registro } from "../cadastros/armazem.ts";
import { arred, normal } from "../servidor/util.ts";

/** Forma de pagamento do cadastro da empresa -> nomes que a corrida usa (painel, bot, totem e apps). */
export const PAGAMENTO_MACHINE_PARA_CORRIDA: Record<string, string[]> = {
  Dinheiro: ["Dinheiro"], "Maquininha de Débito": ["Cartão na Maquininha", "Débito (máquina)"], "Maquininha de Crédito": ["Cartão na Maquininha", "Crédito (máquina)"], "Cartão no app": ["Cartão no App"], Pix: ["Pix", "Pix no app"],
};

export function registroDaEmpresa(empresaId: string, nome: string | undefined): Registro | undefined {
  if (!nome) return undefined;
  return listar(empresaId, cadastroPorId("conveniadas")!).find((r) => normal(r.nome) === normal(nome));
}

function lerLista(v: unknown): Array<{ tipo: string; desconto: number }> {
  try {
    const x = typeof v === "string" ? JSON.parse(v) : v;
    return Array.isArray(x) ? x.filter((p) => p && typeof p.tipo === "string").map((p) => ({ tipo: p.tipo, desconto: Number(p.desconto) || 0 })) : [];
  } catch { return []; }
}

/** Desconto (%) que a empresa tem para a forma de pagamento da corrida (0 quando não há). */
export function descontoPctDaEmpresa(reg: Registro | undefined, pagamento: string): number {
  if (!reg || !pagamento) return 0;
  const p = lerLista(reg.pagamentosPermitidos).find((x) => (PAGAMENTO_MACHINE_PARA_CORRIDA[x.tipo] ?? [x.tipo]).some((n) => normal(n) === normal(pagamento)));
  return p && p.desconto > 0 && p.desconto <= 100 ? p.desconto : 0;
}

/** Desconto em reais sobre o valor da corrida, pela empresa e a forma de pagamento. */
export function descontoDaEmpresa(empresaId: string, empresaConveniada: string | undefined, pagamento: string, valor: number | null): { pct: number; valor: number } | null {
  if (valor == null || !(valor > 0)) return null;
  const pct = descontoPctDaEmpresa(registroDaEmpresa(empresaId, empresaConveniada), pagamento);
  if (!pct) return null;
  const v = arred(valor * pct / 100);
  return v > 0 ? { pct, valor: v } : null;
}

/** Observação da empresa para o motorista (o app do motorista mostra na chamada e na corrida). */
export function observacaoDaEmpresa(empresaId: string, empresaConveniada: string | undefined): string {
  return String(registroDaEmpresa(empresaId, empresaConveniada)?.obsMotorista ?? "").replace(/[<>]/g, "").trim().slice(0, 500);
}
