// Conversa com o servidor (/api). O painel não sabe de qual sistema veio cada corrida: só a etiqueta de origem.

import type { CorridaPainel, Filtro, GrupoStatus } from "../comum/corrida.ts";
import type { Marca } from "../comum/marca.ts";

export type { CorridaPainel, Filtro, GrupoStatus, Marca };

export interface Sessao {
  usuario: { id: string; nome: string; email: string; telefone?: string; papel: "plataforma" | "admin" | "operador" };
  empresa: { id: string; nome: string };
  marca: Marca;
  empresas?: Array<{ id: string; nome: string }>;
}

export interface RespostaCorridas {
  total: number; avisos: string[]; cortado: boolean; corridas: CorridaPainel[];
  opcoes: { cidades: string[]; categorias: string[]; pagamentos: string[]; canais: string[]; origens: Array<{ id: string; nome: string }> };
  resumo: { total: number; finalizadas: number; canceladas: number; naoAtendidas: number; emAndamento: number; faturamento: number; ticketMedio: number };
}
export interface Motorista { nome: string; corridas: number; finalizadas: number; canceladas: number; taxaCancelamento: number; faturamento: number; km: number; nota: number | null; ultima: string | null }
export interface Relatorio { html: string; planoHtml: string | null; aviso: string | null; modelos: string[]; total: number; comIa: boolean }
export interface CampoIntegracao { chave: string; rotulo: string; secreto: boolean; opcional?: boolean }
export interface Integracoes {
  tipos: Array<{ tipo: string; nome: string; campos: CampoIntegracao[] }>;
  integracoes: Array<{ id: string; tipo: string; tipoNome: string; nome: string; ativa: boolean; valores: Record<string, string>; pendencias: string[]; planilhas?: number }>;
  ia: { situacao: Array<{ caso: string; rotas: Array<{ provedor: string; modelo: string; temChave: boolean }> }>; preenchidas: Record<string, boolean> };
}

export type Registro = { id: string; criadoEm: string; atualizadoEm: string; atualizadoPor: string } & Record<string, string | number | boolean | null>;
export interface CorridaPropria {
  id: string; os: string; status: string; motoristaId: string | null; motorista: string; valor: number | null;
  estimativa: { valor: number | null; distanciaKm: number | null; minutos: number | null };
  historico: Array<{ em: string; status: string; por: string; nota?: string }>;
}

/** Empresa escolhida pelo usuário da plataforma (troca de empresa). */
let empresaEscolhida = "";
export const escolherEmpresa = (id: string) => { empresaEscolhida = id; };
export const empresaEscolhidaAgora = () => empresaEscolhida;

// Toda chamada à API do próprio painel leva a empresa escolhida (usuário da plataforma que troca de empresa),
// inclusive as das telas que fazem o próprio fetch.
if (typeof window !== "undefined" && !(window as unknown as { __empresaFetch?: boolean }).__empresaFetch) {
  (window as unknown as { __empresaFetch?: boolean }).__empresaFetch = true;
  const original = window.fetch.bind(window);
  window.fetch = (entrada, init) => {
    const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.pathname : entrada.url;
    if (empresaEscolhida && /^(\/|https?:\/\/[^/]+\/)api\//.test(url)) {
      const headers = new Headers(init?.headers ?? (entrada instanceof Request ? entrada.headers : undefined));
      if (!headers.has("X-Empresa")) headers.set("X-Empresa", empresaEscolhida);
      return original(entrada, { ...init, headers });
    }
    return original(entrada, init);
  };
}

export class ErroApi extends Error { constructor(msg: string, public status: number) { super(msg); } }

export async function pedir<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (empresaEscolhida) headers.set("X-Empresa", empresaEscolhida);
  const r = await fetch(url, { ...init, headers, credentials: "same-origin" });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroApi((body as { erro?: string }).erro || `Erro ${r.status}`, r.status);
  return body as T;
}
export const json = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

function q(f: Filtro) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== "" && v !== false) p.set(k, String(v));
  return p.toString();
}

