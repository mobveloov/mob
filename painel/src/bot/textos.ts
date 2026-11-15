// Textos do bot. Sempre com o nome da empresa e do assistente da marca (white-label).

import * as D from "../servidor/dados.ts";
import { DEST_REQUIRED_TEXT, DEST_RETRY_REQUIRED_TEXT } from "./destino.ts";
import { renderStatusMessage, statusKeyFor, type StatusMessages } from "./mensagens-status.ts";
import type { CategoriaBot, Rascunho } from "./tipos.ts";

export interface Marcador { empresa: string; assistente: string }

export function marcador(empresaId: string): Marcador {
  const m = D.marca(empresaId);
  return { empresa: m.nomeExibido, assistente: m.assistente.nome };
}

const reais = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;
const primeiroNome = (nome: string) => (/^\d+$/.test(nome) ? "" : nome.trim().split(/\s+/)[0] ?? "");

/** Formas de pagamento (o nome vai igual para a corrida própria). */
export const PAGAMENTOS: string[] = ["Dinheiro", "Pix", "Cartão na maquininha"];

export const T = {
  menu: (m: Marcador, nome: string) => {
    const n = primeiroNome(nome);
    return `Olá${n ? `, ${n}` : ""}! Aqui é ${m.assistente}, da ${m.empresa}. 👋\n\nComo posso ajudar?\n*1* - Pedir uma corrida\n*2* - Falar com o suporte`;
  },
  menuDeNovo: () => "Não entendi. Responda *1* para pedir uma corrida ou *2* para falar com o suporte.",
  embarque: () => "Onde você está? Envie o *endereço de embarque* (rua e número) ou a sua *localização* pelo clipe 📎.",
  embarqueCorrecao: () => "🔄 Sem problema! Qual é o *endereço* correto de embarque? Envie o endereço ou a localização 📎.",
  embarqueDeNovo: () => "Preciso do endereço de embarque. Exemplo: *Rua das Flores, 120*. Ou envie a localização 📎.",
  destino: (podePular = true) => `Para onde você vai? Envie o *endereço de destino*.${podePular ? "\nSe preferir não informar, responda *2*." : ""}`,
  destinoDeNovo: (podePular = true) => (podePular ? "Não entendi o destino. Envie o endereço (exemplo: *Av. Brasil, 500*) ou *2* para seguir sem destino." : DEST_RETRY_REQUIRED_TEXT),
  destinoObrigatorio: () => DEST_REQUIRED_TEXT,
  confirmar: (r: Rascunho) =>
    `Confira o pedido:\n📍 *Embarque:* ${r.embarque?.texto || "localização enviada"}\n🏁 *Destino:* ${r.semDestino ? "não informado (combine com o motorista)" : r.destino?.texto}\n\nEstá certo?\n*1* - Sim\n*2* - Não, quero corrigir`,
  confirmarDeNovo: () => "Responda *1* para confirmar ou *2* para corrigir.",
  categorias: (l: CategoriaBot[]) =>
    `Escolha a categoria:\n${l.map((c, i) => `*${i + 1}* - ${c.nome}${c.preco ? ` (${c.estimado ? "cerca de" : "a partir de"} ${reais(c.preco)})` : ""}${c.descricao ? ` · ${c.descricao}` : ""}`).join("\n")}`,
  categoriaDeNovo: (n: number) => `Responda com o número da categoria (de 1 a ${n}).`,
  semCategorias: () => "Vou seguir com a categoria padrão. O valor é combinado na corrida.",
  pagamento: () => `Como vai pagar?\n${PAGAMENTOS.map((p, i) => `*${i + 1}* - ${p}`).join("\n")}`,
  pagamentoDeNovo: () => `Responda com o número da forma de pagamento (de 1 a ${PAGAMENTOS.length}).`,
  criando: () => "Um momento, estou chamando um motorista... 🚗",
  criada: (os: string, valor?: number) =>
    `Pedido feito! Número *${os}*.${valor ? ` Valor estimado: *${reais(valor)}*.` : ""}\nEstou procurando um motorista. Aviso aqui quando alguém aceitar.\nPara cancelar, envie *cancelar*.`,
  embarqueVago: () => "🤖 Olá! Eu sou a Inteligência Artificial de atendimento. Para chamar o seu carro, preciso do endereço exato.\n\n📍 Me diga a *rua e o número* (e o bairro, se puder) ou envie sua localização do WhatsApp.",
  embarqueSoNumero: () => "📍 Me mande o *nome da rua com o número* (ex.: Rua Amazonas, 53), o nome do lugar ou a sua localização.",
  pedirNumeroEmbarque: (rua: string) => `📍 Anotei *${rua.slice(0, 80)}*.\n\n🏢 Qual é o NÚMERO do embarque? (só o número, ex.: 474)`,
  pedirNumeroDestino: (rua: string) => `🎯 Anotei o destino *${rua.slice(0, 80)}*.\n\n🏢 Qual é o NÚMERO do destino? (só o número, ex.: 120)\nSe não souber, mande *não sei* que o motorista combina com você.`,
  salvos: (lista: string[], intro = "📍 Encontrei seus endereços salvos. Qual é o endereço de embarque?") =>
    `${intro}\n${lista.map((l, i) => `*${i + 1}* - ${l}`).join("\n")}\n*${lista.length + 1}* - Outro endereço 📝`,
  repassado: () => "✅ Pronto! O que você escrever ou gravar por aqui chega ao motorista. Para cancelar a corrida, envie *cancelar*.",
  audioFalhou: () => "Não consegui entender esse áudio agora. Pode enviar novamente ou escrever sua mensagem?",
  erroCriar: () => "Não consegui criar a corrida agora. 😕 Responda a forma de pagamento para tentar de novo, ou *menu* para recomeçar.",
  jaTemAberta: (motivo: string) => `${motivo} Para falar com um atendente, envie *menu* e escolha *2*.`,
  bloqueado: (m: Marcador) => `Não consigo pedir corrida por aqui para este número. Fale com o suporte da ${m.empresa}: envie *2*.`,
  jaTemCorrida: (status: string) => `Você já tem uma corrida em andamento (${status}). Para cancelar, envie *cancelar*.`,
  cancelada: () => "Corrida cancelada. Se precisar, é só mandar uma mensagem para pedir outra.",
  erroCancelar: () => "Não consegui cancelar agora. Um atendente vai ver sua mensagem.",
  suporte: (m: Marcador) => `Certo! Um atendente da ${m.empresa} vai responder aqui em breve. Para voltar ao menu, envie *menu*.`,
  avaliacaoDeNovo: () => "Dê uma nota de *1* a *5* para a corrida, ou envie *menu* para pular.",
  obrigado: (m: Marcador, nota: number) => `${nota >= 4 ? "Que bom! 😄" : "Obrigado pela sinceridade."} Sua nota ajuda a ${m.empresa} a melhorar. Até a próxima!`,
  fimAtendimento: () => "Atendimento encerrado. Se precisar, é só mandar uma mensagem.",
};

