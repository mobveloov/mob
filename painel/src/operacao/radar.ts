// Recuperação de Vendas ("radar de intenções"): passageiros que cotaram no app e não pediram, corridas que o
// passageiro cancelou ou que ficaram sem motorista, e motoristas que deixaram chamadas passar.
// A central vê quem perdeu, quanto valia e chama o passageiro (o contato fica registrado).

import crypto from "node:crypto";
import { cadastroPorId } from "../comum/cadastros.ts";
import { listar } from "../cadastros/armazem.ts";
import { listarProprias, type CorridaPropria } from "../corridas/index.ts";
import { enderecoDoPonto } from "../enderecos/index.ts";
import { agoraBr, arred } from "../servidor/util.ts";
import { gravarOperacao, lerOperacao } from "./armazem.ts";
import { ondas } from "./ondas.ts";

export interface Cotacao {
  id: string; telefone: string; em: string; categoria: string; valor: number | null; distanciaKm: number | null;
  embarque: { lat?: number; lng?: number }; destino: { lat?: number; lng?: number };
}
export interface Contato { chave: string; em: string; por: string }

const ARQ = "cotacoes.json";
const MAX = 5000;
/** Mesma pessoa cotando de novo em menos disso: atualiza a cotação anterior (não vira outra). */
const REPETIDA_MS = 10 * 60_000;

export const cotacoes = (empresaId: string) => lerOperacao<Cotacao[]>(empresaId, ARQ, []);

/** Chamado pela estimativa do app do passageiro (src/apps/rotas.ts). Nunca derruba a estimativa. */
export function registrarCotacao(empresaId: string, telefone: string, d: Omit<Cotacao, "id" | "telefone" | "em">) {
  try {
    if (!telefone || d.embarque.lat == null || d.destino.lat == null) return;
    const lista = [...cotacoes(empresaId)];
    const agora = agoraBr().toISOString();
    let ultima = -1;
    for (let i = lista.length - 1; i >= 0; i--) if (lista[i].telefone === telefone) { ultima = i; break; }
    const nova: Cotacao = { id: crypto.randomUUID(), telefone, em: agora, ...d };
    if (ultima >= 0 && Date.parse(agora) - Date.parse(lista[ultima].em) < REPETIDA_MS) lista[ultima] = { ...nova, id: lista[ultima].id };
    else lista.push(nova);
    gravarOperacao(empresaId, ARQ, lista.slice(-MAX));
  } catch (e) { console.error("[operacao] cotação:", e instanceof Error ? e.message : e); }
}

export const contatos = (empresaId: string) => lerOperacao<Contato[]>(empresaId, "contatos.json", []);
export function registrarContato(empresaId: string, chave: string, por: string): Contato {
  if (!/^[\w:-]{3,80}$/.test(chave)) throw new Error("Registro inválido.");
  const c: Contato = { chave, em: agoraBr().toISOString(), por: por.slice(0, 120) };
  gravarOperacao(empresaId, "contatos.json", [...contatos(empresaId).filter((x) => x.chave !== chave), c].slice(-MAX));
  return c;
}

export type AbaRadar = "passageiros" | "motoristas_simulou" | "motoristas_iniciou";
export const ABAS_RADAR: AbaRadar[] = ["passageiros", "motoristas_simulou", "motoristas_iniciou"];

