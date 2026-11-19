// Testes das abas de análise do CRM (CRM-2): Contatos, RFM, Conversão, Mapa de Calor, Recompensas, Cidades, Governança e Auditoria.
// Nada sai para a internet. Rodar: npx tsx --test test/crm2.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-crm2-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "y".repeat(40);

const { default: express } = await import("express");
const { corridaVazia } = await import("../src/comum/corrida.ts");
const D = await import("../src/servidor/dados.ts");
const { criarCookie, exigirLogin } = await import("../src/servidor/sessao.ts");
const { router } = await import("../src/crm/rotas.ts");
const A = await import("../src/crm/armazem.ts");
const E = await import("../src/crm/envio.ts");
const { chaveDe } = await import("../src/crm/publico.ts");
const { ntile, segmentoRfm, calcularRfm, atualizarRfm, resumoRfm } = await import("../src/crm2/rfm.ts");
const { estagioDoContato, calcularMetricas, sincronizar } = await import("../src/crm2/contatos.ts");
const { relatorioDeConversao, conversaoDaEmpresa } = await import("../src/crm2/conversao.ts");
const { gradeDeCalor } = await import("../src/crm2/mapa.ts");
const { compararFotos } = await import("../src/crm2/auditoria.ts");
const { dentroDaJanela, sanearConfig2, salvarConfig2, bd } = await import("../src/crm2/base.ts");
const { barrarEnvio } = await import("../src/crm2/governanca.ts");
const { listarCupons, descontoDosUltimos30Dias } = await import("../src/crm2/recompensas.ts");

const DIA = 86_400_000;
const AGORA = Date.parse("2026-11-10T15:00:00Z");
let seq = 0;
function corrida(p: Partial<ReturnType<typeof corridaVazia>>) {
  seq++;
  return { ...corridaVazia({ id: `c:${seq}`, origem: "x", origemNome: "X", os: String(seq), grupo: "finalizada", statusTexto: "Finalizada" }), ...p };
}
/** Data da corrida no padrão do painel (Brasília nos campos UTC), n dias antes de AGORA. */
const iso = (diasAtras: number) => new Date(AGORA - 3 * 3_600_000 - diasAtras * DIA).toISOString();

// ---------------------------------------------------------------- RFM (puro)

