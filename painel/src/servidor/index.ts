// Servidor do painel (SaaS multiempresa). Chaves e credenciais ficam só aqui; o navegador nunca recebe nenhuma.

import express, { type Request, type Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { GRUPO_TEXTO, type Filtro, type GrupoStatus } from "../comum/corrida.ts";
import { sanearMarca, TIPOS_ARQUIVO, type TipoArquivo } from "../comum/marca.ts";
import { situacaoIa, VARIAVEL_CHAVE } from "../ia/roteador.ts";
import { analisarComIa, responderPergunta } from "../analise/analise.ts";
import { calcular } from "../analise/estatisticas.ts";
import { planoHtml, relatorioHtml } from "../analise/html.ts";
import * as D from "./dados.ts";
import { opcoesDoFiltro } from "./filtro.ts";
import { corridasDoCsv } from "./fontes/arquivo.ts";
import { buscarCorridas, limparCachePlanilhas } from "./fontes/index.ts";
import { CAMPOS, pendenciasDoMotor, type TipoMotor } from "./fontes/motor.ts";
import { apagarCookie, criarCookie, exigirLogin, exigirPapel, podeTentar } from "./sessao.ts";
import { rotasCadastros } from "../cadastros/rotas.ts";
import { rotasCorridasProprias } from "../corridas/rotas.ts";
import { encerrarSemMotorista } from "../corridas/index.ts";

if (fs.existsSync(".env")) process.loadEnvFile(".env");

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

const ok = (fn: (req: Request, res: Response) => unknown) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e) {
    console.error("[api]", req.method, req.path, e instanceof Error ? e.message : e);
    if (!res.headersSent) res.status(400).json({ erro: e instanceof Error ? e.message : "Erro." });
  }
};
const ctx = (req: Request) => req.ctx!;

// ------------------------------------------------------------------ filtro

const GRUPOS: GrupoStatus[] = ["finalizada", "cancelada", "nao_atendida", "aberta"];
function lerFiltro(o: Record<string, unknown>): Filtro {
  const t = (k: string) => (o[k] == null || o[k] === "" ? undefined : String(o[k]).trim().slice(0, 120));
  const h = Number(o.ultimasHoras);
  return {
    inicio: t("inicio"), fim: t("fim"), ultimasHoras: h > 0 && h <= 24 * 92 ? h : undefined, os: t("os"), busca: t("busca"),
    grupo: GRUPOS.includes(o.grupo as GrupoStatus) ? (o.grupo as GrupoStatus) : undefined,
    cidade: t("cidade"), categoria: t("categoria"), pagamento: t("pagamento"), canal: t("canal"), origem: t("origem"),
    programada: o.programada === true || o.programada === "true" || o.programada === "1",
  };
}
const filtroDe = (req: Request) => lerFiltro({ ...(req.query as Record<string, unknown>), ...((req.body?.filtro ?? {}) as Record<string, unknown>) });

function textoDoFiltro(f: Filtro): string {
  const p: string[] = [];
  if (f.ultimasHoras) p.push(`últimas ${f.ultimasHoras < 1 ? `${f.ultimasHoras * 60} min` : `${f.ultimasHoras} h`}`);
  else if (f.inicio) p.push(f.inicio === (f.fim ?? f.inicio) ? f.inicio.split("-").reverse().join("/") : `${f.inicio.split("-").reverse().join("/")} a ${(f.fim ?? "").split("-").reverse().join("/")}`);
  if (f.grupo) p.push(GRUPO_TEXTO[f.grupo]);
  for (const k of ["cidade", "categoria", "pagamento", "canal", "os", "busca"] as const) if (f[k]) p.push(`${k}: ${f[k]}`);
  if (f.programada) p.push("só programadas");
  return p.join(" · ") || "últimas 24 h";
}

// ------------------------------------------------------------------ público (antes do login)

