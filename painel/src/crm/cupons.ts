// Cupons das campanhas e jornadas: vêm do cadastro "cupons" da empresa (Financeiro › Cupons e descontos).
// O CRM não guarda cupom próprio: só o código escolhido.

import * as Cad from "../cadastros/armazem.ts";
import { cadastroPorId } from "../comum/cadastros.ts";
import { agoraBr, normal } from "../servidor/util.ts";

export interface CupomCrm { codigo: string; descricao: string; ativo: boolean; inicio: string; fim: string; valido: boolean }

/** Cupons da empresa, com "valido" = ativo e dentro das datas hoje (Brasília). */
export function cuponsDaEmpresa(empresaId: string, hoje = agoraBr().toISOString().slice(0, 10)): CupomCrm[] {
  const cad = cadastroPorId("cupons");
  if (!cad) return [];
  return Cad.listar(empresaId, cad).map((r) => {
    const inicio = String(r.inicio ?? ""), fim = String(r.fim ?? "");
    const ativo = r.ativo === true;
    return { codigo: String(r.codigo ?? "").trim().toUpperCase(), descricao: String(r.descricao ?? ""), ativo, inicio, fim, valido: ativo && (!inicio || inicio <= hoje) && (!fim || fim >= hoje) };
  }).filter((c) => c.codigo);
}

/** Confere o código. `exigirValido` no disparo (cupom precisa estar ativo e no prazo). Devolve o código como no cadastro. */
export function conferirCupom(empresaId: string, codigo: string, exigirValido: boolean): string {
  const c = codigo.trim();
  if (!c) return "";
  const achado = cuponsDaEmpresa(empresaId).find((x) => normal(x.codigo) === normal(c));
  if (!achado) throw new Error(`O cupom ${c.toUpperCase()} não existe. Cadastre em Cupons e descontos.`);
  if (exigirValido && !achado.valido) throw new Error(`O cupom ${achado.codigo} está desligado ou fora do prazo.`);
  return achado.codigo;
}
