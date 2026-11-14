// Operação das corridas pela central (grupo Corridas do painel): histórico com filtros avançados, detalhe da corrida
// (repasses, financeiro, auditoria), rastreio, recibo, monitoramento, mapa em tempo real, ocorrências, programadas,
// pendências de pagamento e objetos perdidos. Tudo por empresa (a empresa vem do login).

import { cadastroPorId } from "../comum/cadastros.ts";
import { GRUPO_TEXTO, type CorridaPainel, type Filtro } from "../comum/corrida.ts";
import { sanearMarca } from "../comum/marca.ts";
import { listar, atualizar, remover } from "../cadastros/armazem.ts";
import { alertas, estaOnline, motoristasOnline, posicaoDoMotorista } from "../apps/despacho.ts";
import { mensagens } from "../apps/chat.ts";
import { CANAL_TEXTO, corridaPropriaParaPainel, listarProprias, STATUS_TEXTO, type CorridaPropria, type StatusProprio } from "../corridas/index.ts";
import { linhaReta } from "../enderecos/index.ts";
import * as D from "../servidor/dados.ts";
import { buscarCorridas } from "../servidor/fontes/index.ts";
import { agoraBr, arred, normal } from "../servidor/util.ts";
import { gravarOperacao, lerOperacao } from "./armazem.ts";
import { ondasDaCorrida, type Onda } from "./ondas.ts";

const ABERTA = new Set<StatusProprio>(["procurando", "a_caminho", "no_local", "em_andamento"]);
const COM_MOTORISTA = new Set<StatusProprio>(["a_caminho", "no_local", "em_andamento"]);
const soDigitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const hojeBr = () => agoraBr().toISOString().slice(0, 10);
const diaBr = (dias: number) => new Date(agoraBr().getTime() + dias * 86_400_000).toISOString().slice(0, 10);
const motoristasCad = (empresaId: string) => listar(empresaId, cadastroPorId("motoristas")!);
const clientesCad = (empresaId: string) => listar(empresaId, cadastroPorId("clientes")!);
const paginar = <T>(l: T[], pagina: number, porPagina: number) => {
  const paginas = Math.max(1, Math.ceil(l.length / porPagina));
  const p = Math.min(Math.max(1, Math.floor(pagina) || 1), paginas);
  return { pagina: p, paginas, total: l.length, itens: l.slice((p - 1) * porPagina, p * porPagina) };
};

/** Corrida própria pelo id interno, pelo id do painel ("propria:<id>") ou pela OS. */
export function acharPropria(empresaId: string, id: string): CorridaPropria {
  const limpo = String(id ?? "").replace(/^propria:/, "");
  const c = listarProprias(empresaId).find((x) => x.id === limpo || x.os === limpo);
  if (!c) throw new Error("Corrida não encontrada.");
  return c;
}

// ====================================================================== histórico (consultar corridas)

export { RAPIDOS, STATUS_FILTRO, type StatusFiltro } from "./consulta.ts";
import { RAPIDOS, STATUS_FILTRO, type FiltroConsulta, type StatusFiltro } from "./consulta.ts";

export interface FiltroHistorico extends FiltroConsulta { cidade?: string; fonte?: string }

function statusDe(c: CorridaPainel): StatusFiltro {
  if (c.grupo === "finalizada") return "finalizada";
  if (c.grupo === "nao_atendida") return "nao_atendida";
  if (c.grupo === "cancelada") return /motorist/i.test(c.canceladaPor) ? "cancelada_mot" : "cancelada_pax";
  if (/pend/i.test(c.statusTexto)) return "pendente";
  if (c.programada && /procur|aguard|distribu|espera/i.test(c.statusTexto)) return "espera";
  if (/procur|aguard|distribu|espera/i.test(c.statusTexto)) return "distribuindo";
  if (/caminho|local/i.test(c.statusTexto)) return "a_caminho";
  return "andamento";
}