function empresaPublica(req: Request) {
  const doDominio = D.empresaDoDominio(req.headers.host);
  if (doDominio) return doDominio;
  const pedida = String(req.query.empresa ?? "");
  return D.idValido(pedida) ? D.empresa(pedida) : null;
}

app.get("/api/publico/marca", ok((req, res) => {
  const e = empresaPublica(req);
  res.json({ empresaId: e?.id ?? null, marca: e ? D.marca(e.id) : sanearMarca({}), precisaConfigurar: D.listarUsuarios().length === 0 });
}));

app.get("/api/publico/arquivo/:empresa/:nome", ok((req, res) => {
  const a = D.idValido(req.params.empresa) ? D.caminhoImagem(req.params.empresa, req.params.nome) : null;
  if (!a) return res.status(404).end();
  res.setHeader("Content-Type", a.mime);
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.send(fs.readFileSync(a.arquivo));
}));

/** PWA: manifest com a marca da empresa (pelo domínio ou ?empresa=). */
app.get("/manifest.webmanifest", ok((req, res) => {
  const e = empresaPublica(req);
  const m = e ? D.marca(e.id) : sanearMarca({});
  const icone = e && m.arquivos.iconeApp ? `/api/publico/arquivo/${e.id}/${m.arquivos.iconeApp}` : null;
  res.type("application/manifest+json").json({
    name: m.produto, short_name: m.app.nome || m.produto, start_url: "/", display: "standalone",
    background_color: m.cores.fundo, theme_color: m.cores.primaria, lang: "pt-BR",
    icons: icone ? [{ src: icone, sizes: "512x512", purpose: "any maskable" }] : [],
  });
}));

app.post("/api/configurar", ok((req, res) => {
  if (D.listarUsuarios().length) return res.status(409).json({ erro: "O painel já foi configurado." });
  const b = req.body ?? {};
  const nomeEmpresa = String(b.empresa ?? "").trim();
  if (nomeEmpresa.length < 2) return res.status(400).json({ erro: "Informe o nome da empresa." });
  const e = D.criarEmpresa(nomeEmpresa);
  const u = D.criarUsuario({ email: String(b.email ?? ""), nome: String(b.nome ?? ""), senha: String(b.senha ?? ""), empresaId: e.id, papel: "plataforma" });
  criarCookie(res, req, u.id);
  res.json({ ok: true });
}));

app.post("/api/entrar", ok((req, res) => {
  if (!podeTentar(req.ip ?? "")) return res.status(429).json({ erro: "Muitas tentativas. Espere alguns minutos." });
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const u = D.listarUsuarios().find((x) => x.email === email);
  if (!u || !D.senhaConfere(String(req.body?.senha ?? ""), u.hash)) return res.status(401).json({ erro: "E-mail ou senha errados." });
  criarCookie(res, req, u.id);
  res.json({ ok: true });
}));

app.post("/api/sair", (_req, res) => { apagarCookie(res); res.json({ ok: true }); });

// ------------------------------------------------------------------ com login

app.use("/api", exigirLogin);
const admin = exigirPapel("admin");

app.get("/api/sessao", ok((req, res) => {
  const { usuario, empresaId } = ctx(req);
  res.json({
    usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, papel: usuario.papel },
    empresa: D.empresa(empresaId), marca: D.marca(empresaId),
    empresas: usuario.papel === "plataforma" ? D.listarEmpresas() : undefined,
  });
}));

app.get("/api/corridas", ok(async (req, res) => {
  const r = await buscarCorridas(ctx(req).empresaId, filtroDe(req));
  const c = r.corridas;
  const fin = c.filter((x) => x.grupo === "finalizada");
  const fat = Math.round(fin.reduce((a, x) => a + (x.valor ?? 0), 0) * 100) / 100;
  const MAX = 2000;
  res.json({
    total: c.length, avisos: r.avisos, opcoes: opcoesDoFiltro(c), cortado: c.length > MAX, corridas: c.slice(0, MAX),
    resumo: { total: c.length, finalizadas: fin.length, canceladas: c.filter((x) => x.grupo === "cancelada").length, naoAtendidas: c.filter((x) => x.grupo === "nao_atendida").length, emAndamento: c.filter((x) => x.grupo === "aberta").length, faturamento: fat, ticketMedio: fin.length ? Math.round((fat / fin.length) * 100) / 100 : 0 },
  });
}));

