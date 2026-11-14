// Rotas da versão 2 dos apps (contrato em docs/APPS_API.md). Ligadas em rotas.ts:
//   rotasPublicasV2  antes do token: cidades, login por telefone/e-mail com senha, criar conta, esqueci a senha.
//   rotasV2          com o token: conta, foto, lugares, contra-ofertas, rota, corridas abertas, maçaneta, cadastro,
//                    veículos, suporte e contatos.
//   rotasV2Central   no painel (login do painel): aprovar motoristas, conversas de suporte e fotos.
// Tudo por empresa: a empresa vem da URL e o token só vale na empresa em que foi criado.

import express, { type NextFunction, type Request, type Response } from "express";
import fs from "node:fs";
import { cadastroPorId } from "../comum/cadastros.ts";
import { alterarCampos, listar } from "../cadastros/armazem.ts";
import { alterarCorrida, estimarPreco, listarProprias, type Ponto } from "../corridas/index.ts";
import { buscarCep, cidadesAtendidas, completarPonto, rota } from "../enderecos/index.ts";
import { exigirPapel } from "../servidor/sessao.ts";
import { agoraBr, arred } from "../servidor/util.ts";
import { ajustes, contatos } from "./ajustes.ts";
import { arquivo, ler, limitador, num, soDigitos, txt } from "./armazem.ts";
import { marcarLida } from "./chat.ts";
import * as P from "./despacho.ts";
import { pessoa, salvarPessoa } from "./extras.ts";
import {
  arquivoDaFoto, ativarVeiculo, cadastroDoMotorista, criarContaMotorista, criarContaPassageiro, definirSenha, estatisticas, euCompleto, excluirVeiculo, localizar, lugares,
  mascarar, MAX_FOTO, pendenciasDoMotorista, removerLugar, salvarDadosDoMotorista, salvarEnderecoDoMotorista, salvarFoto, salvarLugar, salvarVeiculo, senhaConfere, temSenha, urlDaFoto, veiculos,
} from "./perfil.ts";
import * as D from "../servidor/dados.ts";
import { arquivoDoAudioDoSuporte, audioParaCentral, conversasDoSuporte, escreverParaCentral, marcarSuporteLido, mensagensDoSuporte, naoLidasDoSuporte, responderPelaCentral } from "./suporte.ts";
import { criarSessao, entrar, pedirCodigo, PAPEIS, sair, type PapelApp } from "./sessoes.ts";

type Fn = (req: Request, res: Response) => unknown;
const ok = (fn: Fn) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!res.headersSent) res.status((e as { status?: number }).status ?? 400).json({ erro: msg });
  }
};
const demais = (msg: string) => Object.assign(new Error(msg), { status: 429 });
const ctx = (req: Request) => req.app_!;
const emp = (req: Request) => (req.params as Record<string, string>).empresa;
const so = (papel: PapelApp) => (req: Request, res: Response, next: NextFunction) =>
  req.app_?.sessao.papel === papel ? next() : res.status(403).json({ erro: "Esta função é do outro app." });
const papelDe = (v: unknown): PapelApp => { if (!PAPEIS.includes(v as PapelApp)) throw new Error("App inválido."); return v as PapelApp; };

const ABERTA = new Set(["procurando", "a_caminho", "no_local", "em_andamento"]);
const ponto = (v: unknown): Ponto => {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const lat = num(o.lat), lng = num(o.lng);
  return { texto: txt(o.texto, 200), ...(lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : {}) };
};

/** Corpo cru (foto e áudio) com limite de tamanho. */
const bruto = (max: number) => (req: Request, res: Response, next: NextFunction) => {
  if (Number(req.headers["content-length"] ?? 0) > max) return res.status(413).json({ erro: `Arquivo grande demais (máximo ${Math.round(max / 1024)} KB).` });
  express.raw({ type: () => true, limit: max })(req, res, (err?: unknown) => (err ? res.status(413).json({ erro: "Arquivo grande demais." }) : next()));
};
const corpo = (req: Request) => (Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0));

// ====================================================================== público: cidades, login com senha, criar conta

export const rotasPublicasV2 = express.Router({ mergeParams: true });

