import assert from "node:assert/strict";
import { test } from "node:test";
import { MotorErro, criarMotor, type Empresa } from "../src/index.ts";
import { A_URL, B_APP, B_PAINEL, fetchFalso, rota } from "./fetch-falso.ts";

const EMPRESA: Empresa = {
  id: "empresa-a",
  integracoes: [
    { id: "sistema-a", tipo: "sistema-a", credenciais: { apiUrl: A_URL, apiKey: "k", usuario: "u", senha: "s" } },
    { id: "sistema-b", tipo: "sistema-b", credenciais: { painelUrl: B_PAINEL, appApiUrl: B_APP, cookie: "PHPSESSID=x", cidadeId: "1" } },
  ],
};
const P = { partida: { texto: "Rua A, 10", bairro: "Centro", lat: -22.1, lng: -47.3 }, destino: { texto: "Rua B", lat: -22.2, lng: -47.4 } };

// ------------------------------------------------------------ Sistema A

test("Sistema A estimativa: várias categorias de uma vez (multicategorias)", async () => {
  const f = fetchFalso(
    rota("POST", "/corridas/estimativas", {
      json: { success: true, data: { estimativa_minutos: 12, estimativa_km: 5.4, categorias: [{ categoria_id: "71", categoria_nome: "Comum", tarifa_nome: "Padrão", estimativa_valor: 18.3, valor_original: 20 }] } },
    }),
  );
  const r = await criarMotor(EMPRESA, { fetch: f.fetch }).estimarCorrida("sistema-a", P);
  const corpo = JSON.parse(f.pedidos[0].corpo!);
  assert.equal(corpo.multicategorias, true);
  assert.equal(corpo.lat_partida, -22.1);
  assert.deepEqual(
    r.itens.map((e) => [e.categoriaId, e.categoria, e.valor, e.valorSemDesconto, e.distanciaKm, e.duracaoMin, e.origem]),
    [["sistema-a:71", "Comum", 18.3, 20, 5.4, 12, "sistema-a"]],
  );
});

test("Sistema A programadas: data e hora viram ISO; corrida gerada vira id do motor", async () => {
  const f = fetchFalso(
    rota("GET", "/corridas/programadas", {
      json: {
        success: true,
        data: [
          { id_mch_programada: "1392", situacao: "D", situacao_formatada: "Distribuída", data_previsao_disparo: "21/01/2021", hora_previsao_disparo: "00:55:00", id_mch: "100003594", nome_passageiro: "Fulano", categoria: { id: "1", nome: "Executivo" }, valor: { estimado: "12.50", prefixado: null }, partida: { endereco: "Rua X", bairro: "Centro" }, desejado: { endereco: "Rua Y" } },
        ],
      },
    }),
  );
  const r = await criarMotor(EMPRESA, { fetch: f.fetch }).programadas("sistema-a");
  const p = r.itens[0];
  assert.equal(p.id, "sistema-a:1392");
  assert.equal(p.agendadaPara, "2021-01-21T00:55:00-03:00");
  assert.equal(p.corridaId, "sistema-a:100003594");
  assert.equal(p.valorEstimado, 12.5);
  assert.ok(p.semDado.some((s) => s.campo === "pagamento"));
});

test("Sistema A programadas vazias: `data` vem como objeto e o motor devolve lista vazia", async () => {
  const f = fetchFalso(rota("GET", "/corridas/programadas", { json: { success: true, data: { message: "Nenhuma programada" } } }));
  const r = await criarMotor(EMPRESA, { fetch: f.fetch }).programadas("sistema-a");
  assert.deepEqual(r.itens, []);
});

