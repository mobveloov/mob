import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { MotorErro } from "../src/erros.ts";
import { assinaturaSistemaAValida, criarAdaptadorSistemaA, eventosSistemaA } from "../src/sistema-a.ts";
import { A_URL, B_APP, B_PAINEL, fetchFalso, rota } from "./fetch-falso.ts";

const INTEG = {
  id: "sistema-a",
  credenciais: { apiUrl: A_URL, apiKey: "chave-teste", usuario: "usuario-teste", senha: "senha-teste", motivoCancelamentoId: 3, latPadrao: -22.18, lngPadrao: -47.39 },
};

// Item no formato documentado de POST /corridas/consultar (exemplo da documentação, dados fictícios).
const ITEM = {
  id: "100018001",
  data_hora_solicitacao: "2024-05-02 08:53:42",
  data_hora_solicitacao_utc: "2024-05-02T11:53:42Z",
  data_hora_chegada_local: null,
  status_solicitacao: "F",
  cliente_id: "83605",
  nome_passageiro: "Passageiro Teste",
  data_hora_aceite_utc: "2024-05-02T11:54:00Z",
  data_hora_finalizacao_utc: "2024-05-02T12:10:00Z",
  valor_corrida: "7.00",
  valor_corrida_integral: "10.00",
  condutor_id: "555",
  nome_condutor: "Motorista Teste",
  telefone_condutor: "(19) 90000-0000",
  veiculo: "Onix",
  placa_veiculo: "ABC1D23",
  cor_veiculo: "Prata",
  duracao_corrida: "960",
  distancia_percorrida_km: "5.4",
  tipo_pagamento: "X",
  tarifa: "Tarifa padrão",
  desconto: "30.00",
  distancia_coleta_km: "1.2",
  avaliacao_condutor: { nota: 5, avaliado_em: "2024-05-02T12:20:00Z" },
  id_categoria: "71",
  categoria: "Comum",
  partida: { endereco: "Rua A, 10", bairro: "Centro", cidade: "Cidade X", estado: "SP", lat: "-22.18", lng: "-47.39" },
  desejado: { endereco: "Rua B, 20", bairro: "Jardim", cidade: "Cidade X", estado: "SP", lat: "-22.19", lng: "-47.40" },
  paradas: [],
};

test("listarCorridas: chama POST /corridas/consultar com api-key e Basic Auth, e traduz", async () => {
  const f = fetchFalso(rota("POST", "/corridas/consultar", { json: { success: true, data: [ITEM] } }));
  const m = criarAdaptadorSistemaA(INTEG, { fetch: f.fetch });
  const r = await m.listarCorridas({ de: "2024-05-02T00:00:00Z", ate: "2024-05-03T00:00:00Z", status: ["finalizada"], limite: 10 });
  const p = f.pedidos[0];
  assert.equal(p.url.href, "https://sistema-a.exemplo.invalid/api/v2/integracao/corridas/consultar");
  assert.equal(p.cabecalhos["api-key"], "chave-teste");
  assert.equal(p.cabecalhos.authorization, "Basic " + Buffer.from("usuario-teste:senha-teste").toString("base64"));
  const corpo = JSON.parse(p.corpo!);
  assert.equal(corpo.status_solicitacao, "F");
  assert.equal(corpo.limite, 10);
  assert.equal(corpo.data_hora_solicitacao_min, "2024-05-02T00:00:00Z");
  assert.equal(corpo.data_hora_solicitacao_max, "2024-05-03T00:00:00Z");

  assert.equal(r.itens.length, 1);
  const c = r.itens[0];
  assert.equal(c.id, "sistema-a:100018001");
  assert.equal(c.status, "finalizada");
  assert.equal(c.grupo, "finalizada");
  assert.equal(c.pagamento, "pix");
  assert.equal(c.valor, 7);
  assert.equal(c.valorSemDesconto, 10);
  assert.equal(c.duracaoMin, 16);
  assert.equal(c.motorista?.nome, "Motorista Teste");
  assert.equal(c.veiculo?.placa, "ABC1D23");
  assert.equal(c.partida.lat, -22.18);
  assert.equal(c.destino?.texto, "Rua B, 20");
  assert.equal(c.solicitadaEm, "2024-05-02T11:53:42Z");
  assert.equal(c.origem, "sistema-a");
  assert.equal(c.integracaoId, "sistema-a");
  assert.equal(c.tarifa, "Tarifa padrão");
  assert.equal(c.descontoPct, 30);
  assert.equal(c.descontoValor, 3);
  assert.equal(c.distanciaMotoristaKm, 1.2);
  assert.deepEqual(c.avaliacao, { nota: 5 });
  assert.equal(c.programada, false);
  assert.ok(c.semDado.some((s) => s.campo === "dinamica" && s.doSistema));
  // Lacunas explícitas: o que o Sistema A não manda aparece com motivo, nunca some.
  const semTel = c.semDado.find((s) => s.campo === "passageiro.telefone");
  assert.equal(semTel?.doSistema, true);
  assert.match(semTel!.motivo, /Sistema A/);
  assert.ok(c.semDado.some((s) => s.campo === "canal" && s.doSistema));
  assert.equal(r.temMais, false);
});

