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
import { aindaAgendada, atribuirMotorista, horaDaCorrida, listarProprias, mudarStatus, STATUS_TEXTO, type CorridaPropria } from "../corridas/index.ts";
import { ehFavorito, podeAtender } from "./extras.ts";
import { linhaReta } from "../enderecos/index.ts";
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

interface Online { lat: number; lng: number; em: number; desde: number; /** último pedido do app (qualquer um) */ visto: number }

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

interface Estado {
  online: Map<string, Online>;
  ofertas: Map<string, Oferta>;
  /** corridaId → (motoristaId → quando recusou/deixou passar) */
  tentados: Map<string, Map<string, number>>;
  /** corridaId → assinatura do último estado avisado */
  vistos: Map<string, string>;
  /** Já passou a primeira volta do vigia (a primeira só anota, não avisa). */
  vigiado: boolean;
}
const estados = new Map<string, Estado>();
function estado(empresaId: string): Estado {
  let e = estados.get(empresaId);
  if (!e) estados.set(empresaId, (e = { online: new Map(), ofertas: new Map(), tentados: new Map(), vistos: new Map(), vigiado: false }));
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
    } : null,
    passageiro: { nome: c.passageiro.nome, telefone: aberta && papel === "motorista" ? c.passageiro.telefone : "" },
    paradas: c.paradas ?? [], agendadaPara: c.agendadaPara ?? null, comentario: c.comentario ?? "",
    avaliacaoPassageiro: papel === "motorista" ? c.avaliacaoPassageiro ?? null : undefined,
    taxaCancelamento: c.taxaCancelamento ?? null,
    compartilhar: papel === "passageiro" && c.compartilhamento ? `acompanhar/${c.compartilhamento}` : null,
    motoristaId: papel === "passageiro" ? c.motoristaId : undefined,
  };
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
  e.online.set(motoristaId, { lat, lng, em: Date.now(), desde: antes?.desde ?? Date.now(), visto: Date.now() });
  if (!antes) despachar(empresaId);
}

export function ficarOffline(empresaId: string, motoristaId: string) {
  const e = estado(empresaId);
  e.online.delete(motoristaId);
  for (const o of [...e.ofertas.values()]) if (o.motoristaId === motoristaId) passarOferta(empresaId, o);
}

export const estaOnline = (empresaId: string, motoristaId: string) => estado(empresaId).online.has(motoristaId);

/** Nova posição do motorista. Se ele estiver numa corrida, o passageiro vê a posição. */
export function atualizarPosicao(empresaId: string, motoristaId: string, lat: number, lng: number) {
  const e = estado(empresaId);
  if (!e.online.has(motoristaId)) { const erro = new Error("Fique online de novo."); (erro as Error & { status?: number }).status = 409; throw erro; }
  ficarOnline(empresaId, motoristaId, lat, lng);
  const c = corridaAtual(empresaId, "motorista", motoristaId);
  if (c && ABERTA_COM_MOTORISTA.has(c.status)) emitir(empresaId, passageiroAlvo(c), "posicao", { corridaId: c.id, lat, lng, em: Date.now() });
}

export function posicaoDoMotorista(empresaId: string, motoristaId: string) {
  const o = estado(empresaId).online.get(motoristaId);
  return o ? { lat: o.lat, lng: o.lng, em: o.em } : null;
}

// ------------------------------------------------------------------ oferta

const ocupados = (lista: CorridaPropria[]) => new Set(lista.filter((c) => c.motoristaId && ABERTA_COM_MOTORISTA.has(c.status)).map((c) => c.motoristaId!));

/** O motorista pode levar essa categoria? Campo "categorias" vazio no cadastro = todas. */
function habilitado(cadastro: Record<string, unknown> | undefined, categoria: string) {
  const cats = String(cadastro?.categorias ?? "").split(",").map((x) => normal(x)).filter(Boolean);
  return !cats.length || cats.includes(normal(categoria));
}

export function ofertaDoMotorista(empresaId: string, motoristaId: string) {
  return [...estado(empresaId).ofertas.values()].find((o) => o.motoristaId === motoristaId && o.expira > Date.now()) ?? null;
}

