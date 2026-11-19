// Testes dos templates e dos descadastros do CRM (portados do sistema de referência). Nada sai para a internet.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-crm-tpl-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "y".repeat(40);

const { default: express } = await import("express");
const D = await import("../src/servidor/dados.ts");
const { criarCookie, exigirLogin } = await import("../src/servidor/sessao.ts");
const { router } = await import("../src/crm/rotas.ts");
const { montarTexto } = await import("../src/crm/mensagem.ts");
const T = await import("../src/crm/templates.ts");

test("texto: {{variavel}} e SpinText juntos, sem quebrar as variáveis antigas {variavel}", () => {
  const c = { nome: "Maria Souza", cidade: "Norte", diasSemCorrida: 15, corridas: 3 };
  const t = montarTexto("{Oi|Olá} {{nome}}, faz {{dias_sem_corrida}} dias. Use {{cupom}} na {empresa}.", { contato: c, cupom: "VOLTA7", empresa: "Rota" });
  assert.match(t, /^(Oi|Olá) Maria, faz 15 dias\. Use VOLTA7 na Rota\.$/);
  assert.match(montarTexto("Oi {{nome_completo}}", { contato: c, cupom: "", empresa: "Rota" }), /Maria Souza/);
  assert.equal(montarTexto("Oi {nome}", { contato: c, cupom: "", empresa: "Rota" }), "Oi Maria Souza");
  // Sem {{cupom}} no texto, o código vai no fim.
  assert.match(montarTexto("Oi {{nome}}", { contato: c, cupom: "X1", empresa: "Rota" }), /Cupom: X1$/);
});

