// Cadastro › Empresas (conveniadas), no formato da Machine: dados da empresa, endereço, situação cadastral, configurações
// (motorista específico, categorias e pagamentos permitidos com desconto) e outras informações. Servidor: /api/gestao/empresas.
// Tudo por empresa (a do login). Só administrador grava (como no cadastro genérico).

import type { Request as Req, Router } from "express";
import { PAGAMENTOS_MACHINE } from "../comum/cadastros.ts";
import { atualizar, criar, type Registro } from "../cadastros/armazem.ts";
import { listarProprias } from "../corridas/index.ts";
import { empresa } from "../servidor/dados.ts";
import { arred, celulaCsv, normal } from "../servidor/util.ts";
import { cad, contem, digitos, emp, hojeBr, ok, paginar, quem, registros, soAdmin, texto } from "./comum.ts";
import { cepValido, cnpjValido, conferir, cpfValido, emailValido, soDigitos, telefoneValido, UFS } from "./validacao.ts";

export const SITUACOES_EMPRESA = ["Ativa", "Suspensa", "Aguardando ativação", "Encerrada"];
export interface PagamentoPermitido { tipo: string; desconto: number }
export interface DadoExtra { chave: string; valor: string }

const lerJson = <T>(v: unknown, padrao: T): T => { try { const x = typeof v === "string" ? JSON.parse(v) : v; return (x ?? padrao) as T; } catch { return padrao; } };
export const pagamentosDaEmpresa = (r: Registro | undefined): PagamentoPermitido[] => {
  const l = lerJson<unknown[]>(r?.pagamentosPermitidos, []);
  return Array.isArray(l) ? l.filter((x): x is PagamentoPermitido => !!x && typeof (x as PagamentoPermitido).tipo === "string").map((x) => ({ tipo: x.tipo, desconto: Number(x.desconto) || 0 })) : [];
};
export const categoriasDaEmpresa = (r: Registro | undefined): string[] => String(r?.categoriasPermitidas ?? "").split(",").map((x) => x.trim()).filter(Boolean);

