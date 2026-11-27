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
const { rotasApps, rotasAppsCentral } = await import("../src/apps/rotas.ts");
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
app.use("/api/apps-central", rotasAppsCentral);
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

test("motorista desiste com motivo: a corrida volta a procurar, vai para outro motorista e o painel mostra o motivo; quem desistiu não recebe de novo", async () => {
  const cookie = await cookieDoPainel();
  criar(E.id, cadastroPorId("motoristas")!, { nome: "Dani Desiste", telefone: "11900000021", status: "Ativo", veiculo: "Hatch", placa: "DAN1A23" }, "teste");
  criar(E.id, cadastroPorId("motoristas")!, { nome: "Edu Segundo", telefone: "11900000022", status: "Ativo", veiculo: "Sedã", placa: "EDU1A23" }, "teste");
  const tokP = await entrar("passageiro", "11988883333");
  const tokD = await entrar("motorista", "11900000021");
  await chamar("POST", `${API}/online`, { lat: -23.5505, lng: -46.63 }, tokD); // o mais perto: recebe primeiro
  const pedido = await chamar("POST", `${API}/corridas`, { embarque: EMBARQUE, destino: DESTINO, categoria: "Econômico", pagamento: "Pix", pedidoId: "ponta-d" }, tokP);
  const id = pedido.corpo.corrida.id as string;
  const esperarOferta = async (tok: string) => { let o = (await chamar("GET", `${API}/estado`, undefined, tok)).corpo.oferta; for (let i = 0; i < 12 && !o; i++) { await new Promise((r) => setTimeout(r, 300)); o = (await chamar("GET", `${API}/estado`, undefined, tok)).corpo.oferta; } return o; };
  const of1 = await esperarOferta(tokD);
  assert.ok(of1, "Dani recebe a oferta");
  assert.equal((await chamar("POST", `${API}/ofertas/${of1.id}/aceitar`, {}, tokD)).status, 200);
  // Os motivos vêm das configurações da empresa.
  const motivos = (await chamar("GET", `${API}/motivos-cancelamento`, undefined, tokD)).corpo.motivos as string[];
  assert.ok(motivos.length > 1);
  const motivoDesistencia = motivos.find((m) => /veículo/i.test(m)) ?? "Problema no veículo"; // desistência do motorista (não é culpa do passageiro): volta para a fila
  // Edu entra online só agora; Dani desiste com motivo.
  const tokE = await entrar("motorista", "11900000022");
  await chamar("POST", `${API}/online`, { lat: -23.55, lng: -46.63 }, tokE); // no embarque: o mais perto de todos
  const r = await chamar("POST", `${API}/corridas/${id}/cancelar`, { motivo: motivoDesistencia }, tokD);
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  const det = (await chamar("GET", `/api/corridas-proprias/${id}`, undefined, undefined, cookie)).corpo.corrida;
  assert.ok(["procurando", "a_caminho"].includes(det.status), "voltou para procurar (ou já está com outro motorista)");
  assert.ok(det.historico.some((h: any) => String(h.nota ?? "").includes(motivoDesistencia)), "o painel mostra o motivo de quem desistiu");
  const of2 = await esperarOferta(tokE);
  assert.ok(of2 && of2.corrida.id === id, "Edu recebe a mesma corrida");
  assert.equal((await chamar("GET", `${API}/estado`, undefined, tokD)).corpo.oferta, null, "quem desistiu não recebe a mesma de novo");
});

test("motorista cancela por culpa do passageiro (não apareceu): cancelada de vez, sem nova oferta, passageiro avisado e painel mostra o motivo", async () => {
  const cookie = await cookieDoPainel();
  const LONGE = { texto: "Rua do Sossego, 50", lat: -23.7, lng: -46.8 }; // longe dos motoristas de outros testes: só os daqui concorrem
  criar(E.id, cadastroPorId("motoristas")!, { nome: "Fabio Aguarda", telefone: "11900000031", status: "Ativo", veiculo: "Hatch", placa: "FAB1A23" }, "teste");
  criar(E.id, cadastroPorId("motoristas")!, { nome: "Gil Reserva", telefone: "11900000032", status: "Ativo", veiculo: "Sedã", placa: "GIL1A23" }, "teste");
  const tokP = await entrar("passageiro", "11988884444");
  const tokF = await entrar("motorista", "11900000031");
  await chamar("POST", `${API}/online`, { lat: -23.7005, lng: -46.8 }, tokF);
  const pedido = await chamar("POST", `${API}/corridas`, { embarque: LONGE, destino: DESTINO, categoria: "Econômico", pagamento: "Pix", pedidoId: "ponta-noshow" }, tokP);
  const id = pedido.corpo.corrida.id as string;
  const esperarOferta = async (tok: string, vezes = 12) => { let o = (await chamar("GET", `${API}/estado`, undefined, tok)).corpo.oferta; for (let i = 0; i < vezes && !o; i++) { await new Promise((r) => setTimeout(r, 300)); o = (await chamar("GET", `${API}/estado`, undefined, tok)).corpo.oferta; } return o; };
  const of1 = await esperarOferta(tokF);
  assert.ok(of1, "Fábio recebe a oferta");
  assert.equal((await chamar("POST", `${API}/ofertas/${of1.id}/aceitar`, {}, tokF)).status, 200);
  // Gil fica online no embarque: seria o primeiro a receber se a corrida voltasse para a fila.
  const tokG = await entrar("motorista", "11900000032");
  await chamar("POST", `${API}/online`, { lat: -23.7, lng: -46.8 }, tokG);
  const motivos = (await chamar("GET", `${API}/motivos-cancelamento`, undefined, tokF)).corpo.motivos as string[];
  const noShow = motivos.find((m) => /não apareceu/i.test(m))!;
  assert.ok(noShow, "o motivo padrão existe na lista do motorista");
  const r = await chamar("POST", `${API}/corridas/${id}/cancelar`, { motivo: noShow }, tokF); // ainda a caminho: antes voltava para "procurando"
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(r.corpo.corrida.status, "cancelada");
  // Painel: status, quem cancelou e o motivo.
  const det = (await chamar("GET", `/api/corridas-proprias/${id}`, undefined, undefined, cookie)).corpo.corrida;
  assert.equal(det.status, "cancelada");
  assert.equal(det.canceladaPor, "Motorista");
  assert.equal(det.motivoCancelamento, noShow);
  assert.ok(det.historico.some((h: any) => h.status === "cancelada" && String(h.nota ?? "").includes(noShow)));
  // Passageiro: vê o aviso no app (texto da corrida e da notificação).
  const noApp = (await chamar("GET", `${API}/corridas/${id}`, undefined, tokP)).corpo.corrida;
  assert.equal(noApp.status, "cancelada");
  assert.match(noApp.mensagemCancelamento, /você não apareceu/);
  assert.match(noApp.statusTexto, /Corrida cancelada: você não apareceu/);
  // Sem nova oferta: nem para Gil (o mais perto), nem para Fábio; a corrida continua cancelada.
  assert.equal(await esperarOferta(tokG, 6), null, "Gil não recebe a corrida cancelada");
  assert.equal((await chamar("GET", `${API}/estado`, undefined, tokF)).corpo.oferta, null);
  const depois = (await chamar("GET", `/api/corridas-proprias/${id}`, undefined, undefined, cookie)).corpo.corrida;
  assert.equal(depois.status, "cancelada", "não voltou para procurando");
  // Se quiser, o passageiro pede uma corrida nova (outra OS).
  const nova = await chamar("POST", `${API}/corridas`, { embarque: LONGE, destino: DESTINO, categoria: "Econômico", pagamento: "Pix", pedidoId: "ponta-noshow-2" }, tokP);
  assert.equal(nova.status, 200, JSON.stringify(nova.corpo));
  assert.notEqual(nova.corpo.corrida.id, id);
  await chamar("POST", `${API}/corridas/${nova.corpo.corrida.id}/cancelar`, { motivo: "Pedi por engano" }, tokP);
});

