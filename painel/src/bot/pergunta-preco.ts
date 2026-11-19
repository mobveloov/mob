// Pergunta de preço no bot ("quanto custa pra Ribeirão?", "qual o valor?", "vocês fazem corrida pra Leme?").
// A resposta vem SÓ da tabela "Preços por cidade" (Totem & Preços › Preços › Preços por cidade), com todos os horários
// (dia, noite, domingo, feriado, faixas extras) e o pedágio. Copiado do sistema de referência (fareRules.ts e
// answerPriceQuestion): mesma detecção da pergunta, mesmas tabelas e mesmos textos. Teste: test/bot-pergunta-preco.test.ts

import { buscarMunicipios, cidadesAtendidas } from "../enderecos/index.ts";
import {
  blocoDaTarifa, cidadeCitada, dados, ehDentroDaCidade, normCidade, reaisTxt, tarifasDeLocal, tarifasDoTrajeto, tipoDaTarifa, type Tarifa,
} from "../totem/tarifas-cidade.ts";

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Texto sem acento, sem pontuação; "R$" vira "reais". */
const normPreco = (text: string | null | undefined) =>
  semAcento(text ?? "").replace(/r\$/g, " reais ").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Preço com o VALOR que o passageiro imagina ("O Uber tá 15?"): "a corrida é 20?", "tá 15?", "fica 20 conto?".
 * Não confunde com tempo/distância ("chega em 15 minutos?", "tá a 2 km").
 */
function precoComValor(d: string, pergunta: boolean): boolean {
  if (/\b\d{1,4}\s*(?:min|mins|minuto|minutos|h|hr|hrs|hora|horas|km|kms|quilometros?|m|metros?|pessoas?|segundos?|seg)\b/.test(d)) return false;
  if (/\b\d{1,3}(?:\s\d{2})?\s*(?:reais|real|conto|contos|pila|pilas)\b|\breais\s*\d{1,3}\b/.test(d)) return true;
  const corrida = "(?:uber|corrida|carro|viagem|taxi|mototaxi|moto taxi|central|carrinho|motorista)";
  const verbo = "(?:ta|tah|tao|esta|e|eh|fica|sai|continua|custa|vai ser|vai sair|vai ficar|seria)";
  if (new RegExp(`\\b${corrida}\\s+(?:\\w+\\s+)?${verbo}\\s+(?:so\\s+)?\\d{1,3}\\b`).test(d)) return true;
  return pergunta && new RegExp(`^(?:e\\s+|mas\\s+|ainda\\s+)?${verbo}\\s+(?:so\\s+)?\\d{1,3}(?:\\s+(?:ainda|mesmo|ne))?$`).test(d);
}

/**
 * "Vocês fazem corrida para Ribeirão?": pergunta se a central LEVA para outro lugar. Precisa do verbo de serviço
 * ("fazem", "atendem", "rodam") ou de "vocês levam/vão"; "leva pro hospital" (destino do pedido) não conta.
 */
export function isTripServiceQuestion(text: string | null | undefined): boolean {
  const d = normPreco(text);
  if (!d) return false;
  const lugar = /\b(?:pra|para|pro|ate|em|no|na)\s+[a-z]{3,}/.test(d);
  if (!lugar) return false;
  if (/\b(?:fazem|faz|faria|fariam|atendem|atende|atenderia|rodam|trabalham|fazem corrida|tem corrida)\b/.test(d)) return true;
  return /\b(?:voces|vcs|vc|voce|ces|oces)\s+(?:levam|leva|vao|vai|levariam|levaria|buscam|busca)\b/.test(d);
}

/**
 * O passageiro está perguntando o PREÇO? "qual o valor", "quanto fica", "qto é", "vlr", "quanto vai dar", "quanto cobra",
 * "tem tabela?", "qual a taxa"... Não conta tempo/distância/pessoas ("quanto tempo", "quantos minutos", "quanto demora",
 * "quanto falta", "quantos km", "quantas pessoas") nem "o quanto antes".
 */
