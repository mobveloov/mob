// Cadastro › Passageiros, Cupons, Empresas, Áreas, Desafios e Indicações (rotas da gestão).

import type { Router } from "express";
import { atualizar, criar, type Registro } from "../cadastros/armazem.ts";
import { CUPONS_AUTOMATICOS, listarProprias, type CorridaPropria } from "../corridas/index.ts";
import { montarCsv } from "../config/financeiro-visao.ts";
import { lancar, pessoa, salvarPessoa } from "../apps/extras.ts";
import { banco } from "../servidor/banco.ts";
import { hashSenha } from "../servidor/dados.ts";
import { agoraBr, arred, celulaCsv, normal } from "../servidor/util.ts";
import { posicaoAoEditar } from "../comum/lugares-passageiro.ts";
import { gravarG, lerG } from "./armazem.ts";
import { cad, contem, digitos, emp, hojeBr, ok, paginar, perfisApp, periodo, quem, registros, soAdmin, soGestor, texto } from "./comum.ts";
import { clientesDesafiados, progressoClientes, TIPO_DESAFIO_CLIENTE } from "./desafio-cliente.ts";
import { contaParaDesafio, corridaFicouPendente, TIPOS_DESAFIO_CORRIDA } from "./desafio-regra.ts";
import { areas, FUSOS, removerArea, salvarArea } from "./regras.ts";
import { rotasEmpresas } from "./empresas.ts";
import { cartoesDaEmpresa, telefoneBase } from "./cadastros-machine.ts";
import { cpfValido } from "./validacao.ts";
import { ultimosContatos } from "../apps/sessoes.ts";
import { cupomEspecifico, situacaoDoCupom, type SituacaoCupom } from "../cadastros/cupom-regras.ts";

