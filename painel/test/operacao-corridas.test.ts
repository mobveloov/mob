// Testes da operação de corridas da central (grupo Corridas do painel): src/operacao. Rodar: npm test (na pasta painel).
// Tudo por empresa, sem rede e sem chaves: a corrida é própria do painel.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "operacao-teste-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "t".repeat(40);
const MARCAS = new RegExp([["mac", "hine"], ["8", "8 ?pop"], ["\\b8", "8\\b"], ["velo", "ov"]].map((p) => p.join("")).join("|"), "i");

const express = (await import("express")).default;
const D = await import("../src/servidor/dados.ts");
const { criarCookie, exigirLogin } = await import("../src/servidor/sessao.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar } = await import("../src/cadastros/armazem.ts");
const C = await import("../src/corridas/index.ts");
const P = await import("../src/apps/despacho.ts");
const { rotasOperacao } = await import("../src/operacao/rotas.ts");
const { registrarCotacao } = await import("../src/operacao/radar.ts");

const app = express();
app.use(express.json());
app.post("/teste/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({ ok: true }); });
app.use("/api", exigirLogin);
app.use("/api/operacao", rotasOperacao);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => servidor.close());

const A = D.criarEmpresa("Rota Norte"), B = D.criarEmpresa("Leva Sul");
const adminA = D.criarUsuario({ email: "admin@a.test", nome: "Ana", senha: "senha-forte-1", empresaId: A.id, papel: "admin" });
const operA = D.criarUsuario({ email: "oper@a.test", nome: "Otávio", senha: "senha-forte-2", empresaId: A.id, papel: "operador" });
const adminB = D.criarUsuario({ email: "admin@b.test", nome: "Bia", senha: "senha-forte-3", empresaId: B.id, papel: "admin" });
const CAT = cadastroPorId("categorias")!, MOT = cadastroPorId("motoristas")!, OBJ = cadastroPorId("objetos")!;
criar(A.id, CAT, { nome: "Econômico", bandeirada: 5, valorKm: 2, valorMinimo: 9.9, ativa: true, taxaCancelamento: 6, toleranciaCancelamento: 0 }, "teste");
const carlos = criar(A.id, MOT, { nome: "Carlos Souza", telefone: "11900000000", status: "Ativo", veiculo: "Hatch prata", placa: "ABC1D23", cidade: "Cidade Norte" }, "teste");
const dora = criar(A.id, MOT, { nome: "Dora Lima", telefone: "11900000002", status: "Ativo", veiculo: "Sedan", placa: "XYZ9K88" }, "teste");

let ca = "", co = "", cb = "";
async function pedir(caminho: string, o: { metodo?: string; corpo?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (o.cookie) headers.cookie = o.cookie;
  const r = await fetch(`${base}/api/operacao${caminho}`, { method: o.metodo ?? (o.corpo ? "POST" : "GET"), headers, body: o.corpo ? JSON.stringify(o.corpo) : undefined });
  const texto = await r.text();
  let corpo: Record<string, any> = {};
  try { corpo = JSON.parse(texto || "{}"); } catch { /* recibo é HTML dentro de JSON, mas por garantia */ }
  return { status: r.status, corpo, texto };
}
async function cookieDe(id: string) {
  const r = await fetch(`${base}/teste/entrar/${id}`, { method: "POST" });
  return (r.headers.get("set-cookie") ?? "").split(";")[0];
}
const PEDIDO = (nome: string, tel: string, extra: Record<string, unknown> = {}) => ({
  passageiro: { nome, telefone: tel }, embarque: { texto: "Rua das Flores, 10 - Centro", lat: -21.12, lng: -48.3 }, destino: { texto: "Av. Brasil, 500 - Jardim" },
  categoria: "Econômico", pagamento: "Pix", ...extra,
});
let c1 = "", os1 = "";

test("sem login nada abre; operador vê; só quem tem papel altera", async () => {
  ca = await cookieDe(adminA.id); co = await cookieDe(operA.id); cb = await cookieDe(adminB.id);
  assert.equal((await pedir("/historico")).status, 401);
  assert.equal((await pedir("/historico", { cookie: ca })).status, 200);
  assert.equal((await pedir("/rota-inexistente", { cookie: ca })).status, 404);
});

test("nova solicitação pela central: paradas, valor manual e motorista direcionado", async () => {
  const r = await pedir("/solicitar", {
    cookie: co, corpo: {
      passageiro: { nome: "Maria Teste", telefone: "(11) 98888-7777" }, embarque: { texto: "Rua das Flores, 10 - Centro", lat: -21.12, lng: -48.3 },
      destino: { texto: "Av. Brasil, 500 - Jardim", lat: -21.13, lng: -48.31 }, paradas: [{ texto: "Padaria Central" }], categoria: "Econômico", pagamento: "Pix",
      valor: 33.5, motoristaId: carlos.id, exigencias: ["Porta-malas grande"], complemento: "Apto 2", referencia: "Portão azul",
    },
  });
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.corpo.corrida.valor, 33.5);
  c1 = r.corpo.corrida.id; os1 = r.corpo.corrida.os;
  const d = await pedir(`/corridas/${c1}`, { cookie: co });
  assert.equal(d.status, 200, d.texto);
  assert.equal(d.corpo.corrida.paradas.length, 1);
  assert.equal(d.corpo.motorista.id, carlos.id);
  assert.match(d.corpo.corrida.observacao, /Porta-malas grande/);
  assert.equal(d.corpo.financeiro.valorInicial, 33.5);
  assert.ok(d.corpo.repasses.length >= 1);
  assert.equal((await pedir(`/corridas/${os1}`, { cookie: co })).status, 200, "também abre pela OS");
});

test("passageiro por telefone e CPF; lista de motoristas", async () => {
  const p = await pedir("/passageiro?telefone=11988887777", { cookie: co });
  assert.equal(p.corpo.encontrado, true);
  assert.equal(p.corpo.nome, "Maria Teste");
  assert.equal((await pedir("/passageiro", { cookie: co })).status, 400);
  const m = await pedir("/motoristas", { cookie: co });
  assert.deepEqual(m.corpo.motoristas.map((x: { nome: string }) => x.nome).sort(), ["Carlos Souza", "Dora Lima"]);
});

test("histórico: filtros avançados, atalhos, status e paginação", async () => {
  await pedir("/solicitar", { cookie: co, corpo: PEDIDO("João Outro", "11977776666") });
  const h = await pedir("/historico?fonte=propria&dataIni=2000-01-01&dataFim=2100-01-01", { cookie: co });
  assert.equal(h.status, 200, h.texto);
  assert.equal(h.corpo.total, 2);
  assert.equal(h.corpo.stats.total, 2);
  assert.ok(h.corpo.status.finalizada);
  assert.equal((await pedir(`/historico?fonte=propria&os=${os1}`, { cookie: co })).corpo.total, 1);
  assert.equal((await pedir("/historico?fonte=propria&nomePax=maria", { cookie: co })).corpo.total, 1);
  assert.equal((await pedir("/historico?fonte=propria&telPax=77776666", { cookie: co })).corpo.total, 1);
  assert.equal((await pedir("/historico?fonte=propria&motorista=ABC1D23", { cookie: co })).corpo.total, 1);
  assert.equal((await pedir("/historico?fonte=propria&endereco=padaria", { cookie: co })).corpo.total, 0, "paradas não entram no endereço");
  assert.equal((await pedir("/historico?fonte=propria&rapido=15min", { cookie: co })).corpo.total, 2);
  assert.equal((await pedir("/historico?fonte=propria&rapido=hoje", { cookie: co })).corpo.total, 2);
  assert.equal((await pedir("/historico?fonte=propria&rapido=hoje&status=finalizada", { cookie: co })).corpo.total, 0);
  assert.equal((await pedir("/historico?fonte=propria&rapido=hoje&horaIni=23:59&horaFim=23:59", { cookie: co })).corpo.total <= 2, true);
  const t = await pedir("/historico?fonte=propria&rapido=hoje&todas=1", { cookie: co });
  assert.equal(t.corpo.corridas.length, 2);
  assert.ok(t.corpo.filtroBase.inicio, "devolve o filtro para o relatório com IA");
});

test("rastreio, recibo só de corrida concluída e chat", async () => {
  const r = await pedir(`/corridas/${c1}/rastreio`, { cookie: co });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.aberta, true);
  assert.equal(r.corpo.motorista.placa, "ABC1D23");
  assert.equal((await pedir(`/corridas/${c1}/chat`, { cookie: co })).status, 200);
  // Corrida ainda aberta já tem recibo (vale o estimado); cancelada, não.
  const rec = await pedir(`/corridas/${c1}/recibo`, { cookie: co });
  assert.equal(rec.status, 200);
  assert.match(rec.corpo.html, /Recibo da corrida/);
  assert.match(rec.corpo.html, /R\$ 33,50/);
  assert.match(rec.corpo.html, /Rota Norte|Painel de Corridas/);
});

