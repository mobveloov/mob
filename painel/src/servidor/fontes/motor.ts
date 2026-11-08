// Ponte com o motor (pasta motor/, de outra equipe). Contrato: docs/CONTRATO_MOTOR.md.
//
// O motor é carregado só na hora de usar (import dinâmico): o painel compila e roda mesmo se o motor estiver
// mudando, e um erro do motor vira aviso na tela em vez de derrubar o painel.
// O painel cria um adaptador por integração da empresa, passando só as credenciais daquela empresa.
// Nada aqui lê process.env: uma empresa nunca usa a credencial de outra.

import { corridaVazia, type CorridaPainel, type GrupoStatus } from "../../comum/corrida.ts";
import { dataBr, paraIsoBrasilia } from "../util.ts";

/** Tipos de integração do painel (neutros). */
export type TipoMotor = "sistema-a" | "sistema-b";

/** Identificadores técnicos do contrato do motor (docs/CONTRATO_MOTOR.md). Único ponto do painel que os conhece. */
const ID_NO_MOTOR: Record<TipoMotor, string> = { "sistema-a": "sistema-a", "sistema-b": "sistema-b" };

/** Campos de credencial de cada tipo. "opcional" = não é preciso para ler as corridas. */
export const CAMPOS: Record<TipoMotor, Array<{ chave: string; rotulo: string; secreto: boolean; opcional?: boolean }>> = {
  "sistema-a": [
    { chave: "chaveApi", rotulo: "Chave da API", secreto: true },
    { chave: "usuario", rotulo: "Usuário de integração", secreto: false },
    { chave: "senha", rotulo: "Senha do usuário de integração", secreto: true },
    { chave: "urlApi", rotulo: "Endereço da API (termina em /api/v2/integracao)", secreto: false },
    { chave: "motivoCancelamento", rotulo: "Motivo padrão de cancelamento (número)", secreto: false, opcional: true },
    { chave: "latPadrao", rotulo: "Latitude de um ponto da cidade (para as categorias, ex.: -21,0106)", secreto: false, opcional: true },
    { chave: "lngPadrao", rotulo: "Longitude do mesmo ponto (ex.: -48,2196)", secreto: false, opcional: true },
  ],
  "sistema-b": [
    { chave: "cookie", rotulo: "Cookie da sessão do painel web", secreto: true },
    { chave: "cidade", rotulo: "Número da cidade", secreto: false, opcional: true },
    { chave: "urlPainel", rotulo: "Endereço do painel web", secreto: false },
    { chave: "urlApiApp", rotulo: "Endereço da API do app (para categorias)", secreto: false, opcional: true },
  ],
};

// ------------------------------------------------------------------ o que o painel usa do contrato (v2)

interface PessoaM { nome?: string; telefone?: string }
interface EnderecoM { texto?: string; cidade?: string }
/** Corrida do motor (só os campos que o painel lê). */
export interface CorridaMotor {
  idOriginal: string; grupo: GrupoStatus; statusTexto?: string;
  solicitadaEm?: string; iniciadaEm?: string; finalizadaEm?: string;
  passageiro?: PessoaM; motorista?: PessoaM; partida?: EnderecoM; destino?: EnderecoM;
  categoria?: { nome?: string }; pagamento?: string; pagamentoOriginal?: string;
  valor?: number; valorSemDesconto?: number; distanciaKm?: number; canal?: string; observacao?: string;
  canceladaPor?: string; motivoCancelamento?: string;
  distanciaMotoristaKm?: number; tarifa?: string; cupom?: string; descontoValor?: number;
  avaliacao?: { nota?: number }; dinamica?: { ativa?: boolean; fator?: number }; programada?: boolean;
}
interface AdaptadorM {
  configurado(): boolean;
  pendencias(): string[];
  listarCorridas(f: { de?: string; ate?: string; pagina?: number; limite?: number }): Promise<{ itens: CorridaMotor[]; temMais: boolean }>;
}
/** Contrato v2 do motor: um adaptador por integração ({ id, tipo, credenciais }). */
interface ModuloMotor { criarAdaptador(i: { id: string; tipo: string; credenciais: Record<string, unknown> }): AdaptadorM }

