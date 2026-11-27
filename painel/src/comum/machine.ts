// Vocabulário e regras do comportamento público da Machine (API v2 de corridas), em funções puras.
// Só nomes de campo e comportamento: nada de texto copiado. Usado pelo servidor (webhooks de saída, detalhe da corrida,
// avisos da central) e pelos testes (painel/test/conferencia-machine.test.ts).

import type { CorridaPropria } from "../corridas/index.ts";

// ------------------------------------------------------------------ status e fase

/** Código de uma letra do status da corrida na Machine. */
export type CodigoStatus = "D" | "T" | "G" | "P" | "A" | "S" | "E" | "F" | "C" | "N" | "R";
export const STATUS_MACHINE: Record<CodigoStatus, string> = {
  D: "Distribuindo", T: "Redistribuindo", G: "Aguardando aceite", P: "Pendente", A: "Aceita", S: "Em espera", E: "Em andamento",
  F: "Finalizada", C: "Cancelada", N: "Não atendida", R: "Aguardando pagamento",
};
export type Fase = "a_caminho" | "proximo" | "no_local" | "espera_prolongada";
/** Passou deste tempo parado no local de embarque: fase "espera prolongada". */
export const ESPERA_PROLONGADA_MIN = 5;
/** Motorista a menos disso do embarque: fase "próximo". */
export const PROXIMO_KM = 0.5;
/** Folga (minutos) sobre o tempo estimado no aceite antes de avisar "motorista atrasado". */
export const FOLGA_ATRASO_MIN = 3;
/** Sem aceite depois de tanto tempo (segundos): ocorrência NA, uma vez por corrida. */
export const SEM_ACEITE_S = 60;
/** Nota do motorista ao passageiro que dispara o aviso à central (1 a 3). */
export const NOTA_BAIXA_ATE = 3;

/** Marcas de ocorrência guardadas na corrida (cada uma só uma vez). */
export interface Marcas { semAceite?: string; atraso?: string; proximo?: string; esperaProlongada?: string }
type Parte = Pick<CorridaPropria, "status" | "pendenteEm" | "marcas" | "agendadaPara">;

/** Status da Machine. `ofertaAberta`: há chamada tocando para algum motorista (G). `redistribuindo`: já passou por um motorista que saiu (T). */
export function codigoDoStatus(c: Parte, o: { ofertaAberta?: boolean; redistribuindo?: boolean } = {}): CodigoStatus {
  switch (c.status) {
    case "procurando": return c.pendenteEm ? "P" : o.ofertaAberta ? "G" : o.redistribuindo ? "T" : "D";
    case "a_caminho": case "no_local": return "A";
    case "em_andamento": return "E";
    case "finalizada": return "F";
    case "cancelada": return "C";
    default: return "N";
  }
}
/** Fase da corrida aceita (status A): a caminho, próximo, no local ou espera prolongada. */
export function faseDaCorrida(c: Parte): Fase | null {
  if (c.status === "a_caminho") return c.marcas?.proximo ? "proximo" : "a_caminho";
  if (c.status === "no_local") return c.marcas?.esperaProlongada ? "espera_prolongada" : "no_local";
  return null;
}

// ------------------------------------------------------------------ cancelamento

/** Motivos do passageiro (id da Machine → texto nosso). */
export const MOTIVOS_PASSAGEIRO: Array<{ id: number; texto: string }> = [
  { id: 1, texto: "Tempo de espera" }, { id: 2, texto: "Mudança de planos" }, { id: 6, texto: "Outros" }, { id: 12, texto: "Condutor não está vindo" },
  { id: 18, texto: "Não foi possível pagar" }, { id: 32, texto: "Demorando para encontrar condutor" }, { id: 33, texto: "Mudei de ideia" },
  { id: 34, texto: "Preciso alterar o endereço" }, { id: 35, texto: "Achei outra opção" }, { id: 36, texto: "Não consegui pagar" },
  { id: 37, texto: "Condutor demorando" }, { id: 38, texto: "Condutor parado" }, { id: 39, texto: "Condutor pediu para cancelar" },
  { id: 40, texto: "Não consegui falar com o condutor" }, { id: 41, texto: "Outro" },
];
export const motivoPorId = (id: unknown) => MOTIVOS_PASSAGEIRO.find((m) => m.id === Number(id));

