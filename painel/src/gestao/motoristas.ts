// Cadastro › Motoristas, Destravar Motoristas e Veículos (rotas da gestão).
//
// Lista com filtros e contadores por situação, janela do motorista (Geral, Veículos, Financeiro, Documentos,
// Cerca eletrônica e Controle de créditos), alterar situação, nova senha, punições e destravar.

import express, { type Router } from "express";
import { SITUACOES_MOTORISTA } from "../comum/cadastros.ts";
import { atualizar, criar, remover, type Registro } from "../cadastros/armazem.ts";
import { cancelarCorrida, listarProprias } from "../corridas/index.ts";
import { estaOnline } from "../apps/despacho.ts";
import { arquivo, ler } from "../apps/armazem.ts";
import { enviarDocumento, extrato, lancar, pessoa, saldo, saldos, TIPOS_DOCUMENTO, MAX_DOC } from "../apps/extras.ts";
import { agoraBr, arred, normal } from "../servidor/util.ts";
import { cad, contem, digitos, emp, ok, paginar, quem, registros, soAdmin, texto } from "./comum.ts";
import {
  areas, configMotorista, creditosPadrao, definirSenha, liberarPunicao, punicoes, punicoesEmVigor, punir, salvarCerca,
  salvarCreditosPadrao, salvarFinanceiro, situacaoCreditos,
} from "./regras.ts";

/** Aba da lista -> situações que ela mostra. */
export const ABAS_MOTORISTA: Record<string, string[]> = {
  ativos: ["Ativo"], analise: ["Em análise", "Aguardando aprovação"], fila: ["Fila de espera"], bloqueados: ["Bloqueado"],
  rejeitados: ["Rejeitado"], inativos: ["Inativo"], lixeira: ["Lixeira"],
};
const abaDe = (status: unknown) => Object.entries(ABAS_MOTORISTA).find(([, l]) => l.includes(String(status)))?.[0] ?? "ativos";

const diaBr = (iso: unknown) => (typeof iso === "string" && iso ? new Date(Date.parse(iso) - 3 * 3_600_000).toISOString().slice(0, 10) : "");