app.get("/api/estatisticas", ok(async (req, res) => {
  const r = await buscarCorridas(ctx(req).empresaId, filtroDe(req));
  res.json({ avisos: r.avisos, stats: calcular(r.corridas) });
}));

app.get("/api/motoristas", ok(async (req, res) => {
  const r = await buscarCorridas(ctx(req).empresaId, filtroDe(req));
  const m = new Map<string, { nome: string; corridas: number; finalizadas: number; canceladas: number; faturamento: number; km: number; notas: number[]; ultima: string }>();
  for (const c of r.corridas) {
    if (!c.motorista) continue;
    const x = m.get(c.motorista) ?? { nome: c.motorista, corridas: 0, finalizadas: 0, canceladas: 0, faturamento: 0, km: 0, notas: [], ultima: "" };
    x.corridas++;
    if (c.grupo === "finalizada") { x.finalizadas++; x.faturamento += c.valor ?? 0; x.km += c.distanciaRealKm ?? c.distanciaKm ?? 0; }
    if (c.grupo === "cancelada") x.canceladas++;
    if (c.avaliacao != null) x.notas.push(c.avaliacao);
    if ((c.solicitadaEm ?? "") > x.ultima) x.ultima = c.solicitadaEm ?? "";
    m.set(c.motorista, x);
  }
  const arr = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
  res.json({
    avisos: r.avisos,
    motoristas: [...m.values()].map((x) => ({ nome: x.nome, corridas: x.corridas, finalizadas: x.finalizadas, canceladas: x.canceladas, taxaCancelamento: x.corridas ? arr((x.canceladas / x.corridas) * 100, 1) : 0, faturamento: arr(x.faturamento), km: arr(x.km, 1), nota: x.notas.length ? arr(x.notas.reduce((a, b) => a + b, 0) / x.notas.length) : null, ultima: x.ultima || null }))
      .sort((a, b) => b.finalizadas - a.finalizadas || b.corridas - a.corridas),
  });
}));

function logoDataUri(empresaId: string, nome: string): string | null {
  const a = nome ? D.caminhoImagem(empresaId, nome) : null;
  return a ? `data:${a.mime};base64,${fs.readFileSync(a.arquivo).toString("base64")}` : null;
}

/** Exportar relatório: a consulta da tela vai sozinha para a IA; o relatório já sai com a análise. */
app.post("/api/relatorio", ok(async (req, res) => {
  const { empresaId } = ctx(req);
  const f = filtroDe(req);
  const r = await buscarCorridas(empresaId, f);
  if (!r.corridas.length) return res.status(400).json({ erro: "A consulta não tem corridas. Mude o filtro e tente de novo." });
  const m = D.marca(empresaId);
  const e = calcular(r.corridas);
  const a = await analisarComIa(e, m, D.segredos(empresaId).ia);
  const meta = { marca: m, logo: logoDataUri(empresaId, m.arquivos.logoClaro), geradoEm: new Date(), filtroTexto: textoDoFiltro(f) };
  res.json({
    html: relatorioHtml(e, a, meta), planoHtml: a.plano ? planoHtml(e, a.plano, meta) : null,
    aviso: [...r.avisos, a.aviso].filter(Boolean).join(" ") || null, modelos: a.modelos, total: e.total, comIa: !!a.textos,
  });
}));

