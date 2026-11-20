// Config › Carteiras de crédito (igual à tela da Machine): saldo mínimo e mensagem de recarga do motorista, quais movimentações
// (recarga, saque, Pix, presencial, telefone) aparecem na carteira do app, repasse imediato da taxa de cancelamento e recarga do passageiro.
// Os números que já tinham dono continuam no lugar de sempre, para o despacho e os apps lerem uma fonte só:
//   saldo mínimo e aviso de recarga -> gestao/regras (creditosPadrao); recarga, mínimo de recarga e saque -> config/pagamentos.
// O que é novo (Pix, Saque automático, Presencial, Telefone, Repasse, valores lembrados) fica em config/carteiras-credito.json.

import { creditosPadrao, salvarCreditosPadrao } from "../gestao/regras.ts";
import { centavos, gravarConfig, lerConfig, numero, sim, texto } from "./armazem.ts";
import { pagamentos, salvarPagamentos } from "./pagamentos.ts";

interface Propria {
  /** Valores lembrados mesmo com a opção em "Não" (a Machine mantém o número na tela). */
  saldoMinimoValor: number; avisoRecargaValor: number;
  pix: boolean; saqueAutomaticoPix: boolean; presencial: boolean; telefoneAtivo: boolean; telefone: string; repasseTaxaCancelamento: boolean;
}
const PADRAO: Propria = { saldoMinimoValor: -10, avisoRecargaValor: 5, pix: true, saqueAutomaticoPix: false, presencial: false, telefoneAtivo: false, telefone: "", repasseTaxaCancelamento: true };

export interface CarteirasCredito {
  motorista: {
    saldoMinimoAtivo: boolean; saldoMinimo: number; mensagemRecargaAtiva: boolean; mensagemRecargaValor: number;
    recarga: boolean; saque: boolean; pix: boolean; minimoRecargaPix: number; saqueAutomaticoPix: boolean;
    presencial: boolean; telefoneAtivo: boolean; telefone: string; repasseTaxaCancelamento: boolean;
  };
  passageiro: { recargaApp: boolean };
}

const propria = (empresaId: string): Propria => {
  const o = lerConfig<Record<string, unknown>>(empresaId, "carteiras-credito", {});
  return {
    saldoMinimoValor: centavos(numero(o.saldoMinimoValor, PADRAO.saldoMinimoValor, -100_000, 100_000)),
    avisoRecargaValor: centavos(numero(o.avisoRecargaValor, PADRAO.avisoRecargaValor, -100_000, 100_000)),
    pix: sim(o.pix, PADRAO.pix), saqueAutomaticoPix: sim(o.saqueAutomaticoPix, PADRAO.saqueAutomaticoPix),
    presencial: sim(o.presencial, PADRAO.presencial), telefoneAtivo: sim(o.telefoneAtivo, PADRAO.telefoneAtivo),
    telefone: texto(o.telefone, 30), repasseTaxaCancelamento: sim(o.repasseTaxaCancelamento, PADRAO.repasseTaxaCancelamento),
  };
};

export function carteirasCredito(empresaId: string): CarteirasCredito {
  const c = creditosPadrao(empresaId), p = pagamentos(empresaId), o = propria(empresaId);
  return {
    motorista: {
      saldoMinimoAtivo: c.saldoMinimo != null, saldoMinimo: c.saldoMinimo ?? o.saldoMinimoValor,
      mensagemRecargaAtiva: c.avisoRecarga != null, mensagemRecargaValor: c.avisoRecarga ?? o.avisoRecargaValor,
      recarga: p.recarga.motorista, saque: p.saque.ativo, pix: o.pix, minimoRecargaPix: p.recarga.minimoMotorista,
      saqueAutomaticoPix: o.saqueAutomaticoPix, presencial: o.presencial, telefoneAtivo: o.telefoneAtivo, telefone: o.telefone,
      repasseTaxaCancelamento: o.repasseTaxaCancelamento,
    },
    passageiro: { recargaApp: p.recarga.passageiro },
  };
}

export function salvarCarteirasCredito(empresaId: string, entrada: unknown): CarteirasCredito {
  const atual = carteirasCredito(empresaId), antigo = propria(empresaId);
  const m = { ...atual.motorista, ...(((entrada ?? {}) as Record<string, unknown>).motorista as object ?? {}) } as Record<string, unknown>;
  const pa = ((entrada ?? {}) as Record<string, Record<string, unknown>>).passageiro ?? {};
  const valor = (v: unknown, rotulo: string) => {
    if (typeof v === "string" && v.trim() === "") throw new Error(`Informe ${rotulo}.`);
    const n = numero(v, NaN, -100_000, 100_000);
    if (!Number.isFinite(n)) throw new Error(`Valor inválido: ${rotulo}.`);
    return centavos(n);
  };
  const saldoMinimoAtivo = sim(m.saldoMinimoAtivo), mensagemAtiva = sim(m.mensagemRecargaAtiva);
  const saldoMinimo = valor(m.saldoMinimo, "o saldo mínimo");
  const avisoValor = valor(m.mensagemRecargaValor, "o valor para a mensagem de recarga");
  const minimoRecarga = numero(m.minimoRecargaPix, NaN, 0, 10_000);
  if (!Number.isFinite(minimoRecarga)) throw new Error("Informe o valor mínimo para recarga.");
  const telefoneAtivo = sim(m.telefoneAtivo), telefone = texto(m.telefone, 30);
  if (telefoneAtivo && telefone.replace(/\D/g, "").length < 8) throw new Error("Informe o telefone para o motorista realizar a recarga ou o saque.");

  salvarCreditosPadrao(empresaId, { ...creditosPadrao(empresaId), saldoMinimo: saldoMinimoAtivo ? saldoMinimo : null, avisoRecarga: mensagemAtiva ? avisoValor : null });
  salvarPagamentos(empresaId, { recarga: { motorista: sim(m.recarga), minimoMotorista: centavos(minimoRecarga), passageiro: sim(pa.recargaApp, atual.passageiro.recargaApp) }, saque: { ativo: sim(m.saque) } });
  gravarConfig(empresaId, "carteiras-credito", {
    saldoMinimoValor: saldoMinimo, avisoRecargaValor: avisoValor,
    pix: sim(m.pix), saqueAutomaticoPix: sim(m.saqueAutomaticoPix), presencial: sim(m.presencial), telefoneAtivo, telefone,
    repasseTaxaCancelamento: sim(m.repasseTaxaCancelamento, antigo.repasseTaxaCancelamento),
  } satisfies Propria);
  return carteirasCredito(empresaId);
}

/** O que o app do motorista mostra na carteira: botões, telefone/presencial e o aviso de saldo baixo. */
export function carteiraParaApp(empresaId: string, saldo: number) {
  const c = carteirasCredito(empresaId).motorista;
  const aviso = c.mensagemRecargaAtiva && c.recarga && saldo <= c.mensagemRecargaValor
    ? `Seu saldo está baixo (R$ ${saldo.toFixed(2).replace(".", ",")}). Recarregue para continuar recebendo corridas.` : "";
  return {
    movimentos: { recarga: c.recarga, saque: c.saque, pix: c.pix, presencial: c.presencial, telefone: c.telefoneAtivo ? c.telefone : "" },
    avisoRecarga: aviso,
  };
}
