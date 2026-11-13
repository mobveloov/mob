// Consultar corridas direto no banco (SQLite): filtros, paginação, totais e exportação sem carregar todas as corridas na memória.
// Vale para as corridas próprias da empresa (tabela corridas_proprias). Toda consulta filtra pela empresa que veio do login.

import { cadastroPorId } from "../comum/cadastros.ts";
import { listar } from "../cadastros/armazem.ts";
import { CANAL_TEXTO, corridaPropriaParaPainel, prepararProprias, type CorridaPropria } from "../corridas/index.ts";
import { banco } from "../servidor/banco.ts";
import { agoraBr, celulaCsv, normal } from "../servidor/util.ts";
import type { CorridaPainel } from "../comum/corrida.ts";

/** Atalhos de tempo ("Exibindo as últimas"), em horas. */
export const RAPIDOS: Record<string, number | "hoje"> = { "15min": 0.25, "30min": 0.5, "1h": 1, "2h": 2, "3h": 3, "4h": 4, hoje: "hoje" };

/** Formas de pagamento da lista da Machine (a lista também mostra o que a central já usou). */
export const PAGAMENTOS_LISTA = ["Dinheiro", "Débito (máquina)", "Crédito (máquina)", "eTicket", "Voucher", "Cartão no app", "Pix", "Picpay", "Whatsapp", "Pix no app"];

/** Urgência: normal ou corporativa (passageiro de empresa conveniada, voucher ou eTicket), em pendência ou não atendida. */
export const URGENCIAS: Record<string, string> = {
  "1": "Normal", "2": "Normal em pendência", "3": "Normal não atendida",
  "5": "Corporativas", "7": "Corporativas em pendência", "9": "Corporativas não atendidas",
};

/** "Corrida via": app, site (central, bot, totem) ou maçaneta. */
export const VIAS: Record<string, string> = { app: "App", site: "Site", macaneta: "Maçaneta" };

export type StatusFiltro = "distribuindo" | "a_caminho" | "andamento" | "espera" | "pendente" | "finalizada" | "cancelada" | "cancelada_pax" | "cancelada_mot" | "nao_atendida";
export const STATUS_FILTRO: Record<StatusFiltro, string> = {
  distribuindo: "Distribuindo", a_caminho: "A caminho", andamento: "Em andamento", espera: "Em espera (agendada)", pendente: "Pendente",
  finalizada: "Finalizada", cancelada: "Cancelada", cancelada_pax: "Cancelada (pelo passageiro)", cancelada_mot: "Cancelada (pelo motorista)", nao_atendida: "Não atendida",
};

export interface FiltroConsulta {
  rapido?: string; os?: string; osExterna?: string; centralChamada?: string; centralCorrida?: string; empresa?: string; categoria?: string;
  nomePax?: string; cpfPax?: string; telPax?: string; endereco?: string; motorista?: string;
  dataIni?: string; dataFim?: string; horaIni?: string; horaFim?: string;
  pagamento?: string; status?: string; urgencia?: string; via?: string; origem?: string; cashback?: boolean;
}

const soDig = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const isoDia = (d: Date) => d.toISOString().slice(0, 10);
const likeDe = (s: string) => `%${s.replace(/[\\%_]/g, "\\$&")}%`;
const J = (campo: string) => `json_extract(dados, '$.${campo}')`;
const ABERTAS = "('procurando','a_caminho','no_local','em_andamento')";

