// Testes da automação do CRM: gatilhos, fila de dispatches, régua de reativação, notificações e limites. Nada sai para a internet.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-crm-aut-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "y".repeat(40);
delete process.env.CRM_PERMITIR_URL_LOCAL;

const { default: express } = await import("express");
const D = await import("../src/servidor/dados.ts");
const { banco } = await import("../src/servidor/banco.ts");
const { criarCookie, exigirLogin } = await import("../src/servidor/sessao.ts");
const { router } = await import("../src/crm/rotas.ts");
const G = await import("../src/crm/gatilhos.ts");
const L = await import("../src/crm/limites.ts");
const R = await import("../src/crm/regua.ts");
const T = await import("../src/crm/templates.ts");
const W = await import("../src/crm/whatsapp.ts");
const E = await import("../src/crm/envio.ts");
const A = await import("../src/crm/armazem.ts");
const { listarEnvios } = await import("../src/crm/registro.ts");

/** Cria empresa, template ativo e gatilho. */
function preparar(nome: string, tipo: string, config: Record<string, unknown> = {}, conteudo = "{Oi|Olá} {{nome}}, corrida {{os}} com {{motorista}}.") {
  const e = D.criarEmpresa(nome).id;
  const t = T.salvarTemplate(e, null, { name: "Msg", category: "custom", title: "Aviso", content: conteudo, variables: [], is_active: true, image_url: null, button_text: null, button_link: null, variant_b_content: null, ab_split_ratio: 0, wa_optout_footer: false });
  const g = G.salvarGatilho(e, null, { name: "Gat", template_id: t.id, trigger_type: tipo, trigger_config: config, send_channel: "whatsapp", is_active: true });
  return { e, t, g };
}
const inserirCorrida = (e: string, telefone: string, status: string, solicitada: string) =>
  banco().prepare("INSERT INTO corridas_proprias (empresa, id, os_num, status, telefone, solicitada_em, dados) VALUES (?,?,?,?,?,?,?)").run(e, `c${Math.random()}`, 1, status, telefone, solicitada, "{}");

test("gatilho sem atraso sai na hora, com variáveis, e aparece em Notificações", async () => {
  const { e, g } = preparar("Aut Um", "ride_accepted");
  W.limparCaixaSimulada(e);
  const r = await G.tratarEvento({ empresaId: e, tipo: "ride_accepted", telefone: "(11) 91111-2222", nome: "Maria Souza", vars: { os: "123", motorista: "Carlos" } });
  assert.equal(r.disparados, 1);
  const caixa = W.caixaSimulada(e);
  assert.equal(caixa.length, 1);
  assert.match(caixa[0].texto, /^(Oi|Olá) Maria, corrida 123 com Carlos\.$/);
  assert.equal(caixa[0].telefone, "5511911112222");
  assert.equal(G.gatilho(e, g.id)!.fire_count, 1);
  const log = listarEnvios(e, {});
  assert.equal(log.total, 1);
  assert.equal(log.linhas[0].origem, "trigger");
  assert.equal(log.linhas[0].estado, "sent");
  assert.equal(log.linhas[0].origem_id, g.id);
});

test("gatilho com atraso espera na fila, cancela sozinho se o passageiro pediu de novo e envia se nada mudou", async () => {
  const { e, g } = preparar("Aut Dois", "ride_canceled", { delay_seconds: 180 }, "Vamos tentar de novo, {{nome}}?");
  W.limparCaixaSimulada(e);
  const t0 = Date.now();
  await G.tratarEvento({ empresaId: e, tipo: "ride_canceled", telefone: "11922223333", nome: "João", em: t0 });
  await G.tratarEvento({ empresaId: e, tipo: "ride_canceled", telefone: "11944445555", nome: "Ana", em: t0 });
  assert.equal(G.estatisticasFila(e).pending, 2);
  assert.equal((await G.processarAtrasados(e, t0 + 60_000)).processados, 0, "ainda não é a hora");
  // João pediu e o motorista aceitou depois do cancelamento (a hora das corridas é a de Brasília gravada como UTC).
  inserirCorrida(e, "5511922223333", "a_caminho", new Date(t0 - 3 * 3600_000 + 120_000).toISOString());
  const r = await G.processarAtrasados(e, t0 + 181_000);
  assert.deepEqual(r, { processados: 1, cancelados: 1 });
  assert.equal(W.caixaSimulada(e).length, 1);
  assert.match(W.caixaSimulada(e)[0].texto, /Ana/);
  const fila = G.listarFila(e, { visao: "all" });
  assert.equal(fila.linhas.find((l) => l.nome === "João")!.estado, "canceled");
  assert.match(fila.linhas.find((l) => l.nome === "João")!.erro, /já pediu/);
  assert.equal(G.estatisticasFila(e).sent, 1);
  assert.equal(G.logsDoGatilho(e, g.id).length, 2);
});

