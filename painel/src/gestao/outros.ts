// Cadastro › Passageiros, Cupons, Empresas, Áreas, Desafios e Indicações (rotas da gestão).

import type { Router } from "express";
import { atualizar, criar, type Registro } from "../cadastros/armazem.ts";
import { listarProprias, type CorridaPropria } from "../corridas/index.ts";
import { lancar, pessoa, salvarPessoa } from "../apps/extras.ts";
import { banco } from "../servidor/banco.ts";
import { hashSenha } from "../servidor/dados.ts";
import { arred, normal } from "../servidor/util.ts";
import { gravarG, lerG } from "./armazem.ts";
import { cad, contem, digitos, emp, hojeBr, ok, paginar, perfisApp, periodo, quem, registros, soAdmin, texto } from "./comum.ts";
import { contaParaDesafio, corridaFicouPendente, TIPOS_DESAFIO_CORRIDA } from "./desafio-regra.ts";
import { areas, FUSOS, removerArea, salvarArea } from "./regras.ts";

const diaBr = (iso: unknown) => (typeof iso === "string" && iso ? new Date(Date.parse(iso) - 3 * 3_600_000).toISOString().slice(0, 10) : "");

// ====================================================================== passageiros

const ORIGENS: Record<string, string> = { App: "App", Painel: "Central", Motorista: "Motorista" };

function notasDosPassageiros(corridas: CorridaPropria[]) {
  const m = new Map<string, number[]>();
  for (const c of corridas) if (c.avaliacaoPassageiro?.nota) m.set(c.passageiro.telefone, [...(m.get(c.passageiro.telefone) ?? []), c.avaliacaoPassageiro.nota]);
  return new Map([...m].map(([t, l]) => [t, arred(l.reduce((a, b) => a + b, 0) / l.length)]));
}

