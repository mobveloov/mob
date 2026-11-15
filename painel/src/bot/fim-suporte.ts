// Encerramento do suporte (atendimento humano pelo numero do bot). Modulo puro. Teste: supportClose.test.ts
// Pedido do dono (11/11/2026): ao encerrar, o passageiro recebe agradecimento e o bot NAO reenvia o menu/fluxo de corrida.
// Excecao: o passageiro que escreve "sair/voltar/corrida/1/menu" esta pedindo para voltar ao menu (regra v16.89).

export type SupportCloseBy = "attendant" | "timeout" | "passenger";

export const SUPPORT_THANKS_DEFAULT =
  "💛 Atendimento encerrado. Obrigado por falar com a gente! Quando precisar de uma corrida, é só mandar uma mensagem por aqui.";

/** Palavras do passageiro que pedem para voltar ao menu (e nao so encerrar). */
const BACK_TO_MENU = new Set(["sair", "voltar", "corrida", "1", "menu"]);

export function supportCloseDecision(by: SupportCloseBy, word = ""): { sendMenu: boolean; textKey: "support_thanks" | "support_exit" } {
  const w = String(word ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/[.!]+$/, "");
  if (by === "passenger" && BACK_TO_MENU.has(w)) return { sendMenu: true, textKey: "support_exit" };
  return { sendMenu: false, textKey: "support_thanks" };
}
