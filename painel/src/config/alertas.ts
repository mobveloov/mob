// Alertas para empresas (Comunicação): avisos com tipo (Urgente, Atenção, Aviso), início e duração, para uma empresa cliente ou para todas.
// Ficam em config/alertas.json de cada empresa da plataforma. O status é calculado pela hora (Ativo dentro da janela, Inativo fora dela
// ou depois de encerrado). Alertas ativos aparecem no sino (Central de notificações) e como faixa no topo do painel.
// Datas e horas seguem o padrão do painel: horário de Brasília guardado como UTC.

import { cadastroPorId } from "../comum/cadastros.ts";
import { listar } from "../cadastros/armazem.ts";
import { agoraBr, normal } from "../servidor/util.ts";
import { lerConfig, gravarConfig, texto } from "./armazem.ts";

export const TIPOS_ALERTA = ["Urgente", "Atenção", "Aviso"] as const;
export type TipoAlerta = typeof TIPOS_ALERTA[number];
export const UNIDADES_ALERTA = ["Horas", "Dias", "Semanas"] as const;
type Unidade = typeof UNIDADES_ALERTA[number];

export interface Alerta {
  id: string; empresaAlvoId: string; empresaAlvo: string; tipo: TipoAlerta; conteudo: string;
  inicioEm: string; terminoEm: string; duracao: number; unidade: Unidade; criadoEm: string; criadoPor: string; encerradoEm: string | null; encerradoPor: string;
}
const MAX_UNIDADE: Record<Unidade, number> = { Horas: 24 * 90, Dias: 365, Semanas: 52 };
const MS: Record<Unidade, number> = { Horas: 3_600_000, Dias: 86_400_000, Semanas: 7 * 86_400_000 };

const todos = (empresaId: string) => lerConfig<Alerta[]>(empresaId, "alertas", []);
export const statusDoAlerta = (a: Alerta, agora = agoraBr().toISOString()): "Ativo" | "Inativo" => (!a.encerradoEm && a.inicioEm <= agora && agora < a.terminoEm ? "Ativo" : "Inativo");

/** Empresas clientes (cadastro "Empresas") que podem receber alerta. */
export const empresasDosAlertas = (empresaId: string) => listar(empresaId, cadastroPorId("conveniadas")!).map((e) => ({ id: e.id, nome: String(e.nome ?? "") })).sort((a, b) => a.nome.localeCompare(b.nome));

export function criarAlerta(empresaId: string, e: Record<string, unknown>, por: string): Alerta {
  const tipo = TIPOS_ALERTA.find((t) => t === e.tipo);
  if (!tipo) throw new Error("Escolha o tipo do alerta: Urgente, Atenção ou Aviso.");
  const conteudo = texto(e.conteudo, 500);
  if (!conteudo) throw new Error("Escreva a mensagem do alerta.");
  const data = String(e.data ?? ""), hora = String(e.hora ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || Number.isNaN(Date.parse(`${data}T00:00:00Z`))) throw new Error("Informe a data de início.");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) throw new Error("Informe a hora de início (HH:MM).");
  const unidade = UNIDADES_ALERTA.find((u) => u === e.unidade);
  if (!unidade) throw new Error("Escolha a unidade da duração: Horas, Dias ou Semanas.");
  const duracao = Number(e.duracao);
  if (!Number.isInteger(duracao) || duracao < 1 || duracao > MAX_UNIDADE[unidade]) throw new Error(`A duração deve ser um número inteiro de 1 a ${MAX_UNIDADE[unidade]} ${unidade.toLowerCase()}.`);
  let alvoId = "", alvo = "Todos";
  if (e.empresaAlvoId && e.empresaAlvoId !== "todos") {
    const f = empresasDosAlertas(empresaId).find((x) => x.id === e.empresaAlvoId);
    if (!f) throw new Error("Empresa não encontrada.");
    alvoId = f.id; alvo = f.nome;
  }
  const inicio = Date.parse(`${data}T${hora}:00Z`);
  const a: Alerta = {
    id: crypto.randomUUID(), empresaAlvoId: alvoId, empresaAlvo: alvo, tipo, conteudo, inicioEm: new Date(inicio).toISOString(), terminoEm: new Date(inicio + duracao * MS[unidade]).toISOString(),
    duracao, unidade, criadoEm: agoraBr().toISOString(), criadoPor: por.slice(0, 80), encerradoEm: null, encerradoPor: "",
  };
  gravarConfig(empresaId, "alertas", [...todos(empresaId).slice(-999), a]);
  return a;
}

/** Encerra o alerta agora (fica no histórico como Inativo; nada é apagado). */
export function encerrarAlerta(empresaId: string, id: string, por: string): Alerta {
  const l = todos(empresaId), a = l.find((x) => x.id === id);
  if (!a) throw new Error("Alerta não encontrado.");
  if (statusDoAlerta(a) === "Inativo" && a.inicioEm <= agoraBr().toISOString()) throw new Error("Este alerta já terminou.");
  a.encerradoEm = agoraBr().toISOString(); a.encerradoPor = por.slice(0, 80);
  gravarConfig(empresaId, "alertas", l);
  return a;
}

export interface FiltroAlertas { empresa?: string; conteudo?: string; tipo?: string; status?: string }
export function listarAlertas(empresaId: string, f: FiltroAlertas = {}) {
  const agora = agoraBr().toISOString(), b = normal(f.conteudo ?? "");
  const itens = todos(empresaId)
    .filter((a) => (!f.empresa || f.empresa === "todos" ? true : f.empresa === "sem" ? !a.empresaAlvoId : a.empresaAlvoId === f.empresa)
      && (!b || normal(a.conteudo).includes(b)) && (!f.tipo || a.tipo === f.tipo) && (!f.status || statusDoAlerta(a, agora) === f.status))
    .map((a) => ({ ...a, status: statusDoAlerta(a, agora), agendado: a.inicioEm > agora && !a.encerradoEm }))
    .sort((a, b) => b.inicioEm.localeCompare(a.inicioEm));
  return { tipos: TIPOS_ALERTA, unidades: UNIDADES_ALERTA, empresas: empresasDosAlertas(empresaId), itens };
}

/** Alertas valendo agora, o mais grave primeiro. */
export const alertasAtivos = (empresaId: string): Alerta[] => {
  const agora = agoraBr().toISOString(), peso = (t: TipoAlerta) => TIPOS_ALERTA.indexOf(t);
  return todos(empresaId).filter((a) => statusDoAlerta(a, agora) === "Ativo").sort((a, b) => peso(a.tipo) - peso(b.tipo) || b.inicioEm.localeCompare(a.inicioEm));
};
