// Conversa do totem (/api/totem, servidor em src/totem/rotas.ts) e da tela "Solicitar corrida"
// (/api/totem para opções e lista; /api/corridas-proprias para pedir, atribuir motorista, mudar status e cancelar).

import type { Marca } from "../../comum/marca.ts";

export interface Ponto { texto: string; lat?: number; lng?: number }
export interface CategoriaTotem { nome: string; descricao: string; preco: number | null; espera?: number | null }
export interface CategoriaLocal { nome: string; descricao: string; taxaBase: number; porKm: number; porMin: number; minima: number; espera: number; ordem: number; ativa: boolean }
export type TipoTarifa = "dentro" | "local" | "cidades";
export interface TarifaCidade {
  id: string; tipo: TipoTarifa; titulo: string; resumo: string; origemCidade: string; origemUf: string; destinoCidade: string; destinoUf: string; local: string; categoria: string;
  normal: number; noite: number | null; noiteInicio: string; noiteFim: string; domingo: number | null; feriado: number | null;
  faixas: Array<{ inicio: string; fim: string; valor: number }>; pedagio: number | null; pedagioIdaVolta: boolean; ativa: boolean; obs: string;
}
export interface PremioConfig { label: string; type: "percent" | "fixed" | "none"; value: number; chance: number; color?: string }
export interface ConfigJogoPremio {
  invites_enabled: boolean; public_open: boolean; title: string; message: string; button_text: string; card_headline: string; card_phrase: string; color: string;
  prizes: PremioConfig[]; coupon_valid_days: number; schedule_enabled: boolean; days: number[]; send_time: string; times_per_day: number; every_n_days: number;
}
export interface JogoPremio {
  kind: "roleta" | "raspadinha"; rotulo: string; saved: boolean; config: ConfigJogoPremio; odds: { coupon: number; nothing: number };
  stats: { today: number; played_today: number; coupons_today: number; failed_today: number; total: number; played: number };
}
export interface CartaoFidelidade { name: string; rides_needed: number; reward_type: "percent" | "fixed"; reward_value: number; once: boolean; active: boolean; title: string; message: string }
export interface PremioPontos { name: string; points: number; type: "pickup" | "percent" | "fixed"; value: number }
export interface ConfigPontos {
  enabled: boolean; points_per_ride: number; point_value: number; min_points: number; points_expire_days: number; coupon_valid_days: number;
  prizes: PremioPontos[]; whatsapp: string; schedule_enabled: boolean; days: number[]; send_time: string; title: string; message: string;
}
export interface DadosFidelidade {
  empresa: string; modelos: CartaoFidelidade[];
  cartoes: Array<{ id: string; config: CartaoFidelidade; activated_at: number | null; members: number; delivered: number }>;
  pontos: {
    saved: boolean; config: ConfigPontos; money_value: number; stats: { passengers: number; circulating: number; redeemed: number };
    top: Array<{ phone: string; balance: number }>;
    pickups: Array<{ id: string; phone: string; prize: { name?: string } | null; pickup_code: string; pickup_done_at: number | null; created_at: number }>;
  };
}
export interface ConexaoZap { situacao: "conectado" | "aguardando_qr" | "desconectado" | "nao_configurado" | "erro"; qr?: string; codigo?: string; detalhe?: string; modo?: string; instancia?: string | null }
export interface VersaoApk { id: string; nome: string; codigo: number; url: string; tamanho: number | null; notas: string; ativa: boolean; criadaEm: string }
export type Grupo = "aberta" | "finalizada" | "cancelada" | "nao_atendida";
export interface SituacaoTotem {
  id: string; os: string; status: string; grupo: Grupo; statusTexto: string;
  motorista: { nome: string } | null; veiculo: { modelo: string; placa: string } | null;
  valor: number | null; valorEstimado: boolean; categoria: string; destino: string; podeCancelar: boolean;
}
export interface LocalTotem {
  id: string; nome: string; endereco: Ponto; categorias: string[]; pagamentos: string[]; versao: number; ativo: boolean; criadoEm: string; temSenha: boolean;
  cidade: string; uf: string; logo: string; rodape: string; modoWhatsapp: "individual" | "compartilhado"; aparelho: string; tabela: CategoriaLocal[]; surge: number;
}
export interface MotoristaOpcao { id: string; nome: string; telefone: string; placa: string; veiculo: string; categorias: string }
export interface CorridaLista {
  id: string; os: string; status: string; statusTexto: string; grupo: Grupo; canal: string; local: string;
  passageiro: { nome: string; telefone: string }; embarque: string; destino: string; categoria: string; pagamento: string;
  motoristaId: string | null; motorista: string; telefoneMotorista: string; valor: number | null; valorEstimado: number | null;
  solicitadaEm: string; motivoCancelamento: string;
}
export interface PedidoTotem { pedidoId: string; destino?: Ponto; semDestino?: boolean; categoria: string; pagamento: string; nome: string; telefone: string }
export interface PedidoCentral { passageiro: { nome: string; telefone: string }; embarque: Ponto; destino?: Ponto; categoria: string; pagamento: string; observacao?: string; distanciaKm?: number; cupom?: string }

