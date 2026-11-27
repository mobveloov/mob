// Despacho dos apps nos modos da Machine (mais próximo, primeiro a aceitar, fila virtual) e os casos de borda:
// aceite simultâneo, desistência, cancelamento com chamadas tocando, tentativas, raio, categoria e "aceitar próxima".
// Tudo local, sem internet. Rodar: npm test (na pasta painel).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "apps-despacho-teste-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "t".repeat(40);
process.env.APPS_MOSTRAR_CODIGO = "1";
process.env.APPS_CODIGOS_POR_IP = "1000";
process.env.OSRM_PUBLICO = "0";
process.env.NOMINATIM_PUBLICO = "0";

const express = (await import("express")).default;
const D = await import("../src/servidor/dados.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar } = await import("../src/cadastros/armazem.ts");
const { rotasApps } = await import("../src/apps/rotas.ts");
const P = await import("../src/apps/despacho.ts");
const C = await import("../src/corridas/index.ts");
const { salvarDespacho } = await import("../src/config/despacho.ts");

const app = express();
app.use(express.json());
app.use("/api/apps", rotasApps);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => servidor.close());

const EMBARQUE = { texto: "Rua das Flores, 100", lat: -23.55, lng: -46.63 };
const DESTINO = { texto: "Av. Central, 2000", lat: -23.6, lng: -46.66 };
let seq = 0;