/** Monta o WHERE (sempre com a empresa) e os parâmetros. */
function montar(empresaId: string, f: FiltroConsulta, nomeCentral: string) {
  const w: string[] = ["empresa = ?"];
  const p: Array<string | number> = [empresaId];
  const agora = agoraBr();

  // Período: atalho de horas, hoje, datas (com horas) ou, sem nada, os últimos 30 dias.
  const r = f.rapido ? RAPIDOS[f.rapido] : undefined;
  let de: string, ate: string;
  if (typeof r === "number") { de = new Date(agora.getTime() - r * 3600_000).toISOString(); ate = agora.toISOString(); }
  else if (r === "hoje") { de = `${isoDia(agora)}T00:00:00.000Z`; ate = `${isoDia(agora)}T23:59:59.999Z`; }
  else if (f.dataIni || f.dataFim) {
    const di = f.dataIni || f.dataFim!, df = f.dataFim || f.dataIni!;
    de = `${di}T${f.horaIni || "00:00"}:00.000Z`; ate = `${df}T${f.horaFim || "23:59"}:59.999Z`;
  } else { de = `${isoDia(new Date(agora.getTime() - 29 * 86_400_000))}T00:00:00.000Z`; ate = `${isoDia(agora)}T23:59:59.999Z`; }
  w.push("solicitada_em >= ? AND solicitada_em <= ?"); p.push(de, ate);
  // Sem datas escolhidas, as horas viram uma janela do dia (ex.: de 08:00 às 12:00 em todos os dias do período).
  if ((f.horaIni || f.horaFim) && !(f.dataIni || f.dataFim) && typeof r !== "number") {
    w.push("substr(solicitada_em, 12, 5) >= ? AND substr(solicitada_em, 12, 5) <= ?"); p.push(f.horaIni || "00:00", f.horaFim || "23:59");
  }

  if (soDig(f.os)) { w.push("CAST(os_num AS TEXT) LIKE ? ESCAPE '\\'"); p.push(likeDe(soDig(f.os))); }
  if (f.osExterna) { w.push(`${J("osExterna")} = ?`); p.push(f.osExterna.trim()); }
  for (const [campo, v] of [["centralChamada", f.centralChamada], ["centralCorrida", f.centralCorrida]] as const) {
    if (!v) continue;
    if (normal(v) === normal(nomeCentral)) { w.push(`(coalesce(${J(campo)}, '') = '' OR norm(${J(campo)}) = ?)`); p.push(normal(v)); }
    else { w.push(`norm(${J(campo)}) = ?`); p.push(normal(v)); }
  }
  if (f.categoria) { w.push(`norm(${J("categoria")}) = ?`); p.push(normal(f.categoria)); }
  if (f.pagamento) { w.push(`norm(${J("pagamento")}) = ?`); p.push(normal(f.pagamento)); }
  if (f.nomePax) { w.push(`norm(${J("passageiro.nome")}) LIKE ? ESCAPE '\\'`); p.push(likeDe(normal(f.nomePax))); }
  if (soDig(f.telPax)) { w.push("dig(telefone) LIKE ? ESCAPE '\\'"); p.push(likeDe(soDig(f.telPax))); }
  if (f.endereco) { w.push(`(norm(${J("embarque.texto")}) LIKE ? ESCAPE '\\' OR norm(${J("destino.texto")}) LIKE ? ESCAPE '\\')`); p.push(likeDe(normal(f.endereco)), likeDe(normal(f.endereco))); }

  const clientes = listar(empresaId, cadastroPorId("clientes")!);
  if (soDig(f.cpfPax)) {
    const cpf = soDig(f.cpfPax);
    w.push("dig(telefone) IN (SELECT value FROM json_each(?))");
    p.push(JSON.stringify(clientes.filter((c) => soDig(c.cpf).includes(cpf)).map((c) => soDig(c.telefone)).filter(Boolean)));
  }
  if (f.empresa) {
    const alvo = normal(f.empresa);
    w.push("dig(telefone) IN (SELECT value FROM json_each(?))");
    p.push(JSON.stringify(clientes.filter((c) => normal(c.conveniada) === alvo).map((c) => soDig(c.telefone)).filter(Boolean)));
  }
  if (f.motorista) {
    const q = normal(f.motorista), qPlaca = q.replace(/[^a-z0-9]/g, "");
    const ids = listar(empresaId, cadastroPorId("motoristas")!)
      .filter((m) => normal(m.nome).includes(q) || (qPlaca.length >= 3 && normal(m.placa).replace(/[^a-z0-9]/g, "").includes(qPlaca))).map((m) => m.id);
    w.push(`(norm(${J("motorista")}) LIKE ? ESCAPE '\\' OR motorista_id IN (SELECT value FROM json_each(?)))`);
    p.push(likeDe(q), JSON.stringify(ids));
  }

  const s = f.status;
  const semAgenda = `coalesce(${J("agendadaPara")}, '') = ''`;
  if (s === "distribuindo") w.push(`status = 'procurando' AND ${semAgenda}`);
  else if (s === "espera") w.push(`status = 'procurando' AND NOT (${semAgenda})`);
  else if (s === "a_caminho") w.push("status IN ('a_caminho','no_local')");
  else if (s === "andamento") w.push("status = 'em_andamento'");
  else if (s === "finalizada" || s === "cancelada" || s === "nao_atendida") w.push(`status = '${s}'`);
  else if (s === "cancelada_mot") w.push(`status = 'cancelada' AND norm(${J("canceladaPor")}) LIKE '%motorist%'`);
  else if (s === "cancelada_pax") w.push(`status = 'cancelada' AND norm(${J("canceladaPor")}) NOT LIKE '%motorist%'`);
  else if (s === "pendente") w.push("0 = 1"); // as corridas próprias não têm o estado "pendente"

  if (f.urgencia && URGENCIAS[f.urgencia]) {
    const fones = clientes.filter((c) => normal(c.conveniada)).map((c) => soDig(c.telefone)).filter(Boolean);
    const corp = `(dig(telefone) IN (SELECT value FROM json_each(?)) OR norm(${J("pagamento")}) IN ('voucher','eticket'))`;
    const n = Number(f.urgencia), ehCorp = n >= 5, tipo = n === 1 || n === 5 ? "normal" : n === 2 || n === 7 ? "pendencia" : "nao_atendida";
    w.push(`${ehCorp ? "" : "NOT "}${corp}`); p.push(JSON.stringify(fones));
    w.push(tipo === "normal" ? "status NOT IN ('procurando','nao_atendida')" : tipo === "pendencia" ? "status = 'procurando'" : "status = 'nao_atendida'");
  }

  if (f.via === "app") w.push(`${J("canal")} = 'app'`);
  else if (f.via === "macaneta") w.push(`${J("canal")} = 'macaneta'`);
  else if (f.via === "site") w.push(`${J("canal")} IN ('painel','bot','totem')`);
  if (f.origem) {
    const chave = Object.entries(CANAL_TEXTO).find(([, t]) => normal(t) === normal(f.origem))?.[0];
    w.push(`${J("canal")} = ?`); p.push(chave ?? "?");
  }
  if (f.cashback) {
    w.push("id IN (SELECT corrida_id FROM carteira WHERE empresa = ? AND valor > 0 AND corrida_id IS NOT NULL AND norm(descricao) LIKE '%cashback%')");
    p.push(empresaId);
  }
  return { onde: w.join(" AND "), p };
}

