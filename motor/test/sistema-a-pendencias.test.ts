// Itens que a auditoria do Sistema A deixou "a fazer" (contrato 3.2.0). Respostas simuladas no formato da
// documentação pública do Sistema A; ainda não testado com conta real.
import assert from "node:assert/strict";
import { test } from "node:test";
import { MotorErro } from "../src/erros.ts";
import { criarMotor } from "../src/index.ts";
import { criarAdaptadorSistemaA } from "../src/sistema-a.ts";
import { criarAdaptadorSistemaB } from "../src/sistema-b.ts";
import { A_URL, B_APP, B_PAINEL, fetchFalso, rota } from "./fetch-falso.ts";

const INTEG = { id: "sistema-a", credenciais: { apiUrl: A_URL, apiKey: "chave-teste", usuario: "usuario-teste", senha: "senha-teste" } };
const INTEG_B = { id: "sistema-b", credenciais: { painelUrl: B_PAINEL, appApiUrl: B_APP, cookie: "abc", cidadeId: "1" } };
const DIA = { de: "2026-11-01T00:00:00Z", ate: "2026-11-02T00:00:00Z" };
const ok = { json: { success: true, data: [] } };

test("listarCorridas: filtros por empresa, passageiro e pagamento vão para a API", async () => {
  const f = fetchFalso(rota("POST", "/corridas/consultar", ok));
  await criarAdaptadorSistemaA(INTEG, { fetch: f.fetch }).listarCorridas({ ...DIA, empresaId: "sistema-a:12", passageiroId: "34", pagamento: "dinheiro" });
  const corpo = JSON.parse(f.pedidos[0].corpo!);
  assert.equal(corpo.empresa_id, 12);
  assert.equal(corpo.cliente_id, 34);
  assert.equal(corpo.tipo_pagamento, "D");
});

test("listarCorridas: pagamento com dois códigos (pix = X e I) não vai na API e é filtrado no motor", async () => {
  const item = (id: string, tipo: string) => ({ id, status_solicitacao: "F", tipo_pagamento: tipo, partida: { endereco: "Rua A", bairro: "C" } });
  const f = fetchFalso(rota("POST", "/corridas/consultar", { json: { success: true, data: [item("1", "X"), item("2", "I"), item("3", "D")] } }));
  const r = await criarAdaptadorSistemaA(INTEG, { fetch: f.fetch }).listarCorridas({ ...DIA, pagamento: "pix" });
  assert.equal(JSON.parse(f.pedidos[0].corpo!).tipo_pagamento, undefined);
  assert.deepEqual(r.itens.map((c) => c.idOriginal), ["1", "2"]);
});

test("motoristas: filtro de situação, viatura e foto", async () => {
  const f = fetchFalso(
    rota("GET", "/condutores", { json: { success: true, data: [{ id: "7", nome: "Bia", status: "S", numero_viatura: "0421", foto_url: "https://foto.exemplo.invalid/7.jpg", veiculos: [] }] } }),
  );
  const r = await criarAdaptadorSistemaA(INTEG, { fetch: f.fetch }).motoristas({ situacao: "suspenso" });
  assert.equal(f.pedidos[0].url.searchParams.get("status_condutor"), "S");
  assert.equal(r.itens[0].situacao, "suspenso");
  assert.equal(r.itens[0].ativo, false);
  assert.equal(r.itens[0].viatura, "0421");
  assert.equal(r.itens[0].fotoUrl, "https://foto.exemplo.invalid/7.jpg");
});

test("criarCorrida: paradas, cupom e empresa no formato da documentação", async () => {
  const f = fetchFalso(rota("POST", "/corridas", { json: { success: true, data: { id_mch: "900", tipo: "normal" } } }));
  await criarAdaptadorSistemaA(INTEG, { fetch: f.fetch }).criarCorrida({
    passageiro: { nome: "Fulano", telefone: "19999991234" },
    partida: { texto: "Rua A, 10", bairro: "Centro" },
    destino: { texto: "Rua C, 30", bairro: "Vila" },
    paradas: [{ texto: "Rua B, 20", bairro: "Jardim", cidade: "Cidade X", estado: "SP", lat: -22.1, lng: -47.3 }],
    cupom: " PROMO10 ",
    empresa: { id: "sistema-a:5", centroCustoId: "8" },
    pagamento: "faturado",
  });
  const corpo = JSON.parse(f.pedidos[0].corpo!);
  assert.deepEqual(corpo.paradas, [{ endereco_parada: "Rua B, 20", bairro_parada: "Jardim", cidade_parada: "Cidade X", estado_parada: "SP", lat_parada: -22.1, lng_parada: -47.3 }]);
  assert.equal(corpo.codigo_cupom, "PROMO10");
  assert.deepEqual(corpo.empresa, { id: 5, centro_custo_id: 8 });
  assert.equal(corpo.forma_pagamento, "F");
});

