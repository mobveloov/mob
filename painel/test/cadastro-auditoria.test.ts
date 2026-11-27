// Auditoria Cadastro: regras do Novo cupom (cliente específico, limite de uso, pagamento, período com hora, área) e lista como a Machine.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cupomVale, prepararCupom, situacaoDoCupom, clientesDoCupom } from "../src/cadastros/cupom-regras.ts";
import { listarCuponsResgataveis } from "../src/gestao/outros.ts";

const base = { ativo: true, codigo: "OLA10", tipoDesconto: "Percentual", valor: 10 } as Record<string, any>;
const ctx = { hoje: "2026-11-27", hora: "10:00" };

test("cupom: período com hora", () => {
  assert.equal(cupomVale({ ...base, inicio: "2026-11-27", horaInicio: "11:00" }, ctx).vale, false);
  assert.equal(cupomVale({ ...base, inicio: "2026-11-27", horaInicio: "09:00", fim: "2026-11-27", horaFim: "09:30" }, ctx).vale, false);
  assert.equal(cupomVale({ ...base, inicio: "2026-11-01", fim: "2026-12-01" }, ctx).vale, true);
  assert.equal(situacaoDoCupom({ ...base, inicio: "2026-12-01" }, 0, ctx.hoje, ctx.hora), "Aguardando");
  assert.equal(situacaoDoCupom({ ...base, fim: "2026-11-01" }, 0, ctx.hoje, ctx.hora), "Encerrado");
});
test("cupom: clientes específicos só valem para eles", () => {
  const c = { ...base, publico: "especificos", clientes: JSON.stringify([{ telefone: "19997566226", nome: "Aaron" }]) };
  assert.equal(cupomVale(c, { ...ctx, telefone: "(19) 99756-6226" }).vale, true);
  assert.equal(cupomVale(c, { ...ctx, telefone: "19911112222" }).vale, false);
  assert.equal(clientesDoCupom({ clienteTelefone: "11999990000" }).length, 1, "VIP antigo continua valendo");
});
test("cupom: limite de uso e pagamento", () => {
  assert.equal(cupomVale({ ...base, limiteUso: "uma_vez" }, { ...ctx, usosTotal: 1 }).vale, false);
  assert.equal(cupomVale({ ...base, limiteUso: "primeira_corrida" }, { ...ctx, finalizadasDoPassageiro: 1 }).vale, false);
  assert.equal(cupomVale({ ...base, limiteUso: "por_passageiro", usoPorPassageiro: 2 }, { ...ctx, usosDoPassageiro: 2 }).vale, false);
  assert.equal(cupomVale({ ...base, limiteUso: "por_passageiro", usoPorPassageiro: 2 }, { ...ctx, usosDoPassageiro: 1 }).vale, true);
  assert.equal(cupomVale({ ...base, pagamentos: "pix,dinheiro" }, { ...ctx, forma: "credito" }).vale, false);
  assert.equal(cupomVale({ ...base, pagamentos: "pix,dinheiro" }, { ...ctx, forma: "pix" }).vale, true);
});
test("cupom: área de partida", () => {
  const c = { ...base, areaId: "a1", localAplicacao: "P" };
  assert.equal(cupomVale(c, { ...ctx, embarque: { lat: 1, lng: 1 }, naArea: () => true }).vale, true);
  assert.equal(cupomVale(c, { ...ctx, embarque: { lat: 1, lng: 1 }, naArea: () => false }).vale, false);
  assert.equal(cupomVale(c, { ...ctx, naArea: () => true }).vale, false, "sem ponto não dá para confirmar");
});
test("cupom: validação do Novo cupom", () => {
  assert.throws(() => prepararCupom({ ...base, codigo: "" }, []), /código/i);
  assert.throws(() => prepararCupom({ ...base, valor: 150 }, []), /100/);
  assert.throws(() => prepararCupom({ ...base, publico: "especificos" }, []), /cliente/);
  assert.throws(() => prepararCupom({ ...base, limiteUso: "por_passageiro" }, []), /quantas vezes/i);
  assert.throws(() => prepararCupom({ ...base, inicio: "2026-12-02", fim: "2026-12-01" }, []), /depois/);
  assert.throws(() => prepararCupom({ ...base, areaId: "x" }, ["a"]), /área/);
  const ok = prepararCupom({ ...base, limiteUso: "uma_vez", pagamentos: ["pix"] }, []);
  assert.equal(ok.usoPorPassageiro, 1); assert.equal(ok.pagamentos, "pix");
});
test("lista de cupons: contadores, filtro e 10 por página", () => {
  const l = Array.from({ length: 25 }, (_, i) => ({ id: String(i), codigo: `C${i}`, criadoEm: String(i).padStart(2, "0"), grupo: i < 3 ? "Ativos" : i < 5 ? "Aguardando" : "Inativos", parceiro: i === 24 })) as any[];
  const r = listarCuponsResgataveis(l, {});
  assert.deepEqual(r.contadores, { ativos: 3, inativos: 19, aguardando: 2 });
  assert.equal(r.itens.length, 10); assert.equal(r.paginacao.totalPaginas, 3);
  assert.equal(listarCuponsResgataveis(l, { status: "Aguardando" }).paginacao.totalItens, 2);
  assert.equal(listarCuponsResgataveis(l, { parceiros: "1" }).paginacao.totalItens, 1);
});

test("período rápido: últimos 7 e 30 dias", async () => {
  const { periodo } = await import("../src/gestao/comum.ts");
  const [a7, f7] = periodo("ultimos_7"), [a30, f30] = periodo("ultimos_30");
  assert.equal(f7, f30);
  assert.equal((Date.parse(f7) - Date.parse(a7)) / 86_400_000, 6);
  assert.equal((Date.parse(f30) - Date.parse(a30)) / 86_400_000, 29);
});
