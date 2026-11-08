// Rotas dos apps do passageiro e do motorista: /api/apps/<empresa>/...
// Registrar ANTES do app.use("/api", exigirLogin) do index.ts (os apps têm login próprio, pelo telefone):
//
//   import { rotasApps, rotasAppsCentral } from "../apps/rotas.ts";
//   import { iniciarApps } from "../apps/despacho.ts";
//   app.use("/api/apps", rotasApps);                 // antes do exigirLogin
//   app.use("/api/apps-central", rotasAppsCentral);  // depois do exigirLogin (painel)
//   iniciarApps();                                   // junto do setInterval de encerrarSemMotorista
//
// Login: POST /entrar/codigo e POST /entrar devolvem um token. Depois, cabeçalho Authorization: Bearer <token>.
// A empresa vem da URL, mas o token só vale para a empresa em que foi criado: um app nunca vê outra empresa.
// Corridas: só aparecem para o passageiro dono e para o motorista atribuído.
// Tempo real: GET /eventos (SSE, lido com fetch para poder mandar o cabeçalho Authorization).
// CORS aberto (o app Android roda em https://localhost): não há cookie, só o token.

import express, { type NextFunction, type Request, type Response } from "express";
import fs from "node:fs";
import { cadastroPorId } from "../comum/cadastros.ts";
import { listar } from "../cadastros/armazem.ts";
import { avaliar, cancelarCorrida, criarCorridaPropria, distanciaEstimada, estimarPreco, listarProprias, mudarStatus, type CorridaPropria } from "../corridas/index.ts";
import { buscarEndereco, enderecoDoPonto, rota } from "../enderecos/index.ts";
import * as D from "../servidor/dados.ts";
import { exigirPapel } from "../servidor/sessao.ts";
import { num, txt } from "./armazem.ts";
import { arquivoDoAudio, enviarAudio, enviarTexto, maxAudioBytes, mensagens } from "./chat.ts";
import * as P from "./despacho.ts";
import { aguardar, emitir, ouvir, type Alvo } from "./eventos.ts";
import { avisar, pushLigado, registrarToken } from "./push.ts";
import { entrar, eu, pedirCodigo, sair, salvarNomePassageiro, sessaoDoToken, PAPEIS, type PapelApp, type SessaoApp } from "./sessoes.ts";

export const rotasApps = express.Router();
export const rotasAppsCentral = express.Router();

declare module "express-serve-static-core" { interface Request { app_?: { empresaId: string; sessao: SessaoApp; token: string } } }

type Fn = (req: Request, res: Response) => unknown;
const ok = (fn: Fn) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!res.headersSent) res.status((e as { status?: number }).status ?? 400).json({ erro: msg });
  }
};

const PAGAMENTOS = ["Dinheiro", "Pix", "Cartão na maquininha"];
const ANTES_DE_COMECAR = new Set(["procurando", "a_caminho", "no_local"]);

// ------------------------------------------------------------------ CORS e empresa

rotasApps.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Segundos");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Max-Age", "600");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

function empresaAtiva(req: Request, res: Response, next: NextFunction) {
  const id = req.params.empresa;
  const e = D.idValido(id) ? D.empresa(id) : null;
  if (!e || !e.ativa) return res.status(404).json({ erro: "Empresa não encontrada." });
  next();
}

function exigirApp(req: Request, res: Response, next: NextFunction) {
  const token = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "").trim();
  const s = sessaoDoToken(req.params.empresa, token);
  if (!s) return res.status(401).json({ erro: "Entre de novo." });
  req.app_ = { empresaId: req.params.empresa, sessao: s, token };
  next();
}
const so = (papel: PapelApp) => (req: Request, res: Response, next: NextFunction) =>
  req.app_?.sessao.papel === papel ? next() : res.status(403).json({ erro: "Esta função é do outro app." });

const ctx = (req: Request) => req.app_!;
const alvo = (req: Request): Alvo => ({ papel: ctx(req).sessao.papel, chave: ctx(req).sessao.chave });
const nomeDe = (req: Request) => String(eu(ctx(req).empresaId, ctx(req).sessao).nome || (ctx(req).sessao.papel === "motorista" ? "Motorista" : "Passageiro"));

const r = express.Router({ mergeParams: true });
rotasApps.use("/:empresa", empresaAtiva, r);

// ------------------------------------------------------------------ público: marca e login

