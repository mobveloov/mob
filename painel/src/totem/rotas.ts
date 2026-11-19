// Rotas do totem e apoio à tela "Solicitar corrida". Registrar ANTES do app.use("/api", exigirLogin) do index.ts:
//
//   import { rotasTotem } from "../totem/rotas.ts";
//   app.use("/api/totem", rotasTotem);
//
// A corrida é uma corrida própria do painel (src/corridas): nenhum sistema externo e nenhuma chave.
// Públicas (aparelho do totem, sem login): /api/totem/publico/:empresa/:local/...  protegidas pela senha do local.
//   O aparelho digita a senha uma vez e recebe uma chave (cabeçalho X-Totem-Chave). Trocar a senha derruba a chave.
//   O totem só vê e só cancela as corridas que ele mesmo pediu.
// Internas (com login, empresa SEMPRE de req.ctx.empresaId): locais do totem (admin), opções e lista da central.
// Pedir, atribuir motorista, mudar status e cancelar pela central usam /api/corridas-proprias (src/corridas/rotas.ts).

import crypto from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import { cadastroPorId } from "../comum/cadastros.ts";
import { listar } from "../cadastros/armazem.ts";
import { cancelarCorrida, criarCorridaPropria, distanciaEstimada, estimarPreco, listarProprias, STATUS_TEXTO, type CorridaPropria } from "../corridas/index.ts";
import * as D from "../servidor/dados.ts";
import { moduloLigado } from "../superadmin/recursos.ts";
import { exigirLogin, exigirModulo, exigirPapel } from "../servidor/sessao.ts";
import { buscarEndereco } from "../enderecos/index.ts";
import * as A from "./apk.ts";
import * as PR from "./premios.ts";
import * as TC from "./tarifas-cidade.ts";
import * as T from "./dados.ts";
import { esquecerWhatsapp, instanciaDoTotem, provedorDoTotem, whatsappPronto } from "./whatsapp.ts";

export const rotasTotem = express.Router();
export default rotasTotem;

type Fn = (req: Request, res: Response) => unknown;
const ok = (fn: Fn) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[totem]", req.method, req.path, msg);
    if (!res.headersSent) res.status(400).json({ erro: msg });
  }
};

/** Limite simples por chave (tentativas de senha, pedidos por local). */
function limitador(max: number, janelaMs: number) {
  const m = new Map<string, number[]>();
  let limpezaEm = 0;
  return (chave: string) => {
    const agora = Date.now();
    // Apaga as chaves velhas de vez em quando (senão o mapa cresce com cada IP que tentou).
    if (agora - limpezaEm > janelaMs) { limpezaEm = agora; for (const [k, l] of m) if (!l.some((t) => agora - t < janelaMs)) m.delete(k); }
    const l = (m.get(chave) ?? []).filter((t) => agora - t < janelaMs);
    l.push(agora);
    m.set(chave, l);
    return l.length <= max;
  };
}
const podeTentarSenha = limitador(8, 10 * 60_000);
const podePedir = limitador(10, 10 * 60_000);

/** Pedido repetido (toque duplo, rede que caiu): o mesmo pedidoId devolve a mesma corrida. */
const pedidos = new Map<string, { em: number; p: Promise<CorridaPropria> }>();
function umaVez(chave: string, fn: () => Promise<CorridaPropria>): Promise<CorridaPropria> {
  const agora = Date.now();
  for (const [k, v] of pedidos) if (agora - v.em > 15 * 60_000) pedidos.delete(k);
  const ja = pedidos.get(chave);
  if (ja) return ja.p;
  const p = fn().catch((e) => { pedidos.delete(chave); throw e; });
  pedidos.set(chave, { em: agora, p });
  return p;
}

const txt = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[<>]/g, "").trim().slice(0, max) : "");
const pedidoIdValido = (v: unknown): v is string => typeof v === "string" && /^[\w-]{8,64}$/.test(v);