/** Listas dos filtros que não dependem de varrer as corridas (categorias do cadastro e canais de origem). */
export function opcoesRapidas(empresaId: string) {
  return {
    cidades: [] as string[], fontes: [{ id: "propria", nome: "Próprias" }],
    categorias: [...new Set(listar(empresaId, cadastroPorId("categorias")!).map((c) => String(c.nome ?? "")).filter(Boolean))].sort(),
    origens: Object.values(CANAL_TEXTO),
  };
}

/** Filtro base (vai para as fontes de corridas e para a análise com IA). */
export function filtroBase(f: FiltroHistorico): Filtro {
  const base: Filtro = { os: f.os || undefined, cidade: f.cidade || undefined, categoria: f.categoria || undefined, pagamento: f.pagamento || undefined, canal: f.origem || undefined, origem: f.fonte || undefined };
  const r = f.rapido ? RAPIDOS[f.rapido] : undefined;
  if (r === "hoje") return { ...base, inicio: hojeBr(), fim: hojeBr() };
  if (typeof r === "number") return { ...base, ultimasHoras: r };
  if (f.dataIni || f.dataFim) return { ...base, inicio: f.dataIni || f.dataFim, fim: f.dataFim || f.dataIni };
  return { ...base, inicio: diaBr(-29), fim: hojeBr() };
}

export async function historico(empresaId: string, f: FiltroHistorico) {
  const base = filtroBase(f);
  const r = await buscarCorridas(empresaId, base);
  let l = r.corridas;
  const tem = (v: string, q?: string) => !q || normal(v).includes(normal(q));
  if (f.endereco) l = l.filter((c) => tem(c.embarque, f.endereco) || tem(c.destino, f.endereco));
  if (f.nomePax) l = l.filter((c) => tem(c.passageiro, f.nomePax));
  if (f.telPax) { const t = soDigitos(f.telPax); l = l.filter((c) => soDigitos(c.telefonePassageiro).includes(t)); }
  if (f.cpfPax) {
    const cpf = soDigitos(f.cpfPax);
    const tels = new Set(clientesCad(empresaId).filter((c) => soDigitos(c.cpf).includes(cpf)).map((c) => String(c.telefone)));
    l = l.filter((c) => tels.has(soDigitos(c.telefonePassageiro)));
  }
  if (f.motorista) {
    const q = normal(f.motorista);
    const placas = new Set(motoristasCad(empresaId).filter((m) => normal(m.placa).replace(/[^a-z0-9]/g, "").includes(q.replace(/[^a-z0-9]/g, "")) && q.length >= 3).map((m) => normal(m.nome)));
    l = l.filter((c) => normal(c.motorista).includes(q) || placas.has(normal(c.motorista)));
  }
  if (f.horaIni || f.horaFim) {
    const de = f.horaIni || "00:00", ate = f.horaFim || "23:59";
    l = l.filter((c) => { const h = (c.solicitadaEm ?? "").slice(11, 16); return h >= de && h <= ate; });
  }
  if (f.status && f.status in STATUS_FILTRO) l = l.filter((c) => f.status === "cancelada" ? c.grupo === "cancelada" : statusDe(c) === f.status);
  l = [...l].sort((a, b) => (b.solicitadaEm ?? "").localeCompare(a.solicitadaEm ?? ""));
  const moto = (c: CorridaPainel) => /moto/i.test(c.categoria);
  const abertas = l.filter((c) => c.grupo === "aberta");
  const comAlerta = new Set(alertas(empresaId).filter((a) => !a.resolvido).map((a) => `propria:${a.corridaId}`));
  return {
    avisos: r.avisos, filtroBase: base, corridas: l,
    stats: { total: l.length, finalizadas: l.filter((c) => c.grupo === "finalizada").length, canceladas: l.filter((c) => c.grupo === "cancelada").length, andamento: abertas.length, andamentoMoto: abertas.filter(moto).length, andamentoCarro: abertas.filter((c) => !moto(c)).length },
    alerta: (c: CorridaPainel) => comAlerta.has(c.id),
    opcoes: {
      cidades: [...new Set(r.corridas.map((c) => c.cidade).filter(Boolean))].sort(),
      categorias: [...new Set([...listar(empresaId, cadastroPorId("categorias")!).map((c) => String(c.nome ?? "")), ...r.corridas.map((c) => c.categoria)].filter(Boolean))].sort(),
      pagamentos: [...new Set(r.corridas.map((c) => c.pagamento).filter(Boolean))].sort(),
      origens: [...new Set(r.corridas.map((c) => c.canal).filter(Boolean))].sort(),
      fontes: [...new Map(r.corridas.map((c) => [c.origem, c.origemNome])).entries()].map(([id, nome]) => ({ id, nome })),
    },
  };
}