/** Situação da CNH pela validade. */
export function situacaoCnh(validade: unknown, hoje = agoraBr().toISOString().slice(0, 10)): "valida" | "nao_preenchida" | "vence_30" | "vencida" {
  const v = String(validade ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return "nao_preenchida";
  if (v < hoje) return "vencida";
  return Date.parse(v) - Date.parse(hoje) <= 30 * 86_400_000 ? "vence_30" : "valida";
}

/** Veículo em uso de cada motorista (cadastro Veículos), com reserva no próprio cadastro do motorista. */
function veiculosPorMotorista(empresaId: string) {
  const m = new Map<string, Registro[]>();
  for (const v of registros(empresaId, "veiculos")) {
    const id = String(v.motoristaId ?? "");
    if (id) m.set(id, [...(m.get(id) ?? []), v]);
  }
  return m;
}

function linhaMotorista(empresaId: string, m: Registro, ctx: { veiculos: Map<string, Registro[]>; saldo: Map<string, number>; tokens: Set<string> }) {
  const doMot = ctx.veiculos.get(m.id) ?? [];
  const ativo = doMot.find((v) => v.emUso === true);
  return {
    id: m.id, nome: String(m.nome ?? ""), cpf: String(m.cpf ?? ""), telefone: String(m.telefone ?? ""), email: String(m.email ?? ""), cidade: String(m.cidade ?? ""),
    veiculo: ativo ? [ativo.modelo, ativo.cor].filter(Boolean).join(" ") : String(m.veiculo ?? ""),
    placa: String(ativo?.placa ?? m.placa ?? ""), ano: Number(ativo?.ano ?? m.anoVeiculo) || null,
    nivel: String(m.nivel ?? "Secundário"), saldo: ctx.saldo.get(m.id) ?? 0, status: String(m.status ?? ""), aba: abaDe(m.status),
    viatura: String(m.viatura ?? ""), categorias: String(m.categorias ?? ""), validadeCnh: m.validadeCnh ?? null, cnh: situacaoCnh(m.validadeCnh),
    criadoEm: m.criadoEm,
    diagnostico: { online: estaOnline(empresaId, m.id), app: ctx.tokens.has(m.id), fantasma: m.fantasma === true, versao: null as string | null },
  };
}

function contexto(empresaId: string) {
  const tokens = new Set(ler<Array<{ papel: string; chave: string }>>(arquivo(empresaId, "push.json"), []).filter((t) => t.papel === "motorista").map((t) => t.chave));
  return { veiculos: veiculosPorMotorista(empresaId), saldo: new Map(saldos(empresaId).filter((s) => s.papel === "motorista").map((s) => [s.chave, s.saldo])), tokens };
}

/** Lista de motoristas com os filtros da tela. */
export function listarMotoristas(empresaId: string, q: Record<string, unknown>) {
  const ctx = contexto(empresaId);
  const todos = registros(empresaId, "motoristas").map((m) => linhaMotorista(empresaId, m, ctx));
  const s = (k: string) => texto(q[k], 120);
  const lista = (k: string) => s(k).split(",").map((x) => x.trim()).filter(Boolean);
  const cats = lista("categorias").map(normal), cnh = lista("cnh");
  const anoDe = Number(q.anoDe) || 0, anoAte = Number(q.anoAte) || 0;
  const filtrados = todos.filter((m) =>
    (!s("cidade") || normal(m.cidade) === normal(s("cidade"))) && contem(m.nome, s("nome")) && (!digitos(s("cpf")) || m.cpf.includes(digitos(s("cpf"))))
    && contem(m.viatura, s("viatura")) && (!s("placa") || normal(m.placa).replace(/[^a-z0-9]/g, "").includes(normal(s("placa")).replace(/[^a-z0-9]/g, "")))
    && (!digitos(s("telefone")) || m.telefone.includes(digitos(s("telefone")))) && contem(m.email, s("email"))
    && (!anoDe || (m.ano ?? 0) >= anoDe) && (!anoAte || (m.ano != null && m.ano <= anoAte))
    && (!s("dataIni") || diaBr(m.criadoEm) >= s("dataIni")) && (!s("dataFim") || diaBr(m.criadoEm) <= s("dataFim"))
    && (!cats.length || m.categorias.split(",").map(normal).some((c) => cats.includes(c)) || (!m.categorias.trim()))
    && (!cnh.length || cnh.includes(m.cnh)));
  const contadores: Record<string, number> = { todos: filtrados.filter((m) => m.aba !== "lixeira").length };
  for (const a of Object.keys(ABAS_MOTORISTA)) contadores[a] = filtrados.filter((m) => m.aba === a).length;
  const aba = s("aba") || "todos";
  const daAba = filtrados.filter((m) => (aba === "todos" ? m.aba !== "lixeira" : m.aba === aba)).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const p = paginar(daAba, q.pagina);
  return { motoristas: p.itens, paginacao: p.paginacao, contadores };
}

function achar(empresaId: string, id: string): Registro {
  const m = registros(empresaId, "motoristas").find((x) => x.id === id);
  if (!m) { const e = new Error("Motorista não encontrado."); (e as Error & { status: number }).status = 404; throw e; }
  return m;
}

/** Só os campos do cadastro que vieram no formulário (os outros ficam como estavam). */
function juntar(anterior: Registro | null, dados: Record<string, unknown>, campos: string[]) {
  const novo: Record<string, unknown> = { ...(anterior ?? {}) };
  for (const k of campos) if (k in dados) novo[k] = dados[k];
  return novo;
}
const CAMPOS_MOTORISTA = ["cidade", "nome", "cpf", "telefone", "email", "nascimento", "genero", "nivel", "endereco", "numero", "cep", "bairro", "chavePix", "viatura", "cnhNumero", "validadeCnh", "status", "fantasma", "cobranca", "cobrancaTipo", "cobrancaValor", "categorias", "observacao"];

export function rotasMotoristas(r: Router) {
  r.get("/cidades", ok((req, res) => {
    const nomes = new Set(areas(emp(req)).map((a) => a.nome));
    for (const m of registros(emp(req), "motoristas")) if (m.cidade) nomes.add(String(m.cidade));
    res.json({ cidades: [...nomes].sort((a, b) => a.localeCompare(b, "pt-BR")), categorias: registros(emp(req), "categorias").map((c) => String(c.nome ?? "")).filter(Boolean) });
  }));

  r.get("/motoristas", ok((req, res) => res.json(listarMotoristas(emp(req), req.query as Record<string, unknown>))));

  /** Busca rápida (punições, veículos, restrições). */
  r.get("/motoristas-busca", ok((req, res) => {
    const b = texto(req.query.q, 60);
    res.json({ motoristas: registros(emp(req), "motoristas").filter((m) => m.status !== "Lixeira" && (contem(m.nome, b) || (digitos(b) && String(m.cpf ?? "").includes(digitos(b)))))
      .slice(0, 30).map((m) => ({ id: m.id, nome: String(m.nome ?? ""), email: String(m.email ?? ""), cpf: String(m.cpf ?? ""), status: String(m.status ?? "") })) });
  }));

  r.get("/motoristas/:id", ok((req, res) => {
    const e = emp(req), m = achar(e, req.params.id);
    const c = configMotorista(e, m.id);
    const corridas = listarProprias(e).filter((x) => x.motoristaId === m.id);
    const p = pessoa(e, "motorista", m.id);
    res.json({
      motorista: m,
      financeiro: { taxa: c.taxa, saldo: c.saldo, mensagens: c.mensagens, saque: c.saque, temSenha: !!c.senhaHash, senhaEm: c.senhaEm || null },
      padrao: creditosPadrao(e),
      cerca: c.cerca,
      veiculos: veiculosPorMotorista(e).get(m.id) ?? [],
      documentos: Object.entries(TIPOS_DOCUMENTO).map(([tipo, nome]) => ({ tipo, nome, ...(p.documentos[tipo] ? { situacao: p.documentos[tipo].situacao, motivo: p.documentos[tipo].motivo, em: p.documentos[tipo].em } : { situacao: "Pendente" }) })),
      resumo: { finalizadas: corridas.filter((x) => x.status === "finalizada").length, versaoApp: null, aceitacao: null, online: estaOnline(e, m.id) },
      creditos: situacaoCreditos(e, m.id),
    });
  }));

  /** Histórico: últimas corridas do motorista. */
  r.get("/motoristas/:id/historico", ok((req, res) => {
    const e = emp(req), m = achar(e, req.params.id);
    const l = listarProprias(e).filter((c) => c.motoristaId === m.id).sort((a, b) => b.solicitadaEm.localeCompare(a.solicitadaEm)).slice(0, 100);
    res.json({ corridas: l.map((c) => ({ id: c.id, os: c.os, em: c.solicitadaEm, status: c.status, embarque: c.embarque.texto, passageiro: c.passageiro.nome, valor: c.valor })) });
  }));

  r.post("/motoristas", ok((req, res) => {
    const e = emp(req), b = (req.body ?? {}) as Record<string, unknown>;
    const dados = juntar(null, (b.dados ?? {}) as Record<string, unknown>, CAMPOS_MOTORISTA);
    if (!dados.status) dados.status = "Em análise";
    const m = criar(e, cad("motoristas"), dados, quem(req));
    if (b.financeiro) salvarFinanceiro(e, m.id, b.financeiro as Record<string, unknown>);
    res.json({ motorista: m });
  }));

  r.put("/motoristas/:id", ok((req, res) => {
    const e = emp(req), anterior = achar(e, req.params.id), b = (req.body ?? {}) as Record<string, unknown>;
    const m = atualizar(e, cad("motoristas"), anterior.id, juntar(anterior, (b.dados ?? {}) as Record<string, unknown>, CAMPOS_MOTORISTA), quem(req));
    if (b.financeiro) salvarFinanceiro(e, m.id, b.financeiro as Record<string, unknown>);
    res.json({ motorista: m });
  }));

  r.post("/motoristas/:id/status", ok((req, res) => {
    const e = emp(req), m = achar(e, req.params.id), status = String(req.body?.status ?? "");
    if (!SITUACOES_MOTORISTA.includes(status)) throw new Error("Situação inválida.");
    res.json({ motorista: atualizar(e, cad("motoristas"), m.id, { ...m, status }, quem(req)) });
  }));

  r.post("/motoristas/:id/senha", ok((req, res) => {
    const e = emp(req), m = achar(e, req.params.id);
    definirSenha(e, m.id, String(req.body?.senha ?? ""));
    res.json({ ok: true });
  }));

  r.post("/motoristas/:id/documentos/:tipo", express.raw({ type: ["image/*", "application/pdf"], limit: MAX_DOC }), ok((req, res) => {
    const e = emp(req), m = achar(e, req.params.id);
    const bytes = req.body instanceof Buffer ? new Uint8Array(req.body) : new Uint8Array();
    if (!bytes.length) throw new Error("Arquivo vazio.");
    res.json({ documento: enviarDocumento(e, m.id, req.params.tipo, String(req.headers["content-type"] ?? "").split(";")[0], bytes) });
  }));

  // ---------------------------------------------------------------- cerca eletrônica

  r.get("/motoristas/:id/cerca", ok((req, res) => {
    const e = emp(req), m = achar(e, req.params.id);
    res.json({ cerca: configMotorista(e, m.id).cerca, areas: areas(e).map((a) => ({ id: a.id, nome: a.nome, poligono: a.poligono })) });
  }));
  r.put("/motoristas/:id/cerca", soAdmin, ok((req, res) => {
    const e = emp(req), m = achar(e, req.params.id);
    res.json({ cerca: salvarCerca(e, m.id, req.body ?? {}).cerca });
  }));

  // ---------------------------------------------------------------- controle de créditos

  r.get("/motoristas/:id/creditos", ok((req, res) => {
    const e = emp(req), m = achar(e, req.params.id);
    const de = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.inicio)) ? String(req.query.inicio) : agoraBr().toISOString().slice(0, 10);
    const ate = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.fim)) ? String(req.query.fim) : de;
    const l = extrato(e, "motorista", m.id, 5000);
    const s = saldo(e, "motorista", m.id);
    const noPeriodo = l.filter((x) => x.em.slice(0, 10) >= de && x.em.slice(0, 10) <= ate);
    const depois = l.filter((x) => x.em.slice(0, 10) > ate).reduce((a, x) => a + x.valor, 0);
    const adicionados = noPeriodo.filter((x) => x.valor > 0).reduce((a, x) => a + x.valor, 0);
    const retirados = noPeriodo.filter((x) => x.valor < 0).reduce((a, x) => a - x.valor, 0);
    const finalPeriodo = arred(s - depois);
    const c = configMotorista(e, m.id);
    res.json({
      situacao: String(m.status ?? ""), nome: String(m.nome ?? ""), cpf: String(m.cpf ?? ""), creditos: situacaoCreditos(e, m.id),
      config: { taxa: c.taxa, saldo: c.saldo, mensagens: c.mensagens, saque: c.saque }, padrao: creditosPadrao(e),
      resumo: { inicio: de, fim: ate, saldoAnterior: arred(finalPeriodo - adicionados + retirados), adicionados: arred(adicionados), retirados: arred(retirados), total: arred(adicionados - retirados), saldoFinal: finalPeriodo },
      extrato: l.slice(0, 200),
    });
  }));
  r.put("/motoristas/:id/creditos", soAdmin, ok((req, res) => {
    const e = emp(req), m = achar(e, req.params.id);
    const c = salvarFinanceiro(e, m.id, req.body ?? {});
    res.json({ config: { taxa: c.taxa, saldo: c.saldo, mensagens: c.mensagens, saque: c.saque }, creditos: situacaoCreditos(e, m.id) });
  }));
  r.post("/motoristas/:id/creditos/lancar", soAdmin, ok((req, res) => {
    const e = emp(req), m = achar(e, req.params.id);
    const valor = Number(String(req.body?.valor ?? "").replace(",", "."));
    if (!Number.isFinite(valor) || valor === 0 || Math.abs(valor) > 10_000) throw new Error("Valor inválido.");
    const descricao = texto(req.body?.descricao, 120) || (valor > 0 ? "Crédito da central" : "Débito da central");
    res.json({ lancamento: lancar(e, "motorista", m.id, valor, descricao, quem(req)), creditos: situacaoCreditos(e, m.id) });
  }));

  /** Padrão da empresa (saldo mínimo, aviso de recarga, taxa). */
  r.get("/config-creditos", ok((req, res) => res.json({ config: creditosPadrao(emp(req)) })));
  r.put("/config-creditos", soAdmin, ok((req, res) => res.json({ config: salvarCreditosPadrao(emp(req), req.body ?? {}) })));

  // ---------------------------------------------------------------- punições

  r.get("/punicoes", ok((req, res) => {
    const e = emp(req), b = texto(req.query.busca, 60);
    const mot = new Map(registros(e, "motoristas").map((m) => [m.id, m]));
    const agora = Date.now();
    const l = punicoesEmVigor(e).map((p) => {
      const m = mot.get(p.motoristaId);
      const resta = Math.max(0, Date.parse(p.fim) - agora);
      const h = Math.floor(resta / 3_600_000), min = Math.floor((resta % 3_600_000) / 60_000);
      return { ...p, nome: String(m?.nome ?? "Motorista removido"), email: String(m?.email ?? ""), cpf: String(m?.cpf ?? ""), tempoRestante: h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${min}min` };
    }).filter((p) => contem(p.nome, b) || (digitos(b) && p.cpf.includes(digitos(b)))).sort((a, b2) => a.fim.localeCompare(b2.fim));
    const pg = paginar(l, req.query.pagina);
    res.json({ punicoes: pg.itens, paginacao: pg.paginacao, historico: punicoes(e).length });
  }));
  r.post("/punicoes", ok((req, res) => {
    const b = req.body ?? {};
    res.json({ punicao: punir(emp(req), String(b.motoristaId ?? ""), Number(b.tempo), b.unidade === "dias" ? "dias" : "horas", String(b.motivo ?? ""), quem(req)) });
  }));
  r.delete("/punicoes/:id", ok((req, res) => res.json({ punicao: liberarPunicao(emp(req), req.params.id, quem(req)) })));

  // ---------------------------------------------------------------- destravar

  r.get("/destravar", ok((req, res) => res.json({ travados: travados(emp(req)) })));
  r.post("/destravar/:corridaId", ok((req, res) => {
    const e = emp(req);
    const t = travados(e).find((x) => x.corridaId === req.params.corridaId);
    if (!t) throw new Error("Este motorista não está mais travado.");
    cancelarCorrida(e, t.corridaId, "Central", "Motorista destravado pela central", quem(req));
    res.json({ ok: true });
  }));

  // ---------------------------------------------------------------- veículos

  r.get("/veiculos", ok((req, res) => {
    const e = emp(req), q = req.query as Record<string, unknown>;
    const mot = new Map(registros(e, "motoristas").map((m) => [m.id, m]));
    const todos = registros(e, "veiculos").map((v) => {
      const m = mot.get(String(v.motoristaId ?? ""));
      return { id: v.id, modelo: String(v.modelo ?? ""), cor: String(v.cor ?? ""), placa: String(v.placa ?? ""), ano: v.ano ?? null, categoria: String(v.categoria ?? ""),
        motoristaId: String(v.motoristaId ?? ""), motorista: String(m?.nome ?? v.motorista ?? ""), statusMotorista: String(m?.status ?? ""), emUso: v.emUso === true };
    });
    const f = todos.filter((v) => (contem(v.modelo, texto(q.modelo)) || contem(v.cor, texto(q.modelo))) && contem(v.placa, texto(q.placa)) && contem(v.motorista, texto(q.motorista)));
    const status = String(q.status ?? "todos");
    const daAba = f.filter((v) => status === "todos" || (status === "ativo" ? v.emUso : !v.emUso)).sort((a, b) => a.modelo.localeCompare(b.modelo, "pt-BR"));
    const pg = paginar(daAba, q.pagina);
    res.json({ veiculos: pg.itens, paginacao: pg.paginacao, contadores: { todos: f.length, emUso: f.filter((v) => v.emUso).length, guardados: f.filter((v) => !v.emUso).length } });
  }));

  r.post("/veiculos", ok((req, res) => {
    const e = emp(req), b = req.body ?? {};
    const m = achar(e, String(b.motoristaId ?? ""));
    const jaTem = registros(e, "veiculos").some((v) => v.motoristaId === m.id && v.emUso === true);
    const v = criar(e, cad("veiculos"), { placa: String(b.placa ?? "").toUpperCase(), modelo: b.modelo, cor: b.cor, ano: b.ano, categoria: b.categoria, motorista: m.nome, motoristaId: m.id, emUso: !jaTem, status: "Ativo" }, quem(req));
    if (!jaTem) sincronizarMotorista(e, m, v, quem(req));
    res.json({ veiculo: v });
  }));

  r.post("/veiculos/:id/uso", ok((req, res) => {
    const e = emp(req), emUso = req.body?.emUso === true;
    const lista = registros(e, "veiculos");
    const v = lista.find((x) => x.id === req.params.id);
    if (!v) throw new Error("Veículo não encontrado.");
    if (emUso) for (const o of lista.filter((x) => x.motoristaId === v.motoristaId && x.id !== v.id && x.emUso === true)) atualizar(e, cad("veiculos"), o.id, { ...o, emUso: false }, quem(req));
    const novo = atualizar(e, cad("veiculos"), v.id, { ...v, emUso }, quem(req));
    const m = registros(e, "motoristas").find((x) => x.id === v.motoristaId);
    if (m) sincronizarMotorista(e, m, emUso ? novo : null, quem(req));
    res.json({ veiculo: novo });
  }));

  r.delete("/veiculos/:id", ok((req, res) => {
    const e = emp(req);
    const v = registros(e, "veiculos").find((x) => x.id === req.params.id);
    if (!v) throw new Error("Veículo não encontrado.");
    remover(e, cad("veiculos"), v.id);
    const m = v.emUso === true ? registros(e, "motoristas").find((x) => x.id === v.motoristaId) : null;
    if (m) sincronizarMotorista(e, m, null, quem(req));
    res.json({ ok: true });
  }));
}

/** O veículo em uso vai para o cadastro do motorista (é o que o app e o despacho mostram). */
function sincronizarMotorista(empresaId: string, m: Registro, v: Registro | null, por: string) {
  atualizar(empresaId, cad("motoristas"), m.id, { ...m, veiculo: v ? [v.modelo, v.cor].filter(Boolean).join(" ") : null, placa: v?.placa ?? null, anoVeiculo: v?.ano ?? null }, por);
}

/** Motorista travado: corrida com ele ainda aberta, mas sem nenhuma mudança há muito tempo. */
export const MINUTOS_TRAVADO = () => Number(process.env.GESTAO_MINUTOS_TRAVADO) || 120;
export function travados(empresaId: string) {
  const limite = agoraBr().getTime() - MINUTOS_TRAVADO() * 60_000;
  const mot = new Map(registros(empresaId, "motoristas").map((m) => [m.id, m]));
  return listarProprias(empresaId)
    .filter((c) => c.motoristaId && (c.status === "a_caminho" || c.status === "no_local" || c.status === "em_andamento"))
    .filter((c) => Date.parse(c.historico.at(-1)?.em ?? c.solicitadaEm) < limite)
    .map((c) => ({
      corridaId: c.id, os: c.os, motoristaId: c.motoristaId!, nome: String(mot.get(c.motoristaId!)?.nome ?? c.motorista), telefone: String(mot.get(c.motoristaId!)?.telefone ?? c.telefoneMotorista ?? ""),
      status: c.status, desde: c.historico.at(-1)?.em ?? c.solicitadaEm, embarque: c.embarque.texto, atencao: c.status === "em_andamento",
    }));
}
