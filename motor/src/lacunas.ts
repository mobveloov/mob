// Lacunas: dados e funções que cada sistema NÃO oferece. O motor devolve isso de forma explícita
// (campo `semDado` em cada item e a tabela de capacidades), nunca como vazio silencioso.

import type { Capacidade, Corrida, Funcao, SemDado, TipoIntegracao } from "./tipos.ts";
import { NOME_DO_TIPO } from "./tipos.ts";

/** Campos de corrida que o sistema não fornece na integração usada pelo motor. */
export const CORRIDA_NAO_EXPOE: Record<TipoIntegracao, Record<string, string>> = {
  "sistema-a": {
    "passageiro.telefone": "a API do Sistema A não devolve o telefone do passageiro na consulta de corridas",
    canal: "a API do Sistema A não informa por onde a corrida foi pedida (app, central, maçaneta)",
    observacao: "a API do Sistema A não devolve a observação da corrida na consulta",
    canceladaPor: "a API do Sistema A não informa quem cancelou (só pelo webhook de status)",
    motivoCancelamento: "a API do Sistema A não devolve o motivo do cancelamento na consulta",
    dinamica: "a API do Sistema A não informa a tarifa dinâmica aplicada na consulta (só o relatório CSV traz)",
    operador: "a API do Sistema A não informa o atendente que lançou a corrida (só o relatório CSV traz)",
    "avaliacao.comentario": "a API do Sistema A devolve só a nota, sem comentário",
  },
  "sistema-b": {
    "partida.bairro": "o painel do Sistema B manda o endereço em um texto só",
    "partida.cidade": "o painel do Sistema B manda o endereço em um texto só",
    "categoria.id": "a lista de corridas do Sistema B traz só o nome da categoria",
    duracaoMin: "o Sistema B informa só o tempo previsto, não o realizado",
    tarifa: "o painel do Sistema B não informa o nome da tarifa da corrida",
    cupom: "o painel do Sistema B não informa o código do cupom (só o valor do desconto)",
    descontoPct: "o painel do Sistema B informa o desconto em reais, não em porcentagem",
    operador: "o painel do Sistema B não informa o atendente que lançou a corrida",
    "avaliacao.comentario": "o painel do Sistema B devolve só a nota na lista",
  },
};

/** Campos de motorista que o sistema não fornece. */
export const MOTORISTA_NAO_EXPOE: Record<TipoIntegracao, Record<string, string>> = {
  "sistema-a": { online: "a lista de condutores do Sistema A não diz quem está online (há outra rota só para livres)" },
  "sistema-b": {
    avaliacao: "a lista de motoristas do painel do Sistema B não traz a avaliação",
    categorias: "a lista de motoristas do painel do Sistema B não traz as categorias",
    telefone: "a lista de motoristas do painel do Sistema B não traz o telefone",
  },
};

/** Campos de categoria que o sistema não fornece. */
export const CATEGORIA_NAO_EXPOE: Record<TipoIntegracao, Record<string, string>> = {
  "sistema-a": { tarifa: "a lista de categorias do Sistema A não traz valores; use tarifas(categoria)" },
  "sistema-b": {},
};

const pega = (o: unknown, caminho: string): unknown =>
  caminho.split(".").reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined), o);

const vazio = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

/** Monta `semDado` de um item: primeiro o que o sistema nunca fornece, depois o que faltou só neste item. */
export function semDado(tipo: TipoIntegracao, item: object, naoExpoe: Record<string, string>, esperados: string[]): SemDado[] {
  const nome = NOME_DO_TIPO[tipo];
  const out: SemDado[] = [];
  for (const [campo, motivo] of Object.entries(naoExpoe)) if (vazio(pega(item, campo))) out.push({ campo, motivo: `${nome}: ${motivo}`, doSistema: true });
  for (const campo of esperados) {
    if (campo in naoExpoe) continue;
    if (vazio(pega(item, campo))) out.push({ campo, motivo: `${nome}: sem dado neste registro`, doSistema: false });
  }
  return out;
}

/** Campos que se espera ver numa corrida, conforme a situação dela. */
export function camposEsperados(c: Pick<Corrida, "status" | "grupo">): string[] {
  const temMotorista = ["aceita", "no_local", "em_andamento", "aguardando_pagamento", "finalizada"].includes(c.status);
  const campos = ["solicitadaEm", "passageiro.nome", "passageiro.telefone", "partida.texto", "destino", "categoria", "valor", "canal", "observacao"];
  if (temMotorista) campos.push("motorista", "veiculo", "aceitaEm");
  if (c.status === "finalizada") campos.push("finalizadaEm", "distanciaKm", "duracaoMin");
  if (c.status === "cancelada") campos.push("canceladaEm", "canceladaPor", "motivoCancelamento");
  return campos;
}

const sim = (motivo?: string): Capacidade => (motivo ? { disponivel: true, motivo } : { disponivel: true });
const nao = (motivo: string): Capacidade => ({ disponivel: false, motivo });

const SEM_TESTE_B = "pelo painel do Sistema B; formato lido das páginas salvas, ainda não confirmado com sessão real";

