// Testes do CRM. Rodar: npm test (na pasta painel). Nada sai para a internet: WhatsApp e IA são simulados.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-crm-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "y".repeat(40);
delete process.env.CRM_PERMITIR_URL_LOCAL;
for (const k of ["ANTHROPIC_API_KEY", "GROQ_API_KEYS", "GROQ_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY"]) delete process.env[k];
/** Marcas de terceiros que nunca podem aparecer (montadas por partes para não ficarem escritas no código). */
const MARCAS = new RegExp([["mac", "hine"], ["8", "8 ?pop"], ["velo", "ov"], ["up ", "corridas"]].map((p) => p.join("")).join("|"), "i");

const { default: express } = await import("express");
const { corridaVazia } = await import("../src/comum/corrida.ts");
const D = await import("../src/servidor/dados.ts");
const { criarCookie, exigirLogin } = await import("../src/servidor/sessao.ts");
const { montarContatos, aplicarRegras, destinatarios, sanearRegras, telefoneWhatsApp, limparCachePublico } = await import("../src/crm/publico.ts");
const { montarTexto, variaveisDesconhecidas, escolherVariacao, variacoesComIa } = await import("../src/crm/mensagem.ts");
const { reservar } = await import("../src/crm/ritmo.ts");
const A = await import("../src/crm/armazem.ts");
const E = await import("../src/crm/envio.ts");
const W = await import("../src/crm/whatsapp.ts");
const { router } = await import("../src/crm/rotas.ts");
const Cad = await import("../src/cadastros/armazem.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");

type Corrida = ReturnType<typeof corridaVazia>;
const AGORA = new Date("2026-11-08T12:00:00Z");
const diasAtras = (n: number) => new Date(AGORA.getTime() - n * 86_400_000).toISOString();
let seq = 0;
function corrida(p: Partial<Corrida>): Corrida {
  seq++;
  return { ...corridaVazia({ id: `x:${seq}`, origem: "x", origemNome: "Sistema A", os: String(seq), grupo: "finalizada", statusTexto: "Finalizada" }), ...p };
}
const CORRIDAS = [
  corrida({ passageiro: "Maria Souza", telefonePassageiro: "(11) 91111-1111", cidade: "Cidade Norte", categoria: "Econômico", canal: "App", solicitadaEm: diasAtras(40), valor: 20, motorista: "João", telefoneMotorista: "11 95555-5555" }),
  corrida({ passageiro: "Maria Souza", telefonePassageiro: "11911111111", cidade: "Cidade Norte", categoria: "Moto", canal: "WhatsApp", solicitadaEm: diasAtras(35), valor: 15, motorista: "João", telefoneMotorista: "11 95555-5555" }),
  corrida({ passageiro: "José", telefonePassageiro: "(11) 92222-2222", cidade: "Vila Leste", categoria: "Econômico", canal: "App", solicitadaEm: diasAtras(3), grupo: "cancelada" }),
  corrida({ passageiro: "Ana", telefonePassageiro: "", cidade: "Cidade Norte", categoria: "Executivo", canal: "Site", solicitadaEm: diasAtras(20) }),
  corrida({ passageiro: "Bia", telefonePassageiro: "(11) 93333-3333", cidade: "Cidade Norte", categoria: "Econômico", canal: "App", solicitadaEm: diasAtras(1) }),
  corrida({ passageiro: "Bia", telefonePassageiro: "(11) 93333-3333", cidade: "Cidade Sul", categoria: "Econômico", canal: "App", solicitadaEm: diasAtras(2) }),
  corrida({ passageiro: "Bia", telefonePassageiro: "(11) 93333-3333", cidade: "Cidade Norte", categoria: "Econômico", canal: "App", solicitadaEm: diasAtras(4) }),
];

// ---------------------------------------------------------------- público e segmentos

