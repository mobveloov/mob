// Despacho dos apps: motoristas online com a posição, oferta da corrida para o motorista livre MAIS PERTO,
// aceitar e recusar, e o "vigia" que avisa os apps quando uma corrida muda (pelo app, pela central, pelo bot...).
//
// Fica em cima das corridas próprias (src/corridas): qualquer corrida "procurando" da empresa, venha do app,
// da central, do bot ou do totem, é oferecida aos motoristas online pelo app.
//
// O estado de quem está online fica na memória do servidor. Se o servidor reiniciar, o app do motorista recebe
// 409 na próxima posição e volta a ficar online sozinho.

import crypto from "node:crypto";
import { cadastroPorId } from "../comum/cadastros.ts";
import { listar } from "../cadastros/armazem.ts";
import { aindaAgendada, alterarCorrida, atribuirMotorista, criarCorridaPropria, descontoDoCupom, estimarPreco, horaDaCorrida, listarProprias, mudarStatus, STATUS_TEXTO, type CorridaPropria, type Ponto } from "../corridas/index.ts";
import { banco } from "../servidor/banco.ts";
import { ajustes } from "./ajustes.ts";
import { calcularComissao } from "../config/comissao.ts";
import { estatisticas, urlDaFoto } from "./perfil.ts";
import { pessoa } from "./extras.ts";
import { naoLidas } from "./chat.ts";
import { filtrosDoDespacho } from "./extras.ts";
import { fantasmas, regrasDoDespacho } from "../gestao/regras.ts";
import { fotoDeAreas } from "../areas/areas.ts";
import { motoristasEmPlantao } from "../areas/plantao.ts";
import { regrasDespacho, transbordoPermitido } from "../config/despacho.ts";
import { enderecoDoPonto, linhaReta } from "../enderecos/index.ts";
import { listarEmpresas } from "../servidor/dados.ts";
import { agoraBr, arred, normal } from "../servidor/util.ts";
import { arquivo, gravar, ler } from "./armazem.ts";
import { emitir, empresasComOuvintes, temOuvinte, type Alvo, conectado } from "./eventos.ts";
import { avisar } from "./push.ts";
import type { PapelApp } from "./sessoes.ts";

/** Quanto tempo o motorista tem para aceitar. */
export const OFERTA_MS = () => Math.max(5, Number(process.env.APPS_OFERTA_SEGUNDOS) || 20) * 1000;
/** Raio máximo da oferta (km). */
const RAIO_KM = () => Number(process.env.APPS_RAIO_KM) || 20;
/** Posição mais velha que isso não conta (motorista sumiu). */
const POSICAO_MS = 10 * 60_000; // o app reenvia a cada 30 s; em segundo plano o Android pode atrasar
/** Depois de recusar ou deixar passar, o motorista só recebe de novo a mesma corrida depois disso. */
const REOFERTA_MS = 2 * 60_000;

const ABERTA_COM_MOTORISTA = new Set(["a_caminho", "no_local", "em_andamento"]);
const ABERTA = new Set(["procurando", "a_caminho", "no_local", "em_andamento"]);

interface Online { lat: number; lng: number; em: number; desde: number; /** último pedido do app (qualquer um) */ visto: number; /** até quando o tempo online já foi contado */ contado: number }

/**
 * Motorista que fechou o app sem ficar offline: sem nenhum pedido do app há mais que isso e sem tempo real aberto,
 * não recebe oferta (antes ficava "online" até 10 min e cada corrida esperava 20 s por motorista sumido).
 */
const VISTO_MS = 90_000;

/** Chamado a cada pedido do app do motorista (rotas.ts). */
export function marcarVisto(empresaId: string, motoristaId: string) {
  const o = estados.get(empresaId)?.online.get(motoristaId);
  if (o) o.visto = Date.now();
}
export interface Oferta { id: string; corridaId: string; motoristaId: string; expira: number; distanciaKm: number | null }

/** O que aconteceu com uma oferta (para a auditoria "ondas de envio" da central, em src/operacao). */
export type FimOferta = "oferecida" | "aceitou" | "recusou" | "expirou" | "saiu";
type OuvinteOferta = (empresaId: string, o: Oferta, fim: FimOferta) => void;
const ouvintesOferta: OuvinteOferta[] = [];
/** Registra quem quer saber de cada oferta (criada, aceita, recusada, vencida). */
export const aoMudarOferta = (f: OuvinteOferta) => { if (!ouvintesOferta.includes(f)) ouvintesOferta.push(f); };
/** Guarda como terminou cada oferta (para a taxa de aceitação do motorista). "saiu" (ficou offline) não conta. */
function anotarOferta(empresaId: string, o: Oferta, fim: FimOferta) {
  if (fim === "oferecida" || fim === "saiu") return;
  try { banco().prepare("INSERT INTO app_ofertas (empresa, motorista, resultado, em) VALUES (?, ?, ?, ?)").run(empresaId, o.motoristaId, fim, new Date().toISOString()); } catch { /* estatística: não pode travar a chamada */ }
}

/** Taxa de aceitação: das últimas 100 ofertas, quantas foram aceitas, recusadas e ignoradas (a chamada venceu). */
export function taxaDeAceitacao(empresaId: string, motoristaId: string) {
  const l = banco().prepare("SELECT resultado, em FROM app_ofertas WHERE empresa = ? AND motorista = ? ORDER BY seq DESC LIMIT 100").all(empresaId, motoristaId) as Array<{ resultado: string; em: string }>;
  const aceitas = l.filter((x) => x.resultado === "aceitou").length, rejeitadas = l.filter((x) => x.resultado === "recusou").length, ignoradas = l.filter((x) => x.resultado === "expirou").length;
  return { ofertas: l.length, aceitas, rejeitadas, ignoradas, porcentagem: l.length ? Math.round((aceitas / l.length) * 100) : 0, atualizadoEm: l[0]?.em ?? null };
}

function avisarOferta(empresaId: string, o: Oferta, fim: FimOferta) {
  anotarOferta(empresaId, o, fim);
  for (const f of ouvintesOferta) { try { f(empresaId, o, fim); } catch (e) { console.error("[apps] ouvinte de oferta:", e instanceof Error ? e.message : e); } }
}

interface Estado {
  online: Map<string, Online>;
  ofertas: Map<string, Oferta>;
  /** corridaId → (motoristaId → quando recusou/deixou passar) */
  tentados: Map<string, Map<string, number>>;
  /** corridaId → assinatura do último estado avisado */
  vistos: Map<string, string>;
  /** Já passou a primeira volta do vigia (a primeira só anota, não avisa). */
  vigiado: boolean;
  /** corridaId → contra-ofertas dos motoristas (valem 60 s). */
  contraofertas: Map<string, Contraoferta[]>;
}
const estados = new Map<string, Estado>();
function estado(empresaId: string): Estado {
  let e = estados.get(empresaId);
  if (!e) estados.set(empresaId, (e = { online: new Map(), ofertas: new Map(), tentados: new Map(), vistos: new Map(), vigiado: false, contraofertas: new Map() }));
  return e;
}
/** Só para os testes. */
export const limparDespacho = () => estados.clear();

const motoristas = (empresaId: string) => listar(empresaId, cadastroPorId("motoristas")!);
const motorista = (empresaId: string, id: string) => motoristas(empresaId).find((m) => m.id === id);
const passageiroAlvo = (c: CorridaPropria): Alvo => ({ papel: "passageiro", chave: c.passageiro.telefone });
const motoristaAlvo = (id: string): Alvo => ({ papel: "motorista", chave: id });

