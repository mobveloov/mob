// Config › Integrações (parte de pagamentos): credenciais do Mercado Pago (segredo, nunca volta para o navegador), cartão no app,
// métodos de pagamento aceitos e regras de recarga e saque por Pix. Sistema A/B e chaves de IA continuam nas rotas de /api/integracoes.

import * as D from "../servidor/dados.ts";
import { centavos, gravarConfig, lerConfig, numero, sim, texto, umDe } from "./armazem.ts";

export const METODOS = ["Dinheiro", "Pix", "Cartão na Maquininha", "Saldo da Carteira", "Cartão no App"] as const;
export interface Pagamentos {
  cartaoApp: { ativo: boolean; modelo: "split" | "carteira"; quemPaga: "motorista" | "plataforma"; taxaExtraTipo: "nenhum" | "porcentagem" | "fixo"; taxaExtraValor: number; comissaoEspecifica: number | null };
  metodos: Record<string, boolean>;
  recarga: { passageiro: boolean; minimoPassageiro: number; motorista: boolean; minimoMotorista: number };
  saque: { ativo: boolean; minimo: number; taxaFixa: number };
}
export const PAGAMENTOS_PADRAO: Pagamentos = {
  cartaoApp: { ativo: false, modelo: "carteira", quemPaga: "motorista", taxaExtraTipo: "nenhum", taxaExtraValor: 0, comissaoEspecifica: null },
  metodos: Object.fromEntries(METODOS.map((m) => [m, m !== "Cartão no App"])),
  recarga: { passageiro: false, minimoPassageiro: 5, motorista: false, minimoMotorista: 20 },
  saque: { ativo: true, minimo: 10, taxaFixa: 0 },
};

export function sanearPagamentos(e: unknown, atual: Pagamentos = PAGAMENTOS_PADRAO): Pagamentos {
  const o = (e ?? {}) as Record<string, Record<string, unknown>>;
  const c = { ...atual.cartaoApp, ...(o.cartaoApp ?? {}) } as Record<string, unknown>, r = { ...atual.recarga, ...(o.recarga ?? {}) } as Record<string, unknown>, s = { ...atual.saque, ...(o.saque ?? {}) } as Record<string, unknown>;
  const m = { ...atual.metodos, ...(o.metodos ?? {}) } as Record<string, unknown>;
  return {
    cartaoApp: {
      ativo: sim(c.ativo), modelo: umDe(c.modelo, ["split", "carteira"] as const, "carteira"), quemPaga: umDe(c.quemPaga, ["motorista", "plataforma"] as const, "motorista"),
      taxaExtraTipo: umDe(c.taxaExtraTipo, ["nenhum", "porcentagem", "fixo"] as const, "nenhum"), taxaExtraValor: centavos(numero(c.taxaExtraValor, 0, 0, 1000)),
      comissaoEspecifica: c.comissaoEspecifica === "" || c.comissaoEspecifica == null ? null : centavos(numero(c.comissaoEspecifica, 0, 0, 100)),
    },
    metodos: Object.fromEntries(METODOS.map((k) => [k, sim(m[k], PAGAMENTOS_PADRAO.metodos[k])])),
    recarga: { passageiro: sim(r.passageiro), minimoPassageiro: centavos(numero(r.minimoPassageiro, 5, 0, 10_000)), motorista: sim(r.motorista), minimoMotorista: centavos(numero(r.minimoMotorista, 20, 0, 10_000)) },
    saque: { ativo: sim(s.ativo, true), minimo: centavos(numero(s.minimo, 10, 0, 10_000)), taxaFixa: centavos(numero(s.taxaFixa, 0, 0, 1000)) },
  };
}
export const pagamentos = (empresaId: string): Pagamentos => sanearPagamentos(lerConfig(empresaId, "pagamentos", {}), PAGAMENTOS_PADRAO);
export function salvarPagamentos(empresaId: string, entrada: unknown): Pagamentos {
  const p = sanearPagamentos(entrada, pagamentos(empresaId));
  gravarConfig(empresaId, "pagamentos", p);
  return p;
}

// ---- credenciais do Mercado Pago: ficam em segredos.json (modo restrito), nunca voltam inteiras
export const CAMPOS_MP = [
  { chave: "mp_access_token", rotulo: "Access Token", secreto: true }, { chave: "mp_public_key", rotulo: "Public Key", secreto: true },
  { chave: "mp_client_id", rotulo: "Client ID", secreto: false }, { chave: "mp_client_secret", rotulo: "Client Secret", secreto: true },
] as const;
export const MASCARA = "••••••";

export function credenciaisMp(empresaId: string): Record<string, string> {
  const c = D.segredos(empresaId).integracoes["pagamentos"] ?? {};
  return Object.fromEntries(CAMPOS_MP.map((f) => [f.chave, f.secreto ? (c[f.chave] ? MASCARA : "") : c[f.chave] ?? ""]));
}
export function salvarCredenciaisMp(empresaId: string, novos: Record<string, unknown>) {
  const seg = D.segredos(empresaId);
  const atual = { ...(seg.integracoes["pagamentos"] ?? {}) };
  for (const f of CAMPOS_MP) {
    const v = novos[f.chave];
    if (typeof v !== "string" || v === MASCARA) continue;
    const t = texto(v, 500);
    if (t) atual[f.chave] = t; else delete atual[f.chave];
  }
  seg.integracoes["pagamentos"] = atual;
  D.salvarSegredos(empresaId, seg);
}
