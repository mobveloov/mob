// Observador: gera eventos de mudança de status consultando a lista de corridas de tempos em tempos.
// Serve para o Sistema B (que não tem webhook) e como reserva para o Sistema A (se o webhook falhar).
// Cada observador é de UMA integração de UMA empresa; a memória fica só dentro dele.

import type { Adaptador, Evento, StatusCorrida } from "./tipos.ts";

export interface OpcoesObservador {
  /** Janela de busca para trás, em minutos (padrão 180). */
  janelaMin?: number;
  /** Quantas páginas ler por verificação (padrão 3). */
  maxPaginas?: number;
  agora?: () => Date;
}

export function criarObservador(adaptador: Adaptador, op: OpcoesObservador = {}) {
  const ultimo = new Map<string, StatusCorrida>();
  let primeira = true;
  const agora = op.agora ?? (() => new Date());

  return {
    /** Lê as corridas recentes e devolve só o que mudou desde a última chamada.
     *  Na primeira chamada só memoriza (não gera eventos), para não inundar o painel. */
    async verificar(): Promise<Evento[]> {
      const de = new Date(agora().getTime() - (op.janelaMin ?? 180) * 60_000).toISOString();
      const eventos: Evento[] = [];
      for (let pagina = 1; pagina <= (op.maxPaginas ?? 3); pagina++) {
        const r = await adaptador.listarCorridas({ de, pagina, limite: 100 });
        for (const c of r.itens) {
          const antes = ultimo.get(c.id);
          if (!primeira && antes !== c.status) {
            eventos.push({
              tipo: "status",
              integracaoId: c.integracaoId,
              origem: c.origem,
              corridaId: c.id,
              em: agora().toISOString(),
              status: c.status,
              statusAnterior: antes,
              bruto: c,
            });
          }
          ultimo.set(c.id, c.status);
        }
        if (!r.temMais) break;
      }
      primeira = false;
      return eventos;
    },
    /** Quantas corridas estão na memória. */
    tamanho: () => ultimo.size,
  };
}