const CANCELA_ATE_MS = 3 * 3600_000;
const ACOMPANHA_ATE_MS = 12 * 3600_000;
const ANTES_DE_COMECAR = new Set(["procurando", "a_caminho", "no_local"]);
const GRUPO: Record<string, "aberta" | "finalizada" | "cancelada" | "nao_atendida"> = {
  procurando: "aberta", a_caminho: "aberta", no_local: "aberta", em_andamento: "aberta", finalizada: "finalizada", cancelada: "cancelada", nao_atendida: "nao_atendida",
};

// ------------------------------------------------------------------ cadastros usados

/** Categorias ativas com o preço "a partir de" (tarifa sem distância: bandeirada ou mínimo). */
function categoriasComPreco(empresaId: string, filtro: string[] = []) {
  const so = filtro.map((x) => x.toLowerCase());
  return listar(empresaId, cadastroPorId("categorias")!)
    .filter((c) => c.ativa !== false && String(c.nome ?? "").trim())
    .filter((c) => !so.length || so.includes(String(c.nome).toLowerCase()))
    .map((c) => ({ nome: String(c.nome), descricao: String(c.descricao ?? ""), preco: estimarPreco(empresaId, { categoria: String(c.nome), distanciaKm: null }).valor, espera: null as number | null }))
    .sort((a, b) => (a.preco ?? Infinity) - (b.preco ?? Infinity) || a.nome.localeCompare(b.nome, "pt-BR"));
}

/** O que o totem oferece: a tabela de preços do próprio local (Totens e Preços › Preços) ou, sem ela, as categorias da empresa. */
function categoriasDoLocal(empresaId: string, l: T.Local) {
  if (!l.tabela.length) return categoriasComPreco(empresaId, l.categorias);
  return l.tabela.filter((c) => c.ativa).sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"))
    .map((c) => ({ nome: c.nome, descricao: c.descricao, preco: T.precoDoLocal(l, c, null, null) as number | null, espera: c.espera as number | null }));
}

function motoristaDa(empresaId: string, c: CorridaPropria) {
  if (!c.motoristaId) return null;
  const m = listar(empresaId, cadastroPorId("motoristas")!).find((x) => x.id === c.motoristaId);
  return { nome: c.motorista, telefone: c.telefoneMotorista, veiculo: String(m?.veiculo ?? ""), placa: String(m?.placa ?? "") };
}

/** Corrida própria -> o que o totem mostra (sem telefone do motorista nem do passageiro). */
function situacaoTotem(empresaId: string, c: CorridaPropria, reg: T.CorridaDoTotem) {
  const m = motoristaDa(empresaId, c);
  return {
    id: c.id, os: c.os, status: c.status, grupo: GRUPO[c.status], statusTexto: STATUS_TEXTO[c.status],
    motorista: m ? { nome: m.nome } : null, veiculo: m && (m.veiculo || m.placa) ? { modelo: m.veiculo, placa: m.placa } : null,
    valor: c.valor ?? c.estimativa.valor, valorEstimado: c.valor == null, categoria: c.categoria, destino: c.destino?.texto ?? "",
    podeCancelar: ANTES_DE_COMECAR.has(c.status) && Date.now() - Date.parse(reg.criadaEm) < CANCELA_ATE_MS,
  };
}

// ====================================================================== públicas (aparelho do totem)

interface Totem { empresaId: string; local: T.Local }
declare module "express-serve-static-core" { interface Request { totem?: Totem } }

function acharTotem(req: Request): Totem | null {
  const { empresa, local } = req.params;
  if (!D.idValido(empresa) || !D.empresa(empresa)?.ativa || !moduloLigado(empresa, "totem")) return null;
  const l = T.local(empresa, local);
  return l && l.ativo ? { empresaId: empresa, local: l } : null;
}

