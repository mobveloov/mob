// Consultar corridas (filtros da Machine, paginação no banco, exportação segura) e NPS (promotores, neutros, detratores, filtros, exportação).
// Rodar: npm test (na pasta painel). Tudo por empresa, sem rede e sem chaves.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "consulta-nps-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "n".repeat(40);
delete process.env.BANCO_ARQUIVO;
delete process.env.OSRM_URL;

const express = (await import("express")).default;
const D = await import("../src/servidor/dados.ts");
const B = await import("../src/servidor/banco.ts");
const { criarCookie, exigirLogin } = await import("../src/servidor/sessao.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar, mesclar } = await import("../src/cadastros/armazem.ts");
const C = await import("../src/corridas/index.ts");
const { lancar } = await import("../src/apps/extras.ts");
const { bancoConfig } = await import("../src/config/armazem.ts");
const { registrarNps } = await import("../src/config/avaliacoes.ts");
const { celulaCsv } = await import("../src/servidor/util.ts");
const { rotasOperacao } = await import("../src/operacao/rotas.ts");
const { rotasConfig } = await import("../src/config/rotas.ts");

const app = express();
app.use(express.json());
app.post("/teste/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({ ok: true }); });
app.use("/api", exigirLogin);
app.use("/api/operacao", rotasOperacao);
app.use("/api/config", rotasConfig);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => { servidor.closeAllConnections(); servidor.close(); B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

const A = D.criarEmpresa("Central Alfa"), Z = D.criarEmpresa("Central Zeta");
const admA = D.criarUsuario({ email: "adm@alfa.test", nome: "Ana", senha: "senha-forte-1", empresaId: A.id, papel: "admin" });
const opA = D.criarUsuario({ email: "op@alfa.test", nome: "Otávio", senha: "senha-forte-2", empresaId: A.id, papel: "operador" });
const admZ = D.criarUsuario({ email: "adm@zeta.test", nome: "Zé", senha: "senha-forte-3", empresaId: Z.id, papel: "admin" });
const cookie = async (id: string) => (await fetch(`${base}/teste/entrar/${id}`, { method: "POST" })).headers.get("set-cookie")!.split(";")[0];
const [cAdm, cOp, cZ] = [await cookie(admA.id), await cookie(opA.id), await cookie(admZ.id)];
async function pedir(prefixo: string, caminho: string, ck: string) {
  const r = await fetch(`${base}/api/${prefixo}${caminho}`, { headers: { cookie: ck } });
  const texto = await r.text();
  let corpo: Record<string, any> = {};
  try { corpo = JSON.parse(texto || "{}"); } catch { /* texto puro */ }
  return { status: r.status, corpo, texto };
}
const op = (c: string, ck = cAdm) => pedir("operacao", c, ck);
const cfg = (c: string, ck = cAdm) => pedir("config", c, ck);
const PEDIDO = (nome: string, tel: string, extra: Record<string, unknown> = {}) => ({
  passageiro: { nome, telefone: tel }, embarque: { texto: "Rua das Flores, 10 - Centro" }, destino: { texto: "Av. Brasil, 500" },
  categoria: "Econômico", pagamento: "Pix", canal: "painel" as const, ...extra,
});

// Dados: 35 corridas para paginar + corridas com atributos específicos.
const CAT = cadastroPorId("categorias")!, CLI = cadastroPorId("clientes")!;
criar(A.id, CAT, { nome: "Econômico", bandeirada: 5, valorKm: 2, valorMinimo: 9.9, ativa: true, taxaCancelamento: 0, toleranciaCancelamento: 0 }, "teste");
mesclar(A.id, CLI, [{ nome: "Carla Corp", telefone: "11955550001", cpf: "123.456.789-09", conveniada: "Acme Ltda", email: "carla@acme.test", status: "Ativo" }], "teste");
for (let i = 0; i < 35; i++) await C.criarCorridaPropria(A.id, PEDIDO(`Passageiro ${i}`, `1190000${String(i).padStart(4, "0")}`), "teste");
const corp = await C.criarCorridaPropria(A.id, PEDIDO("Carla Corp", "11955550001", { osExterna: "EXT-77", centralChamada: "Central Alfa", canal: "app" }), "teste");
const injecao = await C.criarCorridaPropria(A.id, PEDIDO("=HYPERLINK(\"http://x\")", "11988887777", { pagamento: "Voucher" }), "teste");
await C.cancelarCorrida(A.id, injecao.id, "Passageiro", "Desistiu", "teste");
lancar(A.id, "passageiro", "11955550001", 2.5, "Cashback da corrida", "sistema", corp.id);
await C.criarCorridaPropria(Z.id, PEDIDO("Só da Zeta", "21911112222"), "teste");
// Uma corrida de 2 horas atrás e uma de 5 horas atrás (direto no banco, com a data mudada).
const velha = await C.criarCorridaPropria(A.id, PEDIDO("Corrida Antiga", "11977770000"), "teste");
const recuar = (id: string, horas: number) => {
  const db = B.banco();
  const l = db.prepare("SELECT dados FROM corridas_proprias WHERE empresa = ? AND id = ?").get(A.id, id) as { dados: string };
  const d = JSON.parse(l.dados), em = new Date(Date.parse(d.solicitadaEm) - horas * 3600_000).toISOString();
  d.solicitadaEm = em;
  db.prepare("UPDATE corridas_proprias SET solicitada_em = ?, dados = ? WHERE empresa = ? AND id = ?").run(em, JSON.stringify(d), A.id, id);
};
recuar(velha.id, 2.5);

test("consulta: paginação no banco, totais e isolamento por empresa", async () => {
  const p1 = await op("/historico?rapido=hoje", cAdm);
  assert.equal(p1.status, 200, p1.texto);
  assert.equal(p1.corpo.total, 38);
  assert.equal(p1.corpo.corridas.length, 30);
  assert.equal(p1.corpo.paginas, 2);
  assert.equal(p1.corpo.stats.total, 38);
  assert.equal(p1.corpo.stats.canceladas, 1);
  assert.equal((await op("/historico?rapido=hoje&pagina=2", cAdm)).corpo.corridas.length, 8);
  assert.equal((await op("/historico?rapido=hoje&pagina=99", cAdm)).corpo.pagina, 2, "página fora do limite volta para a última");
  assert.equal((await op("/historico?rapido=hoje", cZ)).corpo.total, 1, "a outra central só vê as suas");
  assert.equal((await op("/historico?rapido=hoje", cOp)).status, 200, "operador também consulta");
  assert.equal((await pedir("operacao", "/historico", "")).status, 401);
  const o = p1.corpo.opcoes;
  assert.ok(o.pagamentos.includes("Pix no app") && o.urgencias.length === 6 && o.vias.length === 3 && o.centrais.includes("Central Alfa"));
  assert.ok(o.empresas !== undefined && o.categorias.includes("Econômico"));
});

test("consulta: filtros da Machine (externo, central, empresa, CPF, urgência, via, cashback, horas)", async () => {
  const t = async (q: string) => (await op(`/historico?rapido=hoje&${q}`, cAdm)).corpo.total;
  assert.equal(await t("osExterna=EXT-77"), 1);
  assert.equal(await t("osExterna=NAO-EXISTE"), 0);
  assert.equal(await t("centralChamada=Central%20Alfa"), 38, "sem central gravada vale a própria central");
  assert.equal(await t("centralCorrida=Outra"), 0);
  assert.equal(await t("empresa=Acme%20Ltda"), 1);
  assert.equal(await t("empresa=Outra%20Ltda"), 0);
  assert.equal(await t("cpfPax=12345678909"), 1);
  assert.equal(await t("cpfPax=999"), 0);
  assert.equal(await t("cashback=1"), 1);
  assert.equal(await t("via=app"), 1);
  assert.equal(await t("via=site"), 37);
  assert.equal(await t("urgencia=5"), 1, "corporativa (empresa conveniada)");
  assert.equal(await t("urgencia=7"), 1, "voucher cancelada não conta como pendência: esta é a corporativa em andamento");
  assert.equal(await t("urgencia=1"), 0, "normais todas em pendência");
  assert.equal(await t("urgencia=2"), 36);
  assert.equal(await t("urgencia=9"), 0);
  assert.equal(await t("status=cancelada"), 1);
  assert.equal(await t("status=distribuindo"), 37);
  assert.equal(await t("pagamento=voucher"), 1);
  assert.equal(await t("nomePax=carla"), 1);
  assert.equal(await t("telPax=5555-0001"), 1);
  // Atalhos de horas: 2 h não alcança a corrida de 2h30 atrás? Alcança só com 3 h.
  const h = async (a: string) => (await op(`/historico?rapido=${a}`, cAdm)).corpo.total;
  assert.equal(await h("1h"), 37);
  assert.equal(await h("2h"), 37);
  assert.equal(await h("3h"), 38);
  assert.equal(await h("4h"), 38);
  // Datas com horas (início no futuro não traz nada).
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  assert.equal((await op(`/historico?dataIni=${hoje}&dataFim=${hoje}&horaIni=00:00&horaFim=23:59`, cAdm)).corpo.total >= 37, true);
});

test("exportar: CSV de tudo o que o filtro mostra, protegido contra fórmula", async () => {
  const r = await op("/historico/exportar?rapido=hoje&status=cancelada", cAdm);
  assert.equal(r.status, 200, r.texto);
  assert.match(r.corpo.nome, /^corridas-\d{4}-\d{2}-\d{2}\.csv$/);
  const linhas = r.corpo.csv.replace(/^﻿/, "").split("\n");
  assert.equal(linhas.length, 2);
  assert.match(linhas[0], /^Nº OS;Nº externo da OS;Solicitada em;Partida;/);
  assert.ok(linhas[1].includes(`"'=HYPERLINK(""http://x"")"`), linhas[1]);
  const tudo = await op("/historico/exportar?rapido=hoje", cAdm);
  assert.equal(tudo.corpo.csv.replace(/^﻿/, "").split("\n").length, 39);
  assert.equal((await op("/historico/exportar?rapido=hoje", cZ)).corpo.csv.includes("Passageiro 1"), false);
  for (const [entrada, saida] of [["=1+1", "'=1+1"], ["+55", "'+55"], ["-2", "'-2"], ["@x", "'@x"], ["normal", "normal"], ["a;b", "\"a;b\""]]) assert.equal(celulaCsv(entrada), saida);
});

test("NPS: nota, promotores, neutros, detratores, filtros e exportação", async () => {
  const mes = (dias: number) => new Date(Date.now() - 3 * 3600_000 - dias * 86_400_000).toISOString();
  const dar = (papel: "passageiro" | "motorista", chave: string, nome: string, nota: number, dias: number, emp = A.id) => {
    registrarNps(emp, papel, chave, nome, "Avaliou", nota, "");
    bancoConfig().prepare("UPDATE nps_app SET em = ? WHERE empresa = ? AND papel = ? AND chave = ?").run(mes(dias), emp, papel, chave);
  };
  dar("passageiro", "11955550001", "Carla Corp", 5, 0);
  dar("passageiro", "11900000002", "Neutro Um", 4, 3);
  dar("passageiro", "11900000003", "Detrator Um", 2, 10);
  dar("passageiro", "11900000004", "=SOMA(A1)", 5, 40);
  dar("passageiro", "11900000005", "Outra Central", 1, 0, Z.id);
  dar("motorista", "m1", "Motorista Um", 5, 1);
  registrarNps(A.id, "passageiro", "11900000006", "Recusou", "Recusou");

  const r = await cfg("/nps/passageiro/avaliacoes", cOp);
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.corpo.total, 3, "últimos 30 dias, sem a de 40 dias nem a recusa");
  assert.deepEqual([r.corpo.promotores, r.corpo.neutros, r.corpo.detratores], [1, 1, 1]);
  assert.equal(r.corpo.nps, 0);
  assert.equal(r.corpo.lista.itens[0].nome, "Carla Corp");
  assert.equal(r.corpo.lista.itens[0].email, "carla@acme.test");
  assert.equal(r.corpo.lista.itens[0].classe, "Promotor");
  assert.equal((await cfg("/nps/passageiro/avaliacoes?periodo=TD")).corpo.total, 1);
  assert.equal((await cfg("/nps/passageiro/avaliacoes?periodo=LS")).corpo.total, 2);
  const d = await cfg("/nps/passageiro/avaliacoes?tipo=D");
  assert.equal(d.corpo.lista.total, 1, "o filtro de tipo muda a lista");
  assert.equal(d.corpo.total, 3, "e os totais continuam do período");
  assert.equal((await cfg("/nps/passageiro/avaliacoes?email=acme")).corpo.total, 1);
  assert.equal((await cfg("/nps/passageiro/avaliacoes?telefone=55550001")).corpo.total, 1);
  const ct = new Date(Date.now() - 3 * 3600_000 - 40 * 86_400_000).toISOString().slice(0, 10);
  assert.equal((await cfg(`/nps/passageiro/avaliacoes?periodo=CT&inicio=${ct}&fim=${ct}`)).corpo.total, 1);
  assert.equal((await cfg("/nps/passageiro/avaliacoes", cZ)).corpo.total, 1, "cada central vê só as suas");
  assert.equal((await cfg("/nps/motorista/avaliacoes")).corpo.total, 1);
  const x = await cfg("/nps/passageiro/exportar?periodo=LT&tipo=T");
  const linhas = x.corpo.csv.replace(/^﻿/, "").split("\n");
  assert.equal(linhas.length, 4);
  assert.match(linhas[0], /^Data;Hora;Passageiro;Telefone;E-mail;Nota;Classificação;Comentário$/);
  const x40 = await cfg(`/nps/passageiro/exportar?periodo=CT&inicio=${ct}&fim=${ct}`);
  assert.ok(x40.corpo.csv.includes("'=SOMA(A1)"), "nome que começa com = ganha apóstrofo");
});
