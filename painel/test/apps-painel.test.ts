// Corrida feita pelo app (passageiro pede, motorista aceita e finaliza) tem de aparecer no painel
// (Histórico, Consultar corridas, Radar) com status, valor e canal "App", e o que o painel muda tem de chegar ao app.
// Tudo local, sem internet. Rodar: npm test (na pasta painel).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "apps-painel-teste-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "t".repeat(40);
process.env.APPS_MOSTRAR_CODIGO = "1";
process.env.APPS_CODIGOS_POR_IP = "1000";
process.env.OSRM_PUBLICO = "0";
process.env.NOMINATIM_PUBLICO = "0";

const express = (await import("express")).default;
const D = await import("../src/servidor/dados.ts");
const { criarCookie, exigirLogin } = await import("../src/servidor/sessao.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar } = await import("../src/cadastros/armazem.ts");
const { rotasApps } = await import("../src/apps/rotas.ts");
const { rotasOperacao } = await import("../src/operacao/rotas.ts");
const { rotasCorridasProprias } = await import("../src/corridas/rotas.ts");
const { rotasCadastros } = await import("../src/cadastros/rotas.ts");

const app = express();
app.use(express.json());
app.post("/teste/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({ ok: true }); });
app.use("/api/apps", rotasApps);
app.use("/api", exigirLogin);
app.use("/api/operacao", rotasOperacao);
app.use("/api/corridas-proprias", rotasCorridasProprias);
app.use("/api/cadastros", rotasCadastros);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => servidor.close());

const E = D.criarEmpresa("Central Ponta");
const admin = D.criarUsuario({ email: "admin@ponta.test", nome: "Ana", senha: "senha-forte-1", empresaId: E.id, papel: "admin" });
criar(E.id, cadastroPorId("categorias")!, { nome: "Econômico", bandeirada: 5, valorKm: 2, valorMinimo: 9.9, ativa: true, comissaoTipo: "Percentual", comissaoValor: 10 }, "teste");
criar(E.id, cadastroPorId("motoristas")!, { nome: "Lia Motorista", telefone: "11900000002", status: "Ativo", veiculo: "Sedã preto", placa: "XYZ9K87" }, "teste");
const API = `/api/apps/${E.id}`;
const EMBARQUE = { texto: "Rua das Flores, 100", lat: -23.55, lng: -46.63 };
const DESTINO = { texto: "Av. Central, 2000", lat: -23.6, lng: -46.66 };

async function chamar(metodo: string, url: string, corpo?: unknown, token?: string, cookie?: string) {
  const r = await fetch(base + url, {
    method: metodo,
    headers: { ...(corpo !== undefined ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...(cookie ? { cookie } : {}) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return { status: r.status, corpo: await r.json() };
}
async function entrar(papel: "passageiro" | "motorista", telefone: string, nome = "Cliente Teste") {
  const c = await chamar("POST", `${API}/entrar/codigo`, { papel, telefone });
  const e = await chamar("POST", `${API}/entrar`, { papel, telefone, codigo: c.corpo.codigoTeste });
  assert.equal(e.status, 200, JSON.stringify(e.corpo));
  const token = e.corpo.token as string;
  if (papel === "passageiro") assert.equal((await chamar("POST", `${API}/eu`, { nome }, token)).status, 200);
  return token;
}
const cookieDoPainel = async () => (await fetch(`${base}/teste/entrar/${admin.id}`, { method: "POST" })).headers.get("set-cookie")!.split(";")[0];
const historicoDoPainel = async (cookie: string, consulta = "") => (await chamar("GET", `/api/operacao/historico${consulta}`, undefined, undefined, cookie)).corpo;

test("corrida feita no app aparece no painel (histórico, radar), com status e valores, do pedido ao fim", async () => {
  const cookie = await cookieDoPainel();
  const tokP = await entrar("passageiro", "11988887777");
  const tokM = await entrar("motorista", "11900000002");
  assert.equal((await chamar("POST", `${API}/online`, { lat: -23.552, lng: -46.63 }, tokM)).status, 200);

  // Passageiro pede: já aparece no painel como "Procurando", canal App.
  const pedido = await chamar("POST", `${API}/corridas`, { embarque: EMBARQUE, destino: DESTINO, categoria: "Econômico", pagamento: "Pix", pedidoId: "ponta-1" }, tokP);
  assert.equal(pedido.status, 200, JSON.stringify(pedido.corpo));
  const id = pedido.corpo.corrida.id as string, os = pedido.corpo.corrida.os as string;
  let h = await historicoDoPainel(cookie);
  let linha = h.corridas.find((c: any) => c.os === os);
  assert.ok(linha, "a corrida pedida no app tem de estar no histórico do painel");
  assert.equal(linha.canal, "App");
  assert.equal(linha.grupo, "aberta");
  assert.equal(linha.passageiro.length > 0, true);
  assert.equal(linha.embarque, EMBARQUE.texto);

  // Motorista aceita (a oferta vem pelo estado) → painel mostra o motorista.
  const estado = await chamar("GET", `${API}/estado`, undefined, tokM);
  assert.ok(estado.corpo.oferta, "o motorista online recebe a oferta");
  const aceite = await chamar("POST", `${API}/ofertas/${estado.corpo.oferta.id}/aceitar`, {}, tokM);
  assert.equal(aceite.status, 200, JSON.stringify(aceite.corpo));
  linha = (await historicoDoPainel(cookie)).corridas.find((c: any) => c.os === os);
  assert.equal(linha.motorista, "Lia Motorista");
  assert.equal(linha.grupo, "aberta");

  // Motorista segue e finaliza → painel mostra Finalizada com valor.
  for (const s of ["no_local", "em_andamento", "finalizada"]) {
    const r = await chamar("POST", `${API}/corridas/${id}/status`, { status: s }, tokM);
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
  }
  const noApp = (await chamar("GET", `${API}/corridas/${id}`, undefined, tokP)).corpo.corrida;
  assert.equal(noApp.status, "finalizada");
  h = await historicoDoPainel(cookie);
  linha = h.corridas.find((c: any) => c.os === os);
  assert.equal(linha.grupo, "finalizada");
  assert.equal(linha.valor, noApp.valor, "o valor do painel é o mesmo que o passageiro vê");
  assert.ok(linha.valor > 0);
  assert.equal(linha.canal, "App");
  assert.ok(h.stats.finalizadas >= 1);
  // Também aparece quando o painel filtra só por "hoje" e só pelas finalizadas, e pela busca da OS.
  assert.ok((await historicoDoPainel(cookie, "?rapido=hoje&status=finalizada")).corridas.some((c: any) => c.os === os));
  assert.ok((await historicoDoPainel(cookie, `?os=${os}`)).corridas.some((c: any) => c.os === os));
  // Detalhe da corrida no painel.
  const det = await chamar("GET", `/api/corridas-proprias/${os}`, undefined, undefined, cookie);
  assert.equal(det.corpo.corrida.status, "finalizada");
  assert.equal(det.corpo.corrida.canal, "app");
});

test("o que o painel altera chega ao app: cancelar e mudar status", async () => {
  const cookie = await cookieDoPainel();
  const tokP = await entrar("passageiro", "11988880000");
  const pedido = await chamar("POST", `${API}/corridas`, { embarque: EMBARQUE, destino: DESTINO, categoria: "Econômico", pagamento: "Pix", pedidoId: "ponta-2" }, tokP);
  const id = pedido.corpo.corrida.id as string;
  const c = await chamar("POST", `/api/corridas-proprias/${id}/cancelar`, { quem: "Central", motivo: "Teste do painel" }, undefined, cookie);
  assert.equal(c.status, 200, JSON.stringify(c.corpo));
  const noApp = (await chamar("GET", `${API}/corridas/${id}`, undefined, tokP)).corpo.corrida;
  assert.equal(noApp.status, "cancelada");
  const lista = (await chamar("GET", `${API}/corridas`, undefined, tokP)).corpo.corridas;
  assert.equal(lista.find((x: any) => x.id === id).status, "cancelada");
});

test("passageiro vê os carros livres por perto (sem dados pessoais) e a rota de casas responde", async () => {
  criar(E.id, cadastroPorId("motoristas")!, { nome: "Rui Livre", telefone: "11900000009", status: "Ativo", veiculo: "Hatch azul", placa: "RUI1A23" }, "teste");
  const tokP = await entrar("passageiro", "11988881111");
  const tokM = await entrar("motorista", "11900000009");
  assert.equal((await chamar("POST", `${API}/online`, { lat: -23.553, lng: -46.631 }, tokM)).status, 200);
  const r = await chamar("GET", `${API}/motoristas-perto?lat=-23.55&lng=-46.63`, undefined, tokP);
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  const m = r.corpo.motoristas.find((x: any) => Math.abs(x.lat + 23.553) < 0.001);
  assert.ok(m, "o motorista online e livre aparece");
  assert.equal(m.tipo, "carro");
  assert.deepEqual(Object.keys(m).sort(), ["categoria", "lat", "lng", "tipo"], "só tipo e posição: nada de nome, placa ou id");
  // Longe demais não aparece; motorista não usa essa rota.
  assert.equal((await chamar("GET", `${API}/motoristas-perto?lat=-10&lng=-40`, undefined, tokP)).corpo.motoristas.length, 0);
  assert.equal((await chamar("GET", `${API}/motoristas-perto?lat=-23.55&lng=-46.63`, undefined, tokM)).status, 403);
  // Sem base de casas ligada a lista vem vazia, sem erro.
  const c = await chamar("GET", `${API}/enderecos/casas?lat=-23.55&lng=-46.63&raio=100`, undefined, tokP);
  assert.equal(c.status, 200);
  assert.deepEqual(c.corpo.casas, []);
});

test("motorista: cada corrida do histórico traz valor, comissão da central, líquido e OS; totais de hoje e da semana; taxa de aceitação", async () => {
  criar(E.id, cadastroPorId("motoristas")!, { nome: "Gil Ganhos", telefone: "11900000010", status: "Ativo", veiculo: "Sedã cinza", placa: "GIL1A23" }, "teste");
  const tokP = await entrar("passageiro", "11988882222");
  const tokM = await entrar("motorista", "11900000010");
  await chamar("POST", `${API}/online`, { lat: -23.552, lng: -46.63 }, tokM);
  const pedido = await chamar("POST", `${API}/corridas`, { embarque: EMBARQUE, destino: DESTINO, categoria: "Econômico", pagamento: "Dinheiro", pedidoId: "ponta-g" }, tokP);
  const id = pedido.corpo.corrida.id as string;
  let oferta = (await chamar("GET", `${API}/estado`, undefined, tokM)).corpo.oferta;
  for (let i = 0; i < 10 && !oferta; i++) { await new Promise((r) => setTimeout(r, 300)); oferta = (await chamar("GET", `${API}/estado`, undefined, tokM)).corpo.oferta; }
  assert.ok(oferta, "a oferta chega ao motorista");
  assert.equal((await chamar("POST", `${API}/ofertas/${oferta.id}/aceitar`, {}, tokM)).status, 200);
  for (const s of ["no_local", "em_andamento", "finalizada"]) await chamar("POST", `${API}/corridas/${id}/status`, { status: s }, tokM);
  const g = (await chamar("GET", `${API}/ganhos?periodo=semana`, undefined, tokM)).corpo;
  const c = g.lista.find((x: any) => x.id === id);
  assert.ok(c, "a corrida finalizada está no histórico do motorista");
  assert.equal(c.os, pedido.corpo.corrida.os);
  assert.ok(c.valorBruto > 0);
  assert.equal(c.taxaCentral, Math.round(c.valorBruto * 10) / 100, "comissão de 10% da categoria");
  assert.equal(Math.round((c.valorBruto - c.taxaCentral) * 100), Math.round(c.valorLiquido * 100));
  assert.equal(g.hoje.liquido >= c.valorLiquido, true);
  assert.equal(g.semanaAtual.corridas >= 1, true);
  assert.ok(Math.abs(g.totalLiquido - g.lista.reduce((s: number, x: any) => s + x.valorLiquido, 0)) < 0.01);
  const resumo = (await chamar("GET", `${API}/ganhos`, undefined, tokM)).corpo;
  assert.equal(resumo.hoje.liquido >= c.valorLiquido, true);
  const acc = (await chamar("GET", `${API}/aceitacao`, undefined, tokM)).corpo;
  assert.ok(acc.aceitas >= 1 && acc.porcentagem > 0);
});

test("cadastro feito no app aparece nos cadastros do painel; o mesmo telefone, e-mail e CPF vale como passageiro e como motorista", async () => {
  const cookie = await cookieDoPainel();
  const dados = { nome: "Pessoa Dupla", telefone: "11955554444", email: "dupla@teste.com", senha: "segredo1", genero: "Feminino" };
  const p = await chamar("POST", `${API}/conta/criar`, { papel: "passageiro", ...dados });
  assert.equal(p.status, 200, JSON.stringify(p.corpo));
  const m = await chamar("POST", `${API}/conta/criar`, { papel: "motorista", ...dados, cpf: "52998224725", nascimento: "1990-05-10", chavePix: "11955554444" });
  assert.equal(m.status, 200, "o mesmo telefone e e-mail também pode ser motorista: " + JSON.stringify(m.corpo));
  const clientes = (await chamar("GET", "/api/cadastros/clientes", undefined, undefined, cookie)).corpo;
  const motoristas = (await chamar("GET", "/api/cadastros/motoristas", undefined, undefined, cookie)).corpo;
  const lista = (x: any) => (x.registros ?? x.lista ?? x) as any[];
  assert.ok(lista(clientes).some((c) => c.telefone === "11955554444"), "o passageiro criado no app está em Clientes do painel");
  const reg = lista(motoristas).find((c) => c.telefone === "11955554444");
  assert.ok(reg, "o motorista criado no app está em Motoristas do painel");
  assert.notEqual(reg.status, "Ativo", "motorista novo fica aguardando aprovação da central");
});
