// Menu da Machine: todo item (com o caminho exato) existe em funcoes.ts e aparece no menu lateral do ADMIN com o mesmo
// nome, no mesmo grupo e submenu. Lista copiada do menu real da Machine (cargo Administrador).
import { test } from "node:test";
import assert from "node:assert/strict";
import { FUNCOES, funcoesDoCargo } from "../src/comum/funcoes.ts";
import { itensParaBusca, menuLateral } from "../src/comum/menu-lateral.ts";

// [grupo, submenu ("" = solto no grupo), nome, id]
const MACHINE: Array<[string, string, string, string]> = [
  ["Painel", "", "Painel", "painel"],
  ["Cadastro", "", "Minha equipe", "equipe"], ["Cadastro", "", "Cupons", "cupons"], ["Cadastro", "", "Passe Livre", "passe-livre"],
  ["Cadastro", "", "Empresas", "empresas"], ["Cadastro", "", "Faixa de Vouchers", "faixas-vouchers"],
  ["Cadastro", "Gestão de áreas", "Áreas", "areas"], ["Cadastro", "Gestão de áreas", "Cidades", "cidades"], ["Cadastro", "Gestão de áreas", "Plantão", "plantao"],
  ["Cadastro", "", "Motoristas", "motoristas"], ["Cadastro", "", "Punições", "punicoes"],
  ["Cadastro", "Clientes", "Clientes", "passageiros"], ["Cadastro", "Clientes", "Consulta de cartões", "consulta-cartoes"],
  ["Cadastro", "", "Ruas", "ruas"], ["Cadastro", "", "Desafios", "desafios"],
  ["Corridas", "", "Solicitar nova corrida", "solicitar"], ["Corridas", "", "Acompanhamento", "monitoramento"], ["Corridas", "", "Retorno e Ocorrências", "ocorrencias"],
  ["Corridas", "", "Consultar corridas", "historico"], ["Corridas", "", "Mapa de motoristas", "mapa"], ["Corridas", "", "Consultar programadas", "programadas"],
  ["Corridas", "", "Taxas de cancelamento", "taxas-cancelamento"], ["Corridas", "", "Relatórios", "indice-relatorios"], ["Corridas", "", "Alteração de dados da OS", "alterar-os"],
  ["Corridas", "", "Entrega de voucher", "entrega-voucher"], ["Corridas", "", "Objetos perdidos", "objetos"], ["Corridas", "", "Mapa de engajamento", "engajamento"],
  ["Financeiro", "Créditos", "Carteiras de crédito", "carteiras"], ["Financeiro", "Créditos", "Recargas e Saques", "creditos-recargas-saques"], ["Financeiro", "Créditos", "Extrato", "creditos-extrato"],
  ["Financeiro", "Cartão", "Painel de Controle", "cartao-painel"], ["Financeiro", "Cartão", "Transações", "cartao-transacoes"],
  ["Financeiro", "Cartão", "Saldo da Central", "cartao-saldo-central"], ["Financeiro", "Cartão", "Saldo do Motorista", "cartao-saldo-motorista"],
  ["Financeiro", "Pix", "Transações", "transacao-pix"],
  ["Financeiro", "Contas a receber", "Faturamento por empresa", "faturamento-empresa"], ["Financeiro", "Contas a receber", "Faturamento de centro de custo", "faturamento-centro-custo"],
  ["Financeiro", "Contas a receber", "Faturamento por período", "faturamento-periodo"],
  ["Financeiro", "Contas a pagar", "Vouchers e tickets por motoristas", "vouchers-motoristas"], ["Financeiro", "Contas a pagar", "Pagamentos pendentes", "pagamentos-pendentes"],
  ["Financeiro", "Relatórios", "Visão geral", "visao-geral"], ["Financeiro", "Relatórios", "Faturamento", "relatorio-faturamento"], ["Financeiro", "Relatórios", "Transações online", "extrato-online"],
  ["Financeiro", "Estatísticas", "OS por motorista", "os-motorista"], ["Financeiro", "Estatísticas", "OS por empresa", "os-empresa"], ["Financeiro", "Estatísticas", "OS por bairro", "os-bairro"],
  ["Financeiro", "Estatísticas", "OS por forma de pagamento", "os-pagamento"], ["Financeiro", "Estatísticas", "OS por operador", "os-operador"], ["Financeiro", "Estatísticas", "% de OS por motorista", "os-percentual-motorista"],
  ["Financeiro", "Poder público", "Km rodados por motorista", "km-rodados"], ["Financeiro", "", "Recompensas por indicação", "indicacoes"],
  ["Comunicação", "", "Conversas", "conversas"], ["Comunicação", "", "Notificações app", "notificacoes"], ["Comunicação", "", "Alertas para empresas", "alertas-empresas"],
  ["Configurações", "", "Gerais", "config-gerais"], ["Configurações", "", "Personalização app passageiro", "personalizacao-app"], ["Configurações", "", "Carteiras de crédito", "carteiras-credito"],
  ["Configurações", "", "Taxas da central", "taxas-central"], ["Configurações", "", "Despacho", "regras-despacho"], ["Configurações", "", "Transbordos", "transbordos"],
  ["Configurações", "", "Tarifas e categorias", "categorias"], ["Configurações", "", "Tarifas dinâmicas", "tarifas-dinamicas"], ["Configurações", "", "Descontos", "descontos"],
  ["Configurações", "", "Integrações", "integracoes"], ["Configurações", "", "NPS", "config-nps"], ["Configurações", "", "Termos de uso", "termos-app"],
  ["Cobrança", "", "Último boleto", "ultimo-boleto"], ["Cobrança", "", "Demonstrativo Mensal", "demonstrativo-mensal"], ["Cobrança", "", "Meus planos", "meus-planos"],
  ["Cobrança", "", "Extrato da central", "extrato-central"], ["Cobrança", "", "Controle financeiro de centrais", "controle-centrais"],
  ["Avaliações", "", "NPS", "avaliacoes"],
  ["Ajuda", "", "Termos de uso", "ajuda-termos"], ["Ajuda", "", "Política de privacidade", "juridico"], ["Ajuda", "", "Central de suporte", "central-suporte"], ["Ajuda", "", "Ouvidoria", "ouvidoria"],
];