test("listarCorridas: com dois status, não manda filtro e filtra no motor", async () => {
  const outro = { ...ITEM, id: "2", status_solicitacao: "E" };
  const terceiro = { ...ITEM, id: "3", status_solicitacao: "N" };
  const f = fetchFalso(rota("POST", "/corridas/consultar", { json: { success: true, data: [ITEM, outro, terceiro] } }));
  const m = criarAdaptadorSistemaA(INTEG, { fetch: f.fetch });
  const r = await m.listarCorridas({ status: ["finalizada", "em_andamento"] });
  assert.equal(JSON.parse(f.pedidos[0].corpo!).status_solicitacao, undefined);
  assert.deepEqual(r.itens.map((c) => c.idOriginal), ["100018001", "2"]);
});

test("listarCorridas (auditoria): limite no máximo 100, sempre manda data final, nunca manda U", async () => {
  const f = fetchFalso(rota("POST", "/corridas/consultar", { json: { success: true, data: [{ ...ITEM, status_solicitacao: "U" }] } }));
  const m = criarAdaptadorSistemaA(INTEG, { fetch: f.fetch });
  const r = await m.listarCorridas({ limite: 500, status: ["agrupada"] });
  const corpo = JSON.parse(f.pedidos[0].corpo!);
  assert.equal(corpo.limite, 100);
  assert.ok(corpo.data_hora_solicitacao_max, "data final presente");
  assert.equal(corpo.status_solicitacao, undefined); // U daria erro 98: filtramos no motor
  assert.equal(r.itens[0].status, "agrupada");
});

test("listarCorridas (auditoria): mais de 31 dias ou fim antes do início = DADOS_INVALIDOS sem chamar a rede", async () => {
  const f = fetchFalso();
  const m = criarAdaptadorSistemaA(INTEG, { fetch: f.fetch });
  await assert.rejects(m.listarCorridas({ de: "2026-01-01T00:00:00Z", ate: "2026-03-01T00:00:00Z" }), (e: MotorErro) => e.codigo === "DADOS_INVALIDOS" && /31 dias/.test(e.message));
  await assert.rejects(m.listarCorridas({ de: "2026-01-02T00:00:00Z", ate: "2026-01-01T00:00:00Z" }), (e: MotorErro) => e.codigo === "DADOS_INVALIDOS");
  assert.equal(f.pedidos.length, 0);
});

test("erros (auditoria): permissão e licença chegam com 400 e viram SEM_AUTORIZACAO; código 25 vira NAO_ENCONTRADO", async () => {
  const casos: [unknown, string][] = [
    [{ success: false, errors: [{ code: 1, message: "Usuário e/ou senhas inválidos." }] }, "SEM_AUTORIZACAO"],
    [{ success: false, errors: [{ code: 19, message: "Não é possível utilizar a API com a sua licença." }] }, "SEM_AUTORIZACAO"],
    [{ success: false, errors: [{ code: 68, message: "O usuário informado não tem permissão para realizar essa operação." }] }, "SEM_AUTORIZACAO"],
    [{ success: false, errors: [{ code: 25, message: "Solicitação não encontrada." }] }, "NAO_ENCONTRADO"],
    [{ success: false, errors: [{ code: 151, message: "Não é possível cancelar." }] }, "DADOS_INVALIDOS"],
  ];
  for (const [json, codigo] of casos) {
    const f = fetchFalso(() => ({ status: 400, json }));
    await assert.rejects(criarAdaptadorSistemaA(INTEG, { fetch: f.fetch }).cancelarCorrida("5"), (e: MotorErro) => {
      assert.equal(e.codigo, codigo, JSON.stringify(json));
      return true;
    });
  }
});