function exigirChave(req: Request, res: Response, next: NextFunction) {
  const t = acharTotem(req);
  if (!t) return res.status(404).json({ erro: "Totem não encontrado." });
  const chave = String(req.headers["x-totem-chave"] ?? "");
  if (!chave || !T.chaveConfere(t.empresaId, t.local, chave)) return res.status(401).json({ erro: "Digite a senha do totem." });
  // Link já vinculado a um aparelho: outro aparelho (mesmo com a chave copiada) é barrado.
  if (t.local.aparelho && String(req.headers["x-totem-aparelho"] ?? "") !== t.local.aparelho) return res.status(403).json({ erro: MSG_OUTRO_APARELHO, codigo: "outro_aparelho" });
  req.totem = t;
  next();
}

// A instância do totem só envia: o webhook dela é aceito e ignorado (o bot não responde pelo número do totem).
rotasTotem.post("/webhook/:empresa/:local", (_req, res) => { res.json({ ok: true, ignorado: true }); });

// Prêmios (roleta e raspadinha): páginas públicas /p/<empresa>/<token> e /premios/<empresa>/<jogo>. Sem login; o jogo
// só abre com o token do convite (40 letras e números) e o link aberto pede o telefone (com limite de tentativas).
const baseDaRequisicao = (req: Request) => (process.env.PUBLICO_URL ?? "").trim().replace(/\/+$/, "") || `${req.protocol}://${req.get("host")}`;
const empresaDoPremio = (req: Request) => { const e = req.params.empresa; if (!D.idValido(e) || !D.empresa(e)?.ativa || !moduloLigado(e, "totem")) throw Object.assign(new Error("Link inválido."), { status: 404 }); return e; };
const podeAbrirPremio = limitador(20, 10 * 60_000);
const premioPublico = (fn: (req: Request, e: string) => Promise<{ status: number; corpo: Record<string, unknown> }> | { status: number; corpo: Record<string, unknown> }) => async (req: Request, res: Response) => {
  try { const r = await fn(req, empresaDoPremio(req)); res.status(r.status).json(r.corpo); } catch (e) {
    const st = (e as { status?: number }).status ?? 400;
    res.status(st).json({ erro: e instanceof Error ? e.message : "Erro." });
  }
};
rotasTotem.post("/premios/publico/:empresa/info", premioPublico((req, e) => {
  const i = PR.infoDoConvite(e, req.body?.token);
  return i ? { status: 200, corpo: i } : { status: 404, corpo: { erro: "Convite não encontrado." } };
}));
rotasTotem.post("/premios/publico/:empresa/play", premioPublico((req, e) => PR.jogar(e, req.body?.token, baseDaRequisicao(req))));
rotasTotem.post("/premios/publico/:empresa/abrir", premioPublico((req, e) => {
  const kind = req.body?.kind;
  if (!PR.ehJogo(kind)) return { status: 400, corpo: { erro: "Link inválido." } };
  const tel = PR.soNumeros(req.body?.telefone);
  if (!podeAbrirPremio(`${req.ip}|${e}`) || !podeAbrirPremio(`tel|${e}|${tel}`)) return { status: 429, corpo: { erro: "Muitas tentativas. Espere alguns minutos e tente de novo." } };
  return PR.abrirPeloTelefone(e, kind, tel, baseDaRequisicao(req));
}));

const P = "/publico/:empresa/:local";
const MSG_OUTRO_APARELHO = "Este link de Totem já está ativo em outro dispositivo físico. Para transferir este Totem de local, o Administrador deve liberar o dispositivo no Painel de Controle clicando em 'Limpar Dispositivo'.";
const aparelhoValido = (v: unknown): v is string => typeof v === "string" && /^[\w.-]{8,80}$/.test(v);

/** Marca e nome do local (sem senha): a tela de senha já sai com a cara da empresa. */
rotasTotem.get(P, ok((req, res) => {
  const t = acharTotem(req);
  if (!t) return res.status(404).json({ erro: "Totem não encontrado." });
  res.json({ empresaId: t.empresaId, marca: D.marca(t.empresaId), local: { id: t.local.id, nome: t.local.nome, logo: t.local.logo, rodape: t.local.rodape } });
}));

