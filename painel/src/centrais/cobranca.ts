// Cobrança da plataforma por central: planos ("Meus planos"), serviços adicionais e Demonstrativo Mensal.
// Sem gateway: nada é cobrado de verdade. O demonstrativo é calculado das corridas da central no mês e dos planos escolhidos,
// e serve de base para o boleto que a plataforma emitir fora do painel. Valores dos planos são exemplos da nossa plataforma.
//
// Isolamento: a principal só soma, da rede, números agregados (quantidade de corridas finalizadas e tarifas). Nenhuma corrida,
// passageiro ou motorista de associada sai daqui.

import { listarProprias } from "../corridas/index.ts";
import { agoraBr } from "../servidor/util.ts";
import { empresa } from "../servidor/dados.ts";
import { montarCsv } from "../config/financeiro-visao.ts";
import { alterar, associadasDe, controleDe, ErroCentral, estado, exigirVisivel, principalDe } from "./rede.ts";

const cent = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const reais = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export interface Plano {
  id: string; nome: string; mensalidade: number;
  /** Tarifa por corrida finalizada: valor fixo + percentual do valor bruto, limitada ao teto. */
  tarifaFixa: number; percentual: number; teto: number;
  taxaPix: { percentual: number; minimo: number }; taxaSaquePix: number;
  inclusos: string[];
}
const SERVICOS_INCLUSOS = ["Validação de CPF de motoristas e passageiros", "Envio de SMS", "Rotas visíveis durante a viagem e o embarque", "Página personalizada do app do motorista", "Link personalizado do app do motorista"];
export const PLANOS: Plano[] = [
  { id: "essencial", nome: "Essencial", mensalidade: 0, tarifaFixa: 0.55, percentual: 0.04, teto: 1.2, taxaPix: { percentual: 0.99, minimo: 0.15 }, taxaSaquePix: 0.8, inclusos: [] },
  { id: "plus", nome: "Plus", mensalidade: 99, tarifaFixa: 0.47, percentual: 0.035, teto: 1.05, taxaPix: { percentual: 0.89, minimo: 0.12 }, taxaSaquePix: 0.65, inclusos: SERVICOS_INCLUSOS.slice(0, 2) },
  { id: "ultra", nome: "Ultra", mensalidade: 199, tarifaFixa: 0.4, percentual: 0.03, teto: 0.95, taxaPix: { percentual: 0.79, minimo: 0.1 }, taxaSaquePix: 0.5, inclusos: SERVICOS_INCLUSOS },
];
export const PLANO_PADRAO = "essencial";
export const planoPorId = (id: string) => PLANOS.find((p) => p.id === id);

export interface Servico { id: string; nome: string; descricao: string; preco: number; unidade: "mês" | "1000 corridas" }
export const SERVICOS: Servico[] = [
  { id: "url", nome: "URL personalizada", descricao: "Endereço personalizado para acesso aos recursos da central.", preco: 99, unidade: "mês" },
  { id: "anuncio-inicio", nome: "Anúncio na tela inicial do app passageiro", descricao: "Espaço de mídia dentro do aplicativo dos seus passageiros.", preco: 2, unidade: "1000 corridas" },
  { id: "anuncio-ciclo", nome: "Anúncio no ciclo da corrida", descricao: "Espaço de mídia exibido durante a corrida no aplicativo dos seus passageiros.", preco: 5, unidade: "1000 corridas" },
  { id: "anuncio-motorista", nome: "Anúncios no app do motorista", descricao: "Espaço de mídia dentro do aplicativo dos seus motoristas.", preco: 2, unidade: "1000 corridas" },
];

/** Categorias de bonificação da rede, pelas corridas finalizadas da rede nos últimos 3 meses. */
export const CATEGORIAS = [
  { nome: "Bronze", minimo: 0, bonificacao: 0 }, { nome: "Prata", minimo: 2_000, bonificacao: 1 },
  { nome: "Ouro", minimo: 10_000, bonificacao: 3 }, { nome: "Safira", minimo: 30_000, bonificacao: 5 },
];

export const planoDe = (id: string): Plano => planoPorId(estado().planos[id] ?? "") ?? planoPorId(PLANO_PADRAO)!;
export const servicosAtivos = (id: string): string[] => (estado().servicos[id] ?? []).filter((s) => SERVICOS.some((x) => x.id === s));

export function escolherPlano(visorId: string, alvoId: unknown, plano: unknown) {
  const alvo = exigirVisivel(visorId, alvoId);
  if (alvo !== visorId) throw new ErroCentral("O plano é escolhido pela própria central.", 403);
  const p = planoPorId(String(plano));
  if (!p) throw new ErroCentral("Plano inválido.");
  alterar((e) => { e.planos[alvo] = p.id; });
  return p;
}