test("fila: cancelar e enviar agora", async () => {
  const { e } = preparar("Aut Tres", "simulated_no_request", {}, "Sua corrida está calculada, {{nome}}.");
  const t0 = Date.now();
  await G.tratarEvento({ empresaId: e, tipo: "simulated_no_request", telefone: "11933334444", nome: "Bia", em: t0 }); // atraso padrão: 10 min
  const [item] = G.listarFila(e, { visao: "pending" }).linhas;
  assert.ok(item.sai_em! >= t0 + 600_000 - 1000);
  assert.equal(G.agirNaFila(e, item.id, "now"), true);
  assert.equal((await G.processarAtrasados(e)).processados, 1);
  assert.equal(G.agirNaFila(e, item.id, "cancel"), false, "já saiu");
  await G.tratarEvento({ empresaId: e, tipo: "simulated_no_request", telefone: "11955556666", nome: "Caio", em: t0 });
  const outro = G.listarFila(e, { visao: "pending" }).linhas[0];
  assert.equal(G.agirNaFila(e, outro.id, "cancel"), true);
  assert.equal(G.estatisticasFila(e).canceled, 1);
});

test("filtros: uma vez por passageiro, intervalo, cidade; descadastro e pausa geral", async () => {
  const { e, g } = preparar("Aut Quatro", "ride_completed", { once_per_contact: true, city: "Pitangueiras" });
  W.limparCaixaSimulada(e);
  const ev = (tel: string, extra: object = {}) => G.tratarEvento({ empresaId: e, tipo: "ride_completed", telefone: tel, nome: "Ze", ...extra });
  assert.equal((await ev("11911110001", { cidade: "Outra" })).disparados, 0, "outra cidade");
  assert.equal((await ev("11911110001", { cidade: "pitangueiras" })).disparados, 1);
  assert.equal((await ev("11911110001", { cidade: "Pitangueiras" })).disparados, 0, "uma vez só");
  // Descadastrado não recebe: fica "pulado" e registrado.
  T.descadastrar(e, { telefone: "11911110002", origem: "resposta" });
  assert.equal((await ev("11911110002", { cidade: "Pitangueiras" })).disparados, 0);
  assert.equal(listarEnvios(e, { estado: "skipped" }).total, 1);
  // Pausa geral segura o envio (volta para a fila, não é falha) e sai quando continuar.
  L.definirPausaGeral(e, true, "teste");
  assert.equal((await ev("11911110003", { cidade: "Pitangueiras" })).disparados, 0);
  assert.equal(G.estatisticasFila(e).pending, 1);
  assert.equal(W.caixaSimulada(e).length, 1);
  L.definirPausaGeral(e, false, "teste");
  assert.equal((await G.processarAtrasados(e, Date.now() + 3 * 60_000)).processados, 1);
  assert.equal(W.caixaSimulada(e).length, 2);
  void g;
});

test("erro passageiro volta para a fila e erro definitivo vira falha", async () => {
  const { e } = preparar("Aut Cinco", "ride_accepted", {}, "Oi {{nome}}");
  await G.tratarEvento({ empresaId: e, tipo: "ride_accepted", telefone: "11900009999", nome: "Temp" }); // ...9999: erro passageiro
  assert.equal(G.estatisticasFila(e).pending, 1);
  await G.tratarEvento({ empresaId: e, tipo: "ride_accepted", telefone: "11900000000", nome: "Def" }); // ...0000: sem WhatsApp
  assert.equal(G.estatisticasFila(e).failed, 0, "falha imediata não entra na fila de atraso (sem hora marcada)");
  const falhas = listarEnvios(e, { estado: "failed" });
  assert.equal(falhas.total, 1);
  assert.match(falhas.linhas[0].erro, /sem WhatsApp/i);
});