export function ofertaParaApp(empresaId: string, o: Oferta) {
  const c = listarProprias(empresaId).find((x) => x.id === o.corridaId);
  if (!c) return null;
  return {
    id: o.id, expira: o.expira, segundos: Math.max(0, Math.round((o.expira - Date.now()) / 1000)), distanciaKm: o.distanciaKm,
    corrida: { id: c.id, os: c.os, embarque: c.embarque, destino: c.destino ?? null, categoria: c.categoria, pagamento: c.pagamento, observacao: c.observacao, estimativa: c.estimativa, passageiro: c.passageiro.nome },
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
  let n = 0;
  for (const c of lista.filter((x) => x.status === "procurando" && !corridasComOferta.has(x.id) && !aindaAgendada(x)).sort((a, b) => horaDaCorrida(a).localeCompare(horaDaCorrida(b)))) {
    const tentados = e.tentados.get(c.id) ?? new Map<string, number>();
    let melhor: { id: string; km: number | null } | null = null;
    for (const [id, p] of e.online) {
      if (busy.has(id) || comOferta.has(id) || agora - p.em > POSICAO_MS) continue;
      if (agora - p.visto > VISTO_MS && !conectado(empresaId, motoristaAlvo(id))) continue; // fechou o app
      if (!podeAtender(empresaId, c, id)) continue; // bloqueio de um dos lados ou categoria que ele não quer
      if ((tentados.get(id) ?? 0) > agora - REOFERTA_MS) continue;
      const cad = cadastro.get(id);
      if (!cad || cad.status !== "Ativo" || !habilitado(cad, c.categoria)) continue;
      const km = c.embarque.lat != null && c.embarque.lng != null ? linhaReta({ lat: p.lat, lng: p.lng }, { lat: c.embarque.lat, lng: c.embarque.lng }) : null;
      if (km != null && km > RAIO_KM()) continue;
      // Sem coordenada no embarque: vai para quem está online há mais tempo.
      const pior = (a: { id: string; km: number | null }) => (a.km ?? Infinity);
      // Motorista favorito do passageiro (dentro do raio) passa na frente; depois, o mais perto.
      const fav = ehFavorito(empresaId, c.passageiro.telefone, id), favMelhor = !!melhor && ehFavorito(empresaId, c.passageiro.telefone, melhor.id);
      if (!melhor || (fav && !favMelhor) || (fav === favMelhor && ((km ?? Infinity) < pior(melhor) || (km == null && melhor.km == null && p.desde < e.online.get(melhor.id)!.desde)))) melhor = { id, km };
    }
    if (!melhor) continue;
    const o: Oferta = { id: crypto.randomUUID(), corridaId: c.id, motoristaId: melhor.id, expira: agora + OFERTA_MS(), distanciaKm: melhor.km != null ? arred(melhor.km, 1) : null };
    e.ofertas.set(o.id, o);
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

function passarOferta(empresaId: string, o: Oferta) {
  const e = estado(empresaId);
  e.ofertas.delete(o.id);
  const t = e.tentados.get(o.corridaId) ?? new Map<string, number>();
  t.set(o.motoristaId, Date.now());
  e.tentados.set(o.corridaId, t);
  emitir(empresaId, motoristaAlvo(o.motoristaId), "oferta_encerrada", { id: o.id });
}

export function recusar(empresaId: string, motoristaId: string, ofertaId: string) {
  const o = estado(empresaId).ofertas.get(ofertaId);
  if (!o || o.motoristaId !== motoristaId) throw new Error("Esta chamada já passou.");
  passarOferta(empresaId, o);
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
  e.tentados.delete(c.id);
  vigiar(empresaId);
  return feita;
}

/** Motorista desiste antes de chegar: a corrida volta a procurar outro (e ele não recebe essa de novo logo). */
export async function desistir(empresaId: string, motoristaId: string, corridaId: string) {
  const c = await mudarStatus(empresaId, corridaId, "procurando", { nota: "Motorista desistiu pelo app" }, "app do motorista");
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
  a_caminho: "Seu motorista está a caminho.", no_local: "Seu motorista chegou.", em_andamento: "Boa viagem!",
  finalizada: "Corrida finalizada. Avalie o motorista.", cancelada: "A corrida foi cancelada.", nao_atendida: "Não achamos motorista agora. Tente de novo.",
};

/** Compara as corridas com o último estado avisado e manda o evento "corrida" para quem está nela. */
export function vigiar(empresaId: string) {
  const e = estado(empresaId);
  const lista = listarProprias(empresaId);
  const primeiraVez = !e.vigiado;
  e.vigiado = true;
  const limite = agoraBr().getTime() - 24 * 3600_000;
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
      void avisar(empresaId, passageiroAlvo(c), { titulo: STATUS_TEXTO[c.status], texto: TEXTO_PUSH[c.status]!, dados: { tipo: "corrida", corridaId: c.id }, canal: "corridas" });
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
  for (const o of [...e.ofertas.values()]) if (o.expira <= agora) passarOferta(empresaId, o);
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

// ------------------------------------------------------------------ ganhos e central

export function ganhos(empresaId: string, motoristaId: string) {
  const fin = listarProprias(empresaId).filter((c) => c.motoristaId === motoristaId && c.status === "finalizada" && c.finalizadaEm);
  const agora = agoraBr().getTime();
  const hoje = agoraBr().toISOString().slice(0, 10);
  const soma = (l: CorridaPropria[]) => ({ corridas: l.length, valor: arred(l.reduce((s, c) => s + (c.valor ?? 0), 0)), km: arred(l.reduce((s, c) => s + (c.estimativa.distanciaKm ?? 0), 0), 1) });
  const desde = (dias: number) => fin.filter((c) => Date.parse(c.finalizadaEm!) >= agora - dias * 86400_000);
  return {
    hoje: soma(fin.filter((c) => c.finalizadaEm!.slice(0, 10) === hoje)), semana: soma(desde(7)), mes: soma(desde(30)),
    ultimas: fin.slice(-20).reverse().map((c) => ({ id: c.id, os: c.os, valor: c.valor, pagamento: c.pagamento, finalizadaEm: c.finalizadaEm, destino: c.destino?.texto ?? "" })),
  };
}

/** Motoristas online (para o mapa da central). */
export function motoristasOnline(empresaId: string) {
  const e = estado(empresaId);
  const lista = listarProprias(empresaId);
  const busy = ocupados(lista);
  const cad = new Map(motoristas(empresaId).map((m) => [m.id, m]));
  return [...e.online.entries()].map(([id, p]) => ({
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
