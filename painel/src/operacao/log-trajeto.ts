// "Detalhes da corrida", "Histórico da OS" (log da solicitação) e "Trajeto da OS" do painel, com os dados reais da corrida:
// eventos gravados pelo motor (src/corridas/registro.ts), ondas de envio do despacho e os pontos de GPS do app do motorista.

import { cadastroPorId } from "../comum/cadastros.ts";
import { listar } from "../cadastros/armazem.ts";
import { resumoDeGanho } from "../apps/despacho.ts";
import { CANAL_TEXTO, STATUS_TEXTO, type CorridaPropria } from "../corridas/index.ts";
import { distanciaKm, eventosDaCorrida, medirTrajeto, pontosDaCorrida, type EventoCorrida, type PontoTrajeto } from "../corridas/registro.ts";
import { rota } from "../enderecos/index.ts";
import * as D from "../servidor/dados.ts";
import { arred } from "../servidor/util.ts";
import { ondasDaCorrida, type Onda } from "./ondas.ts";
import { VIAS } from "./consulta.ts";

const ABERTA_ATIVA = new Set(["a_caminho", "no_local", "em_andamento"]);
const VELOCIDADE_URBANA_KMH = 25;
const minutosPorKm = (km: number | null) => (km == null ? null : Math.max(1, Math.round((km / VELOCIDADE_URBANA_KMH) * 60)));

// ====================================================================== log da solicitação

/** Corridas antigas (de antes do registro de eventos) ganham uma linha do tempo montada do histórico e das ondas de envio. */
function eventosDeCorridaAntiga(c: CorridaPropria, ondas: Onda[]): EventoCorrida[] {
  let n = 0;
  const ev = (em: string, tipo: EventoCorrida["tipo"], descricao: string, usuario = "", canal = ""): EventoCorrida => ({ id: --n, em, tipo, descricao, usuario, canal, dados: null });
  const l: EventoCorrida[] = [ev(c.solicitadaEm, "criada", `Corrida criada (${CANAL_TEXTO[c.canal] ?? c.canal}): ${c.embarque.texto}${c.destino ? ` → ${c.destino.texto}` : ""}`, "", CANAL_TEXTO[c.canal] ?? c.canal)];
  for (const o of ondas) {
    l.push(ev(o.oferecidaEm, "oferta_enviada", `Chamada enviada para ${o.nome || "motorista"}${o.distanciaKm != null ? ` (a ${String(o.distanciaKm).replace(".", ",")} km do embarque)` : ""}`, "sistema", "Despacho automático"));
    if (o.fimEm && o.fim !== "oferecida") {
      const t = { aceitou: ["oferta_aceita", "aceitou a chamada"], recusou: ["oferta_recusada", "recusou a chamada"], expirou: ["oferta_expirada", "deixou a chamada passar"], saiu: ["oferta_saiu", "ficou offline"], perdeu: ["oferta_perdida", "chamada encerrada (outro aceitou)"] }[o.fim] as [EventoCorrida["tipo"], string];
      l.push(ev(o.fimEm, t[0], `${o.nome || "Motorista"} ${t[1]}`, o.nome, "App do motorista"));
    }
  }
  let anterior = "procurando";
  for (const h of c.historico.slice(1)) {
    const nota = h.nota ?? "";
    if (nota.startsWith("Motorista: ")) l.push(ev(h.em, "atribuida", `Corrida atribuída ao motorista ${nota.slice(11)}`, h.por));
    else if (nota.startsWith("Edição manual")) l.push(ev(h.em, "alteracao", `OS alterada pela central (${nota.slice(14)})`, h.por, "Painel"));
    if (h.status !== anterior) {
      const t: Partial<Record<string, [EventoCorrida["tipo"], string]>> = { a_caminho: ["a_caminho", "Motorista a caminho do embarque"], no_local: ["chegou", "Motorista chegou ao local de embarque"], em_andamento: ["iniciou", "Corrida iniciada"], finalizada: ["finalizou", "Corrida finalizada"], cancelada: ["cancelou", `Corrida cancelada${c.canceladaPor ? ` por ${c.canceladaPor}` : ""}`], nao_atendida: ["nao_atendida", "Corrida não atendida"], procurando: ["voltou_a_procurar", "Corrida voltou a procurar motorista"] };
      const x = t[h.status];
      if (x) l.push(ev(h.em, x[0], x[1], h.por, h.por === "app do motorista" ? "App do motorista" : "Painel"));
      anterior = h.status;
    }
  }
  return l.sort((a, b) => a.em.localeCompare(b.em) || b.id - a.id);
}