// ====================================================================== detalhe da corrida

export interface Repasse { motorista: string; aceitouEm: string; saiuEm: string | null; motivo: string }

/** Quem pegou a corrida e quando saiu (troca de motorista, desistência, retirada pela central). */
export function repasses(c: CorridaPropria): Repasse[] {
  const l: Repasse[] = [];
  let atual: Repasse | null = null;
  for (const h of c.historico) {
    const nome = /^Motorista: (.+)$/.exec(h.nota ?? "")?.[1];
    if (nome) {
      if (atual) { atual.saiuEm = h.em; atual.motivo = `Trocado por ${nome}`; }
      atual = { motorista: nome, aceitouEm: h.em, saiuEm: null, motivo: "" };
      l.push(atual);
    } else if (atual && h.status === "procurando") {
      atual.saiuEm = h.em; atual.motivo = h.nota || "Voltou a procurar motorista"; atual = null;
    } else if (atual && h.status === "cancelada") {
      atual.saiuEm = h.em; atual.motivo = h.nota || "Corrida cancelada"; atual = null;
    }
  }
  return l;
}

const chatLido = (empresaId: string) => lerOperacao<Record<string, string>>(empresaId, "chat-lido.json", {});
export function marcarChatLido(empresaId: string, corridaId: string) {
  gravarOperacao(empresaId, "chat-lido.json", { ...chatLido(empresaId), [corridaId]: new Date().toISOString() });
}
function naoLidas(empresaId: string, corridaId: string) {
  const ate = chatLido(empresaId)[corridaId] ?? "";
  try { return mensagens(empresaId, corridaId).filter((m) => m.em > ate); } catch { return []; }
}

export function detalhe(empresaId: string, id: string) {
  const c = acharPropria(empresaId, id);
  const mot = c.motoristaId ? motoristasCad(empresaId).find((m) => m.id === c.motoristaId) : undefined;
  const cli = clientesCad(empresaId).find((x) => x.telefone === c.passageiro.telefone);
  const quando = (s: StatusProprio) => c.historico.find((h) => h.status === s)?.em ?? null;
  const fim = [...c.historico].reverse().find((h) => h.status === c.status)?.em ?? null;
  const cartao = /cart[aã]o no app/i.test(c.pagamento);
  const valorInicial = c.estimativa.valor;
  return {
    corrida: c, statusTexto: STATUS_TEXTO[c.status], painel: corridaPropriaParaPainel(c),
    passageiro: { nome: c.passageiro.nome, telefone: c.passageiro.telefone, cpf: String(cli?.cpf ?? ""), cadastroId: cli?.id ?? null, status: String(cli?.status ?? "") },
    motorista: c.motoristaId ? {
      id: c.motoristaId, nome: c.motorista, telefone: c.telefoneMotorista, veiculo: String(mot?.veiculo ?? ""), placa: String(mot?.placa ?? ""),
      online: estaOnline(empresaId, c.motoristaId),
    } : null,
    datas: { solicitada: c.solicitadaEm, aceite: c.atribuidaEm ?? quando("a_caminho"), chegada: quando("no_local"), inicio: c.iniciadaEm, fim: c.finalizadaEm, cancelamento: c.status === "cancelada" ? fim : null },
    repasses: repasses(c),
    financeiro: {
      valorInicial, desconto: c.desconto ?? 0, cartao: cartao ? c.valor ?? valorInicial : null,
      final: c.status === "cancelada" ? c.taxaCancelamento ?? 0 : c.valor ?? valorInicial, taxaCancelamento: c.taxaCancelamento ?? 0,
    },
    podeCancelar: ABERTA.has(c.status), podeReenviar: c.status === "cancelada" || c.status === "nao_atendida", podeRecibo: c.status !== "cancelada" && c.status !== "nao_atendida",
    temLances: false, naoLidas: naoLidas(empresaId, c.id).length,
  };
}

