// SOS dos apps de ponta a ponta: o app envia, o painel lista, o motorista próximo recebe (o de longe não), a central atende e encerra.
// Tudo local, sem internet. Rodar: npx tsx --test test/apps-sos.test.ts (na pasta painel).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "apps-sos-teste-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "t".repeat(40);
process.env.APPS_MOSTRAR_CODIGO = "1";
process.env.APPS_CODIGOS_POR_IP = "1000";
process.env.OSRM_PUBLICO = "0";
process.env.NOMINATIM_PUBLICO = "0";

const express = (await import("express")).default;
const D = await import("../src/servidor/dados.ts");
const { criarCookie, exigirLogin } = await import("../src/servidor/sessao.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar } = await import("../src/cadastros/armazem.ts");
const { rotasApps, rotasAppsCentral } = await import("../src/apps/rotas.ts");
const { aguardar } = await import("../src/apps/eventos.ts");
const { definirEnvioWhatsDeTeste } = await import("../src/apps/sos.ts");
const { salvarGerais } = await import("../src/config/gerais.ts");
const { central } = await import("../src/config/central-notificacoes.ts");

const app = express();
app.use(express.json());
app.post("/teste/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({ ok: true }); });
app.use("/api/apps", rotasApps);
app.use("/api", exigirLogin);
app.use("/api/apps-central", rotasAppsCentral);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => servidor.close());

const E = D.criarEmpresa("Central SOS");
const admin = D.criarUsuario({ email: "admin@sos.test", nome: "Ana", senha: "senha-forte-1", empresaId: E.id, papel: "admin" });
const API = `/api/apps/${E.id}`;
const AQUI = { lat: -23.55, lng: -46.63 };

async function chamar(metodo: string, url: string, corpo?: unknown, token?: string, cookie?: string) {
  const r = await fetch(base + url, { method: metodo, headers: { ...(corpo !== undefined ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...(cookie ? { cookie } : {}) }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  return { status: r.status, corpo: (await r.json().catch(() => ({}))) as any };
}
async function entrar(papel: "passageiro" | "motorista", telefone: string) {
  const c = await chamar("POST", `${API}/entrar/codigo`, { papel, telefone });
  const t = (await chamar("POST", `${API}/entrar`, { papel, telefone, codigo: c.corpo.codigoTeste })).corpo.token as string;
  if (papel === "passageiro") await chamar("POST", `${API}/eu`, { nome: "Paula Passageira" }, t);
  return t;
}
const motorista = async (nome: string, telefone: string, lat: number, lng: number) => {
  const m = criar(E.id, cadastroPorId("motoristas")!, { nome, telefone, status: "Ativo" }, "teste") as any;
  const t = await entrar("motorista", telefone);
  assert.equal((await chamar("POST", `${API}/online`, { lat, lng }, t)).status, 200);
  return { token: t, id: String(m.id ?? m.registro?.id) };
};
const entrarNoPainel = async (id: string) => (await fetch(`${base}/teste/entrar/${id}`, { method: "POST" })).headers.get("set-cookie")!.split(";")[0];

test("SOS de ponta a ponta: app envia, painel lista, motorista próximo recebe, longe não, atende e encerra", async () => {
  const cookie = await entrarNoPainel(admin.id);
  salvarGerais(E.id, { suporte: { whatsappEmergencia: "5511988880000" } });
  const zaps: Array<{ para: string; texto: string }> = [];
  definirEnvioWhatsDeTeste(async (_e, para, texto) => { zaps.push({ para, texto }); });

  const perto = await motorista("Lia Perto", "11900000011", AQUI.lat + 0.01, AQUI.lng); // ~1,1 km
  const longe = await motorista("Caio Longe", "11900000012", AQUI.lat + 0.1, AQUI.lng); // ~11 km
  const tokP = await entrar("passageiro", "11988887777");
  assert.deepEqual((await chamar("GET", `${API}/sos/proximos`, undefined, perto.token)).corpo.alertas, []);

  // 1. O app do passageiro envia o SOS (sem corrida) com a posição.
  const env = await chamar("POST", `${API}/sos`, { ...AQUI, motivo: "Me sinto em risco" }, tokP);
  assert.equal(env.status, 200, JSON.stringify(env.corpo));
  assert.equal(env.corpo.alerta.situacao, "aberto");
  assert.equal(env.corpo.alerta.avisouMotoristas, 1, "só o motorista de perto foi avisado");
  const id = env.corpo.alerta.id as string;
  assert.equal((await chamar("POST", `${API}/sos`, AQUI, tokP)).corpo.alerta.id, id, "repetir o toque não abre outro alerta");

  // 2. O painel lista, com os dados de quem pediu.
  const lista = (await chamar("GET", "/api/apps-central/sos", undefined, undefined, cookie)).corpo;
  assert.equal(lista.alertas.length, 1);
  assert.equal(lista.abertos, 1);
  const a = lista.alertas[0];
  assert.equal(a.nome, "Paula Passageira");
  assert.equal(a.telefone, "11988887777");
  assert.equal(a.papel, "passageiro");
  assert.equal(a.lat, AQUI.lat);
  assert.equal(a.motivo, "Me sinto em risco");
  assert.equal(a.notificados, 1);
  assert.equal((await chamar("GET", "/api/apps-central/sos/resumo", undefined, undefined, cookie)).corpo.abertos, 1);
  assert.ok(central(E.id, "admin@sos.test", false).itens.some((n) => n.chave === `sos:${id}` && n.nivel === "urgente"), "aparece no sino do painel");

  // 3. WhatsApp de emergência da empresa.
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(zaps.length, 1);
  assert.equal(zaps[0].para, "5511988880000");
  assert.match(zaps[0].texto, /Paula Passageira/);

  // 4. O motorista próximo recebe por evento, por consulta e na lista de avisos; o de longe não.
  const ev = await aguardar(E.id, { papel: "motorista", chave: perto.id }, 0, 50);
  assert.ok(ev.eventos.some((x) => x.tipo === "sos"), "evento em tempo real");
  const prox = (await chamar("GET", `${API}/sos/proximos`, undefined, perto.token)).corpo.alertas;
  assert.equal(prox.length, 1);
  assert.equal(prox[0].id, id);
  assert.equal(prox[0].telefone, undefined, "não mostra o telefone aos outros motoristas");
  assert.ok(prox[0].distanciaKm > 0.5 && prox[0].distanciaKm < 2);
  assert.equal((await chamar("GET", `${API}/notificacoes`, undefined, perto.token)).corpo.notificacoes[0].emergencia, true);
  assert.deepEqual((await chamar("GET", `${API}/sos/proximos`, undefined, longe.token)).corpo.alertas, []);
  assert.equal((await aguardar(E.id, { papel: "motorista", chave: longe.id }, 0, 50)).eventos.filter((x) => x.tipo === "sos").length, 0);
  assert.equal((await chamar("GET", `${API}/sos/proximos`, undefined, tokP)).status, 403, "passageiro não usa a lista de próximos");

  // 5. A central atende: o app vê "atendido" e quem atendeu.
  assert.equal((await chamar("GET", `${API}/sos/meu`, undefined, tokP)).corpo.alertas[0].situacao, "aberto");
  const at = await chamar("POST", `/api/apps-central/sos/${id}/atender`, {}, undefined, cookie);
  assert.equal(at.corpo.alerta.situacao, "atendido");
  assert.equal(at.corpo.alerta.atendidoPor, "Ana");
  const meu = (await chamar("GET", `${API}/sos/meu`, undefined, tokP)).corpo.alertas[0];
  assert.equal(meu.situacao, "atendido");
  assert.equal(meu.atendidoPor, "Ana");
  assert.equal((await chamar("GET", "/api/apps-central/sos/resumo", undefined, undefined, cookie)).corpo.abertos, 0);
  assert.equal((await chamar("GET", `${API}/sos/proximos`, undefined, perto.token)).corpo.alertas.length, 1, "atendido ainda vale para quem está perto");

  // 6. Encerra com observação: some para os motoristas, fica no histórico.
  const en = await chamar("POST", `/api/apps-central/sos/${id}/encerrar`, { observacao: "Foi engano, falei com a passageira." }, undefined, cookie);
  assert.equal(en.corpo.alerta.situacao, "encerrado");
  assert.equal(en.corpo.alerta.observacao, "Foi engano, falei com a passageira.");
  assert.deepEqual((await chamar("GET", `${API}/sos/proximos`, undefined, perto.token)).corpo.alertas, []);
  assert.equal((await chamar("GET", `${API}/sos/meu`, undefined, tokP)).corpo.alertas[0].situacao, "encerrado");
  const hist = (await chamar("GET", "/api/apps-central/sos?situacao=encerrado", undefined, undefined, cookie)).corpo;
  assert.equal(hist.alertas.length, 1);
  assert.equal(hist.alertas[0].encerradoPor, "Ana");
  assert.ok(!central(E.id, "admin@sos.test", false).itens.some((n) => n.chave === `sos:${id}`));
});

test("SOS do motorista sem GPS no pedido usa a última posição; raio 0 desliga o aviso aos vizinhos", async () => {
  const cookie = await entrarNoPainel(admin.id);
  const a = await motorista("Rui Aflito", "11900000021", -22.9, -43.2);
  const b = await motorista("Teo Vizinho", "11900000022", -22.9, -43.2);
  const r1 = await chamar("POST", `${API}/sos`, {}, a.token);
  assert.equal(r1.status, 200);
  assert.equal(r1.corpo.alerta.lat, -22.9);
  assert.equal(r1.corpo.alerta.avisouMotoristas, 1, "o vizinho foi avisado, quem pediu não");
  assert.equal((await chamar("GET", `${API}/sos/proximos`, undefined, a.token)).corpo.alertas.length, 0, "não vê o próprio alerta");
  assert.equal((await chamar("GET", `${API}/sos/proximos`, undefined, b.token)).corpo.alertas.length, 1);
  await chamar("POST", `/api/apps-central/sos/${r1.corpo.alerta.id}/encerrar`, {}, undefined, cookie);

  salvarGerais(E.id, { motorista: { raioPanicoKm: 0 } });
  const c = await motorista("Ivo Aflito", "11900000023", -22.9, -43.2);
  const r2 = await chamar("POST", `${API}/sos`, { lat: -22.9, lng: -43.2 }, c.token);
  assert.equal(r2.corpo.alerta.avisouMotoristas, 0);
  assert.equal((await chamar("GET", `${API}/sos/proximos`, undefined, b.token)).corpo.alertas.length, 0);
  assert.equal((await chamar("GET", "/api/apps-central/sos", undefined, undefined, cookie)).corpo.pendentes, 1, "a central ainda recebe");
});

test("SOS com corrida inexistente é recusado; outra empresa não vê alertas", async () => {
  const outra = D.criarEmpresa("Outra Central");
  const admB = D.criarUsuario({ email: "admin@outra.test", nome: "Bia", senha: "senha-forte-1", empresaId: outra.id, papel: "admin" });
  const cookieB = await entrarNoPainel(admB.id);
  assert.deepEqual((await chamar("GET", "/api/apps-central/sos", undefined, undefined, cookieB)).corpo.alertas, []);
  const tokP = await entrar("passageiro", "11977776666");
  assert.equal((await chamar("POST", `${API}/corridas/inexistente/sos`, AQUI, tokP)).status, 400);
  assert.equal((await chamar("POST", `${API}/sos`, { ...AQUI, corridaId: "inexistente" }, tokP)).status, 400);
});
