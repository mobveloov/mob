// Conversa das telas do bot com o servidor (/api/bot). Mesmo jeito do api.ts do painel.

import type { RideOptionsConfig } from "../../bot/opcoes-pedido.ts";

export interface ConfigAvancada {
  fluxo: { show_welcome_menu: boolean; ask_destination: boolean; allow_skip_destination: boolean; confirm_address: boolean; ask_category: boolean; ask_payment: boolean };
  textos: Record<string, string>;
  saudacao: { imageUrl: string; caption: string };
  faq: Array<{ question: string; keywords: string[]; answer: string }>;
  controle: { blockWord: string; unblockWord: string; pauseWord: string; resumeWord: string; pauseMinutes: number };
  textosStatus: Record<string, string>;
  voz: { ligada: boolean; nome: string };
  agendar: boolean;
  opcoes: RideOptionsConfig;
}
export type TipoProvedor = "evolution" | "zapi" | "zpro" | "meta" | "simulado";
export interface ConfigBot extends ConfigAvancada { ativo: boolean; provedor: TipoProvedor; instancia: string }
/** Uma conexão (número de WhatsApp) da empresa, como o painel enxerga: tokens e segredos nunca vêm, só "salvo". */
export interface ConexaoVista {
  id: string; nome: string; ativa: boolean; provedor: TipoProvedor; principal: boolean; instancia: string;
  servidor: { daPlataforma: boolean; plataformaPronta: boolean; urlApi: string; tokenSalvo: boolean; clientTokenSalvo: boolean; appSecretSalvo: boolean; phoneId: string; wabaId: string };
  webhook: string | null; senhaVerificacao: string | null; cidade: string;
}
export interface DadosConexao {
  nome?: string; ativa?: boolean; provedor?: TipoProvedor; instancia?: string; urlApi?: string; token?: string; clientToken?: string;
  phoneId?: string; wabaId?: string; appSecret?: string; cidade?: string;
}
export interface RespostaConfig {
  config: ConfigBot; webhook: string | null;
  servidor: { daPlataforma: boolean; plataformaPronta: boolean; urlApi: string; tokenSalvo: boolean };
}
export interface Conexao { situacao: "conectado" | "aguardando_qr" | "desconectado" | "nao_configurado" | "erro"; qr?: string; codigo?: string; detalhe?: string }
export interface Mensagem { de: "passageiro" | "bot" | "operador"; texto: string; em: string; autor?: string }
export interface ResumoConversa {
  id: string; nome: string; etapa: string; naoLidas: number; atualizadaEm: string;
  ultima: { de: string; texto: string; em: string } | null; corrida: { os: string; status: string } | null;
  conexao?: string; bloqueado?: boolean; pausadoAte?: string | null;
}
export interface CorridaBot { id: string; os: string; status: string; grupo: string; criadaEm: string; valor?: number; motorista?: string; nota?: number }
export interface Conversa {
  id: string; nome: string; etapa: string; naoLidas: number; criadaEm: string; atualizadaEm: string;
  mensagens: Mensagem[]; corrida?: CorridaBot; historico: CorridaBot[]; bloqueado?: boolean; pausadoAte?: string; conexao?: string; conexaoNome?: string;
}

const empresaEscolhida = () => { try { return localStorage.getItem("empresa") ?? ""; } catch { return ""; } };

async function pedir<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const e = empresaEscolhida();
  if (e) headers.set("X-Empresa", e);
  const r = await fetch(url, { ...init, headers, credentials: "same-origin" });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { erro?: string }).erro || `Erro ${r.status}`);
  return body as T;
}
const json = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export interface SugestaoVista { id: string; nickname: string; address_text: string; lat: number | null; lng: number | null }