export const ROTULO_TIPO: Record<string, string> = {
  criada: "Criada", despacho_consulta: "Despacho", despacho_encontrados: "Despacho", sem_motorista: "Sem motorista", oferta_enviada: "Chamada enviada", oferta_aceita: "Chamada aceita",
  oferta_recusada: "Chamada recusada", oferta_expirada: "Chamada sem resposta", oferta_perdida: "Chamada encerrada", oferta_saiu: "Motorista offline", atribuida: "Motorista atribuído",
  a_caminho: "A caminho", chegou: "Chegou ao embarque", iniciou: "Corrida iniciada", finalizou: "Finalizada", cancelou: "Cancelada", voltou_a_procurar: "Voltou a procurar",
  nao_atendida: "Não atendida", mudanca_valor: "Mudança de valor", mudanca_pagamento: "Mudança de pagamento", alteracao: "Alteração da OS", avaliacao: "Avaliação", avaliacao_passageiro: "Avaliação do passageiro", outro: "Outro",
  sem_aceite_60s: "Sem aceite em 60 s", motorista_atrasado: "Motorista atrasado", nota_baixa: "Nota baixa ao passageiro", taxa_cancelamento: "Taxa de cancelamento", tarifa_recalculada: "Tarifa recalculada", proximo: "Motorista próximo", espera_prolongada: "Espera prolongada",
};

/** Histórico da OS: linhas do tempo (hora, tipo, descrição, usuário, canal) e, a cada rodada do despacho, a tabela de motoristas consultados. */
export async function logDaOs(empresaId: string, c: CorridaPropria) {
  const ondas = ondasDaCorrida(empresaId, c.id);
  const gravados = eventosDaCorrida(empresaId, c.id);
  const antiga = !gravados.length;
  // Na mesma hora, a ordem lógica: criada, consulta do despacho, chamadas, aceite do motorista, atribuição e o resto.
  const ORDEM: Partial<Record<EventoCorrida["tipo"], number>> = { criada: 0, despacho_consulta: 1, despacho_encontrados: 2, sem_motorista: 2, oferta_enviada: 3, oferta_recusada: 4, oferta_expirada: 4, oferta_saiu: 4, oferta_aceita: 5, oferta_perdida: 6, atribuida: 7, a_caminho: 8 };
  const doSegundo = (e: EventoCorrida) => e.em.slice(0, 19);
  const eventos = [...(antiga ? eventosDeCorridaAntiga(c, ondas) : gravados)].sort((a, b) => doSegundo(a).localeCompare(doSegundo(b)) || (ORDEM[a.tipo] ?? 9) - (ORDEM[b.tipo] ?? 9) || a.em.localeCompare(b.em) || a.id - b.id);
  const rodadas = new Set(eventos.filter((e) => e.tipo === "despacho_encontrados").map((e) => e.id));
  const vencedor = c.motoristaId;
  const linhas = await Promise.all(eventos.map(async (e) => {
    const base = { id: e.id, em: e.em, tipo: e.tipo, rotulo: ROTULO_TIPO[e.tipo] ?? e.tipo, descricao: e.descricao, usuario: e.usuario, canal: e.canal };
    if (!rodadas.has(e.id) || !e.dados) return { ...base, tabela: null };
    const d = e.dados as { embarque?: { lat: number | null; lng: number | null }; candidatos?: Array<{ id: string; nome: string; vtr: string; kmReta: number | null; favorito: boolean; recebeu: boolean; lat: number | null; lng: number | null }> };
    const emb = d.embarque && d.embarque.lat != null && d.embarque.lng != null ? { lat: d.embarque.lat, lng: d.embarque.lng } : null;
    const tabela = await Promise.all((d.candidatos ?? []).slice(0, 20).map(async (x) => {
      const doMot = ondas.filter((o) => o.motoristaId === x.id && o.oferecidaEm >= e.em);
      let kmRota: number | null = null, minutos: number | null = null;
      if (emb && x.lat != null && x.lng != null) { try { const r = await rota({ lat: x.lat, lng: x.lng }, emb); kmRota = r.distanciaKm; minutos = r.minutos; } catch { /* sem rota */ } }
      return {
        vtr: x.vtr, nome: x.nome, recebeu: x.recebeu, rejeitou: doMot.some((o) => o.fim === "recusou"), candidatou: doMot.some((o) => o.fim === "aceitou"),
        priorizadoPorDestino: false, kmReta: x.kmReta, kmRota, minutos, vencedor: !!vencedor && x.id === vencedor,
      };
    }));
    return { ...base, tabela };
  }));
  return { os: c.os, corridaId: c.id, antiga, linhas };
}

