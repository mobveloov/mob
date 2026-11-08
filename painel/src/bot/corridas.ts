// Ponte do bot com as corridas PRÓPRIAS do painel (painel/src/corridas). O painel é o sistema da empresa:
// categorias e preço vêm do cadastro "categorias" (estimarPreco), o passageiro do cadastro "clientes",
// e a corrida nasce com criarCorridaPropria (canal "bot"). Nenhuma chave de sistema externo.

import { listar } from "../cadastros/armazem.ts";
import { cadastroPorId } from "../comum/cadastros.ts";
import {
  avaliar, cancelarCorrida, criarCorridaPropria, distanciaEstimada, estimarPreco, listarProprias,
  type CorridaPropria, type StatusProprio,
} from "../corridas/index.ts";
import type { CategoriaBot, Local } from "./tipos.ts";

export interface NovaCorridaBot {
  passageiro: { nome: string; telefone: string };
  embarque: Local; destino?: Local; categoria: string; pagamento: string; observacao?: string;
}
export interface DetalheBot {
  status: StatusProprio; grupo: "aberta" | "finalizada" | "cancelada" | "nao_atendida";
  motorista?: string; veiculo?: string; valor?: number; canceladaPor?: string;
}

/** O que o bot usa das corridas. Os testes podem trocar (definirCorridasDoBot). */
export interface CorridasBot {
  categorias(empresaId: string, embarque?: Local, destino?: Local): Promise<CategoriaBot[]>;
  criar(empresaId: string, n: NovaCorridaBot): Promise<{ id: string; os: string; valor?: number }>;
  detalhar(empresaId: string, id: string): Promise<DetalheBot | null>;
  cancelar(empresaId: string, id: string): Promise<void>;
  avaliar(empresaId: string, id: string, nota: number): Promise<void>;
}

const GRUPO: Record<StatusProprio, DetalheBot["grupo"]> = {
  procurando: "aberta", a_caminho: "aberta", no_local: "aberta", em_andamento: "aberta",
  finalizada: "finalizada", cancelada: "cancelada", nao_atendida: "nao_atendida",
};

const soDigitos = (t: unknown) => String(t ?? "").replace(/\D/g, "");
/** Mesmo telefone com ou sem o 55 do país. */
export const mesmoTelefone = (a: string, b: string) => {
  const x = soDigitos(a), y = soDigitos(b);
  if (x.length < 10 || y.length < 10) return false;
  return x === y || x.endsWith(y) || y.endsWith(x);
};

/** Passageiro do cadastro "clientes" pelo telefone. */
export function clienteDoTelefone(empresaId: string, telefone: string) {
  const c = listar(empresaId, cadastroPorId("clientes")!).find((r) => mesmoTelefone(String(r.telefone ?? ""), telefone));
  if (!c) return null;
  const status = String(c.status ?? "");
  return { nome: String(c.nome ?? ""), status, bloqueado: status === "Bloqueado" || status === "Suspenso", telefone: String(c.telefone ?? "") };
}

function veiculoDe(empresaId: string, motoristaId: string | null) {
  if (!motoristaId) return undefined;
  const m = listar(empresaId, cadastroPorId("motoristas")!).find((r) => r.id === motoristaId);
  if (!m) return undefined;
  return [m.veiculo, m.placa && `placa ${m.placa}`].filter(Boolean).join(", ") || undefined;
}

const detalheDe = (empresaId: string, c: CorridaPropria): DetalheBot => ({
  status: c.status, grupo: GRUPO[c.status], motorista: c.motorista || undefined, veiculo: veiculoDe(empresaId, c.motoristaId),
  valor: c.valor ?? undefined, canceladaPor: c.canceladaPor || undefined,
});

export const corridasProprias: CorridasBot = {
  async categorias(empresaId, embarque, destino) {
    const km = distanciaEstimada(embarque, destino);
    return listar(empresaId, cadastroPorId("categorias")!)
      .filter((c) => c.ativa !== false && String(c.nome ?? "").trim())
      .map((c) => {
        const nome = String(c.nome);
        const est = estimarPreco(empresaId, { categoria: nome, distanciaKm: km });
        return { id: c.id, nome, descricao: c.descricao ? String(c.descricao) : undefined, preco: est.valor ?? undefined, estimado: km != null };
      });
  },
  async criar(empresaId, n) {
    const c = await criarCorridaPropria(empresaId, {
      passageiro: n.passageiro, embarque: n.embarque, destino: n.destino, categoria: n.categoria,
      pagamento: n.pagamento, canal: "bot", observacao: n.observacao,
    }, "bot");
    return { id: c.id, os: c.os, valor: c.estimativa.valor ?? undefined };
  },
  async detalhar(empresaId, id) {
    const c = listarProprias(empresaId).find((x) => x.id === id);
    return c ? detalheDe(empresaId, c) : null;
  },
  async cancelar(empresaId, id) { await cancelarCorrida(empresaId, id, "Passageiro", "Cancelada pelo passageiro no WhatsApp", "bot"); },
  async avaliar(empresaId, id, nota) { await avaliar(empresaId, id, nota, "bot"); },
};

let atual: CorridasBot = corridasProprias;
export const corridasDoBot = () => atual;
/** Para testes: troca a fonte das corridas. `null` volta às corridas próprias. */
export const definirCorridasDoBot = (c: CorridasBot | null) => { atual = c ?? corridasProprias; };
