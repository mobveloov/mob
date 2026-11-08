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
import { cancelarCorrida, criarCorridaPropria, estimarPreco, listarProprias, STATUS_TEXTO, type CorridaPropria } from "../corridas/index.ts";
import * as D from "../servidor/dados.ts";
import { exigirLogin, exigirPapel } from "../servidor/sessao.ts";
import * as T from "./dados.ts";

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
  return (chave: string) => {
    const agora = Date.now();
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
    .map((c) => ({ nome: String(c.nome), descricao: String(c.descricao ?? ""), preco: estimarPreco(empresaId, { categoria: String(c.nome), distanciaKm: null }).valor }))
    .sort((a, b) => (a.preco ?? Infinity) - (b.preco ?? Infinity) || a.nome.localeCompare(b.nome, "pt-BR"));
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
  if (!D.idValido(empresa) || !D.empresa(empresa)?.ativa) return null;
  const l = T.local(empresa, local);
  return l && l.ativo ? { empresaId: empresa, local: l } : null;
}

function exigirChave(req: Request, res: Response, next: NextFunction) {
  const t = acharTotem(req);
  if (!t) return res.status(404).json({ erro: "Totem não encontrado." });
  const chave = String(req.headers["x-totem-chave"] ?? "");
  if (!chave || !T.chaveConfere(t.empresaId, t.local, chave)) return res.status(401).json({ erro: "Digite a senha do totem." });
  req.totem = t;
  next();
}

const P = "/publico/:empresa/:local";

/** Marca e nome do local (sem senha): a tela de senha já sai com a cara da empresa. */
rotasTotem.get(P, ok((req, res) => {
  const t = acharTotem(req);
  if (!t) return res.status(404).json({ erro: "Totem não encontrado." });
  res.json({ empresaId: t.empresaId, marca: D.marca(t.empresaId), local: { id: t.local.id, nome: t.local.nome } });
}));

rotasTotem.post(`${P}/entrar`, ok((req, res) => {
  const t = acharTotem(req);
  if (!t) return res.status(404).json({ erro: "Totem não encontrado." });
  if (!podeTentarSenha(`${req.ip}|${t.empresaId}|${t.local.id}`)) return res.status(429).json({ erro: "Muitas tentativas. Espere alguns minutos." });
  if (!D.senhaConfere(String(req.body?.senha ?? ""), t.local.senhaHash)) return res.status(401).json({ erro: "Senha errada." });
  res.json({ chave: T.chaveDoAparelho(t.empresaId, t.local) });
}));

rotasTotem.get(`${P}/versao`, exigirChave, (req, res) => { res.json({ versao: req.totem!.local.versao }); });

rotasTotem.get(`${P}/config`, exigirChave, ok((req, res) => {
  const { empresaId, local: l } = req.totem!;
  res.json({
    marca: D.marca(empresaId),
    local: { id: l.id, nome: l.nome, endereco: l.endereco.texto, pagamentos: l.pagamentos, versao: l.versao },
    categorias: categoriasComPreco(empresaId, l.categorias),
  });
}));

rotasTotem.post(`${P}/corridas`, exigirChave, ok(async (req, res) => {
  const { empresaId, local: l } = req.totem!;
  const b = (req.body ?? {}) as Record<string, unknown>;
  const pedidoId = pedidoIdValido(b.pedidoId) ? b.pedidoId : crypto.randomUUID();
  const chave = `${empresaId}|${pedidoId}`;
  if (!pedidos.has(chave) && !podePedir(`${empresaId}|${l.id}`)) return res.status(429).json({ erro: "Muitos pedidos seguidos neste totem. Espere alguns minutos." });
  const semDestino = b.semDestino === true;
  const destino = semDestino ? undefined : T.lerPonto(b.destino);
  if (!semDestino && !destino?.texto) throw new Error("Informe o destino.");
  const pagamento = txt(b.pagamento, 40);
  if (!l.pagamentos.includes(pagamento)) throw new Error("Escolha a forma de pagamento.");
  const cats = categoriasComPreco(empresaId, l.categorias);
  const categoria = txt(b.categoria, 60);
  if (cats.length && !cats.some((c) => c.nome === categoria)) throw new Error("Escolha a categoria.");
  const c = await umaVez(chave, async () => {
    const nova = await criarCorridaPropria(empresaId, {
      passageiro: { nome: txt(b.nome, 80), telefone: String(b.telefone ?? "") },
      embarque: l.endereco, destino, categoria, pagamento, canal: "totem",
      observacao: `Pedido pelo totem: ${l.nome}`,
    }, `totem:${l.id}`);
    T.registrarCorrida(empresaId, { corridaId: nova.id, os: nova.os, localId: l.id, criadaEm: new Date().toISOString() });
    return nova;
  });
  res.json({ corrida: { id: c.id, os: c.os, valor: c.estimativa.valor, categoria: c.categoria } });
}));

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
interno.use(exigirLogin);
rotasTotem.use(interno);
const admin = exigirPapel("admin");
const emp = (req: Request) => req.ctx!.empresaId;

interno.get("/locais", ok((req, res) => {
  res.json({ locais: T.listarLocais(emp(req)).map(T.localPublico), pagamentos: T.PAGAMENTOS, categorias: categoriasComPreco(emp(req)) });
}));
interno.post("/locais", admin, ok((req, res) => { res.json({ local: T.localPublico(T.salvarLocal(emp(req), req.body ?? {})) }); }));
interno.put("/locais/:id", admin, ok((req, res) => { res.json({ local: T.localPublico(T.salvarLocal(emp(req), req.body ?? {}, req.params.id)) }); }));
interno.delete("/locais/:id", admin, ok((req, res) => { T.removerLocal(emp(req), req.params.id); res.json({ ok: true }); }));
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