// ====================================================================== auditoria (raio-x)

const RAIO_KM = () => Number(process.env.APPS_RAIO_KM) || 20;
const FIM_TEXTO: Record<Onda["fim"], string> = { oferecida: "Sem resposta", aceitou: "Aceitou", recusou: "Recusou", expirou: "Deixou passar", saiu: "Ficou offline" };

export function raioX(empresaId: string, id: string) {
  const c = acharPropria(empresaId, id);
  const ondas = ondasDaCorrida(empresaId, c.id);
  const timeline = [
    ...c.historico.map((h) => ({ em: h.em, descricao: `${STATUS_TEXTO[h.status]}${h.nota ? ` · ${h.nota}` : ""} (por ${h.por})` })),
    ...ondas.flatMap((o) => [
      { em: o.oferecidaEm, descricao: `Chamada enviada para ${o.nome || "motorista"}${o.distanciaKm != null ? ` a ${String(o.distanciaKm).replace(".", ",")} km` : ""}` },
      ...(o.fimEm ? [{ em: o.fimEm, descricao: `${o.nome || "Motorista"}: ${FIM_TEXTO[o.fim]}` }] : []),
    ]),
  ].sort((a, b) => b.em.localeCompare(a.em));
  // Motoristas da região: por que cada um recebeu ou não recebeu a chamada (situação de agora).
  const lista = listarProprias(empresaId);
  const ocupados = new Set(lista.filter((x) => x.motoristaId && COM_MOTORISTA.has(x.status) && x.id !== c.id).map((x) => x.motoristaId!));
  const regiao = motoristasCad(empresaId).map((m) => {
    const p = posicaoDoMotorista(empresaId, m.id);
    const km = p && c.embarque.lat != null && c.embarque.lng != null ? arred(linhaReta(p, { lat: c.embarque.lat, lng: c.embarque.lng }), 1) : null;
    const cats = String(m.categorias ?? "").split(",").map((x) => normal(x)).filter(Boolean);
    let motivo = "Apto";
    if (m.status !== "Ativo") motivo = `Cadastro ${String(m.status ?? "inativo").toLowerCase()}`;
    else if (!p) motivo = "Offline";
    else if (ocupados.has(m.id)) motivo = "Ocupado em outra corrida";
    else if (cats.length && !cats.includes(normal(c.categoria))) motivo = "Categoria não habilitada";
    else if (km != null && km > RAIO_KM()) motivo = `Fora do raio (${RAIO_KM()} km)`;
    return { motoristaId: m.id, nome: String(m.nome ?? ""), placa: String(m.placa ?? ""), distanciaKm: km, motivo, online: !!p };
  }).filter((m) => m.online || m.motivo === "Offline").sort((a, b) => Number(b.online) - Number(a.online) || (a.distanciaKm ?? 1e9) - (b.distanciaKm ?? 1e9)).slice(0, 100);
  return { ondas: ondas.map((o) => ({ ...o, resultado: FIM_TEXTO[o.fim] })), timeline, regiao };
}

