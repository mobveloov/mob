// Fluxo da conversa: menu -> embarque -> destino -> confirmação -> categoria -> pagamento -> corrida -> status -> avaliação.
// Cada mensagem roda na fila da conversa (naFila): uma de cada vez, então um toque duplo nunca cria duas corridas.

import * as A from "./armazem.ts";
import { CANCELAR, classificarComIa, ehCumprimento, limparEndereco, MENU, NAO, normalizar, opcao, pareceEndereco, pareceRua, SEM_DESTINO, SIM, type Classificador } from "./entender.ts";
import { clienteDoTelefone, corridasDoBot } from "./corridas.ts";
import { provedorEvolution, provedorSimulado, type ProvedorWhatsApp } from "./provedores.ts";
import { marcador, NOME_STATUS, PAGAMENTOS, T, type Marcador } from "./textos.ts";
import type { CategoriaBot, Conversa, CorridaBot, Local, Recebida } from "./tipos.ts";

export interface Dependencias {
  provedor?: ProvedorWhatsApp;
  /** Entende frase livre. Padrão: IA da empresa (caso "classificacao"). */
  classificar?: Classificador;
}

/**
 * Servidor de WhatsApp da empresa. Padrão: o servidor da plataforma (WHATSAPP_EVOLUTION_URL/_TOKEN no .env), com a
 * instância da empresa (bot-<empresa>, sem escolha): a empresa só lê o QR. Se a empresa cadastrou o próprio servidor
 * (URL e token nos segredos dela), usa esse, com a instância que ela escolheu.
 */
export function servidorWhatsApp(empresaId: string) {
  const s = A.segredosBot(empresaId);
  if (s.urlApi && s.token) return { urlApi: s.urlApi, token: s.token, instancia: A.config(empresaId).instancia, daPlataforma: false };
  return {
    urlApi: (process.env.WHATSAPP_EVOLUTION_URL ?? "").trim(), token: (process.env.WHATSAPP_EVOLUTION_TOKEN ?? "").trim(),
    instancia: A.instanciaPadrao(empresaId), daPlataforma: true,
  };
}

/** Provedor de WhatsApp da empresa (o configurado em Bot de WhatsApp). */
export function provedorDe(empresaId: string): ProvedorWhatsApp {
  if (A.config(empresaId).provedor === "simulado") return provedorSimulado(empresaId);
  const { urlApi, token, instancia } = servidorWhatsApp(empresaId);
  return provedorEvolution({ urlApi, token, instancia });
}

const agora = () => new Date().toISOString();

/** Envia e registra. Erro de envio não derruba o bot (fica no log). */
export async function enviar(empresaId: string, p: ProvedorWhatsApp, telefone: string, textos: string[]) {
  for (const t of textos) {
    try { await p.enviarTexto(telefone, t); } catch (e) { console.error("[bot] envio", empresaId, e instanceof Error ? e.message : e); }
  }
}

/** Fecha a corrida atual (vai para o histórico). */
export function fecharCorrida(c: Conversa, final: Partial<CorridaBot>) {
  if (c.corrida) c.historico.push({ ...c.corrida, ...final });
  c.corrida = undefined;
  c.rascunho = {};
}

/** Recebe uma mensagem do passageiro. Devolve as respostas do bot (já enviadas). */
export function receber(empresaId: string, r: Recebida, deps: Dependencias = {}): Promise<string[]> {
  return A.naFila(empresaId, r.telefone, () => tratar(empresaId, r, deps));
}

async function tratar(empresaId: string, r: Recebida, deps: Dependencias): Promise<string[]> {
  const c = A.conversa(empresaId, r.telefone) ?? A.novaConversa(r.telefone, clienteDoTelefone(empresaId, r.telefone)?.nome || r.nome || "");
  if (c.vistas.includes(r.id)) return []; // o provedor mandou de novo a mesma mensagem
  c.vistas.push(r.id);
  if (c.nome === c.id && r.nome) c.nome = r.nome;
  const texto = (r.texto ?? "").trim();
  c.mensagens.push({ de: "passageiro", texto: texto || `📍 Localização${r.local?.texto ? `: ${r.local.texto}` : ""}`, em: agora() });
  c.naoLidas++;

  const respostas: string[] = [];
  const ctx: Passo = { empresaId, c, r, texto, n: normalizar(texto), m: marcador(empresaId), dizer: (t) => respostas.push(t), deps };
  try {
    await passo(ctx);
  } catch (e) {
    console.error("[bot] fluxo", empresaId, e instanceof Error ? e.message : e);
    respostas.push(T.erroCriar());
  }
  for (const t of respostas) c.mensagens.push({ de: "bot", texto: t, em: agora() });
  A.salvarConversa(empresaId, c);
  await enviar(empresaId, deps.provedor ?? provedorDe(empresaId), c.id, respostas);
  return respostas;
}

