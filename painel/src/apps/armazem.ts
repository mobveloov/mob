// Dados dos apps (passageiro e motorista) de cada empresa. Ficam em DADOS_DIR/empresas/<id>/apps/ (fora do Git):
//
//   sessoes.json            sessões dos apps (o token só como hash)
//   push.json               tokens de notificação dos aparelhos
//   alertas.json            pedidos de SOS
//   chat/<corrida>.json     mensagens do chat de cada corrida
//   chat/audio/<id>.<ext>   áudios do chat
//   firebase-servico.json   (opcional) conta de serviço do Firebase da empresa, para o push. Nunca vai para o Git.
//
// Toda função recebe o id da empresa, validado com idValido: uma empresa nunca lê a pasta de outra.

import fs from "node:fs";
import path from "node:path";
import { idValido, raiz } from "../servidor/dados.ts";
import { gravarJson, lerJson } from "../servidor/jsoncache.ts";

export function pastaApps(empresaId: string) {
  if (!idValido(empresaId)) throw new Error("Empresa inválida.");
  return path.join(raiz(), "empresas", empresaId, "apps");
}

export function ler<T>(arq: string, padrao: T): T {
  return lerJson<T>(arq, padrao); // só leitura (cache): para mudar, copie e grave
}

export function gravar(arq: string, valor: unknown) {
  gravarJson(arq, valor, { modo: 0o600 });
}

export const arquivo = (empresaId: string, ...partes: string[]) => path.join(pastaApps(empresaId), ...partes);

/** Id de corrida própria (uuid): só ele entra em nome de arquivo. */
export const idCorridaValido = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);

export const soDigitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");
export const txt = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[<>]/g, "").trim().slice(0, max) : "");
export const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined);

/** Limite simples por chave (pedidos de código, tentativas). */
export function limitador(max: number | (() => number), janelaMs: number) {
  const m = new Map<string, number[]>();
  let limpezaEm = 0;
  return (chave: string) => {
    const agora = Date.now();
    // Apaga as chaves velhas de vez em quando (senão o mapa cresce com cada telefone e IP).
    if (agora - limpezaEm > janelaMs) { limpezaEm = agora; for (const [k, l] of m) if (!l.some((t) => agora - t < janelaMs)) m.delete(k); }
    const l = (m.get(chave) ?? []).filter((t) => agora - t < janelaMs);
    l.push(agora);
    m.set(chave, l);
    return l.length <= (typeof max === "function" ? max() : max);
  };
}