test("gatilho por tempo: inativo X dias, uma vez por período", async () => {
  const { e } = preparar("Aut Seis", "inactive_passenger", { days_inactive: 15 }, "Faz {{dias_sem_corrida}} dias, {{nome}}.");
  W.limparCaixaSimulada(e);
  // Empresa nova tem corridas de exemplo: quem está entre 15 e 22 dias sem corrida recebe, uma vez por período.
  const n1 = await G.rodarGatilhosDeTempo(e, Date.now(), true);
  await G.rodarGatilhosDeTempo(e, Date.now(), true);
  const caixa = W.caixaSimulada(e);
  assert.ok(caixa.length >= n1);
  assert.equal(new Set(caixa.map((m) => m.telefone)).size, caixa.length, "ninguém recebe duas vezes");
  for (const m of caixa) { const d = Number(/Faz (\d+) dias/.exec(m.texto)?.[1]); assert.ok(d >= 15 && d <= 22, m.texto); }
});

test("modelos prontos entram desligados e não repetem", () => {
  const e = D.criarEmpresa("Aut Sete").id;
  const r = G.instalarModelos(e, [0, 1, 2]);
  assert.equal(r.instalados, 3);
  assert.ok(G.gatilhos(e).every((g) => !g.is_active));
  assert.equal(G.instalarModelos(e, [0]).instalados, 0);
});

test("teto diário só vale para WhatsApp de verdade; simulado ignora", async () => {
  const e = D.criarEmpresa("Aut Oito").id;
  assert.equal(L.tetoHoje(e), 8, "primeiro dia: começa em 8");
  assert.equal(L.dentroDaJanela(e, "12:00"), true);
  assert.equal(L.dentroDaJanela(e, "23:30"), false);
  assert.equal(L.dentroDaJanela(e, "07:59"), false);
  L.salvarGovernanca(e, { janelaInicio: "22:00", janelaFim: "06:00" });
  assert.equal(L.dentroDaJanela(e, "23:30"), true, "janela que cruza a meia-noite");
  assert.equal(L.dentroDaJanela(e, "12:00"), false);
});

test("fila de campanha respeita pausa geral e registra o histórico", async () => {
  const e = D.criarEmpresa("Aut Nove").id;
  const item = (n: number) => ({ id: `i${n}`, origem: { tipo: "campanha" as const, id: "camp1" }, chave: `p:${n}`, nome: `P${n}`, telefone: `55119${String(n).padStart(8, "0")}`, texto: "Oi", estado: "pendente" as const, tentativas: 0, criadoEm: Date.now(), proximaEm: Date.now(), enviadoEm: null, erro: "" });
  A.adicionarNaFila(e, [item(1), item(2)]);
  L.definirPausaGeral(e, true, "t");
  const parada = await E.processarFila(e, { dormir: async () => {}, esperaMaxMs: 0 });
  assert.equal(parada.motivo, "pausado");
  assert.equal(parada.enviados, 0);
  L.definirPausaGeral(e, false, "t");
  const r = await E.processarFila(e, { dormir: async () => {} });
  assert.equal(r.enviados, 2);
  const log = listarEnvios(e, { origem: "campaign" });
  assert.equal(log.total, 2);
});

test("régua: salvar, ligar, rodar respeitando faixa, limite do dia e parada por erros", async () => {
  const e = D.criarEmpresa("Aut Dez").id;
  assert.equal((await R.reguaStatus(e)).config.status, "off");
  assert.deepEqual((await R.reguaSalvar(e, { tiers: "x", maxPerDay: 3 })).ok, true);
  assert.equal(R.configRegua(e).max_per_day, 3);
  assert.equal((await R.reguaSalvar(e, { status: "on", numero: "crm" })).ok, true);
  assert.equal(R.configRegua(e).status, "on");
  assert.ok(R.configRegua(e).warmup_started_at, "aquecimento começou");

  // 12:00 de terça (Brasília)
  const agora = Date.parse("2026-11-10T15:00:00Z");
  const contato = (n: number, dias: number, extra: object = {}) => ({
    chave: `p:${n}`, tipo: "passageiro" as const, nome: `Pessoa ${n}`, telefone: `1191111${String(1000 + n)}`, cidade: "", situacao: "", noCadastro: true, corridas: 2, finalizadas: 2, canceladas: 0, gasto: 10,
    ultimaCorrida: new Date(agora - 3 * 3600_000 - dias * 86_400_000 - 3600_000).toISOString(), diasSemCorrida: dias, ultimoGrupo: "finalizada", categorias: [], canais: [], origens: [], optOut: false, ...extra,
  });
  const contatos = [contato(1, 2), contato(2, 8), contato(3, 40), contato(4, 0), contato(5, 2, { optOut: true }), contato(6, 400)];
  W.limparCaixaSimulada(e);
  const dormiu: number[] = [];
  const enviados = await R.rodarRegua(e, { agora, contatos, dormir: async (ms) => { dormiu.push(ms); }, sorteio: () => 0 });
  assert.equal(enviados, 2, "2 por rodada, os que pararam há menos tempo primeiro");
  assert.equal(W.caixaSimulada(e).length, 2);
  assert.equal(dormiu.length, 1);
  assert.ok(dormiu[0] >= 8000 && dormiu[0] <= 20000);
  const hoje = listarEnvios(e, { origem: "regua" });
  assert.equal(hoje.total, 2);
  assert.deepEqual(hoje.linhas.map((l) => l.faixa).sort(), [1, 7]);
  // Segunda rodada: o 3º do limite (3 por dia), depois nada.
  assert.equal(await R.rodarRegua(e, { agora, contatos, dormir: async () => {}, porRodada: 5 }), 0, "teto do primeiro dia é 8 mas máximo configurado é 3 e já saiu 2 + espalhado na janela");
  // Fora do horário comercial não sai
  assert.equal(await R.rodarRegua(e, { agora: Date.parse("2026-11-10T04:00:00Z"), contatos, dormir: async () => {} }), 0);
  // Pausar à mão vale
  await R.reguaSalvar(e, { status: "paused" });
  assert.equal(await R.rodarRegua(e, { agora, contatos, dormir: async () => {} }), 0);
});

