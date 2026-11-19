// CRM › Recompensas: Cartão Fidelidade (prêmio a cada N corridas) e Pontos de Troca (pontos por corrida, trocados por cupom
// ou brinde). Portado de supabase/functions/rewards/loyalty.ts do sistema de referência, trocando o banco e tirando a Machine:
//   - as corridas finalizadas vêm da linha do tempo do CRM (crm_eventos "concluiu", que já junta corridas próprias,
//     do bot, do totem e das integrações);
//   - o cupom do prêmio vai para o cadastro "Cupons" (vale uma vez, só para aquele telefone);
//   - o aviso vai pelo WhatsApp da empresa, passando pelas travas do CRM (descadastro, pausa, janela, teto, ritmo).
// As regras puras estão em fidelidade-regras.ts. Quem roda é o trabalhador do CRM (crm/envio.ts) e a página do passageiro.

import crypto from "node:crypto";
import * as Cad from "../cadastros/armazem.ts";
import { provedorDe } from "../bot/fluxo.ts";
import { cadastroPorId } from "../comum/cadastros.ts";
import { registrar } from "../crm/registro.ts";
import { novoId } from "../crm/armazem.ts";
import { baseGuardada, soNumeros, travasDoCrm } from "../totem/premios.ts";
import { textoDoCupom } from "../totem/premios-jogos.ts";
import * as D from "../servidor/dados.ts";
import { moduloLigado } from "../superadmin/recursos.ts";
import { transacao } from "../servidor/banco.ts";
import { bd, DIA } from "./base.ts";
import {
  cardRewardDue, consumePoints, discountLabel, fillMessage, normalizeCard, normalizePointsConfig, pickupCode, pointsBalance, pointsToMoney,
  type EarnRow, type LoyaltyCard, type PointsConfig,
} from "./fidelidade-regras.ts";

const hoje = (agora: number) => new Date(agora - 3 * 3600_000).toISOString().slice(0, 10);
const bruto = (e: string) => { if (!D.idValido(e)) throw new Error("Empresa inválida."); return e; };

/** Código do cupom: prefixo + 6 letras/números sem os que confundem (0/O, 1/I). */
export function codigoComPrefixo(prefixo: string, rand: () => number = Math.random): string {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += abc[Math.floor(rand() * abc.length) % abc.length];
  return `${prefixo}${s}`;
}

// ------------------------------------------------------------------ recompensas ganhas (aba Recompensas do CRM)

export type OrigemRecompensa = "roleta" | "raspadinha" | "fidelidade" | "pontos";
export interface RecompensaGanha { id: string; origem: OrigemRecompensa; telefone: string; nome: string; premio: string; cupom: string | null; em: number }