export function isPriceQuestion(text: string | null | undefined): boolean {
  const d = normPreco(text);
  if (!d) return false;
  if (precoComValor(d, /\?/.test(text ?? ""))) return true;
  if (isTripServiceQuestion(d)) return true;
  if (/\b(?:quanto|qto|qnto|qnt|qt|quantos?|quantas?) (?:tempo|minutos?|min|horas?|demora|falta|antes|km|quilometros?|pessoas?|passageiros?|lugares?|malas?)\b/.test(d)) return false;
  if (/\bo quanto antes\b/.test(d)) return false;
  if (/\b(?:quanto|quantos|quantu|qto|qnto|qnt|qts|quantos reais)\b/.test(d)) return true;
  return /\b(?:valor(?:es)?|vlr|vl|preco?s?|precinho|tabela|tarifa?s?|taxa|custo|custa|custar|orcamento|cobra[mr]?|cobrado|cobranca|reais|pagar quanto|paga quanto)\b/.test(d);
}

/** No meio do pedido só vale se for SÓ a pergunta (sem rua/número junto: "Rua X 10, quanto fica?" segue o pedido). */
export function isPriceQuestionOnly(text: string | null | undefined): boolean {
  const d = semAcento(text ?? "");
  if (!isPriceQuestion(d)) return false;
  if (/\d/.test(d) && !precoComValor(normPreco(d), /\?/.test(d))) return false;
  if (/\b(?:rua|r|av|avenida|travessa|tv|alameda|praca|estrada|rodovia|rod|jardim|jd|vila|bairro)\b\.?/.test(d.replace(/r\$/g, " "))) return false;
  if (/\b(?:pix|dinheiro|cartao|credito|debito|sim|nao|confirmo|confirmar)\b/.test(d)) return false;
  return d.trim().split(/\s+/).length <= 12;
}

// ------------------------------------------------------------------ tabela em texto

export const FIM_PRECO = "ℹ️ _O valor final pode mudar conforme os endereços de embarque e destino._";

/** Emoji pelo nome: supermercado, pesqueiro, sítio/chácara, zoológico... */
function emojiDoNome(nome: string, padrao: string): string {
  const n = normCidade(nome);
  if (/mercado|compras/.test(n)) return "🛒";
  if (/pesqueiro|pesca|lago|represa/.test(n)) return "🎣";
  if (/zoo/.test(n)) return "🦁";
  if (/sitio|chacara|fazenda|rancho/.test(n)) return "🌳";
  if (/hospital|santa casa|upa|posto de saude/.test(n)) return "🏥";
  if (/rodoviaria|aeroporto/.test(n)) return "🚌";
  return padrao;
}

const nomeDaCategoria = (t: Tarifa) => t.categoria.trim() || "Corrida";

/** Linhas de resposta para um trajeto ou local, com TODOS os horários (um bloco por categoria, linha vazia entre eles). */
export function fareScheduleLines(tarifas: Tarifa[]): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const t of tarifas) {
    if (!(t.normal > 0)) continue;
    const nome = nomeDaCategoria(t);
    const k = normCidade(nome);
    if (vistos.has(k)) continue;
    vistos.add(k);
    if (out.length) out.push("");
    out.push(...blocoDaTarifa(t, nome, emojiDoNome(nome, "🚗")));
  }
  return out;
}

/**
 * TABELA de valores ("quanto é a corrida?" sem dizer para onde): dentro da cidade e locais, com todos os horários
 * (outras cidades só quando perguntam daquela cidade, a menos que `cidades` seja true). Vazio = nada cadastrado.
 */