// ------------------------------------------------------------------ como a corrida aparece no app

export function corridaParaApp(empresaId: string, c: CorridaPropria, papel: PapelApp) {
  const aberta = ABERTA.has(c.status);
  const m = c.motoristaId ? motorista(empresaId, c.motoristaId) : undefined;
  return {
    id: c.id, os: c.os, status: c.status, statusTexto: STATUS_TEXTO[c.status], aberta,
    embarque: c.embarque, destino: c.destino ?? null, categoria: c.categoria, pagamento: c.pagamento, observacao: c.observacao,
    estimativa: c.estimativa, valor: c.valor, cupom: c.cupom, desconto: c.desconto, avaliacao: c.avaliacao,
    solicitadaEm: c.solicitadaEm, iniciadaEm: c.iniciadaEm, finalizadaEm: c.finalizadaEm, canceladaPor: c.canceladaPor,
    motorista: c.motoristaId ? {
      nome: c.motorista, veiculo: String(m?.veiculo ?? ""), placa: String(m?.placa ?? ""),
      // Telefone só enquanto a corrida está aberta, e só para quem está nela.
      telefone: aberta && papel === "passageiro" ? c.telefoneMotorista : "",
      foto: urlDaFoto(empresaId, "motorista", c.motoristaId), cor: pessoa(empresaId, "motorista", c.motoristaId).veiculos.find((v) => v.ativo)?.cor ?? "",
      ...estatisticas(empresaId, "motorista", c.motoristaId),
    } : null,
    passageiro: {
      nome: c.passageiro.nome, telefone: aberta && papel === "motorista" ? c.passageiro.telefone : "",
      ...(papel === "motorista" ? { foto: urlDaFoto(empresaId, "passageiro", c.passageiro.telefone), nota: estatisticas(empresaId, "passageiro", c.passageiro.telefone).nota, corridas: estatisticas(empresaId, "passageiro", c.passageiro.telefone).viagens } : {}),
    },
    ...(papel === "motorista" ? { infoAntes: c.infoAntes ?? "", infoDepois: c.motoristaId ? c.infoDepois ?? "" : "" } : {}),
    canal: c.canal, valorOferecido: c.valorOferecido ?? null, opcionais: c.opcionais ?? [], etiquetas: c.etiquetas ?? [],
    modo: c.macaneta?.modo, distanciaPercorridaKm: c.macaneta ? c.macaneta.km : undefined,
    ...(papel === "passageiro" ? { ...aproximacao(empresaId, c), mensagensNaoLidas: aberta ? naoLidas(empresaId, c.id, "passageiro") : 0 } : {}),
    paradas: c.paradas ?? [], agendadaPara: c.agendadaPara ?? null, comentario: c.comentario ?? "",
    avaliacaoPassageiro: papel === "motorista" ? c.avaliacaoPassageiro ?? null : undefined,
    taxaCancelamento: c.taxaCancelamento ?? null,
    compartilhar: papel === "passageiro" && c.compartilhamento ? `acompanhar/${c.compartilhamento}` : null,
    motoristaId: papel === "passageiro" ? c.motoristaId : undefined,
  };
}

/** Passageiro: quanto falta para o motorista chegar ao embarque (estimado pela posição dele). */
function aproximacao(empresaId: string, c: CorridaPropria) {
  if (!c.motoristaId || (c.status !== "a_caminho" && c.status !== "no_local")) return { distanciaMotoristaKm: null, minutosMotorista: null, chegando: c.status === "no_local" };
  const p = estado(empresaId).online.get(c.motoristaId);
  if (!p || c.embarque.lat == null || c.embarque.lng == null) return { distanciaMotoristaKm: null, minutosMotorista: null, chegando: c.status === "no_local" };
  const km = linhaReta({ lat: p.lat, lng: p.lng }, { lat: c.embarque.lat, lng: c.embarque.lng });
  return { distanciaMotoristaKm: arred(km, 1), minutosMotorista: Math.max(1, Math.round(km * 2.5)), chegando: km < 0.5 || c.status === "no_local" };
}

/** A corrida só aparece para quem está nela: o passageiro dono ou o motorista atribuído. */
export function participa(c: CorridaPropria, papel: PapelApp, chave: string) {
  return papel === "passageiro" ? c.passageiro.telefone === chave : c.motoristaId === chave;
}

export function corridaDoApp(empresaId: string, id: string, papel: PapelApp, chave: string): CorridaPropria {
  const c = listarProprias(empresaId).find((x) => x.id === id);
  if (!c || !participa(c, papel, chave)) throw new Error("Corrida não encontrada.");
  return c;
}

export function corridaAtual(empresaId: string, papel: PapelApp, chave: string): CorridaPropria | null {
  const l = listarProprias(empresaId).filter((c) => participa(c, papel, chave));
  return l.filter((c) => ABERTA.has(c.status) && !aindaAgendada(c)).at(-1) ?? null;
}

// ------------------------------------------------------------------ online e posição

export function ficarOnline(empresaId: string, motoristaId: string, lat: number, lng: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error("Posição inválida. Ligue o GPS.");
  const e = estado(empresaId);
  const antes = e.online.get(motoristaId);
  const agora = Date.now();
  const o: Online = { lat, lng, em: agora, desde: antes?.desde ?? agora, visto: agora, contado: antes?.contado ?? agora };
  e.online.set(motoristaId, o);
  contarOnline(empresaId, motoristaId, o);
  if (!antes) despachar(empresaId);
}

export function ficarOffline(empresaId: string, motoristaId: string) {
  const e = estado(empresaId);
  e.online.delete(motoristaId);
  for (const o of [...e.ofertas.values()]) if (o.motoristaId === motoristaId) passarOferta(empresaId, o, "saiu");
}

export const estaOnline = (empresaId: string, motoristaId: string) => estado(empresaId).online.has(motoristaId);

/** Nova posição do motorista. Se ele estiver numa corrida, o passageiro vê a posição. */
export function atualizarPosicao(empresaId: string, motoristaId: string, lat: number, lng: number) {
  const e = estado(empresaId);
  if (!e.online.has(motoristaId)) { const erro = new Error("Fique online de novo."); (erro as Error & { status?: number }).status = 409; throw erro; }
  ficarOnline(empresaId, motoristaId, lat, lng);
  const c = corridaAtual(empresaId, "motorista", motoristaId);
  if (c && ABERTA_COM_MOTORISTA.has(c.status)) emitir(empresaId, passageiroAlvo(c), "posicao", { corridaId: c.id, lat, lng, em: Date.now() });
  if (c?.macaneta?.modo === "taximetro" && c.status === "em_andamento") somarTaximetro(empresaId, c.id, lat, lng);
}

/** Soma o tempo online do dia (a cada posição; lacunas de mais de 2 min não contam). */
function contarOnline(empresaId: string, motoristaId: string, o: Online) {
  const agora = Date.now();
  const delta = Math.min(agora - o.contado, 120_000);
  o.contado = agora;
  if (delta < 1000) return;
  try {
    banco().prepare(`INSERT INTO app_online (empresa, motorista, dia, segundos) VALUES (?, ?, ?, ?)
      ON CONFLICT (empresa, motorista, dia) DO UPDATE SET segundos = segundos + excluded.segundos`).run(empresaId, motoristaId, agoraBr().toISOString().slice(0, 10), Math.round(delta / 1000));
  } catch { /* contagem é só estatística */ }
}

