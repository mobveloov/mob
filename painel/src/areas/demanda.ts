// Funil de Clientes e Mapa de Bairros e Demanda (telas do painel de referência que a Machine não tem).
// Tudo calculado das corridas e dos passageiros reais da empresa (nada de dados de exemplo).
//
// Funil: do cadastro à corrida concluída. Não há registro de "visitou o app" nem de "buscou endereço", então o
// funil começa nos cadastros e nas solicitações: Solicitadas → Com motorista → Embarcaram → Concluídas.
// Abandono = corrida cancelada ou não atendida (com a etapa em que se perdeu). Lead incompleto = passageiro
// cadastrado no período que nunca pediu corrida.
//
// Mapa de bairros: o bairro vem do texto do endereço de embarque; a posição do bairro é a média das coordenadas
// de embarque das corridas dele.

import { cadastroPorId } from "../comum/cadastros.ts";
import { listar } from "../cadastros/armazem.ts";
import { montarCsv } from "../config/financeiro-visao.ts";
import { CANAL_TEXTO, listarProprias, STATUS_TEXTO, type CorridaPropria } from "../corridas/index.ts";
import { bairroDoEndereco } from "../relatorios/relatorios.ts";
import { agoraBr, arred, normal } from "../servidor/util.ts";

export interface Periodo { inicio: string; fim: string }
const DIA = 86_400_000;
const dataValida = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

/** Período em datas "AAAA-MM-DD" (Brasília). Sem datas válidas: hoje. Máximo de 366 dias. */
export function lerPeriodo(inicio: unknown, fim: unknown): Periodo {
  const hoje = agoraBr().toISOString().slice(0, 10);
  let i = dataValida(inicio) ? String(inicio) : hoje, f = dataValida(fim) ? String(fim) : (dataValida(inicio) ? String(inicio) : hoje);
  if (f < i) [i, f] = [f, i];
  if (Date.parse(f) - Date.parse(i) > 366 * DIA) i = new Date(Date.parse(f) - 366 * DIA).toISOString().slice(0, 10);
  return { inicio: i, fim: f };
}
const noPeriodo = (iso: string | null | undefined, p: Periodo) => !!iso && iso.slice(0, 10) >= p.inicio && iso.slice(0, 10) <= p.fim;
/** Data de cadastro (UTC real) vista no horário de Brasília, como as corridas. */
const cadastradoNoPeriodo = (iso: string | null | undefined, p: Periodo) => !!iso && noPeriodo(new Date(Date.parse(iso) - 3 * 3_600_000).toISOString(), p);
const telefoneDe = (v: unknown) => String(v ?? "").replace(/\D/g, "");

// ====================================================================== funil de clientes

export type AbaFunil = "abandono" | "corridas" | "leads";
const ETAPAS_ABANDONO = ["Sem motorista", "Cancelou antes do motorista", "Cancelou com o motorista a caminho", "Cancelou durante a viagem"] as const;

/** Em que ponto a corrida se perdeu. */
export function etapaDoAbandono(c: CorridaPropria): string {
  if (c.status === "nao_atendida") return ETAPAS_ABANDONO[0];
  if (c.iniciadaEm) return ETAPAS_ABANDONO[3];
  if (c.motoristaId || c.atribuidaEm || c.historico.some((h) => h.status === "a_caminho" || h.status === "no_local")) return ETAPAS_ABANDONO[2];
  return ETAPAS_ABANDONO[1];
}
const teveMotorista = (c: CorridaPropria) => !!(c.motoristaId || c.atribuidaEm || c.iniciadaEm || c.finalizadaEm || c.historico.some((h) => h.status === "a_caminho" || h.status === "no_local" || h.status === "em_andamento"));

export interface FiltroFunil extends Periodo { canal?: string; pagina?: number }

