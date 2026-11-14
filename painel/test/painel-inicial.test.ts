// Testes da página inicial (Painel / Indicadores) no formato da Machine: períodos, comparação com o período anterior,
// origens fixas, NPS de passageiros e motoristas. Funções puras: sem rede e sem chaves.
import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularIndicadores, datasDoPeriodo, distribuicaoNps, metricasNps, rotuloAnterior, serie } from "../src/servidor/indicadores.ts";
import type { CorridaPainel } from "../src/comum/corrida.ts";

// Quarta-feira, 11/11/2026 10:00 (horário de Brasília guardado como UTC).
const agora = new Date("2026-11-11T10:00:00Z");

test("períodos da Machine: ontem, semana passada, mês passado, últimos 7 e 30 dias, consolidado", () => {
  const f = (p: Parameters<typeof datasDoPeriodo>[0]) => { const d = datasDoPeriodo(p, undefined, undefined, agora); return [d.inicio, d.fim, d.dias]; };
  assert.deepEqual(f("ontem"), ["2026-11-10", "2026-11-10", 1]);
  assert.deepEqual(f("semana_passada"), ["2026-11-02", "2026-11-08", 7]);
  assert.deepEqual(f("mes_passado"), ["2026-10-01", "2026-10-31", 31]);
  assert.deepEqual(f("ultimo_7"), ["2026-11-05", "2026-11-11", 7]);
  assert.deepEqual(f("ultimo_30"), ["2026-10-13", "2026-11-11", 30]);
  assert.equal(f("consolidado")[0], "2020-01-01");
  const d = datasDoPeriodo("ontem", undefined, undefined, agora);
  assert.deepEqual([d.antInicio, d.antFim], ["2026-11-09", "2026-11-09"]);
});

test("rótulo do período anterior: Anteontem, Ontem ou as datas", () => {
  assert.equal(rotuloAnterior("ontem", datasDoPeriodo("ontem", undefined, undefined, agora), agora), "Anteontem");
  assert.equal(rotuloAnterior("hoje", datasDoPeriodo("hoje", undefined, undefined, agora), agora), "Ontem");
  assert.equal(rotuloAnterior("ultimo_7", datasDoPeriodo("ultimo_7", undefined, undefined, agora), agora), "29/10/2026 a 04/11/2026");
});

test("NPS: promotores menos detratores, em estrelas de 1 a 5", () => {
  assert.deepEqual(distribuicaoNps([]), { nps: null, respondentes: 0, detratores: 0, neutros: 0, promotores: 0 });
  const d = distribuicaoNps([5, 5, 5, 4, 1]);
  assert.equal(d.nps, 40); // 3 promotores (60%) - 1 detrator (20%)
  assert.deepEqual([d.detratores, d.neutros, d.promotores], [20, 20, 60]);
  assert.equal(metricasNps([5, 5], [1]).motoristas.nps, -100);
});

const corrida = (extra: Partial<CorridaPainel>): CorridaPainel => ({
  id: String(Math.random()), origem: "x", origemNome: "x", os: "1", grupo: "finalizada", statusTexto: "Finalizada", solicitadaEm: "2026-11-10T09:00:00.000Z", iniciadaEm: null, finalizadaEm: null,
  cidade: "Leme", categoria: "", pagamento: "Pix", canal: "App", tarifa: "", valor: 10, motorista: "A", canceladaPor: "", avaliacao: null, ...extra,
} as CorridaPainel);

test("cartões: origens sempre com as quatro da Machine, quantidades anteriores e série por hora", () => {
  const p = datasDoPeriodo("ontem", undefined, undefined, agora);
  const atual = [corrida({ canal: "App" }), corrida({ canal: "App" }), corrida({ canal: "Integração" }), corrida({ grupo: "cancelada", canceladaPor: "Motorista" })];
  const antes = [corrida({ solicitadaEm: "2026-11-09T09:00:00.000Z" })];
  const r = calcularIndicadores(atual, antes, p, { atual: 3, anterior: 0 });
  assert.deepEqual(r.origens.map((o) => o.nome).sort(), ["Aplicativo", "Integração", "Maçaneta", "Site"]);
  assert.equal(r.origens[0].nome, "Aplicativo");
  assert.equal(r.origens[0].valor, 2);
  assert.equal(r.corridas.anterior, 1);
  assert.equal(r.corridas.total, 4);
  assert.equal(r.corridas.canceladasPor.motorista, 1);
  assert.equal(r.passageirosCadastrados.variacao, null);
  assert.equal(r.serie.length, 24);
  assert.equal(serie(atual, "2026-11-10", "2026-11-10", 1)[9].solicitadas, 4);
});
