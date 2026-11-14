// Cadastro › Motoristas, Destravar Motoristas e Veículos (rotas da gestão).
//
// Lista com filtros e contadores por situação, janela do motorista (Geral, Veículos, Financeiro, Documentos,
// Cerca eletrônica e Controle de créditos), alterar situação, nova senha, punições e destravar.

import express, { type Request as Req, type Router } from "express";
import { PAGAMENTOS_MACHINE, SITUACOES_MOTORISTA } from "../comum/cadastros.ts";
import { atualizar, criar, remover, type Registro } from "../cadastros/armazem.ts";
import { cancelarCorrida, listarProprias } from "../corridas/index.ts";
import { estaOnline, ficarOffline } from "../apps/despacho.ts";
import { ajustes } from "../apps/ajustes.ts";
import { arquivo, ler } from "../apps/armazem.ts";
import { enviarDocumento, extrato, lancar, pessoa, removerDocumento, salvarPessoa, saldo, saldos, TIPOS_DOCUMENTO, MAX_DOC } from "../apps/extras.ts";
import { banco } from "../servidor/banco.ts";
import { agoraBr, arred, celulaCsv, normal } from "../servidor/util.ts";
import { conferir, cepValido, cpfValido, emailValido, placaValida, renavamValido, soDigitos, telefoneValido, UFS } from "./validacao.ts";
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

/** Todas as situações da validade que valem para a data (a Machine tem "Vencida" e "Vencida há mais de 30 dias" ao mesmo tempo). */
export function situacoesDaValidade(validade: unknown, hoje = agoraBr().toISOString().slice(0, 10)): string[] {
  const base = situacaoCnh(validade, hoje);
  const v = String(validade ?? "");
  return base === "vencida" && Date.parse(hoje) - Date.parse(v) > 30 * 86_400_000 ? ["vencida", "vencida_30"] : [base];
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
    validadeLicenciamento: (ativo?.validadeLicenciamento ?? m.validadeLicenciamento ?? null) as string | null, tipoVinculo: String(m.tipoVinculo ?? ""),
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
  const cats = lista("categorias").map(normal), cnh = lista("cnh"), lic = lista("licenciamento");
  const anoDe = Number(q.anoDe) || 0, anoAte = Number(q.anoAte) || 0;
  const filtrados = todos.filter((m) =>
    (!s("cidade") || normal(m.cidade) === normal(s("cidade"))) && contem(m.nome, s("nome")) && (!digitos(s("cpf")) || m.cpf.includes(digitos(s("cpf"))))
    && contem(m.viatura, s("viatura")) && (!s("placa") || normal(m.placa).replace(/[^a-z0-9]/g, "").includes(normal(s("placa")).replace(/[^a-z0-9]/g, "")))
    && (!digitos(s("telefone")) || m.telefone.includes(digitos(s("telefone")))) && contem(m.email, s("email"))
    && (!anoDe || (m.ano ?? 0) >= anoDe) && (!anoAte || (m.ano != null && m.ano <= anoAte))
    && (!s("dataIni") || diaBr(m.criadoEm) >= s("dataIni")) && (!s("dataFim") || diaBr(m.criadoEm) <= s("dataFim"))
    && (!cats.length || m.categorias.split(",").map(normal).some((c) => cats.includes(c)) || (!m.categorias.trim()))
    && (!cnh.length || situacoesDaValidade(m.validadeCnh).some((x) => cnh.includes(x)))
    && (!lic.length || situacoesDaValidade(m.validadeLicenciamento).some((x) => lic.includes(x)))
    && (!s("relacao") || normal(m.nivel) === normal(s("relacao"))));
  const contadores: Record<string, number> = { todos: filtrados.filter((m) => m.aba !== "lixeira").length };
  for (const a of Object.keys(ABAS_MOTORISTA)) contadores[a] = filtrados.filter((m) => m.aba === a).length;
  const aba = s("aba") || "todos";
  const daAba = filtrados.filter((m) => (aba === "todos" ? m.aba !== "lixeira" : m.aba === aba)).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const p = paginar(daAba, q.pagina);
  return { motoristas: p.itens, paginacao: p.paginacao, contadores, ...(q.completo === true ? { todos: daAba } : {}) };
}