function rotasPassageiros(r: Router) {
  r.get("/passageiros", ok((req, res) => {
    const e = emp(req), q = req.query as Record<string, unknown>;
    const notas = notasDosPassageiros(listarProprias(e));
    const todos = registros(e, "clientes").map((c) => ({
      id: c.id, nome: String(c.nome ?? ""), telefone: String(c.telefone ?? ""), email: String(c.email ?? ""), cidade: String(c.cidade ?? ""),
      genero: String(c.genero ?? ""), dispositivo: String(c.dispositivo ?? "Não identificado"), origem: String(c.origemCadastro ?? "Painel"),
      nota: notas.get(String(c.telefone)) ?? null, status: String(c.status ?? "Ativo"), bloqueado: c.status === "Bloqueado" || c.status === "Suspenso",
    }));
    const st = String(q.status ?? "Todos"), disp = String(q.dispositivo ?? "Todos");
    const f = todos.filter((c) => (!texto(q.cidade) || normal(c.cidade) === normal(q.cidade)) && contem(c.nome, texto(q.nome))
      && (!digitos(q.telefone) || c.telefone.includes(digitos(q.telefone)))
      && (disp === "Todos" || normal(c.dispositivo) === normal(disp))
      && (st === "Todos" || (st === "Bloqueados" ? c.bloqueado : !c.bloqueado)));
    const tipo = String(q.tipo ?? "Todos");
    const daAba = f.filter((c) => tipo === "Todos" || c.origem === tipo).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    const pg = paginar(daAba, q.pagina);
    res.json({ passageiros: pg.itens, paginacao: pg.paginacao, contadores: { todos: f.length, ...Object.fromEntries(Object.keys(ORIGENS).map((o) => [o, f.filter((c) => c.origem === o).length])) } });
  }));

  r.get("/passageiros/:id", ok((req, res) => {
    const c = registros(emp(req), "clientes").find((x) => x.id === req.params.id);
    if (!c) throw new Error("Passageiro não encontrado.");
    res.json({ passageiro: c, nota: notasDosPassageiros(listarProprias(emp(req))).get(String(c.telefone)) ?? null });
  }));

  const CAMPOS = ["nome", "genero", "telefone", "email", "avaliouApp", "notaApp", "origemCadastro", "motoristaOrigem", "cidade", "status", "dispositivo"];
  const salvar = (req: import("express").Request, anterior: Registro | null) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const d: Record<string, unknown> = { ...(anterior ?? { status: "Ativo", origemCadastro: "Painel" }) };
    for (const k of CAMPOS) if (k in b) d[k] = b[k];
    const reg = anterior ? atualizar(emp(req), cad("clientes"), anterior.id, d, quem(req)) : criar(emp(req), cad("clientes"), d, quem(req));
    if (typeof b.senha === "string" && b.senha.trim()) {
      if (b.senha.trim().length < 6) throw new Error("A senha precisa de pelo menos 6 caracteres.");
      const s = lerG<Record<string, string>>(emp(req), "senhas-passageiros", {});
      s[reg.id] = hashSenha(b.senha.trim());
      gravarG(emp(req), "senhas-passageiros", s);
    }
    return reg;
  };
  r.post("/passageiros", ok((req, res) => res.json({ passageiro: salvar(req, null) })));
  r.put("/passageiros/:id", ok((req, res) => {
    const a = registros(emp(req), "clientes").find((x) => x.id === req.params.id);
    if (!a) throw new Error("Passageiro não encontrado.");
    res.json({ passageiro: salvar(req, a) });
  }));
  r.post("/passageiros/:id/status", ok((req, res) => {
    const a = registros(emp(req), "clientes").find((x) => x.id === req.params.id);
    if (!a) throw new Error("Passageiro não encontrado.");
    res.json({ passageiro: atualizar(emp(req), cad("clientes"), a.id, { ...a, status: req.body?.bloqueado === true ? "Bloqueado" : "Ativo" }, quem(req)) });
  }));

  // Restrições: motoristas que não recebem chamado deste passageiro (o despacho já respeita).
  const passageiroTel = (req: import("express").Request) => {
    const a = registros(emp(req), "clientes").find((x) => x.id === req.params.id);
    if (!a) throw new Error("Passageiro não encontrado.");
    return String(a.telefone);
  };
  const listaRestricoes = (empresaId: string, tel: string) => {
    const mot = new Map(registros(empresaId, "motoristas").map((m) => [m.id, m]));
    return pessoa(empresaId, "passageiro", tel).bloqueados.map((id) => ({ id, nome: String(mot.get(id)?.nome ?? "Motorista removido"), placa: String(mot.get(id)?.placa ?? "") }));
  };
  r.get("/passageiros/:id/restricoes", ok((req, res) => res.json({ restritos: listaRestricoes(emp(req), passageiroTel(req)) })));
  r.post("/passageiros/:id/restricoes", ok((req, res) => {
    const e = emp(req), tel = passageiroTel(req), mid = String(req.body?.motoristaId ?? "");
    if (!registros(e, "motoristas").some((m) => m.id === mid)) throw new Error("Escolha o motorista.");
    const p = pessoa(e, "passageiro", tel);
    if (!p.bloqueados.includes(mid)) { p.bloqueados = [...p.bloqueados, mid]; p.favoritos = p.favoritos.filter((x) => x !== mid); salvarPessoa(e, "passageiro", tel, p); }
    res.json({ restritos: listaRestricoes(e, tel) });
  }));
  r.delete("/passageiros/:id/restricoes/:motoristaId", ok((req, res) => {
    const e = emp(req), tel = passageiroTel(req);
    const p = pessoa(e, "passageiro", tel);
    p.bloqueados = p.bloqueados.filter((x) => x !== req.params.motoristaId);
    salvarPessoa(e, "passageiro", tel, p);
    res.json({ restritos: listaRestricoes(e, tel) });
  }));
}

// ====================================================================== cupons

