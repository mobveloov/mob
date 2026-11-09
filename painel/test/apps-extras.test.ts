// Funções a mais dos apps (docs/APPS_COMPARACAO.md): paradas, agendamento, favoritos e bloqueios, preferências,
// carteira (saldo, pagamento com saldo, taxa de cancelamento, saque), documentos, desafios e indicação,
// notificações, objeto perdido, reclamação, nota para o passageiro e link de acompanhar.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-extras-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "e".repeat(40);
process.env.APPS_MOSTRAR_CODIGO = "1";
delete process.env.BANCO_ARQUIVO;
delete process.env.OSRM_URL;

const express = (await import("express")).default;
const D = await import("../src/servidor/dados.ts");
const { criarCookie, exigirLogin } = await import("../src/servidor/sessao.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar, listar } = await import("../src/cadastros/armazem.ts");
const R = await import("../src/corridas/index.ts");
const { rotasApps, rotasAppsCentral } = await import("../src/apps/rotas.ts");
const { rotasExtrasCentral } = await import("../src/apps/extras.ts");
const P = await import("../src/apps/despacho.ts");
const B = await import("../src/servidor/banco.ts");

const app = express();
app.use(express.json());
app.post("/teste/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({ ok: true }); });
app.use("/api/apps", rotasApps);
app.use("/api", exigirLogin);
app.use("/api/apps-central", rotasAppsCentral);
app.use("/api/apps-central", rotasExtrasCentral);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => { servidor.closeAllConnections(); servidor.close(); B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

const E = D.criarEmpresa("Extras Um").id, E2 = D.criarEmpresa("Extras Dois").id;
const admin = D.criarUsuario({ email: "adm@extras.test", nome: "Adm", senha: "senha-forte-1", empresaId: E, papel: "admin" });
const CAT = cadastroPorId("categorias")!, MOT = cadastroPorId("motoristas")!;
criar(E, CAT, { nome: "Carro", bandeirada: 5, valorKm: 2, valorMinimo: 8, ativa: true, taxaCancelamento: 4, toleranciaCancelamento: 0 }, "t");
criar(E, CAT, { nome: "Moto", bandeirada: 3, valorKm: 1, ativa: true }, "t");
const perto = criar(E, MOT, { nome: "Pedro Perto", telefone: "11910000001", status: "Ativo", placa: "AAA1A11" }, "t");
const longe = criar(E, MOT, { nome: "Luiza Longe", telefone: "11910000002", status: "Ativo", placa: "BBB2B22" }, "t");

const EMB = { texto: "Rua A, 1", lat: -23.55, lng: -46.63 }, DEST = { texto: "Rua B, 2", lat: -23.58, lng: -46.65 }, PARADA = { texto: "Rua C, 3", lat: -23.6, lng: -46.7 };

async function chamar(metodo: string, url: string, corpo?: unknown, token?: string, extra: Record<string, string> = {}) {
  const cru = corpo instanceof Uint8Array;
  const r = await fetch(base + url, { method: metodo, headers: { ...(corpo !== undefined && !cru ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra }, body: corpo === undefined ? undefined : cru ? (corpo as unknown as BodyInit) : JSON.stringify(corpo) });
  const tipo = r.headers.get("content-type") ?? "";
  return { status: r.status, corpo: tipo.includes("json") ? await r.json() : await r.text() } as { status: number; corpo: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
async function login(empresa: string, papel: "passageiro" | "motorista", telefone: string) {
  const c = await chamar("POST", `/api/apps/${empresa}/entrar/codigo`, { papel, telefone });
  const e = await chamar("POST", `/api/apps/${empresa}/entrar`, { papel, telefone, codigo: c.corpo.codigoTeste });
  assert.equal(e.status, 200, JSON.stringify(e.corpo));
  return e.corpo.token as string;
}
const cookieAdmin = async () => ((await fetch(`${base}/teste/entrar/${admin.id}`, { method: "POST" })).headers.get("set-cookie") ?? "").split(";")[0];

/** Corrida pedida pelo app, aceita pelo motorista e (opcional) levada até um status. */
async function corridaAte(tp: string, tm: string, motoristaId: string, ate: "a_caminho" | "finalizada", corpo: Record<string, unknown> = {}) {
  const c = await chamar("POST", `/api/apps/${E}/corridas`, { pedidoId: `p-${Math.random().toString(36).slice(2, 12)}`, embarque: EMB, destino: DEST, categoria: "Carro", pagamento: "Pix", ...corpo }, tp);
  assert.equal(c.status, 200, JSON.stringify(c.corpo));
  const o = P.ofertaDoMotorista(E, motoristaId);
  assert.ok(o, "o motorista recebe a oferta");
  const a = await chamar("POST", `/api/apps/${E}/ofertas/${o!.id}/aceitar`, {}, tm);
  assert.equal(a.status, 200, JSON.stringify(a.corpo));
  if (ate === "finalizada") for (const s of ["no_local", "em_andamento", "finalizada"]) assert.equal((await chamar("POST", `/api/apps/${E}/corridas/${c.corpo.corrida.id}/status`, { status: s }, tm)).status, 200);
  return c.corpo.corrida.id as string;
}

let tp = "", tm = "", tl = "";
test("preparo: login e motoristas online", async () => {
  tp = await login(E, "passageiro", "11920000001");
  await chamar("POST", `/api/apps/${E}/eu`, { nome: "Paula" }, tp);
  tm = await login(E, "motorista", "11910000001");
  tl = await login(E, "motorista", "11910000002");
  assert.equal((await chamar("POST", `/api/apps/${E}/online`, { lat: -23.551, lng: -46.631 }, tm)).status, 200);
  assert.equal((await chamar("POST", `/api/apps/${E}/online`, { lat: -23.6, lng: -46.7 }, tl)).status, 200);
});

test("paradas: entram no preço pela rota e aparecem para o motorista; no máximo 3", async () => {
  const sem = await chamar("GET", `/api/apps/${E}/estimativa?categoria=Carro&latEmbarque=${EMB.lat}&lngEmbarque=${EMB.lng}&latDestino=${DEST.lat}&lngDestino=${DEST.lng}`, undefined, tp);
  const pedido = await chamar("POST", `/api/apps/${E}/corridas`, { pedidoId: "parada-oferta-1", embarque: EMB, destino: DEST, categoria: "Carro", pagamento: "Pix", paradas: [PARADA] }, tp);
  const oferta = await chamar("GET", `/api/apps/${E}/estado`, undefined, tm);
  assert.equal(oferta.corpo.oferta.corrida.paradas[0].texto, "Rua C, 3", "a oferta já mostra as paradas ao motorista");
  await chamar("POST", `/api/apps/${E}/ofertas/${oferta.corpo.oferta.id}/aceitar`, {}, tm);
  const id = pedido.corpo.corrida.id as string;
  const c = R.listarProprias(E).find((x) => x.id === id)!;
  assert.equal(c.paradas?.length, 1);
  assert.ok(c.estimativa.valor! > sem.corpo.valor, "com parada fica mais caro (caminho maior)");
  const m = await chamar("GET", `/api/apps/${E}/corridas/${id}`, undefined, tm);
  assert.ok(R.listarProprias(E).find((x) => x.id === id), "a corrida existe");
  assert.equal(m.corpo.corrida.paradas[0].texto, "Rua C, 3");
  await chamar("POST", `/api/apps/${E}/corridas/${id}/cancelar`, { motivo: "teste" }, tp);
  const muitas = await chamar("POST", `/api/apps/${E}/corridas`, { pedidoId: "muitas-paradas-1", embarque: EMB, destino: DEST, categoria: "Carro", pagamento: "Pix", paradas: [PARADA, PARADA, PARADA, PARADA] }, tp);
  assert.equal(muitas.status, 400);
  assert.match(muitas.corpo.erro, /3 paradas/);
});

test("agendada: não procura motorista antes da hora e não impede pedir outra agora", async () => {
  const quando = new Date(Date.now() - 3 * 3600_000 + 2 * 3600_000).toISOString().slice(0, 16); // daqui a 2 h (Brasília)
  const ag = await chamar("POST", `/api/apps/${E}/corridas`, { pedidoId: "agendada-0001", embarque: EMB, destino: DEST, categoria: "Carro", pagamento: "Pix", agendadaPara: quando }, tp);
  assert.equal(ag.status, 200, JSON.stringify(ag.corpo));
  assert.equal(P.ofertaDoMotorista(E, perto.id), null, "agendada não vai para o motorista agora");
  const l = await chamar("GET", `/api/apps/${E}/agendadas`, undefined, tp);
  assert.equal(l.corpo.agendadas.length, 1);
  assert.equal((await chamar("GET", `/api/apps/${E}/estado`, undefined, tp)).corpo.corrida, null, "não aparece como corrida atual");
  const cedo = await chamar("POST", `/api/apps/${E}/corridas`, { pedidoId: "agendada-cedo", embarque: EMB, categoria: "Carro", pagamento: "Pix", agendadaPara: new Date(Date.now() - 3 * 3600_000 + 5 * 60_000).toISOString().slice(0, 16) }, tp);
  assert.match(cedo.corpo.erro, /15 minutos/);
  // Pedir agora continua possível
  const id = await corridaAte(tp, tm, perto.id, "finalizada");
  assert.ok(id);
  await chamar("POST", `/api/apps/${E}/corridas/${ag.corpo.corrida.id}/cancelar`, { motivo: "não vou mais" }, tp);
});

test("favorito passa na frente do mais perto; bloqueio tira o motorista das ofertas", async () => {
  const id = await corridaAte(tp, tm, perto.id, "finalizada"); // corrida com o Pedro
  // Corrida com a Luiza (Pedro fica offline um instante)
  await chamar("POST", `/api/apps/${E}/offline`, {}, tm);
  const idL = await corridaAte(tp, tl, longe.id, "finalizada");
  await chamar("POST", `/api/apps/${E}/online`, { lat: -23.551, lng: -46.631 }, tm);
  // Favorita a Luiza: mesmo mais longe, recebe primeiro
  assert.deepEqual((await chamar("POST", `/api/apps/${E}/corridas/${idL}/favorito`, {}, tp)).corpo, { favorito: true, bloqueado: false });
  await corridaAte(tp, tl, longe.id, "finalizada");
  // Bloqueia a Luiza: volta para o Pedro
  assert.deepEqual((await chamar("POST", `/api/apps/${E}/corridas/${idL}/bloquear`, {}, tp)).corpo, { favorito: false, bloqueado: true });
  await corridaAte(tp, tm, perto.id, "finalizada");
  const f = await chamar("GET", `/api/apps/${E}/favoritos`, undefined, tp);
  assert.equal(f.corpo.bloqueados[0].nome, "Luiza Longe");
  await chamar("POST", `/api/apps/${E}/favoritos/${longe.id}/remover`, {}, tp);
  // Motorista bloqueia o passageiro: não recebe mais as corridas dele
  assert.equal((await chamar("POST", `/api/apps/${E}/corridas/${id}/bloquear`, {}, tm)).corpo.bloqueado, true);
  await chamar("POST", `/api/apps/${E}/offline`, {}, tl);
  const c = await chamar("POST", `/api/apps/${E}/corridas`, { pedidoId: "bloq-0001", embarque: EMB, destino: DEST, categoria: "Carro", pagamento: "Pix" }, tp);
  assert.equal(P.ofertaDoMotorista(E, perto.id), null, "quem bloqueou não recebe");
  await chamar("POST", `/api/apps/${E}/corridas/${c.corpo.corrida.id}/cancelar`, { motivo: "teste" }, tp);
  await chamar("POST", `/api/apps/${E}/corridas/${id}/bloquear`, { ligar: false }, tm);
  await chamar("POST", `/api/apps/${E}/online`, { lat: -23.6, lng: -46.7 }, tl);
});

test("preferências: motorista só recebe as categorias que escolheu", async () => {
  const pr = await chamar("GET", `/api/apps/${E}/preferencias`, undefined, tm);
  assert.deepEqual(pr.corpo.podem.sort(), ["Carro", "Moto"]);
  await chamar("POST", `/api/apps/${E}/preferencias`, { categorias: ["Moto"] }, tm);
  await chamar("POST", `/api/apps/${E}/offline`, {}, tl);
  const c = await chamar("POST", `/api/apps/${E}/corridas`, { pedidoId: "pref-0001", embarque: EMB, destino: DEST, categoria: "Carro", pagamento: "Pix" }, tp);
  assert.equal(P.ofertaDoMotorista(E, perto.id), null, "Carro não vai para quem só quer Moto");
  await chamar("POST", `/api/apps/${E}/corridas/${c.corpo.corrida.id}/cancelar`, { motivo: "teste" }, tp);
  await chamar("POST", `/api/apps/${E}/preferencias`, { categorias: [] }, tm);
  await chamar("POST", `/api/apps/${E}/online`, { lat: -23.6, lng: -46.7 }, tl);
});

test("carteira: crédito da central, pagar com saldo, taxa de cancelamento e saque", async () => {
  const ck = await cookieAdmin();
  // Sem saldo, não dá para pagar com saldo
  const sem = await chamar("POST", `/api/apps/${E}/corridas`, { pedidoId: "saldo-0000", embarque: EMB, destino: DEST, categoria: "Carro", pagamento: "Saldo da carteira" }, tp);
  assert.match(sem.corpo.erro, /Saldo insuficiente/);
  // (a passageira já pagou uma taxa de cancelamento no teste das paradas)
  const inicial = (await chamar("GET", `/api/apps/${E}/carteira`, undefined, tp)).corpo.saldo;
  const cr = await chamar("POST", "/api/apps-central/carteiras/lancar", { papel: "passageiro", chave: "(11) 92000-0001", valor: 50, descricao: "Recarga Pix recebida" }, undefined, { cookie: ck });
  assert.equal(cr.corpo.saldo, Math.round((inicial + 50) * 100) / 100);
  await chamar("POST", `/api/apps/${E}/offline`, {}, tl);
  const id = await corridaAte(tp, tm, perto.id, "finalizada", { pagamento: "Saldo da carteira" });
  const valor = R.listarProprias(E).find((x) => x.id === id)!.valor!;
  const cp = await chamar("GET", `/api/apps/${E}/carteira`, undefined, tp);
  assert.equal(cp.corpo.saldo, Math.round((inicial + 50 - valor) * 100) / 100, "a corrida saiu do saldo");
  const motAntes = (await chamar("GET", `/api/apps/${E}/carteira`, undefined, tm)).corpo.extrato.find((l: { descricao: string }) => l.descricao.includes("paga com saldo"));
  assert.equal(motAntes.valor, valor, "e entrou para o motorista");
  const saldoMot = (await chamar("GET", `/api/apps/${E}/carteira`, undefined, tm)).corpo.saldo;
  // Taxa: cancela depois que o motorista aceitou (tolerância 0)
  const id2 = await corridaAte(tp, tm, perto.id, "a_caminho");
  await new Promise((r) => setTimeout(r, 20));
  const can = await chamar("POST", `/api/apps/${E}/corridas/${id2}/cancelar`, { motivo: "desisti" }, tp);
  assert.equal(can.corpo.corrida.taxaCancelamento, 4);
  assert.equal((await chamar("GET", `/api/apps/${E}/carteira`, undefined, tm)).corpo.saldo, Math.round((saldoMot + 4) * 100) / 100, "a taxa foi para o motorista");
  // Saque: reserva o valor; recusado devolve; pago fica
  assert.match((await chamar("POST", `/api/apps/${E}/saques`, { valor: 5, chavePix: "x" }, tm)).corpo.erro, /mínimo|chave/);
  const s1 = await chamar("POST", `/api/apps/${E}/saques`, { valor: 10, chavePix: "pedro@pix.test" }, tm);
  assert.equal(s1.status, 200, JSON.stringify(s1.corpo));
  assert.match((await chamar("POST", `/api/apps/${E}/saques`, { valor: 10, chavePix: "pedro@pix.test" }, tm)).corpo.erro, /já tem um saque/);
  const antes = (await chamar("GET", `/api/apps/${E}/carteira`, undefined, tm)).corpo.saldo;
  await chamar("POST", `/api/apps-central/saques/${s1.corpo.saque.id}/recusar`, { motivo: "chave errada" }, undefined, { cookie: ck });
  assert.equal((await chamar("GET", `/api/apps/${E}/carteira`, undefined, tm)).corpo.saldo, Math.round((antes + 10) * 100) / 100, "recusado volta o valor");
  const s2 = await chamar("POST", `/api/apps/${E}/saques`, { valor: 10, chavePix: "pedro@pix.test" }, tm);
  await chamar("POST", `/api/apps-central/saques/${s2.corpo.saque.id}/pagar`, {}, undefined, { cookie: ck });
  const lista = await chamar("GET", "/api/apps-central/carteiras", undefined, undefined, { cookie: ck });
  assert.ok(lista.corpo.saldos.some((x: { nome: string }) => x.nome === "Pedro Perto"));
  assert.equal(lista.corpo.saques[0].situacao, "Pago");
  await chamar("POST", `/api/apps/${E}/online`, { lat: -23.6, lng: -46.7 }, tl);
});

test("documentos: motorista envia foto ou PDF; central vê, aprova ou recusa com motivo", async () => {
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(200).fill(1)]);
  assert.equal((await chamar("POST", `/api/apps/${E}/documentos/cnh`, jpg, tm, { "content-type": "image/jpeg" })).status, 200);
  assert.equal((await chamar("POST", `/api/apps/${E}/documentos/cnh`, new TextEncoder().encode("<html>"), tm, { "content-type": "image/jpeg" })).status, 400, "arquivo falso é recusado");
  assert.equal((await chamar("POST", `/api/apps/${E}/documentos/qualquer`, jpg, tm, { "content-type": "image/jpeg" })).status, 400);
  const ck = await cookieAdmin();
  const l = await chamar("GET", "/api/apps-central/documentos", undefined, undefined, { cookie: ck });
  assert.equal(l.corpo.motoristas[0].documentos.cnh.situacao, "Enviado");
  const arq = await fetch(`${base}/api/apps-central/documentos/${perto.id}/cnh`, { headers: { cookie: ck } });
  assert.equal(arq.headers.get("content-type"), "image/jpeg");
  assert.equal((await chamar("POST", `/api/apps-central/documentos/${perto.id}/cnh`, { aprovado: false }, undefined, { cookie: ck })).status, 400, "recusa sem motivo não vale");
  await chamar("POST", `/api/apps-central/documentos/${perto.id}/cnh`, { aprovado: false, motivo: "Foto borrada" }, undefined, { cookie: ck });
  const d = await chamar("GET", `/api/apps/${E}/documentos`, undefined, tm);
  assert.deepEqual([d.corpo.documentos.cnh.situacao, d.corpo.documentos.cnh.motivo], ["Recusado", "Foto borrada"]);
  assert.notEqual((await fetch(`${base}/api/apps-central/documentos/${perto.id}/__proto__`, { headers: { cookie: ck } })).status, 200, "tipo estranho não abre nada");
});

test("desafios e indicação: progresso, prêmio na carteira uma vez só, código de indicação", async () => {
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  criar(E, cadastroPorId("desafios")!, { nome: "Meta de 2", tipo: "Desafio de corridas", meta: 2, premio: 30, inicio: hoje, ativo: true }, "t");
  criar(E, cadastroPorId("desafios")!, { nome: "Traga amigos", tipo: "Indicação de passageiro", meta: 1, premio: 5, inicio: hoje, ativo: true }, "t");
  const antes = (await chamar("GET", `/api/apps/${E}/carteira`, undefined, tm)).corpo.saldo;
  const d1 = await chamar("GET", `/api/apps/${E}/desafios`, undefined, tm);
  const meta = d1.corpo.desafios.find((x: { nome: string }) => x.nome === "Meta de 2");
  assert.ok(meta.feito >= 2 && meta.ganho);
  assert.equal((await chamar("GET", `/api/apps/${E}/carteira`, undefined, tm)).corpo.saldo, antes + 30);
  await chamar("GET", `/api/apps/${E}/desafios`, undefined, tm);
  assert.equal((await chamar("GET", `/api/apps/${E}/carteira`, undefined, tm)).corpo.saldo, antes + 30, "prêmio uma vez só");
  // Indicação: amigo usa o código da Paula e faz uma corrida
  const codigo = (await chamar("GET", `/api/apps/${E}/perfil`, undefined, tp)).corpo.codigo;
  assert.match(codigo, /^[A-Z2-9]{6}$/);
  const amigo = await login(E, "passageiro", "11920000002");
  await chamar("POST", `/api/apps/${E}/eu`, { nome: "Amigo" }, amigo);
  assert.match((await chamar("POST", `/api/apps/${E}/perfil`, { indicadoPor: "ZZZZZZ" }, amigo)).corpo.erro, /não encontrado/);
  assert.equal((await chamar("POST", `/api/apps/${E}/perfil`, { indicadoPor: codigo.toLowerCase(), email: "amigo@x.test" }, amigo)).corpo.indicadoPor, codigo);
  assert.match((await chamar("POST", `/api/apps/${E}/perfil`, { indicadoPor: codigo }, amigo)).corpo.erro, /já foi informado/);
  await chamar("POST", `/api/apps/${E}/offline`, {}, tl);
  await corridaAte(amigo, tm, perto.id, "finalizada");
  const ind = (await chamar("GET", `/api/apps/${E}/desafios`, undefined, tp)).corpo.desafios.find((x: { nome: string }) => x.nome === "Traga amigos");
  assert.deepEqual([ind.feito, ind.ganho], [1, true]);
  await chamar("POST", `/api/apps/${E}/online`, { lat: -23.6, lng: -46.7 }, tl);
});

test("notificações da central, objeto perdido, reclamação e nota para o passageiro", async () => {
  criar(E, cadastroPorId("notificacoes")!, { titulo: "Promoção", texto: "10% hoje", publico: "Passageiros", ativa: true }, "t");
  criar(E, cadastroPorId("notificacoes")!, { titulo: "Reunião", texto: "Sábado", publico: "Motoristas", ativa: true }, "t");
  criar(E, cadastroPorId("notificacoes")!, { titulo: "Antiga", texto: "x", publico: "Todos", ativa: false }, "t");
  assert.deepEqual((await chamar("GET", `/api/apps/${E}/notificacoes`, undefined, tp)).corpo.notificacoes.map((n: { titulo: string }) => n.titulo), ["Promoção"]);
  assert.deepEqual((await chamar("GET", `/api/apps/${E}/notificacoes`, undefined, tm)).corpo.notificacoes.map((n: { titulo: string }) => n.titulo), ["Reunião"]);
  await chamar("POST", `/api/apps/${E}/offline`, {}, tl);
  const id = await corridaAte(tp, tm, perto.id, "finalizada");
  assert.equal((await chamar("POST", `/api/apps/${E}/corridas/${id}/objeto`, { descricao: "Guarda-chuva azul" }, tp)).status, 200);
  assert.equal((await chamar("POST", `/api/apps/${E}/corridas/${id}/ocorrencia`, { assunto: "Cobrança", descricao: "O valor veio maior que o estimado." }, tp)).status, 200);
  const objetos = listar(E, cadastroPorId("objetos")!), ocorr = listar(E, cadastroPorId("ocorrencias")!);
  assert.equal(objetos.at(-1)!.descricao, "Guarda-chuva azul");
  assert.equal(ocorr.at(-1)!.assunto, "Cobrança");
  assert.equal(listar(E2, cadastroPorId("objetos")!).length, 0, "outra empresa não vê");
  const n = await chamar("POST", `/api/apps/${E}/corridas/${id}/avaliar-passageiro`, { nota: 4, comentario: "Educado" }, tm);
  assert.deepEqual(n.corpo.avaliacaoPassageiro, { nota: 4, comentario: "Educado" });
  assert.equal((await chamar("POST", `/api/apps/${E}/corridas/${id}/avaliar-passageiro`, { nota: 5 }, tm)).status, 400, "uma vez só");
  assert.equal((await chamar("POST", `/api/apps/${E}/corridas/${id}/avaliar-passageiro`, { nota: 5 }, tp)).status, 403, "passageiro não usa");
  const av = await chamar("POST", `/api/apps/${E}/corridas/${id}/avaliar`, { nota: 5, comentario: "Ótima viagem" }, tp);
  assert.equal(av.corpo.corrida.comentario, "Ótima viagem");
  await chamar("POST", `/api/apps/${E}/online`, { lat: -23.6, lng: -46.7 }, tl);
});

test("compartilhar: link público mostra só o essencial e para de valer", async () => {
  await chamar("POST", `/api/apps/${E}/offline`, {}, tl);
  const id = await corridaAte(tp, tm, perto.id, "a_caminho");
  const c = await chamar("GET", `/api/apps/${E}/corridas/${id}`, undefined, tp);
  const link = c.corpo.corrida.compartilhar as string;
  assert.match(link, /^acompanhar\//);
  const pag = await fetch(`${base}/api/apps/${E}/${link}`);
  const html = await pag.text();
  assert.equal(pag.status, 200);
  assert.match(html, /Motorista a caminho/);
  assert.match(html, /Pedro/);
  assert.doesNotMatch(html, /11920000001|11910000001|AAA1A11/, "sem telefone nem placa");
  assert.equal((await chamar("GET", `/api/apps/${E}/corridas/${id}`, undefined, tm)).corpo.corrida.compartilhar, null, "o motorista não recebe o link");
  assert.match(await (await fetch(`${base}/api/apps/${E}/acompanhar/codigo-que-nao-existe`)).text(), /não vale mais/);
  assert.match(await (await fetch(`${base}/api/apps/${E2}/${link}`)).text(), /não vale mais/, "link de uma empresa não abre na outra");
  await chamar("POST", `/api/apps/${E}/corridas/${id}/cancelar`, { motivo: "teste" }, tp);
  await chamar("POST", `/api/apps/${E}/online`, { lat: -23.6, lng: -46.7 }, tl);
});