test("gravação da corrida: o motorista envia, o passageiro vê o aviso, só a central abre (com registro de quem viu) e some depois do prazo", async () => {
  const cookie = await cookieDoPainel();
  criar(E.id, cadastroPorId("motoristas")!, { nome: "Gui Grava", telefone: "11900000030", status: "Ativo", veiculo: "Hatch", placa: "GUI1A23" }, "teste");
  const tokP = await entrar("passageiro", "11988884444");
  const tokM = await entrar("motorista", "11900000030");
  await chamar("POST", `${API}/online`, { lat: -23.55, lng: -46.63 }, tokM);
  const pedido = await chamar("POST", `${API}/corridas`, { embarque: EMBARQUE, destino: DESTINO, categoria: "Econômico", pagamento: "Pix", pedidoId: "ponta-grav" }, tokP);
  const id = pedido.corpo.corrida.id as string;
  let o = (await chamar("GET", `${API}/estado`, undefined, tokM)).corpo.oferta;
  for (let i = 0; i < 10 && !o; i++) { await new Promise((r) => setTimeout(r, 300)); o = (await chamar("GET", `${API}/estado`, undefined, tokM)).corpo.oferta; }
  await chamar("POST", `${API}/ofertas/${o.id}/aceitar`, {}, tokM);
  assert.equal((await chamar("GET", `${API}/gravacao/config`, undefined, tokM)).corpo.ativa, true);
  assert.equal((await chamar("GET", `${API}/corridas/${id}`, undefined, tokP)).corpo.corrida.gravada, false, "sem nenhum pedaço enviado ainda, o aviso de gravação não aparece");
  const enviar = async (n: number, bytes: Buffer, tipo = "audio/webm", tok = tokM) => (await fetch(`${base}${API}/corridas/${id}/gravacao`, { method: "POST", headers: { authorization: `Bearer ${tok}`, "content-type": tipo, "x-parte": String(n), "x-segundos": "60" }, body: bytes as unknown as BodyInit })).status;
  { const r0 = await fetch(`${base}${API}/corridas/${id}/gravacao`, { method: "POST", headers: { authorization: `Bearer ${tokM}`, "content-type": "audio/webm", "x-parte": "0", "x-segundos": "60" }, body: Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4]) as unknown as BodyInit }); assert.equal(r0.status, 200, await r0.text()); }
  { const r1 = await fetch(`${base}${API}/corridas/${id}/gravacao`, { method: "POST", headers: { authorization: `Bearer ${tokM}`, "content-type": "audio/webm", "x-parte": "1", "x-segundos": "60" }, body: Buffer.from([9, 9, 9, 9]) as unknown as BodyInit }); assert.equal(r1.status, 200, await r1.text()); }
  assert.equal((await chamar("GET", `${API}/corridas/${id}`, undefined, tokP)).corpo.corrida.gravada, true, "chegou gravação: o passageiro vê que a corrida é gravada");
  assert.equal(await enviar(0, Buffer.from("não é webm")), 400, "o primeiro pedaço precisa ter o cabeçalho de gravação");
  assert.equal(await enviar(2, Buffer.from([1, 2, 3]), "text/html"), 400, "formato não aceito");
  assert.equal(await enviar(2, Buffer.from([1, 2, 3]), "audio/webm", tokP), 403, "passageiro não envia gravação");
  // Só a central abre, e cada acesso fica registrado.
  assert.equal((await chamar("GET", "/api/apps-central/gravacoes")).status, 401, "sem login do painel não abre");
  const lista = (await chamar("GET", "/api/apps-central/gravacoes", undefined, undefined, cookie)).corpo.gravacoes;
  const g = lista.find((x: any) => x.corridaId === id);
  assert.equal(g.partes.length, 2);
  const arq = await fetch(`${base}/api/apps-central/gravacoes/${id}/0`, { headers: { cookie } });
  assert.equal(arq.status, 200);
  assert.equal((await arq.arrayBuffer()).byteLength, 8);
  const depois = (await chamar("GET", "/api/apps-central/gravacoes", undefined, undefined, cookie)).corpo.gravacoes.find((x: any) => x.corridaId === id);
  assert.equal(depois.acessos.length, 1);
  assert.equal(depois.acessos[0].por, "admin@ponta.test", "fica registrado quem viu");
  // Prazo: com a corrida marcada para guardar nada é apagado; sem marcar, depois dos dias da empresa, some.
  const { limparGravacoes } = await import("../src/apps/gravacoes.ts");
  await chamar("POST", `/api/apps-central/gravacoes/${id}/guardar`, { guardar: true }, undefined, cookie);
  assert.equal(limparGravacoes(E.id, Date.now() + 400 * 86_400_000), 0, "marcada para guardar: fica");
  await chamar("POST", `/api/apps-central/gravacoes/${id}/guardar`, { guardar: false }, undefined, cookie);
  assert.equal(limparGravacoes(E.id, Date.now() + 5 * 86_400_000), 0, "ainda dentro do prazo (30 dias)");
  assert.ok(limparGravacoes(E.id, Date.now() + 400 * 86_400_000) >= 1, "passado o prazo, apaga");
  assert.equal((await chamar("GET", "/api/apps-central/gravacoes", undefined, undefined, cookie)).corpo.gravacoes.some((x: any) => x.corridaId === id), false);
});