test("público: junta corridas por pessoa (telefone), com cidade mais comum e dias sem corrida", () => {
  const p = montarContatos(CORRIDAS, "passageiro", AGORA);
  assert.equal(p.length, 4);
  const maria = p.find((c) => c.nome === "Maria Souza")!;
  assert.equal(maria.corridas, 2);
  assert.equal(maria.gasto, 35);
  assert.equal(maria.diasSemCorrida, 35);
  assert.deepEqual(maria.categorias, ["Econômico", "Moto"]);
  assert.deepEqual(maria.canais, ["App", "WhatsApp"]);
  const bia = p.find((c) => c.nome === "Bia")!;
  assert.equal(bia.cidade, "Cidade Norte");
  assert.equal(bia.corridas, 3);
  // Cadastro vale mais (nome e cidade) e quem nunca pediu também entra.
  const cad = [
    { id: "1", criadoEm: "", atualizadoEm: "", atualizadoPor: "", nome: "Maria Souza Lima", telefone: "11911111111", cidade: "Cidade Sul", status: "Ativo" },
    { id: "2", criadoEm: "", atualizadoEm: "", atualizadoPor: "", nome: "Novo Cliente", telefone: "11944444444", cidade: "Vila Leste", status: "Ativo" },
    { id: "3", criadoEm: "", atualizadoEm: "", atualizadoPor: "", nome: "Bia", telefone: "11933333333", cidade: null, status: "Bloqueado" },
  ];
  const pc = montarContatos(CORRIDAS, "passageiro", AGORA, {}, cad);
  assert.equal(pc.length, 5);
  const mc = pc.find((c) => c.chave === "p:11911111111")!;
  assert.equal(mc.nome, "Maria Souza Lima");
  assert.equal(mc.cidade, "Cidade Sul");
  assert.equal(mc.corridas, 2);
  const nc = pc.find((c) => c.nome === "Novo Cliente")!;
  assert.equal(nc.corridas, 0);
  assert.equal(nc.noCadastro, true);
  assert.ok(!destinatarios(pc).some((c) => c.nome === "Bia"), "bloqueado no cadastro não recebe");
  const m = montarContatos(CORRIDAS, "motorista", AGORA);
  assert.equal(m.length, 1);
  assert.equal(m[0].chave, "m:11955555555");
});

test("segmentos: cidade, inatividade, nº de corridas, categoria, canal e listas", () => {
  const p = montarContatos(CORRIDAS, "passageiro", AGORA);
  const nomes = (r: Parameters<typeof aplicarRegras>[1], l: Parameters<typeof aplicarRegras>[2] = []) => aplicarRegras(p, r, l).map((c) => c.nome).sort();
  assert.deepEqual(nomes({ tipo: "passageiro", cidades: ["cidade norte"] }), ["Ana", "Bia", "Maria Souza"]);
  assert.deepEqual(nomes({ tipo: "passageiro", inativoMinDias: 30 }), ["Maria Souza"]);
  assert.deepEqual(nomes({ tipo: "passageiro", inativoMaxDias: 5 }), ["Bia", "José"]);
  assert.deepEqual(nomes({ tipo: "passageiro", corridasMin: 2 }), ["Bia", "Maria Souza"]);
  assert.deepEqual(nomes({ tipo: "passageiro", corridasMax: 1 }), ["Ana", "José"]);
  assert.deepEqual(nomes({ tipo: "passageiro", categorias: ["Moto"] }), ["Maria Souza"]);
  assert.deepEqual(nomes({ tipo: "passageiro", canais: ["Site"] }), ["Ana"]);
  assert.deepEqual(nomes({ tipo: "passageiro", busca: "9222" }), ["José"]);
  const fixa = { id: "l1", nome: "VIP", modo: "fixa" as const, regras: { tipo: "passageiro" as const }, chaves: ["p:11933333333"], criadaEm: "", atualizadaEm: "" };
  const din = { id: "l2", nome: "Norte", modo: "dinamica" as const, regras: { tipo: "passageiro" as const, cidades: ["Cidade Norte"] }, chaves: [], criadaEm: "", atualizadaEm: "" };
  assert.deepEqual(nomes({ tipo: "passageiro", listaId: "l1" }, [fixa, din]), ["Bia"]);
  assert.deepEqual(nomes({ tipo: "passageiro", listaId: "l2", corridasMin: 2 }, [fixa, din]), ["Bia", "Maria Souza"]);
  assert.deepEqual(nomes({ tipo: "passageiro", listaId: "nao-existe" }, [fixa]), []);
});

