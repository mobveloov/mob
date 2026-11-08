// Conversa das telas do CRM com /api/crm. A empresa vem do login (o servidor decide);
// o usuário da plataforma manda a empresa escolhida no cabeçalho X-Empresa, igual ao resto do painel.

import type { Campanha, ConfigEnvio, Contato, EstadoItem, Jornada, Lista, Regras } from "../../crm/tipos.ts";

export type { Campanha, ConfigEnvio, Contato, Jornada, Lista, Regras };

export interface Opcao { valor: string; total: number }
export interface RespPublico { avisos: string[]; total: number; destinatarios: number; semTelefone: number; optOut: number; opcoes: { cidades: Opcao[]; categorias: Opcao[]; canais: Opcao[] }; contatos: Contato[]; cortado: boolean }
export type CampanhaLinha = Campanha & { enviados: number; pendentes: number; falhas: number };
export type JornadaLinha = Jornada & { enviados: number; pendentes: number; alcancados: number };
export interface ItemRelatorio { id: string; nome: string; telefone: string; estado: EstadoItem; erro: string; enviadoEm: number | null; tentativas: number }
export interface Relatorio { campanha: Campanha; total: number; enviados: number; pendentes: number; falhas: number; cancelados: number; taxaEntrega: number; primeiroEnvio: string | null; ultimoEnvio: string | null; erros: Array<{ erro: string; total: number }>; itens: ItemRelatorio[] }
export interface Fila { pendentes: number; enviados: number; falhas: number; cancelados: number; emPausaAte: string | null; loteAtual: number; ultimos: Array<{ id: string; origem: { tipo: string; id: string }; nome: string; telefone: string; estado: EstadoItem; erro: string; quando: string }> }
export interface Config { config: ConfigEnvio; whatsapp: { url: string; instancia: string; token: string }; pendencias: string[]; variaveis: string[] }
export interface Cupom { codigo: string; descricao: string; ativo: boolean; inicio: string; fim: string; valido: boolean }

export class ErroCrm extends Error { constructor(msg: string, public status: number) { super(msg); } }

function empresaEscolhida(): string {
  try { return localStorage.getItem("empresa") ?? ""; } catch { return ""; }
}

async function pedir<T>(url: string, metodo = "GET", corpo?: unknown): Promise<T> {
  const headers = new Headers();
  const e = empresaEscolhida();
  if (e) headers.set("X-Empresa", e);
  if (corpo !== undefined) headers.set("Content-Type", "application/json");
  const r = await fetch(`/api/crm${url}`, { method: metodo, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo), credentials: "same-origin" });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroCrm((b as { erro?: string }).erro || `Erro ${r.status}`, r.status);
  return b as T;
}

export const crm = {
  publico: (regras: Regras) => pedir<RespPublico>("/publico", "POST", { regras }),
  contar: (regras: Regras) => pedir<{ total: number; destinatarios: number; avisos: string[] }>("/publico/contar", "POST", { regras }),
  optOut: (chave: string, sair: boolean) => pedir("/publico/optout", "POST", { chave, sair }),
  listas: () => pedir<{ listas: Array<Lista & { total: number }> }>("/listas"),
  novaLista: (d: { nome: string; modo: "fixa" | "dinamica"; regras: Regras }) => pedir<{ lista: Lista; total?: number }>("/listas", "POST", d),
  apagarLista: (id: string) => pedir(`/listas/${id}`, "DELETE"),
  campanhas: () => pedir<{ campanhas: CampanhaLinha[] }>("/campanhas"),
  novaCampanha: (c: Partial<Campanha>) => pedir<{ campanha: Campanha; destinatarios: number }>("/campanhas", "POST", c),
  salvarCampanha: (id: string, c: Partial<Campanha>) => pedir<{ campanha: Campanha }>(`/campanhas/${id}`, "PUT", c),
  apagarCampanha: (id: string) => pedir(`/campanhas/${id}`, "DELETE"),
  previa: (c: Partial<Campanha>) => pedir<{ previas: Array<{ nome: string; texto: string }> }>("/campanhas/previa", "POST", c),
  disparar: (id: string, agendar = false) => pedir<{ naFila?: number; agendada?: boolean }>(`/campanhas/${id}/disparar`, "POST", { agendar }),
  acao: (id: string, a: "pausar" | "retomar" | "cancelar" | "duplicar") => pedir(`/campanhas/${id}/${a}`, "POST", {}),
  relatorio: (id: string) => pedir<Relatorio>(`/campanhas/${id}/relatorio`),
  variacoes: (texto: string, quantidade: number) => pedir<{ variacoes: string[]; modelo: string }>("/variacoes", "POST", { texto, quantidade }),
  teste: (d: { telefone: string; texto: string; cupom?: string }) => pedir("/teste", "POST", d),
  cupons: () => pedir<{ cupons: Cupom[] }>("/cupons"),
  jornadas: () => pedir<{ jornadas: JornadaLinha[] }>("/jornadas"),
  novaJornada: (j: Partial<Jornada>) => pedir<{ jornada: Jornada }>("/jornadas", "POST", j),
  salvarJornada: (id: string, j: Partial<Jornada>) => pedir<{ jornada: Jornada }>(`/jornadas/${id}`, "PUT", j),
  apagarJornada: (id: string) => pedir(`/jornadas/${id}`, "DELETE"),
  contarJornada: (j: Partial<Jornada>) => pedir<{ total: number }>("/jornadas/contar", "POST", j),
  rodarJornada: (id: string) => pedir<{ naFila: number }>(`/jornadas/${id}/rodar`, "POST", {}),
  fila: () => pedir<Fila>("/fila"),
  processar: () => pedir("/fila/processar", "POST", {}),
  simulado: () => pedir<{ mensagens: Array<{ telefone: string; texto: string; em: string }> }>("/simulado"),
  config: () => pedir<Config>("/config"),
  salvarConfig: (d: { config: Partial<ConfigEnvio>; whatsapp?: Partial<Config["whatsapp"]> }) => pedir<{ config: ConfigEnvio }>("/config", "PUT", d),
};

export const erroTexto = (e: unknown) => (e instanceof Error ? e.message : String(e));
/** Data ISO (Brasília nos campos UTC) para "08/11 14:30". */
export const quando = (s: string | null | undefined) => (s ? new Date(s).toLocaleString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
/** Data/hora real (ms ou ISO com fuso) mostrada no horário de Brasília. */
export const quandoReal = (v: number | string | null | undefined) => (v ? new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
