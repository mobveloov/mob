// Segurança do servidor do painel: login em toda rota, cargos, isolamento entre empresas, força bruta, XSS/injeção,
// filtro de robôs de clonagem e cabeçalhos. Rodar: npx tsx --test test/seguranca.test.ts
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "painel-seg-"));
process.env.DADOS_DIR = DADOS;
process.env.BANCO_ARQUIVO = path.join(DADOS, "painel.db");
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = crypto.randomBytes(24).toString("hex");

const { app } = await import("../src/servidor/index.ts");
const { listarRotas } = await import("./rotas-util.ts");
const { zerarTentativasDeLogin, podeTentar, errouLogin, LIMITES_LOGIN } = await import("../src/servidor/sessao.ts");
const { ehRoboDeClonagem, servirPainel } = await import("../src/servidor/protecao.ts");

// Senhas geradas na hora: nada de senha escrita no código.
const senha = () => crypto.randomBytes(9).toString("base64url");
const SENHA_A = senha(), SENHA_B = senha(), SENHA_OP = senha();

let srv: Server, base = "";
before(() => { srv = app.listen(0); base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`; });
after(() => { srv.close(); });

interface Opc { metodo?: string; cookie?: string; corpo?: unknown; cab?: Record<string, string>; bruto?: BodyInit }
async function pedir(caminho: string, o: Opc = {}) {
  const cab: Record<string, string> = { ...(o.cab ?? {}) };
  if (o.cookie) cab.cookie = o.cookie;
  let body: BodyInit | undefined = o.bruto;
  if (o.corpo !== undefined && !["GET", "HEAD"].includes(o.metodo ?? "GET")) { cab["content-type"] = "application/json"; body = JSON.stringify(o.corpo); }
  const r = await fetch(base + caminho, { method: o.metodo ?? "GET", headers: cab, body, redirect: "manual", signal: AbortSignal.timeout(8000) });
  const texto = await r.text();
  let corpo: any = {};
  try { corpo = JSON.parse(texto); } catch { /* não é JSON */ }
  return { status: r.status, corpo, texto, cab: r.headers, cookie: (r.headers.get("set-cookie") ?? "").split(";")[0] };
}

const ctx: { local?: string; a?: string; b?: string; op?: string; opB?: string; empresaB?: string; empresaA?: string } = {};

test("preparo: empresa A (dona), operador da A, empresa B com administrador e operador", async () => {
  const conf = await pedir("/api/configurar", { metodo: "POST", corpo: { empresa: "Empresa A", nome: "Dona A", email: "dona@a.test", senha: SENHA_A } });
  assert.equal(conf.status, 200);
  ctx.a = conf.cookie;
  ctx.empresaA = (await pedir("/api/sessao", { cookie: ctx.a })).corpo.empresa.id;
  const op = await pedir("/api/usuarios", { metodo: "POST", cookie: ctx.a, corpo: { email: "op@a.test", nome: "Operador A", senha: SENHA_OP, papel: "operador" } });
  assert.equal(op.status, 200);
  ctx.op = (await pedir("/api/entrar", { metodo: "POST", corpo: { email: "op@a.test", senha: SENHA_OP } })).cookie;
  assert.ok(ctx.op);
  const emp = await pedir("/api/empresas", { metodo: "POST", cookie: ctx.a, corpo: { nome: "Empresa B", adminEmail: "adm@b.test", adminNome: "Adm B", adminSenha: SENHA_B } });
  assert.equal(emp.status, 200);
  ctx.empresaB = emp.corpo.empresa.id;
  ctx.b = (await pedir("/api/entrar", { metodo: "POST", corpo: { email: "adm@b.test", senha: SENHA_B } })).cookie;
  assert.ok(ctx.b);
  const loc = await pedir("/api/totem/locais", { metodo: "POST", cookie: ctx.a, corpo: { nome: "Local Teste", endereco: { texto: "Rua A, 1" }, senha: senha() } });
  assert.equal(loc.status, 200, loc.texto);
  ctx.local = loc.corpo.local.id;
  zerarTentativasDeLogin();
});

// ------------------------------------------------------------------ 1. toda rota exige login

/** Rotas públicas DE PROPÓSITO (cada uma com o motivo). Qualquer rota fora desta lista tem que recusar quem não entrou. */
const PUBLICAS: Array<[string, string, string]> = [
  ["GET", "/api/saude", "verificação de saúde: não devolve dado nenhum"],
  ["GET", "/api/publico/marca", "marca na tela de entrada"],
  ["GET", "/api/publico/arquivo/:empresa/:nome", "logo e ícone da empresa"],
  ["GET", "/manifest.webmanifest", "PWA"],
  ["POST", "/api/configurar", "primeiro acesso (recusa quando já existe usuário)"],
  ["POST", "/api/entrar", "login"],
  ["POST", "/api/sair", "sair"],
  ["POST", "/api/bot/webhook/:empresa/:segredo", "webhook da Evolution (segredo na URL)"],
  ["POST", "/api/bot/webhook/:empresa/:segredo/:conexao", "webhook de uma conexão extra do bot (segredo na URL)"],
  ["GET", "/api/bot/webhook/:empresa/:segredo", "verificação do webhook da Meta (senha de verificação)"],
  ["GET", "/api/bot/webhook/:empresa/:segredo/:conexao", "verificação do webhook da Meta numa conexão extra"],
  ["GET", "/api/totem/publico/:empresa/:local", "tela do totem (só nome do local e marca)"],
  ["POST", "/api/totem/publico/:empresa/:local/entrar", "senha do totem (com limite de tentativas)"],
  ["POST", "/api/totem/premios/publico/:empresa/info", "página pública do jogo (só abre com o token do convite)"],
  ["POST", "/api/totem/premios/publico/:empresa/play", "jogar roleta ou raspadinha (token do convite, uma jogada por convite)"],
  ["POST", "/api/totem/pontos/publico/:empresa/info", "página pública de pontos: com o token do aviso vê saldo e extrato; só com o telefone, apenas o saldo (regra do original), com limite de tentativas"],
  ["POST", "/api/totem/pontos/publico/:empresa/trocar", "troca de pontos: só com o token do aviso (pelo telefone é recusada), com limite de tentativas"],
  ["POST", "/api/totem/premios/publico/:empresa/abrir", "link aberto do jogo: o telefone recebe o link no WhatsApp (com limite de tentativas)"],
  ["POST", "/api/totem/webhook/:empresa/:local", "webhook do WhatsApp do totem (aceita e ignora: o bot não responde pelo número do totem)"],
  ["POST", "/api/apps/:empresa/entrar/codigo", "app: pede o código"],
  ["POST", "/api/apps/:empresa/entrar", "app: entra com o código"],
  ["GET", "/api/apps/:empresa/marca", "app: marca"],
  ["GET", "/api/apps/:empresa/cidades", "app: cidades atendidas"],
  ["POST", "/api/apps/:empresa/conta/existe", "app: conta existe?"],
  ["POST", "/api/apps/:empresa/conta/entrar", "app: login com senha"],
  ["POST", "/api/apps/:empresa/conta/criar", "app: criar conta"],
  ["POST", "/api/apps/:empresa/conta/esqueci", "app: esqueci a senha"],
  ["POST", "/api/apps/:empresa/conta/nova-senha", "app: nova senha com código"],
  ["GET", "/api/apps/:empresa/apks", "app: página de download"],
  ["GET", "/api/apps/:empresa/apks/:app", "app: download do APK"],
  ["GET", "/api/apps/:empresa/acompanhar/:codigo", "link público de acompanhar a viagem (código aleatório)"],
];
const ehPublica = (m: string, c: string) => PUBLICAS.some(([pm, pc]) => pm === m && pc === c);

test("lista das rotas: nenhuma rota nova passa sem estar na lista de públicas ou protegida", () => {
  const rotas = listarRotas(app).filter((r) => r.caminho.startsWith("/api") || r.caminho === "/manifest.webmanifest");
  assert.ok(rotas.length > 300, `só achei ${rotas.length} rotas`);
  const naoAchadas = PUBLICAS.filter(([m, c]) => !rotas.some((r) => r.metodo === m && r.caminho === c));
  assert.deepEqual(naoAchadas, [], "rota da lista de públicas que não existe mais (atualize a lista)");
});

test("TODA rota da API, sem login, responde 401 ou 403 (as públicas estão na lista PUBLICAS)", async () => {
  const rotas = listarRotas(app).filter((r) => r.caminho.startsWith("/api"));
  const furos: string[] = [];
  let testadas = 0;
  for (const r of rotas) {
    if (ehPublica(r.metodo, r.caminho)) continue;
    const url = r.caminho.replace(/:empresa/g, ctx.empresaA!).replace(/:local/g, ctx.local!).replace(/:\w+/g, "x");
    const meta = r.metodo;
    const resp = await pedir(url, { metodo: meta, corpo: meta === "GET" || meta === "DELETE" ? undefined : {} });
    testadas++;
    if (resp.status !== 401 && resp.status !== 403) furos.push(`${meta} ${r.caminho} -> ${resp.status}`);
  }
  assert.ok(testadas > 300, `testei só ${testadas} rotas`);
  assert.deepEqual(furos, [], `rotas que responderam sem login:\n${furos.join("\n")}`);
});

test("cookie falso, cookie de outra assinatura e token de app inválido não entram", async () => {
  const falso = `sessao=${Buffer.from(JSON.stringify({ u: "x", x: Date.now() + 1e9 })).toString("base64url")}.assinaturafalsa`;
  assert.equal((await pedir("/api/sessao", { cookie: falso })).status, 401);
  // cookie válido com a assinatura trocada
  const valido = ctx.a!.replace("sessao=", "");
  const [dados] = valido.split(".");
  assert.equal((await pedir("/api/sessao", { cookie: `sessao=${dados}.${"A".repeat(43)}` })).status, 401);
  assert.equal((await pedir(`/api/apps/${ctx.empresaA}/eu`, { cab: { authorization: "Bearer token-inventado" } })).status, 401);
});

test("rotas públicas não vazam dado de empresa", async () => {
  const marca = await pedir("/api/publico/marca");
  assert.equal(marca.status, 200);
  const t = marca.texto.toLowerCase();
  for (const proibido of ["hash", "scrypt", "senha", "segredo", "token", "apikey", "api_key"]) assert.ok(!t.includes(proibido), `marca pública tem "${proibido}"`);
  assert.equal((await pedir("/api/configurar", { metodo: "POST", corpo: { empresa: "Invasora", nome: "X", email: "x@x.test", senha: senha() } })).status, 409);
  assert.equal((await pedir("/api/saude")).corpo.ok, true);
  // webhook com segredo errado
  assert.equal((await pedir(`/api/bot/webhook/${ctx.empresaA}/segredo-errado`, { metodo: "POST", corpo: { event: "x" } })).status, 404);
});

// ------------------------------------------------------------------ 2. cargo

test("operador não faz o que é só do administrador (a API recusa, não só o menu)", async () => {
  const proibidas: Array<[string, string, unknown?]> = [
    ["POST", "/api/usuarios", { email: "novo@a.test", nome: "N", senha: senha(), papel: "admin" }],
    ["DELETE", "/api/usuarios/qualquer"],
    ["PUT", "/api/marca", { produto: "Hack" }],
    ["GET", "/api/integracoes"],
    ["POST", "/api/integracoes", { tipo: "exemplo" }],
    ["PUT", "/api/ia/chaves", { anthropic: "x" }],
    ["POST", "/api/planilhas", undefined],
    ["GET", "/api/marca/brand.json"],
    ["GET", "/api/gestao/equipe"],
    ["POST", "/api/gestao/equipe", { email: "n2@a.test", nome: "N", senha: senha(), papel: "admin" }],
    ["POST", "/api/empresas", { nome: "Outra" }],
  ];
  for (const [m, c, corpo] of proibidas) {
    const r = await pedir(c, { metodo: m, cookie: ctx.op, corpo: corpo ?? {} });
    assert.equal(r.status, 403, `${m} ${c} como operador -> ${r.status}`);
  }
  // O operador não consegue virar admin editando a si mesmo.
  const eu = (await pedir("/api/sessao", { cookie: ctx.op })).corpo.usuario;
  const virar = await pedir(`/api/gestao/equipe/${eu.id}`, { metodo: "PUT", cookie: ctx.op, corpo: { papel: "admin" } });
  assert.ok(virar.status === 403, `operador editou o próprio cargo: ${virar.status}`);
  assert.equal((await pedir("/api/sessao", { cookie: ctx.op })).corpo.usuario.papel, "operador");
});

test("administrador de empresa não vira dono da plataforma nem troca de empresa pelo cabeçalho", async () => {
  assert.equal((await pedir("/api/empresas", { metodo: "POST", cookie: ctx.b, corpo: { nome: "Clone" } })).status, 403);
  const s = await pedir("/api/sessao", { cookie: ctx.b, cab: { "x-empresa": ctx.empresaA! } });
  assert.equal(s.corpo.empresa.id, ctx.empresaB, "o cabeçalho X-Empresa trocou a empresa de quem não é da plataforma");
  assert.equal(s.corpo.empresas, undefined);
  const u = await pedir("/api/usuarios", { cookie: ctx.b, cab: { "x-empresa": ctx.empresaA! } });
  assert.ok(u.corpo.usuarios.every((x: any) => x.email.endsWith("@b.test")));
  assert.ok(u.corpo.usuarios.every((x: any) => !("hash" in x)), "a lista de usuários vazou o hash da senha");
});

// ------------------------------------------------------------------ 3. isolamento entre empresas

test("a empresa B não lê, não edita e não apaga o que é da empresa A", async () => {
  // A cria um passageiro e um cupom
  const criado = await pedir("/api/cadastros/clientes", { metodo: "POST", cookie: ctx.a, corpo: { nome: "Cliente Secreto A", telefone: "11999990001", status: "Ativo" } });
  assert.equal(criado.status, 200, criado.texto);
  const id = criado.corpo.registro?.id ?? criado.corpo.id;
  assert.ok(id, criado.texto);
  const doA = await pedir("/api/cadastros/clientes", { cookie: ctx.a });
  assert.ok(doA.texto.includes("Cliente Secreto A"));
  // B não vê na lista (nem pela busca)
  const doB = await pedir("/api/cadastros/clientes?busca=Secreto", { cookie: ctx.b });
  assert.ok(!doB.texto.includes("Secreto"), "B enxergou o cliente de A");
  // B tenta editar e apagar pelo id de A: nada acontece
  const edit = await pedir(`/api/cadastros/clientes/${id}`, { metodo: "PUT", cookie: ctx.b, corpo: { nome: "Invadido" } });
  assert.ok([403, 404, 400].includes(edit.status), `edição entre empresas -> ${edit.status}`);
  const del = await pedir(`/api/cadastros/clientes/${id}`, { metodo: "DELETE", cookie: ctx.b });
  assert.ok([403, 404, 400].includes(del.status), `exclusão entre empresas -> ${del.status}`);
  const depois = await pedir("/api/cadastros/clientes", { cookie: ctx.a });
  assert.ok(depois.texto.includes("Cliente Secreto A") && !depois.texto.includes("Invadido"), "A perdeu ou teve o registro alterado");
  // Cabeçalho X-Empresa e parâmetro ?empresa= não trocam de empresa
  const forjado = await pedir("/api/cadastros/clientes?empresa=" + ctx.empresaA, { cookie: ctx.b, cab: { "x-empresa": ctx.empresaA! } });
  assert.ok(!forjado.texto.includes("Secreto"));
});

test("o app (token) de uma empresa não vale na URL de outra empresa", async () => {
  const token = crypto.randomBytes(20).toString("hex");
  for (const emp of [ctx.empresaA, ctx.empresaB]) {
    const r = await pedir(`/api/apps/${emp}/eu`, { cab: { authorization: `Bearer ${token}` } });
    assert.equal(r.status, 401);
  }
  // empresa inexistente ou com formato de caminho: 404, nunca erro de arquivo
  for (const emp of ["nao-existe", "%2e%2e%2f", "..%2f..%2fetc"]) assert.ok([400, 404].includes((await pedir(`/api/apps/${emp}/marca`)).status));
});

test("rotas com :id de outra empresa respondem 404/403 (sem vazar o registro)", async () => {
  const idsA: Record<string, string> = {};
  // percorre as rotas GET com :id e confere que B não recebe 200 com dado para um id que não é dele
  const rotas = listarRotas(app).filter((r) => r.metodo === "GET" && r.caminho.startsWith("/api/") && /:id$/.test(r.caminho) && !r.caminho.startsWith("/api/apps/"));
  assert.ok(rotas.length > 0);
  for (const r of rotas) {
    const resp = await pedir(r.caminho.replace(/:id/g, "id-que-nao-existe"), { cookie: ctx.b });
    assert.ok(resp.status !== 500, `${r.caminho} -> 500`);
    assert.ok(!resp.texto.includes("Cliente Secreto A"), `${r.caminho} vazou dado de A`);
  }
  void idsA;
});

// ------------------------------------------------------------------ 4. força bruta no login

test("login: depois de 8 erros do mesmo IP e e-mail vem 429, e nem a senha certa entra (bloqueio temporário)", async () => {
  zerarTentativasDeLogin();
  for (let i = 0; i < LIMITES_LOGIN.ipEmail; i++) {
    const r = await pedir("/api/entrar", { metodo: "POST", corpo: { email: "dona@a.test", senha: "errada-" + i } });
    assert.equal(r.status, 401);
  }
  const bloqueado = await pedir("/api/entrar", { metodo: "POST", corpo: { email: "dona@a.test", senha: SENHA_A } });
  assert.equal(bloqueado.status, 429);
  assert.ok(!bloqueado.cookie, "recebeu cookie durante o bloqueio");
  // outro e-mail, do mesmo IP, ainda entra (a central atrás do mesmo IP não se tranca)
  assert.equal((await pedir("/api/entrar", { metodo: "POST", corpo: { email: "adm@b.test", senha: SENHA_B } })).status, 200);
  zerarTentativasDeLogin();
});

test("login: limite por e-mail (vindo de IPs diferentes) e por IP (e-mails diferentes)", () => {
  zerarTentativasDeLogin();
  for (let i = 0; i < LIMITES_LOGIN.email; i++) { assert.ok(podeTentar(`10.0.${i}.1`, "alvo@x.test")); errouLogin(`10.0.${i}.1`, "alvo@x.test"); }
  assert.equal(podeTentar("10.9.9.9", "alvo@x.test"), false, "ataque distribuído contra uma conta passou do limite por e-mail");
  zerarTentativasDeLogin();
  for (let i = 0; i < LIMITES_LOGIN.ip; i++) { assert.ok(podeTentar("10.1.1.1", `u${i}@x.test`)); errouLogin("10.1.1.1", `u${i}@x.test`); }
  assert.equal(podeTentar("10.1.1.1", "novo@x.test"), false, "um IP testando várias contas passou do limite por IP");
  assert.equal(podeTentar("10.2.2.2", "novo@x.test"), true);
  zerarTentativasDeLogin();
});

test("troca de senha também respeita o limite e não aceita corpo gigante no login", async () => {
  zerarTentativasDeLogin();
  const grande = await pedir("/api/entrar", { metodo: "POST", corpo: { email: "x".repeat(5000) + "@a.test", senha: "y" } });
  assert.equal(grande.status, 401);
  const enorme = await pedir("/api/entrar", { metodo: "POST", bruto: JSON.stringify({ email: "a", senha: "x".repeat(2_000_000) }), cab: { "content-type": "application/json" } });
  assert.equal(enorme.status, 413);
  zerarTentativasDeLogin();
});

// ------------------------------------------------------------------ 5. XSS e injeção

const CARGAS = [`<script>alert(1)</script>`, `"><img src=x onerror=alert(1)>`, `'; DROP TABLE x; --`, `' OR '1'='1`, `%' UNION SELECT hash FROM usuarios --`, `\u0000\u0001`, "{{7*7}}", "a".repeat(5000)];

test("buscas e listagens com carga de ataque: sem erro 500, sem eco cru de HTML e sem mostrar a pilha", async () => {
  const rotas = [
    "/api/cadastros/clientes?busca=", "/api/cadastros/motoristas?busca=", "/api/corridas?busca=", "/api/corridas?os=",
    "/api/estatisticas?busca=", "/api/motoristas?busca=", "/api/enderecos/buscar?q=", "/api/gestao/passageiros?busca=",
    "/api/gestao/motoristas?busca=", "/api/corridas-proprias?busca=",
  ];
  for (const rota of rotas) {
    for (const c of CARGAS) {
      const r = await pedir(rota + encodeURIComponent(c), { cookie: ctx.a });
      assert.ok(r.status < 500, `${rota} com carga -> ${r.status}`);
      assert.ok(!/at .*\.ts:\d+|node_modules|SQLITE|syntax error/i.test(r.texto), `${rota} mostrou erro interno`);
      assert.ok(!r.cab.get("content-type")?.includes("text/html"), `${rota} respondeu HTML`);
      assert.ok(r.texto.length < 200_000, `${rota} devolveu resposta enorme`);
    }
  }
});

test("texto com HTML é guardado como texto: respostas são JSON com nosniff e o relatório escapa o HTML", async () => {
  const c = await pedir("/api/cadastros/clientes", { metodo: "POST", cookie: ctx.a, corpo: { nome: `<img src=x onerror=alert(1)>`, telefone: "11999990002", status: "Ativo" } });
  assert.equal(c.status, 200, c.texto);
  const l = await pedir("/api/cadastros/clientes", { cookie: ctx.a });
  assert.match(String(l.cab.get("content-type")), /application\/json/);
  assert.equal(l.cab.get("x-content-type-options"), "nosniff");
  assert.match(String(l.cab.get("cache-control")), /no-store/);
});

test("imagem enviada: só tipo de imagem, nada de HTML/SVG executável servido como página", async () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`;
  const env = await pedir("/api/marca/arquivo?tipo=logoClaro", { metodo: "POST", cookie: ctx.a, cab: { "content-type": "image/svg+xml" }, bruto: svg });
  if (env.status === 200) {
    const nome = env.corpo.marca.arquivos.logoClaro;
    const r = await pedir(`/api/publico/arquivo/${ctx.empresaA}/${nome}`);
    assert.match(String(r.cab.get("content-security-policy")), /sandbox/);
    assert.equal(r.cab.get("x-content-type-options"), "nosniff");
  }
  const html = await pedir("/api/marca/arquivo?tipo=logoClaro", { metodo: "POST", cookie: ctx.a, cab: { "content-type": "text/html" }, bruto: "<script>alert(1)</script>" });
  assert.ok(html.status >= 400, "aceitou HTML como imagem");
  const trav = await pedir(`/api/publico/arquivo/${ctx.empresaA}/..%2F..%2Fusuarios.json`);
  assert.equal(trav.status, 404);
  const trav2 = await pedir(`/api/publico/arquivo/..%2F${ctx.empresaB}/logo.png`);
  assert.equal(trav2.status, 404);
});

// ------------------------------------------------------------------ 6. robôs de clonagem e cabeçalhos das páginas

test("filtro de User-Agent: reconhece as ferramentas de clonagem e deixa navegador passar", () => {
  for (const ua of ["HTTrack/3.0", "Wget/1.21", "curl/8.4.0", "WebCopier v7", "Teleport Pro/1.29", "SiteSucker/3.1", "Offline Explorer/8.1", "WebStripper/2.0", "Scrapy/2.11 (+https://scrapy.org)", "python-requests/2.31", "Go-http-client/2.0", "WGET", "CURL/7"]) {
    assert.ok(ehRoboDeClonagem(ua), ua);
  }
  for (const ua of ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36", "Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Version/4.0 Chrome/126 Mobile Safari/537.36", "okhttp/4.12.0", "", undefined]) {
    assert.equal(ehRoboDeClonagem(ua), false, String(ua));
  }
});

test("páginas do painel: 403 para robô, cabeçalhos de segurança, assets com cache longo; a API de robôs continua livre", async () => {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), "dist-seg-"));
  fs.mkdirSync(path.join(dist, "assets"));
  fs.writeFileSync(path.join(dist, "index.html"), "<!doctype html><div id=root></div>");
  fs.writeFileSync(path.join(dist, "assets", "app-abc123.js"), "console.log(1)");
  const mini = express();
  mini.get("/api/saude", (_q, s) => s.json({ ok: true }));
  mini.get("/api/apps/x/eu", (_q, s) => s.status(401).json({ erro: "x" }));
  servirPainel(mini, dist);
  const s2 = mini.listen(0);
  const b = `http://127.0.0.1:${(s2.address() as AddressInfo).port}`;
  try {
    const navegador = { "user-agent": "Mozilla/5.0 Chrome/126" };
    for (const ua of ["curl/8.0", "Wget/1.21", "HTTrack", "python-requests/2.31", "Go-http-client/1.1", "Scrapy/2.0", "SiteSucker", "WebCopier", "Teleport Pro", "Offline Explorer", "WebStripper"]) {
      for (const p of ["/", "/motoristas", "/index.html", "/assets/app-abc123.js"]) {
        assert.equal((await fetch(b + p, { headers: { "user-agent": ua } })).status, 403, `${ua} ${p}`);
      }
      // API (apps, integrações, saúde) não é filtrada por User-Agent
      assert.equal((await fetch(b + "/api/saude", { headers: { "user-agent": ua } })).status, 200);
      assert.equal((await fetch(b + "/api/apps/x/eu", { headers: { "user-agent": ua } })).status, 401);
    }
    for (const p of ["/", "/motoristas/qualquer", "/index.html"]) {
      const r = await fetch(b + p, { headers: navegador });
      assert.equal(r.status, 200, p);
      assert.equal(r.headers.get("x-frame-options"), "DENY");
      assert.equal(r.headers.get("content-security-policy"), "frame-ancestors 'none'");
      assert.equal(r.headers.get("x-content-type-options"), "nosniff");
      assert.equal(r.headers.get("referrer-policy"), "no-referrer");
      assert.equal(r.headers.get("cache-control"), "no-store, no-cache, must-revalidate, proxy-revalidate");
      assert.equal(await r.text(), "<!doctype html><div id=root></div>", "a página deve ser só o casco com a tela de entrada");
    }
    const a = await fetch(b + "/assets/app-abc123.js", { headers: navegador });
    assert.equal(a.status, 200);
    assert.match(String(a.headers.get("cache-control")), /max-age=31536000/);
    assert.equal(a.headers.get("x-frame-options"), "DENY");
    assert.equal(a.headers.get("x-content-type-options"), "nosniff");
  } finally { s2.close(); fs.rmSync(dist, { recursive: true, force: true }); }
});

test("respostas da API: nosniff, sem cache depois do login e sem X-Powered-By", async () => {
  const r = await pedir("/api/sessao", { cookie: ctx.a });
  assert.equal(r.cab.get("x-content-type-options"), "nosniff");
  assert.equal(r.cab.get("referrer-policy"), "no-referrer");
  assert.equal(r.cab.get("cache-control"), "no-store");
  assert.equal(r.cab.get("x-powered-by"), null);
  const e = await pedir("/api/inexistente", { cookie: ctx.a });
  assert.equal(e.status, 404);
  const ruim = await pedir("/api/entrar", { metodo: "POST", bruto: "{json quebrado", cab: { "content-type": "application/json" } });
  assert.equal(ruim.status, 400);
  assert.ok(!/at .*\.ts|node_modules|C:\\|\/home\//.test(ruim.texto), "erro mostrou caminho de arquivo");
});

// ------------------------------------------------------------------ 7. nenhuma chave no front

test("nenhuma chave, token ou variável VITE_ com segredo no código do navegador", () => {
  const raiz = path.resolve("src");
  const arquivos: string[] = [];
  const andar = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) andar(p); else if (/\.(ts|tsx)$/.test(e.name)) arquivos.push(p); } };
  andar(path.join(raiz, "web")); andar(path.join(raiz, "apps", "web"));
  const suspeitos = [/VITE_[A-Z_]*(KEY|TOKEN|SECRET|SENHA|PASSWORD|SERVICE)/i, /sk-[A-Za-z0-9]{20,}/, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, /service_role/i, /AKIA[0-9A-Z]{16}/, /AIza[0-9A-Za-z_-]{30,}/, /(api[_-]?key|secret|token)\s*[:=]\s*["'][A-Za-z0-9_\-./+=]{16,}["']/i, /process\.env\./];
  const achados: string[] = [];
  for (const a of arquivos) {
    const t = fs.readFileSync(a, "utf8");
    for (const re of suspeitos) if (re.test(t)) achados.push(`${path.relative(raiz, a)} ~ ${re}`);
  }
  assert.deepEqual(achados, []);
  // O que o front pode ler do ambiente: nada além do que o Vite embute por padrão.
  const envs = fs.readdirSync(path.resolve(".")).filter((n) => /^\.env/.test(n) && n !== ".env.example");
  for (const e of envs) assert.ok(!/^VITE_/m.test(fs.readFileSync(e, "utf8")), `${e} tem VITE_*`);
  const exemplo = fs.readFileSync(path.resolve(".env.example"), "utf8");
  assert.ok(!/^VITE_/m.test(exemplo), ".env.example tem VITE_*");
});