test("destinatários: sem telefone e quem pediu para sair ficam de fora; um envio por número", () => {
  const p = montarContatos([...CORRIDAS, corrida({ passageiro: "Maria S.", telefonePassageiro: "+55 11 91111-1111", solicitadaEm: diasAtras(50) })], "passageiro", AGORA, { "p:11922222222": "2026-11-01" });
  const d = destinatarios(p).map((c) => c.nome).sort();
  assert.deepEqual(d, ["Bia", "Maria Souza"]);
  assert.equal(telefoneWhatsApp("(11) 91111-1111"), "5511911111111");
  assert.equal(telefoneWhatsApp("123"), "");
  assert.deepEqual(sanearRegras({ tipo: "x", cidades: ["  A ", ""], corridasMin: "2", inativoMinDias: "", listaId: "../x" }), { tipo: "passageiro", cidades: ["A"], corridasMin: 2 });
});

// ---------------------------------------------------------------- mensagens

test("mensagem: variáveis, cupom no fim quando o texto não tem {cupom}, e variação fixa por pessoa", () => {
  const contato = { nome: "Maria Souza", cidade: "Cidade Norte", diasSemCorrida: 35, corridas: 2 };
  assert.equal(montarTexto("Oi {primeiro_nome}! Faz {dias_sem_corrida} dias. Use {cupom} na {empresa}.", { contato, cupom: "VOLTA10", empresa: "Rota Fácil" }), "Oi Maria! Faz 35 dias. Use VOLTA10 na Rota Fácil.");
  assert.equal(montarTexto("Oi {nome}", { contato, cupom: "VOLTA10", empresa: "X" }), "Oi Maria Souza\n\nCupom: VOLTA10");
  assert.equal(montarTexto("Oi {nome}, {desconhecida}", { contato, cupom: "", empresa: "X" }), "Oi Maria Souza, {desconhecida}");
  assert.deepEqual(variaveisDesconhecidas("{nome} {xyz} {cupom} {xyz}"), ["xyz"]);
  const textos = ["A", "B", "C"];
  assert.equal(escolherVariacao(textos, "c1:p:1"), escolherVariacao(textos, "c1:p:1"));
  const usadas = new Set(Array.from({ length: 40 }, (_, i) => escolherVariacao(textos, `c1:p:${i}`)));
  assert.equal(usadas.size, 3);
});

test("variações pela IA (caso chat): descarta quem perde variável ou repete o texto", async () => {
  const pedidos: string[] = [];
  const fetchFalso = (async (url: string | URL | Request, init?: RequestInit) => {
    pedidos.push(String(url));
    const corpo = JSON.parse(String(init?.body));
    assert.ok(!MARCAS.test(corpo.messages[0].content), "prompt sem marca de terceiros");
    const variacoes = ["Olá {primeiro_nome}, use {cupom} hoje!", "Oi, use o cupom!", "Oi {primeiro_nome}, use {cupom}!", "E aí {primeiro_nome}? {cupom} te espera."];
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ variacoes }) } }] }), { status: 200 });
  }) as typeof fetch;
  const r = await variacoesComIa("Oi {primeiro_nome}, use {cupom}!", 3, "Rota Fácil", { GROQ_API_KEYS: "teste" }, { fetch: fetchFalso, env: {} });
  assert.deepEqual(r.variacoes, ["Olá {primeiro_nome}, use {cupom} hoje!", "E aí {primeiro_nome}? {cupom} te espera."]);
  assert.match(pedidos[0], /groq/);
});

// ---------------------------------------------------------------- ritmo do WhatsApp

const CFG = { lote: 3, pausaMinMin: 5, pausaMaxMin: 10, limitePorMinuto: 60 };
const VAZIO = { loteContagem: 0, pausaAte: 0, ultimoEnvio: 0, ultimos: [] as number[] };

