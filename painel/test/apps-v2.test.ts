// Testes da versão 2 dos apps (docs/APPS_API.md): comissão, contas com senha, aprovação de motorista, chamada com valor
// líquido, contra-oferta, opcionais e pagamento, rota editada, lugares, maçaneta com taxímetro, suporte e ganhos.
// Tudo local, sem internet. Rodar: npm test (na pasta painel).
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "apps-v2-teste-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "t".repeat(40);
process.env.APPS_MOSTRAR_CODIGO = "1";
process.env.APPS_AUDIO_MAX_KB = "64";
process.env.APPS_CADASTROS_POR_IP = "1000";
process.env.APPS_CODIGOS_POR_IP = "1000";

const express = (await import("express")).default;
const D = await import("../src/servidor/dados.ts");
const { criarCookie, exigirLogin } = await import("../src/servidor/sessao.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar, listar } = await import("../src/cadastros/armazem.ts");
const C = await import("../src/corridas/index.ts");
const { rotasApps, rotasAppsCentral } = await import("../src/apps/rotas.ts");
const P = await import("../src/apps/despacho.ts");
const { calcularComissao } = await import("../src/config/comissao.ts");
const { cpfValido } = await import("../src/apps/perfil.ts");

const app = express();
app.use(express.json());
app.post("/teste/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({ ok: true }); });
app.use("/api/apps", rotasApps);
app.use("/api", exigirLogin);
app.use("/api/apps-central", rotasAppsCentral);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => servidor.close());

const U = D.criarEmpresa("Via Nova"), V = D.criarEmpresa("Outra Via");
const admin = D.criarUsuario({ email: "admin@v.test", nome: "Vera", senha: "senha-forte-1", empresaId: U.id, papel: "admin" });
const CAT = cadastroPorId("categorias")!, MOT = cadastroPorId("motoristas")!, CLI = cadastroPorId("clientes")!;
criar(U.id, CAT, { nome: "Econômico", bandeirada: 5, valorKm: 2, valorMinimo: 9.9, ativa: true, comissaoTipo: "Percentual", comissaoValor: 15 }, "teste");
criar(U.id, CAT, { nome: "Moto", bandeirada: 3, valorKm: 1, ativa: true }, "teste");
const duda = criar(U.id, MOT, { nome: "Duda Ativa", telefone: "11911110001", status: "Ativo", veiculo: "Hatch prata", placa: "ABC1D23" }, "teste");
const beto = criar(U.id, MOT, { nome: "Beto Ativo", telefone: "11911110002", status: "Ativo", cobranca: "Isento" }, "teste");
criar(U.id, CLI, { nome: "Cliente da Central", telefone: "11922220001", status: "Ativo" }, "teste");

// Comissão: 15% pela categoria (comissaoTipo e comissaoValor); o Beto é isento (cobranca).

const EMBARQUE = { texto: "Rua das Flores, 100", lat: -23.55, lng: -46.63 };
const DESTINO = { texto: "Av. Central, 2000", lat: -23.6, lng: -46.66 };
const API = `/api/apps/${U.id}`;
const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

async function chamar(metodo: string, url: string, corpo?: unknown, token?: string, extra: Record<string, string> = {}) {
  const r = await fetch(base + url, {
    method: metodo,
    headers: { ...(corpo !== undefined && !(corpo instanceof Uint8Array) ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra },
    body: corpo === undefined ? undefined : corpo instanceof Uint8Array ? (corpo as unknown as BodyInit) : JSON.stringify(corpo),
  });
  const tipo = r.headers.get("content-type") ?? "";
  return { status: r.status, corpo: tipo.includes("json") ? await r.json() : await r.arrayBuffer(), headers: r.headers };
}
async function loginPorCodigo(papel: "passageiro" | "motorista", telefone: string) {
  const c = await chamar("POST", `${API}/entrar/codigo`, { papel, telefone });
  assert.equal(c.status, 200, JSON.stringify(c.corpo));
  const e = await chamar("POST", `${API}/entrar`, { papel, telefone, codigo: c.corpo.codigoTeste });
  assert.equal(e.status, 200, JSON.stringify(e.corpo));
  return e.corpo.token as string;
}
let contador = 0;
async function novaPassageira(nome: string, email?: string) {
  const n = ++contador, telefone = `1197770${String(n).padStart(4, "0")}`;
  const r = await chamar("POST", `${API}/conta/criar`, { papel: "passageiro", nome, genero: "Feminino", telefone, email: email ?? `p${n}@v.test`, senha: "segredo1" });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  return { token: r.corpo.token as string, telefone, eu: r.corpo.eu };
}
const PNG = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, ...crypto.randomBytes(200)]);
const JPG = () => new Uint8Array([0xff, 0xd8, 0xff, ...crypto.randomBytes(200)]);
async function cookieDaCentral() {
  const r = await fetch(`${base}/teste/entrar/${admin.id}`, { method: "POST" });
  return r.headers.get("set-cookie")!.split(";")[0];
}

// ====================================================================== comissão

test("comissão pelo cadastro: percentual da categoria, isento, taxa própria do motorista e nunca passa do bruto", () => {
  assert.deepEqual(calcularComissao(U.id, "Econômico", 25, duda.id), { valorBruto: 25, taxaCentral: 3.75, valorLiquido: 21.25 });
  assert.deepEqual(calcularComissao(U.id, "Econômico", 12.5, duda.id), { valorBruto: 12.5, taxaCentral: 1.88, valorLiquido: 10.62 }, "arredonda em centavos");
  assert.deepEqual(calcularComissao(U.id, "Econômico", 20, beto.id), { valorBruto: 20, taxaCentral: 0, valorLiquido: 20 }, "isento paga zero");
  const fixo = criar(U.id, MOT, { nome: "Fixo Taxa", telefone: "11911110009", status: "Ativo", cobranca: "Personalizado", cobrancaTipo: "Valor fixo", cobrancaValor: 40 }, "teste");
  assert.deepEqual(calcularComissao(U.id, "Econômico", 25, fixo.id), { valorBruto: 25, taxaCentral: 25, valorLiquido: 0 }, "taxa não passa do bruto");
  assert.equal(calcularComissao(U.id, "Econômico", -3, duda.id).valorLiquido, 0);
});