const dataBrasil = (iso: string) => { const d = new Date(Date.parse(iso) - 3 * 3_600_000).toISOString(); return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)} às ${d.slice(11, 16)}`; };
const diaBr = (iso: unknown) => (typeof iso === "string" && iso ? new Date(Date.parse(iso) - 3 * 3_600_000).toISOString().slice(0, 10) : "");

// ====================================================================== passageiros

const ORIGENS: Record<string, string> = { App: "App", Painel: "Central", Motorista: "Motorista" };
/** Rótulo do tipo de cliente (Machine). */
const TIPOS_CLIENTE: Record<string, string> = { App: "Passageiro App", Painel: "Passageiro Call-Center", Motorista: "Passageiro Maçaneta", Estabelecimento: "Estabelecimento" };
const ABREV_TIPO: Record<string, string> = { App: "Pass. App", Painel: "Call-Center", Motorista: "Maçaneta", Estabelecimento: "Estabelecimento" };
const BLOQUEADOS = new Set(["Bloqueado", "Suspenso", "Suspenso por nota", "Deletado"]);
/** Menos avaliações que isso: "Avaliações Insuficientes" (como na Machine). */
const MIN_AVALIACOES = 3;

function notasDosPassageiros(corridas: CorridaPropria[]) {
  const m = new Map<string, number[]>();
  for (const c of corridas) if (c.avaliacaoPassageiro?.nota) m.set(c.passageiro.telefone, [...(m.get(c.passageiro.telefone) ?? []), c.avaliacaoPassageiro.nota]);
  return new Map([...m].map(([t, l]) => [t, arred(l.reduce((a, b) => a + b, 0) / l.length)]));
}
function qtdNotas(corridas: CorridaPropria[]) {
  const m = new Map<string, number>();
  for (const c of corridas) if (c.avaliacaoPassageiro?.nota) m.set(c.passageiro.telefone, (m.get(c.passageiro.telefone) ?? 0) + 1);
  return m;
}

/** Cartões de resumo do cadastro do cliente (dados reais: corridas, cadastro, último contato do app). Versão do app não é guardada: null. */
export function resumoDoCliente(e: string, c: Registro, agora = Date.now()) {
  const tel = telefoneBase(c.telefone);
  const minhas = listarProprias(e).filter((x) => telefoneBase(x.passageiro.telefone) === tel);
  const contatos = ultimosContatos(e, "passageiro");
  const contato = [...contatos].find(([k]) => telefoneBase(k) === tel)?.[1] ?? null;
  const ultimaEstimativa = minhas.reduce((m, x) => (x.solicitadaEm > m ? x.solicitadaEm : m), "");
  return {
    corridas: minhas.length, cadastradoEm: String(c.criadoEm ?? "").slice(0, 10) || null,
    diasSemLogin: contato == null ? null : Math.max(0, Math.floor((agora - contato) / 86_400_000)),
    ultimaEstimativa: ultimaEstimativa ? ultimaEstimativa.slice(0, 10) : null, versaoApp: null as string | null,
    ativoDesde: String(c.criadoEm ?? "").slice(0, 10) || null,
    cpfValidado: cpfValido(c.cpf), emailValidado: c.emailValidado === true, emailBloqueado: c.emailBloqueado === true,
  };
}

function rotasPassageiros(r: Router) {
  /** Lista e filtros da tela Clientes (os mesmos para a planilha). */
  const listaClientes = (e: string, q: Record<string, unknown>) => {
    const proprias = listarProprias(e);
    const notas = notasDosPassageiros(proprias), qtd = qtdNotas(proprias);
    const comCartao = new Set<string>(), comCartaoNaoValidado = new Set<string>();
    for (const k of cartoesDaEmpresa(e)) (k.validado ? comCartao : comCartaoNaoValidado).add(telefoneBase(k.telefone));
    const todos = registros(e, "clientes").map((c) => {
      const origem = String(c.origemCadastro ?? "Painel"), tel = String(c.telefone ?? "");
      const nota = (qtd.get(tel) ?? 0) >= MIN_AVALIACOES ? notas.get(tel) ?? null : null;
      return {
        id: c.id, nome: String(c.nome ?? ""), telefone: tel, email: String(c.email ?? ""), cidade: String(c.cidade ?? ""), cpf: String(c.cpf ?? ""),
        genero: String(c.genero ?? ""), dispositivo: String(c.dispositivo ?? "Não identificado"), origem, tipo: TIPOS_CLIENTE[origem] ?? origem, tipoCurto: ABREV_TIPO[origem] ?? origem,
        nota, avaliacoes: qtd.get(tel) ?? 0, status: String(c.status ?? "Ativo"), bloqueado: BLOQUEADOS.has(String(c.status ?? "")),
        nascimento: String(c.nascimento ?? ""), criadoEm: diaBr(c.criadoEm),
        cartaoAtivo: comCartao.has(telefoneBase(tel)), cartaoNaoValidado: comCartaoNaoValidado.has(telefoneBase(tel)),
      };
    });
    const st = String(q.status ?? "Todos"), disp = String(q.dispositivo ?? "Todos");
    const listaSt = st.split("|").filter((x) => x && x !== "Todos");
    const tipoQ = String(q.tipo ?? "");
    const aval = Number(String(q.avaliacao ?? "").replace(",", ".")) || 0;
    const f = todos.filter((c) => (!texto(q.cidade) || normal(c.cidade) === normal(q.cidade)) && contem(c.nome, texto(q.nome))
      && (!digitos(q.telefone) || c.telefone.includes(digitos(q.telefone)))
      && (!digitos(q.cpf) || c.cpf.replace(/\D/g, "").includes(digitos(q.cpf)))
      && contem(c.email, texto(q.email))
      && (!q.nascIni || (c.nascimento && c.nascimento >= String(q.nascIni))) && (!q.nascFim || (c.nascimento && c.nascimento <= String(q.nascFim)))
      && (!q.cadIni || c.criadoEm >= String(q.cadIni)) && (!q.cadFim || c.criadoEm <= String(q.cadFim))
      && (!aval || (c.nota != null && c.nota >= aval))
      && (disp === "Todos" || normal(c.dispositivo) === normal(disp))
      && (!listaSt.length ? true : listaSt.some((x) => x === "Ativos" ? !c.bloqueado : x === "Bloqueados" ? c.bloqueado : normal(c.status) === normal(x)))
      && (!tipoQ || c.origem === tipoQ)
      // Cartões (dado real: tabela de cartões tokenizados). Marcando os dois, entra quem tem um ou outro.
      && (!(q.cartaoAtivo === "1" || q.cartaoNaoValidado === "1") || (q.cartaoAtivo === "1" && c.cartaoAtivo) || (q.cartaoNaoValidado === "1" && c.cartaoNaoValidado)));
    return { todos, f };
  };

  r.get("/passageiros", ok((req, res) => {
    const e = emp(req), q = req.query as Record<string, unknown>;
    const { f } = listaClientes(e, q);
    const tipo = String(q.tipo ?? "Todos");
    const daAba = f.filter((c) => tipo === "Todos" || c.origem === tipo).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    const pg = paginar(daAba, q.pagina, 10);
    res.json({ passageiros: pg.itens, paginacao: pg.paginacao, contadores: { todos: f.length, ...Object.fromEntries(Object.keys(ORIGENS).map((o) => [o, f.filter((c) => c.origem === o).length])) } });
  }));

  /** Exportar (CSV com proteção contra fórmula). */
  r.get("/passageiros/exportar", ok((req, res) => {
    const { f } = listaClientes(emp(req), req.query as Record<string, unknown>);
    const cab = ["Nome", "Telefone", "E-mail", "Avaliação", "Status", "Tipo"];
    const linhas = [cab.map(celulaCsv).join(";"), ...f.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")).map((c) => [c.nome, c.telefone, c.email, c.nota == null ? "Avaliações Insuficientes" : String(c.nota).replace(".", ","), c.status, c.tipoCurto].map(celulaCsv).join(";"))];
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="clientes-${hojeBr()}.csv"`);
    res.send("\ufeff" + linhas.join("\n"));
  }));

  r.get("/passageiros/:id", ok((req, res) => {
    const e = emp(req);
    const c = registros(e, "clientes").find((x) => x.id === req.params.id);
    if (!c) throw new Error("Passageiro não encontrado.");
    const tel = String(c.telefone);
    res.json({ passageiro: { ...c, foto: pessoa(e, "passageiro", tel).foto ? `/api/apps-central/foto/passageiro/${encodeURIComponent(tel)}` : null }, nota: notasDosPassageiros(listarProprias(e)).get(tel) ?? null, resumo: resumoDoCliente(e, c) });
  }));

  const CAMPOS = ["emailValidado", "emailBloqueado", "nome", "genero", "telefone", "email", "nascimento", "avaliouApp", "notaApp", "origemCadastro", "motoristaOrigem", "cidade", "status", "dispositivo", "cpf", "observacao"];
  const LUGARES = ["enderecoCasa", "enderecoTrabalho"];
  const salvar = (req: import("express").Request, anterior: Registro | null) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const d: Record<string, unknown> = { ...(anterior ?? { status: "Ativo", origemCadastro: "Painel" }) };
    for (const k of CAMPOS) if (k in b) d[k] = b[k];
    // Trocou o e-mail: a validação anterior não vale mais.
    if (anterior && "email" in b && String(b.email ?? "") !== String(anterior.email ?? "") && !("emailValidado" in b)) d.emailValidado = false;
    // Casa e trabalho: mesma regra do app (texto igual mantém a posição do mapa; texto novo usa a posição enviada).
    for (const k of LUGARES) {
      if (!(k in b)) continue;
      d[k] = String(b[k] ?? "").trim().slice(0, 200) || null;
      d[`${k}Pos`] = posicaoAoEditar(anterior?.[k], d[k], anterior?.[`${k}Pos`], b[`${k}Pos`]);
    }
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