app.post("/api/perguntar", ok(async (req, res) => {
  const { empresaId } = ctx(req);
  const pergunta = String(req.body?.pergunta ?? "").trim();
  if (!pergunta) return res.status(400).json({ erro: "Escreva a pergunta." });
  const r = await buscarCorridas(empresaId, filtroDe(req));
  if (!r.corridas.length) return res.status(400).json({ erro: "A consulta não tem corridas para analisar." });
  const out = await responderPergunta(calcular(r.corridas), D.marca(empresaId), pergunta, D.segredos(empresaId).ia);
  res.status("erro" in out ? 502 : 200).json(out);
}));

// ------------------------------------------------------------------ marca

app.get("/api/marca", ok((req, res) => res.json({ marca: D.marca(ctx(req).empresaId), empresaId: ctx(req).empresaId })));

app.put("/api/marca", admin, ok((req, res) => {
  const id = ctx(req).empresaId;
  const atual = D.marca(id);
  const nova = sanearMarca({ ...req.body, arquivos: atual.arquivos }, atual); // arquivos só mudam pelo envio
  D.salvarMarca(id, nova);
  res.json({ marca: nova });
}));

app.post("/api/marca/arquivo", admin, express.raw({ type: "image/*", limit: D.MAX_IMAGEM }), ok((req, res) => {
  const id = ctx(req).empresaId;
  const tipo = String(req.query.tipo ?? "") as TipoArquivo;
  if (!TIPOS_ARQUIVO.includes(tipo)) return res.status(400).json({ erro: "Tipo de imagem inválido." });
  const bytes = req.body instanceof Buffer ? new Uint8Array(req.body) : new Uint8Array();
  if (!bytes.length) return res.status(400).json({ erro: "Arquivo vazio." });
  const nome = D.salvarImagem(id, tipo, String(req.headers["content-type"] ?? "").split(";")[0], bytes);
  const m = D.marca(id);
  m.arquivos[tipo] = nome;
  D.salvarMarca(id, m);
  res.json({ marca: m });
}));

app.delete("/api/marca/arquivo", admin, ok((req, res) => {
  const id = ctx(req).empresaId;
  const tipo = String(req.query.tipo ?? "") as TipoArquivo;
  if (!TIPOS_ARQUIVO.includes(tipo)) return res.status(400).json({ erro: "Tipo inválido." });
  const m = D.marca(id);
  m.arquivos[tipo] = "";
  D.salvarMarca(id, m);
  res.json({ marca: m });
}));

/** brand.json para gerar o app (scripts/build-app-empresa). */
app.get("/api/marca/brand.json", admin, ok((req, res) => {
  res.setHeader("Content-Disposition", `attachment; filename="brand-${ctx(req).empresaId}.json"`);
  res.json(D.marca(ctx(req).empresaId));
}));

// ------------------------------------------------------------------ integrações

const TIPOS: D.TipoIntegracao[] = ["sistema-a", "sistema-b", "arquivo", "exemplo"];
const NOME_TIPO: Record<D.TipoIntegracao, string> = { "sistema-a": "Sistema A (integração por API)", "sistema-b": "Sistema B (integração pelo painel web)", arquivo: "Planilha CSV", exemplo: "Dados de exemplo" };

