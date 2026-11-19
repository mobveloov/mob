// Pesquisa "Alguma preferência para esta corrida?" (copiada do sistema de referência): regras puras e o fluxo no bot.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DADOS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "bot-opcoes-"));
process.env.NODE_ENV = "test";
process.env.SESSAO_SEGREDO = "y".repeat(40);
for (const k of ["ANTHROPIC_API_KEY", "GROQ_API_KEYS", "GROQ_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY"]) delete process.env[k];

const O = await import("../src/bot/opcoes-pedido.ts");
const D = await import("../src/servidor/dados.ts");
const A = await import("../src/bot/armazem.ts");
const { receber } = await import("../src/bot/fluxo.ts");
const { definirCorridasDoBot } = await import("../src/bot/corridas.ts");

test("configuração vazia não liga nada; só valor true conta; filtro sem nome some", () => {
  const off = O.normalizeRideOptionsConfig(null);
  assert.equal(O.enabledOptions(off).length, 0);
  assert.equal(off.bot, false);
  const cfg = O.normalizeRideOptionsConfig({
    bot: true,
    prefs: { motorista_mulher: true, aceita_animais: true, porta_malas_grande: "sim" },
    filters: [{ key: "filtro_1", label: " Ar-condicionado ", enabled: true }, { key: "filtro_2", label: "", enabled: true }],
    retorno: true, parada: true, cupom: true, favorito: true, recado: true,
  });
  assert.equal(cfg.prefs.porta_malas_grande, false);
  assert.equal(cfg.filters[0].label, "Ar-condicionado");
  assert.equal(cfg.filters[1].enabled, false);
  assert.deepEqual(O.enabledOptions(cfg).map((i) => i.key), ["motorista_mulher", "aceita_animais", "filtro_1", "retorno", "parada", "cupom", "favorito", "recado"]);
});

test("menu numerado e leitura da resposta (números, 0, nome por extenso)", () => {
  const items = O.enabledOptions(O.normalizeRideOptionsConfig({ bot: true, prefs: { motorista_mulher: true, aceita_animais: true }, retorno: true, cupom: true }));
  const menu = O.botOptionsMenu(items);
  assert.match(menu, /Alguma preferência para esta corrida/);
  assert.match(menu, /\*1\* - Motorista mulher/);
  assert.deepEqual(O.parseOptionsReply("0", items), { skip: true, picked: [], invalid: false });
  assert.equal(O.parseOptionsReply("não", items).skip, true);
  assert.deepEqual(O.parseOptionsReply("1 3, 4", items).picked.map((i) => i.key), ["motorista_mulher", "retorno", "cupom"]);
  assert.deepEqual(O.parseOptionsReply("1 e 1", items).picked.map((i) => i.key), ["motorista_mulher"]);
  assert.equal(O.parseOptionsReply("99", items).invalid, true);
  assert.equal(O.parseOptionsReply("quero pizza", items).invalid, true);
  assert.deepEqual(O.parseOptionsReply("ida e volta", items).picked.map((i) => i.key), ["retorno"]);
});

test("cupom, motorista de confiança, parada e recado: entrada conferida", () => {
  assert.equal(O.normalizeCoupon(" promo10 "), "PROMO10");
  assert.equal(O.normalizeCoupon("a"), null);
  assert.deepEqual(O.parseFavoriteDriver("abc-1d23"), { tipo: "P", valor: "ABC1D23" });
  assert.deepEqual(O.parseFavoriteDriver("(16) 99134-4127"), { tipo: "T", valor: "16991344127" });
  assert.deepEqual(O.parseFavoriteDriver("120"), { tipo: "V", valor: "120" });
  assert.equal(O.parseFavoriteDriver("o joao"), null);
  let ch = O.applyInput({}, "cupom", "promo10").choices;
  assert.equal(ch.cupom, "PROMO10");
  assert.ok(O.applyInput(ch, "favorito", "fulano").error);
  ch = O.applyInput(ch, "recado", "portaria 2, apto 31").choices;
  assert.equal(O.applyInput(ch, "cupom", "pular").choices, ch);
  assert.ok(O.applyInput({}, "recado", "a").error);
});