/** Quem cancelou, no código da Machine: P passageiro, T central (telefonista/sistema), C condutor. */
export const canceladoPorCodigo = (quem: string): "P" | "T" | "C" | "" => (quem === "Passageiro" ? "P" : quem === "Motorista" ? "C" : quem === "Central" || quem === "Sistema" ? "T" : "");

/** Erros de cancelamento da Machine: 151 corrida já finalizada, cancelada ou não atendida; 152 recusado pela regra da central. */
export class ErroCorrida extends Error {
  constructor(public codigo: 151 | 152, mensagem: string) { super(mensagem); }
}

// ------------------------------------------------------------------ formas de pagamento

/** As doze formas da Machine e o nome que usamos para cada uma (vazio: ainda não existe no nosso catálogo). */
export const FORMAS_PAGAMENTO: Array<{ codigo: string; machine: string; nosso: string }> = [
  { codigo: "D", machine: "Dinheiro", nosso: "Dinheiro" }, { codigo: "B", machine: "Débito", nosso: "Débito" }, { codigo: "C", machine: "Crédito", nosso: "Crédito" },
  { codigo: "T", machine: "eTicket", nosso: "" }, { codigo: "V", machine: "Voucher", nosso: "" }, { codigo: "X", machine: "Pix", nosso: "Pix" },
  { codigo: "P", machine: "PicPay", nosso: "" }, { codigo: "H", machine: "WhatsApp", nosso: "" }, { codigo: "A", machine: "Cartão via app", nosso: "Cartão no App" },
  { codigo: "F", machine: "Faturado", nosso: "Faturado" }, { codigo: "I", machine: "Pix via app", nosso: "" }, { codigo: "R", machine: "Carteira de créditos", nosso: "Saldo da Carteira" },
];
const sa = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
/** Código da Machine para a forma de pagamento da corrida ("" se não reconhecer). Cartão na maquininha vale como crédito. */
export function codigoDaForma(pagamento: string | undefined): string {
  const n = sa(pagamento ?? "");
  if (!n) return "";
  if (/maquininha/.test(n)) return "C";
  const f = FORMAS_PAGAMENTO.find((x) => x.nosso && sa(x.nosso) === n) ?? FORMAS_PAGAMENTO.find((x) => sa(x.machine) === n);
  return f?.codigo ?? "";
}

// ------------------------------------------------------------------ ocorrências (mudança entre duas fotos da corrida)

export type CodigoOcorrencia = "CF" | "FR" | "NA" | "DL" | "LR" | "RR";
export interface EventoDaMudanca {
  tipo: "Status" | "Ocorrencia";
  codigo: string;
  /** Tipo do evento na linha do tempo da OS (null: só vai para o webhook). */
  historico: "sem_aceite_60s" | "motorista_atrasado" | "nota_baixa" | "taxa_cancelamento" | "tarifa_recalculada" | "proximo" | "espera_prolongada" | null;
  descricao: string;
  dados: Record<string, unknown>;
}
const brl = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));

/**
 * Compara a corrida antes e depois de uma mudança e diz o que a Machine avisaria: o novo status (com fase, quem cancelou e se vai reabrir)
 * e as ocorrências que não mudam o status (taxa de cancelamento, tarifa recalculada, sem aceite, atraso, nota baixa).
 */
