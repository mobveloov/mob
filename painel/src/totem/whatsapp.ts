// WhatsApp do totem. Cada empresa usa a SUA instância (nunca uma compartilhada entre empresas).
// - "individual": o totem tem o próprio número, numa instância só dele (nome do bot + "-" + local), no mesmo servidor do bot.
// - "compartilhado": usa o mesmo número da empresa (o do bot).
// Sem servidor de WhatsApp configurado (modo simulado) o painel funciona do mesmo jeito: tudo "conectado", nada sai para fora.

import * as A from "../bot/armazem.ts";
import { provedorDe, servidorWhatsApp } from "../bot/fluxo.ts";
import { provedorEvolution, provedorSimulado, type Conexao, type ProvedorWhatsApp } from "../bot/provedores.ts";
import { validarUrlExterna } from "../servidor/url.ts";
import type { Local } from "./dados.ts";

/** Nome da instância do totem: curto e só com letras, números e hífen. */
export function instanciaDoTotem(empresaId: string, l: Pick<Local, "id">): string {
  const base = servidorWhatsApp(empresaId).instancia;
  return `${base}-${l.id}`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
}

export function provedorDoTotem(empresaId: string, l: Local): ProvedorWhatsApp {
  if (l.modoWhatsapp === "compartilhado") return provedorDe(empresaId);
  if (A.config(empresaId).provedor === "simulado") return provedorSimulado(empresaId);
  const { urlApi, token, daPlataforma } = servidorWhatsApp(empresaId);
  const instancia = instanciaDoTotem(empresaId, l);
  if (!daPlataforma) {
    try { validarUrlExterna(urlApi, "do servidor de WhatsApp"); } catch { return provedorEvolution({ urlApi: "", token: "", instancia }); }
  }
  return provedorEvolution({ urlApi, token, instancia });
}

/** Totem liberado para pedir? true/false, ou null quando não deu para saber (o totem então segue normal). */
const cache = new Map<string, { em: number; v: boolean | null }>();
export async function whatsappPronto(empresaId: string, l: Local): Promise<boolean | null> {
  const k = `${empresaId}|${l.id}|${l.modoWhatsapp}`;
  const c = cache.get(k);
  if (c && Date.now() - c.em < 30_000) return c.v;
  let v: boolean | null;
  try {
    const s: Conexao = await provedorDoTotem(empresaId, l).situacao();
    v = s.situacao === "conectado" ? true : s.situacao === "erro" || s.situacao === "nao_configurado" ? null : false;
  } catch { v = null; }
  cache.set(k, { em: Date.now(), v });
  return v;
}
export const esquecerWhatsapp = (empresaId: string, id: string) => {
  for (const k of [...cache.keys()]) if (k.startsWith(`${empresaId}|${id}|`)) cache.delete(k);
};