export function resumoDoFunil(empresaId: string, f: FiltroFunil) {
  const todas = listarProprias(empresaId);
  const doPeriodo = todas.filter((c) => noPeriodo(c.solicitadaEm, f) && (!f.canal || c.canal === f.canal));
  const clientes = listar(empresaId, cadastroPorId("clientes")!);
  const cadastrados = clientes.filter((c) => cadastradoNoPeriodo(c.criadoEm, f)).length;
  const com = doPeriodo.filter(teveMotorista).length;
  const embarcaram = doPeriodo.filter((c) => !!c.iniciadaEm || c.status === "finalizada").length;
  const finalizadas = doPeriodo.filter((c) => c.status === "finalizada").length;
  const canceladas = doPeriodo.filter((c) => c.status === "cancelada").length;
  const naoAtendidas = doPeriodo.filter((c) => c.status === "nao_atendida").length;
  const abertas = doPeriodo.length - finalizadas - canceladas - naoAtendidas;
  const base = doPeriodo.length || 1;
  const etapas = [
    { rotulo: "Solicitaram corrida", valor: doPeriodo.length, pct: doPeriodo.length ? 100 : 0 },
    { rotulo: "Tiveram motorista", valor: com, pct: Math.round((com / base) * 100) },
    { rotulo: "Embarcaram", valor: embarcaram, pct: Math.round((embarcaram / base) * 100) },
    { rotulo: "Concluíram a corrida", valor: finalizadas, pct: Math.round((finalizadas / base) * 100) },
  ];
  const perdas = ETAPAS_ABANDONO.map((rotulo) => ({ rotulo, valor: doPeriodo.filter((c) => (c.status === "cancelada" || c.status === "nao_atendida") && etapaDoAbandono(c) === rotulo).length }));
  const porCanal = Object.entries(CANAL_TEXTO).map(([canal, rotulo]) => {
    const l = todas.filter((c) => noPeriodo(c.solicitadaEm, f) && c.canal === canal);
    return { canal, rotulo, solicitadas: l.length, concluidas: l.filter((c) => c.status === "finalizada").length };
  }).filter((x) => x.solicitadas > 0);
  const leads = leadsIncompletos(empresaId, f);
  return {
    periodo: { inicio: f.inicio, fim: f.fim },
    resumo: { cadastrados, solicitadas: doPeriodo.length, abertas, finalizadas, canceladas, naoAtendidas, abandonaram: canceladas + naoAtendidas, leadsPerdidos: leads.length, conversao: arred((finalizadas / base) * 100, 1) },
    etapas, perdas, porCanal,
  };
}

function leadsIncompletos(empresaId: string, f: Periodo) {
  const pediram = new Set(listarProprias(empresaId).map((c) => telefoneDe(c.passageiro.telefone)));
  return listar(empresaId, cadastroPorId("clientes")!)
    .filter((c) => cadastradoNoPeriodo(c.criadoEm, f) && !pediram.has(telefoneDe(c.telefone)))
    .map((c) => ({ nome: String(c.nome ?? ""), telefone: String(c.telefone ?? ""), origem: String(c.origemCadastro ?? "") || "Painel", cidade: String(c.cidade ?? ""), cadastradoEm: c.criadoEm }))
    .sort((a, b) => b.cadastradoEm.localeCompare(a.cadastradoEm));
}

const PAGINA = 20;
const linhaCorrida = (c: CorridaPropria) => ({
  os: c.os, quando: c.solicitadaEm, passageiro: c.passageiro.nome, telefone: c.passageiro.telefone, canal: CANAL_TEXTO[c.canal] ?? c.canal,
  status: STATUS_TEXTO[c.status], embarque: c.embarque.texto, etapa: c.status === "cancelada" || c.status === "nao_atendida" ? etapaDoAbandono(c) : "",
  motivo: c.motivoCancelamento || "", quemCancelou: c.canceladaPor || "", valor: c.valor,
});

const COLUNAS: Record<AbaFunil, Array<{ chave: string; rotulo: string }>> = {
  abandono: [{ chave: "os", rotulo: "OS" }, { chave: "quando", rotulo: "Solicitada em" }, { chave: "passageiro", rotulo: "Passageiro" }, { chave: "telefone", rotulo: "Telefone" }, { chave: "canal", rotulo: "Canal" }, { chave: "etapa", rotulo: "Onde se perdeu" }, { chave: "status", rotulo: "Situação" }, { chave: "motivo", rotulo: "Motivo" }, { chave: "quemCancelou", rotulo: "Cancelado por" }, { chave: "embarque", rotulo: "Embarque" }],
  corridas: [{ chave: "os", rotulo: "OS" }, { chave: "quando", rotulo: "Solicitada em" }, { chave: "passageiro", rotulo: "Passageiro" }, { chave: "telefone", rotulo: "Telefone" }, { chave: "canal", rotulo: "Canal" }, { chave: "status", rotulo: "Situação" }, { chave: "embarque", rotulo: "Embarque" }, { chave: "valor", rotulo: "Valor" }],
  leads: [{ chave: "nome", rotulo: "Nome" }, { chave: "telefone", rotulo: "Telefone" }, { chave: "origem", rotulo: "Origem" }, { chave: "cidade", rotulo: "Cidade" }, { chave: "cadastradoEm", rotulo: "Cadastrado em" }],
};