// ====================================================================== rastreio e recibo

export function rastreio(empresaId: string, id: string, origem: string) {
  const c = acharPropria(empresaId, id);
  const mot = c.motoristaId ? motoristasCad(empresaId).find((m) => m.id === c.motoristaId) : undefined;
  return {
    status: c.status, statusTexto: STATUS_TEXTO[c.status], aberta: ABERTA.has(c.status), os: c.os,
    passageiro: c.passageiro.nome, solicitadaEm: c.solicitadaEm, embarque: c.embarque, destino: c.destino ?? null, paradas: c.paradas ?? [],
    motorista: c.motoristaId ? { nome: c.motorista, telefone: c.telefoneMotorista, veiculo: String(mot?.veiculo ?? ""), placa: String(mot?.placa ?? "") } : null,
    posicao: c.motoristaId && COM_MOTORISTA.has(c.status) ? posicaoDoMotorista(empresaId, c.motoristaId) : null,
    link: c.compartilhamento ? `${origem}/api/apps/${empresaId}/acompanhar/${c.compartilhamento}` : null,
  };
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
const reais = (n: number | null | undefined) => (n == null ? "—" : `R$ ${n.toFixed(2).replace(".", ",")}`);
const dataHoraBr = (s: string | null | undefined) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)} ${s.slice(11, 16)}` : "—");

/** Recibo da corrida (HTML para imprimir), com o nome e a cor da empresa. */
export function recibo(empresaId: string, id: string): string {
  const c = acharPropria(empresaId, id);
  if (c.status === "cancelada" || c.status === "nao_atendida") throw new Error("Corrida cancelada ou não atendida não tem recibo.");
  const m = sanearMarca(D.marca(empresaId));
  const mot = c.motoristaId ? motoristasCad(empresaId).find((x) => x.id === c.motoristaId) : undefined;
  const linha = (r: string, v: string) => `<tr><td>${esc(r)}</td><td>${esc(v)}</td></tr>`;
  const valor = c.valor ?? c.estimativa.valor;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Recibo OS ${esc(c.os)}</title>
<style>body{font-family:system-ui,sans-serif;color:#1c2434;max-width:640px;margin:24px auto;padding:0 16px}h1{margin:0;color:${esc(m.cores.primaria)}}
table{width:100%;border-collapse:collapse;margin-top:16px}td{padding:8px 4px;border-bottom:1px solid #e3e8f0}td:last-child{text-align:right;font-weight:600}
.total{font-size:22px;font-weight:800}.sub{color:#677489}@media print{button{display:none}}</style></head><body>
<h1>${esc(m.produto)}</h1><p class="sub">Recibo da corrida · OS ${esc(c.os)}</p>
<table>${linha("Passageiro", c.passageiro.nome)}${linha("Solicitada em", dataHoraBr(c.solicitadaEm))}${linha("Início", dataHoraBr(c.iniciadaEm))}${linha("Fim", dataHoraBr(c.finalizadaEm))}
${linha("Embarque", c.embarque.texto)}${(c.paradas ?? []).map((p, i) => linha(`Parada ${i + 1}`, p.texto)).join("")}${linha("Destino", c.destino?.texto ?? "Sem destino")}
${linha("Distância", c.estimativa.distanciaKm != null ? `${String(c.estimativa.distanciaKm).replace(".", ",")} km` : "—")}${linha("Categoria", c.categoria)}
${linha("Motorista", c.motorista || "—")}${linha("Veículo", [mot?.veiculo, mot?.placa].filter(Boolean).join(" · ") || "—")}${linha("Pagamento", c.pagamento)}
${c.desconto ? linha("Desconto", reais(c.desconto)) : ""}</table>
<p class="total">Total: ${esc(reais(valor))}</p><p class="sub">Emitido em ${esc(dataHoraBr(agoraBr().toISOString()))}</p>
<button onclick="print()">Imprimir</button></body></html>`;
}