rotasTotem.post(`${P}/entrar`, ok((req, res) => {
  const t = acharTotem(req);
  if (!t) return res.status(404).json({ erro: "Totem não encontrado." });
  if (!podeTentarSenha(`${req.ip}|${t.empresaId}|${t.local.id}`)) return res.status(429).json({ erro: "Muitas tentativas. Espere alguns minutos." });
  if (!D.senhaConfere(String(req.body?.senha ?? ""), t.local.senhaHash)) return res.status(401).json({ erro: "Senha errada." });
  // O primeiro aparelho que entra com a senha fica vinculado ao link (o admin libera em "Limpar Dispositivo").
  if (aparelhoValido(req.body?.aparelho) && T.vincularAparelho(t.empresaId, t.local.id, req.body.aparelho) === "outro") return res.status(403).json({ erro: MSG_OUTRO_APARELHO, codigo: "outro_aparelho" });
  res.json({ chave: T.chaveDoAparelho(t.empresaId, t.local) });
}));

rotasTotem.get(`${P}/versao`, exigirChave, (req, res) => { res.json({ versao: req.totem!.local.versao }); });

rotasTotem.get(`${P}/config`, exigirChave, ok(async (req, res) => {
  const { empresaId, local: l } = req.totem!;
  res.json({
    marca: D.marca(empresaId),
    local: { id: l.id, nome: l.nome, endereco: l.endereco.texto, pagamentos: l.pagamentos, versao: l.versao, logo: l.logo, rodape: l.rodape, whatsappPronto: await whatsappPronto(empresaId, l) },
    categorias: categoriasDoLocal(empresaId, l),
  });
}));

/** O número digitado tem WhatsApp? Sem WhatsApp o passageiro nunca receberia os dados do motorista. null = não deu para conferir. */
const podeConferir = limitador(30, 10 * 60_000);
rotasTotem.post(`${P}/whatsapp/existe`, exigirChave, ok(async (req, res) => {
  const { empresaId, local: l } = req.totem!;
  if (!podeConferir(`${empresaId}|${l.id}`)) return res.json({ existe: null });
  const tel = String(req.body?.telefone ?? "").replace(/\D/g, "");
  if (tel.length < 10 || tel.length > 13) throw new Error("Digite um telefone válido com DDD");
  let existe: boolean | null = null;
  try { existe = await Promise.race([provedorDoTotem(empresaId, l).existeNoWhatsApp(tel), new Promise<null>((r) => setTimeout(() => r(null), 6000))]); } catch { existe = null; }
  res.json({ existe });
}));

/** Sugestões de endereço para o destino (base de endereços e casas da empresa). Só com a chave do aparelho; com limite por local. */
const podeBuscar = limitador(120, 10 * 60_000);
rotasTotem.get(`${P}/enderecos`, exigirChave, ok((req, res) => {
  const { empresaId, local: l } = req.totem!;
  if (!podeBuscar(`${empresaId}|${l.id}`)) return res.status(429).json({ erro: "Muitas buscas seguidas. Espere um pouco." });
  const q = String(req.query.q ?? "").slice(0, 200);
  const r = q.trim().length >= 3 ? buscarEndereco(empresaId, q, 6) : { enderecos: [], aviso: null };
  res.json({ enderecos: r.enderecos.map((e) => ({ texto: e.texto, lat: e.lat, lng: e.lng, exato: e.exato })), aviso: r.aviso });
}));

/** Preços das categorias para o destino digitado (valor fixo de cidade ou local, quando há). */
rotasTotem.post(`${P}/cotacao`, exigirChave, ok((req, res) => {
  const { empresaId, local: l } = req.totem!;
  const destino = txt(req.body?.destino, 200);
  const cats = categoriasDoLocal(empresaId, l).map((c) => {
    const fixo = destino ? TC.valorFixoDoDestino(empresaId, { cidade: l.cidade, uf: l.uf, embarque: l.endereco.texto }, destino, c.nome) : null;
    return fixo ? { ...c, preco: fixo.total, fixo: true, pedagio: fixo.pedagio } : { ...c, fixo: false, pedagio: 0 };
  });
  res.json({ categorias: cats });
}));

