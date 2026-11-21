// Registro de cada corrida: eventos (Histórico da OS) gravados em cada etapa e trajeto real (Trajeto da OS) a partir das posições
// do app do motorista. Tudo local, sem internet. Rodar: npm test (na pasta painel).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "corrida-registro-teste-"));
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
const C = await import("../src/corridas/index.ts");
const R = await import("../src/corridas/registro.ts");
const { salvarDespacho } = await import("../src/config/despacho.ts");

const app = express();
app.use(express.json());
app.post("/teste/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({ ok: true }); });
app.use("/api/apps", rotasApps);
app.use("/api", exigirLogin);
app.use("/api/operacao", rotasOperacao);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => servidor.close());

async function chamar(metodo: string, url: string, corpo?: unknown, token?: string, cookie?: string) {
  const r = await fetch(base + url, { method: metodo, headers: { ...(corpo !== undefined ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...(cookie ? { cookie } : {}) }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  return { status: r.status, corpo: (await r.json().catch(() => ({}))) as Record<string, any> };
}
const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const EMBARQUE = { texto: "Rua das Flores, 100", lat: -23.55, lng: -46.63 };
const DESTINO = { texto: "Av. Central, 2000", lat: -23.57, lng: -46.63 };

let seqEmpresa = 0;
async function montar() {
  const E = D.criarEmpresa("Central Registro");
  const admin = D.criarUsuario({ email: `admin${++seqEmpresa}@registro.test`, nome: "Ana", senha: "senha-forte-1", empresaId: E.id, papel: "admin" });
  criar(E.id, cadastroPorId("categorias")!, { nome: "Econômico", bandeirada: 5, valorKm: 2, valorMinimo: 9.9, ativa: true }, "teste");
  salvarDespacho(E.id, { metodo: "primeiro_aceitar", limiteMotoristas: 3, prioritarios: 3, notificarGrupo: "todos", raioMetros: 8000 });
  const API = `/api/apps/${E.id}`;
  const login = async (papel: string, telefone: string) => {
    const c = await chamar("POST", `${API}/entrar/codigo`, { papel, telefone });
    const t = (await chamar("POST", `${API}/entrar`, { papel, telefone, codigo: c.corpo.codigoTeste })).corpo.token as string;
    if (papel === "passageiro") await chamar("POST", `${API}/eu`, { nome: "Cliente Teste" }, t);
    return t;
  };
  const tokens: Record<string, string> = {}, ids: Record<string, string> = {};
  for (const [i, [nome, lat]] of ([["Ana", -23.551], ["Beto", -23.552], ["Caio", -23.553]] as const).entries()) {
    const tel = `11910000${String(i).padStart(3, "0")}`;
    const m = criar(E.id, cadastroPorId("motoristas")!, { nome, telefone: tel, status: "Ativo", viatura: `V${i + 1}` }, "teste");
    ids[nome] = m.id;
    tokens[nome] = await login("motorista", tel);
    assert.equal((await chamar("POST", `${API}/online`, { lat, lng: -46.63 }, tokens[nome])).status, 200);
  }
  const passageiro = await login("passageiro", "11988880000");
  const cookie = (await fetch(`${base}/teste/entrar/${admin.id}`, { method: "POST" })).headers.get("set-cookie")!.split(";")[0];
  return { E, API, tokens, ids, passageiro, login, cookie };
}

async function oferta(t: Awaited<ReturnType<typeof montar>>, nome: string) {
  for (let i = 0; i < 12; i++) { const o = (await chamar("GET", `${t.API}/estado`, undefined, t.tokens[nome])).corpo.oferta; if (o) return o as { id: string }; await esperar(150); }
  throw new Error(`sem oferta para ${nome}`);
}
const tipos = (l: Array<{ tipo: string }>) => l.map((e) => e.tipo);

test("cada etapa da corrida grava um evento (criada, chamadas, aceite, a caminho, chegou, iniciou, finalizou) e o trajeto devolve o percurso real", async () => {
  const t = await montar();
  const pedido = await chamar("POST", `${t.API}/corridas`, { embarque: EMBARQUE, destino: DESTINO, categoria: "Econômico", pagamento: "Pix", pedidoId: "pedido-registro-1" }, t.passageiro);
  assert.equal(pedido.status, 200, JSON.stringify(pedido.corpo));
  const id = pedido.corpo.corrida.id as string;
  const oa = await oferta(t, "Ana"), ob = await oferta(t, "Beto"), oc = await oferta(t, "Caio");
  assert.equal((await chamar("POST", `${t.API}/ofertas/${oa.id}/recusar`, {}, t.tokens.Ana)).status, 200);
  assert.equal((await chamar("POST", `${t.API}/ofertas/${ob.id}/aceitar`, {}, t.tokens.Beto)).status, 200);
  void oc;

  // O motorista anda até o embarque (fase "embarque"), avisa que chegou, inicia e anda até o destino (fase "viagem").
  for (const lat of [-23.5521, -23.5515, -23.5508, -23.5502]) { await chamar("POST", `${t.API}/posicao`, { lat, lng: -46.63 }, t.tokens.Beto); }
  assert.equal((await chamar("POST", `${t.API}/corridas/${id}/status`, { status: "no_local" }, t.tokens.Beto)).status, 200);
  assert.equal((await chamar("POST", `${t.API}/corridas/${id}/status`, { status: "em_andamento" }, t.tokens.Beto)).status, 200);
  for (const lat of [-23.553, -23.557, -23.561, -23.565, -23.569]) { await chamar("POST", `${t.API}/posicao`, { lat, lng: -46.63 }, t.tokens.Beto); }
  assert.equal((await chamar("POST", `${t.API}/corridas/${id}/status`, { status: "finalizada", valor: 20 }, t.tokens.Beto)).status, 200);

  const eventos = R.eventosDaCorrida(t.E.id, id);
  const lista = tipos(eventos);
  for (const esperado of ["criada", "despacho_consulta", "despacho_encontrados", "oferta_enviada", "oferta_recusada", "oferta_aceita", "oferta_perdida", "atribuida", "a_caminho", "chegou", "iniciou", "finalizou"]) {
    assert.ok(lista.includes(esperado as never), `falta o evento ${esperado}: ${lista.join(", ")}`);
  }
  assert.equal(lista.filter((x) => x === "oferta_enviada").length, 3, "uma chamada enviada para cada motorista do grupo");
  assert.equal(eventos.find((e) => e.tipo === "oferta_recusada")!.usuario, "Ana", "quem recusou");
  assert.equal(eventos.find((e) => e.tipo === "criada")!.canal, "App", "canal da criação");
  assert.equal(eventos.find((e) => e.tipo === "iniciou")!.canal, "App do motorista", "canal de quem iniciou");
  const consulta = eventos.find((e) => e.tipo === "despacho_encontrados")!;
  assert.match(consulta.descricao, /3 motoristas/);
  assert.equal((consulta.dados as { candidatos: unknown[] }).candidatos.length, 3);

  // Histórico da OS pela API da central (com a tabela do despacho).
  const cookie = t.cookie;
  const log = await chamar("GET", `/api/operacao/corridas/${id}/log`, undefined, undefined, cookie);
  assert.equal(log.status, 200, JSON.stringify(log.corpo));
  assert.equal(log.corpo.antiga, false);
  const rodada = (log.corpo.linhas as Array<Record<string, any>>).find((l) => l.tipo === "despacho_encontrados")!;
  assert.equal(rodada.tabela.length, 3);
  const beto = rodada.tabela.find((x: any) => x.nome === "Beto"), ana = rodada.tabela.find((x: any) => x.nome === "Ana");
  assert.equal(beto.vencedor, true); assert.equal(beto.candidatou, true); assert.equal(beto.recebeu, true); assert.equal(beto.vtr, "V2");
  assert.equal(ana.rejeitou, true); assert.equal(ana.vencedor, false);

  // Trajeto real: pontos na ordem, fases, distância medida e etapas.
  const traj = await chamar("GET", `/api/operacao/corridas/${id}/trajeto`, undefined, undefined, cookie);
  assert.equal(traj.status, 200, JSON.stringify(traj.corpo));
  assert.ok(traj.corpo.pontos.length >= 9, `pontos: ${traj.corpo.pontos.length}`);
  assert.equal(traj.corpo.pontos[0].fase, "embarque");
  assert.equal(traj.corpo.pontos.at(-1).fase, "viagem");
  assert.ok(traj.corpo.etapas.inicio.distanciaKm > 1.5 && traj.corpo.etapas.inicio.distanciaKm < 2.5, `viagem ~2 km: ${traj.corpo.etapas.inicio.distanciaKm}`);
  assert.ok(traj.corpo.etapas.aceite.distanciaKm > 0.2, "trecho até o embarque");
  assert.ok(traj.corpo.etapas.fim.em);
  assert.equal(traj.corpo.semGps, false);

  // Detalhe da corrida com os dados reais.
  const det = await chamar("GET", `/api/operacao/corridas/${id}`, undefined, undefined, cookie);
  assert.equal(det.status, 200);
  const m = det.corpo.machine;
  assert.equal(m.controle.tipoDespacho, "Primeiro a aceitar");
  assert.equal(m.controle.via, "App");
  assert.ok(m.inicio.realizadoKm > 0 && m.encerramento.realizadoKm > 1.5);
  assert.equal(m.encerramento.valorFinal, 20);
  assert.equal(m.aceite.motorista, "Beto");
});

test("mudança de valor e de pagamento pela central e cancelamento viram eventos com quem fez", async () => {
  const t = await montar();
  const c = await C.criarCorridaPropria(t.E.id, { passageiro: { nome: "Paula", telefone: "11977770000" }, embarque: EMBARQUE, destino: DESTINO, categoria: "Econômico", pagamento: "Pix", canal: "painel" }, "operador@central.test");
  await C.editarCorridaPropria(t.E.id, c.id, { pagamento: "Dinheiro", valorInicial: 33 }, "operador@central.test");
  await C.cancelarCorrida(t.E.id, c.id, "Central", "Passageiro desistiu", "operador@central.test");
  const ev = R.eventosDaCorrida(t.E.id, c.id);
  assert.deepEqual(tipos(ev).filter((x) => ["criada", "mudanca_pagamento", "mudanca_valor", "alteracao", "cancelou"].includes(x)).sort(), ["alteracao", "cancelou", "criada", "mudanca_pagamento", "mudanca_valor"].sort());
  const pag = ev.find((e) => e.tipo === "mudanca_pagamento")!;
  assert.match(pag.descricao, /de Pix para Dinheiro/);
  assert.equal(pag.usuario, "operador@central.test");
  assert.equal(pag.canal, "Painel");
  assert.match(ev.find((e) => e.tipo === "cancelou")!.descricao, /Central.*Passageiro desistiu/);
});

test("corrida antiga (sem eventos gravados) ganha a linha do tempo montada do histórico", async () => {
  const t = await montar();
  const c = await C.criarCorridaPropria(t.E.id, { passageiro: { nome: "Rita", telefone: "11966660000" }, embarque: EMBARQUE, destino: DESTINO, categoria: "Econômico", pagamento: "Pix", canal: "painel" }, "x@central.test");
  const { banco } = await import("../src/servidor/banco.ts");
  banco().prepare("DELETE FROM corrida_eventos WHERE empresa = ?").run(t.E.id);
  const { logDaOs } = await import("../src/operacao/log-trajeto.ts");
  const antigo = await logDaOs(t.E.id, C.listarProprias(t.E.id).find((x) => x.id === c.id)!);
  assert.equal(antigo.antiga, true);
  assert.equal(antigo.linhas[0].tipo, "criada");
});

test("trajeto: ignora ponto parado, limita e simplifica sem perder as pontas nem a forma", () => {
  const E = "empresa-trajeto", id = "corrida-trajeto-1";
  R.esquecerPontosDaMemoria();
  // ponto repetido (parado) é ignorado
  R.registrarPonto(E, id, -23.5, -46.6, "embarque");
  R.registrarPonto(E, id, -23.5, -46.6, "embarque");
  R.registrarPonto(E, id, -23.5000001, -46.6000001, "embarque");
  assert.equal(R.pontosDaCorrida(E, id).length, 1, "parado não grava de novo");
  // percurso longo em L: passa do limite e é simplificado, mantendo a curva
  for (let i = 1; i <= R.MAX_PONTOS_GUARDADOS + 200; i++) {
    const lat = i <= 1300 ? -23.5 - i * 0.0001 : -23.63, lng = i <= 1300 ? -46.6 : -46.6 + (i - 1300) * 0.0001;
    R.registrarPonto(E, id, lat, lng, "viagem");
  }
  const pts = R.pontosDaCorrida(E, id);
  assert.ok(pts.length <= R.MAX_PONTOS_MAPA, `limite para desenhar: ${pts.length}`);
  assert.ok(pts.length >= 3, "guardou a forma");
  assert.deepEqual([pts[0].lat, pts[0].lng], [-23.5, -46.6], "primeira ponta");
  assert.ok(pts.some((p) => Math.abs(p.lat - -23.63) < 1e-6 && Math.abs(p.lng - -46.6) < 1e-6), "o canto da curva continua lá");
  const m = R.medirTrajeto(pts);
  assert.ok(m.viagem.km! > 20, `distância mantida: ${m.viagem.km}`);
});
