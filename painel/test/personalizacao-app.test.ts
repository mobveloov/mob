// Personalização do app do passageiro: o que se muda no painel (Configurações) chega ao app por GET /api/apps/<empresa>/personalizacao.
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-personalizacao-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "p".repeat(40);
process.env.APPS_MOSTRAR_CODIGO = "1";
delete process.env.BANCO_ARQUIVO;

const express = (await import("express")).default;
const D = await import("../src/servidor/dados.ts");
const B = await import("../src/servidor/banco.ts");
const { criarCookie, exigirLogin } = await import("../src/servidor/sessao.ts");
const { rotasConfig } = await import("../src/config/rotas.ts");
const { rotasApps } = await import("../src/apps/rotas.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar } = await import("../src/cadastros/armazem.ts");

const app = express();
app.use(express.json({ limit: "1mb" }));
app.post("/teste/entrar/:id", (req, res) => { criarCookie(res, req, req.params.id); res.json({ ok: true }); });
app.use("/api/apps", rotasApps);
app.use("/api", exigirLogin);
app.use("/api/config", rotasConfig);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => { servidor.closeAllConnections(); servidor.close(); B.fecharBanco(); fs.rmSync(DADOS, { recursive: true, force: true }); });

const E = D.criarEmpresa("Pers Um"), E2 = D.criarEmpresa("Pers Dois");
const adm = D.criarUsuario({ email: "adm@pers.test", nome: "Adm", senha: "senha-forte-1", empresaId: E.id, papel: "admin" });
const cookie = (await fetch(`${base}/teste/entrar/${adm.id}`, { method: "POST" })).headers.get("set-cookie")!.split(";")[0];
criar(E.id, cadastroPorId("clientes")!, { nome: "Cli", telefone: "11922220001", status: "Ativo" }, "teste");

const painel = (metodo: string, url: string, corpo?: unknown, tipo = "application/json") =>
  fetch(`${base}/api/config${url}`, { method: metodo, headers: { cookie, "content-type": tipo }, body: corpo === undefined ? undefined : corpo instanceof Uint8Array ? (corpo as unknown as BodyInit) : JSON.stringify(corpo) })
    .then(async (r) => ({ status: r.status, corpo: (await r.json().catch(() => ({}))) as Record<string, any> }));
async function tokenApp(empresa: string, telefone: string, papel = "passageiro") {
  const c = await (await fetch(`${base}/api/apps/${empresa}/entrar/codigo`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ papel, telefone }) })).json() as any;
  const e = await (await fetch(`${base}/api/apps/${empresa}/entrar`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ papel, telefone, codigo: c.codigoTeste }) })).json() as any;
  return e.token as string;
}
const doApp = async (empresa: string, token?: string) => {
  const r = await fetch(`${base}/api/apps/${empresa}/personalizacao`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  return { status: r.status, corpo: (await r.json()) as Record<string, any> };
};
const PNG = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...crypto.randomBytes(300)]);