r.get("/marca", ok((req, res) => {
  const id = req.params.empresa, m = D.marca(id);
  const arq = (n: string) => (n ? `/api/publico/arquivo/${id}/${n}` : null);
  res.json({
    empresaId: id, nome: m.app.nome || m.nomeExibido, nomeExibido: m.nomeExibido, cores: m.cores, fonte: m.fonte, tema: m.tema,
    logoClaro: arq(m.arquivos.logoClaro), logoEscuro: arq(m.arquivos.logoEscuro), icone: arq(m.arquivos.iconeApp || m.arquivos.favicon),
    suporte: { email: m.textos.suporteEmail, telefone: m.textos.suporteTelefone }, push: pushLigado(id),
  });
}));

r.post("/entrar/codigo", ok(async (req, res) => {
  const papel = req.body?.papel as PapelApp;
  if (!PAPEIS.includes(papel)) throw new Error("App inválido.");
  res.json(await pedirCodigo(req.params.empresa, papel, String(req.body?.telefone ?? ""), req.ip ?? ""));
}));

r.post("/entrar", ok((req, res) => {
  const papel = req.body?.papel as PapelApp;
  if (!PAPEIS.includes(papel)) throw new Error("App inválido.");
  const { token, sessao } = entrar(req.params.empresa, papel, String(req.body?.telefone ?? ""), String(req.body?.codigo ?? ""));
  res.json({ token, eu: eu(req.params.empresa, sessao) });
}));

// ------------------------------------------------------------------ com token

r.use(exigirApp);

r.post("/sair", ok((req, res) => {
  if (ctx(req).sessao.papel === "motorista") P.ficarOffline(ctx(req).empresaId, ctx(req).sessao.chave);
  sair(ctx(req).empresaId, ctx(req).token);
  res.json({ ok: true });
}));

r.get("/eu", ok((req, res) => {
  const { empresaId, sessao } = ctx(req);
  res.json({ eu: eu(empresaId, sessao), online: sessao.papel === "motorista" ? P.estaOnline(empresaId, sessao.chave) : undefined });
}));
r.post("/eu", so("passageiro"), ok((req, res) => res.json({ eu: salvarNomePassageiro(ctx(req).empresaId, ctx(req).sessao, String(req.body?.nome ?? "")) })));

r.post("/push", ok((req, res) => { registrarToken(ctx(req).empresaId, alvo(req), String(req.body?.token ?? "")); res.json({ ok: true }); }));

// Estado de agora (o app chama ao abrir e quando o tempo real volta).
r.get("/estado", ok((req, res) => {
  const { empresaId, sessao } = ctx(req);
  const c = P.corridaAtual(empresaId, sessao.papel, sessao.chave);
  const o = sessao.papel === "motorista" ? P.ofertaDoMotorista(empresaId, sessao.chave) : null;
  res.json({
    corrida: c ? P.corridaParaApp(empresaId, c, sessao.papel) : null,
    oferta: o ? P.ofertaParaApp(empresaId, o) : null,
    online: sessao.papel === "motorista" ? P.estaOnline(empresaId, sessao.chave) : undefined,
    posicaoMotorista: c?.motoristaId && sessao.papel === "passageiro" && c.status !== "procurando" ? P.posicaoDoMotorista(empresaId, c.motoristaId) : null,
  });
}));

// Tempo real (SSE). Um comentário a cada 20 s mantém a conexão viva.
r.get("/eventos", (req, res) => {
  const { empresaId } = ctx(req);
  // "text/event-stream" sem charset e sem "Connection": proxies e túneis (HTTP/2) só repassam o fluxo na hora assim.
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" });
  res.flushHeaders();
  res.write("retry: 3000\n\n");
  const enviar = (tipo: string, dados: unknown) => { res.write(`event: ${tipo}\ndata: ${JSON.stringify(dados)}\n\n`); };
  const parar = ouvir(empresaId, alvo(req), enviar);
  enviar("ola", { em: Date.now() });
  try { P.vigiar(empresaId); } catch { /* sem corridas ainda */ }
  const vivo = setInterval(() => res.write(": vivo\n\n"), 20_000);
  req.on("close", () => { clearInterval(vivo); parar(); });
});

// Espera longa (quando o SSE não passa pela rede): responde com os eventos depois de "desde", ou espera até 25 s.
r.get("/eventos/espera", ok(async (req, res) => {
  const { empresaId } = ctx(req);
  const desde = Number(req.query.desde);
  if (!Number.isFinite(desde)) throw new Error("Informe desde.");
  if (desde < 0) { try { P.vigiar(empresaId); } catch { /* sem corridas ainda */ } }
  const fechou = new Promise<void>((ok) => req.on("close", () => ok()));
  const r2 = await aguardar(empresaId, alvo(req), desde, 25_000, fechou);
  if (!res.headersSent && !res.writableEnded) res.json({ seq: r2.seq, eventos: r2.eventos.map((e) => ({ seq: e.seq, tipo: e.tipo, dados: e.dados })) });
}));