// ====================================================================== chat da corrida

export function chat(empresaId: string, id: string) {
  const c = acharPropria(empresaId, id);
  const l = mensagens(empresaId, c.id);
  marcarChatLido(empresaId, c.id);
  return l.map((m) => ({ id: m.id, de: m.de, nome: m.nome, texto: m.texto ?? "", audio: m.audio ? { id: m.audio.id, segundos: m.audio.segundos } : null, em: m.em }));
}

// ====================================================================== monitoramento (acompanhamento)

export function monitoramento(empresaId: string, f: { passageiro?: string; telefone?: string }) {
  const agora = agoraBr().getTime();
  const lista = listarProprias(empresaId);
  const cid = (c: CorridaPropria) => c.motoristaId ? String(motoristasCad(empresaId).find((m) => m.id === c.motoristaId)?.cidade ?? "") : "";
  let corridas = lista.filter((c) => ABERTA.has(c.status) || agora - Date.parse(c.solicitadaEm) <= 10 * 60_000);
  if (f.passageiro) corridas = corridas.filter((c) => normal(c.passageiro.nome).includes(normal(f.passageiro)));
  if (f.telefone) { const t = soDigitos(f.telefone); corridas = corridas.filter((c) => c.passageiro.telefone.includes(t)); }
  const chats = lista.filter((c) => ABERTA.has(c.status) || agora - Date.parse(c.solicitadaEm) <= 6 * 3600_000).flatMap((c) => {
    const n = naoLidas(empresaId, c.id);
    if (!n.length) return [];
    const u = n.at(-1)!;
    return [{ corridaId: c.id, os: c.os, nome: u.nome || (u.de === "motorista" ? c.motorista : c.passageiro.nome), de: u.de, preview: u.texto || "Áudio", qtd: n.length, em: u.em }];
  });
  return {
    corridas: corridas.sort((a, b) => b.solicitadaEm.localeCompare(a.solicitadaEm)).slice(0, 200).map((c) => ({
      id: c.id, os: c.os, solicitadaEm: c.solicitadaEm, passageiro: c.passageiro.nome, telefone: c.passageiro.telefone, embarque: c.embarque.texto,
      motorista: c.motorista, telefoneMotorista: c.telefoneMotorista, status: c.status, statusTexto: STATUS_TEXTO[c.status], cidade: cid(c), categoria: c.categoria,
    })),
    chats,
  };
}

// ====================================================================== mapa em tempo real

export function mapa(empresaId: string) {
  const lista = listarProprias(empresaId);
  const online = new Map(motoristasOnline(empresaId).map((m) => [m.id, m]));
  const corridaDe = new Map(lista.filter((c) => c.motoristaId && COM_MOTORISTA.has(c.status)).map((c) => [c.motoristaId!, c]));
  const cad = motoristasCad(empresaId);
  const ativos = cad.filter((m) => m.status === "Ativo");
  const motoristas = [...ativos, ...cad.filter((m) => m.status !== "Ativo" && online.has(m.id))].map((m) => {
    const o = online.get(m.id);
    const c = corridaDe.get(m.id);
    const situacao = !o ? "offline" : c ? c.status : o.situacao === "recebendo chamada" ? "chamada" : "livre";
    return {
      id: m.id, nome: String(m.nome ?? ""), telefone: String(m.telefone ?? ""), veiculo: String(m.veiculo ?? ""), placa: String(m.placa ?? ""),
      categorias: String(m.categorias ?? ""), cidade: String(m.cidade ?? ""), lat: o?.lat ?? null, lng: o?.lng ?? null, atualizadoEm: o?.atualizadoEm ?? null,
      situacao, corrida: c ? { id: c.id, os: c.os, passageiro: c.passageiro.nome } : null,
    };
  });
  const conta = (s: string) => motoristas.filter((m) => m.situacao === s).length;
  const conectados = motoristas.filter((m) => m.situacao !== "offline").length;
  return {
    stats: {
      cadastrosAtivos: ativos.length, conectados, desconectados: Math.max(0, ativos.length - conectados),
      livres: conta("livre"), chamada: conta("chamada"), aCaminho: conta("a_caminho"), aguardando: conta("no_local"), emAndamento: conta("em_andamento"),
    },
    categorias: [...new Set(listar(empresaId, cadastroPorId("categorias")!).map((c) => String(c.nome ?? "")).filter(Boolean))].sort(),
    motoristas,
  };
}

