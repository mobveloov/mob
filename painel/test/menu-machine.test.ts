// Menu da Machine: todo item existe em funcoes.ts (mesmo nome e rota) e continua alcançável no menu lateral ENXUTO do ADMIN
// (agora como aba de uma entrada; veja docs/MENU_ENXUTO.md). Lista copiada do menu real da Machine (cargo Administrador).
import { test } from "node:test";
import assert from "node:assert/strict";
import { FUNCOES, funcoesDoCargo } from "../src/comum/funcoes.ts";
import { destinoDaFuncao, itensParaBusca, menuLateral, rotaDaEntrada } from "../src/comum/menu-lateral.ts";

// "Cadastro > Gestão de áreas > Cidades" não entra: o dono não achou essa tela na Machine.
// [grupo, submenu ("" = solto no grupo), nome, id]
const MACHINE: Array<[string, string, string, string]> = [
  ["Painel", "", "Painel", "painel"],
  ["Cadastro", "", "Minha equipe", "equipe"], ["Cadastro", "", "Cupons", "cupons"], ["Cadastro", "", "Passe Livre", "passe-livre"],
  ["Cadastro", "", "Empresas", "empresas"], ["Cadastro", "", "Faixa de Vouchers", "faixas-vouchers"],
  ["Cadastro", "Gestão de áreas", "Áreas", "areas"], ["Cadastro", "Gestão de áreas", "Plantão", "plantao"],
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

test("o menu da Machine tem 75 itens e todos estão em funcoes.ts, com rota /id", () => {
  assert.equal(MACHINE.length, 75);
  for (const [, , nome, id] of MACHINE) {
    const f = FUNCOES.find((x) => x.id === id);
    assert.ok(f, `falta ${id} (${nome}) em funcoes.ts`);
    assert.equal(f.nome, nome, `nome de ${id}`);
    assert.equal(f.rota, id === "painel" ? "/" : `/${id}`, `rota de ${id}`);
  }
});

test("ADMIN alcança no menu lateral cada item da Machine: a tela virou aba de uma entrada, com o mesmo nome", () => {
  const menu = menuLateral(funcoesDoCargo("admin"));
  const abas = menu.flatMap((g) => g.entradas.flatMap((e) => e.abas.map((x) => ({ grupo: g.nome, entrada: e, aba: x }))));
  for (const [, , nome, id] of MACHINE) {
    const x = abas.find((y) => y.aba.id === id);
    assert.ok(x, `${nome} (${id}) ausente do menu lateral do admin`);
    assert.equal(x.aba.funcao.nome, nome, `nome antigo de ${id}`);
    assert.equal(destinoDaFuncao(id)!.entrada.id, x.entrada.id);
  }
});

test("a busca global acha cada item da Machine pelo nome da Machine e leva à aba certa", () => {
  const busca = itensParaBusca(funcoesDoCargo("admin"));
  const sem = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  for (const [grupo, sub, nome, id] of MACHINE) {
    const i = busca.find((y) => y.id === id);
    assert.ok(i, `${id} fora da busca`);
    assert.ok(sem(`${i.nome} ${i.caminho} ${i.tambem}`).includes(sem(nome)), `a busca não acha "${nome}" (${grupo} > ${sub})`);
    const d = destinoDaFuncao(id)!;
    assert.ok(i.rota.startsWith(rotaDaEntrada(d.entrada)), `${id} abre na entrada errada`);
  }
});

test("o cargo esconde o que não pode: operador não vê Configurações, Cartão nem Taxas da central", () => {
  const op = menuLateral(funcoesDoCargo("operador")).flatMap((g) => g.entradas.flatMap((e) => e.abas.map((i) => i.id)));
  for (const id of ["taxas-central", "config-gerais", "cartao-painel", "creditos-extrato", "ultimo-boleto", "equipe", "passe-livre"]) assert.ok(!op.includes(id), id);
  for (const id of ["painel", "solicitar", "conversas", "ajuda-termos", "ouvidoria"]) assert.ok(op.includes(id), id);
});

// Itens nossos, fora da Machine (não entram na lista MACHINE acima).
test("Personalização app motorista é item nosso: aba Motorista dentro de Apps, só admin", () => {
  assert.ok(!MACHINE.some(([, , , id]) => id === "personalizacao-motorista"));
  const f = FUNCOES.find((x) => x.id === "personalizacao-motorista")!;
  assert.equal(f.rota, "/personalizacao-motorista");
  assert.equal(f.minimo, "admin");
  const apps = menuLateral(funcoesDoCargo("admin")).flatMap((g) => g.entradas).find((e) => e.id === "apps")!;
  assert.equal(apps.abas.find((x) => x.id === "personalizacao-motorista")!.secao, "Motorista");
  const op = menuLateral(funcoesDoCargo("operador")).flatMap((g) => g.entradas.flatMap((e) => e.abas.map((i) => i.id)));
  assert.ok(!op.includes("personalizacao-motorista"));
});