export class ErroTotem extends Error { constructor(msg: string, public status: number, public codigo = "") { super(msg); } }

const lerLocal = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };

/** Identificador deste aparelho (gerado uma vez e guardado): o link do totem fica vinculado ao primeiro aparelho que entra. */
export function aparelhoDoTotem(): string {
  let a = lerLocal("totem:aparelho");
  if (!a || !/^[\w.-]{8,80}$/.test(a)) {
    a = `ap-${(crypto.randomUUID?.() ?? `${Date.now()}${Math.random().toString(36).slice(2)}`).replace(/[^\w]/g, "")}`.slice(0, 60);
    try { localStorage.setItem("totem:aparelho", a); } catch { /* sem armazenamento: o vínculo vale só até recarregar */ }
  }
  return a;
}

async function pedir<T>(url: string, init: RequestInit & { chave?: string } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (init.chave) { headers.set("X-Totem-Chave", init.chave); headers.set("X-Totem-Aparelho", aparelhoDoTotem()); }
  // Usuário da plataforma: mesma empresa escolhida no topo do painel (o servidor ignora para os outros papéis).
  else { const e = lerLocal("empresa"); if (e) headers.set("X-Empresa", e); }
  let r: Response;
  try { r = await fetch(url, { ...init, headers, credentials: "same-origin" }); }
  catch { throw new ErroTotem("Sem conexão. Verifique a internet.", 0); }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErroTotem((body as { erro?: string }).erro || `Erro ${r.status}`, r.status, (body as { codigo?: string }).codigo ?? "");
  return body as T;
}
const post = (corpo: unknown, chave?: string): RequestInit & { chave?: string } => ({ method: "POST", body: JSON.stringify(corpo), chave });

