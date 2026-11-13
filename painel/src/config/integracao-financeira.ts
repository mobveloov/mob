// Config › Integrações › Transações financeiras (formato da Machine): dados bancários do recebedor, plano de recebimento,
// "quem recebe", taxa de cartão e configurações de Pix. Tudo por empresa.
// Os dados bancários são sensíveis: ficam em segredos.json (modo restrito), só o admin os lê e altera, e a conta e o CNPJ
// voltam sempre mascarados. Nenhuma chave de provedor fica aqui (elas vêm de variável de ambiente ou do segredo mascarado do Mercado Pago).

import * as D from "../servidor/dados.ts";
import { gravarConfig, lerConfig, sim, texto, umDe } from "./armazem.ts";
import { MASCARA, pagamentos, salvarPagamentos } from "./pagamentos.ts";

export const PLANOS = [
  { id: "d1", nome: "Até 1 dia útil (D+1)", taxa: 4.99 }, { id: "d30", nome: "Até 30 dias (D+30)", taxa: 4.4 },
] as const;
/** Taxa de Pix por transação, conforme o plano da central (valores informativos, iguais aos da Machine). */
export const TAXAS_PIX = [
  { planos: ["Standard", "Prata", "Avançado", "Essencial", "Premium", "Start"], taxa: 1.5 }, { planos: ["Ouro", "Super", "Growth"], taxa: 1.2 }, { planos: ["Top", "Master"], taxa: 1 },
] as const;
export const PIX_MINIMO_TRANSACAO = 0.1;

export interface IntegracaoFinanceira {
  plano: "d1" | "d30" | "";
  quemRecebe: "motorista" | "central" | "dividido";
  taxaDe: "motorista" | "central";
  pixRecargas: boolean;
  pixPagamentos: boolean;
  cadastro: { situacao: "pendente" | "em_analise"; atualizadoEm: string | null; por: string };
}

export interface DadosBancarios { banco: string; agencia: string; agenciaDv: string; conta: string; contaDv: string; correntista: string; cnpj: string }
const CAMPOS_BANCO = ["banco", "agencia", "agenciaDv", "conta", "contaDv", "correntista", "cnpj"] as const;
const digitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

export function cnpjValido(v: string): boolean {
  const c = digitos(v);
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const dv = (n: number) => {
    let soma = 0, peso = n - 7;
    for (let i = 0; i < n; i++) { soma += Number(c[i]) * peso; peso = peso === 2 ? 9 : peso - 1; }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13]);
}

const mascararFim = (v: string, manter = 2) => (v ? MASCARA + v.slice(-manter) : "");
/** Dados salvos (sem máscara). Uso interno: nunca devolver direto ao navegador. */
const bancoSalvo = (empresaId: string): DadosBancarios => {
  const s = D.segredos(empresaId).integracoes["bancario"] ?? {};
  return Object.fromEntries(CAMPOS_BANCO.map((k) => [k, s[k] ?? ""])) as unknown as DadosBancarios;
};
export const bancoCompleto = (b: DadosBancarios) => !!(b.banco && b.agencia && b.conta && b.contaDv && b.correntista && b.cnpj);
/** Versão para a tela do admin: conta e CNPJ mascarados. */
export const bancoMascarado = (empresaId: string): DadosBancarios => {
  const b = bancoSalvo(empresaId);
  return { ...b, conta: mascararFim(b.conta), cnpj: mascararFim(b.cnpj, 4) };
};
export const bancoPreenchido = (empresaId: string) => bancoCompleto(bancoSalvo(empresaId));

/** Grava os dados bancários; campo ausente ou igual à máscara mantém o valor guardado. */
export function salvarDadosBancarios(empresaId: string, entrada: unknown): void {
  const o = (entrada ?? {}) as Record<string, unknown>, novo: DadosBancarios = { ...bancoSalvo(empresaId) };
  const mudou = (k: keyof DadosBancarios) => typeof o[k] === "string" && !String(o[k]).startsWith(MASCARA);
  if (mudou("banco")) { novo.banco = digitos(o.banco); if (novo.banco && !/^\d{1,4}$/.test(novo.banco)) throw new Error("Número do banco inválido."); }
  if (mudou("agencia")) { novo.agencia = digitos(o.agencia); if (novo.agencia && !/^\d{1,5}$/.test(novo.agencia)) throw new Error("Número da agência inválido."); }
  if (mudou("agenciaDv")) { novo.agenciaDv = texto(o.agenciaDv, 2).toUpperCase(); if (novo.agenciaDv && !/^[0-9X]$/.test(novo.agenciaDv)) throw new Error("Dígito da agência inválido."); }
  if (mudou("conta")) { novo.conta = digitos(o.conta); if (novo.conta && !/^\d{1,12}$/.test(novo.conta)) throw new Error("Número da conta inválido."); }
  if (mudou("contaDv")) { novo.contaDv = texto(o.contaDv, 2).toUpperCase(); if (novo.contaDv && !/^[0-9X]$/.test(novo.contaDv)) throw new Error("Dígito da conta inválido."); }
  if (mudou("correntista")) novo.correntista = texto(o.correntista, 120);
  if (mudou("cnpj")) { novo.cnpj = digitos(o.cnpj); if (novo.cnpj && !cnpjValido(novo.cnpj)) throw new Error("CNPJ do correntista inválido."); }
  const seg = D.segredos(empresaId);
  seg.integracoes["bancario"] = { ...novo };
  D.salvarSegredos(empresaId, seg);
}

