// Desafios para CLIENTES (aba Clientes da Machine): meta de corridas finalizadas num período, recompensa em créditos na carteira
// do passageiro ou personalizada. Puro (sem banco): quem chama entrega os clientes, as corridas e quem já recebeu.

import type { Registro } from "../cadastros/armazem.ts";
import type { CorridaPropria } from "../corridas/index.ts";

export const TIPO_DESAFIO_CLIENTE = "Desafio de clientes";

const dig = (v: unknown) => { const d = String(v ?? "").replace(/\D/g, ""); return (d.length === 12 || d.length === 13) && d.startsWith("55") ? d.slice(2) : d; };
const inicioDe = (d: Registro) => `${d.inicio ?? "0000-01-01"}T${/^\d{2}:\d{2}$/.test(String(d.horaInicio)) ? d.horaInicio : "00:00"}`;
const fimDe = (d: Registro) => `${d.fim ?? "9999-12-31"}T${/^\d{2}:\d{2}$/.test(String(d.horaFim)) ? d.horaFim : "23:59"}`;
const data = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : "");

/** Finalizadas por telefone (dentro de um intervalo de dias opcional). */
function finalizadasPorTelefone(corridas: CorridaPropria[], de = "", ate = "") {
  const m = new Map<string, number>();
  for (const c of corridas) {
    if (c.status !== "finalizada") continue;
    const dia = (c.finalizadaEm ?? c.solicitadaEm).slice(0, 10);
    if ((de && dia < de) || (ate && dia > ate)) continue;
    m.set(dig(c.passageiro.telefone), (m.get(dig(c.passageiro.telefone)) ?? 0) + 1);
  }
  return m;
}

/** Clientes que recebem o desafio: ativos e, se houver filtro, com finalizadas entre o mínimo e o máximo no período. */
export function clientesDesafiados(clientes: Registro[], d: Record<string, unknown>, corridas: CorridaPropria[]): Registro[] {
  const min = d.corridasMin == null || d.corridasMin === "" ? null : Number(d.corridasMin), max = d.corridasMax == null || d.corridasMax === "" ? null : Number(d.corridasMax);
  const fin = finalizadasPorTelefone(corridas, data(d.corridasDe), data(d.corridasAte));
  return clientes.filter((c) => {
    if (String(c.status ?? "Ativo") !== "Ativo") return false;
    const n = fin.get(dig(c.telefone)) ?? 0;
    return (min == null || n >= min) && (max == null || n <= max);
  });
}

export interface ProgressoCliente { id: string; nome: string; feito: number; meta: number; situacao: "Concluído" | "Participando" | "Pendente"; aceitoEm: string | null; finalizadoEm: string | null; pago: boolean; valorPago: number; aguardandoAprovacao: boolean; app: number; macaneta: number; pendencia: number }

/** Progresso de cada cliente desafiado. `id` = telefone (chave do passageiro nos apps). */
export function progressoClientes(clientes: Registro[], d: Registro, corridas: CorridaPropria[], jaRecebeu: (telefone: string) => boolean): ProgressoCliente[] {
  const meta = Number(d.meta) || 0, premio = typeof d.premio === "number" ? d.premio : 0, ini = inicioDe(d), fim = fimDe(d);
  return clientesDesafiados(clientes, d, corridas).map((c) => {
    const tel = dig(c.telefone);
    const minhas = corridas.filter((x) => dig(x.passageiro.telefone) === tel && x.status === "finalizada" && (x.finalizadaEm ?? "").slice(0, 16) >= ini && (x.finalizadaEm ?? "").slice(0, 16) <= fim)
      .sort((a, b) => String(a.finalizadaEm).localeCompare(String(b.finalizadaEm)));
    const feito = minhas.length;
    const situacao = meta > 0 && feito >= meta ? "Concluído" : feito > 0 ? "Participando" : "Pendente";
    const pago = jaRecebeu(String(c.telefone));
    return {
      id: String(c.telefone), nome: String(c.nome ?? ""), feito, meta, situacao, aceitoEm: minhas[0]?.finalizadaEm ?? null,
      finalizadoEm: situacao === "Concluído" ? minhas[meta - 1]?.finalizadaEm ?? null : null,
      pago, valorPago: pago ? premio : 0, aguardandoAprovacao: situacao === "Concluído" && !pago && d.aprovacao === "Manual",
      app: minhas.filter((x) => x.canal === "app").length, macaneta: minhas.filter((x) => x.canal === "totem").length, pendencia: 0,
    };
  });
}