test("motoristas (auditoria): 404 com código 56 = nenhum motorista, lista vazia", async () => {
  const f = fetchFalso(rota("GET", "/condutores", { status: 404, json: { success: false, errors: [{ code: 56, message: "Motorista não encontrado" }] } }));
  const r = await criarAdaptadorSistemaA(INTEG, { fetch: f.fetch }).motoristas({ busca: "11999990000", limite: 300 });
  assert.deepEqual(r.itens, []);
  assert.equal(f.pedidos[0].url.searchParams.get("limite"), "100");
});

test("categorias (auditoria): manda o ponto padrão; sem ponto e com recusa = NAO_CONFIGURADO com explicação", async () => {
  const f = fetchFalso(rota("GET", "/configuracoes/categorias", { json: { success: true, data: [] } }));
  await criarAdaptadorSistemaA(INTEG, { fetch: f.fetch }).categorias();
  assert.equal(f.pedidos[0].url.searchParams.get("lat"), "-22.18");
  assert.equal(f.pedidos[0].url.searchParams.get("lng"), "-47.39");
  const semPonto = { id: "sistema-a", credenciais: { ...INTEG.credenciais, latPadrao: undefined, lngPadrao: undefined } };
  const g = fetchFalso(() => ({ status: 400, json: { success: false, errors: [{ code: 2, message: "Campo 'endereco' é obrigatório." }] } }));
  await assert.rejects(criarAdaptadorSistemaA(semPonto, { fetch: g.fetch }).categorias(), (e: MotorErro) => e.codigo === "NAO_CONFIGURADO" && /latPadrao/.test(e.message));
});

test("criarCorrida (auditoria): erro 500 avisa que a corrida pode ter sido criada", async () => {
  const f = fetchFalso(() => ({ status: 500, json: { success: false, errors: [{ code: 0, message: "Falha na operação" }] } }));
  await assert.rejects(
    criarAdaptadorSistemaA(INTEG, { fetch: f.fetch }).criarCorrida({ passageiro: { nome: "F", telefone: "19999991234" }, partida: { texto: "Rua A", bairro: "Centro" }, pagamento: "pix", idExterno: "x1" }),
    (e: MotorErro) => e.codigo === "INDISPONIVEL" && /pode ter sido criada/.test(e.message) && /x1/.test(e.message),
  );
});

test("listarCorridas: sem corridas a API omite data", async () => {
  const f = fetchFalso(rota("POST", "/corridas/consultar", { json: { success: true } }));
  const r = await criarAdaptadorSistemaA(INTEG, { fetch: f.fetch }).listarCorridas();
  assert.deepEqual(r.itens, []);
});

test("detalharCorrida: status A busca a fase e vira no_local", async () => {
  const f = fetchFalso(
    rota("GET", "/corridas/9/status", { json: { success: true, data: { status: "A", fase: "no_local" } } }),
    rota("GET", "/corridas/9", { json: { success: true, data: [{ ...ITEM, id: "9", status_solicitacao: "A" }] } }),
  );
  const c = await criarAdaptadorSistemaA(INTEG, { fetch: f.fetch }).detalharCorrida("sistema-a:9");
  assert.equal(c.status, "no_local");
  assert.equal(c.statusOriginal, "A");
  assert.equal(f.pedidos.length, 2);
});

test("criarCorrida: monta o corpo documentado e devolve o id_mch", async () => {
  const f = fetchFalso(rota("POST", "/corridas", { json: { success: true, data: { id_mch: "777", tipo: "normal", valor_corrida: 15.4 } } }));
  const r = await criarAdaptadorSistemaA(INTEG, { fetch: f.fetch }).criarCorrida({
    passageiro: { nome: "Fulano", telefone: "(19) 99999-1234" },
    partida: { texto: "Rua A, 10", bairro: "Centro", cidade: "Cidade X", estado: "SP", lat: -22.18, lng: -47.39 },
    destino: { texto: "Rua B, 20", bairro: "Jardim" },
    categoriaId: "sistema-a:71",
    pagamento: "dinheiro",
    observacao: "Portão azul",
    idExterno: "painel-1",
  });
  const corpo = JSON.parse(f.pedidos[0].corpo!);
  assert.deepEqual(corpo.dados_passageiro, { codigo_pais: 55, codigo_area: 19, telefone: 999991234, nome: "Fulano" });
  assert.equal(corpo.forma_pagamento, "D");
  assert.equal(corpo.categoria_id, 71);
  assert.equal(corpo.partida.bairro, "Centro");
  assert.equal(corpo.info_antes_aceite, "Portão azul");
  assert.equal(r.id, "sistema-a:777");
  assert.equal(r.valor, 15.4);
});

