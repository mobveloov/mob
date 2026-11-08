// Testes da API dos apps (passageiro e motorista). Rodar: npm test (na pasta painel).
// Tudo local: nenhuma chamada à internet (o push usa um fetch de mentira).
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "apps-teste-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "t".repeat(40);
process.env.APPS_MOSTRAR_CODIGO = "1";
process.env.APPS_AUDIO_MAX_KB = "64";

const express = (await import("express")).default;
const D = await import("../src/servidor/dados.ts");
const { criarCookie, exigirLogin } = await import("../src/servidor/sessao.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar, atualizar } = await import("../src/cadastros/armazem.ts");
const C = await import("../src/corridas/index.ts");
const { rotasApps, rotasAppsCentral } = await import("../src/apps/rotas.ts");
const P = await import("../src/apps/despacho.ts");
const { definirBuscaDeTeste } = await import("../src/apps/push.ts");

// Servidor de teste igual ao index.ts: /api/apps antes do login; /api/apps-central depois.
const app = express();
app.use(express.json());
app.post("/teste/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({ ok: true }); });
app.use("/api/apps", rotasApps);
app.use("/api", exigirLogin);
app.use("/api/apps-central", rotasAppsCentral);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => servidor.close());

const A = D.criarEmpresa("Rota Norte"), B = D.criarEmpresa("Leva Sul");
const adminA = D.criarUsuario({ email: "admin@a.test", nome: "Ana", senha: "senha-forte-1", empresaId: A.id, papel: "admin" });
const CAT = cadastroPorId("categorias")!, MOT = cadastroPorId("motoristas")!, CLI = cadastroPorId("clientes")!;
criar(A.id, CAT, { nome: "Econômico", bandeirada: 5, valorKm: 2, valorMinimo: 9.9, ativa: true }, "teste");
criar(A.id, CAT, { nome: "Moto", bandeirada: 3, valorKm: 1, ativa: true }, "teste");
criar(A.id, MOT, { nome: "Carlos Perto", telefone: "11900000001", status: "Ativo", veiculo: "Hatch prata", placa: "ABC1D23" }, "teste");
criar(A.id, MOT, { nome: "Lia Longe", telefone: "11900000002", status: "Ativo", veiculo: "Sedã preto", placa: "XYZ9K87" }, "teste");
const soMoto = criar(A.id, MOT, { nome: "Mário Moto", telefone: "11900000003", status: "Ativo", categorias: "Moto" }, "teste");
criar(A.id, MOT, { nome: "Paulo Parado", telefone: "11900000004", status: "Inativo" }, "teste");
criar(B.id, MOT, { nome: "Bruno da B", telefone: "11900000001", status: "Ativo" }, "teste");
criar(A.id, CLI, { nome: "Zeca Bloqueado", telefone: "11955550000", status: "Bloqueado" }, "teste");

// Embarque no centro; Carlos a ~1 km, Lia a ~5 km.
const EMBARQUE = { texto: "Rua das Flores, 100", lat: -23.55, lng: -46.63 };
const DESTINO = { texto: "Av. Central, 2000", lat: -23.6, lng: -46.66 };

async function chamar(metodo: string, url: string, corpo?: unknown, token?: string, extra: Record<string, string> = {}) {
  const r = await fetch(base + url, {
    method: metodo,
    headers: { ...(corpo !== undefined && !(corpo instanceof Uint8Array) ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra },
    body: corpo === undefined ? undefined : corpo instanceof Uint8Array ? (corpo as unknown as BodyInit) : JSON.stringify(corpo),
  });
  const tipo = r.headers.get("content-type") ?? "";
  return { status: r.status, corpo: tipo.includes("json") ? await r.json() : await r.arrayBuffer(), headers: r.headers };
}

async function login(empresa: string, papel: "passageiro" | "motorista", telefone: string) {
  const c = await chamar("POST", `/api/apps/${empresa}/entrar/codigo`, { papel, telefone });
  assert.equal(c.status, 200, JSON.stringify(c.corpo));
  const e = await chamar("POST", `/api/apps/${empresa}/entrar`, { papel, telefone, codigo: c.corpo.codigoTeste });
  assert.equal(e.status, 200, JSON.stringify(e.corpo));
  return e.corpo.token as string;
}

/** Lê o SSE até achar um evento do tipo pedido. */
async function esperarEvento(empresa: string, token: string, tipo: string, acao: () => Promise<unknown>, ms = 3000) {
  const ctrl = new AbortController();
  const r = await fetch(`${base}/api/apps/${empresa}/eventos`, { headers: { authorization: `Bearer ${token}` }, signal: ctrl.signal });
  const leitor = r.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const achou = (async () => {
    for (;;) {
      const { value, done } = await leitor.read();
      if (done) throw new Error("SSE fechou");
      buf += dec.decode(value, { stream: true });
      for (const bloco of buf.split("\n\n")) {
        const m = /^event: (\w+)\ndata: (.*)$/m.exec(bloco);
        if (m && m[1] === tipo) return JSON.parse(m[2]);
      }
    }
  })();
  await new Promise((ok) => setTimeout(ok, 50));
  await acao();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await achou; } finally { clearTimeout(t); ctrl.abort(); }
}

let tokP = "", tokCarlos = "", tokLia = "", tokMario = "";

test("login: código pelo telefone; motorista só se estiver Ativo; bloqueado não entra", async () => {
  tokP = await login(A.id, "passageiro", "(11) 98888-7777");
  tokCarlos = await login(A.id, "motorista", "11900000001");
  tokLia = await login(A.id, "motorista", "11900000002");
  tokMario = await login(A.id, "motorista", "11900000003");
  const inativo = await chamar("POST", `/api/apps/${A.id}/entrar/codigo`, { papel: "motorista", telefone: "11900000004" });
  assert.equal(inativo.status, 400);
  const semCadastro = await chamar("POST", `/api/apps/${A.id}/entrar/codigo`, { papel: "motorista", telefone: "11912345678" });
  assert.match(semCadastro.corpo.erro, /cadastro de motoristas/);
  const bloq = await chamar("POST", `/api/apps/${A.id}/entrar/codigo`, { papel: "passageiro", telefone: "11955550000" });
  assert.match(bloq.corpo.erro, /bloqueado/);
  // Código errado
  const c = await chamar("POST", `/api/apps/${A.id}/entrar/codigo`, { papel: "passageiro", telefone: "11977776666" });
  const errado = await chamar("POST", `/api/apps/${A.id}/entrar`, { papel: "passageiro", telefone: "11977776666", codigo: c.corpo.codigoTeste === "000000" ? "111111" : "000000" });
  assert.equal(errado.status, 400);
  // Sem token
  assert.equal((await chamar("GET", `/api/apps/${A.id}/eu`)).status, 401);
  // Empresa que não existe
  assert.equal((await chamar("GET", `/api/apps/nao-existe/marca`)).status, 404);
});

test("isolamento: token de uma empresa não vale na outra; função do outro app é recusada", async () => {
  assert.equal((await chamar("GET", `/api/apps/${B.id}/eu`, undefined, tokCarlos)).status, 401);
  assert.equal((await chamar("POST", `/api/apps/${A.id}/online`, { lat: 0, lng: 0 }, tokP)).status, 403);
  assert.equal((await chamar("POST", `/api/apps/${A.id}/corridas`, { embarque: EMBARQUE }, tokCarlos)).status, 403);
  const marca = await chamar("GET", `/api/apps/${A.id}/marca`);
  assert.equal(marca.corpo.empresaId, A.id);
  assert.equal(marca.headers.get("access-control-allow-origin"), "*");
});

test("passageiro: nome, opções e estimativa", async () => {
  const semNome = await chamar("POST", `/api/apps/${A.id}/corridas`, { embarque: EMBARQUE, categoria: "Econômico", pagamento: "Pix" }, tokP);
  assert.match(semNome.corpo.erro, /nome/);
  const n = await chamar("POST", `/api/apps/${A.id}/eu`, { nome: "Paula Passageira" }, tokP);
  assert.equal(n.corpo.eu.nome, "Paula Passageira");
  const o = await chamar("GET", `/api/apps/${A.id}/opcoes`, undefined, tokP);
  assert.deepEqual(o.corpo.categorias.map((c: { nome: string }) => c.nome).sort(), ["Econômico", "Moto"]);
  const q = new URLSearchParams({ categoria: "Econômico", latEmbarque: String(EMBARQUE.lat), lngEmbarque: String(EMBARQUE.lng), latDestino: String(DESTINO.lat), lngDestino: String(DESTINO.lng) });
  const e = await chamar("GET", `/api/apps/${A.id}/estimativa?${q}`, undefined, tokP);
  assert.ok(e.corpo.valor > 9.9 && e.corpo.distanciaKm > 5, JSON.stringify(e.corpo));
});

let corridaId = "";

test("corrida completa: oferta ao mais perto, recusa passa ao próximo, aceitar, chat com áudio, finalizar e avaliar", async () => {
  // Motoristas online: Carlos ~1 km, Lia ~5 km, Mário só faz Moto (não recebe Econômico).
  for (const [t, lat] of [[tokCarlos, -23.559], [tokLia, -23.595], [tokMario, -23.5501]] as const) {
    assert.equal((await chamar("POST", `/api/apps/${A.id}/online`, { lat, lng: -46.63 }, t)).status, 200);
  }
  // Pedido → Carlos recebe a oferta pelo tempo real.
  const oferta = await esperarEvento(A.id, tokCarlos, "oferta", async () => {
    const r = await chamar("POST", `/api/apps/${A.id}/corridas`, { embarque: EMBARQUE, destino: DESTINO, categoria: "Econômico", pagamento: "Pix", pedidoId: "pedido-teste-1" }, tokP);
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    corridaId = r.corpo.corrida.id;
    assert.equal(r.corpo.corrida.status, "procurando");
  });
  assert.equal(oferta.corrida.id, corridaId);
  assert.ok(oferta.distanciaKm < 2);
  // Pedido repetido (toque duplo) devolve a mesma corrida.
  const dup = await chamar("POST", `/api/apps/${A.id}/corridas`, { embarque: EMBARQUE, destino: DESTINO, categoria: "Econômico", pagamento: "Pix", pedidoId: "pedido-teste-1" }, tokP);
  assert.equal(dup.corpo.corrida.id, corridaId);
  // Mário (só Moto) não recebeu nada.
  assert.equal((await chamar("GET", `/api/apps/${A.id}/estado`, undefined, tokMario)).corpo.oferta, null);
  // Lia não pode aceitar a oferta do Carlos.
  assert.equal((await chamar("POST", `/api/apps/${A.id}/ofertas/${oferta.id}/aceitar`, {}, tokLia)).status, 400);
  // Carlos recusa → vai para Lia.
  const ofertaLia = await esperarEvento(A.id, tokLia, "oferta", () => chamar("POST", `/api/apps/${A.id}/ofertas/${oferta.id}/recusar`, {}, tokCarlos));
  assert.equal(ofertaLia.corrida.id, corridaId);
  // Lia aceita; o passageiro fica sabendo pelo tempo real, com o carro dela.
  const aviso = await esperarEvento(A.id, tokP, "corrida", async () => {
    const a = await chamar("POST", `/api/apps/${A.id}/ofertas/${ofertaLia.id}/aceitar`, {}, tokLia);
    assert.equal(a.status, 200, JSON.stringify(a.corpo));
    assert.equal(a.corpo.corrida.passageiro.telefone, "11988887777");
  });
  assert.equal(aviso.status, "a_caminho");
  assert.equal(aviso.motorista.placa, "XYZ9K87");
  assert.equal(aviso.motorista.telefone, "11900000002");
  // Carlos não vê a corrida.
  assert.equal((await chamar("GET", `/api/apps/${A.id}/corridas/${corridaId}`, undefined, tokCarlos)).status, 400);
  // Posição da Lia chega ao passageiro.
  const pos = await esperarEvento(A.id, tokP, "posicao", () => chamar("POST", `/api/apps/${A.id}/posicao`, { lat: -23.58, lng: -46.63 }, tokLia));
  assert.equal(pos.lat, -23.58);

  // Chat: texto do passageiro chega à motorista.
  const msg = await esperarEvento(A.id, tokLia, "chat", () => chamar("POST", `/api/apps/${A.id}/corridas/${corridaId}/chat`, { texto: "Estou no portão azul" }, tokP));
  assert.equal(msg.mensagem.texto, "Estou no portão azul");
  // Áudio (webm) da motorista.
  const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, ...crypto.randomBytes(2000)]);
  const au = await chamar("POST", `/api/apps/${A.id}/corridas/${corridaId}/audio`, webm, tokLia, { "content-type": "audio/webm;codecs=opus", "x-segundos": "4" });
  assert.equal(au.status, 200, JSON.stringify(au.corpo));
  assert.equal(au.corpo.mensagem.audio.segundos, 4);
  const baixado = await chamar("GET", `/api/apps/${A.id}/corridas/${corridaId}/audio/${au.corpo.mensagem.audio.id}`, undefined, tokP);
  assert.equal(baixado.status, 200);
  assert.equal(baixado.headers.get("content-type"), "audio/webm");
  assert.equal(new Uint8Array(baixado.corpo as ArrayBuffer).length, webm.length);
  // Ninguém de fora baixa o áudio.
  assert.equal((await chamar("GET", `/api/apps/${A.id}/corridas/${corridaId}/audio/${au.corpo.mensagem.audio.id}`, undefined, tokCarlos)).status, 400);
  // Tipo errado, cabeçalho falso e tamanho demais são recusados.
  assert.equal((await chamar("POST", `/api/apps/${A.id}/corridas/${corridaId}/audio`, webm, tokP, { "content-type": "image/png" })).status, 400);
  assert.equal((await chamar("POST", `/api/apps/${A.id}/corridas/${corridaId}/audio`, new Uint8Array([1, 2, 3, 4, 5, 6]), tokP, { "content-type": "audio/ogg" })).status, 400);
  assert.equal((await chamar("POST", `/api/apps/${A.id}/corridas/${corridaId}/audio`, new Uint8Array(70 * 1024), tokP, { "content-type": "audio/webm" })).status, 413);
  const chat = await chamar("GET", `/api/apps/${A.id}/corridas/${corridaId}/chat`, undefined, tokP);
  assert.equal(chat.corpo.mensagens.length, 2);
  // O arquivo fica na pasta da empresa.
  assert.ok(fs.existsSync(path.join(DADOS, "empresas", A.id, "apps", "chat", "audio", `${au.corpo.mensagem.audio.id}.webm`)));

  // Passageiro não muda status; motorista segue a corrida.
  assert.equal((await chamar("POST", `/api/apps/${A.id}/corridas/${corridaId}/status`, { status: "no_local" }, tokP)).status, 403);
  for (const s of ["no_local", "em_andamento"]) assert.equal((await chamar("POST", `/api/apps/${A.id}/corridas/${corridaId}/status`, { status: s }, tokLia)).status, 200);
  // Em andamento o passageiro não cancela.
  assert.match((await chamar("POST", `/api/apps/${A.id}/corridas/${corridaId}/cancelar`, {}, tokP)).corpo.erro, /andamento/);
  // SOS vai para a central.
  assert.equal((await chamar("POST", `/api/apps/${A.id}/corridas/${corridaId}/sos`, { lat: -23.57, lng: -46.64 }, tokP)).status, 200);
  const fim = await chamar("POST", `/api/apps/${A.id}/corridas/${corridaId}/status`, { status: "finalizada" }, tokLia);
  assert.equal(fim.corpo.corrida.status, "finalizada");
  assert.ok(fim.corpo.corrida.valor > 0);
  // Corrida terminada: telefone some e o chat fecha.
  assert.equal(fim.corpo.corrida.passageiro.telefone, "");
  assert.equal((await chamar("POST", `/api/apps/${A.id}/corridas/${corridaId}/chat`, { texto: "oi" }, tokP)).status, 400);
  const av = await chamar("POST", `/api/apps/${A.id}/corridas/${corridaId}/avaliar`, { nota: 5 }, tokP);
  assert.equal(av.corpo.corrida.avaliacao, 5);
  const g = await chamar("GET", `/api/apps/${A.id}/ganhos`, undefined, tokLia);
  assert.equal(g.corpo.hoje.corridas, 1);
  assert.equal(g.corpo.hoje.valor, fim.corpo.corrida.valor);
  // A corrida é uma corrida própria normal (aparece no painel com canal App).
  assert.equal(C.listarProprias(A.id).find((c) => c.id === corridaId)!.canal, "app");
  // Histórico: só as do próprio.
  assert.equal((await chamar("GET", `/api/apps/${A.id}/corridas`, undefined, tokP)).corpo.corridas.length, 1);
  assert.equal((await chamar("GET", `/api/apps/${A.id}/corridas`, undefined, tokCarlos)).corpo.corridas.length, 0);
});