/** Maçaneta em modo taxímetro: soma a distância andada (ignora saltos de mais de 300 m em 5 s e tremidas de GPS). */
function somarTaximetro(empresaId: string, corridaId: string, lat: number, lng: number) {
  void alterarCorrida(empresaId, corridaId, (x) => {
    const m = x.macaneta;
    if (!m) return;
    const agora = Date.now();
    if (m.ultimaLat != null && m.ultimaLng != null && m.ultimaEm) {
      const metros = linhaReta({ lat: m.ultimaLat, lng: m.ultimaLng }, { lat, lng }) * 1000;
      const seg = Math.max((agora - m.ultimaEm) / 1000, 1);
      if (metros >= 5 && metros / seg <= 60) m.km = arred(m.km + metros / 1000, 3);
    }
    m.ultimaLat = lat; m.ultimaLng = lng; m.ultimaEm = agora;
  }).catch(() => undefined);
}

export function posicaoDoMotorista(empresaId: string, motoristaId: string) {
  const o = estado(empresaId).online.get(motoristaId);
  return o ? { lat: o.lat, lng: o.lng, em: o.em } : null;
}

// ------------------------------------------------------------------ oferta

// Corrida agendada para daqui a dias, mesmo com motorista, não deixa ele ocupado agora.
const ocupados = (lista: CorridaPropria[]) => new Set(lista.filter((c) => c.motoristaId && ABERTA_COM_MOTORISTA.has(c.status) && !aindaAgendada(c)).map((c) => c.motoristaId!));

/** O motorista pode levar essa categoria? Campo "categorias" vazio no cadastro = todas. */
function habilitado(cadastro: Record<string, unknown> | undefined, categoria: string) {
  const cats = String(cadastro?.categorias ?? "").split(",").map((x) => normal(x)).filter(Boolean);
  return !cats.length || cats.includes(normal(categoria));
}

export function ofertaDoMotorista(empresaId: string, motoristaId: string) {
  return [...estado(empresaId).ofertas.values()].find((o) => o.motoristaId === motoristaId && o.expira > Date.now()) ?? null;
}

/** Valor da corrida para o motorista: bruto (o que o passageiro paga), taxa da central e líquido (o que sobra para ele). */
export function valoresDaCorrida(empresaId: string, c: CorridaPropria, motoristaId?: string) {
  const base = c.valorOferecido ?? c.estimativa.valor;
  if (base == null) return { valorBruto: null as number | null, taxaCentral: null as number | null, valorLiquido: null as number | null, ganhoPorKm: null as number | null };
  const co = calcularComissao(empresaId, c.categoria, Math.max(0, arred(base - (c.desconto ?? 0))), motoristaId);
  const km = c.estimativa.distanciaKm;
  return { valorBruto: co.valorBruto, taxaCentral: co.taxaCentral, valorLiquido: co.valorLiquido, ganhoPorKm: km && km > 0 ? arred(co.valorLiquido / km) : null };
}

/**
 * Líquido de cada valor que o motorista pode propor (de R$ 5 a menos até R$ 10 a mais, de 1 em 1), já com a comissão do
 * painel (percentual, valor fixo, faixas ou regra do motorista). O app usa a tabela para mostrar o líquido da contra-oferta.
 */
function tabelaLiquido(empresaId: string, c: CorridaPropria, motoristaId?: string) {
  const base = c.valorOferecido ?? c.estimativa.valor;
  if (base == null) return [];
  const minimo = minimoDaCategoria(empresaId, c.categoria);
  const l: Array<{ valor: number; bruto: number; taxa: number; liquido: number }> = [];
  for (let k = -5; k <= 10; k++) {
    const v = arred(base + k);
    if (v < Math.max(1, minimo)) continue;
    const co = calcularComissao(empresaId, c.categoria, Math.max(0, arred(v - (c.desconto ?? 0))), motoristaId);
    l.push({ valor: v, bruto: co.valorBruto, taxa: co.taxaCentral, liquido: co.valorLiquido });
  }
  return l;
}

/** O que a tela de chamada mostra além do básico: valores, nota do passageiro, tempo até ele, opcionais. */
function extrasDaChamada(empresaId: string, c: CorridaPropria, motoristaId: string, distanciaKm: number | null) {
  const est = estatisticas(empresaId, "passageiro", c.passageiro.telefone);
  const nomes = new Map(ajustes(empresaId).opcionais.map((o) => [o.id, o.nome]));
  return {
    valorOferecido: c.valorOferecido ?? null, opcionais: (c.opcionais ?? []).map((id) => nomes.get(id) ?? id),
    nota: est.nota, viagens: est.viagens,
    minutosAteEmbarque: distanciaKm != null ? Math.max(1, Math.round(distanciaKm * 2.5)) : null,
    distanciaViagemKm: c.estimativa.distanciaKm,
    ...valoresDaCorrida(empresaId, c, motoristaId), tabelaLiquido: tabelaLiquido(empresaId, c, motoristaId),
  };
}

export function ofertaParaApp(empresaId: string, o: Oferta) {
  const c = listarProprias(empresaId).find((x) => x.id === o.corridaId);
  if (!c) return null;
  const extras = extrasDaChamada(empresaId, c, o.motoristaId, o.distanciaKm);
  return {
    id: o.id, expira: o.expira, segundos: Math.max(0, Math.round((o.expira - Date.now()) / 1000)), distanciaKm: o.distanciaKm, ...extras,
    corrida: { id: c.id, os: c.os, embarque: c.embarque, destino: c.destino ?? null, categoria: c.categoria, pagamento: c.pagamento, observacao: c.observacao, infoAntes: c.infoAntes ?? "", estimativa: c.estimativa, passageiro: c.passageiro.nome, paradas: c.paradas ?? [], agendadaPara: c.agendadaPara ?? null, ...extras },
  };
}

