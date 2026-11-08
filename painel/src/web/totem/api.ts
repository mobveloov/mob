// Conversa do totem (/api/totem, servidor em src/totem/rotas.ts) e da tela "Solicitar corrida"
// (/api/totem para opções e lista; /api/corridas-proprias para pedir, atribuir motorista, mudar status e cancelar).

import type { Marca } from "../../comum/marca.ts";

export interface Ponto { texto: string; lat?: number; lng?: number }
export interface CategoriaTotem { nome: string; descricao: string; preco: number | null }
export type Grupo = "aberta" | "finalizada" | "cancelada" | "nao_atendida";
export interface SituacaoTotem {
  id: string; os: string; status: string; grupo: Grupo; statusTexto: string;
  motorista: { nome: string } | null; veiculo: { modelo: string; placa: string } | null;
  valor: number | null; valorEstimado: boolean; categoria: string; destino: string; podeCancelar: boolean;
}
export interface LocalTotem { id: string; nome: string; endereco: Ponto; categorias: string[]; pagamentos: string[]; versao: number; ativo: boolean; criadoEm: string; temSenha: boolean }
export interface MotoristaOpcao { id: string; nome: string; telefone: string; placa: string; veiculo: string; categorias: string }
export interface CorridaLista {
  id: string; os: string; status: string; statusTexto: string; grupo: Grupo; canal: string; local: string;
  passageiro: { nome: string; telefone: string }; embarque: string; destino: string; categoria: string; pagamento: string;
  motoristaId: string | null; motorista: string; telefoneMotorista: string; valor: number | null; valorEstimado: number | null;
  solicitadaEm: string; motivoCancelamento: string;
}
export interface PedidoTotem { pedidoId: string; destino?: Ponto; semDestino?: boolean; categoria: string; pagamento: string; nome: string; telefone: string }
export interface PedidoCentral { passageiro: { nome: string; telefone: string }; embarque: Ponto; destino?: Ponto; categoria: string; pagamento: string; observacao?: string; distanciaKm?: number; cupom?: string }

export class ErroTotem extends Error { constructor(msg: string, public status: number) { super(msg); } }

const lerLocal = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };

async function pedir<T>(url: string, init: RequestInit & { chave?: string } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (init.chave) headers.set("X-Totem-Chave", init.chave);
  // Usuário da plataforma: mesma empresa escolhida no topo do painel (o servidor ignora para os outros papéis).
  else { const e = lerLocal("empresa"); if (e) headers.set("X-Empresa", e); }
  let r: Response;
  try { r = await fetch(url, { ...init, headers, credentials: "same-origin" }); }
  catch { throw new ErroTotem("Sem conexão. Verifique a internet.", 0); }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroTotem((body as { erro?: string }).erro || `Erro ${r.status}`, r.status);
  return body as T;
}
const post = (corpo: unknown, chave?: string): RequestInit & { chave?: string } => ({ method: "POST", body: JSON.stringify(corpo), chave });

/** Aparelho do totem (sem login, com a chave da senha do local). */
export const apiTotem = (empresa: string, local: string) => {
  const b = `/api/totem/publico/${encodeURIComponent(empresa)}/${encodeURIComponent(local)}`;
  return {
    inicio: () => pedir<{ empresaId: string; marca: Marca; local: { id: string; nome: string } }>(b),
    entrar: (senha: string) => pedir<{ chave: string }>(`${b}/entrar`, post({ senha })),
    config: (chave: string) => pedir<{ marca: Marca; local: { id: string; nome: string; endereco: string; pagamentos: string[]; versao: number }; categorias: CategoriaTotem[] }>(`${b}/config`, { chave }),
    versao: (chave: string) => pedir<{ versao: number }>(`${b}/versao`, { chave }),
    pedir: (chave: string, p: PedidoTotem) => pedir<{ corrida: { id: string; os: string; valor: number | null; categoria: string } }>(`${b}/corridas`, post(p, chave)),
    situacao: (chave: string, id: string) => pedir<{ corrida: SituacaoTotem }>(`${b}/corridas/${encodeURIComponent(id)}`, { chave }),
    cancelar: (chave: string, id: string) => pedir<{ ok: true }>(`${b}/corridas/${encodeURIComponent(id)}/cancelar`, post({}, chave)),
  };
};

/** Painel (com login). */
export const apiCentral = {
  locais: () => pedir<{ locais: LocalTotem[]; pagamentos: string[]; categorias: CategoriaTotem[] }>("/api/totem/locais"),
  novoLocal: (d: Record<string, unknown>) => pedir<{ local: LocalTotem }>("/api/totem/locais", post(d)),
  salvarLocal: (id: string, d: Record<string, unknown>) => pedir<{ local: LocalTotem }>(`/api/totem/locais/${id}`, { method: "PUT", body: JSON.stringify(d) }),
  apagarLocal: (id: string) => pedir(`/api/totem/locais/${id}`, { method: "DELETE" }),
  recarregarLocal: (id: string) => pedir(`/api/totem/locais/${id}/recarregar`, post({})),
  opcoes: () => pedir<{ categorias: CategoriaTotem[]; pagamentos: string[]; motoristas: MotoristaOpcao[]; locais: Array<{ id: string; nome: string; endereco: Ponto }> }>("/api/totem/opcoes"),
  corridas: (canal?: string) => pedir<{ corridas: CorridaLista[] }>(`/api/totem/corridas${canal ? `?canal=${canal}` : ""}`),
  estimativa: (categoria: string, distanciaKm?: number) => pedir<{ valor: number | null; distanciaKm: number | null; minutos: number | null }>(`/api/corridas-proprias/estimativa?categoria=${encodeURIComponent(categoria)}${distanciaKm ? `&distanciaKm=${distanciaKm}` : ""}`),
  pedir: (p: PedidoCentral) => pedir<{ corrida: { id: string; os: string } }>("/api/corridas-proprias", post(p)),
  atribuir: (id: string, motoristaId: string) => pedir(`/api/corridas-proprias/${encodeURIComponent(id)}/motorista`, post({ motoristaId })),
  status: (id: string, status: string, valor?: number) => pedir(`/api/corridas-proprias/${encodeURIComponent(id)}/status`, post({ status, valor })),
  cancelar: (id: string, motivo: string) => pedir(`/api/corridas-proprias/${encodeURIComponent(id)}/cancelar`, post({ quem: "Central", motivo })),
};

export const novoPedidoId = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^\w-]/g, "");
export const reais = (n: number | null | undefined) => (n == null ? "" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
export const urlArquivo = (empresa: string, nome: string) => (nome ? `/api/publico/arquivo/${empresa}/${nome}?v=${encodeURIComponent(nome)}` : "");
/** Datas das corridas próprias: horário de Brasília gravado como UTC. */
export const horaBr = (s: string) => new Date(s).toLocaleString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
/** (11) 98888-7777 enquanto digita. */
export function mascaraTelefone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