test("painel acha as duas fichas (passageiro e motorista) pelo mesmo telefone", async () => {
  const cookie = await cookieDoPainel();
  const r = (await chamar("GET", "/api/apps-central/pessoas/11955554444", undefined, undefined, cookie)).corpo; // criado no teste de cadastro dos dois papéis
  assert.ok(r.passageiro && r.motorista, JSON.stringify(r));
  assert.equal(r.doisPapeis, true);
  assert.equal((await chamar("GET", "/api/apps-central/pessoas/123", undefined, undefined, cookie)).status, 400);
});

test("taxas da central: cada taxa configurada no painel aparece no extrato do motorista e no detalhe do passageiro; bruto − taxas = líquido; mudou no painel, muda no app", async () => {
  const { salvarTaxa, removerTaxa, taxas } = await import("../src/config/taxas.ts");
  const FORMAS = ["dinheiro", "debito", "credito", "cartao_app", "pix"];
  const t1 = salvarTaxa(E.id, { nome: "Taxa APP", quemPaga: "motorista", categorias: ["Econômico"], pagamentos: FORMAS, faixas: [{ de: 0, ate: null, tipo: "porcentagem", valor: 10 }] }, "teste").find((t) => t.nome === "Taxa APP")!;
  salvarTaxa(E.id, { nome: "Seguro", quemPaga: "motorista", categorias: ["Econômico"], pagamentos: FORMAS, faixas: [{ de: 0, ate: null, tipo: "fixo", valor: 1 }] }, "teste");
  salvarTaxa(E.id, { nome: "Taxa de serviço", quemPaga: "passageiro", categorias: ["Econômico"], pagamentos: FORMAS, faixas: [{ de: 0, ate: null, tipo: "fixo", valor: 1.5 }] }, "teste");
  try {
    criar(E.id, cadastroPorId("motoristas")!, { nome: "Hugo Taxas", telefone: "11900000041", status: "Ativo", veiculo: "Sedã", placa: "HUG1A23" }, "teste");
    const tokP = await entrar("passageiro", "11988885555");
    const tokM = await entrar("motorista", "11900000041");
    await chamar("POST", `${API}/online`, { lat: -23.9005, lng: -47.1 }, tokM);
    const LONGE = { texto: "Rua do Sossego, 50", lat: -23.9, lng: -47.1 };
    const pedido = await chamar("POST", `${API}/corridas`, { embarque: LONGE, destino: DESTINO, categoria: "Econômico", pagamento: "Dinheiro", pedidoId: "ponta-taxas" }, tokP);
    const id = pedido.corpo.corrida.id as string;
    let oferta = (await chamar("GET", `${API}/estado`, undefined, tokM)).corpo.oferta;
    for (let i = 0; i < 12 && !oferta; i++) { await new Promise((r) => setTimeout(r, 300)); oferta = (await chamar("GET", `${API}/estado`, undefined, tokM)).corpo.oferta; }
    assert.ok(oferta, "a oferta chega ao motorista");
    await chamar("POST", `${API}/ofertas/${oferta.id}/aceitar`, {}, tokM);
    for (const s of ["no_local", "em_andamento", "finalizada"]) await chamar("POST", `${API}/corridas/${id}/status`, { status: s }, tokM);
    // Motorista: uma linha por taxa, com o nome do painel; bruto − taxas = líquido; resumo do período soma por nome.
    const g = (await chamar("GET", `${API}/ganhos?periodo=semana`, undefined, tokM)).corpo;
    const c = g.lista.find((x: any) => x.id === id);
    assert.ok(c, "corrida no extrato");
    assert.deepEqual(c.taxas.map((t: any) => t.nome).sort(), ["Seguro", "Taxa APP"]);
    assert.equal(Math.round(c.taxas.find((t: any) => t.nome === "Taxa APP").valor * 100), Math.round(c.valorBruto * 10));
    assert.equal(c.taxas.find((t: any) => t.nome === "Seguro").valor, 1);
    const somaTaxas = c.taxas.reduce((s: number, t: any) => s + t.valor, 0);
    assert.equal(Math.round(somaTaxas * 100), Math.round(c.taxaCentral * 100), "a soma das taxas é a taxa da central");
    assert.equal(Math.round((c.valorBruto - somaTaxas) * 100), Math.round(c.valorLiquido * 100), "bruto − taxas = líquido");
    assert.deepEqual(g.taxasPorNome.map((t: any) => t.nome).sort(), ["Seguro", "Taxa APP"]);
    assert.ok(Math.abs(g.taxasPorNome.reduce((s: number, t: any) => s + t.valor, 0) - g.totalTaxa) < 0.01, "total de taxas do período");
    // Passageiro: a taxa dele (à parte) e o total pago.
    const pax = (await chamar("GET", `${API}/corridas/${id}`, undefined, tokP)).corpo.corrida;
    assert.deepEqual(pax.taxas, [{ nome: "Taxa de serviço", valor: 1.5 }]);
    assert.equal(pax.taxaServico, 1.5);
    // Mudou no painel: o app reflete (sem valores copiados).
    salvarTaxa(E.id, { id: t1.id, nome: "Taxa APP", quemPaga: "motorista", categorias: ["Econômico"], pagamentos: FORMAS, faixas: [{ de: 0, ate: null, tipo: "porcentagem", valor: 20 }] }, "teste");
    const g2 = (await chamar("GET", `${API}/ganhos?periodo=semana`, undefined, tokM)).corpo;
    const c2 = g2.lista.find((x: any) => x.id === id);
    assert.equal(Math.round(c2.taxas.find((t: any) => t.nome === "Taxa APP").valor * 100), Math.round(c2.valorBruto * 20));
    assert.equal(Math.round((c2.valorBruto - c2.taxas.reduce((s: number, t: any) => s + t.valor, 0)) * 100), Math.round(c2.valorLiquido * 100));
  } finally {
    for (const t of taxas(E.id)) removerTaxa(E.id, t.id);
  }
});

