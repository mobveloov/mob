// Testes do painel. Rodar: npm test (na pasta painel). Nenhuma chamada real à internet: a IA é simulada.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

// Dados de teste numa pasta temporária (antes de carregar o servidor).
const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-teste-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "x".repeat(40);
/** Marcas de terceiros que nunca podem aparecer no que a empresa vê (montadas por partes para não ficarem escritas no código). */
const MARCAS = new RegExp([["mac", "hine"], ["8", "8 ?pop"], ["velo", "ov"], ["up ", "corridas"]].map((p) => p.join("")).join("|"), "i");
for (const k of ["ANTHROPIC_API_KEY", "GROQ_API_KEYS", "GROQ_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY"]) delete process.env[k];

const { corridasDoCsv } = await import("../src/servidor/fontes/arquivo.ts");
const { aplicarFiltro } = await import("../src/servidor/filtro.ts");
const { dataBr } = await import("../src/servidor/util.ts");
const { calcular } = await import("../src/analise/estatisticas.ts");
const { analisarComIa, protegerValores } = await import("../src/analise/analise.ts");
const { relatorioHtml } = await import("../src/analise/html.ts");
const { gerarJson, rotas } = await import("../src/ia/roteador.ts");
const { sanearMarca, MARCA_PADRAO } = await import("../src/comum/marca.ts");
const { corridaDoMotor, credenciaisV2, pendenciasDoMotor } = await import("../src/servidor/fontes/motor.ts");
const { app } = await import("../src/servidor/index.ts");

const CAB = "Nº OS;Status;Momento da solicitação;Categoria;Nome do passageiro;Telefone do passageiro;Local de embarque;Cidade;Forma de pagamento;Estimativa de distância da corrida (KM);Motorista;Valor da corrida;Cancelada por;Motivo do cancelamento";
const LINHAS = [
  "1001;Finalizada;04/11/2026 10:43:12;Econômico;Maria;(11) 90000-0001;Rua A, 10;Cidade Norte;Dinheiro;3,5;João;20,00;;",
  "1002;Cancelada;04/11/2026 18:10:00;Moto;José;(11) 90000-0002;Rua C, 5;Cidade Norte;Pix;2,0;;;Passageiro;Demora do motorista",
  "1003;Não atendida;05/11/2026 07:00:00;Econômico;Ana;(11) 90000-0003;Rua D, 1;Vila Leste;Pix;5,0;;;;",
  "1004;Finalizada;05/11/2026 08:00:00;Econômico;Maria;(11) 90000-0001;Rua A, 10;Cidade Norte;Pix;4,0;João;22,50;;",
];
const csv = () => new Uint8Array(Buffer.from([CAB, ...LINHAS].join("\r\n"), "latin1"));
const corridas = () => { const r = corridasDoCsv(csv()); if (!r.ok) throw new Error(r.erro); return r.corridas; };

test("planilha CSV em Latin-1 vira corridas no horário de Brasília", () => {
  const c = corridas();
  assert.equal(c.length, 4);
  assert.equal(c[0].grupo, "finalizada");
  assert.equal(c[0].valor, 20);
  assert.equal(c[0].categoria, "Econômico");
  assert.equal(c[0].solicitadaEm, "2026-11-04T10:43:12.000Z");
  assert.equal(c[1].motivoCancelamento, "Demora do motorista");
  assert.equal(c[2].grupo, "nao_atendida");
  assert.equal(corridasDoCsv(new Uint8Array(Buffer.from("a;b\n1;2"))).ok, false);
});

test("filtro por dia, status, cidade, busca e últimas horas", () => {
  const agora = new Date("2026-11-05T12:00:00Z");
  const c = corridas();
  assert.equal(aplicarFiltro(c, { inicio: "2026-11-04", fim: "2026-11-04" }, agora).length, 2);
  assert.equal(aplicarFiltro(c, { inicio: "2026-11-01", fim: "2026-11-05", grupo: "cancelada" }, agora).length, 1);
  assert.equal(aplicarFiltro(c, { inicio: "2026-11-01", fim: "2026-11-05", cidade: "vila leste" }, agora).length, 1);
  assert.equal(aplicarFiltro(c, { inicio: "2026-11-01", fim: "2026-11-05", busca: "90000-0002" }, agora)[0].os, "1002");
  assert.equal(aplicarFiltro(c, { ultimasHoras: 6 }, agora).length, 2);
});

