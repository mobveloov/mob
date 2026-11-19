// Teste portado do sistema de referência (regras do bot), sem alterar as regras.
import { parseScheduleWhen, formatScheduleBR, SCHEDULE_MIN_MINUTES } from "../src/bot/agendamento-texto.ts";
import assert from "node:assert/strict";

// "Agora": quarta-feira, 30/09/2026, 15:00 em Brasilia (UTC-3) = 18:00 UTC.
const NOW = Date.UTC(2026, 8, 30, 18, 0);

type Case = [string, string]; // frase, esperado "DD/MM/YYYY HH:mm" ou "ERRO:motivo"
const casos: Case[] = [
  ["amanhã 7h", "01/10/2026 07:00"],
  ["amanha as 7:30", "01/10/2026 07:30"],
  ["amanhã às 18h", "01/10/2026 18:00"],
  ["hoje 18:30", "30/09/2026 18:30"],
  ["hoje às 18h30", "30/09/2026 18:30"],
  ["depois de amanhã 6 da manhã", "02/10/2026 06:00"],
  ["sexta 18h", "02/10/2026 18:00"],
  ["sexta-feira às 18:00", "02/10/2026 18:00"],
  ["segunda 8h", "05/10/2026 08:00"],
  ["quarta 20h", "30/09/2026 20:00"],      // hoje e quarta, ainda da tempo
  ["quarta 14h", "07/10/2026 14:00"],      // 14h de hoje ja passou: proxima quarta
  ["05/10 14h", "05/10/2026 14:00"],
  ["05/10 as 14:30", "05/10/2026 14:30"],
  ["dia 5 as 14h", "05/10/2026 14:00"],
  ["dia 1 às 9h", "01/10/2026 09:00"],
  ["3 da tarde amanhã", "01/10/2026 15:00"],
  ["amanhã 7 da noite", "01/10/2026 19:00"],
  ["amanhã 7 da manhã", "01/10/2026 07:00"],
  ["amanhã 12 da noite", "01/10/2026 00:00"],
  ["amanhã meio dia", "01/10/2026 12:00"],
  ["amanhã meia noite", "01/10/2026 00:00"],
  ["amanhã 5h", "01/10/2026 05:00"],       // "5h" explicito vale 05:00
  ["amanhã as 5", "ERRO:ambiguous_hour"],   // "as 5" sem periodo: pergunta
  ["amanhã 5 da tarde", "01/10/2026 17:00"],
  ["amanhã 17h", "01/10/2026 17:00"],
  ["em 2 horas", "30/09/2026 17:00"],
  ["daqui a 45 minutos", "30/09/2026 15:45"],
  ["em 10 minutos", "ERRO:too_soon"],
  ["hoje 15:10", "ERRO:too_soon"],
  ["hoje 15:30", "30/09/2026 15:30"],
  ["hoje 15:15", "30/09/2026 15:15"],       // exatamente 15 min: vale
  ["hoje 14h", "ERRO:too_soon"],
  ["15/10 10h", "ERRO:too_far"],
  ["dia 20 as 8h", "ERRO:too_far"],
  ["32/10 10h", "ERRO:bad_date"],
  ["amanhã", "ERRO:no_time"],
  ["quero agendar", "ERRO:no_time"],
  ["às 19h", "30/09/2026 19:00"],           // so a hora: hoje, ainda da tempo
  ["às 8h", "01/10/2026 08:00"],            // so a hora: 8h de hoje passou, amanha
  ["amanhã 07:00", "01/10/2026 07:00"],
  ["Amanhã às 7h da manhã, por favor", "01/10/2026 07:00"],
  ["sábado 10h", "03/10/2026 10:00"],
  ["domingo 9h", "04/10/2026 09:00"],
  ["amanhã 25h", "ERRO:no_time"],
  // "h" depois dos minutos (caso real: "Hoje as 16:50h" nao era entendido)
  ["hoje as 18:30h", "30/09/2026 18:30"],
  ["amanhã 7:30h", "01/10/2026 07:30"],
  ["amanhã às 18:30hs", "01/10/2026 18:30"],
  ["hoje 17:00 horas", "30/09/2026 17:00"],
  ["hoje as 14:50h", "ERRO:too_soon"],
];

