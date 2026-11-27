// Conferência com a API pública v2 da Machine (docs/CONFERENCIA_MACHINE.md): status e fases, motivos de cancelamento, quem cancelou,
// reabertura (will_reopen), pendência, ocorrências (sem aceite, atraso, nota baixa, taxa, tarifa), formas de pagamento,
// detalhe da corrida e webhooks de saída (assinatura, deduplicação, limite de 5, reenvio).
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "conferencia-machine-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "t".repeat(40);
process.env.OSRM_PUBLICO = "0";
process.env.NOMINATIM_PUBLICO = "0";
delete process.env.BANCO_ARQUIVO;

const D = await import("../src/servidor/dados.ts");
const B = await import("../src/servidor/banco.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar } = await import("../src/cadastros/armazem.ts");
const C = await import("../src/corridas/index.ts");
const P = await import("../src/apps/despacho.ts");
const M = await import("../src/comum/machine.ts");
const W = await import("../src/integracoes/webhooks.ts");
const { rotasWebhooks } = await import("../src/integracoes/rotas.ts");
const { eventosDaCorrida } = await import("../src/corridas/registro.ts");
const { central } = await import("../src/config/central-notificacoes.ts");
const { salvarCategoria } = await import("../src/config/categorias.ts");
const { salvarDespacho } = await import("../src/config/despacho.ts");
const { agoraBr } = await import("../src/servidor/util.ts");
const express = (await import("express")).default;

test.after(() => { W.definirEnvio(); B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

const EMB = { texto: "Rua das Flores, 100", lat: -23.55, lng: -46.63 }, DEST = { texto: "Av. Central, 2000", lat: -23.6, lng: -46.66 };
let seq = 0;
function cenario(cat: Record<string, unknown> = {}) {
  const n = ++seq;
  const E = D.criarEmpresa(`Machine ${n}`).id;
  salvarCategoria(E, null, { nome: "Econômico", taxaBase: 5, precoKm: 2, tarifaMinima: 9.9, ...cat }, "teste");
  salvarDespacho(E, { raioMetros: 20000, metodo: "primeiro_aceitar" });
  const mot = criar(E, cadastroPorId("motoristas")!, { nome: "Motora", telefone: `1190${n}00001`, status: "Ativo" }, "teste");
  const pedir = (extra: Record<string, unknown> = {}) => C.criarCorridaPropria(E, { passageiro: { nome: "Cliente", telefone: `1198${n}000000` }, embarque: EMB, destino: DEST, categoria: "Econômico", pagamento: "Pix", canal: "app", ...extra } as never);
  /** Motorista online (a `kmAoNorte` do embarque), recebe a chamada e aceita pelo caminho do app. */
  const aceitarCorrida = async (kmAoNorte = 3) => {
    P.ficarOnline(E, mot.id, EMB.lat + kmAoNorte / 111, EMB.lng);
    const c = await pedir();
    P.despachar(E);
    const o = P.ofertaDoMotorista(E, mot.id);
    assert.ok(o, "o motorista recebe a chamada");
    return { c, feita: await P.aceitar(E, mot.id, o!.id) };
  };
  const ev = (id: string, tipo: string) => eventosDaCorrida(E, id).filter((e) => e.tipo === tipo);
  const de = (id: string) => C.corridaPorId(E, id)!;
  return { E, mot, pedir, aceitarCorrida, ev, de };
}

// ------------------------------------------------------------------ vocabulário (puro)

test("status da Machine: letra por situação e fases da corrida aceita", () => {
  const b = { pendenteEm: null, marcas: undefined, agendadaPara: null } as const;
  assert.equal(M.codigoDoStatus({ ...b, status: "procurando" }), "D");
  assert.equal(M.codigoDoStatus({ ...b, status: "procurando" }, { ofertaAberta: true }), "G");
  assert.equal(M.codigoDoStatus({ ...b, status: "procurando" }, { redistribuindo: true }), "T");
  assert.equal(M.codigoDoStatus({ ...b, status: "procurando", pendenteEm: "2026-11-27T10:00:00Z" }), "P");
  for (const [s, l] of [["a_caminho", "A"], ["no_local", "A"], ["em_andamento", "E"], ["finalizada", "F"], ["cancelada", "C"], ["nao_atendida", "N"]] as const) assert.equal(M.codigoDoStatus({ ...b, status: s }), l);
  assert.equal(M.faseDaCorrida({ ...b, status: "a_caminho" }), "a_caminho");
  assert.equal(M.faseDaCorrida({ ...b, status: "a_caminho", marcas: { proximo: "x" } }), "proximo");
  assert.equal(M.faseDaCorrida({ ...b, status: "no_local" }), "no_local");
  assert.equal(M.faseDaCorrida({ ...b, status: "no_local", marcas: { esperaProlongada: "x" } }), "espera_prolongada");
  assert.equal(M.faseDaCorrida({ ...b, status: "em_andamento" }), null);
});

test("motivos do passageiro (15 ids), quem cancelou (P/T/C) e as 12 formas de pagamento", () => {
  assert.deepEqual(M.MOTIVOS_PASSAGEIRO.map((m) => m.id), [1, 2, 6, 12, 18, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41]);
  assert.equal(M.motivoPorId("35")?.texto, "Achei outra opção");
  assert.equal(M.motivoPorId(99), undefined);
  assert.deepEqual(["Passageiro", "Central", "Motorista", "Sistema", ""].map(M.canceladoPorCodigo), ["P", "T", "C", "T", ""]);
  assert.deepEqual(M.FORMAS_PAGAMENTO.map((f) => f.codigo).join(""), "DBCTVXPHAFIR");
  assert.equal(M.codigoDaForma("Pix"), "X");
  assert.equal(M.codigoDaForma("Dinheiro"), "D");
  assert.equal(M.codigoDaForma("Saldo da Carteira"), "R");
  assert.equal(M.codigoDaForma("Cartão no App"), "A");
  assert.equal(M.codigoDaForma("Cartão na Maquininha"), "C");
  assert.equal(M.codigoDaForma("Troca de figurinhas"), "");
});

// ------------------------------------------------------------------ cancelamento

test("cancelar pelo id do motivo: grava o id, completa o texto e guarda quem cancelou", async () => {
  const t = cenario();
  const c = await t.pedir();
  const feita = await C.cancelarCorrida(t.E, c.id, "Passageiro", "", "app do passageiro", 35);
  assert.equal(feita.motivoId, 35);
  assert.equal(feita.motivoCancelamento, "Achei outra opção");
  assert.equal(feita.canceladaPor, "Passageiro");
  const d = M.detalheDaCorrida(feita);
  assert.equal(d.status, "C");
  assert.deepEqual(d.cancellation.map((x) => [x.reason_id, x.by, x.will_reopen]), [[35, "P", false]]);
  const outra = await t.pedir();
  await assert.rejects(() => C.cancelarCorrida(t.E, outra.id, "Passageiro", "", "x", 99), /Motivo de cancelamento inválido/);
});

test("cancelar corrida que já terminou dá o erro 151 da Machine", async () => {
  const t = cenario();
  const c = await t.pedir();
  await C.cancelarCorrida(t.E, c.id, "Central", "teste");
  await assert.rejects(() => C.cancelarCorrida(t.E, c.id, "Passageiro", "outra vez"), (e: Error & { codigo?: number }) => e.codigo === 151);
});

test("motorista desiste antes de começar: a corrida reabre (will_reopen) e o webhook de Status avisa C com will_reopen verdadeiro", async () => {
  const t = cenario();
  const envios: Array<Record<string, any>> = [];
  W.definirEnvio(async (_u, corpo) => { envios.push(JSON.parse(corpo)); return { status: 200 }; });
  W.criarWebhook(t.E, { tipo: "Status", url: "http://127.0.0.1:9/hook" });
  const { c } = await t.aceitarCorrida();
  await P.desistir(t.E, t.mot.id, c.id, "Problema no carro");
  const depois = t.de(c.id);
  assert.equal(depois.status, "procurando");
  assert.equal(depois.cancelamentos?.length, 1);
  assert.equal(depois.cancelamentos?.[0].motivo, "Problema no carro");
  assert.equal(depois.aceite, undefined, "o aceite antigo some");
  const d = M.detalheDaCorrida(depois);
  assert.deepEqual(d.cancellation.map((x) => [x.by, x.will_reopen]), [["C", true]]);
  await W.processarEntregas();
  W.definirEnvio();
  const status = envios.filter((x) => x.tipo === "Status").map((x) => x.data);
  const cancel = status.find((x) => x.status === "C");
  assert.ok(cancel, "saiu o aviso C");
  assert.equal(cancel.will_reopen, true);
  assert.equal(cancel.cancelado_por, "C");
  assert.ok(status.some((x) => x.status === "A" && x.fase === "a_caminho"), "o aceite saiu como A, fase a_caminho");
  assert.ok(status.some((x) => x.status === "T"), "e a corrida volta como redistribuindo");
});

test("cancelamento final por motorista (culpa do passageiro) não reabre: will_reopen falso", async () => {
  const t = cenario();
  const { c } = await t.aceitarCorrida();
  const feita = await C.cancelarCorrida(t.E, c.id, "Motorista", "Passageiro não apareceu", "app do motorista");
  const d = M.detalheDaCorrida(feita);
  assert.deepEqual(d.cancellation.map((x) => [x.by, x.will_reopen]), [["C", false]]);
});

// ------------------------------------------------------------------ pendência e sem aceite

test("pendência grava pending_at (status P) e a ocorrência de sem aceite sai uma vez só, com a linha do tempo", async () => {
  const t = cenario();
  const c = await t.pedir();
  const adiante = Date.now() + 3600_000;
  await P.controlarPendencias(t.E, adiante);
  await P.controlarPendencias(t.E, adiante + 5000);
  const depois = t.de(c.id);
  assert.ok(depois.pendenteEm, "pending_at gravado");
  assert.ok(depois.marcas?.semAceite, "marca de sem aceite");
  assert.equal(M.codigoDoStatus(depois), "P");
  assert.equal(M.detalheDaCorrida(depois).status, "P");
  assert.ok(M.detalheDaCorrida(depois).progress.pending_at);
  assert.equal(t.ev(c.id, "sem_aceite_60s").length, 1, "uma vez por corrida");
  assert.equal(P.corridaParaApp(t.E, depois, "passageiro").fase, null);
  assert.equal(P.corridaParaApp(t.E, depois, "passageiro").codigoStatus, "P");
});

test("sem aceite: corrida programada não gera a ocorrência; antes dos 60 s também não", async () => {
  const t = cenario();
  const cedo = await t.pedir();
  await P.controlarPendencias(t.E, Date.now() + 30_000);
  assert.equal(t.de(cedo.id).marcas?.semAceite, undefined, "ainda não passaram 60 s");
  const amanha = new Date(Date.now() + 86_400_000 - 3 * 3600_000).toISOString().slice(0, 16);
  const prog = await t.pedir({ agendadaPara: amanha });
  await P.controlarPendencias(t.E, Date.now() + 3600_000);
  assert.equal(t.de(prog.id).marcas?.semAceite, undefined, "programada não gera");
});

// ------------------------------------------------------------------ fases e atraso

test("fases: próximo (menos de 500 m), motorista atrasado (passou a estimativa) e espera prolongada no local", async () => {
  const t = cenario();
  const { c, feita } = await t.aceitarCorrida(3);
  assert.ok(feita.aceite?.etaSegundos && feita.aceite.etaSegundos >= 60, "o aceite guarda a estimativa até o embarque");
  assert.ok(feita.aceite?.km && feita.aceite.km > 2);
  assert.equal(M.detalheDaCorrida(feita).progress.accept_eta_seconds, feita.aceite.etaSegundos);
  assert.equal(P.corridaParaApp(t.E, feita, "passageiro").fase, "a_caminho");
  // Dentro do tempo: nada.
  await P.controlarFases(t.E, Date.now() + 60_000);
  assert.equal(t.de(c.id).marcas?.atraso, undefined);
  // Passou a estimativa mais a folga e o motorista continua longe: atrasado.
  await P.controlarFases(t.E, Date.now() + feita.aceite!.etaSegundos! * 1000 + (M.FOLGA_ATRASO_MIN + 1) * 60_000);
  assert.ok(t.de(c.id).marcas?.atraso);
  assert.equal(t.ev(c.id, "motorista_atrasado").length, 1);
  // Chegou perto: fase próximo.
  P.atualizarPosicao(t.E, t.mot.id, EMB.lat + 0.002, EMB.lng);
  await P.controlarFases(t.E);
  await P.controlarFases(t.E);
  assert.ok(t.de(c.id).marcas?.proximo);
  assert.equal(t.ev(c.id, "proximo").length, 1);
  assert.equal(M.faseDaCorrida(t.de(c.id)), "proximo");
  assert.equal(P.corridaParaApp(t.E, t.de(c.id), "passageiro").fase, "proximo");
  assert.ok(M.detalheDaCorrida(t.de(c.id)).progress.arrival_at_surroundings);
  // No local: espera prolongada só depois do tempo.
  await C.mudarStatus(t.E, c.id, "no_local", {}, "app do motorista");
  assert.equal(P.corridaParaApp(t.E, t.de(c.id), "passageiro").fase, "no_local");
  assert.ok(M.detalheDaCorrida(t.de(c.id)).progress.pickup_arrival);
  await P.controlarFases(t.E, Date.now() + 60_000);
  assert.equal(t.de(c.id).marcas?.esperaProlongada, undefined);
  await P.controlarFases(t.E, Date.now() + (M.ESPERA_PROLONGADA_MIN + 1) * 60_000);
  assert.equal(P.corridaParaApp(t.E, t.de(c.id), "passageiro").fase, "espera_prolongada");
  assert.equal(t.ev(c.id, "espera_prolongada").length, 1);
});

// ------------------------------------------------------------------ nota baixa, taxa, tarifa

test("nota baixa do motorista ao passageiro (1 a 3) vira aviso na central e evento; nota 4 não", async () => {
  const t = cenario();
  const a = await t.pedir(), b = await t.pedir({ passageiro: { nome: "Outro", telefone: "11977770099" } });
  for (const x of [a, b]) { await C.atribuirMotorista(t.E, x.id, t.mot.id); await C.mudarStatus(t.E, x.id, "em_andamento"); await C.mudarStatus(t.E, x.id, "finalizada", { valor: 20 }); }
  await C.avaliarPassageiro(t.E, a.id, 2, "Foi grosseiro", "app do motorista");
  await C.avaliarPassageiro(t.E, b.id, 4, "", "app do motorista");
  assert.equal(t.ev(a.id, "nota_baixa").length, 1);
  assert.equal(t.ev(b.id, "nota_baixa").length, 0);
  const n = central(t.E, "dono@teste.local", false).itens.filter((x) => x.chave.startsWith("nota-baixa:"));
  assert.deepEqual(n.map((x) => x.chave), [`nota-baixa:${a.id}`]);
  assert.match(n[0].texto, /nota 2/);
});

test("taxa de cancelamento (CF) e tarifa recalculada (FR) entram na linha do tempo e no webhook de Ocorrência", async () => {
  const t = cenario({ taxaCancelamento: 7, toleranciaCancelamento: 0 });
  const envios: Array<Record<string, any>> = [];
  W.definirEnvio(async (_u, corpo) => { envios.push(JSON.parse(corpo)); return { status: 200 }; });
  W.criarWebhook(t.E, { tipo: "Ocorrencia", url: "http://127.0.0.1:9/oc" });
  const c = await t.pedir();
  await C.atribuirMotorista(t.E, c.id, t.mot.id);
  await C.alterarCorrida(t.E, c.id, (x) => { x.estimativa = { ...x.estimativa, valor: 40 }; });
  await C.alterarCorrida(t.E, c.id, (x) => { x.atribuidaEm = new Date(agoraBr().getTime() - 3600_000).toISOString(); });
  await C.cancelarCorrida(t.E, c.id, "Passageiro", "", "app do passageiro", 1);
  assert.equal(t.ev(c.id, "taxa_cancelamento").length, 1);
  assert.equal(t.ev(c.id, "tarifa_recalculada").length, 1);
  await W.processarEntregas();
  W.definirEnvio();
  const oc = envios.map((x) => x.data);
  const cf = oc.find((x) => x.ocorrencia === "CF");
  assert.equal(cf.amount, 7);
  assert.equal(cf.payment_status, "PAID");
  const fr = oc.find((x) => x.ocorrencia === "FR");
  assert.equal(fr.new_amount, 40);
  assert.equal(fr.reason, "ROUTE_CHANGE");
  assert.ok(typeof fr.previous_amount === "number" && fr.previous_amount !== 40);
});

test("detalhe da corrida finalizada traz os campos do detalhe da Machine", async () => {
  const t = cenario();
  const c = await t.pedir();
  await C.atribuirMotorista(t.E, c.id, t.mot.id);
  await C.mudarStatus(t.E, c.id, "em_andamento");
  const f = await C.mudarStatus(t.E, c.id, "finalizada", { valor: 33 });
  await C.avaliar(t.E, c.id, 5, "app do passageiro", "Ótimo");
  const d = M.detalheDaCorrida(t.de(c.id));
  assert.equal(d.status, "F");
  assert.equal(d.forma_pagamento, "X");
  assert.equal(d.finished?.final_value, f.valor);
  assert.equal(d.finished?.coupon_value, 0);
  assert.equal(d.avaliacao_condutor?.nota, 5);
  assert.match(String(d.progress.start_trip), /Z$/);
  assert.deepEqual(d.cancellation, []);
  for (const k of ["pending_at", "accepted_at", "accept_lat", "accept_lng", "accept_eta_seconds", "accept_eta_km", "estimated_distance_km", "estimated_duration", "estimated_value", "pickup_arrival", "arrival_at_surroundings", "start_trip"]) assert.ok(k in d.progress, k);
});

// ------------------------------------------------------------------ webhooks de saída

test("webhook: limite de 5 por tipo, endereço válido e segredo mostrado só ao criar", () => {
  const t = cenario();
  for (let i = 0; i < 5; i++) assert.ok(W.criarWebhook(t.E, { tipo: "Status", url: `https://exemplo.com.br/h${i}` }).segredo.startsWith("whsec_"));
  assert.throws(() => W.criarWebhook(t.E, { tipo: "Status", url: "https://exemplo.com.br/h6" }), /no máximo 5/);
  assert.ok(W.criarWebhook(t.E, { tipo: "Ocorrencia", url: "https://exemplo.com.br/o" }), "o limite é por tipo");
  assert.throws(() => W.criarWebhook(t.E, { tipo: "Posicao", url: "https://exemplo.com.br/p" }), /Escolha o tipo/);
  const l = W.listarWebhooks(t.E);
  assert.equal(l.length, 6);
  assert.ok(l.every((w) => !JSON.stringify(w).includes("whsec_") && w.segredoFim.length === 4), "a lista nunca traz o segredo inteiro");
  assert.equal(JSON.parse(fs.readFileSync(path.join(DADOS, "empresas", t.E, "config", "webhooks-saida.json"), "utf8")).some((w: Record<string, unknown>) => "segredo" in w), false, "o segredo não fica no arquivo de configuração");
  assert.throws(() => W.criarWebhook(cenario().E, { tipo: "Status", url: "ftp://x.com" }), /https/);
  const antes = process.env.WEBHOOK_PERMITIR_LOCAL;
  process.env.WEBHOOK_PERMITIR_LOCAL = "0";
  try {
    for (const u of ["http://exemplo.com.br/x", "https://127.0.0.1/x", "https://localhost/x", "https://192.168.0.10/x", "https://10.1.2.3/x", "https://[::1]/x", "https://servico.internal/x", "https://user:senha@exemplo.com.br/x"]) assert.throws(() => W.validarUrl(u), /./, u);
    assert.equal(W.validarUrl("https://exemplo.com.br/x"), "https://exemplo.com.br/x");
  } finally { if (antes === undefined) delete process.env.WEBHOOK_PERMITIR_LOCAL; else process.env.WEBHOOK_PERMITIR_LOCAL = antes; }
});

test("webhook: a assinatura Signature-V2 é o HMAC-SHA-512 do corpo exato, conferida por um receptor HTTP real", async () => {
  const t = cenario();
  const recebidos: Array<{ corpo: string; assinatura: string }> = [];
  const srv = http.createServer((req, res) => { let b = ""; req.on("data", (x) => (b += x)); req.on("end", () => { recebidos.push({ corpo: b, assinatura: String(req.headers["signature-v2"]) }); res.statusCode = 204; res.end(); }); });
  await new Promise<void>((ok) => srv.listen(0, "127.0.0.1", ok));
  try {
    const { segredo, webhook } = W.criarWebhook(t.E, { tipo: "Status", url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}/h` });
    const c = await t.pedir();
    await C.cancelarCorrida(t.E, c.id, "Passageiro", "", "x", 1);
    assert.ok(await W.processarEntregas() >= 1);
    assert.ok(recebidos.length >= 1);
    for (const r of recebidos) assert.equal(r.assinatura, crypto.createHmac("sha512", segredo).update(r.corpo).digest("hex"));
    assert.notEqual(recebidos[0].assinatura, crypto.createHmac("sha512", "outro").update(recebidos[0].corpo).digest("hex"), "segredo errado não confere");
    const env = JSON.parse(recebidos.at(-1)!.corpo);
    assert.equal(env.data.status, "C");
    assert.equal(env.data.cancelado_por, "P");
    assert.equal(env.data.motivo_id, 1);
    assert.equal(env.data.will_reopen, false);
    assert.ok(env.event_id && env.source_event_id && env.occurred_at);
    assert.ok(W.entregasRecentes(t.E).every((x) => x.estado === "entregue"));
    // Teste manual do botão "Testar".
    assert.equal((await W.testarWebhook(t.E, webhook.id, 100_000)).ok, true);
    // Segredo novo: o antigo deixa de conferir.
    const novo = W.girarSegredo(t.E, webhook.id).segredo;
    assert.notEqual(novo, segredo);
    await W.testarWebhook(t.E, webhook.id, 200_000);
    const ult = recebidos.at(-1)!;
    assert.equal(ult.assinatura, crypto.createHmac("sha512", novo).update(ult.corpo).digest("hex"));
  } finally { srv.closeAllConnections(); srv.close(); }
});

test("webhook: entrega pelo menos uma vez; event_id muda a cada tentativa e source_event_id é o mesmo; espera crescente; depois de 7 falhas, falhou", async () => {
  const t = cenario();
  const corpos: Array<Record<string, any>> = [];
  let responder = 500;
  W.definirEnvio(async (_u, corpo) => { corpos.push(JSON.parse(corpo)); return { status: responder }; });
  W.criarWebhook(t.E, { tipo: "Status", url: "https://exemplo.com.br/h" });
  const c = await t.pedir();
  await C.cancelarCorrida(t.E, c.id, "Central", "teste");
  const t0 = Date.now() + 1000;
  assert.equal(await W.processarEntregas(t0), 1);
  assert.equal(await W.processarEntregas(t0 + 5000), 0, "ainda não passaram 10 s");
  responder = 200;
  assert.equal(await W.processarEntregas(t0 + 11_000), 1);
  assert.equal(corpos.length, 2);
  assert.notEqual(corpos[0].event_id, corpos[1].event_id);
  assert.equal(corpos[0].source_event_id, corpos[1].source_event_id);
  assert.equal(W.entregasRecentes(t.E)[0].estado, "entregue");
  assert.equal(W.entregasRecentes(t.E)[0].tentativas, 2);
  assert.equal(await W.processarEntregas(t0 + 99_000_000), 0, "entregue não repete");
  // Endereço que nunca responde bem.
  responder = 503;
  const d = await t.pedir();
  await C.cancelarCorrida(t.E, d.id, "Central", "teste");
  let agora = t0 + 100_000_000;
  for (let i = 0; i < 7; i++) { await W.processarEntregas(agora); agora += 7 * 3600_000; }
  const f = W.entregasRecentes(t.E)[0];
  assert.equal(f.estado, "falhou");
  assert.equal(f.tentativas, 7);
  assert.match(f.ultimoErro, /503/);
  W.definirEnvio();
});

test("webhook desligado ou de outro tipo não recebe; rotas listam, criam, giram o segredo e removem", async () => {
  const t = cenario();
  const envios: string[] = [];
  W.definirEnvio(async (u) => { envios.push(u); return { status: 200 }; });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as unknown as { ctx: unknown }).ctx = { empresaId: t.E, usuario: { email: "admin@teste.local" } }; next(); });
  app.use("/w", rotasWebhooks);
  const srv = app.listen(0);
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/w`;
  const chamar = async (m: string, u: string, corpo?: unknown) => { const r = await fetch(base + u, { method: m, headers: { "content-type": "application/json" }, body: corpo === undefined ? undefined : JSON.stringify(corpo) }); return { status: r.status, corpo: (await r.json()) as Record<string, any> }; };
  try {
    const a = await chamar("POST", "/", { tipo: "Ocorrencia", url: "https://exemplo.com.br/a" });
    assert.equal(a.status, 200);
    assert.ok(a.corpo.segredo.startsWith("whsec_"));
    assert.equal((await chamar("POST", "/", { tipo: "Status", url: "ftp://x" })).status, 400);
    const l = await chamar("GET", "/");
    assert.equal(l.corpo.webhooks.length, 1);
    assert.equal(l.corpo.maximoPorTipo, 5);
    assert.ok(!JSON.stringify(l.corpo).includes(a.corpo.segredo));
    const c = await t.pedir();
    await C.cancelarCorrida(t.E, c.id, "Central", "teste"); // só Status: o webhook de Ocorrência não recebe
    assert.equal(await W.processarEntregas(), 0);
    await chamar("PUT", `/${a.corpo.webhook.id}`, { ativo: false });
    assert.equal((await chamar("GET", "/")).corpo.webhooks[0].ativo, false);
    assert.equal((await chamar("POST", `/${a.corpo.webhook.id}/segredo`, {})).corpo.segredo.startsWith("whsec_"), true);
    assert.equal((await chamar("DELETE", `/${a.corpo.webhook.id}`)).status, 200);
    assert.equal((await chamar("GET", "/")).corpo.webhooks.length, 0);
    assert.equal((await chamar("DELETE", `/${a.corpo.webhook.id}`)).status, 400);
  } finally { srv.closeAllConnections(); srv.close(); W.definirEnvio(); }
  assert.deepEqual(envios, []);
});

// ------------------------------------------------------------------ endurecimento (revisão)

test("webhook: IPs internos, NAT64, 6to4, multicast, 'localhost.', portas e tamanho do endereço", () => {
  for (const ip of ["10.0.0.1", "127.0.0.1", "192.0.0.5", "198.18.0.1", "198.19.255.1", "224.0.0.1", "255.255.255.255", "169.254.1.1", "100.64.0.1", "::1", "64:ff9b::7f00:1", "2002:7f00:1::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) assert.ok(W.ipInterno(ip), ip);
  for (const ip of ["8.8.8.8", "198.20.0.1", "2606:4700::1111"]) assert.equal(W.ipInterno(ip), false, ip);
  const antes = process.env.WEBHOOK_PERMITIR_LOCAL;
  process.env.WEBHOOK_PERMITIR_LOCAL = "0";
  try {
    for (const u of ["https://localhost./x", "https://224.0.0.1/x", "https://[64:ff9b::7f00:1]/x", "https://[2002:7f00:1::1]/x", "https://exemplo.com.br:8080/x", "https://exemplo.com.br/" + "a".repeat(500)]) assert.throws(() => W.validarUrl(u), /./, u);
    assert.equal(W.validarUrl("https://exemplo.com.br:8443/x"), "https://exemplo.com.br:8443/x");
    assert.equal(W.validarUrl("https://exemplo.com.br:443/x"), "https://exemplo.com.br/x");
  } finally { if (antes === undefined) delete process.env.WEBHOOK_PERMITIR_LOCAL; else process.env.WEBHOOK_PERMITIR_LOCAL = antes; }
});

test("webhook: a conexão resolve o nome de novo e recusa IP interno (rebinding)", async () => {
  const antes = process.env.WEBHOOK_PERMITIR_LOCAL;
  process.env.WEBHOOK_PERMITIR_LOCAL = "0";
  try {
    await assert.rejects(() => W.verificarDns("https://localhost/x"), /interna|encontrar/);
    const r = await new Promise<Error | null>((ok) => W.lookupSeguro("localhost", {}, (e) => ok(e)));
    assert.match(String(r?.message), /interno/);
  } finally { if (antes === undefined) delete process.env.WEBHOOK_PERMITIR_LOCAL; else process.env.WEBHOOK_PERMITIR_LOCAL = antes; }
});

test("webhook: sem segredo não envia e marca falhou; teste manual 1 a cada 10 s com erro genérico", async () => {
  const t = cenario();
  let chamadas = 0;
  W.definirEnvio(async () => { chamadas++; return { status: 200 }; });
  const { webhook } = W.criarWebhook(t.E, { tipo: "Status", url: "https://exemplo.com.br/h" });
  const c = await t.pedir();
  const seg = D.segredos(t.E); delete seg.integracoes[`webhook-${webhook.id}`]; D.salvarSegredos(t.E, seg);
  await C.cancelarCorrida(t.E, c.id, "Central", "teste");
  await W.processarEntregas();
  assert.equal(chamadas, 0);
  assert.equal(W.entregasRecentes(t.E)[0].estado, "falhou");
  assert.match(W.entregasRecentes(t.E)[0].ultimoErro, /segredo/);
  const u = cenario();
  const w2 = W.criarWebhook(u.E, { tipo: "Status", url: "https://exemplo.com.br/h" }).webhook;
  W.definirEnvio(async () => { throw new Error("connect ECONNREFUSED 10.0.0.5:80"); });
  const r = await W.testarWebhook(u.E, w2.id, 100_000);
  assert.equal(r.ok, false);
  assert.doesNotMatch(r.erro, /10\.0\.0\.5|ECONN/);
  await assert.rejects(() => W.testarWebhook(u.E, w2.id, 109_000), /10 segundos/);
  assert.equal((await W.testarWebhook(u.E, w2.id, 116_000)).ok, false);
  W.definirEnvio();
});

test("webhook: uma empresa não passa de 20 entregas por volta e as entregas andam em paralelo", async () => {
  const a = cenario(), b = cenario();
  let emVoo = 0, pico = 0;
  W.definirEnvio(async () => { emVoo++; pico = Math.max(pico, emVoo); await new Promise((r) => setTimeout(r, 15)); emVoo--; return { status: 200 }; });
  W.criarWebhook(a.E, { tipo: "Status", url: "https://exemplo.com.br/a" });
  W.criarWebhook(b.E, { tipo: "Status", url: "https://exemplo.com.br/b" });
  for (let i = 0; i < 25; i++) W.enfileirar(a.E, "Status", "A", { i });
  W.enfileirar(b.E, "Status", "A", { i: 0 });
  const feitas = await W.processarEntregas(Date.now() + 1000);
  assert.equal(feitas, 21, "20 da empresa A e 1 da B");
  assert.ok(pico > 1 && pico <= 10, `paralelo com limite (pico ${pico})`);
  assert.equal(W.entregasRecentes(b.E)[0].estado, "entregue");
  await W.processarEntregas(Date.now() + 2000);
  W.definirEnvio();
});

test("will_reopen só sai se o motorista de fato cancelou; motivoId inválido da central dá erro", async () => {
  const t = cenario();
  const { c } = await t.aceitarCorrida();
  const antes = t.de(c.id);
  const sem = await C.alterarCorrida(t.E, c.id, (x) => { x.status = "procurando"; x.motoristaId = null; });
  assert.equal(M.eventosDaMudanca(antes, sem).some((e) => e.codigo === "C"), false, "voltou à fila sem cancelamento do motorista: nada de C");
  const d = await t.pedir({ passageiro: { nome: "Outro", telefone: "11977770055" } });
  await assert.rejects(() => C.cancelarCorrida(t.E, d.id, "Central", "x", "painel", 999), /Motivo de cancelamento inválido/);
});
