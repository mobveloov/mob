// Prêmios: Roleta de Cupom e Raspadinha. O passageiro recebe um link (no WhatsApp da empresa) e joga numa página pública:
//   /p/<empresa>/<token>              convite com o nome dele
//   /premios/<empresa>/<roleta|raspadinha>   link aberto: ele digita o telefone e o link do jogo vai para o WhatsApp dele
// O sorteio e o cupom acontecem no servidor; o prêmio vira um cupom do cadastro "Cupons" (vale uma vez, só para aquele telefone).
// Dados em DADOS_DIR/empresas/<id>/totem/premios.json (fora do Git). Regras puras em premios-jogos.ts.
//
// Gancho para o CRM (Recompensas): definirGanchoPremio(fn) recebe cada prêmio ganho, sem o CRM mexer neste módulo.

import fs from "node:fs";
import path from "node:path";
import { provedorDe } from "../bot/fluxo.ts";
import { listar, criar } from "../cadastros/armazem.ts";
import { cadastroPorId } from "../comum/cadastros.ts";
import * as CRM from "../crm/armazem.ts";
import { descadastrado } from "../crm/gatilhos.ts";
import { brAgora, dentroDaJanela, enviadosHoje, pausaGeral, tetoHoje } from "../crm/limites.ts";
import { WA_OPTOUT_SKIP } from "../crm/optout.ts";
import { registrar } from "../crm/registro.ts";
import { reservar } from "../crm/ritmo.ts";
import * as D from "../servidor/dados.ts";
import { agoraBr } from "../servidor/util.ts";
import {
  aleatorioSeguro, codigoDoCupom, configPadrao, diasAntes, ROTULO_JOGO, normalizarConfig, novoToken, primeiroNome, resumoDasChances, sortearPremio, textoDoCupom,
  type ConfigJogo, type JogoTipo, type Premio,
} from "./premios-jogos.ts";

export const JOGOS: JogoTipo[] = ["roleta", "raspadinha"];
export const ehJogo = (v: unknown): v is JogoTipo => JOGOS.includes(v as JogoTipo);

export interface Convite {
  token: string;
  jogo: JogoTipo;
  telefone: string;
  nome: string;
  criadoEm: string;
  expiraEm: string;
  dataLocal: string;
  origem: "agora" | "link" | "manual";
  enviadoEm: string | null;
  erroEnvio: string | null;
  jogadoEm: string | null;
  indice: number | null;
  premio: Pick<Premio, "label" | "type" | "value"> | null;
  cupom: string | null;
  erroCupom: string | null;
}

interface Arquivo { config: Partial<Record<JogoTipo, unknown>>; convites: Convite[] }
const MAX_CONVITES = 20000;
const REENVIO_MS = 10 * 60_000;
const VALIDADE_CONVITE_DIAS = 7;