export function situacaoCupom(c: Registro, usos: number, hoje = hojeBr()): "Ativo" | "Vencido" | "Esgotado" | "Inativo" {
  if (c.ativo !== true) return "Inativo";
  if (c.fim && String(c.fim) < hoje) return "Vencido";
  if (typeof c.limiteUsos === "number" && c.limiteUsos > 0 && usos >= c.limiteUsos) return "Esgotado";
  return "Ativo";
}

function rotasCupons(r: Router) {
  r.get("/cupons", ok((req, res) => {
    const e = emp(req), q = req.query as Record<string, unknown>;
    const uso = new Map<string, { usos: number; desconto: number }>();
    for (const c of listarProprias(e)) {
      if (!c.cupom || c.status === "cancelada" || c.status === "nao_atendida") continue;
      const k = normal(c.cupom), u = uso.get(k) ?? { usos: 0, desconto: 0 };
      u.usos++; u.desconto += c.desconto ?? 0; uso.set(k, u);
    }
    const todos = registros(e, "cupons").map((c): Registro & { usos: number; descontoTotal: number; situacao: string } => {
      const u = uso.get(normal(c.codigo)) ?? { usos: 0, desconto: 0 };
      return { ...c, usos: u.usos, descontoTotal: arred(u.desconto), situacao: situacaoCupom(c, u.usos) };
    });
    const st = String(q.status ?? "Todos");
    const f = todos.filter((c) => contem(c.codigo, texto(q.busca)) && (st === "Todos" || (st === "Validos" ? c.situacao === "Ativo" : st === "Vencidos" ? c.situacao === "Vencido" || c.situacao === "Esgotado" : c.situacao === "Inativo")))
      .sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)));
    const pg = paginar(f, q.pagina);
    res.json({ cupons: pg.itens, paginacao: pg.paginacao, kpis: { total: todos.length, usos: todos.reduce((a, c) => a + c.usos, 0), economia: arred(todos.reduce((a, c) => a + c.descontoTotal, 0)) } });
  }));
}

// ====================================================================== empresas

function rotasEmpresas(r: Router) {
  r.get("/empresas", ok((req, res) => {
    const e = emp(req), q = req.query as Record<string, unknown>;
    const clientes = registros(e, "clientes");
    const mes = hojeBr().slice(0, 7);
    const gastoPorTel = new Map<string, number>();
    for (const c of listarProprias(e)) if (c.status === "finalizada" && (c.finalizadaEm ?? "").slice(0, 7) === mes) gastoPorTel.set(c.passageiro.telefone, (gastoPorTel.get(c.passageiro.telefone) ?? 0) + (c.valor ?? 0));
    const todas = registros(e, "conveniadas").map((x): Registro & { funcionarios: number; faturaMes: number; ativa: boolean } => {
      const func = clientes.filter((c) => c.conveniada && normal(c.conveniada) === normal(x.nome));
      return { ...x, funcionarios: func.length, faturaMes: arred(func.reduce((a, c) => a + (gastoPorTel.get(String(c.telefone)) ?? 0), 0)), ativa: x.status === "Ativa" };
    });
    const f = todas.filter((x) => contem(x.nome, texto(q.busca)) || (digitos(q.busca) && String(x.cnpj ?? "").replace(/\D/g, "").includes(digitos(q.busca))))
      .sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
    const pg = paginar(f, q.pagina);
    res.json({ empresas: pg.itens, paginacao: pg.paginacao, kpis: { ativas: todas.filter((x) => x.ativa).length, faturaMes: arred(todas.reduce((a, x) => a + x.faturaMes, 0)) } });
  }));

  r.post("/empresas/:id/funcionarios", soAdmin, ok((req, res) => {
    const e = emp(req);
    const x = registros(e, "conveniadas").find((c) => c.id === req.params.id);
    if (!x) throw new Error("Empresa não encontrada.");
    const tel = digitos(req.body?.telefone);
    const c = registros(e, "clientes").find((p) => String(p.telefone) === tel);
    if (!c) throw new Error("Passageiro não encontrado com este telefone.");
    res.json({ passageiro: atualizar(e, cad("clientes"), c.id, { ...c, conveniada: x.nome }, quem(req)) });
  }));
}