interface Passo {
  empresaId: string; c: Conversa; r: Recebida; texto: string; n: string; m: Marcador;
  dizer: (t: string) => void; deps: Dependencias;
}

const localDe = (r: Recebida): Local | null => (r.local ? { texto: r.local.texto || "Localização enviada", lat: r.local.lat, lng: r.local.lng } : null);

function irPara(p: Passo, etapa: Conversa["etapa"]) {
  p.c.etapa = etapa;
  if (etapa === "menu") p.dizer(T.menu(p.m, p.c.nome));
  if (etapa === "embarque") p.dizer(T.embarque());
  if (etapa === "destino") p.dizer(T.destino());
  if (etapa === "confirmar") p.dizer(T.confirmar(p.c.rascunho));
  if (etapa === "pagamento") p.dizer(T.pagamento());
  if (etapa === "suporte") p.dizer(T.suporte(p.m));
}

async function passo(p: Passo) {
  const { c, n, texto, r } = p;

  // Corrida em andamento: nada de pedir outra. Só cancelar ou ver o status.
  if (c.etapa === "criando" && !c.corrida) {
    // Só acontece se o servidor caiu no meio da criação. Depois de 2 minutos, libera de novo.
    if (Date.now() - Date.parse(c.atualizadaEm) < 120_000) return p.dizer(T.criando());
    c.rascunho = {};
    return irPara(p, "menu");
  }
  if (c.corrida && c.corrida.grupo === "aberta") {
    c.etapa = "em_corrida";
    if (CANCELAR.test(n)) return cancelar(p);
    return p.dizer(T.jaTemCorrida(NOME_STATUS[c.corrida.status] ?? c.corrida.status));
  }

  if (c.etapa === "suporte") {
    if (MENU.test(n)) return irPara(p, "menu");
    return; // o operador responde pelo painel
  }
  if (MENU.test(n) && c.etapa !== "inicio") { c.rascunho = {}; return irPara(p, "menu"); }

  switch (c.etapa) {
    case "inicio":
    case "em_corrida":
      c.rascunho = {};
      if (bloqueado(p)) return irPara(p, "menu");
      if (localDe(r)) { c.rascunho.embarque = localDe(r)!; return irPara(p, "destino"); }
      if (!ehCumprimento(texto) && (await fraseLivre(p))) return;
      return irPara(p, "menu");

    case "menu": {
      const o = opcao(texto, 2, { 1: /\b(corrida|carro|moto|pedir|taxi|motorista)\b/, 2: /\b(suporte|atendente|ajuda|reclamacao|falar)\b/ });
      if (o === 2) return irPara(p, "suporte");
      if (bloqueado(p)) { c.etapa = "menu"; return p.dizer(T.bloqueado(p.m)); }
      if (o === 1) return irPara(p, "embarque");
      if (localDe(r)) { c.rascunho.embarque = localDe(r)!; return irPara(p, "destino"); }
      if (!ehCumprimento(texto) && (await fraseLivre(p))) return;
      return p.dizer(T.menuDeNovo());
    }

    case "embarque":
      if (localDe(r)) { c.rascunho.embarque = localDe(r)!; return irPara(p, "destino"); }
      if (pareceEndereco(texto)) { c.rascunho.embarque = { texto: limparEndereco(texto) }; return irPara(p, "destino"); }
      return p.dizer(T.embarqueDeNovo());

    case "destino":
      if (n === "2" || SEM_DESTINO.test(n)) { c.rascunho.semDestino = true; c.rascunho.destino = undefined; return irPara(p, "confirmar"); }
      if (localDe(r)) { c.rascunho.destino = localDe(r)!; c.rascunho.semDestino = false; return irPara(p, "confirmar"); }
      if (pareceEndereco(texto)) { c.rascunho.destino = { texto: limparEndereco(texto) }; c.rascunho.semDestino = false; return irPara(p, "confirmar"); }
      return p.dizer(T.destinoDeNovo());

    case "confirmar": {
      const o = opcao(texto, 2, { 1: SIM, 2: NAO });
      if (o === 1) return mostrarCategorias(p);
      if (o === 2) { c.rascunho = {}; return irPara(p, "embarque"); }
      return p.dizer(T.confirmarDeNovo());
    }

    case "categoria": {
      const lista = c.rascunho.categorias ?? [];
      let o = opcao(texto, lista.length);
      if (!o) { const i = lista.findIndex((x) => normalizar(x.nome) === n); o = i >= 0 ? i + 1 : null; }
      if (!o) return p.dizer(T.categoriaDeNovo(lista.length));
      c.rascunho.categoria = lista[o - 1];
      return irPara(p, "pagamento");
    }

    case "pagamento": {
      const o = opcao(texto, PAGAMENTOS.length, { 1: /\bdinheiro\b/, 2: /\bpix\b/, 3: /\b(cartao|credito|debito|maquininha)\b/ });
      if (!o) return p.dizer(T.pagamentoDeNovo());
      c.rascunho.pagamento = PAGAMENTOS[o - 1];
      return criar(p);
    }

    case "avaliacao": {
      const o = opcao(texto, 5);
      if (!o) {
        if (ehCumprimento(texto)) return p.dizer(T.avaliacaoDeNovo());
        c.etapa = "inicio";
        return passo(p); // quer outra coisa: segue como conversa nova
      }
      const ultima = c.historico[c.historico.length - 1];
      if (ultima) {
        ultima.nota = o;
        await corridasDoBot().avaliar(p.empresaId, ultima.id, o).catch((e) => console.error("[bot] avaliar", p.empresaId, e instanceof Error ? e.message : e));
      }
      c.etapa = "inicio";
      return p.dizer(T.obrigado(p.m, o));
    }

    default:
      return irPara(p, "menu");
  }
}