test("recarga de saldo do motorista: o pedido chega à central, o depósito confirmado entra no saldo da carteira e aparece em Recargas do painel", async () => {
  const cookie = await cookieDoPainel();
  criar(E.id, cadastroPorId("motoristas")!, { nome: "Iara Recarga", telefone: "11900000051", status: "Ativo", veiculo: "Sedã", placa: "IAR1A23" }, "teste");
  const tokM = await entrar("motorista", "11900000051");
  const antes = (await chamar("GET", `${API}/carteira`, undefined, tokM)).corpo;
  assert.doesNotMatch(String(antes.recarga), /saque/i, "o texto da recarga não fala de saque");
  const pedido = await chamar("POST", `${API}/suporte`, { texto: "Pedido de recarga: quero depositar R$ 50,00 de saldo na carteira (taxas das corridas)." }, tokM);
  assert.equal(pedido.status, 200, JSON.stringify(pedido.corpo));
  const { listar } = await import("../src/cadastros/armazem.ts");
  const motorista = listar(E.id, cadastroPorId("motoristas")!).find((m) => m.telefone === "11900000051")!;
  // A central confirma o depósito e credita na carteira (mesma função do painel: Carteiras › ajuste manual).
  const { lancar } = await import("../src/apps/extras.ts");
  lancar(E.id, "motorista", motorista.id, 50, "Depósito confirmado", "admin@ponta.test");
  const depois = (await chamar("GET", `${API}/carteira`, undefined, tokM)).corpo;
  assert.equal(Math.round((depois.saldo - antes.saldo) * 100), 5000, "o depósito entra no saldo");
  assert.ok(depois.extrato.some((l: any) => l.valor === 50 && /Depósito confirmado/.test(l.descricao)), "aparece no extrato do app");
  const { listaRecargas } = await import("../src/config/financeiro.ts");
  const hoje = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10); // dia de Brasília (UTC-3), como o app
  const rec = listaRecargas(E.id, "motorista", { inicio: hoje, fim: hoje });
  assert.ok(rec.itens.some((i: any) => i.valor === 50), "o painel enxerga a recarga em Recargas");
});

test("o app avisa que está aberto (ping) e o servidor guarda o último contato para o painel", async () => {
  criar(E.id, cadastroPorId("motoristas")!, { nome: "Jo Contato", telefone: "11900000061", status: "Ativo", veiculo: "Hatch", placa: "JOC1A23" }, "teste");
  const { listar } = await import("../src/cadastros/armazem.ts");
  const { ultimosContatos } = await import("../src/apps/sessoes.ts");
  const tokM = await entrar("motorista", "11900000061");
  const r = await chamar("GET", `${API}/ping`, undefined, tokM);
  assert.equal(r.status, 200);
  const m = listar(E.id, cadastroPorId("motoristas")!).find((x) => x.telefone === "11900000061")!;
  const em = ultimosContatos(E.id, "motorista").get(m.id);
  assert.ok(em && Date.now() - em < 60_000, "último contato registrado agora");
  assert.equal((await chamar("GET", `${API}/ping`)).status, 401, "sem token não vale");
});

test("Meus veículos: o veículo que já está no cadastro do motorista (painel ou cadastro antigo do app) aparece no app", async () => {
  criar(E.id, cadastroPorId("motoristas")!, { nome: "Kaique Veiculo", telefone: "11900000071", status: "Ativo", veiculo: "Gol Branco", placa: "QND9J38", anoVeiculo: 2018 }, "teste");
  const tokM = await entrar("motorista", "11900000071");
  const r = await chamar("GET", `${API}/veiculos`, undefined, tokM);
  assert.equal(r.status, 200);
  const lista = r.corpo.veiculos as Array<{ modelo: string; placa: string; ano: number | null }>;
  assert.ok(lista.some((v) => v.placa === "QND9J38"), `veículo do cadastro aparece: ${JSON.stringify(lista)}`);
  assert.ok(lista.some((v) => /Gol/.test(v.modelo)));
});

test("fotos enviadas pelos apps viram WebP (qualidade 80, até 1600 px): foto de perfil e documento", async () => {
  const sharp = (await import("sharp")).default;
  const { arquivoDaFoto } = await import("../src/apps/perfil.ts");
  const png = await sharp({ create: { width: 2400, height: 1800, channels: 3, background: { r: 200, g: 120, b: 30 } } }).png().toBuffer();
  const tokP = await entrar("passageiro", "11988889999");
  const r = await fetch(`${base}${API}/foto`, { method: "POST", headers: { authorization: `Bearer ${tokP}`, "content-type": "image/png" }, body: png });
  assert.equal(r.status, 200, await r.text());
  const f = arquivoDaFoto(E.id, "passageiro", "11988889999");
  assert.ok(f, "foto gravada");
  assert.equal(f!.mime, "image/webp");
  const info = await sharp(f!.caminho).metadata();
  assert.equal(info.format, "webp");
  assert.ok(Math.max(info.width ?? 0, info.height ?? 0) <= 1600, `lado maior limitado: ${info.width}x${info.height}`);
  // Documento do motorista (CNH): também em WebP.
  criar(E.id, cadastroPorId("motoristas")!, { nome: "Lia Documento", telefone: "11900000081", status: "Ativo", veiculo: "Hatch", placa: "LIA1A23" }, "teste");
  const tokM = await entrar("motorista", "11900000081");
  const d = await fetch(`${base}${API}/documentos/cnh`, { method: "POST", headers: { authorization: `Bearer ${tokM}`, "content-type": "image/png" }, body: png });
  assert.equal(d.status, 200, await d.text());
  const { arquivoDoDocumento } = await import("../src/apps/extras.ts");
  const { listar } = await import("../src/cadastros/armazem.ts");
  const m = listar(E.id, cadastroPorId("motoristas")!).find((x) => x.telefone === "11900000081")!;
  assert.equal(arquivoDoDocumento(E.id, m.id, "cnh")?.mime, "image/webp");
});

