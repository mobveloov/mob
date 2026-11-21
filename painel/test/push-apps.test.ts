// Push dos apps ponta a ponta (docs/PUSH_APPS.md): o CRM envia, o app recebe na caixa de avisos, marca como lido e o CRM mostra "lida".
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-pushapps-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "p".repeat(40);
process.env.APPS_MOSTRAR_CODIGO = "1";
delete process.env.BANCO_ARQUIVO;
delete process.env.FCM_CONTA_SERVICO_JSON;

const express = (await import("express")).default;
const D = await import("../src/servidor/dados.ts");
const B = await import("../src/servidor/banco.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar } = await import("../src/cadastros/armazem.ts");
const { rotasApps } = await import("../src/apps/rotas.ts");
const Push = await import("../src/apps/push.ts");
const E = await import("../src/crm/envio.ts");
const A = await import("../src/crm/armazem.ts");
const R = await import("../src/crm/registro.ts");
const G = await import("../src/crm/gatilhos.ts");
const T = await import("../src/crm/templates.ts");
const { salvarConfig2 } = await import("../src/crm2/base.ts");
const { dispararNotificacao, sanearPedido, listaNotificacoes } = await import("../src/config/comunicacao.ts");

const app = express();
app.use(express.json());
app.use("/api/apps", rotasApps);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => { Push.definirBuscaDeTeste(null); servidor.closeAllConnections(); servidor.close(); B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

const emp = D.criarEmpresa("Push Apps").id;
const outraEmpresa = D.criarEmpresa("Outra Push").id;
criar(emp, cadastroPorId("motoristas")!, { nome: "Mário Motorista", telefone: "11988880001", status: "Ativo", placa: "AAA1A11" }, "t");
criar(emp, cadastroPorId("motoristas")!, { nome: "Nina Motorista", telefone: "11988880002", status: "Ativo", placa: "BBB2B22" }, "t");
criar(emp, cadastroPorId("clientes")!, { nome: "Paula Passageira", telefone: "11977770001", status: "Ativo" }, "t");

async function chamar(metodo: string, url: string, corpo?: unknown, token?: string) {
  const r = await fetch(base + url, { method: metodo, headers: { ...(corpo !== undefined ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: corpo !== undefined ? JSON.stringify(corpo) : undefined });
  return { status: r.status, corpo: (await r.json()) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
async function login(empresa: string, papel: "passageiro" | "motorista", telefone: string) {
  const c = await chamar("POST", `/api/apps/${empresa}/entrar/codigo`, { papel, telefone });
  const e = await chamar("POST", `/api/apps/${empresa}/entrar`, { papel, telefone, codigo: c.corpo.codigoTeste });
  assert.equal(e.status, 200, JSON.stringify(e.corpo));
  return e.corpo.token as string;
}
const campanha = (id: string, canal: "app" | "whatsapp", tipo: "motorista" | "passageiro", texto: string) => ({
  id, nome: id, canal, publico: { tipo }, texto, variacoes: [], cupom: "", agendadaPara: null, estado: "rascunho" as const, criadaEm: new Date().toISOString(),
  atualizadaEm: new Date().toISOString(), disparadaEm: null, concluidaEm: null, destinatarios: 0,
});
const semEspera = { dormir: async () => {} };
/** Põe na fila exatamente estas pessoas (o público de exemplo do servidor de teste é grande e sem cadastro no app). */
const naFila = (e: string, campId: string, pessoas: Array<{ tipo: "m" | "p"; nome: string; tel: string }>, texto: string, canal: "app" | "whatsapp" = "app") =>
  A.adicionarNaFila(e, pessoas.map((p, i) => ({ id: `${campId}-${i}`, origem: { tipo: "campanha" as const, id: campId }, canal, chave: `${p.tipo}:${p.tel.slice(-11)}`, nome: p.nome, telefone: `55${p.tel}`, texto: texto.replace("{primeiro_nome}", p.nome.split(" ")[0]), estado: "pendente" as const, tentativas: 0, criadoEm: Date.now(), proximaEm: Date.now(), enviadoEm: null, erro: "" })));

test("campanha no canal app: motorista recebe na caixa, marca como lida e o CRM mostra cada etapa", async () => {
  const tm = await login(emp, "motorista", "11988880001");
  const tn = await login(emp, "motorista", "11988880002");
  const tp = await login(emp, "passageiro", "11977770001");
  A.salvarCampanhas(emp, [campanha("c1", "app", "motorista", "Olá {primeiro_nome}, bônus de fim de semana liberado!")]);
  naFila(emp, "c1", [{ tipo: "m", nome: "Mário Motorista", tel: "11988880001" }, { tipo: "m", nome: "Nina Motorista", tel: "11988880002" }], "Olá {primeiro_nome}, bônus de fim de semana liberado!");
  const rodada = await E.processarFila(emp, semEspera);
  assert.equal(rodada.enviados, 2);

  // CRM: linha do histórico no canal app, ainda "enviada" (ninguém abriu o app).
  const antes = R.listarEnvios(emp, { canal: "app" });
  assert.equal(antes.total, 2);
  assert.ok(antes.linhas.every((l) => l.estado === "sent" && l.app?.estado === "enviada"));
  assert.equal(antes.linhas[0].app?.push, "sem_chave", "sem chave do Firebase: modo simulado");

  // App do motorista: a contagem é curta e a lista marca "entregue".
  assert.equal((await chamar("GET", `/api/apps/${emp}/avisos/contagem`, undefined, tm)).corpo.naoLidos, 1);
  const lista = await chamar("GET", `/api/apps/${emp}/avisos`, undefined, tm);
  assert.equal(lista.corpo.avisos.length, 1);
  assert.match(lista.corpo.avisos[0].texto, /Olá Mário, bônus/);
  assert.equal(lista.corpo.avisos[0].estado, "entregue");
  assert.equal(lista.corpo.naoLidos, 1);
  const meu = R.listarEnvios(emp, { canal: "app", busca: "Mário" }).linhas[0];
  assert.equal(meu.app?.estado, "entregue");
  assert.equal(R.listarEnvios(emp, { canal: "app", busca: "Nina" }).linhas[0].app?.estado, "enviada", "a outra pessoa ainda não abriu");

  // Marcar como lida.
  const lido = await chamar("POST", `/api/apps/${emp}/avisos/lidos`, { ids: [lista.corpo.avisos[0].id] }, tm);
  assert.equal(lido.corpo.marcados, 1);
  assert.equal(lido.corpo.naoLidos, 0);
  assert.equal(R.listarEnvios(emp, { canal: "app", busca: "Mário" }).linhas[0].app?.estado, "lida");
  assert.ok(R.listarEnvios(emp, { canal: "app", busca: "Mário" }).linhas[0].app?.lidaEm);

  // Cada pessoa só enxerga e marca o que é dela.
  const deNina = (await chamar("GET", `/api/apps/${emp}/avisos`, undefined, tn)).corpo.avisos[0];
  assert.equal((await chamar("POST", `/api/apps/${emp}/avisos/lidos`, { ids: [deNina.id] }, tm)).corpo.marcados, 0);
  assert.equal((await chamar("GET", `/api/apps/${emp}/avisos`, undefined, tp)).corpo.avisos.length, 0);

  const rel = E.relatorioCampanha(emp, "c1");
  assert.deepEqual({ total: rel.app?.total, lidas: rel.app?.lidas, entregues: rel.app?.entregues }, { total: 2, lidas: 1, entregues: 1 });
});

test("passageiro: campanha de app chega só para ele e 'marcar todas' zera o contador", async () => {
  const tp = await login(emp, "passageiro", "11977770001");
  A.salvarCampanhas(emp, [...A.campanhas(emp), campanha("c2", "app", "passageiro", "Cupom novo para você")]);
  naFila(emp, "c2", [{ tipo: "p", nome: "Paula Passageira", tel: "11977770001" }], "Cupom novo para você");
  await E.processarFila(emp, semEspera);
  const r = await chamar("GET", `/api/apps/${emp}/avisos`, undefined, tp);
  assert.equal(r.corpo.avisos.length, 1);
  assert.equal(r.corpo.naoLidos, 1);
  assert.equal((await chamar("POST", `/api/apps/${emp}/avisos/lidos`, { todos: true }, tp)).corpo.naoLidos, 0);
  assert.equal((await chamar("GET", `/api/apps/${emp}/avisos`, undefined, tp)).corpo.avisos[0].estado, "lida");
});

test("outra empresa não vê os avisos", async () => {
  criar(outraEmpresa, cadastroPorId("motoristas")!, { nome: "Mário Motorista", telefone: "11988880001", status: "Ativo" }, "t");
  const t = await login(outraEmpresa, "motorista", "11988880001");
  assert.equal((await chamar("GET", `/api/apps/${outraEmpresa}/avisos`, undefined, t)).corpo.avisos.length, 0);
});

test("a Governança (janela de horário) segura o envio no app e libera depois", async () => {
  const e = D.criarEmpresa("Janela App").id;
  criar(e, cadastroPorId("motoristas")!, { nome: "Zé", telefone: "11966660001", status: "Ativo" }, "t");
  A.salvarCampanhas(e, [campanha("cj", "app", "motorista", "Aviso com janela")]);
  naFila(e, "cj", [{ tipo: "m", nome: "Zé", tel: "11966660001" }], "Aviso com janela");
  const brasilia = new Date(Date.now() - 3 * 3600_000);
  const h = (n: number) => `${String(((brasilia.getUTCHours() + n) % 24 + 24) % 24).padStart(2, "0")}:00`;
  salvarConfig2(e, { janelaInicio: h(2), janelaFim: h(4) }); // a janela começa daqui a 2 horas
  const fora = await E.processarFila(e, semEspera);
  assert.equal(fora.enviados, 0);
  assert.equal(A.fila(e)[0].estado, "pendente", "fica esperando, não vira falha");
  salvarConfig2(e, { janelaInicio: h(-1), janelaFim: h(1) });
  assert.equal((await E.processarFila(e, semEspera)).enviados, 1);
});

test("telefone fora do cadastro vira falha com motivo claro no histórico", async () => {
  const e = D.criarEmpresa("Sem Cadastro").id;
  const item = { id: "x1", origem: { tipo: "campanha" as const, id: "cx" }, canal: "app" as const, chave: "m:11900000000", nome: "Fantasma", telefone: "5511900000000", texto: "Oi", estado: "pendente" as const, tentativas: 0, criadoEm: Date.now(), proximaEm: Date.now(), enviadoEm: null, erro: "" };
  A.adicionarNaFila(e, [item]);
  const r = await E.processarFila(e, semEspera);
  assert.equal(r.falhas, 1);
  const l = R.listarEnvios(e, { canal: "app" }).linhas[0];
  assert.equal(l.estado, "failed");
  assert.match(l.erro, /não está no cadastro do app/);
});

test("gatilho no canal app entrega na caixa do passageiro", async () => {
  const t = T.salvarTemplate(emp, null, { name: "Boas-vindas app", category: "custom", title: "Bem-vinda", content: "Oi {nome}, bem-vinda!", variables: ["nome"], is_active: true, image_url: null, button_text: null, button_link: null, variant_b_content: null, ab_split_ratio: 0, wa_optout_footer: true });
  const g = G.salvarGatilho(emp, null, { name: "Gatilho app", template_id: t.id, trigger_type: "new_passenger", trigger_config: {}, send_channel: "app", is_active: true });
  const res = await G.enviarGatilho(emp, g, { telefone: "11977770001", nome: "Paula Passageira", vars: {} });
  assert.equal(res, "sent");
  const tp = await login(emp, "passageiro", "11977770001");
  const l = (await chamar("GET", `/api/apps/${emp}/avisos`, undefined, tp)).corpo.avisos;
  const a = l.find((x: { titulo: string }) => x.titulo === "Bem-vinda");
  assert.ok(a);
  assert.match(a.texto, /Oi Paula/);
  assert.doesNotMatch(a.texto, /NÃO QUERO MAIS/i, "o rodapé de descadastro do WhatsApp não vai para o app");
});

test("Notificações app (painel): envio individual e com filtro também cai na caixa; a lista mostra entregue e lida", async () => {
  const mot = D.criarEmpresa("Notif Direta").id;
  const m = criar(mot, cadastroPorId("motoristas")!, { nome: "Rui", telefone: "11955550009", status: "Ativo" }, "t");
  const r = await dispararNotificacao(mot, sanearPedido({ papel: "motorista", segmento: "individual", usuario: m.id, titulo: "Reunião", mensagem: "Passe na base hoje." }), "dono");
  assert.equal(r.destinatarios, 1);
  assert.equal(r.pushPendenteDeChave, 1, "sem chave do Firebase, a central é avisada de que o push do sistema está pendente");
  const t = await login(mot, "motorista", "11955550009");
  const l = await chamar("GET", `/api/apps/${mot}/avisos`, undefined, t);
  assert.equal(l.corpo.avisos[0].titulo, "Reunião");
  await chamar("POST", `/api/apps/${mot}/avisos/lidos`, { ids: [l.corpo.avisos[0].id] }, t);
  const linha = listaNotificacoes(mot, {}, 1).itens[0];
  assert.deepEqual({ total: linha.app.total, lidas: linha.app.lidas, pendenteChave: linha.app.pushPendenteChave }, { total: 1, lidas: 1, pendenteChave: 1 });
});

test("FCM: com a conta de serviço na variável, o push do sistema sai e o aviso registra 'enviado'", async () => {
  const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  process.env.FCM_CONTA_SERVICO_JSON = JSON.stringify({ project_id: "projeto-teste", client_email: "teste@projeto-teste.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) });
  const chamadas: Array<{ url: string; corpo: any }> = []; // eslint-disable-line @typescript-eslint/no-explicit-any
  Push.definirBuscaDeTeste((async (url: string, init?: RequestInit) => {
    if (String(url).includes("oauth2")) return new Response(JSON.stringify({ access_token: "ac", expires_in: 3600 }), { status: 200 });
    chamadas.push({ url: String(url), corpo: JSON.parse(String(init?.body)) });
    return new Response("{}", { status: 200 });
  }) as typeof fetch);
  try {
    const e = D.criarEmpresa("Com Chave").id;
    const m = criar(e, cadastroPorId("motoristas")!, { nome: "Léo", telefone: "11944440001", status: "Ativo" }, "t");
    const t = await login(e, "motorista", "11944440001");
    assert.equal((await chamar("POST", `/api/apps/${e}/push`, { token: "x".repeat(40) }, t)).status, 200);
    assert.equal(Push.pushLigado(e), true);
    const { entregar } = await import("../src/apps/avisos.ts");
    const av = await entregar(e, { papel: "motorista", chave: m.id }, { titulo: "Teste", texto: "Com push", origem: "teste" });
    assert.equal(av.push, "enviado");
    assert.equal(chamadas.length, 1);
    assert.equal(chamadas[0].corpo.message.notification.title, "Teste");
    // Sem aparelho registrado para outra pessoa: avisa isso.
    const sem = await entregar(e, { papel: "motorista", chave: "outro" }, { titulo: "x", texto: "y", origem: "teste" });
    assert.equal(sem.push, "sem_aparelho");
  } finally { delete process.env.FCM_CONTA_SERVICO_JSON; }
});