// ====================================================================== áreas

function rotasAreas(r: Router) {
  r.get("/areas", ok((req, res) => res.json({ areas: areas(emp(req)), fusos: FUSOS })));
  r.post("/areas", soAdmin, ok((req, res) => res.json({ area: salvarArea(emp(req), { ...req.body, id: undefined }) })));
  r.put("/areas/:id", soAdmin, ok((req, res) => res.json({ area: salvarArea(emp(req), { ...req.body, id: req.params.id }) })));
  r.delete("/areas/:id", soAdmin, ok((req, res) => { removerArea(emp(req), req.params.id); res.json({ ok: true }); }));
}

// ====================================================================== desafios

const fimDoDesafio = (d: Registro) => `${d.fim ?? "9999-12-31"}T${/^\d{2}:\d{2}$/.test(String(d.horaFim)) ? d.horaFim : "23:59"}`;
const inicioDoDesafio = (d: Registro) => `${d.inicio ?? "0000-01-01"}T${/^\d{2}:\d{2}$/.test(String(d.horaInicio)) ? d.horaInicio : "00:00"}`;

export function situacaoDesafio(d: Registro, agora = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 16)): "Ativo" | "Aguardando" | "Cancelado" | "Finalizado" | "Pausado" {
  if (d.cancelado === true) return "Cancelado";
  if (fimDoDesafio(d) < agora) return "Finalizado";
  if (d.ativo !== true) return "Pausado";
  return inicioDoDesafio(d) > agora ? "Aguardando" : "Ativo";
}

/** Motoristas que recebem o desafio: ativos, da categoria e com o total de corridas finalizadas na faixa. */
function desafiados(empresaId: string, d: Record<string, unknown>, corridas: CorridaPropria[]) {
  const cats = String(d.categorias ?? "").split(",").map(normal).filter(Boolean);
  const fin = new Map<string, number>();
  for (const c of corridas) if (c.status === "finalizada" && c.motoristaId) fin.set(c.motoristaId, (fin.get(c.motoristaId) ?? 0) + 1);
  const min = d.corridasMin == null || d.corridasMin === "" ? null : Number(d.corridasMin), max = d.corridasMax == null || d.corridasMax === "" ? null : Number(d.corridasMax);
  return registros(empresaId, "motoristas").filter((m) => {
    if (m.status !== "Ativo") return false;
    const mc = String(m.categorias ?? "").split(",").map(normal).filter(Boolean);
    if (cats.length && mc.length && !mc.some((c) => cats.includes(c))) return false;
    const n = fin.get(m.id) ?? 0;
    return (min == null || n >= min) && (max == null || n <= max);
  });
}

