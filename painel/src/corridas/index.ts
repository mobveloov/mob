// Corridas próprias: o painel é o sistema da empresa. A corrida nasce aqui (painel, bot ou totem), recebe preço pela
// tarifa da categoria (cadastro "categorias"), é atribuída a um motorista do cadastro e muda de status até o fim.
// Não precisa de nenhuma chave de sistema externo. Fica em DADOS_DIR/empresas/<id>/corridas.json.
//
// Usado por: painel (Solicitar corrida, Consultar corridas), bot de WhatsApp, totem e CRM.

import { aplicarDinamica } from "../config/dinamica.ts";
import { completarPonto, rota } from "../enderecos/index.ts";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { cadastroPorId } from "../comum/cadastros.ts";
import { corridaVazia, type CorridaPainel, type GrupoStatus } from "../comum/corrida.ts";
import { listar, mesclar, type Registro } from "../cadastros/armazem.ts";
import { idValido, raiz } from "../servidor/dados.ts";
import { agoraBr, normal } from "../servidor/util.ts";
import { arquivoDoBanco, banco, migrarUmaVez, transacao } from "../servidor/banco.ts";

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
  /** Paradas no caminho, na ordem (no máximo 3). */
  paradas?: Ponto[];
  /** Corrida agendada: "AAAA-MM-DDTHH:MM" no horário de Brasília (de 15 min a 30 dias para frente). */
  agendadaPara?: string;
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
  paradas?: Ponto[];
  /** Agendada: quando buscar o motorista (padrão do painel: Brasília gravado como UTC). */
  agendadaPara?: string | null;
  /** Comentário do passageiro junto com a nota. */
  comentario?: string;
  /** Nota que o motorista deu ao passageiro. */
  avaliacaoPassageiro?: { nota: number; comentario: string } | null;
  /** Taxa cobrada do passageiro que cancelou depois do prazo (categoria). */
  taxaCancelamento?: number | null;
  /** Código do link público de acompanhamento ("compartilhar viagem"). */
  compartilhamento?: string;
  /** Quando o motorista foi atribuído (para a taxa de cancelamento). */
  atribuidaEm?: string | null;
}

/** Hora de referência da corrida: a agendada (se houver) ou a do pedido. */
export const horaDaCorrida = (c: CorridaPropria) => c.agendadaPara ?? c.solicitadaEm;

/** Agendada para mais de 15 min à frente: ainda não procura motorista. */
export function aindaAgendada(c: CorridaPropria, agora = agoraBr().getTime()) {
  return !!c.agendadaPara && Date.parse(c.agendadaPara) - agora > 15 * 60_000;
}

// ------------------------------------------------------------------ armazenamento

function arquivo(empresaId: string) {
  if (!idValido(empresaId)) throw new Error("Empresa inválida.");
  return path.join(raiz(), "empresas", empresaId, "corridas.json");
}
// Corridas próprias ficam no banco do painel (tabela corridas_proprias, uma linha por corrida). Antes, cada mudança
// regravava o corridas.json inteiro da empresa: com centenas de corridas abertas, a fila travava (teste de carga).
// O corridas.json antigo entra no banco na primeira vez e vira corridas.json.migrado (guardado).
// Na memória fica uma lista só de leitura por empresa, atualizada a cada gravação (sem reler o banco).
const memoria = new Map<string, { arquivoBanco: string; lista: readonly CorridaPropria[] }>();

function congelar<T>(v: T): T {
  if (v && typeof v === "object" && !Object.isFrozen(v)) { Object.freeze(v); for (const x of Object.values(v as object)) congelar(x); }
  return v;
}

export function listarProprias(empresaId: string): CorridaPropria[] {
  const arq = arquivo(empresaId); // valida o id da empresa
  const m = memoria.get(empresaId);
  if (m && m.arquivoBanco === arquivoDoBanco()) return m.lista as CorridaPropria[];
  migrarUmaVez(empresaId, "corridas_proprias", arq, (conteudo) => {
    const l = Array.isArray(conteudo) ? (conteudo as CorridaPropria[]).filter((c) => c && typeof c.id === "string") : [];
    for (const c of l) gravarLinha(empresaId, c);
    return l.length;
  });
  const lista = banco().prepare("SELECT dados FROM corridas_proprias WHERE empresa = ? ORDER BY os_num, id").all(empresaId)
    .map((r) => congelar(JSON.parse(String((r as { dados: string }).dados)) as CorridaPropria));
  memoria.set(empresaId, { arquivoBanco: arquivoDoBanco(), lista: Object.freeze(lista) });
  return lista;
}