/** Oferece cada corrida "procurando" (sem oferta pendente) ao motorista livre mais perto. */
export function despachar(empresaId: string) {
  const e = estado(empresaId);
  if (!e.online.size) return 0;
  const lista = listarProprias(empresaId);
  const busy = ocupados(lista);
  const cadastro = new Map(motoristas(empresaId).map((m) => [m.id, m]));
  const agora = Date.now();
  const comOferta = new Set([...e.ofertas.values()].map((o) => o.motoristaId));
  const corridasComOferta = new Set([...e.ofertas.values()].map((o) => o.corridaId));
  const regras = regrasDespacho(empresaId); // Config › Regras de Despacho
  const filtros = filtrosDoDespacho(empresaId); // favoritos, bloqueios e categorias: lidos uma vez por rodada
  // Transbordo (motorista de outra cidade): o resultado só depende da cidade e da categoria, então vale por rodada.
  const transbordos = new Map<string, boolean>();
  const transbordoOk = (cidade: unknown, categoria: string) => {
    const k = `${String(cidade ?? "")}|${categoria}`;
    let v = transbordos.get(k);
    if (v === undefined) { v = transbordoPermitido(empresaId, cidade, categoria); transbordos.set(k, v); }
    return v;
  };
  const gestao = regrasDoDespacho(empresaId, cadastro); // punição, cerca eletrônica, saldo mínimo e nível
  const areasEmpresa = fotoDeAreas(empresaId); // Cadastro › Áreas: bloqueio e prioridade
  const emPlantao = motoristasEmPlantao(empresaId); // Cadastro › Plantão: escalados têm prioridade nas filas
  let n = 0;
  for (const c of lista.filter((x) => x.status === "procurando" && !corridasComOferta.has(x.id) && !aindaAgendada(x)).sort((a, b) => horaDaCorrida(a).localeCompare(horaDaCorrida(b)))) {
    if (areasEmpresa.bloqueando(c.embarque.lat, c.embarque.lng)) continue; // embarque em área de risco/bloqueio: ninguém é chamado
    const areaDaCorrida = areasEmpresa.principal(c.embarque.lat, c.embarque.lng);
    const tentados = e.tentados.get(c.id) ?? new Map<string, number>();
    type Candidato = { id: string; km: number | null; fav: boolean; plantao: boolean; nivel: number; naArea: boolean; desde: number };
    let melhor: Candidato | null = null;
    // Ordem: favorito do passageiro, plantão, nível (prioritário, secundário, reserva), mesma área do embarque; depois, com a fila
    // virtual ligada (Config › Regras de Despacho), quem está online há mais tempo; senão, o mais perto.
    const vence = (a: Candidato, b: Candidato) => {
      if (a.fav !== b.fav) return a.fav;
      if (a.plantao !== b.plantao) return a.plantao;
      if (a.nivel !== b.nivel) return a.nivel < b.nivel;
      if (a.naArea !== b.naArea) return a.naArea;
      if (regras.metodo === "fila_virtual") return a.desde < b.desde;
      return (a.km ?? Infinity) < (b.km ?? Infinity) || (a.km == null && b.km == null && a.desde < b.desde);
    };
    for (const [id, p] of e.online) {
      if (busy.has(id) || comOferta.has(id) || agora - p.em > POSICAO_MS) continue;
      if (agora - p.visto > VISTO_MS && !conectado(empresaId, motoristaAlvo(id))) continue; // fechou o app
      if (!filtros.podeAtender(c, id)) continue; // bloqueio de um dos lados ou categoria que ele não quer
      if ((tentados.get(id) ?? 0) > agora - REOFERTA_MS) continue;
      const cad = cadastro.get(id);
      if (!cad || cad.status !== "Ativo" || !habilitado(cad, c.categoria)) continue;
      if (!gestao.pode(id, c, p)) continue; // punido, fora da cerca ou sem saldo mínimo
      const km = c.embarque.lat != null && c.embarque.lng != null ? linhaReta({ lat: p.lat, lng: p.lng }, { lat: c.embarque.lat, lng: c.embarque.lng }) : null;
      if (km != null && km > (process.env.APPS_RAIO_KM ? RAIO_KM() : regras.raioMetros / 1000)) continue;
      if (!transbordoOk(cad.cidade, c.categoria)) continue; // Config › Transbordos
      const cand: Candidato = {
        id, km, fav: filtros.ehFavorito(c.passageiro.telefone, id), plantao: emPlantao.has(id), nivel: gestao.nivel(id),
        naArea: !!areaDaCorrida && areasEmpresa.principal(p.lat, p.lng)?.id === areaDaCorrida.id, desde: p.desde,
      };
      if (!melhor || vence(cand, melhor)) melhor = cand;
    }
    if (!melhor) continue;
    const o: Oferta = { id: crypto.randomUUID(), corridaId: c.id, motoristaId: melhor.id, expira: agora + (process.env.APPS_OFERTA_SEGUNDOS ? OFERTA_MS() : regras.tempoTela * 1000), distanciaKm: melhor.km != null ? arred(melhor.km, 1) : null };
    e.ofertas.set(o.id, o);
    avisarOferta(empresaId, o, "oferecida");
    comOferta.add(melhor.id);
    emitir(empresaId, motoristaAlvo(melhor.id), "oferta", ofertaParaApp(empresaId, o));
    void avisar(empresaId, motoristaAlvo(melhor.id), {
      titulo: "Nova corrida", texto: `${c.embarque.texto}${o.distanciaKm != null ? ` · ${o.distanciaKm} km de você` : ""}`,
      dados: { tipo: "oferta", ofertaId: o.id, corridaId: c.id }, canal: "corridas",
    });
    n++;
  }
  return n;
}

function passarOferta(empresaId: string, o: Oferta, fim: FimOferta = "expirou") {
  const e = estado(empresaId);
  e.ofertas.delete(o.id);
  avisarOferta(empresaId, o, fim);
  const t = e.tentados.get(o.corridaId) ?? new Map<string, number>();
  t.set(o.motoristaId, Date.now());
  e.tentados.set(o.corridaId, t);
  emitir(empresaId, motoristaAlvo(o.motoristaId), "oferta_encerrada", { id: o.id });
}

export function recusar(empresaId: string, motoristaId: string, ofertaId: string) {
  const o = estado(empresaId).ofertas.get(ofertaId);
  if (!o || o.motoristaId !== motoristaId) throw new Error("Esta chamada já passou.");
  passarOferta(empresaId, o, "recusou");
  despachar(empresaId);
}

export async function aceitar(empresaId: string, motoristaId: string, ofertaId: string): Promise<CorridaPropria> {
  const e = estado(empresaId);
  const o = e.ofertas.get(ofertaId);
  if (!o || o.motoristaId !== motoristaId || o.expira < Date.now()) throw new Error("Esta chamada já passou.");
  e.ofertas.delete(o.id);
  const c = listarProprias(empresaId).find((x) => x.id === o.corridaId);
  if (!c || c.status !== "procurando") throw new Error("Esta corrida não está mais disponível.");
  const feita = await atribuirMotorista(empresaId, c.id, motoristaId, "app do motorista");
  if (feita.motoristaId !== motoristaId) throw new Error("Esta corrida não está mais disponível.");
  avisarOferta(empresaId, o, "aceitou");
  e.tentados.delete(c.id);
  vigiar(empresaId);
  return feita;
}

/** Motorista desiste antes de chegar: a corrida volta a procurar outro (e ele não recebe essa de novo logo). */
export async function desistir(empresaId: string, motoristaId: string, corridaId: string, motivo = "") {
  const c = await mudarStatus(empresaId, corridaId, "procurando", { nota: `Motorista desistiu pelo app${motivo ? `: ${motivo}` : ""}` }, "app do motorista");
  const e = estado(empresaId);
  const t = e.tentados.get(corridaId) ?? new Map<string, number>();
  t.set(motoristaId, Date.now());
  e.tentados.set(corridaId, t);
  emitir(empresaId, motoristaAlvo(motoristaId), "corrida", { ...corridaParaApp(empresaId, c, "motorista"), aberta: false, statusTexto: "Você desistiu da corrida" });
  vigiar(empresaId);
  despachar(empresaId);
  return c;
}

// ------------------------------------------------------------------ vigia (avisa os apps das mudanças)

const assinatura = (c: CorridaPropria) => `${c.status}|${c.motoristaId ?? ""}|${c.historico.length}|${c.avaliacao ?? ""}`;
const TEXTO_PUSH: Partial<Record<CorridaPropria["status"], string>> = {
  a_caminho: "Seu motorista está a caminho.", no_local: "Seu motorista está no local.", em_andamento: "Boa viagem!",
  finalizada: "Corrida finalizada. Avalie o motorista.", cancelada: "A corrida foi cancelada.", nao_atendida: "Não achamos motorista agora. Tente de novo.",
};