test("CPF: confere os dígitos verificadores", () => {
  assert.equal(cpfValido("529.982.247-25"), true);
  assert.equal(cpfValido("52998224726"), false);
  assert.equal(cpfValido("111.111.111-11"), false);
});

// ====================================================================== contas

test("passageiro: criar conta, entrar com senha ou e-mail, existe, esqueci a senha", async () => {
  const cidades = await chamar("GET", `${API}/cidades`);
  assert.deepEqual(cidades.corpo.cidades, []);
  const curta = await chamar("POST", `${API}/conta/criar`, { papel: "passageiro", nome: "Paula Souza", genero: "Feminino", telefone: "11966660001", email: "paula@v.test", senha: "123" });
  assert.match(curta.corpo.erro, /6 caracteres/);
  const semSobrenome = await chamar("POST", `${API}/conta/criar`, { papel: "passageiro", nome: "Paula", genero: "Feminino", telefone: "11966660001", email: "paula@v.test", senha: "segredo1" });
  assert.match(semSobrenome.corpo.erro, /nome completo/);
  const criada = await chamar("POST", `${API}/conta/criar`, { papel: "passageiro", nome: "Paula Souza Lima", genero: "Feminino", telefone: "(11) 96666-0001", email: "Paula@V.test", senha: "segredo1" });
  assert.equal(criada.status, 200, JSON.stringify(criada.corpo));
  assert.equal(criada.corpo.eu.nome, "Paula Souza Lima");
  assert.equal(criada.corpo.eu.email, "paula@v.test");
  assert.equal(criada.corpo.eu.foto, null);
  // O mesmo telefone ou e-mail não cria de novo; nem o telefone de um passageiro que já veio da central.
  assert.match((await chamar("POST", `${API}/conta/criar`, { papel: "passageiro", nome: "Outra Pessoa", genero: "Outro", telefone: "11966660001", email: "outra@v.test", senha: "segredo1" })).corpo.erro, /já tem cadastro/);
  assert.match((await chamar("POST", `${API}/conta/criar`, { papel: "passageiro", nome: "Outra Pessoa", genero: "Outro", telefone: "11966660009", email: "paula@v.test", senha: "segredo1" })).corpo.erro, /já tem cadastro/);
  assert.match((await chamar("POST", `${API}/conta/criar`, { papel: "passageiro", nome: "Outra Pessoa", genero: "Outro", telefone: "11922220001", email: "novo@v.test", senha: "segredo1" })).corpo.erro, /já tem cadastro/);
  // Existe e máscara.
  const ex = await chamar("POST", `${API}/conta/existe`, { papel: "passageiro", login: "paula@v.test" });
  assert.equal(ex.corpo.existe, true); assert.equal(ex.corpo.temSenha, true); assert.match(ex.corpo.mascarado, /^p\*+@v\.test$/);
  assert.equal((await chamar("POST", `${API}/conta/existe`, { papel: "passageiro", login: "11900000000" })).corpo.existe, false);
  assert.equal((await chamar("POST", `${API}/conta/existe`, { papel: "motorista", login: "paula@v.test" })).corpo.existe, false, "passageira não é motorista");
  // Entrar por telefone e por e-mail; senha errada.
  for (const login of ["11966660001", "(11) 96666-0001", "paula@v.test"]) {
    const e = await chamar("POST", `${API}/conta/entrar`, { papel: "passageiro", login, senha: "segredo1" });
    assert.equal(e.status, 200, login);
    assert.ok(e.corpo.token);
  }
  assert.match((await chamar("POST", `${API}/conta/entrar`, { papel: "passageiro", login: "paula@v.test", senha: "errada1" })).corpo.erro, /incorretos/);
  // Conta que veio da central e nunca teve senha: orienta a criar pelo "Esqueci a senha".
  assert.match((await chamar("POST", `${API}/conta/entrar`, { papel: "passageiro", login: "11922220001", senha: "qualquer1" })).corpo.erro, /não tem senha/);
  // Esqueci a senha: código, nova senha, a antiga deixa de valer.
  const esq = await chamar("POST", `${API}/conta/esqueci`, { papel: "passageiro", login: "paula@v.test" });
  assert.equal(esq.status, 200);
  const nova = await chamar("POST", `${API}/conta/nova-senha`, { papel: "passageiro", login: "paula@v.test", codigo: esq.corpo.codigoTeste, senha: "novinha2" });
  assert.equal(nova.status, 200, JSON.stringify(nova.corpo));
  assert.equal((await chamar("POST", `${API}/conta/entrar`, { papel: "passageiro", login: "paula@v.test", senha: "segredo1" })).status, 400);
  assert.equal((await chamar("POST", `${API}/conta/entrar`, { papel: "passageiro", login: "paula@v.test", senha: "novinha2" })).status, 200);
  assert.equal((await chamar("POST", `${API}/conta/nova-senha`, { papel: "passageiro", login: "paula@v.test", codigo: "000000", senha: "outra123" })).status, 400);
  // Quem não tem conta recebe a mesma resposta do esqueci (não mostra quem é cliente).
  assert.deepEqual((await chamar("POST", `${API}/conta/esqueci`, { papel: "passageiro", login: "11900000000" })).corpo, { enviado: true });
  // Trocar a senha logada.
  const tok = nova.corpo.token;
  assert.match((await chamar("POST", `${API}/conta/senha`, { atual: "errada", nova: "abcdef1" }, tok)).corpo.erro, /atual/);
  assert.equal((await chamar("POST", `${API}/conta/senha`, { atual: "novinha2", nova: "abcdef1" }, tok)).status, 200);
  assert.equal((await chamar("POST", `${API}/conta/entrar`, { papel: "passageiro", login: "paula@v.test", senha: "abcdef1" })).status, 200);
});