export const apiBot = {
  sugestoes: (busca = "") => pedir<{ total: number; resultados: SugestaoVista[] }>(`/api/bot/sugestoes?busca=${encodeURIComponent(busca)}`),
  adicionarSugestao: (d: { nickname: string; address: string }) => pedir<{ ok: true; total: number }>("/api/bot/sugestoes", json("POST", d)),
  excluirSugestao: (id: string) => pedir<{ ok: true; total: number }>(`/api/bot/sugestoes/${encodeURIComponent(id)}`, { method: "DELETE" }),
  config: () => pedir<RespostaConfig>("/api/bot/config"),
  salvarAvancada: (d: Partial<ConfigAvancada>) => pedir<{ ok: true }>("/api/bot/config/avancada", json("PUT", d)),
  salvar: (d: Partial<Pick<ConfigBot, "ativo" | "provedor" | "instancia">> & { urlApi?: string; token?: string }) => pedir<{ ok: true }>("/api/bot/config", json("PUT", d)),
  conexoes: () => pedir<{ ativo: boolean; conexoes: ConexaoVista[]; maximo: number; cidades: Array<{ codigo: string; nome: string; uf: string }> }>("/api/bot/conexoes"),
  criarConexao: (d: DadosConexao) => pedir<{ ok: true; conexao: ConexaoVista }>("/api/bot/conexoes", json("POST", d)),
  salvarConexao: (id: string, d: DadosConexao & { ativo?: boolean }) => pedir<{ ok: true; conexao: ConexaoVista }>(`/api/bot/conexoes/${encodeURIComponent(id)}`, json("PUT", d)),
  removerConexao: (id: string) => pedir<{ ok: true }>(`/api/bot/conexoes/${encodeURIComponent(id)}`, { method: "DELETE" }),
  situacaoDe: (id: string) => pedir<Conexao>(`/api/bot/conexoes/${encodeURIComponent(id)}/situacao`),
  conectarDe: (id: string) => pedir<Conexao>(`/api/bot/conexoes/${encodeURIComponent(id)}/conectar`, { method: "POST" }),
  desconectarDe: (id: string) => pedir<{ ok: true }>(`/api/bot/conexoes/${encodeURIComponent(id)}/desconectar`, { method: "POST" }),
  situacao: () => pedir<Conexao>("/api/bot/situacao"),
  conectar: () => pedir<Conexao>("/api/bot/conectar", { method: "POST" }),
  desconectar: () => pedir<{ ok: true }>("/api/bot/desconectar", { method: "POST" }),
  conversas: (busca = "") => pedir<{ conversas: ResumoConversa[] }>(`/api/bot/conversas?busca=${encodeURIComponent(busca)}`),
  conversa: (id: string) => pedir<{ conversa: Conversa }>(`/api/bot/conversas/${encodeURIComponent(id)}?lida=1`),
  responder: (id: string, texto: string) => pedir<{ ok: true }>(`/api/bot/conversas/${encodeURIComponent(id)}/responder`, json("POST", { texto })),
  controle: (id: string, comando: "block" | "unblock" | "pause" | "resume") => pedir<{ ok: true; bloqueado: boolean; pausadoAte: string | null }>(`/api/bot/conversas/${encodeURIComponent(id)}/controle`, json("POST", { comando })),
  encerrar: (id: string) => pedir<{ ok: true }>(`/api/bot/conversas/${encodeURIComponent(id)}/encerrar`, { method: "POST" }),
  simular: (d: { telefone: string; nome: string; texto?: string; transcricao?: string; conexao?: string; local?: { lat: number; lng: number; texto: string } }) =>
    pedir<{ respostas: string[] }>("/api/bot/simular", json("POST", d)),
  simularStatus: (telefone: string) => pedir<{ texto: string | null }>("/api/bot/simular/status", json("POST", { telefone })),
};

export const ETAPA: Record<string, string> = {
  inicio: "Início", menu: "Menu", embarque: "Embarque", numero_embarque: "Número do embarque", destino: "Destino", numero_destino: "Número do destino", agendamento: "Data e hora do agendamento", cancelar_agendamento: "Cancelando agendamento", confirmar: "Confirmação", categoria: "Categoria",
  pagamento: "Pagamento", criando: "Criando corrida", em_corrida: "Em corrida", avaliacao: "Avaliação", suporte: "Suporte (operador)",
};

export const hora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Formatação do WhatsApp (*negrito*) para HTML simples, sem injetar nada. */
export function partesWhatsApp(texto: string): Array<{ t: string; negrito: boolean }> {
  return texto.split(/(\*[^*\n]+\*)/g).filter(Boolean).map((t) => (/^\*[^*]+\*$/.test(t) ? { t: t.slice(1, -1), negrito: true } : { t, negrito: false }));
}

export const NOME_PROVEDOR: Record<TipoProvedor, string> = {
  evolution: "Evolution", zapi: "Z-API", zpro: "Z-Pro", meta: "Meta Cloud", simulado: "Simulado",
};