const podeConsultar = limitador(120, 10 * 60_000);
const podeEntrar = limitador(8, 10 * 60_000);
const podeEntrarIp = limitador(40, 10 * 60_000);
// Cadastros por IP por hora (APPS_CADASTROS_POR_IP, padrão 10). Redes de celular compartilham IP: ajuste se precisar.
const podeCriar = limitador(() => Number(process.env.APPS_CADASTROS_POR_IP) || 10, 60 * 60_000);

rotasPublicasV2.get("/cidades", ok((req, res) => {
  res.json({ cidades: cidadesAtendidas(emp(req)).map((c) => ({ id: c.codigo, nome: c.nome, uf: c.uf })) });
}));

rotasPublicasV2.post("/conta/existe", ok((req, res) => {
  if (!podeConsultar(`${emp(req)}|${req.ip}`)) throw demais("Muitas consultas. Espere um pouco.");
  const papel = papelDe(req.body?.papel);
  const login = String(req.body?.login ?? "");
  const c = localizar(emp(req), papel, login);
  res.json(c ? { existe: true, temSenha: temSenha(emp(req), papel, c.chave), mascarado: mascarar(c, login.includes("@")) } : { existe: false, temSenha: false, mascarado: "" });
}));

rotasPublicasV2.post("/conta/entrar", ok((req, res) => {
  const papel = papelDe(req.body?.papel);
  const login = String(req.body?.login ?? "").trim().toLowerCase();
  if (!podeEntrar(`${emp(req)}|${papel}|${login}`) || !podeEntrarIp(`${emp(req)}|${req.ip}`)) throw demais("Muitas tentativas. Espere alguns minutos.");
  const c = localizar(emp(req), papel, login);
  if (c && !temSenha(emp(req), papel, c.chave)) throw new Error("Esta conta ainda não tem senha. Toque em \"Esqueci a senha\" para criar uma.");
  if (!c || !senhaConfere(String(req.body?.senha ?? ""), pessoa(emp(req), papel, c.chave).senha)) throw new Error("Telefone, e-mail ou senha incorretos.");
  const { token, sessao } = criarSessao(emp(req), papel, c.telefone);
  res.json({ token, eu: euCompleto(emp(req), sessao) });
}));

rotasPublicasV2.post("/conta/criar", ok((req, res) => {
  if (!podeCriar(`${emp(req)}|${req.ip}`)) throw demais("Muitos cadastros deste aparelho. Tente mais tarde.");
  const papel = papelDe(req.body?.papel);
  const conta = papel === "motorista" ? criarContaMotorista(emp(req), req.body) : criarContaPassageiro(emp(req), req.body);
  const { token, sessao } = criarSessao(emp(req), papel, conta.telefone);
  res.json({ token, eu: euCompleto(emp(req), sessao) });
}));

rotasPublicasV2.post("/conta/esqueci", ok(async (req, res) => {
  const papel = papelDe(req.body?.papel);
  const c = localizar(emp(req), papel, String(req.body?.login ?? ""));
  // Quem não tem conta recebe a mesma resposta (não mostra quem é cliente).
  if (!c) return res.json({ enviado: true });
  res.json(await pedirCodigo(emp(req), papel, c.telefone, req.ip ?? ""));
}));

rotasPublicasV2.post("/conta/nova-senha", ok((req, res) => {
  const papel = papelDe(req.body?.papel);
  const c = localizar(emp(req), papel, String(req.body?.login ?? ""));
  if (!c) throw new Error("Código errado.");
  const { token, sessao } = entrar(emp(req), papel, c.telefone, String(req.body?.codigo ?? ""));
  definirSenha(emp(req), papel, c.chave, String(req.body?.senha ?? ""));
  res.json({ token, eu: euCompleto(emp(req), sessao) });
}));

// ---------------------------------------------------------------- APKs para baixar (página /apps/baixar/)

const APPS_APK = ["passageiro", "motorista"] as const;
const caminhoApk = (empresaId: string, app: string) => arquivo(empresaId, "apks", `${app}.apk`);
const podeBaixar = limitador(60, 10 * 60_000);