test("limite de tentativas de senha por login", async () => {
  const p = await novaPassageira("Rita Tentativas Lima");
  let ultimo = 0;
  for (let i = 0; i < 10; i++) ultimo = (await chamar("POST", `${API}/conta/entrar`, { papel: "passageiro", login: p.telefone, senha: `errada${i}` })).status;
  assert.equal(ultimo, 429);
});

// ====================================================================== motorista novo e aprovação

let tokNovo = "", idNovo = "";
test("motorista novo: cadastro em análise, completa os passos, só fica online depois de aprovado", async () => {
  const dados = { papel: "motorista", nome: "Marcos Antônio Reis", cpf: "529.982.247-25", telefone: "11955550101", email: "marcos@v.test", nascimento: "1990-05-10", genero: "Masculino", chavePix: "marcos@v.test", senha: "segredo1" };
  assert.match((await chamar("POST", `${API}/conta/criar`, { ...dados, cpf: "529.982.247-26" })).corpo.erro, /CPF inválido/);
  assert.match((await chamar("POST", `${API}/conta/criar`, { ...dados, nascimento: "2015-01-01" })).corpo.erro, /18 anos/);
  assert.match((await chamar("POST", `${API}/conta/criar`, { ...dados, chavePix: "" })).corpo.erro, /Pix/);
  const r = await chamar("POST", `${API}/conta/criar`, dados);
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  tokNovo = r.corpo.token;
  assert.equal(r.corpo.eu.emAnalise, true);
  assert.equal(r.corpo.eu.aprovado, false);
  assert.ok(r.corpo.eu.pendencias.includes("Foto do rosto") && r.corpo.eu.pendencias.includes("Veículo") && r.corpo.eu.pendencias.some((x: string) => /CNH/.test(x)));
  idNovo = listar(U.id, MOT).find((m) => m.telefone === "11955550101")!.id;
  assert.equal(listar(U.id, MOT).find((m) => m.id === idNovo)!.status, "Aguardando aprovação");
  assert.match((await chamar("POST", `${API}/conta/criar`, dados)).corpo.erro, /já tem cadastro/);
  // Não fica online nem pega corrida enquanto está em análise.
  assert.match((await chamar("POST", `${API}${"/online"}`, { lat: -23.55, lng: -46.63 }, tokNovo)).corpo.erro, /em análise/);
  assert.deepEqual((await chamar("GET", `${API}/corridas-abertas`, undefined, tokNovo)).corpo.disponiveis, []);

  // Passo 2: foto do rosto (e ela só abre para a própria pessoa).
  assert.match((await chamar("POST", `${API}/foto`, new Uint8Array([1, 2, 3, 4]), tokNovo, { "content-type": "image/png" })).corpo.erro, /não é uma foto/);
  assert.match((await chamar("POST", `${API}/foto`, PNG(), tokNovo, { "content-type": "image/gif" })).corpo.erro, /JPG ou PNG/);
  const f = await chamar("POST", `${API}/foto`, PNG(), tokNovo, { "content-type": "image/png" });
  assert.equal(f.status, 200); assert.equal(f.corpo.foto, `${API}/foto/motorista/${idNovo}`);
  assert.equal((await chamar("GET", f.corpo.foto, undefined, tokNovo)).status, 200);
  const outra = await novaPassageira("Pessoa De Fora Lima");
  assert.equal((await chamar("GET", f.corpo.foto, undefined, outra.token)).status, 404, "quem não está numa corrida com ele não vê a foto");

  // Passo 3: endereço. Passo 4: veículo. Passo 5: documentos.
  assert.match((await chamar("POST", `${API}/cadastro/endereco`, { cep: "123", rua: "Rua A", bairro: "Centro", cidade: "Santos", uf: "SP", numero: "10" }, tokNovo)).corpo.erro, /CEP/);
  const end = await chamar("POST", `${API}/cadastro/endereco`, { cep: "11010-000", rua: "Rua A", numero: "", semNumero: true, bairro: "Centro", cidade: "Santos", uf: "sp" }, tokNovo);
  assert.equal(end.status, 200, JSON.stringify(end.corpo));
  assert.equal(end.corpo.endereco.semNumero, true); assert.equal(end.corpo.endereco.uf, "SP");
  assert.equal((await chamar("GET", `${API}/cep/11010000`, undefined, tokNovo)).status, 404, "sem base de endereços: o app preenche à mão");
  assert.match((await chamar("POST", `${API}/veiculos`, { modelo: "Gol", placa: "AB-123", ano: 2020, cnh: "12345678901", validadeCnh: "2031-01-01" }, tokNovo)).corpo.erro, /Placa inválida/);
  assert.match((await chamar("POST", `${API}/veiculos`, { modelo: "Gol", placa: "ABC1D23", ano: 2020, cnh: "12345678901", validadeCnh: "2020-01-01" }, tokNovo)).corpo.erro, /vencida/);
  const v = await chamar("POST", `${API}/veiculos`, { modelo: "Gol", placa: "abc-1d23", cor: "Prata", ano: 2020, cnh: "12345678901", validadeCnh: "2031-01-01" }, tokNovo);
  assert.equal(v.status, 200, JSON.stringify(v.corpo));
  assert.equal(v.corpo.veiculos[0].placa, "ABC1D23"); assert.equal(v.corpo.veiculos[0].ativo, true); assert.equal(v.corpo.veiculos[0].situacao, "Em análise");
  const m = listar(U.id, MOT).find((x) => x.id === idNovo)!;
  assert.equal(m.placa, "ABC1D23"); assert.equal(m.veiculo, "Gol Prata", "o veículo ativo vai para o cadastro que a central vê");
  assert.match((await chamar("POST", `${API}/veiculos`, { modelo: "Uno", placa: "ABC1D23", ano: 2019, cnh: "12345678901", validadeCnh: "2031-01-01" }, tokNovo)).corpo.erro, /já está/);
  const ped = (await chamar("GET", `${API}/eu`, undefined, tokNovo)).corpo.eu.pendencias as string[];
  assert.ok(ped.every((x) => /^Documento/.test(x)), `só faltam documentos: ${ped.join(" | ")}`);
  assert.equal(ped.length, 4, "CNH e documento do veículo (exigidos no painel) e as duas laterais");
  for (const tipo of ["cnh", "residencia", "veiculo", "lateralEsquerda", "lateralDireita"]) {
    const d = await chamar("POST", `${API}/documentos/${tipo}`, JPG(), tokNovo, { "content-type": "image/jpeg" });
    assert.equal(d.status, 200, `${tipo}: ${JSON.stringify(d.corpo)}`);
  }
  assert.deepEqual((await chamar("GET", `${API}/eu`, undefined, tokNovo)).corpo.eu.pendencias, []);
  const cad = await chamar("GET", `${API}/cadastro`, undefined, tokNovo);
  assert.equal(cad.corpo.dados.cpf, "52998224725"); assert.equal(cad.corpo.situacao, "Aguardando aprovação");
  // Dados pessoais: mudar nome sim; CPF repetido não.
  assert.equal((await chamar("POST", `${API}/cadastro/dados`, { nome: "Marcos Antônio Reis Filho" }, tokNovo)).corpo.dados.nome, "Marcos Antônio Reis Filho");
  assert.match((await chamar("POST", `${API}/cadastro/dados`, { cpf: "111.444.777-35" }, tokNovo)).corpo.erro ?? "", /^$|CPF/);
});

