import assert from "node:assert/strict";
import { test } from "node:test";
import { MotorErro } from "../src/erros.ts";
import { criarAdaptadorSistemaB, pagamentoSistemaB } from "../src/sistema-b.ts";
import { A_URL, B_APP, B_PAINEL, fetchFalso, rota } from "./fetch-falso.ts";

const INTEG = { id: "sistema-b", credenciais: { painelUrl: B_PAINEL, appApiUrl: B_APP, cookie: "PHPSESSID=teste", cidadeId: "1" } };

// Campos tirados do JavaScript da página consultar_corridas.php salva (dados fictícios).
const ITEM = {
  id: 4321,
  date: "2026-11-07 10:30:00",
  hora_fmt: "10:30:00",
  status: "8",
  endereco_ini_txt: "Rua A, 10 - Centro",
  endereco_fim_txt: "Rua B, 20",
  lat_ini: "-21.76",
  lng_ini: "-52.42",
  lat_fim: "0",
  lng_fim: "0",
  nome_cliente: "Passageiro Teste",
  passageiro_telefone: "67999990000",
  nome_motorista: "Motorista Teste",
  motorista_id: "77",
  placa: "ABC1D23",
  motorista_carro: "Gol",
  f_pagamento: "Cartão",
  valor_final: "18.50",
  valor_inicial: "20.00",
  nome_categoria: "Sistema B + Barato",
  motivo_cancel: "Demorou",
  paradas_json: '[{"endereco":"Parada 1","lat":"-21.7","lng":"-52.4"}]',
};

test("listarCorridas: POST no painel com cookie, formulário do filtro e tradução do status", async () => {
  const f = fetchFalso(rota("POST", "/dashboard/consultar_corridas_api.php", { json: { data: [ITEM], stats: { total: 1 }, info_pag: "1 de 1", total_pags: 1 } }));
  const a = criarAdaptadorSistemaB(INTEG, { fetch: f.fetch });
  const r = await a.listarCorridas({ de: "2026-11-07T13:00:00Z", ate: "2026-11-07T15:00:00Z", status: ["cancelada"] });
  const p = f.pedidos[0];
  assert.equal(p.cabecalhos.cookie, "PHPSESSID=teste");
  const form = new URLSearchParams(p.corpo);
  assert.equal(form.get("acao"), "listar");
  assert.equal(form.get("data_ini"), "2026-11-07");
  assert.equal(form.get("hora_ini"), "10:00"); // 13h UTC = 10h em Brasília
  assert.equal(form.get("hora_fim"), "12:00");
  assert.equal(form.get("status"), "todos"); // "cancelada" são dois códigos (5 e 8): filtra no motor
  assert.equal(form.get("cidade_filtro"), "1");

  const c = r.itens[0];
  assert.equal(c.id, "sistema-b:4321");
  assert.equal(c.status, "cancelada");
  assert.equal(c.canceladaPor, "motorista");
  assert.equal(c.statusTexto, "Cancelada pelo motorista");
  assert.equal(c.pagamento, "cartao_app");
  assert.equal(c.valor, 18.5);
  assert.equal(c.solicitadaEm, "2026-11-07T10:30:00-03:00");
  assert.equal(c.destino?.lat, undefined); // "0" é descartado
  assert.equal(c.paradas[0].texto, "Parada 1");
  assert.equal(c.motorista?.id, "77");
  assert.equal(c.origem, "sistema-b");
  assert.ok(c.semDado.some((s) => s.campo === "categoria.id" && s.doSistema));
  assert.ok(!c.semDado.some((s) => s.campo === "passageiro.telefone"));
  assert.equal(r.total, 1);
  assert.equal(r.temMais, false);
});

test("listarCorridas: um código só vai direto no filtro", async () => {
  const f = fetchFalso(rota("POST", "/consultar_corridas_api.php", { json: { data: [], total_pags: 0 } }));
  await criarAdaptadorSistemaB(INTEG, { fetch: f.fetch }).listarCorridas({ status: ["no_local"] });
  assert.equal(new URLSearchParams(f.pedidos[0].corpo).get("status"), "2");
});

test("sessão vencida: 'Acesso negado' (resposta real do servidor sem cookie) = SEM_AUTORIZACAO", async () => {
  const f = fetchFalso(rota("POST", "/consultar_corridas_api.php", { json: { success: false, msg: "Acesso negado" } }));
  await assert.rejects(criarAdaptadorSistemaB(INTEG, { fetch: f.fetch }).listarCorridas(), (e: MotorErro) => e.codigo === "SEM_AUTORIZACAO");
});

test("sessão vencida: página HTML de login = SEM_AUTORIZACAO", async () => {
  const f = fetchFalso(() => ({ texto: "<html><form>login senha</form></html>" }));
  await assert.rejects(criarAdaptadorSistemaB(INTEG, { fetch: f.fetch }).detalharCorrida("1"), (e: MotorErro) => e.codigo === "SEM_AUTORIZACAO");
});

test("sem cookie = NAO_CONFIGURADO sem chamar a rede", async () => {
  const f = fetchFalso();
  const a = criarAdaptadorSistemaB({ id: "sistema-b", credenciais: {} }, { fetch: f.fetch });
  assert.equal(a.configurado(), false);
  await assert.rejects(a.listarCorridas(), (e: MotorErro) => e.codigo === "NAO_CONFIGURADO");
  assert.equal(f.pedidos.length, 0);
});

