// Fluxo da conversa: menu -> embarque -> destino -> confirmação -> categoria -> pagamento -> corrida -> status -> avaliação.
// Cada mensagem roda na fila da conversa (naFila): uma de cada vez, então um toque duplo nunca cria duas corridas.

import * as A from "./armazem.ts";
import { validarUrlExterna } from "../servidor/url.ts";
import { CANCELAR, classificarComIa, ehCumprimento, limparEndereco, MENU, NAO, normalizar, opcao, pareceEndereco, pareceRua, SEM_DESTINO, SIM, type Classificador } from "./entender.ts";
import { clienteDoTelefone, corridasDoBot } from "./corridas.ts";
import { provedorEvolution, provedorSimulado, type ProvedorWhatsApp } from "./provedores.ts";
import { provedorMeta, provedorZapi } from "./provedores-api.ts";
import { textoDoAudio, type DepsAudio } from "./audio.ts";
import { botSilencedFor, brPhoneVariants, parseBotCommand, parseBotCommandWithPhone, type BotCommand } from "./controle.ts";
import { decideSkip } from "./destino.ts";
import { customText, matchFaq, shouldSendGreetingImage } from "./textos-editaveis.ts";
import { marcador, NOME_STATUS, PAGAMENTOS, T, type Marcador } from "./textos.ts";
import { isVaguePickup } from "./embarque-vago.ts";
import { parseCoordPaste } from "./coordenadas.ts";
import { resolveMapLink } from "./link-mapa.ts";
import { addressHasNumber, fixHouseNumberTypo, insertHouseNumber, looseHouseNumber, romanizeBairroNumber, sameStreetNumber } from "./numero-casa.ts";
import { detectUrgentRide, URGENT_ASK_ADDRESS, URGENT_FLOW } from "./urgente.ts";
import { supportCloseDecision } from "./fim-suporte.ts";
import { freqLabel, uniqueFreqAddresses } from "./enderecos-frequentes.ts";
import { ID_PRINCIPAL, type CategoriaBot, type ConfigBot, type Conversa, type CorridaBot, type Local, type Recebida } from "./tipos.ts";

export interface Dependencias {
  provedor?: ProvedorWhatsApp;
  /** Entende frase livre. Padrão: IA da empresa (caso "classificacao"). */
  classificar?: Classificador;
  /** Transcrição de áudio (testes trocam o fetch e as chaves). */
  audio?: DepsAudio;
}

/**
 * Servidor Evolution da conexão. Padrão: o servidor da plataforma (WHATSAPP_EVOLUTION_URL/_TOKEN no .env), com a
 * instância da própria empresa (bot-<empresa>, sem escolha): a empresa só lê o QR. Se a empresa cadastrou o
 * próprio servidor (URL e token nos segredos da conexão), usa esse, com a instância que ela escolheu.
 * Cada conexão extra tem a instância dela (bot-<empresa>-<id> no servidor da plataforma).
 */
export function servidorWhatsApp(empresaId: string, conexaoId: string = ID_PRINCIPAL) {
  const s = A.segredosBot(empresaId, conexaoId);
  const cx = A.conexao(empresaId, conexaoId);
  const instancia = cx?.instancia ?? A.instanciaPadrao(empresaId);
  if (s.urlApi && s.token) return { urlApi: s.urlApi, token: s.token, instancia, daPlataforma: false };
  return {
    urlApi: (process.env.WHATSAPP_EVOLUTION_URL ?? "").trim(), token: (process.env.WHATSAPP_EVOLUTION_TOKEN ?? "").trim(),
    instancia: conexaoId === ID_PRINCIPAL ? A.instanciaPadrao(empresaId) : `${A.instanciaPadrao(empresaId)}-${conexaoId}`, daPlataforma: true,
  };
}

