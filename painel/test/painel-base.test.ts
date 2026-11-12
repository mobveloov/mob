// Base do painel igual à referência: menu (ids e ordem), indicadores e tela Alterar Senha.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DADOS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "painel-base-"));
const { FUNCOES, GRUPOS } = await import("../src/comum/funcoes.ts");
const { datasDoPeriodo, variacao, nps } = await import("../src/servidor/indicadores.ts");
const D = await import("../src/servidor/dados.ts");

test("menu: grupos na ordem da referência, 'Mais' no fim, ids e rotas fixos", () => {
  assert.deepEqual(GRUPOS, ["Painel", "Cadastro", "Corridas", "Financeiro", "Comunicação", "Config", "Avaliações", "Ajuda", "Mais"]);
  const ids = ["painel", "motoristas", "destravar", "passageiros", "veiculos", "equipe", "cupons", "empresas", "areas", "punicoes", "desafios", "indicacoes", "solicitar", "recuperacao", "monitoramento", "mapa", "historico", "ocorrencias", "programadas", "pagamentos-pendentes", "objetos", "carteiras", "extrato", "saques", "recargas", "relatorios", "conversas", "notificacoes", "config-gerais", "regras-credito", "categorias", "tarifas-dinamicas", "descontos", "regras-despacho", "transbordos", "integracoes", "config-nps", "termos-app", "avaliacoes", "juridico", "central-ajuda", "alterar-senha"];
  for (const id of ids) {
    const f = FUNCOES.find((x) => x.id === id);
    assert.ok(f, `falta o id ${id}`);
    assert.equal(f.rota, id === "painel" ? "/" : `/${id}`);
  }
  assert.equal(new Set(FUNCOES.map((f) => f.rota)).size, FUNCOES.length, "rotas repetidas");
  const todas = FUNCOES.flatMap((f) => [f.rota, ...(f.antigas ?? [])]);
  assert.equal(new Set(todas).size, todas.length, "rota antiga colide com outra");
});

test("períodos do painel: hoje, semana, mês e anterior de mesmo tamanho", () => {
  const agora = new Date(Date.UTC(2026, 10, 12, 15)); // quinta, 12/11/2026
  const hoje = datasDoPeriodo("hoje", undefined, undefined, agora);
  assert.deepEqual([hoje.inicio, hoje.fim, hoje.antInicio, hoje.antFim], ["2026-11-12", "2026-11-12", "2026-11-11", "2026-11-11"]);
  const sem = datasDoPeriodo("semana", undefined, undefined, agora);
  assert.equal(sem.inicio, "2026-11-09");
  assert.equal(sem.dias, 4);
  const mp = datasDoPeriodo("mes_passado", undefined, undefined, agora);
  assert.deepEqual([mp.inicio, mp.fim], ["2026-10-01", "2026-10-31"]);
  const pe = datasDoPeriodo("personalizado", "2026-11-01", "2026-11-10", agora);
  assert.equal(pe.dias, 10);
  assert.equal(pe.antInicio, "2026-10-22");
});

test("variação em % e NPS", () => {
  assert.equal(variacao(150, 100), 50);
  assert.equal(variacao(50, 100), -50);
  assert.equal(variacao(5, 0), null, "sem período anterior não dá para comparar");
  assert.equal(nps([5, 5, 5, 4, 1]), 40);
  assert.equal(nps([]), null);
});

test("Alterar Senha: perfil e senha do próprio usuário", () => {
  const emp = D.criarEmpresa("Empresa Conta");
  const u = D.criarUsuario({ email: "gestor@exemplo.com.br", nome: "Gestor", senha: "senha-antiga-1", empresaId: emp.id, papel: "admin" });
  const novo = D.atualizarUsuario(u.id, { nome: "Gestor Novo", telefone: "(16) 99999-0000" });
  assert.equal(novo.nome, "Gestor Novo");
  assert.equal(novo.telefone, "(16) 99999-0000");
  assert.throws(() => D.atualizarUsuario(u.id, { senha: "curta" }), /8 caracteres/);
  assert.throws(() => D.atualizarUsuario(u.id, { email: "invalido" }), /inválido/);
  const trocado = D.atualizarUsuario(u.id, { senha: "senha-nova-123" });
  assert.equal(D.senhaConfere("senha-nova-123", trocado.hash), true);
  assert.equal(D.senhaConfere("senha-antiga-1", trocado.hash), false);
});