// ---------------------------------------------------------------------------------------------------------------------------------
// "Mudou no painel, mudou no app": cada função do painel que afeta os apps, mudada com as mesmas funções do painel e conferida no app.
// A tabela com o que foi testado e como está em docs/TESTE_PAINEL_APPS.md.

test("painel → app: tarifa da categoria muda a estimativa; cupom criado/desativado aparece e some; documentos obrigatórios e motivos de cancelamento seguem o painel", async () => {
  const { atualizar, listar } = await import("../src/cadastros/armazem.ts");
  const { gerais, salvarGerais } = await import("../src/config/gerais.ts");
  const tokP = await entrar("passageiro", "11988887001");
  const consulta = `/estimativa?latEmbarque=-23.55&lngEmbarque=-46.63&latDestino=-23.6&lngDestino=-46.66&categoria=${encodeURIComponent("Econômico")}`;
  const antes = (await chamar("GET", `${API}${consulta}`, undefined, tokP)).corpo;
  assert.ok(antes.valor > 0, JSON.stringify(antes));
  // 1) Tarifa: o valor do km sobe no painel -> a estimativa do app sobe.
  const cat = listar(E.id, cadastroPorId("categorias")!).find((c) => c.nome === "Econômico")!;
  atualizar(E.id, cadastroPorId("categorias")!, cat.id, { ...cat, valorKm: 4 }, "teste");
  const depois = (await chamar("GET", `${API}${consulta}`, undefined, tokP)).corpo;
  assert.ok(depois.valor > antes.valor, `estimativa subiu: ${antes.valor} -> ${depois.valor}`);
  atualizar(E.id, cadastroPorId("categorias")!, cat.id, { ...cat, valorKm: 2 }, "teste");
  // 2) Cupom: criado no painel aparece para o passageiro; desativado, some.
  const c = criar(E.id, cadastroPorId("cupons")!, { codigo: "PAINEL10", tipoDesconto: "Percentual", valor: 10, ativo: true, automatico: false, exibirApp: true }, "teste");
  assert.ok(((await chamar("GET", `${API}/cupons`, undefined, tokP)).corpo.cupons as Array<{ codigo: string }>).some((x) => x.codigo === "PAINEL10"), "cupom novo aparece");
  atualizar(E.id, cadastroPorId("cupons")!, c.id, { ...c, ativo: false }, "teste");
  assert.ok(!((await chamar("GET", `${API}/cupons`, undefined, tokP)).corpo.cupons as Array<{ codigo: string }>).some((x) => x.codigo === "PAINEL10"), "cupom desativado some");
  // 3) Documentos obrigatórios e motivos de cancelamento vêm de Configurações > Gerais.
  const g = gerais(E.id);
  const docs = g.motorista.documentos.map((d) => ({ ...d, exigir: d.id === "cnh" ? true : false }));
  salvarGerais(E.id, { ...g, motorista: { ...g.motorista, documentos: docs }, cancelamento: { ...g.cancelamento, motorista: { ...g.cancelamento.motorista, motivos: ["Motivo novo do painel", "Passageiro não apareceu"] } } });
  const cfg = (await chamar("GET", `${API}/config`, undefined, tokP)).corpo;
  assert.deepEqual(cfg.documentosExigidos.filter((d: any) => d.exigir).map((d: any) => d.id), ["cnh"]);
  assert.ok(cfg.motivosCancelamento.motorista.includes("Motivo novo do painel"), "motivo novo do painel aparece no /config");
  const tokM = await (async () => { criar(E.id, cadastroPorId("motoristas")!, { nome: "Rui Docs", telefone: "11900000101", status: "Ativo", veiculo: "Hatch", placa: "RUI1A23" }, "teste"); return entrar("motorista", "11900000101"); })();
  assert.deepEqual((await chamar("GET", `${API}/motivos-cancelamento`, undefined, tokM)).corpo.motivos, cfg.motivosCancelamento.motorista, "o motorista vê exatamente a lista do painel");
  assert.deepEqual((await chamar("GET", `${API}/documentos`, undefined, tokM)).corpo.obrigatorios.includes("cnh"), true);
  salvarGerais(E.id, g); // devolve como estava
});

test("painel → app: motorista bloqueado no painel perde o acesso ao app; reativado, volta", async () => {
  const { atualizar, listar } = await import("../src/cadastros/armazem.ts");
  criar(E.id, cadastroPorId("motoristas")!, { nome: "Sol Suspensa", telefone: "11900000111", status: "Ativo", veiculo: "Hatch", placa: "SOL1A23" }, "teste");
  const tokM = await entrar("motorista", "11900000111");
  assert.equal((await chamar("GET", `${API}/estado`, undefined, tokM)).status, 200);
  const m = listar(E.id, cadastroPorId("motoristas")!).find((x) => x.telefone === "11900000111")!;
  atualizar(E.id, cadastroPorId("motoristas")!, m.id, { ...m, status: "Bloqueado" }, "teste");
  assert.ok([401, 403].includes((await chamar("GET", `${API}/estado`, undefined, tokM)).status), "bloqueado: o app é barrado");
  atualizar(E.id, cadastroPorId("motoristas")!, m.id, { ...m, status: "Ativo" }, "teste");
  assert.equal((await chamar("GET", `${API}/estado`, undefined, tokM)).status, 200, "reativado: volta");
});