export function escolherServicos(visorId: string, alvoId: unknown, ids: unknown) {
  const alvo = exigirVisivel(visorId, alvoId);
  if (alvo !== visorId) throw new ErroCentral("Os serviços são escolhidos pela própria central.", 403);
  if (!Array.isArray(ids)) throw new ErroCentral("Lista de serviços inválida.");
  const validos = [...new Set(ids.map(String))].filter((s) => SERVICOS.some((x) => x.id === s));
  if (validos.length !== new Set(ids.map(String)).size) throw new ErroCentral("Serviço desconhecido.");
  alterar((e) => { e.servicos[alvo] = validos; });
  return validos;
}

// ------------------------------------------------------------------ números do mês (só agregados)

const mesDe = (s: string) => s.slice(0, 7);
export const competenciaValida = (c: unknown): c is string => typeof c === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(c);
export const competenciaAtual = () => agoraBr().toISOString().slice(0, 7);

/** Últimas 12 competências, da mais recente para a mais antiga. */
export function competencias(n = 12): Array<{ valor: string; rotulo: string }> {
  const agora = agoraBr();
  const nomes = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - i, 1));
    return { valor: d.toISOString().slice(0, 7), rotulo: `${nomes[d.getUTCMonth()]} de ${d.getUTCFullYear()}` };
  });
}

/** Tarifa da plataforma sobre uma corrida finalizada: fixa + % do valor bruto, até o teto. */
export const tarifaDaCorrida = (p: Plano, valor: number | null) => Math.min(p.teto, cent(p.tarifaFixa + p.percentual * Math.max(0, valor ?? 0)));

export interface NumerosMes { finalizadas: number; naoFinalizadas: number; bruto: number; tarifas: number; diasAtivos: number }
export function numerosDoMes(empresaId: string, competencia: string, plano = planoDe(empresaId)): NumerosMes {
  const dias = new Set<string>();
  const n: NumerosMes = { finalizadas: 0, naoFinalizadas: 0, bruto: 0, tarifas: 0, diasAtivos: 0 };
  for (const c of listarProprias(empresaId)) {
    const quando = c.status === "finalizada" ? (c.finalizadaEm ?? c.solicitadaEm) : c.solicitadaEm;
    if (!quando || mesDe(quando) !== competencia) continue;
    if (c.status === "finalizada") { n.finalizadas++; n.bruto += c.valor ?? 0; n.tarifas += tarifaDaCorrida(plano, c.valor); dias.add(quando.slice(0, 10)); }
    else if (c.status === "cancelada" || c.status === "nao_atendida") { n.naoFinalizadas++; dias.add(quando.slice(0, 10)); }
  }
  return { ...n, bruto: cent(n.bruto), tarifas: cent(n.tarifas), diasAtivos: dias.size };
}

/** Corridas finalizadas e tarifas da rede inteira (principal + associadas) numa competência. Só números somados. */
function numerosDaRede(principalId: string, competencia: string) {
  let finalizadas = 0, tarifas = 0;
  for (const id of [principalId, ...associadasDe(principalId)]) { const n = numerosDoMes(id, competencia); finalizadas += n.finalizadas; tarifas += n.tarifas; }
  return { finalizadas, tarifas: cent(tarifas) };
}

function ultimas3(competencia: string): string[] {
  const [a, m] = competencia.split("-").map(Number);
  return [0, 1, 2].map((i) => new Date(Date.UTC(a, m - 1 - i, 1)).toISOString().slice(0, 7));
}

/** Categoria de bonificação da rede e quanto falta para a próxima. Só faz sentido para a principal. */
export function bonificacaoDaRede(principalId: string, competencia: string) {
  const meses = ultimas3(competencia);
  const finalizadas = meses.reduce((s, m) => s + numerosDaRede(principalId, m).finalizadas, 0);
  const idx = CATEGORIAS.reduce((i, c, k) => (finalizadas >= c.minimo ? k : i), 0);
  const atual = CATEGORIAS[idx], proxima = CATEGORIAS[idx + 1] ?? null;
  const doMes = numerosDaRede(principalId, competencia);
  return {
    categoria: atual.nome, percentual: atual.bonificacao, finalizadasRede: finalizadas, meses,
    proxima: proxima ? { nome: proxima.nome, faltam: proxima.minimo - finalizadas } : null,
    recebidaNoMes: cent((doMes.tarifas * atual.bonificacao) / 100),
  };
}

// ------------------------------------------------------------------ Meus planos