test("rotas: templates, modelos prontos, pré-visualização, descadastro e isolamento entre empresas", async () => {
  const um = D.criarEmpresa("Tpl Um").id;
  const dois = D.criarEmpresa("Tpl Dois").id;
  const adm = D.criarUsuario({ email: "adm@tpl1.test", nome: "Adm", senha: "senha-forte-1", empresaId: um, papel: "admin" });
  const op = D.criarUsuario({ email: "op@tpl1.test", nome: "Op", senha: "senha-forte-1", empresaId: um, papel: "operador" });
  const adm2 = D.criarUsuario({ email: "adm@tpl2.test", nome: "Adm2", senha: "senha-forte-2", empresaId: dois, papel: "admin" });
  const app = express();
  app.use(express.json());
  app.post("/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({}); });
  app.use("/api/crm", exigirLogin, router);
  const srv = app.listen(0);
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  try {
    const cookieDe = async (id: string) => ((await fetch(`${base}/entrar/${id}`, { method: "POST" })).headers.get("set-cookie") ?? "").split(";")[0];
    const [cA, cO, cB] = [await cookieDe(adm.id), await cookieDe(op.id), await cookieDe(adm2.id)];
    const pedir = async (p: string, cookie: string, metodo = "GET", corpo?: unknown) => {
      const r = await fetch(base + p, { method: metodo, headers: { "Content-Type": "application/json", Cookie: cookie }, body: corpo ? JSON.stringify(corpo) : undefined });
      return { status: r.status, corpo: await r.json() as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
    };
    assert.equal((await fetch(`${base}/api/crm/templates`)).status, 401);

    // Validações
    assert.equal((await pedir("/api/crm/templates", cO, "POST", { name: "", content: "x" })).corpo.erro, "Nome e conteúdo são obrigatórios");
    assert.match((await pedir("/api/crm/templates", cO, "POST", { name: "A", content: "{Oi} {{nome}}" })).corpo.erro, /pelo menos 2 opções/);
    assert.match((await pedir("/api/crm/templates", cO, "POST", { name: "A", content: "Oi", title: "x".repeat(41) })).corpo.erro, /40 caracteres/);
    assert.match((await pedir("/api/crm/templates", cO, "POST", { name: "A", content: "Oi", button_text: "Pedir" })).corpo.erro, /texto e link juntos/);

    // Criar, editar, ligar/desligar, apagar
    const novo = await pedir("/api/crm/templates", cO, "POST", { name: "Volta", category: "reactivation", content: "{Oi|Olá} {{nome}}, use {{cupom}}", variant_b_content: "Ei {{nome}}", ab_split_ratio: 30, wa_optout_footer: true });
    assert.equal(novo.status, 200);
    const t = novo.corpo.template;
    assert.deepEqual(t.variables, ["nome", "cupom"]);
    assert.equal(t.ab_split_ratio, 30);
    assert.equal(t.is_active, true);
    assert.equal((await pedir(`/api/crm/templates/${t.id}`, cO, "PUT", { ...t, name: "Volta 2", variant_b_content: "" })).corpo.template.ab_split_ratio, 0, "sem mensagem B não há divisão");
    assert.equal((await pedir(`/api/crm/templates/${t.id}/ligar`, cO, "POST", {})).corpo.template.is_active, false);
    assert.equal((await pedir("/api/crm/templates", cO)).corpo.templates[0].name, "Volta 2");

    // Isolamento
    assert.equal((await pedir("/api/crm/templates", cB)).corpo.templates.length, 0);
    assert.equal((await pedir(`/api/crm/templates/${t.id}`, cB, "DELETE")).status, 404);

    // Modelos prontos: entram uma vez só
    const m1 = await pedir("/api/crm/templates-modelos", cO, "POST", {});
    assert.ok(m1.corpo.adicionados >= 10);
    const m2 = await pedir("/api/crm/templates-modelos", cO, "POST", {});
    assert.equal(m2.corpo.adicionados, 0);
    assert.equal(m2.corpo.aviso, "Todos os modelos prontos já estão na lista.");
    assert.equal((await pedir(`/api/crm/templates/${t.id}`, cO, "DELETE")).status, 200);

    // Pré-visualização
    const pv = await pedir("/api/crm/templates-previa", cO, "POST", { content: "{Oi|Olá} {{nome}}, {{cupom}} {{xyz}}", title: "Oi {{nome}}", wa_optout_footer: true });
    assert.match(pv.corpo.previa, /^Oi Maria\n(Oi|Olá) Maria, VOLTA7K2P \[xyz\]/);
    assert.match(pv.corpo.previa, /NÃO QUERO MAIS/);

    // Descadastro: por telefone, mesma chave em formatos diferentes; reativar só admin, com autorização
    assert.equal((await pedir("/api/crm/descadastros", cO, "POST", { telefone: "123" })).status, 400);
    assert.equal((await pedir("/api/crm/descadastros", cO, "POST", { telefone: "(16) 99123-4567", nome: "Bia" })).status, 200);
    assert.equal(T.estaDescadastrado(um, "5516991234567"), true);
    assert.equal(T.estaDescadastrado(dois, "5516991234567"), false);
    const lista = (await pedir("/api/crm/descadastros", cO)).corpo.descadastros;
    assert.equal(lista.length, 1);
    assert.equal(lista[0].estado, "descadastrado");
    assert.equal((await pedir("/api/crm/descadastros/reativar", cO, "POST", { telefone: "16991234567", autorizacao: "pediu no zap" })).status, 403);
    assert.equal((await pedir("/api/crm/descadastros/reativar", cA, "POST", { telefone: "16991234567", autorizacao: "x" })).status, 400);
    assert.equal((await pedir("/api/crm/descadastros/reativar", cA, "POST", { telefone: "16991234567", autorizacao: "pediu no zap às 14h" })).status, 200);
    assert.equal(T.estaDescadastrado(um, "16991234567"), false);
    assert.equal((await pedir("/api/crm/descadastros", cA)).corpo.descadastros[0].estado, "autorizado");

    // Visão geral
    const v = await pedir("/api/crm/visao", cO, "POST", { dias: 30 });
    assert.equal(v.status, 200);
    assert.equal(v.corpo.templates, (await pedir("/api/crm/templates", cO)).corpo.templates.length);
    assert.equal(v.corpo.descadastrados, 0);
  } finally { srv.close(); }
});
