// Guarda os cadastros de cada empresa no banco (tabela cadastros_itens, uma linha por registro). Os
// DADOS_DIR/empresas/<id>/cadastros/<cadastro>.json antigos entram na primeira vez e viram .json.migrado (guardados).
// Valida cada campo pela definição (comum/cadastros.ts). Uma empresa nunca lê a pasta de outra.

import crypto from "node:crypto";
import path from "node:path";
import type { Cadastro, Campo } from "../comum/cadastros.ts";
import { idValido, raiz } from "../servidor/dados.ts";
import { normal } from "../servidor/util.ts";
import { arquivoDoBanco, banco, migrarUmaVez, transacao } from "../servidor/banco.ts";

export type Valor = string | number | boolean | null;
export interface Registro { id: string; criadoEm: string; atualizadoEm: string; atualizadoPor: string; [campo: string]: Valor }

function arquivo(empresaId: string, cad: Cadastro) {
  if (!idValido(empresaId) || !/^[a-z]+$/.test(cad.id)) throw new Error("Cadastro inválido.");
  return path.join(raiz(), "empresas", empresaId, "cadastros", `${cad.id}.json`);
}

// Na memória: um mapa por id para cada cadastro da empresa (gravar um registro é O(1)); a lista só é montada quando alguém pede.
interface Memoria { arquivoBanco: string; porId: Map<string, Registro>; lista?: readonly Registro[] }
const memoria = new Map<string, Memoria>();

function congelar<T>(v: T): T {
  if (v && typeof v === "object" && !Object.isFrozen(v)) { Object.freeze(v); for (const x of Object.values(v as object)) congelar(x); }
  return v;
}

function carregar(empresaId: string, cad: Cadastro): Memoria {
  const arq = arquivo(empresaId, cad); // valida a empresa e o cadastro
  const chave = `${empresaId}|${cad.id}`;
  const m = memoria.get(chave);
  if (m && m.arquivoBanco === arquivoDoBanco()) return m;
  migrarUmaVez(empresaId, `cadastro_${cad.id}`, arq, (conteudo) => {
    const l = Array.isArray(conteudo) ? (conteudo as Registro[]).filter((r) => r && typeof r.id === "string") : [];
    const ins = banco().prepare("INSERT OR IGNORE INTO cadastros_itens (empresa, cadastro, id, dados) VALUES (?, ?, ?, ?)");
    for (const r of l) ins.run(empresaId, cad.id, r.id, JSON.stringify(r));
    return l.length;
  });
  const porId = new Map<string, Registro>();
  for (const r of banco().prepare("SELECT dados FROM cadastros_itens WHERE empresa = ? AND cadastro = ? ORDER BY seq").all(empresaId, cad.id) as Array<{ dados: string }>) {
    const reg = congelar(JSON.parse(r.dados) as Registro);
    porId.set(reg.id, reg);
  }
  const novo: Memoria = { arquivoBanco: arquivoDoBanco(), porId };
  memoria.set(chave, novo);
  return novo;
}

export function listar(empresaId: string, cad: Cadastro): Registro[] {
  const m = carregar(empresaId, cad);
  m.lista ??= Object.freeze([...m.porId.values()]);
  return m.lista as Registro[]; // só leitura (memória): para mudar, copie e grave
}

/** Um registro pelo id (sem montar a lista). */
export const registroPorId = (empresaId: string, cad: Cadastro, id: string): Registro | undefined => carregar(empresaId, cad).porId.get(id);

/** Grava só os registros mudados (tudo ou nada) e atualiza a memória. */
function gravar(empresaId: string, cad: Cadastro, mudados: Registro[]) {
  const m = carregar(empresaId, cad);
  transacao(() => {
    const up = banco().prepare(`INSERT INTO cadastros_itens (empresa, cadastro, id, dados) VALUES (?, ?, ?, ?)
      ON CONFLICT (empresa, cadastro, id) DO UPDATE SET dados = excluded.dados`);
    for (const r of mudados) up.run(empresaId, cad.id, r.id, JSON.stringify(r));
  });
  for (const r of mudados) m.porId.set(r.id, congelar(structuredClone(r)));
  m.lista = undefined;
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
  gravar(empresaId, cad, [r]);
  return r;
}