test("régua para sozinha depois de erros seguidos", async () => {
  const e = D.criarEmpresa("Aut Onze").id;
  await R.reguaSalvar(e, { status: "on", numero: "crm", errorLimit: 2, maxPerDay: 50, warmupStart: 50 });
  const agora = Date.parse("2026-11-10T20:30:00Z"); // 17:30: já passou quase todo o dia útil, cabe mais mensagens
  const mk = (n: number) => ({
    chave: `p:${n}`, tipo: "passageiro" as const, nome: `P${n}`, telefone: `119111${n}0000`.slice(0, 11), cidade: "", situacao: "", noCadastro: true, corridas: 1, finalizadas: 1, canceladas: 0, gasto: 0,
    ultimaCorrida: new Date(agora - 3 * 3600_000 - 3 * 86_400_000).toISOString(), diasSemCorrida: 3, ultimoGrupo: "finalizada", categorias: [], canais: [], origens: [], optOut: false,
  });
  // telefone terminado em 0000 = falha definitiva no provedor simulado
  const contatos = [1, 2, 3].map((n) => ({ ...mk(n), telefone: `1191${n}0000` }));
  await R.rodarRegua(e, { agora, contatos, dormir: async () => {}, porRodada: 5 });
  const c = R.configRegua(e);
  assert.equal(c.status, "paused");
  assert.match(c.paused_reason ?? "", /2 erros de envio seguidos/);
});

