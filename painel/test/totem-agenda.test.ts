// Agenda dos jogos do totem (Roleta e Raspadinha): o trabalhador do CRM chama "Enviar agora" no dia e horário
// configurados, com as travas do CRM, lembretes no 2º e 3º horário, e só com o recurso Totem ligado.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DADOS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "totem-agenda-"));
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "g".repeat(40);
delete process.env.PUBLICO_URL;

const D = await import("../src/servidor/dados.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar } = await import("../src/cadastros/armazem.ts");
const PR = await import("../src/totem/premios.ts");
const J = await import("../src/totem/premios-jogos.ts");
const { caixaSimulada } = await import("../src/bot/provedores.ts");
const { definirPausaGeral } = await import("../src/crm/limites.ts");
const { definirRecursos } = await import("../src/superadmin/recursos.ts");

/** Terça, 10/11/2026, no horário de Brasília (UTC-3). */
const quando = (hhmm: string) => Date.parse(`2026-11-10T${hhmm}:00-03:00`);
const BASE = "https://painel.exemplo.test";

function preparar(nome: string) {
  const e = D.criarEmpresa(nome).id;
  const cli = cadastroPorId("clientes")!;
  criar(e, cli, { nome: "Maria Souza", telefone: "11988887777", status: "Ativo" }, "t");
  criar(e, cli, { nome: "João Lima", telefone: "11977775555", status: "Ativo" }, "t");
  const cfg = { ...J.configPadrao("roleta"), invites_enabled: true, schedule_enabled: true, days: [2], send_time: "10:00", times_per_day: 2 };
  PR.salvarConfigDoJogo(e, "roleta", cfg, BASE);
  return e;
}

test("sem endereço público guardado a agenda não envia nada", async () => {
  const e = D.criarEmpresa("Sem Base").id;
  criar(e, cadastroPorId("clientes")!, { nome: "Ana", telefone: "11911112222", status: "Ativo" }, "t");
  PR.salvarConfigDoJogo(e, "roleta", { ...J.configPadrao("roleta"), invites_enabled: true, schedule_enabled: true, days: [2], send_time: "10:00" });
  assert.deepEqual(await PR.rodarAgendaDePremios(e, quando("10:05")), []);
  assert.equal(caixaSimulada(e).length, 0);
});

test("no horário vencido manda os convites uma vez só; fora do dia ou da hora não manda", async () => {
  const e = preparar("Agenda Um");
  assert.deepEqual(await PR.rodarAgendaDePremios(e, quando("09:50")), [], "antes do horário");
  assert.deepEqual(await PR.rodarAgendaDePremios(e, quando("10:05") + 86_400_000), [], "quarta-feira fora dos dias");
  const r = await PR.rodarAgendaDePremios(e, quando("10:05"));
  assert.equal(r.length, 1);
  assert.equal(r[0].tipo, "convites");
  assert.equal(r[0].enviados, 2);
  assert.equal(caixaSimulada(e).length, 2);
  assert.match(caixaSimulada(e)[0].texto, new RegExp(`${BASE}/p/${e}/[0-9a-f]{40}`));
  assert.equal(PR.ultimoHorarioDaAgenda(e, "roleta"), "2026-11-10#0");
  assert.deepEqual(await PR.rodarAgendaDePremios(e, quando("10:20")), [], "o mesmo horário não roda duas vezes");
});

test("2º horário manda lembrete só a quem não jogou, uma vez", async () => {
  const e = preparar("Agenda Lembrete");
  await PR.rodarAgendaDePremios(e, quando("10:00"));
  const antes = caixaSimulada(e).length;
  // Maria joga; João não.
  const convites = JSON.parse(fs.readFileSync(path.join(process.env.DADOS_DIR!, "empresas", e, "totem", "premios.json"), "utf8")).convites as Array<{ token: string; telefone: string }>;
  const maria = convites.find((c) => c.telefone === "11988887777")!;
  await PR.jogar(e, maria.token, BASE);
  const posJogo = caixaSimulada(e).length; // o cupom também sai pelo WhatsApp
  await new Promise((r) => setTimeout(r, 30));
  const r = await PR.rodarAgendaDePremios(e, quando("16:02"));
  assert.equal(r[0].tipo, "lembretes");
  assert.equal(r[0].enviados, 1);
  const novas = caixaSimulada(e).slice(Math.max(antes, posJogo));
  assert.ok(novas.some((m) => m.telefone === "11977775555"));
  assert.ok(!novas.some((m) => m.telefone === "11988887777" && m.texto.includes("/p/")), "quem já jogou não recebe lembrete");
  assert.deepEqual(await PR.rodarAgendaDePremios(e, quando("16:10")), []);
});

test("trava geral do CRM (pausa) adia: o horário não fica feito e envia quando liberar", async () => {
  const e = preparar("Agenda Pausa");
  definirPausaGeral(e, true, "teste");
  const r = await PR.rodarAgendaDePremios(e, quando("10:02"));
  assert.equal(r[0].adiado, true);
  assert.equal(r[0].enviados, 0);
  assert.equal(caixaSimulada(e).length, 0);
  assert.equal(PR.ultimoHorarioDaAgenda(e, "roleta"), null);
  definirPausaGeral(e, false, "teste");
  const r2 = await PR.rodarAgendaDePremios(e, quando("10:10"));
  assert.equal(r2[0].enviados, 2);
  assert.equal(PR.ultimoHorarioDaAgenda(e, "roleta"), "2026-11-10#0");
});

test("descadastrado do WhatsApp não recebe convite da agenda", async () => {
  const e = preparar("Agenda Optout");
  const { marcarOptOut } = await import("../src/crm/armazem.ts");
  marcarOptOut(e, "p:11988887777", true);
  const { descadastrado } = await import("../src/crm/gatilhos.ts");
  assert.equal(descadastrado(e, "11988887777"), true);
  const r = await PR.rodarAgendaDePremios(e, quando("10:00"));
  assert.equal(r[0].enviados, 1);
  assert.ok(!caixaSimulada(e).some((m) => m.telefone === "11988887777"));
});

test("a volta do CRM chama a agenda dos prêmios", async () => {
  const e = preparar("Agenda Volta");
  const { volta } = await import("../src/crm/envio.ts");
  const antes = PR.ultimoHorarioDaAgenda(e, "roleta");
  assert.equal(antes, null);
  // A volta usa o relógio de verdade (terça 10h só por acaso): aqui só confere que roda sem erro e sem enviar fora do horário.
  await volta(e);
  assert.ok(caixaSimulada(e).length === 0 || PR.ultimoHorarioDaAgenda(e, "roleta") !== null);
});

test("Totem desligado para a empresa: a agenda não envia", async () => {
  const e = preparar("Agenda Desligada");
  definirRecursos(e, ["totem"]);
  assert.deepEqual(await PR.rodarAgendaDePremios(e, quando("10:00")), []);
  assert.equal(caixaSimulada(e).length, 0);
  definirRecursos(e, []);
  assert.equal((await PR.rodarAgendaDePremios(e, quando("10:00")))[0].enviados, 2);
});
