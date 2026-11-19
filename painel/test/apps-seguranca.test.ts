// Segurança da API dos apps: toda rota que não é pública exige o token; token de uma empresa não vale na outra; passageiro não
// usa rota do motorista; token forjado, vazio ou enorme é recusado; e os campos de texto não guardam marcação HTML.
// Tudo local, sem internet. Rodar: npm test (na pasta painel).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const DADOS = fs.mkdtempSync(path.join(os.tmpdir(), "apps-seguranca-teste-"));
process.env.DADOS_DIR = DADOS;
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "t".repeat(40);
process.env.APPS_MOSTRAR_CODIGO = "1";
process.env.APPS_CODIGOS_POR_IP = "1000";
process.env.APPS_CADASTROS_POR_IP = "1000";

const express = (await import("express")).default;
const D = await import("../src/servidor/dados.ts");
const { cadastroPorId } = await import("../src/comum/cadastros.ts");
const { criar } = await import("../src/cadastros/armazem.ts");
const { rotasApps } = await import("../src/apps/rotas.ts");

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use("/api/apps", rotasApps);
const servidor = app.listen(0);
const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
test.after(() => servidor.close());

const A = D.criarEmpresa("Segura A"), B = D.criarEmpresa("Segura B");
criar(A.id, cadastroPorId("motoristas")!, { nome: "Motorista A", telefone: "11900000001", status: "Ativo" }, "teste");
criar(B.id, cadastroPorId("motoristas")!, { nome: "Motorista B", telefone: "11900000001", status: "Ativo" }, "teste");

