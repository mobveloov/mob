// Plantão: cobre horários de pouca demanda. Os motoristas escalados têm prioridade nas filas do despacho
// enquanto o plantão está valendo. Tudo por empresa (DADOS_DIR/empresas/<id>/gestao/plantoes.json).
// Datas e horas em Brasília ("AAAA-MM-DDTHH:MM", como o resto do painel).

import crypto from "node:crypto";
import { cadastroPorId } from "../comum/cadastros.ts";
import { listar } from "../cadastros/armazem.ts";
import { gravarG, lerG } from "../gestao/armazem.ts";
import { agoraBr, normal } from "../servidor/util.ts";
import { horaValida } from "./areas.ts";

export interface Plantao { id: string; inicio: string; fim: string; motoristas: string[]; criadoEm: string }
export interface EntradaPlantao { dataInicial?: unknown; horaInicial?: unknown; dataFinal?: unknown; horaFinal?: unknown }

const MAX_MOTORISTAS = 500;
const plantoes = (empresaId: string) => lerG<Plantao[]>(empresaId, "plantoes", []);

function data(v: unknown, rotulo: string): string {
  const s = String(v ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error(`${rotulo} é obrigatória.`);
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) throw new Error(`${rotulo} inválida.`);
  return s;
}

/** Junta data e hora (hora vazia: 00:00 no início e 23:59 no fim). */
function momentos(e: EntradaPlantao): { inicio: string; fim: string } {
  const hi = String(e.horaInicial ?? "").trim() ? horaValida(e.horaInicial, "Hora inicial") : "00:00";
  const hf = String(e.horaFinal ?? "").trim() ? horaValida(e.horaFinal, "Hora final") : "23:59";
  const inicio = `${data(e.dataInicial, "Data inicial")}T${hi}`, fim = `${data(e.dataFinal, "Data final")}T${hf}`;
  if (fim <= inicio) throw new Error("O fim do plantão precisa ser depois do início.");
  return { inicio, fim };
}

const agoraTexto = () => agoraBr().toISOString().slice(0, 16);
const vale = (p: Plantao, quando: string) => p.inicio <= quando && quando <= p.fim;

export interface FiltroPlantao { dataInicial?: string; horaInicial?: string; dataFinal?: string; horaFinal?: string }

/** Lista com a quantidade de motoristas. Filtro: plantões que se cruzam com o período pedido. */
export function listarPlantoes(empresaId: string, f: FiltroPlantao = {}) {
  const de = f.dataInicial ? `${data(f.dataInicial, "Data inicial")}T${f.horaInicial ? horaValida(f.horaInicial, "Hora inicial") : "00:00"}` : "";
  const ate = f.dataFinal ? `${data(f.dataFinal, "Data final")}T${f.horaFinal ? horaValida(f.horaFinal, "Hora final") : "23:59"}` : "";
  const agora = agoraTexto();
  return plantoes(empresaId)
    .filter((p) => (!de || p.fim >= de) && (!ate || p.inicio <= ate))
    .sort((a, b) => b.inicio.localeCompare(a.inicio))
    .map((p) => ({ ...p, quantidade: p.motoristas.length, valendo: vale(p, agora) }));
}

export function criarPlantao(empresaId: string, e: EntradaPlantao): Plantao {
  const { inicio, fim } = momentos(e);
  const l = plantoes(empresaId);
  if (l.length >= 500) throw new Error("Limite de plantões atingido. Apague os antigos.");
  const p: Plantao = { id: crypto.randomUUID(), inicio, fim, motoristas: [], criadoEm: new Date().toISOString() };
  gravarG(empresaId, "plantoes", [...l, p]);
  return p;
}

function achar(l: Plantao[], id: string): Plantao {
  const p = l.find((x) => x.id === id);
  if (!p) throw new Error("Plantão não encontrado.");
  return p;
}

export function atualizarPlantao(empresaId: string, id: string, e: EntradaPlantao): Plantao {
  const l = plantoes(empresaId), p = achar(l, id);
  Object.assign(p, momentos(e));
  gravarG(empresaId, "plantoes", l);
  return p;
}

export function removerPlantao(empresaId: string, id: string) {
  const l = plantoes(empresaId);
  achar(l, id);
  gravarG(empresaId, "plantoes", l.filter((p) => p.id !== id));
}

const cadastroDeMotoristas = (empresaId: string) => listar(empresaId, cadastroPorId("motoristas")!);

/** Plantão com os motoristas (Vtr, nome e telefone) para a tela Gerenciar. */
export function detalharPlantao(empresaId: string, id: string) {
  const p = achar(plantoes(empresaId), id);
  const cad = new Map(cadastroDeMotoristas(empresaId).map((m) => [m.id, m]));
  return {
    ...p, valendo: vale(p, agoraTexto()),
    escalados: p.motoristas.map((mid) => {
      const m = cad.get(mid);
      return { id: mid, viatura: String(m?.viatura ?? ""), nome: String(m?.nome ?? "(motorista removido)"), telefone: String(m?.telefone ?? "") };
    }),
  };
}

export function adicionarMotorista(empresaId: string, id: string, motoristaId: string) {
  const l = plantoes(empresaId), p = achar(l, id);
  const m = cadastroDeMotoristas(empresaId).find((x) => x.id === motoristaId);
  if (!m) throw new Error("Motorista não encontrado.");
  if (p.motoristas.includes(m.id)) throw new Error("Este motorista já está no plantão.");
  if (p.motoristas.length >= MAX_MOTORISTAS) throw new Error("Limite de motoristas no plantão atingido.");
  p.motoristas.push(m.id);
  gravarG(empresaId, "plantoes", l);
  return detalharPlantao(empresaId, id);
}

export function removerMotorista(empresaId: string, id: string, motoristaId: string) {
  const l = plantoes(empresaId), p = achar(l, id);
  if (!p.motoristas.includes(motoristaId)) throw new Error("Este motorista não está no plantão.");
  p.motoristas = p.motoristas.filter((m) => m !== motoristaId);
  gravarG(empresaId, "plantoes", l);
  return detalharPlantao(empresaId, id);
}

/** Campo "Vtr / Motorista": procura por nome, nº da viatura ou telefone (máximo 15). */
export function buscarMotoristas(empresaId: string, q: string) {
  const b = normal(q), digitos = b.replace(/\D/g, "");
  if (!b) return [];
  return cadastroDeMotoristas(empresaId)
    .filter((m) => normal(m.nome).includes(b) || normal(m.viatura).includes(b) || (digitos.length >= 3 && String(m.telefone ?? "").replace(/\D/g, "").includes(digitos)))
    .slice(0, 15).map((m) => ({ id: m.id, viatura: String(m.viatura ?? ""), nome: String(m.nome ?? ""), telefone: String(m.telefone ?? "") }));
}

/** Motoristas escalados em algum plantão que está valendo agora (o despacho dá prioridade a eles). */
export function motoristasEmPlantao(empresaId: string, quando: Date = agoraBr()): Set<string> {
  const t = quando.toISOString().slice(0, 16);
  const s = new Set<string>();
  for (const p of plantoes(empresaId)) if (vale(p, t)) for (const m of p.motoristas) s.add(m);
  return s;
}