test("criarCorrida: parada sem bairro e id externo longo são recusados antes de chamar", async () => {
  const f = fetchFalso();
  const a = criarAdaptadorSistemaA(INTEG, { fetch: f.fetch });
  const base = { passageiro: { nome: "F", telefone: "19999991234" }, partida: { texto: "Rua A", bairro: "Centro" }, pagamento: "pix" as const };
  await assert.rejects(a.criarCorrida({ ...base, paradas: [{ texto: "Rua B" }] }), (e: MotorErro) => e.codigo === "DADOS_INVALIDOS" && /parada/.test(e.message));
  await assert.rejects(a.criarCorrida({ ...base, idExterno: "x".repeat(37) }), (e: MotorErro) => e.codigo === "DADOS_INVALIDOS" && /36/.test(e.message));
  assert.equal(f.pedidos.length, 0);
});

test("programadas: cancelar e despachar; 409 no despacho vira DADOS_INVALIDOS com explicação", async () => {
  const f = fetchFalso(
    rota("POST", "/corridas/programadas/55/cancelar", { json: { success: true, data: { id_mch_programada: "55" }, message: "ok" } }),
    rota("POST", "/corridas/programadas/55/despachar", { status: 202, json: { success: true, message: "será disparada" } }),
    rota("POST", "/corridas/programadas/56/despachar", { status: 409, json: { success: false, errors: [{ code: 0, message: "não está aguardando" }] } }),
  );
  const motor = criarMotor({ id: "e1", integracoes: [{ ...INTEG, tipo: "sistema-a" }] }, { fetch: f.fetch });
  await motor.cancelarProgramada("sistema-a:55");
  await motor.despacharProgramada("sistema-a:55");
  assert.deepEqual(f.pedidos.map((p) => [p.metodo, p.url.pathname.split("/integracao")[1]]), [
    ["POST", "/corridas/programadas/55/cancelar"],
    ["POST", "/corridas/programadas/55/despachar"],
  ]);
  await assert.rejects(motor.despacharProgramada("sistema-a:56"), (e: MotorErro) => e.codigo === "DADOS_INVALIDOS" && /não está mais esperando/.test(e.message));
});

test("tarifas: padrão (sem horários) e extra com horários e faixas", async () => {
  const f = fetchFalso(
    rota("GET", "/configuracoes/categorias/71/tarifas", {
      json: {
        success: true,
        data: [
          { id: 1, nome: "Padrão", metodo_calculo_tarifa: "T", data_inicio: "2026-01-01", horarios: [], valores_tabelados: [{ distancia_km: "5.00", a_partir_de: false, valor: "12.00" }, { distancia_km: null, a_partir_de: true, valor: "20.00" }] },
          { id: 2, nome: "Noite", metodo_calculo_tarifa: "D", horarios: [{ dia_semana: 5, hora_inicio: "22:00", hora_fim: "23:59" }] },
        ],
      },
    }),
  );
  const motor = criarMotor({ id: "e1", integracoes: [{ ...INTEG, tipo: "sistema-a" }] }, { fetch: f.fetch });
  const t = await motor.tarifas("sistema-a:71");
  assert.equal(t[0].padrao, true);
  assert.deepEqual(t[0].faixas, [{ ateKm: 5, aPartirDe: undefined, valor: 12 }, { ateKm: undefined, aPartirDe: true, valor: 20 }]);
  assert.equal(t[1].padrao, false);
  assert.deepEqual(t[1].horarios, [{ diaSemana: 5, inicio: "22:00", fim: "23:59" }]);
  assert.equal(t[1].metodo, "D");
});