/** Aparelho do totem (sem login, com a chave da senha do local). */
export const apiTotem = (empresa: string, local: string) => {
  const b = `/api/totem/publico/${encodeURIComponent(empresa)}/${encodeURIComponent(local)}`;
  return {
    inicio: () => pedir<{ empresaId: string; marca: Marca; local: { id: string; nome: string; logo: string; rodape: string } }>(b),
    entrar: (senha: string) => pedir<{ chave: string }>(`${b}/entrar`, post({ senha, aparelho: aparelhoDoTotem() })),
    config: (chave: string) => pedir<{ marca: Marca; local: { id: string; nome: string; endereco: string; pagamentos: string[]; versao: number; logo: string; rodape: string; whatsappPronto: boolean | null }; categorias: CategoriaTotem[] }>(`${b}/config`, { chave }),
    /** O número tem WhatsApp? null = não deu para conferir (o totem segue normal). */
    /** Preços das categorias para o destino digitado (valor fixo de cidade ou local, quando há). */
    cotacao: (chave: string, destino: string) => pedir<{ categorias: Array<CategoriaTotem & { fixo: boolean; pedagio: number }> }>(`${b}/cotacao`, post({ destino }, chave)),
    /** Sugestões de endereço para o destino. */
    enderecos: (chave: string, q: string) => pedir<{ enderecos: Array<{ texto: string; lat: number; lng: number; exato: boolean }>; aviso: string | null }>(`${b}/enderecos?q=${encodeURIComponent(q)}`, { chave }),
    temWhatsapp: (chave: string, telefone: string) => pedir<{ existe: boolean | null }>(`${b}/whatsapp/existe`, post({ telefone }, chave)).then((r) => r.existe, (e) => { if (e instanceof ErroTotem && e.status === 400) throw e; return null; }),
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
  limparAparelho: (id: string) => pedir(`/api/totem/locais/${id}/aparelho`, { method: "DELETE" }),
  enviarImagem: (id: string, tipo: "logo" | "rodape", arquivo: File) => pedir<{ local: LocalTotem }>(`/api/totem/locais/${id}/imagem/${tipo}`, { method: "POST", body: arquivo, headers: { "Content-Type": arquivo.type } }),
  tirarImagem: (id: string, tipo: "logo" | "rodape") => pedir<{ local: LocalTotem }>(`/api/totem/locais/${id}/imagem/${tipo}`, { method: "DELETE" }),
  salvarPrecos: (id: string, d: { tabela: CategoriaLocal[]; surge: number; copiarPara?: "todos" | string[] }) => pedir<{ local: LocalTotem }>(`/api/totem/locais/${id}/precos`, { method: "PUT", body: JSON.stringify(d) }),
  whatsapp: (id: string) => pedir<ConexaoZap>(`/api/totem/locais/${id}/whatsapp`),
  conectarWhatsapp: (id: string) => pedir<ConexaoZap>(`/api/totem/locais/${id}/whatsapp/conectar`, post({})),
  desconectarWhatsapp: (id: string) => pedir(`/api/totem/locais/${id}/whatsapp/desconectar`, post({})),
  tarifasCidade: () => pedir<{ tarifas: TarifaCidade[]; feriados: Array<{ id: string; data: string; nome: string }>; esperaPorHora: number | null }>("/api/totem/tarifas-cidade"),
  novaTarifaCidade: (tipo: TipoTarifa, d: unknown) => pedir<{ tarifa: TarifaCidade }>(`/api/totem/tarifas-cidade/${tipo}`, post(d)),
  salvarTarifaCidade: (tipo: TipoTarifa, d: unknown, id: string) => pedir<{ tarifa: TarifaCidade }>(`/api/totem/tarifas-cidade/${tipo}/${id}`, { method: "PUT", body: JSON.stringify(d) }),
  apagarTarifaCidade: (id: string) => pedir(`/api/totem/tarifas-cidade/${id}`, { method: "DELETE" }),
  novoFeriadoCidade: (data: string, nome: string) => pedir("/api/totem/tarifas-cidade-feriados", post({ data, nome })),
  apagarFeriadoCidade: (id: string) => pedir(`/api/totem/tarifas-cidade-feriados/${id}`, { method: "DELETE" }),
  esperaCidade: (valor: string) => pedir("/api/totem/tarifas-cidade-espera", { method: "PUT", body: JSON.stringify({ valor }) }),
  premios: () => pedir<{ jogos: JogoPremio[]; empresa: string }>("/api/totem/premios"),
  salvarPremio: (kind: string, config: ConfigJogoPremio) => pedir(`/api/totem/premios/${kind}`, { method: "PUT", body: JSON.stringify({ config }) }),
  enviarPremiosAgora: (kind: string) => pedir<{ enviados: number; falhas: number; criados: number }>(`/api/totem/premios/${kind}/enviar-agora`, post({})),
  convidarPremio: (kind: string, telefone: string) => pedir<{ link: string }>(`/api/totem/premios/${kind}/convite`, post({ telefone })),
  fidelidade: () => pedir<DadosFidelidade>("/api/totem/fidelidade"),
  salvarCartao: (id: string | null, config: CartaoFidelidade) => pedir<{ id: string }>("/api/totem/fidelidade/cartoes", { method: "PUT", body: JSON.stringify({ id, config }) }),
  excluirCartao: (id: string) => pedir(`/api/totem/fidelidade/cartoes/${id}`, { method: "DELETE" }),
  salvarPontos: (config: ConfigPontos) => pedir("/api/totem/fidelidade/pontos", { method: "PUT", body: JSON.stringify({ config }) }),
  retiradaEntregue: (id: string) => pedir(`/api/totem/fidelidade/pontos/retirada/${id}`, post({})),
  apk: () => pedir<{ versao: VersaoApk | null }>("/api/totem/apk"),
  apkVersoes: () => pedir<{ versoes: VersaoApk[] }>("/api/totem/apk/versoes"),
  publicarApk: (d: Record<string, unknown>) => pedir<{ versao: VersaoApk }>("/api/totem/apk/versoes", post(d)),
  ligarApk: (id: string, ativa: boolean) => pedir<{ versao: VersaoApk }>(`/api/totem/apk/versoes/${id}`, { method: "PUT", body: JSON.stringify({ ativa }) }),
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
