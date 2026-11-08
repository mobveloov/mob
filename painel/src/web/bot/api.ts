// Conversa das telas do bot com o servidor (/api/bot). Mesmo jeito do api.ts do painel.

export interface ConfigBot { ativo: boolean; provedor: "evolution" | "simulado"; instancia: string }
export interface RespostaConfig {
  config: ConfigBot; webhook: string | null;
  servidor: { daPlataforma: boolean; plataformaPronta: boolean; urlApi: string; tokenSalvo: boolean };
}
export interface Conexao { situacao: "conectado" | "aguardando_qr" | "desconectado" | "nao_configurado" | "erro"; qr?: string; codigo?: string; detalhe?: string }
export interface Mensagem { de: "passageiro" | "bot" | "operador"; texto: string; em: string; autor?: string }
export interface ResumoConversa {
  id: string; nome: string; etapa: string; naoLidas: number; atualizadaEm: string;
  ultima: { de: string; texto: string; em: string } | null; corrida: { os: string; status: string } | null;
}
export interface CorridaBot { id: string; os: string; status: string; grupo: string; criadaEm: string; valor?: number; motorista?: string; nota?: number }
export interface Conversa {
  id: string; nome: string; etapa: string; naoLidas: number; criadaEm: string; atualizadaEm: string;
  mensagens: Mensagem[]; corrida?: CorridaBot; historico: CorridaBot[];
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

export const apiBot = {
  config: () => pedir<RespostaConfig>("/api/bot/config"),
  salvar: (d: Partial<ConfigBot> & { urlApi?: string; token?: string }) => pedir<{ ok: true }>("/api/bot/config", json("PUT", d)),
  situacao: () => pedir<Conexao>("/api/bot/situacao"),
  conectar: () => pedir<Conexao>("/api/bot/conectar", { method: "POST" }),
  desconectar: () => pedir<{ ok: true }>("/api/bot/desconectar", { method: "POST" }),
  conversas: (busca = "") => pedir<{ conversas: ResumoConversa[] }>(`/api/bot/conversas?busca=${encodeURIComponent(busca)}`),
  conversa: (id: string) => pedir<{ conversa: Conversa }>(`/api/bot/conversas/${encodeURIComponent(id)}?lida=1`),
  responder: (id: string, texto: string) => pedir<{ ok: true }>(`/api/bot/conversas/${encodeURIComponent(id)}/responder`, json("POST", { texto })),
  encerrar: (id: string) => pedir<{ ok: true }>(`/api/bot/conversas/${encodeURIComponent(id)}/encerrar`, { method: "POST" }),
  simular: (d: { telefone: string; nome: string; texto?: string; local?: { lat: number; lng: number; texto: string } }) =>
    pedir<{ respostas: string[] }>("/api/bot/simular", json("POST", d)),
  simularStatus: (telefone: string) => pedir<{ texto: string | null }>("/api/bot/simular/status", json("POST", { telefone })),
};

export const ETAPA: Record<string, string> = {
  inicio: "Início", menu: "Menu", embarque: "Embarque", destino: "Destino", confirmar: "Confirmação", categoria: "Categoria",
  pagamento: "Pagamento", criando: "Criando corrida", em_corrida: "Em corrida", avaliacao: "Avaliação", suporte: "Suporte (operador)",
};

export const hora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Formatação do WhatsApp (*negrito*) para HTML simples, sem injetar nada. */
export function partesWhatsApp(texto: string): Array<{ t: string; negrito: boolean }> {
  return texto.split(/(\*[^*\n]+\*)/g).filter(Boolean).map((t) => (/^\*[^*]+\*$/.test(t) ? { t: t.slice(1, -1), negrito: true } : { t, negrito: false }));
}