rotasTotem.post(`${P}/corridas`, exigirChave, ok(async (req, res) => {
  const { empresaId, local: l } = req.totem!;
  const b = (req.body ?? {}) as Record<string, unknown>;
  const pedidoId = pedidoIdValido(b.pedidoId) ? b.pedidoId : crypto.randomUUID();
  const chave = `${empresaId}|${l.id}|${pedidoId}`; // um local nunca recebe a corrida de outro
  if (!pedidos.has(chave) && !podePedir(`${empresaId}|${l.id}`)) return res.status(429).json({ erro: "Muitos pedidos seguidos neste totem. Espere alguns minutos." });
  const semDestino = b.semDestino === true;
  const destino = semDestino ? undefined : T.lerPonto(b.destino);
  if (!semDestino && !destino?.texto) throw new Error("Informe o destino.");
  const pagamento = txt(b.pagamento, 40);
  if (!l.pagamentos.includes(pagamento)) throw new Error("Escolha a forma de pagamento.");
  const cats = categoriasDoLocal(empresaId, l);
  const categoria = txt(b.categoria, 60);
  if (cats.length && !cats.some((c) => c.nome === categoria)) throw new Error("Escolha a categoria.");
  if (await whatsappPronto(empresaId, l) === false) return res.status(503).json({ erro: "Totem indisponível no momento. Procure a recepção." });
  const preco = precoPrefixado(empresaId, l, categoria, destino);
  const c = await umaVez(chave, async () => {
    const nova = await criarCorridaPropria(empresaId, {
      passageiro: { nome: txt(b.nome, 80), telefone: String(b.telefone ?? "") },
      embarque: l.endereco, destino, categoria, pagamento, canal: "totem",
      observacao: `Pedido pelo totem: ${l.nome}`,
      // Preço do próprio local: valor fixado na hora do pedido (com distância, quando os dois pontos têm coordenada).
      ...(preco != null ? { valorFinal: { modo: "prefixado" as const, valor: preco } } : {}),
    }, `totem:${l.id}`);
    T.registrarCorrida(empresaId, { corridaId: nova.id, os: nova.os, localId: l.id, criadaEm: new Date().toISOString() });
    return nova;
  });
  res.json({ corrida: { id: c.id, os: c.os, valor: c.estimativa.valor, categoria: c.categoria } });
}));

function precoPrefixado(empresaId: string, l: T.Local, categoria: string, destino?: T.Ponto): number | null {
  // Preços por cidade: destino em outra cidade ou num local com valor próprio vale o valor fixo (horário + pedágio).
  const fixo = destino?.texto ? TC.valorFixoDoDestino(empresaId, { cidade: l.cidade, uf: l.uf, embarque: l.endereco.texto }, destino.texto, categoria) : null;
  if (fixo) return fixo.total;
  const c = l.tabela.find((x) => x.ativa && x.nome === categoria);
  if (!c) return null;
  const km = destino ? distanciaEstimada(l.endereco, destino) : null;
  return T.precoDoLocal(l, c, km, null);
}

/** O totem só acompanha corrida que ele mesmo pediu, nas últimas 12 horas. */
function daquiDoTotem(req: Request) {
  const { empresaId, local: l } = req.totem!;
  const reg = T.corridaDoTotem(empresaId, String(req.params.id));
  if (!reg || reg.localId !== l.id || Date.now() - Date.parse(reg.criadaEm) > ACOMPANHA_ATE_MS) return null;
  const c = listarProprias(empresaId).find((x) => x.id === reg.corridaId);
  return c ? { reg, c } : null;
}

rotasTotem.get(`${P}/corridas/:id`, exigirChave, ok((req, res) => {
  const r = daquiDoTotem(req);
  if (!r) return res.status(404).json({ erro: "Corrida não encontrada." });
  res.json({ corrida: situacaoTotem(req.totem!.empresaId, r.c, r.reg) });
}));

