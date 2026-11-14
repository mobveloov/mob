// Guarda os cadastros de cada empresa: DADOS_DIR/empresas/<id>/cadastros/<cadastro>.json.
// Valida cada campo pela definição (comum/cadastros.ts). Uma empresa nunca lê a pasta de outra.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Cadastro, Campo } from "../comum/cadastros.ts";
import { idValido, raiz } from "../servidor/dados.ts";
import { normal } from "../servidor/util.ts";
import { gravarJson, lerJson } from "../servidor/jsoncache.ts";

export type Valor = string | number | boolean | null;
export interface Registro { id: string; criadoEm: string; atualizadoEm: string; atualizadoPor: string; [campo: string]: Valor }

function arquivo(empresaId: string, cad: Cadastro) {
  if (!idValido(empresaId) || !/^[a-z]+$/.test(cad.id)) throw new Error("Cadastro inválido.");
  return path.join(raiz(), "empresas", empresaId, "cadastros", `${cad.id}.json`);
}

export function listar(empresaId: string, cad: Cadastro): Registro[] {
  return lerJson<Registro[]>(arquivo(empresaId, cad), []); // só leitura (cache): para mudar, copie e grave
}

function gravar(empresaId: string, cad: Cadastro, l: Registro[]) {
  gravarJson(arquivo(empresaId, cad), l, { espacos: 1 });
}

const soDigitos = (v: string) => v.replace(/\D/g, "");

/** Converte e confere um campo. Lança erro em português quando não serve. */
function limparCampo(c: Campo, bruto: unknown): Valor {
  if (bruto == null || bruto === "") {
    if (c.obrigatorio && c.tipo !== "booleano") throw new Error(`Preencha "${c.rotulo}".`);
    return c.tipo === "booleano" ? false : null;
  }
  const s = typeof bruto === "object" ? JSON.stringify(bruto) : String(bruto).trim();
  switch (c.tipo) {
    case "numero": case "dinheiro": {
      const n = Number(s.replace(/\s|R\$/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
      if (!Number.isFinite(n)) throw new Error(`"${c.rotulo}" precisa ser um número.`);
      return c.tipo === "dinheiro" ? Math.round(n * 100) / 100 : n;
    }
    case "booleano": return bruto === true || s === "true" || s === "1" || normal(s) === "sim";
    case "telefone": {
      const d = soDigitos(s);
      if (d.length < 10 || d.length > 13) throw new Error(`"${c.rotulo}" precisa ter DDD e número.`);
      return d;
    }
    case "cpf": {
      const d = soDigitos(s);
      if (d.length !== 11) throw new Error(`"${c.rotulo}" precisa ter 11 números.`);
      return d;
    }
    case "email":
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) throw new Error(`"${c.rotulo}" não é um e-mail válido.`);
      return s.toLowerCase().slice(0, 120);
    case "data":
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`"${c.rotulo}" precisa ser uma data.`);
      return s;
    case "selecao":
      if (c.opcoes && !c.opcoes.includes(s)) throw new Error(`"${c.rotulo}": escolha uma das opções.`);
      return s;
    case "json": {
      try { JSON.parse(s); } catch { throw new Error(`"${c.rotulo}" está num formato inválido.`); }
      if (s.length > 4000) throw new Error(`"${c.rotulo}" ficou grande demais.`);
      return s.replace(/[<>]/g, "");
    }
    case "textoLongo": return s.replace(/[<>]/g, "").slice(0, 5000);
    default: return s.replace(/[<>]/g, "").slice(0, 200);
  }
}

/** Monta o registro a partir do formulário. Campos calculados não são aceitos do formulário. */
function limpar(cad: Cadastro, entrada: Record<string, unknown>, anterior?: Registro): Record<string, Valor> {
  const out: Record<string, Valor> = {};
  for (const c of cad.campos) {
    if (c.calculado) { out[c.chave] = anterior?.[c.chave] ?? null; continue; }
    out[c.chave] = limparCampo(c, entrada[c.chave]);
  }
  return out;
}

function conferirUnico(cad: Cadastro, lista: Registro[], dados: Record<string, Valor>, ignorarId?: string) {
  if (!cad.chaveUnica || dados[cad.chaveUnica] == null) return;
  const v = normal(String(dados[cad.chaveUnica]));
  const igual = lista.find((r) => r.id !== ignorarId && normal(String(r[cad.chaveUnica!] ?? "")) === v);
  if (igual) throw new Error(`Já existe ${cad.singular} com este ${cad.campos.find((c) => c.chave === cad.chaveUnica)?.rotulo.toLowerCase()}.`);
}

