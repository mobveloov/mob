// Testes do CRM comportamental, do gatilho "Simulou" e do lote da régua. Nada sai para a internet.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-crm-comp-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "y".repeat(40);

const D = await import("../src/servidor/dados.ts");
const { banco } = await import("../src/servidor/banco.ts");
const C = await import("../src/crm/comportamento.ts");
const P = await import("../src/crm/comportamento-puro.ts");
const G = await import("../src/crm/gatilhos.ts");
const R = await import("../src/crm/regua.ts");
const W = await import("../src/crm/whatsapp.ts");
const A = await import("../src/crm/armazem.ts");
const T = await import("../src/crm/templates.ts");
const L = await import("../src/crm/limites.ts");
const { listarEnvios } = await import("../src/crm/registro.ts");

const br = (h: number, dow = 2) => new Date(Date.UTC(2026, 10, 8 + dow, h, 0)); // 08/11/2026 é domingo: dow = dia da semana

test("preferência: precisa de 2 pedidos, hora mais comum e até 3 dias com 20%+", () => {
  assert.equal(C.preferenciaDe([br(8)]), null);
  const p = C.preferenciaDe([br(8, 1), br(8, 1), br(9, 3), br(8, 3), br(20, 5), br(8, 1)])!;
  assert.equal(p.hora, 8);
  assert.deepEqual(p.dias, [1, 3]);
  assert.equal(p.amostras, 6);
  // Empate de hora: a menor
  assert.equal(C.preferenciaDe([br(10), br(7)])!.hora, 7);
});

test("regras puras: faixa que cruza a meia-noite, antecedência e taxa de cancelamento", () => {
  assert.equal(P.hourInRange(23, 22, 3), true);
  assert.equal(P.hourInRange(2, 22, 3), true);
  assert.equal(P.hourInRange(12, 22, 3), false);
  const t = { lead_minutes: 30, weekdays: [2], hour_start: 8, hour_end: 8 };
  // terça 07:45 em Brasília + 30 min = 08:15
  assert.equal(P.phaseOneTarget(Date.parse("2026-11-10T10:45:00Z"), t).ok, true);
  assert.equal(P.phaseOneTarget(Date.parse("2026-11-10T11:10:00Z"), t).ok, false, "depois dos primeiros 30 min da hora-alvo não dispara");
  assert.equal(P.phaseOneTarget(Date.parse("2026-11-11T10:45:00Z"), t).ok, false, "quarta não está nos dias");
  assert.equal(P.cancelRate(7, 3), 30);
});

