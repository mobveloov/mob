// Pagamento com saldo conta a taxa de serviço do passageiro (o saldo não fica negativo) e o relatório de faturamento
// calcula a taxa da central pela forma de pagamento da corrida.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-saldotaxa-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "s".repeat(40);
process.env.APPS_MOSTRAR_CODIGO = "1";
delete process.env.BANCO_ARQUIVO;
delete process.env.OSRM_URL;

const express = (await import("express")).default;
const D = await import("../src/servidor/dados.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar } = await import("../src/cadastros/armazem.ts");
const R = await import("../src/corridas/index.ts");
const { rotasApps } = await import("../src/apps/rotas.ts");
const X = await import("../src/apps/extras.ts");
const { salvarTaxa } = await import("../src/config/taxas.ts");
const { relatorioFaturamento } = await import("../src/config/financeiro-visao.ts");
const { agoraBr } = await import("../src/servidor/util.ts");
const B = await import("../src/servidor/banco.ts");

const app = express();
app.use(express.json());
app.use("/api/apps", rotasApps);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => { servidor.closeAllConnections(); servidor.close(); B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

const E = D.criarEmpresa("Saldo Taxa").id;
criar(E, cadastroPorId("categorias")!, { nome: "Carro", bandeirada: 20, valorKm: 2, valorMinimo: 20, ativa: true }, "t");
const mot = criar(E, cadastroPorId("motoristas")!, { nome: "Pedro", telefone: "11910000001", status: "Ativo", placa: "AAA1A11" }, "t");
criar(E, cadastroPorId("clientes")!, { nome: "Paula", telefone: "11920000001", status: "Ativo" }, "t");
const TODAS = ["dinheiro", "debito", "credito", "cartao_app", "pix"];

async function chamar(metodo: string, url: string, corpo?: unknown, token?: string) {
  const r = await fetch(base + url, { method: metodo, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  return { status: r.status, corpo: (await r.json().catch(() => ({}))) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

test("pagar com saldo: o saldo precisa cobrir o valor MAIS a taxa de serviço do passageiro", async () => {
  salvarTaxa(E, { nome: "Serviço", quemPaga: "passageiro", categorias: ["Carro"], pagamentos: TODAS, faixas: [{ de: 0, ate: null, tipo: "fixo", valor: 3 }] }, "t");
  const est = R.estimarPreco(E, { categoria: "Carro", distanciaKm: null }) as { valor: number; taxaServico: number };
  assert.equal(est.taxaServico, 3, "a taxa existe");
  const c = await chamar("POST", `/api/apps/${E}/entrar/codigo`, { papel: "passageiro", telefone: "11920000001" });
  const l = await chamar("POST", `/api/apps/${E}/entrar`, { papel: "passageiro", telefone: "11920000001", codigo: c.corpo.codigoTeste });
  const token = l.corpo.token as string;
  const pedido = (id: string) => ({ pedidoId: id, embarque: { texto: "Rua A, 1" }, destino: { texto: "Rua B, 2" }, categoria: "Carro", pagamento: X.PAGAMENTO_SALDO });
  const phone = X.saldo(E, "passageiro", "11920000001");
  X.lancar(E, "passageiro", "11920000001", est.valor - phone, "Recarga", "t"); // saldo = só o valor, sem a taxa
  const sem = await chamar("POST", `/api/apps/${E}/corridas`, pedido("saldo-taxa-1"), token);
  assert.match(sem.corpo.erro ?? "", /Saldo insuficiente/, JSON.stringify(sem.corpo));
  X.lancar(E, "passageiro", "11920000001", est.taxaServico, "Recarga 2", "t");
  const com = await chamar("POST", `/api/apps/${E}/corridas`, pedido("saldo-taxa-2"), token);
  assert.equal(com.status, 200, JSON.stringify(com.corpo));
});

test("relatório de faturamento: a taxa da central usa a forma de pagamento da corrida", async () => {
  salvarTaxa(E, { nome: "Só Pix", quemPaga: "motorista", categorias: ["Carro"], pagamentos: ["pix"], faixas: [{ de: 0, ate: null, tipo: "porcentagem", valor: 10 }] }, "t");
  const c = await R.criarCorridaPropria(E, { passageiro: { nome: "Ana", telefone: "11930000001" }, embarque: { texto: "Rua A, 1" }, destino: { texto: "Rua B, 2" }, categoria: "Carro", pagamento: "Pix", canal: "painel" }, "t");
  await R.atribuirMotorista(E, c.id, mot.id as string, "t");
  for (const s of ["no_local", "em_andamento"]) await R.mudarStatus(E, c.id, s as never, {}, "t");
  await R.mudarStatus(E, c.id, "finalizada", { valor: 50 }, "t");
  const dia = agoraBr().toISOString().slice(0, 10);
  const r = relatorioFaturamento(E, { inicio: dia, fim: dia });
  assert.equal(r.brutoTotal, 50);
  assert.equal(r.taxaCentral, 5, "10% do Pix");
});
