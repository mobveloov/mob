// v14.55: avisos ao passageiro antes do HORARIO da corrida agendada: 15 min e 5 min antes.
// Cada aviso so sai uma vez; se o agendamento foi feito depois do momento do aviso (ex.: agendou para daqui a
// 10 min), ele e marcado como feito sem mandar. A corrida toca para os motoristas `antecedencia` min antes
// (Opcoes da Corrida, padrao 10) — o texto conta isso ao passageiro.
//
// Teste: node --experimental-strip-types supabase/functions/_shared/scheduleReminders.test.ts

const MIN = 60_000;
export const AVISOS_ANTES = [15, 5] as const;
export type AvisoMin = typeof AVISOS_ANTES[number];

export interface AvisoDecisao { minutos: AvisoMin; enviar: boolean } // enviar=false: so marcar (passou da hora)

export function avisosDevidos(i: {
  scheduledMs: number; createdMs: number; nowMs: number;
  enviados: Partial<Record<AvisoMin, boolean>>;
}): AvisoDecisao[] {
  const out: AvisoDecisao[] = [];
  for (const m of AVISOS_ANTES) {
    if (i.enviados[m]) continue;
    const momento = i.scheduledMs - m * MIN;
    if (i.nowMs < momento) continue;
    // ja passou do horario, ou o agendamento nasceu depois do momento do aviso: nao manda (so marca)
    const enviar = i.nowMs < i.scheduledMs && i.createdMs <= momento;
    out.push({ minutos: m, enviar });
  }
  // dois avisos devidos ao mesmo tempo (rotina atrasou): manda so o mais perto do horario
  const aEnviar = out.filter((d) => d.enviar);
  if (aEnviar.length > 1) for (const d of aEnviar.slice(0, -1)) d.enviar = false;
  return out;
}

export function textoAviso(minutos: AvisoMin, horarioHHMM: string, tocaHHMM: string): string {
  return minutos === 15
    ? `⏰ Sua corrida agendada das *${horarioHHMM}* é daqui a *15 minutos*. Às ${tocaHHMM} começamos a procurar o motorista.`
    : `⏰ Sua corrida agendada das *${horarioHHMM}* é daqui a *5 minutos*. Fique atento ao local de embarque.`;
}
