// Ruas (regras de via): corrigem o nome de exibição de uma rua para a central, dentro do traçado desenhado
// no mapa. Útil quando o nome que o mapa devolve não é o que os moradores usam. Por empresa
// (DADOS_DIR/empresas/<id>/gestao/ruas.json). Vale nos endereços achados pelo ponto e pela busca.

import crypto from "node:crypto";
import { gravarG, lerG } from "../gestao/armazem.ts";
import { arred, normal } from "../servidor/util.ts";
import { dentroDe, type Ponto } from "./areas.ts";

// Como na Machine, a regra tem Rua, Bairro de exibição e CEP (os três obrigatórios) e o traçado no mapa.
// "nomeExibicao" é a Rua. Regras antigas, sem bairro e CEP, continuam valendo só para o nome da rua.
export interface RegraVia { id: string; nomeExibicao: string; bairro?: string; cep?: string; nomeNoMapa: string; poligono: Ponto[]; ativa: boolean; criadoEm: string }
export interface EntradaRegra { nomeExibicao?: unknown; bairro?: unknown; cep?: unknown; nomeNoMapa?: unknown; poligono?: unknown; ativa?: unknown }

const MAX_REGRAS = 500;
export const regrasDeVia = (empresaId: string) => lerG<RegraVia[]>(empresaId, "ruas", []);
const limpo = (v: unknown, max: number) => String(v ?? "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);

function tracado(v: unknown): Ponto[] {
  const l = Array.isArray(v) ? v : [];
  const pts = l.filter((p) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === "number" && Number.isFinite(n)) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180)
    .map((p) => [arred(p[0], 6), arred(p[1], 6)] as Ponto);
  if (pts.length > 300) throw new Error("Traçado com pontos demais (máximo 300).");
  if (pts.length < 3) throw new Error("Desenhe o traçado da rua no mapa (pelo menos 3 pontos).");
  return pts;
}

function validar(e: EntradaRegra) {
  const nomeExibicao = limpo(e.nomeExibicao, 50);
  if (nomeExibicao.length < 2) throw new Error("Informe o nome da rua.");
  const bairro = limpo(e.bairro, 50);
  if (bairro.length < 2) throw new Error("Informe o bairro de exibição.");
  const digitos = String(e.cep ?? "").replace(/\D/g, "");
  if (digitos.length !== 8) throw new Error("Informe o CEP com 8 números (00000-000).");
  return { nomeExibicao, bairro, cep: `${digitos.slice(0, 5)}-${digitos.slice(5)}`, nomeNoMapa: limpo(e.nomeNoMapa, 80), poligono: tracado(e.poligono), ativa: e.ativa !== false };
}

export function criarRegra(empresaId: string, e: EntradaRegra): RegraVia {
  const l = regrasDeVia(empresaId);
  if (l.length >= MAX_REGRAS) throw new Error("Limite de regras de via atingido.");
  const r: RegraVia = { id: crypto.randomUUID(), ...validar(e), criadoEm: new Date().toISOString() };
  gravarG(empresaId, "ruas", [...l, r]);
  return r;
}

export function atualizarRegra(empresaId: string, id: string, e: EntradaRegra): RegraVia {
  const l = regrasDeVia(empresaId), r = l.find((x) => x.id === id);
  if (!r) throw new Error("Regra não encontrada.");
  Object.assign(r, validar(e));
  gravarG(empresaId, "ruas", l);
  return r;
}

export function removerRegra(empresaId: string, id: string) {
  const l = regrasDeVia(empresaId);
  if (!l.some((x) => x.id === id)) throw new Error("Regra não encontrada.");
  gravarG(empresaId, "ruas", l.filter((x) => x.id !== id));
}

/**
 * Troca o nome da rua do endereço pelo nome de exibição, se o ponto cair dentro do traçado de uma regra ativa.
 * Regra sem "nome no mapa" vale para qualquer rua dentro do traçado. A regra mais nova vence se houver duas.
 */
export function aplicarRegrasDeVia<E extends { texto: string; rua: string; lat: number; lng: number; bairro?: string; cep?: string }>(empresaId: string, e: E): E {
  const regras = regrasDeVia(empresaId).filter((r) => r.ativa);
  if (!regras.length || !Number.isFinite(e.lat) || !Number.isFinite(e.lng)) return e;
  for (const r of [...regras].reverse()) {
    if (!dentroDe(e.lat, e.lng, r.poligono)) continue;
    if (r.nomeNoMapa && !normal(e.rua).includes(normal(r.nomeNoMapa))) continue;
    let texto = e.rua && e.texto.includes(e.rua) ? e.texto.replace(e.rua, r.nomeExibicao) : e.texto;
    const extra: { bairro?: string; cep?: string } = {};
    if (r.bairro) { if (e.bairro && texto.includes(e.bairro)) texto = texto.replace(e.bairro, r.bairro); if (e.bairro !== undefined) extra.bairro = r.bairro; }
    if (r.cep && e.cep !== undefined) { if (e.cep && texto.includes(e.cep)) texto = texto.replace(e.cep, r.cep); extra.cep = r.cep; }
    return { ...e, ...extra, rua: r.nomeExibicao, texto };
  }
  return e;
}