function progressoDoDesafio(empresaId: string, d: Registro, corridas: CorridaPropria[]) {
  const tipo = String(d.tipo ?? ""), meta = Number(d.meta) || 0, premio = typeof d.premio === "number" ? d.premio : 0;
  const ini = inicioDoDesafio(d), fim = fimDoDesafio(d);
  const cats = String(d.categorias ?? "").split(",").map(normal).filter(Boolean);
  const perfis = perfisApp(empresaId, "motorista");
  const pagos = lerG<Record<string, Record<string, string>>>(empresaId, "desafios-pagos", {})[d.id] ?? {};
  return desafiados(empresaId, d, corridas).map((m) => {
    const minhas = corridas.filter((c) => c.motoristaId === m.id && c.status === "finalizada" && (c.finalizadaEm ?? "").slice(0, 16) >= ini && (c.finalizadaEm ?? "").slice(0, 16) <= fim
      && (!cats.length || cats.includes(normal(c.categoria)))).sort((a, b) => String(a.finalizadaEm).localeCompare(String(b.finalizadaEm)));
    const contam = TIPOS_DESAFIO_CORRIDA.includes(tipo) ? minhas.filter((c) => contaParaDesafio(tipo, c)) : [];
    const feito = contam.length;
    const pago = !!perfis.get(m.id)?.premios.includes(d.id) || !!pagos[m.id];
    const situacao = meta > 0 && feito >= meta ? "Concluído" : feito > 0 ? "Participando" : "Pendente";
    return {
      id: m.id, nome: String(m.nome ?? ""), feito, meta, situacao, aceitoEm: contam[0]?.finalizadaEm ?? null,
      finalizadoEm: situacao === "Concluído" ? contam[meta - 1]?.finalizadaEm ?? null : null,
      pago, valorPago: pago ? premio : 0, aguardandoAprovacao: situacao === "Concluído" && !pago && d.aprovacao === "Manual",
      app: minhas.filter((c) => c.canal === "app").length, macaneta: minhas.filter((c) => c.canal === "totem").length, pendencia: minhas.filter(corridaFicouPendente).length,
    };
  });
}