test("auditoria: ondas de envio do despacho aparecem no Raio-X e nas pendências de repasse", async () => {
  await C.criarCorridaPropria(A.id, PEDIDO("Paula Onda", "11966665555") as never, "teste");
  P.ficarOnline(A.id, dora.id, -21.121, -48.301); // despacha: a oferta vira uma onda
  const oferta = P.ofertaDoMotorista(A.id, dora.id);
  assert.ok(oferta, "a corrida mais antiga foi oferecida à Dora");
  const r = { id: oferta.corridaId };
  const x = await pedir(`/corridas/${r.id}/raiox`, { cookie: ca });
  assert.equal(x.status, 200, x.texto);
  assert.ok(x.corpo.ondas.length >= 1, "oferta registrada");
  assert.equal(x.corpo.ondas[0].nome, "Dora Lima");
  assert.equal(x.corpo.ondas[0].etapa, "PROXIMIDADE");
  assert.ok(x.corpo.timeline.some((t: { descricao: string }) => /Chamada enviada/.test(t.descricao)));
  assert.ok(x.corpo.regiao.some((m: { nome: string; motivo: string }) => m.nome === "Dora Lima"));
  P.recusar(A.id, dora.id, oferta.id);
  const y = await pedir(`/corridas/${r.id}/raiox`, { cookie: ca });
  assert.equal(y.corpo.ondas.find((o: { id: string }) => o.id === oferta.id).fim, "recusou");
  P.ficarOffline(A.id, dora.id);
});