export interface ResultadoConsulta {
  total: number; pagina: number; paginas: number; itens: CorridaPropria[];
  stats: { total: number; finalizadas: number; canceladas: number; andamento: number; andamentoMoto: number; andamentoCarro: number };
}

/** Uma página das corridas (mais recentes primeiro) e os totais do filtro. Lê só a página do banco. */
export function consultarProprias(empresaId: string, f: FiltroConsulta, pagina: number, porPagina: number, nomeCentral = ""): ResultadoConsulta {
  prepararProprias(empresaId);
  const db = banco();
  const { onde, p } = montar(empresaId, f, nomeCentral);
  const t = db.prepare(`SELECT count(*) AS total,
      coalesce(sum(status = 'finalizada'), 0) AS fin, coalesce(sum(status = 'cancelada'), 0) AS can,
      coalesce(sum(status IN ${ABERTAS}), 0) AS aberta,
      coalesce(sum(status IN ${ABERTAS} AND norm(${J("categoria")}) LIKE '%moto%'), 0) AS moto
    FROM corridas_proprias WHERE ${onde}`).get(...p) as Record<string, number>;
  const total = Number(t.total);
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const pg = Math.min(Math.max(1, Math.floor(pagina) || 1), paginas);
  const itens = db.prepare(`SELECT dados FROM corridas_proprias WHERE ${onde} ORDER BY solicitada_em DESC, os_num DESC LIMIT ? OFFSET ?`)
    .all(...p, porPagina, (pg - 1) * porPagina).map((l) => JSON.parse(String((l as { dados: string }).dados)) as CorridaPropria);
  return {
    total, pagina: pg, paginas, itens,
    stats: { total, finalizadas: Number(t.fin), canceladas: Number(t.can), andamento: Number(t.aberta), andamentoMoto: Number(t.moto), andamentoCarro: Number(t.aberta) - Number(t.moto) },
  };
}

