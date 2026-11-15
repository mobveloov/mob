// Conversa das abas Contatos, RFM, Conversão, Mapa de Calor, Recompensas, Cidades, Governança e Auditoria com /api/crm.
// A empresa vem do login (o servidor decide); o usuário da plataforma manda a empresa escolhida no cabeçalho X-Empresa.

import type { ContatoCrm } from "../../crm2/contatos.ts";
import type { LinhaAuditoria } from "../../crm2/auditoria.ts";
import type { Cidade } from "../../crm2/cidades.ts";
import type { Celula } from "../../crm2/mapa.ts";
import type { CupomLinha } from "../../crm2/recompensas.ts";
import type { LinhaRfm } from "../../crm2/rfm.ts";
import type { LinhaConversao } from "../../crm2/conversao.ts";
import type { Config2 } from "../../crm2/base.ts";

export type { Cidade, Celula, ContatoCrm, CupomLinha, LinhaAuditoria, LinhaConversao, LinhaRfm, Config2 };

export class ErroCrm2 extends Error { constructor(msg: string, public status: number) { super(msg); } }

const empresaEscolhida = () => { try { return localStorage.getItem("empresa") ?? ""; } catch { return ""; } };

async function pedir<T>(url: string, metodo = "GET", corpo?: unknown): Promise<T> {
  const headers = new Headers();
  const e = empresaEscolhida();
  if (e) headers.set("X-Empresa", e);
  if (corpo !== undefined) headers.set("Content-Type", "application/json");
  const r = await fetch(`/api/crm${url}`, { method: metodo, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo), credentials: "same-origin" });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroCrm2((b as { erro?: string }).erro || `Erro ${r.status}`, r.status);
  return b as T;
}

export interface ListaContatos {
  total: number; contatos: ContatoCrm[]; estagios: Record<string, number>; tags: string[];
  stats: { contatos: number; passageiros_cadastro: number; passageiros_sem_contato: number; passageiros_telefone_curto: number; motoristas: number };
}
export interface MotoristaLinha { chave: string; nome: string; telefone: string; cidade: string; situacao: string; ultimaCorrida: string | null }
export interface Evento { id: string; tipo: string; quando: number }
export interface Governanca {
  totalContacts: number; optIn: number; optOut: number; pending: number; sentCount: number; failedCount: number; skippedCount: number;
  deliveryRate: number; consentRate: number; settings: Config2;
}

const q = (o: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const crm2 = {
  contatos: (f: { busca?: string; stage?: string; tag?: string; pagina?: number }) => pedir<ListaContatos>(`/contatos${q(f)}`),
  motoristas: (f: { busca?: string; situacao?: string; pagina?: number }) => pedir<{ total: number; situacoes: string[]; motoristas: MotoristaLinha[] }>(`/contatos/motoristas${q(f)}`),
  sincronizar: () => pedir<{ contatos: number; novos: number; atualizados: number; eventos: number }>("/contatos/sincronizar", "POST", {}),
  importar: (csv: string) => pedir<{ importados: number; mantidos: number; erros: string[] }>("/contatos/importar", "POST", { csv }),
  contato: (chave: string) => pedir<{ contato: ContatoCrm; eventos: Evento[]; mensagens7dias: number }>(`/contatos/${encodeURIComponent(chave)}`),
  exportarContato: (chave: string) => pedir<{ contato: ContatoCrm; eventos: Evento[] }>(`/contatos/${encodeURIComponent(chave)}/exportar`),
  optout: (chave: string, sair: boolean) => pedir<{ contato: ContatoCrm }>(`/contatos/${encodeURIComponent(chave)}/optout`, "POST", { sair }),
  tags: (chave: string, tags: string[]) => pedir<{ tags: string[] }>(`/contatos/${encodeURIComponent(chave)}/tags`, "PUT", { tags }),
  excluirContato: (chave: string) => pedir(`/contatos/${encodeURIComponent(chave)}`, "DELETE"),
  rfm: () => pedir<{ linhas: LinhaRfm[]; total: number; ltv: number }>("/rfm"),
  atualizarRfm: () => pedir<{ analisados: number }>("/rfm/atualizar", "POST", {}),
  segmentoRfm: (segmento: string) => pedir<{ id: string; nome: string; total: number }>("/rfm/segmento", "POST", { segmento }),
  rfmContatos: () => pedir<{ contatos: Array<{ nome: string; telefone: string; segmento: string | null; r: number | null; f: number | null; m: number | null; corridas: number; gasto: number; ultima: number | null }> }>("/rfm/contatos"),
  conversao: (dias: number) => pedir<{ horas: number; linhas: LinhaConversao[] }>(`/conversao?dias=${dias}`),
  mapa: () => pedir<{ celulas: Celula[]; cidades: Cidade[] }>("/mapa"),
  atualizarMapa: () => pedir<{ zonas: number; celulas: Celula[]; cidades: Cidade[] }>("/mapa/atualizar", "POST", {}),
  recompensas: (origem: string) => pedir<{ cupons: CupomLinha[]; resumo: { total: number; used: number; active: number }; desconto30: { total: number; corridas: number } }>(`/recompensas${q({ origem })}`),
  atualizarUsos: () => pedir("/recompensas/atualizar", "POST", {}),
  criarCupom: (c: Record<string, unknown>) => pedir<{ id: string }>("/recompensas/cupons", "POST", c),
  apagarCupom: (id: string) => pedir(`/recompensas/cupons/${id}`, "DELETE"),
  cidades: () => pedir<{ cidades: Cidade[] }>("/cidades"),
  salvarCidade: (id: string | null, c: Record<string, unknown>) => pedir<{ cidade: Cidade }>(id ? `/cidades/${id}` : "/cidades", id ? "PUT" : "POST", c),
  ligarCidade: (id: string, ativa: boolean) => pedir(`/cidades/${id}/ligar`, "POST", { ativa }),
  apagarCidade: (id: string) => pedir(`/cidades/${id}`, "DELETE"),
  municipios: (texto: string) => fetch(`/api/enderecos/municipios?q=${encodeURIComponent(texto)}`, { credentials: "same-origin" }).then((r) => r.json()).then((b) => (b.municipios ?? []) as Array<{ codigo: string; nome: string; uf: string }>),
  governanca: () => pedir<Governanca>("/governanca"),
  salvarGovernanca: (s: { crm_send_window_start: string; crm_send_window_end: string; crm_require_opt_in: boolean; crm_attribution_hours: number }) => pedir<{ settings: Config2 }>("/governanca", "PUT", s),
  auditoria: (f: { dias: number; entidade: string; acao: string }) => pedir<{ linhas: LinhaAuditoria[] }>(`/auditoria${q(f)}`),
};

export const erroTexto = (e: unknown) => (e instanceof Error ? e.message : String(e));
export const dinheiroBr = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const dataHora = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
export const dataCurta = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "");

/** Baixa um CSV (separador ;, com BOM para abrir certo no Excel). */
export function baixarCsv(nome: string, cabecalho: string[], linhas: Array<Array<string | number | null>>) {
  const esc = (v: string | number | null) => { const s = v == null ? "" : String(v); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = "﻿" + [cabecalho, ...linhas].map((l) => l.map(esc).join(";")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = nome; a.click();
  URL.revokeObjectURL(url);
}
