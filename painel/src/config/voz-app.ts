// Voz dos apps (Personalização de cada app): ligar/desligar, motor, voz masculina/feminina e velocidade.
// Fica dentro da própria personalização (campo `voz`), então o "Salvar alterações" é um só e o app já recebe tudo no JSON público.
// O áudio é gerado no servidor (src/apps/voz.ts): GET /api/apps/<empresa>/voz.

import { lerConfig, umDe } from "./armazem.ts";

export const MOTORES_VOZ = ["auto", "gemini", "edge"] as const;
export const GENEROS_VOZ = ["feminina", "masculina"] as const;
export type MotorVoz = (typeof MOTORES_VOZ)[number];
export type GeneroVoz = (typeof GENEROS_VOZ)[number];
export type AppVoz = "passageiro" | "motorista";
export const VELOCIDADE_MIN = 0.7, VELOCIDADE_MAX = 1.5;
export const MAX_TEXTO_VOZ = 200;

export interface VozApp { ligada: boolean; motor: MotorVoz; genero: GeneroVoz; velocidade: number }
export const VOZ_PADRAO: VozApp = { ligada: true, motor: "auto", genero: "feminina", velocidade: 1 };

/** Velocidade em passos de 0,05 (poucas variações = o cache em disco rende). */
export function velocidadeValida(v: unknown, padrao = 1): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v.replace(",", ".")) : NaN;
  if (!Number.isFinite(n)) return padrao;
  return Math.round(Math.min(VELOCIDADE_MAX, Math.max(VELOCIDADE_MIN, n)) * 20) / 20;
}

export function sanearVoz(e: unknown): VozApp {
  const o = (e ?? {}) as Record<string, unknown>;
  return {
    ligada: o.ligada === undefined ? VOZ_PADRAO.ligada : o.ligada !== false && o.ligada !== "false",
    motor: umDe(o.motor, MOTORES_VOZ, VOZ_PADRAO.motor),
    genero: umDe(o.genero, GENEROS_VOZ, VOZ_PADRAO.genero),
    velocidade: velocidadeValida(o.velocidade, VOZ_PADRAO.velocidade),
  };
}

/** A voz configurada para um app (lê direto do arquivo da personalização, sem importar as telas). */
export function vozDoApp(empresaId: string, app: AppVoz): VozApp {
  const bruto = lerConfig<Record<string, unknown>>(empresaId, app === "motorista" ? "personalizacao-motorista" : "personalizacao", {});
  return sanearVoz(bruto.voz);
}

/** O que o app recebe no JSON de personalização. */
export const vozParaOApp = (empresaId: string, app: AppVoz, v: VozApp) => ({
  ...v, app, url: `/api/apps/${empresaId}/voz`, formato: "audio/mpeg", maxCaracteres: MAX_TEXTO_VOZ,
});

/** Frases fixas que os apps falam (lidas em painel/src/apps/web: api.ts/avisoDoMarco, Corrida.tsx, Navegacao.ts). */
export const FRASES_FIXAS: Record<AppVoz, string[]> = {
  passageiro: [
    "Seu motorista está a caminho.", "Seu motorista está no local.", "Sua corrida começou. Boa viagem.", "Corrida finalizada.",
    "Sua corrida foi cancelada.", "Não há nenhum motorista disponível no momento.",
  ],
  motorista: [
    "Você está chegando ao local de embarque.", "Você está chegando ao destino.",
    ...[1, 2, 3, 4, 5].map((n) => `Você está chegando à parada ${n}.`),
  ],
};