export const api = {
  marcaPublica: () => pedir<{ empresaId: string | null; marca: Marca; precisaConfigurar: boolean }>(`/api/publico/marca${location.search}`),
  configurar: (d: { empresa: string; nome: string; email: string; senha: string }) => pedir("/api/configurar", json("POST", d)),
  entrar: (email: string, senha: string) => pedir("/api/entrar", json("POST", { email, senha })),
  sair: () => pedir("/api/sair", { method: "POST" }),
  sessao: () => pedir<Sessao>("/api/sessao"),
  corridas: (f: Filtro) => pedir<RespostaCorridas>(`/api/corridas?${q(f)}`),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  indicadores: (periodo: string, cidade: string, inicio?: string, fim?: string) => pedir<{ avisos: string[]; cidades: string[]; indicadores: any }>(`/api/indicadores?${new URLSearchParams({ periodo, cidade, ...(inicio ? { inicio } : {}), ...(fim ? { fim } : {}) })}`),
  salvarConta: (d: { nome: string; email: string; telefone: string }) => pedir<{ ok: boolean; usuario: Sessao["usuario"] }>("/api/conta", json("PUT", d)),
  trocarSenha: (d: { atual: string; nova: string; confirmar: string }) => pedir<{ ok: boolean }>("/api/conta/senha", json("POST", d)),
  estatisticas: (f: Filtro) => pedir<{ avisos: string[]; stats: any }>(`/api/estatisticas?${q(f)}`),
  motoristas: (f: Filtro) => pedir<{ avisos: string[]; motoristas: Motorista[] }>(`/api/motoristas?${q(f)}`),
  relatorio: (filtro: Filtro) => pedir<Relatorio>("/api/relatorio", json("POST", { filtro })),
  perguntar: (filtro: Filtro, pergunta: string) => pedir<{ resposta: string }>("/api/perguntar", json("POST", { filtro, pergunta })),
  salvarMarca: (m: Marca) => pedir<{ marca: Marca }>("/api/marca", json("PUT", m)),
  enviarImagem: (tipo: string, arq: File) => pedir<{ marca: Marca }>(`/api/marca/arquivo?tipo=${tipo}`, { method: "POST", headers: { "Content-Type": arq.type || "application/octet-stream" }, body: arq }),
  apagarImagem: (tipo: string) => pedir<{ marca: Marca }>(`/api/marca/arquivo?tipo=${tipo}`, { method: "DELETE" }),
  integracoes: () => pedir<Integracoes>("/api/integracoes"),
  novaIntegracao: (tipo: string) => pedir("/api/integracoes", json("POST", { tipo })),
  salvarIntegracao: (id: string, d: { nome?: string; ativa?: boolean; credenciais?: Record<string, string> }) => pedir(`/api/integracoes/${id}`, json("PUT", d)),
  apagarIntegracao: (id: string) => pedir(`/api/integracoes/${id}`, { method: "DELETE" }),
  salvarChavesIa: (d: Record<string, string>) => pedir("/api/ia/chaves", json("PUT", d)),
  importarPlanilha: (arq: File) => pedir<{ total: number }>(`/api/planilhas?nome=${encodeURIComponent(arq.name)}`, { method: "POST", headers: { "Content-Type": "text/csv" }, body: arq }),
  usuarios: () => pedir<{ usuarios: Array<{ id: string; nome: string; email: string; papel: string }> }>("/api/usuarios"),
  novoUsuario: (d: { nome: string; email: string; senha: string; papel: string }) => pedir("/api/usuarios", json("POST", d)),
  apagarUsuario: (id: string) => pedir(`/api/usuarios/${id}`, { method: "DELETE" }),
  novaEmpresa: (d: { nome: string; adminNome: string; adminEmail: string; adminSenha: string }) => pedir("/api/empresas", json("POST", d)),
  registros: (cad: string, busca = "") => pedir<{ registros: Registro[] }>(`/api/cadastros/${cad}${busca ? `?busca=${encodeURIComponent(busca)}` : ""}`),
  criarRegistro: (cad: string, d: Record<string, unknown>) => pedir<{ registro: Registro }>(`/api/cadastros/${cad}`, json("POST", d)),
  salvarRegistro: (cad: string, id: string, d: Record<string, unknown>) => pedir<{ registro: Registro }>(`/api/cadastros/${cad}/${id}`, json("PUT", d)),
  apagarRegistro: (cad: string, id: string) => pedir(`/api/cadastros/${cad}/${id}`, { method: "DELETE" }),
  importarRegistros: (cad: string) => pedir<{ criados: number; atualizados: number; avisos: string[] }>(`/api/cadastros/${cad}/importar`, { method: "POST" }),
  corridaPropria: (id: string) => pedir<{ corrida: CorridaPropria; statusTexto: Record<string, string> }>(`/api/corridas-proprias/${id}`),
  atribuirMotorista: (id: string, motoristaId: string) => pedir(`/api/corridas-proprias/${id}/motorista`, json("POST", { motoristaId })),
  mudarStatusCorrida: (id: string, status: string, valor?: number) => pedir(`/api/corridas-proprias/${id}/status`, json("POST", { status, valor })),
  cancelarCorridaPropria: (id: string, quem: string, motivo: string) => pedir(`/api/corridas-proprias/${id}/cancelar`, json("POST", { quem, motivo })),
};

