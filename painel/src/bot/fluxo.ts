// Fluxo da conversa: menu -> embarque -> destino -> confirmação -> categoria -> pagamento -> corrida -> status -> avaliação.
// Cada mensagem roda na fila da conversa (naFila): uma de cada vez, então um toque duplo nunca cria duas corridas.

import * as A from "./armazem.ts";
import { validarUrlExterna } from "../servidor/url.ts";
import { CANCELAR, classificarComIa, ehCumprimento, limparEndereco, MENU, NAO, normalizar, opcao, pareceEndereco, pareceRua, SEM_DESTINO, SIM, type Classificador } from "./entender.ts";
import { clienteDoTelefone, corridasDoBot } from "./corridas.ts";
import { provedorEvolution, provedorSimulado, type ProvedorWhatsApp } from "./provedores.ts";
import { provedorMeta, provedorZapi } from "./provedores-api.ts";
import { textoDoAudio, type DepsAudio } from "./audio.ts";
import { comMotorista, repassarAoMotorista } from "./repasse.ts";
import { sintetizar, type DepsVoz } from "./voz.ts";
import { speakableText } from "./voz-texto.ts";
import { botSilencedFor, brPhoneVariants, parseBotCommand, parseBotCommandWithPhone, type BotCommand } from "./controle.ts";
import { decideSkip } from "./destino.ts";
import { customText, matchFaq, shouldSendGreetingImage } from "./textos-editaveis.ts";
import { marcador, NOME_STATUS, opcoesMenu, PAGAMENTOS, T, type Marcador } from "./textos.ts";
import { formatScheduleBR, parseScheduleWhen, scheduleErrorText, scheduleInRideText, SCHEDULE_MAX_DAYS, SCHEDULE_MIN_MINUTES } from "./agendamento-texto.ts";
import { isVaguePickup } from "./embarque-vago.ts";
import { parseCoordPaste } from "./coordenadas.ts";
import { resolveMapLink } from "./link-mapa.ts";
import { addressHasNumber, fixHouseNumberTypo, insertHouseNumber, looseHouseNumber, romanizeBairroNumber, sameStreetNumber } from "./numero-casa.ts";
import { detectUrgentRide, URGENT_ASK_ADDRESS, URGENT_FLOW } from "./urgente.ts";
import { localDaSugestao } from "./sugestoes-cadastro.ts";
import { cidadePorCodigo, comCidade } from "./cidades.ts";
import { cidadesAtendidas } from "../enderecos/index.ts";
import { tratarDescadastro } from "./descadastro.ts";
import { supportCloseDecision } from "./fim-suporte.ts";
import { freqLabel, uniqueFreqAddresses } from "./enderecos-frequentes.ts";
import { ID_PRINCIPAL, type CategoriaBot, type ConfigBot, type Conversa, type CorridaBot, type Local, type Recebida } from "./tipos.ts";

export interface Dependencias {
  provedor?: ProvedorWhatsApp;
  /** Entende frase livre. Padrão: IA da empresa (caso "classificacao"). */
  classificar?: Classificador;
  /** Transcrição de áudio (testes trocam o fetch e as chaves). */
  audio?: DepsAudio;
  /** Voz do bot (testes trocam o fetch e as chaves). */
  voz?: DepsVoz;
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

/** Depois do texto, a mesma resposta em áudio (só para quem falou por áudio). Falhou ou sem chave: fica o texto. */
async function responderEmVoz(empresaId: string, p: ProvedorWhatsApp, telefone: string, textos: string[], voz: string, deps?: DepsVoz) {
  if (!p.enviarMidia) return;
  for (const t of textos) {
    try {
      const a = await sintetizar(empresaId, t, voz, deps);
      if (!a) { if (!speakableOk(t)) continue; return; } // sem chave ou voz fora do ar: o resto da conversa vai em texto
      await p.enviarMidia(telefone, { tipo: "audio", bytes: a.bytes, mimetype: a.mimetype });
    } catch (e) { console.error("[bot] voz", empresaId, e instanceof Error ? e.message : e); return; }
  }
}
const speakableOk = (t: string) => speakableText(t) !== null;

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
  const ouviuAudio = Boolean(!r.texto && !r.local && r.audio);
  if (!texto && !r.local && r.audio) {
    // Áudio: vira texto (quando há chave de transcrição) e segue como se tivesse sido digitado.
    const dito = await textoDoAudio(empresaId, r.audio, provedor, deps.audio);
    if (dito) texto = dito; else audioFalhou = true;
    c.mensagens.push({ de: "passageiro", texto: dito ? `🎤 Áudio: "${dito.slice(0, 900)}"` : "🎤 Áudio (não deu para transcrever)", em: agora() });
  } else {
    c.mensagens.push({ de: "passageiro", texto: texto || `📍 Localização${r.local?.texto ? `: ${r.local.texto}` : ""}`, em: agora() });
  }
  c.naoLidas++;