/** Compara as corridas com o último estado avisado e manda o evento "corrida" para quem está nela. */
export function vigiar(empresaId: string) {
  const e = estado(empresaId);
  const lista = listarProprias(empresaId);
  const primeiraVez = !e.vigiado;
  e.vigiado = true;
  const limite = agoraBr().getTime() - 24 * 3600_000;
  // Chamada pendente de corrida que já não procura motorista (aceita por outro, cancelada, contra-oferta aceita): some, sempre.
  if (e.ofertas.size) {
    const porId = new Map(lista.map((c) => [c.id, c]));
    for (const o of [...e.ofertas.values()]) if (porId.get(o.corridaId)?.status !== "procurando") { e.ofertas.delete(o.id); emitir(empresaId, motoristaAlvo(o.motoristaId), "oferta_encerrada", { id: o.id }); }
  }
  for (const c of lista) {
    if (!ABERTA.has(c.status) && Date.parse(c.solicitadaEm) < limite) continue;
    const a = assinatura(c), antes = e.vistos.get(c.id);
    if (a === antes) continue;
    e.vistos.set(c.id, a);
    if (primeiraVez && !antes) continue; // servidor acabou de subir: não repete avisos antigos
    const motoristaAntes = antes?.split("|")[1] ?? "";
    emitir(empresaId, passageiroAlvo(c), "corrida", corridaParaApp(empresaId, c, "passageiro"));
    if (c.motoristaId) emitir(empresaId, motoristaAlvo(c.motoristaId), "corrida", corridaParaApp(empresaId, c, "motorista"));
    if (motoristaAntes && motoristaAntes !== (c.motoristaId ?? "")) {
      emitir(empresaId, motoristaAlvo(motoristaAntes), "corrida", { ...corridaParaApp(empresaId, c, "motorista"), aberta: false, statusTexto: "A corrida saiu de você" });
    }
    const statusAntes = antes?.split("|")[0];
    if (statusAntes !== c.status && TEXTO_PUSH[c.status] && c.canal === "app") {
      void avisar(empresaId, passageiroAlvo(c), { titulo: STATUS_TEXTO[c.status], texto: TEXTO_PUSH[c.status]!, dados: { tipo: "corrida", corridaId: c.id }, canal: c.status === "no_local" ? "chegada" : "corridas" });
    }
    if (c.status === "cancelada" && c.motoristaId && statusAntes && statusAntes !== "cancelada" && c.canceladaPor !== "Motorista") {
      void avisar(empresaId, motoristaAlvo(c.motoristaId), { titulo: "Corrida cancelada", texto: `OS ${c.os} foi cancelada.`, dados: { tipo: "corrida", corridaId: c.id }, canal: "corridas" });
    }
    // Corrida que deixou de procurar: some a oferta pendente dela.
    if (c.status !== "procurando") for (const o of [...e.ofertas.values()]) if (o.corridaId === c.id) { e.ofertas.delete(o.id); emitir(empresaId, motoristaAlvo(o.motoristaId), "oferta_encerrada", { id: o.id }); }
  }
}

/**
 * Uma vez por minuto: esquece o que não serve mais (antes crescia para sempre, uma entrada por corrida).
 * "tentados" só vale enquanto a corrida procura motorista; "vistos" só para corridas abertas ou das últimas 24 h.
 */
const ultimaLimpeza = new Map<string, number>();
function limparMemoria(empresaId: string, e: Estado, agora: number) {
  if (agora - (ultimaLimpeza.get(empresaId) ?? 0) < 60_000) return;
  ultimaLimpeza.set(empresaId, agora);
  const porId = new Map(listarProprias(empresaId).map((c) => [c.id, c]));
  const limite = agoraBr().getTime() - 24 * 3600_000;
  for (const id of e.tentados.keys()) if (porId.get(id)?.status !== "procurando") e.tentados.delete(id);
  for (const id of e.vistos.keys()) {
    const c = porId.get(id);
    if (!c || (!ABERTA.has(c.status) && Date.parse(c.solicitadaEm) < limite)) e.vistos.delete(id);
  }
}

/** Uma volta do despacho: vence ofertas, avisa mudanças e oferece corridas. O servidor chama de tempos em tempos. */
export function ciclo(empresaId: string) {
  const e = estado(empresaId);
  const agora = Date.now();
  for (const o of [...e.ofertas.values()]) if (o.expira <= agora) passarOferta(empresaId, o, "expirou");
  for (const [id, p] of e.online) if (agora - p.em > 2 * POSICAO_MS) e.online.delete(id);
  limparMemoria(empresaId, e, agora);
  vigiar(empresaId);
  despachar(empresaId);
}

let relogio: NodeJS.Timeout | null = null;
/** Liga o despacho (index.ts chama uma vez ao subir). */
export function iniciarApps(intervaloMs = 2000) {
  if (relogio) return;
  relogio = setInterval(() => {
    const ativas = new Set([...empresasComOuvintes(), ...[...estados.entries()].filter(([, e]) => e.online.size || e.ofertas.size).map(([id]) => id)]);
    for (const id of ativas) {
      if (!listarEmpresas().some((x) => x.id === id && x.ativa)) continue;
      try { ciclo(id); } catch (err) { console.error("[apps] despacho", id, err instanceof Error ? err.message : err); }
    }
  }, intervaloMs);
  relogio.unref();
}

// ------------------------------------------------------------------ corridas abertas, pegar e contra-oferta

export interface Contraoferta { id: string; corridaId: string; motoristaId: string; valor: number; expira: number; distanciaKm: number | null }
const CONTRA_MS = 60_000;

/** Valor mínimo da categoria (o passageiro e o motorista não passam abaixo disso). */
export const descontoPeloValor = (empresaId: string, c: CorridaPropria, valor: number) => descontoDoCupom(empresaId, c.cupom, valor, c.categoria);
export const minimoDaCategoria = (empresaId: string, nome: string) => {
  const c = listar(empresaId, cadastroPorId("categorias")!).find((x) => normal(String(x.nome ?? "")) === normal(nome));
  return typeof c?.valorMinimo === "number" ? c.valorMinimo : 0;
};

const kmAteEmbarque = (e: Estado, motoristaId: string, c: CorridaPropria): number | null => {
  const p = e.online.get(motoristaId);
  return p && c.embarque.lat != null && c.embarque.lng != null ? arred(linhaReta({ lat: p.lat, lng: p.lng }, { lat: c.embarque.lat, lng: c.embarque.lng }), 1) : null;
};

function dadosDaLista(empresaId: string, c: CorridaPropria, motoristaId: string, km: number | null) {
  return {
    id: c.id, os: c.os, embarque: c.embarque, destino: c.destino ?? null, categoria: c.categoria, pagamento: c.pagamento, observacao: c.observacao,
    infoAntes: c.infoAntes ?? "", estimativa: c.estimativa, passageiro: c.passageiro.nome, paradas: c.paradas ?? [], agendadaPara: c.agendadaPara ?? null,
    status: c.status, statusTexto: STATUS_TEXTO[c.status], solicitadaEm: c.solicitadaEm, distanciaKm: km, ...extrasDaChamada(empresaId, c, motoristaId, km),
  };
}