/** Confere e arruma o que veio do formulário. Só confere o que mudou, para cadastro antigo com dado ruim continuar abrindo. */
export function prepararEmpresa(empresaId: string, entrada: Record<string, unknown>, anterior: Registro | null, criando: boolean): Record<string, unknown> {
  const d = { ...entrada };
  const mudou = (k: string) => k in d && String(d[k] ?? "") !== String(anterior?.[k] ?? "");
  if (criando) {
    for (const [k, r] of [["nome", "Nome fantasia"], ["cnpj", "CPF/CNPJ"], ["numeroContrato", "Número do contrato"]] as const) if (!String(d[k] ?? "").trim()) throw new Error(`Preencha "${r}".`);
    d.permiteEspecificarMotorista ??= "Sim";
    d.tipoDocumento ??= soDigitos(d.cnpj).length === 11 ? "CPF" : "CNPJ";
  }
  const tipoDoc = String(d.tipoDocumento ?? anterior?.tipoDocumento ?? (soDigitos(d.cnpj ?? anterior?.cnpj).length === 11 ? "CPF" : "CNPJ"));
  if ("nome" in d && !String(d.nome ?? "").trim()) throw new Error('Preencha "Nome fantasia".');
  const erro = conferir([
    [mudou("cnpj") || mudou("tipoDocumento") ? d.cnpj ?? anterior?.cnpj : "", tipoDoc === "CPF" ? cpfValido : cnpjValido, tipoDoc === "CPF" ? "CPF inválido: confira os números." : "CNPJ inválido: confira os números."],
    [mudou("email") ? d.email : "", emailValido, "E-mail inválido."],
    [mudou("telefone") ? d.telefone : "", telefoneValido, "Telefone inválido: informe o DDD e o número."],
    [mudou("cep") ? d.cep : "", cepValido, "CEP inválido: são 8 números."],
    [mudou("uf") ? d.uf : "", (v) => UFS.includes(String(v).toUpperCase()), "UF inválida."],
    [mudou("diaFechamento") ? d.diaFechamento : "", (v) => Number(v) >= 1 && Number(v) <= 31, "Dia de fechamento: de 1 a 31."],
    [mudou("desconto") ? d.desconto : "", (v) => Number(v) >= 0 && Number(v) <= 100, "Desconto: de 0 a 100%."],
    [mudou("status") ? d.status : "", (v) => SITUACOES_EMPRESA.includes(String(v)), "Situação cadastral inválida."],
  ]);
  if (erro) throw new Error(erro);
  if ("cnpj" in d && d.cnpj) d.cnpj = soDigitos(d.cnpj);
  for (const k of ["cep", "telefone"]) if (k in d && d[k]) d[k] = soDigitos(d[k]);
  if ("uf" in d && d.uf) d.uf = String(d.uf).toUpperCase();

  if ("categoriasPermitidas" in d && d.categoriasPermitidas) {
    const validas = new Set(registros(empresaId, "categorias").map((c) => normal(c.nome)));
    const l = String(Array.isArray(d.categoriasPermitidas) ? d.categoriasPermitidas.join(",") : d.categoriasPermitidas).split(",").map((x) => x.trim()).filter(Boolean);
    const fora = l.find((x) => !validas.has(normal(x)));
    if (fora) throw new Error(`Categoria "${fora}" não existe no cadastro de Categorias.`);
    d.categoriasPermitidas = [...new Set(l)].join(", ");
  }
  if ("pagamentosPermitidos" in d && d.pagamentosPermitidos != null && d.pagamentosPermitidos !== "") {
    const l = lerJson<unknown>(d.pagamentosPermitidos, null);
    if (!Array.isArray(l)) throw new Error("Tipos de pagamento permitidos: formato inválido.");
    const vistos = new Set<string>();
    const limpo = l.map((x) => {
      const t = String((x as PagamentoPermitido)?.tipo ?? ""), desc = Number((x as PagamentoPermitido)?.desconto ?? 0);
      if (!PAGAMENTOS_MACHINE.includes(t)) throw new Error(`Tipo de pagamento "${t}" inválido.`);
      if (vistos.has(t)) throw new Error(`Tipo de pagamento "${t}" repetido.`);
      if (!Number.isFinite(desc) || desc < 0 || desc > 100) throw new Error(`Desconto de "${t}": de 0 a 100%.`);
      vistos.add(t);
      return { tipo: t, desconto: arred(desc) };
    });
    d.pagamentosPermitidos = JSON.stringify(limpo);
  }
  if ("dadosExtras" in d && d.dadosExtras != null && d.dadosExtras !== "") {
    const l = lerJson<unknown>(d.dadosExtras, null);
    if (!Array.isArray(l) || l.length > 10) throw new Error("Dados extras: no máximo 10 itens.");
    d.dadosExtras = JSON.stringify(l.map((x) => ({ chave: texto((x as DadoExtra)?.chave, 40), valor: texto((x as DadoExtra)?.valor, 120) })).filter((x) => x.chave || x.valor));
  }
  return d;
}

/** Quando a empresa fez a última solicitação (data da corrida mais recente). */
function ultimasSolicitacoes(empresaId: string) {
  const m = new Map<string, string>();
  for (const c of listarProprias(empresaId)) {
    const n = normal(c.empresaConveniada);
    if (n && c.solicitadaEm > (m.get(n) ?? "")) m.set(n, c.solicitadaEm);
  }
  return m;
}

function montarLista(e: string, q: Record<string, unknown>) {
  const clientes = registros(e, "clientes");
  const mes = hojeBr().slice(0, 7);
  const gastoPorTel = new Map<string, number>();
  for (const c of listarProprias(e)) if (c.status === "finalizada" && (c.finalizadaEm ?? "").slice(0, 7) === mes) gastoPorTel.set(c.passageiro.telefone, (gastoPorTel.get(c.passageiro.telefone) ?? 0) + (c.valor ?? 0));
  const ultimas = ultimasSolicitacoes(e);
  const todas = registros(e, "conveniadas").map((x): Registro & { funcionarios: number; faturaMes: number; ativa: boolean; ultimaSolicitacao: string | null } => {
    const func = clientes.filter((c) => c.conveniada && normal(c.conveniada) === normal(x.nome));
    return { ...x, funcionarios: func.length, faturaMes: arred(func.reduce((a, c) => a + (gastoPorTel.get(String(c.telefone)) ?? 0), 0)), ativa: x.status === "Ativa", ultimaSolicitacao: ultimas.get(normal(x.nome)) ?? null };
  });
  const nome = texto(q.nome ?? q.busca), doc = digitos(q.documento), status = texto(q.status);
  const f = todas.filter((x) => (contem(x.nome, nome) || contem(x.razaoSocial, nome) || (digitos(nome) && String(x.cnpj ?? "").replace(/\D/g, "").includes(digitos(nome))))
    && (!doc || String(x.cnpj ?? "").replace(/\D/g, "").includes(doc)) && (!status || x.status === status))
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
  return { todas, f };
}