/** Situação do cupom na lista (a Machine agrupa em Ativo, Inativo e Aguardando; Encerrado e Esgotado contam como Inativo). */
export function situacaoCupom(c: Registro, usos: number, hoje = hojeBr(), hora = "12:00"): SituacaoCupom {
  return situacaoDoCupom(c, usos, hoje, hora);
}
const GRUPO_CUPOM: Record<SituacaoCupom, "Ativos" | "Inativos" | "Aguardando"> = { Ativo: "Ativos", Aguardando: "Aguardando", Inativo: "Inativos", Encerrado: "Inativos", Esgotado: "Inativos" };

type CupomLinha = Registro & { usos: number; descontoTotal: number; situacao: string; grupo: string; publicoRotulo: string; detalhe: string };

/** Frase do cartão: "Encerrado em 01/10/2026", "Válido até ...", "Começa em ...". */
export function detalheDoCupom(c: Registro, situacao: SituacaoCupom): string {
  const br = (d: unknown) => String(d ?? "").split("-").reverse().join("/");
  if (situacao === "Encerrado") return `Encerrado em ${br(c.fim)}`;
  if (situacao === "Esgotado") return "Esgotado";
  if (situacao === "Aguardando") return `Começa em ${br(c.inicio)}`;
  if (situacao === "Inativo") return "Pausado";
  return c.fim ? `Válido até ${br(c.fim)}` : "Sem data para acabar";
}