test("Sistema A mapa, rastreio, linha do tempo e chat", async () => {
  const f = fetchFalso(
    rota("GET", "/condutores/posicoes", { json: { success: true, data: { condutores: [{ id: 5, nome: "Ana", bandeira_id: 1, lat: -22.1, lng: -47.3, ultima_atividade: "2026-11-08T10:00:00Z", inativo: false }, { id: 6, nome: "Sem posição", lat: 0, lng: 0 }] } } }),
    rota("GET", "/corridas/9/condutor/posicao", { json: { success: true, data: { lat_condutor: "-22.10", lng_condutor: "-47.30", condutor_id: "5" } } }),
    rota("GET", "/corridas/8/condutor/posicao", { json: { success: true, data: { lat_condutor: null, lng_condutor: null, condutor_id: null } } }),
    rota("GET", "/corridas/9/detalhes", {
      json: {
        success: true,
        data: {
          request_id: 9, short_code: "F", requested_at: "2026-11-08T10:00:00+00:00", driver: { name: "Ana" },
          progress: { accepted_at: "2026-11-08T10:01:00+00:00", accept_distance_km: 1.2, pickup_arrival: "2026-11-08T10:05:00+00:00", start_trip: "2026-11-08T10:06:00+00:00" },
          finished: { finished_at: "2026-11-08T10:20:00+00:00", final_value: 18.3 },
        },
      },
    }),
    rota("GET", "/mensagens/corridas/condutor/9", { json: { success: true, data: { solicitacao_id: 9, mensagens: [{ id: 1, texto: "Cheguei", data_hora: "2026-11-08 07:05:00", remetente: { tipo: "condutor", nome: "Ana" } }] } } }),
  );
  const m = criarMotor(EMPRESA, { fetch: f.fetch });
  const pos = await m.posicoesMotoristas("sistema-a");
  assert.deepEqual(pos.itens.map((p) => [p.motoristaId, p.lat, p.livre]), [["sistema-a:5", -22.1, true]]);
  assert.deepEqual(await m.rastrearCorrida("sistema-a:9"), { corridaId: "sistema-a:9", motoristaId: "sistema-a:5", lat: -22.1, lng: -47.3, disponivel: true });
  const semPos = await m.rastrearCorrida("sistema-a:8");
  assert.equal(semPos.disponivel, false);
  assert.ok(semPos.motivo);
  const lt = await m.linhaDoTempo("sistema-a:9");
  assert.deepEqual(lt.eventos.map((e) => e.texto), ["Corrida pedida", "Aceita por Ana a 1.2 km", "Motorista chegou no embarque", "Corrida iniciada", "Corrida finalizada (R$ 18.30)"]);
  assert.ok(lt.semDado.some((s) => s.campo === "ofertas" && s.doSistema));
  const chat = await m.mensagensCorrida("sistema-a:9");
  assert.deepEqual(chat, [{ em: "2026-11-08T07:05:00-03:00", de: "motorista", nome: "Ana", texto: "Cheguei" }]);
});