test("datas: texto BR, ISO sem fuso e ISO com fuso", () => {
  assert.equal(dataBr("04/11/2026 10:43"), "2026-11-04T10:43:00.000Z");
  assert.equal(dataBr("2026-11-04 10:43:00"), "2026-11-04T10:43:00.000Z");
  assert.equal(dataBr("2026-11-04T13:43:00Z"), "2026-11-04T10:43:00.000Z");
  assert.equal(dataBr("2026-11-04T10:43:00-03:00"), "2026-11-04T10:43:00.000Z");
});

test("corrida do motor vira corrida do painel com origem neutra", () => {
  const c = corridaDoMotor({ idOriginal: "55", grupo: "finalizada", statusTexto: "Finalizada", solicitadaEm: "2026-11-04T12:30:00Z", passageiro: { nome: "Paula" }, partida: { texto: "Rua X", cidade: "Norte" }, pagamento: "pix", valor: 18.5, valorSemDesconto: 20, canal: "macaneta", distanciaMotoristaKm: 2.4, cupom: "BEMVINDO", avaliacao: { nota: 5 }, dinamica: { ativa: true, fator: 1.3 } }, "sistema-a", "Sistema A");
  assert.equal(c.distanciaMotoristaKm, 2.4);
  assert.equal(c.cupom, "BEMVINDO");
  assert.equal(c.avaliacao, 5);
  assert.equal(c.fatorDinamico, 1.3);
  assert.equal(c.id, "sistema-a:55");
  assert.equal(c.origemNome, "Sistema A");
  assert.equal(c.solicitadaEm, "2026-11-04T09:30:00.000Z");
  assert.equal(c.pagamento, "Pix");
  assert.equal(c.desconto, 1.5);
  assert.equal(c.canal, "Ponto fixo");
});

test("credenciais do painel viram as do contrato v2 do motor", async () => {
  assert.deepEqual(credenciaisV2("sistema-a", { chaveApi: "k", usuario: "u", senha: "s", motivoCancelamento: "7" }), { apiKey: "k", usuario: "u", senha: "s", apiUrl: undefined, motivoCancelamentoId: 7 });
  assert.deepEqual(credenciaisV2("sistema-b", { cookie: "PHPSESSID=x" }), { cookie: "PHPSESSID=x", cidadeId: undefined, painelUrl: undefined, appApiUrl: undefined });
  // o motor de verdade (pasta motor/) responde o que falta, sem chamar a internet
  const falta = await pendenciasDoMotor("sistema-a", {});
  assert.ok(falta.length > 0);
  assert.deepEqual(await pendenciasDoMotor("sistema-a", { chaveApi: "k", usuario: "u", senha: "s", urlApi: "https://exemplo.test/api/v2/integracao" }), []);
});

test("números do relatório", () => {
  const e = calcular(corridas());
  assert.equal(e.total, 4);
  assert.equal(e.status.finalizadas, 2);
  assert.equal(e.status.taxaCancelamento, 25);
  assert.equal(e.valor.soma, 42.5);
  assert.equal(e.cancelamento.porDemora, 1);
  assert.equal(e.passageiros.recorrentes, 1);
  assert.ok(e.semDados.includes("avaliações"));
  assert.ok(e.alertas.length > 0);
});

test("protege contra valor em reais inventado", () => {
  const fatos = { valor: 20, outro: 22.5 };
  assert.equal(protegerValores("Ticket de R$ 20,00 e bônus de R$ 50,00", fatos), "Ticket de R$ 20,00 e bônus de valor a definir pela gestão");
});

test("marca: campo inválido volta ao padrão e não aceita HTML", () => {
  const m = sanearMarca({ produto: "<b>Rota</b> Fácil", cores: { primaria: "vermelho", secundaria: "#112233" }, app: { pacote: "Com.Errado" } });
  assert.equal(m.produto, "bRota/b Fácil");
  assert.equal(m.cores.primaria, MARCA_PADRAO.cores.primaria);
  assert.equal(m.cores.secundaria, "#112233");
  assert.equal(m.app.pacote, "");
});

// ---------------------------------------------------------------- IA (simulada)