test("central: vê o cadastro pendente, recusa e aprova; aprovado fica online", async () => {
  const cookie = await cookieDaCentral();
  const lista = await (await fetch(`${base}/api/apps-central/aprovacoes`, { headers: { cookie } })).json();
  const c = lista.motoristas.find((x: { id: string }) => x.id === idNovo);
  assert.ok(c); assert.equal(c.pendencias.length, 0); assert.equal(c.veiculos.length, 1); assert.equal(c.foto, true); assert.equal(c.documentos.cnh.situacao, "Enviado");
  const semMotivo = await fetch(`${base}/api/apps-central/aprovacoes/${idNovo}/recusar`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: "{}" });
  assert.equal(semMotivo.status, 400);
  const ap = await fetch(`${base}/api/apps-central/aprovacoes/${idNovo}/aprovar`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: "{}" });
  assert.equal(ap.status, 200, JSON.stringify(await ap.json()));
  assert.equal(listar(U.id, MOT).find((x) => x.id === idNovo)!.status, "Ativo");
  const eu = (await chamar("GET", `${API}/eu`, undefined, tokNovo)).corpo.eu;
  assert.equal(eu.aprovado, true); assert.equal(eu.emAnalise, false);
  assert.equal((await chamar("GET", `${API}/veiculos`, undefined, tokNovo)).corpo.veiculos[0].situacao, "Aprovado");
  assert.equal((await chamar("POST", `${API}/online`, { lat: -23.56, lng: -46.63 }, tokNovo)).status, 200);
  await chamar("POST", `${API}/offline`, {}, tokNovo);
  // A aprovação avisou o motorista pelo chat da central.
  const msgs = (await chamar("GET", `${API}/suporte`, undefined, tokNovo)).corpo.mensagens;
  assert.ok(msgs.some((m: { de: string; texto: string }) => m.de === "central" && /aprovado/.test(m.texto)));
  // Outra empresa não vê esse cadastro.
  assert.equal((await chamar("GET", `/api/apps/${V.id}/cadastro`, undefined, tokNovo)).status, 401);
});

// ====================================================================== chamada com valor líquido e contra-oferta

let tokDuda = "", tokBeto = "";
test("chamada: valor líquido, bruto, taxa da central e ganho por km, calculados no servidor", async () => {
  P.limparDespacho();
  tokDuda = await loginPorCodigo("motorista", "11911110001");
  tokBeto = await loginPorCodigo("motorista", "11911110002");
  assert.equal((await chamar("POST", `${API}/online`, { lat: -23.559, lng: -46.63 }, tokDuda)).status, 200);
  const pax = await novaPassageira("Paula Chamada Souza");
  const pedido = { embarque: EMBARQUE, destino: DESTINO, categoria: "Econômico", pagamento: "Dinheiro" };
  assert.match((await chamar("POST", `${API}/corridas`, { ...pedido, valorOferecido: 5, pedidoId: "v2-chamada-1" }, pax.token)).corpo.erro, /abaixo/);
  assert.match((await chamar("POST", `${API}/corridas`, { ...pedido, valorOferecido: 900, pedidoId: "v2-chamada-2" }, pax.token)).corpo.erro, /muito acima/);
  const r = await chamar("POST", `${API}/corridas`, { ...pedido, valorOferecido: 25, pedidoId: "v2-chamada-3" }, pax.token);
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(r.corpo.corrida.valorOferecido, 25);
  corridaChamada = { id: r.corpo.corrida.id, pax };

  const o = (await chamar("GET", `${API}/ofertas`, undefined, tokDuda)).corpo.oferta;
  assert.ok(o, "a Duda recebeu a chamada");
  assert.equal(o.valorOferecido, 25);
  assert.equal(o.valorBruto, 25);
  assert.equal(o.taxaCentral, 3.75);
  assert.equal(o.valorLiquido, 21.25);
  assert.equal(o.ganhoPorKm, Math.round((21.25 / o.distanciaViagemKm) * 100) / 100, "ganho por km sai do líquido");
  const linha = o.tabelaLiquido.find((l: { valor: number }) => l.valor === 27);
  assert.deepEqual(linha, { valor: 27, bruto: 27, taxa: 4.05, liquido: 22.95 }, "líquido de cada valor possível da contra-oferta");
  assert.ok(o.tabelaLiquido.every((l: { valor: number }) => l.valor >= 9.9), "nada abaixo do mínimo da categoria");
  assert.equal(o.nota, null); assert.equal(o.viagens, 0);
  assert.ok(o.minutosAteEmbarque >= 1);
  assert.equal(o.corrida.valorLiquido, 21.25, "o mesmo dentro de corrida, que é o que o app lê");
  assert.equal(o.corrida.passageiro, "Paula Chamada Souza");
  // Quem é isento recebe o valor cheio.
  assert.equal(P.valoresDaCorrida(U.id, C.listarProprias(U.id).find((c) => c.id === corridaChamada.id)!, beto.id).valorLiquido, 25);
});
let corridaChamada: { id: string; pax: { token: string; telefone: string } };