export function eventosDaMudanca(antes: CorridaPropria, c: CorridaPropria): EventoDaMudanca[] {
  const base = { corrida_id: c.id, os: c.os };
  const l: EventoDaMudanca[] = [];
  const motoristaVoltou = (antes.status === "a_caminho" || antes.status === "no_local") && c.status === "procurando" && (c.cancelamentos?.length ?? 0) > (antes.cancelamentos?.length ?? 0);
  if (motoristaVoltou) {
    // O motorista cancelou antes de começar e a mesma corrida volta a procurar: a Machine avisa C com will_reopen verdadeiro.
    const ultimo = c.cancelamentos?.at(-1);
    l.push({ tipo: "Status", codigo: "C", historico: null, descricao: "", dados: { ...base, status: "C", status_texto: STATUS_MACHINE.C, cancelado_por: "C", motivo_id: ultimo?.motivoId ?? null, motivo: ultimo?.motivo ?? "", will_reopen: true } });
  }
  const mudouFase = faseDaCorrida(antes) !== faseDaCorrida(c);
  if (antes.status !== c.status || mudouFase || (antes.pendenteEm ?? null) !== (c.pendenteEm ?? null)) {
    const cod = codigoDoStatus(c, { redistribuindo: motoristaVoltou });
    const d: Record<string, unknown> = { ...base, status: cod, status_texto: STATUS_MACHINE[cod], fase: faseDaCorrida(c), motorista_id: c.motoristaId, data_hora: c.historico.at(-1)?.em ?? null };
    if (c.pendenteEm) d.pending_at = c.pendenteEm;
    if (cod === "C") Object.assign(d, { cancelado_por: canceladoPorCodigo(c.canceladaPor), motivo_id: c.motivoId ?? null, motivo: c.motivoCancelamento, will_reopen: false });
    l.push({ tipo: "Status", codigo: cod, historico: null, descricao: "", dados: d });
  }
  if (!antes.marcas?.proximo && c.marcas?.proximo) l.push({ tipo: "Ocorrencia", codigo: "PR", historico: "proximo", descricao: "Motorista perto do embarque", dados: { ...base, ocorrencia: "PR", data_hora_proximo: c.marcas.proximo } });
  if (!antes.marcas?.esperaProlongada && c.marcas?.esperaProlongada) l.push({ tipo: "Ocorrencia", codigo: "EP", historico: "espera_prolongada", descricao: "Motorista esperando há bastante tempo no embarque", dados: { ...base, ocorrencia: "EP", data_hora_espera_prolongada: c.marcas.esperaProlongada } });
  if (!antes.marcas?.semAceite && c.marcas?.semAceite) l.push({ tipo: "Ocorrencia", codigo: "NA", historico: "sem_aceite_60s", descricao: `Passaram ${SEM_ACEITE_S} s e ninguém aceitou a corrida`, dados: { ...base, ocorrencia: "NA", segundos: SEM_ACEITE_S } });
  if (!antes.marcas?.atraso && c.marcas?.atraso) l.push({ tipo: "Ocorrencia", codigo: "DL", historico: "motorista_atrasado", descricao: "Motorista atrasado para chegar ao embarque", dados: { ...base, ocorrencia: "DL", motorista_id: c.motoristaId, eta_segundos: c.aceite?.etaSegundos ?? null } });
  const nota = c.avaliacaoPassageiro?.nota;
  if (nota != null && nota <= NOTA_BAIXA_ATE && !antes.avaliacaoPassageiro) l.push({ tipo: "Ocorrencia", codigo: "LR", historico: "nota_baixa", descricao: `Motorista deu nota ${nota} ao passageiro: aviso à central`, dados: { ...base, ocorrencia: "LR", nota, motorista_id: c.motoristaId } });
  if (c.status === "cancelada" && c.taxaCancelamento && !antes.taxaCancelamento) {
    l.push({ tipo: "Ocorrencia", codigo: "CF", historico: "taxa_cancelamento", descricao: `Taxa de cancelamento de ${brl(c.taxaCancelamento)} cobrada do passageiro`, dados: { ...base, ocorrencia: "CF", amount: c.taxaCancelamento, payment_status: "PAID" } });
  }
  const aberta = c.status === "procurando" || c.status === "a_caminho" || c.status === "no_local" || c.status === "em_andamento";
  if (aberta && c.status === antes.status && antes.estimativa.valor != null && c.estimativa.valor != null && antes.estimativa.valor !== c.estimativa.valor) {
    l.push({ tipo: "Ocorrencia", codigo: "FR", historico: "tarifa_recalculada", descricao: `Tarifa recalculada de ${brl(antes.estimativa.valor)} para ${brl(c.estimativa.valor)}`, dados: { ...base, ocorrencia: "FR", previous_amount: antes.estimativa.valor, new_amount: c.estimativa.valor, reason: c.macaneta?.modo === "taximetro" ? "TAXIMETER" : "ROUTE_CHANGE" } });
  }
  return l;
}

