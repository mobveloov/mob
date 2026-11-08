#!/usr/bin/env node
// TESTE DE CARGA dos apps (só no ambiente de carga: scripts/teste/docker-compose.carga.yml).
// N corridas AO MESMO TEMPO, divididas entre 2 empresas: pedido -> oferta -> aceite -> chat -> status -> finalizar -> nota.
// No fim confere: nenhuma corrida perdida ou duplicada, motorista certo, nada misturado entre empresas.
//
//   node scripts/teste/carga.mjs http://localhost:8796 500 [--extras]
//   --extras: ao mesmo tempo, conversas no bot (simulado), pedidos pelo totem e um disparo do CRM.
//
// Sem dependências. Grava o resultado em JSON (caminho no fim da saída).

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = (process.argv[2] ?? "http://localhost:8796").replace(/\/+$/, "");
const N = Number(process.argv[3] ?? 500);
const EXTRAS = process.argv.includes("--extras");
const EMPRESAS = 2;
const CENTRO = { lat: -21.0106, lng: -48.2196 };

// ------------------------------------------------------------------ medição

const tempos = new Map(); // operação -> [ms]
const erros = new Map(); // "operação: mensagem" -> quantidade
function anotar(op, ms, erro) {
  if (!tempos.has(op)) tempos.set(op, []);
  tempos.get(op).push(ms);
  if (erro) { const k = `${op}: ${String(erro).slice(0, 140)}`; erros.set(k, (erros.get(k) ?? 0) + 1); }
}
const pct = (l, p) => { if (!l.length) return null; const s = [...l].sort((a, b) => a - b); return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]); };