/** Passageiro bloqueado ou suspenso no cadastro "clientes" não pede corrida. */
function bloqueado(p: Passo) {
  return clienteDoTelefone(p.empresaId, p.c.id)?.bloqueado === true;
}

/** Frase livre no começo da conversa ("preciso de um carro na rua X 402 pra Santa Casa"). */
async function fraseLivre(p: Passo): Promise<boolean> {
  const { c, texto } = p;
  const ia = await (p.deps.classificar ?? classificarComIa)(p.empresaId, texto);
  if (ia?.intencao === "suporte") { irPara(p, "suporte"); return true; }
  if (ia?.intencao === "pedir") {
    if (ia.embarque && pareceEndereco(ia.embarque)) c.rascunho.embarque = { texto: limparEndereco(ia.embarque) };
    if (c.rascunho.embarque && ia.destino && pareceEndereco(ia.destino)) c.rascunho.destino = { texto: limparEndereco(ia.destino) };
    irPara(p, !c.rascunho.embarque ? "embarque" : c.rascunho.destino ? "confirmar" : "destino");
    return true;
  }
  if (ia) return false; // a IA disse que é cumprimento ou outra coisa
  // Sem IA: regras simples. Pedido sem endereço vai para o embarque; endereço claro vira embarque.
  if (/\b(corrida|carro|motorista|taxi|moto)\b/.test(p.n) && !pareceRua(texto)) { irPara(p, "embarque"); return true; }
  if (pareceRua(texto)) { c.rascunho.embarque = { texto: limparEndereco(texto) }; irPara(p, "destino"); return true; }
  return false;
}

async function mostrarCategorias(p: Passo) {
  const { c } = p;
  let lista: CategoriaBot[] = [];
  try {
    lista = (await corridasDoBot().categorias(p.empresaId, c.rascunho.embarque, c.rascunho.semDestino ? undefined : c.rascunho.destino)).slice(0, 9);
  } catch (e) {
    console.error("[bot] categorias", p.empresaId, e instanceof Error ? e.message : e);
  }
  if (!lista.length) { p.dizer(T.semCategorias()); c.rascunho.categoria = undefined; return irPara(p, "pagamento"); }
  c.rascunho.categorias = lista;
  c.etapa = "categoria";
  p.dizer(T.categorias(lista));
}

