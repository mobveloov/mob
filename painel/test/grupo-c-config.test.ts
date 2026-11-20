// Grupo C (tarifas e configurações no formato da Machine): personalização do app, parâmetros de despacho (Gerais › Despacho),
// área de operação controlada, termos por público e transbordo entre centrais parceiras.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-grupoc-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "g".repeat(40);
delete process.env.BANCO_ARQUIVO;

const express = (await import("express")).default;
const D = await import("../src/servidor/dados.ts");
const { criarCookie, exigirLogin } = await import("../src/servidor/sessao.ts");
const B = await import("../src/servidor/banco.ts");
const Rede = await import("../src/centrais/rede.ts");
const { motivoDeBloqueio } = await import("../src/areas/areas.ts");
const { gravarJson } = await import("../src/servidor/jsoncache.ts");
const { rotasConfig } = await import("../src/config/rotas.ts");

const app = express();
app.use(express.json({ limit: "2mb" }));
app.post("/teste/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({ ok: true }); });
app.use("/api", exigirLogin);
app.use("/api/config", rotasConfig);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => { servidor.closeAllConnections(); servidor.close(); B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

const E = D.criarEmpresa("Grupo C Um").id, E2 = D.criarEmpresa("Grupo C Dois").id, FILHA = D.criarEmpresa("Grupo C Filha").id;
const adm = D.criarUsuario({ email: "adm@grupoc.test", nome: "Adm", senha: "senha-forte-1", empresaId: E, papel: "admin" });
const op = D.criarUsuario({ email: "op@grupoc.test", nome: "Op", senha: "senha-forte-1", empresaId: E, papel: "operador" });
const adm2 = D.criarUsuario({ email: "adm2@grupoc.test", nome: "Adm2", senha: "senha-forte-1", empresaId: E2, papel: "admin" });
async function entrar(id: string) { const r = await fetch(`${base}/teste/entrar/${id}`, { method: "POST" }); return (r.headers.get("set-cookie") ?? "").split(";")[0]; }
const cAdm = await entrar(adm.id), cOp = await entrar(op.id), cAdm2 = await entrar(adm2.id);
async function api(cookie: string, metodo: string, url: string, corpo?: unknown) {
  const r = await fetch(`${base}/api/config${url}`, { method: metodo, headers: { cookie, "content-type": "application/json" }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  return { status: r.status, corpo: (await r.json().catch(() => ({}))) as Record<string, any> };
}

test("personalização do app: padrão da marca, grava só admin, mapa fixo no estilo flutuante e imagem validada", async () => {
  const p = await api(cOp, "GET", "/personalizacao");
  assert.equal(p.status, 200);
  assert.equal(p.corpo.estiloTela, "flutuante");
  assert.equal(p.corpo.recursos[0].id, "mapa");
  assert.equal((await api(cOp, "PUT", "/personalizacao", { nome: "X" })).status, 403);
  const r = await api(cAdm, "PUT", "/personalizacao", { nome: "Minha Central", corPrincipal: "#FF0000", veiculoMapa: "moderno", estiloTela: "neutro", marca: "texto",
    recursos: [{ id: "anuncio", visivel: true }, { id: "mapa", visivel: false }, { id: "desafio", visivel: true }] });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.corPrincipal, "#ff0000");
  assert.equal(r.corpo.recursos[0].id, "anuncio", "a ordem pedida vale fora do estilo flutuante");
  assert.equal(r.corpo.recursos.find((x: any) => x.id === "desafio").visivel, false, "desafio fica bloqueado");
  assert.equal(r.corpo.recursos.length, 5, "o que faltou entra no fim");
  const flut = await api(cAdm, "PUT", "/personalizacao", { nome: "Minha Central", estiloTela: "flutuante", recursos: [{ id: "anuncio", visivel: true }, { id: "mapa", visivel: false }] });
  assert.equal(flut.corpo.recursos[0].id, "mapa");
  assert.equal(flut.corpo.recursos[0].visivel, true);
  assert.equal((await api(cAdm, "PUT", "/personalizacao", { nome: "Minha Central", marca: "imagem" })).status, 400, "marca com imagem exige a imagem enviada");
  assert.equal((await api(cAdm2, "GET", "/personalizacao")).corpo.nome, "Grupo C Dois", "outra empresa não vê");
});

test("Gerais › Despacho: valores conferidos, limites e área de operação controlada", async () => {
  const b = await api(cOp, "GET", "/bandeira");
  assert.equal(b.status, 200);
  assert.equal(b.corpo.tentativas, 3);
  assert.equal(b.corpo.disparos.length, 6);
  assert.equal((await api(cOp, "PUT", "/bandeira", { tentativas: 2 })).status, 403);
  const r = await api(cAdm, "PUT", "/bandeira", { tentativas: 99, expiracaoPendenciaMin: 15, disparos: [{ motoristas: 500, km: 900 }], autorizacaoCorporativa: { valor: 2, unidade: "horas" }, tipoDespacho: "x" });
  assert.equal(r.corpo.tentativas, 6, "no máximo 6 tentativas");
  assert.equal(r.corpo.disparos[0].motoristas, 20, "no máximo 20 motoristas");
  assert.equal(r.corpo.disparos[0].km, 50, "no máximo 50 km");
  assert.equal(r.corpo.tipoDespacho, "proximidade");
  assert.equal(r.corpo.autorizacaoCorporativa.unidade, "horas");
  assert.equal((await api(cAdm, "PUT", "/bandeira", { areaControlada: "nao-existe" })).status, 400);
  // área de operação: pedido fora do polígono é recusado, dentro passa
  gravarJson(path.join(D.raiz(), "empresas", E, "gestao", "areas.json"), [{ id: "a1", nome: "Centro", cor: "Laranja", prioridade: 1, poligono: [[-21, -48], [-21, -47], [-22, -47], [-22, -48]], bloqueio: { ativo: false, horarios: [] } }]);
  const ok = await api(cAdm, "PUT", "/bandeira", { areaControlada: "a1" });
  assert.equal(ok.status, 200);
  {
    assert.match(String(motivoDeBloqueio(E, { lat: -30, lng: -50 })), /fora da área de operação/);
    assert.equal(motivoDeBloqueio(E, { lat: -21.5, lng: -47.5 }), null);
    assert.equal(motivoDeBloqueio(E2, { lat: -30, lng: -50 }), null, "outra empresa não é afetada");
  }
});

test("termos por público: modo, texto próprio obrigatório e versão só muda com o texto", async () => {
  const t = await api(cOp, "GET", "/termos");
  assert.equal(t.corpo.modoPassageiro, "padrao");
  assert.ok(String(t.corpo.padraoPassageiro).length > 50);
  const v0 = t.corpo.versao;
  const r = await api(cAdm, "PUT", "/termos", { modoPassageiro: "nenhum", modoMotorista: "nenhum", modoEmpresa: "nenhum" });
  assert.equal(r.corpo.modoPassageiro, "nenhum");
  assert.equal(r.corpo.versao, v0, "mudar o modo não pede novo aceite");
  assert.equal((await api(cAdm, "PUT", "/termos", { modoEmpresa: "proprio" })).status, 400, "texto próprio vazio é recusado");
  const e = await api(cAdm, "PUT", "/termos", { modoEmpresa: "proprio", empresa: "1. Regras\nTexto das empresas parceiras." });
  assert.equal(e.corpo.modoEmpresa, "proprio");
  assert.equal(e.corpo.versao, v0 + 1);
  assert.equal((await api(cAdm, "PUT", "/termos", { modoMotorista: "padrao" })).corpo.modoMotorista, "nenhum", "motorista não tem a opção padrão");
});

test("transbordo: só a rede da central, Sim/Não por parceira e só o admin grava", async () => {
  assert.deepEqual((await api(cOp, "GET", "/transbordo-bandeiras")).corpo.parceiras, [], "sem rede, sem parceiras");
  Rede.vincular(E, FILHA);
  const l = await api(cOp, "GET", "/transbordo-bandeiras");
  assert.equal(l.corpo.parceiras.length, 1);
  assert.equal(l.corpo.parceiras[0].nome, "Grupo C Filha");
  assert.equal(l.corpo.parceiras[0].envia.pf, true);
  assert.equal((await api(cOp, "PUT", "/transbordo-bandeiras", { parceiras: [] })).status, 403);
  const r = await api(cAdm, "PUT", "/transbordo-bandeiras", { parceiras: [{ id: FILHA, envia: { pf: false, pj: true, pendentes: true, programadas: false }, recebe: { pf: true, pj: false } }] });
  assert.equal(r.corpo.parceiras[0].envia.pf, false);
  assert.equal(r.corpo.parceiras[0].envia.programadas, false);
  assert.equal(r.corpo.parceiras[0].recebe.pj, false);
  assert.equal((await api(cAdm, "PUT", "/transbordo-bandeiras", { parceiras: [{ id: E2, envia: {}, recebe: {} }] })).status, 400, "central fora da rede é recusada");
  assert.deepEqual((await api(cAdm2, "GET", "/transbordo-bandeiras")).corpo.parceiras, [], "a outra empresa não vê a rede");
});
