// Menu lateral enxuto: telas parecidas viram UMA entrada com abas, sem perder função nenhuma.
// Confere: todo id antigo é alcançável (id -> entrada + aba), toda rota antiga redireciona para a aba certa,
// o cargo e o módulo desligado escondem a aba (e a entrada, se não sobrar nenhuma), e a busca acha os nomes novos e antigos.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FUNCOES, funcoesDoCargo } from "../src/comum/funcoes.ts";
import { MODULOS } from "../src/comum/modulos.ts";
import { GRUPOS_MENU, destinoDaFuncao, itensParaBusca, menuLateral, redirecionamentos, rotaDaEntrada, todasEntradas } from "../src/comum/menu-lateral.ts";

const abas = (cargo: string) => menuLateral(funcoesDoCargo(cargo)).flatMap((g) => g.entradas.flatMap((e) => e.abas.map((x) => x.id)));
const entradas = (cargo: string) => menuLateral(funcoesDoCargo(cargo)).flatMap((g) => g.entradas);

function destinoRotaEsperada(id: string) {
  const d = destinoDaFuncao(id)!;
  const rota = rotaDaEntrada(d.entrada);
  return d.entrada.abas[0].id === id ? rota : `${rota}?aba=${id}`;
}

test("grupos na ordem, cada um com cor diferente", () => {
  assert.deepEqual(GRUPOS_MENU.map((g) => g.nome), ["Painel", "Cadastro", "Corridas", "Financeiro", "Comunicação", "Configurações", "Cobrança", "Avaliações", "Ajuda", "CRM", "Mais"]);
  assert.equal(new Set(GRUPOS_MENU.map((g) => g.cor)).size, GRUPOS_MENU.length);
});

test("o menu caiu de 100+ telas para poucas entradas, e ninguém ficou sem aba", () => {
  const n = todasEntradas().length;
  assert.ok(FUNCOES.length > 95, "funcoes.ts continua com todas as funções");
  assert.ok(n >= 25 && n <= 50, `entradas do menu: ${n}`);
  assert.ok(n < FUNCOES.length / 2);
  for (const e of todasEntradas()) assert.ok(e.abas.length >= 1);
});

test("plataforma: todo id de funcoes.ts está em UMA aba de UMA entrada (nada some, nada repete)", () => {
  const no = abas("plataforma");
  assert.equal(new Set(no).size, no.length, "aba repetida");
  assert.deepEqual([...no].sort(), FUNCOES.map((f) => f.id).sort(), "função faltando ou sobrando no menu");
  for (const f of FUNCOES) {
    const d = destinoDaFuncao(f.id);
    assert.ok(d, `${f.id} sem entrada`);
    assert.equal(d.aba.id, f.id);
  }
});

test("entradas: ids e rotas únicos; rota da entrada nunca colide com rota de outra função", () => {
  const es = todasEntradas();
  assert.equal(new Set(es.map((e) => e.id)).size, es.length);
  const rotas = es.map(rotaDaEntrada);
  assert.equal(new Set(rotas).size, rotas.length, "rota de entrada repetida");
  const rotasFuncoes = new Map(FUNCOES.map((f) => [f.rota, f.id]));
  for (const e of es) { const dono = rotasFuncoes.get(rotaDaEntrada(e)); assert.ok(!dono || e.abas.some((x) => x.id === dono), `rota ${rotaDaEntrada(e)} de ${e.id} é da função ${dono}`); }
});

