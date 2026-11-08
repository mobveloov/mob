// Corridas próprias: o painel é o sistema da empresa. A corrida nasce aqui (painel, bot ou totem), recebe preço pela
// tarifa da categoria (cadastro "categorias"), é atribuída a um motorista do cadastro e muda de status até o fim.
// Não precisa de nenhuma chave de sistema externo. Fica em DADOS_DIR/empresas/<id>/corridas.json.
//
// Usado por: painel (Solicitar corrida, Consultar corridas), bot de WhatsApp, totem e CRM.

import { completarPonto, rota } from "../enderecos/index.ts";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { cadastroPorId } from "../comum/cadastros.ts";
import { corridaVazia, type CorridaPainel, type GrupoStatus } from "../comum/corrida.ts";
import { listar, mesclar, type Registro } from "../cadastros/armazem.ts";
import { idValido, raiz } from "../servidor/dados.ts";
import { agoraBr, normal } from "../servidor/util.ts";

export type StatusProprio = "procurando" | "a_caminho" | "no_local" | "em_andamento" | "finalizada" | "cancelada" | "nao_atendida";
export type Canal = "painel" | "bot" | "totem" | "app";

export const STATUS_TEXTO: Record<StatusProprio, string> = {
  procurando: "Procurando motorista", a_caminho: "Motorista a caminho", no_local: "Motorista no local", em_andamento: "Em andamento",
  finalizada: "Finalizada", cancelada: "Cancelada", nao_atendida: "Não atendida",
};
const GRUPO: Record<StatusProprio, GrupoStatus> = {
  procurando: "aberta", a_caminho: "aberta", no_local: "aberta", em_andamento: "aberta", finalizada: "finalizada", cancelada: "cancelada", nao_atendida: "nao_atendida",
};
/** Próximos status permitidos a partir de cada um. */
const PROXIMOS: Record<StatusProprio, StatusProprio[]> = {
  procurando: ["a_caminho", "cancelada", "nao_atendida"], a_caminho: ["no_local", "em_andamento", "cancelada", "procurando"],
  no_local: ["em_andamento", "cancelada"], em_andamento: ["finalizada", "cancelada"], finalizada: [], cancelada: [], nao_atendida: [],
};

export interface Ponto { texto: string; lat?: number; lng?: number }
export interface NovaCorridaPropria {
  passageiro: { nome: string; telefone: string };
  embarque: Ponto;
  destino?: Ponto;
  categoria: string;
  pagamento: string;
  canal: Canal;
  observacao?: string;
  /** Distância informada por quem pediu (quando não há coordenadas). */
  distanciaKm?: number;
  cupom?: string;
}

export interface CorridaPropria {
  id: string;
  os: string;
  status: StatusProprio;
  canal: Canal;
  passageiro: { nome: string; telefone: string };
  embarque: Ponto;
  destino?: Ponto;
  categoria: string;
  pagamento: string;
  observacao: string;
  motoristaId: string | null;
  motorista: string;
  telefoneMotorista: string;
  estimativa: { valor: number | null; distanciaKm: number | null; minutos: number | null };
  valor: number | null;
  cupom: string;
  desconto: number | null;
  canceladaPor: string;
  motivoCancelamento: string;
  avaliacao: number | null;
  /** Datas no padrão do painel (horário de Brasília gravado como UTC). */
  solicitadaEm: string;
  iniciadaEm: string | null;
  finalizadaEm: string | null;
  historico: Array<{ em: string; status: StatusProprio; por: string; nota?: string }>;
}

// ------------------------------------------------------------------ armazenamento