function rotasDesafios(r: Router) {
  r.get("/desafios", ok((req, res) => {
    const e = emp(req), q = req.query as Record<string, unknown>, corridas = listarProprias(e);
    const todos = registros(e, "desafios").filter((d) => TIPOS_DESAFIO_CORRIDA.includes(String(d.tipo))).map((d): Registro & { situacao: string; desafiados: number; participando: number; concluidos: number; gastoAtual: number } => {
      const prog = progressoDoDesafio(e, d, corridas);
      return {
        ...d, situacao: situacaoDesafio(d), desafiados: prog.length, participando: prog.filter((p) => p.situacao !== "Pendente").length,
        concluidos: prog.filter((p) => p.situacao === "Concluído").length, gastoAtual: arred(prog.filter((p) => p.pago).length * (Number(d.premio) || 0)),
      };
    });
    const aba = String(q.status ?? "Todos");
    const mapa: Record<string, string[]> = { Ativos: ["Ativo"], Aguardando: ["Aguardando", "Pausado"], Cancelados: ["Cancelado"], Finalizados: ["Finalizado"] };
    const f = todos.filter((d) => (aba === "Todos" || mapa[aba]?.includes(d.situacao)) && contem(d.nome, texto(q.busca))).sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)));
    res.json({ desafios: f, kpis: { ativos: todos.filter((d) => d.situacao === "Ativo").length, aguardando: todos.filter((d) => d.situacao === "Aguardando" || d.situacao === "Pausado").length, cancelados: todos.filter((d) => d.situacao === "Cancelado").length, finalizados: todos.filter((d) => d.situacao === "Finalizado").length } });
  }));

  r.get("/desafios-previa", ok((req, res) => {
    const e = emp(req), n = desafiados(e, req.query as Record<string, unknown>, listarProprias(e)).length;
    const premio = Number(String(req.query.premio ?? "0").replace(",", ".")) || 0;
    res.json({ motoristas: n, gastoMaximo: arred(n * premio) });
  }));

  r.get("/desafios/:id", ok((req, res) => {
    const e = emp(req);
    const d = registros(e, "desafios").find((x) => x.id === req.params.id);
    if (!d) throw new Error("Desafio não encontrado.");
    const prog = progressoDoDesafio(e, d, listarProprias(e));
    const premio = Number(d.premio) || 0;
    res.json({
      desafio: { ...d, situacao: situacaoDesafio(d) }, motoristas: prog,
      resumo: { desafiados: prog.length, participando: prog.filter((p) => p.situacao !== "Pendente").length, concluidos: prog.filter((p) => p.situacao === "Concluído").length,
        gastoMaximo: arred(prog.length * premio), gastoEsperado: arred(prog.filter((p) => p.situacao === "Concluído").length * premio), gastoReal: arred(prog.filter((p) => p.pago).length * premio) },
    });
  }));

  r.post("/desafios", soAdmin, ok((req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const nome = texto(b.nome, 30);
    if (!nome) throw new Error("Informe o nome do desafio.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.inicio)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(b.fim))) throw new Error("Informe as datas de início e fim.");
    if (`${b.fim}T${b.horaFim ?? "23:59"}` <= `${b.inicio}T${b.horaInicio ?? "00:00"}`) throw new Error("A data final precisa ser depois do início.");
    if (!(Number(b.meta) > 0)) throw new Error("Informe a meta do desafio.");
    const d = criar(emp(req), cad("desafios"), {
      nome, tipo: TIPOS_DESAFIO_CORRIDA.includes(String(b.tipo)) ? b.tipo : "Desafio de corridas", meta: b.meta, premio: b.premio, inicio: b.inicio, fim: b.fim,
      horaInicio: texto(b.horaInicio, 5) || "00:00", horaFim: texto(b.horaFim, 5) || "23:59", categorias: texto(b.categorias, 200), aprovacao: b.aprovacao === "Manual" ? "Manual" : "Automático",
      corridasMin: b.corridasMin ?? null, corridasMax: b.corridasMax ?? null, ativo: true, cancelado: false, regras: texto(b.regras, 1000),
    }, quem(req));
    res.json({ desafio: d });
  }));

  const mudar = (req: import("express").Request, f: (d: Registro) => Record<string, unknown>) => {
    const d = registros(emp(req), "desafios").find((x) => x.id === req.params.id);
    if (!d) throw new Error("Desafio não encontrado.");
    return atualizar(emp(req), cad("desafios"), d.id, { ...d, ...f(d) }, quem(req));
  };
  r.post("/desafios/:id/ativar", soAdmin, ok((req, res) => res.json({ desafio: mudar(req, (d) => { if (d.cancelado === true) throw new Error("Desafio cancelado não volta."); return { ativo: d.ativo !== true }; }) })));
  r.post("/desafios/:id/cancelar", soAdmin, ok((req, res) => res.json({ desafio: mudar(req, () => ({ cancelado: true, ativo: false })) })));

  /** Aprovação manual: paga o prêmio na carteira do motorista (uma vez). */
  r.post("/desafios/:id/aprovar/:motoristaId", soAdmin, ok((req, res) => {
    const e = emp(req);
    const d = registros(e, "desafios").find((x) => x.id === req.params.id);
    if (!d) throw new Error("Desafio não encontrado.");
    const p = progressoDoDesafio(e, d, listarProprias(e)).find((x) => x.id === req.params.motoristaId);
    if (!p || p.situacao !== "Concluído") throw new Error("O motorista ainda não completou o desafio.");
    if (p.pago) throw new Error("A recompensa já foi paga.");
    const premio = Number(d.premio) || 0;
    if (premio > 0) lancar(e, "motorista", p.id, premio, `Prêmio: ${String(d.nome)}`, quem(req));
    const perf = pessoa(e, "motorista", p.id);
    salvarPessoa(e, "motorista", p.id, { ...perf, premios: [...perf.premios, d.id] });
    const pagos = lerG<Record<string, Record<string, string>>>(e, "desafios-pagos", {});
    pagos[d.id] = { ...(pagos[d.id] ?? {}), [p.id]: new Date().toISOString() };
    gravarG(e, "desafios-pagos", pagos);
    res.json({ ok: true });
  }));
}

// ====================================================================== indicações