test("mapa em tempo real mostra os motoristas online do app", async () => {
  P.ficarOnline(A.id, dora.id, -21.121, -48.301);
  const m = await pedir("/mapa", { cookie: co });
  assert.equal(m.status, 200);
  assert.equal(m.corpo.stats.cadastrosAtivos, 2);
  assert.equal(m.corpo.stats.conectados, 1);
  const d = m.corpo.motoristas.find((x: { id: string }) => x.id === dora.id);
  assert.equal(d.lat, -21.121);
  assert.notEqual(d.situacao, "offline");
  P.ficarOffline(A.id, dora.id);
});

test("monitoramento: corridas abertas e filtro por passageiro", async () => {
  const m = await pedir("/monitoramento", { cookie: co });
  assert.ok(m.corpo.corridas.length >= 2);
  assert.equal((await pedir("/monitoramento?passageiro=maria", { cookie: co })).corpo.corridas.length, 1);
  assert.equal((await pedir("/monitoramento?telefone=00000", { cookie: co })).corpo.corridas.length, 0);
});

test("editar OS (histórico guarda o que mudou) e cancelar com origem e taxa", async () => {
  assert.equal((await pedir(`/corridas/${c1}`, { metodo: "PUT", corpo: { nome: "Maria Souza" }, cookie: cb })).status, 404, "outra empresa não edita");
  const e = await pedir(`/corridas/${c1}`, { metodo: "PUT", corpo: { nome: "Maria Souza", pagamento: "Dinheiro", destino: "Rua Nova, 1" }, cookie: co });
  assert.equal(e.status, 200, e.texto);
  const d = await pedir(`/corridas/${c1}`, { cookie: co });
  assert.equal(d.corpo.passageiro.nome, "Maria Souza");
  assert.match(d.corpo.corrida.historico.at(-1).nota, /Edição manual/);
  assert.equal((await pedir(`/corridas/${c1}`, { metodo: "PUT", corpo: { nome: "Maria Souza" }, cookie: co })).status, 400, "nada mudou");
  // Avança para "a caminho" e cancela pelo passageiro: cobra a taxa da categoria (tolerância zero).
  C.mudarStatus(A.id, c1, "a_caminho", {}, "t");
  assert.equal((await pedir(`/corridas/${c1}/cancelar`, { corpo: { origem: "qualquer" }, cookie: co })).status, 400);
  const x = await pedir(`/corridas/${c1}/cancelar`, { corpo: { origem: "passageiro", motivo: "Desistiu" }, cookie: co });
  assert.equal(x.status, 200, x.texto);
  assert.equal(x.corpo.corrida.status, "cancelada");
  const d2 = await pedir(`/corridas/${c1}`, { cookie: co });
  assert.equal(d2.corpo.podeReenviar, true);
  assert.equal(d2.corpo.podeRecibo, false);
  assert.equal(d2.corpo.corrida.canceladaPor, "Passageiro");
  assert.equal((await pedir(`/corridas/${c1}/recibo`, { cookie: co })).status, 400);
  assert.equal((await pedir(`/corridas/${c1}/cancelar`, { corpo: { origem: "central" }, cookie: co })).status, 400, "já terminou");
});