test("RFM: ntile reparte igual e a sobra vai para os primeiros grupos", () => {
  assert.deepEqual(ntile(10, 5), [1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  assert.deepEqual(ntile(7, 5), [1, 1, 2, 2, 3, 4, 5]);
  assert.deepEqual(ntile(3, 5), [1, 2, 3]);
  assert.deepEqual(ntile(0, 5), []);
});

test("RFM: segmentos pela nota de recência e frequência (regras do sistema de referência)", () => {
  assert.equal(segmentoRfm(5, 5), "champions");
  assert.equal(segmentoRfm(4, 4), "champions");
  assert.equal(segmentoRfm(3, 3), "leais");
  assert.equal(segmentoRfm(4, 2), "novos_promissores");
  assert.equal(segmentoRfm(3, 1), "precisam_atencao");
  assert.equal(segmentoRfm(2, 5), "nao_pode_perder");
  assert.equal(segmentoRfm(1, 3), "em_risco");
  assert.equal(segmentoRfm(1, 1), "hibernando_perdidos");
  assert.equal(segmentoRfm(2, 2), "hibernando_perdidos");
});

test("RFM: nota de 1 a 5 pela posição; quem não tem corrida fica de fora", () => {
  const base = Array.from({ length: 10 }, (_, i) => ({ chave: `p:${String(i).padStart(2, "0")}`, ultima: AGORA - (10 - i) * DIA, corridas: i + 1, gasto: (i + 1) * 10 }));
  base.push({ chave: "p:zero", ultima: null as unknown as number, corridas: 0, gasto: 0 });
  const notas = calcularRfm(base);
  assert.equal(notas.length, 10);
  const melhor = notas.find((n) => n.chave === "p:09")!, pior = notas.find((n) => n.chave === "p:00")!;
  assert.deepEqual([melhor.r, melhor.f, melhor.m, melhor.segmento, melhor.pontos], [5, 5, 5, "champions", 555]);
  assert.deepEqual([pior.r, pior.f, pior.m, pior.segmento], [1, 1, 1, "hibernando_perdidos"]);
  // Mesmo resultado em qualquer ordem de entrada.
  assert.deepEqual(calcularRfm([...base].reverse()).sort((a, b) => a.chave.localeCompare(b.chave)), [...notas].sort((a, b) => a.chave.localeCompare(b.chave)));
});

// ---------------------------------------------------------------- contatos (puro)

test("estágio: novo, ativo, fiel, em risco, inativo e perdido", () => {
  const d = (n: number) => AGORA - n * DIA;
  assert.equal(estagioDoContato(null, 0, AGORA), "novo");
  assert.equal(estagioDoContato(d(5), 3, AGORA), "ativo");
  assert.equal(estagioDoContato(d(30), 10, AGORA), "fiel");
  assert.equal(estagioDoContato(d(31), 10, AGORA), "em_risco");
  assert.equal(estagioDoContato(d(59), 2, AGORA), "em_risco");
  assert.equal(estagioDoContato(d(60), 2, AGORA), "inativo");
  assert.equal(estagioDoContato(d(89), 2, AGORA), "inativo");
  assert.equal(estagioDoContato(d(90), 2, AGORA), "perdido");
});

test("métricas: conta só finalizadas, soma o gasto, acha a categoria favorita e usa o cadastro para nome e cidade", () => {
  const corridas = [
    corrida({ passageiro: "Maria", telefonePassageiro: "(11) 91111-1111", categoria: "Econômico", valor: 20, solicitadaEm: iso(5), finalizadaEm: iso(5), cidade: "Norte", avaliacao: 5 }),
    corrida({ passageiro: "Maria", telefonePassageiro: "11911111111", categoria: "Econômico", valor: 30, solicitadaEm: iso(2), finalizadaEm: iso(2), cidade: "Norte", avaliacao: 4 }),
    corrida({ passageiro: "Maria", telefonePassageiro: "11911111111", categoria: "Moto", valor: 10, solicitadaEm: iso(1), finalizadaEm: iso(1) }),
    corrida({ passageiro: "Maria", telefonePassageiro: "11911111111", grupo: "cancelada", solicitadaEm: iso(1) }),
    corrida({ passageiro: "Sem Telefone", telefonePassageiro: "", valor: 9 }),
  ];
  const cad = [{ nome: "Maria Souza", telefone: "11911111111", cidade: "Sul", nascimento: "1990-05-01", criadoEm: new Date(AGORA - 100 * DIA).toISOString() }];
  const m = calcularMetricas(corridas, cad);
  assert.equal(m.size, 1, "sem telefone não entra na base de contatos");
  const x = m.get("p:11911111111")!;
  assert.equal(x.nome, "Maria Souza");
  assert.equal(x.cidade, "Sul", "cidade do cadastro vale mais");
  assert.equal(x.finalizadas, 3);
  assert.equal(x.canceladas, 1);
  assert.equal(x.gasto, 60);
  assert.equal(x.categoriaFavorita, "Econômico");
  assert.equal(x.notaMedia, 4.5);
  assert.equal(x.aniversario, "1990-05-01");
  assert.equal(x.telefone, "5511911111111");
});

// ---------------------------------------------------------------- conversão (puro)

test("conversão: corrida finalizada em até N horas depois da mensagem; receita é a 1ª corrida depois dela", () => {
  const H = 3_600_000;
  const envios = [
    { id: "1", chave: "p:a", em: 1000 * H, origem: "campaign", fonteId: "c1", fonteNome: "Volta" },
    { id: "2", chave: "p:b", em: 1000 * H, origem: "campaign", fonteId: "c1", fonteNome: "Volta" },
    { id: "3", chave: "p:c", em: 1000 * H, origem: "campaign", fonteId: "c1", fonteNome: "Volta" },
    { id: "4", chave: "p:a", em: 1000 * H, origem: "journey", fonteId: "j1", fonteNome: "Sumidos" },
  ];
  const corridas = [
    { chave: "p:a", em: 1000 * H + 5 * H, valor: 20 },   // 5 h depois: converte
    { chave: "p:a", em: 1000 * H + 8 * H, valor: 99 },   // a 2ª não conta para a receita
    { chave: "p:b", em: 1000 * H + 25 * H, valor: 40 },  // 25 h: fora da janela de 24 h
    { chave: "p:c", em: 1000 * H - 1 * H, valor: 50 },   // antes da mensagem: não conta
  ];
  const r = relatorioDeConversao(envios, corridas, 24);
  const camp = r.find((l) => l.origin === "campaign")!;
  assert.deepEqual([camp.sent, camp.converted, camp.conversion_rate, camp.revenue], [3, 1, 33.33, 20]);
  const jor = r.find((l) => l.origin === "journey")!;
  assert.deepEqual([jor.sent, jor.converted, jor.revenue], [1, 1, 20]);
  assert.equal(relatorioDeConversao(envios, corridas, 48).find((l) => l.origin === "campaign")!.converted, 2, "janela maior pega mais gente");
  assert.deepEqual(r.map((l) => l.origin), ["campaign", "journey"].sort((a, b) => r.findIndex((l) => l.origin === a) - r.findIndex((l) => l.origin === b)));
  assert.ok(r[0].revenue >= r[1].revenue, "maior receita primeiro");
});

// ---------------------------------------------------------------- mapa de calor (puro)

test("mapa de calor: arredonda em 3 casas, separa embarque e desembarque e ignora ponto fora do Brasil ou zerado", () => {
  const g = gradeDeCalor([
    { embarque: { lat: -23.55012, lng: -46.63311 }, destino: { lat: -23.56, lng: -46.65 }, solicitadaEm: iso(3) },
    { embarque: { lat: -23.55049, lng: -46.63349 }, destino: { lat: 0, lng: 0 }, solicitadaEm: iso(1) },
    { embarque: { lat: 40.7, lng: -74.0 }, solicitadaEm: iso(1) },
    { embarque: {}, solicitadaEm: iso(1) },
  ]);
  assert.equal(g.length, 2);
  const a = g.find((c) => c.grid_lat === -23.55 && c.grid_lng === -46.633)!;
  assert.deepEqual([a.pickup_count, a.destination_count], [2, 0]);
  assert.equal(a.last_ride_at, AGORA - DIA);
  const b = g.find((c) => c.grid_lat === -23.56)!;
  assert.deepEqual([b.pickup_count, b.destination_count], [0, 1]);
});

// ---------------------------------------------------------------- auditoria e governança (puro)

test("auditoria: criou, editou, ativou, desativou e excluiu; contadores do motor não contam", () => {
  const foto = (...itens: Array<Record<string, unknown>>) => new Map(itens.map((i) => [String(i.id), i]));
  const antes = foto({ id: "1", nome: "A", ativa: true, texto: "x", ultimaRodada: "a" }, { id: "2", nome: "B", ativa: true }, { id: "3", nome: "C", ativa: true });
  const depois = foto({ id: "1", nome: "A", ativa: false, texto: "x", ultimaRodada: "b" }, { id: "2", nome: "B2", ativa: true }, { id: "4", nome: "D", ativa: true });
  const r = compararFotos("jornada", antes, depois, "ativa");
  const por = (id: string) => r.find((x) => x.entidade_id === id)!;
  assert.equal(por("1").acao, "desativou");
  assert.deepEqual(por("2").campos, ["nome"]);
  assert.equal(por("2").acao, "editou");
  assert.equal(por("3").acao, "excluiu");
  assert.equal(por("4").acao, "criou");
  assert.equal(compararFotos("jornada", foto({ id: "1", nome: "A", ultimaRodada: "a" }), foto({ id: "1", nome: "A", ultimaRodada: "b" })).length, 0);
});

test("governança: janela de horário (também a que passa da meia-noite) e ajuste da configuração", () => {
  const h = (hh: number, mm = 0) => new Date(Date.UTC(2026, 10, 10, hh, mm));
  const dia = { janelaInicio: "08:00", janelaFim: "21:00" };
  assert.equal(dentroDaJanela(dia, h(8)), true);
  assert.equal(dentroDaJanela(dia, h(20, 59)), true);
  assert.equal(dentroDaJanela(dia, h(21)), false);
  assert.equal(dentroDaJanela(dia, h(3)), false);
  const noite = { janelaInicio: "20:00", janelaFim: "06:00" };
  assert.equal(dentroDaJanela(noite, h(23)), true);
  assert.equal(dentroDaJanela(noite, h(5)), true);
  assert.equal(dentroDaJanela(noite, h(12)), false);
  assert.equal(dentroDaJanela({ janelaInicio: "00:00", janelaFim: "00:00" }, h(12)), true);
  assert.deepEqual(sanearConfig2({ janelaInicio: "25:00", janelaFim: "abc", atribuicaoHoras: 9999, exigirOptIn: "sim" as unknown as boolean }), { janelaInicio: "08:00", janelaFim: "21:00", exigirOptIn: false, atribuicaoHoras: 168 });
});

test("recompensas: usos e desconto dos cupons vêm das corridas finalizadas", () => {
  const corridas = [
    corrida({ cupom: "VOLTA10", telefonePassageiro: "11911111111", desconto: 5, finalizadaEm: iso(3), solicitadaEm: iso(3) }),
    corrida({ cupom: "volta10", telefonePassageiro: "11922222222", desconto: 3, finalizadaEm: iso(40), solicitadaEm: iso(40) }),
    corrida({ cupom: "VOLTA10", telefonePassageiro: "11911111111", grupo: "cancelada", desconto: 9 }),
  ];
  const d = descontoDosUltimos30Dias(corridas, AGORA);
  assert.deepEqual(d, { total: 5, corridas: 1 });
  assert.equal(typeof listarCupons, "function");
});

// ---------------------------------------------------------------- tudo junto: banco e rotas

test("contatos e RFM no banco: sincronizar é repetível, não diminui totais e guarda tags e opt-out", async () => {
  const e = D.criarEmpresa("Crm2 Banco").id;
  const corridas = [
    ...Array.from({ length: 4 }, (_, i) => corrida({ passageiro: "Maria", telefonePassageiro: "11911111111", valor: 20, categoria: "Econômico", solicitadaEm: iso(3 + i), finalizadaEm: iso(3 + i) })),
    corrida({ passageiro: "Beto", telefonePassageiro: "11933333333", valor: 50, solicitadaEm: iso(100), finalizadaEm: iso(100) }),
    corrida({ passageiro: "Ana", telefonePassageiro: "11944444444", valor: 10, solicitadaEm: iso(10), finalizadaEm: iso(10) }),
    corrida({ passageiro: "Caio", telefonePassageiro: "11955555555", grupo: "cancelada", solicitadaEm: iso(2) }),
  ];
  const r1 = await sincronizar(e, corridas);
  assert.equal(r1.contatos, 4);
  assert.equal(r1.novos, 4);
  assert.ok(r1.eventos >= 8);
  const r2 = await sincronizar(e, corridas);
  assert.deepEqual([r2.novos, r2.atualizados, r2.eventos], [0, 4, 0], "rodar de novo não duplica nem repete a linha do tempo");
  const linha = (chave: string) => bd().prepare("SELECT * FROM crm_contatos WHERE empresa = ? AND chave = ?").get(e, chave) as Record<string, unknown>;
  const maria = linha("p:11911111111");
  assert.equal(maria.total_corridas, 4);
  assert.equal(maria.total_gasto, 80);
  assert.equal(maria.ticket_medio, 20);
  // Corridas antigas saem da janela lida: o total não cai.
  await sincronizar(e, corridas.slice(0, 1));
  assert.equal(linha("p:11911111111").total_corridas, 4);
  // Tags e opt-out ficam depois de novo sync.
  bd().prepare("UPDATE crm_contatos SET tags = ? WHERE empresa = ? AND chave = ?").run('["vip"]', e, "p:11911111111");
  A.marcarOptOut(e, "p:11933333333", true);
  await sincronizar(e, corridas);
  assert.equal(linha("p:11911111111").tags, '["vip"]');
  assert.equal(linha("p:11933333333").opt_in_status, "out");
  // RFM: 3 pessoas com corrida (Caio só cancelou) e quem não tem corrida vira "sem_corrida".
  assert.equal(atualizarRfm(e), 3);
  const linhas = resumoRfm(e, AGORA);
  assert.equal(linhas.reduce((a, l) => a + l.contacts, 0), 4);
  assert.ok(linhas.some((l) => l.segment === "sem_corrida" && l.contacts === 1));
  assert.ok(linhas[0].ltv >= linhas[linhas.length - 1].ltv, "maior LTV primeiro");
  assert.equal(chaveDe("passageiro", "11911111111", ""), "p:11911111111");
});

test("conversão no banco: mensagens enviadas pela fila viram conversão quando a pessoa pede depois", async () => {
  const e = D.criarEmpresa("Crm2 Conv").id;
  const t0 = Date.now();
  await sincronizar(e, [corrida({ passageiro: "Maria", telefonePassageiro: "11911111111", valor: 30, solicitadaEm: new Date(t0 - 3 * 3_600_000 + 2 * 3_600_000).toISOString(), finalizadaEm: new Date(t0 - 3 * 3_600_000 + 2 * 3_600_000).toISOString() })]);
  A.salvarCampanhas(e, [{ id: "camp1", nome: "Volta", canal: "whatsapp", publico: { tipo: "passageiro" }, texto: "oi", variacoes: [], cupom: "", agendadaPara: null, estado: "concluida", criadaEm: "", atualizadaEm: "", disparadaEm: null, concluidaEm: null, destinatarios: 1 }]);
  A.adicionarNaFila(e, [
    { id: "i1", origem: { tipo: "campanha", id: "camp1" }, chave: "p:11911111111", nome: "Maria", telefone: "5511911111111", texto: "oi", estado: "enviado", tentativas: 1, criadoEm: t0 - 3_600_000, proximaEm: 0, enviadoEm: t0 - 3_600_000, erro: "" },
    { id: "i2", origem: { tipo: "campanha", id: "camp1" }, chave: "p:11999999999", nome: "Zé", telefone: "5511999999999", texto: "oi", estado: "enviado", tentativas: 1, criadoEm: t0 - 3_600_000, proximaEm: 0, enviadoEm: t0 - 3_600_000, erro: "" },
    { id: "i3", origem: { tipo: "campanha", id: "camp1" }, chave: "p:11911111111", nome: "Maria", telefone: "5511911111111", texto: "oi", estado: "pendente", tentativas: 0, criadoEm: t0, proximaEm: t0, enviadoEm: null, erro: "" },
  ]);
  const c = conversaoDaEmpresa(e, 30);
  assert.equal(c.horas, 24);
  assert.equal(c.linhas.length, 1);
  assert.deepEqual([c.linhas[0].source_name, c.linhas[0].sent, c.linhas[0].converted, c.linhas[0].revenue], ["Volta", 2, 1, 30]);
});

test("fila do CRM respeita a governança: fora da janela espera; sem opt-in cancela; sem configuração nada muda", async () => {
  const e = D.criarEmpresa("Crm2 Fila").id;
  const item = (id: string, chave: string, t: number) => ({ id, origem: { tipo: "campanha" as const, id: "c" }, chave, nome: "x", telefone: "5511911111111", texto: "oi", estado: "pendente" as const, tentativas: 0, criadoEm: t, proximaEm: t, enviadoEm: null, erro: "" });
  const meioDia = Date.parse("2026-11-10T15:00:00Z"); // 12:00 em Brasília
  const tresDaManha = Date.parse("2026-11-10T06:00:00Z"); // 03:00 em Brasília
  const provedor = { enviar: async () => ({ ok: true as const }) };
  const rodar = (agora: number) => E.processarFila(e, { agora: () => agora, provedor: provedor as never, dormir: async () => {} });
  A.adicionarNaFila(e, [item("a", "p:1", tresDaManha)]);
  assert.equal((await rodar(tresDaManha)).enviados, 1, "sem configuração salva, qualquer hora vale");
  salvarConfig2(e, { janelaInicio: "08:00", janelaFim: "21:00" });
  A.adicionarNaFila(e, [item("b", "p:2", tresDaManha)]);
  const fora = await rodar(tresDaManha);
  assert.equal(fora.enviados, 0);
  assert.equal(A.fila(e).find((i) => i.id === "b")!.estado, "pendente", "continua pendente, não é falha");
  assert.equal((await rodar(meioDia)).enviados, 1);
  salvarConfig2(e, { exigirOptIn: true });
  A.adicionarNaFila(e, [item("c", "p:3", meioDia)]);
  await rodar(meioDia);
  const c = A.fila(e).find((i) => i.id === "c")!;
  assert.equal(c.estado, "cancelado");
  assert.match(c.erro, /opt-in/i);
  assert.equal(barrarEnvio(e, { chave: "p:3" }, new Date(meioDia - 3 * 3_600_000)).barrar, "optin");
});

test("rotas: contatos, tags, opt-out, importação, exclusão, cidades, cupons, governança e auditoria, com cargos e isolamento", async () => {
  const um = D.criarEmpresa("Crm2 Rota Um").id;
  const dois = D.criarEmpresa("Crm2 Rota Dois").id;
  const adm = D.criarUsuario({ email: "adm@c2um.test", nome: "Adm", senha: "senha-forte-1", empresaId: um, papel: "admin" });
  const ges = D.criarUsuario({ email: "ges@c2um.test", nome: "Ges", senha: "senha-forte-1", empresaId: um, papel: "gestor" });
  const op = D.criarUsuario({ email: "op@c2um.test", nome: "Op", senha: "senha-forte-1", empresaId: um, papel: "operador" });
  const adm2 = D.criarUsuario({ email: "adm@c2dois.test", nome: "Adm2", senha: "senha-forte-2", empresaId: dois, papel: "admin" });
  const app = express();
  app.use(express.json());
  app.post("/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({}); });
  app.use("/api/crm", exigirLogin, router);
  const srv = app.listen(0);
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  try {
    const cookieDe = async (id: string) => ((await fetch(`${base}/entrar/${id}`, { method: "POST" })).headers.get("set-cookie") ?? "").split(";")[0];
    const [cA, cG, cO, cB] = [await cookieDe(adm.id), await cookieDe(ges.id), await cookieDe(op.id), await cookieDe(adm2.id)];
    const pedir = async (p: string, cookie: string, metodo = "GET", corpo?: unknown) => {
      const r = await fetch(base + p, { method: metodo, headers: { "Content-Type": "application/json", Cookie: cookie }, body: corpo ? JSON.stringify(corpo) : undefined });
      return { status: r.status, corpo: await r.json() as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
    };
    assert.equal((await fetch(`${base}/api/crm/contatos`)).status, 401);

    // Importar CSV: telefone inválido e linha vazia viram erro; quem já existe não perde o nome.
    const csv = "nome,telefone\nMaria,(11) 91111-1111\nJosé,123\n,\nBeto,11922222222";
    assert.equal((await pedir("/api/crm/contatos/importar", cO, "POST", { csv })).status, 403, "operador não importa");
    const imp = await pedir("/api/crm/contatos/importar", cG, "POST", { csv });
    assert.equal(imp.corpo.importados, 2);
    assert.equal(imp.corpo.erros.length, 2);
    assert.equal((await pedir("/api/crm/contatos/importar", cG, "POST", { csv: "nome\nX" })).corpo.erros[0], 'Coluna "phone" ou "telefone" não encontrada no cabeçalho.');
    const outra = await pedir("/api/crm/contatos/importar", cG, "POST", { csv: "nome;telefone\nMaria Nova;11911111111" });
    assert.equal(outra.corpo.mantidos, 1);

    // Listar com busca, estágio e página.
    const lista = await pedir("/api/crm/contatos", cO);
    assert.equal(lista.status, 200);
    const mine = lista.corpo.contatos.filter((c: { origem: string }) => c.origem === "importacao");
    assert.equal(mine.length, 2);
    assert.equal(mine.find((c: { telefone: string }) => c.telefone === "5511911111111").nome, "Maria");
    assert.equal((await pedir("/api/crm/contatos?busca=beto", cO)).corpo.total, 1);
    assert.equal((await pedir("/api/crm/contatos?busca=%25zzz", cO)).corpo.total, 0, "% não vira curinga");
    assert.equal((await pedir("/api/crm/contatos?stage=perdido", cO)).corpo.total, 0);
    assert.equal(typeof lista.corpo.estagios.novo, "number");

    // Tags e opt-out (gestor); operador só olha.
    const chave = encodeURIComponent("p:11911111111");
    assert.equal((await pedir(`/api/crm/contatos/${chave}/tags`, cO, "PUT", { tags: ["vip"] })).status, 403);
    assert.deepEqual((await pedir(`/api/crm/contatos/${chave}/tags`, cG, "PUT", { tags: ["vip", " vip ", "centro", ""] })).corpo.tags, ["vip", "centro"]);
    assert.equal((await pedir("/api/crm/contatos?tag=vip", cO)).corpo.total, 1);
    assert.equal((await pedir(`/api/crm/contatos/${chave}/optout`, cG, "POST", { sair: true })).corpo.contato.opt_in_status, "out");
    assert.ok(A.optOuts(um)["p:11911111111"], "a marcação da tela Público acompanha");
    const ficha = (await pedir(`/api/crm/contatos/${chave}`, cO)).corpo;
    assert.ok(ficha.eventos.some((x: { tipo: string }) => x.tipo === "opt_out"));
    assert.equal((await pedir(`/api/crm/contatos/${chave}/optout`, cG, "POST", { sair: false })).corpo.contato.opt_in_status, "pending");
    assert.equal(A.optOuts(um)["p:11911111111"], undefined);
    assert.equal((await pedir("/api/crm/contatos/p:nao-existe", cO)).status, 404);
    assert.equal((await pedir("/api/crm/contatos/xyz/optout", cG, "POST", {})).status, 400);

    // Isolamento entre empresas.
    assert.equal((await pedir("/api/crm/contatos?busca=beto", cB)).corpo.total, 0);
    assert.equal((await pedir(`/api/crm/contatos/${chave}`, cB)).status, 404);

    // Excluir: só admin.
    assert.equal((await pedir(`/api/crm/contatos/${chave}`, cG, "DELETE")).status, 403);
    assert.equal((await pedir(`/api/crm/contatos/${chave}`, cA, "DELETE")).status, 200);
    assert.equal((await pedir(`/api/crm/contatos/${chave}`, cA)).status, 404);

    // RFM e segmento.
    assert.equal((await pedir("/api/crm/rfm/atualizar", cO, "POST", {})).status, 403);
    assert.equal((await pedir("/api/crm/rfm/atualizar", cG, "POST", {})).status, 200);
    assert.equal((await pedir("/api/crm/rfm/segmento", cG, "POST", { segmento: "sem_analise" })).status, 400);
    const seg = await pedir("/api/crm/rfm/segmento", cG, "POST", { segmento: "sem_corrida" });
    assert.equal(seg.status, 200);
    assert.equal(seg.corpo.nome, "RFM: Sem corrida");
    assert.ok(A.listas(um).some((l) => l.nome === "RFM: Sem corrida" && l.modo === "dinamica" && l.regras.rfmSegmento === "sem_corrida"));
    assert.equal((await pedir("/api/crm/rfm", cO)).status, 200);

    // Conversão e mapa.
    assert.equal((await pedir("/api/crm/conversao?dias=30", cO)).corpo.horas, 24);
    const mapa = await pedir("/api/crm/mapa", cO);
    assert.equal(mapa.status, 200);
    assert.ok(Array.isArray(mapa.corpo.celulas));
    assert.equal((await pedir("/api/crm/mapa/atualizar", cO, "POST", {})).status, 403);
    assert.equal((await pedir("/api/crm/mapa/atualizar", cG, "POST", {})).status, 200);

    // Cidades.
    assert.equal((await pedir("/api/crm/cidades", cG, "POST", { name: "" })).status, 400);
    assert.equal((await pedir("/api/crm/cidades", cG, "POST", { name: "Norte", lat: "10", lng: "-46" })).status, 400, "latitude fora do Brasil");
    const cid = await pedir("/api/crm/cidades", cG, "POST", { name: "Cidade Norte", state: "sp", lat: "-23,55", lng: "-46.63", radius_km: 20 });
    assert.equal(cid.status, 200);
    assert.deepEqual([cid.corpo.cidade.state, cid.corpo.cidade.lat, cid.corpo.cidade.radius_km, cid.corpo.cidade.is_active], ["SP", -23.55, 20, true]);
    assert.equal((await pedir("/api/crm/cidades", cG, "POST", { name: "cidade norte", state: "SP" })).status, 400, "repetida");
    const id = cid.corpo.cidade.id;
    assert.equal((await pedir(`/api/crm/cidades/${id}`, cG, "PUT", { name: "Cidade Norte", state: "SP", lat: "-23.5", lng: "-46.6", radius_km: 500 })).corpo.cidade.radius_km, 100);
    await pedir(`/api/crm/cidades/${id}/ligar`, cG, "POST", { ativa: false });
    assert.equal((await pedir("/api/crm/cidades", cO)).corpo.cidades[0].is_active, false);
    assert.equal((await pedir("/api/crm/cidades", cB)).corpo.cidades.length, 0);
    assert.equal((await pedir(`/api/crm/cidades/${id}`, cB, "DELETE")).status, 400);
    assert.equal((await pedir(`/api/crm/cidades/${id}`, cG, "DELETE")).status, 200);

    // Cupons (cadastro de cupons).
    assert.equal((await pedir("/api/crm/recompensas/cupons", cG, "POST", { name: "", code: "" })).status, 400);
    assert.equal((await pedir("/api/crm/recompensas/cupons", cG, "POST", { name: "Promo", code: "promo10", discountType: "percentual", discount: 150 })).status, 400);
    const cup = await pedir("/api/crm/recompensas/cupons", cG, "POST", { name: "Promo", code: "promo-10", discountType: "percentual", discount: 10, usageLimit: "apenas_uma_vez" });
    assert.equal(cup.status, 200);
    assert.equal((await pedir("/api/crm/recompensas/cupons", cG, "POST", { name: "Promo", code: "PROMO10", discount: 10 })).status, 400, "código repetido");
    const rec = (await pedir("/api/crm/recompensas", cO)).corpo;
    assert.deepEqual(rec.resumo, { total: 1, used: 0, active: 1 });
    assert.equal(rec.cupons[0].code, "PROMO10");
    assert.equal((await pedir("/api/crm/recompensas", cB)).corpo.cupons.length, 0);
    assert.equal((await pedir(`/api/crm/recompensas/cupons/${cup.corpo.id}`, cB, "DELETE")).status, 400);
    assert.equal((await pedir(`/api/crm/recompensas/cupons/${cup.corpo.id}`, cG, "DELETE")).status, 200);

    // Governança: só admin salva; mostra contagens.
    const gov = (await pedir("/api/crm/governanca", cO)).corpo;
    assert.ok(gov.totalContacts >= 1);
    assert.equal(gov.settings.janelaInicio, "08:00");
    assert.equal((await pedir("/api/crm/governanca", cG, "PUT", { crm_send_window_start: "09:00" })).status, 403);
    assert.equal((await pedir("/api/crm/governanca", cA, "PUT", { crm_send_window_start: "99:99", crm_send_window_end: "21:00" })).status, 400);
    const salvo = await pedir("/api/crm/governanca", cA, "PUT", { crm_send_window_start: "09:00", crm_send_window_end: "20:30", crm_require_opt_in: true, crm_attribution_hours: 48 });
    assert.deepEqual(salvo.corpo.settings, { janelaInicio: "09:00", janelaFim: "20:30", exigirOptIn: true, atribuicaoHoras: 48 });
    assert.equal((await pedir("/api/crm/conversao", cO)).corpo.horas, 48);
    assert.equal((await pedir("/api/crm/governanca", cB)).corpo.settings.exigirOptIn, false, "outra empresa não muda");

    // Auditoria: quem criou, editou e apagou campanha e lista.
    const camp = await pedir("/api/crm/campanhas", cG, "POST", { nome: "Volta ao app", publico: { tipo: "passageiro" }, texto: "Oi {primeiro_nome}" });
    assert.equal(camp.status, 200, JSON.stringify(camp.corpo));
    await pedir(`/api/crm/campanhas/${camp.corpo.campanha.id}`, cG, "PUT", { nome: "Volta ao app 2", publico: { tipo: "passageiro" }, texto: "Oi {primeiro_nome}" });
    await pedir("/api/crm/campanhas", cG, "POST", { nome: "x", texto: "{variavel_que_nao_existe}" }); // erro: não anota
    await pedir(`/api/crm/campanhas/${camp.corpo.campanha.id}`, cA, "DELETE");
    const aud = (await pedir("/api/crm/auditoria?dias=1", cO)).corpo.linhas as Array<{ action: string; entity_type: string; entity_name: string; actor_email: string; changed_fields: string[] }>;
    assert.deepEqual(aud.filter((l) => l.entity_type === "campanha").map((l) => l.action).reverse(), ["criou", "editou", "excluiu"]);
    assert.equal(aud.find((l) => l.action === "editou")!.changed_fields.includes("nome"), true);
    assert.equal(aud.find((l) => l.action === "criou")!.actor_email, "ges@c2um.test");
    assert.equal((await pedir("/api/crm/auditoria?entidade=campanha&acao=criou", cO)).corpo.linhas.length, 1);
    assert.equal((await pedir("/api/crm/auditoria", cB)).corpo.linhas.length, 0, "outra empresa não vê");
    assert.equal((await pedir("/api/crm/auditoria?entidade=segmento", cO)).corpo.linhas.length, 1, "a lista criada pelo RFM também aparece");
  } finally { srv.close(); }
});