test("ritmo: lote de 3 e depois pausa sorteada entre 5 e 10 min", () => {
  let e = VAZIO, t = 1_000_000;
  for (let i = 0; i < 3; i++) {
    const r = reservar(CFG, e, t, () => 0.5);
    assert.ok(r.ok, `envio ${i + 1} do lote`);
    e = r.estado; t += 2000;
  }
  assert.ok(e.pausaAte >= t - 2000 + 5 * 60_000 - 1 && e.pausaAte <= t - 2000 + 10 * 60_000, "pausa entre 5 e 10 min");
  const bloqueado = reservar(CFG, e, t, () => 0.5);
  assert.equal(bloqueado.ok, false);
  assert.equal(!bloqueado.ok && bloqueado.motivo, "pausa");
  const depois = reservar(CFG, e, e.pausaAte + 1, () => 0.5);
  assert.ok(depois.ok && depois.estado.loteContagem === 1, "novo lote depois da pausa");
});

test("ritmo: limite por minuto, intervalo mínimo e lote 0 sem pausa", () => {
  const cfg = { lote: 0, pausaMinMin: 5, pausaMaxMin: 10, limitePorMinuto: 2 };
  let e = VAZIO, t = 5_000_000;
  const r1 = reservar(cfg, e, t, () => 0); assert.ok(r1.ok); e = r1.estado;
  const cedo = reservar(cfg, e, t + 1000, () => 0);
  assert.equal(!cedo.ok && cedo.motivo, "limite", "intervalo mínimo entre mensagens");
  t += 21_000;
  const r2 = reservar(cfg, e, t, () => 0); assert.ok(r2.ok); e = r2.estado;
  t += 21_000;
  const r3 = reservar(cfg, e, t, () => 0);
  assert.equal(!r3.ok && r3.motivo, "limite", "2 por minuto");
  assert.equal(e.pausaAte, 0, "lote 0 não pausa");
});

// ---------------------------------------------------------------- fila

function itensDeTeste(empresaId: string, telefones: string[]) {
  A.alterarFila(empresaId, (f) => {
    for (const t of telefones) f.push({ id: A.novoId(), origem: { tipo: "campanha", id: "c-teste" }, chave: `p:${t}`, nome: "X", telefone: t, texto: "oi", estado: "pendente", tentativas: 0, criadoEm: Date.now(), proximaEm: 0, enviadoEm: null, erro: "" });
  });
}

test("fila: mensagem que cai na pausa volta para a fila (não é falha) e sai no próximo lote", async () => {
  const e = D.criarEmpresa("Fila Um").id;
  A.salvarConfig(e, { ...A.config(e), lote: 2, pausaMinMin: 5, pausaMaxMin: 10, limitePorMinuto: 60 });
  itensDeTeste(e, ["5511900000001", "5511900000002", "5511900000003", "5511900000004", "5511900000005"]);
  let t = Date.now();
  const enviados: string[] = [];
  const provedor = { nome: "t", pendencias: async () => [], enviar: async (tel: string) => { enviados.push(tel); return { ok: true as const }; } };
  const o = { agora: () => t, dormir: async (ms: number) => { t += ms; }, sorteio: () => 0.5, provedor };
  const r1 = await E.processarFila(e, o);
  assert.equal(r1.enviados, 2);
  assert.equal(r1.motivo, "pausa");
  assert.equal(A.fila(e).filter((i) => i.estado === "pendente").length, 3);
  assert.equal(A.fila(e).filter((i) => i.estado === "falha").length, 0);
  t += 4 * 60_000;
  assert.equal((await E.processarFila(e, o)).enviados, 0, "ainda na pausa");
  t += 7 * 60_000;
  assert.equal((await E.processarFila(e, o)).enviados, 2);
  t += 11 * 60_000;
  assert.equal((await E.processarFila(e, o)).enviados, 1);
  assert.equal(new Set(enviados).size, 5);
  assert.equal(A.fila(e).filter((i) => i.estado === "enviado").length, 5);
});