const textoPonto = (empresaId: string, p: { lat?: number; lng?: number }) => {
  if (p.lat == null || p.lng == null) return "—";
  try { const e = enderecoDoPonto(empresaId, p.lat, p.lng); if (e) return e.texto; } catch { /* sem base de endereços */ }
  return `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
};
const dentro = (em: string, inicio: string, fim: string) => em.slice(0, 10) >= inicio && em.slice(0, 10) <= fim;

interface ItemPassageiro {
  chave: string; tipo: string; tipoTexto: string; em: string; valor: number | null;
  cliente: { nome: string; telefone: string; novo: boolean };
  cotacao: { valor: number | null; categoria: string; origem: string; destino: string };
  historico: { ultimoValor: number | null; ultimaData: string } | null;
  contatadoEm: string | null; contatadoPor: string | null;
}

/** Lista do radar no período (datas AAAA-MM-DD, horário de Brasília). */
export function radar(empresaId: string, aba: AbaRadar, inicio: string, fim: string) {
  const vistos = new Map(contatos(empresaId).map((c) => [c.chave, c]));
  const contato = (chave: string) => { const c = vistos.get(chave); return c ? { contatadoEm: c.em, contatadoPor: c.por } : { contatadoEm: null, contatadoPor: null }; };
  if (aba === "passageiros") {
    const corridas = listarProprias(empresaId);
    const clientes = listar(empresaId, cadastroPorId("clientes")!);
    const porTel = new Map<string, CorridaPropria[]>();
    for (const c of corridas) { const l = porTel.get(c.passageiro.telefone) ?? []; l.push(c); porTel.set(c.passageiro.telefone, l); }
    const historico = (tel: string, antes: string) => {
      const fin = (porTel.get(tel) ?? []).filter((c) => c.status === "finalizada" && c.solicitadaEm < antes);
      const u = fin.at(-1);
      return { novo: !fin.length, historico: u ? { ultimoValor: u.valor, ultimaData: u.solicitadaEm } : null };
    };
    const nome = (tel: string, padrao: string) => String(clientes.find((c) => c.telefone === tel)?.nome ?? "") || padrao;
    const lista: ItemPassageiro[] = [];
    // 1) Cotou no app e não pediu (nenhuma corrida da pessoa de 5 min antes até 1 h depois da cotação).
    const ultimaPorTel = new Map<string, Cotacao>();
    for (const q of cotacoes(empresaId)) if (dentro(q.em, inicio, fim)) ultimaPorTel.set(q.telefone, q);
    for (const q of ultimaPorTel.values()) {
      const t = Date.parse(q.em);
      const pediu = (porTel.get(q.telefone) ?? []).some((c) => { const s = Date.parse(c.solicitadaEm); return s >= t - 5 * 60_000 && s <= t + 3600_000; });
      if (pediu) continue;
      const h = historico(q.telefone, q.em);
      lista.push({
        chave: `cot:${q.id}`, tipo: "cotacao", tipoTexto: "Cotou e não pediu", em: q.em, valor: q.valor,
        cliente: { nome: nome(q.telefone, "Passageiro do app"), telefone: q.telefone, novo: h.novo },
        cotacao: { valor: q.valor, categoria: q.categoria, origem: textoPonto(empresaId, q.embarque), destino: textoPonto(empresaId, q.destino) },
        historico: h.historico, ...contato(`cot:${q.id}`),
      });
    }
    // 2) Corrida cancelada pelo passageiro ou não atendida, sem outra corrida da pessoa nas 2 h seguintes.
    for (const c of corridas) {
      if (!dentro(c.solicitadaEm, inicio, fim)) continue;
      const perdida = c.status === "nao_atendida" || (c.status === "cancelada" && c.canceladaPor === "Passageiro");
      if (!perdida) continue;
      const t = Date.parse(c.solicitadaEm);
      const voltou = (porTel.get(c.passageiro.telefone) ?? []).some((x) => x.id !== c.id && Date.parse(x.solicitadaEm) > t && Date.parse(x.solicitadaEm) <= t + 2 * 3600_000);
      if (voltou) continue;
      const h = historico(c.passageiro.telefone, c.solicitadaEm);
      const valor = c.estimativa.valor;
      lista.push({
        chave: `os:${c.id}`, tipo: c.status, tipoTexto: c.status === "nao_atendida" ? `Não atendida (OS ${c.os})` : `Cancelou (OS ${c.os})`, em: c.solicitadaEm, valor,
        cliente: { nome: c.passageiro.nome, telefone: c.passageiro.telefone, novo: h.novo },
        cotacao: { valor, categoria: c.categoria, origem: c.embarque.texto, destino: c.destino?.texto ?? "Sem destino" },
        historico: h.historico, ...contato(`os:${c.id}`),
      });
    }
    lista.sort((a, b) => b.em.localeCompare(a.em));
    return { resumo: { qtd: lista.length, valor: arred(lista.reduce((s, x) => s + (x.valor ?? 0), 0)) }, lista };
  }
  if (aba === "motoristas_simulou") {
    const mots = new Map(listar(empresaId, cadastroPorId("motoristas")!).map((m) => [m.id, m]));
    const lista = ondas(empresaId)
      .filter((o) => (o.fim === "recusou" || o.fim === "expirou") && dentro(o.oferecidaEm, inicio, fim))
      .map((o) => ({
        chave: `onda:${o.id}`, em: o.oferecidaEm,
        motorista: { nome: o.nome || String(mots.get(o.motoristaId)?.nome ?? "Motorista"), telefone: String(mots.get(o.motoristaId)?.telefone ?? "") },
        evento: o.fim === "recusou" ? "Recusou" : "Deixou passar",
        detalhe: `OS ${o.os || "—"}${o.distanciaKm != null ? ` · ${String(o.distanciaKm).replace(".", ",")} km do embarque` : ""}`,
        ...contato(`onda:${o.id}`),
      }))
      .sort((a, b) => b.em.localeCompare(a.em));
    // Mapa e rotas por OpenStreetMap: a consulta não gera custo de API.
    return { resumo: { qtd: lista.length, valor: 0 }, lista };
  }
  // Corrida aberta pelo motorista na rua (maçaneta): o app do motorista ainda não tem essa função.
  return { resumo: { qtd: 0, valor: 0 }, lista: [], aviso: "O app do motorista ainda não abre corrida na rua. Quando abrir, ela aparece aqui." };
}
