// Correções da revisão: cupom (Pausar/Ativar, padrões de cupom antigo, telefone, valor só se ativo), cupom por categoria na lista do app,
// filtro mín/máx do desafio de clientes, contagem igual no app, aprovação manual, validação de prêmio/meta e PUT antigo do despacho.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-revisao-opus-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "r".repeat(40);
delete process.env.BANCO_ARQUIVO;
delete process.env.OSRM_URL;

const express = (await import("express")).default;
const D = await import("../src/servidor/dados.ts");
const { criarCookie, exigirLogin } = await import("../src/servidor/sessao.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar, listar } = await import("../src/cadastros/armazem.ts");
const B = await import("../src/servidor/banco.ts");
const G = await import("../src/gestao/rotas.ts");
const { rotasCadastros } = await import("../src/cadastros/rotas.ts");
const { prepararCupom, cupomVale, mesmoTelefone } = await import("../src/cadastros/cupom-regras.ts");
const { clientesDesafiados, progressoClientes, TIPO_DESAFIO_CLIENTE } = await import("../src/gestao/desafio-cliente.ts");
const { salvarDespacho, regrasDespacho, DESPACHO_PADRAO } = await import("../src/config/despacho.ts");
const { gravarConfig } = await import("../src/config/armazem.ts");
const { desafios } = await import("../src/apps/extras.ts");

const app = express();
app.use(express.json());
app.post("/teste/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({ ok: true }); });
app.use("/api", exigirLogin);
app.use("/api/gestao", G.rotasGestao);
app.use("/api/cadastros", rotasCadastros);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => { servidor.closeAllConnections(); servidor.close(); B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

const E = D.criarEmpresa("Revisao Opus").id;
const admin = D.criarUsuario({ email: "adm@revisao.test", nome: "Adm", senha: "senha-forte-1", empresaId: E, papel: "admin" });
async function cookie(id: string) { return ((await fetch(`${base}/teste/entrar/${id}`, { method: "POST" })).headers.get("set-cookie") ?? "").split(";")[0]; }
async function chamar(metodo: string, url: string, quem: string, corpo?: unknown) {
  const r = await fetch(base + url, { method: metodo, headers: { cookie: quem, ...(corpo !== undefined ? { "content-type": "application/json" } : {}) }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  return { status: r.status, corpo: (await r.json().catch(() => ({}))) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

// 1 e 10 ----------------------------------------------------------------------------------------------
test("1: Pausar/Ativar muda só o ativo: cupom antigo de cliente específico não perde telefone nem limite", async () => {
  const c = await cookie(admin.id);
  const antigo = criar(E, cadastroPorId("cupons")!, { codigo: "VIP10", tipoDesconto: "Percentual", valor: 10, ativo: true, clienteTelefone: "11999990000", clienteNome: "Zé", usoPorPassageiro: 2 }, "t");
  const r = await chamar("PUT", `/api/cadastros/cupons/${antigo.id}`, c, { ativo: false });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  const depois = listar(E, cadastroPorId("cupons")!).find((x) => x.id === antigo.id)!;
  assert.equal(depois.ativo, false);
  assert.equal(depois.clienteTelefone, "11999990000");
  assert.equal(depois.usoPorPassageiro, 2);
});

test("1: prepararCupom de cupom antigo (sem publico/limiteUso) deduz o padrão do que ele já tinha", () => {
  const p = prepararCupom({ codigo: "ANTIGO", tipoDesconto: "Percentual", valor: 10, ativo: true, clienteTelefone: "11999990000", clienteNome: "Zé", usoPorPassageiro: 3 }, []);
  assert.equal(p.publico, "especificos");
  assert.equal(p.clienteTelefone, "11999990000");
  assert.equal(p.limiteUso, "por_passageiro");
  assert.equal(p.usoPorPassageiro, 3);
  const q = prepararCupom({ codigo: "TODOS", tipoDesconto: "Percentual", valor: 10, ativo: true }, []);
  assert.equal(q.publico, "todos");
  assert.equal(q.limiteUso, "sem_limite");
});

test("10: o valor do desconto só é obrigatório com o cupom ativo", () => {
  assert.throws(() => prepararCupom({ codigo: "ABC", valor: 0, ativo: true, tipoDesconto: "Percentual" }, []), /valor do desconto/);
  const p = prepararCupom({ automatico: true, valor: 0, ativo: false, tipoDesconto: "Percentual" }, []);
  assert.equal(p.valor, 0);
});

// 6 ---------------------------------------------------------------------------------------------------
test("6: telefone do cupom exige 10 ou 11 dígitos e não casa por sufixo curto", () => {
  assert.throws(() => prepararCupom({ codigo: "TEL", valor: 5, ativo: true, publico: "especificos", clienteTelefone: "99990000" }, []), /10 ou 11 dígitos/);
  assert.equal(mesmoTelefone("11999990000", "5511999990000"), true);
  assert.equal(mesmoTelefone("11999990000", "99990000"), false);
  assert.equal(mesmoTelefone("1199990000", "11999990000"), false);
  assert.equal(mesmoTelefone("(11) 99999-0000", "11999990000"), true);
});

// 2 ---------------------------------------------------------------------------------------------------
test("2: cupom de categoria vale na lista do app (sem categoria no contexto) e 'uma vez' já usado some", () => {
  const c = { ativo: true, categorias: "Carro", limiteUso: "uma_vez" };
  assert.equal(cupomVale(c, { hoje: "2026-01-01", hora: "10:00", telefone: "11999990000" }).vale, true);
  assert.equal(cupomVale(c, { hoje: "2026-01-01", hora: "10:00", telefone: "11999990000", categoria: "Moto" }).vale, false);
  assert.equal(cupomVale(c, { hoje: "2026-01-01", hora: "10:00", telefone: "11999990000", usosTotal: 1 }).vale, false);
  assert.equal(cupomVale({ ativo: true, limiteUso: "por_passageiro", usoPorPassageiro: 1 }, { hoje: "2026-01-01", hora: "10:00", usosDoPassageiro: 1 }).vale, false);
});

// 3 e 4 -----------------------------------------------------------------------------------------------
const corr = (tel: string, em: string, canal = "app") => ({ status: "finalizada", finalizadaEm: em, solicitadaEm: em, canal, passageiro: { telefone: tel } }) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
test("3: mín/máx sem período conta só as finalizadas ANTES do início do desafio", () => {
  const clientes = [{ id: "1", nome: "Ana", telefone: "11911110000", status: "Ativo" }] as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  const corridas = [corr("11911110000", "2026-05-01T10:00"), corr("11911110000", "2026-06-10T10:00"), corr("11911110000", "2026-06-11T10:00")];
  const d = { inicio: "2026-06-01", horaInicio: "00:00", corridasMin: 1, corridasMax: 1 };
  assert.equal(clientesDesafiados(clientes, d, corridas).length, 1, "só 1 antes do início: dentro da faixa 1..1");
  assert.equal(clientesDesafiados(clientes, { ...d, corridasMin: 2 }, corridas).length, 0, "as do próprio desafio não contam");
  assert.equal(clientesDesafiados(clientes, { ...d, corridasDe: "2026-06-01", corridasMin: 2, corridasMax: 5 }, corridas).length, 1, "com período explícito vale o período");
});

test("4: progresso do cliente respeita hora e telefone normalizado; o app usa a mesma conta", () => {
  const cli = [{ id: "1", nome: "Ana", telefone: "11911110000", status: "Ativo" }] as any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  const d = { id: "d1", meta: 2, premio: 5, inicio: "2026-06-01", fim: "2026-06-30", horaInicio: "12:00", horaFim: "18:00" } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const corridas = [corr("5511911110000", "2026-06-01T11:00"), corr("5511911110000", "2026-06-01T13:00"), corr("11911110000", "2026-06-30T17:00"), corr("11911110000", "2026-06-30T19:00")];
  const p = progressoClientes(cli, d, corridas, () => false)[0];
  assert.equal(p.feito, 2, "antes da hora de início e depois da hora final ficam fora; telefone com 55 conta");
  // O app: o cliente entra na lista de desafios com o telefone normalizado e a mesma contagem.
  const dc = criar(E, cadastroPorId("desafios")!, { nome: "App", tipo: TIPO_DESAFIO_CLIENTE, meta: 5, premio: 5, inicio: "2020-01-01", fim: "2099-12-31", ativo: true, cancelado: false, aprovacao: "Manual" }, "t");
  criar(E, cadastroPorId("clientes")!, { nome: "Ana App", telefone: "(11) 91111-0000", status: "Ativo" }, "t");
  const l = desafios(E, "passageiro", "11911110000");
  assert.ok(l.some((x) => x.id === dc.id), "telefone com máscara no cadastro casa com a chave do app");
});

// 5 e 7 -----------------------------------------------------------------------------------------------
test("7: prêmio e meta do desafio são validados", async () => {
  const c = await cookie(admin.id);
  const ok = { nome: "Val", tipo: "Desafio de corridas", inicio: "2026-01-01", fim: "2026-12-31" };
  assert.equal((await chamar("POST", "/api/gestao/desafios", c, { ...ok, meta: 5, premio: "abc" })).status, 400);
  assert.equal((await chamar("POST", "/api/gestao/desafios", c, { ...ok, meta: 5, premio: -1 })).status, 400);
  assert.equal((await chamar("POST", "/api/gestao/desafios", c, { ...ok, meta: 5, premio: 1e12 })).status, 400);
  assert.equal((await chamar("POST", "/api/gestao/desafios", c, { ...ok, meta: 1e12, premio: 5 })).status, 400);
  const bom = await chamar("POST", "/api/gestao/desafios", c, { ...ok, meta: 5, premio: "12.5" });
  assert.equal(bom.status, 200);
  assert.equal(bom.corpo.desafio.premio, 12.5);
});

test("5: aprovar manual exige desafio de aprovação Manual", async () => {
  const c = await cookie(admin.id);
  const d = await chamar("POST", "/api/gestao/desafios", c, { nome: "Auto", tipo: "Desafio de corridas", meta: 1, premio: 5, inicio: "2026-01-01", fim: "2026-12-31", aprovacao: "Automático" });
  const r = await chamar("POST", `/api/gestao/desafios/${d.corpo.desafio.id}/aprovar/qualquer`, c, {});
  assert.equal(r.status, 400);
  assert.match(JSON.stringify(r.corpo), /autom/i);
});

// 8 ---------------------------------------------------------------------------------------------------
test("8: PUT antigo só com {secundarios} não refaz as etapas; a migração é só na leitura", () => {
  salvarDespacho(E, { etapas: [{ quantidade: 7, raioKm: 2 }, { quantidade: 8 }, { quantidade: 9 }, { quantidade: 11 }] });
  const s = salvarDespacho(E, { secundarios: 4 });
  assert.deepEqual(s.etapas.map((x) => x.quantidade), [7, 4, 9, 11]);
  assert.equal(s.etapas[0].raioKm, 2, "o resto das etapas fica como está");
  gravarConfig(E, "despacho", { prioritarios: 7, secundarios: 5, reserva: 3 });
  assert.deepEqual(regrasDespacho(E).etapas.map((x) => x.quantidade), [7, 5, 3]);
  assert.equal(DESPACHO_PADRAO.etapas.length, 3);
});