export function integracaoFinanceira(empresaId: string): IntegracaoFinanceira {
  const o = lerConfig<Partial<IntegracaoFinanceira>>(empresaId, "integracao-financeira", {});
  const c = (o.cadastro ?? {}) as Partial<IntegracaoFinanceira["cadastro"]>;
  return {
    plano: umDe(o.plano, ["d1", "d30", ""] as const, ""), quemRecebe: umDe(o.quemRecebe, ["motorista", "central", "dividido"] as const, "central"),
    taxaDe: umDe(o.taxaDe, ["motorista", "central"] as const, "motorista"), pixRecargas: sim(o.pixRecargas), pixPagamentos: sim(o.pixPagamentos),
    cadastro: { situacao: umDe(c.situacao, ["pendente", "em_analise"] as const, "pendente"), atualizadoEm: typeof c.atualizadoEm === "string" ? c.atualizadoEm : null, por: texto(c.por, 120) },
  };
}

/** Grava plano, quem recebe, taxa e Pix, e mantém o cartão no app e as recargas (Pagamentos) coerentes com as escolhas. */
export function salvarIntegracaoFinanceira(empresaId: string, entrada: unknown): IntegracaoFinanceira {
  const o = (entrada ?? {}) as Record<string, unknown>, atual = integracaoFinanceira(empresaId), n = integracaoFinanceira(empresaId);
  if (o.plano !== undefined) n.plano = umDe(o.plano, ["d1", "d30"] as const, "d1");
  if (o.quemRecebe !== undefined) n.quemRecebe = umDe(o.quemRecebe, ["motorista", "central", "dividido"] as const, "central");
  if (o.taxaDe !== undefined) n.taxaDe = umDe(o.taxaDe, ["motorista", "central"] as const, "motorista");
  if (o.pixRecargas !== undefined) n.pixRecargas = sim(o.pixRecargas);
  if (o.pixPagamentos !== undefined) n.pixPagamentos = sim(o.pixPagamentos);
  // Mudou algo que a operadora precisa conferir: o cadastro volta a ficar pendente até "Atualizar cadastro".
  if (n.plano !== atual.plano || n.quemRecebe !== atual.quemRecebe) n.cadastro = { situacao: "pendente", atualizadoEm: null, por: "" };
  gravarConfig(empresaId, "integracao-financeira", n);
  const rec = pagamentos(empresaId).recarga;
  salvarPagamentos(empresaId, {
    cartaoApp: { modelo: n.quemRecebe === "motorista" ? "split" : "carteira", quemPaga: n.taxaDe === "central" ? "plataforma" : "motorista" },
    recarga: o.pixRecargas !== undefined ? { ...rec, passageiro: n.pixRecargas, motorista: n.pixRecargas } : rec,
  });
  return n;
}

/** "Atualizar cadastro": registra o pedido de conferência (sem chamar nenhum serviço externo). Exige plano e dados bancários completos. */
export function atualizarCadastro(empresaId: string, por: string): IntegracaoFinanceira {
  const n = integracaoFinanceira(empresaId);
  if (!n.plano) throw new Error("Escolha um plano de recebimento antes de atualizar o cadastro.");
  if (!bancoPreenchido(empresaId)) throw new Error("Preencha os dados bancários obrigatórios antes de atualizar o cadastro.");
  n.cadastro = { situacao: "em_analise", atualizadoEm: new Date().toISOString(), por: texto(por, 120) };
  gravarConfig(empresaId, "integracao-financeira", n);
  return n;
}

/** Taxa de cartão (%) do plano escolhido e quem a paga. */
export function taxaCartao(empresaId: string): { plano: string; percentual: number; pagaPor: "motorista" | "central" } {
  const n = integracaoFinanceira(empresaId), pl = PLANOS.find((x) => x.id === n.plano);
  return { plano: n.plano, percentual: pl?.taxa ?? 0, pagaPor: n.taxaDe };
}

/** Resposta da tela: o bloco bancário só vai para o admin; os demais veem apenas se está preenchido. */
export function visaoIntegracao(empresaId: string, admin: boolean) {
  return {
    ...integracaoFinanceira(empresaId), planos: PLANOS, taxasPix: TAXAS_PIX, pixMinimo: PIX_MINIMO_TRANSACAO, taxa: taxaCartao(empresaId),
    bancoPreenchido: bancoPreenchido(empresaId), ...(admin ? { banco: bancoMascarado(empresaId) } : {}),
  };
}