app.get("/api/integracoes", admin, ok(async (req, res) => {
  const id = ctx(req).empresaId;
  const seg = D.segredos(id);
  const planilhas = fs.existsSync(D.pastaPlanilhas(id)) ? fs.readdirSync(D.pastaPlanilhas(id)).filter((n) => n.endsWith(".csv")).length : 0;
  res.json({
    tipos: TIPOS.map((t) => ({ tipo: t, nome: NOME_TIPO[t], campos: t === "sistema-a" || t === "sistema-b" ? CAMPOS[t] : [] })),
    integracoes: await Promise.all(D.integracoes(id).map(async (i) => {
      const cred = seg.integracoes[i.id] ?? {};
      const campos = i.tipo === "sistema-a" || i.tipo === "sistema-b" ? CAMPOS[i.tipo] : [];
      return {
        ...i, tipoNome: NOME_TIPO[i.tipo],
        // Segredo nunca volta: só se está preenchido. Campo não secreto volta o valor.
        valores: Object.fromEntries(campos.map((c) => [c.chave, c.secreto ? (cred[c.chave] ? "••••••" : "") : cred[c.chave] ?? ""])),
        pendencias: i.tipo === "sistema-a" || i.tipo === "sistema-b" ? await pendenciasDoMotor(i.tipo as TipoMotor, cred) : i.tipo === "arquivo" && !planilhas ? ["Importe uma planilha CSV."] : [],
        planilhas: i.tipo === "arquivo" ? planilhas : undefined,
      };
    })),
    ia: { situacao: situacaoIa(seg.ia), preenchidas: Object.fromEntries(Object.values(VARIAVEL_CHAVE).map((k) => [k, !!seg.ia[k]])) },
  });
}));

app.post("/api/integracoes", admin, ok((req, res) => {
  const id = ctx(req).empresaId;
  const tipo = req.body?.tipo as D.TipoIntegracao;
  if (!TIPOS.includes(tipo)) return res.status(400).json({ erro: "Tipo inválido." });
  const lista = D.integracoes(id);
  if ((tipo === "sistema-a" || tipo === "sistema-b") && lista.some((i) => i.tipo === tipo)) return res.status(400).json({ erro: "Já existe uma integração deste tipo." });
  let novoId: string = tipo;
  for (let n = 2; lista.some((i) => i.id === novoId); n++) novoId = `${tipo}-${n}`;
  // Nome padrão neutro: é ele que aparece na etiqueta de origem das corridas.
  const NEUTRO: Record<D.TipoIntegracao, string> = { "sistema-a": "Sistema A", "sistema-b": "Sistema B", arquivo: "Planilha importada", exemplo: "Dados de exemplo" };
  const nome = String(req.body?.nome ?? "").trim().slice(0, 40) || NEUTRO[tipo];
  D.salvarIntegracoes(id, [...lista, { id: novoId, tipo, nome, ativa: true }]);
  res.json({ ok: true });
}));

app.put("/api/integracoes/:id", admin, ok((req, res) => {
  const id = ctx(req).empresaId;
  const lista = D.integracoes(id);
  const i = lista.find((x) => x.id === req.params.id);
  if (!i) return res.status(404).json({ erro: "Integração não encontrada." });
  if (typeof req.body?.nome === "string") i.nome = req.body.nome.trim().slice(0, 40) || i.nome;
  if (typeof req.body?.ativa === "boolean") i.ativa = req.body.ativa;
  D.salvarIntegracoes(id, lista);
  const novos = req.body?.credenciais as Record<string, unknown> | undefined;
  if (novos && (i.tipo === "sistema-a" || i.tipo === "sistema-b")) {
    const seg = D.segredos(id);
    const atual = { ...(seg.integracoes[i.id] ?? {}) };
    for (const c of CAMPOS[i.tipo]) {
      const v = novos[c.chave];
      if (typeof v !== "string" || v === "••••••") continue; // não mexe
      if (v.trim() === "") delete atual[c.chave]; else atual[c.chave] = v.trim().slice(0, 4000);
    }
    seg.integracoes[i.id] = atual;
    D.salvarSegredos(id, seg);
  }
  res.json({ ok: true });
}));

app.delete("/api/integracoes/:id", admin, ok((req, res) => {
  const id = ctx(req).empresaId;
  D.salvarIntegracoes(id, D.integracoes(id).filter((x) => x.id !== req.params.id));
  const seg = D.segredos(id);
  delete seg.integracoes[req.params.id];
  D.salvarSegredos(id, seg);
  res.json({ ok: true });
}));