test("toda rota antiga (rota da função e apelidos) abre a entrada na aba certa", () => {
  const red = redirecionamentos(funcoesDoCargo("plataforma"));
  const de = red.map((r) => r.de);
  assert.equal(new Set(de).size, de.length, "rota antiga repetida");
  for (const f of FUNCOES) {
    const d = destinoDaFuncao(f.id)!;
    const rotaEnt = rotaDaEntrada(d.entrada);
    for (const r of [f.rota, ...(f.antigas ?? [])]) {
      if (r === rotaEnt) continue; // a própria rota da entrada
      const x = red.find((y) => y.de === r);
      assert.ok(x, `rota antiga ${r} (${f.id}) não redireciona`);
      const [caminho, q] = x.para.split("?");
      assert.equal(caminho, rotaEnt, `${r} vai para a entrada errada`);
      // a primeira aba abre sem parâmetro; as outras com ?aba=<id da função>
      assert.equal(new URLSearchParams(q ?? "").get("aba") ?? d.entrada.abas[0].id, f.id, `${r} vai para a aba errada`);
    }
  }
  // exemplos pedidos pelo dono
  assert.deepEqual(red.find((r) => r.de === "/punicoes"), { de: "/punicoes", para: "/motoristas?aba=punicoes" });
  assert.equal(red.find((r) => r.de === "/clientes")?.para, "/passageiros");
  assert.equal(red.find((r) => r.de === "/estatisticas")?.para, "/visao-geral?aba=relatorios");
  assert.equal(red.find((r) => r.de === "/personalizacao-motorista")?.para, "/aplicativos?aba=personalizacao-motorista");
  assert.equal(red.find((r) => r.de === "/documentos")?.para, "/aplicativos?aba=documentos");
  assert.equal(red.find((r) => r.de === "/personalizacao-app")?.para, "/aplicativos");
});

test("Apps: um item só, com Passageiro, Motorista e Totem como seções e todas as telas de apps dentro", () => {
  const apps = entradas("plataforma").find((e) => e.id === "apps")!;
  assert.equal(apps.rota, "/aplicativos");
  assert.deepEqual([...new Set(apps.abas.map((x) => x.secao))], ["Passageiro", "Motorista", "Totem"]);
  const por = (s: string) => apps.abas.filter((x) => x.secao === s).map((x) => x.id);
  assert.deepEqual(por("Passageiro"), ["personalizacao-app"]);
  assert.deepEqual(por("Motorista").sort(), ["apps", "documentos", "personalizacao-motorista"]);
  assert.deepEqual(por("Totem").sort(), ["app-totem", "totem"]);
  assert.equal(apps.abas[0].rota, "/aplicativos", "abre na primeira aba (Passageiro)");
  assert.equal(apps.abas.find((x) => x.id === "documentos")!.rota, "/aplicativos?aba=documentos");
});

test("exemplos: Punições dentro de Motoristas; Cartão, Créditos e Pix em Pagamentos; alertas e avisos juntos", () => {
  assert.equal(destinoDaFuncao("punicoes")!.entrada.id, "motoristas");
  const pag = ["carteiras", "creditos-recargas-saques", "creditos-extrato", "cartao-painel", "cartao-transacoes", "cartao-saldo-central", "cartao-saldo-motorista", "transacao-pix", "saques", "recargas", "extrato"];
  for (const id of pag) assert.equal(destinoDaFuncao(id)!.entrada.nome, "Pagamentos", id);
  for (const id of ["alertas-seguranca", "alertas-empresas", "notificacoes", "ocorrencias"]) assert.equal(destinoDaFuncao(id)!.entrada.nome, "Alertas e avisos", id);
  for (const id of ["descontos", "config-nps", "termos-app", "regras-credito"]) assert.equal(destinoDaFuncao(id)!.entrada.nome, "Descontos e regras", id);
  for (const id of ["areas", "plantao", "ruas"]) assert.equal(destinoDaFuncao(id)!.entrada.nome, "Áreas e ruas", id);
});

test("operador: a aba só aparece se o cargo mínimo da tela deixa; entrada sem aba permitida some", () => {
  const op = new Set(abas("operador"));
  for (const f of FUNCOES.filter((x) => x.minimo && x.minimo !== "operador")) assert.ok(!op.has(f.id), `${f.id} apareceu para o operador`);
  for (const id of ["painel", "motoristas", "juridico", "solicitar"]) assert.ok(op.has(id), id);
  // Motoristas: o operador vê Motoristas, Destravar e Veículos, mas não Punições nem Desafios (gestor).
  const mot = entradas("operador").find((e) => e.id === "motoristas")!;
  assert.deepEqual(mot.abas.map((x) => x.id), ["motoristas", "destravar", "veiculos"]);
  // Entrada toda de gestor: some para o operador e aparece para o gestor.
  assert.ok(!entradas("operador").some((e) => e.id === "ultimo-boleto"));
  assert.ok(entradas("gestor").some((e) => e.id === "ultimo-boleto"));
  // Grupo sem entrada permitida some.
  assert.ok(!menuLateral(funcoesDoCargo("operador")).some((g) => g.id === "cobranca"));
  // Equipe e filiais: o gestor vê só Filiais; ela vira a primeira aba e abre sem parâmetro.
  const eq = entradas("gestor").find((e) => e.id === "equipe")!;
  assert.deepEqual(eq.abas.map((x) => x.id), ["filiais"]);
  assert.equal(eq.abas[0].rota, eq.rota);
});