test("painel → app (onda 1): Passe Livre criado no painel aparece e a compra debita o saldo; tarifa dinâmica global muda a estimativa", async () => {
  const { salvarOferta } = await import("../src/config/passe-livre.ts");
  const { salvarGlobal, dinamicaGlobal } = await import("../src/config/dinamica.ts");
  const { lancar } = await import("../src/apps/extras.ts");
  const { listar } = await import("../src/cadastros/armazem.ts");
  // Passe Livre
  criar(E.id, cadastroPorId("motoristas")!, { nome: "Teo Passe", telefone: "11900000121", status: "Ativo", veiculo: "Hatch", placa: "TEO1A23" }, "teste");
  const tokM = await entrar("motorista", "11900000121");
  const m = listar(E.id, cadastroPorId("motoristas")!).find((x) => x.telefone === "11900000121")!;
  const ofs = salvarOferta(E.id, { valor: 20, horas: 24 });
  const antes = (await chamar("GET", `${API}/passe-livre`, undefined, tokM)).corpo;
  assert.ok(antes.ofertas.some((o: any) => o.valor === 20 && o.horas === 24), "a oferta criada no painel aparece no app");
  lancar(E.id, "motorista", m.id, 50, "Crédito de teste", "admin@ponta.test");
  const oferta = ofs.find((o) => o.valor === 20 && o.horas === 24)!;
  const comp = await chamar("POST", `${API}/passe-livre/comprar`, { ofertaId: oferta.id, chave: "compra-teo-1" }, tokM);
  assert.equal(comp.status, 200, JSON.stringify(comp.corpo));
  assert.ok(comp.corpo.vigente, "passe vigente depois de comprar");
  assert.equal(Math.round((comp.corpo.saldo - antes.saldo) * 100), 3000, "50 de crédito − 20 do passe = +30 no saldo");
  // Tarifa dinâmica global: multiplicador 1,5 sobe a estimativa; desligada, volta.
  const tokP = await entrar("passageiro", "11988887002");
  const consulta = `/estimativa?latEmbarque=-23.55&lngEmbarque=-46.63&latDestino=-23.6&lngDestino=-46.66&categoria=${encodeURIComponent("Econômico")}`;
  const sem = (await chamar("GET", `${API}${consulta}`, undefined, tokP)).corpo.valor;
  const g0 = dinamicaGlobal(E.id);
  salvarGlobal(E.id, { ativa: true, cobranca: "multiplicador", valor: 1.5, minimo: 0 });
  const com = (await chamar("GET", `${API}${consulta}`, undefined, tokP)).corpo.valor;
  salvarGlobal(E.id, g0);
  assert.ok(com > sem, `dinâmica sobe a estimativa: ${sem} -> ${com}`);
});

test("painel → app (onda 1): Carteiras de crédito mudam os botões e o aviso da carteira; saldo mínimo impede receber corrida até recarregar", async () => {
  const { carteirasCredito, salvarCarteirasCredito } = await import("../src/config/carteiras-credito.ts");
  const { lancar } = await import("../src/apps/extras.ts");
  const { listar } = await import("../src/cadastros/armazem.ts");
  const original = carteirasCredito(E.id);
  criar(E.id, cadastroPorId("motoristas")!, { nome: "Uma Saldo", telefone: "11900000131", status: "Ativo", veiculo: "Hatch", placa: "UMA1A23" }, "teste");
  const tokM = await entrar("motorista", "11900000131");
  const m = listar(E.id, cadastroPorId("motoristas")!).find((x) => x.telefone === "11900000131")!;
  try {
    // Botões e aviso
    salvarCarteirasCredito(E.id, { motorista: { ...original.motorista, saque: false, recarga: true, mensagemRecargaAtiva: true, mensagemRecargaValor: 5 } });
    const c1 = (await chamar("GET", `${API}/carteira`, undefined, tokM)).corpo;
    assert.equal(c1.movimentos.saque, false, "painel desligou o saque: o app esconde Retirar");
    assert.equal(c1.movimentos.recarga, true);
    assert.match(c1.avisoRecarga, /saldo está baixo/i, "aviso de saldo baixo vem do painel");
    // Saldo mínimo: com R$ 50 exigidos e saldo 0, não recebe corrida; com crédito, recebe.
    salvarCarteirasCredito(E.id, { motorista: { ...original.motorista, saldoMinimoAtivo: true, saldoMinimo: 50 } });
    await chamar("POST", `${API}/online`, { lat: -23.55, lng: -46.63 }, tokM);
    const tokP = await entrar("passageiro", "11988887003");
    const LONGE3 = EMBARQUE; // com saldo mínimo de R$ 50, só quem tem crédito concorre: os outros motoristas dos testes têm saldo zero
    const pedido = await chamar("POST", `${API}/corridas`, { embarque: LONGE3, destino: DESTINO, categoria: "Econômico", pagamento: "Pix", pedidoId: "ponta-saldo-minimo" }, tokP);
    await new Promise((r) => setTimeout(r, 1800));
    assert.equal((await chamar("GET", `${API}/estado`, undefined, tokM)).corpo.oferta, null, "sem saldo mínimo: nenhuma oferta");
    await chamar("POST", `${API}/corridas/${pedido.corpo.corrida.id}/cancelar`, { motivo: "Pedi por engano" }, tokP);
    lancar(E.id, "motorista", m.id, 60, "Crédito de teste", "admin@ponta.test");
    const pedido2 = await chamar("POST", `${API}/corridas`, { embarque: LONGE3, destino: DESTINO, categoria: "Econômico", pagamento: "Pix", pedidoId: "ponta-saldo-minimo-2" }, tokP);
    let of = (await chamar("GET", `${API}/estado`, undefined, tokM)).corpo.oferta;
    for (let i = 0; i < 12 && !of; i++) { await new Promise((r) => setTimeout(r, 300)); of = (await chamar("GET", `${API}/estado`, undefined, tokM)).corpo.oferta; }
    assert.ok(of, "com saldo acima do mínimo: recebe a oferta");
    await chamar("POST", `${API}/ofertas/${of.id}/recusar`, {}, tokM);
    await chamar("POST", `${API}/corridas/${pedido2.corpo.corrida.id}/cancelar`, { motivo: "Pedi por engano" }, tokP);
  } finally {
    salvarCarteirasCredito(E.id, original);
  }
});

