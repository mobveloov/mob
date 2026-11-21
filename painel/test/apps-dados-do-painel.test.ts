// O painel é a única fonte da verdade dos apps: formas de pagamento, saque e recarga, agendamento, paradas, etiquetas de avaliação,
// avisos do motorista e assuntos da reclamação têm de vir das configurações do painel, e mudar lá muda no app sem gerar APK.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

process.env.DADOS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "apps-dados-painel-"));
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "t".repeat(40);
process.env.APPS_MOSTRAR_CODIGO = "1";
process.env.APPS_CODIGOS_POR_IP = "1000";
process.env.OSRM_PUBLICO = "0";
process.env.NOMINATIM_PUBLICO = "0";

const express = (await import("express")).default;
const D = await import("../src/servidor/dados.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar } = await import("../src/cadastros/armazem.ts");
const { rotasApps } = await import("../src/apps/rotas.ts");
const { salvarGerais } = await import("../src/config/gerais.ts");
const { salvarPagamentos } = await import("../src/config/pagamentos.ts");
const { lancar } = await import("../src/apps/extras.ts");

const app = express();
app.use(express.json());
app.use("/api/apps", rotasApps);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => servidor.close());

const E = D.criarEmpresa("Central Dados");
criar(E.id, cadastroPorId("categorias")!, { nome: "Econômico", bandeirada: 5, valorKm: 2, valorMinimo: 9.9, ativa: true, comissaoTipo: "Percentual", comissaoValor: 10 }, "teste");
const motorista = criar(E.id, cadastroPorId("motoristas")!, { nome: "Lia Motorista", telefone: "11900000002", status: "Ativo", veiculo: "Sedã preto", placa: "XYZ9K87" }, "teste");
const API = `/api/apps/${E.id}`;
const EMB = { texto: "Rua das Flores, 100", lat: -23.55, lng: -46.63 };