export function criar(empresaId: string, cad: Cadastro, entrada: Record<string, unknown>, por: string): Registro {
  const lista = listar(empresaId, cad);
  const dados = limpar(cad, entrada);
  conferirUnico(cad, lista, dados);
  const agora = new Date().toISOString();
  const r: Registro = { ...dados, id: crypto.randomUUID(), criadoEm: agora, atualizadoEm: agora, atualizadoPor: por };
  gravar(empresaId, cad, [...lista, r]);
  return r;
}

export function atualizar(empresaId: string, cad: Cadastro, id: string, entrada: Record<string, unknown>, por: string): Registro {
  const lista = [...listar(empresaId, cad)]; // cópia: o cache é só leitura
  const i = lista.findIndex((r) => r.id === id);
  if (i < 0) throw new Error(`${cad.singular[0].toUpperCase()}${cad.singular.slice(1)} não encontrado.`);
  const dados = limpar(cad, entrada, lista[i]);
  conferirUnico(cad, lista, dados, id);
  lista[i] = { ...lista[i], ...dados, atualizadoEm: new Date().toISOString(), atualizadoPor: por };
  gravar(empresaId, cad, lista);
  return lista[i];
}

/**
 * Muda só alguns campos de um registro (os apps usam: o resto do registro fica como está).
 * Cada campo passa pela mesma conferência do formulário; campo calculado ou desconhecido é ignorado.
 */
export function alterarCampos(empresaId: string, cad: Cadastro, id: string, mudancas: Record<string, unknown>, por: string): Registro {
  const lista = [...listar(empresaId, cad)]; // cópia: o cache é só leitura
  const i = lista.findIndex((r) => r.id === id);
  if (i < 0) throw new Error(`${cad.singular[0].toUpperCase()}${cad.singular.slice(1)} não encontrado.`);
  const dados: Record<string, Valor> = {};
  for (const c of cad.campos) if (!c.calculado && c.chave in mudancas) dados[c.chave] = limparCampo(c, mudancas[c.chave]);
  conferirUnico(cad, lista, { ...lista[i], ...dados }, id);
  lista[i] = { ...lista[i], ...dados, atualizadoEm: new Date().toISOString(), atualizadoPor: por };
  gravar(empresaId, cad, lista);
  return lista[i];
}

export function remover(empresaId: string, cad: Cadastro, id: string) {
  const lista = listar(empresaId, cad);
  if (!lista.some((r) => r.id === id)) throw new Error("Registro não encontrado.");
  gravar(empresaId, cad, lista.filter((r) => r.id !== id));
}

/**
 * Junta registros importados: atualiza pela chave única (só campos vazios e os calculados, para não apagar o
 * que a central já editou) e cria os novos. Devolve quantos criou e quantos atualizou.
 */
export function mesclar(empresaId: string, cad: Cadastro, novos: Array<Record<string, Valor>>, por: string): { criados: number; atualizados: number } {
  const lista = structuredClone(listar(empresaId, cad)); // cópia: o cache é só leitura
  const chave = cad.chaveUnica!;
  const indice = new Map(lista.map((r, i) => [normal(String(r[chave] ?? "")), i]));
  const calculados = new Set(cad.campos.filter((c) => c.calculado).map((c) => c.chave));
  const agora = new Date().toISOString();
  let criados = 0, atualizados = 0;
  for (const n of novos) {
    const k = normal(String(n[chave] ?? ""));
    if (!k) continue;
    const i = indice.get(k);
    if (i === undefined) {
      const base: Record<string, Valor> = Object.fromEntries(cad.campos.map((c) => [c.chave, c.tipo === "booleano" ? false : null]));
      lista.push({ ...base, ...n, id: crypto.randomUUID(), criadoEm: agora, atualizadoEm: agora, atualizadoPor: por });
      indice.set(k, lista.length - 1);
      criados++;
    } else {
      const r = lista[i];
      let mudou = false;
      for (const [c, v] of Object.entries(n)) {
        if (v == null || v === "") continue;
        if (calculados.has(c) || r[c] == null || r[c] === "") { if (r[c] !== v) { r[c] = v; mudou = true; } }
      }
      if (mudou) { r.atualizadoEm = agora; atualizados++; }
    }
  }
  if (criados || atualizados) gravar(empresaId, cad, lista); // nada mudou: não regrava (cada corrida chama isto)
  return { criados, atualizados };
}