// ====================================================================== trajeto

const doMinuto = (a: string | null, b: string | null) => (a && b ? Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 60_000)) : null);

/** Pontos de parada: o motorista ficou menos de 30 m do mesmo lugar por 90 s ou mais. */
function paradasNoTrajeto(pontos: PontoTrajeto[]) {
  const r: Array<{ lat: number; lng: number; desde: string; ate: string; minutos: number; fase: string }> = [];
  let ini = 0;
  for (let i = 1; i <= pontos.length; i++) {
    const fora = i === pontos.length || pontos[i].fase !== pontos[ini].fase || distanciaKm(pontos[ini], pontos[i]) * 1000 > 30;
    if (!fora) continue;
    const seg = Date.parse(pontos[i - 1].em) - Date.parse(pontos[ini].em);
    if (i - 1 > ini && seg >= 90_000) r.push({ lat: pontos[ini].lat, lng: pontos[ini].lng, desde: pontos[ini].em, ate: pontos[i - 1].em, minutos: Math.round(seg / 60_000), fase: pontos[ini].fase });
    ini = i;
  }
  return r.slice(0, 20);
}

export function trajetoDaOs(empresaId: string, c: CorridaPropria) {
  const pontos = pontosDaCorrida(empresaId, c.id);
  const m = medirTrajeto(pontos);
  const aceite = c.atribuidaEm ?? c.historico.find((h) => h.status === "a_caminho")?.em ?? null;
  const chegada = c.historico.find((h) => h.status === "no_local")?.em ?? null;
  const fim = c.finalizadaEm ?? (c.status === "cancelada" ? c.historico[c.historico.length - 1]?.em ?? null : null);
  const kmTotal = m.embarque.km != null || m.viagem.km != null ? arred((m.embarque.km ?? 0) + (m.viagem.km ?? 0), 3) : null;
  return {
    os: c.os, corridaId: c.id, status: c.status, statusTexto: STATUS_TEXTO[c.status], aberta: ABERTA_ATIVA.has(c.status) || c.status === "procurando",
    embarque: c.embarque, destino: c.destino ?? null, paradas: c.paradas ?? [], motorista: c.motorista || null,
    pontos: pontos.map((p) => ({ lat: p.lat, lng: p.lng, em: p.em, fase: p.fase })),
    totalPontos: pontos.length,
    etapas: {
      aceite: { em: aceite, distanciaKm: m.embarque.km, minutos: m.embarque.minutos ?? doMinuto(aceite, c.iniciadaEm) },
      inicio: { em: c.iniciadaEm, distanciaKm: m.viagem.km, minutos: m.viagem.minutos ?? doMinuto(c.iniciadaEm, c.finalizadaEm) },
      fim: { em: fim, chegadaEmbarque: chegada },
    },
    total: { distanciaKm: kmTotal, minutos: doMinuto(aceite, fim), distanciaPrevistaKm: c.estimativa.distanciaKm, minutosPrevistos: c.estimativa.minutos },
    paradasDetectadas: paradasNoTrajeto(pontos),
    semGps: !pontos.length,
  };
}

// ====================================================================== detalhes da corrida

const empresaNome = (empresaId: string) => { try { return String(D.marca(empresaId).produto ?? "") || "Central"; } catch { return "Central"; } };