test("Sistema A cadastros e financeiro: passageiros, conveniadas, extrato, cupons, dinâmicas, punições, áreas", async () => {
  const f = fetchFalso(
    rota("GET", "/clientes", { json: { success: true, data: [{ id: "1", nome: "Maria", telefone: "(19) 99999-0000", status_cliente: "A", avaliacao_media: 4.8, quantidade_corridas_finalizadas: 12 }] } }),
    rota("GET", "/empresas", { json: { success: true, data: [{ id: "3", nome: "Empresa X", status_empresa: "A", categorias: [{ id: "1", nome: "Comum" }] }] } }),
    rota("GET", "/financeiro/extrato", { json: { success: true, data: { lista: [{ data_hora: "2026-11-08T10:00:00-03:00", valor: -2.5, pessoa: { tipo: "condutor", nome: "Ana" }, tipo_operacao: "taxa_central", operacao_descricao: "Taxa da central", descricao: "OS #9", estornado: false }], processamento_mchpay: "OK" } } }),
    rota("GET", "/cupons", { json: { success: true, data: [{ id: 7, codigo: "BEMVINDO", status: "ativo", data_hora_inicio: "2026-11-01 00:00:00", data_hora_fim: "2026-11-30 23:59:59", tipo_desconto: "percentual", desconto: "10.00", vezes_utilizado: 3 }] } }),
    rota("GET", "/dinamicas/area", { json: { success: true, data: [{ id: "2", nome: "Centro", fator: 1.3, tipo_calculo: "Fator multiplicador", ativo: true, tipo: "No embarque" }] } }),
    rota("GET", "/condutores/historico-punicoes", { json: { success: true, data: [{ id: 4, condutor: { id: 5, nome: "Ana" }, data_hora: "2026-11-08 09:00:00", motivo: "Recusas", origem: "A", impedido_ate: "2026-11-08 10:00:00", situacao: "E" }] } }),
    rota("GET", "/configuracoes/areas-geograficas", { json: { success: true, data: [{ id: "1", nome: "Leste" }] } }),
  );
  const m = criarMotor(EMPRESA, { fetch: f.fetch });
  const pas = await m.passageiros("sistema-a", { busca: "(19) 99999-0000" });
  assert.equal(f.pedidos[0].url.searchParams.get("telefone"), "19999990000");
  assert.deepEqual([pas.itens[0].id, pas.itens[0].ativo, pas.itens[0].corridasFinalizadas], ["sistema-a:1", true, 12]);
  assert.deepEqual((await m.conveniadas("sistema-a")).itens.map((e) => [e.nome, e.ativa, e.categorias]), [["Empresa X", true, ["Comum"]]]);
  const ext = await m.extrato("sistema-a", { de: "2026-11-01T03:00:00Z", ate: "2026-11-08T12:00:00Z" });
  const pedidoExtrato = f.pedidos.find((p) => p.url.pathname.endsWith("/financeiro/extrato"))!;
  assert.equal(pedidoExtrato.url.searchParams.get("data_ini"), "2026-11-01");
  assert.deepEqual([ext.itens[0].valor, ext.itens[0].operacao, ext.itens[0].pessoa?.nome], [-2.5, "Taxa da central", "Ana"]);
  const cup = await m.cupons("sistema-a");
  assert.deepEqual([cup.itens[0].codigo, cup.itens[0].ativo, cup.itens[0].desconto, cup.itens[0].tipoDesconto], ["BEMVINDO", true, 10, "percentual"]);
  const din = await m.dinamicas("sistema-a");
  assert.deepEqual([din.itens[0].fator, din.itens[0].ativa], [1.3, true]);
  const pun = await m.punicoes("sistema-a");
  assert.deepEqual([pun.itens[0].situacao, pun.itens[0].automatica, pun.itens[0].motorista.id], ["ativa", true, "sistema-a:5"]);
  assert.equal((await m.areas("sistema-a")).itens[0].nome, "Leste");
});

test("Sistema A: carteiras e veículos não existem na API e isso vem explícito", async () => {
  const m = criarMotor(EMPRESA, { fetch: fetchFalso().fetch });
  await assert.rejects(m.carteiras("sistema-a"), (e: MotorErro) => e.codigo === "NAO_SUPORTADO" && /saldo/.test(e.message));
  await assert.rejects(m.veiculos("sistema-a"), (e: MotorErro) => e.codigo === "NAO_SUPORTADO");
});

// ------------------------------------------------------------ Sistema B

test("Sistema B estimativa: api_calcular_painel.php com coordenadas e cidade", async () => {
  const f = fetchFalso(
    rota("POST", "/api_calcular_painel.php", { json: { status: "sucesso", distancia_km: 5.1, duracao_minutos: 11, categorias_com_preco: [{ id: 69, nome: "Barato", preco_estimado: "14.90", dinamica_ativa: false }, { id: 70, nome: "Conforto", preco_estimado: "19.90", dinamica_ativa: true }] } }),
  );
  const r = await criarMotor(EMPRESA, { fetch: f.fetch }).estimarCorrida("sistema-b", { ...P, categoriaId: "sistema-b:70" });
  const form = new URLSearchParams(f.pedidos[0].corpo);
  assert.deepEqual([form.get("cidade_id"), form.get("origem_lat"), form.get("destino_lng")], ["1", "-22.1", "-47.4"]);
  assert.deepEqual(r.itens.map((e) => [e.categoriaId, e.valor, e.dinamica?.ativa, e.distanciaKm, e.origem]), [["sistema-b:70", 19.9, true, 5.1, "sistema-b"]]);
});