rotasTotem.post(`${P}/corridas/:id/cancelar`, exigirChave, ok(async (req, res) => {
  const r = daquiDoTotem(req);
  if (!r) return res.status(404).json({ erro: "Corrida não encontrada." });
  if (!situacaoTotem(req.totem!.empresaId, r.c, r.reg).podeCancelar) return res.status(409).json({ erro: "Esta corrida não pode mais ser cancelada pelo totem." });
  await cancelarCorrida(req.totem!.empresaId, r.c.id, "Passageiro", "Cancelada no totem", `totem:${r.reg.localId}`);
  res.json({ ok: true });
}));

// ====================================================================== internas (com login)

const interno = express.Router();
interno.use(exigirLogin, exigirModulo("totem"));
rotasTotem.use(interno);
const admin = exigirPapel("admin");
const emp = (req: Request) => req.ctx!.empresaId;

interno.get("/locais", ok((req, res) => {
  res.json({ locais: T.listarLocais(emp(req)).map(T.localPublico), pagamentos: T.PAGAMENTOS, categorias: categoriasComPreco(emp(req)) });
}));
interno.post("/locais", admin, ok((req, res) => { res.json({ local: T.localPublico(T.salvarLocal(emp(req), req.body ?? {})) }); }));
interno.put("/locais/:id", admin, ok((req, res) => { res.json({ local: T.localPublico(T.salvarLocal(emp(req), req.body ?? {}, req.params.id)) }); }));
interno.delete("/locais/:id", admin, ok((req, res) => { T.removerLocal(emp(req), req.params.id); res.json({ ok: true }); }));
interno.post("/locais/:id/imagem/:tipo", admin, express.raw({ type: "image/*", limit: D.MAX_IMAGEM }), ok((req, res) => {
  const tipo = req.params.tipo === "logo" ? "logo" : req.params.tipo === "rodape" ? "rodape" : null;
  if (!tipo) throw new Error("Tipo de imagem inválido.");
  const bytes = req.body instanceof Buffer ? new Uint8Array(req.body) : new Uint8Array();
  if (!bytes.length) throw new Error("Arquivo vazio.");
  res.json({ local: T.localPublico(T.definirImagem(emp(req), req.params.id, tipo, String(req.headers["content-type"] ?? "").split(";")[0], bytes)) });
}));
interno.delete("/locais/:id/imagem/:tipo", admin, ok((req, res) => {
  const tipo = req.params.tipo === "logo" ? "logo" : req.params.tipo === "rodape" ? "rodape" : null;
  if (!tipo) throw new Error("Tipo de imagem inválido.");
  res.json({ local: T.localPublico(T.tirarImagem(emp(req), req.params.id, tipo)) });
}));
interno.delete("/locais/:id/aparelho", admin, ok((req, res) => { res.json({ local: T.localPublico(T.limparAparelho(emp(req), req.params.id)) }); }));

/** Preços do local (aba Preços). `copiarPara`: "todos" ou lista de locais que recebem a mesma tabela. */
interno.put("/locais/:id/precos", admin, ok((req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const e = emp(req);
  const cadastradas = listar(e, cadastroPorId("categorias")!).map((c) => String(c.nome ?? "").trim().toLowerCase()).filter(Boolean);
  if (cadastradas.length && Array.isArray(b.tabela)) {
    for (const c of b.tabela as Array<{ nome?: unknown }>) {
      if (!cadastradas.includes(String(c?.nome ?? "").trim().toLowerCase())) throw new Error(`A categoria "${String(c?.nome ?? "")}" não existe em Categorias e tarifas. Cadastre lá primeiro.`);
    }
  }
  const copiar = b.copiarPara === "todos" ? "todos" : Array.isArray(b.copiarPara) ? b.copiarPara.map(String) : null;
  res.json({ local: T.localPublico(T.salvarPrecos(e, req.params.id, { tabela: b.tabela, surge: b.surge }, copiar)) });
}));

