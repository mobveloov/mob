// Áreas (prioridade e bloqueio), Plantão, Ruas, Funil de Clientes e Mapa de Bairros: regras, despacho e isolamento por empresa.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-plarua-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "p".repeat(40);
delete process.env.BANCO_ARQUIVO;
delete process.env.OSRM_URL;

const express = (await import("express")).default;
const D = await import("../src/servidor/dados.ts");
const { criarCookie, exigirLogin } = await import("../src/servidor/sessao.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar } = await import("../src/cadastros/armazem.ts");
const R = await import("../src/corridas/index.ts");
const P = await import("../src/apps/despacho.ts");
const B = await import("../src/servidor/banco.ts");
const { rotasGestao } = await import("../src/gestao/rotas.ts");
const { rotasAreas } = await import("../src/areas/rotas.ts");
const A = await import("../src/areas/areas.ts");
const Ru = await import("../src/areas/ruas.ts");
const { agoraBr } = await import("../src/servidor/util.ts");

const app = express();
app.use(express.json());
app.post("/teste/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({ ok: true }); });
app.use("/api", exigirLogin);
app.use("/api/gestao", rotasGestao);
app.use("/api/areas", rotasAreas);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => { servidor.closeAllConnections(); servidor.close(); B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

const E = D.criarEmpresa("Plarua Um").id, E2 = D.criarEmpresa("Plarua Dois").id;
const admin = D.criarUsuario({ email: "adm@plarua.test", nome: "Adm", senha: "senha-forte-1", empresaId: E, papel: "admin" });
const oper = D.criarUsuario({ email: "op@plarua.test", nome: "Op", senha: "senha-forte-2", empresaId: E, papel: "operador" });
const admin2 = D.criarUsuario({ email: "adm2@plarua.test", nome: "Adm2", senha: "senha-forte-3", empresaId: E2, papel: "admin" });
const MOT = cadastroPorId("motoristas")!, CAT = cadastroPorId("categorias")!, CLI = cadastroPorId("clientes")!;
criar(E, CAT, { nome: "Carro", bandeirada: 5, valorKm: 2, valorMinimo: 8, ativa: true }, "t");
criar(E2, CAT, { nome: "Carro", bandeirada: 5, valorKm: 2, valorMinimo: 8, ativa: true }, "t");
const perto = criar(E, MOT, { nome: "Perto Pedro", telefone: "11910000001", status: "Ativo", nivel: "Secundário", viatura: "V-10" }, "t");
const longe = criar(E, MOT, { nome: "Longe Luana", telefone: "11910000002", status: "Ativo", nivel: "Secundário", viatura: "V-20" }, "t");

async function cookie(id: string) { return ((await fetch(`${base}/teste/entrar/${id}`, { method: "POST" })).headers.get("set-cookie") ?? "").split(";")[0]; }
async function chamar(metodo: string, url: string, quem: string, corpo?: unknown) {
  const r = await fetch(base + url, { method: metodo, headers: { cookie: quem, ...(corpo !== undefined ? { "content-type": "application/json" } : {}) }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  const tipo = r.headers.get("content-type") ?? "";
  return { status: r.status, texto: tipo.includes("json") ? "" : await r.text(), corpo: (tipo.includes("json") ? await r.json().catch(() => ({})) : {}) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
const cAdm = await cookie(admin.id), cOp = await cookie(oper.id), cAdm2 = await cookie(admin2.id);

const EMB = { texto: "Rua A, 10 - Centro, Leme/SP", lat: -23.55, lng: -46.63 };
let tel = 11930000000;
const pedirEm = (empresa: string, embarque = EMB) => R.criarCorridaPropria(empresa, { passageiro: { nome: "Paula", telefone: String(++tel) }, embarque, destino: { texto: "Rua B", lat: -23.58, lng: -46.65 }, categoria: "Carro", pagamento: "Pix", canal: "painel" });
const recebe = (id: string) => P.ofertaDoMotorista(E, id) != null;
function limpar(...ids: string[]) { for (const id of ids) P.ficarOffline(E, id); }
function encerrarAbertas() { for (const c of R.listarProprias(E).filter((x) => x.status === "procurando")) R.cancelarCorrida(E, c.id, "Central", "limpeza do teste"); }
const quadrado = (lat0: number, lat1: number, lng0: number, lng1: number) => [[lat0, lng0], [lat0, lng1], [lat1, lng1], [lat1, lng0]];
const hhmm = (mais: number) => { const d = new Date(agoraBr().getTime() + mais * 3_600_000); return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`; };

// ====================================================================== áreas

test("áreas: prioridade, cor e bloqueio são validados e ficam por empresa", async () => {
  const ok = await chamar("POST", "/api/gestao/areas", cAdm, { nome: "Centro", poligono: quadrado(-23.6, -23.5, -46.7, -46.6), prioridade: 3, cor: "Azul", bloqueio: { ativo: false, horarios: [] } });
  assert.equal(ok.status, 200, JSON.stringify(ok.corpo));
  assert.equal(ok.corpo.area.prioridade, 3);
  assert.equal(ok.corpo.area.cor, "Azul");
  assert.equal((await chamar("POST", "/api/gestao/areas", cAdm, { nome: "Ruim", poligono: quadrado(-23.6, -23.5, -46.7, -46.6), prioridade: 9 })).status, 400);
  assert.equal((await chamar("POST", "/api/gestao/areas", cAdm, { nome: "Hora", poligono: quadrado(-23.6, -23.5, -46.7, -46.6), bloqueio: { ativo: true, horarios: [{ de: "25:00", ate: "06:00" }] } })).status, 400);
  assert.equal((await chamar("POST", "/api/gestao/areas", cAdm, { nome: "SemPerimetro", bloqueio: { ativo: true, horarios: [] } })).status, 400, "bloqueio exige perímetro");
  assert.equal((await chamar("POST", "/api/gestao/areas", cOp, { nome: "Op", poligono: [] })).status, 403, "operador não grava área");
  // Editar sem mandar os campos novos preserva a prioridade.
  const ed = await chamar("PUT", `/api/gestao/areas/${ok.corpo.area.id}`, cAdm, { nome: "Centro", poligono: quadrado(-23.6, -23.5, -46.7, -46.6) });
  assert.equal(ed.corpo.area.prioridade, 3);
  assert.equal((await chamar("GET", "/api/gestao/areas", cAdm2)).corpo.areas.length, 0, "outra empresa não vê");
  await chamar("DELETE", `/api/gestao/areas/${ok.corpo.area.id}`, cAdm);
});

test("bloqueio: horário programado (inclusive virando a meia-noite) e contínuo sem horário", () => {
  const area = (horarios: Array<{ de: string; ate: string }>, ativo = true) => ({ id: "a", nome: "A", poligono: [] as [number, number][], bloqueio: { ativo, horarios } });
  const as = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 13, h, m));
  assert.equal(A.bloqueioVale(area([]), as(3)), true, "sem horário: contínuo");
  assert.equal(A.bloqueioVale(area([], false), as(3)), false, "desativado");
  assert.equal(A.bloqueioVale(area([{ de: "08:00", ate: "18:00" }]), as(12)), true);
  assert.equal(A.bloqueioVale(area([{ de: "08:00", ate: "18:00" }]), as(19)), false);
  assert.equal(A.bloqueioVale(area([{ de: "22:00", ate: "06:00" }]), as(23, 30)), true, "noite, antes da meia-noite");
  assert.equal(A.bloqueioVale(area([{ de: "22:00", ate: "06:00" }]), as(5, 59)), true, "madrugada");
  assert.equal(A.bloqueioVale(area([{ de: "22:00", ate: "06:00" }]), as(12)), false);
});

test("solicitação em área de bloqueio é recusada; fora do horário ou desligada, passa", async () => {
  const a = await chamar("POST", "/api/gestao/areas", cAdm, { nome: "Risco", poligono: quadrado(-23.6, -23.5, -46.7, -46.6), bloqueio: { ativo: true, horarios: [] } });
  assert.equal(a.status, 200, JSON.stringify(a.corpo));
  await assert.rejects(() => pedirEm(E), /área de bloqueio: Risco/);
  await assert.doesNotReject(() => pedirEm(E, { texto: "Rua longe", lat: -22.0, lng: -45.0 }), "fora da área pode pedir");
  // Horário que não é agora: libera.
  await chamar("PUT", `/api/gestao/areas/${a.corpo.area.id}`, cAdm, { nome: "Risco", poligono: quadrado(-23.6, -23.5, -46.7, -46.6), bloqueio: { ativo: true, horarios: [{ de: hhmm(2), ate: hhmm(3) }] } });
  await assert.doesNotReject(() => pedirEm(E));
  // Horário que inclui agora: bloqueia de novo.
  await chamar("PUT", `/api/gestao/areas/${a.corpo.area.id}`, cAdm, { nome: "Risco", poligono: quadrado(-23.6, -23.5, -46.7, -46.6), bloqueio: { ativo: true, horarios: [{ de: hhmm(-1), ate: hhmm(1) }] } });
  await assert.rejects(() => pedirEm(E), /bloqueio/);
  // Outra empresa não é afetada.
  await assert.doesNotReject(() => pedirEm(E2));
  await chamar("DELETE", `/api/gestao/areas/${a.corpo.area.id}`, cAdm);
  await assert.doesNotReject(() => pedirEm(E), "sem a área, pede normal");
});

test("despacho: corrida já na fila dentro de área de bloqueio não é oferecida a ninguém", async () => {
  encerrarAbertas();
  const c = await pedirEm(E);
  const a = await chamar("POST", "/api/gestao/areas", cAdm, { nome: "Bloq despacho", poligono: quadrado(-23.6, -23.5, -46.7, -46.6), bloqueio: { ativo: true, horarios: [] } });
  P.ficarOnline(E, perto.id, -23.551, -46.631);
  P.despachar(E);
  assert.equal(recebe(perto.id), false, "bloqueada: sem oferta");
  await chamar("PUT", `/api/gestao/areas/${a.corpo.area.id}`, cAdm, { nome: "Bloq despacho", poligono: quadrado(-23.6, -23.5, -46.7, -46.6), bloqueio: { ativo: false, horarios: [] } });
  P.despachar(E);
  assert.ok(recebe(perto.id), "desligado o bloqueio, é oferecida");
  R.cancelarCorrida(E, c.id, "Central", "teste"); limpar(perto.id);
  await chamar("DELETE", `/api/gestao/areas/${a.corpo.area.id}`, cAdm);
});

test("prioridade: em áreas sobrepostas vale a de maior prioridade, e no despacho quem está na área do embarque passa na frente", async () => {
  encerrarAbertas();
  const baixa = await chamar("POST", "/api/gestao/areas", cAdm, { nome: "Baixa", poligono: quadrado(-23.62, -23.5, -46.7, -46.6), prioridade: 1 });
  const alta = await chamar("POST", "/api/gestao/areas", cAdm, { nome: "Alta", poligono: quadrado(-23.6, -23.5495, -46.7, -46.6), prioridade: 4 });
  assert.equal(A.fotoDeAreas(E).principal(-23.55, -46.63)?.nome, "Alta");
  assert.equal(A.fotoDeAreas(E).principal(-23.61, -46.63)?.nome, "Baixa");
  assert.equal(A.fotoDeAreas(E).principal(-22, -45), null);
  // Perto fica ao norte (fora das duas? dentro só da Baixa); Longe fica dentro da Alta, a ~2 km.
  await chamar("DELETE", `/api/gestao/areas/${baixa.corpo.area.id}`, cAdm);
  P.ficarOnline(E, perto.id, -23.549, -46.63); // ~110 m, fora da Alta
  P.ficarOnline(E, longe.id, -23.57, -46.63);  // ~2,2 km, dentro da Alta
  const c = await pedirEm(E);
  P.despachar(E);
  assert.ok(recebe(longe.id), "dentro da área do embarque vence o mais perto");
  assert.equal(recebe(perto.id), false);
  R.cancelarCorrida(E, c.id, "Central", "teste"); limpar(perto.id, longe.id);
  // Sem a área, o mais perto vence.
  await chamar("DELETE", `/api/gestao/areas/${alta.corpo.area.id}`, cAdm);
  P.ficarOnline(E, perto.id, -23.549, -46.63); P.ficarOnline(E, longe.id, -23.57, -46.63);
  const c2 = await pedirEm(E);
  P.despachar(E);
  assert.ok(recebe(perto.id), "sem áreas, o mais perto");
  R.cancelarCorrida(E, c2.id, "Central", "teste"); limpar(perto.id, longe.id);
});

// ====================================================================== plantão

test("plantão: criar, validar datas, escalar motoristas e isolar por empresa", async () => {
  assert.equal((await chamar("POST", "/api/areas/plantoes", cAdm, { dataInicial: "2026-11-20", dataFinal: "2026-11-19" })).status, 400, "fim antes do início");
  assert.equal((await chamar("POST", "/api/areas/plantoes", cAdm, { dataInicial: "", dataFinal: "2026-11-19" })).status, 400);
  assert.equal((await chamar("POST", "/api/areas/plantoes", cAdm, { dataInicial: "2026-11-20", horaInicial: "99:00", dataFinal: "2026-11-21" })).status, 400);
  const r = await chamar("POST", "/api/areas/plantoes", cOp, { dataInicial: "2030-01-01", horaInicial: "08:00", dataFinal: "2030-01-02", horaFinal: "20:00" });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  const id = r.corpo.plantao.id;
  assert.equal(r.corpo.plantao.inicio, "2030-01-01T08:00");
  const add = await chamar("POST", `/api/areas/plantoes/${id}/motoristas`, cAdm, { motoristaId: perto.id });
  assert.equal(add.corpo.plantao.escalados[0].viatura, "V-10");
  assert.equal((await chamar("POST", `/api/areas/plantoes/${id}/motoristas`, cAdm, { motoristaId: perto.id })).status, 400, "repetido");
  assert.equal((await chamar("POST", `/api/areas/plantoes/${id}/motoristas`, cAdm, { motoristaId: "nao-existe" })).status, 404);
  assert.equal((await chamar("GET", "/api/areas/motoristas/busca?q=V-2", cAdm)).corpo.motoristas[0].nome, "Longe Luana");
  // Filtro por período.
  assert.equal((await chamar("GET", "/api/areas/plantoes?dataInicial=2030-01-02&dataFinal=2030-01-03", cAdm)).corpo.plantoes.length, 1);
  assert.equal((await chamar("GET", "/api/areas/plantoes?dataInicial=2031-01-01", cAdm)).corpo.plantoes.length, 0);
  // Outra empresa não vê, não mexe e não escala.
  assert.equal((await chamar("GET", "/api/areas/plantoes", cAdm2)).corpo.plantoes.length, 0);
  assert.equal((await chamar("GET", `/api/areas/plantoes/${id}`, cAdm2)).status, 404);
  assert.equal((await chamar("DELETE", `/api/areas/plantoes/${id}`, cAdm2)).status, 404);
  const rem = await chamar("DELETE", `/api/areas/plantoes/${id}/motoristas/${perto.id}`, cAdm);
  assert.equal(rem.corpo.plantao.escalados.length, 0);
  assert.equal((await chamar("DELETE", `/api/areas/plantoes/${id}`, cAdm)).status, 200);
});

test("despacho: motorista em plantão em vigor tem prioridade sobre o mais perto; plantão vencido não vale", async () => {
  encerrarAbertas();
  const hoje = agoraBr().toISOString().slice(0, 10), ontem = new Date(agoraBr().getTime() - 86_400_000).toISOString().slice(0, 10), amanha = new Date(agoraBr().getTime() + 86_400_000).toISOString().slice(0, 10);
  const vencido = await chamar("POST", "/api/areas/plantoes", cAdm, { dataInicial: "2026-01-01", dataFinal: ontem });
  await chamar("POST", `/api/areas/plantoes/${vencido.corpo.plantao.id}/motoristas`, cAdm, { motoristaId: longe.id });
  P.ficarOnline(E, perto.id, -23.549, -46.63); P.ficarOnline(E, longe.id, -23.57, -46.63);
  const c1 = await pedirEm(E); P.despachar(E);
  assert.ok(recebe(perto.id), "plantão vencido: vence o mais perto");
  R.cancelarCorrida(E, c1.id, "Central", "teste"); limpar(perto.id, longe.id);

  const vigente = await chamar("POST", "/api/areas/plantoes", cAdm, { dataInicial: hoje, dataFinal: amanha });
  await chamar("POST", `/api/areas/plantoes/${vigente.corpo.plantao.id}/motoristas`, cAdm, { motoristaId: longe.id });
  P.ficarOnline(E, perto.id, -23.549, -46.63); P.ficarOnline(E, longe.id, -23.57, -46.63);
  const c2 = await pedirEm(E); P.despachar(E);
  assert.ok(recebe(longe.id), "plantão em vigor: o escalado passa na frente");
  assert.equal(recebe(perto.id), false);
  R.cancelarCorrida(E, c2.id, "Central", "teste"); limpar(perto.id, longe.id);
  await chamar("DELETE", `/api/areas/plantoes/${vencido.corpo.plantao.id}`, cAdm); await chamar("DELETE", `/api/areas/plantoes/${vigente.corpo.plantao.id}`, cAdm);
});

// ====================================================================== ruas

test("ruas: regra de via troca o nome só dentro do traçado, por empresa, e só admin grava", async () => {
  const traco = quadrado(-23.552, -23.548, -46.632, -46.628);
  assert.equal((await chamar("POST", "/api/areas/ruas", cAdm, { nomeExibicao: "Rua do Mercado", poligono: [[-23.55, -46.63]] })).status, 400, "traçado precisa de 3 pontos");
  assert.equal((await chamar("POST", "/api/areas/ruas", cAdm, { nomeExibicao: "", poligono: traco })).status, 400);
  assert.equal((await chamar("POST", "/api/areas/ruas", cOp, { nomeExibicao: "Rua do Mercado", poligono: traco })).status, 403);
  const r = await chamar("POST", "/api/areas/ruas", cAdm, { nomeExibicao: "Rua do Mercado", nomeNoMapa: "Rua Doutor Silva", poligono: traco });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  const end = { texto: "Rua Doutor Silva, 12 - Centro, Leme/SP", rua: "Rua Doutor Silva", lat: -23.55, lng: -46.63 };
  const trocado = Ru.aplicarRegrasDeVia(E, end);
  assert.equal(trocado.rua, "Rua do Mercado");
  assert.equal(trocado.texto, "Rua do Mercado, 12 - Centro, Leme/SP");
  assert.equal(Ru.aplicarRegrasDeVia(E, { ...end, lat: -22, lng: -45 }).rua, "Rua Doutor Silva", "fora do traçado");
  assert.equal(Ru.aplicarRegrasDeVia(E, { ...end, rua: "Avenida Outra", texto: "Avenida Outra, 1" }).rua, "Avenida Outra", "outro nome de rua");
  assert.equal(Ru.aplicarRegrasDeVia(E2, end).rua, "Rua Doutor Silva", "outra empresa");
  assert.equal((await chamar("GET", "/api/areas/ruas", cAdm2)).corpo.regras.length, 0);
  // Desligada, não vale.
  await chamar("PUT", `/api/areas/ruas/${r.corpo.regra.id}`, cAdm, { nomeExibicao: "Rua do Mercado", nomeNoMapa: "Rua Doutor Silva", poligono: traco, ativa: false });
  assert.equal(Ru.aplicarRegrasDeVia(E, end).rua, "Rua Doutor Silva");
  assert.equal((await chamar("DELETE", `/api/areas/ruas/${r.corpo.regra.id}`, cOp)).status, 403);
  assert.equal((await chamar("DELETE", `/api/areas/ruas/${r.corpo.regra.id}`, cAdm)).status, 200);
  assert.equal((await chamar("GET", "/api/areas/ruas", cAdm)).corpo.regras.length, 0);
});

// ====================================================================== funil e mapa de bairros

test("funil de clientes e mapa de bairros usam as corridas e passageiros reais, por empresa", async () => {
  const F = D.criarEmpresa("Funil Um").id;
  criar(F, CAT, { nome: "Carro", bandeirada: 5, valorKm: 2, valorMinimo: 8, ativa: true }, "t");
  const mot = criar(F, MOT, { nome: "Motorista F", telefone: "11910000009", status: "Ativo" }, "t");
  const emb = (bairro: string) => ({ texto: `Rua X, 1 - ${bairro}, Leme/SP`, lat: -23.5 - Math.random() / 1000, lng: -46.6 });
  const nova = (nome: string, bairro: string) => R.criarCorridaPropria(F, { passageiro: { nome, telefone: String(++tel) }, embarque: emb(bairro), destino: { texto: "Rua Y", lat: -23.58, lng: -46.65 }, categoria: "Carro", pagamento: "Pix", canal: "app" });
  const ok1 = await nova("Ana", "Centro");
  R.atribuirMotorista(F, ok1.id, mot.id); R.mudarStatus(F, ok1.id, "a_caminho"); R.mudarStatus(F, ok1.id, "em_andamento"); R.mudarStatus(F, ok1.id, "finalizada", { valor: 20 });
  const can = await nova("Bia", "Centro");
  R.cancelarCorrida(F, can.id, "Passageiro", "desisti");
  const nao = await nova("Caio", "Jardim Livia");
  R.mudarStatus(F, nao.id, "nao_atendida");
  const comMot = await nova("Duda", "Jardim Livia");
  R.atribuirMotorista(F, comMot.id, mot.id); R.mudarStatus(F, comMot.id, "a_caminho");
  R.cancelarCorrida(F, comMot.id, "Passageiro", "demorou");
  criar(F, CLI, { nome: "=cmd Lead", telefone: "11955550000", status: "Ativo", origemCadastro: "App" }, "t");

  const cF = await cookie(D.criarUsuario({ email: "adm@funil.test", nome: "AdmF", senha: "senha-forte-9", empresaId: F, papel: "admin" }).id);
  const f = (await chamar("GET", "/api/areas/funil", cF)).corpo;
  assert.equal(f.resumo.solicitadas, 4);
  assert.equal(f.resumo.finalizadas, 1);
  assert.equal(f.resumo.canceladas, 2);
  assert.equal(f.resumo.naoAtendidas, 1);
  assert.equal(f.resumo.abandonaram, 3);
  assert.equal(f.resumo.leadsPerdidos, 1);
  assert.equal(f.resumo.conversao, 25);
  assert.deepEqual(f.etapas.map((e: { valor: number }) => e.valor), [4, 2, 1, 1]);
  assert.equal(f.perdas.find((p: { rotulo: string }) => p.rotulo === "Sem motorista").valor, 1);
  assert.equal(f.perdas.find((p: { rotulo: string }) => p.rotulo === "Cancelou antes do motorista").valor, 1);
  assert.equal(f.perdas.find((p: { rotulo: string }) => p.rotulo === "Cancelou com o motorista a caminho").valor, 1);
  assert.equal((await chamar("GET", "/api/areas/funil/lista?aba=abandono", cF)).corpo.paginacao.totalItens, 3);
  assert.equal((await chamar("GET", "/api/areas/funil/lista?aba=corridas", cF)).corpo.paginacao.totalItens, 4);
  assert.equal((await chamar("GET", "/api/areas/funil/lista?aba=leads", cF)).corpo.linhas[0].telefone, "11955550000");
  assert.equal((await chamar("GET", "/api/areas/funil?inicio=2020-01-01&fim=2020-01-02", cF)).corpo.resumo.solicitadas, 0, "período sem corridas");
  const csv = await chamar("GET", "/api/areas/funil/csv?aba=leads", cF);
  assert.match(csv.texto, /'=cmd/, "proteção contra fórmula no CSV");
  // Outra empresa não vê nada disso.
  assert.equal((await chamar("GET", "/api/areas/funil", cAdm2)).corpo.resumo.solicitadas, R.listarProprias(E2).length, "só as corridas da própria empresa");
  assert.equal((await chamar("GET", "/api/areas/funil/lista?aba=leads", cAdm2)).corpo.paginacao.totalItens, 0);

  const m = (await chamar("GET", "/api/areas/bairros", cF)).corpo;
  const centro = m.bairros.find((b: { bairro: string }) => b.bairro === "Centro"), livia = m.bairros.find((b: { bairro: string }) => b.bairro === "Jardim Livia");
  assert.equal(centro.concluidas, 1); assert.equal(centro.canceladas, 1); assert.equal(centro.corridas, 2);
  assert.equal(livia.naoAtendidas, 1); assert.equal(livia.canceladas, 1);
  assert.ok(centro.lat != null && centro.lng != null, "posição do bairro pela média dos embarques");
  assert.equal(m.totais.nunca, 1);
  assert.equal(m.totais.todos, 5);
  // Bairro que teve demanda antes, mas não no período, é deserto.
  const d = (await chamar("GET", "/api/areas/bairros?inicio=2020-01-01&fim=2020-01-02", cF)).corpo;
  assert.equal(d.bairros.find((b: { bairro: string }) => b.bairro === "Centro").deserto, true);
  const xml = await chamar("GET", "/api/areas/bairros/xml?situacao=nunca", cF);
  assert.match(xml.texto, /<telefone>11955550000<\/telefone>/);
  assert.match((await chamar("GET", "/api/areas/bairros/csv?situacao=concluidas&bairro=Centro", cF)).texto, /Ana/);
  assert.ok(!(await chamar("GET", "/api/areas/bairros", cAdm2)).corpo.bairros.some((b: { bairro: string }) => b.bairro === "Jardim Livia"), "bairros de outra empresa não aparecem");
});