/** Tudo o que a janela "Detalhes da corrida" mostra, com os dados reais (previsto x realizado). */
export function detalhesDaCorrida(empresaId: string, c: CorridaPropria) {
  const nomeCentral = empresaNome(empresaId);
  const cli = listar(empresaId, cadastroPorId("clientes")!).find((x) => x.telefone === c.passageiro.telefone);
  const ondas = ondasDaCorrida(empresaId, c.id);
  const ganhadora = [...ondas].reverse().find((o) => o.fim === "aceitou" && o.motoristaId === c.motoristaId) ?? [...ondas].reverse().find((o) => o.motoristaId === c.motoristaId);
  const aceiteEm = c.atribuidaEm ?? c.historico.find((h) => h.status === "a_caminho")?.em ?? null;
  const chegadaEm = c.historico.find((h) => h.status === "no_local")?.em ?? null;
  const pontos = pontosDaCorrida(empresaId, c.id);
  const t = medirTrajeto(pontos);
  const embLat = c.embarque.lat, embLng = c.embarque.lng;
  const gpsChegada = embLat != null && embLng != null ? pontos.find((p) => p.fase === "embarque" && distanciaKm(p, { lat: embLat, lng: embLng }) * 1000 <= 120)?.em ?? null : null;
  const ultimo = pontos[pontos.length - 1];
  const dest = c.destino;
  const fimPerto = ultimo && dest?.lat != null && dest?.lng != null && distanciaKm(ultimo, { lat: dest.lat, lng: dest.lng }) * 1000 <= 400;
  const base = c.valorOferecido ?? c.estimativa.valor;
  const desconto = c.desconto ?? 0;
  const eventos = eventosDaCorrida(empresaId, c.id);
  const primeiraRodada = eventos.find((e) => e.tipo === "despacho_encontrados")?.dados as { metodo?: string } | null | undefined;
  const metodo = primeiraRodada?.metodo;
  const tipoDespacho = metodo === "fila_virtual" ? "Fila virtual" : metodo === "primeiro_aceitar" ? "Primeiro a aceitar" : metodo === "mais_proximo" ? "Proximidade" : c.motoristaId || ondas.length ? "Proximidade" : "---";
  const aceitaram = ondas.filter((o) => o.fim === "aceitou").length;
  const ganho = c.status === "finalizada" && c.motoristaId ? (() => { try { return resumoDeGanho(empresaId, c.motoristaId!, c); } catch { return null; } })() : null;
  const reais = (v: number | null | undefined) => (v == null ? null : v);
  return {
    chamada: {
      solicitadaEm: c.solicitadaEm, bandeira: c.centralChamada || nomeCentral, categoria: c.categoria, tarifa: "Tarifa padrão",
      passageiro: c.passageiro.nome, telefone: c.telefoneContato || c.passageiro.telefone, telefoneCadastro: String(cli?.telefone ?? c.passageiro.telefone), passageiroCadastroId: cli?.id ?? null,
      embarque: c.embarque.texto, destino: c.destino?.texto ?? "", pagamento: c.pagamento,
      motoristaEspecificado: false, previsaoKm: c.estimativa.distanciaKm, previsaoMinutos: c.estimativa.minutos,
      valorPrevisto: reais(base), descontoPct: base && desconto ? arred((desconto / base) * 100, 2) : null, valorPrevistoComDesconto: base != null ? arred(Math.max(0, base - desconto)) : null,
    },
    aceite: c.motoristaId ? {
      motorista: c.motorista, motoristaId: c.motoristaId, telefone: c.telefoneMotorista, aceiteEm, bandeira: c.centralCorrida || nomeCentral,
      previsaoKm: ganhadora?.distanciaKm ?? null, previsaoMinutos: minutosPorKm(ganhadora?.distanciaKm ?? null),
    } : null,
    inicio: {
      chegadaMotoristaEm: chegadaEm, chegadaGpsEm: gpsChegada, inicioEm: c.iniciadaEm,
      realizadoKm: t.embarque.km, realizadoMinutos: t.embarque.minutos ?? (aceiteEm && chegadaEm ? doMinuto(aceiteEm, chegadaEm) : null),
    },
    encerramento: {
      encerramentoEm: c.status === "finalizada" ? c.finalizadaEm : null,
      local: c.status !== "finalizada" ? null : fimPerto ? dest!.texto : ultimo ? `${ultimo.lat.toFixed(5)}, ${ultimo.lng.toFixed(5)}` : dest?.texto ?? null,
      realizadoKm: t.viagem.km, realizadoMinutos: t.viagem.minutos ?? (c.iniciadaEm && c.finalizadaEm ? doMinuto(c.iniciadaEm, c.finalizadaEm) : null),
      valorSemDesconto: c.status === "finalizada" && c.valor != null ? arred(c.valor + desconto) : null,
      descontoPct: c.status === "finalizada" && c.valor != null && c.valor + desconto > 0 && desconto ? arred((desconto / (c.valor + desconto)) * 100, 0) : null,
      desconto: c.status === "finalizada" && desconto ? desconto : null,
      valorFinal: c.status === "finalizada" ? c.valor : null,
      ganhosMotorista: ganho?.valorLiquido ?? null, taxaServico: ganho?.taxaCentral ?? null,
    },
    controle: {
      via: VIAS[c.canal === "app" ? "app" : c.canal === "macaneta" ? "macaneta" : "site"], sistema: c.sistema ?? "---", tipoDespacho,
      eleicao: aceitaram > 1,
    },
  };
}