async function chamar(metodo: string, url: string, corpo?: unknown, token?: string) {
  const r = await fetch(base + url, { method: metodo, headers: { ...(corpo !== undefined ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  return { status: r.status, corpo: await r.json().catch(() => ({})) };
}
const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/** Uma central nova por teste, com as categorias Econômico e Moto, regras do despacho e motoristas online nas posições dadas. */
async function montar(regras: Record<string, unknown>, motoristas: Array<{ nome: string; lat: number; categorias?: string }>) {
  const n = ++seq;
  const E = D.criarEmpresa(`Central Despacho ${n}`);
  criar(E.id, cadastroPorId("categorias")!, { nome: "Econômico", bandeirada: 5, valorKm: 2, valorMinimo: 9.9, ativa: true }, "teste");
  criar(E.id, cadastroPorId("categorias")!, { nome: "Moto", bandeirada: 3, valorKm: 1, ativa: true }, "teste");
  salvarDespacho(E.id, { raioMetros: 5000, ...regras });
  const API = `/api/apps/${E.id}`;
  const login = async (papel: string, telefone: string, nome?: string) => {
    const c = await chamar("POST", `${API}/entrar/codigo`, { papel, telefone });
    const t = (await chamar("POST", `${API}/entrar`, { papel, telefone, codigo: c.corpo.codigoTeste })).corpo.token as string;
    if (papel === "passageiro") await chamar("POST", `${API}/eu`, { nome: nome ?? "Cliente Teste" }, t);
    return t;
  };
  const tokens: Record<string, string> = {};
  for (const [i, m] of motoristas.entries()) {
    const tel = `1190${n}${String(i).padStart(5, "0")}`;
    criar(E.id, cadastroPorId("motoristas")!, { nome: m.nome, telefone: tel, status: "Ativo", ...(m.categorias ? { categorias: m.categorias } : {}) }, "teste");
    tokens[m.nome] = await login("motorista", tel);
    assert.equal((await chamar("POST", `${API}/online`, { lat: m.lat, lng: -46.63 }, tokens[m.nome])).status, 200);
    await esperar(15); // "online há mais tempo" para a fila virtual
  }
  const passageiro = await login("passageiro", `1198${n}000000`);
  const pedir = async (extra: Record<string, unknown> = {}) => {
    const r = await chamar("POST", `${API}/corridas`, { embarque: EMBARQUE, destino: DESTINO, categoria: "Econômico", pagamento: "Pix", pedidoId: `p-${n}-${++seq}`, ...extra }, passageiro);
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    return r.corpo.corrida.id as string;
  };
  const oferta = async (nome: string, ms = 1500) => {
    for (let t = 0; t < ms; t += 150) { const o = (await chamar("GET", `${API}/estado`, undefined, tokens[nome])).corpo.oferta; if (o) return o; await esperar(150); }
    return null;
  };
  const tocando = async () => {
    const l: string[] = [];
    for (const nome of Object.keys(tokens)) if ((await chamar("GET", `${API}/estado`, undefined, tokens[nome])).corpo.oferta) l.push(nome);
    return l;
  };
  return { E, API, tokens, passageiro, pedir, oferta, tocando, login };
}

// 1 --------------------------------------------------------------------------------------------------
test("modo geral (primeiro a aceitar): o grupo toca junto; quem aceita primeiro leva e os outros param", async () => {
  const t = await montar({ metodo: "primeiro_aceitar", limiteMotoristas: 3, prioritarios: 3, notificarGrupo: "todos" }, [{ nome: "Ana", lat: -23.551 }, { nome: "Beto", lat: -23.552 }, { nome: "Caio", lat: -23.553 }, { nome: "Duda", lat: -23.554 }]);
  const id = await t.pedir();
  const oa = await t.oferta("Ana"), ob = await t.oferta("Beto");
  assert.ok(oa && ob, "dois motoristas tocando ao mesmo tempo");
  assert.deepEqual((await t.tocando()).sort(), ["Ana", "Beto", "Caio"], "só até o limite de 3 motoristas (a quarta não toca)");
  assert.equal((await chamar("POST", `${t.API}/ofertas/${ob.id}/aceitar`, {}, t.tokens.Beto)).status, 200);
  assert.deepEqual(await t.tocando(), [], "os outros pararam de tocar");
  assert.equal(C.listarProprias(t.E.id).find((c) => c.id === id)!.motorista, "Beto");
  const tarde = await chamar("POST", `${t.API}/ofertas/${oa.id}/aceitar`, {}, t.tokens.Ana);
  assert.equal(tarde.status, 400, "a chamada de quem perdeu já fechou");
});

test("aceite simultâneo de dois motoristas: só um ganha, o outro recebe 'já aceita'", async () => {
  const t = await montar({ metodo: "primeiro_aceitar", limiteMotoristas: 2, notificarGrupo: "todos" }, [{ nome: "Ana", lat: -23.551 }, { nome: "Beto", lat: -23.552 }]);
  await t.pedir();
  const oa = await t.oferta("Ana"), ob = await t.oferta("Beto");
  const [ra, rb] = await Promise.all([chamar("POST", `${t.API}/ofertas/${oa.id}/aceitar`, {}, t.tokens.Ana), chamar("POST", `${t.API}/ofertas/${ob.id}/aceitar`, {}, t.tokens.Beto)]);
  assert.deepEqual([ra.status, rb.status].sort(), [200, 400], JSON.stringify([ra.corpo, rb.corpo]));
  const perdeu = ra.status === 400 ? ra : rb;
  assert.match(String(perdeu.corpo.erro), /já aceita|já passou|não está mais disponível/i);
  assert.equal((await t.tocando()).length, 0);
});

// 2 --------------------------------------------------------------------------------------------------
test("mais próximo: chama um motorista por vez; recusa passa ao seguinte", async () => {
  const t = await montar({ metodo: "mais_proximo" }, [{ nome: "Ana", lat: -23.551 }, { nome: "Beto", lat: -23.56 }]);
  await t.pedir();
  const o = await t.oferta("Ana");
  assert.ok(o);
  assert.deepEqual(await t.tocando(), ["Ana"], "só o mais perto toca");
  await chamar("POST", `${t.API}/ofertas/${o.id}/recusar`, {}, t.tokens.Ana);
  assert.ok(await t.oferta("Beto"), "recusou: toca para o próximo");
  assert.deepEqual(await t.tocando(), ["Beto"]);
});

test("fila virtual: quem está online há mais tempo recebe primeiro, mesmo estando mais longe", async () => {
  const t = await montar({ metodo: "fila_virtual" }, [{ nome: "Longe", lat: -23.57 }, { nome: "Perto", lat: -23.551 }]);
  await t.pedir();
  assert.ok(await t.oferta("Longe"));
  assert.deepEqual(await t.tocando(), ["Longe"]);
});

// 3 --------------------------------------------------------------------------------------------------
test("motorista aceita e desiste: a corrida volta a procurar, toca para outro e quem desistiu não recebe a mesma de novo", async () => {
  const t = await montar({ metodo: "mais_proximo" }, [{ nome: "Ana", lat: -23.551 }, { nome: "Beto", lat: -23.56 }]);
  const id = await t.pedir();
  const o = await t.oferta("Ana");
  await chamar("POST", `${t.API}/ofertas/${o.id}/aceitar`, {}, t.tokens.Ana);
  const r = await chamar("POST", `${t.API}/corridas/${id}/cancelar`, { motivo: "Problema no veículo" }, t.tokens.Ana);
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.ok(await t.oferta("Beto"), "Beto recebe");
  assert.equal(await t.oferta("Ana", 600), null, "Ana não recebe a mesma de novo");
});

// 4 --------------------------------------------------------------------------------------------------
test("passageiro cancela com chamadas tocando: todos os toques param", async () => {
  const t = await montar({ metodo: "primeiro_aceitar", limiteMotoristas: 3, notificarGrupo: "todos" }, [{ nome: "Ana", lat: -23.551 }, { nome: "Beto", lat: -23.552 }, { nome: "Caio", lat: -23.553 }]);
  const id = await t.pedir();
  await t.oferta("Caio");
  assert.equal((await t.tocando()).length, 3);
  assert.equal((await chamar("POST", `${t.API}/corridas/${id}/cancelar`, {}, t.passageiro)).status, 200);
  await esperar(2300); // o vigia limpa as chamadas
  assert.deepEqual(await t.tocando(), []);
});

// 5 --------------------------------------------------------------------------------------------------
test("ninguém aceita: depois do máximo de tentativas a corrida cai em pendência (continua procurando, sem chamar o terceiro)", async () => {
  const t = await montar({ metodo: "mais_proximo", maxTentativas: 2, tempoPendencia: 0 }, [{ nome: "Ana", lat: -23.551 }, { nome: "Beto", lat: -23.552 }, { nome: "Caio", lat: -23.553 }]);
  const id = await t.pedir();
  for (const nome of ["Ana", "Beto"]) { const o = await t.oferta(nome); assert.ok(o, nome); await chamar("POST", `${t.API}/ofertas/${o.id}/recusar`, {}, t.tokens[nome]); }
  await esperar(2300);
  const c = C.listarProprias(t.E.id).find((x) => x.id === id)!;
  assert.equal(c.status, "procurando", "não cancela na hora: fica pendente");
  assert.ok(c.pendenciaDesde, "marcada como pendente");
  assert.equal(C.corridaPropriaParaPainel(c).statusTexto, "Pendente");
  assert.equal(await t.oferta("Caio", 500), null, "o terceiro não foi chamado: o máximo era 2 tentativas");
  const abertas = await chamar("GET", `${t.API}/corridas-abertas`, undefined, t.tokens.Caio);
  const lista = (abertas.corpo as any)?.pendentes ?? [];
  assert.ok(lista.some((x: any) => x.id === id && x.emPendencia), "aparece na aba Pendentes do motorista");
  // cancelamento automático por tempo configurável: dentro do prazo não cancela, passado o prazo cancela com o texto do passageiro
  assert.equal(await C.encerrarSemMotorista(t.E.id, 10), 0);
  assert.equal(await C.encerrarSemMotorista(t.E.id, 0), 0, "0 = nunca cancela");
  await esperar(1100);
  assert.equal(await C.encerrarSemMotorista(t.E.id, 1 / 60), 1);
  assert.equal(C.listarProprias(t.E.id).find((x) => x.id === id)!.status, "nao_atendida");
});

test("tempo em pendência: depois das tentativas a corrida espera, sem chamar ninguém", async () => {
  const t = await montar({ metodo: "mais_proximo", maxTentativas: 1, tempoPendencia: 5 }, [{ nome: "Ana", lat: -23.551 }, { nome: "Beto", lat: -23.552 }]);
  const id = await t.pedir();
  const o = await t.oferta("Ana");
  await chamar("POST", `${t.API}/ofertas/${o.id}/recusar`, {}, t.tokens.Ana);
  await esperar(2300);
  assert.equal(C.listarProprias(t.E.id).find((c) => c.id === id)!.status, "procurando", "em pendência, ainda procurando");
  assert.deepEqual(await t.tocando(), [], "ninguém é chamado durante a pendência");
});

// 6 --------------------------------------------------------------------------------------------------
test("fora do raio e categoria diferente não recebem; quem está no raio e na categoria recebe", async () => {
  const t = await montar({ metodo: "primeiro_aceitar", limiteMotoristas: 10, notificarGrupo: "todos", raioMetros: 3000 }, [
    { nome: "Dentro", lat: -23.552 }, { nome: "Longe", lat: -23.7 }, { nome: "SoMoto", lat: -23.551, categorias: "Moto" },
  ]);
  await t.pedir();
  assert.ok(await t.oferta("Dentro"));
  assert.deepEqual(await t.tocando(), ["Dentro"], "fora do raio e outra categoria não tocam");
});

// 7 --------------------------------------------------------------------------------------------------
test("aceitar próxima corrida: motorista em viagem perto do destino só recebe se a regra estiver ligada", async () => {
  for (const [permitir, esperado] of [[false, null], [true, "ok"]] as const) {
    const t = await montar({ metodo: "mais_proximo", permitirProxima: permitir, distanciaProxima: 800 }, [{ nome: "Ana", lat: -23.551 }]);
    const primeira = await t.pedir({ destino: { texto: "Perto", lat: -23.5505, lng: -46.63 } });
    const o = await t.oferta("Ana");
    await chamar("POST", `${t.API}/ofertas/${o.id}/aceitar`, {}, t.tokens.Ana);
    for (const s of ["no_local", "em_andamento"]) await chamar("POST", `${t.API}/corridas/${primeira}/status`, { status: s }, t.tokens.Ana);
    await chamar("POST", `${t.API}/posicao`, { lat: -23.5503, lng: -46.63 }, t.tokens.Ana); // quase no destino final
    const tp2 = await t.login("passageiro", `1197${seq}000001`, "Outra Cliente");
    const r2 = await chamar("POST", `${t.API}/corridas`, { embarque: { texto: "X", lat: -23.5504, lng: -46.63 }, destino: DESTINO, categoria: "Econômico", pagamento: "Pix", pedidoId: `q-${seq}` }, tp2);
    assert.equal(r2.status, 200, JSON.stringify(r2.corpo));
    const nova = await t.oferta("Ana", 1200);
    assert.equal(nova ? "ok" : null, esperado, `permitirProxima=${permitir}`);
  }
});
