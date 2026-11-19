// Prêmios (roleta e raspadinha): regras puras, convite, sorteio, cupom no cadastro, link aberto por telefone e gancho do CRM.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

process.env.DADOS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "totem-premios-"));
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "t".repeat(40);

const express = (await import("express")).default;
const D = await import("../src/servidor/dados.ts");
const { criarCookie, exigirLogin } = await import("../src/servidor/sessao.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar, listar } = await import("../src/cadastros/armazem.ts");
const { rotasTotem } = await import("../src/totem/rotas.ts");
const J = await import("../src/totem/premios-jogos.ts");
const PR = await import("../src/totem/premios.ts");
const { caixaSimulada } = await import("../src/bot/provedores.ts");

// ------------------------------------------------------------------ regras puras

test("configuração: padrões, limites e a soma das chances nunca passa de 100", () => {
  const d = J.configPadrao("roleta");
  assert.equal(d.title, "Gire e ganhe desconto!");
  assert.equal(J.configPadrao("raspadinha").button_text, "Raspar agora");
  const c = J.normalizarConfig("roleta", { prizes: [{ label: "A", type: "percent", value: 500, chance: 70 }, { label: "B", type: "fixed", value: 0, chance: 70 }, { label: "C", type: "xx", chance: 5 }], times_per_day: 9, every_n_days: 99, color: "azul", days: [1, 1, 9, "3"] });
  assert.equal(c.prizes[0].value, 100);
  assert.equal(c.prizes[1].value, 0.5);
  assert.equal(c.prizes[1].chance, 30); // só sobrou 30 do orçamento
  assert.equal(c.prizes[2].type, "none");
  assert.equal(c.prizes[2].chance, 0);
  assert.equal(c.times_per_day, 3);
  assert.equal(c.every_n_days, 30);
  assert.equal(c.color, "#D4A017");
  assert.deepEqual(c.days, [1, 3]);
  assert.deepEqual(J.normalizarConfig("roleta", null), d);
  assert.deepEqual(J.resumoDasChances(c.prizes), { coupon: 100, nothing: 0 });
});

test("sorteio: cada faixa de chance sai no seu intervalo; o resto vira 'não foi dessa vez'", () => {
  const p = [{ label: "A", type: "percent", value: 10, chance: 10 }, { label: "Nada", type: "none", value: 0, chance: 0 }, { label: "B", type: "fixed", value: 5, chance: 20 }] as import("../src/totem/premios-jogos.ts").Premio[];
  assert.equal(J.sortearPremio(p, 0), 0);
  assert.equal(J.sortearPremio(p, 0.099), 0);
  assert.equal(J.sortearPremio(p, 0.1), 2);
  assert.equal(J.sortearPremio(p, 0.299), 2);
  assert.equal(J.sortearPremio(p, 0.3), 1);
  assert.equal(J.sortearPremio(p, 1), 1);
  assert.equal(J.sortearPremio([p[0]], 0.9), -1); // sem prêmio "nada": o jogo mostra "não foi dessa vez"
  let ganhou = 0;
  for (let i = 0; i < 4000; i++) if (J.sortearPremio(p, J.aleatorioSeguro()) !== 1) ganhou++;
  assert.ok(ganhou > 1000 && ganhou < 1400, `esperava ~30%, deu ${ganhou / 40}%`);
});

test("agenda: horários (6 h entre eles), janela de 30 min, dias e uma vez por horário", () => {
  const cfg = { ...J.configPadrao("roleta"), schedule_enabled: true, invites_enabled: true, send_time: "14:00", times_per_day: 3, days: [1, 2, 3, 4, 5] };
  assert.deepEqual(J.horariosDeEnvio(cfg), ["14:00", "20:00"]); // o 3º passaria da meia-noite
  assert.equal(J.horarioVencido(cfg, "2026-11-10", 2, "14:10", null), 0);
  assert.equal(J.horarioVencido(cfg, "2026-11-10", 2, "14:30", null), null);
  assert.equal(J.horarioVencido(cfg, "2026-11-10", 2, "20:05", "2026-11-10#0"), 1);
  assert.equal(J.horarioVencido(cfg, "2026-11-10", 2, "14:10", "2026-11-10#0"), null);
  assert.equal(J.horarioVencido(cfg, "2026-11-08", 0, "14:10", null), null); // domingo fora dos dias
  assert.equal(J.horarioVencido({ ...cfg, schedule_enabled: false }, "2026-11-10", 2, "14:10", null), null);
  assert.equal(J.diasAntes("2026-03-01", 1), "2026-02-28");
});

test("cupom: código sem letras que confundem; primeiro nome; token de 40 caracteres; texto do WhatsApp", () => {
  assert.match(J.codigoDoCupom("roleta"), /^ROLETA[A-HJ-NP-Z2-9]{6}$/);
  assert.match(J.codigoDoCupom("raspadinha"), /^RASPA[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(J.primeiroNome("maria da silva"), "MARIA");
  assert.equal(J.primeiroNome("A"), "");
  assert.match(J.novoToken(), /^[0-9a-f]{40}$/);
  const t = J.textoDoCupom(null, { nome: "MARIA SILVA", premio: "10% OFF", cupom: "ROLETAAB23CD", validDays: 3, origem: "roleta" }, new Date("2026-11-10T15:00:00Z"));
  assert.match(t, /Olá, Maria!/);
  assert.match(t, /\*10% OFF\* na Roleta/);
  assert.match(t, /até 13\/11\./);
  assert.match(J.textoDoCupom("Seu código", { premio: "x", cupom: "ABC", validDays: 1, origem: "pontos" }), /\nCupom: \*ABC\*$/);
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

const A = D.criarEmpresa("Rota Norte"), B = D.criarEmpresa("Leva Sul");
const admin = D.criarUsuario({ email: "a@a.test", nome: "Ana", senha: "senha-forte-1", empresaId: A.id, papel: "admin" });
const oper = D.criarUsuario({ email: "o@a.test", nome: "Otávio", senha: "senha-forte-2", empresaId: A.id, papel: "operador" });
criar(A.id, cadastroPorId("clientes")!, { nome: "Maria Souza", telefone: "11988887777", status: "Ativo" }, "teste");
criar(A.id, cadastroPorId("clientes")!, { nome: "Bruno Bloqueado", telefone: "11977776666", status: "Bloqueado" }, "teste");
const cookie = async (id: string) => ((await fetch(`${url.replace("/api", "")}/teste/entrar/${id}`, { method: "POST" })).headers.get("set-cookie") ?? "").split(";")[0];
async function pedir(caminho: string, o: { metodo?: string; corpo?: unknown; cookie?: string } = {}) {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (o.cookie) h.cookie = o.cookie;
  const r = await fetch(`${url}${caminho}`, { method: o.metodo ?? (o.corpo ? "POST" : "GET"), headers: h, body: o.corpo ? JSON.stringify(o.corpo) : undefined });
  const texto = await r.text();
  return { status: r.status, corpo: JSON.parse(texto || "{}"), texto };
}
const pub = (e: string, rota: string, corpo: unknown) => pedir(`/totem/premios/publico/${e}/${rota}`, { corpo });
let ca = "", co = "";
const ganhos: Array<{ jogo: string; cupom: string | null }> = [];

test("painel dos prêmios: só admin; salvar config; chances; números do dia", async () => {
  ca = await cookie(admin.id); co = await cookie(oper.id);
  assert.equal((await pedir("/totem/premios", { cookie: co })).status, 403);
  assert.equal((await pedir("/totem/premios")).status, 401);
  const p = await pedir("/totem/premios", { cookie: ca });
  assert.deepEqual(p.corpo.jogos.map((j: { kind: string }) => j.kind), ["roleta", "raspadinha"]);
  assert.equal(p.corpo.jogos[0].saved, false);
  assert.equal((await pedir("/totem/premios/outro", { metodo: "PUT", corpo: {}, cookie: ca })).status, 400);
  // Todos os prêmios ganham: o sorteio é previsível nos testes.
  const cfg = { ...J.configPadrao("roleta"), invites_enabled: true, prizes: [{ label: "20% OFF", type: "percent", value: 20, chance: 100 }], coupon_valid_days: 5 };
  const s = await pedir("/totem/premios/roleta", { metodo: "PUT", corpo: { config: cfg }, cookie: ca });
  assert.equal(s.status, 200, s.texto);
  assert.equal(s.corpo.config.prizes[0].chance, 100);
  const p2 = (await pedir("/totem/premios", { cookie: ca })).corpo.jogos[0];
  assert.equal(p2.saved, true);
  assert.deepEqual(p2.odds, { coupon: 100, nothing: 0 });
  await pedir("/totem/premios/raspadinha", { metodo: "PUT", corpo: { config: { prizes: [{ label: "Nada", type: "none", chance: 0 }] } }, cookie: ca });
});

test("link aberto: o telefone precisa ser de passageiro ativo; o link vai pelo WhatsApp; reenvio limitado; sem vazar o token", async () => {
  PR.definirGanchoPremio((g) => ganhos.push({ jogo: g.jogo, cupom: g.cupom }));
  assert.equal((await pub(A.id, "abrir", { kind: "roleta", telefone: "123" })).status, 400);
  assert.equal((await pub(A.id, "abrir", { kind: "xx", telefone: "11988887777" })).status, 400);
  const IGUAL = { status: 200, corpo: { sent: true } };
  for (const tel of ["(11) 95555-4444", "11977776666"]) { const x = await pub(A.id, "abrir", { kind: "roleta", telefone: tel }); assert.deepEqual({ status: x.status, corpo: x.corpo }, IGUAL, "desconhecido ou bloqueado: mesma resposta"); }
  assert.equal((await pub("nao-existe", "abrir", { kind: "roleta", telefone: "11988887777" })).status, 404); // empresa inexistente
  assert.deepEqual((await pub(B.id, "abrir", { kind: "roleta", telefone: "11988887777" })).corpo, { sent: true }); // passageiro é da outra empresa: mesma resposta, nada enviado
  assert.ok(!caixaSimulada(B.id).length, "nada saiu pela outra empresa");
  const r = await pub(A.id, "abrir", { kind: "roleta", telefone: "(11) 98888-7777" });
  assert.equal(r.status, 200, r.texto);
  assert.deepEqual(r.corpo, { sent: true });
  assert.ok(!r.texto.includes("/p/")); // o link NÃO volta na resposta
  const msg = caixaSimulada(A.id).find((m) => m.telefone === "11988887777");
  assert.ok(msg, "o link tem que sair pelo WhatsApp");
  assert.match(msg!.texto, new RegExp(`/p/${A.id}/[0-9a-f]{40}`));
  assert.deepEqual((await pub(A.id, "abrir", { kind: "roleta", telefone: "11988887777" })).corpo, { sent: true }); // reenvio recente: mesma resposta
});

let token = "";
test("jogar: info sem as chances, sorteia uma vez só, cria o cupom do passageiro e manda pelo WhatsApp", async () => {
  token = /\/p\/[^/]+\/([0-9a-f]{40})/.exec(caixaSimulada(A.id).find((m) => m.telefone === "11988887777")!.texto)![1];
  assert.equal((await pub(A.id, "info", { token: "x" })).status, 404);
  assert.equal((await pub(B.id, "info", { token })).status, 404); // outro convite de outra empresa não abre
  const i = await pub(A.id, "info", { token });
  assert.equal(i.status, 200, i.texto);
  assert.equal(i.corpo.first_name, "MARIA");
  assert.equal(i.corpo.game.kind, "roleta");
  assert.equal(i.corpo.result, null);
  assert.ok(!i.texto.includes("chance"));
  const [a, b] = await Promise.all([pub(A.id, "play", { token }), pub(A.id, "play", { token })]);
  assert.equal(a.status, 200, a.texto);
  assert.deepEqual(a.corpo.result, b.corpo.result); // dois cliques, um prêmio
  assert.equal(a.corpo.result.prize.label, "20% OFF");
  const codigo = a.corpo.result.code as string;
  assert.match(codigo, /^ROLETA/);
  const cupom = listar(A.id, cadastroPorId("cupons")!).find((c) => c.codigo === codigo)!;
  assert.equal(cupom.tipoDesconto, "Percentual");
  assert.equal(cupom.valor, 20);
  assert.equal(cupom.limiteUsos, 1);
  assert.equal(cupom.clienteTelefone, "11988887777");
  assert.equal(cupom.ativo, true);
  assert.equal(listar(A.id, cadastroPorId("cupons")!).filter((c) => String(c.codigo).startsWith("ROLETA")).length, 1);
  assert.equal(ganhos.length, 1); // o gancho do CRM recebeu um prêmio só
  assert.equal(ganhos[0].cupom, codigo);
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(caixaSimulada(A.id).some((m) => m.texto.includes(codigo)), "o cupom também sai pelo WhatsApp");
  // Depois de jogar: mostra o mesmo resultado e o link aberto diz que já jogou.
  assert.equal((await pub(A.id, "info", { token })).corpo.result.code, codigo);
  assert.deepEqual((await pub(A.id, "abrir", { kind: "roleta", telefone: "11988887777" })).corpo, { sent: true }); // já jogou: mesma resposta
});

test("convite vencido não joga; 'Não foi dessa vez' não cria cupom; convite manual e enviar agora", async () => {
  const a = JSON.parse(fs.readFileSync(path.join(process.env.DADOS_DIR!, "empresas", A.id, "totem", "premios.json"), "utf8"));
  a.convites.push({ ...a.convites[0], token: "e".repeat(40), jogadoEm: null, expiraEm: "2020-01-01T00:00:00Z", dataLocal: "2020-01-01", jogo: "roleta" });
  fs.writeFileSync(path.join(process.env.DADOS_DIR!, "empresas", A.id, "totem", "premios.json"), JSON.stringify(a));
  assert.equal((await pub(A.id, "play", { token: "e".repeat(40) })).status, 410);
  assert.equal((await pub(A.id, "info", { token: "e".repeat(40) })).corpo.expired, true);
  // Raspadinha só com "Nada": ninguém ganha cupom.
  const m = await pedir("/totem/premios/raspadinha/convite", { corpo: { telefone: "11988887777", nome: "Maria" }, cookie: ca });
  assert.equal(m.status, 200, m.texto);
  const t2 = /\/p\/[^/]+\/([0-9a-f]{40})$/.exec(m.corpo.link)![1];
  const antes = listar(A.id, cadastroPorId("cupons")!).length;
  const j = await pub(A.id, "play", { token: t2 });
  assert.equal(j.corpo.result.code, null);
  assert.equal(j.corpo.result.prize.type, "none");
  assert.equal(listar(A.id, cadastroPorId("cupons")!).length, antes);
  assert.equal((await pedir("/totem/premios/raspadinha/convite", { corpo: { telefone: "1" }, cookie: ca })).status, 400);
  assert.equal((await pedir("/totem/premios/raspadinha/convite", { corpo: { telefone: "11988887777" }, cookie: co })).status, 403);
  // Enviar agora: só passageiros ativos que ainda não receberam; precisa de "Disparar convites" ligado.
  assert.equal((await pedir("/totem/premios/raspadinha/enviar-agora", { corpo: {}, cookie: ca })).status, 400);
  await pedir("/totem/premios/raspadinha", { metodo: "PUT", corpo: { config: { invites_enabled: true, prizes: [{ label: "Nada", type: "none" }] } }, cookie: ca });
  criar(A.id, cadastroPorId("clientes")!, { nome: "Carla", telefone: "11966665555", status: "Ativo" }, "teste");
  const e = await pedir("/totem/premios/raspadinha/enviar-agora", { corpo: {}, cookie: ca });
  assert.equal(e.status, 200, e.texto);
  assert.equal(e.corpo.enviados, 1); // Maria já tinha convite hoje; o bloqueado não recebe
  assert.ok(caixaSimulada(A.id).some((x) => x.telefone === "11966665555"));
  assert.equal((await pedir("/totem/premios/raspadinha/enviar-agora", { corpo: {}, cookie: ca })).corpo.enviados, 0);
});

test("travas do CRM: descadastrado não recebe; pausa geral segura; fora da janela e teto (WhatsApp de verdade) param o lote", async () => {
  const L = await import("../src/crm/limites.ts");
  const T = await import("../src/crm/templates.ts");
  const C = D.criarEmpresa("Travas Premio");
  criar(C.id, cadastroPorId("clientes")!, { nome: "Saiu", telefone: "11911110001", status: "Ativo" }, "teste");
  criar(C.id, cadastroPorId("clientes")!, { nome: "Fica", telefone: "11911110002", status: "Ativo" }, "teste");
  PR.salvarConfigDoJogo(C.id, "roleta", { ...J.configPadrao("roleta"), invites_enabled: true });
  T.descadastrar(C.id, { telefone: "11911110001", origem: "teste" });
  // Pausa geral: ninguém recebe e nenhum convite fica "preso" (volta a valer quando continuar)
  L.definirPausaGeral(C.id, true, "t");
  const parado = await PR.enviarAgora(C.id, "roleta", "http://x");
  assert.equal(parado.enviados, 0);
  L.definirPausaGeral(C.id, false, "t");
  const r = await PR.enviarAgora(C.id, "roleta", "http://x");
  assert.equal(r.enviados, 1, "só quem não saiu da lista");
  assert.ok(!caixaSimulada(C.id).some((m) => m.telefone === "11911110001"));
  assert.ok(caixaSimulada(C.id).some((m) => m.telefone === "11911110002"));
  // Travas de WhatsApp de verdade (a função pura): fora da janela
  L.salvarGovernanca(C.id, { janelaInicio: "08:00", janelaFim: "21:00" });
  const madrugada = Date.UTC(2026, 10, 10, 6, 0); // 03:00 em Brasília
  assert.match(PR.travasDoCrm(C.id, "11911110002", { real: true, agora: madrugada })?.erro ?? "", /janela/i);
  assert.equal(PR.travasDoCrm(C.id, "11911110002", { real: false, agora: madrugada }), null, "o simulado não segue horário");
  assert.match(PR.travasDoCrm(C.id, "11911110001", { real: false })?.erro ?? "", /Descadastrado/);
});