test("criarCorrida: telefone inválido não chama a rede", async () => {
  const f = fetchFalso();
  await assert.rejects(
    criarAdaptadorSistemaA(INTEG, { fetch: f.fetch }).criarCorrida({ passageiro: { nome: "X", telefone: "123" }, partida: { texto: "R", bairro: "B" }, pagamento: "pix" }),
    (e: MotorErro) => e.codigo === "DADOS_INVALIDOS",
  );
  assert.equal(f.pedidos.length, 0);
});

test("cancelarCorrida: usa o motivo padrão da empresa", async () => {
  const f = fetchFalso(rota("POST", "/corridas/5/cancelar", { json: { success: true } }));
  await criarAdaptadorSistemaA(INTEG, { fetch: f.fetch }).cancelarCorrida("5");
  assert.deepEqual(JSON.parse(f.pedidos[0].corpo!), { motivo_id: 3 });
});

test("motoristas e categorias", async () => {
  const f = fetchFalso(
    rota("GET", "/condutores", {
      json: { success: true, data: [{ id: "1", nome: "Ana", status: "A", telefone_internacional: "+5519900000000", avaliacao_media: "4.9", categorias: [{ id: 1, nome: "Comum" }], veiculos: [{ placa: "AAA0A00", modelo: "HB20", em_uso: true }] }] },
    }),
    rota("GET", "/configuracoes/categorias", { json: { success: true, data: [{ id: "71", nome: "Comum" }] } }),
  );
  const m = criarAdaptadorSistemaA(INTEG, { fetch: f.fetch });
  const ms = await m.motoristas({ busca: "(19) 90000-0000" });
  assert.equal(f.pedidos[0].url.searchParams.get("telefone"), "19900000000");
  assert.equal(ms.itens[0].id, "sistema-a:1");
  assert.equal(ms.itens[0].ativo, true);
  assert.equal(ms.itens[0].avaliacao, 4.9);
  assert.deepEqual(ms.itens[0].categorias, ["Comum"]);
  assert.equal(ms.itens[0].veiculo?.placa, "AAA0A00");
  const cats = await m.categorias();
  assert.deepEqual(cats.map((c) => [c.id, c.nome]), [["sistema-a:71", "Comum"]]);
});

test("erros: sem chave = NAO_CONFIGURADO sem chamar a rede", async () => {
  const f = fetchFalso();
  const m = criarAdaptadorSistemaA({ id: "sistema-a", credenciais: {} }, { fetch: f.fetch });
  assert.equal(m.configurado(), false);
  assert.equal(m.pendencias().length, 4); // endereço, chave, usuário e senha
  await assert.rejects(m.listarCorridas(), (e: MotorErro) => e.codigo === "NAO_CONFIGURADO");
  assert.equal(f.pedidos.length, 0);
});

test("erros: 400 B1 (chave não informada) = SEM_AUTORIZACAO; 429 = LIMITE com Retry-After; 503 = INDISPONIVEL", async () => {
  // Respostas reais vistas em 07/11/2026 ao chamar a API sem chave (ver docs/MOTOR_TESTES.md).
  const b1 = { success: false, errors: [{ code: "B1", message: "Chave da api não informada." }] };
  const casos: [number, unknown, string, Record<string, string>?][] = [
    [400, b1, "SEM_AUTORIZACAO"],
    [401, { error: { code: 401, message: "Access credentials are invalid" } }, "SEM_AUTORIZACAO"],
    [429, { success: false, errors: [] }, "LIMITE", { "Retry-After": "12" }],
    [503, "", "INDISPONIVEL"],
    [422, { success: false, errors: [{ field: "partida", error: "obrigatório" }] }, "DADOS_INVALIDOS"],
  ];
  for (const [status, json, codigo, cab] of casos) {
    const f = fetchFalso(() => ({ status, json, cabecalhos: cab }));
    await assert.rejects(criarAdaptadorSistemaA(INTEG, { fetch: f.fetch }).categorias(), (e: MotorErro) => {
      assert.equal(e.codigo, codigo, `HTTP ${status}`);
      if (codigo === "LIMITE") assert.equal(e.tentarEmSegundos, 12);
      return true;
    });
  }
});