/** Corridas do filtro em blocos (para exportar sem carregar tudo de uma vez). Máximo de `limite` corridas. */
export function* corridasDoFiltro(empresaId: string, f: FiltroConsulta, limite = 20_000, nomeCentral = ""): Generator<CorridaPropria[]> {
  prepararProprias(empresaId);
  const { onde, p } = montar(empresaId, f, nomeCentral);
  const stmt = banco().prepare(`SELECT dados FROM corridas_proprias WHERE ${onde} ORDER BY solicitada_em DESC, os_num DESC LIMIT ? OFFSET ?`);
  const bloco = 500;
  for (let off = 0; off < limite; off += bloco) {
    const linhas = stmt.all(...p, Math.min(bloco, limite - off), off).map((l) => JSON.parse(String((l as { dados: string }).dados)) as CorridaPropria);
    if (!linhas.length) return;
    yield linhas;
    if (linhas.length < bloco) return;
  }
}

/** Empresa (conveniada) de cada telefone de passageiro, para mostrar na coluna "Empresa". */
export function empresasPorTelefone(empresaId: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of listar(empresaId, cadastroPorId("clientes")!)) if (c.conveniada && soDig(c.telefone)) m.set(soDig(c.telefone), String(c.conveniada));
  return m;
}

export type LinhaConsulta = CorridaPainel & { osExterna: string; empresa: string; via: string };

export function paraLinha(c: CorridaPropria, empresas: Map<string, string>): LinhaConsulta {
  return { ...corridaPropriaParaPainel(c), osExterna: c.osExterna ?? "", empresa: empresas.get(soDig(c.passageiro.telefone)) ?? "", via: VIAS[c.canal === "app" ? "app" : c.canal === "macaneta" ? "macaneta" : "site"] };
}

// ------------------------------------------------------------------ exportação (CSV)

export { celulaCsv };

const dataHoraBr = (s: string | null | undefined) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)} ${s.slice(11, 19)}` : "");
export const COLUNAS_CSV: Array<[string, (c: LinhaConsulta) => unknown]> = [
  ["Nº OS", (c) => c.os], ["Nº externo da OS", (c) => c.osExterna], ["Solicitada em", (c) => dataHoraBr(c.solicitadaEm)],
  ["Partida", (c) => c.embarque], ["Destino", (c) => c.destino], ["Passageiro", (c) => c.passageiro], ["Telefone do passageiro", (c) => c.telefonePassageiro],
  ["Motorista", (c) => c.motorista], ["Empresa", (c) => c.empresa], ["Categoria", (c) => c.categoria], ["Forma de pagamento", (c) => c.pagamento],
  ["Corrida via", (c) => c.via], ["Status", (c) => c.statusTexto], ["Valor", (c) => (c.valor == null ? "" : c.valor.toFixed(2).replace(".", ","))],
  ["Cancelada por", (c) => c.canceladaPor], ["Motivo do cancelamento", (c) => c.motivoCancelamento],
];

/** CSV com ";" (abre direto no Excel em português), com BOM. */
export function csvDeCorridas(empresaId: string, f: FiltroConsulta, nomeCentral = ""): string {
  const empresas = empresasPorTelefone(empresaId);
  const linhas = [COLUNAS_CSV.map(([t]) => celulaCsv(t)).join(";")];
  for (const bloco of corridasDoFiltro(empresaId, f, 20_000, nomeCentral)) {
    for (const c of bloco) { const l = paraLinha(c, empresas); linhas.push(COLUNAS_CSV.map(([, fn]) => celulaCsv(fn(l))).join(";")); }
  }
  return "﻿" + linhas.join("\n");
}