/**
 * Mensagem de cada mudança de status da corrida própria (texto padrão do sistema de referência, ou o da empresa).
 * Aceite e troca levam os dados do motorista; finalizada leva o valor e o pedido de nota. `null` = não avisa.
 */
export function textoStatus(
  m: Marcador, status: string,
  d: { passageiro?: string; motorista?: string; veiculo?: string; valor?: number; anterior?: string; canceladaPor?: string; motoristaTrocado?: boolean },
  custom?: StatusMessages | null,
): string | null {
  const chave = statusKeyFor(status, { driverChanged: d.motoristaTrocado, anterior: d.anterior, canceladaPor: d.canceladaPor });
  if (!chave) return null;
  const base = renderStatusMessage(chave, custom, { passageiro: d.passageiro ? primeiroNome(d.passageiro) : "", motorista: d.motorista, empresa: m.empresa });
  if (!base) return null;
  if (chave === "accepted" || chave === "driver_changed") {
    const dados = [d.motorista ? `👤 ${d.motorista}` : "", d.veiculo ? `🚘 ${d.veiculo}` : ""].filter(Boolean).join("\n");
    return dados ? `${base}\n\n${dados}` : base;
  }
  if (chave === "completed") return `${base}${d.valor ? `\nValor: *${reais(d.valor)}*.` : ""}\n\nComo foi a corrida? Responda de *1* a *5* ⭐`;
  return base;
}

export const NOME_STATUS: Record<string, string> = {
  procurando: "procurando motorista", a_caminho: "motorista a caminho", no_local: "motorista no local", em_andamento: "em viagem",
  finalizada: "finalizada", cancelada: "cancelada", nao_atendida: "não atendida",
};