  // "PARAR", "SAIR", "NÃO QUERO MAIS": descadastra do WhatsApp do CRM (só confirma; o pedido de corrida segue como estava).
  if (texto && !r.local) {
    const conf = tratarDescadastro(empresaId, c, texto);
    if (conf) {
      c.mensagens.push({ de: "bot", texto: conf, em: agora() });
      A.salvarConversa(empresaId, c);
      await enviar(empresaId, provedor, c.id, [conf]);
      return [conf];
    }
  }

  // Bloqueado pela central ou com o bot pausado: o bot fica quieto (a conversa continua no painel para a equipe).
  if (botSilencedFor({ blocked: c.bloqueado, paused_until: c.pausadoAte ?? null })) {
    A.salvarConversa(empresaId, c);
    return [];
  }
  // Áudio que não deu para ouvir: pede para repetir ou escrever (com o operador na conversa, quem responde é ele).
  if (audioFalhou && !comMotorista(c)) {
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
  if (ouviuAudio && cfg.voz.ligada) await responderEmVoz(empresaId, provedor, c.id, respostas, cfg.voz.nome, deps.voz);
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


function textoMenu(p: Passo): string {
  const custom = customText(p.cfg.textos, p.c.historico.length ? "welcome_back" : "welcome_menu", "");
  return custom ? `${custom}${opcoesMenu(p.cfg.agendar)}` : T.menu(p.m, p.c.nome, p.cfg.agendar);
}


/** Completa o endereço com a cidade ativa da conexão (", Cidade - UF"), se o passageiro não citou outra. */
function textoComCidade(empresaId: string, texto: string, conexaoId?: string): string {
  const cod = A.cidadeDaConexao(empresaId, conexaoId ?? ID_PRINCIPAL);
  const cidade = cod ? cidadePorCodigo(empresaId, cod) : null;
  return cidade ? comCidade(texto, cidade, cidadesAtendidas(empresaId)) : texto;
}

const VIA_RE = /^(rua|r\.?|avenida|av\.?|travessa|tv\.?|alameda|al\.?|estrada|rodovia|praca|praça|largo|viela)\s/i;

/** Entende o endereço digitado: link de mapa, coordenadas coladas, "estou em casa", só número, rua sem número. */
async function entenderLocal(empresaId: string, texto: string, conexaoId?: string): Promise<{ local?: Local; recusa?: string; pedirNumero?: boolean }> {
  // Apelido cadastrado em Sugestões de Endereço ("espetinho do gui"): vai direto para o lugar cadastrado.
  const sug = localDaSugestao(empresaId, texto, /\d/.test(texto) ? 80 : 30);
  if (sug) return { local: sug };
  const mapa = await resolveMapLink(texto).catch(() => null);
  if (mapa?.kind === "point") return { local: { texto: mapa.name || "Localização do mapa", lat: mapa.lat, lng: mapa.lng } };
  if (mapa?.kind === "text") return { local: { texto: textoComCidade(empresaId, mapa.text, conexaoId) } };
  const col = parseCoordPaste(texto);
  if (col) return { local: { texto: col.name || "Localização enviada", lat: col.lat, lng: col.lng } };
  const fixo = romanizeBairroNumber(fixHouseNumberTypo(texto.trim())).replace(/(\p{L})\.(?=\p{L}{2})/gu, "$1 ");
  if (isVaguePickup(fixo)) return { recusa: T.embarqueVago() };
  if (looseHouseNumber(fixo) === fixo.trim()) return { recusa: T.embarqueSoNumero() };
  if (!pareceEndereco(fixo)) return {};
  const limpo = limparEndereco(fixo);
  return { local: { texto: textoComCidade(empresaId, limpo, conexaoId) }, pedirNumero: VIA_RE.test(limpo) && !addressHasNumber(limpo) };
}

/** Pergunta o embarque, oferecendo os endereços que a pessoa já usou (os de 2 usos ou mais). */
function perguntarEmbarque(p: Passo, corrigindo: boolean, intro?: string) {
  const usados = (p.c.enderecos ?? []).filter((e) => e.usos >= 2).sort((a, b) => b.usos - a.usos)
    .map((e, i) => ({ id: String(i), address_text: e.texto, e }));
  const unicos = uniqueFreqAddresses(usados, 3);
  if (!corrigindo && unicos.length) {
    p.c.rascunho.salvos = unicos.map((u) => ({ texto: u.e.texto, lat: u.e.lat, lng: u.e.lng }));
    return p.dizer(T.salvos(unicos.map(freqLabel), intro));
  }
  p.c.rascunho.salvos = undefined;
  p.dizer(corrigindo ? p.txt("address_correction", T.embarqueCorrecao()) : p.txt("ask_address", T.embarque()));
}

function guardarEndereco(c: Conversa, l: Local) {
  const chave = normalizar(l.texto);
  const lista = c.enderecos ?? [];
  const e = lista.find((x) => normalizar(x.texto) === chave);
  if (e) { e.usos++; e.em = agora(); } else lista.push({ texto: l.texto, lat: l.lat, lng: l.lng, usos: 1, em: agora() });
  c.enderecos = lista.sort((a, b) => b.usos - a.usos).slice(0, 20);
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
  if (etapa === "embarque") perguntarEmbarque(p, corrigindo);
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
  const { c, r } = p;
  let { n, texto } = p;

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
    if (comMotorista(c)) {
      // Com o motorista a caminho ou na corrida, o que o passageiro escreve, grava ou localiza vai para o chat do motorista.
      const prov = p.deps.provedor ?? provedorDe(p.empresaId, c.conexao);
      const rep = await repassarAoMotorista(p.empresaId, c, r, texto, (a) => (prov.baixarAudio ? prov.baixarAudio(a) : Promise.resolve(null)));
      if (rep) { if (!c.corrida!.avisouRepasse) { c.corrida!.avisouRepasse = true; p.dizer(T.repassado()); } return; }
    }
    return p.dizer(T.jaTemCorrida(NOME_STATUS[c.corrida.status] ?? c.corrida.status));
  }

  if (c.etapa === "suporte") {
    if (MENU.test(n) || supportCloseDecision("passenger", texto).sendMenu) { const saiu = p.txt("support_exit", ""); if (saiu) p.dizer(saiu); return irPara(p, "menu"); }
    return; // o operador responde pelo painel
  }
  if (MENU.test(n) && c.etapa !== "inicio") { c.rascunho = {}; return irPara(p, "menu"); }

  // Pedido urgente ("urgente", "rápido", "com pressa"): só o embarque, sem destino, categoria nem pagamento.
  if (texto && !localDe(r) && !c.rascunho.urgente && c.etapa !== "avaliacao" && !bloqueado(p)) {
    const u = detectUrgentRide(texto);
    if (u.urgent) {
      c.rascunho = { urgente: true };
      c.etapa = "embarque";
      p.cfg = { ...p.cfg, fluxo: { ...p.cfg.fluxo, ...URGENT_FLOW } };
      if (!u.rest) return p.dizer(URGENT_ASK_ADDRESS);
      texto = u.rest; n = normalizar(u.rest); p.texto = texto; p.n = n;
    }
  }
  if (c.rascunho.urgente) p.cfg = { ...p.cfg, fluxo: { ...p.cfg.fluxo, ...URGENT_FLOW } };
  // "Estou em casa" no começo: não é endereço; explica o que falta.
  if ((c.etapa === "inicio" || c.etapa === "menu") && texto && !localDe(r) && isVaguePickup(texto) && !bloqueado(p)) { c.etapa = "embarque"; return p.dizer(T.embarqueVago()); }

  // Agendar: "agendar", "meus agendamentos", "cancelar agendamento", e horário no meio do pedido ("me pega na Rua X às 10:45").
  if (p.cfg.agendar && texto && !localDe(r)) {
    if (c.etapa === "inicio" || c.etapa === "menu") {
      if (/\b(meus agendamentos|minhas corridas agendadas|ver agendamentos|listar agendamentos)\b/.test(n)) return listarAgendamentos(p);
      if (/\bcancel/.test(n) && /\bagendamento/.test(n)) return iniciarCancelamento(p);
      if (!n.includes("cancel") && (/\bagend(ar|a|amento|ada|ado)\b/.test(n) || /\b(programar|reservar|marcar)\b.{0,20}\b(corrida|carro|viagem|moto)\b/.test(n)) && !bloqueado(p)) return iniciarAgendamento(p, texto);
    }
    if (["inicio", "menu", "embarque", "destino"].includes(c.etapa)) {
      const sch = scheduleInRideText(texto, Date.now());
      if (sch?.when.ok && !bloqueado(p)) {
        c.rascunho.agendarPara = sch.when.whenMs;
        p.dizer(`🗓️ Agendando para *${formatScheduleBR(sch.when.whenMs)}*.`);
        if (!sch.text) return irPara(p, c.etapa === "destino" ? "destino" : "embarque");
        texto = sch.text; n = normalizar(texto); p.texto = texto; p.n = n;
      }
    }
  }

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
      c.rascunho = c.rascunho.agendarPara ? { agendarPara: c.rascunho.agendarPara } : {};
      if (bloqueado(p)) return irPara(p, "menu");
      if (localDe(r)) { c.rascunho.embarque = localDe(r)!; return irPara(p, "destino"); }
      if (!ehCumprimento(texto) && (await fraseLivre(p))) return;
      return irPara(p, "menu");

    case "menu": {
      const ag = p.cfg.agendar, SUP = ag ? 3 : 2;
      const o = opcao(texto, SUP, { 1: /\b(corrida|carro|moto|pedir|taxi|motorista)\b/, [SUP]: /\b(suporte|atendente|ajuda|reclamacao|falar)\b/ });
      if (o === SUP) return irPara(p, "suporte");
      if (ag && o === 2) return iniciarAgendamento(p, "");
      if (bloqueado(p)) { c.etapa = "menu"; return p.dizer(T.bloqueado(p.m)); }
      if (o === 1) return irPara(p, "embarque");
      if (localDe(r)) { c.rascunho.embarque = localDe(r)!; return irPara(p, "destino"); }
      if (!ehCumprimento(texto) && (await fraseLivre(p))) return;
      return p.dizer(p.txt("welcome_repeat", "") ? `${p.txt("welcome_repeat", "")}${opcoesMenu(p.cfg.agendar)}` : T.menuDeNovo(p.cfg.agendar));
    }

    case "embarque": {
      const salvos = c.rascunho.salvos;
      if (salvos?.length && !localDe(r)) {
        const o = opcao(texto, salvos.length + 1);
        if (o && o <= salvos.length) { c.rascunho.embarque = salvos[o - 1]; c.rascunho.salvos = undefined; return irPara(p, "destino"); }
        if (o === salvos.length + 1) { c.rascunho.salvos = undefined; return p.dizer(p.txt("ask_address", T.embarque())); }
      }
      if (localDe(r)) { c.rascunho.embarque = localDe(r)!; c.rascunho.salvos = undefined; return irPara(p, "destino"); }
      const e = await entenderLocal(p.empresaId, texto, p.c.conexao);
      if (e.recusa) return p.dizer(e.recusa);
      if (!e.local) return p.dizer(p.txt("address_retry", T.embarqueDeNovo()));
      c.rascunho.salvos = undefined;
      c.rascunho.embarque = e.local;
      if (e.pedirNumero) { c.etapa = "numero_embarque"; return p.dizer(T.pedirNumeroEmbarque(e.local.texto)); }
      return irPara(p, "destino");
    }

    case "numero_embarque": {
      const base = c.rascunho.embarque?.texto ?? "";
      const num = looseHouseNumber(fixHouseNumberTypo(texto)) ?? sameStreetNumber(base, texto);
      if (localDe(r)) { c.rascunho.embarque = localDe(r)!; return irPara(p, "destino"); }
      if (num) { c.rascunho.embarque = { texto: insertHouseNumber(base, num) }; return irPara(p, "destino"); }
      const e = await entenderLocal(p.empresaId, texto, p.c.conexao); // mandou outro endereço no lugar do número
      if (e.local && !e.pedirNumero) { c.rascunho.embarque = e.local; return irPara(p, "destino"); }
      return p.dizer(T.pedirNumeroEmbarque(base));
    }

    case "destino":
      {
        // "Não informar destino": segue sem destino ou, se a empresa tornou o destino obrigatório, explica e pergunta de novo.
        const quer = n === "2" || SEM_DESTINO.test(n) || decideSkip(true, texto) === "skip";
        const pular = quer ? (p.cfg.fluxo.allow_skip_destination ? "skip" : "required") : "none";
        if (pular === "skip") { c.rascunho.semDestino = true; c.rascunho.destino = undefined; return irPara(p, "confirmar"); }
        if (pular === "required") return p.dizer(T.destinoObrigatorio());
      }
      if (localDe(r)) { c.rascunho.destino = localDe(r)!; c.rascunho.semDestino = false; return irPara(p, "confirmar"); }
      {
        const e = await entenderLocal(p.empresaId, texto, p.c.conexao);
        if (e.local) {
          c.rascunho.destino = e.local; c.rascunho.semDestino = false;
          if (e.pedirNumero) { c.etapa = "numero_destino"; return p.dizer(T.pedirNumeroDestino(e.local.texto)); }
          return irPara(p, "confirmar");
        }
      }
      return p.dizer(p.txt("destination_retry", T.destinoDeNovo(p.cfg.fluxo.allow_skip_destination)));

    case "numero_destino": {
      const base = c.rascunho.destino?.texto ?? "";
      if (localDe(r)) { c.rascunho.destino = localDe(r)!; return irPara(p, "confirmar"); }
      if (/^(nao sei|n sei|sem numero|s n|nao tenho)(\s|$)/.test(n)) return irPara(p, "confirmar"); // o motorista combina o número
      const num = looseHouseNumber(fixHouseNumberTypo(texto)) ?? sameStreetNumber(base, texto);
      if (num) { c.rascunho.destino = { texto: insertHouseNumber(base, num) }; return irPara(p, "confirmar"); }
      const e = await entenderLocal(p.empresaId, texto, p.c.conexao);
      if (e.local && !e.pedirNumero) { c.rascunho.destino = e.local; return irPara(p, "confirmar"); }
      return p.dizer(T.pedirNumeroDestino(base));
    }

    case "agendamento": {
      if (!texto) return p.dizer(scheduleErrorText({ ok: false, reason: "no_time" }));
      const quando = parseScheduleWhen(texto, Date.now());
      if (quando.ok === false) {
        // Quem tocou em "Agendar" sem querer: "1", "agora" ou um endereço saem do agendamento; "sair/menu" voltam ao menu.
        const querAgora = /^(?:1|corrida|agora|ja|pra agora|para agora|e agora|quero agora|agora mesmo|nao quero agendar|nao e agendado)$/.test(n) || pareceRua(texto);
        const querSair = /^(?:sair|cancelar|cancela|menu|voltar|nao)$/.test(n);
        if (querSair) { c.rascunho = {}; return irPara(p, "menu"); }
        if (querAgora) {
          c.rascunho = {};
          p.dizer("👍 Sem agendamento: vou pedir a corrida para *agora*.");
          if (pareceRua(texto)) { c.rascunho.embarque = { texto: limparEndereco(texto) }; return irPara(p, "destino"); }
          return irPara(p, "embarque");
        }
        return p.dizer(`${scheduleErrorText(quando)}\n\n🚕 Para pedir a corrida *agora*, mande *1* (ou o endereço).`);
      }
      c.rascunho.agendarPara = quando.whenMs;
      p.dizer(`🗓️ Agendando para *${formatScheduleBR(quando.whenMs)}*.`);
      return irPara(p, "embarque");
    }

    case "cancelar_agendamento": {
      const ids = c.rascunho.agendCancelar ?? [];
      const sim = /^(?:sim|s|1|confirmo|cancelar|cancela|pode)\b/.test(n);
      const nao = /^(?:n|nao|manter|0|2)\b/.test(n);
      const o = ids.length > 1 ? opcao(texto, ids.length) : null;
      const alvo = ids.length === 1 ? (sim ? ids[0] : null) : o ? ids[o - 1] : null;
      if (!alvo) {
        if (nao || (ids.length > 1 && /^(?:n|nao|manter)\b/.test(n))) { c.rascunho = {}; c.etapa = "inicio"; return p.dizer("✅ Combinado, seu agendamento foi mantido."); }
        return p.dizer(ids.length === 1 ? "Responda *1* para cancelar o agendamento ou *2* para manter." : `Responda com o número do agendamento (de 1 a ${ids.length}) ou *não* para manter todos.`);
      }
      c.rascunho = {}; c.etapa = "inicio";
      try { await corridasDoBot().cancelar(p.empresaId, alvo); return p.dizer("✅ Agendamento cancelado."); }
      catch (e) { console.error("[bot] cancelar agendamento", p.empresaId, e instanceof Error ? e.message : e); return p.dizer("📅 Esse agendamento não está mais ativo."); }
    }

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

/** "AAAA-MM-DDTHH:MM" no horário de Brasília (UTC-3 fixo), o formato que a corrida própria aceita. */
export function horarioBrasilia(ms: number): string {
  const d = new Date(ms - 3 * 3_600_000), p2 = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}T${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}

const LIMITE_AGENDADAS = 3;
const agendadasDe = (p: Passo) => (corridasDoBot().agendadas ? corridasDoBot().agendadas!(p.empresaId, p.c.id) : Promise.resolve([]));

/** Começa o agendamento: com data e hora no texto já agenda; sem, pergunta. */
async function iniciarAgendamento(p: Passo, texto: string) {
  const { c } = p;
  if ((await agendadasDe(p)).length >= LIMITE_AGENDADAS) {
    c.etapa = "inicio";
    return p.dizer(`📅 Você já tem ${LIMITE_AGENDADAS} corridas agendadas (o limite). Mande *meus agendamentos* para ver, ou *cancelar agendamento* para liberar uma vaga.`);
  }
  const quando = parseScheduleWhen(texto, Date.now());
  if (quando.ok) {
    c.rascunho = { agendarPara: quando.whenMs };
    p.dizer(`🗓️ Agendando para *${formatScheduleBR(quando.whenMs)}*.`);
    return irPara(p, "embarque");
  }
  c.rascunho = {};
  c.etapa = "agendamento";
  p.dizer(quando.reason === "no_time"
    ? `📅 Vamos agendar! Para quando você quer a corrida? Me diga o dia e a hora, por exemplo: *amanhã 7h*, *sexta 18:30* ou *05/10 14h*.\n\n(Mínimo ${SCHEDULE_MIN_MINUTES} minutos de antecedência e até ${SCHEDULE_MAX_DAYS} dias à frente.)`
    : scheduleErrorText(quando));
}

async function listarAgendamentos(p: Passo) {
  const lista = await agendadasDe(p);
  if (!lista.length) return p.dizer("📅 Você não tem corridas agendadas. Para agendar, é só mandar *agendar*.");
  const linhas = lista.map((x, i) => `${i + 1}. *${formatScheduleBR(x.quandoMs)}*\n   📍 ${x.embarque}${x.destino ? `\n   🏁 ${x.destino}` : ""}`);
  p.dizer(`📅 *Suas corridas agendadas:*\n\n${linhas.join("\n\n")}\n\nPara cancelar, mande *cancelar agendamento*.`);
}

async function iniciarCancelamento(p: Passo) {
  const lista = await agendadasDe(p);
  if (!lista.length) return p.dizer("📅 Você não tem corridas agendadas para cancelar.");
  p.c.rascunho = { agendCancelar: lista.map((x) => x.id) };
  p.c.etapa = "cancelar_agendamento";
  p.dizer(lista.length === 1
    ? `⚠️ Deseja cancelar sua corrida agendada para *${formatScheduleBR(lista[0].quandoMs)}*?\n*1* - Sim, cancelar ✅\n*2* - Não, manter 🚕`
    : `📅 Qual agendamento você quer cancelar? Responda com o número:\n\n${lista.map((x, i) => `${i + 1} - ${formatScheduleBR(x.quandoMs)}`).join("\n")}\n\n(ou *não* para manter todos)`);
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
      pagamento: rasc.pagamento, observacao: "Pedido pelo WhatsApp", agendadaPara: rasc.agendarPara ? horarioBrasilia(rasc.agendarPara) : undefined,
    });
    if (rasc.agendarPara) {
      // Corrida agendada não prende a conversa: a pessoa pode pedir outra para agora. Os avisos saem 15 e 5 minutos antes.
      guardarEndereco(c, rasc.embarque);
      c.etapa = "inicio"; c.rascunho = {};
      return p.dizer(T.agendada(nova.os, formatScheduleBR(rasc.agendarPara), nova.valor));
    }
    c.corrida = { id: nova.id, os: nova.os, status: "procurando", grupo: "aberta", criadaEm: agora(), valor: nova.valor };
    guardarEndereco(c, rasc.embarque);
    c.etapa = "em_corrida";
    c.rascunho = {};
    const ok = p.txt("ride_success", "");
    p.dizer(ok ? `${ok}\nNúmero *${nova.os}*.${nova.valor ? ` Valor estimado: *R$ ${nova.valor.toFixed(2).replace(".", ",")}*.` : ""}\nPara cancelar, envie *cancelar*.` : T.criada(nova.os, nova.valor));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[bot] criar corrida", empresaId, msg);
    if (/em aberto/i.test(msg)) { c.etapa = "inicio"; c.rascunho = {}; return p.dizer(T.jaTemAberta(msg.replace(/^Este passageiro já tem/, "Você já tem"))); }
    if (/bloqueado/i.test(msg)) { c.etapa = "menu"; c.rascunho = {}; return p.dizer(T.bloqueado(p.m)); }
    if (/antecedência|no máximo 30 dias/i.test(msg) && rasc.agendarPara) { c.etapa = "agendamento"; c.rascunho = {}; return p.dizer(scheduleErrorText({ ok: false, reason: "too_soon" })); }
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
