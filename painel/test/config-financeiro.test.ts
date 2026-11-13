// Config, Financeiro, Comunicação, Avaliações e Ajuda: comissão da central, configurações por empresa, tarifas dinâmicas no preço,
// regras de despacho, NPS, carteiras, saques, notificações e conversas.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-config-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "c".repeat(40);
delete process.env.BANCO_ARQUIVO;
delete process.env.OSRM_URL;

const express = (await import("express")).default;
const D = await import("../src/servidor/dados.ts");
const { criarCookie, exigirLogin } = await import("../src/servidor/sessao.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar, atualizar } = await import("../src/cadastros/armazem.ts");
const B = await import("../src/servidor/banco.ts");
const { calcularComissao } = await import("../src/config/comissao.ts");
const { salvarCategoria, categoriasCompletas } = await import("../src/config/categorias.ts");
const { salvarDinamica, aplicarDinamica, dentroDoPoligono } = await import("../src/config/dinamica.ts");
const { estimarPreco } = await import("../src/corridas/index.ts");
const { configDosApps, tiposDeDocumento } = await import("../src/config/apps.ts");
const { salvarGerais, gerais } = await import("../src/config/gerais.ts");
const { regrasDespacho, salvarDespacho } = await import("../src/config/despacho.ts");
const { registrarNps, resumoNps, resetarRecusas, deveAvaliar, salvarConfigNps } = await import("../src/config/avaliacoes.ts");
const { salvarRegraComissao } = await import("../src/config/credito.ts");
const { descontoAutomatico, salvarDesconto } = await import("../src/config/descontos.ts");
const { lancar } = await import("../src/apps/extras.ts");
const { rotasConfig } = await import("../src/config/rotas.ts");

const app = express();
app.use(express.json());
app.post("/teste/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({ ok: true }); });
app.use("/api", exigirLogin);
app.use("/api/config", rotasConfig);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => { servidor.closeAllConnections(); servidor.close(); B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

const E = D.criarEmpresa("Config Um").id, E2 = D.criarEmpresa("Config Dois").id;
const adm = D.criarUsuario({ email: "adm@config.test", nome: "Adm", senha: "senha-forte-1", empresaId: E, papel: "admin" });
const op = D.criarUsuario({ email: "op@config.test", nome: "Op", senha: "senha-forte-1", empresaId: E, papel: "operador" });

async function entrar(id: string) {
  const r = await fetch(`${base}/teste/entrar/${id}`, { method: "POST" });
  return (r.headers.get("set-cookie") ?? "").split(";")[0];
}
const cookieAdm = await entrar(adm.id), cookieOp = await entrar(op.id);
async function api(cookie: string, metodo: string, url: string, corpo?: unknown) {
  const r = await fetch(`${base}/api/config${url}`, { method: metodo, headers: { cookie, "content-type": "application/json" }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  return { status: r.status, corpo: (await r.json().catch(() => ({}))) as Record<string, any> };
}

const CAT = cadastroPorId("categorias")!, MOT = cadastroPorId("motoristas")!;

test("comissão: percentual, valor fixo, nunca maior que o bruto e centavos arredondados", () => {
  salvarCategoria(E, null, { nome: "Pop", taxaBase: 5, precoKm: 2, tarifaMinima: 8, comissaoTipo: "Percentual", comissaoValor: 12.5 }, "t");
  salvarCategoria(E, null, { nome: "Moto", taxaBase: 3, precoKm: 1, comissaoTipo: "Valor fixo", comissaoValor: 2 }, "t");
  const p = calcularComissao(E, "Pop", 20);
  assert.deepEqual(p, { valorBruto: 20, taxaCentral: 2.5, valorLiquido: 17.5 });
  const f = calcularComissao(E, "Moto", 15);
  assert.deepEqual(f, { valorBruto: 15, taxaCentral: 2, valorLiquido: 13 });
  assert.equal(calcularComissao(E, "Moto", 1.5).taxaCentral, 1.5, "fixo nunca passa do bruto");
  assert.equal(calcularComissao(E, "Moto", 1.5).valorLiquido, 0);
  // arredondamento em centavos: 12,5% de 13,37 = 1,67125
  const a = calcularComissao(E, "Pop", 13.37);
  assert.equal(a.taxaCentral, 1.67);
  assert.equal(a.valorLiquido, 11.7);
  assert.equal(Math.round((a.taxaCentral + a.valorLiquido) * 100), 1337);
  assert.deepEqual(calcularComissao(E, "Categoria que não existe", 10), { valorBruto: 10, taxaCentral: 0, valorLiquido: 10 });
  assert.deepEqual(calcularComissao(E, "Pop", 0), { valorBruto: 0, taxaCentral: 0, valorLiquido: 0 });
  assert.equal(calcularComissao(E2, "Pop", 20).taxaCentral, 0, "outra empresa não vê a categoria");
});

test("comissão: motorista Isento vale 0 e Personalizado vale no lugar da categoria", async () => {
  const livre = criar(E, MOT, { nome: "Isento Silva", telefone: "11980000001", status: "Ativo" }, "t");
  const meu = criar(E, MOT, { nome: "Personal Souza", telefone: "11980000002", status: "Ativo" }, "t");
  // os campos de cobrança são da frente Cadastro: gravo direto no registro para simular
  const arq = path.join(DADOS, "empresas", E);
  assert.ok(fs.existsSync(arq));
  for (const [id, campos] of [[livre.id, { cobranca: "Isento" }], [meu.id, { cobranca: "Personalizado", cobrancaTipo: "Valor fixo", cobrancaValor: 3.333 }]] as const) {
    try { atualizar(E, MOT, id, campos, "t"); } catch { /* campo ainda não existe no cadastro: grava no arquivo */ }
  }
  const caminho = fs.readdirSync(path.join(arq), { recursive: true }).map(String).find((f) => /motoristas.*\.json$/.test(f));
  assert.ok(caminho, "arquivo do cadastro de motoristas");
  const arquivo = path.join(arq, caminho!);
  const lista = JSON.parse(fs.readFileSync(arquivo, "utf8")) as Array<Record<string, unknown>>;
  for (const r of lista) {
    if (r.id === livre.id) r.cobranca = "Isento";
    if (r.id === meu.id) Object.assign(r, { cobranca: "Personalizado", cobrancaTipo: "Valor fixo", cobrancaValor: 3.333 });
  }
  (await import("../src/servidor/jsoncache.ts")).gravarJson(arquivo, lista);
  assert.equal(calcularComissao(E, "Pop", 20, livre.id).taxaCentral, 0);
  assert.deepEqual(calcularComissao(E, "Pop", 20, meu.id), { valorBruto: 20, taxaCentral: 3.33, valorLiquido: 16.67 });
  assert.equal(calcularComissao(E, "Pop", 20).taxaCentral, 2.5, "sem motorista vale a categoria");
});

test("comissão por faixa de valor (Regras de Crédito)", () => {
  const regras = salvarRegraComissao(E, { nome: "Faixa baixa", categoria: "Pop", de: 0, ate: 10, tipo: "fixo", valor: 1 }).regras;
  salvarRegraComissao(E, { nome: "Faixa alta", categoria: "Pop", de: 10.01, ate: 100, tipo: "percentual", valor: 20 });
  const reg = categoriasCompletas(E).find((c) => c.nome === "Pop")!;
  salvarCategoria(E, reg.id, { nome: "Pop", taxaBase: 5, precoKm: 2, tarifaMinima: 8, comissaoTipo: "Percentual", comissaoValor: 12.5, extra: { comissao: { usaFaixas: true, regras: [] } } }, "t");
  assert.equal(calcularComissao(E, "Pop", 8).taxaCentral, 1);
  assert.equal(calcularComissao(E, "Pop", 50).taxaCentral, 10);
  assert.ok(regras.length >= 1);
  salvarCategoria(E, reg.id, { nome: "Pop", taxaBase: 5, precoKm: 2, tarifaMinima: 8, comissaoTipo: "Percentual", comissaoValor: 12.5, extra: { comissao: { usaFaixas: false, regras: [] } } }, "t");
});

test("tarifa dinâmica ligada à categoria entra no preço (horário e área)", () => {
  const todos = [0, 1, 2, 3, 4, 5, 6].map((dia) => ({ dia, inicio: "00:00", fim: "23:59" }));
  const h = salvarDinamica(E, { tipo: "horario", nome: "Sempre +10%", cobranca: "percentual", valor: 10, janelas: todos }).find((r) => r.nome === "Sempre +10%")!;
  const area = salvarDinamica(E, { tipo: "mapa", nome: "Zona show", cobranca: "fixo", valor: 4, poligono: [[-23.5, -46.7], [-23.5, -46.6], [-23.6, -46.6], [-23.6, -46.7]] }).find((r) => r.nome === "Zona show")!;
  const pop = categoriasCompletas(E).find((c) => c.nome === "Pop")!;
  const antes = estimarPreco(E, { categoria: "Pop", distanciaKm: 10, minutos: 0 }).valor!;
  salvarCategoria(E, pop.id, { nome: "Pop", taxaBase: 5, precoKm: 2, tarifaMinima: 8, comissaoTipo: "Percentual", comissaoValor: 12.5, extra: { dinamicas: [h.id, area.id] } }, "t");
  const depois = estimarPreco(E, { categoria: "Pop", distanciaKm: 10, minutos: 0 }).valor!;
  assert.equal(depois, Math.round(antes * 110) / 100, "só a regra de horário vale sem embarque");
  const noMapa = estimarPreco(E, { categoria: "Pop", distanciaKm: 10, minutos: 0, embarque: { texto: "x", lat: -23.55, lng: -46.65 } }).valor!;
  assert.equal(Math.round(noMapa * 100), Math.round((antes * 1.1 + 4) * 100));
  assert.equal(aplicarDinamica(E2, { categoria: "Pop", valor: 25 }).valor, 25, "outra empresa não é afetada");
  assert.ok(dentroDoPoligono(1, 1, [[0, 0], [0, 2], [2, 2], [2, 0]]));
  assert.ok(!dentroDoPoligono(5, 5, [[0, 0], [0, 2], [2, 2], [2, 0]]));
  assert.throws(() => salvarDinamica(E, { tipo: "mapa", nome: "Sem área", cobranca: "fixo", valor: 1 }), /Desenhe/);
});

test("Gerais do App: por empresa, valida e alimenta os apps (motivos, documentos, mensagens rápidas)", () => {
  salvarGerais(E, { cancelamento: { passageiro: { motivos: ["Mudei de ideia", "", "", ""] } }, motorista: { mensagensRapidas: ["Já cheguei", ""], documentos: [{ nome: "Antecedentes", alvo: "motorista", validade: true, exigir: true }] }, suporte: { whatsapp: "(67) 98124-4866", linkAjuda: "javascript:alert(1)" } });
  const g = gerais(E);
  assert.equal(g.cancelamento.passageiro.motivos[0], "Mudei de ideia");
  assert.equal(g.suporte.whatsapp, "67981244866");
  assert.equal(g.suporte.linkAjuda, "", "link que não é http é descartado");
  const cfg = configDosApps(E);
  assert.deepEqual(cfg.mensagensRapidas, ["Já cheguei"]);
  assert.ok(Object.values(tiposDeDocumento(E)).includes("Antecedentes"));
  assert.ok(cfg.motivosCancelamento.passageiro.includes("Mudei de ideia"));
  assert.notEqual(gerais(E2).cancelamento.passageiro.motivos[0], "Mudei de ideia", "outra empresa fica com o padrão");
  assert.ok(!JSON.stringify(cfg).toLowerCase().includes("segredo"));
});

test("Regras de Despacho e Descontos: valores conferidos e por empresa", () => {
  const r = salvarDespacho(E, { metodo: "fila_virtual", raioMetros: 3000, tempoTela: 15, limiteMotoristas: 5000 });
  assert.equal(r.metodo, "fila_virtual");
  assert.equal(r.limiteMotoristas, 500, "limite máximo");
  assert.equal(regrasDespacho(E2).metodo, "mais_proximo");
  assert.equal(salvarDespacho(E, { metodo: "xyz" }).metodo, "mais_proximo");
  salvarDesconto(E, { nome: "Pix 10%", tipo: "percentual", valor: 10, teto: 3, pagamento: "Pix" });
  assert.deepEqual(descontoAutomatico(E, { categoria: "Pop", pagamento: "Pix", valor: 100 }), { valor: 3, nome: "Pix 10%" });
  assert.equal(descontoAutomatico(E, { categoria: "Pop", pagamento: "Dinheiro", valor: 100 }), null);
});

test("NPS: configuração, resposta, recusa e resetar recusas", () => {
  salvarConfigNps(E, "passageiro", { aposCorridas: 3, linkLoja: "https://exemplo.test/app" });
  assert.equal(deveAvaliar(E, "passageiro", "11999990001", 2), false);
  assert.equal(deveAvaliar(E, "passageiro", "11999990001", 3), true);
  registrarNps(E, "passageiro", "11999990001", "Ana", "Avaliou", 5);
  registrarNps(E, "passageiro", "11999990002", "Bia", "Avaliou", 3);
  registrarNps(E, "passageiro", "11999990003", "Caio", "Recusou");
  assert.throws(() => registrarNps(E, "passageiro", "11999990004", "Dan", "Avaliou", 9), /nota/);
  const r = resumoNps(E, "passageiro");
  assert.equal(r.votos, 2); assert.equal(r.media, 4); assert.equal(r.recusaram, 1); assert.equal(r.detratores, 1);
  assert.equal(deveAvaliar(E, "passageiro", "11999990003", 10), false, "quem recusou não é perguntado");
  assert.equal(resetarRecusas(E, "passageiro"), 1);
  assert.equal(deveAvaliar(E, "passageiro", "11999990003", 10), true);
  assert.equal(resumoNps(E2, "passageiro").votos, 0);
});

test("rotas: só admin salva; operador lê; outra empresa não enxerga", async () => {
  assert.equal((await api(cookieOp, "GET", "/gerais")).status, 200);
  assert.equal((await api(cookieOp, "PUT", "/gerais", { suporte: { telefone: "1" } })).status, 403);
  assert.equal((await api(cookieAdm, "PUT", "/gerais", { suporte: { telefone: "11 4000-0000" } })).status, 200);
  assert.equal((await api(cookieAdm, "GET", "/gerais")).corpo.suporte.telefone, "11 4000-0000");
  const c = await api(cookieAdm, "POST", "/categorias", { nome: "Executivo", taxaBase: 6, precoKm: 3, comissaoTipo: "Percentual", comissaoValor: 15, extra: { ordem: 2, grupo: "Carro" } });
  assert.equal(c.status, 200);
  assert.equal(c.corpo.categoria.comissaoValor, 15);
  const l = await api(cookieAdm, "GET", "/categorias");
  assert.ok(l.corpo.categorias.some((x: { nome: string }) => x.nome === "Executivo"));
  assert.equal((await api(cookieAdm, "POST", "/categorias", { nome: "x" })).status, 400);
  const d = await api(cookieAdm, "POST", "/dinamicas", { tipo: "demanda", nome: "Chuva", cobranca: "fixo", valor: 2, gatilho: 5 });
  assert.equal(d.corpo.regras.length >= 1, true);
  const pg = await api(cookieAdm, "PUT", "/pagamentos", { credenciais: { mp_access_token: "APP_USR-segredo-123" }, saque: { minimo: 25 } });
  assert.equal(pg.corpo.credenciais.mp_access_token, "••••••", "o segredo nunca volta");
  assert.ok(!JSON.stringify((await api(cookieAdm, "GET", "/pagamentos")).corpo).includes("segredo-123"));
  assert.equal((await api(cookieAdm, "GET", "/pagamentos")).corpo.saque.minimo, 25);
});

test("financeiro: ajuste de carteira, extrato, recargas e saques pelo painel", async () => {
  const m = criar(E, MOT, { nome: "Rita Rodas", telefone: "11980000010", status: "Ativo", cidade: "Jaboticabal - SP" }, "t");
  const aj = await api(cookieAdm, "POST", `/carteiras/motorista/${m.id}/ajuste`, { acao: "adicionar", valor: 50, descricao: "Recarga de teste" });
  assert.equal(aj.corpo.saldo, 50);
  assert.equal((await api(cookieAdm, "POST", `/carteiras/motorista/${m.id}/ajuste`, { acao: "remover", valor: 500 })).status, 400, "não retira mais que o saldo");
  assert.equal((await api(cookieOp, "POST", `/carteiras/motorista/${m.id}/ajuste`, { acao: "adicionar", valor: 1 })).status, 403);
  const lista = await api(cookieAdm, "GET", "/carteiras?papel=motorista&busca=rita");
  assert.equal(lista.corpo.itens[0].saldo, 50);
  assert.equal((await api(cookieAdm, "GET", "/carteiras?papel=motorista&busca=zzz")).corpo.itens.length, 0);
  const det = await api(cookieAdm, "GET", `/carteiras/motorista/${m.id}?periodo=mes`);
  assert.equal(det.corpo.entradas, 50);
  const ex = await api(cookieAdm, "GET", "/extrato?aba=geral&periodo=mes");
  assert.equal(ex.corpo.manual, 50);
  assert.equal(ex.corpo.recargas, 50);
  const rc = await api(cookieAdm, "GET", "/recargas?aba=motorista&periodo=mes");
  assert.equal(rc.corpo.total, 50);
  assert.equal(rc.corpo.itens[0].usuario, "Rita Rodas");
  assert.equal((await api(cookieAdm, "GET", "/recargas?aba=passageiro&periodo=mes")).corpo.total, 0);
  const { pedirSaque } = await import("../src/apps/extras.ts");
  const s = pedirSaque(E, m.id, "Rita Rodas", 20, "rita@pix.test");
  const sq = await api(cookieAdm, "GET", "/saques?periodo=mes");
  assert.equal(sq.corpo.qtdPendentes, 1); assert.equal(sq.corpo.itens[0].cidade, "Jaboticabal - SP");
  assert.equal((await api(cookieAdm, "POST", `/saques/${s.id}/pagar`, {})).corpo.saque.situacao, "Pago");
  assert.equal((await api(cookieAdm, "GET", "/saques?periodo=mes")).corpo.totalPago, 20);
  lancar(E2, "motorista", "outro", 99, "Crédito da central", "x@y.test");
  assert.equal((await api(cookieAdm, "GET", "/extrato?aba=geral&periodo=mes")).corpo.manual, 50, "outra empresa não entra");
  const rel = await api(cookieAdm, "GET", "/relatorios/producao");
  assert.equal(rel.status, 200); assert.equal(rel.corpo.corridas, 0);
});

test("conversas e notificações: mensagens, não lidas, disparo e agendamento", async () => {
  const { receberDaPessoa } = await import("../src/config/comunicacao.ts");
  const { executarAgendamentos } = await import("../src/config/comunicacao.ts");
  receberDaPessoa(E, "passageiro", "11999990001", "Ana", "Preciso de ajuda");
  const c = await api(cookieOp, "GET", "/conversas");
  assert.equal(c.corpo.conversas[0].naoLidas, 1);
  const r = await api(cookieOp, "POST", "/conversas/passageiro/11999990001", { texto: "Oi, Ana!" });
  assert.equal(r.corpo.mensagem.de, "central");
  const m = await api(cookieOp, "GET", "/conversas/passageiro/11999990001");
  assert.equal(m.corpo.mensagens.length, 2);
  assert.equal((await api(cookieOp, "GET", "/conversas")).corpo.conversas[0].naoLidas, 0);
  assert.equal((await api(cookieOp, "GET", "/conversas")).corpo.conversas.length, 1);
  criar(E, cadastroPorId("clientes")!, { nome: "Ana Souza", telefone: "11999990001", status: "Ativo" }, "t");
  const n = await api(cookieOp, "POST", "/notificacoes", { papel: "passageiro", segmento: "todos", titulo: "Promoção", mensagem: "Corra!" });
  assert.equal(n.corpo.destinatarios, 1);
  assert.equal((await api(cookieOp, "POST", "/notificacoes", { papel: "passageiro", segmento: "todos", titulo: "", mensagem: "x" })).status, 400);
  assert.equal((await api(cookieOp, "POST", "/notificacoes", { papel: "motorista", segmento: "com_corridas", titulo: "a", mensagem: "b" })).status, 400, "sem destinatário");
  const h = await api(cookieOp, "GET", "/notificacoes");
  assert.equal(h.corpo.historico.length, 1);
  const ag = await api(cookieOp, "POST", "/notificacoes/agendar", { papel: "passageiro", segmento: "todos", titulo: "Bom dia", mensagem: "Olá {nome}", usarNome: true, regra: "diario", hora: "00:00" });
  assert.equal(ag.corpo.agendamentos.length, 1);
  assert.equal(await executarAgendamentos(E), 1);
  assert.equal(await executarAgendamentos(E), 0, "só uma vez por dia");
  const del = await api(cookieOp, "DELETE", `/notificacoes/agendar/${ag.corpo.agendamentos[0].id}`);
  assert.equal(del.corpo.agendamentos.length, 0);
});

test("termos, ajuda e transbordos", async () => {
  const t = await api(cookieAdm, "PUT", "/termos", { passageiro: "Novo termo do passageiro", motorista: "Termo motorista" });
  assert.equal(t.corpo.versao, 2);
  assert.equal((await api(cookieAdm, "PUT", "/termos", { passageiro: "Novo termo do passageiro" })).corpo.versao, 2, "sem mudança não sobe a versão");
  const a = await api(cookieAdm, "PUT", "/ajuda", { tutoriais: [{ titulo: "Como abrir a maçaneta", origem: "youtube", codigo: "https://www.youtube.com/watch?v=abcDEF12345", descricao: "Passo a passo" }, { titulo: "Sem vídeo", origem: "youtube", codigo: "" }] });
  assert.equal(a.corpo.tutoriais.length, 1);
  assert.equal(a.corpo.tutoriais[0].codigo, "abcDEF12345");
  assert.ok(a.corpo.duvidas.length > 0);
  const tr = await api(cookieAdm, "GET", "/transbordos");
  assert.equal(tr.status, 200); assert.deepEqual(tr.corpo.itens, []);
});