function respostaClaude(texto: string) {
  return new Response(JSON.stringify({ id: "msg_1", type: "message", role: "assistant", model: "claude-sonnet-5-5", content: [{ type: "text", text: texto }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } }), { status: 200, headers: { "content-type": "application/json" } });
}

test("roteador: relatório usa Claude Sonnet 5.5 primeiro e cai no plano B se falhar", async () => {
  assert.deepEqual(rotas("relatorio", {})[0], { provedor: "anthropic", modelo: "claude-sonnet-5-5" });
  assert.equal(rotas("chat", {})[0].provedor, "groq");
  const chamadas: string[] = [];
  const f = (async (url: string | URL | Request) => {
    const u = String(url instanceof Request ? url.url : url);
    chamadas.push(u);
    if (u.includes("anthropic.com")) return new Response(JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "x" } }), { status: 529 });
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 });
  }) as typeof fetch;
  const r = await gerarJson({ caso: "relatorio", sistema: "s", usuario: "u", maxTokens: 100, chavesEmpresa: { ANTHROPIC_API_KEY: "a", GROQ_API_KEYS: "g" }, fetch: f, env: {} });
  assert.equal(r.provedor, "groq");
  assert.ok(chamadas.some((c) => c.includes("anthropic.com")));
  await assert.rejects(gerarJson({ caso: "chat", sistema: "s", usuario: "u", maxTokens: 10, chavesEmpresa: {}, env: {} }), /Nenhuma chave/);
});

test("exportar: a consulta vai sozinha para a IA e o relatório sai com a análise e o nome do assistente", async () => {
  const e = calcular(corridas());
  const marca = sanearMarca({ produto: "Painel Teste", nomeExibido: "Central Teste", assistente: { nome: "Lia", tom: "direto" } });
  let recebeuNumeros = false;
  const f = (async (_url: string | URL | Request, init?: RequestInit) => {
    const corpo = JSON.parse(String(init?.body));
    const sistema = String(corpo.system);
    recebeuNumeros ||= String(corpo.messages[0].content).includes('"total":4');
    assert.ok(sistema.includes("Lia") && sistema.includes("Central Teste"));
    assert.ok(!MARCAS.test(sistema), "prompt sem marca de terceiros");
    return respostaClaude(sistema.includes("PLANO DE AÇÃO")
      ? JSON.stringify({ plano: { titulo: "Plano teste", diagnostico: "d", acoesImediatas: [{ titulo: "Ligar para motoristas", nivel: "critico" }], checklist: ["Aprovar"] } })
      : JSON.stringify({ titulo: "Relatório teste", resumo: [{ destaque: "ANALISE-DA-IA", texto: "Metade finalizou." }], alertas: [], secoes: { cancelamentos: "Um cancelamento por demora." } }));
  }) as typeof fetch;
  const a = await analisarComIa(e, marca, { ANTHROPIC_API_KEY: "teste" }, { fetch: f, env: {} });
  assert.ok(recebeuNumeros);
  assert.equal(a.aviso, null);
  assert.deepEqual(a.modelos, ["anthropic:claude-sonnet-5-5"]);
  const html = relatorioHtml(e, a, { marca, logo: null, geradoEm: new Date(), filtroTexto: "teste" });
  assert.ok(html.includes("ANALISE-DA-IA") && html.includes("Lia") && html.includes("Painel Teste"));
  assert.ok(!MARCAS.test(html), "relatório sem marca de terceiros");
});

test("sem chave de IA o relatório sai com os números e um aviso", async () => {
  const e = calcular(corridas());
  const a = await analisarComIa(e, MARCA_PADRAO, {}, { env: {} });
  assert.equal(a.textos, null);
  assert.match(a.aviso ?? "", /sem chave/);
  assert.ok(relatorioHtml(e, a, { marca: MARCA_PADRAO, logo: null, geradoEm: new Date(), filtroTexto: "" }).includes("<html"));
});

// ---------------------------------------------------------------- servidor: login e isolamento entre empresas