function gente(e: string, n: number, extra: Record<string, unknown> = {}) {
  banco().prepare("INSERT INTO crm_comportamento (empresa, chave, telefone, nome, hora, dias, amostras, corridas, canceladas, gasto, ultima, estagio, atualizado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(e, `p:1191111${1000 + n}`, `1191111${1000 + n}`, `Pessoa ${n}`, 8, "[2]", 5, 5, 0, 100, Date.parse("2026-11-01T12:00:00Z"), "ativo", Date.now());
  void extra;
}

test("motor: pré-janela uma vez por dia, 2ª mensagem só para quem não pediu, e o histórico", async () => {
  const e = D.criarEmpresa("Comp Um").id;
  W.limparCaixaSimulada(e);
  const t = C.salvarComportamental(e, null, C.sanearComportamental({ name: "Manhã", title: "Oi", body: "{{nome}}, seu horário chegou.", hour_start: 7, hour_end: 9, weekdays: [2], lead_minutes: 30, min_rides: 2, second_after_minutes: 20, second_body: "Ainda dá tempo, {{nome}}." }), { is_active: true });
  gente(e, 1); gente(e, 2);
  const agora = Date.parse("2026-11-10T10:45:00Z"); // terça 07:45 em Brasília
  const r = await C.rodarComportamento(e, agora);
  assert.equal(r.sent, 2);
  assert.match(W.caixaSimulada(e)[0].texto, /^Pessoa \d, seu horário chegou\.$|^Pessoa/);
  // Repetir na mesma hora não manda de novo
  assert.equal((await C.rodarComportamento(e, agora + 60_000)).sent, 0);
  assert.equal(W.caixaSimulada(e).length, 2);
  // A pessoa 2 pediu corrida depois da 1ª mensagem: a 2ª não sai para ela
  banco().prepare("UPDATE crm_comportamento SET ultima = ? WHERE empresa = ? AND chave = 'p:11911111002'").run(agora + 5 * 60_000, e);
  const r2 = await C.rodarComportamento(e, agora + 21 * 60_000);
  assert.equal(r2.second, 1);
  assert.equal(r2.skipped, 1);
  assert.equal(W.caixaSimulada(e).length, 3);
  assert.match(W.caixaSimulada(e)[0].texto, /Ainda dá tempo/);
  const h = C.historicoComportamental(e, { de: 0 });
  assert.equal(h.total, 4);
  assert.equal(h.stats.by_phase.pre_janela, 2);
  assert.equal(h.stats.by_status.sent, 3);
  assert.equal(h.stats.by_status.skipped, 1);
  assert.equal(C.templateComportamental(e, t.id)!.sent_count, 2);
  assert.equal(listarEnvios(e, { origem: "behavior" }).total, 3);
});

test("motor: filtros (mín. de corridas, dia preferido) e pausa geral solta a trava", async () => {
  const e = D.criarEmpresa("Comp Dois").id;
  W.limparCaixaSimulada(e);
  C.salvarComportamental(e, null, C.sanearComportamental({ name: "Só quem tem 10", body: "Oi {{nome}}", weekdays: [2], lead_minutes: 30, min_rides: 10 }), { is_active: true });
  gente(e, 1);
  const agora = Date.parse("2026-11-10T10:45:00Z");
  assert.equal((await C.rodarComportamento(e, agora)).sent, 0, "só 5 corridas");
  C.salvarComportamental(e, C.templatesComportamentais(e)[0].id, C.sanearComportamental({ name: "Todos", body: "Oi {{nome}}", weekdays: [2], lead_minutes: 30, min_rides: 1 }));
  L.definirPausaGeral(e, true, "t");
  assert.equal((await C.rodarComportamento(e, agora)).sent, 0);
  assert.equal(banco().prepare("SELECT COUNT(*) AS n FROM crm_comport_disparos WHERE empresa = ?").get(e)!.n, 0, "trava solta: nada ficou gravado");
  L.definirPausaGeral(e, false, "t");
  assert.equal((await C.rodarComportamento(e, agora)).sent, 1);
  assert.deepEqual(L.historicoDePausas(e).map((p) => p.acao), ["continuou", "pausou"]);
});

test("validação do template e modelos prontos", () => {
  assert.throws(() => C.sanearComportamental({ name: "", body: "x", weekdays: [1] }), /nome/);
  assert.throws(() => C.sanearComportamental({ name: "a", body: "", weekdays: [1] }), /mensagem/);
  assert.throws(() => C.sanearComportamental({ name: "a", body: "x", weekdays: [] }), /ao menos um dia/);
  assert.throws(() => C.sanearComportamental({ name: "a", body: "x", weekdays: [1], second_after_minutes: 10 }), /2ª mensagem/);
  assert.throws(() => C.sanearComportamental({ name: "a", body: "x", title: "t".repeat(41), weekdays: [1] }), /40 caracteres/);
  const e = D.criarEmpresa("Comp Tres").id;
  assert.equal(C.instalarComportamentais(e, ["coruja", "madrugador", "nao-existe"]), 2);
  assert.equal(C.instalarComportamentais(e, ["coruja"]), 0);
  assert.ok(C.templatesComportamentais(e).every((t) => !t.is_active && t.channel === "whatsapp"));
});

test("Simulou: cada estimativa dispara; 'simulou e pediu' lê o banco; várias estimativas não empilham", async () => {
  const e = D.criarEmpresa("Comp Quatro").id;
  const mk = (tipo: string, config: Record<string, unknown>, conteudo: string) => {
    const tpl = T.salvarTemplate(e, null, { name: tipo, category: "custom", title: null, content: conteudo, variables: [], is_active: true, image_url: null, button_text: null, button_link: null, variant_b_content: null, ab_split_ratio: 0, wa_optout_footer: false });
    return G.salvarGatilho(e, null, { name: tipo, template_id: tpl.id, trigger_type: tipo, trigger_config: config, send_channel: "whatsapp", is_active: true });
  };
  mk("simulated", {}, "Vimos sua simulação, {{nome}} ({{valor}}).");
  mk("simulated_and_requested", {}, "Pedido recebido, {{nome}}.");
  mk("simulated_no_request", { delay_seconds: 600 }, "Falta confirmar, {{nome}}.");
  W.limparCaixaSimulada(e);
  const t0 = Date.now();
  await G.tratarEvento({ empresaId: e, tipo: "simulated", telefone: "11955550001", nome: "Rita", em: t0, vars: { valor: "20,00" } });
  await G.tratarEvento({ empresaId: e, tipo: "simulated_no_request", telefone: "11955550001", nome: "Rita", em: t0 });
  await G.tratarEvento({ empresaId: e, tipo: "simulated_no_request", telefone: "11955550001", nome: "Rita", em: t0 + 1000 });
  assert.match(W.caixaSimulada(e)[0].texto, /Vimos sua simulação, Rita \(20,00\)\./);
  assert.equal(G.estatisticasFila(e).pending, 1, "a segunda estimativa não cria outro envio na fila");
  // Pediu 20 min depois: simulou há menos de 1 hora, então dispara "simulou e pediu" (lendo o banco)
  const r = await G.tratarEvento({ empresaId: e, tipo: "ride_requested", telefone: "11955550001", nome: "Rita", em: t0 + 20 * 60_000 });
  assert.equal(r.disparados, 1);
  assert.match(W.caixaSimulada(e)[0].texto, /Pedido recebido, Rita\./);
  // Quem não simulou antes não dispara
  assert.equal((await G.tratarEvento({ empresaId: e, tipo: "ride_requested", telefone: "11955550002", nome: "Sem", em: t0 })).disparados, 0);
  // Simulou há mais de 1 hora: não conta
  assert.equal((await G.tratarEvento({ empresaId: e, tipo: "ride_requested", telefone: "11955550001", nome: "Rita", em: t0 + 2 * 3600_000 })).disparados, 0);
});

test("régua: o lote do WhatsApp de verdade é de no máximo 10 e depois vem a pausa", async () => {
  const e = D.criarEmpresa("Comp Cinco").id;
  // Estado de lote: 9 enviadas; a próxima fecha o lote e abre a pausa
  A.salvarRitmo(e, { loteContagem: 9, pausaAte: 0, ultimoEnvio: 0, ultimos: [] });
  const base = A.config(e);
  A.salvarConfig(e, { ...base, lote: 50, pausaMinMin: 5, pausaMaxMin: 10 });
  const { reservar } = await import("../src/crm/ritmo.ts");
  const cfg = { ...A.config(e), lote: Math.min(A.config(e).lote, 10), limitePorMinuto: Math.min(A.config(e).limitePorMinuto, 3) };
  const r = reservar(cfg, A.ritmo(e), Date.now(), () => 0);
  assert.equal(r.ok, true);
  if (r.ok) assert.ok(r.estado.pausaAte > Date.now() + 4 * 60_000, "lote de 10 fechou: pausa de 5 a 10 min");
  // Com o provedor simulado a régua não usa lote (não manda nada para fora)
  assert.equal((await R.numerosDaEmpresa(e)).find((n) => n.tipo === "crm")!.real, false);
});
