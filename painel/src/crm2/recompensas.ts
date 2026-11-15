// CRM › Recompensas: cupons (aba Cupons do CRM do sistema de referência). Sem Machine, os cupons são os do cadastro "Cupons"
// do painel (Cadastro › Cupons), os mesmos que o bot, o totem e as campanhas usam. Aqui eles aparecem com os usos e o desconto dado.

import * as Cad from "../cadastros/armazem.ts";
import { cadastroPorId } from "../comum/cadastros.ts";
import type { CorridaPainel } from "../comum/corrida.ts";
import { normal } from "../servidor/util.ts";
import { DIA, realDe } from "./base.ts";

export interface CupomLinha {
  id: string; code: string; name: string; discount_type: "percent" | "fixed"; discount_value: number; current_uses: number; passengers_used: number;
  valid_from: string; valid_until: string; origin: "manual" | "automatico"; phone: string; is_active: boolean; vigente: boolean;
}

const cad = () => { const c = cadastroPorId("cupons"); if (!c) throw new Error("Cadastro de cupons indisponível."); return c; };

/** Cupons do cadastro com os usos contados nas corridas finalizadas. `hoje` = AAAA-MM-DD (Brasília). */
export function listarCupons(empresa: string, corridas: CorridaPainel[], hoje: string, origem = "all"): CupomLinha[] {
  const usos = new Map<string, { n: number; pessoas: Set<string> }>();
  for (const c of corridas) {
    if (c.grupo !== "finalizada" || !c.cupom) continue;
    const k = normal(c.cupom);
    const u = usos.get(k) ?? { n: 0, pessoas: new Set<string>() };
    u.n++; u.pessoas.add(c.telefonePassageiro || c.passageiro);
    usos.set(k, u);
  }
  return Cad.listar(empresa, cad()).map((r): CupomLinha => {
    const code = String(r.codigo ?? "").trim().toUpperCase();
    const inicio = String(r.inicio ?? ""), fim = String(r.fim ?? "");
    const ativo = r.ativo === true;
    const u = usos.get(normal(code));
    return {
      id: r.id, code, name: String(r.descricao ?? "") || code, discount_type: r.tipoDesconto === "Valor fixo" ? "fixed" : "percent",
      discount_value: Number(r.valor) || 0, current_uses: u?.n ?? 0, passengers_used: u?.pessoas.size ?? 0, valid_from: inicio, valid_until: fim,
      origin: r.automatico === true ? "automatico" : "manual", phone: String(r.clienteTelefone ?? ""), is_active: ativo,
      vigente: ativo && (!inicio || inicio <= hoje) && (!fim || fim >= hoje),
    };
  }).filter((c) => origem === "all" || c.origin === origem).reverse(); // mais novos primeiro (o cadastro guarda por ordem de criação)
}

export function resumoDeCupons(linhas: CupomLinha[]) {
  return { total: linhas.length, used: linhas.filter((c) => c.current_uses > 0).length, active: linhas.filter((c) => c.vigente).length };
}

/** Desconto dado pelos cupons nos últimos 30 dias (corridas finalizadas com cupom e desconto). */
export function descontoDosUltimos30Dias(corridas: CorridaPainel[], agora = Date.now()) {
  let total = 0, corridasComCupom = 0;
  for (const c of corridas) {
    if (c.grupo !== "finalizada" || !c.cupom || !(c.desconto && c.desconto > 0)) continue;
    const q = realDe(c.finalizadaEm ?? c.solicitadaEm);
    if (q == null || q < agora - 30 * DIA) continue;
    total += c.desconto; corridasComCupom++;
  }
  return { total: Math.round(total * 100) / 100, corridas: corridasComCupom };
}

export interface NovoCupom { name?: unknown; code?: unknown; discountType?: unknown; discount?: unknown; usageLimit?: unknown; usesPerUser?: unknown; validFrom?: unknown; validUntil?: unknown; cidade?: unknown }

/** Cria o cupom no cadastro (mesmas regras do cadastro: código único, valor obrigatório). */
export function criarCupom(empresa: string, b: NovoCupom, por: string) {
  const code = String(b.code ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 21);
  const name = String(b.name ?? "").trim().slice(0, 80);
  if (!name || !code) throw new Error("Nome e código são obrigatórios");
  const valor = Number(b.discount);
  if (!Number.isFinite(valor) || valor <= 0) throw new Error("Informe o desconto.");
  const fixo = b.discountType === "valor_fixo";
  if (!fixo && valor > 100) throw new Error("O desconto percentual não passa de 100.");
  const limite = String(b.usageLimit ?? "ate_n_vezes_por_passageiro");
  const usoPorPassageiro = limite === "apenas_uma_vez" ? 1 : limite === "sem_limite" ? null : Math.max(1, Math.floor(Number(b.usesPerUser)) || 1);
  const data = (v: unknown) => (/^\d{4}-\d{2}-\d{2}/.test(String(v ?? "")) ? String(v).slice(0, 10) : "");
  return Cad.criar(empresa, cad(), {
    codigo: code, descricao: name, tipoDesconto: fixo ? "Valor fixo" : "Percentual", valor, cidade: String(b.cidade ?? "").trim().slice(0, 60),
    inicio: data(b.validFrom), fim: data(b.validUntil), usoPorPassageiro, ativo: true,
  }, por);
}

export function removerCupom(empresa: string, id: string) {
  if (!Cad.registroPorId(empresa, cad(), id)) throw new Error("Cupom não encontrado.");
  Cad.remover(empresa, cad(), id);
}