function rotasIndicacoes(r: Router) {
  r.get("/indicacoes", ok((req, res) => {
    const e = emp(req);
    const [de, ate] = periodo(String(req.query.periodo ?? "este_mes"), req.query.inicio, req.query.fim);
    const corridas = listarProprias(e);
    const mot = new Map(registros(e, "motoristas").map((m) => [m.id, m]));
    const cli = new Map(registros(e, "clientes").map((c) => [String(c.telefone), c]));
    const nomeDe = (papel: string, chave: string) => String((papel === "motorista" ? mot.get(chave)?.nome : cli.get(chave)?.nome) ?? (papel === "passageiro" ? chave : "Sem nome"));
    const linhas = banco().prepare("SELECT papel, chave, codigo, indicado_por AS indicadoPor FROM app_pessoas WHERE empresa = ?").all(e) as Array<{ papel: string; chave: string; codigo: string; indicadoPor: string }>;
    const porCodigo = new Map(linhas.map((l) => [l.codigo, l]));
    const desafiosInd = registros(e, "desafios").filter((d) => String(d.tipo).startsWith("Indicação"));
    const comissao = (papelNovato: string) => Number(desafiosInd.find((d) => d.ativo === true && d.tipo === (papelNovato === "passageiro" ? "Indicação de passageiro" : "Indicação de motorista"))?.premio) || 0;
    const historico = linhas.filter((l) => l.indicadoPor).map((l) => {
      const emb = porCodigo.get(l.indicadoPor);
      const reg = l.papel === "motorista" ? mot.get(l.chave) : cli.get(l.chave);
      const em = String(reg?.criadoEm ?? "");
      const meta = corridas.some((c) => c.status === "finalizada" && (l.papel === "passageiro" ? c.passageiro.telefone === l.chave : c.motoristaId === l.chave));
      return { em, papelNovato: l.papel, novato: nomeDe(l.papel, l.chave), papelEmbaixador: emb?.papel ?? "", embaixadorChave: emb?.chave ?? "", embaixador: emb ? nomeDe(emb.papel, emb.chave) : `Código ${l.indicadoPor}`, metaBatida: meta, comissao: comissao(l.papel) };
    }).filter((h) => !h.em || (diaBr(h.em) >= de && diaBr(h.em) <= ate)).sort((a, b) => b.em.localeCompare(a.em));
    // Prêmios de indicação já pagos (carteira), no período.
    const nomesInd = desafiosInd.map((d) => `Prêmio: ${String(d.nome)}`);
    const pagos = nomesInd.length ? (banco().prepare(`SELECT papel, chave, valor, em FROM carteira WHERE empresa = ? AND descricao IN (${nomesInd.map(() => "?").join(",")})`).all(e, ...nomesInd) as Array<{ papel: string; chave: string; valor: number; em: string }>)
      .filter((p) => p.em.slice(0, 10) >= de && p.em.slice(0, 10) <= ate) : [];
    const ranking = (papel: string) => {
      const m = new Map<string, { nome: string; convites: number; ganho: number }>();
      for (const h of historico) if (h.papelEmbaixador === papel) { const x = m.get(h.embaixadorChave) ?? { nome: h.embaixador, convites: 0, ganho: 0 }; x.convites++; m.set(h.embaixadorChave, x); }
      for (const p of pagos) if (p.papel === papel && m.has(p.chave)) m.get(p.chave)!.ganho += p.valor;
      return [...m.values()].map((x) => ({ ...x, ganho: arred(x.ganho) })).sort((a, b) => b.convites - a.convites || b.ganho - a.ganho).slice(0, 50);
    };
    const pagoTotal = arred(pagos.reduce((a, p) => a + p.valor, 0));
    res.json({
      periodo: { inicio: de, fim: ate },
      kpis: { total: historico.length, metas: historico.filter((h) => h.metaBatida).length, pago: pagoTotal, gastoTotal: pagoTotal },
      historico: historico.slice(0, 100), motoristas: ranking("motorista"), passageiros: ranking("passageiro"),
    });
  }));
}

export function rotasOutros(r: Router) {
  rotasPassageiros(r); rotasCupons(r); rotasEmpresas(r); rotasAreas(r); rotasDesafios(r); rotasIndicacoes(r);
}