function gravarLinha(empresaId: string, c: CorridaPropria) {
  banco().prepare(`INSERT INTO corridas_proprias (empresa, id, os_num, status, telefone, motorista_id, solicitada_em, dados) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (empresa, id) DO UPDATE SET os_num = excluded.os_num, status = excluded.status, telefone = excluded.telefone,
      motorista_id = excluded.motorista_id, solicitada_em = excluded.solicitada_em, dados = excluded.dados`)
    .run(empresaId, c.id, Number(c.os) || 0, c.status, c.passageiro?.telefone ?? "", c.motoristaId ?? null, c.solicitadaEm ?? "", JSON.stringify(c));
}

/** Grava as corridas mudadas (tudo ou nada) e atualiza a lista da memória. */
function gravar(empresaId: string, mudadas: CorridaPropria[]) {
  if (!mudadas.length) return;
  const atual = listarProprias(empresaId);
  transacao(() => { for (const c of mudadas) gravarLinha(empresaId, c); });
  const novas = new Map(mudadas.map((c) => [c.id, congelar(structuredClone(c))]));
  const lista = atual.map((c) => novas.get(c.id) ?? c);
  for (const [id, c] of novas) if (!atual.some((x) => x.id === id)) lista.push(c);
  memoria.set(empresaId, { arquivoBanco: arquivoDoBanco(), lista: Object.freeze(lista) });
}

/** Só para testes: esquece a lista da memória (força ler do banco). */
export const esquecerCorridasDaMemoria = () => memoria.clear();

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
export function estimarPreco(empresaId: string, p: { categoria: string; distanciaKm?: number | null; minutos?: number | null; embarque?: Ponto }) {
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
  // Tarifas dinâmicas (Config › Tarifas Dinâmicas) ligadas à categoria: horário, área no mapa e alta demanda.
  const demanda = listarProprias(empresaId).filter((x) => x.status === "procurando" || x.status === "a_caminho" || x.status === "no_local" || x.status === "em_andamento").length;
  valor = aplicarDinamica(empresaId, { categoria: String(cat.nome), valor: arred(valor), embarque: p.embarque, demanda }).valor;
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
  const pedidas = (pedido.paradas ?? []).filter((p) => String(p?.texto ?? "").trim());
  if (pedidas.length > 3) throw new Error("No máximo 3 paradas.");
  const paradas = pedidas.map((p) => completarPonto(empresaId, { ...p, texto: String(p.texto).trim().slice(0, 200) })!);
  const n: NovaCorridaPropria = { ...pedido, paradas, embarque: completarPonto(empresaId, pedido.embarque) ?? pedido.embarque, destino: completarPonto(empresaId, pedido.destino) };
  let agendadaPara: string | null = null;
  if (pedido.agendadaPara) {
    const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(String(pedido.agendadaPara));
    if (!m) throw new Error("Data do agendamento inválida.");
    agendadaPara = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])).toISOString();
    const falta = Date.parse(agendadaPara) - agoraBr().getTime();
    if (falta < 15 * 60_000) throw new Error("Agende com pelo menos 15 minutos de antecedência.");
    if (falta > 30 * 86_400_000) throw new Error("Agende para no máximo 30 dias.");
  }
  let minutos: number | null = null;
  // Distância pela rota: embarque -> paradas -> destino (só quando todos os pontos têm coordenada).
  const pontos = [n.embarque, ...paradas, n.destino].filter(Boolean) as Ponto[];
  if (n.distanciaKm == null && n.destino && pontos.every((p) => p.lat != null && p.lng != null)) {
    let km = 0, min = 0;
    for (let i = 1; i < pontos.length; i++) {
      const r = await rota({ lat: pontos[i - 1].lat!, lng: pontos[i - 1].lng! }, { lat: pontos[i].lat!, lng: pontos[i].lng! });
      km += r.distanciaKm; min += r.minutos;
    }
    n.distanciaKm = arred(km); minutos = min;
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
    const doPassageiro = lista.filter((c) => c.passageiro.telefone === telefone && GRUPO[c.status] === "aberta");
    if (!agendadaPara) {
      const aberta = doPassageiro.find((c) => !aindaAgendada(c));
      if (aberta) throw new Error(`Este passageiro já tem uma corrida em aberto (OS ${aberta.os}).`);
    } else if (doPassageiro.filter((c) => aindaAgendada(c)).length >= 3) throw new Error("No máximo 3 corridas agendadas por passageiro.");

    const km = n.distanciaKm ?? distanciaEstimada(n.embarque, n.destino);
    const est = estimarPreco(empresaId, { categoria: n.categoria, distanciaKm: km, minutos, embarque: n.embarque });
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
      historico: [{ em: agora, status: "procurando", por, ...(agendadaPara ? { nota: `Agendada para ${agendadaPara.slice(0, 16).replace("T", " ")}` } : {}) }],
      ...(paradas.length ? { paradas } : {}),
      ...(agendadaPara ? { agendadaPara } : {}),
      compartilhamento: crypto.randomBytes(12).toString("base64url"),
    };
    gravar(empresaId, [corrida]);
    // O passageiro entra (ou é atualizado) no cadastro de clientes.
    mesclar(empresaId, cadastroPorId("clientes")!, [{ nome, telefone, status: "Ativo" }], por);
    return corrida;
  });
}