test("webhooks cadastrados: lista com a situação de cada um; falha na situação vira semDado", async () => {
  const f = fetchFalso(
    rota("GET", "/webhooks", { json: { success: true, data: { webhooks: [{ id: "1", tipo: "status", url: "https://painel.exemplo.invalid/wh" }, { id: "2", tipo: "posicao", url: "https://painel.exemplo.invalid/pos" }], quantidade_webhooks: 2 } } }),
    rota("GET", "/webhooks/1/status", {
      json: { success: true, data: { id: 1, situacao: "bloqueado_temporariamente", bloqueio_temporario: { ativo: true, falhas_consecutivas: 7, proxima_tentativa: "2026-11-08T12:00:00Z" } } },
    }),
    rota("GET", "/webhooks/2/status", { status: 503, json: { success: false, errors: [{ code: 503, message: "indisponível" }] } }),
  );
  const motor = criarMotor({ id: "e1", integracoes: [{ ...INTEG, tipo: "sistema-a" }] }, { fetch: f.fetch });
  const r = await motor.webhooksCadastrados("todas");
  assert.equal(r.itens[0].situacao, "bloqueado_temporariamente");
  assert.equal(r.itens[0].falhasSeguidas, 7);
  assert.equal(r.itens[0].proximaTentativa, "2026-11-08T12:00:00Z");
  assert.equal(r.itens[1].situacao, "desconhecido");
  assert.equal(r.itens[1].semDado[0].campo, "situacao");
});

test("dinâmicas: junta as de área com a dinâmica geral (sem área)", async () => {
  const f = fetchFalso(
    rota("GET", "/dinamicas/area", { json: { success: true, data: [{ id: "3", nome: "Centro", fator: 1.2, ativo: true, tipo: "No embarque" }] } }),
    rota("GET", "/dinamicas/sem-area", { json: { success: true, data: { nome: "Dinâmica sem área", ativo: true, valor_adicional: 2.5, tipo_calculo: "Valor adicional", tipo: "Sem área" } } }),
  );
  const d = await criarAdaptadorSistemaA(INTEG, { fetch: f.fetch }).dinamicas();
  assert.equal(d.length, 2);
  assert.equal(d[1].id, "sistema-a:sem-area");
  assert.equal(d[1].adicional, 2.5);
  assert.equal(d[1].tipo, "geral (sem área)");
});

test("dinâmicas: se a dinâmica geral falhar, as de área continuam", async () => {
  const f = fetchFalso(rota("GET", "/dinamicas/area", { json: { success: true, data: [{ id: "3", nome: "Centro", ativo: false }] } }));
  const d = await criarAdaptadorSistemaA(INTEG, { fetch: f.fetch }).dinamicas();
  assert.deepEqual(d.map((x) => x.id), ["sistema-a:3"]);
});

test("Sistema B: funções novas dizem NAO_SUPORTADO com motivo, sem chamar a rede", async () => {
  const f = fetchFalso();
  const b = criarAdaptadorSistemaB(INTEG_B, { fetch: f.fetch });
  for (const chamar of [() => b.cancelarProgramada("1"), () => b.despacharProgramada("1"), () => b.tarifas("1"), () => b.webhooksCadastrados()])
    await assert.rejects(chamar(), (e: MotorErro) => e.codigo === "NAO_SUPORTADO" && /Sistema B/.test(e.message));
  await assert.rejects(b.listarCorridas({ empresaId: "1" }), (e: MotorErro) => e.codigo === "NAO_SUPORTADO");
  await assert.rejects(b.motoristas({ situacao: "suspenso" }), (e: MotorErro) => e.codigo === "NAO_SUPORTADO");
  await assert.rejects(
    b.criarCorrida({ passageiro: { nome: "F", telefone: "19999991234" }, partida: { texto: "Rua A", lat: -22, lng: -47 }, pagamento: "dinheiro", cupom: "X" }),
    (e: MotorErro) => e.codigo === "NAO_SUPORTADO",
  );
  assert.equal(f.pedidos.length, 0);
  assert.equal(b.capacidades().tarifas.disponivel, false);
  assert.equal(criarAdaptadorSistemaA(INTEG).capacidades().gerirProgramadas.disponivel, true);
});