test("Sistema B programadas: tira os números do HTML e lê o detalhe de cada uma", async () => {
  const f = fetchFalso(
    rota("POST", "/consultar_programadas.php", { json: { html: '<div onclick="abrirSidebar(31)"></div><div onclick="abrirSidebar(32)"></div><b onclick="abrirSidebar(31)"></b>', total_pags: 1 } }),
    (p) => {
      if (!p.url.pathname.endsWith("consultar_programadas.php") || p.url.searchParams.get("acao") !== "detalhes") return undefined;
      const id = p.url.searchParams.get("id");
      return { json: { success: true, data: { id, st_ui: { label: "Agendada" }, status: "0", data_agendamento_fmt: "09/11/2026 08:00", nome_pax: `Pax ${id}`, endereco_origem: "Rua A", endereco_destino: "Rua B", metodo_pagamento: "Pix", valor_fmt: "R$ 15,00" } } };
    },
  );
  const r = await criarMotor(EMPRESA, { fetch: f.fetch }).programadas("sistema-b");
  assert.deepEqual(r.itens.map((p) => [p.id, p.agendadaPara, p.valorEstimado, p.pagamento]), [
    ["sistema-b:31", "2026-11-09T08:00:00-03:00", 15, "Pix"],
    ["sistema-b:32", "2026-11-09T08:00:00-03:00", 15, "Pix"],
  ]);
  assert.equal(r.temMais, false);
});

test("Sistema B raio-x: linha do tempo e ofertas aos motoristas", async () => {
  const f = fetchFalso(
    rota("GET", /acao=buscar_historico&id=7/, {
      json: {
        success: true,
        timeline: [{ data_fmt: "08/11/2026", hora: "10:00:00", descricao: "Corrida criada" }],
        ofertas: [
          { nome: "Ana", veiculo: { placa: "AAA0A00" }, distancia_metros: 850, etapa_envio: "1", ganhou: 0, rejeitou: 1 },
          { nome: "Bia", distancia_metros: 1200, etapa_envio: "2", ganhou: 1 },
        ],
      },
    }),
    rota("GET", /acao=buscar_chat&id=7/, { json: { success: true, data: [{ remetente_tipo: "passageiro", conteudo: "Oi" }, { remetente_tipo: "motorista", is_audio: 1, url_media: "https://exemplo.invalid/a.mp3" }] } }),
    rota("GET", /acao=rastrear&id=7/, { json: { success: true, data: { mot_lat: "-21.7", mot_lng: "-52.4", motorista_id: "77" } } }),
  );
  const m = criarMotor(EMPRESA, { fetch: f.fetch });
  const lt = await m.linhaDoTempo("sistema-b:7");
  assert.deepEqual(lt.eventos, [{ em: "2026-11-08T10:00:00-03:00", texto: "Corrida criada" }]);
  assert.deepEqual(lt.ofertas.map((o) => [o.motorista, o.resultado, o.distanciaKm, o.placa]), [["Ana", "recusou", 0.85, "AAA0A00"], ["Bia", "aceitou", 1.2, undefined]]);
  const chat = await m.mensagensCorrida("sistema-b:7");
  assert.deepEqual(chat.map((c) => [c.de, c.texto]), [["passageiro", "Oi"], ["motorista", "[áudio]"]]);
  assert.equal((await m.rastrearCorrida("sistema-b:7")).motoristaId, "sistema-b:77");
});

