// Gerais › abas da "Alterando Bandeira" da Machine (Motorista, Passageiro, Financeiro, Filtros, Formas de pagamento, Recursos Premium):
// valores padrão, validação por campo (opção que existe, número no limite, texto sem marcas), permissão e sincronia com os métodos de pagamento.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-config-auditoria-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "b".repeat(40);
delete process.env.BANCO_ARQUIVO;

const express = (await import("express")).default;
const D = await import("../src/servidor/dados.ts");
const { criarCookie, exigirLogin } = await import("../src/servidor/sessao.ts");
const B = await import("../src/servidor/banco.ts");
const { rotasConfig } = await import("../src/config/rotas.ts");
const { ABAS_FORM, TODOS_CONTROLES, MAX_MENSAGENS_RAPIDAS, mensagensRapidasDe, valoresPadrao } = await import("../src/comum/bandeira-form.ts");
const { gerais } = await import("../src/config/gerais.ts");
const { sanearMatriz } = await import("../src/config/descontos-matriz.ts");

const app = express();
app.use(express.json({ limit: "2mb" }));
app.post("/teste/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({ ok: true }); });
app.use("/api", exigirLogin);
app.use("/api/config", rotasConfig);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => { servidor.closeAllConnections(); servidor.close(); B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

const E = D.criarEmpresa("Auditoria Config").id;
const adm = D.criarUsuario({ email: "adm@auditoria.test", nome: "Adm", senha: "senha-forte-1", empresaId: E, papel: "admin" });
const r0 = await fetch(`${base}/teste/entrar/${adm.id}`, { method: "POST" });
const cookie = (r0.headers.get("set-cookie") ?? "").split(";")[0];
async function api(metodo: string, url: string, corpo?: unknown) {
  const r = await fetch(`${base}/api/config${url}`, { method: metodo, headers: { cookie, "content-type": "application/json" }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  return { status: r.status, corpo: (await r.json().catch(() => ({}))) as Record<string, any> };
}

test("mensagens rápidas: até 20 espaços por lista, marcadas para a tela somar e remover", () => {
  const linhas = ABAS_FORM.find((a) => a.id === "motorista")!.itens.filter((i: any) => i.especial === "mensagens") as any[];
  assert.equal(linhas.length, 2);
  for (const l of linhas) assert.equal(l.controles.length, MAX_MENSAGENS_RAPIDAS);
  const v = valoresPadrao();
  assert.equal(mensagensRapidasDe(v, "P").length, 5);
  assert.equal(mensagensRapidasDe(v, "C").length, 7);
});

test("as mensagens rápidas da aba Motorista chegam ao que os apps leem (adicionar, remover e esvaziar)", async () => {
  assert.ok(gerais(E).motorista.mensagensRapidas.length >= 1, "antes de gravar a aba vale a lista antiga");
  const nova: Record<string, string> = {};
  for (let n = 0; n < MAX_MENSAGENS_RAPIDAS; n++) nova[`msg_P_${n}`] = "";
  nova.msg_P_0 = "Estou chegando"; nova.msg_P_5 = "Cheguei";
  const r = await api("PUT", "/bandeira-campos", { valores: nova });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.deepEqual(gerais(E).motorista.mensagensRapidas, ["Estou chegando", "Cheguei"]);
  // a central pode esvaziar a lista inteira
  for (const k of Object.keys(nova)) nova[k] = "";
  await api("PUT", "/bandeira-campos", { valores: nova });
  assert.deepEqual(gerais(E).motorista.mensagensRapidas, []);
});

test("rótulos das caixas que a Machine mostra e a nossa tela não mostrava", () => {
  const por = new Map(TODOS_CONTROLES.map((c) => [c.nome, c]));
  assert.equal(por.get("tolerancia_atraso_taxista_tempo_tempo")?.rotulo, "Abonar se o atraso for maior que");
  assert.equal(por.get("valor_maximo_cupom_primeira_solicitacao")?.rotulo, "Valor máximo de desconto (R$)");
  assert.equal(por.get("url_compartilhamento_indicacao_opcoes")?.rotulo, "Direcionar o indicado para:");
  assert.equal(por.get("url_compartilhamento_indicacao_opcoes_passageiro")?.rotulo, "Direcionar o indicado para:");
  assert.equal(por.get("tipo_recompensa_indicacao_cliente")?.rotulo, "Critério para liberar a recompensa");
});

test("filtros customizáveis: o opcional adicionado fica gravado em Gerais (e vai para os apps)", async () => {
  const atual = (await api("GET", "/gerais")).corpo;
  const prefs = [...atual.preferencias, { nome: "Ar condicionado extra", tipo: "exigencia", ativo: true }];
  const r = await api("PUT", "/gerais", { preferencias: prefs });
  assert.equal(r.status, 200);
  assert.ok(gerais(E).preferencias.some((p) => p.nome === "Ar condicionado extra" && p.ativo));
});

test("descontos: app #2 a #4 são gravados quando preenchidos", () => {
  const m = sanearMatriz({ dinheiro: { site: 5, app1: 10, app2: 8, app3: 6, app4: 4, maximo: 20 } }, true);
  assert.equal(m.dinheiro.app2, 8);
  assert.equal(m.dinheiro.app4, 4);
});