async function criar(p: Passo) {
  const { c, empresaId } = p;
  const rasc = c.rascunho;
  if (!rasc.embarque || !rasc.pagamento) { c.rascunho = {}; return irPara(p, "embarque"); }
  // Trava: a etapa "criando" fica gravada antes de chamar o sistema de origem.
  c.etapa = "criando";
  A.salvarConversa(empresaId, c);
  try {
    const nova = await corridasDoBot().criar(empresaId, {
      passageiro: { nome: c.nome, telefone: c.id }, embarque: rasc.embarque,
      destino: rasc.semDestino ? undefined : rasc.destino, categoria: rasc.categoria?.nome ?? "",
      pagamento: rasc.pagamento, observacao: "Pedido pelo WhatsApp",
    });
    c.corrida = { id: nova.id, os: nova.os, status: "procurando", grupo: "aberta", criadaEm: agora(), valor: nova.valor };
    c.etapa = "em_corrida";
    c.rascunho = {};
    p.dizer(T.criada(nova.os, nova.valor));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[bot] criar corrida", empresaId, msg);
    if (/em aberto/i.test(msg)) { c.etapa = "inicio"; c.rascunho = {}; return p.dizer(T.jaTemAberta(msg.replace(/^Este passageiro já tem/, "Você já tem"))); }
    if (/bloqueado/i.test(msg)) { c.etapa = "menu"; c.rascunho = {}; return p.dizer(T.bloqueado(p.m)); }
    c.etapa = "pagamento";
    p.dizer(T.erroCriar());
  }
}

async function cancelar(p: Passo) {
  const { c } = p;
  if (!c.corrida) return;
  try {
    await corridasDoBot().cancelar(p.empresaId, c.corrida.id);
    fecharCorrida(c, { status: "cancelada", grupo: "cancelada" });
    c.etapa = "inicio";
    p.dizer(T.cancelada());
  } catch (e) {
    console.error("[bot] cancelar", p.empresaId, e instanceof Error ? e.message : e);
    p.dizer(T.erroCancelar());
  }
}

// ------------------------------------------------------------------ operador (painel)

/** Resposta manual do operador. No começo da conversa, o bot passa a esperar o operador (etapa suporte). */
export function responderOperador(empresaId: string, conversaId: string, texto: string, autor: string, deps: Dependencias = {}) {
  return A.naFila(empresaId, conversaId, async () => {
    const c = A.conversa(empresaId, conversaId);
    if (!c) throw new Error("Conversa não encontrada.");
    const t = texto.trim().slice(0, 2000);
    if (!t) throw new Error("Escreva a mensagem.");
    if (c.etapa === "inicio" || c.etapa === "menu") c.etapa = "suporte";
    c.mensagens.push({ de: "operador", texto: t, em: agora(), autor: autor.slice(0, 60) });
    c.naoLidas = 0;
    A.salvarConversa(empresaId, c);
    await (deps.provedor ?? provedorDe(empresaId)).enviarTexto(c.id, t);
    return c;
  });
}

/** Devolve a conversa ao bot. */
export function encerrarAtendimento(empresaId: string, conversaId: string, deps: Dependencias = {}) {
  return A.naFila(empresaId, conversaId, async () => {
    const c = A.conversa(empresaId, conversaId);
    if (!c) throw new Error("Conversa não encontrada.");
    if (c.etapa !== "suporte") return c;
    c.etapa = "inicio";
    c.rascunho = {};
    const t = T.fimAtendimento();
    c.mensagens.push({ de: "bot", texto: t, em: agora() });
    A.salvarConversa(empresaId, c);
    await enviar(empresaId, deps.provedor ?? provedorDe(empresaId), c.id, [t]);
    return c;
  });
}

export function marcarLida(empresaId: string, conversaId: string) {
  return A.naFila(empresaId, conversaId, async () => {
    const c = A.conversa(empresaId, conversaId);
    if (c && c.naoLidas) { c.naoLidas = 0; A.salvarConversa(empresaId, c); }
    return c;
  });
}