test("isolamento: uma empresa não vê a marca, as integrações nem as corridas da outra", async () => {
  const srv = app.listen(0);
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  const pedir = async (p: string, init: RequestInit = {}, cookie = "") => {
    const r = await fetch(base + p, { ...init, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...(init.headers as Record<string, string>) } });
    return { status: r.status, corpo: await r.json().catch(() => ({})), cookie: (r.headers.get("set-cookie") ?? "").split(";")[0] };
  };
  try {
    assert.equal((await pedir("/api/sessao")).status, 401);
    const conf = await pedir("/api/configurar", { method: "POST", body: JSON.stringify({ empresa: "Empresa Um", nome: "Dona", email: "dona@um.test", senha: "senha-forte-1" }) });
    assert.equal(conf.status, 200);
    const dona = conf.cookie;
    assert.equal((await pedir("/api/configurar", { method: "POST", body: JSON.stringify({ empresa: "X", nome: "X", email: "x@x.test", senha: "senha-forte-1" }) })).status, 409);
    const nova = await pedir("/api/empresas", { method: "POST", body: JSON.stringify({ nome: "Empresa Dois", adminNome: "Admin", adminEmail: "admin@dois.test", adminSenha: "senha-forte-2" }) }, dona);
    assert.equal(nova.status, 200);
    const idDois = nova.corpo.empresa.id as string;

    const login = await pedir("/api/entrar", { method: "POST", body: JSON.stringify({ email: "admin@dois.test", senha: "senha-forte-2" }) });
    assert.equal(login.status, 200);
    const admDois = login.cookie;
    assert.equal((await pedir("/api/entrar", { method: "POST", body: JSON.stringify({ email: "admin@dois.test", senha: "errada" }) })).status, 401);

    // admin da empresa 2 muda a marca dela
    await pedir("/api/marca", { method: "PUT", body: JSON.stringify({ ...MARCA_PADRAO, produto: "Painel Dois" }) }, admDois);
    const sDois = await pedir("/api/sessao", {}, admDois);
    assert.equal(sDois.corpo.empresa.id, idDois);
    assert.equal(sDois.corpo.marca.produto, "Painel Dois");
    assert.equal(sDois.corpo.empresas, undefined, "admin comum não vê a lista de empresas");

    // tentar ler a empresa 1 pelo cabeçalho não funciona para quem não é da plataforma
    const sessaoDona = await pedir("/api/sessao", {}, dona);
    const idUm = sessaoDona.corpo.empresa.id as string;
    const invasao = await pedir("/api/marca", { headers: { "X-Empresa": idUm } }, admDois);
    assert.equal(invasao.corpo.empresaId, idDois);
    assert.notEqual(invasao.corpo.marca.produto, sessaoDona.corpo.marca.produto);

    // credenciais nunca voltam
    await pedir("/api/integracoes", { method: "POST", body: JSON.stringify({ tipo: "sistema-a" }) }, admDois);
    const ints = await pedir("/api/integracoes", {}, admDois);
    const sistemaA = ints.corpo.integracoes.find((i: { tipo: string }) => i.tipo === "sistema-a");
    assert.equal(sistemaA.nome, "Sistema A", "nome padrão neutro");
    await pedir(`/api/integracoes/${sistemaA.id}`, { method: "PUT", body: JSON.stringify({ credenciais: { chaveApi: "segredo-123", usuario: "u" } }) }, admDois);
    const depois = await pedir("/api/integracoes", {}, admDois);
    const txt = JSON.stringify(depois.corpo);
    assert.ok(!txt.includes("segredo-123"));
    assert.equal(depois.corpo.integracoes.find((i: { id: string }) => i.id === sistemaA.id).valores.chaveApi, "••••••");

    // a dona (plataforma) pode escolher a empresa 2
    const comoDois = await pedir("/api/marca", { headers: { "X-Empresa": idDois } }, dona);
    assert.equal(comoDois.corpo.marca.produto, "Painel Dois");

    // corridas de exemplo aparecem com origem neutra
    const c = await pedir("/api/corridas?ultimasHoras=48", {}, admDois);
    assert.ok(c.corpo.total > 0);
    assert.equal(c.corpo.corridas[0].origemNome, "Dados de exemplo");
  } finally {
    srv.closeAllConnections();
    srv.close();
    (await import("../src/servidor/banco.ts")).fecharBanco(); // no Windows, arquivo aberto não apaga
    fs.rmSync(DADOS, { recursive: true, force: true });
  }
});