test("contra-oferta: o motorista propõe, a passageira vê com os dados dele e aceita; vale o valor combinado", async () => {
  const { id, pax } = corridaChamada;
  assert.match((await chamar("POST", `${API}/corridas/${id}/contraoferta`, { valor: 2 }, tokDuda)).corpo.erro, /abaixo do mínimo/);
  assert.match((await chamar("POST", `${API}/corridas/${id}/contraoferta`, { valor: 500 }, tokDuda)).corpo.erro, /muito acima/);
  assert.match((await chamar("POST", `${API}/corridas/${id}/contraoferta`, { valor: 30 }, tokNovo)).corpo.erro, /online/, "só quem está online");
  const c = await chamar("POST", `${API}/corridas/${id}/contraoferta`, { valor: 30 }, tokDuda);
  assert.equal(c.status, 200, JSON.stringify(c.corpo));
  // Foto do motorista: ela só abre para quem recebeu a contra-oferta.
  assert.equal((await chamar("POST", `${API}/foto`, PNG(), tokDuda, { "content-type": "image/png" })).status, 200);
  const l = (await chamar("GET", `${API}/corridas/${id}/contraofertas`, undefined, pax.token)).corpo.contraofertas;
  assert.equal(l.length, 1); assert.equal(l[0].valor, 30); assert.equal(l[0].motorista.nome, "Duda Ativa"); assert.equal(l[0].motorista.placa, "ABC1D23");
  assert.equal(l[0].motorista.foto, `${API}/foto/motorista/${duda.id}`);
  assert.equal((await chamar("GET", l[0].motorista.foto, undefined, pax.token)).status, 200);
  assert.equal((await chamar("GET", l[0].motorista.foto, undefined, (await novaPassageira("Curiosa De Fora Lima")).token)).status, 404);
  // Outro passageiro não vê nem aceita a contra-oferta alheia.
  const intruso = await novaPassageira("Intruso Qualquer Lima");
  assert.equal((await chamar("GET", `${API}/corridas/${id}/contraofertas`, undefined, intruso.token)).status, 400);
  assert.equal((await chamar("POST", `${API}/corridas/${id}/contraofertas/${l[0].id}/aceitar`, {}, intruso.token)).status, 400);
  const ac = await chamar("POST", `${API}/corridas/${id}/contraofertas/${l[0].id}/aceitar`, {}, pax.token);
  assert.equal(ac.status, 200, JSON.stringify(ac.corpo));
  assert.equal(ac.corpo.corrida.status, "a_caminho");
  assert.equal(ac.corpo.corrida.valorOferecido, 30);
  assert.equal(ac.corpo.corrida.motorista.nome, "Duda Ativa");
  assert.equal(ac.corpo.corrida.motorista.foto, `${API}/foto/motorista/${duda.id}`);
  assert.ok("nota" in ac.corpo.corrida.motorista && "viagens" in ac.corpo.corrida.motorista);
  assert.equal((await chamar("GET", `${API}/ofertas`, undefined, tokDuda)).corpo.oferta, null, "a chamada pendente dela sumiu");
  // Duda anda, chega, inicia e finaliza: o valor é o da contra-oferta.
  for (const s of ["no_local", "em_andamento"]) assert.equal((await chamar("POST", `${API}/corridas/${id}/status`, { status: s }, tokDuda)).status, 200);
  const fim = await chamar("POST", `${API}/corridas/${id}/status`, { status: "finalizada" }, tokDuda);
  assert.equal(fim.corpo.corrida.valor, 30);
  // Etiquetas de avaliação: só as da empresa.
  const aval = await chamar("POST", `${API}/corridas/${id}/avaliar`, { nota: 5, etiquetas: ["Carro limpo", "Inventada", "Direção segura"] }, pax.token);
  assert.deepEqual(aval.corpo.corrida.etiquetas, ["Carro limpo", "Direção segura"]);
  const et = (await chamar("GET", `${API}/etiquetas-avaliacao`, undefined, pax.token)).corpo;
  assert.ok(et.boas.includes("Carro limpo") && et.ruins.includes("Carro sujo"));
  // Nota e viagens da Duda já aparecem.
  const e = (await chamar("GET", `${API}/eu`, undefined, tokDuda)).corpo.eu;
  assert.equal(e.nota, 5); assert.equal(e.viagens, 1);
});