// ------------------------------------------------------------------ endereços e preço

r.get("/opcoes", ok((req, res) => {
  const empresaId = ctx(req).empresaId;
  const categorias = listar(empresaId, cadastroPorId("categorias")!)
    .filter((c) => c.ativa !== false && String(c.nome ?? "").trim())
    .map((c) => ({ nome: String(c.nome), descricao: String(c.descricao ?? ""), aPartirDe: estimarPreco(empresaId, { categoria: String(c.nome), distanciaKm: null }).valor }));
  res.json({ categorias, pagamentos: PAGAMENTOS });
}));

r.get("/enderecos", ok((req, res) => res.json(buscarEndereco(ctx(req).empresaId, txt(req.query.q, 120), 8))));
r.get("/enderecos/ponto", ok((req, res) => {
  const lat = num(req.query.lat), lng = num(req.query.lng);
  if (lat == null || lng == null) throw new Error("Posição inválida.");
  res.json({ endereco: enderecoDoPonto(ctx(req).empresaId, lat, lng) });
}));

r.get("/estimativa", ok(async (req, res) => {
  const q = req.query;
  const a = { lat: num(q.latEmbarque), lng: num(q.lngEmbarque) }, b = { lat: num(q.latDestino), lng: num(q.lngDestino) };
  let km: number | null = null, minutos: number | null = null;
  if (a.lat != null && a.lng != null && b.lat != null && b.lng != null) {
    const rr = await rota({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng });
    km = rr.distanciaKm; minutos = rr.minutos;
  }
  km ??= distanciaEstimada({ texto: "", ...a } as never, { texto: "", ...b } as never);
  res.json(estimarPreco(ctx(req).empresaId, { categoria: txt(q.categoria, 60), distanciaKm: km, minutos }));
}));

// ------------------------------------------------------------------ corridas

const ponto = (v: unknown) => {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const lat = num(o.lat), lng = num(o.lng);
  return { texto: txt(o.texto, 200), ...(lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : {}) };
};

/** Toque duplo ou rede que caiu: o mesmo pedidoId devolve a mesma corrida. */
const pedidos = new Map<string, { em: number; p: Promise<CorridaPropria> }>();
function umaVez(chave: string, fn: () => Promise<CorridaPropria>) {
  const agora = Date.now();
  for (const [k, v] of pedidos) if (agora - v.em > 15 * 60_000) pedidos.delete(k);
  const ja = pedidos.get(chave);
  if (ja) return ja.p;
  const p = fn().catch((e) => { pedidos.delete(chave); throw e; });
  pedidos.set(chave, { em: agora, p });
  return p;
}

r.post("/corridas", so("passageiro"), ok(async (req, res) => {
  const { empresaId, sessao } = ctx(req);
  const b = req.body ?? {};
  const nome = String(eu(empresaId, sessao).nome ?? "");
  if (!nome) throw new Error("Informe seu nome antes de pedir.");
  const pedidoId = typeof b.pedidoId === "string" && /^[\w-]{8,64}$/.test(b.pedidoId) ? b.pedidoId : `${Date.now()}`;
  const c = await umaVez(`${empresaId}:${sessao.telefone}:${pedidoId}`, () => criarCorridaPropria(empresaId, {
    passageiro: { nome, telefone: sessao.telefone }, embarque: ponto(b.embarque), destino: b.destino ? ponto(b.destino) : undefined,
    categoria: txt(b.categoria, 60), pagamento: PAGAMENTOS.includes(b.pagamento) ? b.pagamento : "", canal: "app",
    observacao: txt(b.observacao, 300), cupom: txt(b.cupom, 30),
  }, "app do passageiro"));
  P.despachar(empresaId);
  res.json({ corrida: P.corridaParaApp(empresaId, c, "passageiro") });
}));

r.get("/corridas", ok((req, res) => {
  const { empresaId, sessao } = ctx(req);
  const l = listarProprias(empresaId).filter((c) => P.participa(c, sessao.papel, sessao.chave)).slice(-50).reverse();
  res.json({ corridas: l.map((c) => P.corridaParaApp(empresaId, c, sessao.papel)) });
}));