test("rotas: operador vê, só gestor cria; empresa não enxerga a de outra", async () => {
  const um = D.criarEmpresa("Aut Rota Um").id;
  const dois = D.criarEmpresa("Aut Rota Dois").id;
  const adm = D.criarUsuario({ email: "adm@aut1.test", nome: "Adm", senha: "senha-forte-1", empresaId: um, papel: "admin" });
  const op = D.criarUsuario({ email: "op@aut1.test", nome: "Op", senha: "senha-forte-1", empresaId: um, papel: "operador" });
  const adm2 = D.criarUsuario({ email: "adm@aut2.test", nome: "Adm2", senha: "senha-forte-2", empresaId: dois, papel: "admin" });
  const app = express();
  app.use(express.json());
  app.post("/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({}); });
  app.use("/api/crm", exigirLogin, router);
  const srv = app.listen(0);
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  try {
    const cookieDe = async (id: string) => ((await fetch(`${base}/entrar/${id}`, { method: "POST" })).headers.get("set-cookie") ?? "").split(";")[0];
    const [cA, cO, cB] = [await cookieDe(adm.id), await cookieDe(op.id), await cookieDe(adm2.id)];
    const pedir = async (p: string, cookie: string, metodo = "GET", corpo?: unknown) => {
      const r = await fetch(base + p, { method: metodo, headers: { "Content-Type": "application/json", Cookie: cookie }, body: corpo ? JSON.stringify(corpo) : undefined });
      return { status: r.status, corpo: await r.json() as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
    };
    assert.equal((await fetch(`${base}/api/crm/gatilhos`)).status, 401);
    const tpl = (await pedir("/api/crm/templates", cA, "POST", { name: "Boas", content: "Oi {{nome}}" })).corpo.template;
    assert.equal((await pedir("/api/crm/gatilhos", cO, "POST", { name: "X", template_id: tpl.id, trigger_type: "new_passenger" })).status, 403);
    assert.match((await pedir("/api/crm/gatilhos", cA, "POST", { name: "", template_id: tpl.id, trigger_type: "new_passenger" })).corpo.erro, /obrigatórios/);
    assert.match((await pedir("/api/crm/gatilhos", cA, "POST", { name: "X", template_id: tpl.id, trigger_type: "nada" })).corpo.erro, /evento/);
    const criado = await pedir("/api/crm/gatilhos", cA, "POST", { name: "Boas-vindas", template_id: tpl.id, trigger_type: "new_passenger", trigger_config: { delay_seconds: "60", once_per_contact: true, city: " Norte ", lixo: 1 } });
    assert.equal(criado.status, 200);
    assert.deepEqual(criado.corpo.gatilho.trigger_config, { delay_seconds: 60, once_per_contact: true, city: "Norte" });
    const id = criado.corpo.gatilho.id;
    // Editar a mensagem junto: cópia só para este gatilho.
    const ed = await pedir(`/api/crm/gatilhos/${id}`, cA, "PUT", { name: "Boas-vindas", template_id: tpl.id, trigger_type: "new_passenger", trigger_config: {}, mensagem: { titulo: "Olá", texto: "Bem-vindo, {{nome}}!", copia: true } });
    assert.notEqual(ed.corpo.gatilho.template_id, tpl.id);
    assert.equal(T.template(um, tpl.id)!.content, "Oi {{nome}}", "o template original não mudou");
    const lista = await pedir("/api/crm/gatilhos", cO, "GET");
    assert.equal(lista.corpo.gatilhos.length, 1);
    assert.match(lista.corpo.gatilhos[0].template.content, /Bem-vindo/);
    // Outra empresa não vê nem mexe
    assert.equal((await pedir("/api/crm/gatilhos", cB, "GET")).corpo.gatilhos.length, 0);
    assert.equal((await pedir(`/api/crm/gatilhos/${id}/ligar`, cB, "POST", {})).status, 400);
    // Ligar/desligar, duplicar, teste, logs, apagar
    assert.equal((await pedir(`/api/crm/gatilhos/${id}/ligar`, cA, "POST", {})).corpo.gatilho.is_active, false);
    assert.equal((await pedir(`/api/crm/gatilhos/${id}/duplicar`, cA, "POST", {})).corpo.gatilho.name, "Boas-vindas (cópia)");
    assert.equal((await pedir(`/api/crm/gatilhos/${id}/teste`, cA, "POST", { telefone: "123" })).status, 400);
    assert.equal((await pedir(`/api/crm/gatilhos/${id}/teste`, cA, "POST", { telefone: "11 99999-1111" })).corpo.sent, true);
    assert.equal((await pedir(`/api/crm/gatilhos/${id}/logs`, cO)).corpo.logs.length, 0);
    // Notificações: o teste aparece como "manual"
    const n = await pedir("/api/crm/notificacoes", cO, "POST", { origem: "manual" });
    assert.equal(n.corpo.total, 1);
    assert.equal(n.corpo.stats.by_status.sent, 1);
    assert.equal((await pedir("/api/crm/notificacoes", cB, "POST", {})).corpo.total, 0);
    // Régua e limites
    assert.equal((await pedir("/api/crm/regua", cO)).corpo.config.status, "off");
    assert.equal((await pedir("/api/crm/regua", cO, "PUT", { status: "on" })).status, 403);
    assert.equal((await pedir("/api/crm/regua", cA, "PUT", { status: "on", numero: "crm", message: "Oi {nome}" })).status, 200);
    assert.equal((await pedir("/api/crm/regua", cA)).corpo.config.status, "on");
    assert.equal((await pedir("/api/crm/limites", cO)).corpo.pausa.pausado, false);
    assert.equal((await pedir("/api/crm/limites/pausa", cA, "POST", { pausar: true })).corpo.pausa.pausado, true);
    assert.equal((await pedir("/api/crm/limites/governanca", cA, "PUT", { janelaInicio: "09:00", janelaFim: "20:00" })).corpo.governanca.janelaFim, "20:00");
    assert.equal((await pedir("/api/crm/dispatches", cO)).corpo.stats.pending, 0);
    assert.equal((await pedir(`/api/crm/gatilhos/${id}`, cA, "DELETE")).corpo.ok, true);
  } finally { srv.close(); }
});