export function fareTable(tarifas: Tarifa[], base: { cidade: string | null }, opts: { cidades?: boolean } = {}): string[] {
  const ativas = tarifas.filter((t) => t.ativa && t.normal > 0);
  const bKey = base.cidade ? normCidade(base.cidade) : "";
  const out: string[] = [];
  const comCat = (nome: string, t: Tarifa) => (t.categoria.trim() ? `${nome} (${t.categoria.trim()})` : nome);
  const secao = (titulo: string, blocos: string[][]) => {
    if (!blocos.length) return;
    if (out.length) out.push("", "➖➖➖➖➖", "");
    out.push(titulo, "");
    blocos.forEach((b, i) => { if (i) out.push(""); out.push(...b); });
  };
  const dentro = ativas.filter((t) => ehDentroDaCidade(t) && (!bKey || normCidade(t.destinoCidade) === bKey));
  secao(`🏙️ *DENTRO ${base.cidade ? `DE ${base.cidade.toUpperCase()}` : "DA CIDADE"}*`, dentro.map((t) => blocoDaTarifa(t, nomeDaCategoria(t), emojiDoNome(nomeDaCategoria(t), "🚗"))));
  const locais = ativas.filter((t) => tipoDaTarifa(t) === "local");
  secao("📍 *LOCAIS*", locais.map((t) => blocoDaTarifa(t, comCat(t.local.trim(), t), emojiDoNome(t.local, "📍"))));
  const cidades = opts.cidades ? ativas.filter((t) => tipoDaTarifa(t) === "cidades") : [];
  secao("🛣️ *OUTRAS CIDADES*", cidades.map((t) => {
    const outra = t.origemCidade && bKey && normCidade(t.destinoCidade) === bKey ? t.origemCidade : t.destinoCidade;
    return blocoDaTarifa(t, comCat(outra, t), "🚗");
  }));
  return out;
}

// ------------------------------------------------------------------ resposta

export interface RespostaPreco {
  /** Texto para o passageiro. */
  texto: string;
  /** Rota sem valor na tabela: a central precisa responder (fora do pedido, a conversa vai para o atendente). */
  semValor?: boolean;
}

const rotulo = (c: { cidade: string; uf: string }) => (c.uf ? `${c.cidade}/${c.uf}` : c.cidade);

/** Cidade da tabela citada depois de "sou de / moro em ...": a origem do passageiro. */
function origemDita(tarifas: Tarifa[], texto: string): { cidade: string; uf: string } | null {
  const m = /\b(?:sou|moro|estou|estamos|to|tou|saindo)\s+(?:de|do|da|em|na|no)\s+([^,.?!]+)/i.exec(texto);
  return m ? cidadeCitada(tarifas, { cidade: null }, m[1]) : null;
}

/** Cidade que não está na tabela, mas existe (uma só): "quanto custa pra Leme" sem Leme cadastrada. */
function cidadeDoTexto(alvo: string): { cidade: string; uf: string } | null {
  if (normCidade(alvo).length < 4) return null;
  const achadas = buscarMunicipios(alvo);
  const exata = achadas.filter((m) => normCidade(m.nome) === normCidade(alvo));
  const m = exata.length === 1 ? exata[0] : achadas.length === 1 ? achadas[0] : null;
  return m ? { cidade: m.nome, uf: m.uf } : null;
}

/**
 * Responde à pergunta de preço com a tabela "Preços por cidade". `cidadeBase` = cidade do número em que a pessoa
 * escreveu. Devolve null quando não há o que responder (tabela vazia e sem cidade de destino): a mensagem segue o fluxo.
 */