/** Tabela de capacidades por sistema (o que o motor consegue fazer hoje em cada um). */
export const CAPACIDADES: Record<TipoIntegracao, Record<Funcao, Capacidade>> = {
  "sistema-a": {
    listarCorridas: sim(),
    detalharCorrida: sim(),
    criarCorrida: sim(),
    cancelarCorrida: sim("precisa do número do motivo de cancelamento"),
    motoristas: sim(),
    categorias: sim(),
    webhook: sim("status, posição e mensagens; assinatura Signature-V2 ainda não confirmada com envio real"),
    observador: sim("consulta periódica, reserva para quando o webhook falhar"),
    estimativa: sim("todas as categorias de uma vez ou uma só"),
    programadas: sim("lista"),
    gerirProgramadas: sim("cancelar e despachar agora; ainda sem teste com conta real"),
    tarifas: sim("tarifa padrão e extras de cada categoria; só leitura"),
    webhooksCadastrados: sim("lista os webhooks e a situação de entrega de cada um; só leitura"),
    posicoes: sim("só motoristas livres; limite de 10 consultas por minuto"),
    rastreio: sim(),
    linhaDoTempo: sim("aceite, chegada, início, fim e cancelamento; o Sistema A não informa as ofertas recusadas"),
    chat: sim("só leitura da conversa da corrida"),
    passageiros: sim(),
    conveniadas: sim(),
    extrato: sim("10 lançamentos por página; limite de 40 consultas por minuto"),
    carteiras: nao("o Sistema A não tem lista de saldos; só o saldo de um motorista por vez"),
    cupons: sim("só leitura"),
    dinamicas: sim("por área e a dinâmica geral (sem área); só leitura"),
    punicoes: sim("só leitura; limite de 10 consultas por minuto"),
    areas: sim("só nome; os polígonos ficam em outra rota"),
    veiculos: nao("o Sistema A traz os veículos dentro de cada motorista (veja motoristas)"),
    ocorrencias: nao("a API do Sistema A não tem lista de ocorrências"),
    objetosPerdidos: nao("a API do Sistema A não tem objetos perdidos"),
    pagamentosPendentes: nao("a API do Sistema A só mostra taxas de cancelamento dentro de cada corrida"),
    notificacoes: nao("o Sistema A tem envio de push, mas o motor ainda não implementou (é escrita)"),
  },
  "sistema-b": {
    listarCorridas: sim("pelo painel do Sistema B, com o cookie da sessão"),
    detalharCorrida: sim("pelo painel do Sistema B, com o cookie da sessão"),
    criarCorrida: sim("pelo painel do Sistema B; formato da resposta ainda não confirmado"),
    cancelarCorrida: sim("pelo painel do Sistema B"),
    motoristas: sim("pelo painel do Sistema B"),
    categorias: sim("endpoint público do app; precisa do id da cidade"),
    webhook: nao("o Sistema B não envia webhooks"),
    observador: sim("único jeito de ter eventos no Sistema B: consulta periódica"),
    estimativa: sim(`${SEM_TESTE_B}; precisa do id da cidade e de latitude/longitude`),
    programadas: sim(`${SEM_TESTE_B}; a lista vem em HTML, o motor tira os números e lê o detalhe de cada uma`),
    gerirProgramadas: nao("cancelar ou despachar programada no painel do Sistema B ainda não foi mapeado; falta sessão real"),
    tarifas: nao("o Sistema B já manda os valores dentro de cada categoria (veja categorias)"),
    webhooksCadastrados: nao("o Sistema B não envia webhooks"),
    posicoes: nao("o mapa do Sistema B não usa uma rota do painel que o motor consiga ler (as posições vêm por outro canal)"),
    rastreio: sim(SEM_TESTE_B),
    linhaDoTempo: sim(`${SEM_TESTE_B}; inclui as ofertas aos motoristas (raio-x)`),
    chat: sim(SEM_TESTE_B),
    passageiros: sim(SEM_TESTE_B),
    conveniadas: nao("a lista de empresas do Sistema B vem pronta na página, sem rota de dados"),
    extrato: nao("o extrato do Sistema B vem pronto na página, sem rota de dados"),
    carteiras: sim(SEM_TESTE_B),
    cupons: sim(SEM_TESTE_B),
    dinamicas: sim(`${SEM_TESTE_B}; por área, horário e demanda`),
    punicoes: sim(SEM_TESTE_B),
    areas: nao("as áreas do Sistema B vêm prontas na página, sem rota de dados"),
    veiculos: sim(SEM_TESTE_B),
    ocorrencias: nao("o Sistema B devolve a lista de ocorrências como HTML pronto; falta mapear com sessão real"),
    objetosPerdidos: nao("o Sistema B devolve a lista de objetos perdidos como HTML pronto; falta mapear com sessão real"),
    pagamentosPendentes: nao("o Sistema B devolve a lista de pendências como HTML pronto; falta mapear com sessão real"),
    notificacoes: nao("o Sistema B tem tela de push, mas o motor ainda não implementou (é escrita)"),
  },
};