/** Campos do painel -> credenciais do contrato v2 do motor. */
export function credenciaisV2(tipo: TipoMotor, c: Record<string, string>): Record<string, unknown> {
  const v = (k: string) => (c[k] ?? "").trim() || undefined;
  if (tipo === "sistema-a") {
    const motivo = Number(v("motivoCancelamento"));
    // Coordenada aceita vírgula ou ponto; fora do mapa ou vazia = sem ponto padrão.
    const coord = (k: string, max: number) => { const n = Number(String(v(k) ?? "").replace(",", ".")); return v(k) && Number.isFinite(n) && n !== 0 && Math.abs(n) <= max ? n : undefined; };
    return {
      apiKey: v("chaveApi"), usuario: v("usuario"), senha: v("senha"), apiUrl: v("urlApi"), motivoCancelamentoId: Number.isFinite(motivo) && motivo > 0 ? motivo : undefined,
      latPadrao: coord("latPadrao", 90), lngPadrao: coord("lngPadrao", 180),
    };
  }
  return { cookie: v("cookie"), cidadeId: v("cidade"), painelUrl: v("urlPainel"), appApiUrl: v("urlApiApp") };
}

let modulo: Promise<ModuloMotor> | null = null;
function carregarMotor(): Promise<ModuloMotor> {
  const caminho = process.env.MOTOR_CAMINHO || new URL("../../../../motor/src/index.ts", import.meta.url).href;
  modulo ??= (import(/* @vite-ignore */ caminho) as Promise<ModuloMotor>).catch((e) => { modulo = null; throw new Error(`motor de integração indisponível (${e instanceof Error ? e.message : e})`); });
  return modulo;
}

async function adaptador(tipo: TipoMotor, credenciais: Record<string, string>, integracaoId: string = tipo): Promise<AdaptadorM> {
  const m = await carregarMotor();
  if (typeof m.criarAdaptador !== "function") throw new Error("versão do motor sem criarAdaptador (o painel usa o contrato v2)");
  return m.criarAdaptador({ id: integracaoId, tipo: ID_NO_MOTOR[tipo], credenciais: credenciaisV2(tipo, credenciais) });
}

const PAGAMENTO: Record<string, string> = {
  dinheiro: "Dinheiro", pix: "Pix", cartao_app: "Cartão no app", cartao_maquina: "Cartão na maquininha",
  carteira: "Carteira", voucher: "Voucher", faturado: "Faturado",
};
const CANAL: Record<string, string> = { app: "App", macaneta: "Ponto fixo", central: "Central", integracao: "Integração", site: "Site", whatsapp: "WhatsApp" };
const QUEM: Record<string, string> = { passageiro: "Passageiro", motorista: "Motorista", central: "Central" };

/** Corrida do motor -> corrida do painel. */
export function corridaDoMotor(c: CorridaMotor, origem: string, origemNome: string): CorridaPainel {
  return {
    ...corridaVazia({ id: `${origem}:${c.idOriginal}`, origem, origemNome, os: String(c.idOriginal), grupo: c.grupo, statusTexto: c.statusTexto || "Sem status" }),
    solicitadaEm: dataBr(c.solicitadaEm), iniciadaEm: dataBr(c.iniciadaEm), finalizadaEm: dataBr(c.finalizadaEm),
    cidade: c.partida?.cidade ?? "", categoria: c.categoria?.nome ?? "",
    pagamento: (c.pagamento && PAGAMENTO[c.pagamento]) || c.pagamentoOriginal || (c.pagamento === "outro" ? "Outro" : ""),
    canal: c.canal ? CANAL[c.canal] ?? c.canal : "",
    motorista: c.motorista?.nome ?? "", telefoneMotorista: c.motorista?.telefone ?? "",
    passageiro: c.passageiro?.nome ?? "", telefonePassageiro: c.passageiro?.telefone ?? "",
    embarque: c.partida?.texto ?? "", destino: c.destino?.texto ?? "", observacao: c.observacao ?? "",
    valor: c.valor ?? null, valorSemDesconto: c.valorSemDesconto ?? null,
    desconto: c.descontoValor ?? (c.valor != null && c.valorSemDesconto != null && c.valorSemDesconto > c.valor ? Math.round((c.valorSemDesconto - c.valor) * 100) / 100 : null),
    cupom: c.cupom ?? "", tarifa: c.tarifa ?? "", distanciaMotoristaKm: c.distanciaMotoristaKm ?? null,
    avaliacao: c.avaliacao?.nota ?? null, fatorDinamico: c.dinamica?.ativa ? c.dinamica.fator ?? null : null, programada: !!c.programada,
    distanciaKm: c.distanciaKm ?? null,
    canceladaPor: c.canceladaPor ? QUEM[c.canceladaPor] ?? c.canceladaPor : "", motivoCancelamento: c.motivoCancelamento ?? "",
  };
}