/** Quem indicou: o código de indicação vale para um motorista ou passageiro desta empresa. */
function indicadoPorNome(empresaId: string, codigo: string): string {
  const l = banco().prepare("SELECT papel, chave FROM app_pessoas WHERE empresa = ? AND codigo = ?").get(empresaId, codigo.toUpperCase()) as { papel: string; chave: string } | undefined;
  if (!l) return "";
  const lista = registros(empresaId, l.papel === "motorista" ? "motoristas" : "clientes");
  return String(lista.find((x) => x.id === l.chave || String(x.telefone) === l.chave)?.nome ?? "");
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
const CAMPOS_MOTORISTA = ["cidade", "nome", "cpf", "telefone", "email", "nascimento", "genero", "nivel", "endereco", "numero", "cep", "bairro", "chavePix", "viatura", "cnhNumero", "validadeCnh", "status", "fantasma", "cobranca", "cobrancaTipo", "cobrancaValor", "categorias", "observacao",
  "tipoVinculo", "semNumero", "complemento", "uf", "referencia", "informacoesAdicionais", "tipoChavePix", "obsInterna1", "obsInterna2", "obsInterna3",
  "bancoCpfTitular", "bancoNomeTitular", "ocupacao", "renda", "bancoNumero", "bancoAgencia", "bancoConta", "bancoContaDv", "aceitaPagamentos", "validadeLicenciamento"];
/** Dados bancários e Pix: só o administrador grava e o operador vê a conta mascarada. */
const CAMPOS_SENSIVEIS = ["chavePix", "tipoChavePix", "bancoCpfTitular", "bancoNomeTitular", "ocupacao", "renda", "bancoNumero", "bancoAgencia", "bancoConta", "bancoContaDv"];
const mascarar = (v: unknown) => { const t = String(v ?? ""); return t ? `${"*".repeat(Math.max(0, t.length - 2))}${t.slice(-2)}` : ""; };

/** Formas de pagamento da Machine -> nomes que as corridas usam (o despacho confere por esses nomes). */
const PAGAMENTO_DA_CORRIDA: Record<string, string[]> = {
  Dinheiro: ["Dinheiro"], "Maquininha de Débito": ["Cartão na Maquininha", "Débito (máquina)"], "Maquininha de Crédito": ["Cartão na Maquininha", "Crédito (máquina)"],
  "Cartão no app": ["Cartão no App"], Pix: ["Pix", "Pix no app"],
};
/** Com alguma forma marcada, as de uso da central (carteira e voucher) continuam valendo. */
const SEMPRE_ACEITAS = ["Saldo da Carteira", "Voucher", "Faturado"];
const pagamentosParaDespacho = (marcados: string[]) => (marcados.length ? [...new Set([...marcados.flatMap((x) => PAGAMENTO_DA_CORRIDA[x] ?? []), ...SEMPRE_ACEITAS])] : []);
const listaTexto = (v: unknown) => String(v ?? "").split(",").map((x) => x.trim()).filter(Boolean);

/** Confere o que veio no formulário (só o que mudou: cadastro antigo com dado ruim ainda abre e salva). */
export function validarMotorista(dados: Record<string, unknown>, anterior: Registro | null, criando: boolean) {
  const mudou = (k: string) => k in dados && String(dados[k] ?? "") !== String(anterior?.[k] ?? "");
  const cabecalho: Array<[string, string]> = [["nome", "Nome"], ["telefone", "Telefone"]];
  if (criando) for (const [k, r] of cabecalho) if (!String(dados[k] ?? "").trim()) throw new Error(`Preencha "${r}".`);
  const erro = conferir([
    [mudou("cpf") ? dados.cpf : "", cpfValido, "CPF inválido: confira os números."],
    [mudou("email") ? dados.email : "", emailValido, "E-mail inválido."],
    [mudou("telefone") ? dados.telefone : "", telefoneValido, "Telefone inválido: informe o DDD e o número."],
    [mudou("cep") ? dados.cep : "", cepValido, "CEP inválido: são 8 números."],
    [mudou("uf") ? dados.uf : "", (v) => UFS.includes(String(v).toUpperCase()), "UF inválida."],
    [mudou("bancoCpfTitular") ? dados.bancoCpfTitular : "", cpfValido, "CPF do titular da conta inválido."],
    [mudou("nascimento") ? dados.nascimento : "", (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v)) && String(v) < agoraBr().toISOString().slice(0, 10) && String(v) > "1900-01-01", "Data de nascimento inválida."],
    [mudou("bancoNumero") ? dados.bancoNumero : "", (v) => /^\d{1,4}$/.test(soDigitos(v)) && soDigitos(v) === String(v).trim(), "Número do banco: só números (até 4)."],
    [mudou("bancoAgencia") ? dados.bancoAgencia : "", (v) => /^\d{1,6}(-?\d)?$/.test(String(v).trim()), "Número da agência inválido."],
    [mudou("bancoConta") ? dados.bancoConta : "", (v) => /^\d{1,12}$/.test(soDigitos(v)), "Número da conta inválido."],
    [mudou("renda") ? dados.renda : "", (v) => Number.isFinite(Number(String(v).replace(",", "."))) && Number(String(v).replace(",", ".")) >= 0, "Renda mensal inválida."],
    [mudou("tipoVinculo") ? dados.tipoVinculo : "", (v) => ["Titular", "Auxiliar"].includes(String(v)), "Tipo de vínculo: Titular ou Auxiliar."],
  ]);
  if (erro) throw new Error(erro);
  if (mudou("cpf") && dados.cpf) {
    // O mesmo CPF não pode estar em dois motoristas da mesma empresa (o chamador confere na lista).
  }
}