/** Quais APKs a empresa publicou (DADOS_DIR/empresas/<id>/apps/apks/<app>.apk, com <app>.json opcional: versão, nome e pacote). */
rotasPublicasV2.get("/apks", ok((req, res) => {
  const id = emp(req), m = D.marca(id);
  const arq = (n: string) => (n ? `/api/publico/arquivo/${id}/${n}` : null);
  const info = (app: (typeof APPS_APK)[number]) => {
    const caminho = caminhoApk(id, app);
    const extra = ler<{ versao?: string; nome?: string }>(arquivo(id, "apks", `${app}.json`), {});
    const nomeBase = m.app.nome || m.nomeExibido;
    const nome = extra.nome || (app === "motorista" ? `${nomeBase} Motorista` : nomeBase);
    if (!fs.existsSync(caminho)) return { existe: false, nome };
    const st = fs.statSync(caminho);
    return { existe: true, nome, tamanhoMb: st.size / 1048576, versao: extra.versao, em: st.mtime.toISOString() };
  };
  res.json({ empresa: id, nome: m.nomeExibido, cores: m.cores, logo: arq(m.arquivos.logoClaro || m.arquivos.iconeApp), passageiro: info("passageiro"), motorista: info("motorista") });
}));

rotasPublicasV2.get("/apks/:app", ok((req, res) => {
  if (!podeBaixar(`${emp(req)}|${req.ip}`)) throw demais("Muitos downloads. Espere um pouco.");
  const app = String(req.params.app);
  if (!(APPS_APK as readonly string[]).includes(app)) return res.status(404).json({ erro: "App não encontrado." });
  const caminho = caminhoApk(emp(req), app);
  if (!fs.existsSync(caminho)) return res.status(404).json({ erro: "Este app ainda não foi publicado." });
  const nome = `${D.marca(emp(req)).nomeExibido}-${app}`.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "") || app;
  res.setHeader("Content-Type", "application/vnd.android.package-archive");
  res.setHeader("Content-Disposition", `attachment; filename="${nome}.apk"`);
  res.setHeader("Content-Length", String(fs.statSync(caminho).size));
  res.setHeader("X-Content-Type-Options", "nosniff");
  fs.createReadStream(caminho).pipe(res);
}));

// ====================================================================== com token

export const rotasV2 = express.Router({ mergeParams: true });

// ---------------------------------------------------------------- conta e foto

rotasV2.post("/conta/senha", ok((req, res) => {
  const { empresaId, sessao } = ctx(req);
  const p = pessoa(empresaId, sessao.papel, sessao.chave);
  if (p.senha && !senhaConfere(String(req.body?.atual ?? ""), p.senha)) throw new Error("A senha atual está errada.");
  definirSenha(empresaId, sessao.papel, sessao.chave, String(req.body?.nova ?? ""));
  res.json({ ok: true });
}));

rotasV2.post("/conta/excluir", ok((req, res) => {
  const { empresaId, sessao, token } = ctx(req);
  const p = pessoa(empresaId, sessao.papel, sessao.chave);
  if (p.senha && !senhaConfere(String(req.body?.senha ?? ""), p.senha)) throw new Error("Senha errada.");
  p.exclusaoPedidaEm = agoraBr().toISOString();
  salvarPessoa(empresaId, sessao.papel, sessao.chave, p);
  escreverParaCentral(empresaId, sessao.papel, sessao.chave, "Pedido de exclusão da minha conta feito pelo aplicativo.");
  if (sessao.papel === "motorista") P.ficarOffline(empresaId, sessao.chave);
  sair(empresaId, token);
  res.json({ ok: true });
}));

rotasV2.post("/foto", bruto(MAX_FOTO), ok((req, res) => {
  const { empresaId, sessao } = ctx(req);
  salvarFoto(empresaId, sessao.papel, sessao.chave, String(req.headers["content-type"] ?? ""), corpo(req));
  res.json({ foto: urlDaFoto(empresaId, sessao.papel, sessao.chave) });
}));