export function rotasEmpresas(r: Router) {
  const entradaDe = (req: Req) => ({ ...((req.body ?? {}) as Record<string, unknown>) });

  r.get("/empresas", ok((req, res) => {
    const e = emp(req), q = req.query as Record<string, unknown>;
    const { todas, f } = montarLista(e, q);
    const pg = paginar(f, q.pagina);
    res.json({
      empresas: pg.itens, paginacao: pg.paginacao, kpis: { ativas: todas.filter((x) => x.ativa).length, faturaMes: arred(todas.reduce((a, x) => a + x.faturaMes, 0)) },
      opcoes: { bandeiras: [empresa(e)?.nome ?? "Central"], categorias: registros(e, "categorias").map((c) => String(c.nome ?? "")).filter(Boolean).sort((a, b) => a.localeCompare(b, "pt-BR")), pagamentos: PAGAMENTOS_MACHINE, ufs: UFS, situacoes: SITUACOES_EMPRESA },
    });
  }));

  /** Exportar relatório (CSV com proteção contra fórmula). */
  r.get("/empresas-exportar", ok((req, res) => {
    const { f } = montarLista(emp(req), req.query as Record<string, unknown>);
    const cab = ["Nome fantasia", "Razão social", "CPF/CNPJ", "Contrato", "Responsável", "Telefone", "Cidade", "Funcionários", "Fatura do mês", "Última solicitação", "Situação"];
    const linhas = f.map((x) => [x.nome, x.razaoSocial ?? "", x.cnpj ?? "", x.numeroContrato ?? "", x.contato ?? "", x.telefone ?? "", x.cidade ?? "", x.funcionarios, x.faturaMes, x.ultimaSolicitacao ? new Date(x.ultimaSolicitacao).toLocaleString("pt-BR") : "", x.status ?? ""]);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="empresas.csv"');
    res.send("﻿" + [cab, ...linhas].map((l) => l.map(celulaCsv).join(";")).join("\r\n") + "\r\n");
  }));

  r.get("/empresas/:id", ok((req, res) => {
    const e = emp(req), x = montarLista(e, {}).todas.find((c) => c.id === req.params.id);
    if (!x) { const er = new Error("Empresa não encontrada."); (er as Error & { status: number }).status = 404; throw er; }
    res.json({ empresa: x });
  }));

  r.post("/empresas", soAdmin, ok((req, res) => {
    const e = emp(req);
    const dados = prepararEmpresa(e, entradaDe(req), null, true);
    dados.bandeira ||= empresa(e)?.nome ?? null;
    dados.status ||= "Ativa";
    res.json({ empresa: criar(e, cad("conveniadas"), dados, quem(req)) });
  }));

  r.put("/empresas/:id", soAdmin, ok((req, res) => {
    const e = emp(req), anterior = registros(e, "conveniadas").find((c) => c.id === req.params.id);
    if (!anterior) throw new Error("Empresa não encontrada.");
    const dados = prepararEmpresa(e, entradaDe(req), anterior, false);
    res.json({ empresa: atualizar(e, cad("conveniadas"), anterior.id, { ...anterior, ...dados }, quem(req)) });
  }));

  /** Excluir = situação "Encerrada" (Deletado na Machine): o histórico de corridas e faturas continua. */
  r.delete("/empresas/:id", soAdmin, ok((req, res) => {
    const e = emp(req), anterior = registros(e, "conveniadas").find((c) => c.id === req.params.id);
    if (!anterior) throw new Error("Empresa não encontrada.");
    res.json({ empresa: atualizar(e, cad("conveniadas"), anterior.id, { ...anterior, status: "Encerrada" }, quem(req)) });
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

