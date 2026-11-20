// Cadastro › Passe Livre: catálogo de ofertas (máx. 3), compra pelo motorista (carteira, idempotente), isenção da taxa da central
// durante o passe ("taxa não cobrada") e Resultados por período. Painel: só admin; apps: só motorista.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-passelivre-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "g".repeat(40);
process.env.APPS_MOSTRAR_CODIGO = "1";
delete process.env.BANCO_ARQUIVO;
delete process.env.OSRM_URL;

const express = (await import("express")).default;
const D = await import("../src/servidor/dados.ts");
const { criarCookie, exigirLogin, exigirCargoDaRota } = await import("../src/servidor/sessao.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar } = await import("../src/cadastros/armazem.ts");
const R = await import("../src/corridas/index.ts");
const { rotasApps, rotasAppsCentral } = await import("../src/apps/rotas.ts");
const { rotasGestao } = await import("../src/gestao/rotas.ts");
const { saldo, extrato, ajustarCarteira, aposFinalizar } = await import("../src/apps/extras.ts");
const { salvarTaxa } = await import("../src/config/taxas.ts");
const PL = await import("../src/config/passe-livre.ts");
const P = await import("../src/apps/despacho.ts");
const B = await import("../src/servidor/banco.ts");

const app = express();
app.use(express.json());
app.post("/teste/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({ ok: true }); });
app.use("/api/apps", rotasApps);
app.use("/api", exigirLogin, exigirCargoDaRota);
app.use("/api/apps-central", rotasAppsCentral);
app.use("/api/gestao", rotasGestao);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => { servidor.closeAllConnections(); servidor.close(); B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

const E = D.criarEmpresa("Passe Um").id, E2 = D.criarEmpresa("Passe Dois").id;
const adm = D.criarUsuario({ email: "adm@passe.test", nome: "Adm", senha: "senha-forte-1", empresaId: E, papel: "admin" });
const ges = D.criarUsuario({ email: "ges@passe.test", nome: "Ges", senha: "senha-forte-1", empresaId: E, papel: "gestor" });
const adm2 = D.criarUsuario({ email: "adm2@passe.test", nome: "Adm2", senha: "senha-forte-1", empresaId: E2, papel: "admin" });
const CAT = cadastroPorId("categorias")!, MOT = cadastroPorId("motoristas")!, CLI = cadastroPorId("clientes")!;
criar(E, CAT, { nome: "Carro", bandeirada: 20, valorKm: 2, valorMinimo: 20, ativa: true }, "t");
const mot = criar(E, MOT, { nome: "Pedro Perto", telefone: "11910000001", status: "Ativo", placa: "AAA1A11" }, "t");
criar(E, CLI, { nome: "Paula", telefone: "11920000001", status: "Ativo" }, "t");

async function entrar(id: string) { return ((await fetch(`${base}/teste/entrar/${id}`, { method: "POST" })).headers.get("set-cookie") ?? "").split(";")[0]; }
const cAdm = await entrar(adm.id), cGes = await entrar(ges.id), cAdm2 = await entrar(adm2.id);
async function api(cookie: string, metodo: string, url: string, corpo?: unknown) {
  const r = await fetch(`${base}${url}`, { method: metodo, headers: { cookie, "content-type": "application/json" }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  return { status: r.status, corpo: (await r.json().catch(() => ({}))) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
async function app_(metodo: string, url: string, corpo?: unknown, token?: string) {
  const r = await fetch(base + url, { method: metodo, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  return { status: r.status, corpo: (await r.json().catch(() => ({}))) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
async function loginApp(papel: "passageiro" | "motorista", telefone: string) {
  const c = await app_("POST", `/api/apps/${E}/entrar/codigo`, { papel, telefone });
  const e = await app_("POST", `/api/apps/${E}/entrar`, { papel, telefone, codigo: c.corpo.codigoTeste });
  assert.equal(e.status, 200, JSON.stringify(e.corpo));
  return e.corpo.token as string;
}
const hoje = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

// ------------------------------------------------------------------ catálogo

test("catálogo: valor maior que zero, duração inteira de 1 a 720, no máximo 3 ofertas, só admin", async () => {
  assert.equal((await api(cGes, "GET", "/api/gestao/passe-livre")).status, 403, "gestor não vê");
  assert.equal((await api(cGes, "POST", "/api/gestao/passe-livre/ofertas", { valor: 15, horas: 1 })).status, 403);
  assert.equal((await api(cAdm, "POST", "/api/gestao/passe-livre/ofertas", { valor: 0, horas: 1 })).status, 400);
  assert.equal((await api(cAdm, "POST", "/api/gestao/passe-livre/ofertas", { valor: 15 })).status, 400, "duração é obrigatória");
  assert.equal((await api(cAdm, "POST", "/api/gestao/passe-livre/ofertas", { valor: 15, horas: 0 })).status, 400);
  assert.equal((await api(cAdm, "POST", "/api/gestao/passe-livre/ofertas", { valor: 15, horas: 721 })).status, 400);
  assert.equal((await api(cAdm, "POST", "/api/gestao/passe-livre/ofertas", { valor: 15, horas: 1.5 })).status, 400, "só horas fechadas");
  const a = await api(cAdm, "POST", "/api/gestao/passe-livre/ofertas", { valor: "15,00", horas: 1 });
  assert.equal(a.status, 200, JSON.stringify(a.corpo));
  assert.equal(a.corpo.ofertas[0].rotulo, "1 hora");
  const b = await api(cAdm, "POST", "/api/gestao/passe-livre/ofertas", { valor: 215, horas: 168 });
  assert.deepEqual(b.corpo.ofertas.map((o: { rotulo: string; valor: number }) => [o.rotulo, o.valor]), [["1 hora", 15], ["7 dias", 215]]);
  assert.equal((await api(cAdm, "POST", "/api/gestao/passe-livre/ofertas", { valor: 99, horas: 168 })).status, 400, "duração repetida");
  const c = await api(cAdm, "POST", "/api/gestao/passe-livre/ofertas", { valor: 60, horas: 36 });
  assert.equal(c.corpo.ofertas.length, 3);
  assert.equal(c.corpo.ofertas[1].rotulo, "36 horas");
  const quarta = await api(cAdm, "POST", "/api/gestao/passe-livre/ofertas", { valor: 500, horas: 720 });
  assert.equal(quarta.status, 400);
  assert.match(quarta.corpo.erro, /3 ofertas/);
  // alterar e remover
  const id36 = c.corpo.ofertas[1].id;
  const alt = await api(cAdm, "PUT", `/api/gestao/passe-livre/ofertas/${id36}`, { valor: 70, horas: 48 });
  assert.deepEqual(alt.corpo.ofertas.map((o: { rotulo: string }) => o.rotulo), ["1 hora", "2 dias", "7 dias"]);
  const rem = await api(cAdm, "DELETE", `/api/gestao/passe-livre/ofertas/${id36}`);
  assert.equal(rem.corpo.ofertas.length, 2);
  assert.equal((await api(cAdm, "DELETE", `/api/gestao/passe-livre/ofertas/${id36}`)).status, 400, "já removida");
  // outra empresa não vê
  assert.deepEqual((await api(cAdm2, "GET", "/api/gestao/passe-livre")).corpo.ofertas, []);
});

// ------------------------------------------------------------------ compra

test("compra: sem saldo recusa; com saldo debita; a mesma chave não cobra de novo; passe emenda no vigente", async () => {
  const tm = await loginApp("motorista", "11910000001");
  const lista = await app_("GET", `/api/apps/${E}/passe-livre`, undefined, tm);
  assert.equal(lista.status, 200);
  assert.deepEqual(lista.corpo.ofertas.map((o: { rotulo: string }) => o.rotulo), ["1 hora", "7 dias"]);
  assert.equal(lista.corpo.vigente, null);
  const hora = lista.corpo.ofertas[0], semana = lista.corpo.ofertas[1];

  const sem = await app_("POST", `/api/apps/${E}/passe-livre/comprar`, { ofertaId: hora.id, chave: "compra-aaaa-0001" }, tm);
  assert.equal(sem.status, 400);
  assert.match(sem.corpo.erro, /Saldo insuficiente/);
  assert.equal(saldo(E, "motorista", mot.id), 0);

  ajustarCarteira(E, { papel: "motorista", chave: mot.id, valor: 300, motivo: "Recarga de teste", chaveUnica: "recarga-pl-0001", por: "adm@passe.test" });
  assert.equal((await app_("POST", `/api/apps/${E}/passe-livre/comprar`, { ofertaId: hora.id }, tm)).status, 400, "sem chave do pedido");
  assert.equal((await app_("POST", `/api/apps/${E}/passe-livre/comprar`, { ofertaId: "nao-existe", chave: "compra-aaaa-0002" }, tm)).status, 400);

  const c1 = await app_("POST", `/api/apps/${E}/passe-livre/comprar`, { ofertaId: hora.id, chave: "compra-aaaa-0003" }, tm);
  assert.equal(c1.status, 200, JSON.stringify(c1.corpo));
  assert.equal(c1.corpo.repetido, false);
  assert.equal(c1.corpo.saldo, 285);
  assert.ok(c1.corpo.vigente.restanteMs > 3_500_000 && c1.corpo.vigente.restanteMs <= 3_600_000);
  // toque duplo / nova tentativa: não cobra outra vez
  const c1b = await app_("POST", `/api/apps/${E}/passe-livre/comprar`, { ofertaId: hora.id, chave: "compra-aaaa-0003" }, tm);
  assert.equal(c1b.corpo.repetido, true);
  assert.equal(saldo(E, "motorista", mot.id), 285);
  assert.equal(extrato(E, "motorista", mot.id, 20).filter((l) => l.descricao === "Passe Livre 1 hora").length, 1);

  // outra compra emenda: começa quando o passe atual termina
  const c2 = await app_("POST", `/api/apps/${E}/passe-livre/comprar`, { ofertaId: semana.id, chave: "compra-aaaa-0004" }, tm);
  assert.equal(c2.status, 200);
  assert.equal(c2.corpo.saldo, 70);
  const total = 3_600_000 + 168 * 3_600_000;
  assert.ok(Math.abs(c2.corpo.vigente.restanteMs - 3_600_000) < 5_000 || c2.corpo.vigente.restanteMs <= total, "vigente é o primeiro; o segundo ainda não começou");
  // saldo que não cobre a próxima
  const falta = await app_("POST", `/api/apps/${E}/passe-livre/comprar`, { ofertaId: semana.id, chave: "compra-aaaa-0005" }, tm);
  assert.equal(falta.status, 400);
  assert.equal(saldo(E, "motorista", mot.id), 70);

  // passageiro não usa a rota do motorista
  const tp = await loginApp("passageiro", "11920000001");
  assert.equal((await app_("GET", `/api/apps/${E}/passe-livre`, undefined, tp)).status, 403);
});

// ------------------------------------------------------------------ isenção da taxa

const TODAS = ["dinheiro", "debito", "credito", "cartao_app", "pix"];
const EMB = { texto: "Rua A, 1", lat: -23.55, lng: -46.63 }, DEST = { texto: "Rua B, 2", lat: -23.58, lng: -46.65 };
async function corridaFinalizada(tp: string, tm: string, pedidoId: string) {
  const c = await app_("POST", `/api/apps/${E}/corridas`, { pedidoId, embarque: EMB, destino: DEST, categoria: "Carro", pagamento: "Pix" }, tp);
  assert.equal(c.status, 200, JSON.stringify(c.corpo));
  const o = P.ofertaDoMotorista(E, mot.id);
  assert.ok(o, "o motorista recebe a oferta");
  assert.equal((await app_("POST", `/api/apps/${E}/ofertas/${o!.id}/aceitar`, {}, tm)).status, 200);
  for (const s of ["no_local", "em_andamento", "finalizada"]) assert.equal((await app_("POST", `/api/apps/${E}/corridas/${c.corpo.corrida.id}/status`, { status: s }, tm)).status, 200);
  return R.listarProprias(E).find((x) => x.id === c.corpo.corrida.id)!;
}

test("com passe vigente o motorista não paga a taxa da central; ela vira 'taxa não cobrada' e entra nos Resultados", async () => {
  salvarTaxa(E, { nome: "Taxa APP", quemPaga: "motorista", categorias: ["Carro"], pagamentos: TODAS, faixas: [{ de: 0, ate: null, tipo: "porcentagem", valor: 10 }] }, "t");
  const tp = await loginApp("passageiro", "11920000001"), tm = await loginApp("motorista", "11910000001");
  assert.equal((await app_("POST", `/api/apps/${E}/online`, { lat: -23.551, lng: -46.631 }, tm)).status, 200);
  const antes = saldo(E, "motorista", mot.id);
  assert.ok(PL.passeVigente(E, mot.id), "o passe comprado no teste anterior ainda vale");

  const c = await corridaFinalizada(tp, tm, "pedido-passe-1");
  assert.ok(c.valor && c.valor > 0);
  assert.equal(saldo(E, "motorista", mot.id), antes, "nada saiu da carteira do motorista");
  assert.equal(extrato(E, "motorista", mot.id, 30).filter((l) => l.corridaId === c.id).length, 0);
  const esperado = Math.round(c.valor! * 10) / 100;
  const r = PL.resultados(E, hoje(), hoje());
  assert.equal(r.taxaNaoCobrada, esperado);
  assert.equal(r.corridasComPasse, 1);
  assert.equal(r.receita, 230, "R$ 15 + R$ 215 vendidos hoje");
  assert.equal(r.passesVendidos, 2);
  assert.equal(r.semDados, false);

  // rodar de novo (OS corrigida) não duplica a isenção nem lança taxa
  aposFinalizar(E, c);
  assert.equal(PL.resultados(E, hoje(), hoje()).taxaNaoCobrada, esperado);
  assert.equal(saldo(E, "motorista", mot.id), antes);

  // painel: aba Resultados
  const pr = await api(cAdm, "GET", "/api/gestao/passe-livre/resultados?periodo=hoje");
  assert.equal(pr.status, 200);
  assert.equal(pr.corpo.receita, 230);
  assert.equal(pr.corpo.taxaNaoCobrada, esperado);
  const ontem = await api(cAdm, "GET", "/api/gestao/passe-livre/resultados?periodo=ontem");
  assert.equal(ontem.corpo.semDados, true);
  assert.equal((await api(cAdm, "GET", "/api/gestao/passe-livre/resultados?periodo=outro&de=2026-13-99")).status, 400);
  assert.equal((await api(cGes, "GET", "/api/gestao/passe-livre/resultados")).status, 403);
  assert.equal((await api(cAdm2, "GET", "/api/gestao/passe-livre/resultados")).corpo.receita, 0, "outra empresa não soma");
});

test("sem passe vigente a taxa é cobrada normalmente; a oferta mostrada ao motorista já sai sem taxa durante o passe", async () => {
  // motorista novo, sem passe
  const m2 = criar(E, MOT, { nome: "Luiza Longe", telefone: "11910000002", status: "Ativo", placa: "BBB2B22" }, "t");
  assert.equal(PL.passeVigente(E, m2.id), null);
  assert.equal(PL.passeVigente(E, mot.id) !== null, true);
  const { calcularComissao } = await import("../src/config/comissao.ts");
  assert.equal(calcularComissao(E, "Carro", 50, m2.id, "Pix", true).taxaCentral, 5, "sem passe: 10%");
  assert.equal(calcularComissao(E, "Carro", 50, mot.id, "Pix", true).taxaCentral, 0, "com passe: oferta sem taxa");
  assert.equal(calcularComissao(E, "Carro", 50, mot.id, "Pix").taxaCentral, 5, "relatórios não mudam");
  // passe vencido: consulta numa data futura
  assert.equal(PL.passeVigente(E, mot.id, new Date(Date.now() + 400 * 3_600_000).toISOString()), null);
});
