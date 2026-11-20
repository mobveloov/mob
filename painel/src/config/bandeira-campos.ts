// Config › Gerais › abas da "Alterando Bandeira" (Motorista, Passageiro, Financeiro, Filtros, Formas de pagamento, Recursos Premium).
// Os campos e as regras de cada um ficam em comum/bandeira-form.ts (o painel desenha o formulário dali). Aqui só se lê e se grava,
// em config/bandeira-campos.json. Os campos que o sistema já tinha em outro lugar (formas de pagamento aceitas) são sincronizados.

import { sanearForm, valoresPadrao, type ValoresForm } from "../comum/bandeira-form.ts";
import { gravarConfig, lerConfig } from "./armazem.ts";
import { pagamentos, salvarPagamentos } from "./pagamentos.ts";

export const camposBandeira = (empresaId: string): ValoresForm => sanearForm(lerConfig(empresaId, "bandeira-campos", {}), valoresPadrao());

/** Forma de pagamento da Machine -> método que o painel já usava em Config › Integrações. */
const METODO_DA_FORMA: Record<string, string> = { dinheiro: "Dinheiro", pix: "Pix", cartao_app: "Cartão no App" };

export function salvarCamposBandeira(empresaId: string, entrada: unknown): ValoresForm {
  const r = sanearForm(entrada, camposBandeira(empresaId));
  gravarConfig(empresaId, "bandeira-campos", r);
  const o = (entrada ?? {}) as Record<string, unknown>;
  if (Object.keys(o).some((k) => /^pag_.+_ativa$/.test(k))) {
    const metodos = { ...pagamentos(empresaId).metodos };
    for (const [forma, metodo] of Object.entries(METODO_DA_FORMA)) if (`pag_${forma}_ativa` in o) metodos[metodo] = !!r[`pag_${forma}_ativa`];
    if ("pag_debito_ativa" in o || "pag_credito_ativa" in o) metodos["Cartão na Maquininha"] = !!(r.pag_debito_ativa || r.pag_credito_ativa);
    salvarPagamentos(empresaId, { metodos });
  }
  return r;
}