r.get("/corridas/:id", ok((req, res) => {
  const { empresaId, sessao } = ctx(req);
  res.json({ corrida: P.corridaParaApp(empresaId, P.corridaDoApp(empresaId, req.params.id, sessao.papel, sessao.chave), sessao.papel) });
}));

r.post("/corridas/:id/cancelar", ok(async (req, res) => {
  const { empresaId, sessao } = ctx(req);
  const c = P.corridaDoApp(empresaId, req.params.id, sessao.papel, sessao.chave);
  const motivo = txt(req.body?.motivo, 200);
  let feita: CorridaPropria;
  if (sessao.papel === "passageiro") {
    if (!ANTES_DE_COMECAR.has(c.status)) throw new Error("Não dá para cancelar uma viagem em andamento. Fale com o motorista.");
    feita = await cancelarCorrida(empresaId, c.id, "Passageiro", motivo || "Cancelada pelo app", "app do passageiro");
  } else if (c.status === "a_caminho") {
    feita = await P.desistir(empresaId, sessao.chave, c.id);
  } else {
    feita = await cancelarCorrida(empresaId, c.id, "Motorista", motivo || "Cancelada pelo motorista", "app do motorista");
  }
  P.vigiar(empresaId);
  res.json({ corrida: P.corridaParaApp(empresaId, feita, sessao.papel) });
}));

r.post("/corridas/:id/avaliar", so("passageiro"), ok(async (req, res) => {
  const { empresaId, sessao } = ctx(req);
  const c = P.corridaDoApp(empresaId, req.params.id, sessao.papel, sessao.chave);
  const feita = await avaliar(empresaId, c.id, Number(req.body?.nota), "app do passageiro");
  res.json({ corrida: P.corridaParaApp(empresaId, feita, "passageiro") });
}));

const STATUS_DO_MOTORISTA = new Set(["no_local", "em_andamento", "finalizada"]);
r.post("/corridas/:id/status", so("motorista"), ok(async (req, res) => {
  const { empresaId, sessao } = ctx(req);
  const c = P.corridaDoApp(empresaId, req.params.id, "motorista", sessao.chave);
  const novo = String(req.body?.status ?? "");
  if (!STATUS_DO_MOTORISTA.has(novo)) throw new Error("Status inválido.");
  const valor = num(req.body?.valor);
  if (valor != null && (valor < 0 || valor > 10_000)) throw new Error("Valor inválido.");
  const feita = await mudarStatus(empresaId, c.id, novo as never, { valor }, "app do motorista");
  P.vigiar(empresaId);
  res.json({ corrida: P.corridaParaApp(empresaId, feita, "motorista") });
}));

r.post("/corridas/:id/sos", ok((req, res) => {
  const { empresaId, sessao } = ctx(req);
  const c = P.corridaDoApp(empresaId, req.params.id, sessao.papel, sessao.chave);
  res.json({ alerta: P.registrarSos(empresaId, c, sessao.papel, num(req.body?.lat), num(req.body?.lng)) });
}));

// ------------------------------------------------------------------ chat

/** Quem está do outro lado do chat. */
function outro(c: CorridaPropria, papel: PapelApp): Alvo | null {
  if (papel === "passageiro") return c.motoristaId ? { papel: "motorista", chave: c.motoristaId } : null;
  return { papel: "passageiro", chave: c.passageiro.telefone };
}
const chatAberto = (c: CorridaPropria) => {
  if (!c.motoristaId || !["a_caminho", "no_local", "em_andamento"].includes(c.status)) throw new Error("O chat abre quando o motorista aceita e fecha quando a corrida termina.");
};

r.get("/corridas/:id/chat", ok((req, res) => {
  const { empresaId, sessao } = ctx(req);
  const c = P.corridaDoApp(empresaId, req.params.id, sessao.papel, sessao.chave);
  res.json({ mensagens: mensagens(empresaId, c.id), aberto: !!c.motoristaId && ["a_caminho", "no_local", "em_andamento"].includes(c.status) });
}));

function aposMensagem(req: Request, c: CorridaPropria, m: ReturnType<typeof enviarTexto>) {
  const { empresaId, sessao } = ctx(req);
  const dados = { corridaId: c.id, mensagem: m };
  emitir(empresaId, alvo(req), "chat", dados);
  const o = outro(c, sessao.papel);
  if (o) {
    emitir(empresaId, o, "chat", dados);
    void avisar(empresaId, o, { titulo: m.nome, texto: m.texto ?? "Mensagem de áudio", dados: { tipo: "chat", corridaId: c.id }, canal: "chat" });
  }
}