test("central: motoristas online e alertas de SOS só da empresa do usuário", async () => {
  const r = await fetch(`${base}/teste/entrar/${adminA.id}`, { method: "POST" });
  const cookie = r.headers.get("set-cookie")!.split(";")[0];
  const m = await (await fetch(`${base}/api/apps-central/motoristas`, { headers: { cookie } })).json();
  assert.equal(m.motoristas.length, 3);
  const al = await (await fetch(`${base}/api/apps-central/alertas`, { headers: { cookie } })).json();
  assert.equal(al.alertas.length, 1);
  const res = await (await fetch(`${base}/api/apps-central/alertas/${al.alertas[0].id}/resolver`, { method: "POST", headers: { cookie } })).json();
  assert.equal(res.alerta.resolvido, true);
  assert.equal(P.alertas(B.id).length, 0);
});

test("corrida da central também é oferecida pelo app; motorista que desiste devolve para a busca", async () => {
  const c = await C.criarCorridaPropria(A.id, { passageiro: { nome: "Rui", telefone: "11933334444" }, embarque: EMBARQUE, categoria: "Econômico", pagamento: "Dinheiro", canal: "painel" }, "central");
  P.despachar(A.id);
  const o = await chamar("GET", `/api/apps/${A.id}/estado`, undefined, tokCarlos);
  assert.equal(o.corpo.oferta?.corrida.id, c.id, "Carlos é o mais perto e está livre");
  await chamar("POST", `/api/apps/${A.id}/ofertas/${o.corpo.oferta.id}/aceitar`, {}, tokCarlos);
  const d = await chamar("POST", `/api/apps/${A.id}/corridas/${c.id}/cancelar`, {}, tokCarlos);
  assert.equal(d.status, 200, JSON.stringify(d.corpo));
  assert.equal(C.listarProprias(A.id).find((x) => x.id === c.id)!.status, "procurando");
  // Foi para a Lia (Carlos desistiu, não recebe de novo logo).
  const lia = await chamar("GET", `/api/apps/${A.id}/estado`, undefined, tokLia);
  assert.equal(lia.corpo.oferta?.corrida.id, c.id);
  // Central cancela: a oferta some.
  await C.cancelarCorrida(A.id, c.id, "Central", "teste");
  P.ciclo(A.id);
  assert.equal((await chamar("GET", `/api/apps/${A.id}/estado`, undefined, tokLia)).corpo.oferta, null);
});