const arq = (e: string) => {
  if (!D.idValido(e)) throw new Error("Empresa inválida.");
  return path.join(D.raiz(), "empresas", e, "totem", "premios.json");
};
function ler(e: string): Arquivo {
  try { const j = JSON.parse(fs.readFileSync(arq(e), "utf8")) as Partial<Arquivo>; return { config: j.config ?? {}, convites: j.convites ?? [] }; }
  catch { return { config: {}, convites: [] }; }
}
function gravar(e: string, a: Arquivo) {
  fs.mkdirSync(path.dirname(arq(e)), { recursive: true });
  const tmp = `${arq(e)}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ ...a, convites: a.convites.slice(-MAX_CONVITES) }), { mode: 0o600 });
  fs.renameSync(tmp, arq(e));
}

/** Telefone só com dígitos, sem o 55 do país. */
export const soNumeros = (v: unknown) => { const d = String(v ?? "").replace(/\D/g, ""); return d.length >= 12 && d.startsWith("55") ? d.slice(2) : d; };

// ------------------------------------------------------------------ gancho para o CRM

export interface PremioGanho { empresaId: string; jogo: JogoTipo; telefone: string; nome: string; premio: { label: string; type: string; value: number }; cupom: string | null }
let gancho: ((p: PremioGanho) => void) | null = null;
/** O CRM (Recompensas) registra aqui uma função que recebe cada prêmio ganho. Erros dela não atrapalham o jogo. */
export const definirGanchoPremio = (fn: ((p: PremioGanho) => void) | null) => { gancho = fn; };

// ------------------------------------------------------------------ configuração (painel)

export const configDoJogo = (e: string, kind: JogoTipo): ConfigJogo => normalizarConfig(kind, ler(e).config[kind] ?? configPadrao(kind));

export function salvarConfigDoJogo(e: string, kind: JogoTipo, raw: unknown): ConfigJogo {
  const a = ler(e);
  const cfg = normalizarConfig(kind, raw);
  a.config[kind] = cfg;
  gravar(e, a);
  return cfg;
}

const hoje = () => agoraBr().toISOString().slice(0, 10);

/** Tela de prêmios: as duas configurações, as chances e os números de hoje. */
export function painelDosJogos(e: string) {
  const a = ler(e);
  const dia = hoje();
  return JOGOS.map((kind) => {
    const cfg = normalizarConfig(kind, a.config[kind] ?? configPadrao(kind));
    const doJogo = a.convites.filter((c) => c.jogo === kind);
    const deHoje = doJogo.filter((c) => c.dataLocal === dia);
    return {
      kind, rotulo: ROTULO_JOGO[kind], saved: a.config[kind] != null, config: cfg, odds: resumoDasChances(cfg.prizes),
      stats: { today: deHoje.length, played_today: deHoje.filter((c) => c.jogadoEm).length, coupons_today: deHoje.filter((c) => c.cupom).length, failed_today: deHoje.filter((c) => c.erroEnvio).length, total: doJogo.length, played: doJogo.filter((c) => c.jogadoEm).length },
    };
  });
}

// ------------------------------------------------------------------ passageiros e cupons

interface Passageiro { telefone: string; nome: string }
const passageiros = (e: string): Passageiro[] => listar(e, cadastroPorId("clientes")!)
  .filter((c) => !["Bloqueado", "Suspenso", "Suspenso por nota", "Deletado"].includes(String(c.status)))
  .map((c) => ({ telefone: soNumeros(c.telefone), nome: String(c.nome ?? "") })).filter((p) => p.telefone.length >= 10);
const achaPassageiro = (e: string, tel: string) => passageiros(e).find((p) => p.telefone === tel) ?? null;

/** Cria o cupom do prêmio no cadastro "Cupons": vale uma vez, só para aquele telefone, pelos dias da configuração. */
function criarCupom(e: string, kind: JogoTipo, tel: string, nome: string, premio: Premio, dias: number): { codigo: string | null; erro: string | null } {
  for (let t = 0; t < 5; t++) {
    const codigo = codigoDoCupom(kind);
    const fim = new Date(agoraBr().getTime() + dias * 86400000).toISOString().slice(0, 10);
    try {
      criar(e, cadastroPorId("cupons")!, {
        codigo, descricao: `${ROTULO_JOGO[kind]}: ${premio.label}`, tipoDesconto: premio.type === "percent" ? "Percentual" : "Valor fixo", valor: premio.value,
        inicio: hoje(), fim, limiteUsos: 1, usoPorPassageiro: 1, clienteTelefone: tel, clienteNome: nome, ativo: true,
      }, `premios:${kind}`);
      return { codigo, erro: null };
    } catch (x) {
      if (!/já existe|existe/i.test(x instanceof Error ? x.message : "")) return { codigo: null, erro: x instanceof Error ? x.message : "Não foi possível criar o cupom." };
    }
  }
  return { codigo: null, erro: "Não foi possível gerar um código novo." };
}

// ------------------------------------------------------------------ convites

/** Convite do dia (ou da janela de "a cada N dias") do telefone, ou um novo. */
export function convidar(e: string, kind: JogoTipo, tel: string, nome: string, origem: Convite["origem"]): { convite: Convite; novo: boolean } {
  const a = ler(e);
  const cfg = normalizarConfig(kind, a.config[kind] ?? configPadrao(kind));
  const desde = diasAntes(hoje(), cfg.every_n_days - 1);
  const ultimo = [...a.convites].reverse().find((c) => c.jogo === kind && c.telefone === tel && c.dataLocal >= desde);
  if (ultimo) return { convite: ultimo, novo: false };
  const c: Convite = {
    token: novoToken(), jogo: kind, telefone: tel, nome, criadoEm: new Date().toISOString(), expiraEm: new Date(Date.now() + VALIDADE_CONVITE_DIAS * 86400000).toISOString(),
    dataLocal: hoje(), origem, enviadoEm: null, erroEnvio: null, jogadoEm: null, indice: null, premio: null, cupom: null, erroCupom: null,
  };
  a.convites.push(c);
  gravar(e, a);
  return { convite: c, novo: true };
}

function atualizar(e: string, token: string, fn: (c: Convite) => void): Convite | null {
  const a = ler(e);
  const c = a.convites.find((x) => x.token === token);
  if (!c) return null;
  fn(c);
  gravar(e, a);
  return c;
}
export const conviteDoToken = (e: string, token: unknown): Convite | null => (/^[0-9a-f]{40}$/.test(String(token ?? "")) ? ler(e).convites.find((c) => c.token === token) ?? null : null);

export interface Trava { erro: string; /** Vale para todos (pausa, horário, teto, ritmo): quem envia em lote para de enviar. Falso = só esta pessoa (descadastro). */ geral: boolean }

/**
 * As mesmas travas do CRM para qualquer mensagem de prêmio: descadastro do WhatsApp, pausa geral, janela de horário da
 * Governança, teto diário e ritmo (lote e pausa entre lotes). Horário, teto e ritmo só valem para o WhatsApp de verdade
 * (o simulado não manda nada). Devolve null quando pode enviar; consumir=true gasta uma vaga do ritmo.
 */
export function travasDoCrm(e: string, tel: string, o: { real?: boolean; agora?: number; consumir?: boolean } = {}): Trava | null {
  const agora = o.agora ?? Date.now();
  const real = o.real ?? provedorDe(e).tipo !== "simulado";
  if (descadastrado(e, tel)) return { erro: WA_OPTOUT_SKIP, geral: false };
  if (pausaGeral(e).pausado) return { erro: "Envios do CRM pausados pelo painel.", geral: true };
  if (!real) return null;
  if (!dentroDaJanela(e, brAgora(new Date(agora - 3 * 3600_000)).hhmm)) return { erro: "Fora da janela de horário de envio.", geral: true };
  if (enviadosHoje(e, agora) >= tetoHoje(e, agora)) return { erro: "Teto diário de WhatsApp atingido.", geral: true };
  const res = reservar(CRM.config(e), CRM.ritmo(e), agora);
  if (!res.ok) return { erro: "WhatsApp em pausa entre lotes ou no limite por minuto.", geral: true };
  if (o.consumir) CRM.salvarRitmo(e, res.estado);
  return null;
}

/**
 * Manda o link do jogo pelo WhatsApp da empresa, passando pelas travas do CRM. Sem servidor de WhatsApp configurado
 * (simulado) a mensagem fica na caixa simulada. `adiado`: travou por pausa, horário, teto ou ritmo; o convite fica para depois.
 */
export async function enviarLink(e: string, base: string, c: Convite): Promise<{ ok: boolean; erro?: string; adiado?: boolean }> {
  const cfg = configDoJogo(e, c.jogo);
  const texto = `${cfg.title}\n${cfg.message}\n\n${cfg.button_text}: ${base}/p/${e}/${c.token}`;
  const trava = travasDoCrm(e, c.telefone, { consumir: true });
  if (trava) {
    if (!trava.geral) atualizar(e, c.token, (y) => { y.erroEnvio = trava.erro; });
    return { ok: false, erro: trava.erro, adiado: trava.geral };
  }
  try {
    const provedor = provedorDe(e);
    await provedor.enviarTexto(c.telefone, texto);
    if (provedor.tipo !== "simulado") registrar(e, { origem: "manual", origem_id: `premio:${c.jogo}`, estado: "sent", telefone: c.telefone, nome: c.nome, titulo: cfg.title, previa: texto });
    atualizar(e, c.token, (x) => { x.enviadoEm = new Date().toISOString(); x.erroEnvio = null; });
    return { ok: true };
  } catch (x) {
    const erro = (x instanceof Error ? x.message : "erro").slice(0, 200);
    atualizar(e, c.token, (y) => { y.erroEnvio = erro; });
    return { ok: false, erro };
  }
}

/** "Enviar agora": convite para os passageiros do cadastro que ainda não receberam (até 500 por vez). */
export async function enviarAgora(e: string, kind: JogoTipo, base: string): Promise<{ criados: number; enviados: number; falhas: number; restam: number }> {
  const cfg = configDoJogo(e, kind);
  if (!cfg.invites_enabled) throw new Error('Ligue "Disparar convites" e salve antes de enviar.');
  const todos = passageiros(e);
  let criados = 0, enviados = 0, falhas = 0, tentados = 0;
  for (const p of todos) {
    if (tentados >= 500) break;
    // Trava geral (pausa, horário, teto, ritmo): para o lote sem criar convite que ficaria sem envio. Descadastrado: pula só ele.
    const antes = travasDoCrm(e, p.telefone);
    if (antes) { if (antes.geral) break; continue; }
    const { convite, novo } = convidar(e, kind, p.telefone, p.nome, "agora");
    // Convite que já saiu, já foi jogado ou falhou de verdade não se repete; o que ficou adiado (sem envio nem erro) sai agora.
    if (!novo && (convite.enviadoEm || convite.jogadoEm || convite.erroEnvio)) continue;
    if (novo) criados++;
    tentados++;
    const r = await enviarLink(e, base, convite);
    if (r.ok) enviados++; else if (r.adiado) break; else falhas++;
  }
  return { criados, enviados, falhas, restam: Math.max(0, criados - enviados - falhas) };
}

// ------------------------------------------------------------------ público (sem login)

const resultadoDe = (c: Convite) => (c.jogadoEm ? { prize_index: c.indice, prize: c.premio, code: c.cupom, coupon_error: c.erroCupom } : null);

/** Dados do jogo para a página: sem a chance de cada prêmio (só o que aparece na roleta). */
export function infoDoConvite(e: string, token: unknown) {
  const c = conviteDoToken(e, token);
  if (!c) return null;
  const cfg = configDoJogo(e, c.jogo);
  return {
    company: D.empresa(e)?.nome ?? "", first_name: primeiroNome(c.nome),
    game: {
      kind: c.jogo, title: cfg.title, message: cfg.message, button_text: cfg.button_text, card_headline: cfg.card_headline, card_phrase: cfg.card_phrase, color: cfg.color,
      prizes: cfg.prizes.map((p) => ({ label: p.label, type: p.type, ...(p.color ? { color: p.color } : {}) })),
    },
    expired: !c.jogadoEm && Date.parse(c.expiraEm) < Date.now(),
    result: resultadoDe(c),
  };
}

/** Sorteia e cria o cupom. Marca como jogado ANTES do cupom: dois cliques ao mesmo tempo não geram dois prêmios. */
export async function jogar(e: string, token: unknown, base: string): Promise<{ status: number; corpo: Record<string, unknown> }> {
  const c = conviteDoToken(e, token);
  if (!c) return { status: 404, corpo: { erro: "Convite não encontrado." } };
  if (c.jogadoEm) return { status: 200, corpo: { result: resultadoDe(c) } };
  if (Date.parse(c.expiraEm) < Date.now()) return { status: 410, corpo: { erro: "Este convite venceu." } };
  const cfg = configDoJogo(e, c.jogo);
  const idx = sortearPremio(cfg.prizes, aleatorioSeguro());
  const premio: Premio = idx >= 0 ? cfg.prizes[idx] : { label: "Não foi dessa vez", type: "none", value: 0, chance: 0 };
  let primeiro = false;
  const marcado = atualizar(e, c.token, (x) => { if (!x.jogadoEm) { primeiro = true; x.jogadoEm = new Date().toISOString(); x.indice = idx; x.premio = { label: premio.label, type: premio.type, value: premio.value }; } });
  if (!primeiro) return { status: 200, corpo: { result: marcado ? resultadoDe(marcado) : null } };
  let codigo: string | null = null, erro: string | null = null;
  if (premio.type !== "none") {
    ({ codigo, erro } = criarCupom(e, c.jogo, c.telefone, c.nome, premio, cfg.coupon_valid_days));
    atualizar(e, c.token, (x) => { x.cupom = codigo; x.erroCupom = erro; });
    if (codigo && !descadastrado(e, c.telefone)) {
      // Cupom também pelo WhatsApp (não segura a resposta do jogo)
      void provedorDe(e).enviarTexto(c.telefone, textoDoCupom(null, { nome: c.nome, premio: premio.label, cupom: codigo, validDays: cfg.coupon_valid_days, origem: c.jogo })).catch(() => undefined);
    }
  }
  try { gancho?.({ empresaId: e, jogo: c.jogo, telefone: c.telefone, nome: c.nome, premio: { label: premio.label, type: premio.type, value: premio.value }, cupom: codigo }); } catch { /* o CRM não derruba o jogo */ }
  void base;
  return { status: 200, corpo: { result: { prize_index: idx, prize: { label: premio.label, type: premio.type, value: premio.value }, code: codigo, coupon_error: erro } } };
}

/** Link aberto: o passageiro digita o telefone e o link do jogo vai para o WhatsApp dele (quem só sabe o telefone de alguém não joga no lugar dele). */
export async function abrirPeloTelefone(e: string, kind: JogoTipo, telefone: unknown, base: string): Promise<{ status: number; corpo: Record<string, unknown> }> {
  const tel = soNumeros(telefone);
  if (tel.length < 10 || tel.length > 11) return { status: 400, corpo: { erro: "Digite o telefone com DDD." } };
  const cfg = configDoJogo(e, kind);
  if (!cfg.public_open) return { status: 403, corpo: { erro: "Este jogo não está aberto agora." } };
  // A resposta é SEMPRE a mesma (telefone desconhecido, bloqueado, já jogou, reenvio recente ou falha no envio): quem
  // digita um número não descobre se ele é cadastrado.
  const IGUAL = { status: 200, corpo: { sent: true } };
  const p = achaPassageiro(e, tel);
  if (!p) return IGUAL;
  const { convite, novo } = convidar(e, kind, tel, p.nome, "link");
  if (convite.jogadoEm) return IGUAL;
  // Reenvio do mesmo convite: no máximo 1 a cada 10 min (evita encher o WhatsApp de alguém de avisos)
  if (!novo && convite.enviadoEm && Date.now() - Date.parse(convite.enviadoEm) < REENVIO_MS) return IGUAL;
  await enviarLink(e, base, convite);
  return IGUAL;
}