/** As três abas do motorista: Disponíveis (pode pegar já), Pendentes (aceitas que ainda não começaram) e Programadas (agendadas). */
export function corridasAbertas(empresaId: string, motoristaId: string) {
  const e = estado(empresaId);
  const lista = listarProprias(empresaId);
  const cad = motorista(empresaId, motoristaId);
  const filtros = filtrosDoDespacho(empresaId);
  const pode = (c: CorridaPropria) => !!cad && cad.status === "Ativo" && filtros.podeAtender(c, motoristaId) && habilitado(cad, c.categoria);
  const noRaio = (c: CorridaPropria) => { const km = kmAteEmbarque(e, motoristaId, c); return km == null || km <= RAIO_KM(); };
  const procurando = lista.filter((c) => c.status === "procurando" && pode(c) && noRaio(c));
  const porDistancia = (a: CorridaPropria, b: CorridaPropria) => (kmAteEmbarque(e, motoristaId, a) ?? Infinity) - (kmAteEmbarque(e, motoristaId, b) ?? Infinity);
  const item = (c: CorridaPropria) => dadosDaLista(empresaId, c, motoristaId, kmAteEmbarque(e, motoristaId, c));
  return {
    disponiveis: procurando.filter((c) => !aindaAgendada(c)).sort(porDistancia).slice(0, 30).map(item),
    pendentes: lista.filter((c) => c.motoristaId === motoristaId && (c.status === "a_caminho" || c.status === "no_local")).sort((a, b) => horaDaCorrida(a).localeCompare(horaDaCorrida(b))).map(item),
    programadas: procurando.filter((c) => aindaAgendada(c)).sort((a, b) => horaDaCorrida(a).localeCompare(horaDaCorrida(b))).slice(0, 30).map(item),
  };
}

/** Pega uma corrida da lista (disponível ou programada) se ainda estiver livre. */
export async function pegarCorrida(empresaId: string, motoristaId: string, corridaId: string): Promise<CorridaPropria> {
  const e = estado(empresaId);
  if (!e.online.has(motoristaId)) throw new Error("Fique online para pegar corridas.");
  const lista = listarProprias(empresaId);
  const c = lista.find((x) => x.id === corridaId);
  if (!c || c.status !== "procurando") throw new Error("Esta corrida não está mais disponível.");
  if (!aindaAgendada(c) && ocupados(lista).has(motoristaId)) throw new Error("Termine a corrida em andamento antes de pegar outra.");
  const cad = motorista(empresaId, motoristaId);
  if (!cad || !filtrosDoDespacho(empresaId).podeAtender(c, motoristaId) || !habilitado(cad, c.categoria)) throw new Error("Esta corrida não é para você.");
  const feita = await atribuirMotorista(empresaId, c.id, motoristaId, "app do motorista");
  if (feita.motoristaId !== motoristaId) throw new Error("Esta corrida não está mais disponível.");
  e.contraofertas.delete(c.id);
  vigiar(empresaId);
  return feita;
}

/** O motorista propõe outro valor (bruto) para uma corrida que procura motorista. Vale 60 s. */
export function registrarContraoferta(empresaId: string, motoristaId: string, corridaId: string, valorBruto: unknown): Contraoferta {
  const e = estado(empresaId);
  if (!e.online.has(motoristaId)) throw new Error("Fique online para mandar uma contra-oferta.");
  const lista = listarProprias(empresaId);
  const c = lista.find((x) => x.id === corridaId);
  if (!c || c.status !== "procurando") throw new Error("Esta corrida não está mais disponível.");
  if (ocupados(lista).has(motoristaId)) throw new Error("Termine a corrida em andamento antes.");
  const cad = motorista(empresaId, motoristaId);
  if (!cad || cad.status !== "Ativo" || !filtrosDoDespacho(empresaId).podeAtender(c, motoristaId) || !habilitado(cad, c.categoria)) throw new Error("Esta corrida não é para você.");
  const valor = arred(Number(valorBruto));
  const base = c.valorOferecido ?? c.estimativa.valor;
  if (!(valor > 0)) throw new Error("Valor inválido.");
  if (valor < minimoDaCategoria(empresaId, c.categoria)) throw new Error("O valor está abaixo do mínimo da categoria.");
  if (base != null && valor > base * 3) throw new Error("O valor está muito acima do oferecido.");
  const o: Contraoferta = { id: crypto.randomUUID(), corridaId, motoristaId, valor, expira: Date.now() + CONTRA_MS, distanciaKm: kmAteEmbarque(e, motoristaId, c) };
  const outras = (e.contraofertas.get(corridaId) ?? []).filter((x) => x.motoristaId !== motoristaId && x.expira > Date.now());
  e.contraofertas.set(corridaId, [...outras, o]);
  emitir(empresaId, passageiroAlvo(c), "contraoferta", { corridaId, id: o.id, valor });
  void avisar(empresaId, passageiroAlvo(c), { titulo: "Nova oferta de motorista", texto: `${cad.nome ?? "Um motorista"} oferece R$ ${valor.toFixed(2).replace(".", ",")}.`, dados: { tipo: "contraoferta", corridaId }, canal: "corridas" });
  return o;
}

export const contraofertasDaCorrida = (empresaId: string, corridaId: string): Contraoferta[] =>
  (estado(empresaId).contraofertas.get(corridaId) ?? []).filter((o) => o.expira > Date.now());

/** O passageiro aceita uma contra-oferta: a corrida fica com esse motorista, no valor dele. */
export async function aceitarContraoferta(empresaId: string, telefone: string, corridaId: string, ofertaId: string): Promise<CorridaPropria> {
  const e = estado(empresaId);
  const c = corridaDoApp(empresaId, corridaId, "passageiro", telefone);
  if (c.status !== "procurando") throw new Error("A corrida já tem motorista.");
  const o = contraofertasDaCorrida(empresaId, corridaId).find((x) => x.id === ofertaId);
  if (!o) throw new Error("Esta oferta já venceu.");
  if (!e.online.has(o.motoristaId) || ocupados(listarProprias(empresaId)).has(o.motoristaId)) throw new Error("Este motorista não está mais disponível.");
  await alterarCorrida(empresaId, c.id, (x) => { x.valorOferecido = o.valor; x.desconto = descontoDoCupom(empresaId, x.cupom, o.valor, x.categoria) || null; });
  const feita = await atribuirMotorista(empresaId, c.id, o.motoristaId, "contra-oferta aceita");
  const outras = e.contraofertas.get(corridaId) ?? [];
  e.contraofertas.delete(corridaId);
  for (const x of outras) if (x.id !== o.id) emitir(empresaId, motoristaAlvo(x.motoristaId), "contraoferta_encerrada", { corridaId, id: x.id });
  vigiar(empresaId);
  return feita;
}

/** O passageiro mudou o valor oferecido: quem está com a chamada na tela recebe o valor novo. */
export function atualizarOferta(empresaId: string, corridaId: string) {
  const e = estado(empresaId);
  for (const o of e.ofertas.values()) if (o.corridaId === corridaId) emitir(empresaId, motoristaAlvo(o.motoristaId), "oferta", ofertaParaApp(empresaId, o));
}

// ------------------------------------------------------------------ maçaneta (corrida de rua)

