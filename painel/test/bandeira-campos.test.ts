// Gerais › abas da "Alterando Bandeira" da Machine (Motorista, Passageiro, Financeiro, Filtros, Formas de pagamento, Recursos Premium):
// valores padrão, validação por campo (opção que existe, número no limite, texto sem marcas), permissão e sincronia com os métodos de pagamento.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-bandeira-campos-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "b".repeat(40);
delete process.env.BANCO_ARQUIVO;

const express = (await import("express")).default;
const D = await import("../src/servidor/dados.ts");
const { criarCookie, exigirLogin } = await import("../src/servidor/sessao.ts");
const B = await import("../src/servidor/banco.ts");
const { rotasConfig } = await import("../src/config/rotas.ts");
const { ABAS_FORM, TODOS_CONTROLES, valoresPadrao, sanearForm } = await import("../src/comum/bandeira-form.ts");

const app = express();
app.use(express.json({ limit: "2mb" }));
app.post("/teste/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({ ok: true }); });
app.use("/api", exigirLogin);
app.use("/api/config", rotasConfig);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => { servidor.closeAllConnections(); servidor.close(); B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

const E = D.criarEmpresa("Campos Um").id;
const adm = D.criarUsuario({ email: "adm@campos.test", nome: "Adm", senha: "senha-forte-1", empresaId: E, papel: "admin" });
const op = D.criarUsuario({ email: "op@campos.test", nome: "Op", senha: "senha-forte-1", empresaId: E, papel: "operador" });
async function entrar(id: string) { const r = await fetch(`${base}/teste/entrar/${id}`, { method: "POST" }); return (r.headers.get("set-cookie") ?? "").split(";")[0]; }
const cAdm = await entrar(adm.id), cOp = await entrar(op.id);
async function api(cookie: string, metodo: string, url: string, corpo?: unknown) {
  const r = await fetch(`${base}/api/config${url}`, { method: metodo, headers: { cookie, "content-type": "application/json" }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  return { status: r.status, corpo: (await r.json().catch(() => ({}))) as Record<string, any> };
}

test("o formulário tem as abas da Machine e nenhum campo repetido", () => {
  assert.deepEqual(ABAS_FORM.map((a) => a.titulo), ["Motorista", "Passageiro", "Financeiro", "Filtros", "Formas de pagamento", "Recursos Premium"]);
  const nomes = TODOS_CONTROLES.map((c) => c.nome);
  assert.equal(new Set(nomes).size, nomes.length);
  assert.ok(nomes.length > 150);
  // todo campo "de" aponta para um campo que existe
  for (const c of TODOS_CONTROLES) if (c.de) assert.ok(nomes.includes(c.de.nome), `${c.nome} depende de ${c.de.nome}`);
});

test("valores padrão e leitura por qualquer usuário", async () => {
  const r = await api(cOp, "GET", "/bandeira-campos");
  assert.equal(r.status, 200);
  assert.equal(r.corpo.valores.tempo_espera, "10");
  assert.equal(r.corpo.valores.exibir_telefone_passageiro, "1");
  assert.equal(r.corpo.valores.habilita_controle_canc, "0");
  assert.equal(r.corpo.valores.pag_pix_ativa, true);
  assert.equal(r.corpo.valores.pag_whatsapp_ativa, false);
});

test("só gestor grava; opção que não existe e número fora do limite são corrigidos; texto perde as marcas", async () => {
  assert.equal((await api(cOp, "PUT", "/bandeira-campos", { valores: { tempo_espera: "15" } })).status, 403);
  const r = await api(cAdm, "PUT", "/bandeira-campos", { valores: {
    tempo_espera: "99", exibir_telefone_passageiro: "0", raio_arredores_partida: 100000, quantidade_aceites_desconectar_automaticamente: "1",
    mensagem_taxista_desconectado: "<b>Fique</b> online", tipo_taximetro: "F", campo_que_nao_existe: "x", habilitar_bloqueio_chegada_coleta: true,
  } });
  assert.equal(r.status, 200);
  const v = r.corpo.valores;
  assert.equal(v.tempo_espera, "10", "opção inexistente mantém o valor anterior");
  assert.equal(v.exibir_telefone_passageiro, "0");
  assert.ok(Number(v.raio_arredores_partida) <= 100000);
  assert.equal(v.quantidade_aceites_desconectar_automaticamente, 3, "mínimo da Machine é 3");
  assert.equal(v.mensagem_taxista_desconectado, "bFique/b online");
  assert.equal(v.tipo_taximetro, "V", "taxímetro físico vem desabilitado na Machine");
  assert.equal(v.habilitar_bloqueio_chegada_coleta, true);
  assert.equal(v.campo_que_nao_existe, undefined);
  // persistiu
  const de = await api(cOp, "GET", "/bandeira-campos");
  assert.equal(de.corpo.valores.exibir_telefone_passageiro, "0");
});

test("formas de pagamento ligam e desligam os métodos aceitos em Integrações", async () => {
  await api(cAdm, "PUT", "/bandeira-campos", { valores: { pag_dinheiro_ativa: false, pag_pix_ativa: false, pag_debito_ativa: false, pag_credito_ativa: false } });
  const p = await api(cAdm, "GET", "/pagamentos");
  assert.equal(p.corpo.metodos["Dinheiro"], false);
  assert.equal(p.corpo.metodos["Pix"], false);
  assert.equal(p.corpo.metodos["Cartão na Maquininha"], false);
  await api(cAdm, "PUT", "/bandeira-campos", { valores: { pag_credito_ativa: true } });
  assert.equal((await api(cAdm, "GET", "/pagamentos")).corpo.metodos["Cartão na Maquininha"], true);
});

test("sanearForm sem entrada devolve os padrões", () => {
  assert.deepEqual(sanearForm(undefined), valoresPadrao());
});