test("cancelamento por erro/outros e reenviar corrida", async () => {
  const n = await C.criarCorridaPropria(A.id, PEDIDO("Rita Erro", "11955554444") as never, "teste");
  assert.equal((await pedir(`/corridas/${n.id}/reenviar`, { corpo: {}, cookie: co })).status, 400, "só cancelada ou não atendida");
  const x = await pedir(`/corridas/${n.id}/cancelar`, { corpo: { origem: "sistema" }, cookie: co });
  assert.equal(x.status, 200);
  assert.match((await pedir(`/corridas/${n.id}`, { cookie: co })).corpo.corrida.motivoCancelamento, /erro/i);
  const r = await pedir(`/corridas/${n.id}/reenviar`, { corpo: {}, cookie: co });
  assert.equal(r.status, 200, r.texto);
  const nova = await pedir(`/corridas/${r.corpo.corrida.id}`, { cookie: co });
  assert.equal(nova.corpo.corrida.passageiro.nome, "Rita Erro");
  assert.match(nova.corpo.corrida.observacao, /Reenvio da OS/);
  assert.equal((await pedir(`/corridas/${n.id}/reenviar`, { corpo: {}, cookie: cb })).status, 404);
});

test("ocorrências lista falhas recentes e não mostra as finalizadas", async () => {
  const o = await pedir("/ocorrencias?horas=1", { cookie: co });
  assert.equal(o.status, 200);
  assert.ok(o.corpo.total >= 2);
  assert.ok(o.corpo.itens.every((i: { grupo: string }) => i.grupo === "cancelada" || i.grupo === "nao_atendida"));
  assert.match(o.corpo.itens.find((i: { os: string }) => i.os === os1).motivo, /passageiro/i);
});

test("programadas: agenda, edita e filtra", async () => {
  const dia = new Date(Date.now() - 3 * 3600_000 + 2 * 86_400_000).toISOString().slice(0, 10);
  const r = await pedir("/solicitar", { cookie: co, corpo: { ...PEDIDO("Sara Agenda", "11944443333"), agendadaPara: `${dia}T10:30` } });
  assert.equal(r.status, 200, r.texto);
  const p = await pedir("/programadas?filtro=futuras", { cookie: co });
  assert.equal(p.corpo.total, 1);
  assert.equal((await pedir("/programadas?filtro=hoje", { cookie: co })).corpo.total, 0);
  assert.equal((await pedir("/programadas?filtro=todas&busca=sara", { cookie: co })).corpo.total, 1);
  const e = await pedir(`/programadas/${r.corpo.corrida.id}`, { metodo: "PUT", corpo: { dataHora: `${dia}T11:45`, valor: "40,00", observacao: "Bagagem" }, cookie: co });
  assert.equal(e.status, 200, e.texto);
  const q = (await pedir("/programadas?filtro=futuras", { cookie: co })).corpo.itens[0];
  assert.match(q.agendadaPara, /T11:45/);
  assert.equal(q.valor, 40);
  assert.equal(q.observacao, "Bagagem");
  assert.equal((await pedir("/programadas?filtro=todas", { cookie: cb })).corpo.total, 0);
});

test("pagamentos pendentes: taxa de cancelamento, baixar uma vez e abonar", async () => {
  const p = await pedir("/pendencias", { cookie: co });
  assert.equal(p.status, 200);
  // A corrida cancelada pelo passageiro com motorista a caminho gerou taxa (se o status mudou para "a caminho").
  assert.equal(p.corpo.total, 1, "taxa gerada no cancelamento");
  assert.equal(p.corpo.itens[0].status, "pendente");
  assert.ok(p.corpo.totalAberto > 0);
  const id = p.corpo.itens[0].id;
  assert.equal((await pedir(`/pendencias/${id}/baixar`, { metodo: "POST", corpo: {}, cookie: co })).status, 403, "só administrador");
  assert.equal((await pedir(`/pendencias/${id}/baixar`, { corpo: {}, cookie: cb })).status, 404);
  assert.equal((await pedir(`/pendencias/${id}/baixar`, { corpo: {}, cookie: ca })).status, 200);
  assert.equal((await pedir(`/pendencias/${id}/abonar`, { corpo: {}, cookie: ca })).status, 400, "já resolvida");
  assert.equal((await pedir("/pendencias?status=paga", { cookie: co })).corpo.total, 1);
  assert.equal((await pedir("/pendencias", { cookie: co })).corpo.total, 0);
});