function alterar(empresaId: string, id: string, fn: (c: CorridaPropria) => void): Promise<CorridaPropria> {
  return emFila(empresaId, () => {
    const achada = listarProprias(empresaId).find((x) => x.id === id || x.os === id);
    if (!achada) throw new Error("Corrida não encontrada.");
    const c = structuredClone(achada); // cópia: a lista da memória é só leitura
    fn(c);
    gravar(empresaId, [c]);
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
    c.atribuidaEm = agora;
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
    // Taxa: passageiro que cancela depois que o motorista aceitou e já passou a tolerância da categoria.
    if (quem === "Passageiro" && c.motoristaId && (c.status === "a_caminho" || c.status === "no_local")) {
      const cat = achar(categorias(empresaId), "nome", c.categoria);
      const taxa = typeof cat?.taxaCancelamento === "number" ? cat.taxaCancelamento : 0;
      const tolerancia = typeof cat?.toleranciaCancelamento === "number" ? cat.toleranciaCancelamento : 2;
      const desde = Date.parse(c.atribuidaEm ?? c.historico.find((h) => h.status === "a_caminho")?.em ?? c.solicitadaEm);
      if (taxa > 0 && agoraBr().getTime() - desde > tolerancia * 60_000) c.taxaCancelamento = arred(taxa);
    }
    c.status = "cancelada"; c.canceladaPor = quem; c.motivoCancelamento = String(motivo ?? "").slice(0, 200);
    c.historico.push({ em: agoraBr().toISOString(), status: "cancelada", por, nota: `${quem}: ${c.motivoCancelamento}` });
  });
}

export function avaliar(empresaId: string, id: string, nota: number, por = "sistema", comentario = "") {
  return alterar(empresaId, id, (c) => {
    if (c.status !== "finalizada") throw new Error("Só dá para avaliar corrida finalizada.");
    if (!(nota >= 1 && nota <= 5)) throw new Error("A nota vai de 1 a 5.");
    c.avaliacao = Math.round(nota);
    const t = String(comentario ?? "").replace(/[<>]/g, "").trim().slice(0, 500);
    if (t) c.comentario = t;
    c.historico.push({ em: agoraBr().toISOString(), status: c.status, por, nota: `Avaliação ${c.avaliacao}` });
  });
}

/** Nota do motorista para o passageiro (1 a 5), só em corrida finalizada, uma vez. */
export function avaliarPassageiro(empresaId: string, id: string, nota: number, comentario = "", por = "sistema") {
  return alterar(empresaId, id, (c) => {
    if (c.status !== "finalizada") throw new Error("Só dá para avaliar corrida finalizada.");
    if (!(nota >= 1 && nota <= 5)) throw new Error("A nota vai de 1 a 5.");
    if (c.avaliacaoPassageiro) throw new Error("Você já avaliou este passageiro.");
    c.avaliacaoPassageiro = { nota: Math.round(nota), comentario: String(comentario ?? "").replace(/[<>]/g, "").trim().slice(0, 500) };
    c.historico.push({ em: agoraBr().toISOString(), status: c.status, por, nota: `Nota do passageiro ${c.avaliacaoPassageiro.nota}` });
  });
}

/** Sem motorista por muito tempo: vira "não atendida" (chame de tempos em tempos). */
export function encerrarSemMotorista(empresaId: string, minutos = 20) {
  return emFila(empresaId, () => {
    const limite = agoraBr().getTime() - minutos * 60_000;
    const mudadas = listarProprias(empresaId).filter((c) => c.status === "procurando" && Date.parse(horaDaCorrida(c)) < limite).map((x) => {
      const c = structuredClone(x);
      c.status = "nao_atendida"; c.historico.push({ em: agoraBr().toISOString(), status: "nao_atendida", por: "sistema" });
      return c;
    });
    gravar(empresaId, mudadas);
    return mudadas.length;
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
    embarque: c.embarque.texto, destino: c.destino?.texto ?? "",
    observacao: [c.paradas?.length ? `Paradas: ${c.paradas.map((p) => p.texto).join(" → ")}` : "", c.agendadaPara ? `Agendada para ${c.agendadaPara.slice(8, 10)}/${c.agendadaPara.slice(5, 7)} ${c.agendadaPara.slice(11, 16)}` : "", c.observacao].filter(Boolean).join(" · "),
    programada: !!c.agendadaPara,
    valor: c.valor, valorEstimado: c.estimativa.valor, valorSemDesconto: c.valor != null && c.desconto ? arred(c.valor + c.desconto) : c.valor,
    desconto: c.desconto, cupom: c.cupom, distanciaKm: c.estimativa.distanciaKm, avaliacao: c.avaliacao,
    canceladaPor: c.canceladaPor, motivoCancelamento: c.motivoCancelamento,
  };
}
