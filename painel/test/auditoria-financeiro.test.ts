// Auditoria do Financeiro contra a Machine: Transações online (filtros em caixas de marcar e páginas de 10),
// Relatório de faturamento (formas e status em caixas de marcar), Transação com Pix (Bandeira), Controle financeiro de centrais
// (débito automático "Não permitir") e Demonstrativo Mensal (linha "Valor corridas" que não soma duas vezes).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-audfin-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "f".repeat(40);
delete process.env.BANCO_ARQUIVO;
delete process.env.OSRM_URL;

const express = (await import("express")).default;
const D = await import("../src/servidor/dados.ts");
const { criarCookie, exigirLogin } = await import("../src/servidor/sessao.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar } = await import("../src/cadastros/armazem.ts");
const B = await import("../src/servidor/banco.ts");
const { salvarCategoria } = await import("../src/config/categorias.ts");
const C = await import("../src/corridas/index.ts");
const V = await import("../src/config/financeiro-visao.ts");
const { periodo } = await import("../src/config/financeiro.ts");
const { listarPix } = await import("../src/operacao/pix.ts");
const R = await import("../src/centrais/rede.ts");
const CO = await import("../src/centrais/cobranca.ts");
const { rotasCentrais } = await import("../src/centrais/rotas.ts");

const app = express();
app.use(express.json());
app.post("/teste/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({ ok: true }); });
app.use("/api", exigirLogin);
app.use("/api/centrais", rotasCentrais);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => { servidor.closeAllConnections(); servidor.close(); B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

const P = D.criarEmpresa("Aud Principal").id, A = D.criarEmpresa("Aud Filha").id;
R.vincular(P, A);
const admP = D.criarUsuario({ email: "adm-p@aud.test", nome: "AdmP", senha: "senha-forte-1", empresaId: P, papel: "admin" });
const cookie = ((await fetch(`${base}/teste/entrar/${admP.id}`, { method: "POST" })).headers.get("set-cookie") ?? "").split(";")[0];
async function api(metodo: string, url: string, corpo?: unknown) {
  const r = await fetch(`${base}/api/centrais${url}`, { method: metodo, headers: { cookie, "content-type": "application/json" }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  return { status: r.status, corpo: (await r.json()) as Record<string, any> };
}

salvarCategoria(P, null, { nome: "Pop", taxaBase: 5, precoKm: 2, tarifaMinima: 8, comissaoTipo: "Percentual", comissaoValor: 10 }, "t");
const mot = criar(P, cadastroPorId("motoristas")!, { nome: "Rita Rodas", telefone: "11980000001", status: "Ativo" }, "t");
async function corrida(pagamento: string, valor: number, n: number, extra: Record<string, unknown> = {}) {
  const c = await C.criarCorridaPropria(P, { passageiro: { nome: `Pass ${n}`, telefone: `1191111${String(n).padStart(4, "0")}` }, embarque: { texto: "Rua A, 1" }, destino: { texto: "Rua B, 2" }, categoria: "Pop", pagamento, canal: "painel", distanciaKm: 5, ...extra } as never, "t");
  C.atribuirMotorista(P, c.id, mot.id, "t");
  C.mudarStatus(P, c.id, "a_caminho"); C.mudarStatus(P, c.id, "no_local"); C.mudarStatus(P, c.id, "em_andamento");
  C.mudarStatus(P, c.id, "finalizada", { valor });
  return c;
}
const hoje = periodo("hoje");
for (let i = 1; i <= 12; i++) await corrida("Pix", 10 + i, i);
await corrida("Cartão no App", 30, 20); await corrida("Cartão no App", 31, 21); await corrida("Dinheiro", 15, 22);

test("transações online: páginas de 10 em 10 e o CSV leva todas as linhas", () => {
  const p1 = V.extratoOnline(P, hoje, {}, 1);
  assert.equal(p1.total, 14);
  assert.equal(p1.porPagina, 10);
  assert.equal(p1.paginas, 2);
  assert.equal(p1.itens.length, 10);
  assert.equal(V.extratoOnline(P, hoje, {}, 2).itens.length, 4);
  assert.equal(V.extratoOnline(P, hoje, {}, 99).pagina, 2);
  assert.equal(V.csvExtratoOnline(P, hoje, {}).trim().split("\r\n").length, 15);
});

test("transações online: tipo e repasse aceitam várias opções marcadas", () => {
  assert.equal(V.extratoOnline(P, hoje, { tipo: "Pagamento|Saque" }).total, 14);
  assert.equal(V.extratoOnline(P, hoje, { tipo: "Saque|Recarga empresa" }).total, 0);
  assert.equal(V.extratoOnline(P, hoje, { status: "Pago|Pendente" }).total, 14);
  assert.equal(V.extratoOnline(P, hoje, { status: "Chargeback|Estornado" }).total, 0);
  assert.equal(V.extratoOnline(P, hoje, { tipo: "todos", status: "todos" }).total, 14);
  assert.equal(V.extratoOnline(P, hoje, { tipo: "Inventado" }).total, 0);
  assert.equal(V.opcoesDoFiltro("", V.TIPOS_TRANSACAO), null);
});

test("relatório de faturamento: formas e status em caixas de marcar", () => {
  const r = V.relatorioFaturamento(P, hoje, { pagamento: "Cartão no app|Dinheiro" }, 1);
  assert.equal(r.total, 3);
  assert.equal(V.relatorioFaturamento(P, hoje, { pagamento: "Pix" }, 1).total, 12);
  assert.equal(V.relatorioFaturamento(P, hoje, { pagamento: "Pix", status: "Finalizada|Cancelada" }, 1).total, 12);
  assert.equal(V.relatorioFaturamento(P, hoje, { status: "Cancelada|Não atendida" }, 1).total, 0);
  assert.equal(V.relatorioFaturamento(P, hoje, { pagamento: "Maquininha de débito" }, 1).total, 0);
  assert.equal(r.formas.length, 10);
});

test("Pix: filtro por Bandeira e Bandeira da corrida", async () => {
  const nome = D.empresa(P)!.nome;
  await corrida("Pix", 50, 30, { centralChamada: "Outra Bandeira" });
  const f = { inicio: hoje.inicio, fim: hoje.fim };
  const todos = listarPix(P, f, 1);
  assert.deepEqual(todos.bandeiras, [nome]);
  assert.equal(todos.total, 13);
  assert.equal(listarPix(P, { ...f, bandeira: "Outra Bandeira" }, 1).total, 1);
  assert.equal(listarPix(P, { ...f, bandeira: nome }, 1).total, 12);
  assert.equal(listarPix(P, { ...f, bandeiraCorrida: nome }, 1).total, 13);
  assert.equal(listarPix(P, { ...f, bandeiraCorrida: "Outra Bandeira" }, 1).total, 0);
});

test("controle financeiro: débito 'Não permitir' e a principal escolhe o próprio débito", async () => {
  const lista = await api("GET", "/controle");
  const principal = lista.corpo.linhas.find((l: any) => l.id === P), filha = lista.corpo.linhas.find((l: any) => l.id === A);
  assert.equal(principal.controle.exibirExtrato, "Permitir");
  assert.equal(principal.pode.debitoAutomatico, true);
  assert.equal(filha.pode.debitoAutomatico, true);
  assert.equal((await api("PUT", `/controle/${A}`, { debitoAutomatico: "Não permitir" })).corpo.controle.debitoAutomatico, "Não permitir");
  assert.equal((await api("PUT", `/controle/${P}`, { debitoAutomatico: "Não permitir" })).corpo.controle.debitoAutomatico, "Não permitir");
  assert.equal((await api("PUT", `/controle/${P}`, { debitoAutomatico: "Usar conta da central principal" })).status, 400);
  assert.equal((await api("PUT", `/controle/${P}`, { contaOnline: "Conta própria" })).status, 400);
  assert.equal((await api("PUT", `/controle/${P}`, { exibirExtrato: "Não permitir" })).status, 400);
  assert.equal((await api("GET", `/demonstrativo?central=${A}`)).status, 403);
  await api("PUT", `/controle/${P}`, { debitoAutomatico: "Usar conta desta central" });
});

test("demonstrativo: 'Valor corridas' resume as tarifas e não entra na soma", async () => {
  const d = await api("GET", `/demonstrativo?competencia=${CO.competenciaAtual()}`);
  const linhas = d.corpo.linhas as Array<{ descricao: string; debito: number | null; resumo?: boolean }>;
  const fin = linhas.find((l) => l.descricao === "Corridas finalizadas")!, resumo = linhas.find((l) => l.descricao === "Valor corridas")!;
  assert.ok(fin.debito! > 0);
  assert.equal(resumo.debito, fin.debito);
  assert.equal(resumo.resumo, true);
  assert.equal(linhas.findIndex((l) => l.descricao === "Valor corridas"), linhas.findIndex((l) => l.descricao === "Corridas não finalizadas") + 1);
  assert.equal(d.corpo.subtotal, Math.round(fin.debito! * 100) / 100);
});
