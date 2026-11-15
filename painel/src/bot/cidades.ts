// Cidades ativas do bot: cada conexão (número) pode atender uma cidade. O passageiro escreve só "Rua das Flores, 120"
// e o bot completa com ", Cidade - UF" da conexão; se ele já citou uma cidade atendida (a da conexão ou outra), vale a dele.

import { cidadesAtendidas } from "../enderecos/index.ts";
import { normal } from "../servidor/util.ts";

export interface CidadeBot { codigo: string; nome: string; uf: string }

/** Cidade atendida da empresa pelo código; null se não for uma das atendidas. */
export function cidadePorCodigo(empresaId: string, codigo: string): CidadeBot | null {
  const c = cidadesAtendidas(empresaId).find((x) => x.codigo === codigo);
  return c ? { codigo: c.codigo, nome: c.nome, uf: c.uf } : null;
}

/** O texto já cita alguma das cidades (por nome inteiro, sem acento)? */
export function citaCidade(texto: string, cidades: Array<{ nome: string }>): boolean {
  const t = ` ${normal(texto)} `;
  return cidades.some((c) => c.nome && t.includes(` ${normal(c.nome)} `));
}

/**
 * Põe o sufixo ", Cidade - UF" no endereço escrito. Não mexe em ponto do mapa nem em texto que já cita
 * uma cidade atendida.
 */
export function comCidade(texto: string, cidade: CidadeBot | null, atendidas: Array<{ nome: string }>): string {
  if (!cidade || !texto.trim() || citaCidade(texto, [cidade, ...atendidas])) return texto;
  return `${texto.replace(/[\s,.-]+$/, "")}, ${cidade.nome} - ${cidade.uf}`;
}