/** Normaliza o que o painel mostra no que o app guarda (CPF só com números etc.). */
function normalizarMotorista(dados: Record<string, unknown>) {
  for (const k of ["cpf", "bancoCpfTitular", "cep"]) if (k in dados && dados[k]) dados[k] = soDigitos(dados[k]);
  if ("uf" in dados && dados.uf) dados.uf = String(dados.uf).toUpperCase();
  if ("telefone" in dados && dados.telefone) { let d = soDigitos(dados.telefone); if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2); dados.telefone = d; }
  if (dados.semNumero === true) dados.numero = "S/N";
}


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
    const admin = ehAdmin(req);
    const motorista: Registro = admin ? m : { ...m, bancoConta: mascarar(m.bancoConta) as never, bancoCpfTitular: mascarar(m.bancoCpfTitular) as never, bancoAgencia: mascarar(m.bancoAgencia) as never };
    const punicao = punicoesEmVigor(e).filter((x) => x.motoristaId === m.id).sort((a, b) => b.fim.localeCompare(a.fim))[0];
    const avaliadas = corridas.filter((x) => typeof x.avaliacao === "number");
    const ultima = [...corridas].sort((a, b) => b.solicitadaEm.localeCompare(a.solicitadaEm))[0];
    const emCorrida = corridas.some((x) => ["a_caminho", "no_local", "em_andamento"].includes(x.status));
    const online = estaOnline(e, m.id);
    const indicador = p.indicadoPor ? indicadoPorNome(e, p.indicadoPor) : "";
    const marcados = listaTexto(m.aceitaPagamentos);
    const exigencias = ajustes(e).opcionais;
    res.json({
      motorista,
      indicadoPor: indicador,
      avaliacao: avaliadas.length ? arred(avaliadas.reduce((a, x) => a + (x.avaliacao ?? 0), 0) / avaliadas.length) : null,
      status: {
        mudouEm: m.statusMudouEm ?? null, logado: online, ocupacao: !online ? "" : emCorrida ? "Ocupado" : "Livre",
        impedidoAte: punicao?.fim ?? null, motivoPunicao: punicao?.motivo ?? "",
        ultimaCorrida: ultima?.solicitadaEm ?? null, ultimaAtividade: [ultima?.historico.at(-1)?.em, p.documentos ? Object.values(p.documentos).map((d) => d.em).sort().at(-1) : undefined, m.atualizadoEm].filter(Boolean).sort().at(-1) ?? null,
      },
      preferencias: {
        pagamentos: marcados,
        exigencias: p.filtros, opcoesPagamento: PAGAMENTOS_MACHINE, opcoesExigencia: exigencias,
      },
      financeiro: { taxa: c.taxa, saldo: c.saldo, mensagens: c.mensagens, saque: c.saque, temSenha: !!c.senhaHash, senhaEm: c.senhaEm || null },
      padrao: creditosPadrao(e),
      cerca: c.cerca,
      veiculos: veiculosPorMotorista(e).get(m.id) ?? [],
      documentos: Object.entries(TIPOS_DOCUMENTO).map(([tipo, nome]) => ({ tipo, nome, ...(p.documentos[tipo] ? { situacao: p.documentos[tipo].situacao, motivo: p.documentos[tipo].motivo, em: p.documentos[tipo].em, enviado: true } : { situacao: "Pendente", enviado: false }) })),
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

  // Taxa, saldo mínimo, saque e regra de cobrança do motorista: só administrador (operador não grava, nem sem querer).
  const ehAdmin = (req: Req) => ["admin", "plataforma"].includes(req.ctx!.usuario.papel);
  const semFinanceiro = (req: Req, d: Record<string, unknown>) => (ehAdmin(req) ? d : Object.fromEntries(Object.entries(d).filter(([k]) => !k.startsWith("cobranca") && !CAMPOS_SENSIVEIS.includes(k))));

  /** Confere o CPF contra os outros motoristas da empresa (cada pessoa só aparece uma vez). */
  const cpfRepetido = (e: string, cpf: unknown, ignorarId?: string) => {
    const c = soDigitos(cpf);
    if (c && registros(e, "motoristas").some((x) => x.id !== ignorarId && soDigitos(x.cpf) === c)) throw new Error("Já existe motorista com este CPF.");
  };
  /** Pagamentos aceitos e exigências ficam no perfil do app (é o que o despacho lê). */
  const salvarPreferencias = (e: string, id: string, b: Record<string, unknown>) => {
    if (!Array.isArray(b.pagamentos) && !Array.isArray(b.exigencias)) return;
    const p = pessoa(e, "motorista", id);
    if (Array.isArray(b.pagamentos)) {
      const marcados = b.pagamentos.map(String).filter((x) => PAGAMENTOS_MACHINE.includes(x));
      p.pagamentos = pagamentosParaDespacho(marcados);
      atualizar(e, cad("motoristas"), id, { ...achar(e, id), aceitaPagamentos: marcados.join(", ") || null }, "painel");
    }
    if (Array.isArray(b.exigencias)) { const validos = new Set(ajustes(e).opcionais.map((o) => o.id)); p.filtros = b.exigencias.map(String).filter((x) => validos.has(x)); }
    salvarPessoa(e, "motorista", id, p);
  };

  r.post("/motoristas", ok((req, res) => {
    const e = emp(req), b = (req.body ?? {}) as Record<string, unknown>;
    const entrada = semFinanceiro(req, { ...((b.dados ?? {}) as Record<string, unknown>) });
    validarMotorista(entrada, null, true); normalizarMotorista(entrada); cpfRepetido(e, entrada.cpf);
    const dados = juntar(null, entrada, CAMPOS_MOTORISTA);
    if (!dados.status) dados.status = "Em análise";
    dados.statusMudouEm = new Date().toISOString();
    const m = criar(e, cad("motoristas"), dados, quem(req));
    if (b.financeiro && ehAdmin(req)) salvarFinanceiro(e, m.id, b.financeiro as Record<string, unknown>);
    salvarPreferencias(e, m.id, b);
    res.json({ motorista: achar(e, m.id) });
  }));

  r.put("/motoristas/:id", ok((req, res) => {
    const e = emp(req), anterior = achar(e, req.params.id), b = (req.body ?? {}) as Record<string, unknown>;
    const entrada = semFinanceiro(req, { ...((b.dados ?? {}) as Record<string, unknown>) });
    validarMotorista(entrada, anterior, false); normalizarMotorista(entrada);
    if ("cpf" in entrada) cpfRepetido(e, entrada.cpf, anterior.id);
    const dados = juntar(anterior, entrada, CAMPOS_MOTORISTA);
    if ("status" in entrada && entrada.status !== anterior.status) dados.statusMudouEm = new Date().toISOString();
    const m = atualizar(e, cad("motoristas"), anterior.id, dados, quem(req));
    if (b.financeiro && ehAdmin(req)) salvarFinanceiro(e, m.id, b.financeiro as Record<string, unknown>);
    salvarPreferencias(e, m.id, b);
    res.json({ motorista: achar(e, m.id) });
  }));

  r.post("/motoristas/:id/status", ok((req, res) => {
    const e = emp(req), m = achar(e, req.params.id), status = String(req.body?.status ?? "");
    if (!SITUACOES_MOTORISTA.includes(status)) throw new Error("Situação inválida.");
    res.json({ motorista: atualizar(e, cad("motoristas"), m.id, { ...m, status, statusMudouEm: new Date().toISOString() }, quem(req)) });
  }));

  /** Excluir = mandar para a lixeira (não apaga o histórico de corridas e carteira). */
  r.delete("/motoristas/:id", ok((req, res) => {
    const e = emp(req), m = achar(e, req.params.id);
    if (estaOnline(e, m.id)) ficarOffline(e, m.id);
    res.json({ motorista: atualizar(e, cad("motoristas"), m.id, { ...m, status: "Lixeira", statusMudouEm: new Date().toISOString() }, quem(req)) });
  }));

  /** Deslogar: tira o motorista do ar (ele volta a ficar online pelo app). */
  r.post("/motoristas/:id/deslogar", ok((req, res) => {
    const e = emp(req), m = achar(e, req.params.id);
    if (!estaOnline(e, m.id)) throw new Error("Este motorista não está logado.");
    ficarOffline(e, m.id);
    res.json({ ok: true });
  }));

  /** Alteração em massa (Machine): situação, relação, categorias ou cidade de vários motoristas de uma vez. */
  r.post("/motoristas-massa", ok((req, res) => {
    const e = emp(req), b = (req.body ?? {}) as Record<string, unknown>;
    const ids = Array.isArray(b.ids) ? [...new Set(b.ids.map(String))].slice(0, 300) : [];
    if (!ids.length) throw new Error("Selecione ao menos um motorista.");
    const acao = String(b.acao ?? ""), valor = texto(b.valor, 200);
    if (acao === "status" && !SITUACOES_MOTORISTA.includes(valor)) throw new Error("Situação inválida.");
    if (acao === "nivel" && !["Prioritário", "Secundário", "Reserva"].includes(valor)) throw new Error("Relação inválida.");
    if (acao === "cidade" && !valor) throw new Error("Escolha a cidade.");
    if (!["status", "nivel", "categorias", "cidade"].includes(acao)) throw new Error("Escolha o que alterar.");
    const todos = new Map(registros(e, "motoristas").map((m) => [m.id, m]));
    let alterados = 0;
    for (const id of ids) {
      const m = todos.get(id);
      if (!m) continue;
      atualizar(e, cad("motoristas"), id, { ...m, [acao]: valor || null, ...(acao === "status" ? { statusMudouEm: new Date().toISOString() } : {}) }, quem(req));
      alterados++;
    }
    res.json({ alterados });
  }));

  /** Exportar a lista filtrada (CSV com proteção contra fórmula). */
  r.get("/motoristas-exportar", ok((req, res) => {
    const q = { ...(req.query as Record<string, unknown>), pagina: 1 };
    const todos = listarMotoristas(emp(req), { ...q, completo: true });
    const cab = ["Cadastro", "Motorista", "CPF", "Viatura", "E-mail", "Telefone", "Situação", "Relação", "Categorias", "Placa", "Validade da CNH", "Validade do licenciamento"];
    const linhas = (todos.todos ?? []).map((m) => [m.criadoEm ? new Date(m.criadoEm).toLocaleString("pt-BR") : "", m.nome, m.cpf, m.viatura, m.email, m.telefone, m.status, m.nivel, m.categorias.replace(/,\s*/g, " | "), m.placa, m.validadeCnh ?? "", m.validadeLicenciamento ?? ""]);
    const csv = "\ufeff" + [cab, ...linhas].map((l) => l.map(celulaCsv).join(";")).join("\r\n") + "\r\n";
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="motoristas.csv"');
    res.send(csv);
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

  r.delete("/motoristas/:id/documentos/:tipo", ok((req, res) => {
    const e = emp(req), m = achar(e, req.params.id);
    removerDocumento(e, m.id, req.params.tipo);
    res.json({ ok: true });
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
    const extra = dadosDoVeiculo(b);
    const v = criar(e, cad("veiculos"), { ...extra, placa: placaNormal(b.placa), modelo: b.modelo, cor: b.cor, ano: b.ano, categoria: b.categoria, motorista: m.nome, motoristaId: m.id, emUso: !jaTem, status: "Ativo" }, quem(req));
    if (!jaTem) sincronizarMotorista(e, m, v, quem(req));
    res.json({ veiculo: v });
  }));

  /** Editar os dados do veículo (modelo, ano, RENAVAM, licenciamento...). */
  r.put("/veiculos/:id", ok((req, res) => {
    const e = emp(req), b = req.body ?? {};
    const v = registros(e, "veiculos").find((x) => x.id === req.params.id);
    if (!v) throw new Error("Veículo não encontrado.");
    const novo = atualizar(e, cad("veiculos"), v.id, { ...v, ...dadosDoVeiculo(b, true), ...(b.placa != null ? { placa: placaNormal(b.placa) } : {}), ...Object.fromEntries(["modelo", "cor", "ano", "categoria"].filter((k) => k in b).map((k) => [k, b[k]])) }, quem(req));
    const m = novo.emUso === true ? registros(e, "motoristas").find((x) => x.id === novo.motoristaId) : null;
    if (m) sincronizarMotorista(e, m, novo, quem(req));
    res.json({ veiculo: novo });
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

const placaNormal = (v: unknown) => {
  const p = String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!placaValida(p)) throw new Error("Placa inválida. Use o formato ABC1234 ou ABC1D23.");
  return p;
};
const CAMPOS_VEICULO = ["anoExercicio", "ufEmplacamento", "cidadeEmplacamento", "renavam", "validadeLicenciamento", "corHex", "veiculoProprio"] as const;
/** Os dados do veículo da Machine, conferidos (UF, RENAVAM, anos e licenciamento). */
function dadosDoVeiculo(b: Record<string, unknown>, parcial = false): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of CAMPOS_VEICULO) if (!parcial || k in b) out[k] = b[k] === "" ? null : b[k];
  const anoMax = agoraBr().getUTCFullYear() + 1;
  const erro = conferir([
    [b.ano, (v) => Number(v) >= 1980 && Number(v) <= anoMax, "Ano de fabricação inválido."],
    [b.anoExercicio, (v) => Number(v) >= 1980 && Number(v) <= anoMax, "Ano de exercício inválido."],
    [b.ufEmplacamento, (v) => UFS.includes(String(v).toUpperCase()), "UF de emplacamento inválida."],
    [b.renavam, renavamValido, "RENAVAM inválido: são de 9 a 11 números."],
    [b.validadeLicenciamento, (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v)), "Validade do licenciamento inválida."],
    [b.corHex, (v) => /^#?[0-9a-fA-F]{6}$/.test(String(v)), "Código da cor inválido (ex.: #FFFFFF)."],
    [b.veiculoProprio, (v) => ["Sim", "Não"].includes(String(v)), "Veículo próprio: Sim ou Não."],
  ]);
  if (erro) throw new Error(erro);
  if (out.ufEmplacamento) out.ufEmplacamento = String(out.ufEmplacamento).toUpperCase();
  if (out.renavam) out.renavam = soDigitos(out.renavam);
  return out;
}

/** O veículo em uso vai para o cadastro do motorista (é o que o app e o despacho mostram). */
function sincronizarMotorista(empresaId: string, m: Registro, v: Registro | null, por: string) {
  atualizar(empresaId, cad("motoristas"), m.id, { ...m, veiculo: v ? [v.modelo, v.cor].filter(Boolean).join(" ") : null, placa: v?.placa ?? null, anoVeiculo: v?.ano ?? null, ...(v?.validadeLicenciamento ? { validadeLicenciamento: v.validadeLicenciamento } : {}) }, por);
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