/** WhatsApp do totem (modo individual): situação, conectar (QR) e desconectar. */
const localDaRota = (req: Request) => { const l = T.local(emp(req), req.params.id); if (!l) throw new Error("Local não encontrado."); return l; };
interno.get("/locais/:id/whatsapp", ok(async (req, res) => {
  const l = localDaRota(req);
  const s = await provedorDoTotem(emp(req), l).situacao().catch(() => ({ situacao: "erro" as const }));
  res.json({ modo: l.modoWhatsapp, instancia: l.modoWhatsapp === "individual" ? instanciaDoTotem(emp(req), l) : null, ...s });
}));
interno.post("/locais/:id/whatsapp/conectar", admin, ok(async (req, res) => {
  const l = localDaRota(req);
  const base = (process.env.PUBLICO_URL ?? "").trim().replace(/\/+$/, "") || `${req.protocol}://${req.get("host")}`;
  esquecerWhatsapp(emp(req), l.id);
  res.json(await provedorDoTotem(emp(req), l).conectar(`${base}/api/totem/webhook/${emp(req)}/${l.id}`));
}));
interno.post("/locais/:id/whatsapp/desconectar", admin, ok(async (req, res) => {
  const l = localDaRota(req);
  esquecerWhatsapp(emp(req), l.id);
  await provedorDoTotem(emp(req), l).desconectar();
  res.json({ ok: true });
}));

/** App Android do totem: a versão ativa mais nova (todas as empresas) e, para o dono da plataforma, publicar e ligar/desligar versões. */
interno.get("/apk", ok((_req, res) => { res.json({ versao: A.versaoAtiva() }); }));
const dono = exigirPapel();
interno.get("/apk/versoes", dono, ok((_req, res) => { res.json({ versoes: A.listarVersoes() }); }));
interno.post("/apk/versoes", dono, ok((req, res) => { res.json({ versao: A.publicarVersao(req.body ?? {}) }); }));
interno.put("/apk/versoes/:id", dono, ok((req, res) => { res.json({ versao: A.ativarVersao(req.params.id, req.body?.ativa !== false) }); }));

/** Preços por cidade (tarifas fixas por trecho, feriados da empresa e hora de espera). Só admin. */
interno.get("/tarifas-cidade", admin, ok((req, res) => {
  const d = TC.dados(emp(req));
  res.json({ ...d, tarifas: d.tarifas.map((t) => ({ ...t, tipo: TC.tipoDaTarifa(t), titulo: TC.tituloDaTarifa(t), resumo: TC.resumoDaTarifa(t) })) });
}));
const tipoTarifa = (v: string) => { if (v !== "dentro" && v !== "local" && v !== "cidades") throw new Error("Tipo de tarifa inválido."); return v; };
interno.post("/tarifas-cidade/:tipo", admin, ok((req, res) => { res.json({ tarifa: TC.salvarTarifa(emp(req), tipoTarifa(req.params.tipo), req.body ?? {}) }); }));
interno.put("/tarifas-cidade/:tipo/:id", admin, ok((req, res) => { res.json({ tarifa: TC.salvarTarifa(emp(req), tipoTarifa(req.params.tipo), req.body ?? {}, req.params.id) }); }));
interno.delete("/tarifas-cidade/:id", admin, ok((req, res) => { TC.removerTarifa(emp(req), req.params.id); res.json({ ok: true }); }));
interno.post("/tarifas-cidade-feriados", admin, ok((req, res) => { res.json({ feriado: TC.adicionarFeriado(emp(req), String(req.body?.data ?? ""), String(req.body?.nome ?? "")) }); }));
interno.delete("/tarifas-cidade-feriados/:id", admin, ok((req, res) => { TC.removerFeriado(emp(req), req.params.id); res.json({ ok: true }); }));
interno.put("/tarifas-cidade-espera", admin, ok((req, res) => { TC.definirEspera(emp(req), req.body?.valor); res.json({ ok: true }); }));