test("ganhos por período: mês e semana, por dia e por forma de pagamento", async () => {
  const mes = (await chamar("GET", `${API}/ganhos?periodo=mes`, undefined, tokDuda)).corpo;
  assert.equal(mes.total, 30); assert.equal(mes.viagens, 1);
  assert.equal(mes.lista.length, 1); assert.equal(mes.lista[0].passageiro, "Paula Chamada Souza");
  assert.deepEqual(mes.porPagamento, [{ pagamento: "Dinheiro", valor: 30, corridas: 1 }]);
  assert.equal(mes.porDia.reduce((s: number, d: { valor: number }) => s + d.valor, 0), 30);
  assert.ok(mes.porDia.length >= 28);
  assert.ok(mes.minutosOnline >= 0 && mes.minutosEmViagem >= 0);
  const sem = (await chamar("GET", `${API}/ganhos?periodo=semana`, undefined, tokDuda)).corpo;
  assert.equal(sem.porDia.length, 7); assert.equal(sem.total, 30);
  assert.equal((await chamar("GET", `${API}/ganhos?periodo=mes&mes=2020-01`, undefined, tokDuda)).corpo.total, 0);
  // Sem período: o resumo simples de antes continua.
  assert.equal((await chamar("GET", `${API}/ganhos`, undefined, tokDuda)).corpo.hoje.corridas, 1);
  // Passageira e outro motorista: só o que é deles.
  assert.equal((await chamar("GET", `${API}/ganhos?periodo=mes`, undefined, tokBeto)).corpo.total, 0);
  assert.equal((await chamar("GET", `${API}/ganhos?periodo=mes`, undefined, corridaChamada.pax.token)).status, 403);
  // Histórico com filtro.
  const h = await chamar("GET", `${API}/corridas?filtro=finalizadas`, undefined, corridaChamada.pax.token);
  assert.equal(h.corpo.corridas.length, 1);
  assert.equal((await chamar("GET", `${API}/corridas?filtro=canceladas`, undefined, corridaChamada.pax.token)).corpo.corridas.length, 0);
  assert.equal((await chamar("GET", `${API}/corridas?filtro=finalizadas&de=2999-01-01`, undefined, corridaChamada.pax.token)).corpo.corridas.length, 0);
});

// ====================================================================== opcionais, pagamento e corridas abertas

test("opcionais e forma de pagamento: só vê e só recebe quem oferece; corridas abertas, pegar", async () => {
  P.limparDespacho();
  await chamar("POST", `${API}/online`, { lat: -23.552, lng: -46.63 }, tokBeto);
  const pax = await novaPassageira("Carla Opcionais Souza");
  const ops = (await chamar("GET", `${API}/opcionais`, undefined, pax.token)).corpo.opcionais;
  assert.deepEqual(ops.map((o: { id: string }) => o.id), ["e0", "e1", "e2", "e3"], "opcionais vêm de Config › Gerais do App");
  const ped = await chamar("POST", `${API}/corridas`, { embarque: EMBARQUE, destino: DESTINO, categoria: "Econômico", pagamento: "Dinheiro", opcionais: ["e0", "inexistente"], pedidoId: "v2-opc-0001" }, pax.token);
  assert.equal(ped.status, 200, JSON.stringify(ped.corpo));
  assert.deepEqual(ped.corpo.corrida.opcionais, ["e0"]);
  // Beto não oferece "porta-malas grande": não recebe a chamada e a corrida não aparece para ele.
  assert.equal((await chamar("GET", `${API}/ofertas`, undefined, tokBeto)).corpo.oferta, null);
  assert.equal((await chamar("GET", `${API}/corridas-abertas`, undefined, tokBeto)).corpo.disponiveis.length, 0);
  assert.match((await chamar("POST", `${API}/corridas/${ped.corpo.corrida.id}/pegar`, {}, tokBeto)).corpo.erro, /não é para você/);
  // Ele passa a oferecer: a corrida aparece com o líquido (isento = cheio) e a opção vem pelo nome.
  const pref = await chamar("POST", `${API}/preferencias`, { categorias: [], filtros: ["e0", "xx"], pagamentos: ["Pix", "Fiado"] }, tokBeto);
  assert.deepEqual(pref.corpo.filtros, ["e0"]); assert.deepEqual(pref.corpo.pagamentos, ["Pix"]);
  assert.equal((await chamar("GET", `${API}/corridas-abertas`, undefined, tokBeto)).corpo.disponiveis.length, 0, "aceita só Pix e a corrida é em dinheiro");
  await chamar("POST", `${API}/preferencias`, { categorias: [], filtros: ["e0"], pagamentos: ["Dinheiro", "Pix"] }, tokBeto);
  const ab = (await chamar("GET", `${API}/corridas-abertas`, undefined, tokBeto)).corpo;
  assert.equal(ab.disponiveis.length, 1);
  const d = ab.disponiveis[0];
  assert.equal(d.id, ped.corpo.corrida.id); assert.deepEqual(d.opcionais, ["Porta-malas grande"]);
  assert.equal(d.valorBruto, d.valorLiquido, "Beto é isento"); assert.equal(d.taxaCentral, 0);
  assert.equal(d.passageiro, "Carla Opcionais Souza"); assert.ok(d.distanciaKm < 2);
  assert.deepEqual(ab.pendentes, []); assert.deepEqual(ab.programadas, []);
  // Quem está em análise ou offline não pega.
  assert.match((await chamar("POST", `${API}/corridas/${d.id}/pegar`, {}, tokNovo)).corpo.erro, /online/);
  const pg = await chamar("POST", `${API}/corridas/${d.id}/pegar`, {}, tokBeto);
  assert.equal(pg.status, 200, JSON.stringify(pg.corpo));
  assert.equal(pg.corpo.corrida.status, "a_caminho"); assert.equal(pg.corpo.corrida.passageiro.telefone, pax.telefone);
  assert.equal((await chamar("GET", `${API}/corridas-abertas`, undefined, tokBeto)).corpo.pendentes.length, 1);
  assert.match((await chamar("POST", `${API}/corridas/${d.id}/pegar`, {}, tokDuda)).corpo.erro, /não está mais disponível|online/);

  // Rota editada com a corrida aberta: acrescenta uma parada e recalcula o preço.
  const antes = pg.corpo.corrida.estimativa;
  const rt = await chamar("POST", `${API}/corridas/${d.id}/rota`, { paradas: [{ texto: "Padaria Central", lat: -23.52, lng: -46.7 }] }, pax.token);
  assert.equal(rt.status, 200, JSON.stringify(rt.corpo));
  assert.equal(rt.corpo.corrida.paradas.length, 1);
  assert.ok(rt.corpo.corrida.estimativa.distanciaKm > antes.distanciaKm, "a rota com parada é mais longa");
  assert.ok(rt.corpo.corrida.estimativa.valor > antes.valor, "e o preço sobe");
  assert.ok(C.listarProprias(U.id).find((c) => c.id === d.id)!.historico.some((h) => h.nota === "Rota editada"));
  assert.match((await chamar("POST", `${API}/corridas/${d.id}/rota`, { paradas: [1, 2, 3, 4].map((n) => ({ texto: `P${n}`, lat: -23.5, lng: -46.6 })) }, pax.token)).corpo.erro, /3 paradas/);
  assert.equal((await chamar("POST", `${API}/corridas/${d.id}/rota`, { paradas: [] }, tokBeto)).status, 403, "só a passageira edita a rota");
  // Cancelar com motivo da empresa.
  const motivos = (await chamar("GET", `${API}/motivos-cancelamento`, undefined, pax.token)).corpo.motivos;
  assert.ok(motivos.includes("Motorista demorou muito"));
  assert.equal((await chamar("POST", `${API}/corridas/${d.id}/cancelar`, { motivo: motivos[0] }, pax.token)).status, 200);
});

