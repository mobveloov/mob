// Envio das ações do Mapa de engajamento (notificação, mensagem, cupom e desafio) para as pessoas de uma faixa.
// Passageiro: a "chave" do app é o telefone só com números. Motorista: o id do cadastro.

import { avisar } from "../apps/push.ts";
import { responder } from "../config/comunicacao.ts";

export type TipoAcao = "notificacao" | "mensagem" | "desafio" | "cupom";

export async function dispararPara(
  empresaId: string, papel: "motoristas" | "passageiros", tipo: TipoAcao,
  alvos: Array<{ chave: string; nome: string }>, d: { titulo: string; texto: string; cupom: string },
): Promise<number> {
  const app = papel === "motoristas" ? "motorista" : "passageiro";
  let n = 0;
  for (const a of alvos) {
    const chave = app === "passageiro" ? a.chave.replace(/\D/g, "") : a.chave;
    const primeiro = a.nome.trim().split(/\s+/)[0] ?? "";
    const trocar = (t: string) => t.replace(/\{nome\}/g, primeiro);
    if (tipo === "mensagem") { responder(empresaId, app, chave, trocar(d.texto)); n++; continue; }
    const titulo = tipo === "desafio" ? `Desafio: ${trocar(d.titulo)}` : trocar(d.titulo);
    const texto = tipo === "cupom" ? `${trocar(d.texto)} Use o cupom ${d.cupom}.`.trim() : trocar(d.texto);
    await avisar(empresaId, { papel: app, chave }, { titulo, texto, canal: "geral", dados: { tipo: "engajamento" } });
    n++;
  }
  return n;
}