export function atualizar(empresaId: string, cad: Cadastro, id: string, entrada: Record<string, unknown>, por: string): Registro {
  const atual = registroPorId(empresaId, cad, id);
  if (!atual) throw new Error(`${cad.singular[0].toUpperCase()}${cad.singular.slice(1)} não encontrado.`);
  const dados = limpar(cad, entrada, atual);
  conferirUnico(cad, listar(empresaId, cad), dados, id);
  const novo: Registro = { ...atual, ...dados, atualizadoEm: new Date().toISOString(), atualizadoPor: por };
  gravar(empresaId, cad, [novo]);
  return novo;
}

/**
 * Muda só alguns campos de um registro (os apps usam: o resto do registro fica como está).
 * Cada campo passa pela mesma conferência do formulário; campo calculado ou desconhecido é ignorado.
 */
export function alterarCampos(empresaId: string, cad: Cadastro, id: string, mudancas: Record<string, unknown>, por: string): Registro {
  const atual = registroPorId(empresaId, cad, id);
  if (!atual) throw new Error(`${cad.singular[0].toUpperCase()}${cad.singular.slice(1)} não encontrado.`);
  const dados: Record<string, Valor> = {};
  for (const c of cad.campos) if (!c.calculado && c.chave in mudancas) dados[c.chave] = limparCampo(c, mudancas[c.chave]);
  conferirUnico(cad, listar(empresaId, cad), { ...atual, ...dados }, id);
  const novo: Registro = { ...atual, ...dados, atualizadoEm: new Date().toISOString(), atualizadoPor: por };
  gravar(empresaId, cad, [novo]);
  return novo;
}

export function remover(empresaId: string, cad: Cadastro, id: string) {
  const m = carregar(empresaId, cad);
  if (!m.porId.has(id)) throw new Error("Registro não encontrado.");
  banco().prepare("DELETE FROM cadastros_itens WHERE empresa = ? AND cadastro = ? AND id = ?").run(empresaId, cad.id, id);
  m.porId.delete(id);
  m.lista = undefined;
}

/**
 * Junta registros importados: atualiza pela chave única (só campos vazios e os calculados, para não apagar o
 * que a central já editou) e cria os novos. Devolve quantos criou e quantos atualizou.
 */
export function mesclar(empresaId: string, cad: Cadastro, novos: Array<Record<string, Valor>>, por: string): { criados: number; atualizados: number } {
  const chave = cad.chaveUnica!;
  const porChave = new Map<string, Registro>(listar(empresaId, cad).map((r) => [normal(String(r[chave] ?? "")), r]));
  const calculados = new Set(cad.campos.filter((c) => c.calculado).map((c) => c.chave));
  const agora = new Date().toISOString();
  const mudados = new Map<string, Registro>(); // só os registros novos ou mudados vão para o banco
  let criados = 0, atualizados = 0;
  for (const n of novos) {
    const k = normal(String(n[chave] ?? ""));
    if (!k) continue;
    const existente = porChave.get(k);
    if (!existente) {
      const base: Record<string, Valor> = Object.fromEntries(cad.campos.map((c) => [c.chave, c.tipo === "booleano" ? false : null]));
      const novo: Registro = { ...base, ...n, id: crypto.randomUUID(), criadoEm: agora, atualizadoEm: agora, atualizadoPor: por };
      mudados.set(novo.id, novo);
      porChave.set(k, novo);
      criados++;
    } else {
      const r: Registro = mudados.get(existente.id) ?? { ...existente }; // cópia: a memória é só leitura
      let mudou = false;
      for (const [c, v] of Object.entries(n)) {
        if (v == null || v === "") continue;
        if (calculados.has(c) || r[c] == null || r[c] === "") { if (r[c] !== v) { r[c] = v; mudou = true; } }
      }
      if (mudou) { r.atualizadoEm = agora; atualizados++; mudados.set(r.id, r); porChave.set(k, r); }
    }
  }
  if (mudados.size) gravar(empresaId, cad, [...mudados.values()]); // nada mudou: não grava (cada corrida chama isto)
  return { criados, atualizados };
}

/** Só para os testes: esquece os cadastros da memória (força ler do banco). */
export const esquecerCadastrosDaMemoria = () => memoria.clear();
