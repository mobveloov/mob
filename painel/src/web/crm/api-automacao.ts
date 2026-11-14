// Conversa das abas Gatilhos, Fila, Régua e Notificações (e dos limites de envio) com /api/crm.
// A empresa vem do login (o servidor decide); o usuário da plataforma manda a empresa escolhida no cabeçalho X-Empresa.

import type { Template } from "../../crm/templates.ts";
import type { Gatilho, LinhaFila } from "../../crm/gatilhos.ts";
import type { ConfigRegua, Governanca, PausaGeral } from "../../crm/limites.ts";
import type { EnvioLog } from "../../crm/registro.ts";
import { ErroCrm } from "./api";

export type { ConfigRegua, EnvioLog, Gatilho, Governanca, LinhaFila, PausaGeral };

export type GatilhoLinha = Gatilho & { template: Template | null };
export interface RespGatilhos {
  gatilhos: GatilhoLinha[]; templates: Template[]; counts: Record<string, Record<string, number>>; today: Record<string, number>;
  modelos: Array<{ nome: string }>; instalados: string[];
}
export interface EstatFila { pending: number; due_1h: number; processed: number; sent: number; failed: number; canceled: number; all: number }
export interface RespFila { total: number; linhas: LinhaFila[]; stats: EstatFila; gatilhos: Array<{ id: string; name: string; type: string }> }
export interface FiltroNotificacoes { de?: number; ate?: number; origem?: string; estado?: string; canal?: string; gatilho?: string; evento?: string; busca?: string; pagina?: number }
export interface RespNotificacoes {
  total: number; linhas: EnvioLog[]; stats: { total: number; by_status: Record<string, number>; by_origin: Record<string, number>; by_channel: Record<string, number> };
  nomes: { gatilhos: Array<{ id: string; name: string; type: string }>; campanhas: Array<{ id: string; name: string }>; jornadas: Array<{ id: string; name: string }> };
}
export interface NumeroRegua {
  id: string | null; tipo: "bot" | "crm"; instance: string | null; phone: string | null; connected: boolean; pausado: boolean; escolhido: boolean;
  reguaHoje: number; enviadosHoje: number; limite: number; aquecimentoDia: number; erros: number; podeEnviar: boolean;
}
export interface RespRegua {
  config: ConfigRegua;
  numero: { instance: string | null; connected: boolean; provider: string | null; isBot: boolean; motivo: string | null; botPausado: boolean };
  hoje: { regua: number; erros: number; numeroTodo: number; limite: number };
  numeros: NumeroRegua[];
}
export interface RespLimites { governanca: Governanca; pausa: PausaGeral; tetoHoje: number; enviadosHoje: number }

async function pedir<T>(url: string, metodo = "GET", corpo?: unknown): Promise<T> {
  const headers = new Headers();
  let e = "";
  try { e = localStorage.getItem("empresa") ?? ""; } catch { /* sem armazenamento */ }
  if (e) headers.set("X-Empresa", e);
  if (corpo !== undefined) headers.set("Content-Type", "application/json");
  const r = await fetch(`/api/crm${url}`, { method: metodo, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo), credentials: "same-origin" });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroCrm((b as { erro?: string }).erro || `Erro ${r.status}`, r.status);
  return b as T;
}

export interface CorpoGatilho {
  name: string; template_id: string; trigger_type: string; trigger_config: Record<string, unknown>; send_channel: "whatsapp";
  mensagem?: { titulo: string; texto: string; copia: boolean };
}

export const automacao = {
  gatilhos: () => pedir<RespGatilhos>("/gatilhos"),
  usos: (template: string, exceto?: string) => pedir<{ usos: number }>(`/gatilhos/usos?template=${encodeURIComponent(template)}${exceto ? `&exceto=${encodeURIComponent(exceto)}` : ""}`),
  novoGatilho: (g: CorpoGatilho) => pedir<{ gatilho: Gatilho }>("/gatilhos", "POST", g),
  salvarGatilho: (id: string, g: CorpoGatilho) => pedir<{ gatilho: Gatilho }>(`/gatilhos/${id}`, "PUT", g),
  ligarGatilho: (id: string) => pedir<{ gatilho: Gatilho }>(`/gatilhos/${id}/ligar`, "POST", {}),
  duplicarGatilho: (id: string) => pedir<{ gatilho: Gatilho }>(`/gatilhos/${id}/duplicar`, "POST", {}),
  apagarGatilho: (id: string) => pedir(`/gatilhos/${id}`, "DELETE"),
  logsGatilho: (id: string) => pedir<{ logs: LinhaFila[] }>(`/gatilhos/${id}/logs`),
  testarGatilho: (id: string, telefone: string) => pedir<{ sent: boolean; error?: string }>(`/gatilhos/${id}/teste`, "POST", { telefone }),
  instalarModelos: (indices: number[]) => pedir<{ instalados: number; falhas: string[] }>("/gatilhos/instalar", "POST", { indices }),
  fila: (p: { visao: string; gatilho?: string; busca?: string; pagina?: number }) =>
    pedir<RespFila>(`/dispatches?visao=${p.visao}&gatilho=${encodeURIComponent(p.gatilho ?? "")}&busca=${encodeURIComponent(p.busca ?? "")}&pagina=${p.pagina ?? 0}`),
  agirNaFila: (id: string, acao: "cancelar" | "agora") => pedir(`/dispatches/${id}/${acao}`, "POST", {}),
  notificacoes: (f: FiltroNotificacoes) => pedir<RespNotificacoes>("/notificacoes", "POST", f),
  regua: () => pedir<RespRegua>("/regua"),
  salvarRegua: (d: Record<string, unknown>) => pedir<{ ok: boolean }>("/regua", "PUT", d),
  limites: () => pedir<RespLimites>("/limites"),
  pausar: (pausar: boolean) => pedir<{ pausa: PausaGeral }>("/limites/pausa", "POST", { pausar }),
  salvarGovernanca: (g: Partial<Governanca>) => pedir<{ governanca: Governanca }>("/limites/governanca", "PUT", g),
};