/** Cupons da empresa com usos, desconto dado e situação. Os automáticos (PRIMEIRA CORRIDA e DE VOLTA) vêm sempre, inativos até alguém configurar. */
function cuponsDaEmpresa(e: string) {
  const uso = new Map<string, { usos: number; desconto: number }>();
  for (const c of listarProprias(e)) {
    if (!c.cupom || c.status === "cancelada" || c.status === "nao_atendida") continue;
    const k = normal(c.cupom), u = uso.get(k) ?? { usos: 0, desconto: 0 };
    u.usos++; u.desconto += c.desconto ?? 0; uso.set(k, u);
  }
  const agora = agoraBr().toISOString(), hoje = agora.slice(0, 10), hora = agora.slice(11, 16);
  const todos = registros(e, "cupons").map((c): CupomLinha => {
    const u = uso.get(normal(c.codigo)) ?? { usos: 0, desconto: 0 };
    const situacao = situacaoDoCupom(c, u.usos, hoje, hora);
    return { ...c, usos: u.usos, descontoTotal: arred(u.desconto), situacao, grupo: GRUPO_CUPOM[situacao], publicoRotulo: cupomEspecifico(c) ? "Exclusivo" : "Compartilhado", detalhe: detalheDoCupom(c, situacao) };
  });
  const automaticos = CUPONS_AUTOMATICOS.map((a) => {
    const reg = todos.find((c) => normal(c.codigo) === normal(a.codigo) && c.automatico === true);
    const u = uso.get(normal(a.codigo)) ?? { usos: 0, desconto: 0 };
    return reg ?? ({ id: "", codigo: a.codigo, descricao: a.descricao, automatico: true, ativo: false, tipoDesconto: "Percentual", valor: 0, usos: u.usos, descontoTotal: arred(u.desconto), situacao: "Inativo", grupo: "Inativos", publicoRotulo: "Compartilhado", detalhe: "Pausado" } as unknown as CupomLinha);
  }).map((c, i) => ({ ...c, limite: CUPONS_AUTOMATICOS[i].limite }));
  return { resgataveis: todos.filter((c) => c.automatico !== true), automaticos, todos };
}