test("sanitizeChoices só deixa passar o que a empresa ligou", () => {
  const cfg = O.normalizeRideOptionsConfig({ bot: true, prefs: { motorista_mulher: true }, filters: [{ key: "filtro_1", label: "Ar", enabled: true }], retorno: true, recado: true });
  const clean = O.sanitizeChoices({ extras: { motorista_mulher: true, porta_malas_grande: true, filtro_1: true }, retorno: true, cupom: "XYZ", recado: "  oi   tudo bem " }, cfg);
  assert.deepEqual(clean.extras, { motorista_mulher: true, filtro_1: true });
  assert.equal(clean.cupom, undefined, "cupom não ligado some");
  assert.equal(clean.recado, "oi tudo bem");
  assert.deepEqual(O.sanitizeChoices("lixo", cfg), {});
  const nomes = O.normalizeRideOptionsConfig({ filters: [{ key: "filtro_1", label: "Ar-condicionado", enabled: true }] });
  assert.deepEqual(O.describeChoices({ extras: { filtro_1: true }, retorno: true, cupom: "PROMO10" }, nomes), ["Ar-condicionado", "Ida e volta", "Cupom: PROMO10"]);
});

// ------------------------------------------------------------------ fluxo

const empresa = D.criarEmpresa("Central Opcoes", { nomeExibido: "Central Opcoes", assistente: { nome: "Lia", tom: "cordial" } });
const base = { ativo: true, provedor: "simulado" as const, instancia: "bot-opcoes" };
const criadas: Array<Record<string, unknown>> = [];
definirCorridasDoBot({
  categorias: async () => [{ id: "c1", nome: "Comum" }],
  criar: async (_e, n) => { criadas.push({ ...n }); return { id: `r${criadas.length}`, os: String(500 + criadas.length) }; },
  detalhar: async () => ({ status: "procurando", grupo: "aberta" }),
  cancelar: async () => undefined,
  avaliar: async () => undefined,
});
let seq = 0;
const msg = (tel: string, texto: string) => receber(empresa.id, { id: `o${++seq}`, telefone: tel, nome: "Rui", texto }, { classificar: async () => null });
// menu -> embarque -> destino -> confirmação -> categoria -> pagamento
const ate = async (tel: string) => {
  await msg(tel, "oi"); await msg(tel, "1"); await msg(tel, "Rua das Flores, 120"); await msg(tel, "Avenida Brasil, 500");
  await msg(tel, "1"); await msg(tel, "1");
  return msg(tel, "1");
};

test("com a pesquisa desligada a corrida sai direto depois do pagamento", async () => {
  A.salvarConfig(empresa.id, { ...base, agendar: false });
  const r = await ate("5511930000001");
  assert.match(r[0], /Pedido feito/);
  assert.equal(criadas.length, 1);
});

test("com a pesquisa ligada: pergunta, entende os números, pede o cupom e o recado e leva tudo para a corrida", async () => {
  A.salvarConfig(empresa.id, { ...base, ...A.sanearAvancada({ ...A.config(empresa.id), agendar: false, opcoes: { bot: true, prefs: { aceita_animais: true }, retorno: true, cupom: true, recado: true } as never }) });
  const tel = "5511930000002";
  const r = await ate(tel);
  assert.match(r[0], /Alguma preferência para esta corrida/);
  assert.match(r[0], /\*1\* - Aceita animal de estimação/);
  assert.equal(A.conversa(empresa.id, tel)!.etapa, "opcoes");
  assert.equal(criadas.length, 1, "ainda não criou");
  assert.match((await msg(tel, "blá"))[0], /Não entendi/);
  const c = await msg(tel, "1 2 3 4");
  assert.match(c[0], /código do cupom/);
  assert.equal(A.conversa(empresa.id, tel)!.etapa, "opcao_detalhe");
  assert.match((await msg(tel, "a"))[0], /Código inválido/);
  assert.match((await msg(tel, "promo10"))[0], /recado para o motorista/);
  const fim = await msg(tel, "portaria 2, apto 31");
  assert.match(fim[0], /Pedido feito/);
  assert.match(fim[0], /✨ Aceita animal de estimação · Ida e volta · Cupom: PROMO10 · Recado: portaria 2, apto 31/);
  const nova = criadas[1];
  assert.equal(nova.cupom, "PROMO10");
  assert.equal(nova.infoDepois, "portaria 2, apto 31");
  assert.match(String(nova.observacao), /Aceita animal de estimação/);
  assert.equal(A.conversa(empresa.id, tel)!.etapa, "em_corrida");
});

test("0 segue sem preferência; pedido urgente não pergunta", async () => {
  const tel = "5511930000003";
  await ate(tel);
  const r = await msg(tel, "0");
  assert.match(r[0], /Pedido feito/);
  assert.doesNotMatch(r[0], /✨/);
  const tel2 = "5511930000004";
  await msg(tel2, "urgente");
  await msg(tel2, "Rua das Flores, 120");
  assert.notEqual(A.conversa(empresa.id, tel2)!.etapa, "opcoes");
});