/** Registra um prêmio ganho (jogos, cartão, pontos). É o que a aba Recompensas mostra em "Prêmios ganhos". */
export function registrarRecompensa(e: string, r: { origem: OrigemRecompensa; telefone: string; nome?: string; premio: string; cupom?: string | null; em?: number }) {
  const id = crypto.randomUUID().slice(0, 12);
  bd().prepare("INSERT INTO crm_recompensas_ganhas (empresa, id, origem, telefone, nome, premio, cupom, em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(bruto(e), id, r.origem, soNumeros(r.telefone), String(r.nome ?? "").slice(0, 120), r.premio.slice(0, 120), r.cupom ?? null, r.em ?? Date.now());
  return id;
}

export function listarRecompensas(e: string, limite = 100): RecompensaGanha[] {
  return bd().prepare("SELECT id, origem, telefone, nome, premio, cupom, em FROM crm_recompensas_ganhas WHERE empresa = ? ORDER BY em DESC, id LIMIT ?").all(bruto(e), Math.min(500, Math.max(1, limite))) as unknown as RecompensaGanha[];
}

export function resumoRecompensas(e: string) {
  const linhas = bd().prepare("SELECT origem, COUNT(*) AS n FROM crm_recompensas_ganhas WHERE empresa = ? GROUP BY origem").all(bruto(e)) as Array<{ origem: string; n: number }>;
  const por: Record<string, number> = { roleta: 0, raspadinha: 0, fidelidade: 0, pontos: 0 };
  for (const l of linhas) por[l.origem] = l.n;
  return { total: Object.values(por).reduce((a, b) => a + b, 0), por };
}

// ------------------------------------------------------------------ cupom e WhatsApp

/** Cria o cupom do prêmio no cadastro "Cupons": vale uma vez, só para aquele telefone. */
export function criarCupomDaRecompensa(e: string, o: { prefixo: string; origem: string; nome: string; telefone: string; nomePessoa: string; tipo: "percent" | "fixed"; valor: number; dias: number; agora?: number }): { codigo: string | null; erro: string | null } {
  const agora = o.agora ?? Date.now();
  for (let t = 0; t < 5; t++) {
    const codigo = codigoComPrefixo(o.prefixo);
    try {
      Cad.criar(e, cadastroPorId("cupons")!, {
        codigo, descricao: o.nome, tipoDesconto: o.tipo === "percent" ? "Percentual" : "Valor fixo", valor: o.valor,
        inicio: hoje(agora), fim: hoje(agora + o.dias * DIA), limiteUsos: 1, usoPorPassageiro: 1, clienteTelefone: o.telefone, clienteNome: o.nomePessoa, ativo: true,
      }, `recompensa:${o.origem}`);
      return { codigo, erro: null };
    } catch (x) {
      if (!/já existe|existe/i.test(x instanceof Error ? x.message : "")) return { codigo: null, erro: x instanceof Error ? x.message : "Não foi possível criar o cupom." };
    }
  }
  return { codigo: null, erro: "Não foi possível gerar um código novo." };
}

/** Mensagem de WhatsApp da recompensa, com as travas do CRM. Devolve se saiu (sem servidor de WhatsApp, vai para a caixa simulada). */
async function enviarWhats(e: string, tel: string, nome: string, titulo: string, texto: string, origemId: string): Promise<boolean> {
  if (travasDoCrm(e, tel, { consumir: true })) return false;
  try {
    const p = provedorDe(e);
    await p.enviarTexto(tel, texto);
    if (p.tipo !== "simulado") registrar(e, { origem: "manual", origem_id: origemId, estado: "sent", telefone: tel, nome, titulo, previa: texto });
    return true;
  } catch { return false; }
}

const enviarCupom = (e: string, tel: string, nome: string, premio: string, cupom: string, dias: number, origem: string) =>
  enviarWhats(e, tel, nome, "Cupom", textoDoCupom(null, { nome, premio, cupom, validDays: dias, origem }), `premio:${origem}`);

// ------------------------------------------------------------------ cartões fidelidade (painel)

export interface CartaoLinha { id: string; config: LoyaltyCard; activated_at: number | null; members: number; delivered: number }

export function listarCartoes(e: string): CartaoLinha[] {
  const db = bd();
  const linhas = db.prepare("SELECT id, config, ativado_em FROM crm_fid_cartoes WHERE empresa = ? ORDER BY criado_em, id").all(bruto(e)) as Array<{ id: string; config: string; ativado_em: number | null }>;
  return linhas.map((r) => {
    const t = db.prepare("SELECT COUNT(*) AS m, COALESCE(SUM(premiados), 0) AS d FROM crm_fid_progresso WHERE empresa = ? AND cartao_id = ?").get(e, r.id) as { m: number; d: number };
    return { id: r.id, config: normalizeCard(JSON.parse(r.config)), activated_at: r.ativado_em, members: t.m, delivered: t.d };
  });
}

/** Salva (cria ou muda) um cartão. Ligar agora marca o início da contagem: só contam corridas depois disso. */
export function salvarCartao(e: string, id: string | null, raw: unknown, agora = Date.now()): string {
  const db = bd();
  const cfg = normalizeCard(raw);
  if (id) {
    const atual = db.prepare("SELECT config, ativado_em FROM crm_fid_cartoes WHERE empresa = ? AND id = ?").get(bruto(e), id) as { config: string; ativado_em: number | null } | undefined;
    if (!atual) throw new Error("Cartão não encontrado.");
    const estava = normalizeCard(JSON.parse(atual.config)).active;
    db.prepare("UPDATE crm_fid_cartoes SET config = ?, ativado_em = ? WHERE empresa = ? AND id = ?").run(JSON.stringify(cfg), cfg.active && !estava ? agora : atual.ativado_em, e, id);
    return id;
  }
  const novo = novoId();
  db.prepare("INSERT INTO crm_fid_cartoes (empresa, id, config, ativado_em, criado_em) VALUES (?, ?, ?, ?, ?)").run(bruto(e), novo, JSON.stringify(cfg), cfg.active ? agora : null, agora);
  return novo;
}

export function excluirCartao(e: string, id: string) {
  const db = bd();
  db.prepare("DELETE FROM crm_fid_progresso WHERE empresa = ? AND cartao_id = ?").run(bruto(e), id);
  db.prepare("DELETE FROM crm_fid_cartoes WHERE empresa = ? AND id = ?").run(e, id);
}

// ------------------------------------------------------------------ pontos (painel)

export function programaDePontos(e: string): { salvo: boolean; config: PointsConfig; ultimoSlot: string | null } {
  const r = bd().prepare("SELECT config, ultimo_slot FROM crm_pontos_programa WHERE empresa = ?").get(bruto(e)) as { config: string; ultimo_slot: string | null } | undefined;
  return { salvo: !!r, config: normalizePointsConfig(r ? JSON.parse(r.config) : null), ultimoSlot: r?.ultimo_slot ?? null };
}

export function salvarPontos(e: string, raw: unknown): PointsConfig {
  const cfg = normalizePointsConfig(raw);
  bd().prepare("INSERT INTO crm_pontos_programa (empresa, config, atualizado_em) VALUES (?, ?, ?) ON CONFLICT (empresa) DO UPDATE SET config = excluded.config, atualizado_em = excluded.atualizado_em").run(bruto(e), JSON.stringify(cfg), Date.now());
  return cfg;
}

interface Lanc extends EarnRow { telefone: string }
const ganhosAbertos = (e: string, tel?: string): Lanc[] => {
  const sql = `SELECT id, telefone, restante AS remaining, vence_em FROM crm_pontos_lancamentos WHERE empresa = ? AND tipo = 'earn' AND restante > 0${tel ? " AND telefone = ?" : ""} LIMIT 20000`;
  const r = (tel ? bd().prepare(sql).all(e, tel) : bd().prepare(sql).all(e)) as Array<{ id: string; telefone: string; remaining: number; vence_em: number }>;
  return r.map((x) => ({ id: x.id, telefone: x.telefone, remaining: x.remaining, expires_at: new Date(x.vence_em).toISOString() }));
};

export function saldoDe(e: string, tel: string, agora = Date.now()): number { return pointsBalance(ganhosAbertos(e, tel), agora); }

export function resumoDePontos(e: string, agora = Date.now()) {
  const { salvo, config } = programaDePontos(e);
  const por = new Map<string, number>();
  for (const r of ganhosAbertos(e)) if (new Date(r.expires_at).getTime() > agora) por.set(r.telefone, (por.get(r.telefone) ?? 0) + r.remaining);
  const circulando = [...por.values()].reduce((s, v) => s + v, 0);
  const trocados = (bd().prepare("SELECT COALESCE(-SUM(pontos), 0) AS n FROM crm_pontos_lancamentos WHERE empresa = ? AND tipo = 'redeem'").get(e) as { n: number }).n;
  const retiradas = bd().prepare("SELECT id, telefone, premio, retirada, retirada_feita_em, criado_em FROM crm_pontos_lancamentos WHERE empresa = ? AND retirada IS NOT NULL ORDER BY criado_em DESC LIMIT 50").all(e) as Array<{ id: string; telefone: string; premio: string | null; retirada: string; retirada_feita_em: number | null; criado_em: number }>;
  return {
    saved: salvo, config,
    stats: { passengers: por.size, circulating: circulando, redeemed: trocados },
    top: [...por.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([phone, balance]) => ({ phone, balance })),
    pickups: retiradas.map((r) => ({ id: r.id, phone: r.telefone, prize: r.premio ? JSON.parse(r.premio) as { name?: string } : null, pickup_code: r.retirada, pickup_done_at: r.retirada_feita_em, created_at: r.criado_em })),
    money_value: pointsToMoney(circulando, config.point_value),
  };
}

export function marcarRetiradaEntregue(e: string, id: string) {
  const r = bd().prepare("UPDATE crm_pontos_lancamentos SET retirada_feita_em = ? WHERE empresa = ? AND id = ? AND retirada IS NOT NULL").run(Date.now(), bruto(e), id);
  if (!Number(r.changes)) throw new Error("Retirada não encontrada.");
}

// ------------------------------------------------------------------ link do passageiro

function linkDePontos(e: string, tel: string): string | null {
  const base = baseGuardada(e);
  if (!base) return null;
  const db = bd();
  let t = (db.prepare("SELECT token FROM crm_pontos_links WHERE empresa = ? AND telefone = ?").get(e, tel) as { token: string } | undefined)?.token;
  if (!t) {
    t = crypto.randomBytes(20).toString("hex");
    db.prepare("INSERT OR IGNORE INTO crm_pontos_links (empresa, telefone, token) VALUES (?, ?, ?)").run(e, tel, t);
    t = (db.prepare("SELECT token FROM crm_pontos_links WHERE empresa = ? AND telefone = ?").get(e, tel) as { token: string }).token;
  }
  return `${base}/pontos/${e}/${t}`;
}

async function avisarPontos(e: string, tel: string, nome: string, cfg: PointsConfig) {
  const link = linkDePontos(e, tel);
  await enviarWhats(e, tel, nome, cfg.title, `${cfg.title}\n${cfg.message}${link ? `\n\nVer pontos: ${link}` : ""}`, "premio:pontos");
}

// ------------------------------------------------------------------ trabalhador

/** Só roda onde o CRM e o totem (onde fica a tela Prêmios) estão ligados. */
const ligado = (e: string) => moduloLigado(e, "crm") && moduloLigado(e, "totem");

/**
 * Corridas finalizadas dos últimos 3 dias que ainda não foram contadas viram pontos e avançam os cartões; marco atingido = cupom
 * e aviso no WhatsApp. Cada corrida é marcada como vista ANTES de contar: duas rodadas ao mesmo tempo não contam duas vezes.
 */
export async function processarCorridas(e: string, agora = Date.now(), limite = 400): Promise<{ corridas: number; pontos: number; cartoes: number }> {
  const out = { corridas: 0, pontos: 0, cartoes: 0 };
  if (!ligado(e)) return out;
  const db = bd();
  const prog = programaDePontos(e).config;
  const cartoes = listarCartoes(e).filter((c) => c.config.active && c.activated_at != null);
  if (!prog.enabled && !cartoes.length) return out;
  const eventos = db.prepare("SELECT ev.id, ev.quando, c.telefone, c.nome FROM crm_eventos ev JOIN crm_contatos c ON c.empresa = ev.empresa AND c.chave = ev.chave WHERE ev.empresa = ? AND ev.tipo = 'concluiu' AND ev.quando >= ? ORDER BY ev.quando LIMIT ?")
    .all(e, agora - 3 * DIA, limite) as Array<{ id: string; quando: number; telefone: string; nome: string }>;
  const marca = db.prepare("INSERT OR IGNORE INTO crm_corridas_vistas (empresa, evento_id, em) VALUES (?, ?, ?)");
  for (const ev of eventos) {
    if (Number(marca.run(e, ev.id, agora).changes) === 0) continue;
    const tel = soNumeros(ev.telefone);
    if (tel.length < 10) continue;
    out.corridas++;
    // Pontos
    if (prog.enabled) {
      const antes = pointsBalance(ganhosAbertos(e, tel), agora);
      db.prepare("INSERT INTO crm_pontos_lancamentos (empresa, id, telefone, tipo, pontos, restante, corrida_ref, vence_em, criado_em) VALUES (?, ?, ?, 'earn', ?, ?, ?, ?, ?)")
        .run(e, novoId() + crypto.randomUUID().slice(0, 4), tel, prog.points_per_ride, prog.points_per_ride, ev.id, agora + prog.points_expire_days * DIA, agora);
      out.pontos += prog.points_per_ride;
      if (antes < prog.min_points && antes + prog.points_per_ride >= prog.min_points) await avisarPontos(e, tel, ev.nome, prog);
    }
    // Cartões: só corridas depois de ligar o cartão
    for (const card of cartoes) {
      if (ev.quando < card.activated_at!) continue;
      const pr = db.prepare("SELECT corridas, premiados FROM crm_fid_progresso WHERE empresa = ? AND cartao_id = ? AND telefone = ?").get(e, card.id, tel) as { corridas: number; premiados: number } | undefined;
      const agoraCorridas = (pr?.corridas ?? 0) + 1;
      let premiados = pr?.premiados ?? 0;
      let ultimoCupom: string | null = null, ultimoErro: string | null = null;
      if (cardRewardDue(card.config, agoraCorridas, premiados)) {
        const premio = discountLabel(card.config.reward_type, card.config.reward_value);
        const c = criarCupomDaRecompensa(e, { prefixo: "FIEL", origem: "fidelidade", nome: `Cartão Fidelidade: ${card.config.name}`, telefone: tel, nomePessoa: ev.nome, tipo: card.config.reward_type, valor: card.config.reward_value, dias: 7, agora });
        ultimoCupom = c.codigo; ultimoErro = c.erro;
        if (c.codigo) {
          premiados++; out.cartoes++;
          registrarRecompensa(e, { origem: "fidelidade", telefone: tel, nome: ev.nome, premio: `${card.config.name}: ${premio}`, cupom: c.codigo, em: agora });
          const aviso = `${card.config.title}\n${fillMessage(card.config.message, { cupom: c.codigo, desconto: premio, nome: ev.nome })}`;
          const saiu = await enviarWhats(e, tel, ev.nome, card.config.title, aviso, "premio:fidelidade");
          if (!saiu) await enviarCupom(e, tel, ev.nome, premio, c.codigo, 7, "fidelidade");
        }
      }
      db.prepare(`INSERT INTO crm_fid_progresso (empresa, cartao_id, telefone, corridas, premiados, ultimo_cupom, ultimo_erro, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (empresa, cartao_id, telefone) DO UPDATE SET corridas = excluded.corridas, premiados = excluded.premiados, ultimo_cupom = COALESCE(excluded.ultimo_cupom, ultimo_cupom), ultimo_erro = excluded.ultimo_erro, atualizado_em = excluded.atualizado_em`)
        .run(e, card.id, tel, agoraCorridas, premiados, ultimoCupom, ultimoErro, agora);
    }
  }
  db.prepare("DELETE FROM crm_corridas_vistas WHERE empresa = ? AND em < ?").run(e, agora - 7 * DIA); // a busca olha só 3 dias
  return out;
}

/** Pontos vencidos saem do saldo (ficam no extrato como "vencido"). */
export function vencerPontos(e: string, agora = Date.now()): number {
  const db = bd();
  const velhos = db.prepare("SELECT id, telefone, restante FROM crm_pontos_lancamentos WHERE empresa = ? AND tipo = 'earn' AND restante > 0 AND vence_em < ? LIMIT 500").all(bruto(e), agora) as Array<{ id: string; telefone: string; restante: number }>;
  for (const r of velhos) {
    db.exec("SAVEPOINT vence");
    try {
      db.prepare("UPDATE crm_pontos_lancamentos SET restante = 0 WHERE empresa = ? AND id = ?").run(e, r.id);
      db.prepare("INSERT INTO crm_pontos_lancamentos (empresa, id, telefone, tipo, pontos, restante, criado_em) VALUES (?, ?, ?, 'expire', ?, 0, ?)").run(e, `x${novoId()}${crypto.randomUUID().slice(0, 4)}`, r.telefone, -r.restante, agora);
      db.exec("RELEASE vence");
    } catch (x) { db.exec("ROLLBACK TO vence"); db.exec("RELEASE vence"); throw x; }
  }
  return velhos.length;
}

/** Aviso agendado (dias e hora, janela de 30 min) para quem já tem o mínimo para trocar. Parado por trava geral: tenta de novo na janela. */
export async function avisosAgendadosDePontos(e: string, agora = Date.now()): Promise<number> {
  if (!ligado(e)) return 0;
  const { config: cfg, ultimoSlot } = programaDePontos(e);
  if (!cfg.enabled || !cfg.schedule_enabled) return 0;
  const br = new Date(agora - 3 * 3600_000);
  const dia = br.toISOString().slice(0, 10), hhmm = br.toISOString().slice(11, 16);
  if (!cfg.days.includes(br.getUTCDay())) return 0;
  const min = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const chave = `${dia}#0`;
  if (min(hhmm) < min(cfg.send_time) || min(hhmm) >= min(cfg.send_time) + 30 || (ultimoSlot && ultimoSlot >= chave)) return 0;
  if (travasDoCrm(e, "", { agora })?.geral) return 0; // pausa, horário, teto ou ritmo: não marca, tenta na próxima volta
  bd().prepare("UPDATE crm_pontos_programa SET ultimo_slot = ? WHERE empresa = ?").run(chave, e);
  const por = new Map<string, number>();
  for (const r of ganhosAbertos(e)) if (new Date(r.expires_at).getTime() > agora) por.set(r.telefone, (por.get(r.telefone) ?? 0) + r.remaining);
  let enviados = 0;
  for (const [tel, saldo] of por) {
    if (saldo < cfg.min_points) continue;
    const trava = travasDoCrm(e, tel, { agora });
    if (trava?.geral) break;
    if (trava) continue;
    const nome = (bd().prepare("SELECT nome FROM crm_contatos WHERE empresa = ? AND telefone LIKE ? LIMIT 1").get(e, `%${tel}`) as { nome: string } | undefined)?.nome ?? "";
    await avisarPontos(e, tel, nome, cfg);
    enviados++;
  }
  return enviados;
}

/** Uma volta do trabalhador do CRM para a empresa. Erros de uma parte não derrubam as outras. */
export async function rodarFidelidade(e: string, agora = Date.now()) {
  if (!ligado(e)) return;
  for (const [nome, fn] of [["corridas", () => processarCorridas(e, agora)], ["vencimento", () => vencerPontos(e, agora)], ["avisos", () => avisosAgendadosDePontos(e, agora)]] as const) {
    try { await fn(); } catch (x) { console.error("[crm] fidelidade", nome, e, x instanceof Error ? x.message : x); }
  }
}

// ------------------------------------------------------------------ página do passageiro (sem login)

type Acesso = { telefone: string; viaToken: boolean } | { erro: string; status: number };

function acessoDePontos(e: string, b: { token?: unknown; telefone?: unknown }): Acesso {
  const token = typeof b.token === "string" ? b.token.trim() : "";
  if (token) {
    if (!/^[0-9a-f]{40}$/.test(token)) return { erro: "Link inválido.", status: 404 };
    const r = bd().prepare("SELECT telefone FROM crm_pontos_links WHERE empresa = ? AND token = ?").get(e, token) as { telefone: string } | undefined;
    return r ? { telefone: r.telefone, viaToken: true } : { erro: "Link inválido.", status: 404 };
  }
  const tel = soNumeros(b.telefone);
  if (tel.length < 10 || tel.length > 11) return { erro: "Digite o telefone com DDD.", status: 400 };
  const tem = bd().prepare("SELECT 1 FROM crm_pontos_lancamentos WHERE empresa = ? AND telefone = ? LIMIT 1").get(e, tel);
  return tem ? { telefone: tel, viaToken: false } : { erro: "Ainda não há pontos para esse telefone. Use o mesmo número do aplicativo.", status: 404 };
}

export function pontosInfo(e: string, b: { token?: unknown; telefone?: unknown }, agora = Date.now()): { status: number; corpo: Record<string, unknown> } {
  const a = acessoDePontos(e, b);
  if ("erro" in a) return { status: a.status, corpo: { erro: a.erro } };
  const { config: cfg } = programaDePontos(e);
  const abertos = ganhosAbertos(e, a.telefone).filter((r) => new Date(r.expires_at).getTime() > agora);
  const saldo = pointsBalance(abertos, agora);
  const prox = [...abertos].sort((x, y) => x.expires_at.localeCompare(y.expires_at))[0];
  const hist = a.viaToken ? (bd().prepare("SELECT tipo AS kind, pontos AS points, criado_em AS created_at, cupom AS coupon_code, retirada AS pickup_code, premio FROM crm_pontos_lancamentos WHERE empresa = ? AND telefone = ? ORDER BY criado_em DESC, rowid DESC LIMIT 20").all(e, a.telefone) as Array<Record<string, unknown>>).map((h) => ({ ...h, prize: h.premio ? JSON.parse(String(h.premio)) : null, premio: undefined })) : [];
  return {
    status: 200,
    corpo: {
      company: D.empresa(e)?.nome ?? "", enabled: cfg.enabled, balance: saldo, min_points: cfg.min_points, point_value: cfg.point_value, money_value: pointsToMoney(saldo, cfg.point_value),
      next_expiry: prox ? { points: prox.remaining, at: prox.expires_at } : null,
      // Pelo telefone digitado (sem o link do aviso) só o saldo: troca e extrato (com códigos de retirada) só pelo link
      prizes: cfg.prizes.map((p, i) => ({ index: i, name: p.name, points: p.points, type: p.type, value: p.value, needs_link: !a.viaToken })),
      redeem_needs_link: !a.viaToken, history: hist, whatsapp: cfg.whatsapp || null,
    },
  };
}

export async function pontosTrocar(e: string, b: { token?: unknown; telefone?: unknown; prize?: unknown; points?: unknown }, agora = Date.now()): Promise<{ status: number; corpo: Record<string, unknown> }> {
  const a = acessoDePontos(e, b);
  if ("erro" in a) return { status: a.status, corpo: { erro: a.erro } };
  const { config: cfg } = programaDePontos(e);
  if (!cfg.enabled) return { status: 403, corpo: { erro: "O programa de pontos está desligado." } };
  const indice = b.prize === "money" ? -1 : Number(b.prize);
  const premio = indice >= 0 ? cfg.prizes[indice] : null;
  if (indice >= 0 && !premio) return { status: 400, corpo: { erro: "Prêmio não encontrado." } };
  // Troca só pelo link identificado (vai no aviso): pelo telefone digitado qualquer um gastaria os pontos de outra pessoa
  if (!a.viaToken) return { status: 403, corpo: { erro: "Para trocar seus pontos, abra o link do aviso." } };
  // Tudo síncrono (sem await entre ler o saldo e debitar): duas trocas ao mesmo tempo não usam o mesmo ponto.
  // O cupom é criado antes do débito: se não der para criar, nenhum ponto sai ("Seus pontos continuam com você").
  const db = bd();
  const linhas = ganhosAbertos(e, a.telefone);
  const saldo = pointsBalance(linhas, agora);
  const custo = premio ? premio.points : Math.max(cfg.min_points, Math.floor(Number(b.points) || saldo));
  if (custo < cfg.min_points && !premio) return { status: 400, corpo: { erro: `Junte pelo menos ${cfg.min_points} pontos para trocar.` } };
  const tirar = consumePoints(linhas, custo, agora);
  if (!tirar) return { status: 400, corpo: { erro: "Pontos insuficientes." } };
  let cupom: string | null = null, retirada: string | null = null;
  const nome = (db.prepare("SELECT nome FROM crm_contatos WHERE empresa = ? AND telefone LIKE ? LIMIT 1").get(e, `%${a.telefone}`) as { nome: string } | undefined)?.nome ?? "";
  const valor = premio ? premio.value : pointsToMoney(custo, cfg.point_value);
  if (!premio || premio.type !== "pickup") {
    const tipo = premio ? (premio.type === "percent" ? "percent" : "fixed") : "fixed";
    const c = criarCupomDaRecompensa(e, { prefixo: "PONTOS", origem: "pontos", nome: "Pontos de Troca", telefone: a.telefone, nomePessoa: nome, tipo, valor, dias: cfg.coupon_valid_days, agora });
    if (!c.codigo) return { status: 502, corpo: { erro: `Não foi possível gerar o cupom agora (${c.erro}). Seus pontos continuam com você.` } };
    cupom = c.codigo;
  } else retirada = pickupCode();
  const rotulo = premio ? premio.name : `R$ ${pointsToMoney(custo, cfg.point_value).toFixed(2).replace(".", ",")} de desconto`;
  transacao(() => {
    for (const t of tirar) db.prepare("UPDATE crm_pontos_lancamentos SET restante = restante - ? WHERE empresa = ? AND id = ?").run(t.take, e, t.id);
    db.prepare("INSERT INTO crm_pontos_lancamentos (empresa, id, telefone, tipo, pontos, restante, premio, cupom, retirada, criado_em) VALUES (?, ?, ?, 'redeem', ?, 0, ?, ?, ?, ?)")
      .run(e, `r${novoId()}${crypto.randomUUID().slice(0, 4)}`, a.telefone, -custo, JSON.stringify(premio ? { name: premio.name, type: premio.type, value: premio.value } : { name: rotulo, type: "fixed" }), cupom, retirada, agora);
    registrarRecompensa(e, { origem: "pontos", telefone: a.telefone, nome, premio: rotulo, cupom: cupom ?? null, em: agora });
  });
  {
    if (cupom) void enviarCupom(e, a.telefone, nome, premio ? premio.name : `R$ ${valor.toFixed(2).replace(".", ",")} de desconto`, cupom, cfg.coupon_valid_days, "pontos");
    const zap = cfg.whatsapp.length <= 11 ? `55${cfg.whatsapp}` : cfg.whatsapp;
    return {
      status: 200,
      corpo: { ok: true, coupon: cupom, pickup: retirada, balance: saldo - custo, whatsapp_link: retirada && cfg.whatsapp ? `https://wa.me/${zap}?text=${encodeURIComponent(`Olá! Quero retirar meu prêmio "${premio?.name}". Código: ${retirada}`)}` : null },
    };
  }
}