r.post("/corridas/:id/chat", ok((req, res) => {
  const { empresaId, sessao } = ctx(req);
  const c = P.corridaDoApp(empresaId, req.params.id, sessao.papel, sessao.chave);
  chatAberto(c);
  const m = enviarTexto(empresaId, c.id, sessao.papel, nomeDe(req), String(req.body?.texto ?? ""));
  aposMensagem(req, c, m);
  res.json({ mensagem: m });
}));

// Áudio: corpo cru com o Content-Type do áudio (ex.: audio/webm). Duração opcional no cabeçalho X-Segundos.
r.post("/corridas/:id/audio", (req, res, next) => {
  const max = maxAudioBytes();
  if (Number(req.headers["content-length"] ?? 0) > max) return res.status(413).json({ erro: `Áudio grande demais (máximo ${Math.round(max / 1024)} KB).` });
  express.raw({ type: () => true, limit: max })(req, res, (err?: unknown) => {
    if (err) return res.status(413).json({ erro: `Áudio grande demais (máximo ${Math.round(max / 1024)} KB).` });
    next();
  });
}, ok((req, res) => {
  const { empresaId, sessao } = ctx(req);
  const c = P.corridaDoApp(empresaId, req.params.id, sessao.papel, sessao.chave);
  chatAberto(c);
  const corpo = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const m = enviarAudio(empresaId, c.id, sessao.papel, nomeDe(req), String(req.headers["content-type"] ?? ""), corpo, num(req.headers["x-segundos"]));
  aposMensagem(req, c, m);
  res.json({ mensagem: m });
}));

r.get("/corridas/:id/audio/:audio", ok((req, res) => {
  const { empresaId, sessao } = ctx(req);
  const c = P.corridaDoApp(empresaId, req.params.id, sessao.papel, sessao.chave);
  const a = arquivoDoAudio(empresaId, c.id, req.params.audio);
  if (!a) return res.status(404).json({ erro: "Áudio não encontrado." });
  res.setHeader("Content-Type", a.mime);
  res.setHeader("Cache-Control", "private, max-age=86400");
  res.setHeader("X-Content-Type-Options", "nosniff");
  fs.createReadStream(a.caminho).pipe(res);
}));

// ------------------------------------------------------------------ motorista

const posicao = (req: Request) => {
  const lat = num(req.body?.lat), lng = num(req.body?.lng);
  if (lat == null || lng == null) throw new Error("Posição inválida. Ligue o GPS.");
  return { lat, lng };
};

r.post("/online", so("motorista"), ok((req, res) => {
  const p = posicao(req);
  P.ficarOnline(ctx(req).empresaId, ctx(req).sessao.chave, p.lat, p.lng);
  res.json({ online: true });
}));
r.post("/offline", so("motorista"), ok((req, res) => { P.ficarOffline(ctx(req).empresaId, ctx(req).sessao.chave); res.json({ online: false }); }));
r.post("/posicao", so("motorista"), ok((req, res) => {
  const p = posicao(req);
  P.atualizarPosicao(ctx(req).empresaId, ctx(req).sessao.chave, p.lat, p.lng);
  res.json({ ok: true });
}));

r.post("/ofertas/:id/aceitar", so("motorista"), ok(async (req, res) => {
  const c = await P.aceitar(ctx(req).empresaId, ctx(req).sessao.chave, req.params.id);
  res.json({ corrida: P.corridaParaApp(ctx(req).empresaId, c, "motorista") });
}));
r.post("/ofertas/:id/recusar", so("motorista"), ok((req, res) => { P.recusar(ctx(req).empresaId, ctx(req).sessao.chave, req.params.id); res.json({ ok: true }); }));

r.get("/ganhos", so("motorista"), ok((req, res) => res.json(P.ganhos(ctx(req).empresaId, ctx(req).sessao.chave))));

r.use((_req, res) => res.status(404).json({ erro: "Caminho não encontrado." }));

// ------------------------------------------------------------------ central (painel, com login do painel)

rotasAppsCentral.get("/motoristas", ok((req, res) => res.json({ motoristas: P.motoristasOnline(req.ctx!.empresaId) })));
rotasAppsCentral.get("/alertas", ok((req, res) => res.json({ alertas: P.alertas(req.ctx!.empresaId).slice(-200).reverse() })));
rotasAppsCentral.post("/alertas/:id/resolver", exigirPapel("admin", "operador"), ok((req, res) => res.json({ alerta: P.resolverAlerta(req.ctx!.empresaId, req.params.id, req.ctx!.usuario.email) })));


