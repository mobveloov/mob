// Junta as corridas de TODAS as integrações ativas da empresa numa lista só, com a origem identificada.
// Uma integração com erro vira aviso; as outras continuam.

import fs from "node:fs";
import path from "node:path";
import type { CorridaPainel, Filtro } from "../../comum/corrida.ts";
import { integracoes, pastaPlanilhas, segredos } from "../dados.ts";
import { aplicarFiltro, intervalo } from "../filtro.ts";
import { agoraBr } from "../util.ts";
import { corridasDoCsv } from "./arquivo.ts";
import { corridasDeExemplo } from "./exemplo.ts";
import { corridasDoMotor } from "./motor.ts";
import { corridaPropriaParaPainel, listarProprias } from "../../corridas/index.ts";

export interface Resultado { corridas: CorridaPainel[]; avisos: string[] }

const cachePlanilhas = new Map<string, { chave: string; corridas: CorridaPainel[] }>();

function corridasDasPlanilhas(empresaId: string, origem: string, nome: string): CorridaPainel[] {
  const pasta = pastaPlanilhas(empresaId);
  if (!fs.existsSync(pasta)) return [];
  const arquivos = fs.readdirSync(pasta).filter((n) => n.toLowerCase().endsWith(".csv")).sort();
  const chave = arquivos.map((n) => `${n}:${fs.statSync(path.join(pasta, n)).mtimeMs}`).join("|");
  const k = `${empresaId}/${origem}`;
  const c = cachePlanilhas.get(k);
  if (c && c.chave === chave) return c.corridas;
  const vistas = new Set<string>();
  const corridas: CorridaPainel[] = [];
  for (const n of arquivos) {
    const r = corridasDoCsv(fs.readFileSync(path.join(pasta, n)), origem, nome);
    if (r.ok) for (const x of r.corridas) if (!vistas.has(x.os)) { vistas.add(x.os); corridas.push(x); }
  }
  cachePlanilhas.set(k, { chave, corridas });
  return corridas;
}

export function limparCachePlanilhas(empresaId: string) {
  for (const k of [...cachePlanilhas.keys()]) if (k.startsWith(`${empresaId}/`)) cachePlanilhas.delete(k);
}

export async function buscarCorridas(empresaId: string, f: Filtro): Promise<Resultado> {
  const agora = agoraBr();
  const { de, ate } = intervalo(f, agora);
  const seg = segredos(empresaId);
  const ativas = integracoes(empresaId).filter((i) => i.ativa && (!f.origem || f.origem === i.id));
  const partes = await Promise.all(ativas.map(async (i): Promise<Resultado> => {
    try {
      if (i.tipo === "exemplo") return { corridas: corridasDeExemplo(agora).map((c) => ({ ...c, id: `${i.id}:${c.os}`, origem: i.id, origemNome: i.nome })), avisos: [] };
      if (i.tipo === "arquivo") return { corridas: corridasDasPlanilhas(empresaId, i.id, i.nome), avisos: [] };
      if (i.tipo !== "sistema-a" && i.tipo !== "sistema-b") return { corridas: [], avisos: [`${i.nome}: integração de um tipo antigo. Remova e adicione de novo em Integrações.`] };
      const r = await corridasDoMotor(i.tipo, seg.integracoes[i.id] ?? {}, de, ate, i.id, i.nome);
      return { corridas: r.corridas, avisos: r.aviso ? [r.aviso] : [] };
    } catch (e) {
      return { corridas: [], avisos: [`${i.nome}: ${e instanceof Error ? e.message : String(e)}`] };
    }
  }));
  const avisos = partes.flatMap((p) => p.avisos);
  // Corridas próprias (criadas no painel, no bot e no totem): sempre entram, sem integração nenhuma.
  const proprias = !f.origem || f.origem === "propria" ? listarProprias(empresaId).map((c) => corridaPropriaParaPainel(c)) : [];
  return { corridas: aplicarFiltro([...proprias, ...partes.flatMap((p) => p.corridas)], f, agora), avisos };
}