async function chamar(metodo: string, url: string, corpo?: unknown, token?: string) {
  const r = await fetch(base + url, {
    method: metodo,
    headers: { ...(corpo !== undefined ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return { status: r.status, corpo: await r.json() as any };
}
async function entrar(papel: "passageiro" | "motorista", telefone: string) {
  const c = await chamar("POST", `${API}/entrar/codigo`, { papel, telefone });
  const e = await chamar("POST", `${API}/entrar`, { papel, telefone, codigo: c.corpo.codigoTeste });
  assert.equal(e.status, 200, JSON.stringify(e.corpo));
  if (papel === "passageiro") await chamar("POST", `${API}/eu`, { nome: "Cliente" }, e.corpo.token);
  return e.corpo.token as string;
}
const agendarEm = (minutos: number) => new Date(Date.now() - 3 * 3600_000 + minutos * 60_000).toISOString().slice(0, 16);

test("formas de pagamento do app = métodos ligados no painel (Integrações)", async () => {
  const tp = await entrar("passageiro", "11988880001");
  assert.deepEqual((await chamar("GET", `${API}/opcoes`, undefined, tp)).corpo.pagamentos, ["Dinheiro", "Pix", "Cartão na maquininha", "Saldo da carteira"]);
  salvarPagamentos(E.id, { metodos: { "Pix": false, "Cartão na Maquininha": false } });
  assert.deepEqual((await chamar("GET", `${API}/opcoes`, undefined, tp)).corpo.pagamentos, ["Dinheiro", "Saldo da carteira"]);
  // Pagamento desligado no painel não vale mais na corrida.
  const r = await chamar("POST", `${API}/corridas`, { pedidoId: "pix-desligado-1", embarque: EMB, categoria: "Econômico", pagamento: "Pix" }, tp);
  assert.equal(r.status, 400, JSON.stringify(r.corpo));
  assert.match(r.corpo.erro, /pagamento/i);
  salvarPagamentos(E.id, { metodos: { "Pix": true, "Cartão na Maquininha": true } });
});

test("etiquetas de avaliação, avisos e problemas do motorista e assuntos da reclamação vêm do painel", async () => {
  const tp = await entrar("passageiro", "11988880002");
  const tm = await entrar("motorista", "11900000002");
  salvarGerais(E.id, { avaliacao: { etiquetasBoas: ["Gentil"], etiquetasRuins: ["Lento"] }, motorista: { avisosDeConduta: ["Use o cinto"], problemasNaCorrida: ["Pneu furado"] } });
  assert.deepEqual((await chamar("GET", `${API}/etiquetas-avaliacao`, undefined, tp)).corpo, { boas: ["Gentil"], ruins: ["Lento"] });
  const cfg = (await chamar("GET", `${API}/config`, undefined, tm)).corpo;
  assert.deepEqual(cfg.motorista.avisosDeConduta, ["Use o cinto"]);
  assert.deepEqual(cfg.motorista.problemasNaCorrida, ["Pneu furado"]);
  assert.ok(cfg.assuntosDeOcorrencia.includes("Cobrança") && cfg.assuntosDeOcorrencia.includes("Outro"));
  assert.equal(cfg.passageiro.agendamentoMinutos, 15);
});

test("saque e recarga do motorista seguem o painel (mínimo e liga/desliga)", async () => {
  const tm = await entrar("motorista", "11900000002");
  lancar(E.id, "motorista", motorista.id, 100, "Crédito de teste", "teste");
  salvarPagamentos(E.id, { saque: { ativo: true, minimo: 30 }, recarga: { minimoMotorista: 25 } });
  const c = (await chamar("GET", `${API}/carteira`, undefined, tm)).corpo;
  assert.equal(c.saque.minimo, 30);
  assert.equal(c.recargaRegras.minimo, 25);
  const pouco = await chamar("POST", `${API}/saques`, { valor: 20, chavePix: "11900000002" }, tm);
  assert.equal(pouco.status, 400);
  assert.match(pouco.corpo.erro, /R\$ 30,00/);
  salvarPagamentos(E.id, { saque: { ativo: false } });
  const desligado = await chamar("POST", `${API}/saques`, { valor: 50, chavePix: "11900000002" }, tm);
  assert.equal(desligado.status, 400);
  assert.match(desligado.corpo.erro, /desligados/);
  salvarPagamentos(E.id, { saque: { ativo: true } });
  assert.equal((await chamar("POST", `${API}/saques`, { valor: 50, chavePix: "11900000002" }, tm)).status, 200);
});

test("agendamento e paradas seguem as regras do painel", async () => {
  const tp = await entrar("passageiro", "11988880003");
  salvarGerais(E.id, { passageiro: { agendamentoMinutos: 60, agendamentoDias: 2, limiteParadas: 1 } });
  const cedo = await chamar("POST", `${API}/corridas`, { pedidoId: "agenda-cedo-1", embarque: EMB, categoria: "Econômico", pagamento: "Dinheiro", agendadaPara: agendarEm(30) }, tp);
  assert.equal(cedo.status, 400);
  assert.match(cedo.corpo.erro, /60 minutos/);
  const longe = await chamar("POST", `${API}/corridas`, { pedidoId: "agenda-longe-1", embarque: EMB, categoria: "Econômico", pagamento: "Dinheiro", agendadaPara: agendarEm(5 * 24 * 60) }, tp);
  assert.equal(longe.status, 400);
  assert.match(longe.corpo.erro, /2 dias/);
  const ok = await chamar("POST", `${API}/corridas`, { pedidoId: "agenda-ok-1", embarque: EMB, categoria: "Econômico", pagamento: "Dinheiro", agendadaPara: agendarEm(90) }, tp);
  assert.equal(ok.status, 200, JSON.stringify(ok.corpo));
  const paradas = [{ texto: "A", lat: -23.551, lng: -46.631 }, { texto: "B", lat: -23.552, lng: -46.632 }];
  const muitas = await chamar("POST", `${API}/corridas`, { pedidoId: "paradas-1", embarque: EMB, destino: { texto: "Fim", lat: -23.6, lng: -46.66 }, categoria: "Econômico", pagamento: "Dinheiro", paradas }, tp);
  assert.equal(muitas.status, 400);
  assert.match(muitas.corpo.erro, /No máximo 1 paradas/);
  salvarGerais(E.id, { passageiro: { paradasAtivo: false } });
  const nenhuma = await chamar("POST", `${API}/corridas`, { pedidoId: "paradas-2", embarque: EMB, destino: { texto: "Fim", lat: -23.6, lng: -46.66 }, categoria: "Econômico", pagamento: "Dinheiro", paradas: [paradas[0]] }, tp);
  assert.equal(nenhuma.status, 400);
  assert.match(nenhuma.corpo.erro, /não permite paradas/);
});

test("termos de uso e privacidade do app são os escritos no painel (rota pública)", async () => {
  const { salvarTermos } = await import("../src/config/gerais.ts");
  salvarTermos(E.id, { passageiro: "Regra do passageiro da Central Dados.", privacidade: "Privacidade da Central Dados.", modoPassageiro: "proprio" });
  const p = await chamar("GET", `${API}/termos/passageiro`);
  assert.equal(p.status, 200);
  assert.equal(p.corpo.texto, "Regra do passageiro da Central Dados.");
  assert.equal((await chamar("GET", `${API}/termos/privacidade`)).corpo.texto, "Privacidade da Central Dados.");
  salvarTermos(E.id, { modoPassageiro: "nenhum" });
  assert.equal((await chamar("GET", `${API}/termos/passageiro`)).corpo.texto, "");
  assert.equal((await chamar("GET", `${API}/termos/outro`)).status, 404);
});

test("editar a rota no meio da corrida segue o painel (Passageiro pode editar rota?)", async () => {
  const tp = await entrar("passageiro", "11988880009");
  const r = await chamar("POST", `${API}/corridas`, { pedidoId: "rota-edit-1", embarque: EMB, destino: { texto: "Fim", lat: -23.6, lng: -46.66 }, categoria: "Econômico", pagamento: "Dinheiro" }, tp);
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  salvarGerais(E.id, { passageiro: { editarRota: false } });
  const nao = await chamar("POST", `${API}/corridas/${r.corpo.corrida.id}/rota`, { destino: { texto: "Outro", lat: -23.61, lng: -46.67 } }, tp);
  assert.equal(nao.status, 400);
  assert.match(nao.corpo.erro, /não permite mudar a rota/);
  salvarGerais(E.id, { passageiro: { editarRota: true } });
  const sim = await chamar("POST", `${API}/corridas/${r.corpo.corrida.id}/rota`, { destino: { texto: "Outro", lat: -23.61, lng: -46.67 } }, tp);
  assert.equal(sim.status, 200, JSON.stringify(sim.corpo));
});

test("gravação das corridas segue o painel (Regras do motorista)", async () => {
  const tm = await entrar("motorista", "11900000002");
  assert.deepEqual((await chamar("GET", `${API}/gravacao/config`, undefined, tm)).corpo, { ativa: true, obrigatoria: false, video: false, dias: 30, diasNoAparelho: 3 });
  salvarGerais(E.id, { motorista: { gravacao: { ativa: true, obrigatoria: true, video: true, dias: 10 } } });
  assert.deepEqual((await chamar("GET", `${API}/gravacao/config`, undefined, tm)).corpo, { ativa: true, obrigatoria: true, video: true, dias: 10, diasNoAparelho: 3 });
  salvarGerais(E.id, { motorista: { gravacao: { ativa: false } } });
  assert.equal((await chamar("GET", `${API}/gravacao/config`, undefined, tm)).corpo.obrigatoria, false);
});

test("Maçaneta: nunca salva = ligada; o painel desliga, limita categorias e define os dados pedidos", async () => {
  const tm = await entrar("motorista", "11900000002");
  assert.equal((await chamar("GET", `${API}/config`, undefined, tm)).corpo.macaneta.ativo, true, "nunca salva vale ligada");
  salvarGerais(E.id, { motorista: { editarValorFinal: true }, macaneta: { ativo: false } });
  const off = await chamar("POST", `${API}/macaneta`, { modo: "taximetro", categoria: "Econômico", lat: -23.55, lng: -46.63 }, tm);
  assert.equal(off.status, 400);
  assert.match(off.corpo.erro, /não usa a corrida Maçaneta/);
  salvarGerais(E.id, { macaneta: { ativo: true, pedeNome: true, pedeTelefone: true, pedeCpf: true, pedeEmail: true, categorias: ["Outra"] } });
  const cat = await chamar("POST", `${API}/macaneta`, { modo: "taximetro", categoria: "Econômico", lat: -23.55, lng: -46.63 }, tm);
  assert.match(cat.corpo.erro, /categoria não faz/);
  salvarGerais(E.id, { macaneta: { categorias: [] } });
  const sem = await chamar("POST", `${API}/macaneta`, { modo: "taximetro", categoria: "Econômico", lat: -23.55, lng: -46.63, passageiro: { nome: "Zé Silva" } }, tm);
  assert.match(sem.corpo.erro, /telefone/);
  const cpf = await chamar("POST", `${API}/macaneta`, { modo: "taximetro", categoria: "Econômico", lat: -23.55, lng: -46.63, passageiro: { nome: "Zé Silva", telefone: "11977776666" } }, tm);
  assert.match(cpf.corpo.erro, /CPF/);
  salvarGerais(E.id, { macaneta: { pedeNome: false, pedeTelefone: false, pedeCpf: false, pedeEmail: false } });
});

test("CPF do passageiro, banners, taxa de saque, validade da contra-oferta e aviso de alta demanda seguem o painel", async () => {
  // CPF obrigatório no cadastro (rota pública avisa a tela de criar conta).
  assert.equal((await chamar("GET", `${API}/regras-cadastro`)).corpo.cpfObrigatorio, false);
  salvarGerais(E.id, { passageiro: { cpfObrigatorio: true } });
  assert.equal((await chamar("GET", `${API}/regras-cadastro`)).corpo.cpfObrigatorio, true);
  const dados = { papel: "passageiro", nome: "Maria Souza", genero: "Feminino", telefone: "11955554444", email: "maria@teste.test", senha: "Senha-forte-9" };
  const sem = await chamar("POST", `${API}/conta/criar`, dados);
  assert.equal(sem.status, 400);
  assert.match(sem.corpo.erro, /CPF/);
  const com = await chamar("POST", `${API}/conta/criar`, { ...dados, cpf: "529.982.247-25" });
  assert.equal(com.status, 200, JSON.stringify(com.corpo));
  salvarGerais(E.id, { passageiro: { cpfObrigatorio: false } });
  // Banners de Gerais › Banners (sem banner: lista vazia; imagem inexistente: 404).
  assert.deepEqual((await chamar("GET", `${API}/banners?tipo=app`)).corpo, { banners: [] });
  assert.equal((await chamar("GET", `${API}/banners/nao-existe/imagem`)).status, 404);
  // Taxa fixa do saque: fica com a central, o valor precisa cobrir a taxa.
  const m2 = criar(E.id, cadastroPorId("motoristas")!, { nome: "Bia Motorista", telefone: "11900000077", status: "Ativo", veiculo: "Sedã", placa: "BIA1A11" }, "teste");
  const tm = await entrar("motorista", "11900000077");
  lancar(E.id, "motorista", m2.id, 200, "Crédito de teste 2", "teste");
  salvarPagamentos(E.id, { saque: { ativo: true, minimo: 1, taxaFixa: 5 } });
  assert.equal((await chamar("GET", `${API}/carteira`, undefined, tm)).corpo.saque.taxaFixa, 5);
  const baixo = await chamar("POST", `${API}/saques`, { valor: 4, chavePix: "11900000077" }, tm);
  assert.equal(baixo.status, 400);
  const ok = await chamar("POST", `${API}/saques`, { valor: 40, chavePix: "11900000077" }, tm);
  assert.equal(ok.status, 200, JSON.stringify(ok.corpo));
  assert.equal(ok.corpo.saque.taxa, 5);
  salvarPagamentos(E.id, { saque: { taxaFixa: 0, minimo: 10 } });
  // Validade da contra-oferta e demais tempos, e regras do motorista.
  salvarGerais(E.id, { motorista: { contraofertaSegundos: 45, reofertaMinutos: 3, mapaNavegacao: false, distanciaRecalculo: 200, confirmarTaxas: true, editarValorFinal: false } });
  const cfg = (await chamar("GET", `${API}/config`, undefined, tm)).corpo.motorista;
  assert.equal(cfg.contraofertaSegundos, 45);
  assert.equal(cfg.reofertaMinutos, 3);
  assert.equal(cfg.mapaNavegacao, false);
  assert.equal(cfg.distanciaRecalculo, 200);
  assert.equal(cfg.confirmarTaxas, true);
  assert.equal(cfg.editarValorFinal, false);
  // Estimativa avisa se o preço está em alta demanda.
  const tp = await entrar("passageiro", "11988880020");
  const est = await chamar("GET", `${API}/estimativa?categoria=${encodeURIComponent("Econômico")}&latEmbarque=-23.55&lngEmbarque=-46.63&latDestino=-23.6&lngDestino=-46.66`, undefined, tp);
  assert.equal(est.corpo.dinamica, false);
  assert.equal((await chamar("GET", `${API}/aceitacao`, undefined, tm)).corpo.janela, 100);
  assert.equal((await chamar("GET", `${API}/gravacao/config`, undefined, tm)).corpo.diasNoAparelho, 3);
});

test("valor final da corrida: com a edição desligada vale o valor combinado", async () => {
  salvarGerais(E.id, { motorista: { editarValorFinal: false } });
  const tp = await entrar("passageiro", "11988880021");
  criar(E.id, cadastroPorId("motoristas")!, { nome: "Cris Motorista", telefone: "11900000088", status: "Ativo", veiculo: "Sedã", placa: "CRI1A11" }, "teste");
  const tm = await entrar("motorista", "11900000088");
  await chamar("POST", `${API}/online`, { lat: -23.552, lng: -46.63 }, tm);
  const c = await chamar("POST", `${API}/corridas`, { pedidoId: "valor-final-1", embarque: EMB, destino: { texto: "Fim", lat: -23.6, lng: -46.66 }, categoria: "Econômico", pagamento: "Dinheiro" }, tp);
  assert.equal(c.status, 200, JSON.stringify(c.corpo));
  const estado = await chamar("GET", `${API}/estado`, undefined, tm);
  const idCorrida = estado.corpo.oferta.corrida.id as string;
  const cheia = (await chamar("POST", `${API}/ofertas/${estado.corpo.oferta.id}/aceitar`, {}, tm));
  assert.equal(cheia.status, 200, JSON.stringify(cheia.corpo));
  for (const st of ["no_local", "em_andamento"]) await chamar("POST", `${API}/corridas/${idCorrida}/status`, { status: st }, tm);
  const fim = await chamar("POST", `${API}/corridas/${idCorrida}/status`, { status: "finalizada", valor: 999 }, tm);
  assert.equal(fim.status, 200, JSON.stringify(fim.corpo));
  assert.equal(fim.corpo.corrida.valor, cheia.corpo.corrida.estimativa.valor);
});
