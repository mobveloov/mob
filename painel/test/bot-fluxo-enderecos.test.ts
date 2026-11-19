// Testes do fluxo do bot com as regras de endereço do sistema de referência: embarque vago, número da casa,
// pedido urgente, endereços salvos e link de mapa. Sem rede (provedor simulado, corridas de mentira).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DADOS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "bot-enderecos-"));
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "y".repeat(40);
for (const k of ["ANTHROPIC_API_KEY", "GROQ_API_KEYS", "GROQ_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY"]) delete process.env[k];

const D = await import("../src/servidor/dados.ts");
const A = await import("../src/bot/armazem.ts");
const { receber } = await import("../src/bot/fluxo.ts");
const { definirCorridasDoBot } = await import("../src/bot/corridas.ts");

const empresa = D.criarEmpresa("Central Enderecos", { nomeExibido: "Central Enderecos", assistente: { nome: "Lia", tom: "cordial" } });
A.salvarConfig(empresa.id, { ativo: true, provedor: "simulado", instancia: "bot-enderecos", agendar: false });

const criadas: Array<{ embarque: string; destino?: string; categoria: string; pagamento: string }> = [];
let abertas = 0;
definirCorridasDoBot({
  categorias: async () => [{ id: "c1", nome: "Comum" }, { id: "c2", nome: "Moto" }],
  criar: async (_e, n) => { criadas.push({ embarque: n.embarque.texto, destino: n.destino?.texto, categoria: n.categoria, pagamento: n.pagamento }); abertas++; return { id: `r${criadas.length}`, os: String(100 + criadas.length) }; },
  detalhar: async () => ({ status: abertas ? "finalizada" : "procurando", grupo: "finalizada" }),
  cancelar: async () => undefined,
  avaliar: async () => undefined,
});

let seq = 0;
const msg = (tel: string, texto: string, extra: Record<string, unknown> = {}) =>
  receber(empresa.id, { id: `e${++seq}`, telefone: tel, nome: "Rui", texto, ...extra }, { classificar: async () => null });
const etapa = (tel: string) => A.conversa(empresa.id, tel)!.etapa;
const encerrar = (tel: string) => { const c = A.conversa(empresa.id, tel)!; c.corrida = undefined; c.etapa = "inicio"; c.rascunho = {}; A.salvarConversa(empresa.id, c); };

test("embarque vago ('estou em casa') e só número não viram endereço", async () => {
  const tel = "5511940000001";
  const r1 = await msg(tel, "oi, estou em casa");
  assert.match(r1[0], /preciso do endereço exato/);
  assert.equal(etapa(tel), "embarque");
  const r2 = await msg(tel, "496");
  assert.match(r2[0], /nome da rua com o número/);
  assert.equal(etapa(tel), "embarque");
  const r3 = await msg(tel, "pode vir aqui");
  assert.match(r3[0], /preciso do endereço exato/);
});

test("rua sem número pede o número; 'Avenida X 485' e '120' completam o embarque", async () => {
  const tel = "5511940000002";
  await msg(tel, "1");
  assert.equal(etapa(tel), "menu");
  await msg(tel, "1");
  const r = await msg(tel, "Rua das Flores");
  assert.match(r[0], /Qual é o NÚMERO do embarque/);
  assert.equal(etapa(tel), "numero_embarque");
  assert.match((await msg(tel, "abc"))[0], /NÚMERO do embarque/);
  const d = await msg(tel, "nº 120");
  assert.match(d[0], /endereço de destino/);
  assert.equal(A.conversa(empresa.id, tel)!.rascunho.embarque?.texto, "Rua das Flores, 120");
  // Destino sem número: "não sei" segue sem o número.
  const r2 = await msg(tel, "Avenida Brasil");
  assert.match(r2[0], /NÚMERO do destino/);
  const c = await msg(tel, "não sei");
  assert.match(c[0], /Rua das Flores, 120/);
  assert.match(c[0], /Avenida Brasil/);
  // Outra rua: mesma rua + número no lugar do número.
  const tel2 = "5511940000003";
  await msg(tel2, "oi"); await msg(tel2, "1");
  await msg(tel2, "Avenida Café");
  await msg(tel2, "Avenida cafe 485");
  assert.equal(A.conversa(empresa.id, tel2)!.rascunho.embarque?.texto, "Avenida Café, 485");
});

test("link de mapa e coordenadas viram ponto no mapa", async () => {
  const tel = "5511940000004";
  await msg(tel, "oi"); await msg(tel, "1");
  await msg(tel, "-21.026138, -48.227547");
  const e = A.conversa(empresa.id, tel)!.rascunho.embarque!;
  assert.equal(e.lat, -21.026138);
  assert.equal(e.lng, -48.227547);
  const tel2 = "5511940000005";
  await msg(tel2, "oi"); await msg(tel2, "1");
  await msg(tel2, "estou aqui https://www.google.com/maps/@-21.0115,-48.2339,17z");
  assert.equal(A.conversa(empresa.id, tel2)!.rascunho.embarque?.lat, -21.0115);
});

test("pedido urgente: só o embarque e a corrida sai (primeira categoria, dinheiro)", async () => {
  const tel = "5511940000006";
  const antes = criadas.length;
  const r = await msg(tel, "preciso de um carro urgente");
  assert.match(r[0], /Corrida urgente/);
  assert.equal(etapa(tel), "embarque");
  const f = await msg(tel, "Rua Sete de Setembro 100");
  assert.match(f.join("\n"), /Pedido feito/);
  assert.deepEqual(criadas.slice(antes).map((c) => [c.embarque, c.destino, c.categoria, c.pagamento]), [["Rua Sete de Setembro 100", undefined, "Comum", "Dinheiro"]]);
  // Embarque na mesma frase.
  const tel2 = "5511940000007";
  const g = await msg(tel2, "urgente rua sete de setembro 200");
  assert.match(g.join("\n"), /Pedido feito/);
  assert.equal(criadas.at(-1)!.embarque, "rua sete de setembro 200");
});

test("endereços usados duas vezes viram opções salvas", async () => {
  const tel = "5511940000008";
  for (let i = 0; i < 2; i++) {
    await msg(tel, "oi"); await msg(tel, "1");
    await msg(tel, "Rua Amazonas, 53");
    await msg(tel, "2"); // sem destino
    await msg(tel, "1"); // confirma
    await msg(tel, "1"); // categoria
    await msg(tel, "1"); // pagamento
    encerrar(tel);
  }
  assert.equal(A.conversa(empresa.id, tel)!.enderecos?.[0].usos, 2);
  await msg(tel, "oi");
  const r = await msg(tel, "1");
  assert.match(r[0], /Encontrei seus endereços salvos/);
  assert.match(r[0], /\*1\* - Rua Amazonas, 53/);
  assert.match(r[0], /\*2\* - Outro endereço/);
  const d = await msg(tel, "1");
  assert.match(d[0], /endereço de destino/);
  assert.equal(A.conversa(empresa.id, tel)!.rascunho.embarque?.texto, "Rua Amazonas, 53");
  // "Outro endereço" volta a pedir o endereço.
  const tel2 = tel;
  encerrar(tel2);
  await msg(tel2, "oi"); await msg(tel2, "1");
  assert.match((await msg(tel2, "2"))[0], /endereço de embarque|endereco de embarque/i);
});

test("suporte: 'sair' volta ao menu", async () => {
  const tel = "5511940000009";
  await msg(tel, "oi"); await msg(tel, "2");
  assert.equal(etapa(tel), "suporte");
  const r = await msg(tel, "sair");
  assert.equal(etapa(tel), "menu");
  assert.ok(r.length > 0);
});