export function responderPreco(empresaId: string, texto: string, cidadeBase: { cidade: string | null; uf: string | null } | null, opts: { noPedido?: boolean } = {}): RespostaPreco | null {
  if (!isPriceQuestion(texto)) return null;
  const d = dados(empresaId);
  const base = cidadeBase ?? { cidade: cidadesAtendidas(empresaId)[0]?.nome ?? null, uf: cidadesAtendidas(empresaId)[0]?.uf ?? null };
  const espera = d.esperaPorHora && d.esperaPorHora > 0 ? `⏱️ *Hora de espera:* ${reaisTxt(d.esperaPorHora)} por hora` : "";
  const tabela = (): RespostaPreco | null => {
    const t = fareTable(d.tarifas, base, { cidades: false });
    if (!t.length) return null;
    return { texto: `💰 *TABELA DE VALORES*\n\n${t.join("\n")}${espera ? `\n\n➖➖➖➖➖\n\n${espera}` : ""}\n\n${FIM_PRECO}` };
  };
  // O destino vem depois de "pra/para/até/em"; sem isso, o texto todo sem as palavras de preço.
  const m = texto.match(/\b(?:pra|para|pro|at[eé]|em)\s+(.+)$/i);
  const alvo = (m ? m[1] : texto.replace(/\b(quanto|custa|fica|sai|e|é|da|dá|qual|o|a|valor|pre[cç]o|pre[cç]os|or[cç]amento|tarifa|uma|corrida|viagem|de|do|da)\b/gi, " "))
    .replace(/[?!.]+$/g, "").trim();
  // Cidade da TABELA primeiro ("Ribeirão" -> Ribeirão Preto, cadastrada); depois qualquer cidade atendida/conhecida.
  let destino = cidadeCitada(d.tarifas, base, texto);
  if (!destino && alvo) destino = cidadeDoTexto(alvo.replace(/\s+(?:hoje|agora|amanha|amanhã)$/i, ""));
  const mesmaCidade = !!destino && !!base.cidade && normCidade(destino.cidade) === normCidade(base.cidade);
  // Sem cidade de destino, a própria cidade ou um LOCAL cadastrado: a tabela de valores (dentro da cidade e locais).
  if (tarifasDeLocal(d.tarifas, texto).length || !destino || mesmaCidade) return tabela();

  const orig = origemDita(d.tarifas, texto);
  const origem = orig ?? { cidade: base.cidade ?? "", uf: base.uf ?? "" };
  const rotuloOrigem = origem.cidade ? rotulo(origem) : "sua cidade";
  const linhas = fareScheduleLines(tarifasDoTrajeto(d.tarifas, { cidade: origem.cidade || null, uf: origem.uf || null }, destino));
  if (!linhas.length) {
    const semValor = `💬 Não tenho o valor de ${rotuloOrigem} até *${rotulo(destino)}* cadastrado aqui.`;
    return opts.noPedido
      ? { texto: `${semValor} Você vê o valor antes de confirmar a corrida.` }
      : { texto: `${semValor} Já chamei um *atendente*, que vai te responder em instantes.\n\nPode mandar sua mensagem aqui mesmo.\n\n↩️ Para voltar ao menu e pedir uma corrida, envie *sair*.`, semValor: true };
  }
  const idaVolta = /\b(volta|voltar|busca|buscar|retorno|ida e volta)\b/.test(semAcento(texto));
  const fazemos = isTripServiceQuestion(texto) ? "✅ *Fazemos sim!*\n\n" : "";
  return {
    texto: `${fazemos}💰 *Valor de ${rotuloOrigem} até ${rotulo(destino)}*\n\n${linhas.join("\n")}`
      + (espera ? `\n\n${espera}` : "")
      + (idaVolta ? "\n\n↩️ Esse é o valor da *ida*. A volta é outra corrida, com o mesmo valor." : "")
      + `\n\n${FIM_PRECO}`,
  };
}

/** Depois de responder o preço no meio do pedido: lembra a pessoa da etapa em que ela estava. */
export function textoDeRetomada(etapa: string): string {
  switch (etapa) {
    case "embarque": case "numero_embarque": return "📍 Para continuar o pedido, me envie a *rua e o número* de embarque (ou a sua localização 📍).";
    case "destino": return "🎯 Para continuar o pedido, me envie o *destino* (rua e número).";
    case "numero_destino": return "🔢 Para continuar o pedido, me envie o *número* do destino.";
    case "confirmar": return "✅ Para continuar o pedido, responda *1 - SIM* ou *2 - NÃO* na confirmação acima.";
    case "categoria": return "🚗 Para continuar o pedido, escolha a *categoria* acima.";
    case "pagamento": return "💳 Para continuar o pedido, escolha a forma de pagamento: *1 - Dinheiro*, *2 - Pix* ou *3 - Cartão*.";
    default: return "👆 Para continuar o pedido, responda a pergunta acima.";
  }
}