// ====================================================================== ocorrências (falhas recentes)

export async function ocorrencias(empresaId: string, horas: number, pagina: number) {
  const r = await buscarCorridas(empresaId, { ultimasHoras: horas });
  const l = r.corridas.filter((c) => c.grupo === "cancelada" || c.grupo === "nao_atendida")
    .sort((a, b) => (b.solicitadaEm ?? "").localeCompare(a.solicitadaEm ?? ""))
    .map((c) => ({
      id: c.id, os: c.os, hora: c.solicitadaEm, grupo: c.grupo, statusTexto: c.statusTexto,
      motivo: c.grupo === "nao_atendida" ? "Nenhum motorista aceitou a corrida" : `Cancelada${c.canceladaPor ? ` pelo ${c.canceladaPor.toLowerCase()}` : ""}${c.motivoCancelamento ? `: ${c.motivoCancelamento}` : ""}`,
      passageiro: c.passageiro, telefone: c.telefonePassageiro, embarque: c.embarque, destino: c.destino, motorista: c.motorista, valorPerdido: c.valor ?? c.valorEstimado,
    }));
  const p = paginar(l, pagina, 20);
  return { avisos: r.avisos, ...p };
}

// ====================================================================== programadas

export type FiltroProgramadas = "hoje" | "amanha" | "futuras" | "todas";
export function programadas(empresaId: string, filtro: FiltroProgramadas, busca: string, pagina: number) {
  const agora = agoraBr().toISOString();
  let l = listarProprias(empresaId).filter((c) => c.agendadaPara);
  if (filtro === "hoje") l = l.filter((c) => c.agendadaPara!.slice(0, 10) === hojeBr());
  else if (filtro === "amanha") l = l.filter((c) => c.agendadaPara!.slice(0, 10) === diaBr(1));
  else if (filtro === "futuras") l = l.filter((c) => c.agendadaPara! >= agora && ABERTA.has(c.status));
  if (busca) l = l.filter((c) => normal(c.passageiro.nome).includes(normal(busca)) || c.passageiro.telefone.includes(soDigitos(busca) || "§") || c.os === busca.trim());
  l = [...l].sort((a, b) => (filtro === "todas" ? b.agendadaPara!.localeCompare(a.agendadaPara!) : a.agendadaPara!.localeCompare(b.agendadaPara!)));
  const p = paginar(l, pagina, 20);
  return {
    ...p,
    itens: p.itens.map((c) => ({
      id: c.id, os: c.os, agendadaPara: c.agendadaPara, solicitadaEm: c.solicitadaEm, passageiro: c.passageiro.nome, telefone: c.passageiro.telefone,
      origem: c.embarque.texto, destino: c.destino?.texto ?? "", motorista: c.motorista, status: c.status, statusTexto: STATUS_TEXTO[c.status],
      valor: c.valor ?? c.estimativa.valor, pagamento: c.pagamento, observacao: c.observacao, aberta: ABERTA.has(c.status),
    })),
  };
}

// Pagamentos pendentes (taxas de cancelamento, Pix no app e pagamento insuficiente): ver operacao/pendencias.ts.

// ====================================================================== objetos perdidos

