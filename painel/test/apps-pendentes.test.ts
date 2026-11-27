// Itens do painel que afetam os apps e estavam "pendentes" em docs/TESTE_PAINEL_APPS.md: Empresas conveniadas, Áreas (bloqueio),
// Transbordos, Descontos, Recuperação de Vendas, Termos/Privacidade, Central de suporte e Filiais/cidades. Tudo local, sem internet.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "apps-pendentes-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "t".repeat(40);
process.env.APPS_MOSTRAR_CODIGO = "1";
process.env.APPS_CODIGOS_POR_IP = "1000";
process.env.OSRM_PUBLICO = "0";
process.env.NOMINATIM_PUBLICO = "0";
delete process.env.BANCO_ARQUIVO;

const express = (await import("express")).default;
const D = await import("../src/servidor/dados.ts");
const B = await import("../src/servidor/banco.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar } = await import("../src/cadastros/armazem.ts");
const { rotasApps } = await import("../src/apps/rotas.ts");
const C = await import("../src/corridas/index.ts");
const P = await import("../src/apps/despacho.ts");
const { salvarDespacho } = await import("../src/config/despacho.ts");
const { salvarCategoria } = await import("../src/config/categorias.ts");
const { salvarMatriz } = await import("../src/config/descontos-matriz.ts");
const { gravarG } = await import("../src/gestao/armazem.ts");
const { salvarTermos } = await import("../src/config/gerais.ts");
const { cotacoes } = await import("../src/operacao/radar.ts");
const End = await import("../src/enderecos/index.ts");

const app = express();
app.use(express.json());
app.use("/api/apps", rotasApps);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => { servidor.closeAllConnections(); servidor.close(); B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

const EMB = { texto: "Rua das Flores, 100", lat: -23.55, lng: -46.63 }, DEST = { texto: "Av. Central, 2000", lat: -23.6, lng: -46.66 };
async function chamar(metodo: string, url: string, corpo?: unknown, token?: string) {
  const r = await fetch(base + url, { method: metodo, headers: { ...(corpo !== undefined ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  return { status: r.status, corpo: (await r.json().catch(() => ({}))) as Record<string, any> };
}
const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
let seq = 0;

async function central(extra: { cidadeCategoria?: string; cidadeMotorista?: string } = {}) {
  const n = ++seq;
  const E = D.criarEmpresa(`Pendentes ${n}`);
  salvarCategoria(E.id, null, { nome: "Econômico", taxaBase: 5, precoKm: 2, tarifaMinima: 9.9, extra: extra.cidadeCategoria ? { cidade: extra.cidadeCategoria } : undefined }, "teste");
  salvarDespacho(E.id, { raioMetros: 5000, metodo: "primeiro_aceitar" });
  const API = `/api/apps/${E.id}`;
  const login = async (papel: string, telefone: string, nome?: string) => {
    const c = await chamar("POST", `${API}/entrar/codigo`, { papel, telefone });
    const t = (await chamar("POST", `${API}/entrar`, { papel, telefone, codigo: c.corpo.codigoTeste })).corpo.token as string;
    if (papel === "passageiro") await chamar("POST", `${API}/eu`, { nome: nome ?? "Cliente Teste" }, t);
    return t;
  };
  const telM = `1190${n}00001`, telP = `1198${n}000000`;
  criar(E.id, cadastroPorId("motoristas")!, { nome: "Motora", telefone: telM, status: "Ativo", ...(extra.cidadeMotorista ? { cidade: extra.cidadeMotorista } : {}) }, "teste");
  const tm = await login("motorista", telM), tp = await login("passageiro", telP);
  assert.equal((await chamar("POST", `${API}/online`, { lat: -23.551, lng: -46.63 }, tm)).status, 200);
  const oferta = async (ms = 1500) => { for (let t = 0; t < ms; t += 150) { const o = (await chamar("GET", `${API}/estado`, undefined, tm)).corpo.oferta; if (o) return o; await esperar(150); } return null; };
  const pedir = (extraCorpo: Record<string, unknown> = {}) => chamar("POST", `${API}/corridas`, { embarque: EMB, destino: DEST, categoria: "Econômico", pagamento: "Pix", pedidoId: `p-${n}-${++seq}`, ...extraCorpo }, tp);
  const estimar = () => chamar("GET", `${API}/estimativa?latEmbarque=${EMB.lat}&lngEmbarque=${EMB.lng}&latDestino=${DEST.lat}&lngDestino=${DEST.lng}&categoria=${encodeURIComponent("Econômico")}&pagamento=Pix`, undefined, tp);
  return { E, API, tm, tp, oferta, pedir, estimar };
}

test("Cadastro › Empresas: a observação da empresa conveniada chega ao motorista na chamada", async () => {
  const t = await central();
  criar(t.E.id, cadastroPorId("conveniadas")!, { nome: "Padaria Central", cnpj: "11222333000181", status: "Ativa", obsMotorista: "Retirar o pacote na recepção" }, "teste");
  await C.criarCorridaPropria(t.E.id, { passageiro: { nome: "Cliente Empresa", telefone: "11977770000" }, embarque: EMB, destino: DEST, categoria: "Econômico", pagamento: "Pix", empresaConveniada: "Padaria Central", canal: "painel" } as never);
  P.despachar(t.E.id);
  const o = await t.oferta(3000);
  assert.ok(o, "o motorista recebe a chamada da corrida da empresa");
  assert.match(JSON.stringify(o), /Retirar o pacote na recepção/);
});

test("Cadastro › Áreas: área de bloqueio impede o pedido do passageiro dentro dela", async () => {
  const t = await central();
  const ok = await t.pedir();
  assert.equal(ok.status, 200, "sem área, o pedido passa");
  await chamar("POST", `${t.API}/corridas/${ok.corpo.corrida.id}/cancelar`, { motivo: "teste" }, t.tp);
  gravarG(t.E.id, "areas", [{ id: "a1", nome: "Zona de risco", poligono: [[-23.56, -46.64], [-23.56, -46.62], [-23.54, -46.62], [-23.54, -46.64]], prioridade: 3, bloqueio: { ativo: true, horarios: [] } }]);
  const r = await t.pedir();
  assert.notEqual(r.status, 200);
  assert.match(String(r.corpo.erro), /bloqueio|Zona de risco/i);
});

test("Configurações › Transbordos: desligado, motorista de outra cidade não é chamado; ligado, é", async () => {
  const t = await central({ cidadeCategoria: "Leme", cidadeMotorista: "Pitangueiras" });
  salvarDespacho(t.E.id, { raioMetros: 5000, metodo: "primeiro_aceitar", permitirTransbordo: false });
  const p1 = await t.pedir();
  assert.equal(p1.status, 200);
  assert.equal(await t.oferta(1200), null, "transbordo desligado: ninguém é chamado");
  await chamar("POST", `${t.API}/corridas/${p1.corpo.corrida.id}/cancelar`, { motivo: "teste" }, t.tp);
  salvarDespacho(t.E.id, { raioMetros: 5000, metodo: "primeiro_aceitar", permitirTransbordo: true });
  assert.equal((await t.pedir()).status, 200);
  assert.ok(await t.oferta(3000), "transbordo ligado: o motorista de outra cidade é chamado");
});

test("Configurações › Descontos: a matriz por forma de pagamento baixa o valor que o passageiro vê", async () => {
  const t = await central();
  const antes = (await t.estimar()).corpo;
  assert.ok(antes.valor > 0, JSON.stringify(antes).slice(0, 200));
  salvarMatriz(t.E.id, { pix: { app1: 10, maximo: 20 } });
  const depois = (await t.estimar()).corpo;
  assert.ok(depois.valor < antes.valor, `com 10% de desconto no Pix o valor cai (${antes.valor} -> ${depois.valor})`);
  assert.ok(Math.abs(depois.valor - antes.valor * 0.9) < 0.02);
});

test("CRM › Recuperação de Vendas: cada cotação do passageiro entra no radar", async () => {
  const t = await central();
  assert.equal(cotacoes(t.E.id).length, 0);
  assert.equal((await t.estimar()).status, 200);
  const l = cotacoes(t.E.id);
  assert.equal(l.length, 1);
  assert.equal(l[0].categoria, "Econômico");
  assert.ok(l[0].valor && l[0].valor > 0);
});

test("Configurações › Termos: a política de privacidade escrita no painel aparece no app", async () => {
  const t = await central();
  salvarTermos(t.E.id, { privacidade: "Usamos seus dados só para a corrida." });
  const r = await chamar("GET", `${t.API}/termos/privacidade`);
  assert.equal(r.status, 200);
  assert.equal(r.corpo.texto, "Usamos seus dados só para a corrida.");
  assert.equal((await chamar("GET", `${t.API}/termos/outro`)).status, 404);
});

test("Central de suporte: telefone e e-mail do painel chegam ao app e a conversa de suporte funciona", async () => {
  const t = await central();
  const m = await chamar("GET", `${t.API}/marca`);
  assert.ok(m.corpo.suporte && typeof m.corpo.suporte.email === "string" && typeof m.corpo.suporte.telefone === "string");
  const w = await chamar("POST", `${t.API}/suporte`, { texto: "Preciso de ajuda com a corrida" }, t.tp);
  assert.equal(w.status, 200, JSON.stringify(w.corpo));
  assert.match(JSON.stringify((await chamar("GET", `${t.API}/suporte`, undefined, t.tp)).corpo), /Preciso de ajuda/);
});

test("Cadastro › Filiais/cidades: as cidades atendidas do painel são as que o app lista", async () => {
  const t = await central();
  const mun = End.municipios();
  if (!mun.length) return; // sem a lista de municípios nesta instalação de teste: a prova de cidades está em casas-importacao.test.ts
  End.salvarConfig(t.E.id, { municipios: [mun[0].codigo] });
  const r = await chamar("GET", `${t.API}/cidades`);
  assert.equal(r.status, 200);
  assert.equal(r.corpo.cidades.length, 1);
  assert.equal(r.corpo.cidades[0].nome, mun[0].nome);
});