/** Dados da tela "Meus planos". Para uma associada, mostra só o plano e os serviços dela (sem dados da rede). */
export function meusPlanos(visorId: string, alvoId: unknown) {
  const alvo = exigirVisivel(visorId, alvoId);
  const plano = planoDe(alvo), competencia = competenciaAtual();
  const ativos = servicosAtivos(alvo);
  const ehPrincipal = !principalDe(visorId) && associadasDe(visorId).length > 0;
  return {
    central: { id: alvo, nome: empresa(alvo)?.nome ?? "", propria: alvo === visorId },
    plano, planos: PLANOS, servicos: SERVICOS.map((s) => ({ ...s, ativo: ativos.includes(s.id) })), podeEditar: alvo === visorId,
    // a rede só aparece para quem é principal e olha a própria central
    rede: ehPrincipal && alvo === visorId ? bonificacaoDaRede(visorId, competencia) : null,
    categorias: CATEGORIAS, competencia,
    podeAbrirAssociada: !principalDe(visorId),
  };
}

// ------------------------------------------------------------------ Demonstrativo Mensal

export interface LinhaDemonstrativo { descricao: string; quantidade: number | null; valorUnitario: string; debito: number | null; credito: number | null }

/**
 * Demonstrativo de uma central numa competência. A associada vê o próprio. A principal vê o das associadas só quando o débito
 * automático delas usa a conta da principal (é a principal que paga), e o da própria central sempre.
 */
export function demonstrativo(visorId: string, alvoId: unknown, competencia: unknown) {
  const alvo = exigirVisivel(visorId, alvoId);
  if (alvo !== visorId && controleDe(alvo).debitoAutomatico !== "Usar conta da central principal") throw new ErroCentral("O débito desta central usa a conta própria dela: o demonstrativo só aparece para ela.", 403);
  const comp = competencia === undefined || competencia === "" ? competenciaAtual() : competencia;
  if (!competenciaValida(comp)) throw new ErroCentral("Competência inválida (use AAAA-MM).");
  const plano = planoDe(alvo), n = numerosDoMes(alvo, comp, plano);
  const ativos = servicosAtivos(alvo);
  const l: LinhaDemonstrativo[] = [];
  l.push({ descricao: "Corridas finalizadas", quantidade: n.finalizadas, valorUnitario: `${reais(plano.tarifaFixa)} + ${String(plano.percentual * 100).replace(".", ",")}% do valor (teto ${reais(plano.teto)})`, debito: n.tarifas, credito: null });
  l.push({ descricao: "Corridas não finalizadas", quantidade: n.naoFinalizadas, valorUnitario: "sem cobrança", debito: 0, credito: null });
  if (plano.mensalidade) l.push({ descricao: `Mensalidade do plano ${plano.nome}`, quantidade: 1, valorUnitario: `${reais(plano.mensalidade)} por mês`, debito: plano.mensalidade, credito: null });
  for (const s of SERVICOS.filter((x) => ativos.includes(x.id))) {
    if (s.unidade === "mês") l.push({ descricao: s.nome, quantidade: 1, valorUnitario: `${reais(s.preco)} por mês`, debito: s.preco, credito: null });
    else l.push({ descricao: s.nome, quantidade: n.finalizadas, valorUnitario: `${reais(s.preco)} a cada 1000 corridas`, debito: cent((n.finalizadas / 1000) * s.preco), credito: null });
  }
  // bonificação: crédito só na principal, sobre as tarifas de toda a rede
  const rede = !principalDe(alvo) && associadasDe(alvo).length ? bonificacaoDaRede(alvo, comp) : null;
  if (rede && rede.recebidaNoMes > 0) l.push({ descricao: `Bonificação da rede (${rede.categoria}, ${rede.percentual}%)`, quantidade: null, valorUnitario: `${rede.percentual}% das tarifas da rede`, debito: null, credito: rede.recebidaNoMes });
  const debitos = cent(l.reduce((s, x) => s + (x.debito ?? 0), 0)), creditos = cent(l.reduce((s, x) => s + (x.credito ?? 0), 0));
  const quemPaga = alvo !== visorId ? "principal" : principalDe(alvo) && controleDe(alvo).debitoAutomatico === "Usar conta da central principal" ? "principal" : "propria";
  return {
    central: { id: alvo, nome: empresa(alvo)?.nome ?? "" }, competencia: comp, competencias: competencias(), plano: { id: plano.id, nome: plano.nome },
    diasAtivos: n.diasAtivos, linhas: l, subtotal: debitos, descontos: creditos, totalAPagar: Math.max(0, cent(debitos - creditos)), quemPaga,
  };
}

export function csvDemonstrativo(visorId: string, alvoId: unknown, competencia: unknown): string {
  const d = demonstrativo(visorId, alvoId, competencia);
  const linhas: unknown[][] = d.linhas.map((x) => [x.descricao, x.quantidade, x.valorUnitario, x.debito, x.credito]);
  linhas.push(["Total a pagar", "", "", "", d.totalAPagar]);
  return montarCsv(["Descrição", "Quantidade", "Valor unitário", "Débitos", "Créditos"], [["Central", d.central.nome, "", "", ""], ["Competência", d.competencia, "", "", ""], ["Dias ativos", d.diasAtivos, "", "", ""], ...linhas]);
}