// ====================================================================== lugares, foto da passageira, suporte, contatos

test("lugares: casa, trabalho, favoritos e recentes", async () => {
  const pax = await novaPassageira("Ana Lugares Costa");
  assert.deepEqual((await chamar("GET", `${API}/lugares`, undefined, pax.token)).corpo, { casa: null, trabalho: null, favoritos: [], recentes: [] });
  assert.equal((await chamar("POST", `${API}/lugares`, { tipo: "casa", ponto: { texto: "Rua Casa, 1", lat: -23.5, lng: -46.6 } }, pax.token)).corpo.casa.texto, "Rua Casa, 1");
  await chamar("POST", `${API}/lugares`, { tipo: "trabalho", ponto: { texto: "Av. Trabalho, 9" } }, pax.token);
  const f = await chamar("POST", `${API}/lugares`, { tipo: "favorito", nome: "Mãe", ponto: { texto: "Rua da Mãe, 5" } }, pax.token);
  assert.equal(f.corpo.favoritos.length, 1); assert.equal(f.corpo.favoritos[0].nome, "Mãe");
  assert.match((await chamar("POST", `${API}/lugares`, { tipo: "favorito", ponto: { texto: "rua da mãe, 5" } }, pax.token)).corpo.erro, /já está/);
  assert.match((await chamar("POST", `${API}/lugares`, { tipo: "casa", ponto: { texto: "" } }, pax.token)).corpo.erro, /endereço/);
  assert.match((await chamar("POST", `${API}/lugares`, { tipo: "outro", ponto: { texto: "X" } }, pax.token)).corpo.erro, /inválido/);
  const rem = await chamar("POST", `${API}/lugares/${f.corpo.favoritos[0].id}/remover`, {}, pax.token);
  assert.equal(rem.corpo.favoritos.length, 0); assert.equal(rem.corpo.casa.texto, "Rua Casa, 1");
  assert.equal((await chamar("POST", `${API}/lugares/casa/remover`, {}, pax.token)).corpo.casa, null);
  // Recentes: os destinos das corridas dela, sem repetir.
  P.limparDespacho();
  for (const destino of ["Av. Um, 1", "Av. Dois, 2", "Av. Um, 1"]) {
    const r = await chamar("POST", `${API}/corridas`, { embarque: EMBARQUE, destino: { texto: destino }, categoria: "Econômico", pagamento: "Dinheiro", distanciaKm: 3, pedidoId: `v2-rec-${destino.length}-${Math.random().toString(36).slice(2, 8)}` }, pax.token);
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    await chamar("POST", `${API}/corridas/${r.corpo.corrida.id}/cancelar`, { motivo: "teste" }, pax.token);
  }
  assert.deepEqual((await chamar("GET", `${API}/lugares`, undefined, pax.token)).corpo.recentes.map((p: { texto: string }) => p.texto), ["Av. Um, 1", "Av. Dois, 2"]);
  // Motorista não tem lugares.
  assert.equal((await chamar("GET", `${API}/lugares`, undefined, tokBeto)).status, 403);
});

test("suporte: texto, áudio e resposta da central; contatos vêm da marca", async () => {
  const pax = await novaPassageira("Bia Suporte Almeida");
  assert.deepEqual((await chamar("GET", `${API}/suporte`, undefined, pax.token)).corpo.mensagens, []);
  assert.match((await chamar("POST", `${API}/suporte`, { texto: "   " }, pax.token)).corpo.erro, /Escreva/);
  assert.equal((await chamar("POST", `${API}/suporte`, { texto: "Preciso de ajuda com a minha corrida" }, pax.token)).status, 200);
  const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, ...crypto.randomBytes(500)]);
  const au = await chamar("POST", `${API}/suporte/audio`, webm, pax.token, { "content-type": "audio/webm", "x-segundos": "3" });
  assert.equal(au.status, 200, JSON.stringify(au.corpo));
  assert.equal(au.corpo.mensagem.audio.segundos, 3);
  assert.equal((await chamar("POST", `${API}/suporte/audio`, new Uint8Array([1, 2, 3, 4, 5, 6]), pax.token, { "content-type": "audio/ogg" })).status, 400);
  assert.equal((await chamar("GET", `${API}/suporte/audio/${au.corpo.mensagem.audio.id}`, undefined, pax.token)).status, 200);
  assert.equal((await chamar("GET", `${API}/suporte/audio/${au.corpo.mensagem.audio.id}`, undefined, tokBeto)).status, 404, "o áudio é só da conversa dela");
  const cookie = await cookieDaCentral();
  const conv = (await (await fetch(`${base}/api/apps-central/suporte`, { headers: { cookie } })).json()).conversas;
  const dela = conv.find((c: { chave: string }) => c.chave === pax.telefone);
  assert.ok(dela); assert.equal(dela.nome, "Bia Suporte Almeida"); assert.equal(dela.aguardandoResposta, true); assert.equal(dela.ultima, "Mensagem de áudio");
  const resp = await fetch(`${base}/api/apps-central/suporte/passageiro/${pax.telefone}`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ texto: "Oi, Bia! Já vamos te ajudar." }) });
  assert.equal(resp.status, 200);
  assert.equal((await chamar("GET", `${API}/suporte/nao-lidas`, undefined, pax.token)).corpo.naoLidas, 1);
  const msgs = (await chamar("GET", `${API}/suporte`, undefined, pax.token)).corpo.mensagens;
  assert.deepEqual(msgs.map((m: { de: string }) => m.de), ["eu", "eu", "central"]);
  assert.equal((await chamar("GET", `${API}/suporte/nao-lidas`, undefined, pax.token)).corpo.naoLidas, 0, "abrir a conversa marca como lido");
  // Contatos da marca.
  D.salvarMarca(U.id, { ...D.marca(U.id), textos: { ...D.marca(U.id).textos, suporteWhatsapp: "(11) 90000-1234", suporteTelefone: "(11) 3000-0000", suporteSite: "https://ajuda.exemplo.test", termosUrl: "https://exemplo.test/termos", privacidadeUrl: "https://exemplo.test/privacidade" } });
  const ct = (await chamar("GET", `${API}/contatos`, undefined, pax.token)).corpo;
  assert.equal(ct.whatsapp, "11900001234"); assert.equal(ct.site, "https://ajuda.exemplo.test"); assert.equal(ct.termosUrl, "https://exemplo.test/termos");
});