const MAX_PAGINAS = 40;
const DIAS_POR_BUSCA = 30;

/** Divide [de, ate] em pedaços de até `dias` dias, sem sobrepor (o fim de um é o começo do outro). */
export function pedacos(de: Date, ate: Date, dias: number): Array<[Date, Date]> {
  const out: Array<[Date, Date]> = [];
  const passo = dias * 86_400_000;
  for (let t = de.getTime(); t < ate.getTime(); t += passo) out.push([new Date(t), new Date(Math.min(t + passo, ate.getTime()))]);
  return out.length ? out : [[de, ate]];
}

/** Busca todas as páginas do período numa integração do motor. */
export async function corridasDoMotor(tipo: TipoMotor, credenciais: Record<string, string>, de: Date, ate: Date, origem: string, origemNome: string) {
  const a = await adaptador(tipo, credenciais, origem);
  if (!a.configurado()) return { corridas: [] as CorridaPainel[], aviso: `${origemNome}: falta configurar a integração.` };
  const corridas: CorridaPainel[] = [];
  let paginas = 0;
  // O Sistema A aceita no máximo 31 dias por busca: período maior vai em pedaços de até 30 dias.
  for (const [ini, fim] of pedacos(de, ate, DIAS_POR_BUSCA)) {
    for (let pagina = 1; ; pagina++) {
      if (++paginas > MAX_PAGINAS) return { corridas, aviso: `${origemNome}: período grande; mostrando as primeiras ${corridas.length} corridas.` };
      const p = await a.listarCorridas({ de: paraIsoBrasilia(ini), ate: paraIsoBrasilia(fim), pagina, limite: 100 });
      corridas.push(...p.itens.map((c) => corridaDoMotor(c, origem, origemNome)));
      if (!p.temMais || !p.itens.length) break;
    }
  }
  return { corridas };
}

/** O que falta configurar numa integração (texto do próprio motor). */
export async function pendenciasDoMotor(tipo: TipoMotor, credenciais: Record<string, string>): Promise<string[]> {
  try { return (await adaptador(tipo, credenciais)).pendencias(); }
  catch (e) { return [e instanceof Error ? e.message : String(e)]; }
}

// ------------------------------------------------------------------ cadastros vindos do motor

interface MotoristaM { nome?: string; telefone?: string; cpf?: string; ativo?: boolean; avaliacao?: number; categorias?: string[]; veiculo?: { modelo?: string; placa?: string; cor?: string } }
interface CategoriaM { nome?: string; descricao?: string; tarifa?: { base?: number; km?: number; minuto?: number; minima?: number } }
interface AdaptadorCadastros { motoristas?(f?: { pagina?: number; limite?: number }): Promise<{ itens: MotoristaM[]; temMais: boolean }>; categorias?(): Promise<CategoriaM[] | { itens: CategoriaM[] }> }

/** Motoristas de uma integração (todas as páginas, até 2.000). */
export async function motoristasDoMotor(tipo: TipoMotor, credenciais: Record<string, string>, integracaoId: string): Promise<MotoristaM[]> {
  const a = (await adaptador(tipo, credenciais, integracaoId)) as AdaptadorM & AdaptadorCadastros;
  if (!a.configurado() || !a.motoristas) return [];
  const out: MotoristaM[] = [];
  for (let pagina = 1; pagina <= 20; pagina++) {
    const p = await a.motoristas({ pagina, limite: 100 });
    out.push(...p.itens);
    if (!p.temMais || !p.itens.length) break;
  }
  return out;
}

/** Categorias (e tarifas, quando o sistema informa) de uma integração. */
export async function categoriasDoMotor(tipo: TipoMotor, credenciais: Record<string, string>, integracaoId: string): Promise<CategoriaM[]> {
  const a = (await adaptador(tipo, credenciais, integracaoId)) as AdaptadorM & AdaptadorCadastros;
  if (!a.configurado() || !a.categorias) return [];
  const r = await a.categorias();
  return Array.isArray(r) ? r : r.itens ?? [];
}
