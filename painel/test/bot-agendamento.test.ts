// Agendamento de corrida pelo bot: menu, frases com data e hora, limite, lista, cancelamento e avisos. Corridas próprias reais, sem rede.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DADOS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "bot-agenda-"));
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "y".repeat(40);
for (const k of ["ANTHROPIC_API_KEY", "GROQ_API_KEYS", "GROQ_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY"]) delete process.env[k];

const D = await import("../src/servidor/dados.ts");
const A = await import("../src/bot/armazem.ts");
const R = await import("../src/corridas/index.ts");
const { receber, horarioBrasilia } = await import("../src/bot/fluxo.ts");
const { enviarLembretes } = await import("../src/bot/status.ts");
const { caixaSimulada } = await import("../src/bot/provedores.ts");
const { criar } = await import("../src/cadastros/armazem.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");

const empresa = D.criarEmpresa("Central Agenda", { nomeExibido: "Central Agenda", assistente: { nome: "Lia", tom: "cordial" } });
A.salvarConfig(empresa.id, { ativo: true, provedor: "simulado", instancia: "bot-agenda" });
criar(empresa.id, cadastroPorId("categorias")!, { nome: "Econômico", bandeirada: 5, valorKm: 2, valorMinimo: 9, ativa: true }, "teste");

let seq = 0;
const msg = (tel: string, texto: string) => receber(empresa.id, { id: `g${++seq}`, telefone: tel, nome: "Rui", texto }, { classificar: async () => null });
const dele = (tel: string) => R.listarProprias(empresa.id).filter((c) => c.passageiro.telefone.endsWith(tel.slice(-9)));
/** O fluxo completo até a corrida, depois do embarque. */
async function pedirAte(tel: string, embarque: string) {
  await msg(tel, embarque); await msg(tel, "2"); await msg(tel, "1"); await msg(tel, "1");
  return msg(tel, "1");
}

test("o menu ganha 'Agendar'; opção 2 pergunta o dia e a hora e aceita 'amanhã 7h'", async () => {
  const tel = "5511910000001";
  const m = await msg(tel, "oi");
  assert.match(m[0], /\*2\* - Agendar uma corrida/);
  assert.match(m[0], /\*3\* - Falar com o suporte/);
  const p = await msg(tel, "2");
  assert.match(p[0], /Para quando você quer a corrida/);
  assert.equal(A.conversa(empresa.id, tel)!.etapa, "agendamento");
  assert.match((await msg(tel, "blablabla"))[0], /Não entendi o dia e a hora/);
  const ok = await msg(tel, "amanhã 7h");
  assert.match(ok[0], /Agendando para \*.+07:00\*/);
  assert.match(ok[1] ?? "", /endereço de embarque|Onde você está/i);
  assert.ok(A.conversa(empresa.id, tel)!.rascunho.agendarPara! > Date.now());
});

test("corrida agendada nasce agendada no painel, não prende a conversa e a pessoa pode pedir outra para agora", async () => {
  const tel = "5511910000002";
  await msg(tel, "oi");
  await msg(tel, "agendar amanhã 7h");
  const f = await pedirAte(tel, "Rua das Flores, 120");
  const texto = f.join("\n");
  assert.match(texto, /Corrida agendada para \*.+07:00\*/, texto);
  const c = A.conversa(empresa.id, tel)!;
  assert.equal(c.corrida, undefined, "não fica em corrida");
  assert.equal(c.etapa, "inicio");
  const r = dele(tel);
  assert.equal(r.length, 1);
  assert.ok(r[0].agendadaPara && R.aindaAgendada(r[0]));
  assert.match(r[0].agendadaPara!, /T07:00/);
  assert.equal(r[0].canal, "bot");
  // Outra corrida, agora, é possível.
  await msg(tel, "oi"); await msg(tel, "1");
  const g = await pedirAte(tel, "Avenida Brasil, 500");
  assert.match(g.join("\n"), /Pedido feito/);
  assert.equal(dele(tel).length, 2);
});