test("desafios: criado no painel aparece no app com progresso; cumprido (automático) paga o prêmio na carteira; manual fica em análise; vencido vai para expirados", async () => {
  const hoje = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10), ontem = new Date(Date.now() - 3 * 3_600_000 - 2 * 86_400_000).toISOString().slice(0, 10), amanha = new Date(Date.now() - 3 * 3_600_000 + 5 * 86_400_000).toISOString().slice(0, 10);
  criar(E.id, cadastroPorId("desafios")!, { nome: "Primeira corrida do dia", tipo: "Desafio de corridas", meta: 1, premio: 10, inicio: hoje, fim: amanha, aprovacao: "Automático", tipoRecompensa: "Em créditos", ativo: true, regras: "Faça 1 corrida finalizada." }, "teste");
  criar(E.id, cadastroPorId("desafios")!, { nome: "Meta com análise", tipo: "Desafio de corridas", meta: 1, premio: 7, inicio: hoje, fim: amanha, aprovacao: "Manual", tipoRecompensa: "Em créditos", ativo: true }, "teste");
  criar(E.id, cadastroPorId("desafios")!, { nome: "Desafio vencido", tipo: "Desafio de corridas", meta: 50, premio: 5, inicio: ontem, fim: ontem, aprovacao: "Automático", tipoRecompensa: "Em créditos", ativo: true }, "teste");
  criar(E.id, cadastroPorId("motoristas")!, { nome: "Zed Desafio", telefone: "11900000141", status: "Ativo", veiculo: "Hatch", placa: "ZED1A23" }, "teste");
  const tokM = await entrar("motorista", "11900000141");
  const antes = (await chamar("GET", `${API}/desafios`, undefined, tokM)).corpo;
  const por = (l: any[], n: string) => l.find((d: any) => d.nome === n);
  assert.equal(por(antes.desafios, "Primeira corrida do dia")?.situacao, "ativo", "aparece como ativo");
  assert.equal(por(antes.desafios, "Primeira corrida do dia")?.feito, 0);
  assert.equal(por(antes.desafios, "Desafio vencido")?.situacao, "expirado", "vencido sem cumprir: expirado");
  const saldoAntes = (await chamar("GET", `${API}/carteira`, undefined, tokM)).corpo.saldo;
  // Cumpre: uma corrida finalizada.
  const POS = { lat: -25.4, lng: -49.2 };
  await chamar("POST", `${API}/online`, POS, tokM);
  const tokP = await entrar("passageiro", "11988887004");
  const ped = await chamar("POST", `${API}/corridas`, { embarque: { texto: "Rua do Desafio, 1", ...POS }, destino: { texto: "Av. Fim, 9", lat: -25.43, lng: -49.23 }, categoria: "Econômico", pagamento: "Dinheiro", pedidoId: "ponta-desafio" }, tokP);
  let of = (await chamar("GET", `${API}/estado`, undefined, tokM)).corpo.oferta;
  for (let i = 0; i < 12 && !of; i++) { await new Promise((r) => setTimeout(r, 300)); of = (await chamar("GET", `${API}/estado`, undefined, tokM)).corpo.oferta; }
  assert.ok(of, "oferta chegou");
  await chamar("POST", `${API}/ofertas/${of.id}/aceitar`, {}, tokM);
  for (const s of ["no_local", "em_andamento", "finalizada"]) await chamar("POST", `${API}/corridas/${ped.corpo.corrida.id}/status`, { status: s }, tokM);
  const depois = (await chamar("GET", `${API}/desafios`, undefined, tokM)).corpo;
  assert.equal(por(depois.desafios, "Primeira corrida do dia")?.situacao, "concluido", "meta batida: concluído");
  assert.equal(por(depois.desafios, "Meta com análise")?.situacao, "em_analise", "manual: em análise até a central aprovar");
  const cart = (await chamar("GET", `${API}/carteira`, undefined, tokM)).corpo;
  assert.ok(cart.extrato.some((l: any) => /Prêmio: Primeira corrida do dia/.test(l.descricao) && l.valor === 10), "prêmio no extrato");
  assert.ok(cart.saldo > saldoAntes, "o prêmio entrou no saldo");
  assert.ok(!cart.extrato.some((l: any) => /Meta com análise/.test(l.descricao)), "manual ainda não pagou");
});