/** A foto só abre para a própria pessoa e para quem está numa corrida aberta com ela (ou numa contra-oferta). */
function podeVerFoto(req: Request, papel: PapelApp, chave: string): boolean {
  const { empresaId, sessao } = ctx(req);
  if (sessao.papel === papel && sessao.chave === chave) return true;
  const lista = listarProprias(empresaId);
  if (sessao.papel === "passageiro" && papel === "motorista") {
    const minhas = lista.filter((c) => c.passageiro.telefone === sessao.chave && ABERTA.has(c.status));
    return minhas.some((c) => c.motoristaId === chave || (c.status === "procurando" && P.contraofertasDaCorrida(empresaId, c.id).some((o) => o.motoristaId === chave)));
  }
  if (sessao.papel === "motorista" && papel === "passageiro") return lista.some((c) => c.motoristaId === sessao.chave && c.passageiro.telefone === chave && ABERTA.has(c.status));
  return false;
}

function enviarArquivo(res: Response, a: { caminho: string; mime: string } | null, privado = true) {
  if (!a) return res.status(404).json({ erro: "Arquivo não encontrado." });
  res.setHeader("Content-Type", a.mime);
  res.setHeader("Cache-Control", privado ? "private, max-age=3600" : "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  fs.createReadStream(a.caminho).pipe(res);
}

rotasV2.get("/foto/:papel/:chave", ok((req, res) => {
  const papel = papelDe(req.params.papel);
  if (!podeVerFoto(req, papel, req.params.chave)) return res.status(404).json({ erro: "Foto não encontrada." });
  enviarArquivo(res, arquivoDaFoto(ctx(req).empresaId, papel, req.params.chave));
}));

// ---------------------------------------------------------------- configurações que os apps leem

/** Cupons ativos e dentro da validade, para a tela "Meus Cupons" do passageiro. */
rotasV2.get("/cupons", so("passageiro"), ok((req, res) => {
  const hoje = agoraBr().toISOString().slice(0, 10);
  const lista = listar(ctx(req).empresaId, cadastroPorId("cupons")!)
    .filter((c) => c.ativo === true && !(c.inicio && String(c.inicio) > hoje) && !(c.fim && String(c.fim) < hoje))
    .map((c) => ({
      codigo: String(c.codigo ?? ""), tipo: c.tipoDesconto === "Valor fixo" ? "valor" : "percentual", valor: Number(c.valor) || 0,
      maximo: typeof c.valorMaximo === "number" && c.valorMaximo > 0 ? c.valorMaximo : null,
      ate: c.fim ? String(c.fim) : null, categorias: String(c.categorias ?? "").split(",").map((x) => x.trim()).filter(Boolean),
    }))
    .filter((c) => c.codigo);
  res.json({ cupons: lista });
}));
rotasV2.get("/opcionais", ok((req, res) => res.json({ opcionais: ajustes(ctx(req).empresaId).opcionais })));
rotasV2.get("/motivos-cancelamento", ok((req, res) => {
  const a = ajustes(ctx(req).empresaId);
  res.json({ motivos: ctx(req).sessao.papel === "motorista" ? a.motivosMotorista : a.motivosPassageiro });
}));
rotasV2.get("/etiquetas-avaliacao", ok((req, res) => { const a = ajustes(ctx(req).empresaId); res.json({ boas: a.etiquetasBoas, ruins: a.etiquetasRuins }); }));
rotasV2.get("/contatos", ok((req, res) => res.json(contatos(ctx(req).empresaId))));
rotasV2.get("/mensagens-rapidas", ok((req, res) => res.json({ mensagens: ajustes(ctx(req).empresaId).mensagensRapidas })));

// ---------------------------------------------------------------- passageiro

rotasV2.get("/lugares", so("passageiro"), ok((req, res) => res.json(lugares(ctx(req).empresaId, ctx(req).sessao.chave))));
rotasV2.post("/lugares", so("passageiro"), ok((req, res) => res.json(salvarLugar(ctx(req).empresaId, ctx(req).sessao.chave, String(req.body?.tipo ?? ""), String(req.body?.nome ?? ""), req.body?.ponto))));
rotasV2.post("/lugares/:id/remover", so("passageiro"), ok((req, res) => res.json(removerLugar(ctx(req).empresaId, ctx(req).sessao.chave, req.params.id))));

/** O passageiro muda o valor que oferece enquanto procura motorista. */
rotasV2.post("/corridas/:id/oferta", so("passageiro"), ok(async (req, res) => {
  const { empresaId, sessao } = ctx(req);
  const c = P.corridaDoApp(empresaId, req.params.id, "passageiro", sessao.chave);
  if (c.status !== "procurando") throw new Error("Só dá para mudar o valor enquanto procuramos um motorista.");
  const v = arred(num(req.body?.valor) ?? NaN);
  if (!(v > 0)) throw new Error("Valor inválido.");
  const minimo = P.minimoDaCategoria(empresaId, c.categoria);
  if (v < minimo) throw new Error(`O valor não pode ficar abaixo de R$ ${minimo.toFixed(2).replace(".", ",")}.`);
  if (c.estimativa.valor != null && v > c.estimativa.valor * 3) throw new Error("O valor está muito acima do preço estimado.");
  const feita = await alterarCorrida(empresaId, c.id, (x) => {
    x.valorOferecido = x.estimativa.valor != null && v === x.estimativa.valor ? null : v;
    x.desconto = (P.descontoPeloValor(empresaId, x, v)) || null;
  });
  P.atualizarOferta(empresaId, feita.id);
  res.json({ corrida: P.corridaParaApp(empresaId, feita, "passageiro") });
}));

function contraofertasParaApp(empresaId: string, corridaId: string) {
  const mot = new Map(listar(empresaId, cadastroPorId("motoristas")!).map((m) => [m.id, m]));
  return P.contraofertasDaCorrida(empresaId, corridaId).map((o) => {
    const m = mot.get(o.motoristaId);
    const est = estatisticas(empresaId, "motorista", o.motoristaId);
    return {
      id: o.id, valor: o.valor, distanciaKm: o.distanciaKm, expira: o.expira, segundos: Math.max(0, Math.round((o.expira - Date.now()) / 1000)),
      motorista: { nome: String(m?.nome ?? ""), nota: est.nota, viagens: est.viagens, veiculo: String(m?.veiculo ?? ""), placa: String(m?.placa ?? ""), foto: urlDaFoto(empresaId, "motorista", o.motoristaId) },
    };
  });
}
rotasV2.get("/corridas/:id/contraofertas", so("passageiro"), ok((req, res) => {
  const { empresaId, sessao } = ctx(req);
  const c = P.corridaDoApp(empresaId, req.params.id, "passageiro", sessao.chave);
  res.json({ contraofertas: c.status === "procurando" ? contraofertasParaApp(empresaId, c.id) : [] });
}));
rotasV2.post("/corridas/:id/contraofertas/:oferta/aceitar", so("passageiro"), ok(async (req, res) => {
  const { empresaId, sessao } = ctx(req);
  const feita = await P.aceitarContraoferta(empresaId, sessao.chave, req.params.id, req.params.oferta);
  res.json({ corrida: P.corridaParaApp(empresaId, feita, "passageiro") });
}));

/** Edita a rota com a corrida aberta (paradas e destino): recalcula a estimativa e avisa o motorista. */
rotasV2.post("/corridas/:id/rota", so("passageiro"), ok(async (req, res) => {
  const { empresaId, sessao } = ctx(req);
  const c = P.corridaDoApp(empresaId, req.params.id, "passageiro", sessao.chave);
  if (!ABERTA.has(c.status)) throw new Error("Esta corrida já terminou.");
  const pedidas = req.body?.paradas !== undefined ? (Array.isArray(req.body.paradas) ? req.body.paradas : []) : c.paradas ?? [];
  const paradas = pedidas.map(ponto).filter((p: Ponto) => p.texto).slice(0, 3).map((p: Ponto) => completarPonto(empresaId, p)!);
  if (Array.isArray(req.body?.paradas) && req.body.paradas.filter((p: Ponto) => p?.texto).length > 3) throw new Error("No máximo 3 paradas.");
  const destino = req.body?.destino !== undefined ? completarPonto(empresaId, ponto(req.body.destino)) : c.destino;
  if (!destino?.texto) throw new Error("Informe o destino.");
  const pontos = [c.embarque, ...paradas, destino];
  let km: number | null = null, minutos: number | null = null;
  if (pontos.every((p) => p.lat != null && p.lng != null)) {
    km = 0; minutos = 0;
    for (let i = 1; i < pontos.length; i++) { const r = await rota({ lat: pontos[i - 1].lat!, lng: pontos[i - 1].lng! }, { lat: pontos[i].lat!, lng: pontos[i].lng! }); km += r.distanciaKm; minutos += r.minutos; }
    km = arred(km);
  }
  const est = estimarPreco(empresaId, { categoria: c.categoria, distanciaKm: km, minutos, embarque: c.embarque, destino, paradas: paradas.length });
  const feita = await alterarCorrida(empresaId, c.id, (x) => {
    const seguia = x.valorOferecido == null || x.valorOferecido === x.estimativa.valor;
    x.paradas = paradas.length ? paradas : undefined;
    x.destino = destino;
    x.estimativa = { valor: est.valor, distanciaKm: km ?? x.estimativa.distanciaKm, minutos };
    if (seguia) x.valorOferecido = null;
    x.historico.push({ em: agoraBr().toISOString(), status: x.status, por: "app do passageiro", nota: "Rota editada" });
  });
  P.atualizarOferta(empresaId, feita.id);
  P.vigiar(empresaId);
  res.json({ corrida: P.corridaParaApp(empresaId, feita, "passageiro") });
}));

// ---------------------------------------------------------------- motorista: corridas, contra-oferta, maçaneta

rotasV2.get("/corridas-abertas", so("motorista"), ok((req, res) => res.json(P.corridasAbertas(ctx(req).empresaId, ctx(req).sessao.chave))));

rotasV2.post("/corridas/:id/pegar", so("motorista"), ok(async (req, res) => {
  const { empresaId, sessao } = ctx(req);
  const c = await P.pegarCorrida(empresaId, sessao.chave, req.params.id);
  res.json({ corrida: P.corridaParaApp(empresaId, c, "motorista") });
}));

rotasV2.post("/corridas/:id/contraoferta", so("motorista"), ok((req, res) => {
  const { empresaId, sessao } = ctx(req);
  const o = P.registrarContraoferta(empresaId, sessao.chave, req.params.id, req.body?.valor);
  res.json({ contraoferta: { id: o.id, valor: o.valor, expira: o.expira, segundos: 60 } });
}));

/** A chamada atual (valor bruto, taxa da central e líquido já calculados no servidor). */
rotasV2.get("/ofertas", so("motorista"), ok((req, res) => {
  const { empresaId, sessao } = ctx(req);
  const o = P.ofertaDoMotorista(empresaId, sessao.chave);
  res.json({ oferta: o ? P.ofertaParaApp(empresaId, o) : null });
}));

rotasV2.post("/macaneta", so("motorista"), ok(async (req, res) => {
  const { empresaId, sessao } = ctx(req);
  const modo = req.body?.modo === "destino" ? "destino" : "taximetro";
  const lat = num(req.body?.lat), lng = num(req.body?.lng);
  if (lat == null || lng == null) throw new Error("Ligue o GPS para abrir a corrida.");
  const c = await P.criarMacaneta(empresaId, sessao.chave, {
    modo, categoria: txt(req.body?.categoria, 60), destino: req.body?.destino ? ponto(req.body.destino) : undefined, lat, lng,
    passageiro: { nome: txt(req.body?.passageiro?.nome, 80), telefone: soDigitos(req.body?.passageiro?.telefone) },
  });
  res.json({ corrida: P.corridaParaApp(empresaId, c, "motorista") });
}));

// ---------------------------------------------------------------- motorista: cadastro, veículos, ganhos

rotasV2.get("/cadastro", so("motorista"), ok((req, res) => res.json(cadastroDoMotorista(ctx(req).empresaId, ctx(req).sessao.chave))));
rotasV2.post("/cadastro/dados", so("motorista"), ok((req, res) => res.json(salvarDadosDoMotorista(ctx(req).empresaId, ctx(req).sessao.chave, req.body ?? {}))));
rotasV2.post("/cadastro/endereco", so("motorista"), ok((req, res) => res.json(salvarEnderecoDoMotorista(ctx(req).empresaId, ctx(req).sessao.chave, req.body ?? {}))));
rotasV2.get("/cep/:cep", so("motorista"), ok((req, res) => {
  const r = buscarCep(ctx(req).empresaId, req.params.cep);
  if (!r) return res.status(404).json({ erro: "CEP não encontrado. Preencha à mão." });
  res.json(r);
}));

rotasV2.get("/veiculos", so("motorista"), ok((req, res) => res.json({ veiculos: veiculos(ctx(req).empresaId, ctx(req).sessao.chave) })));
rotasV2.post("/veiculos", so("motorista"), ok((req, res) => res.json({ veiculos: salvarVeiculo(ctx(req).empresaId, ctx(req).sessao.chave, req.body ?? {}) })));
rotasV2.post("/veiculos/:id/ativar", so("motorista"), ok((req, res) => res.json({ veiculos: ativarVeiculo(ctx(req).empresaId, ctx(req).sessao.chave, req.params.id) })));
rotasV2.post("/veiculos/:id/excluir", so("motorista"), ok((req, res) => res.json({ veiculos: excluirVeiculo(ctx(req).empresaId, ctx(req).sessao.chave, req.params.id) })));
rotasV2.post("/veiculos/:id", so("motorista"), ok((req, res) => res.json({ veiculos: salvarVeiculo(ctx(req).empresaId, ctx(req).sessao.chave, req.body ?? {}, req.params.id) })));

rotasV2.get("/aceitacao", so("motorista"), ok((req, res) => res.json(P.taxaDeAceitacao(ctx(req).empresaId, ctx(req).sessao.chave))));

/** Com ?periodo=mes|semana: ganhos completos da tela de histórico. Sem: o resumo simples (hoje, 7 e 30 dias). */
rotasV2.get("/ganhos", so("motorista"), ok((req, res) => {
  const { empresaId, sessao } = ctx(req);
  const periodo = req.query.periodo === "semana" ? "semana" : req.query.periodo === "mes" ? "mes" : null;
  res.json(periodo ? P.ganhosPeriodo(empresaId, sessao.chave, periodo, String(req.query.mes ?? "")) : P.ganhos(empresaId, sessao.chave));
}));

// ---------------------------------------------------------------- chat com a central (suporte)

rotasV2.get("/suporte", ok((req, res) => {
  const { empresaId, sessao } = ctx(req);
  const mensagens = mensagensDoSuporte(empresaId, sessao.papel, sessao.chave);
  marcarSuporteLido(empresaId, sessao.papel, sessao.chave);
  res.json({ mensagens });
}));
rotasV2.get("/suporte/nao-lidas", ok((req, res) => res.json({ naoLidas: naoLidasDoSuporte(ctx(req).empresaId, ctx(req).sessao.papel, ctx(req).sessao.chave) })));
rotasV2.post("/suporte", ok((req, res) => res.json({ mensagem: escreverParaCentral(ctx(req).empresaId, ctx(req).sessao.papel, ctx(req).sessao.chave, String(req.body?.texto ?? "")) })));
rotasV2.post("/suporte/audio", bruto(5 * 1024 * 1024), ok((req, res) => {
  const { empresaId, sessao } = ctx(req);
  res.json({ mensagem: audioParaCentral(empresaId, sessao.papel, sessao.chave, String(req.headers["content-type"] ?? ""), corpo(req), num(req.headers["x-segundos"])) });
}));
rotasV2.get("/suporte/audio/:audio", ok((req, res) => enviarArquivo(res, arquivoDoAudioDoSuporte(ctx(req).empresaId, ctx(req).sessao.papel, ctx(req).sessao.chave, req.params.audio))));

/** O passageiro abriu o chat da corrida: as mensagens até agora contam como lidas. */
rotasV2.post("/corridas/:id/chat/lida", ok((req, res) => {
  const { empresaId, sessao } = ctx(req);
  const c = P.corridaDoApp(empresaId, req.params.id, sessao.papel, sessao.chave);
  marcarLida(empresaId, c.id, sessao.papel);
  res.json({ ok: true });
}));

// ====================================================================== central (painel)

export const rotasV2Central = express.Router();
const emC = (req: Request) => req.ctx!.empresaId;
const quem = (req: Request) => req.ctx!.usuario.email;

function cartaoDoMotorista(empresaId: string, m: Record<string, unknown> & { id: string }) {
  const p = pessoa(empresaId, "motorista", m.id);
  return {
    id: m.id, nome: String(m.nome ?? ""), cpf: String(m.cpf ?? ""), telefone: String(m.telefone ?? ""), email: String(m.email ?? ""), nascimento: String(m.nascimento ?? ""),
    genero: String(m.genero ?? ""), chavePix: String(m.chavePix ?? ""), situacao: String(m.status ?? ""), cidade: String(m.cidade ?? ""),
    endereco: { cep: String(m.cep ?? ""), rua: String(m.rua ?? ""), numero: String(m.numero ?? ""), complemento: String(m.complemento ?? ""), bairro: String(m.bairro ?? ""), uf: String(m.uf ?? "") },
    veiculos: p.veiculos, foto: !!p.foto, documentos: Object.fromEntries(Object.entries(p.documentos).map(([k, d]) => [k, { situacao: d.situacao, motivo: d.motivo, em: d.em }])),
    pendencias: pendenciasDoMotorista(empresaId, m.id),
  };
}

/** Cadastros de motoristas que esperam a aprovação da central. */
rotasV2Central.get("/aprovacoes", ok((req, res) => {
  const e = emC(req);
  res.json({ motoristas: listar(e, cadastroPorId("motoristas")!).filter((m) => m.status === "Aguardando aprovação").map((m) => cartaoDoMotorista(e, m)) });
}));

rotasV2Central.post("/aprovacoes/:id/aprovar", exigirPapel("admin", "operador"), ok((req, res) => {
  const e = emC(req);
  const pend = pendenciasDoMotorista(e, req.params.id);
  if (pend.length && req.body?.forcar !== true) throw new Error(`Faltam itens no cadastro: ${pend.join(", ")}. Marque "aprovar mesmo assim" se quiser.`);
  const m = alterarCampos(e, cadastroPorId("motoristas")!, req.params.id, { status: "Ativo" }, quem(req));
  const p = pessoa(e, "motorista", req.params.id);
  p.veiculos = p.veiculos.map((v) => ({ ...v, situacao: "Aprovado" }));
  salvarPessoa(e, "motorista", req.params.id, p);
  responderPelaCentral(e, "motorista", req.params.id, "Seu cadastro foi aprovado! Você já pode ficar online e receber corridas.");
  res.json({ motorista: cartaoDoMotorista(e, m) });
}));

rotasV2Central.post("/aprovacoes/:id/recusar", exigirPapel("admin", "operador"), ok((req, res) => {
  const e = emC(req);
  const motivo = txt(req.body?.motivo, 200);
  if (!motivo) throw new Error("Diga o motivo da recusa.");
  const m = alterarCampos(e, cadastroPorId("motoristas")!, req.params.id, { status: "Inativo", observacao: `Recusado: ${motivo}` }, quem(req));
  responderPelaCentral(e, "motorista", req.params.id, `Seu cadastro não foi aprovado: ${motivo}`);
  res.json({ motorista: cartaoDoMotorista(e, m) });
}));

rotasV2Central.get("/suporte", ok((req, res) => res.json({ conversas: conversasDoSuporte(emC(req)) })));
rotasV2Central.get("/suporte/:papel/:chave", ok((req, res) => {
  const papel = papelDe(req.params.papel);
  res.json({ mensagens: mensagensDoSuporte(emC(req), papel, req.params.chave, 300).map((m) => ({ ...m, de: m.de === "eu" ? "pessoa" : "central" })) });
}));
rotasV2Central.post("/suporte/:papel/:chave", exigirPapel("admin", "operador"), ok((req, res) => {
  res.json({ mensagem: responderPelaCentral(emC(req), papelDe(req.params.papel), req.params.chave, String(req.body?.texto ?? "")) });
}));
rotasV2Central.get("/suporte/:papel/:chave/audio/:audio", ok((req, res) => enviarArquivo(res, arquivoDoAudioDoSuporte(emC(req), papelDe(req.params.papel), req.params.chave, req.params.audio), false)));
rotasV2Central.get("/foto/:papel/:chave", ok((req, res) => enviarArquivo(res, arquivoDaFoto(emC(req), papelDe(req.params.papel), req.params.chave), false)));