test("excluir a conta: pede a exclusão, avisa a central e encerra a sessão", async () => {
  const pax = await novaPassageira("Lia Exclusão Santos");
  assert.match((await chamar("POST", `${API}/conta/excluir`, { senha: "errada" }, pax.token)).corpo.erro, /errada/);
  assert.equal((await chamar("POST", `${API}/conta/excluir`, { senha: "segredo1" }, pax.token)).status, 200);
  assert.equal((await chamar("GET", `${API}/eu`, undefined, pax.token)).status, 401);
  const cookie = await cookieDaCentral();
  const conv = (await (await fetch(`${base}/api/apps-central/suporte`, { headers: { cookie } })).json()).conversas;
  assert.match(conv.find((c: { chave: string }) => c.chave === pax.telefone).ultima, /exclusão/);
});

// ====================================================================== maçaneta com taxímetro

test("maçaneta: corrida de rua em taxímetro, com o valor pela distância andada", async () => {
  P.limparDespacho();
  await chamar("POST", `${API}/online`, { lat: -23.55, lng: -46.63 }, tokBeto);
  assert.match((await chamar("POST", `${API}/macaneta`, { modo: "destino", categoria: "Moto", lat: -23.55, lng: -46.63 }, tokBeto)).corpo.erro, /destino/);
  assert.match((await chamar("POST", `${API}/macaneta`, { modo: "taximetro", categoria: "Moto" }, tokBeto)).corpo.erro, /GPS/);
  assert.match((await chamar("POST", `${API}/macaneta`, { modo: "taximetro", categoria: "Moto", lat: -23.55, lng: -46.63 }, tokNovo)).corpo.erro, /online/);
  const m = await chamar("POST", `${API}/macaneta`, { modo: "taximetro", categoria: "Moto", lat: -23.55, lng: -46.63, passageiro: { nome: "Seu Zé" } }, tokBeto);
  assert.equal(m.status, 200, JSON.stringify(m.corpo));
  const c = m.corpo.corrida;
  assert.equal(c.status, "em_andamento"); assert.equal(c.canal, "macaneta"); assert.equal(c.modo, "taximetro"); assert.equal(c.passageiro.nome, "Seu Zé");
  assert.match((await chamar("POST", `${API}/macaneta`, { modo: "taximetro", categoria: "Moto", lat: -23.55, lng: -46.63 }, tokBeto)).corpo.erro, /já está/);
  // Sem telefone, a corrida de rua não vira "passageiro" no cadastro.
  assert.ok(!listar(U.id, CLI).some((x) => x.nome === "Seu Zé"));
  // O motorista anda 8 passos de ~55 m; um salto de 5 km no meio é ignorado como erro de GPS.
  for (let i = 1; i <= 4; i++) { await chamar("POST", `${API}/posicao`, { lat: -23.55 + i * 0.0005, lng: -46.63 }, tokBeto); await esperar(40); }
  await chamar("POST", `${API}/posicao`, { lat: -23.7, lng: -46.63 }, tokBeto); await esperar(40);
  await chamar("POST", `${API}/posicao`, { lat: -23.55 + 0.0025, lng: -46.63 }, tokBeto); await esperar(40);
  for (let i = 6; i <= 9; i++) { await chamar("POST", `${API}/posicao`, { lat: -23.55 + i * 0.0005, lng: -46.63 }, tokBeto); await esperar(40); }
  const andou = C.listarProprias(U.id).find((x) => x.id === c.id)!.macaneta!.km;
  assert.ok(andou > 0.4 && andou < 0.55, `distância andada ${andou} km (esperado uns 0,5 km; o salto de 5 km não conta)`);
  const fim = await chamar("POST", `${API}/corridas/${c.id}/status`, { status: "finalizada", valor: 999 }, tokBeto);
  assert.equal(fim.status, 200, JSON.stringify(fim.corpo));
  // Moto: bandeirada 3 + R$ 1 por km. O valor vem do taxímetro, não do que o app mandou.
  assert.ok(fim.corpo.corrida.valor > 3.4 && fim.corpo.corrida.valor < 3.6, `valor ${fim.corpo.corrida.valor}`);
  assert.equal(fim.corpo.corrida.distanciaPercorridaKm, andou);
  // A corrida de rua aparece nos ganhos dele.
  assert.equal((await chamar("GET", `${API}/ganhos?periodo=mes`, undefined, tokBeto)).corpo.viagens, 1);
});
