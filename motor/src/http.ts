// Cliente HTTP pequeno: tempo limite, JSON, formulário e tradução de erros para MotorErro.

import { MotorErro } from "./erros.ts";
import type { FetchLike } from "./tipos.ts";

export interface Pedido {
  metodo?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string | URL;
  cabecalhos?: Record<string, string>;
  json?: unknown;
  formulario?: Record<string, string | number | boolean | undefined>;
  timeoutMs?: number;
}

export interface Resposta<T = unknown> {
  status: number;
  corpo: T;
  cabecalhos: Headers;
}

/** `fonte` = nome mostrado nas mensagens ("Sistema A", "sistema-b"); `integracaoId` vai no erro. */
export function criarHttp(fonte: string, fetchFn: FetchLike, timeoutPadrao = 30_000, integracaoId?: string) {
  return async function pedir<T = unknown>(p: Pedido): Promise<Resposta<T>> {
    const cab: Record<string, string> = { Accept: "application/json", ...p.cabecalhos };
    let body: string | undefined;
    if (p.json !== undefined) {
      cab["Content-Type"] = "application/json";
      body = JSON.stringify(p.json);
    } else if (p.formulario) {
      cab["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";
      const f = new URLSearchParams();
      for (const [k, v] of Object.entries(p.formulario)) if (v !== undefined) f.set(k, String(v));
      body = f.toString();
    }

    let resp: Response;
    try {
      resp = await fetchFn(p.url, {
        method: p.metodo ?? (body ? "POST" : "GET"),
        headers: cab,
        body,
        signal: AbortSignal.timeout(p.timeoutMs ?? timeoutPadrao),
      });
    } catch (e) {
      const tempo = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      throw new MotorErro("INDISPONIVEL", tempo ? `${fonte}: a plataforma demorou demais para responder.` : `${fonte}: não consegui conectar.`, {
        integracaoId,
        detalhe: e instanceof Error ? e.message : String(e),
      });
    }

    const texto = await resp.text();
    let corpo: unknown = texto;
    if (texto) {
      try {
        corpo = JSON.parse(texto);
      } catch {
        /* resposta não é JSON: devolve o texto */
      }
    }

    if (!resp.ok) throw erroHttp(fonte, resp, corpo, integracaoId);
    return { status: resp.status, corpo: corpo as T, cabecalhos: resp.headers };
  };
}

function erroHttp(fonte: string, resp: Response, corpo: unknown, integracaoId?: string): MotorErro {
  const s = resp.status;
  const msgRemota = mensagemRemota(corpo);
  const sufixo = msgRemota ? ` (${msgRemota})` : "";
  const extra = { integracaoId, statusHttp: s, detalhe: corpo };
  if (s === 429) {
    const ra = Number(resp.headers.get("Retry-After"));
    return new MotorErro("LIMITE", `${fonte}: muitas chamadas seguidas. Tente de novo em instantes.`, {
      ...extra,
      tentarEmSegundos: Number.isFinite(ra) && ra > 0 ? ra : 60,
    });
  }
  if (s === 401 || s === 403) return new MotorErro("SEM_AUTORIZACAO", `${fonte}: acesso negado. Confira as credenciais da empresa.${sufixo}`, extra);
  if (s === 404) return new MotorErro("NAO_ENCONTRADO", `${fonte}: não encontrado.${sufixo}`, extra);
  if (s >= 500) return new MotorErro("INDISPONIVEL", `${fonte}: a plataforma está com problema (erro ${s}).`, extra);
  if (s === 400 || s === 422) {
    // O Sistema A responde 400 com código B1 quando a chave não vai no pedido.
    if (codigosRemotos(corpo).some((c) => /^B\d+$/.test(c)) && /chave|api|autentic|credencia/i.test(msgRemota))
      return new MotorErro("SEM_AUTORIZACAO", `${fonte}: acesso negado. Confira as credenciais da empresa.${sufixo}`, extra);
    return new MotorErro("DADOS_INVALIDOS", `${fonte}: a plataforma recusou os dados enviados.${sufixo}`, extra);
  }
  return new MotorErro("ERRO_REMOTO", `${fonte}: resposta inesperada (erro ${s}).${sufixo}`, extra);
}

function codigosRemotos(corpo: unknown): string[] {
  const errs = (corpo as { errors?: unknown })?.errors;
  if (!Array.isArray(errs)) return [];
  return errs.map((e) => String((e as { code?: unknown })?.code ?? "")).filter(Boolean);
}

export function mensagemRemota(corpo: unknown): string {
  if (!corpo || typeof corpo !== "object") return typeof corpo === "string" ? corpo.slice(0, 200) : "";
  const o = corpo as Record<string, unknown>;
  if (Array.isArray(o.errors)) {
    return o.errors
      .flat()
      .map((e) => (typeof e === "string" ? e : String((e as Record<string, unknown>)?.message ?? (e as Record<string, unknown>)?.error ?? "")))
      .filter(Boolean)
      .join("; ")
      .slice(0, 200);
  }
  const err = o.error as Record<string, unknown> | undefined;
  return String(o.msg ?? o.message ?? err?.message ?? "").slice(0, 200);
}