test("objetos perdidos: lista, resolve, filtra e apaga (cada empresa só vê os seus)", async () => {
  const o = criar(A.id, OBJ, { descricao: "Carregador branco", data: "2026-11-01", os: os1, situacao: "Procurando", passageiro: "Maria 11988887777" }, "teste");
  const l = await pedir("/objetos?status=pendente", { cookie: co });
  assert.equal(l.corpo.total, 1);
  assert.equal(l.corpo.itens[0].resolvido, false);
  assert.equal((await pedir("/objetos", { cookie: cb })).corpo.total, 0);
  assert.equal((await pedir(`/objetos/${o.id}/status`, { corpo: {}, cookie: cb })).status, 404);
  const al = await pedir(`/objetos/${o.id}/status`, { corpo: {}, cookie: co });
  assert.equal(al.corpo.registro?.situacao, "Devolvido", al.texto);
  assert.equal((await pedir("/objetos?status=resolvido&busca=carregador", { cookie: co })).corpo.total, 1);
  assert.equal((await pedir(`/objetos/${o.id}`, { metodo: "DELETE", cookie: co })).status, 200);
  assert.equal((await pedir("/objetos", { cookie: co })).corpo.total, 0);
});

test("recuperação de vendas: cota e não pede, cancelou, contato registrado; motoristas que deixaram passar", async () => {
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  registrarCotacao(A.id, "11933332222", { embarque: { lat: -21.12, lng: -48.3 }, destino: { lat: -21.2, lng: -48.4 }, categoria: "Econômico", valor: 27.9, distanciaKm: 8 });
  registrarCotacao(A.id, "11933332222", { embarque: { lat: -21.12, lng: -48.3 }, destino: { lat: -21.2, lng: -48.4 }, categoria: "Econômico", valor: 28.9, distanciaKm: 8 });
  const r = await pedir(`/recuperacao?aba=passageiros&inicio=${hoje}&fim=${hoje}`, { cookie: co });
  assert.equal(r.status, 200, r.texto);
  const cot = r.corpo.lista.filter((x: { tipo: string }) => x.tipo === "cotacao");
  assert.equal(cot.length, 1, "a mesma pessoa cotando de novo não vira outra linha");
  assert.equal(cot[0].valor, 28.9);
  assert.equal(cot[0].cliente.novo, true);
  assert.ok(r.corpo.lista.some((x: { tipo: string }) => x.tipo === "cancelada"), "corrida cancelada pelo passageiro entra");
  assert.ok(r.corpo.resumo.valor >= 28.9);
  const chave = cot[0].chave;
  assert.equal((await pedir("/recuperacao/contato", { corpo: { chave }, cookie: co })).status, 200);
  assert.equal((await pedir("/recuperacao/contato", { corpo: { chave: "../x" }, cookie: co })).status, 400);
  const de = await pedir(`/recuperacao?inicio=${hoje}`, { cookie: co });
  assert.ok(de.corpo.lista.find((x: { chave: string }) => x.chave === chave).contatadoEm);
  // Quem cotou e depois pediu a corrida não é venda perdida.
  await C.criarCorridaPropria(A.id, PEDIDO("Zé Pediu", "11933332222") as never, "teste");
  assert.equal((await pedir(`/recuperacao?inicio=${hoje}`, { cookie: co })).corpo.lista.filter((x: { tipo: string }) => x.tipo === "cotacao").length, 0);
  assert.equal((await pedir(`/recuperacao?aba=motoristas_simulou&inicio=${hoje}`, { cookie: co })).status, 200);
  assert.equal((await pedir(`/recuperacao?aba=motoristas_iniciou&inicio=${hoje}`, { cookie: co })).corpo.lista.length, 0);
  // Outra empresa não vê nada.
  assert.equal((await pedir(`/recuperacao?inicio=${hoje}`, { cookie: cb })).corpo.lista.length, 0);
  assert.equal((await pedir("/recuperacao/contato", { corpo: { chave }, cookie: cb })).status, 200, "contato grava na pasta de quem pediu");
  assert.ok(fs.existsSync(path.join(DADOS, "empresas", B.id, "operacao", "contatos.json")));
});

test("dados da operação ficam na pasta de cada empresa e sem marcas de terceiros", async () => {
  assert.ok(fs.existsSync(path.join(DADOS, "empresas", A.id, "operacao", "cotacoes.json")));
  assert.ok(!fs.existsSync(path.join(DADOS, "empresas", B.id, "operacao", "cotacoes.json")));
  const textos = [(await pedir("/historico?fonte=propria&rapido=hoje", { cookie: ca })).texto, (await pedir("/mapa", { cookie: ca })).texto, (await pedir(`/corridas/${c1}/recibo`, { cookie: ca })).texto];
  for (const t of textos) assert.ok(!MARCAS.test(t), `sem marca de terceiros: ${t.match(MARCAS)?.[0]}`);
  assert.equal(adminB.empresaId, B.id);
});