test("primeira aba permitida abre sem parâmetro; as outras levam ?aba=<id>", () => {
  for (const e of entradas("plataforma")) e.abas.forEach((x, i) => assert.equal(x.rota, i === 0 ? e.rota : `${e.rota}?aba=${x.id}`));
});

test("módulo desligado esconde a aba, e a entrada some quando não sobra nenhuma", () => {
  const todas = funcoesDoCargo("plataforma");
  for (const m of MODULOS) {
    const sem = todas.filter((f) => !m.funcoes.includes(f.id));
    const vis = menuLateral(sem).flatMap((g) => g.entradas.flatMap((e) => e.abas.map((x) => x.id)));
    for (const id of m.funcoes) assert.ok(!vis.includes(id), `${m.id}: ${id} continua visível`);
    for (const e of menuLateral(sem).flatMap((g) => g.entradas)) assert.ok(e.abas.length > 0);
  }
  // Filiais desligado: a entrada "Equipe e filiais" fica só com a equipe.
  const semFiliais = menuLateral(todas.filter((f) => f.id !== "filiais")).flatMap((g) => g.entradas).find((e) => e.id === "equipe")!;
  assert.deepEqual(semFiliais.abas.map((x) => x.id), ["equipe"]);
  // Módulos de apps e de totem desligados: Apps ainda tem a personalização do passageiro e do motorista...
  const semApps = todas.filter((f) => !["apps", "documentos", "totem", "app-totem"].includes(f.id));
  assert.deepEqual(menuLateral(semApps).flatMap((g) => g.entradas).find((e) => e.id === "apps")!.abas.map((x) => x.id), ["personalizacao-app", "personalizacao-motorista"]);
  // ...e sem nenhuma das telas dela, a entrada some.
  const nada = todas.filter((f) => destinoDaFuncao(f.id)!.entrada.id !== "apps");
  assert.ok(!menuLateral(nada).flatMap((g) => g.entradas).some((e) => e.id === "apps"));
});

test("busca: acha o nome novo (entrada e aba) e os nomes antigos, e leva à aba certa", () => {
  const itens = itensParaBusca(funcoesDoCargo("plataforma"), "Aurora");
  const ids = itens.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual([...ids].sort(), FUNCOES.map((f) => f.id).sort(), "uma linha de busca por função");
  const sem = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const acha = (q: string) => itens.filter((i) => sem(q).split(/\s+/).every((p) => sem(`${i.nome} ${i.caminho} ${i.tambem}`).includes(p)));
  // nome antigo de cada função
  for (const f of FUNCOES) {
    const esperado = f.id === "analise" ? "Análise com Aurora" : f.id === "marca" ? "Marca e aparência" : f.nome;
    const x = acha(esperado).find((i) => i.id === f.id);
    assert.ok(x, `a busca não acha "${esperado}" (${f.id})`);
    assert.equal(x.rota, destinoRotaEsperada(f.id));
  }
  // nome novo da entrada leva a todas as abas dela
  assert.ok(acha("Pagamentos").length >= 11);
  assert.ok(acha("Equipe e filiais").some((i) => i.id === "filiais"));
  assert.ok(acha("Apps motorista documentos").some((i) => i.id === "documentos"));
  assert.equal(itens.find((i) => i.id === "punicoes")!.caminho, "Cadastro > Motoristas");
  assert.equal(itens.find((i) => i.id === "cartao-transacoes")!.caminho, "Financeiro > Pagamentos > Cartão");
  assert.equal(itens.find((i) => i.id === "transacao-pix")!.caminho, "Financeiro > Pagamentos > Pix");
});