test("motorista desativado no cadastro perde o acesso; servidor reiniciado pede online de novo", async () => {
  P.limparDespacho();
  assert.equal((await chamar("POST", `/api/apps/${A.id}/posicao`, { lat: -23.5, lng: -46.6 }, tokMario)).status, 409);
  atualizar(A.id, MOT, soMoto.id, { ...soMoto, status: "Inativo" }, "teste");
  assert.equal((await chamar("GET", `/api/apps/${A.id}/eu`, undefined, tokMario)).status, 401);

});

test("push: usa a conta de serviço da própria empresa e manda a oferta ao motorista", async () => {
  const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  fs.writeFileSync(path.join(DADOS, "empresas", A.id, "apps", "firebase-servico.json"), JSON.stringify({
    project_id: "projeto-a", client_email: "push@projeto-a.test", private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
  }));
  const chamadas: Array<{ url: string; corpo: string }> = [];
  definirBuscaDeTeste((async (url: string | URL | Request, init?: RequestInit) => {
    chamadas.push({ url: String(url), corpo: String(init?.body ?? "") });
    if (String(url).includes("oauth2")) return new Response(JSON.stringify({ access_token: "acesso", expires_in: 3600 }), { status: 200 });
    return new Response("{}", { status: 200 });
  }) as typeof fetch);
  assert.equal((await chamar("POST", `/api/apps/${A.id}/push`, { token: "tokenaparelho-carlos-1234567890" }, tokCarlos)).status, 200);
  assert.equal((await chamar("GET", `/api/apps/${A.id}/marca`)).corpo.push, true);
  assert.equal((await chamar("GET", `/api/apps/${B.id}/marca`)).corpo.push, false);
  await chamar("POST", `/api/apps/${A.id}/online`, { lat: -23.559, lng: -46.63 }, tokCarlos);
  await C.criarCorridaPropria(A.id, { passageiro: { nome: "Rita", telefone: "11922223333" }, embarque: EMBARQUE, categoria: "Econômico", pagamento: "Pix", canal: "painel" }, "central");
  P.despachar(A.id);
  await new Promise((ok) => setTimeout(ok, 200));
  const envio = chamadas.find((c) => c.url.includes("fcm.googleapis.com/v1/projects/projeto-a"));
  assert.ok(envio, "mandou para o FCM do projeto da empresa");
  assert.equal(JSON.parse(envio!.corpo).message.token, "tokenaparelho-carlos-1234567890");
  definirBuscaDeTeste(null);
});

