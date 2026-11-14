// Eventos do passageiro para os gatilhos do CRM (cadastro, simulação e status da corrida).
// As corridas e o cadastro chamam emitirEventoCrm(); o motor dos gatilhos (gatilhos.ts) se registra como ouvinte.
// Fica separado para as corridas não importarem o CRM inteiro. Nunca lança erro: um problema no CRM não pode travar a corrida.

export interface EventoCrm {
  empresaId: string;
  tipo: string;
  telefone: string;
  nome?: string;
  vars?: Record<string, string>;
  /** Quando aconteceu (ms). Padrão: agora. */
  em?: number;
  cidade?: string;
}

type Ouvinte = (ev: EventoCrm) => void | Promise<void>;
const ouvintes = new Set<Ouvinte>();

export const ouvirEventosCrm = (f: Ouvinte) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; };

export function emitirEventoCrm(ev: EventoCrm): void {
  for (const f of ouvintes) {
    try { Promise.resolve(f(ev)).catch((e) => console.error("[crm] evento", ev.tipo, e instanceof Error ? e.message : e)); }
    catch (e) { console.error("[crm] evento", ev.tipo, e instanceof Error ? e.message : e); }
  }
}

/** Estado da corrida do painel -> evento do gatilho. */
export const EVENTO_DO_STATUS: Record<string, string> = {
  procurando: "ride_requested", a_caminho: "ride_accepted", no_local: "ride_driver_arrived", em_andamento: "ride_in_progress",
  finalizada: "ride_completed", cancelada: "ride_canceled", nao_atendida: "ride_not_served",
};