test("fila: erro passageiro tenta de novo (até 3 vezes); erro definitivo vira falha", async () => {
  const e = D.criarEmpresa("Fila Dois").id;
  A.salvarConfig(e, { ...A.config(e), lote: 0, limitePorMinuto: 120 });
  itensDeTeste(e, ["5511900009999", "5511900000000"]);
  let t = Date.now();
  const o = { agora: () => t, dormir: async (ms: number) => { t += ms; }, provedor: W.provedorSimulado(e) };
  const r = await E.processarFila(e, o);
  assert.equal(r.falhas, 1);
  assert.equal(r.adiados, 1);
  const temp = A.fila(e).find((i) => i.telefone.endsWith("9999"))!;
  assert.equal(temp.estado, "pendente");
  t += 3 * 60_000; await E.processarFila(e, o);
  t += 3 * 60_000; await E.processarFila(e, o);
  assert.equal(A.fila(e).find((i) => i.telefone.endsWith("9999"))!.estado, "falha");
  assert.equal(A.fila(e).find((i) => i.telefone.endsWith("9999"))!.tentativas, 3);
});

// ---------------------------------------------------------------- WhatsApp da empresa (Evolution API)

test("Evolution: usa a URL, a instância e o token da empresa; 429 volta para a fila", async () => {
  const chamadas: Array<{ url: string; init?: RequestInit }> = [];
  let status = 201;
  const f = (async (url: string | URL | Request, init?: RequestInit) => { chamadas.push({ url: String(url), init }); return new Response(JSON.stringify({ key: { id: "abc" } }), { status }); }) as typeof fetch;
  const p = W.provedorEvolution({ url: "https://wa.empresa.test/", token: "tok-da-empresa", instancia: "minha loja" }, f);
  assert.deepEqual(await p.enviar("5511911111111", "Oi"), { ok: true, id: "abc" });
  assert.equal(chamadas[0].url, "https://wa.empresa.test/message/sendText/minha%20loja");
  assert.equal((chamadas[0].init?.headers as Record<string, string>).apikey, "tok-da-empresa");
  assert.deepEqual(JSON.parse(String(chamadas[0].init?.body)), { number: "5511911111111", text: "Oi" });
  status = 429;
  const r = await p.enviar("5511911111111", "Oi");
  assert.equal(!r.ok && r.temporario, true);
  status = 400;
  const r2 = await p.enviar("5511911111111", "Oi");
  assert.equal(!r2.ok && r2.temporario, false);
  assert.deepEqual(await W.provedorEvolution({ url: "", token: "", instancia: "" }, f).pendencias(), ["Informe a URL da sua instância.", "Informe o token da instância.", "Informe o nome da instância."]);
  assert.throws(() => A.validarUrl("http://wa.empresa.test"));
  assert.throws(() => A.validarUrl("https://127.0.0.1:8080"));
  assert.throws(() => A.validarUrl("https://192.168.0.5"));
  A.validarUrl("https://wa.empresa.test");
});

// ---------------------------------------------------------------- rotas: login, papéis e isolamento