function arquivo(empresaId: string) {
  if (!idValido(empresaId)) throw new Error("Empresa inválida.");
  return path.join(raiz(), "empresas", empresaId, "corridas.json");
}
export function listarProprias(empresaId: string): CorridaPropria[] {
  try { return JSON.parse(fs.readFileSync(arquivo(empresaId), "utf8")) as CorridaPropria[]; } catch { return []; }
}
function gravar(empresaId: string, l: CorridaPropria[]) {
  const arq = arquivo(empresaId);
  fs.mkdirSync(path.dirname(arq), { recursive: true });
  const tmp = `${arq}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(l));
  fs.renameSync(tmp, arq);
}
/** Trava simples por empresa: evita duas gravações ao mesmo tempo no mesmo processo. */
const filas = new Map<string, Promise<unknown>>();
function emFila<T>(empresaId: string, fn: () => T): Promise<T> {
  const antes = filas.get(empresaId) ?? Promise.resolve();
  const agora = antes.then(fn, fn);
  filas.set(empresaId, agora.catch(() => undefined));
  return agora;
}

// ------------------------------------------------------------------ preço

const arred = (n: number, c = 2) => Math.round(n * 10 ** c) / 10 ** c;

/** Distância em linha reta (km) × 1,3 (ruas não são retas). */
export function distanciaEstimada(a?: Ponto, b?: Ponto): number | null {
  if (a?.lat == null || a.lng == null || b?.lat == null || b.lng == null) return null;
  const R = 6371, r = (g: number) => (g * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return arred(2 * R * Math.asin(Math.sqrt(h)) * 1.3, 2);
}

const categorias = (empresaId: string) => listar(empresaId, cadastroPorId("categorias")!);
const achar = (l: Registro[], campo: string, v: string) => l.find((r) => normal(String(r[campo] ?? "")) === normal(v));

/** Preço pela tarifa da categoria. Sem tarifa cadastrada: valor null (o operador combina). */
export function estimarPreco(empresaId: string, p: { categoria: string; distanciaKm?: number | null; minutos?: number | null }) {
  const cat = achar(categorias(empresaId), "nome", p.categoria);
  const km = p.distanciaKm ?? null;
  const minutos = p.minutos ?? (km != null ? arred(km * 2.5, 0) : null);
  if (!cat) return { valor: null, distanciaKm: km, minutos, categoria: null as string | null };
  const n = (k: string) => (typeof cat[k] === "number" ? (cat[k] as number) : 0);
  if (!n("bandeirada") && !n("valorKm") && !n("valorMinuto") && !n("valorMinimo")) return { valor: null, distanciaKm: km, minutos, categoria: String(cat.nome) };
  let valor = n("bandeirada") + (km ?? 0) * n("valorKm") + (minutos ?? 0) * n("valorMinuto");
  const h = agoraBr().getUTCHours();
  if ((h >= 23 || h < 6) && n("tarifaNoturna")) valor *= 1 + n("tarifaNoturna") / 100;
  valor = Math.max(valor, n("valorMinimo"));
  return { valor: arred(valor), distanciaKm: km, minutos, categoria: String(cat.nome) };
}

/** Aplica um cupom ativo do cadastro. Devolve o desconto em reais (0 se não vale). */
export function descontoDoCupom(empresaId: string, codigo: string, valor: number | null, categoria: string): number {
  if (!codigo || valor == null) return 0;
  const c = achar(listar(empresaId, cadastroPorId("cupons")!), "codigo", codigo);
  if (!c || c.ativo !== true) return 0;
  const hoje = agoraBr().toISOString().slice(0, 10);
  if ((c.inicio && String(c.inicio) > hoje) || (c.fim && String(c.fim) < hoje)) return 0;
  const cats = String(c.categorias ?? "").split(",").map((x) => normal(x)).filter(Boolean);
  if (cats.length && !cats.includes(normal(categoria))) return 0;
  const v = Number(c.valor) || 0;
  let d = c.tipoDesconto === "Valor fixo" ? v : (valor * v) / 100;
  if (typeof c.valorMaximo === "number" && c.valorMaximo > 0) d = Math.min(d, c.valorMaximo);
  return arred(Math.min(d, valor));
}

// ------------------------------------------------------------------ ciclo da corrida

const soDigitos = (s: string) => String(s ?? "").replace(/\D/g, "");

/** Pede uma corrida própria. Endereço só em texto ganha coordenada pelo CNEFE (se houver); distância e tempo pela rota (OSRM, se houver). */
export async function criarCorridaPropria(empresaId: string, pedido: NovaCorridaPropria, por = "sistema"): Promise<CorridaPropria> {
  const n: NovaCorridaPropria = { ...pedido, embarque: completarPonto(empresaId, pedido.embarque) ?? pedido.embarque, destino: completarPonto(empresaId, pedido.destino) };
  let minutos: number | null = null;
  if (n.distanciaKm == null && n.embarque?.lat != null && n.embarque.lng != null && n.destino?.lat != null && n.destino.lng != null) {
    const r = await rota({ lat: n.embarque.lat, lng: n.embarque.lng }, { lat: n.destino.lat, lng: n.destino.lng });
    n.distanciaKm = r.distanciaKm; minutos = r.minutos;
  }
  return emFila(empresaId, () => {
    const nome = String(n.passageiro?.nome ?? "").trim().slice(0, 80);
    const telefone = soDigitos(n.passageiro?.telefone ?? "");
    if (!nome) throw new Error("Informe o nome do passageiro.");
    if (telefone.length < 10 || telefone.length > 13) throw new Error("Telefone do passageiro precisa de DDD e número.");
    if (!String(n.embarque?.texto ?? "").trim()) throw new Error("Informe o endereço de embarque.");
    if (!String(n.pagamento ?? "").trim()) throw new Error("Escolha a forma de pagamento.");
    const cats = categorias(empresaId);
    const cat = achar(cats, "nome", n.categoria ?? "");
    if (cats.length && (!cat || cat.ativa === false)) throw new Error("Categoria inválida ou desligada.");
    const cliente = listar(empresaId, cadastroPorId("clientes")!).find((c) => c.telefone === telefone);
    if (cliente && (cliente.status === "Bloqueado" || cliente.status === "Suspenso")) throw new Error("Este passageiro está bloqueado.");

    const lista = listarProprias(empresaId);
    // Mesmo passageiro com corrida em aberto: não cria outra (proteção contra toque duplo).
    const aberta = lista.find((c) => c.passageiro.telefone === telefone && GRUPO[c.status] === "aberta");
    if (aberta) throw new Error(`Este passageiro já tem uma corrida em aberto (OS ${aberta.os}).`);

    const km = n.distanciaKm ?? distanciaEstimada(n.embarque, n.destino);
    const est = estimarPreco(empresaId, { categoria: n.categoria, distanciaKm: km, minutos });
    const desconto = descontoDoCupom(empresaId, n.cupom ?? "", est.valor, n.categoria);
    const agora = agoraBr().toISOString();
    const maiorOs = lista.reduce((m, c) => Math.max(m, Number(c.os) || 0), 100000);
    const corrida: CorridaPropria = {
      id: crypto.randomUUID(), os: String(maiorOs + 1), status: "procurando", canal: n.canal,
      passageiro: { nome, telefone }, embarque: { ...n.embarque, texto: n.embarque.texto.trim().slice(0, 200) },
      destino: n.destino?.texto?.trim() ? { ...n.destino, texto: n.destino.texto.trim().slice(0, 200) } : undefined,
      categoria: est.categoria ?? String(n.categoria ?? "").slice(0, 60), pagamento: n.pagamento.trim().slice(0, 40),
      observacao: String(n.observacao ?? "").replace(/[<>]/g, "").slice(0, 500),
      motoristaId: null, motorista: "", telefoneMotorista: "",
      estimativa: { valor: est.valor, distanciaKm: est.distanciaKm, minutos: est.minutos },
      valor: null, cupom: desconto ? String(n.cupom).toUpperCase() : "", desconto: desconto || null,
      canceladaPor: "", motivoCancelamento: "", avaliacao: null,
      solicitadaEm: agora, iniciadaEm: null, finalizadaEm: null,
      historico: [{ em: agora, status: "procurando", por }],
    };
    gravar(empresaId, [...lista, corrida]);
    // O passageiro entra (ou é atualizado) no cadastro de clientes.
    mesclar(empresaId, cadastroPorId("clientes")!, [{ nome, telefone, status: "Ativo" }], por);
    return corrida;
  });
}

function alterar(empresaId: string, id: string, fn: (c: CorridaPropria) => void): Promise<CorridaPropria> {
  return emFila(empresaId, () => {
    const lista = listarProprias(empresaId);
    const c = lista.find((x) => x.id === id || x.os === id);
    if (!c) throw new Error("Corrida não encontrada.");
    fn(c);
    gravar(empresaId, lista);
    return c;
  });
}

export function atribuirMotorista(empresaId: string, id: string, motoristaId: string, por = "sistema") {
  return alterar(empresaId, id, (c) => {
    if (GRUPO[c.status] !== "aberta" || c.status === "em_andamento") throw new Error("Só dá para trocar o motorista antes de a corrida começar.");
    const m = listar(empresaId, cadastroPorId("motoristas")!).find((x) => x.id === motoristaId);
    if (!m) throw new Error("Motorista não encontrado.");
    if (m.status !== "Ativo") throw new Error("Este motorista não está ativo.");
    c.motoristaId = m.id; c.motorista = String(m.nome ?? ""); c.telefoneMotorista = String(m.telefone ?? "");
    const agora = agoraBr().toISOString();
    if (c.status === "procurando") c.status = "a_caminho";
    c.historico.push({ em: agora, status: c.status, por, nota: `Motorista: ${c.motorista}` });
  });
}

export function mudarStatus(empresaId: string, id: string, novo: StatusProprio, extra: { valor?: number; avaliacao?: number; nota?: string } = {}, por = "sistema") {
  return alterar(empresaId, id, (c) => {
    if (novo === "cancelada") throw new Error("Use cancelar para cancelar a corrida.");
    if (!PROXIMOS[c.status].includes(novo)) throw new Error(`Não dá para ir de "${STATUS_TEXTO[c.status]}" para "${STATUS_TEXTO[novo]}".`);
    if ((novo === "a_caminho" || novo === "em_andamento") && !c.motoristaId) throw new Error("Atribua um motorista antes.");
    const agora = agoraBr().toISOString();
    if (novo === "procurando") { c.motoristaId = null; c.motorista = ""; c.telefoneMotorista = ""; }
    if (novo === "em_andamento") c.iniciadaEm = agora;
    if (novo === "finalizada") {
      c.finalizadaEm = agora;
      const base = extra.valor ?? c.estimativa.valor;
      if (base == null || !(base >= 0)) throw new Error("Informe o valor da corrida para finalizar.");
      c.valor = arred(Math.max(0, base - (c.desconto ?? 0)));
    }
    if (extra.avaliacao != null && extra.avaliacao >= 1 && extra.avaliacao <= 5) c.avaliacao = Math.round(extra.avaliacao);
    c.status = novo;
    c.historico.push({ em: agora, status: novo, por, nota: extra.nota?.slice(0, 200) });
  });
}

export function cancelarCorrida(empresaId: string, id: string, quem: "Passageiro" | "Motorista" | "Central", motivo: string, por = "sistema") {
  return alterar(empresaId, id, (c) => {
    if (GRUPO[c.status] !== "aberta") throw new Error("Esta corrida já terminou.");
    c.status = "cancelada"; c.canceladaPor = quem; c.motivoCancelamento = String(motivo ?? "").slice(0, 200);
    c.historico.push({ em: agoraBr().toISOString(), status: "cancelada", por, nota: `${quem}: ${c.motivoCancelamento}` });
  });
}

export function avaliar(empresaId: string, id: string, nota: number, por = "sistema") {
  return alterar(empresaId, id, (c) => {
    if (c.status !== "finalizada") throw new Error("Só dá para avaliar corrida finalizada.");
    if (!(nota >= 1 && nota <= 5)) throw new Error("A nota vai de 1 a 5.");
    c.avaliacao = Math.round(nota);
    c.historico.push({ em: agoraBr().toISOString(), status: c.status, por, nota: `Avaliação ${c.avaliacao}` });
  });
}

/** Sem motorista por muito tempo: vira "não atendida" (chame de tempos em tempos). */
export function encerrarSemMotorista(empresaId: string, minutos = 20) {
  return emFila(empresaId, () => {
    const lista = listarProprias(empresaId);
    const limite = agoraBr().getTime() - minutos * 60_000;
    let n = 0;
    for (const c of lista) if (c.status === "procurando" && Date.parse(c.solicitadaEm) < limite) {
      c.status = "nao_atendida"; c.historico.push({ em: agoraBr().toISOString(), status: "nao_atendida", por: "sistema" }); n++;
    }
    if (n) gravar(empresaId, lista);
    return n;
  });
}

// ------------------------------------------------------------------ para as telas e a análise

const CANAL_TEXTO: Record<Canal, string> = { painel: "Central", bot: "WhatsApp", totem: "Totem", app: "App" };

export function corridaPropriaParaPainel(c: CorridaPropria, origemNome = "Próprias"): CorridaPainel {
  return {
    ...corridaVazia({ id: `propria:${c.id}`, origem: "propria", origemNome, os: c.os, grupo: GRUPO[c.status], statusTexto: STATUS_TEXTO[c.status] }),
    solicitadaEm: c.solicitadaEm, iniciadaEm: c.iniciadaEm, finalizadaEm: c.finalizadaEm,
    categoria: c.categoria, pagamento: c.pagamento, canal: CANAL_TEXTO[c.canal] ?? c.canal,
    motorista: c.motorista, telefoneMotorista: c.telefoneMotorista, passageiro: c.passageiro.nome, telefonePassageiro: c.passageiro.telefone,
    embarque: c.embarque.texto, destino: c.destino?.texto ?? "", observacao: c.observacao,
    valor: c.valor, valorEstimado: c.estimativa.valor, valorSemDesconto: c.valor != null && c.desconto ? arred(c.valor + c.desconto) : c.valor,
    desconto: c.desconto, cupom: c.cupom, distanciaKm: c.estimativa.distanciaKm, avaliacao: c.avaliacao,
    canceladaPor: c.canceladaPor, motivoCancelamento: c.motivoCancelamento,
  };
}