test("detalharCorrida: GET acao=detalhes", async () => {
  const f = fetchFalso(rota("GET", /consultar_corridas_api\.php\?acao=detalhes&id=4321/, { json: { success: true, data: { ...ITEM, status: "3", st_ui: { label: "Em Viagem" } } } }));
  const c = await criarAdaptadorSistemaB(INTEG, { fetch: f.fetch }).detalharCorrida("sistema-b:4321");
  assert.equal(c.status, "em_andamento");
  assert.equal(c.statusTexto, "Em Viagem");
});

test("criarCorrida: formulário igual ao do painel (acao=criar_corrida)", async () => {
  const f = fetchFalso(rota("POST", "/dashboard/solicitar_corrida.php", { json: { success: true, id: 999 } }));
  const r = await criarAdaptadorSistemaB(INTEG, { fetch: f.fetch }).criarCorrida({
    passageiro: { nome: "Fulano", telefone: "+55 (67) 99999-0000" },
    partida: { texto: "Rua A, 10", lat: -21.76, lng: -52.42 },
    pagamento: "pix",
    categoriaId: "sistema-b:69",
    valor: 12,
  });
  const form = new URLSearchParams(f.pedidos[0].corpo);
  assert.equal(form.get("acao"), "criar_corrida");
  assert.equal(form.get("cidade_id_final"), "1");
  assert.equal(form.get("tel_passageiro"), "67999990000");
  assert.equal(form.get("forma_pagamento"), "Pix");
  assert.equal(form.get("categoria_id"), "69");
  assert.equal(form.get("destino"), "informar depois");
  assert.equal(form.get("valor_final"), "12.00");
  assert.equal(r.id, "sistema-b:999");
});

test("criarCorrida: sem coordenadas = DADOS_INVALIDOS", async () => {
  const f = fetchFalso();
  await assert.rejects(
    criarAdaptadorSistemaB(INTEG, { fetch: f.fetch }).criarCorrida({ passageiro: { nome: "F", telefone: "67999990000" }, partida: { texto: "Rua" }, pagamento: "pix" }),
    (e: MotorErro) => e.codigo === "DADOS_INVALIDOS",
  );
});

test("cancelarCorrida: cancelar_corrida_painel.php com origem central", async () => {
  const f = fetchFalso(rota("POST", "/cancelar_corrida_painel.php", { json: { success: true } }));
  await criarAdaptadorSistemaB(INTEG, { fetch: f.fetch }).cancelarCorrida("sistema-b:4321", "Teste");
  const form = new URLSearchParams(f.pedidos[0].corpo);
  assert.deepEqual([form.get("id_corrida"), form.get("origem"), form.get("motivo")], ["4321", "central", "Teste"]);
});

test("motoristas: api_motoristas.php acao=listar", async () => {
  const f = fetchFalso(rota("GET", "/api_motoristas.php", { json: { success: true, data: [{ id: 77, nome: "Ana", ativo: "1", online: "0", placa: "AAA0A00", veiculo: "HB20" }], paginacao: { atual: 1, total_paginas: 2 } } }));
  const r = await criarAdaptadorSistemaB(INTEG, { fetch: f.fetch }).motoristas({ busca: "Ana" });
  assert.equal(f.pedidos[0].url.searchParams.get("nome"), "Ana");
  assert.equal(r.itens[0].id, "sistema-b:77");
  assert.equal(r.itens[0].online, false);
  assert.equal(r.temMais, true);
});

test("categorias: endpoint público do app (formato real visto em 07/11/2026), sem cookie", async () => {
  const f = fetchFalso(
    rota("POST", "/_/app/get_categorias_ativas.php", {
      json: [{ id: 69, cidade_id: 1, nome: "Sistema B + Barato", descricao: "Pague menos", tx_km: "2.60", tx_minuto: "0.20", tx_minima: "7.99", tx_base: "6.00" }],
    }),
  );
  const cats = await criarAdaptadorSistemaB({ id: "sistema-b", credenciais: { painelUrl: B_PAINEL, appApiUrl: B_APP, cidadeId: "1" } }, { fetch: f.fetch }).categorias();
  assert.equal(f.pedidos[0].cabecalhos.cookie, undefined);
  assert.equal(new URLSearchParams(f.pedidos[0].corpo).get("cidade_id"), "1");
  assert.deepEqual(cats[0].tarifa, { base: 6, km: 2.6, minuto: 0.2, minima: 7.99 });
});

test("webhook não existe no Sistema B", () => {
  assert.throws(() => criarAdaptadorSistemaB(INTEG).lerWebhook("{}"), (e: MotorErro) => e.codigo === "NAO_SUPORTADO");
});

test("formas de pagamento do Sistema B", () => {
  assert.equal(pagamentoSistemaB("Dinheiro"), "dinheiro");
  assert.equal(pagamentoSistemaB("Pix"), "pix");
  assert.equal(pagamentoSistemaB("Maquininha"), "cartao_maquina");
  assert.equal(pagamentoSistemaB("Saldo da Carteira"), "carteira");
  assert.equal(pagamentoSistemaB("Cartão (App)"), "cartao_app");
});