async function chamar(metodo: string, url: string, corpo?: unknown, token?: string, extra: Record<string, string> = {}) {
  const r = await fetch(base + url, { method: metodo, headers: { ...(corpo !== undefined ? { "content-type": "application/json" } : {}), ...(token !== undefined ? { authorization: `Bearer ${token}` } : {}), ...extra }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  return { status: r.status, corpo: await r.json().catch(() => ({})) };
}
async function entrar(empresa: string, papel: string, telefone: string) {
  const c = await chamar("POST", `/api/apps/${empresa}/entrar/codigo`, { papel, telefone });
  const e = await chamar("POST", `/api/apps/${empresa}/entrar`, { papel, telefone, codigo: c.corpo.codigoTeste });
  assert.equal(e.status, 200, JSON.stringify(e.corpo));
  return e.corpo.token as string;
}

/** Todas as rotas (método e caminho) montadas no roteador dos apps, inclusive nos roteadores aninhados. */
function rotasDe(stack: any[], prefixo = ""): Array<{ metodo: string; caminho: string }> {
  const l: Array<{ metodo: string; caminho: string }> = [];
  for (const camada of stack) {
    if (camada.route) for (const m of Object.keys(camada.route.methods)) l.push({ metodo: m.toUpperCase(), caminho: prefixo + camada.route.path });
    else if (camada.handle?.stack) l.push(...rotasDe(camada.handle.stack, prefixo));
  }
  return l;
}

// Rotas que de propósito não pedem token (login, cadastro, marca, download do APK, recuperar senha, acompanhar viagem pelo link).
const PUBLICAS = /^(\/:empresa)?\/(entrar|entrar\/codigo|marca|apks|apks\/:app|conta\/criar|conta\/entrar|conta\/esqueci|conta\/nova-senha|conta\/senha\/esqueci|conta\/senha\/redefinir|acompanhar\/:codigo|cidades|publico|conta\/existe|conta\/verificar|termos|eventos\/espera|eventos)(\/.*)?$/;

test("toda rota dos apps que não é pública recusa quem não mandou o token (e o token falso)", async () => {
  const todas = rotasDe((rotasApps as any).stack);
  assert.ok(todas.length > 60, `achou ${todas.length} rotas`);
  const falhas: string[] = [];
  for (const { metodo, caminho } of todas) {
    if (PUBLICAS.test(caminho) || caminho === "/" || caminho === "*") continue;
    const url = `/api/apps/${A.id}${caminho.replace(/^\/:empresa/, "").replace(/:[A-Za-z]+/g, "x")}`;
    for (const tok of [undefined, "token-falso-123", "a".repeat(500)]) {
      const r = await chamar(metodo === "GET" || metodo === "DELETE" ? metodo : "POST", url, metodo === "GET" || metodo === "DELETE" ? undefined : {}, tok);
      if (![401, 403, 404].includes(r.status)) falhas.push(`${metodo} ${caminho} (${tok ? tok.slice(0, 8) : "sem token"}) → ${r.status}`);
    }
  }
  assert.deepEqual(falhas, [], "rotas que responderam sem exigir login");
});

test("token de uma empresa não vale na outra, e passageiro não usa rota do motorista", async () => {
  const tokA = await entrar(A.id, "motorista", "11900000001");
  assert.equal((await chamar("GET", `/api/apps/${A.id}/estado`, undefined, tokA)).status, 200);
  assert.ok([401, 403].includes((await chamar("GET", `/api/apps/${B.id}/estado`, undefined, tokA)).status), "token da empresa A na B");
  const tokP = await entrar(A.id, "passageiro", "11955550001");
  for (const [m, u] of [["POST", "online"], ["GET", "ganhos"], ["GET", "carteira/extrato"], ["GET", "aceitacao"]] as const) {
    const r = await chamar(m, `/api/apps/${A.id}/${u}`, m === "POST" ? { lat: -23.5, lng: -46.6 } : undefined, tokP);
    assert.ok([403, 404].includes(r.status), `${m} ${u} com token de passageiro → ${r.status}`);
  }
  assert.equal((await chamar("GET", `/api/apps/${A.id}/motoristas-perto?lat=-23&lng=-46`, undefined, tokA)).status, 403, "motorista não usa a rota do passageiro");
});

test("tentativas erradas de código travam e entradas inválidas são recusadas sem derrubar o servidor", async () => {
  const c = await chamar("POST", `/api/apps/${A.id}/entrar/codigo`, { papel: "motorista", telefone: "11900000001" });
  assert.ok(c.corpo.codigoTeste);
  for (let i = 0; i < 5; i++) assert.equal((await chamar("POST", `/api/apps/${A.id}/entrar`, { papel: "motorista", telefone: "11900000001", codigo: "000000" })).status, 400);
  // Depois de 5 erros o código certo também deixa de valer: tem que pedir outro.
  assert.equal((await chamar("POST", `/api/apps/${A.id}/entrar`, { papel: "motorista", telefone: "11900000001", codigo: c.corpo.codigoTeste })).status, 400);
  for (const corpo of [null, "texto", [], { papel: { $ne: 1 }, telefone: { $gt: "" } }, { papel: "motorista", telefone: "1".repeat(5000) }]) {
    const r = await chamar("POST", `/api/apps/${A.id}/entrar/codigo`, corpo);
    assert.ok(r.status >= 400 && r.status < 500, `entrada inválida → ${r.status}`);
  }
  assert.equal((await chamar("GET", `/api/apps/${A.id}/marca`)).status, 200, "o servidor continua de pé");
  assert.ok([400, 404].includes((await chamar("GET", `/api/apps/..%2F..%2Fetc/marca`)).status));
});

test("textos digitados pelo usuário não guardam marcação HTML (anti XSS)", async () => {
  const tok = await entrar(A.id, "passageiro", "11955550002");
  await chamar("POST", `/api/apps/${A.id}/eu`, { nome: "<img src=x onerror=alert(1)> Zé Silva" }, tok);
  const eu = (await chamar("GET", `/api/apps/${A.id}/eu`, undefined, tok)).corpo.eu;
  assert.ok(!/[<>]/.test(String(eu.nome)), `nome guardado: ${eu.nome}`);
});