test("o menu da Machine tem 76 itens e todos estão em funcoes.ts, com rota /id", () => {
  assert.equal(MACHINE.length, 76);
  for (const [, , nome, id] of MACHINE) {
    const f = FUNCOES.find((x) => x.id === id);
    assert.ok(f, `falta ${id} (${nome}) em funcoes.ts`);
    assert.equal(f.nome, nome, `nome de ${id}`);
    assert.equal(f.rota, id === "painel" ? "/" : `/${id}`, `rota de ${id}`);
  }
});

test("ADMIN vê no menu lateral cada item da Machine com o mesmo nome, grupo e submenu", () => {
  const menu = menuLateral(funcoesDoCargo("admin"));
  for (const [grupo, sub, nome, id] of MACHINE) {
    const g = menu.find((x) => x.nome === grupo);
    assert.ok(g, `grupo ${grupo} ausente do menu lateral`);
    const b = g.blocos.find((x) => x.itens.some((i) => i.id === id));
    assert.ok(b, `${grupo} > ${nome} (${id}) ausente do menu lateral do admin`);
    assert.equal(b.titulo ?? "", sub, `submenu de ${grupo} > ${nome}`);
    assert.equal(b.itens.find((i) => i.id === id)!.nome, nome);
  }
});

test("a busca global lista as mesmas telas do menu, com caminho \"Grupo > Submenu\"", () => {
  const busca = itensParaBusca(funcoesDoCargo("admin"));
  const ids = busca.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const [grupo, sub, , id] of MACHINE) assert.equal(busca.find((i) => i.id === id)?.caminho, sub ? `${grupo} > ${sub}` : grupo);
});

test("Taxas da central e as categorias estão soltas em Configurações (sem bloco recolhido)", () => {
  const cfg = menuLateral(funcoesDoCargo("admin")).find((g) => g.nome === "Configurações")!;
  assert.ok(cfg.blocos.every((b) => !b.titulo));
  const nomes = cfg.blocos.flatMap((b) => b.itens.map((i) => i.nome));
  assert.ok(nomes.includes("Taxas da central") && nomes.includes("Tarifas e categorias"));
});

test("o cargo esconde o que não pode: operador não vê Configurações, Cartão nem Taxas da central", () => {
  const op = menuLateral(funcoesDoCargo("operador")).flatMap((g) => g.blocos.flatMap((b) => b.itens.map((i) => i.id)));
  for (const id of ["taxas-central", "config-gerais", "cartao-painel", "creditos-extrato", "ultimo-boleto", "equipe", "passe-livre"]) assert.ok(!op.includes(id), id);
  for (const id of ["painel", "solicitar", "conversas", "ajuda-termos", "ouvidoria"]) assert.ok(op.includes(id), id);
});
