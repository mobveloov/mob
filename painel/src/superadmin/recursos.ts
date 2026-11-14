// Recursos (módulos) ligados e desligados por empresa. Arquivo leve, sem depender do resto: o porteiro da API consulta isto em todo pedido.

import path from "node:path";
import { moduloPorId } from "../comum/modulos.ts";
import { empresa, raiz } from "../servidor/dados.ts";
import { gravarJson, lerJson } from "../servidor/jsoncache.ts";

export class ErroSuperadmin extends Error { constructor(msg: string, public status = 400) { super(msg); } }


// ------------------------------------------------------------------ recursos (módulos) por empresa

interface EstadoRecursos { desligados: Record<string, string[]> }
const arqRecursos = () => path.join(raiz(), "plataforma-recursos.json");
const estadoRecursos = (): EstadoRecursos => ({ desligados: lerJson<Partial<EstadoRecursos>>(arqRecursos(), {}).desligados ?? {} });

/** Ids dos módulos desligados para a empresa (tudo começa ligado). */
export const recursosDesligados = (empresaId: string): string[] => (estadoRecursos().desligados[empresaId] ?? []).filter((m) => moduloPorId(m));
export const moduloLigado = (empresaId: string, modulo: string) => !recursosDesligados(empresaId).includes(modulo);

export function definirRecursos(empresaId: string, desligados: unknown): string[] {
  if (!empresa(empresaId)) throw new ErroSuperadmin("Empresa não encontrada.", 404);
  if (!Array.isArray(desligados)) throw new ErroSuperadmin("Informe a lista de recursos desligados.");
  const lista = [...new Set(desligados.map(String))];
  const invalido = lista.find((m) => !moduloPorId(m));
  if (invalido) throw new ErroSuperadmin(`Recurso desconhecido: ${invalido}.`);
  const e = structuredClone(estadoRecursos());
  if (lista.length) e.desligados[empresaId] = lista; else delete e.desligados[empresaId];
  gravarJson(arqRecursos(), e, { espacos: 2 });
  return lista;
}