/** Provedor de WhatsApp de uma conexão da empresa (a principal, se não disser qual). Cada empresa só enxerga as próprias. */
export function provedorDe(empresaId: string, conexaoId: string = ID_PRINCIPAL): ProvedorWhatsApp {
  const cx = A.conexao(empresaId, conexaoId) ?? A.conexao(empresaId)!;
  const s = A.segredosBot(empresaId, cx.id);
  // Endereço salvo antes desta regra (ou mexido no arquivo): confere de novo antes de chamar.
  const urlOk = (u: string) => { try { validarUrlExterna(u, "do servidor de WhatsApp"); return u; } catch { return ""; } };
  switch (cx.provedor) {
    case "simulado": return provedorSimulado(empresaId);
    case "zapi": case "zpro": return provedorZapi({ urlApi: urlOk(s.urlApi ?? ""), token: s.token ?? "", clientToken: s.clientToken }, cx.provedor);
    case "meta": return provedorMeta({ token: s.token ?? "", phoneId: s.phoneId ?? "", wabaId: s.wabaId });
    default: {
      const { urlApi, token, instancia, daPlataforma } = servidorWhatsApp(empresaId, cx.id);
      return provedorEvolution({ urlApi: daPlataforma ? urlApi : urlOk(urlApi), token, instancia }); // sem endereço vira "não configurado"
    }
  }
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

/** Comando digitado pela central no WhatsApp do bot (#bloquear, #desbloquear, #pausar, #voltar). Vale para o contato da conversa. */
function comandoDaCentral(empresaId: string, r: Recebida, cfg: ConfigBot): string[] {
  const texto = (r.texto ?? "").trim();
  const comNumero = parseBotCommandWithPhone(texto, cfg.controle);
  const cmd: BotCommand | null = comNumero?.cmd ?? parseBotCommand(texto, cfg.controle);
  if (!cmd) return [];
  // Com número ("#bloquear 16 99293-0774") vale para aquele contato; sem número, para quem está na conversa.
  const alvo = comNumero ? comNumero.phone : r.telefone;
  const existente = brPhoneVariants(alvo).map((t) => A.conversa(empresaId, t)).find(Boolean);
  const c = existente ?? A.novaConversa(alvo, clienteDoTelefone(empresaId, alvo)?.nome || "");
  if (cmd === "block") c.bloqueado = true;
  if (cmd === "unblock") c.bloqueado = false;
  if (cmd === "pause") c.pausadoAte = new Date(Date.now() + cfg.controle.pauseMinutes * 60_000).toISOString();
  if (cmd === "resume") c.pausadoAte = undefined;
  A.salvarConversa(empresaId, c);
  return [];
}

async function tratar(empresaId: string, r: Recebida, deps: Dependencias): Promise<string[]> {
  const cfg = A.config(empresaId);
  if (r.daCentral) return comandoDaCentral(empresaId, r, cfg);
  const c = A.conversa(empresaId, r.telefone) ?? A.novaConversa(r.telefone, clienteDoTelefone(empresaId, r.telefone)?.nome || r.nome || "");
  if (c.vistas.includes(r.id)) return []; // o provedor mandou de novo a mesma mensagem
  c.vistas.push(r.id);
  if (c.nome === c.id && r.nome) c.nome = r.nome;
  // As respostas saem pelo número (conexão) por onde o passageiro escreveu.
  if (r.conexao && A.conexao(empresaId, r.conexao)) c.conexao = r.conexao;
  const provedor = deps.provedor ?? provedorDe(empresaId, c.conexao);
  let texto = (r.texto ?? "").trim();
  let audioFalhou = false;
  if (!texto && !r.local && r.audio) {
    // Áudio: vira texto (quando há chave de transcrição) e segue como se tivesse sido digitado.
    const dito = await textoDoAudio(empresaId, r.audio, provedor, deps.audio);
    if (dito) texto = dito; else audioFalhou = true;
    c.mensagens.push({ de: "passageiro", texto: dito ? `🎤 Áudio: "${dito.slice(0, 900)}"` : "🎤 Áudio (não deu para transcrever)", em: agora() });
  } else {
    c.mensagens.push({ de: "passageiro", texto: texto || `📍 Localização${r.local?.texto ? `: ${r.local.texto}` : ""}`, em: agora() });
  }
  c.naoLidas++;

  // Bloqueado pela central ou com o bot pausado: o bot fica quieto (a conversa continua no painel para a equipe).
  if (botSilencedFor({ blocked: c.bloqueado, paused_until: c.pausadoAte ?? null })) {
    A.salvarConversa(empresaId, c);
    return [];
  }
  // Áudio que não deu para ouvir: pede para repetir ou escrever (com o operador na conversa, quem responde é ele).
  if (audioFalhou) {
    const aviso = c.etapa === "suporte" ? [] : [T.audioFalhou()];
    for (const t of aviso) c.mensagens.push({ de: "bot", texto: t, em: agora() });
    A.salvarConversa(empresaId, c);
    await enviar(empresaId, provedor, c.id, aviso);
    return aviso;
  }

  const respostas: string[] = [];
  const ctx: Passo = {
    empresaId, c, r, texto, n: normalizar(texto), m: marcador(empresaId), dizer: (t) => respostas.push(t), deps, cfg,
    txt: (chave, padrao) => customText(cfg.textos, chave, padrao),
  };
  try {
    await passo(ctx);
  } catch (e) {
    console.error("[bot] fluxo", empresaId, e instanceof Error ? e.message : e);
    respostas.push(ctx.txt("ride_error", T.erroCriar()));
  }
  for (const t of respostas) c.mensagens.push({ de: "bot", texto: t, em: agora() });
  if (ctx.imagem) {
    c.mensagens.splice(c.mensagens.length - respostas.length, 0, { de: "bot", texto: `🖼️ ${ctx.imagem.url}${ctx.imagem.caption ? `\n${ctx.imagem.caption}` : ""}`, em: agora() });
  }
  A.salvarConversa(empresaId, c);
  if (ctx.imagem) {
    try { await provedor.enviarImagem(c.id, ctx.imagem.url, ctx.imagem.caption); } catch (e) { console.error("[bot] imagem", empresaId, e instanceof Error ? e.message : e); }
  }
  await enviar(empresaId, provedor, c.id, respostas);
  return respostas;
}

interface Passo {
  empresaId: string; c: Conversa; r: Recebida; texto: string; n: string; m: Marcador;
  dizer: (t: string) => void; deps: Dependencias; cfg: ConfigBot;
  /** Texto da empresa para a chave (Bot de WhatsApp › Mensagens), ou o padrão. */
  txt: (chave: string, padrao: string) => string;
  /** Imagem de saudação a mandar antes das respostas. */
  imagem?: { url: string; caption: string };
}

const localDe = (r: Recebida): Local | null => (r.local ? { texto: r.local.texto || "Localização enviada", lat: r.local.lat, lng: r.local.lng } : null);

const OPCOES_MENU = "\n*1* - Pedir uma corrida\n*2* - Falar com o suporte";

function textoMenu(p: Passo): string {
  const custom = customText(p.cfg.textos, p.c.historico.length ? "welcome_back" : "welcome_menu", "");
  return custom ? `${custom}${OPCOES_MENU}` : T.menu(p.m, p.c.nome);
}

function irPara(p: Passo, etapa: Conversa["etapa"], corrigindo = false): void | Promise<void> {
  const { cfg, c } = p;
  // Menu de boas-vindas desligado: vai direto para o endereço de embarque.
  if (etapa === "menu" && !cfg.fluxo.show_welcome_menu && !corrigindo && !bloqueado(p)) return irPara(p, "embarque");
  // Pedir destino desligado: segue sem destino.
  if (etapa === "destino" && !cfg.fluxo.ask_destination) { c.rascunho.semDestino = true; c.rascunho.destino = undefined; return irPara(p, "confirmar"); }
  // Confirmar endereços desligado: avança direto para as categorias.
  if (etapa === "confirmar" && !cfg.fluxo.confirm_address) { c.etapa = "confirmar"; return mostrarCategorias(p); }
  c.etapa = etapa;
  if (etapa === "menu") {
    if (shouldSendGreetingImage(cfg.saudacao, c.imagemEm, Date.now())) { p.imagem = { url: cfg.saudacao.imageUrl, caption: cfg.saudacao.caption }; c.imagemEm = agora(); }
    p.dizer(textoMenu(p));
  }
  if (etapa === "embarque") p.dizer(corrigindo ? p.txt("address_correction", T.embarqueCorrecao()) : p.txt("ask_address", T.embarque()));
  if (etapa === "destino") {
    const base = p.txt("ask_destination", "");
    p.dizer(base ? `${base}${cfg.fluxo.allow_skip_destination ? "\nSe preferir não informar, responda *2*." : ""}` : T.destino(cfg.fluxo.allow_skip_destination));
  }
  if (etapa === "confirmar") p.dizer(T.confirmar(c.rascunho));
  if (etapa === "pagamento") {
    if (!cfg.fluxo.ask_payment) { c.rascunho.pagamento = PAGAMENTOS[0]; return criar(p); } // a corrida própria exige uma forma: sem perguntar, vai Dinheiro
    const base = p.txt("ask_payment", "");
    p.dizer(base ? `${base}\n${PAGAMENTOS.map((x, i) => `*${i + 1}* - ${x}`).join("\n")}` : T.pagamento());
  }
  if (etapa === "suporte") p.dizer(p.txt("support_forward", T.suporte(p.m)));
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
    if (MENU.test(n)) { const saiu = p.txt("support_exit", ""); if (saiu) p.dizer(saiu); return irPara(p, "menu"); }
    return; // o operador responde pelo painel
  }
  if (MENU.test(n) && c.etapa !== "inicio") { c.rascunho = {}; return irPara(p, "menu"); }

  // Respostas prontas ("aceita pet?"): no começo vale qualquer pergunta; no meio do pedido só com "?" (não confunde com endereço).
  if (texto && !localDe(r) && ["inicio", "menu", "embarque", "destino", "confirmar"].includes(c.etapa)) {
    const resposta = matchFaq(texto, p.cfg.faq, c.etapa !== "inicio" && c.etapa !== "menu");
    if (resposta) {
      p.dizer(resposta.answer);
      if (c.etapa === "embarque" || c.etapa === "destino" || c.etapa === "confirmar") irPara(p, c.etapa); // volta à pergunta do pedido
      return;
    }
  }

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
      return p.dizer(p.txt("welcome_repeat", "") ? `${p.txt("welcome_repeat", "")}${OPCOES_MENU}` : T.menuDeNovo());
    }

    case "embarque":
      if (localDe(r)) { c.rascunho.embarque = localDe(r)!; return irPara(p, "destino"); }
      if (pareceEndereco(texto)) { c.rascunho.embarque = { texto: limparEndereco(texto) }; return irPara(p, "destino"); }
      return p.dizer(p.txt("address_retry", T.embarqueDeNovo()));

    case "destino":
      {
        // "Não informar destino": segue sem destino ou, se a empresa tornou o destino obrigatório, explica e pergunta de novo.
        const quer = n === "2" || SEM_DESTINO.test(n) || decideSkip(true, texto) === "skip";
        const pular = quer ? (p.cfg.fluxo.allow_skip_destination ? "skip" : "required") : "none";
        if (pular === "skip") { c.rascunho.semDestino = true; c.rascunho.destino = undefined; return irPara(p, "confirmar"); }
        if (pular === "required") return p.dizer(T.destinoObrigatorio());
      }
      if (localDe(r)) { c.rascunho.destino = localDe(r)!; c.rascunho.semDestino = false; return irPara(p, "confirmar"); }
      if (pareceEndereco(texto)) { c.rascunho.destino = { texto: limparEndereco(texto) }; c.rascunho.semDestino = false; return irPara(p, "confirmar"); }
      return p.dizer(p.txt("destination_retry", T.destinoDeNovo(p.cfg.fluxo.allow_skip_destination)));

    case "confirmar": {
      const o = opcao(texto, 2, { 1: SIM, 2: NAO });
      if (o === 1) return mostrarCategorias(p);
      if (o === 2) { c.rascunho = {}; return irPara(p, "embarque", true); }
      return p.dizer(p.txt("confirm_retry", T.confirmarDeNovo()));
    }

    case "categoria": {
      const lista = c.rascunho.categorias ?? [];
      let o = opcao(texto, lista.length);
      if (!o) { const i = lista.findIndex((x) => normalizar(x.nome) === n); o = i >= 0 ? i + 1 : null; }
      if (!o) return p.dizer(`${p.txt("category_retry", "")}${p.txt("category_retry", "") ? "\n" : ""}${p.txt("category_retry", "") ? T.categorias(lista) : T.categoriaDeNovo(lista.length)}`);
      c.rascunho.categoria = lista[o - 1];
      return irPara(p, "pagamento");
    }

    case "pagamento": {
      const o = opcao(texto, PAGAMENTOS.length, { 1: /\bdinheiro\b/, 2: /\bpix\b/, 3: /\b(cartao|credito|debito|maquininha)\b/ });
      if (!o) return p.dizer(p.txt("payment_retry", "") ? `${p.txt("payment_retry", "")}\n${PAGAMENTOS.map((x, i) => `*${i + 1}* - ${x}`).join("\n")}` : T.pagamentoDeNovo());
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

async function mostrarCategorias(p: Passo): Promise<void> {
  const { c } = p;
  let lista: CategoriaBot[] = [];
  try {
    lista = (await corridasDoBot().categorias(p.empresaId, c.rascunho.embarque, c.rascunho.semDestino ? undefined : c.rascunho.destino)).slice(0, 9);
  } catch (e) {
    console.error("[bot] categorias", p.empresaId, e instanceof Error ? e.message : e);
  }
  if (!lista.length) { if (p.cfg.fluxo.ask_category) p.dizer(T.semCategorias()); c.rascunho.categoria = undefined; return irPara(p, "pagamento"); }
  if (!p.cfg.fluxo.ask_category) { c.rascunho.categoria = lista[0]; return irPara(p, "pagamento"); }
  c.rascunho.categorias = lista;
  c.etapa = "categoria";
  const titulo = p.txt("ask_category", "");
  p.dizer(titulo ? T.categorias(lista).replace(/^[^\n]*/, titulo) : T.categorias(lista));
}

async function criar(p: Passo): Promise<void> {
  const { c, empresaId } = p;
  const rasc = c.rascunho;
  if (!rasc.embarque || rasc.pagamento === undefined) { c.rascunho = {}; return irPara(p, "embarque"); }
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
    const ok = p.txt("ride_success", "");
    p.dizer(ok ? `${ok}\nNúmero *${nova.os}*.${nova.valor ? ` Valor estimado: *R$ ${nova.valor.toFixed(2).replace(".", ",")}*.` : ""}\nPara cancelar, envie *cancelar*.` : T.criada(nova.os, nova.valor));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[bot] criar corrida", empresaId, msg);
    if (/em aberto/i.test(msg)) { c.etapa = "inicio"; c.rascunho = {}; return p.dizer(T.jaTemAberta(msg.replace(/^Este passageiro já tem/, "Você já tem"))); }
    if (/bloqueado/i.test(msg)) { c.etapa = "menu"; c.rascunho = {}; return p.dizer(T.bloqueado(p.m)); }
    c.etapa = p.cfg.fluxo.ask_payment ? "pagamento" : "menu";
    p.dizer(p.txt("ride_error", T.erroCriar()));
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
    await (deps.provedor ?? provedorDe(empresaId, c.conexao)).enviarTexto(c.id, t);
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
    const t = customText(A.config(empresaId).textos, "support_thanks", T.fimAtendimento());
    c.mensagens.push({ de: "bot", texto: t, em: agora() });
    A.salvarConversa(empresaId, c);
    await enviar(empresaId, deps.provedor ?? provedorDe(empresaId, c.conexao), c.id, [t]);
    return c;
  });
}

/** Bloquear, desbloquear, pausar ou voltar o bot com um contato (mesmos comandos da central, pela tela Conversas). */
export function controlarConversa(empresaId: string, conversaId: string, cmd: BotCommand) {
  return A.naFila(empresaId, conversaId, async () => {
    const c = A.conversa(empresaId, conversaId);
    if (!c) throw new Error("Conversa não encontrada.");
    if (cmd === "block") c.bloqueado = true;
    if (cmd === "unblock") c.bloqueado = false;
    if (cmd === "pause") c.pausadoAte = new Date(Date.now() + A.config(empresaId).controle.pauseMinutes * 60_000).toISOString();
    if (cmd === "resume") c.pausadoAte = undefined;
    A.salvarConversa(empresaId, c);
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