test("erros: falha de rede = INDISPONIVEL", async () => {
  const m = criarAdaptadorSistemaA(INTEG, { fetch: async () => { throw new TypeError("fetch failed"); } });
  await assert.rejects(m.categorias(), (e: MotorErro) => e.codigo === "INDISPONIVEL");
});

test("webhook de status (formato novo da documentação)", () => {
  const ev = eventosSistemaA(JSON.stringify({ datetime: "2026-11-07T10:00:00Z", event_id: "e1", request_id: 123, status_code: "A", status_label: "ACCEPTED", driver: { driver_id: 5 } }));
  assert.equal(ev.length, 1);
  assert.equal(ev[0].tipo, "status");
  assert.equal(ev[0].corridaId, "sistema-a:123");
  assert.equal(ev[0].status, "aceita");
  assert.equal(ev[0].idEvento, "e1");
});

test("webhook de posição em lote e mensagem de corrida", () => {
  const pos = eventosSistemaA(
    JSON.stringify({ event_id: "p1", datetime: "2026-11-07T10:00:00Z", data: [{ timestamp: 1794050000000, request_id: 9, driver_id: 5, coordinates: { latitude: -22.1, longitude: -47.3 } }, { request_id: 9, coordinates: {} }] }),
  );
  assert.equal(pos.length, 1);
  assert.deepEqual(pos[0].posicao, { lat: -22.1, lng: -47.3, motoristaId: "5" });
  const msg = eventosSistemaA(JSON.stringify({ event_id: "m1", request_id: 9, sender_type: "PASSENGER", content: "Estou no portão", type_code: "S" }));
  assert.equal(msg[0].tipo, "mensagem");
  assert.equal(msg[0].mensagem?.texto, "Estou no portão");
  const parada = eventosSistemaA(JSON.stringify({ request_id: 9, status_code: "ER", stop_id: 1 }));
  assert.equal(parada[0].tipo, "parada");
});

test("webhook (auditoria): fases AN/AP/AW, cancelada que reabre e formatos antigos", () => {
  const ev = (o: unknown) => eventosSistemaA(JSON.stringify(o));
  assert.equal(ev({ request_id: 1, status_code: "AN", status_label: "NEAR_LOCATION" })[0].status, "aceita");
  assert.equal(ev({ request_id: 1, status_code: "AP", status_label: "ARRIVED_AT_LOCATION" })[0].status, "no_local");
  assert.equal(ev({ request_id: 1, status_code: "AW" })[0].status, "no_local");
  assert.equal(ev({ request_id: 1, status_code: "L" })[0].status, "pendente");
  const canc = ev({ request_id: 1, status_code: "C", will_reopen: true })[0];
  assert.equal(canc.status, "cancelada");
  assert.equal(canc.reabre, true);
  assert.equal(ev({ request_id: 1, status_code: "A" })[0].reabre, undefined);
  // Formato antigo de status e de posição
  const velho = ev({ id_mch: "77", status_solicitacao: "F", data_hora_solicitacao: "2026-11-07 10:00:00" })[0];
  assert.equal(velho.corridaId, "sistema-a:77");
  assert.equal(velho.status, "finalizada");
  const pos = ev([{ id_mch: "77", condutor_id: "5", lat_cond: "-22.1", lng_cond: "-47.3" }])[0];
  assert.equal(pos.tipo, "posicao");
  assert.deepEqual(pos.posicao, { lat: -22.1, lng: -47.3, motoristaId: "5" });
});

test("webhook inválido = DADOS_INVALIDOS", () => {
  assert.throws(() => eventosSistemaA("não é json"), (e: MotorErro) => e.codigo === "DADOS_INVALIDOS");
});

test("assinatura Signature-V2 (HMAC-SHA512): aceita hex e base64, recusa errada", () => {
  const corpo = '{"a":1}';
  const mac = createHmac("sha512", "k").update(corpo).digest();
  assert.equal(assinaturaSistemaAValida(corpo, mac.toString("hex"), "k"), true);
  assert.equal(assinaturaSistemaAValida(corpo, mac.toString("base64"), "k"), true);
  assert.equal(assinaturaSistemaAValida(corpo, "errada", "k"), false);
  assert.equal(assinaturaSistemaAValida(corpo, undefined, "k"), false);
});
