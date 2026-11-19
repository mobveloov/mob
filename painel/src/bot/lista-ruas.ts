// Escolha da rua dentro da conversa: quando o endereço digitado serve para mais de uma rua do CNEFE (mesmo nome em dois
// bairros, "Rua das Flores" e "Rua das Flores II"...), o bot mostra a lista e a pessoa responde o número.
// Mesmo jeito do sistema de referência (estados "selecao_rua" e "selecao_rua_destino", lista numerada, escolha pelo número
// ou pelo nome). Só entra em ação com a base de endereços (CNEFE) configurada. Teste: test/bot-lista-ruas.test.ts

import { buscarEndereco, normal, type Endereco } from "../enderecos/index.ts";
import { normalizar } from "./entender.ts";
import { addressHasNumber } from "./numero-casa.ts";
import type { Local } from "./tipos.ts";

const TIPOS = new Set(["RUA", "R", "AVENIDA", "AV", "TRAVESSA", "TV", "ALAMEDA", "AL", "ESTRADA", "RODOVIA", "PRACA", "LARGO", "VIELA"]);
const LIGA = new Set(["DE", "DA", "DO", "DAS", "DOS", "E"]);
const MAX_OPCOES = 5;

/** Nome da rua sem o tipo ("Rua das Flores" -> "DAS FLORES"), para comparar com o que a pessoa escreveu. */
const nomeSemTipo = (s: string) => {
  const w = normal(s).split(" ").filter(Boolean);
  while (w.length > 1 && TIPOS.has(w[0])) w.shift();
  return w.join(" ");
};

/** O que a pessoa escreveu antes do número: "Rua das Flores, 120 - Centro" -> "DAS FLORES". */
function nomeDigitado(texto: string): string {
  let rua = String(texto ?? "").split(/[,;]/)[0] ?? "";
  rua = rua.replace(/\s+(?:N[º°o.]?\s*)?\d{1,6}[A-Za-z]?\s*$/i, "");
  return nomeSemTipo(rua);
}

/** Endereço do jeito que o resto do bot escreve: "Rua, 120, Bairro, Cidade - UF" (sem número se a pessoa não disse). */
const comoNoBot = (e: Endereco, comNumero: boolean) => [e.rua, comNumero ? e.numero : "", e.bairro, `${e.cidade} - ${e.uf}`].filter(Boolean).join(", ");

/**
 * Ruas que servem para o texto, quando são DUAS ou mais (até 5). null = não há dúvida (zero, uma só, ou a pessoa já
 * disse o bairro que resolve): o fluxo segue com o endereço como veio.
 */
export function opcoesDeRua(empresaId: string, texto: string): Local[] | null {
  let achados: Endereco[];
  try { achados = buscarEndereco(empresaId, texto, 12).enderecos; } catch { return null; }
  if (achados.length < 2) return null;
  const digitado = nomeDigitado(texto);
  if (digitado.length < 3) return null;
  // Rua com o nome exato primeiro; "Flores" só vira "Rua das Flores" quando nenhuma se chama exatamente assim.
  const exatas = achados.filter((e) => nomeSemTipo(e.rua) === digitado);
  let lista = exatas.length ? exatas : achados;
  // A pessoa citou o bairro ("Rua das Flores 120 Centro"): só as ruas daquele bairro.
  const t = ` ${normal(texto)} `;
  const doBairro = lista.filter((e) => e.bairro && t.includes(` ${normal(e.bairro)} `));
  if (doBairro.length) lista = doBairro;
  // Mesma rua no mesmo bairro e cidade vale uma vez só.
  const vistos = new Set<string>();
  lista = lista.filter((e) => { const k = `${nomeSemTipo(e.rua)}|${normal(e.bairro)}|${normal(e.cidade)}`; if (vistos.has(k)) return false; vistos.add(k); return true; });
  if (lista.length < 2) return null;
  // Sem número, o ponto do CNEFE é o meio da rua: fica sem coordenada (o bot pede o número e a corrida acha a porta).
  const comNumero = addressHasNumber(texto);
  return lista.slice(0, MAX_OPCOES).map((e) => (comNumero ? { texto: comoNoBot(e, true), lat: e.lat, lng: e.lng } : { texto: comoNoBot(e, false) }));
}

/** Texto da lista de embarque (igual ao do sistema de referência). */
export const listaDeEmbarque = (digitado: string, l: Local[]) =>
  `📍 Encontrei mais de uma opção para "${digitado.slice(0, 60)}". Qual é o local de embarque correto?\n\n${l.map((o, i) => `${i + 1} - ${o.texto}`).join("\n")}\n\nResponda com o número.`;

/** Texto da lista de destino. */
export const listaDeDestino = (digitado: string, l: Local[]) =>
  `🔍 Encontrei ${l.length} destinos possíveis para "${digitado.slice(0, 60)}". Responda com o número do local correto:\n\n${l.map((o, i) => `${i + 1} - ${o.texto}`).join("\n")}`;

export const opcaoInvalidaEmbarque = (n: number) => `⚠️ Opção inválida. Responda com o número da rua correta (1 a ${n}).`;
export const opcaoInvalidaDestino = (l: Local[]) => `⚠️ Opção inválida. Responda com o número do local correto (1 a ${l.length}):\n\n${l.map((o, i) => `${i + 1} - ${o.texto}`).join("\n")}`;

/** Qual opção a pessoa escolheu: o número, ou o nome ("a primeira", parte do nome do bairro). 0 = não escolheu / mais de uma serve. */
export function escolhaDaLista(texto: string, l: Local[]): number {
  const n = normalizar(texto);
  const num = /^(?:n[º°o.]?\s*)?([1-9])$/.exec(n);
  if (num) return Number(num[1]) <= l.length ? Number(num[1]) : 0;
  const ordinal = ["primeira", "segunda", "terceira", "quarta", "quinta"].indexOf(n.replace(/^(a|o)\s+/, ""));
  if (ordinal >= 0 && ordinal < l.length) return ordinal + 1;
  if (n.length < 3) return 0;
  const servem = l.map((o, i) => ({ i, t: normalizar(o.texto) })).filter((x) => x.t.includes(n));
  return servem.length === 1 ? servem[0].i + 1 : 0;
}

/** A lista inteira ainda serve para o que a pessoa respondeu (nome que cabe em mais de uma opção)? Mostra a lista de novo. */
export const servePraMais = (texto: string, l: Local[]) => {
  const n = normalizar(texto);
  return n.length >= 3 && !/^\d+$/.test(n) && l.filter((o) => normalizar(o.texto).includes(n)).length > 1;
};
