// Cartão Fidelidade e Pontos de Troca (CRM › Recompensas) e o gancho dos prêmios do totem. Nada sai para a internet.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

process.env.DADOS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "crm-fid-"));
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "f".repeat(40);
delete process.env.PUBLICO_URL;

const express = (await import("express")).default;
const D = await import("../src/servidor/dados.ts");
const { criarCookie, exigirLogin } = await import("../src/servidor/sessao.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { listar } = await import("../src/cadastros/armazem.ts");
const R = await import("../src/crm2/fidelidade-regras.ts");
const F = await import("../src/crm2/fidelidade.ts");
const PR = await import("../src/totem/premios.ts");
const { bd } = await import("../src/crm2/base.ts");
const { rotasTotem } = await import("../src/totem/rotas.ts");
await import("../src/crm/ganchos-crm2.ts");
const { caixaSimulada } = await import("../src/bot/provedores.ts");
const { definirRecursos } = await import("../src/superadmin/recursos.ts");

const DIA = 86_400_000;

// ------------------------------------------------------------------ regras puras (as mesmas do sistema de referência)

test("cartão: uma vez na vida e a cada N corridas", () => {
  const uma = { rides_needed: 10, once: true };
  assert.equal(R.cardRewardDue(uma, 9, 0), false);
  assert.equal(R.cardRewardDue(uma, 10, 0), true);
  assert.equal(R.cardRewardDue(uma, 11, 0), true);
  assert.equal(R.cardRewardDue(uma, 20, 1), false);
  const rep = { rides_needed: 10, once: false };
  assert.equal(R.cardRewardDue(rep, 10, 0), true);
  assert.equal(R.cardRewardDue(rep, 15, 1), false);
  assert.equal(R.cardRewardDue(rep, 20, 1), true);
  const c = R.normalizeCard({ rides_needed: "0", reward_type: "fixed", reward_value: 9999, once: false, title: "x".repeat(60) });
  assert.equal(c.rides_needed, 1);
  assert.equal(c.reward_value, 500);
  assert.equal(c.title.length, 40);
  assert.equal(R.normalizeCard({}).active, false);
  assert.equal(R.fillMessage("Oi {nome}, cupom {cupom} de {desconto}", { cupom: "ABC", desconto: "5%", nome: "Maria Silva" }), "Oi Maria, cupom ABC de 5%");
  assert.equal(R.discountLabel("fixed", 5), "R$ 5,00");
});

test("pontos: saldo, vencimento, troca pelos que vencem primeiro, normalização", () => {
  const agora = Date.parse("2026-10-07T12:00:00Z");
  const linhas = [
    { id: "a", remaining: 3, expires_at: "2026-11-01T00:00:00Z" },
    { id: "b", remaining: 5, expires_at: "2026-10-20T00:00:00Z" },
    { id: "c", remaining: 4, expires_at: "2026-10-01T00:00:00Z" },
  ];
  assert.equal(R.pointsBalance(linhas, agora), 8);
  assert.deepEqual(R.consumePoints(linhas, 6, agora), [{ id: "b", take: 5 }, { id: "a", take: 1 }]);
  assert.equal(R.consumePoints(linhas, 9, agora), null);
  assert.equal(R.pointsToMoney(10, 0.5), 5);
  const p = R.normalizePointsConfig({ point_value: "0.505", min_points: 0, whatsapp: "(16) 99999-0000", prizes: [{ name: "Lanche", points: 30 }, { name: "Cupom", points: 20, type: "fixed", value: 5 }] });
  assert.equal(p.point_value, 0.51);
  assert.equal(p.min_points, 1);
  assert.equal(p.whatsapp, "16999990000");
  assert.equal(p.prizes[0].type, "pickup");
  assert.match(R.pickupCode(), /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal("area_id" in p, false);
});

// ------------------------------------------------------------------ banco

const BASE = "https://painel.exemplo.test";
const emp = D.criarEmpresa("Fid Norte").id;
let n = 0;
/** Passageiro na base do CRM e uma corrida concluída (o que a sincronização das corridas grava). */
function corrida(e: string, tel: string, nome: string, quando: number) {
  const chave = `p:${tel}`;
  bd().prepare("INSERT OR IGNORE INTO crm_contatos (empresa, chave, telefone, nome, criado_em, atualizado_em) VALUES (?, ?, ?, ?, 1, 1)").run(e, chave, `55${tel}`, nome);
  n++;
  bd().prepare("INSERT INTO crm_eventos (empresa, id, chave, tipo, quando, dados) VALUES (?, ?, ?, 'concluiu', ?, '{}')").run(e, `ev${n}`, chave, quando);
}

test("cartão: só conta corrida depois de ligar, premia no marco com cupom do cadastro e aviso, uma vez na vida", async () => {
  PR.guardarBase(emp, BASE);
  const agora = Date.now();
  corrida(emp, "11988887777", "Maria Souza", agora - 2 * 3600_000); // antes de ligar: não conta
  const id = F.salvarCartao(emp, null, { name: "Três corridas", rides_needed: 3, reward_type: "percent", reward_value: 10, once: true, active: true, message: "Seu cupom: {cupom}" }, agora - 3600_000);
  assert.equal(F.listarCartoes(emp)[0].config.active, true);
  corrida(emp, "11988887777", "Maria Souza", agora - 1800_000);
  corrida(emp, "11988887777", "Maria Souza", agora - 1700_000);
  let r = await F.processarCorridas(emp, agora);
  assert.deepEqual({ corridas: r.corridas, cartoes: r.cartoes }, { corridas: 3, cartoes: 0 }); // a 1ª (antes de ligar) é vista mas não conta no cartão
  assert.equal(F.listarCartoes(emp)[0].members, 1);
  corrida(emp, "11988887777", "Maria Souza", agora - 1600_000);
  r = await F.processarCorridas(emp, agora);
  assert.equal(r.corridas, 1);
  assert.equal(r.cartoes, 1, "3ª corrida contada fecha o marco");
  const cupom = listar(emp, cadastroPorId("cupons")!).find((c) => String(c.codigo).startsWith("FIEL"))!;
  assert.equal(cupom.tipoDesconto, "Percentual");
  assert.equal(cupom.valor, 10);
  assert.equal(cupom.limiteUsos, 1);
  assert.equal(cupom.clienteTelefone, "11988887777");
  assert.ok(caixaSimulada(emp).some((m) => m.telefone === "11988887777" && m.texto.includes(String(cupom.codigo))), "aviso com o cupom pelo WhatsApp");
  assert.equal(F.listarCartoes(emp)[0].delivered, 1);
  // Rodar de novo não conta a mesma corrida duas vezes nem premia outra vez
  r = await F.processarCorridas(emp, agora);
  assert.equal(r.corridas, 0);
  corrida(emp, "11988887777", "Maria Souza", agora - 1500_000);
  assert.equal((await F.processarCorridas(emp, agora)).cartoes, 0, "uma vez na vida");
  assert.equal(F.listarRecompensas(emp).filter((g) => g.origem === "fidelidade").length, 1, "entra na aba Recompensas");
  // Desligar e ligar de novo recomeça a contagem a partir do novo momento; excluir apaga o progresso
  F.excluirCartao(emp, id);
  assert.equal(F.listarCartoes(emp).length, 0);
});

test("recurso desligado: nem pontos nem cartões contam", async () => {
  const e = D.criarEmpresa("Fid Off").id;
  F.salvarPontos(e, { enabled: true });
  corrida(e, "11977776666", "João", Date.now() - 1000);
  definirRecursos(e, ["crm"]);
  assert.deepEqual(await F.processarCorridas(e), { corridas: 0, pontos: 0, cartoes: 0 });
  definirRecursos(e, []);
  assert.equal((await F.processarCorridas(e)).pontos, 1);
});

test("pontos: ganha por corrida, avisa ao juntar o mínimo, vence, e troca só pelo link do aviso", async () => {
  const e = D.criarEmpresa("Fid Pontos").id;
  PR.guardarBase(e, BASE);
  const agora = Date.now();
  F.salvarPontos(e, { enabled: true, points_per_ride: 5, point_value: 0.5, min_points: 10, points_expire_days: 30, coupon_valid_days: 3, prizes: [{ name: "Lanche", points: 10, type: "pickup" }, { name: "R$ 3 OFF", points: 10, type: "fixed", value: 3 }], whatsapp: "16999990000" });
  corrida(e, "11955554444", "Ana Lima", agora - 5000);
  let r = await F.processarCorridas(e, agora);
  assert.equal(r.pontos, 5);
  assert.equal(caixaSimulada(e).length, 0, "ainda abaixo do mínimo: sem aviso");
  corrida(e, "11955554444", "Ana Lima", agora - 4000);
  r = await F.processarCorridas(e, agora);
  assert.equal(F.saldoDe(e, "11955554444", agora), 10);
  const aviso = caixaSimulada(e).find((m) => m.telefone === "11955554444")!;
  assert.ok(aviso, "juntou o mínimo: aviso pelo WhatsApp");
  const token = new RegExp(`${BASE}/pontos/${e}/([0-9a-f]{40})`).exec(aviso.texto)![1];

  // Pelo telefone: só o saldo, sem troca e sem histórico
  const porTel = F.pontosInfo(e, { telefone: "(11) 95555-4444" }, agora);
  assert.equal(porTel.status, 200);
  assert.equal(porTel.corpo.balance, 10);
  assert.equal(porTel.corpo.redeem_needs_link, true);
  assert.deepEqual(porTel.corpo.history, []);
  assert.equal((await F.pontosTrocar(e, { telefone: "11955554444", prize: "money" }, agora)).status, 403);
  assert.equal(F.pontosInfo(e, { telefone: "11900000000" }, agora).status, 404);
  assert.equal(F.pontosInfo(e, { token: "x" }, agora).status, 404);

  // Pelo link: troca por cupom (prêmio 1), pontos saem, cupom no cadastro e na caixa do WhatsApp
  const t = await F.pontosTrocar(e, { token, prize: 1 }, agora);
  assert.equal(t.status, 200, JSON.stringify(t.corpo));
  const codigo = String(t.corpo.coupon);
  assert.match(codigo, /^PONTOS/);
  assert.equal(t.corpo.balance, 0);
  const cupom = listar(e, cadastroPorId("cupons")!).find((c) => c.codigo === codigo)!;
  assert.equal(cupom.tipoDesconto, "Valor fixo");
  assert.equal(cupom.valor, 3);
  assert.equal(cupom.clienteTelefone, "11955554444");
  assert.equal((await F.pontosTrocar(e, { token, prize: 1 }, agora)).status, 400, "sem saldo");
  assert.equal(F.listarRecompensas(e).filter((g) => g.origem === "pontos").length, 1);

  // Brinde para retirar: código de retirada, link do WhatsApp e "marcar entregue"
  corrida(e, "11955554444", "Ana Lima", agora - 3000);
  corrida(e, "11955554444", "Ana Lima", agora - 2000);
  await F.processarCorridas(e, agora);
  const b = await F.pontosTrocar(e, { token, prize: 0 }, agora);
  assert.match(String(b.corpo.pickup), /^[A-HJ-NP-Z2-9]{6}$/);
  assert.match(String(b.corpo.whatsapp_link), /^https:\/\/wa\.me\/5516999990000\?text=/);
  const resumo = F.resumoDePontos(e, agora);
  assert.equal(resumo.pickups.length, 1);
  assert.equal(resumo.stats.redeemed, 20);
  F.marcarRetiradaEntregue(e, resumo.pickups[0].id);
  assert.ok(F.resumoDePontos(e, agora).pickups[0].pickup_done_at);
  const hist = F.pontosInfo(e, { token }, agora).corpo.history as Array<{ kind: string }>;
  assert.ok(hist.some((h) => h.kind === "redeem") && hist.some((h) => h.kind === "earn"));

  // Vencimento: depois da validade o saldo zera e o extrato guarda "expire"
  corrida(e, "11955554444", "Ana Lima", agora - 1000);
  await F.processarCorridas(e, agora);
  assert.equal(F.saldoDe(e, "11955554444", agora), 5);
  assert.equal(F.vencerPontos(e, agora + 40 * DIA), 1);
  assert.equal(F.saldoDe(e, "11955554444", agora + 40 * DIA), 0);
});

test("aviso agendado de pontos: no dia e hora, só para quem tem o mínimo, uma vez; pausa do CRM segura", async () => {
  const e = D.criarEmpresa("Fid Agenda").id;
  PR.guardarBase(e, BASE);
  const quando = (hhmm: string) => Date.parse(`2026-11-10T${hhmm}:00-03:00`); // terça
  F.salvarPontos(e, { enabled: true, points_per_ride: 5, min_points: 10, schedule_enabled: true, days: [2], send_time: "10:00" });
  const agora = Date.now();
  corrida(e, "11944443333", "Rica", agora - 3000);
  corrida(e, "11944443333", "Rica", agora - 2000);
  corrida(e, "11933332222", "Pobre", agora - 1000);
  await F.processarCorridas(e, agora);
  caixaSimulada(e).length = 0;
  const { definirPausaGeral } = await import("../src/crm/limites.ts");
  definirPausaGeral(e, true, "teste");
  assert.equal(await F.avisosAgendadosDePontos(e, quando("10:05")), 0);
  definirPausaGeral(e, false, "teste");
  assert.equal(await F.avisosAgendadosDePontos(e, quando("09:40")), 0, "antes da hora");
  assert.equal(await F.avisosAgendadosDePontos(e, quando("10:05")), 1);
  assert.deepEqual(caixaSimulada(e).map((m) => m.telefone), ["11944443333"]);
  assert.equal(await F.avisosAgendadosDePontos(e, quando("10:20")), 0, "uma vez por dia");
});

test("gancho: prêmio ganho na roleta entra em Recompensas; quem não ganhou nada não entra", async () => {
  const e = D.criarEmpresa("Fid Gancho").id;
  const { criar } = await import("../src/cadastros/armazem.ts");
  criar(e, cadastroPorId("clientes")!, { nome: "Bia Costa", telefone: "11922221111", status: "Ativo" }, "t");
  PR.salvarConfigDoJogo(e, "roleta", { ...(await import("../src/totem/premios-jogos.ts")).configPadrao("roleta"), invites_enabled: true, prizes: [{ label: "20% OFF", type: "percent", value: 20, chance: 100 }] }, BASE);
  const { convite } = PR.convidar(e, "roleta", "11922221111", "Bia Costa", "manual");
  const j = await PR.jogar(e, convite.token, BASE);
  assert.equal(j.status, 200);
  const ganhos = F.listarRecompensas(e);
  assert.equal(ganhos.length, 1);
  assert.equal(ganhos[0].origem, "roleta");
  assert.equal(ganhos[0].premio, "20% OFF");
  assert.match(String(ganhos[0].cupom), /^ROLETA/);
  assert.equal(F.resumoRecompensas(e).por.roleta, 1);
  // Roleta sem prêmio de verdade
  PR.salvarConfigDoJogo(e, "raspadinha", { prizes: [{ label: "Nada", type: "none", chance: 0 }], invites_enabled: true });
  const c2 = PR.convidar(e, "raspadinha", "11922221111", "Bia Costa", "manual").convite;
  await PR.jogar(e, c2.token, BASE);
  assert.equal(F.listarRecompensas(e).length, 1);
});

// ------------------------------------------------------------------ rotas

const app = express();
app.use(express.json());
app.post("/teste/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({ ok: true }); });
app.use("/api/totem", rotasTotem);
app.use("/api", exigirLogin);
const servidor = app.listen(0);
const url = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api`;
test.after(() => servidor.close());

test("rotas: admin gerencia cartão e pontos; página pública só responde com link ou telefone certo", async () => {
  const e = D.criarEmpresa("Fid Rotas").id;
  const admin = D.criarUsuario({ email: "a@fid.test", nome: "Ana", senha: "senha-forte-1", empresaId: e, papel: "admin" });
  const oper = D.criarUsuario({ email: "o@fid.test", nome: "Otávio", senha: "senha-forte-2", empresaId: e, papel: "operador" });
  const cookie = async (id: string) => ((await fetch(`${url.replace("/api", "")}/teste/entrar/${id}`, { method: "POST" })).headers.get("set-cookie") ?? "").split(";")[0];
  const pedir = async (caminho: string, o: { metodo?: string; corpo?: unknown; cookie?: string } = {}) => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (o.cookie) h.cookie = o.cookie;
    const r = await fetch(`${url}${caminho}`, { method: o.metodo ?? (o.corpo ? "POST" : "GET"), headers: h, body: o.corpo ? JSON.stringify(o.corpo) : undefined });
    const t = await r.text();
    return { status: r.status, corpo: JSON.parse(t || "{}"), texto: t };
  };
  const ca = await cookie(admin.id), co = await cookie(oper.id);
  assert.equal((await pedir("/totem/fidelidade", { cookie: co })).status, 403);
  assert.equal((await pedir("/totem/fidelidade")).status, 401);
  const g0 = await pedir("/totem/fidelidade", { cookie: ca });
  assert.equal(g0.status, 200, g0.texto);
  assert.equal(g0.corpo.modelos.length, 3);
  assert.deepEqual(g0.corpo.cartoes, []);
  const s = await pedir("/totem/fidelidade/cartoes", { metodo: "PUT", corpo: { id: null, config: { name: "Dez corridas", rides_needed: 10, reward_value: 5, active: true } }, cookie: ca });
  assert.equal(s.status, 200, s.texto);
  const g1 = await pedir("/totem/fidelidade", { cookie: ca });
  assert.equal(g1.corpo.cartoes[0].config.name, "Dez corridas");
  assert.equal(g1.corpo.cartoes[0].config.active, true);
  assert.equal((await pedir(`/totem/fidelidade/cartoes/${s.corpo.id}`, { metodo: "DELETE", cookie: ca })).status, 200);
  const p = await pedir("/totem/fidelidade/pontos", { metodo: "PUT", corpo: { config: { enabled: true, min_points: 3 } }, cookie: ca });
  assert.equal(p.corpo.config.enabled, true);
  assert.equal((await pedir("/totem/fidelidade/pontos/retirada/nao-existe", { metodo: "POST", corpo: {}, cookie: ca })).status, 400);
  // Página pública (sem login): sem pontos para o telefone => 404; link inventado => 404; empresa que não existe => 404
  assert.equal((await pedir(`/totem/pontos/publico/${e}/info`, { corpo: { telefone: "11999990000" } })).status, 404);
  assert.equal((await pedir(`/totem/pontos/publico/${e}/info`, { corpo: { token: "a".repeat(40) } })).status, 404);
  assert.equal((await pedir("/totem/pontos/publico/nao-existe/info", { corpo: { telefone: "11999990000" } })).status, 404);
  assert.equal((await pedir(`/totem/pontos/publico/${e}/trocar`, { corpo: { telefone: "11999990000", prize: "money" } })).status, 404);
  // Aba Recompensas do CRM traz os prêmios ganhos
  F.registrarRecompensa(e, { origem: "pontos", telefone: "11999990000", nome: "X", premio: "R$ 3 OFF", cupom: "PONTOSAAAAAA" });
  assert.equal(F.listarRecompensas(e)[0].premio, "R$ 3 OFF");
});