/** O motorista pega um passageiro na rua: a corrida já nasce com ele e já em andamento. */
export async function criarMacaneta(empresaId: string, motoristaId: string, d: { modo: "taximetro" | "destino"; categoria: string; destino?: Ponto; lat: number; lng: number; passageiro?: { nome?: string; telefone?: string } }): Promise<CorridaPropria> {
  const e = estado(empresaId);
  if (!e.online.has(motoristaId)) throw new Error("Fique online para abrir uma corrida.");
  const lista = listarProprias(empresaId);
  if (ocupados(lista).has(motoristaId)) throw new Error("Você já está em uma corrida.");
  const cad = motorista(empresaId, motoristaId);
  if (!cad || cad.status !== "Ativo") throw new Error("Seu cadastro ainda não foi aprovado.");
  if (d.modo === "destino" && !d.destino?.texto?.trim()) throw new Error("Informe o destino.");
  const fone = String(d.passageiro?.telefone ?? "").replace(/\D/g, "");
  const temFone = fone.length >= 10 && fone.length <= 13;
  // Sem telefone do passageiro: um número só deste motorista (a corrida não entra no cadastro de passageiros).
  const telefone = temFone ? fone : `00${crypto.createHash("sha256").update(motoristaId).digest("hex").replace(/\D/g, "").padEnd(9, "7").slice(0, 9)}`;
  const aqui = enderecoDoPonto(empresaId, d.lat, d.lng);
  const nova = await criarCorridaPropria(empresaId, {
    passageiro: { nome: String(d.passageiro?.nome ?? "").trim() || "Passageiro de rua", telefone },
    embarque: { texto: aqui?.texto ?? "Embarque na rua (posição do motorista)", lat: d.lat, lng: d.lng },
    destino: d.modo === "destino" ? d.destino : undefined, categoria: d.categoria, pagamento: "Dinheiro", canal: "macaneta", semCadastro: !temFone,
  }, "maçaneta");
  await atribuirMotorista(empresaId, nova.id, motoristaId, "maçaneta");
  await mudarStatus(empresaId, nova.id, "em_andamento", {}, "maçaneta");
  const feita = await alterarCorrida(empresaId, nova.id, (x) => { x.macaneta = { modo: d.modo, km: 0, ultimaLat: d.lat, ultimaLng: d.lng, ultimaEm: Date.now() }; });
  vigiar(empresaId);
  return feita;
}

/** Valor final da maçaneta em taxímetro: tarifa da categoria sobre a distância e o tempo reais. */
export function valorDoTaximetro(empresaId: string, c: CorridaPropria): number | null {
  if (c.macaneta?.modo !== "taximetro") return null;
  const minutos = c.iniciadaEm ? Math.max(1, Math.round((agoraBr().getTime() - Date.parse(c.iniciadaEm)) / 60_000)) : null;
  return estimarPreco(empresaId, { categoria: c.categoria, distanciaKm: c.macaneta.km, minutos }).valor;
}

// ------------------------------------------------------------------ ganhos e central

/** Uma corrida finalizada do ponto de vista do motorista: valor da corrida, comissão da central e valor líquido. */
export function resumoDeGanho(empresaId: string, motoristaId: string, c: CorridaPropria) {
  const bruto = arred(c.valor ?? 0), desconto = arred(c.desconto ?? 0);
  const co = calcularComissao(empresaId, c.categoria, Math.max(0, arred(bruto - desconto)), motoristaId);
  const minutos = c.iniciadaEm && c.finalizadaEm ? Math.max(1, Math.round((Date.parse(c.finalizadaEm) - Date.parse(c.iniciadaEm)) / 60_000)) : c.estimativa.minutos ?? null;
  const km = c.macaneta?.km || c.estimativa.distanciaKm || null;
  const liquido = arred(bruto - co.taxaCentral);
  return {
    id: c.id, os: c.os, em: c.finalizadaEm, valor: c.valor, valorBruto: bruto, taxaCentral: co.taxaCentral, valorLiquido: liquido, desconto,
    percentualTaxa: bruto > 0 ? arred((co.taxaCentral / bruto) * 100, 1) : 0, ganhoPorKm: km && km > 0 ? arred(liquido / km) : null,
    categoria: c.categoria, pagamento: c.pagamento, canal: c.canal, km: km ? arred(km, 2) : null, minutos,
    passageiro: c.passageiro.nome, embarque: c.embarque.texto, destino: c.destino?.texto ?? "", solicitadaEm: c.solicitadaEm, iniciadaEm: c.iniciadaEm,
  };
}

const somaGanhos = (l: Array<ReturnType<typeof resumoDeGanho>>) => ({
  corridas: l.length, bruto: arred(l.reduce((s, c) => s + c.valorBruto, 0)), taxa: arred(l.reduce((s, c) => s + c.taxaCentral, 0)), liquido: arred(l.reduce((s, c) => s + c.valorLiquido, 0)),
});

export function ganhos(empresaId: string, motoristaId: string) {
  const fin = listarProprias(empresaId).filter((c) => c.motoristaId === motoristaId && c.status === "finalizada" && c.finalizadaEm);
  const agora = agoraBr().getTime();
  const hoje = agoraBr().toISOString().slice(0, 10);
  const soma = (l: CorridaPropria[]) => ({ corridas: l.length, valor: arred(l.reduce((s, c) => s + (c.valor ?? 0), 0)), km: arred(l.reduce((s, c) => s + (c.estimativa.distanciaKm ?? 0), 0), 1) });
  const desde = (dias: number) => fin.filter((c) => Date.parse(c.finalizadaEm!) >= agora - dias * 86400_000);
  const com = (l: CorridaPropria[]) => { const g = somaGanhos(l.map((c) => resumoDeGanho(empresaId, motoristaId, c))); return { liquido: g.liquido, taxa: g.taxa }; };
  const dosHoje = fin.filter((c) => c.finalizadaEm!.slice(0, 10) === hoje), dosDias = desde(7), dosMes = desde(30);
  return {
    hoje: { ...soma(dosHoje), ...com(dosHoje) }, semana: { ...soma(dosDias), ...com(dosDias) }, mes: { ...soma(dosMes), ...com(dosMes) },
    ultimas: fin.slice(-20).reverse().map((c) => ({ id: c.id, os: c.os, valor: c.valor, pagamento: c.pagamento, finalizadaEm: c.finalizadaEm, destino: c.destino?.texto ?? "", ...(({ taxaCentral, valorLiquido }) => ({ taxaCentral, valorLiquido }))(resumoDeGanho(empresaId, motoristaId, c)) })),
  };
}