export function linhasDaAba(empresaId: string, aba: AbaFunil, f: FiltroFunil): Array<Record<string, unknown>> {
  if (aba === "leads") return leadsIncompletos(empresaId, f);
  const l = listarProprias(empresaId).filter((c) => noPeriodo(c.solicitadaEm, f) && (!f.canal || c.canal === f.canal));
  const alvo = aba === "abandono" ? l.filter((c) => c.status === "cancelada" || c.status === "nao_atendida") : l;
  return alvo.sort((a, b) => b.solicitadaEm.localeCompare(a.solicitadaEm)).map(linhaCorrida);
}

export function abaDoFunil(empresaId: string, aba: AbaFunil, f: FiltroFunil) {
  const todas = linhasDaAba(empresaId, aba, f);
  const total = Math.max(1, Math.ceil(todas.length / PAGINA)), atual = Math.min(total, Math.max(1, Number(f.pagina) || 1));
  return { colunas: COLUNAS[aba], linhas: todas.slice((atual - 1) * PAGINA, atual * PAGINA), paginacao: { atual, totalPaginas: total, totalItens: todas.length } };
}

export function csvDoFunil(empresaId: string, aba: AbaFunil, f: FiltroFunil): string {
  const cols = COLUNAS[aba];
  return montarCsv(cols.map((c) => c.rotulo), linhasDaAba(empresaId, aba, f).map((l) => cols.map((c) => l[c.chave] ?? "")));
}

// ====================================================================== mapa de bairros e demanda

export type SituacaoBairro = "nunca" | "ativos" | "naoAtendidas" | "canceladas" | "concluidas";
const SITUACOES: SituacaoBairro[] = ["nunca", "ativos", "naoAtendidas", "canceladas", "concluidas"];
export const ROTULO_SITUACAO: Record<SituacaoBairro, string> = { nunca: "Nunca pediram", ativos: "Já pediram", naoAtendidas: "Não atendidas", canceladas: "Canceladas", concluidas: "Concluídas" };

interface Contagem { nunca: number; ativos: number; naoAtendidas: number; canceladas: number; concluidas: number }
export interface PassageiroBairro { nome: string; telefone: string; bairro: string; situacoes: SituacaoBairro[] }

const chaveBairro = (b: string, cidade: string) => normal(`${b}|${cidade}`);

