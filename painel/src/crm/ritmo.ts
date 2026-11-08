// Ritmo do WhatsApp por empresa (regra pura, testada):
//   - sai um lote (padrão 20) e depois uma pausa sorteada entre o mínimo e o máximo (padrão 5–10 min). Lote 0 desliga;
//   - nunca passa do limite por minuto; entre duas mensagens há um intervalo que varia ±30%;
//   - parado mais que a pausa máxima, o lote recomeça do zero.
// Quem cai na pausa NÃO é falha: a mensagem continua pendente e sai depois.

import type { EstadoRitmo } from "./armazem.ts";
import type { ConfigEnvio } from "./tipos.ts";

const MIN = 60_000;

export type Reserva = { ok: true; estado: EstadoRitmo } | { ok: false; motivo: "pausa" | "limite"; ate: number };

export function reservar(c: Pick<ConfigEnvio, "lote" | "pausaMinMin" | "pausaMaxMin" | "limitePorMinuto">, e: EstadoRitmo, agora: number, sorteio: () => number = Math.random): Reserva {
  if (e.pausaAte > agora) return { ok: false, motivo: "pausa", ate: e.pausaAte };
  const ultimos = e.ultimos.filter((t) => agora - t < MIN);
  if (ultimos.length >= c.limitePorMinuto) return { ok: false, motivo: "limite", ate: ultimos[0] + MIN };
  const intervalo = MIN / c.limitePorMinuto;
  // Intervalo fixo por envio, sorteado em ±30% e guardado no próprio último envio (mesmo resultado a cada consulta).
  const proximo = e.ultimoEnvio + intervalo * 0.7;
  if (e.ultimoEnvio && agora < proximo) return { ok: false, motivo: "limite", ate: Math.ceil(proximo) };
  let lote = e.loteContagem;
  if (e.ultimoEnvio && agora - e.ultimoEnvio > Math.max(c.pausaMaxMin, 1) * MIN) lote = 0; // parado: recomeça
  lote++;
  let pausaAte = 0;
  if (c.lote > 0 && lote >= c.lote) {
    const min = c.pausaMinMin * MIN, max = Math.max(c.pausaMaxMin, c.pausaMinMin) * MIN;
    pausaAte = agora + min + Math.round(sorteio() * (max - min));
    lote = 0;
  }
  // Próximo envio do lote: o intervalo varia ±30% (sem padrão fixo).
  const espera = intervalo * (0.7 + sorteio() * 0.6) - intervalo * 0.7;
  return { ok: true, estado: { loteContagem: lote, pausaAte, ultimoEnvio: agora + espera, ultimos: [...ultimos, agora] } };
}