test("Sistema B cadastros: passageiros, carteiras, cupons, dinâmicas, punições, veículos", async () => {
  const f = fetchFalso(
    rota("GET", "/api_clientes.php", { json: { success: true, data: [{ id: 1, nome: "Maria", telefone: "(67) 99999-0000", ativo: 1, nota: "4.9", origem_cadastro: "app" }], paginacao: { atual: 1, total_paginas: 1 } } }),
    rota("POST", "/api_carteira.php", { json: { dados: [{ id: 77, nome: "Ana", telefone: "6799", saldo_atual: "12.50" }] } }),
    rota("GET", "/api_cupons.php", { json: { success: true, data: [{ id: 3, codigo: "PROMO", tipo_desconto: "porcentagem", valor: "15", ativo: 1, usos_reais: 4, limite_usos_total: 100 }], kpis: {} } }),
    rota("GET", "/api_dinamicas.php", {
      json: { success: true, mapa: [{ id: 1, nome: "Centro", ativa: 1, tipo_cobranca: "fixo", adicional: "2.00", cidade_id: 1 }, { id: 2, nome: "Outra cidade", ativa: 1, cidade_id: 9 }], horarios: [{ id: 5, nome: "Madrugada", ativa: 0, tipo_cobranca: "multiplicador", adicional: "1.2", cidade_id: 1 }], demanda: [] },
    }),
    rota("GET", "/api_punicoes.php", { json: { success: true, data: [{ id: 9, nome: "Ana", email: "a@exemplo.invalid", motivo_bloqueio: "Cancelou muito", data_fim_formatada: "09/11/2026 10:00" }], paginacao: { total_paginas: 1 } } }),
    rota("GET", "/api_veiculos.php", { json: { success: true, data: [{ id: 4, placa: "ABC1D23", modelo: "Gol", ano: "2020", cor: "Prata", selecionado: 1, motorista_nome: "Ana", motorista_id: 77 }], paginacao: { total_paginas: 3 } } }),
  );
  const m = criarMotor(EMPRESA, { fetch: f.fetch });
  const pas = await m.passageiros("sistema-b", { busca: "Maria" });
  assert.deepEqual([pas.itens[0].id, pas.itens[0].avaliacao, pas.itens[0].origem], ["sistema-b:1", 4.9, "sistema-b"]);
  assert.equal((await m.carteiras("sistema-b")).itens[0].saldo, 12.5);
  const cup = (await m.cupons("sistema-b")).itens[0];
  assert.deepEqual([cup.codigo, cup.tipoDesconto, cup.desconto, cup.usos], ["PROMO", "percentual", 15, 4]);
  const din = await m.dinamicas("sistema-b");
  assert.deepEqual(din.itens.map((d) => [d.nome, d.tipo, d.adicional, d.fator, d.ativa]), [["Centro", "área", 2, undefined, true], ["Madrugada", "horário", undefined, 1.2, false]]);
  assert.equal((await m.punicoes("sistema-b")).itens[0].ate, "2026-11-09T10:00:00-03:00");
  const vei = await m.veiculos("sistema-b", { busca: "ABC1D23" });
  assert.equal(f.pedidos.find((p) => p.url.pathname.endsWith("api_veiculos.php"))!.url.searchParams.get("placa"), "ABC1D23");
  assert.deepEqual([vei.itens[0].emUso, vei.itens[0].motorista?.id, vei.temMais], [true, "sistema-b:77", true]);
});

test("Sistema B carteira com erro do painel ({erro:true}) vira erro do motor", async () => {
  const f = fetchFalso(rota("POST", "/api_carteira.php", { json: { erro: true, msg: "Cidade inválida" } }));
  await assert.rejects(criarMotor(EMPRESA, { fetch: f.fetch }).carteiras("sistema-b"), (e: MotorErro) => e.codigo === "DADOS_INVALIDOS" && /Cidade/.test(e.message));
});

// ------------------------------------------------------------ juntando os dois

test("todas: pula quem não tem a função (aviso NAO_SUPORTADO com motivo) e junta o resto", async () => {
  const f = fetchFalso(
    rota("GET", "/condutores/posicoes", { json: { success: true, data: { condutores: [{ id: 5, nome: "Ana", lat: -22.1, lng: -47.3 }] } } }),
    rota("GET", "/api_veiculos.php", { json: { success: true, data: [{ id: 4, placa: "ABC1D23" }] } }),
  );
  const m = criarMotor(EMPRESA, { fetch: f.fetch });
  const pos = await m.posicoesMotoristas("todas");
  assert.equal(pos.itens.length, 1);
  assert.deepEqual(pos.avisos?.map((a) => [a.integracaoId, a.codigo]), [["sistema-b", "NAO_SUPORTADO"]]);
  const vei = await m.veiculos("todas");
  assert.deepEqual(vei.itens.map((v) => v.id), ["sistema-b:4"]);
  assert.equal(vei.avisos?.[0].integracaoId, "sistema-a");
  // Nenhum dos dois tem: erro explícito.
  await assert.rejects(criarMotor({ id: "x", integracoes: [EMPRESA.integracoes[1]] }).conveniadas("todas"), (e: MotorErro) => e.codigo === "NAO_SUPORTADO");
});