test("tempo real por espera longa (rede que não repassa SSE): só os eventos da própria pessoa", async () => {
  const E = await import("../src/apps/eventos.ts");
  const tokPedro = await login(A.id, "passageiro", "11944443333");
  const inicio = await chamar("GET", `/api/apps/${A.id}/eventos/espera?desde=-1`, undefined, tokPedro);
  assert.equal(inicio.status, 200);
  const desde = inicio.corpo.seq as number;
  // Evento de outra pessoa não acorda; o dele acorda na hora.
  const pedido = chamar("GET", `/api/apps/${A.id}/eventos/espera?desde=${desde}`, undefined, tokPedro);
  await new Promise((ok) => setTimeout(ok, 100));
  E.emitir(A.id, { papel: "passageiro", chave: "11988887777" }, "chat", { de: "outro" });
  E.emitir(B.id, { papel: "passageiro", chave: "11944443333" }, "chat", { de: "outra empresa" });
  E.emitir(A.id, { papel: "passageiro", chave: "11944443333" }, "corrida", { id: "x" });
  const r = await pedido;
  assert.deepEqual(r.corpo.eventos.map((e: { tipo: string; dados: unknown }) => [e.tipo, e.dados]), [["corrida", { id: "x" }]]);
  // Já tem evento depois de "desde": responde sem esperar.
  const de2 = await chamar("GET", `/api/apps/${A.id}/eventos/espera?desde=${desde}`, undefined, tokPedro);
  assert.equal(de2.corpo.eventos.length, 1);
  assert.equal((await chamar("GET", `/api/apps/${A.id}/eventos/espera?desde=abc`, undefined, tokPedro)).status, 400);
  assert.equal((await chamar("GET", `/api/apps/${A.id}/eventos/espera?desde=0`)).status, 401);
});