const OBJ = () => cadastroPorId("objetos")!;
const resolvido = (r: Record<string, unknown>) => r.situacao === "Devolvido";
export function objetos(empresaId: string, status: "todos" | "pendente" | "resolvido", busca: string, pagina: number) {
  let l = [...listar(empresaId, OBJ())];
  if (status !== "todos") l = l.filter((r) => (status === "resolvido") === resolvido(r));
  if (busca) l = l.filter((r) => [r.descricao, r.os, r.passageiro, r.motorista, r.observacao].some((v) => normal(v).includes(normal(busca))));
  l.sort((a, b) => String(b.data ?? b.criadoEm).localeCompare(String(a.data ?? a.criadoEm)) || b.criadoEm.localeCompare(a.criadoEm));
  const p = paginar(l, pagina, 20);
  return {
    ...p,
    itens: p.itens.map((r) => ({
      id: r.id, data: String(r.data ?? r.criadoEm.slice(0, 10)), os: String(r.os ?? ""), descricao: String(r.descricao ?? ""), observacao: String(r.observacao ?? ""),
      ondeEsta: String(r.ondeEsta ?? ""), passageiro: String(r.passageiro ?? ""), motorista: String(r.motorista ?? ""), situacao: String(r.situacao ?? ""), resolvido: resolvido(r),
    })),
  };
}
export function alternarObjeto(empresaId: string, id: string, por: string) {
  const r = listar(empresaId, OBJ()).find((x) => x.id === id);
  if (!r) throw new Error("Registro não encontrado.");
  return atualizar(empresaId, OBJ(), id, { ...Object.fromEntries(OBJ().campos.map((c) => [c.chave, r[c.chave]])), situacao: resolvido(r) ? "Procurando" : "Devolvido" }, por);
}
export const apagarObjeto = (empresaId: string, id: string) => remover(empresaId, OBJ(), id);

// ====================================================================== nova solicitação: passageiro e motoristas

export function buscarPassageiro(empresaId: string, q: { telefone?: string; cpf?: string }) {
  const tel = soDigitos(q.telefone), cpf = soDigitos(q.cpf);
  if (!tel && !cpf) throw new Error("Informe o telefone ou o CPF.");
  const cli = clientesCad(empresaId).find((c) => (tel && c.telefone === tel) || (cpf && cpf.length === 11 && soDigitos(c.cpf) === cpf));
  const telefone = String(cli?.telefone ?? tel);
  const corridas = listarProprias(empresaId).filter((c) => c.passageiro.telefone === telefone);
  const vistos = new Set<string>();
  const enderecos: Array<{ texto: string; lat?: number; lng?: number }> = [];
  if (cli?.enderecoFavorito) { vistos.add(normal(cli.enderecoFavorito)); enderecos.push({ texto: String(cli.enderecoFavorito) }); }
  for (const c of [...corridas].reverse()) for (const p of [c.embarque, c.destino]) {
    if (!p?.texto || vistos.has(normal(p.texto)) || enderecos.length >= 6) continue;
    vistos.add(normal(p.texto)); enderecos.push({ texto: p.texto, lat: p.lat, lng: p.lng });
  }
  return {
    encontrado: !!cli || corridas.length > 0,
    nome: String(cli?.nome ?? corridas.at(-1)?.passageiro.nome ?? ""), telefone, cpf: String(cli?.cpf ?? ""), status: String(cli?.status ?? ""),
    corridas: corridas.length, enderecos,
  };
}

export function opcoesMotoristas(empresaId: string) {
  const online = new Set(motoristasOnline(empresaId).map((m) => m.id));
  return motoristasCad(empresaId).filter((m) => m.status === "Ativo").map((m) => ({
    id: m.id, nome: String(m.nome ?? ""), placa: String(m.placa ?? ""), categorias: String(m.categorias ?? ""), online: online.has(m.id),
  })).sort((a, b) => Number(b.online) - Number(a.online) || a.nome.localeCompare(b.nome));
}

export const textoGrupo = GRUPO_TEXTO;