test("rotas: contagem antes de salvar, disparo, relatório, segredos escondidos e isolamento entre empresas", async () => {
  limparCachePublico();
  const um = D.criarEmpresa("Rota Um").id;
  const dois = D.criarEmpresa("Rota Dois").id;
  const admUm = D.criarUsuario({ email: "adm@um.test", nome: "Adm", senha: "senha-forte-1", empresaId: um, papel: "admin" });
  const opUm = D.criarUsuario({ email: "op@um.test", nome: "Op", senha: "senha-forte-1", empresaId: um, papel: "operador" });
  const admDois = D.criarUsuario({ email: "adm@dois.test", nome: "Adm2", senha: "senha-forte-2", empresaId: dois, papel: "admin" });
  const app = express();
  app.use(express.json());
  app.post("/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({}); });
  app.use("/api/crm", exigirLogin, router);
  const srv = app.listen(0);
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  try {
    const cookieDe = async (id: string) => ((await fetch(`${base}/entrar/${id}`, { method: "POST" })).headers.get("set-cookie") ?? "").split(";")[0];
    const [cA, cO, cB] = [await cookieDe(admUm.id), await cookieDe(opUm.id), await cookieDe(admDois.id)];
    const pedir = async (p: string, cookie: string, metodo = "GET", corpo?: unknown) => {
      const r = await fetch(base + p, { method: metodo, headers: { "Content-Type": "application/json", Cookie: cookie }, body: corpo ? JSON.stringify(corpo) : undefined });
      return { status: r.status, corpo: await r.json() as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
    };
    assert.equal((await fetch(`${base}/api/crm/campanhas`)).status, 401, "sem login");

    // Público dos dados de exemplo
    const pub = await pedir("/api/crm/publico", cA, "POST", { regras: { tipo: "passageiro" } });
    assert.equal(pub.status, 200);
    assert.ok(pub.corpo.total > 5);
    assert.ok(pub.corpo.opcoes.cidades.length > 0);
    const cidade = pub.corpo.opcoes.cidades[0].valor;

    // Contagem antes de salvar
    const conta = await pedir("/api/crm/publico/contar", cO, "POST", { regras: { tipo: "passageiro", cidades: [cidade] } });
    assert.ok(conta.corpo.destinatarios > 0 && conta.corpo.destinatarios <= pub.corpo.destinatarios);

    // Cupom tem que existir no cadastro de cupons
    assert.equal((await pedir("/api/crm/campanhas", cO, "POST", { nome: "X", texto: "Oi", cupom: "NAOEXISTE", publico: { tipo: "passageiro" } })).status, 400);
    Cad.criar(um, cadastroPorId("cupons")!, { codigo: "VOLTA10", tipoDesconto: "Percentual", valor: "10", ativo: true }, "teste");
    assert.deepEqual((await pedir("/api/crm/cupons", cO)).corpo.cupons.map((c: { codigo: string; valido: boolean }) => [c.codigo, c.valido]), [["VOLTA10", true]]);
    assert.equal((await pedir("/api/crm/cupons", cB)).corpo.cupons.length, 0, "cupom da outra empresa não aparece");

    // Variável errada não salva
    assert.equal((await pedir("/api/crm/campanhas", cO, "POST", { nome: "X", texto: "Oi {apelido}", publico: { tipo: "passageiro" } })).status, 400);

    // Operador salva rascunho, mas não dispara
    const nova = await pedir("/api/crm/campanhas", cO, "POST", { nome: "Volta", texto: "Oi {primeiro_nome}, use {cupom}!", cupom: "volta10", publico: { tipo: "passageiro", cidades: [cidade] } });
    assert.equal(nova.status, 200);
    assert.equal(nova.corpo.campanha.cupom, "VOLTA10");
    assert.equal(nova.corpo.destinatarios, conta.corpo.destinatarios);
    const id = nova.corpo.campanha.id;
    assert.equal((await pedir(`/api/crm/campanhas/${id}/disparar`, cO, "POST", {})).status, 403);

    // Outra empresa não vê nem dispara
    assert.equal((await pedir("/api/crm/campanhas", cB)).corpo.campanhas.length, 0);
    assert.equal((await pedir(`/api/crm/campanhas/${id}/disparar`, cB, "POST", {})).status, 404);
    assert.equal((await pedir(`/api/crm/campanhas/${id}/relatorio`, cB)).status, 400);

    // Admin dispara: tudo vai para a fila; o trabalhador envia pelo provedor simulado
    const enviadas: string[] = [];
    W.definirProvedorDeTeste(() => ({ nome: "t", pendencias: async () => [], enviar: async (tel, texto) => { enviadas.push(texto); return { ok: true }; } }));
    const d = await pedir(`/api/crm/campanhas/${id}/disparar`, cA, "POST", {});
    assert.equal(d.status, 200);
    assert.equal(d.corpo.naFila, conta.corpo.destinatarios);
    assert.equal((await pedir(`/api/crm/campanhas/${id}/disparar`, cA, "POST", {})).status, 400, "não dispara duas vezes");
    await E.processarFila(um, { dormir: async () => {}, maxItens: 5 });
    const rel = await pedir(`/api/crm/campanhas/${id}/relatorio`, cA);
    assert.equal(rel.corpo.total, conta.corpo.destinatarios);
    assert.ok(rel.corpo.enviados >= 1);
    assert.equal(rel.corpo.falhas, 0);
    assert.ok(enviadas.every((t) => t.includes("VOLTA10")));
    assert.ok(rel.corpo.itens.every((i: { telefone: string }) => i.telefone.includes("•")), "telefone mascarado");
    // A fila fica no banco, separada por empresa.
    assert.ok(A.fila(um).length > 0);
    assert.equal(A.fila(dois).length, 0, "a outra empresa não vê a fila");

    // Cancelar: pendentes viram canceladas
    const can = await pedir(`/api/crm/campanhas/${id}/cancelar`, cA, "POST", {});
    assert.equal(can.status, 200);
    assert.equal((await pedir(`/api/crm/campanhas/${id}/relatorio`, cA)).corpo.pendentes, 0);
    W.definirProvedorDeTeste(null);

    // Configuração: token nunca volta; só admin grava
    assert.equal((await pedir("/api/crm/config", cO, "PUT", { config: { lote: 5 } })).status, 403);
    assert.equal((await pedir("/api/crm/config", cA, "PUT", { config: { provedor: "evolution", lote: 30 }, whatsapp: { url: "http://10.0.0.1", token: "t" } })).status, 400, "URL local recusada");
    const put = await pedir("/api/crm/config", cA, "PUT", { config: { provedor: "evolution", lote: 30, pausaMinMin: 8, pausaMaxMin: 4 }, whatsapp: { url: "https://wa.um.test", token: "segredo-da-empresa-um", instancia: "um" } });
    assert.equal(put.status, 200);
    assert.equal(put.corpo.config.pausaMaxMin, 8, "pausa máxima nunca menor que a mínima");
    const cfg = await pedir("/api/crm/config", cA);
    assert.equal(cfg.corpo.whatsapp.token, "••••••");
    assert.ok(!JSON.stringify(cfg.corpo).includes("segredo-da-empresa-um"));
    assert.equal(A.credWhatsApp(um).token, "segredo-da-empresa-um");
    assert.equal(A.credWhatsApp(dois).token, "", "a outra empresa não recebe o token");
    assert.equal((await pedir("/api/crm/config", cB)).corpo.config.provedor, "simulado");

    // Jornada "sem corrida há X dias": não repete para quem já recebeu
    A.salvarConfig(um, { ...A.config(um), provedor: "simulado" });
    const j = await pedir("/api/crm/jornadas", cA, "POST", { nome: "Saudade", ativa: true, gatilho: { tipo: "sem-corrida", dias: 7 }, publico: { tipo: "passageiro" }, texto: "Oi {primeiro_nome}, sentimos sua falta!" });
    assert.equal(j.status, 200);
    const previsto = (await pedir("/api/crm/jornadas/contar", cA, "POST", { gatilho: { tipo: "sem-corrida", dias: 7 }, publico: { tipo: "passageiro" } })).corpo.total;
    const r1 = await pedir(`/api/crm/jornadas/${j.corpo.jornada.id}/rodar`, cA, "POST", {});
    assert.equal(r1.corpo.naFila, previsto);
    assert.equal((await pedir(`/api/crm/jornadas/${j.corpo.jornada.id}/rodar`, cA, "POST", {})).corpo.naFila, 0, "não repete");

    // Listas: fixa guarda as pessoas do momento
    const l = await pedir("/api/crm/listas", cO, "POST", { nome: "Da cidade", modo: "fixa", regras: { tipo: "passageiro", cidades: [cidade] } });
    assert.equal(l.corpo.total, conta.corpo.total);
    const ls = await pedir("/api/crm/listas", cO);
    assert.equal(ls.corpo.listas[0].total, conta.corpo.total);
    assert.equal(ls.corpo.listas[0].chaves, undefined);
    assert.equal((await pedir("/api/crm/listas", cB)).corpo.listas.length, 0);

    // Nada de marca de terceiros nas respostas
    assert.ok(!MARCAS.test(JSON.stringify([pub.corpo, rel.corpo, cfg.corpo])));
  } finally {
    srv.closeAllConnections(); // não espera as conexões abertas (o teste não fica parado se algo falhar)
    srv.close();
    W.definirProvedorDeTeste(null);
  }
});