async function pedir(op, metodo, url, { corpo, token, cookie, empresa, tipo, cru, cabecalhos } = {}) {
  const h = { ...(cabecalhos ?? {}) };
  if (corpo !== undefined && !cru) h["Content-Type"] = "application/json";
  if (tipo) h["Content-Type"] = tipo;
  if (token) h.Authorization = `Bearer ${token}`;
  if (cookie) h.Cookie = cookie;
  if (empresa) h["X-Empresa"] = empresa;
  const t0 = performance.now();
  let status = 0, dados = null, erro = null;
  try {
    const r = await fetch(BASE + url, { method: metodo, headers: h, body: corpo === undefined ? undefined : cru ? corpo : JSON.stringify(corpo), signal: AbortSignal.timeout(60_000) });
    status = r.status;
    const txt = await r.text();
    try { dados = txt ? JSON.parse(txt) : null; } catch { dados = { bruto: txt.slice(0, 200) }; }
    if (!r.ok) erro = `HTTP ${r.status} ${dados?.erro ?? ""}`;
    if (r.headers.get("set-cookie")) dados = { ...(dados ?? {}), _cookie: r.headers.get("set-cookie").split(";")[0] };
  } catch (e) { erro = e.name === "TimeoutError" ? "tempo esgotado (60 s)" : `${e.message}${e.cause?.code ? ` (${e.cause.code})` : e.cause?.message ? ` (${e.cause.message})` : ""}`; }
  anotar(op, performance.now() - t0, erro);
  return { status, dados, erro };
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const telefone = (prefixo, i) => `169${prefixo}${String(i).padStart(6, "0")}`; // 11 dígitos, nunca termina em 0000 por acaso
const perto = () => ({ lat: CENTRO.lat + (Math.random() - 0.5) * 0.04, lng: CENTRO.lng + (Math.random() - 0.5) * 0.04 });

// ------------------------------------------------------------------ preparação (empresas, admin, cadastros)

const senha = crypto.randomBytes(12).toString("base64url");
console.log(`Carga: ${N} corridas ao mesmo tempo em ${EMPRESAS} empresas, em ${BASE}${EXTRAS ? " (com bot, totem e CRM)" : ""}`);

let r = await pedir("preparo", "POST", "/api/configurar", { corpo: { empresa: "Carga Um", nome: "Admin Carga", email: "admin@carga.test", senha } });
if (r.erro) {
  console.error(`Não consegui configurar o painel (${r.erro}). Use um ambiente de carga novo: docker compose -f scripts/teste/docker-compose.carga.yml -p mob-carga down -v`);
  process.exit(1);
}
r = await pedir("preparo", "POST", "/api/entrar", { corpo: { email: "admin@carga.test", senha } });
const cookie = r.dados._cookie;
const empresas = [(await pedir("preparo", "GET", "/api/sessao", { cookie })).dados.empresa.id];
r = await pedir("preparo", "POST", "/api/empresas", { cookie, corpo: { nome: "Carga Dois", adminNome: "Admin Dois", adminEmail: "admin2@carga.test", adminSenha: senha } });
empresas.push(r.dados.empresa.id);

const porEmpresa = Math.ceil(N / EMPRESAS);
const prefixos = ["11", "22"]; // telefones diferentes por empresa: assim dá para ver se algo misturou
for (const [ei, e] of empresas.entries()) {
  await pedir("preparo", "POST", "/api/cadastros/categorias", { cookie, empresa: e, corpo: { nome: "Carro", bandeirada: "5", valorKm: "2", valorMinuto: "0,3", valorMinimo: "8", ativa: true } });
  // Motoristas no cadastro (em lotes, para não medir só o cadastro)
  for (let i = 0; i < porEmpresa; i += 50) {
    await Promise.all(Array.from({ length: Math.min(50, porEmpresa - i) }, (_, j) => pedir("cadastro motorista", "POST", "/api/cadastros/motoristas", { cookie, empresa: e, corpo: { nome: `M${ei}-${i + j}`, telefone: telefone(`${prefixos[ei]}9`, i + j + 1), status: "Ativo", placa: `CRG${ei}${String(i + j).padStart(3, "0")}` } })));
  }
}
console.log(`Preparado: empresas ${empresas.join(", ")}; ${porEmpresa} motoristas por empresa.`);

// ------------------------------------------------------------------ login (todos ao mesmo tempo)

async function entrarApp(e, papel, tel) {
  const c = await pedir("login: pedir código", "POST", `/api/apps/${e}/entrar/codigo`, { corpo: { papel, telefone: tel } });
  if (!c.dados?.codigoTeste) return null;
  const s = await pedir("login: entrar", "POST", `/api/apps/${e}/entrar`, { corpo: { papel, telefone: tel, codigo: c.dados.codigoTeste } });
  return s.dados?.token ?? null;
}

const pessoas = [];
for (const [ei, e] of empresas.entries()) for (let i = 0; i < porEmpresa && pessoas.filter((p) => p.papel === "passageiro").length < N; i++) {
  pessoas.push({ e, ei, papel: "motorista", tel: telefone(`${prefixos[ei]}9`, i + 1), nome: `M${ei}-${i}` });
  pessoas.push({ e, ei, papel: "passageiro", tel: telefone(`${prefixos[ei]}8`, i + 1), nome: `P${ei}-${i}` });
}
let t = performance.now();
await Promise.all(pessoas.map(async (p) => { p.token = await entrarApp(p.e, p.papel, p.tel); }));
console.log(`Login de ${pessoas.length} pessoas: ${Math.round(performance.now() - t)} ms; sem token: ${pessoas.filter((p) => !p.token).length}`);
const passageiros = pessoas.filter((p) => p.papel === "passageiro" && p.token);
const motoristas = pessoas.filter((p) => p.papel === "motorista" && p.token);
await Promise.all(passageiros.map((p) => pedir("passageiro: nome", "POST", `/api/apps/${p.e}/eu`, { token: p.token, corpo: { nome: p.nome } })));
await Promise.all(motoristas.map((m) => pedir("motorista: online", "POST", `/api/apps/${m.e}/online`, { token: m.token, corpo: perto() })));

// ------------------------------------------------------------------ extras ao mesmo tempo (bot, totem, CRM)

async function extras() {
  const e = empresas[0];
  const res = { bot: 0, totem: 0, crm: 0 };
  await pedir("preparo", "PUT", "/api/bot/config", { cookie, empresa: e, corpo: { ativo: true, provedor: "simulado" } });
  // totem: um local com senha
  const loc = await pedir("preparo", "POST", "/api/totem/locais", { cookie, empresa: e, corpo: { nome: "Rodoviária Carga", endereco: { texto: "Rua da Carga, 1", ...CENTRO }, senha: "1234", pagamentos: ["Dinheiro", "Pix"] } });
  const chave = (await pedir("totem: entrar", "POST", `/api/totem/publico/${e}/${loc.dados.local.id}/entrar`, { corpo: { senha: "1234" } })).dados?.chave;
  // CRM: campanha para todos os passageiros
  const camp = await pedir("preparo", "POST", "/api/crm/campanhas", { cookie, empresa: e, corpo: { nome: "Carga", texto: "Oi {primeiro_nome}", publico: { tipo: "passageiro" } } });
  await Promise.all([
    ...Array.from({ length: 50 }, async (_, i) => {
      const tel = `55169${String(7700000 + i).padStart(8, "0")}`;
      for (const texto of ["oi", "1", `Rua Teste ${i + 10}`, "2", "1", "1", "2"]) { // menu, pedir, embarque, sem destino, confirmar, categoria, Pix
        const x = await pedir("bot: mensagem", "POST", "/api/bot/simular", { cookie, empresa: e, corpo: { telefone: tel, nome: `Bot ${i}`, texto } });
        if (!x.erro) res.bot++;
      }
    }),
    ...Array.from({ length: 10 }, async (_, i) => {
      const x = await pedir("totem: pedir", "POST", `/api/totem/publico/${e}/${loc.dados.local.id}/corridas`, { cabecalhos: { "X-Totem-Chave": chave }, corpo: { pedidoId: `carga-totem-${i}-${Date.now()}`, destino: { texto: `Rua Destino ${i}` }, categoria: "Carro", pagamento: "Pix", nome: `Totem ${i}`, telefone: `1696${String(5550000 + i)}` } });
      if (!x.erro) res.totem++;
      return chave;
    }),
    (async () => { const x = await pedir("crm: disparar", "POST", `/api/crm/campanhas/${camp.dados?.campanha?.id}/disparar`, { cookie, empresa: e, corpo: {} }); res.crm = x.dados?.naFila ?? 0; })(),
  ]);
  return res;
}

// ------------------------------------------------------------------ as N corridas

const aceitas = new Map(); // corridaId -> motorista que aceitou
const resultado = new Map(); // corridaId -> passageiro
const pedidas = [];
let fim = false;

// Motoristas: espera longa no estado; aceita a oferta e leva a corrida até o fim.
async function motoristaTrabalha(m) {
  const audio = Buffer.concat([Buffer.from("OggS"), Buffer.alloc(800)]);
  while (!fim) {
    const st = await pedir("motorista: estado", "GET", `/api/apps/${m.e}/estado`, { token: m.token });
    const of = st.dados?.oferta;
    if (!of) { await dormir(800 + Math.random() * 400); continue; }
    const ac = await pedir("motorista: aceitar", "POST", `/api/apps/${m.e}/ofertas/${of.id}/aceitar`, { token: m.token });
    if (ac.erro) continue;
    const id = ac.dados.corrida.id;
    if (aceitas.has(id)) anotar("conferência", 0, `corrida ${id} aceita por dois motoristas`);
    aceitas.set(id, m);
    await pedir("chat: texto", "POST", `/api/apps/${m.e}/corridas/${id}/chat`, { token: m.token, corpo: { texto: "Estou chegando" } });
    await pedir("chat: áudio", "POST", `/api/apps/${m.e}/corridas/${id}/audio`, { token: m.token, corpo: audio, cru: true, tipo: "audio/ogg" });
    for (const s of ["no_local", "em_andamento", "finalizada"]) await pedir(`status: ${s}`, "POST", `/api/apps/${m.e}/corridas/${id}/status`, { token: m.token, corpo: { status: s } });
  }
}

const memoria = [];
const relogioMem = setInterval(async () => {
  const x = await pedir("estatísticas", "GET", "/api/sessao", { cookie }).catch(() => null);
  memoria.push({ em: Date.now(), ok: !x?.erro });
}, 5000);

const trabalho = motoristas.map(motoristaTrabalha);
const extrasP = EXTRAS ? extras() : Promise.resolve(null);
t = performance.now();
await Promise.all(passageiros.map(async (p) => {
  const x = await pedir("passageiro: pedir corrida", "POST", `/api/apps/${p.e}/corridas`, { token: p.token, corpo: { pedidoId: `carga-${p.tel}`, embarque: { texto: `Rua ${p.nome}, 10`, ...perto() }, destino: { texto: `Avenida ${p.nome}, 20`, ...perto() }, categoria: "Carro", pagamento: "Pix" } });
  if (x.dados?.corrida) { pedidas.push({ id: x.dados.corrida.id, p }); resultado.set(x.dados.corrida.id, p); }
}));
const tempoPedidos = Math.round(performance.now() - t);
console.log(`${pedidas.length} de ${passageiros.length} corridas pedidas em ${tempoPedidos} ms. Esperando os motoristas...`);

// Passageiros: esperam a corrida terminar e dão a nota.
const limite = Date.now() + 10 * 60_000;
const avaliadas = new Set();
while (Date.now() < limite && avaliadas.size < pedidas.length) {
  await Promise.all(pedidas.filter((x) => !avaliadas.has(x.id)).map(async ({ id, p }) => {
    const c = await pedir("passageiro: ver corrida", "GET", `/api/apps/${p.e}/corridas/${id}`, { token: p.token });
    if (c.dados?.corrida?.status === "finalizada") {
      const a = await pedir("passageiro: avaliar", "POST", `/api/apps/${p.e}/corridas/${id}/avaliar`, { token: p.token, corpo: { nota: 5 } });
      if (!a.erro) avaliadas.add(id);
    }
  }));
  if (avaliadas.size < pedidas.length) await dormir(2000);
}
const tempoTotal = Math.round(performance.now() - t);
fim = true;
const extrasRes = await extrasP;
await Promise.all(trabalho);
clearInterval(relogioMem);

// ------------------------------------------------------------------ conferência

const problemas = [];
const doPainel = {};
for (const e of empresas) {
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const l = (await pedir("conferência", "GET", `/api/corridas?inicio=${hoje}&fim=${hoje}&origem=propria`, { cookie, empresa: e })).dados?.corridas ?? [];
  doPainel[e] = l;
}
for (const [ei, e] of empresas.entries()) {
  const l = doPainel[e].filter((c) => c.canal === "App");
  const minhas = pedidas.filter((x) => x.p.e === e);
  if (l.length !== minhas.length) problemas.push(`${e}: ${minhas.length} corridas pedidas pelo app, ${l.length} no painel`);
  const porTel = new Map();
  for (const c of l) porTel.set(c.telefonePassageiro, (porTel.get(c.telefonePassageiro) ?? 0) + 1);
  for (const [tel, n] of porTel) if (n > 1) problemas.push(`${e}: passageiro ${tel} com ${n} corridas (duplicada)`);
  const outro = prefixos[1 - ei];
  for (const c of doPainel[e]) {
    if (c.telefonePassageiro?.startsWith(`169${outro}`) || c.telefoneMotorista?.startsWith(`169${outro}`)) problemas.push(`${e}: corrida ${c.os} com telefone da outra empresa`);
  }
  for (const c of l) {
    if (c.grupo !== "finalizada") problemas.push(`${e}: corrida ${c.os} terminou em "${c.statusTexto}"`);
    if (c.avaliacao !== 5) problemas.push(`${e}: corrida ${c.os} sem a nota 5`);
  }
}
for (const { id, p } of pedidas) {
  const m = aceitas.get(id);
  if (!m) { problemas.push(`corrida ${id} (${p.nome}) nunca foi aceita`); continue; }
  if (m.e !== p.e) problemas.push(`corrida ${id}: motorista de outra empresa`);
  const c = doPainel[p.e].find((x) => x.id === `propria:${id}` || x.id.endsWith(id));
  if (c && c.motorista !== m.nome) problemas.push(`corrida ${id}: no painel o motorista é "${c.motorista}", mas quem aceitou foi "${m.nome}"`);
}
// Corridas por canal (bot e totem também viram corridas próprias, na empresa 1).
const porCanal = {};
for (const c of doPainel[empresas[0]]) porCanal[c.canal] = (porCanal[c.canal] ?? 0) + 1;
if (EXTRAS) {
  if ((porCanal.WhatsApp ?? porCanal.Bot ?? 0) < 50) problemas.push(`bot: esperava 50 corridas pelo WhatsApp, vieram ${porCanal.WhatsApp ?? porCanal.Bot ?? 0}`);
  if ((porCanal.Totem ?? 0) < 10) problemas.push(`totem: esperava 10 corridas, vieram ${porCanal.Totem ?? 0}`);
}
// Cada motorista só vê as próprias corridas.
for (const m of motoristas.slice(0, 40)) {
  const l = (await pedir("conferência", "GET", `/api/apps/${m.e}/corridas`, { token: m.token })).dados?.corridas ?? [];
  const deles = [...aceitas].filter(([, x]) => x === m).map(([id]) => id);
  for (const c of l) if (!deles.includes(c.id)) problemas.push(`motorista ${m.nome} vê a corrida ${c.os}, que não é dele`);
}
// Token de uma empresa não abre a outra.
// (o 401 aqui é o esperado: não conta como erro)
const cruz = await fetch(`${BASE}/api/apps/${empresas[1]}/estado`, { headers: { Authorization: `Bearer ${passageiros.find((p) => p.e === empresas[0]).token}` } });
if (cruz.status !== 401) problemas.push(`token da empresa 1 abriu a empresa 2 (HTTP ${cruz.status})`);

// ------------------------------------------------------------------ relatório

const ops = [...tempos].map(([op, l]) => ({ op, n: l.length, p50: pct(l, 50), p95: pct(l, 95), p99: pct(l, 99), max: pct(l, 100) })).sort((a, b) => b.n - a.n);
const totalErros = [...erros.values()].reduce((a, b) => a + b, 0);
const saida = {
  em: new Date().toISOString(), base: BASE, corridas: N, empresas, extras: extrasRes, porCanal,
  pedidas: pedidas.length, aceitas: aceitas.size, avaliadas: avaliadas.size, tempoPedidosMs: tempoPedidos, tempoTotalMs: tempoTotal,
  operacoes: ops, erros: Object.fromEntries(erros), totalErros, problemas,
};
const arq = path.join(os.tmpdir(), `carga-${Date.now()}.json`);
fs.writeFileSync(arq, JSON.stringify(saida, null, 2));
console.log(`\nPedidas ${pedidas.length}, aceitas ${aceitas.size}, avaliadas ${avaliadas.size}. Pedidos em ${tempoPedidos} ms; tudo em ${Math.round(tempoTotal / 1000)} s.`);
console.log("operação                         qtd    p50    p95    p99    máx (ms)");
for (const o of ops) console.log(`${o.op.padEnd(32)} ${String(o.n).padStart(5)} ${String(o.p50).padStart(6)} ${String(o.p95).padStart(6)} ${String(o.p99).padStart(6)} ${String(o.max).padStart(6)}`);
console.log(`\nErros: ${totalErros}`);
for (const [k, v] of [...erros].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${v}× ${k}`);
console.log(`Problemas na conferência: ${problemas.length}`);
for (const p of problemas.slice(0, 30)) console.log(`  - ${p}`);
console.log(`Corridas por canal (empresa 1): ${JSON.stringify(porCanal)}`);
if (extrasRes) console.log(`Extras: ${extrasRes.bot} mensagens do bot, ${extrasRes.totem} pedidos do totem, ${extrasRes.crm} mensagens do CRM na fila.`);
console.log(`Resultado completo: ${arq}`);
process.exit(problemas.length || totalErros ? 2 : 0);