/** Prêmios (só admin): configuração das duas brincadeiras, números do dia, enviar agora e convite para um telefone. */
interno.get("/premios", admin, ok((req, res) => { res.json({ jogos: PR.painelDosJogos(emp(req)), empresa: emp(req) }); }));
interno.put("/premios/:kind", admin, ok((req, res) => {
  if (!PR.ehJogo(req.params.kind)) throw new Error("Jogo inválido.");
  const cfg = PR.salvarConfigDoJogo(emp(req), req.params.kind, req.body?.config);
  res.json({ ok: true, config: cfg });
}));
interno.post("/premios/:kind/enviar-agora", admin, ok(async (req, res) => {
  if (!PR.ehJogo(req.params.kind)) throw new Error("Jogo inválido.");
  res.json({ ok: true, ...(await PR.enviarAgora(emp(req), req.params.kind, baseDaRequisicao(req))) });
}));
interno.post("/premios/:kind/convite", admin, ok(async (req, res) => {
  if (!PR.ehJogo(req.params.kind)) throw new Error("Jogo inválido.");
  const tel = PR.soNumeros(req.body?.telefone);
  if (tel.length < 10 || tel.length > 11) throw new Error("Digite o telefone com DDD.");
  const { convite } = PR.convidar(emp(req), req.params.kind, tel, String(req.body?.nome ?? "").slice(0, 60), "manual");
  const r = await PR.enviarLink(emp(req), baseDaRequisicao(req), convite);
  if (!r.ok) throw new Error(`Não foi possível enviar: ${r.erro}`);
  res.json({ ok: true, link: `${baseDaRequisicao(req)}/p/${emp(req)}/${convite.token}` });
}));

interno.post("/locais/:id/recarregar", admin, ok((req, res) => { res.json({ local: T.localPublico(T.recarregarLocal(emp(req), req.params.id)) }); }));

/** O que a tela "Solicitar corrida" precisa: categorias com preço, motoristas ativos, pagamentos e locais. */
interno.get("/opcoes", ok((req, res) => {
  const e = emp(req);
  res.json({
    categorias: categoriasComPreco(e), pagamentos: T.PAGAMENTOS,
    motoristas: listar(e, cadastroPorId("motoristas")!).filter((m) => m.status === "Ativo")
      .map((m) => ({ id: m.id, nome: String(m.nome ?? ""), telefone: String(m.telefone ?? ""), placa: String(m.placa ?? ""), veiculo: String(m.veiculo ?? ""), categorias: String(m.categorias ?? "") }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    locais: T.listarLocais(e).filter((l) => l.ativo).map((l) => ({ id: l.id, nome: l.nome, endereco: l.endereco })),
  });
}));

/** Corridas próprias em aberto e as das últimas 24 h (mais novas primeiro), com o local quando veio do totem. */
interno.get("/corridas", ok((req, res) => {
  const e = emp(req);
  const canal = typeof req.query.canal === "string" ? req.query.canal : "";
  const locais = new Map(T.listarLocais(e).map((l) => [l.id, l.nome]));
  const doTotem = new Map(T.corridasDoTotem(e).map((r) => [r.corridaId, r.localId]));
  const limite = Date.now() - 3 * 3600_000 - 24 * 3600_000; // solicitadaEm está no horário de Brasília
  res.json({
    corridas: listarProprias(e)
      .filter((c) => (!canal || c.canal === canal) && (GRUPO[c.status] === "aberta" || Date.parse(c.solicitadaEm) >= limite))
      .sort((a, b) => b.solicitadaEm.localeCompare(a.solicitadaEm)).slice(0, 100)
      .map((c) => ({
        id: c.id, os: c.os, status: c.status, statusTexto: STATUS_TEXTO[c.status], grupo: GRUPO[c.status], canal: c.canal,
        local: doTotem.has(c.id) ? locais.get(doTotem.get(c.id)!) ?? "" : "",
        passageiro: c.passageiro, embarque: c.embarque.texto, destino: c.destino?.texto ?? "", categoria: c.categoria, pagamento: c.pagamento,
        motoristaId: c.motoristaId, motorista: c.motorista, telefoneMotorista: c.telefoneMotorista,
        valor: c.valor, valorEstimado: c.estimativa.valor, solicitadaEm: c.solicitadaEm, motivoCancelamento: c.motivoCancelamento,
      })),
  });
}));
