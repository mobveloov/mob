// Totem: imagens do local, aparelho vinculado, preços por local, conferência do número no WhatsApp e WhatsApp do totem.
// Tudo em modo simulado: nenhuma chave, nenhuma chamada à internet. Rodar: npx tsx --test test/totem-extras.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "totem-extras-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "t".repeat(40);

const express = (await import("express")).default;
const D = await import("../src/servidor/dados.ts");
const { criarCookie, exigirLogin } = await import("../src/servidor/sessao.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar } = await import("../src/cadastros/armazem.ts");
const C = await import("../src/corridas/index.ts");
const { rotasTotem } = await import("../src/totem/rotas.ts");
const T = await import("../src/totem/dados.ts");

const app = express();
app.use(express.json());
app.post("/teste/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({ ok: true }); });
app.use("/api/totem", rotasTotem);
app.use("/api", exigirLogin);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => servidor.close());

const A = D.criarEmpresa("Rota Norte");
const adminA = D.criarUsuario({ email: "admin@a.test", nome: "Ana", senha: "senha-forte-1", empresaId: A.id, papel: "admin" });
const operA = D.criarUsuario({ email: "oper@a.test", nome: "Otávio", senha: "senha-forte-2", empresaId: A.id, papel: "operador" });
const CAT = cadastroPorId("categorias")!;
criar(A.id, CAT, { nome: "Econômico", bandeirada: 5, valorKm: 2, valorMinimo: 9.9, ativa: true }, "teste");
criar(A.id, CAT, { nome: "Conforto", bandeirada: 8, valorKm: 3, valorMinimo: 15, ativa: true }, "teste");

async function cookieDe(id: string) {
  const r = await fetch(`${base}/teste/entrar/${id}`, { method: "POST" });
  return (r.headers.get("set-cookie") ?? "").split(";")[0];
}
async function pedir(caminho: string, o: { metodo?: string; corpo?: unknown; cookie?: string; chave?: string; aparelho?: string; bruto?: { tipo: string; bytes: Uint8Array } } = {}) {
  const headers: Record<string, string> = {};
  if (!o.bruto) headers["Content-Type"] = "application/json";
  else headers["Content-Type"] = o.bruto.tipo;
  if (o.cookie) headers.cookie = o.cookie;
  if (o.chave) headers["X-Totem-Chave"] = o.chave;
  if (o.aparelho) headers["X-Totem-Aparelho"] = o.aparelho;
  const r = await fetch(`${base}/api${caminho}`, { method: o.metodo ?? (o.corpo || o.bruto ? "POST" : "GET"), headers, body: o.bruto ? Buffer.from(o.bruto.bytes) : o.corpo ? JSON.stringify(o.corpo) : undefined });
  const texto = await r.text();
  return { status: r.status, corpo: JSON.parse(texto || "{}"), texto };
}
const TP = `/totem/publico/${A.id}/hotel-praia`;
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
let ca = "", co = "", chave = "";

test("local novo com endereço (slug) escolhido, cidade e WhatsApp individual; slug repetido é recusado", async () => {
  ca = await cookieDe(adminA.id); co = await cookieDe(operA.id);
  const novo = { nome: "Hotel Praia", slug: "Hotel Praia", cidade: "Cidade Norte", uf: "sp", endereco: { texto: "Av. Central, 100" }, senha: "1234" };
  const r = await pedir("/totem/locais", { corpo: novo, cookie: ca });
  assert.equal(r.status, 200, r.texto);
  assert.equal(r.corpo.local.id, "hotel-praia");
  assert.equal(r.corpo.local.cidade, "Cidade Norte");
  assert.equal(r.corpo.local.uf, "SP");
  assert.equal(r.corpo.local.modoWhatsapp, "individual");
  assert.equal(r.corpo.local.aparelho, "");
  const dup = await pedir("/totem/locais", { corpo: { ...novo, nome: "Outro" }, cookie: ca });
  assert.equal(dup.status, 400);
  assert.match(dup.corpo.erro, /Já existe/);
  const livre = await pedir("/totem/locais", { corpo: { ...novo, nome: "Posto Sul", slug: "", endereco: { texto: "Rua B, 5" } }, cookie: ca });
  assert.equal(livre.corpo.local.id, "posto-sul");
  const e = await pedir(`${TP}/entrar`, { corpo: { senha: "1234" } });
  chave = e.corpo.chave;
});

test("imagem do topo e do rodapé: só admin, só PNG/JPG/WEBP, aparece no totem e some ao remover", async () => {
  const env = (cookie: string, tipo = "image/png", bytes = PNG) => pedir("/totem/locais/hotel-praia/imagem/logo", { bruto: { tipo, bytes }, cookie });
  assert.equal((await env(co)).status, 403);
  assert.equal((await env(ca, "image/svg+xml")).status, 400);
  assert.equal((await env(ca, "image/png", new Uint8Array([1, 2, 3]))).status, 200); // o formato é conferido só na foto da empresa; aqui vale o tipo
  const ok = await env(ca);
  assert.equal(ok.status, 200, ok.texto);
  assert.match(ok.corpo.local.logo, /^totem-hotel-praia-logo\.png$/);
  assert.equal((await pedir("/totem/locais/hotel-praia/imagem/rodape", { bruto: { tipo: "image/jpeg", bytes: PNG }, cookie: ca })).corpo.local.rodape, "totem-hotel-praia-rodape.jpg");
  assert.equal((await pedir("/totem/locais/hotel-praia/imagem/outra", { bruto: { tipo: "image/png", bytes: PNG }, cookie: ca })).status, 400);
  const p = await pedir(TP);
  assert.equal(p.corpo.local.logo, "totem-hotel-praia-logo.png");
  assert.ok(fs.existsSync(path.join(DADOS, "empresas", A.id, "arquivos", "totem-hotel-praia-logo.png")));
  assert.equal((await pedir("/totem/locais/hotel-praia/imagem/logo", { metodo: "DELETE", cookie: ca })).corpo.local.logo, "");
  assert.ok(!fs.existsSync(path.join(DADOS, "empresas", A.id, "arquivos", "totem-hotel-praia-logo.png")));
  // Excluir o local apaga o que sobrou.
  await pedir("/totem/locais", { corpo: { nome: "Temporário", slug: "temp", endereco: { texto: "Rua C, 1" }, senha: "1234" }, cookie: ca });
  await pedir("/totem/locais/temp/imagem/logo", { bruto: { tipo: "image/png", bytes: PNG }, cookie: ca });
  await pedir("/totem/locais/temp", { metodo: "DELETE", cookie: ca });
  assert.ok(!fs.existsSync(path.join(DADOS, "empresas", A.id, "arquivos", "totem-temp-logo.png")));
});

test("aparelho vinculado: o primeiro que entra fica com o link; outro é barrado até o admin limpar", async () => {
  const um = "aparelho-um-0001", dois = "aparelho-dois-002";
  const e1 = await pedir(`${TP}/entrar`, { corpo: { senha: "1234", aparelho: um } });
  assert.equal(e1.status, 200);
  const e2 = await pedir(`${TP}/entrar`, { corpo: { senha: "1234", aparelho: dois } });
  assert.equal(e2.status, 403);
  assert.equal(e2.corpo.codigo, "outro_aparelho");
  assert.match(e2.corpo.erro, /outro dispositivo físico/);
  assert.equal((await pedir(`${TP}/config`, { chave: e1.corpo.chave, aparelho: um })).status, 200);
  // A chave copiada para outro aparelho não abre nada.
  const copiada = await pedir(`${TP}/config`, { chave: e1.corpo.chave, aparelho: dois });
  assert.equal(copiada.status, 403);
  assert.equal(copiada.corpo.codigo, "outro_aparelho");
  assert.equal((await pedir(`${TP}/config`, { chave: e1.corpo.chave })).status, 403);
  // Só admin limpa.
  assert.equal((await pedir("/totem/locais/hotel-praia/aparelho", { metodo: "DELETE", cookie: co })).status, 403);
  const lista = await pedir("/totem/locais", { cookie: ca });
  assert.equal(lista.corpo.locais.find((l: { id: string }) => l.id === "hotel-praia").aparelho, um);
  assert.equal((await pedir("/totem/locais/hotel-praia/aparelho", { metodo: "DELETE", cookie: ca })).corpo.local.aparelho, "");
  assert.equal((await pedir(`${TP}/entrar`, { corpo: { senha: "1234", aparelho: dois } })).status, 200);
  assert.equal((await pedir(`${TP}/config`, { chave: e1.corpo.chave, aparelho: um })).status, 403); // agora o dois é o dono
  // Limpa de novo para os próximos testes.
  await pedir("/totem/locais/hotel-praia/aparelho", { metodo: "DELETE", cookie: ca });
});

test("preços do local: tabela própria, multiplicador, categoria que não existe é recusada, copiar para os outros", async () => {
  const tabela = [
    { nome: "Conforto", descricao: "Mais espaço", taxaBase: 8, porKm: 3, porMin: 0.5, minima: 14, espera: 7, ordem: 1, ativa: true },
    { nome: "Econômico", descricao: "", taxaBase: 5, porKm: 2, porMin: 0.3, minima: 12, espera: 5, ordem: 0, ativa: true },
  ];
  assert.equal((await pedir("/totem/locais/hotel-praia/precos", { metodo: "PUT", corpo: { tabela }, cookie: co })).status, 403);
  const inexistente = await pedir("/totem/locais/hotel-praia/precos", { metodo: "PUT", corpo: { tabela: [{ nome: "Luxo" }] }, cookie: ca });
  assert.equal(inexistente.status, 400);
  assert.match(inexistente.corpo.erro, /não existe em Categorias e tarifas/);
  assert.equal((await pedir("/totem/locais/hotel-praia/precos", { metodo: "PUT", corpo: { tabela: [tabela[0], tabela[0]] }, cookie: ca })).status, 400);
  assert.equal((await pedir("/totem/locais/hotel-praia/precos", { metodo: "PUT", corpo: { tabela, surge: 0 }, cookie: ca })).status, 400);
  const ok = await pedir("/totem/locais/hotel-praia/precos", { metodo: "PUT", corpo: { tabela, surge: 1.5 }, cookie: ca });
  assert.equal(ok.status, 200, ok.texto);
  // O totem mostra a tabela do local (na ordem pedida, preço "a partir de" = maior entre mínima e taxa base, vezes o multiplicador).
  const e = await pedir(`${TP}/entrar`, { corpo: { senha: "1234" } });
  const c = await pedir(`${TP}/config`, { chave: e.corpo.chave });
  assert.deepEqual(c.corpo.categorias.map((x: { nome: string; preco: number; espera: number }) => [x.nome, x.preco, x.espera]), [["Econômico", 18, 5], ["Conforto", 21, 7]]);
  // Categoria desligada na tabela some do totem.
  await pedir("/totem/locais/hotel-praia/precos", { metodo: "PUT", corpo: { tabela: [{ ...tabela[0], ativa: false }, tabela[1]], surge: 1 }, cookie: ca });
  const c2 = await pedir(`${TP}/config`, { chave: e.corpo.chave });
  assert.deepEqual(c2.corpo.categorias.map((x: { nome: string }) => x.nome), ["Econômico"]);
  // Copiar para todos os totens.
  await pedir("/totem/locais/hotel-praia/precos", { metodo: "PUT", corpo: { tabela, surge: 1, copiarPara: "todos" }, cookie: ca });
  const lista = await pedir("/totem/locais", { cookie: ca });
  for (const l of lista.corpo.locais) assert.equal(l.tabela.length, 2, l.id);
});

test("pedido pelo totem com tabela própria grava o preço do local (com distância quando há coordenadas)", async () => {
  await pedir("/totem/locais/hotel-praia", { metodo: "PUT", corpo: { endereco: { texto: "Av. Central, 100", lat: -23.5, lng: -46.6 } }, cookie: ca });
  const e = await pedir(`${TP}/entrar`, { corpo: { senha: "1234" } });
  const r = await pedir(`${TP}/corridas`, { corpo: { pedidoId: "pedido-extra-001", semDestino: true, categoria: "Conforto", pagamento: "Pix", nome: "Paula", telefone: "(11) 98888-7777" }, chave: e.corpo.chave });
  assert.equal(r.status, 200, r.texto);
  const c = C.listarProprias(A.id).find((x) => x.id === r.corpo.corrida.id)!;
  assert.equal(c.valorFinal?.modo, "prefixado");
  assert.equal(c.valorFinal?.valor, 14); // sem destino: vale a corrida mínima do local (maior que a taxa base)
  assert.equal(r.corpo.corrida.categoria, "Conforto");
  // Categoria fora da tabela do local não passa, mesmo existindo na empresa.
  await C.cancelarCorrida(A.id, c.id, "Central", "teste", "teste");
  await pedir("/totem/locais/hotel-praia/precos", { metodo: "PUT", corpo: { tabela: [{ nome: "Econômico", taxaBase: 5, minima: 12 }] }, cookie: ca });
  const fora = await pedir(`${TP}/corridas`, { corpo: { pedidoId: "pedido-extra-002", semDestino: true, categoria: "Conforto", pagamento: "Pix", nome: "Paula", telefone: "(11) 98888-7777" }, chave: e.corpo.chave });
  assert.equal(fora.status, 400);
});

test("conferência do número no WhatsApp: simulado diz que existe, final 0000 não existe; precisa da chave e de telefone válido", async () => {
  const e = await pedir(`${TP}/entrar`, { corpo: { senha: "1234" } });
  const chv = e.corpo.chave;
  assert.equal((await pedir(`${TP}/whatsapp/existe`, { corpo: { telefone: "11988887777" } })).status, 401);
  assert.equal((await pedir(`${TP}/whatsapp/existe`, { corpo: { telefone: "123" }, chave: chv })).status, 400);
  assert.equal((await pedir(`${TP}/whatsapp/existe`, { corpo: { telefone: "(11) 98888-7777" }, chave: chv })).corpo.existe, true);
  assert.equal((await pedir(`${TP}/whatsapp/existe`, { corpo: { telefone: "11988880000" }, chave: chv })).corpo.existe, false);
});

test("WhatsApp do totem: situação, conectar e desconectar (simulado); só admin conecta; config diz se está pronto", async () => {
  const s = await pedir("/totem/locais/hotel-praia/whatsapp", { cookie: co });
  assert.equal(s.status, 200, s.texto);
  assert.equal(s.corpo.modo, "individual");
  assert.match(s.corpo.instancia, /^[A-Za-z0-9_-]+-hotel-praia$/);
  assert.equal(s.corpo.situacao, "conectado");
  assert.equal((await pedir("/totem/locais/hotel-praia/whatsapp/conectar", { corpo: {}, cookie: co })).status, 403);
  assert.equal((await pedir("/totem/locais/hotel-praia/whatsapp/conectar", { corpo: {}, cookie: ca })).status, 200);
  assert.equal((await pedir("/totem/locais/hotel-praia/whatsapp/desconectar", { corpo: {}, cookie: ca })).status, 200);
  await pedir("/totem/locais/hotel-praia", { metodo: "PUT", corpo: { modoWhatsapp: "compartilhado" }, cookie: ca });
  assert.equal((await pedir("/totem/locais/hotel-praia/whatsapp", { cookie: ca })).corpo.instancia, null);
  const e = await pedir(`${TP}/entrar`, { corpo: { senha: "1234" } });
  assert.equal((await pedir(`${TP}/config`, { chave: e.corpo.chave })).corpo.local.whatsappPronto, true);
  // O webhook do totem é aceito e ignorado (o bot não responde pelo número do totem).
  assert.equal((await pedir(`/totem/webhook/${A.id}/hotel-praia`, { corpo: { event: "messages.upsert" } })).corpo.ignorado, true);
});

test("locais gravados antes dos campos novos continuam funcionando", () => {
  const antigo = { id: "velho", nome: "Velho", endereco: { texto: "Rua X, 1" }, categorias: [], pagamentos: ["Pix"], senhaHash: "x", versao: 1, ativo: true, criadoEm: "2026-01-01T00:00:00Z" };
  fs.mkdirSync(path.join(DADOS, "empresas", A.id, "totem"), { recursive: true });
  const arq = path.join(DADOS, "empresas", A.id, "totem", "locais.json");
  const atuais = JSON.parse(fs.readFileSync(arq, "utf8"));
  fs.writeFileSync(arq, JSON.stringify([...atuais, antigo]));
  const l = T.local(A.id, "velho")!;
  assert.equal(l.modoWhatsapp, "individual");
  assert.deepEqual(l.tabela, []);
  assert.equal(l.surge, 1);
  assert.equal(l.aparelho, "");
});

test("cálculo do preço do local: base + km + minutos, nunca abaixo da mínima, vezes o multiplicador", () => {
  const c = { nome: "X", descricao: "", taxaBase: 5, porKm: 2, porMin: 0.5, minima: 12, espera: 5, ordem: 0, ativa: true };
  assert.equal(T.precoDoLocal({ surge: 1 }, c, null, null), 12);
  assert.equal(T.precoDoLocal({ surge: 1 }, c, 10, 20), 35); // 5 + 20 + 10
  assert.equal(T.precoDoLocal({ surge: 1.5 }, c, 10, 20), 52.5);
  assert.equal(T.precoDoLocal({ surge: 1 }, c, 1, 2), 12); // 5 + 2 + 1 = 8, sobe para a mínima
});

test("app do totem (APK): só o dono publica; empresa só vê a versão ativa mais nova; endereço precisa ser https", async () => {
  const dono = D.criarUsuario({ email: "dono@x.test", nome: "Dono", senha: "senha-forte-9", empresaId: A.id, papel: "plataforma" });
  const cd = await cookieDe(dono.id);
  assert.equal((await pedir("/totem/apk", { cookie: co })).corpo.versao, null);
  const v1 = { nome: "1.0.0", codigo: 10, url: "https://exemplo.test/totem-1.0.0.apk", tamanho: 12_582_912, notas: "Primeira versão" };
  assert.equal((await pedir("/totem/apk/versoes", { corpo: v1, cookie: ca })).status, 403); // admin da empresa não publica
  assert.equal((await pedir("/totem/apk/versoes", { corpo: { ...v1, url: "http://exemplo.test/a.apk" }, cookie: cd })).status, 400);
  assert.equal((await pedir("/totem/apk/versoes", { corpo: { ...v1, codigo: 0 }, cookie: cd })).status, 400);
  assert.equal((await pedir("/totem/apk/versoes", { corpo: v1, cookie: cd })).status, 200);
  assert.equal((await pedir("/totem/apk/versoes", { corpo: v1, cookie: cd })).status, 400); // código repetido
  const v2 = await pedir("/totem/apk/versoes", { corpo: { ...v1, nome: "1.1.0", codigo: 11, url: "https://exemplo.test/totem-1.1.0.apk" }, cookie: cd });
  assert.equal((await pedir("/totem/apk", { cookie: co })).corpo.versao.nome, "1.1.0");
  assert.equal((await pedir(`/totem/apk/versoes/${v2.corpo.versao.id}`, { metodo: "PUT", corpo: { ativa: false }, cookie: cd })).status, 200);
  assert.equal((await pedir("/totem/apk", { cookie: co })).corpo.versao.nome, "1.0.0"); // desligou a nova: volta a anterior
  assert.equal((await pedir("/totem/apk/versoes", { cookie: ca })).status, 403);
  assert.equal((await pedir("/totem/apk/versoes", { cookie: cd })).corpo.versoes.length, 2);
});