export function mapaDeBairros(empresaId: string, p: Periodo) {
  const todas = listarProprias(empresaId);
  const clientes = listar(empresaId, cadastroPorId("clientes")!);
  // Bairros conhecidos (de todas as corridas) e a posição média de cada um.
  const bairros = new Map<string, { bairro: string; cidade: string; somaLat: number; somaLng: number; n: number; corridas: number; porSituacao: Contagem; passageiros: Set<string> }>();
  const noBairro = (b: string, cidade: string) => {
    const k = chaveBairro(b, cidade);
    let x = bairros.get(k);
    if (!x) { x = { bairro: b, cidade, somaLat: 0, somaLng: 0, n: 0, corridas: 0, porSituacao: { nunca: 0, ativos: 0, naoAtendidas: 0, canceladas: 0, concluidas: 0 }, passageiros: new Set() }; bairros.set(k, x); }
    return x;
  };
  const bairroDaCorrida = (c: CorridaPropria) => bairroDoEndereco(c.embarque.texto);
  const ultimoBairro = new Map<string, { quando: string; bairro: string; cidade: string }>();
  for (const c of todas) {
    const b = bairroDaCorrida(c), x = noBairro(b.bairro, b.cidade);
    if (c.embarque.lat != null && c.embarque.lng != null) { x.somaLat += c.embarque.lat; x.somaLng += c.embarque.lng; x.n++; }
    const tel = telefoneDe(c.passageiro.telefone), ult = ultimoBairro.get(tel);
    if (!ult || c.solicitadaEm > ult.quando) ultimoBairro.set(tel, { quando: c.solicitadaEm, bairro: b.bairro, cidade: b.cidade });
  }
  const pediramAlgumaVez = new Set(todas.map((c) => telefoneDe(c.passageiro.telefone)));

  // Passageiros e suas situações no período.
  const pass = new Map<string, PassageiroBairro & { cidade: string }>();
  const registrar = (tel: string, nome: string, bairro: string, cidade: string) => {
    let x = pass.get(tel);
    if (!x) { x = { nome, telefone: tel, bairro, cidade, situacoes: [] }; pass.set(tel, x); }
    return x;
  };
  for (const c of todas.filter((c) => noPeriodo(c.solicitadaEm, p))) {
    const tel = telefoneDe(c.passageiro.telefone), ult = ultimoBairro.get(tel);
    const x = registrar(tel, c.passageiro.nome, ult?.bairro ?? "Não informado", ult?.cidade ?? "");
    const add = (s: SituacaoBairro) => { if (!x.situacoes.includes(s)) x.situacoes.push(s); };
    add("ativos");
    if (c.status === "nao_atendida") add("naoAtendidas");
    if (c.status === "cancelada") add("canceladas");
    if (c.status === "finalizada") add("concluidas");
    noBairro(bairroDaCorrida(c).bairro, bairroDaCorrida(c).cidade).corridas++;
  }
  for (const c of clientes) {
    const tel = telefoneDe(c.telefone);
    if (!tel || pediramAlgumaVez.has(tel)) continue;
    const b = bairroDoEndereco(String(c.enderecoFavorito ?? ""));
    const x = registrar(tel, String(c.nome ?? ""), b.bairro, b.cidade || String(c.cidade ?? ""));
    x.situacoes.push("nunca");
    noBairro(x.bairro, x.cidade);
  }
  for (const x of pass.values()) {
    const b = noBairro(x.bairro, x.cidade);
    b.passageiros.add(x.telefone);
    for (const s of x.situacoes) b.porSituacao[s]++;
  }
  const lista = [...bairros.values()].map((b) => ({
    bairro: b.bairro, cidade: b.cidade,
    lat: b.n ? arred(b.somaLat / b.n, 6) : null, lng: b.n ? arred(b.somaLng / b.n, 6) : null,
    corridas: b.corridas, passageiros: b.passageiros.size, ...b.porSituacao,
    deserto: b.corridas === 0, // já teve demanda, mas nenhuma corrida no período
  })).sort((a, b) => b.corridas - a.corridas || a.bairro.localeCompare(b.bairro, "pt-BR"));
  const passageiros = [...pass.values()].map(({ cidade: _c, ...x }) => x).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")).slice(0, 5000);
  const totais = Object.fromEntries(SITUACOES.map((s) => [s, passageiros.filter((x) => x.situacoes.includes(s)).length])) as Record<SituacaoBairro, number>;
  return {
    periodo: p, bairros: lista, passageiros,
    totais: { todos: passageiros.length, ...totais, desertos: lista.filter((b) => b.deserto && b.bairro !== "Não informado").length, bairros: lista.length },
  };
}

/** Passageiros de um recorte (situação e bairro opcionais) para exportar ou copiar telefones. */
export function passageirosDoRecorte(empresaId: string, p: Periodo, situacao: string, bairro: string): PassageiroBairro[] {
  const base = mapaDeBairros(empresaId, p).passageiros;
  return base.filter((x) => (!situacao || situacao === "todos" || x.situacoes.includes(situacao as SituacaoBairro)) && (!bairro || normal(x.bairro) === normal(bairro)));
}

export function csvDoMapa(empresaId: string, p: Periodo, situacao: string, bairro: string): string {
  return montarCsv(["Nome", "Telefone", "Bairro", "Situação"], passageirosDoRecorte(empresaId, p, situacao, bairro).map((x) => [x.nome, x.telefone, x.bairro, x.situacoes.map((s) => ROTULO_SITUACAO[s]).join(", ")]));
}

const xml = (v: unknown) => String(v ?? "").replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
export function xmlDoMapa(empresaId: string, p: Periodo, situacao: string, bairro: string): string {
  const itens = passageirosDoRecorte(empresaId, p, situacao, bairro)
    .map((x) => `  <passageiro><nome>${xml(x.nome)}</nome><telefone>${xml(x.telefone)}</telefone><bairro>${xml(x.bairro)}</bairro><situacao>${xml(x.situacoes.map((s) => ROTULO_SITUACAO[s]).join(", "))}</situacao></passageiro>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<passageiros periodo="${xml(p.inicio)} a ${xml(p.fim)}">\n${itens}\n</passageiros>\n`;
}