test("o app exige login e recebe os valores padrão já normalizados", async () => {
  assert.equal((await doApp(E.id)).status, 401);
  const t = await tokenApp(E.id, "11922220001");
  const r = await doApp(E.id, t);
  assert.equal(r.status, 200);
  assert.match(r.corpo.cores.principal, /^#[0-9a-f]{6}$/);
  assert.ok(["#ffffff", "#111827"].includes(r.corpo.cores.textoSobrePrincipal));
  assert.equal(r.corpo.cores.paleta.length, 36);
  assert.equal(r.corpo.design.estiloTela, "flutuante");
  assert.equal(r.corpo.veiculoMapa.id, "realista");
  assert.equal(r.corpo.veiculoMapa.tipo, 2);
  assert.equal(r.corpo.telaInicial.recursos[0].id, "mapa");
  assert.equal(r.corpo.recursos.mapa, true);
  assert.equal(r.corpo.recursos.desafio, false);
  assert.equal(r.corpo.empresa.nome, "Pers Um");
  assert.ok(r.corpo.versao);
});

test("muda no painel, o app recebe o novo valor (cores, veículo, estilo, recursos, nome)", async () => {
  const t = await tokenApp(E.id, "11922220001");
  const antes = (await doApp(E.id, t)).corpo.versao;
  const s = await painel("PUT", "/personalizacao", { nome: "Meu App", corPrincipal: "#FF7000", veiculoMapa: "moderno", estiloTela: "marcante", marca: "texto",
    recursos: [{ id: "anuncio", visivel: true }, { id: "selecao_destino", visivel: false }, { id: "aviso_cupons", visivel: true }] });
  assert.equal(s.status, 200, JSON.stringify(s.corpo));
  const r = (await doApp(E.id, t)).corpo;
  assert.equal(r.empresa.nome, "Meu App");
  assert.equal(r.cores.principal, "#ff7000");
  assert.equal(r.veiculoMapa.id, "moderno");
  assert.equal(r.veiculoMapa.tipo, 1);
  assert.equal(r.veiculoMapa.diferenciaOcupado, true);
  assert.equal(r.design.estiloTela, "marcante");
  assert.equal(r.recursos.selecao_destino, false);
  assert.equal(r.recursos.aviso_cupons, true);
  assert.deepEqual(r.telaInicial.ordemVisiveis, ["anuncio", "aviso_cupons", "mapa"], "no estilo marcante a ordem pedida vale; o que faltou entra no fim");
  assert.notEqual(r.versao, antes);
});

test("ícones do carro por URL (livre e ocupado, três estilos) e estilo inválido dá 404", async () => {
  for (const v of ["realista", "moderno", "classico"]) for (const e of ["livre", "ocupado"]) {
    const x = await fetch(`${base}/api/apps/${E.id}/personalizacao/icone/${v}/${e}.svg`);
    assert.equal(x.status, 200);
    assert.match(x.headers.get("content-type") ?? "", /svg/);
    assert.match(await x.text(), /^<svg /);
  }
  assert.equal((await fetch(`${base}/api/apps/${E.id}/personalizacao/icone/foguete/livre.svg`)).status, 404);
  const t = await tokenApp(E.id, "11922220001");
  const url = (await doApp(E.id, t)).corpo.veiculoMapa.iconeLivreUrl as string;
  assert.equal((await fetch(base + url)).status, 200);
});

test("imagem da marca: exige PNG/JPG, vale na hora e sai por URL no app; marca com imagem exige a imagem", async () => {
  assert.equal((await painel("PUT", "/personalizacao", { nome: "Meu App", marca: "imagem_alongada" })).status, 400);
  assert.equal((await painel("PUT", "/personalizacao", { nome: "", marca: "texto" })).corpo.erro, "Insira um nome.");
  assert.equal((await painel("POST", "/personalizacao/imagem", new Uint8Array([1, 2, 3, 4]), "image/png")).status, 400, "assinatura falsa");
  const up = await painel("POST", "/personalizacao/imagem", PNG(), "image/png");
  assert.equal(up.status, 200, JSON.stringify(up.corpo));
  assert.match(up.corpo.imagemMarcaUrl, /personalizacaoMarca\.png/);
  assert.equal((await painel("PUT", "/personalizacao", { nome: "Meu App", marca: "imagem_alongada" })).status, 200);
  const t = await tokenApp(E.id, "11922220001");
  const r = (await doApp(E.id, t)).corpo;
  assert.equal(r.design.mostrarImagem, true);
  assert.equal(r.design.mostrarNome, false);
  assert.deepEqual(r.design.dimensoesImagem, { largura: 184, altura: 52 });
  assert.ok(D.caminhoImagem(E.id, "personalizacaoMarca.png"), "o arquivo existe e sai em /api/publico/arquivo");
  assert.match(r.design.imagemMarcaUrl, /^\/api\/publico\/arquivo\//);
  const rem = await painel("DELETE", "/personalizacao/imagem");
  assert.equal(rem.corpo.marca, "texto");
  assert.equal(rem.corpo.imagemMarcaUrl, "");
});

test("outra empresa não vê a personalização da primeira", async () => {
  criar(E2.id, cadastroPorId("clientes")!, { nome: "Cli2", telefone: "11922220002", status: "Ativo" }, "teste");
  const t2 = await tokenApp(E2.id, "11922220002");
  assert.equal((await doApp(E2.id, t2)).corpo.empresa.nome, "Pers Dois");
  assert.equal((await doApp(E.id, t2)).status, 401, "o token só vale na empresa em que foi criado");
});

test("app do motorista: rota própria com token de motorista, padrão, mudança no painel e logo por URL", async () => {
  criar(E.id, cadastroPorId("motoristas")!, { nome: "Mot Teste", telefone: "11911110001", status: "Ativo" }, "teste");
  const tm = await tokenApp(E.id, "11911110001", "motorista");
  const tp = await tokenApp(E.id, "11922220001");
  const url = `${base}/api/apps/${E.id}/personalizacao-motorista`;
  assert.equal((await fetch(url)).status, 401);
  assert.equal((await fetch(url, { headers: { authorization: `Bearer ${tp}` } })).status, 403, "passageiro não lê a do motorista");
  const ler = async () => (await (await fetch(url, { headers: { authorization: `Bearer ${tm}` } })).json()) as Record<string, any>;
  const a = await ler();
  assert.equal(a.tema, "sistema");
  assert.equal(a.recursos.iniciar, true);
  assert.equal(a.recursos.saldo, true);
  const s = await painel("PUT", "/personalizacao-motorista", { nome: "Motorista Up", corPrincipal: "#FFC400", tema: "escuro", veiculoMapa: "classico", estiloTela: "marcante", marca: "texto",
    recursos: [{ id: "saldo", visivel: false }, { id: "iniciar", visivel: false }, { id: "rodape", visivel: false }, { id: "macaneta", visivel: false }] });
  assert.equal(s.status, 200, JSON.stringify(s.corpo));
  const b = await ler();
  assert.equal(b.empresa.nome, "Motorista Up");
  assert.equal(b.cores.principal, "#ffc400");
  assert.equal(b.tema, "escuro");
  assert.equal(b.veiculoMapa.tipo, 0);
  assert.equal(b.recursos.saldo, false);
  assert.equal(b.recursos.macaneta, false);
  assert.equal(b.recursos.iniciar, true, "INICIAR e o rodapé não saem da tela");
  assert.equal(b.recursos.rodape, true);
  assert.notEqual(b.versao, a.versao);
  assert.equal((await painel("PUT", "/personalizacao-motorista", { nome: "X", marca: "imagem" })).status, 400);
  const up = await painel("POST", "/personalizacao-motorista/imagem", PNG(), "image/png");
  assert.equal(up.status, 200, JSON.stringify(up.corpo));
  assert.equal((await painel("PUT", "/personalizacao-motorista", { nome: "Motorista Up", marca: "imagem" })).status, 200);
  const c = await ler();
  assert.equal(c.design.mostrarImagem, true);
  assert.match(c.design.imagemMarcaUrl, /personalizacaoMarcaMotorista\.png/);
  assert.equal((await painel("GET", "/personalizacao")).corpo.imagemMarcaUrl, "", "a do passageiro é separada");
});