app.put("/api/ia/chaves", admin, ok((req, res) => {
  const id = ctx(req).empresaId;
  const seg = D.segredos(id);
  for (const k of Object.values(VARIAVEL_CHAVE)) {
    const v = req.body?.[k];
    if (typeof v !== "string" || v === "••••••") continue;
    if (v.trim() === "") delete seg.ia[k]; else seg.ia[k] = v.trim().slice(0, 2000);
  }
  D.salvarSegredos(id, seg);
  res.json({ ok: true });
}));

app.post("/api/planilhas", admin, express.raw({ type: "*/*", limit: "20mb" }), ok((req, res) => {
  const id = ctx(req).empresaId;
  const bytes = req.body instanceof Buffer ? new Uint8Array(req.body) : new Uint8Array();
  const r = corridasDoCsv(bytes);
  if (!r.ok) return res.status(400).json({ erro: r.erro });
  const pasta = D.pastaPlanilhas(id);
  fs.mkdirSync(pasta, { recursive: true });
  const nome = String(req.query.nome ?? "corridas").replace(/[^\w.-]+/g, "_").replace(/\.csv$/i, "").slice(0, 60) || "corridas";
  fs.writeFileSync(path.join(pasta, `${Date.now()}-${nome}.csv`), bytes);
  if (!D.integracoes(id).some((i) => i.tipo === "arquivo")) D.salvarIntegracoes(id, [...D.integracoes(id), { id: "arquivo", tipo: "arquivo", nome: "Planilha importada", ativa: true }]);
  limparCachePlanilhas(id);
  res.json({ ok: true, total: r.corridas.length });
}));

// ------------------------------------------------------------------ usuários e empresas

app.get("/api/usuarios", admin, ok((req, res) => {
  res.json({ usuarios: D.listarUsuarios().filter((u) => u.empresaId === ctx(req).empresaId).map(({ hash: _h, ...u }) => u) });
}));
app.post("/api/usuarios", admin, ok((req, res) => {
  const papel = req.body?.papel === "admin" ? "admin" : "operador";
  const u = D.criarUsuario({ email: String(req.body?.email ?? ""), nome: String(req.body?.nome ?? ""), senha: String(req.body?.senha ?? ""), empresaId: ctx(req).empresaId, papel });
  res.json({ ok: true, id: u.id });
}));
app.delete("/api/usuarios/:id", admin, ok((req, res) => {
  if (req.params.id === ctx(req).usuario.id) return res.status(400).json({ erro: "Você não pode remover o seu próprio usuário." });
  D.removerUsuario(req.params.id, ctx(req).empresaId);
  res.json({ ok: true });
}));

app.post("/api/empresas", exigirPapel(), ok((req, res) => {
  const b = req.body ?? {};
  const e = D.criarEmpresa(String(b.nome ?? ""));
  if (b.adminEmail) D.criarUsuario({ email: String(b.adminEmail), nome: String(b.adminNome ?? ""), senha: String(b.adminSenha ?? ""), empresaId: e.id, papel: "admin" });
  res.json({ empresa: e });
}));

// Cadastros (motoristas, passageiros, categorias, cupons...) e corridas próprias: o painel é o sistema da empresa.
app.use("/api/cadastros", rotasCadastros);
app.use("/api/corridas-proprias", rotasCorridasProprias);

app.use("/api", (_req, res) => res.status(404).json({ erro: "Caminho não encontrado." }));

// Produção: serve o painel compilado (npm run build).
const dist = path.resolve("dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

if (process.env.NODE_ENV !== "test") {
  const porta = Number(process.env.PAINEL_API_PORTA) || 8787;
  app.listen(porta, () => console.log(`Painel (API) em http://localhost:${porta}`));
  // A cada minuto: corrida sem motorista há mais de 20 min vira "não atendida".
  setInterval(() => { for (const e of D.listarEmpresas()) encerrarSemMotorista(e.id).catch(() => undefined); }, 60_000).unref();
}

export { app };