export const urlImagem = (empresaId: string, nome: string) => (nome ? `/api/publico/arquivo/${empresaId}/${nome}?v=${encodeURIComponent(nome)}` : "");

// ---------- formatos (as datas já vêm em horário de Brasília guardado como UTC: mostrar com timeZone "UTC")

export const dinheiro = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
export const numero = (n: number | null | undefined, d = 0) => (n == null ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: d }));
export const dataHora = (s: string | null) => (s ? new Date(s).toLocaleString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const brasiliaIso = (ms: number) => new Date(ms - 3 * 3600_000).toISOString().slice(0, 10);
export const hojeIso = () => brasiliaIso(Date.now());
export const diasAtrasIso = (n: number) => brasiliaIso(Date.now() - n * 86_400_000);

export const STATUS_UI: Record<GrupoStatus, { rotulo: string; classe: string }> = {
  finalizada: { rotulo: "Finalizada", classe: "ok" }, cancelada: { rotulo: "Cancelada", classe: "ruim" },
  nao_atendida: { rotulo: "Não atendida", classe: "alerta" }, aberta: { rotulo: "Em andamento", classe: "info" },
};

export function baixar(nome: string, conteudo: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement("a");
  a.href = url; a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** CSV com ";" (abre direto no Excel em português). Sem nome de sistema: a origem é o nome que a empresa deu. */
export function corridasCsv(lista: CorridaPainel[], comOrigem: boolean): string {
  const cols: Array<[string, (c: CorridaPainel) => unknown]> = [
    ["Nº OS", (c) => c.os], ...(comOrigem ? [["Origem", (c: CorridaPainel) => c.origemNome] as [string, (c: CorridaPainel) => unknown]] : []),
    ["Status", (c) => c.statusTexto], ["Solicitada em", (c) => dataHora(c.solicitadaEm)], ["Cidade", (c) => c.cidade], ["Categoria", (c) => c.categoria],
    ["Passageiro", (c) => c.passageiro], ["Telefone do passageiro", (c) => c.telefonePassageiro], ["Embarque", (c) => c.embarque], ["Destino", (c) => c.destino],
    ["Motorista", (c) => c.motorista], ["Forma de pagamento", (c) => c.pagamento], ["Canal", (c) => c.canal], ["Distância (km)", (c) => numero(c.distanciaKm, 2)],
    ["Valor", (c) => (c.valor == null ? "" : c.valor.toFixed(2).replace(".", ","))], ["Cancelada por", (c) => c.canceladaPor], ["Motivo do cancelamento", (c) => c.motivoCancelamento],
  ];
  const esc = (v: unknown) => { const s = String(v ?? "").replace(/"/g, '""'); return /[;"\n]/.test(s) ? `"${s}"` : s; };
  return "﻿" + [cols.map((c) => c[0]).join(";"), ...lista.map((c) => cols.map(([, f]) => esc(f(c))).join(";"))].join("\n");
}