// ------------------------------------------------------------------ detalhe da corrida no formato da Machine

/** Datas do painel são horário de Brasília gravado como UTC; no detalhe saem com o fuso, como instante real. */
const iso = (s: string | null | undefined) => (s ? new Date(Date.parse(s) + 3 * 3600_000).toISOString() : null);
const noHistorico = (c: CorridaPropria, st: CorridaPropria["status"]) => c.historico.find((h) => h.status === st)?.em ?? null;

/** Detalhe da corrida com os mesmos nomes de campo da API de detalhes da Machine (o que existe aqui; o que não existe vai nulo). */
export function detalheDaCorrida(c: CorridaPropria, o: { ofertaAberta?: boolean } = {}) {
  const cod = codigoDoStatus(c, o);
  return {
    id: c.id, os: c.os, status: cod, status_texto: STATUS_MACHINE[cod], fase: faseDaCorrida(c),
    forma_pagamento: codigoDaForma(c.pagamento) || null, forma_pagamento_texto: c.pagamento,
    programada: !!c.agendadaPara, agendada_para: iso(c.agendadaPara ?? null),
    progress: {
      pending_at: iso(c.pendenteEm), accepted_at: iso(c.aceite?.em ?? c.atribuidaEm ?? null),
      accept_lat: c.aceite?.lat ?? null, accept_lng: c.aceite?.lng ?? null, accept_eta_seconds: c.aceite?.etaSegundos ?? null, accept_eta_km: c.aceite?.km ?? null,
      estimated_distance_km: c.estimativa.distanciaKm, estimated_duration: c.estimativa.minutos != null ? c.estimativa.minutos * 60 : null, estimated_value: c.estimativa.valor,
      pickup_arrival: iso(noHistorico(c, "no_local")), arrival_at_surroundings: iso(c.marcas?.proximo ?? null), prolonged_wait_at: iso(c.marcas?.esperaProlongada ?? null),
      start_trip: iso(c.iniciadaEm),
    },
    finished: c.status === "finalizada" ? {
      final_value: c.valor, coupon_value: c.desconto ?? 0, finalized_distance_km: c.macaneta ? c.macaneta.km : c.estimativa.distanciaKm, traveled_distance_km: c.macaneta ? c.macaneta.km : null, finished_at: iso(c.finalizadaEm),
    } : null,
    cancellation: [
      ...(c.cancelamentos ?? []).map((x) => ({ cancelled_at: iso(x.em), reason: x.motivo, reason_id: x.motivoId, by: x.por, will_reopen: true })),
      ...(c.status === "cancelada" ? [{ cancelled_at: iso(c.historico.at(-1)?.em ?? null), reason: c.motivoCancelamento, reason_id: c.motivoId ?? null, by: canceladoPorCodigo(c.canceladaPor), will_reopen: false }] : []),
    ],
    avaliacao_condutor: c.avaliacao != null ? { nota: c.avaliacao, comentario: c.comentario ?? "" } : null,
    avaliacao_passageiro: c.avaliacaoPassageiro ?? null,
    taxa_cancelamento: c.taxaCancelamento ?? null,
  };
}