let ok = 0;
const falhas: string[] = [];
for (const [frase, esperado] of casos) {
  const r = parseScheduleWhen(frase, NOW);
  let obtido: string;
  if (r.ok) {
    const d = new Date(r.whenMs - 3 * 3600_000), p2 = (n: number) => String(n).padStart(2, "0"); // horário de Brasília
    obtido = `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
  } else obtido = `ERRO:${r.reason}`;
  if (obtido === esperado) ok++; else falhas.push(`${frase.padEnd(40)} esperado ${esperado} | obtido ${obtido}`);
}
if (falhas.length) { console.log(falhas.join("\n")); }
assert.equal(falhas.length, 0, `${falhas.length} caso(s) falharam`);
assert.equal(formatScheduleBR(Date.UTC(2026, 9, 1, 10, 0)), "quinta-feira, 01/10 às 07:00");
assert.equal(SCHEDULE_MIN_MINUTES, 15);
console.log(`ok: ${ok}/${casos.length} frases de agendamento`);

// ── horario dentro do pedido da corrida ──
{
  const { scheduleInRideText } = await import("../src/bot/agendamento-texto.ts");
  // agora: quarta 30/09 15:00 (Brasilia)
  const fmt = (r: ReturnType<typeof scheduleInRideText>) =>
    !r ? "AGORA" : r.when.ok ? `${new Date(r.when.whenMs - 3 * 3600_000).toISOString().slice(11, 16)} | ${r.text}` : `ERRO:${r.when.reason} | ${r.text}`;
  const pedidos: Array<[string, string]> = [
    ["Bom dia me manda o Uber na rua Patrícia Ferreira número 556 bairro São Lourenço às 17:45 horas",
      "17:45 | Bom dia me manda o Uber na rua Patrícia Ferreira número 556 bairro São Lourenço"],
    ["rua 13 de maio 120 às 18h", "18:00 | rua 13 de maio 120"],
    ["Avenida 9 de Julho, 45, amanhã às 7 da manhã", "07:00 | Avenida 9 de Julho, 45"],
    ["me busca na rua acre 300 as 8 da noite", "20:00 | me busca na rua acre 300"],
    ["rua acre 300 hoje às 19h30", "19:30 | rua acre 300"],
    ["rua acre 300 às 15:10", "ERRO:too_soon | rua acre 300"],
    ["rua acre 300 às 15:20", "15:20 | rua acre 300"],
    ["rua acre 300 daqui a 2 horas", "17:00 | rua acre 300"],
    ["rua acre 300 às 5", "ERRO:ambiguous_hour | rua acre 300"],
    // sem hora clara: corrida agora
    ["Rua Patrícia Ferreira número 556 bairro São Lourenço", "AGORA"],
    ["rua 7 de setembro 556", "AGORA"],
    ["rua 15 de novembro, 10", "AGORA"],
    ["rua acre 300 apto 12", "AGORA"],
    ["Bom dia, rua das flores 20", "AGORA"],
  ];
  for (const [frase, esperado] of pedidos) assert.equal(fmt(scheduleInRideText(frase, NOW)), esperado, frase);
  console.log(`ok: ${pedidos.length} pedidos com/sem horario`);
}

// ── hora falada (audio) e correcao de horario ──
{
  const { spokenTimeToDigits, scheduleInRideText, scheduleOnlyText } = await import("../src/bot/agendamento-texto.ts");
  assert.equal(spokenTimeToDigits("Não, é para meio dia e vinte"), "Não, é para 12:20");
  assert.equal(spokenTimeToDigits("às oito e meia da noite"), "às 8:30 da noite");
  assert.equal(spokenTimeToDigits("as 8 e 20"), "as 8:20");
  assert.equal(spokenTimeToDigits("as dez horas e quinze"), "as 10:15");
  assert.equal(spokenTimeToDigits("às vinte e uma horas"), "às 21");
  assert.equal(spokenTimeToDigits("duas da tarde"), "2 da tarde");
  assert.equal(spokenTimeToDigits("Rua Sete de Setembro 556"), "Rua Sete de Setembro 556", "endereco fica igual");
  assert.equal(spokenTimeToDigits("rua quinze de novembro e meia"), "rua quinze de novembro e meia");
  const hhmm = (w: ReturnType<typeof scheduleOnlyText>) => !w ? "NAO" : w.ok ? new Date(w.whenMs - 3 * 3600_000).toISOString().slice(11, 16) : `ERRO:${w.reason}`;
  // agora: quarta 30/09 15:00
  assert.equal(hhmm(scheduleOnlyText("Não, é para meio dia e vinte", NOW)), "12:20"); // 12:20 de amanha (hoje ja passou)
  assert.equal(hhmm(scheduleOnlyText("é às 18:30", NOW)), "18:30");
  assert.equal(hhmm(scheduleOnlyText("às oito da noite por favor", NOW)), "20:00");
  assert.equal(hhmm(scheduleOnlyText("Rua Acre 300", NOW)), "NAO");
  assert.equal(hhmm(scheduleOnlyText("Rua Acre 300 às 18h", NOW)), "NAO", "tem endereco: nao e so horario");
  assert.equal(hhmm(scheduleOnlyText("vou para o centro", NOW)), "NAO");
  const r = scheduleInRideText("me busca na rua acre 300 às oito e meia da noite", NOW);
  assert.ok(r && r.when.ok && r.text === "me busca na rua acre 300");
  console.log("ok: hora falada e correcao de horario");
}

// (20/10/2026) hora com ponto ("Hoje 19.55", conversa real): entende como 19:55
{
  const base = Date.parse("2026-10-20T22:00:00Z"); // 19:00 em Brasilia
  const a = parseScheduleWhen("Hoje 19.55", base);
  assert.ok(a.ok && a.whenMs === Date.parse("2026-10-20T22:55:00Z"), JSON.stringify(a));
  const b = parseScheduleWhen("Hoje terça-feira 19.55", base);
  assert.ok(b.ok && b.whenMs === Date.parse("2026-10-20T22:55:00Z"), JSON.stringify(b));
  const c = parseScheduleWhen("amanha 7.30", base);
  assert.ok(c.ok && c.whenMs === Date.parse("2026-10-21T10:30:00Z"), JSON.stringify(c));
  console.log("scheduleParse hora com ponto ok");
}