test("pendência: sem aceite nas tentativas a corrida vira PENDÊNCIA (aba Pend. do motorista, qualquer um pega); passado o tempo do painel é cancelada e o passageiro lê que não há motorista", async () => {
  const { controlarPendencias, pendenciaAte, OFERTA_MS, TEXTO_SEM_MOTORISTA, corridaParaApp } = await import("../src/apps/despacho.ts");
  const { regrasDespacho } = await import("../src/config/despacho.ts");
  const { listarProprias } = await import("../src/corridas/index.ts");
  const regras = regrasDespacho(E.id);
  assert.equal(regras.tempoPendencia, 10, "padrão do painel: 10 min em pendência");
  const LONGE = { lat: -10.0, lng: -40.0 }; // longe de qualquer motorista dos outros testes
  const pedir = async (tel: string, id: string) => {
    const tokP = await entrar("passageiro", tel);
    const r = await chamar("POST", `${API}/corridas`, { embarque: { texto: "Rua da Pendência, 1", ...LONGE }, destino: { texto: "Av. Fim, 9", lat: -10.03, lng: -40.03 }, categoria: "Econômico", pagamento: "Dinheiro", pedidoId: id }, tokP);
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    return r.corpo.corrida.id as string;
  };
  const c1 = await pedir("11988887301", "pend-1"), c2 = await pedir("11988887302", "pend-2");
  const achar = (id: string) => listarProprias(E.id).find((c) => c.id === id)!;
  assert.equal(pendenciaAte(E.id, c1), null, "recém-pedida: ainda não é pendência");
  controlarPendencias(E.id, Date.now() + 5_000);
  assert.equal(pendenciaAte(E.id, c1), null, "recém-pedida e sem rodada: não vira pendência de cara (a hora da corrida é de Brasília, 3 h atrás do UTC)");
  // Passou o tempo das tentativas sem ninguém (mesmo sem motorista online): entra em pendência pelo tempo do painel.
  const t1 = Date.now() + regras.maxTentativas * OFERTA_MS() + 31_000;
  controlarPendencias(E.id, t1);
  const ate1 = pendenciaAte(E.id, c1);
  assert.ok(ate1 && Math.abs(ate1 - (t1 + regras.tempoPendencia * 60_000)) < 1000, "pendência dura o tempo configurado no painel");
  assert.equal(achar(c1).status, "procurando", "na pendência ainda procura");
  // Motorista online perto enxerga as duas na aba Pend. (não em Disp.) e pega uma.
  criar(E.id, cadastroPorId("motoristas")!, { nome: "Pat Pendência", telefone: "11900000301", status: "Ativo", veiculo: "Hatch", placa: "PAT1A23" }, "teste");
  const tokM = await entrar("motorista", "11900000301");
  await chamar("POST", `${API}/online`, LONGE, tokM);
  const lista = (await chamar("GET", `${API}/corridas-abertas`, undefined, tokM)).corpo;
  const pend = lista.pendentes.filter((c: any) => c.emPendencia);
  assert.ok(pend.some((c: any) => c.id === c1) && pend.some((c: any) => c.id === c2), "as duas aparecem como pendência");
  assert.ok(!lista.disponiveis.some((c: any) => c.id === c1), "pendência sai de Disponíveis");
  assert.ok(pend.every((c: any) => c.pendenciaAte), "cada pendência diz até quando vale");
  const pegou = await chamar("POST", `${API}/corridas/${c1}/pegar`, {}, tokM);
  assert.equal(pegou.status, 200, JSON.stringify(pegou.corpo));
  assert.equal(achar(c1).status, "a_caminho", "o motorista pegou a pendência");
  // A outra ninguém pegou: passado o tempo de pendência (+ a busca parada) é cancelada de vez.
  const t2 = (pendenciaAte(E.id, c2) ?? 0) + 31_000;
  await controlarPendencias(E.id, t2);
  assert.equal(achar(c2).status, "nao_atendida", "sem aceite no tempo do painel: cancelada");
  assert.equal(corridaParaApp(E.id, achar(c2), "passageiro").mensagemCancelamento, TEXTO_SEM_MOTORISTA);
  assert.match(TEXTO_SEM_MOTORISTA, /nenhum motorista dispon[ií]vel/i);
  // limpeza: encerra a corrida pegada para não atrapalhar os outros testes
  await chamar("POST", `${API}/corridas/${c1}/cancelar`, { motivo: "Teste" }, tokM);
  await chamar("POST", `${API}/offline`, {}, tokM);
});

test("recusar pela lista de corridas: some da lista de quem recusou, continua para os outros e a oferta aberta passa adiante", async () => {
  const { controlarPendencias, OFERTA_MS } = await import("../src/apps/despacho.ts");
  const { regrasDespacho } = await import("../src/config/despacho.ts");
  const { listarProprias } = await import("../src/corridas/index.ts");
  const regras = regrasDespacho(E.id);
  const LONGE = { lat: -11.0, lng: -41.0 };
  const tokP = await entrar("passageiro", "11988887401");
  const ped = await chamar("POST", `${API}/corridas`, { embarque: { texto: "Rua da Recusa, 1", ...LONGE }, destino: { texto: "Av. Fim, 9", lat: -11.03, lng: -41.03 }, categoria: "Econômico", pagamento: "Dinheiro", pedidoId: "recusa-lista-1" }, tokP);
  assert.equal(ped.status, 200, JSON.stringify(ped.corpo));
  const id = ped.corpo.corrida.id as string;
  await controlarPendencias(E.id, Date.now() + regras.maxTentativas * OFERTA_MS() + 31_000); // entra em pendência: aparece na lista de todos, sem chamada
  criar(E.id, cadastroPorId("motoristas")!, { nome: "Rita Recusa", telefone: "11900000401", status: "Ativo", veiculo: "Hatch", placa: "RIT1A23" }, "teste");
  criar(E.id, cadastroPorId("motoristas")!, { nome: "Beto Fica", telefone: "11900000402", status: "Ativo", veiculo: "Hatch", placa: "BET1A23" }, "teste");
  const tokA = await entrar("motorista", "11900000401"), tokB = await entrar("motorista", "11900000402");
  for (const t of [tokA, tokB]) await chamar("POST", `${API}/online`, LONGE, t);
  const vejo = async (t: string) => { const l = (await chamar("GET", `${API}/corridas-abertas`, undefined, t)).corpo; return [...l.disponiveis, ...l.pendentes].some((c: any) => c.id === id); };
  assert.ok(await vejo(tokA) && await vejo(tokB), "as duas veem a corrida");
  const r = await chamar("POST", `${API}/corridas/${id}/recusar`, {}, tokA);
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.ok(!(await vejo(tokA)), "quem recusou não vê mais a corrida");
  assert.ok(await vejo(tokB), "o outro motorista continua vendo");
  assert.equal(listarProprias(E.id).find((c) => c.id === id)!.status, "procurando", "a corrida segue procurando");
  assert.equal((await chamar("POST", `${API}/corridas/${id}/recusar`, {}, tokA)).status, 200, "recusar de novo não dá erro");
  await chamar("POST", `${API}/corridas/${id}/cancelar`, { motivo: "Teste" }, tokP);
  for (const t of [tokA, tokB]) await chamar("POST", `${API}/offline`, {}, t);
});