/** Ganhos de uma semana (segunda a domingo) ou de um mês, com tempo online e em viagem, por dia e por forma de pagamento. */
export function ganhosPeriodo(empresaId: string, motoristaId: string, periodo: "mes" | "semana", mesPedido?: string) {
  const hoje = agoraBr();
  const dia = (d: Date) => d.toISOString().slice(0, 10);
  let inicio: Date, fim: Date;
  if (periodo === "semana") {
    inicio = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() - ((hoje.getUTCDay() + 6) % 7)));
    fim = new Date(inicio.getTime() + 6 * 86_400_000);
  } else {
    const m = /^(\d{4})-(\d{2})$/.exec(String(mesPedido ?? ""));
    const ano = m ? +m[1] : hoje.getUTCFullYear(), mes = m && +m[2] >= 1 && +m[2] <= 12 ? +m[2] - 1 : hoje.getUTCMonth();
    inicio = new Date(Date.UTC(ano, mes, 1)); fim = new Date(Date.UTC(ano, mes + 1, 0));
  }
  const [de, ate] = [dia(inicio), dia(fim)];
  const fin = listarProprias(empresaId).filter((c) => c.motoristaId === motoristaId && c.status === "finalizada" && c.finalizadaEm && c.finalizadaEm.slice(0, 10) >= de && c.finalizadaEm.slice(0, 10) <= ate);
  const porDiaMapa = new Map<string, number>();
  for (let t = inicio.getTime(); t <= fim.getTime(); t += 86_400_000) porDiaMapa.set(dia(new Date(t)), 0);
  const porPag = new Map<string, { valor: number; corridas: number }>();
  let total = 0, emViagem = 0;
  for (const c of fin) {
    const v = c.valor ?? 0;
    total += v;
    porDiaMapa.set(c.finalizadaEm!.slice(0, 10), (porDiaMapa.get(c.finalizadaEm!.slice(0, 10)) ?? 0) + v);
    const g = porPag.get(c.pagamento) ?? { valor: 0, corridas: 0 };
    porPag.set(c.pagamento, { valor: g.valor + v, corridas: g.corridas + 1 });
    if (c.iniciadaEm) emViagem += Math.max(0, (Date.parse(c.finalizadaEm!) - Date.parse(c.iniciadaEm)) / 60_000);
  }
  let online = 0;
  try { online = (banco().prepare("SELECT COALESCE(SUM(segundos), 0) AS s FROM app_online WHERE empresa = ? AND motorista = ? AND dia BETWEEN ? AND ?").get(empresaId, motoristaId, de, ate) as { s: number }).s / 60; } catch { /* sem contagem */ }
  const lista = [...fin].sort((a, b) => b.finalizadaEm!.localeCompare(a.finalizadaEm!)).map((c) => resumoDeGanho(empresaId, motoristaId, c));
  const totais = somaGanhos(lista);
  const hojeDia = dia(hoje), segunda = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() - ((hoje.getUTCDay() + 6) % 7)));
  const todas = listarProprias(empresaId).filter((c) => c.motoristaId === motoristaId && c.status === "finalizada" && c.finalizadaEm).map((c) => resumoDeGanho(empresaId, motoristaId, c));
  const kmTotal = lista.reduce((s, c) => s + (c.km ?? 0), 0);
  return {
    periodo, de, ate, total: arred(total), viagens: fin.length,
    totalBruto: totais.bruto, totalTaxa: totais.taxa, totalLiquido: totais.liquido, ganhoPorKm: kmTotal > 0 ? arred(totais.liquido / kmTotal) : null,
    hoje: somaGanhos(todas.filter((c) => c.em!.slice(0, 10) === hojeDia)), semanaAtual: somaGanhos(todas.filter((c) => c.em!.slice(0, 10) >= dia(segunda) && c.em!.slice(0, 10) <= dia(new Date(segunda.getTime() + 6 * 86_400_000)))),
    porDiaLiquido: [...new Map(lista.map((c) => [c.em!.slice(0, 10), 0] as const))].map(([d]) => ({ dia: d, ...somaGanhos(lista.filter((c) => c.em!.slice(0, 10) === d)) })), minutosOnline: Math.round(online), minutosEmViagem: Math.round(emViagem),
    porDia: [...porDiaMapa].map(([d, valor]) => ({ dia: d, valor: arred(valor) })),
    porPagamento: [...porPag].map(([pagamento, g]) => ({ pagamento, valor: arred(g.valor), corridas: g.corridas })),
    lista, realizadas: lista,
  };
}

/**
 * Motoristas livres e online por perto, para o passageiro ver no mapa na hora de pedir. Sem nome, placa nem identificador
 * (só tipo e posição, com o código mudando a cada consulta). Modo fantasma e motoristas em corrida ou em chamada não aparecem.
 */
export function motoristasPerto(empresaId: string, lat: number, lng: number, raioKm = 6, limite = 25): Array<{ lat: number; lng: number; tipo: "carro" | "moto"; categoria: string }> {
  const e = estado(empresaId);
  const busy = ocupados(listarProprias(empresaId));
  const ocultos = fantasmas(empresaId);
  const cad = new Map(motoristas(empresaId).map((m) => [m.id, m]));
  const emOferta = new Set([...e.ofertas.values()].map((o) => o.motoristaId));
  return [...e.online.entries()]
    .filter(([id, p]) => !ocultos.has(id) && !busy.has(id) && !emOferta.has(id) && Date.now() - p.em < 120_000 && linhaReta({ lat, lng }, p) <= raioKm)
    .map(([id, p]) => {
      const cats = String(cad.get(id)?.categorias ?? "").split(",").map((x) => x.trim()).filter(Boolean);
      const moto = cats.length > 0 && cats.every((c) => /moto/i.test(c));
      return { d: linhaReta({ lat, lng }, p), lat: arred(p.lat, 5), lng: arred(p.lng, 5), tipo: (moto ? "moto" : "carro") as "carro" | "moto", categoria: cats[0] ?? "" };
    })
    .sort((a, b) => a.d - b.d).slice(0, limite).map(({ d: _d, ...m }) => m);
}

/** Motoristas online (para o mapa da central). */
export function motoristasOnline(empresaId: string) {
  const e = estado(empresaId);
  const lista = listarProprias(empresaId);
  const busy = ocupados(lista);
  const cad = new Map(motoristas(empresaId).map((m) => [m.id, m]));
  const ocultos = fantasmas(empresaId); // modo fantasma: some do mapa, mas recebe corridas
  return [...e.online.entries()].filter(([id]) => !ocultos.has(id)).map(([id, p]) => ({
    id, nome: String(cad.get(id)?.nome ?? ""), placa: String(cad.get(id)?.placa ?? ""), lat: p.lat, lng: p.lng, atualizadoEm: new Date(p.em).toISOString(),
    situacao: busy.has(id) ? "em corrida" : [...e.ofertas.values()].some((o) => o.motoristaId === id) ? "recebendo chamada" : "livre",
  }));
}

// ------------------------------------------------------------------ SOS

export interface Alerta { id: string; corridaId: string; os: string; papel: PapelApp; nome: string; telefone: string; lat: number | null; lng: number | null; em: string; resolvido: boolean; resolvidoPor: string }
const arqAlertas = (empresaId: string) => arquivo(empresaId, "alertas.json");
export const alertas = (empresaId: string) => ler<Alerta[]>(arqAlertas(empresaId), []);

export function registrarSos(empresaId: string, c: CorridaPropria, papel: PapelApp, lat?: number, lng?: number): Alerta {
  const a: Alerta = {
    id: crypto.randomUUID(), corridaId: c.id, os: c.os, papel,
    nome: papel === "passageiro" ? c.passageiro.nome : c.motorista, telefone: papel === "passageiro" ? c.passageiro.telefone : c.telefoneMotorista,
    lat: lat ?? null, lng: lng ?? null, em: new Date().toISOString(), resolvido: false, resolvidoPor: "",
  };
  gravar(arqAlertas(empresaId), [...alertas(empresaId).slice(-999), a]);
  console.warn(`[apps] SOS na empresa ${empresaId}, OS ${c.os} (${papel})`);
  return a;
}

export function resolverAlerta(empresaId: string, id: string, por: string) {
  const l = structuredClone(alertas(empresaId)); // cópia: o cache é só leitura
  const a = l.find((x) => x.id === id);
  if (!a) throw new Error("Alerta não encontrado.");
  a.resolvido = true; a.resolvidoPor = por.slice(0, 120);
  gravar(arqAlertas(empresaId), l);
  return a;
}

export const temAlguem = (empresaId: string) => temOuvinte(empresaId) || estado(empresaId).online.size > 0;