test("horário no meio da frase agenda e o endereço segue sem a hora; 'meus agendamentos' lista; limite de 3", async () => {
  const tel = "5511910000003";
  const antes = dele(tel).length;
  const r = await msg(tel, "me pega na rua sete de setembro 100 amanhã às 10:45");
  assert.match(r.join("\n"), /Agendando para \*.+10:45\*/);
  const c = A.conversa(empresa.id, tel)!;
  assert.equal(c.rascunho.embarque?.texto, "rua sete de setembro 100");
  assert.ok(c.rascunho.agendarPara);
  await msg(tel, "2"); await msg(tel, "1"); await msg(tel, "1"); await msg(tel, "1");
  assert.equal(dele(tel).length, antes + 1);
  const l = await msg(tel, "meus agendamentos");
  assert.match(l[0], /Suas corridas agendadas/);
  assert.match(l[0], /rua sete de setembro 100/);
  for (const dia of ["quinta", "sexta"]) {
    await msg(tel, `agendar ${dia} 8h`); await pedirAte(tel, `Rua Teste ${dia}, 10`);
  }
  assert.equal(dele(tel).length, antes + 3);
  const lim = await msg(tel, "agendar sábado 9h");
  assert.match(lim[0], /limite/);
});

test("cancelar agendamento: confirma e cancela a corrida; 'não' mantém", async () => {
  const tel = "5511910000004";
  await msg(tel, "agendar amanhã 9h"); await pedirAte(tel, "Rua Um, 1");
  const corrida = dele(tel)[0];
  assert.match((await msg(tel, "cancelar agendamento"))[0], /Deseja cancelar sua corrida agendada/);
  assert.match((await msg(tel, "não"))[0], /mantido/);
  assert.equal(dele(tel)[0].status, "procurando");
  await msg(tel, "cancelar agendamento");
  assert.match((await msg(tel, "1"))[0], /Agendamento cancelado/);
  assert.equal(R.listarProprias(empresa.id).find((x) => x.id === corrida.id)!.status, "cancelada");
  assert.match((await msg(tel, "cancelar agendamento"))[0], /não tem corridas agendadas/);
});

test("avisos 15 e 5 minutos antes, uma vez cada", async () => {
  const tel = "5511910000005";
  await msg(tel, "agendar amanhã 9h"); await pedirAte(tel, "Rua Dois, 2");
  const corrida = dele(tel)[0];
  const quando = Date.parse(corrida.agendadaPara!) + 3 * 3_600_000;
  const saidas = () => caixaSimulada(empresa.id).filter((m) => m.telefone === tel && m.texto.startsWith("⏰")).map((m) => m.texto);
  assert.equal(await enviarLembretes(empresa.id, {}, quando - 30 * 60_000), 0, "cedo demais");
  assert.equal(await enviarLembretes(empresa.id, {}, quando - 14 * 60_000), 1);
  assert.match(saidas()[0], /daqui a \*15 minutos\*/);
  assert.equal(await enviarLembretes(empresa.id, {}, quando - 13 * 60_000), 0, "não repete");
  assert.equal(await enviarLembretes(empresa.id, {}, quando - 4 * 60_000), 1);
  assert.match(saidas()[1], /daqui a \*5 minutos\*/);
  assert.equal(saidas().length, 2);
});

test("desligar o agendamento tira a opção do menu", async () => {
  const outra = D.criarEmpresa("Central Sem Agenda", { nomeExibido: "Central Sem Agenda", assistente: { nome: "Bia", tom: "cordial" } });
  A.salvarConfig(outra.id, { ativo: true, provedor: "simulado", instancia: "bot-sem-agenda", agendar: false });
  const r = await receber(outra.id, { id: "z1", telefone: "5511910000009", nome: "Rui", texto: "oi" }, { classificar: async () => null });
  assert.doesNotMatch(r[0], /Agendar/);
  assert.match(r[0], /\*2\* - Falar com o suporte/);
  assert.equal(horarioBrasilia(Date.UTC(2026, 10, 15, 10, 5)), "2026-11-15T07:05");
});