/** Lista de cupons resgatáveis como a Machine: contadores Ativos, Inativos e Aguardando; filtro por situação, código e "cupons parceiros"; 10 por página. */
export function listarCuponsResgataveis(resgataveis: CupomLinha[], q: { status?: unknown; busca?: unknown; parceiros?: unknown; pagina?: unknown }) {
  const antigo: Record<string, string> = { Validos: "Ativos", Vencidos: "Inativos", Pausados: "Inativos" };
  const st = antigo[String(q.status)] ?? String(q.status ?? "Todos");
  const parceiros = q.parceiros === "1" || q.parceiros === 1 || q.parceiros === true;
  const base = resgataveis.filter((c) => (c.parceiro === true) === parceiros);
  const contadores = { ativos: base.filter((c) => c.grupo === "Ativos").length, inativos: base.filter((c) => c.grupo === "Inativos").length, aguardando: base.filter((c) => c.grupo === "Aguardando").length };
  const f = base.filter((c) => contem(c.codigo, texto(q.busca)) && (st === "Todos" || c.grupo === st)).sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)));
  return { ...paginar(f, q.pagina, 10), contadores };
}

function rotasCupons(r: Router) {
  r.get("/cupons", ok((req, res) => {
    const e = emp(req), q = req.query as Record<string, unknown>;
    const { resgataveis, automaticos, todos } = cuponsDaEmpresa(e);
    const tipo = String(q.tipo ?? "Todos");
    const lista = listarCuponsResgataveis(resgataveis, q);
    res.json({ cupons: tipo === "Automatico" ? [] : lista.itens, automaticos: tipo === "Resgatavel" ? [] : automaticos, paginacao: lista.paginacao, contadores: lista.contadores, kpis: { total: todos.length, usos: todos.reduce((a, c) => a + c.usos, 0), economia: arred(todos.reduce((a, c) => a + c.descontoTotal, 0)) } });
  }));
  /** Buscar cliente do "Novo cupom" (Clientes específicos): por nome, CPF ou telefone. */
  r.get("/cupons-clientes", ok((req, res) => {
    const q = texto(req.query.q, 60), d = digitos(q);
    if (q.length < 2) return res.json({ clientes: [] });
    const achados = registros(emp(req), "clientes").filter((c) => contem(c.nome, q) || (d.length >= 3 && (digitos(c.cpf).includes(d) || digitos(c.telefone).includes(d))));
    res.json({ clientes: achados.slice(0, 8).map((c) => ({ telefone: digitos(c.telefone), nome: String(c.nome ?? ""), cpf: digitos(c.cpf) })) });
  }));
  // Exportar (Planilha CSV): todos os cupons, com proteção contra injeção de fórmula.
  r.get("/cupons/exportar", ok((req, res) => {
    const { resgataveis, automaticos } = cuponsDaEmpresa(emp(req));
    const tipo = String((req.query as Record<string, unknown>).tipo ?? "Todos");
    const linha = (c: CupomLinha, t: string) => [c.codigo, t, c.descricao ?? "", c.tipoDesconto === "Percentual" ? `${c.valor}%` : c.valor, c.valorMaximo ?? "", c.publicoRotulo, c.clienteTelefone ?? "", c.inicio ?? "", c.fim ?? "", c.minimoCorrida ?? "", c.limiteUsos ?? "", c.usoPorPassageiro ?? "", c.usos, c.descontoTotal, c.situacao];
    const linhas = [...(tipo === "Resgatavel" ? [] : automaticos.map((c) => linha(c, "Automático"))), ...(tipo === "Automatico" ? [] : resgataveis.map((c) => linha(c, "Resgatável")))];
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="cupons-${hojeBr()}.csv"`);
    res.send(montarCsv(["Cupom", "Tipo", "Descrição", "Desconto", "Teto (R$)", "Público", "Cliente específico", "Início", "Fim", "Mínimo da corrida", "Limite de usos", "Usos por passageiro", "Usos", "Desconto dado (R$)", "Situação"], linhas));
  }));
}

// ====================================================================== áreas

function rotasAreas(r: Router) {
  r.get("/areas", ok((req, res) => res.json({ areas: areas(emp(req)), fusos: FUSOS })));
  r.post("/areas", soGestor, ok((req, res) => res.json({ area: salvarArea(emp(req), { ...req.body, id: undefined }) })));
  r.put("/areas/:id", soGestor, ok((req, res) => res.json({ area: salvarArea(emp(req), { ...req.body, id: req.params.id }) })));
  r.delete("/areas/:id", soGestor, ok((req, res) => { removerArea(emp(req), req.params.id); res.json({ ok: true }); }));
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
  // "Filtrar por corridas finalizadas" pode olhar só um período (Ontem, Esta semana...): corridasDe/corridasAte em AAAA-MM-DD.
  const de = /^\d{4}-\d{2}-\d{2}$/.test(String(d.corridasDe ?? "")) ? String(d.corridasDe) : "", ate = /^\d{4}-\d{2}-\d{2}$/.test(String(d.corridasAte ?? "")) ? String(d.corridasAte) : "";
  for (const c of corridas) {
    if (c.status !== "finalizada" || !c.motoristaId) continue;
    const dia = (c.finalizadaEm ?? c.solicitadaEm).slice(0, 10);
    if ((de && dia < de) || (ate && dia > ate)) continue;
    fin.set(c.motoristaId, (fin.get(c.motoristaId) ?? 0) + 1);
  }
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

/** Progresso do desafio: dos motoristas ou (tipo "Desafio de clientes") dos clientes, que recebem na carteira do passageiro. */
function progresso(e: string, d: Registro, corridas: CorridaPropria[]) {
  if (d.tipo !== TIPO_DESAFIO_CLIENTE) return progressoDoDesafio(e, d, corridas);
  const perfis = perfisApp(e, "passageiro");
  const pagos = lerG<Record<string, Record<string, string>>>(e, "desafios-pagos", {})[d.id] ?? {};
  return progressoClientes(registros(e, "clientes"), d, corridas, (tel) => !!perfis.get(tel)?.premios.includes(d.id) || !!pagos[tel]);
}

function rotasDesafios(r: Router) {
  r.get("/desafios", ok((req, res) => {
    const e = emp(req), q = req.query as Record<string, unknown>, corridas = listarProprias(e);
    const clientes = q.publico === "Clientes";
    const todos = registros(e, "desafios").filter((d) => (clientes ? d.tipo === TIPO_DESAFIO_CLIENTE : TIPOS_DESAFIO_CORRIDA.includes(String(d.tipo)))).map((d): Registro & { situacao: string; desafiados: number; participando: number; concluidos: number; gastoAtual: number } => {
      const prog = progresso(e, d, corridas);
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
    const e = emp(req), qy = req.query as Record<string, unknown>;
    const n = qy.publico === "Clientes" ? clientesDesafiados(registros(e, "clientes"), qy, listarProprias(e)).length : desafiados(e, qy, listarProprias(e)).length;
    const premio = Number(String(req.query.premio ?? "0").replace(",", ".")) || 0;
    res.json({ motoristas: n, gastoMaximo: arred(n * premio) });
  }));

  r.get("/desafios/:id", ok((req, res) => {
    const e = emp(req);
    const d = registros(e, "desafios").find((x) => x.id === req.params.id);
    if (!d) throw new Error("Desafio não encontrado.");
    const prog = progresso(e, d, listarProprias(e));
    const premio = Number(d.premio) || 0;
    res.json({
      desafio: { ...d, situacao: situacaoDesafio(d) }, motoristas: prog,
      resumo: { desafiados: prog.length, participando: prog.filter((p) => p.situacao !== "Pendente").length, concluidos: prog.filter((p) => p.situacao === "Concluído").length,
        gastoMaximo: arred(prog.length * premio), gastoEsperado: arred(prog.filter((p) => p.situacao === "Concluído").length * premio), gastoReal: arred(prog.filter((p) => p.pago).length * premio) },
    });
  }));

  r.post("/desafios", soGestor, ok((req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const nome = texto(b.nome, 30);
    if (!nome) throw new Error("Informe o nome do desafio.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.inicio)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(b.fim))) throw new Error("Informe as datas de início e fim.");
    if (`${b.fim}T${b.horaFim ?? "23:59"}` <= `${b.inicio}T${b.horaInicio ?? "00:00"}`) throw new Error("A data final precisa ser depois do início.");
    if (!(Number(b.meta) > 0)) throw new Error("Informe a meta do desafio.");
    if (b.tipoRecompensa === "Personalizada" && !texto(b.premioDescricao, 100)) throw new Error("Descreva a recompensa.");
    const d = criar(emp(req), cad("desafios"), {
      nome, tipo: b.publico === "Clientes" ? TIPO_DESAFIO_CLIENTE : TIPOS_DESAFIO_CORRIDA.includes(String(b.tipo)) ? b.tipo : "Desafio de corridas", meta: b.meta, premio: b.premio, inicio: b.inicio, fim: b.fim,
      horaInicio: texto(b.horaInicio, 5) || "00:00", horaFim: texto(b.horaFim, 5) || "23:59", categorias: texto(b.categorias, 200), aprovacao: b.aprovacao === "Manual" ? "Manual" : "Automático",
      tipoRecompensa: b.tipoRecompensa === "Personalizada" ? "Personalizada" : "Em créditos", premioDescricao: b.tipoRecompensa === "Personalizada" ? texto(b.premioDescricao, 100) : "",
      corridasMin: b.corridasMin ?? null, corridasMax: b.corridasMax ?? null, corridasDe: texto(b.corridasDe, 10), corridasAte: texto(b.corridasAte, 10), ativo: true, cancelado: false, regras: texto(b.regras, 1000),
    }, quem(req));
    res.json({ desafio: d });
  }));

  const mudar = (req: import("express").Request, f: (d: Registro) => Record<string, unknown>) => {
    const d = registros(emp(req), "desafios").find((x) => x.id === req.params.id);
    if (!d) throw new Error("Desafio não encontrado.");
    return atualizar(emp(req), cad("desafios"), d.id, { ...d, ...f(d) }, quem(req));
  };
  r.post("/desafios/:id/ativar", soGestor, ok((req, res) => res.json({ desafio: mudar(req, (d) => { if (d.cancelado === true) throw new Error("Desafio cancelado não volta."); return { ativo: d.ativo !== true }; }) })));
  r.post("/desafios/:id/cancelar", soGestor, ok((req, res) => res.json({ desafio: mudar(req, () => ({ cancelado: true, ativo: false })) })));

  /** Aprovação manual: paga o prêmio na carteira do motorista ou do passageiro (uma vez). */
  r.post("/desafios/:id/aprovar/:motoristaId", soGestor, ok((req, res) => {
    const e = emp(req);
    const d = registros(e, "desafios").find((x) => x.id === req.params.id);
    if (!d) throw new Error("Desafio não encontrado.");
    const papel = d.tipo === TIPO_DESAFIO_CLIENTE ? "passageiro" : "motorista";
    const p = progresso(e, d, listarProprias(e)).find((x) => x.id === req.params.motoristaId);
    if (!p || p.situacao !== "Concluído") throw new Error(`${papel === "passageiro" ? "O cliente" : "O motorista"} ainda não completou o desafio.`);
    if (p.pago) throw new Error("A recompensa já foi paga.");
    const premio = Number(d.premio) || 0;
    if (premio > 0) lancar(e, papel, p.id, premio, `Prêmio: ${String(d.nome)}`, quem(req));
    const perf = pessoa(e, papel, p.id);
    salvarPessoa(e, papel, p.id, { ...perf, premios: [...perf.premios, d.id] });
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
  /** Recompensas por indicação (Machine): uma linha por indicado, com a recompensa de quem indicou e o progresso do indicado na meta de corridas. */
  r.get("/recompensas-indicacao", ok((req, res) => {
    const e = emp(req), q = req.query;
    const tipo = q.tipo === "passageiro" ? "passageiro" : "motorista";
    const status = q.status === "pendente" || q.status === "concluido" ? String(q.status) : "todos";
    const [de, ate] = periodo(String(q.periodo ?? "todo"), q.inicio, q.fim);
    const busca = texto(q.busca, 60);
    const corridas = listarProprias(e).filter((c) => c.status === "finalizada");
    const feitasMot = new Map<string, number>(), feitasPas = new Map<string, number>();
    for (const c of corridas) { if (c.motoristaId) feitasMot.set(c.motoristaId, (feitasMot.get(c.motoristaId) ?? 0) + 1); feitasPas.set(c.passageiro.telefone, (feitasPas.get(c.passageiro.telefone) ?? 0) + 1); }
    const mot = new Map(registros(e, "motoristas").map((m) => [m.id, m]));
    const cli = new Map(registros(e, "clientes").map((c) => [String(c.telefone), c]));
    const nomeDe = (papel: string, chave: string) => String((papel === "motorista" ? mot.get(chave)?.nome : cli.get(chave)?.nome) ?? (papel === "passageiro" ? chave : "Sem nome"));
    const linhas = banco().prepare("SELECT papel, chave, codigo, indicado_por AS indicadoPor FROM app_pessoas WHERE empresa = ?").all(e) as Array<{ papel: string; chave: string; codigo: string; indicadoPor: string }>;
    const porCodigo = new Map(linhas.map((l) => [l.codigo, l]));
    const desafios = registros(e, "desafios").filter((d) => d.ativo === true && String(d.tipo).startsWith("Indicação"));
    const regra = (papel: string) => desafios.find((d) => d.tipo === (papel === "passageiro" ? "Indicação de passageiro" : "Indicação de motorista"));
    const itens = linhas.filter((l) => l.indicadoPor && l.papel === tipo).map((l) => {
      const emb = porCodigo.get(l.indicadoPor);
      const reg = l.papel === "motorista" ? mot.get(l.chave) : cli.get(l.chave);
      const em = String(reg?.criadoEm ?? "");
      const r0 = regra(l.papel);
      const meta = Math.max(1, Number(r0?.meta) || 1);
      const feitas = (l.papel === "motorista" ? feitasMot.get(l.chave) : feitasPas.get(l.chave)) ?? 0;
      return { em, quemIndicou: emb ? nomeDe(emb.papel, emb.chave) : `Código ${l.indicadoPor}`, recompensa: Number(r0?.premio) || 0, indicado: nomeDe(l.papel, l.chave), tipoUsuario: l.papel === "motorista" ? "Motorista" : "Cliente", tipoRecompensa: "Quantidade mínima", realizadas: Math.min(feitas, meta), meta, concluido: feitas >= meta };
    }).filter((x) => (!x.em || (diaBr(x.em) >= de && diaBr(x.em) <= ate)) && (status === "todos" || (status === "concluido") === x.concluido) && (!busca || contem(x.quemIndicou, busca) || contem(x.indicado, busca)))
      .sort((a, b) => b.em.localeCompare(a.em));
    if (q.csv === "1") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8"); res.setHeader("Content-Disposition", 'attachment; filename="recompensas-indicacao.csv"');
      return res.send(montarCsv(["Indicado em", "Quem indicou", "Recompensa de quem indicou", "Indicado", "Tipo do usuário", "Tipo da recompensa", "Corridas realizadas", "Meta de corridas"], itens.map((x) => [x.em ? dataBrasil(x.em) : "", x.quemIndicou, x.recompensa, x.indicado, x.tipoUsuario, x.tipoRecompensa, x.realizadas, x.meta])));
    }
    const pg = paginar(itens, q.pagina, 10);
    res.json({ itens: pg.itens, paginacao: pg.paginacao });
  }));
}

export function rotasOutros(r: Router) {
  rotasPassageiros(r); rotasCupons(r); rotasEmpresas(r); rotasAreas(r); rotasDesafios(r); rotasIndicacoes(r);
}
