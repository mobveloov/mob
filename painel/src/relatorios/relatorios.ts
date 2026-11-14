// Relatórios no formato da Machine: faturamento por empresa, por centro de custo e por período, vouchers e tickets por motorista,
// estatísticas (bairro, empresa, operador, forma de pagamento, % por motorista), corrida por motorista e km rodados.
// Todos com período, paginação de 10 em 10 e CSV (com proteção contra injeção de fórmula). Sempre da central do login.

import { cadastroPorId } from "../comum/cadastros.ts";
import { listar, type Registro } from "../cadastros/armazem.ts";
import { CANAL_TEXTO, listarProprias, type CorridaPropria } from "../corridas/index.ts";
import { montarCsv, transacoesOnline } from "../config/financeiro-visao.ts";
import { empresasPorTelefone } from "../operacao/consulta.ts";
import { banco } from "../servidor/banco.ts";
import { agoraBr, normal } from "../servidor/util.ts";
import * as D from "../servidor/dados.ts";
import { nomesConveniadas } from "./vouchers.ts";

const cent = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const soDig = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const diaDe = (s: string | null | undefined) => String(s ?? "").slice(0, 10);
const limpar = (v: unknown, max: number) => String(v ?? "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
export const POR_PAGINA = 10;
const LIMITE_CSV = 50_000;

// ------------------------------------------------------------------ formas de pagamento

/** As 10 formas da Machine, mais as que só existem aqui. */
export const FORMAS_PAGAMENTO = ["Dinheiro", "Débito (máquina)", "Crédito (máquina)", "eTicket", "Voucher", "Cartão no app", "Pix", "Picpay", "Whatsapp", "Pix no app", "Cartão na maquininha", "Saldo da carteira"];
const CASA: Record<string, (n: string) => boolean> = {
  "Dinheiro": (n) => n === "dinheiro",
  "Débito (máquina)": (n) => n.includes("debito"),
  "Crédito (máquina)": (n) => n.includes("credito"),
  "eTicket": (n) => n.includes("eticket") || n === "ticket",
  "Voucher": (n) => n === "voucher",
  "Cartão no app": (n) => n.includes("cartao") && n.includes("app"),
  "Pix": (n) => n === "pix",
  "Picpay": (n) => n.includes("picpay"),
  "Whatsapp": (n) => n.includes("whatsapp"),
  "Pix no app": (n) => n.includes("pix") && n.includes("app"),
  "Cartão na maquininha": (n) => n.includes("maquinin"),
  "Saldo da carteira": (n) => n.includes("saldo") || n.includes("carteira"),
};
export function casaForma(pagamento: string, forma: string): boolean {
  const n = normal(pagamento);
  const f = Object.keys(CASA).find((k) => normal(k) === normal(forma));
  return f ? CASA[f](n) : n === normal(forma);
}

// ------------------------------------------------------------------ filtros e dados

export interface Filtros {
  inicio: string; fim: string; empresa?: string; pagamento?: string; pagamentos?: string[]; motorista?: string; viatura?: string; categoria?: string;
  taxa?: number; valorFixo?: number; valorPorCorrida?: number;
}
export type TipoColuna = "texto" | "dinheiro" | "numero" | "pct" | "km";
export interface Coluna { chave: string; rotulo: string; tipo: TipoColuna }
export interface Tabela { colunas: Coluna[]; linhas: Array<Record<string, string | number | null>>; totais?: Record<string, string | number | null> }
export interface CampoFiltro { chave: keyof Filtros; rotulo: string; tipo: "empresa" | "texto" | "pagamento" | "pagamentos" | "categoria" | "percentual" | "dinheiro"; obrigatorio?: boolean; padrao?: string | number }
export interface Definicao {
  id: string; titulo: string; descricao: string;
  filtros: CampoFiltro[];
  /** Linha de "Valor a pagar (x%)" muda o rótulo conforme a taxa. */
  gerar: (empresaId: string, f: Filtros) => Tabela;
}

const dataBr = (s: string | null | undefined) => (s ? `${diaDe(s).split("-").reverse().join("/")}${s.length > 10 ? ` ${s.slice(11, 16)}` : ""}` : "");

/** Valida o período (AAAA-MM-DD, fim depois do início, até 400 dias). Vazio: o mês atual inteiro. */
export function lerPeriodo(inicio: unknown, fim: unknown): { inicio: string; fim: string } {
  const h = agoraBr();
  const ini = String(inicio ?? "") || new Date(Date.UTC(h.getUTCFullYear(), h.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const f = String(fim ?? "") || new Date(Date.UTC(h.getUTCFullYear(), h.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  const ok = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
  if (!ok(ini) || !ok(f)) throw new Error("Informe datas válidas.");
  if (f < ini) throw new Error("A data final não pode ser anterior à inicial.");
  if ((Date.parse(`${f}T00:00:00Z`) - Date.parse(`${ini}T00:00:00Z`)) / 86_400_000 > 400) throw new Error("O período pode ter no máximo 400 dias.");
  return { inicio: ini, fim: f };
}

interface Contexto {
  motoristas: Map<string, Registro>;
  empresas: Map<string, string>;
  operadores: Map<string, string>;
}
function contexto(empresaId: string): Contexto {
  return {
    motoristas: new Map(listar(empresaId, cadastroPorId("motoristas")!).map((m) => [m.id, m])),
    empresas: empresasPorTelefone(empresaId),
    operadores: new Map(D.listarUsuarios().filter((u) => u.empresaId === empresaId).map((u) => [normal(u.email), u.nome || u.email])),
  };
}
const diaDaCorrida = (c: CorridaPropria) => diaDe(c.finalizadaEm ?? c.solicitadaEm);
const empresaDe = (c: CorridaPropria, x: Contexto) => c.empresaConveniada || x.empresas.get(soDig(c.passageiro.telefone)) || "";
const viaturaDe = (c: CorridaPropria, x: Contexto) => String(x.motoristas.get(c.motoristaId ?? "")?.viatura ?? "");
const kmDe = (c: CorridaPropria) => Number(c.macaneta?.km ?? c.estimativa.distanciaKm ?? 0) || 0;
const operadorDe = (c: CorridaPropria, x: Contexto) => {
  if (c.canal !== "painel") return CANAL_TEXTO[c.canal] ?? c.canal;
  const por = c.historico[0]?.por ?? "";
  return x.operadores.get(normal(por)) ?? (por || "Central");
};

/** Bairro e cidade a partir do texto do endereço ("Rua A, 10 - Centro, Leme/SP" ou "Rua A, 10, Centro"). */
export function bairroDoEndereco(texto: string): { bairro: string; cidade: string } {
  const t = String(texto ?? "").replace(/\s*\(localiza[^)]*\)\s*$/i, "").trim();
  let m = / - ([^,]+), ([^,/]+)\/[A-Za-z]{2}$/.exec(t);
  if (m) return { bairro: m[1].trim(), cidade: m[2].trim() };
  m = /, ([^,]+), ([^,/]+)\/[A-Za-z]{2}$/.exec(t);
  if (m) return { bairro: m[1].trim(), cidade: m[2].trim() };
  const partes = t.split(",").map((x) => x.trim()).filter(Boolean);
  if (partes.length >= 3) return { bairro: partes[partes.length - 1], cidade: "" };
  return { bairro: "Não informado", cidade: "" };
}

/** Corridas do período, da empresa do login, nos status pedidos (padrão: finalizadas). */
function corridasDo(empresaId: string, f: Filtros, status: string[] = ["finalizada"]) {
  const x = contexto(empresaId);
  const motorista = normal(f.motorista), viatura = normal(f.viatura), empresa = normal(f.empresa), categoria = normal(f.categoria);
  const formas = f.pagamentos?.length ? f.pagamentos : f.pagamento ? [f.pagamento] : [];
  const lista = listarProprias(empresaId).filter((c) => {
    if (!status.includes(c.status)) return false;
    const d = diaDaCorrida(c);
    if (d < f.inicio || d > f.fim) return false;
    if (status.length === 1 && status[0] === "finalizada" && !(c.valor != null && c.valor >= 0)) return false;
    if (motorista && !normal(c.motorista).includes(motorista)) return false;
    if (viatura && !normal(viaturaDe(c, x)).includes(viatura)) return false;
    if (empresa && normal(empresaDe(c, x)) !== empresa) return false;
    if (categoria && normal(c.categoria) !== categoria) return false;
    if (formas.length && !formas.some((p) => casaForma(c.pagamento, p))) return false;
    return true;
  });
  return { lista, x };
}

const porcentagem = (parte: number, total: number) => (total > 0 ? cent((parte / total) * 100) : 0);
const ordemTexto = (a: string, b: string) => a.localeCompare(b, "pt-BR");
function exigirEmpresa(f: Filtros) { if (!f.empresa?.trim()) throw new Error("Escolha a empresa."); }

// ------------------------------------------------------------------ os relatórios

const COL = {
  os: { chave: "os", rotulo: "OS", tipo: "texto" } as Coluna,
  valor: { chave: "valor", rotulo: "Valor", tipo: "dinheiro" } as Coluna,
};

function faturamentoEmpresa(empresaId: string, f: Filtros): Tabela {
  exigirEmpresa(f);
  const { lista, x } = corridasDo(empresaId, f);
  const linhas = lista.sort((a, b) => Number(a.os) - Number(b.os)).map((c) => ({ os: c.os, viatura: viaturaDe(c, x), nome: c.motorista, valor: c.valor }));
  return { colunas: [COL.os, { chave: "viatura", rotulo: "Viatura", tipo: "texto" }, { chave: "nome", rotulo: "Nome", tipo: "texto" }, COL.valor], linhas, totais: { os: "Total", valor: cent(lista.reduce((s, c) => s + (c.valor ?? 0), 0)) } };
}

function faturamentoCentroCusto(empresaId: string, f: Filtros): Tabela {
  const { lista, x } = corridasDo(empresaId, f);
  const com = lista.filter((c) => c.centroCusto);
  const linhas = com.sort((a, b) => ordemTexto(a.centroCusto!, b.centroCusto!) || Number(a.os) - Number(b.os))
    .map((c) => ({ nome: c.centroCusto!, os: c.os, viatura: viaturaDe(c, x), motorista: c.motorista, passageiro: c.passageiro.nome, valor: c.valor }));
  return {
    colunas: [{ chave: "nome", rotulo: "Nome", tipo: "texto" }, COL.os, { chave: "viatura", rotulo: "Viatura", tipo: "texto" }, { chave: "motorista", rotulo: "Motorista", tipo: "texto" }, { chave: "passageiro", rotulo: "Passageiro", tipo: "texto" }, COL.valor],
    linhas, totais: { nome: "Total", valor: cent(com.reduce((s, c) => s + (c.valor ?? 0), 0)) },
  };
}

function faturamentoPeriodo(empresaId: string, f: Filtros): Tabela {
  const taxa = Number.isFinite(f.taxa) ? Math.min(100, Math.max(0, f.taxa!)) : 20;
  const fixo = Math.max(0, Number(f.valorFixo) || 0), porCorrida = Math.max(0, Number(f.valorPorCorrida) || 0);
  const { lista, x } = corridasDo(empresaId, f);
  const g = new Map<string, { nome: string; viatura: string; cats: Set<string>; qtd: number; total: number }>();
  for (const c of lista) {
    const k = c.motoristaId ?? `n:${c.motorista}`;
    const a = g.get(k) ?? { nome: c.motorista || "Sem motorista", viatura: viaturaDe(c, x), cats: new Set(), qtd: 0, total: 0 };
    a.qtd++; a.total += c.valor ?? 0; if (c.categoria) a.cats.add(c.categoria);
    g.set(k, a);
  }
  const linhas = [...g.values()].sort((a, b) => ordemTexto(a.nome, b.nome)).map((a) => {
    const aPagar = cent((a.total * taxa) / 100 + fixo + porCorrida * a.qtd);
    return { nome: a.nome, viatura: a.viatura, categoria: [...a.cats].sort(ordemTexto).join(", "), qtd: a.qtd, faturamento: cent(a.total), aPagar, totalMotorista: cent(a.total - aPagar) };
  });
  const soma = (k: "qtd" | "faturamento" | "aPagar" | "totalMotorista") => cent(linhas.reduce((s, l) => s + l[k], 0));
  return {
    colunas: [{ chave: "nome", rotulo: "Nome", tipo: "texto" }, { chave: "viatura", rotulo: "Viatura", tipo: "texto" }, { chave: "categoria", rotulo: "Categoria", tipo: "texto" }, { chave: "qtd", rotulo: "Qtd solicitações", tipo: "numero" },
      { chave: "faturamento", rotulo: "Faturamento", tipo: "dinheiro" }, { chave: "aPagar", rotulo: `Valor a pagar (${String(taxa).replace(".", ",")}%)`, tipo: "dinheiro" }, { chave: "totalMotorista", rotulo: "Total do motorista", tipo: "dinheiro" }],
    linhas, totais: { nome: "Total", qtd: soma("qtd"), faturamento: soma("faturamento"), aPagar: soma("aPagar"), totalMotorista: soma("totalMotorista") },
  };
}

function vouchersMotoristas(empresaId: string, f: Filtros): Tabela {
  const { lista, x } = corridasDo(empresaId, f);
  const g = new Map<string, { nome: string; viatura: string; voucher: number; ticket: number }>();
  for (const c of lista) {
    const voucher = casaForma(c.pagamento, "Voucher"), ticket = casaForma(c.pagamento, "eTicket");
    if (!voucher && !ticket) continue;
    const k = c.motoristaId ?? `n:${c.motorista}`;
    const a = g.get(k) ?? { nome: c.motorista || "Sem motorista", viatura: viaturaDe(c, x), voucher: 0, ticket: 0 };
    if (voucher) a.voucher += c.valor ?? 0; else a.ticket += c.valor ?? 0;
    g.set(k, a);
  }
  const linhas = [...g.values()].sort((a, b) => ordemTexto(a.nome, b.nome)).map((a) => ({ motorista: a.nome, vtr: a.viatura, voucher: cent(a.voucher), ticket: cent(a.ticket) }));
  return {
    colunas: [{ chave: "motorista", rotulo: "Motorista", tipo: "texto" }, { chave: "vtr", rotulo: "VTR", tipo: "texto" }, { chave: "voucher", rotulo: "Voucher", tipo: "dinheiro" }, { chave: "ticket", rotulo: "Ticket", tipo: "dinheiro" }],
    linhas, totais: { motorista: "Total", voucher: cent(linhas.reduce((s, l) => s + l.voucher, 0)), ticket: cent(linhas.reduce((s, l) => s + l.ticket, 0)) },
  };
}

/** Agrupa contando corridas e valor, ordenado do maior para o menor. */
function agrupar(lista: CorridaPropria[], chave: (c: CorridaPropria) => string) {
  const g = new Map<string, { nome: string; qtd: number; valor: number }>();
  for (const c of lista) { const n = chave(c); const a = g.get(normal(n)) ?? { nome: n, qtd: 0, valor: 0 }; a.qtd++; a.valor += c.valor ?? 0; g.set(normal(n), a); }
  return [...g.values()].sort((a, b) => b.qtd - a.qtd || ordemTexto(a.nome, b.nome));
}

function statBairro(empresaId: string, f: Filtros): Tabela {
  const { lista } = corridasDo(empresaId, f);
  const g = new Map<string, { bairro: string; cidade: string; qtd: number }>();
  for (const c of lista) {
    const b = bairroDoEndereco(c.embarque.texto), k = normal(`${b.bairro}|${b.cidade}`);
    const a = g.get(k) ?? { ...b, qtd: 0 }; a.qtd++; g.set(k, a);
  }
  const linhas = [...g.values()].sort((a, b) => b.qtd - a.qtd || ordemTexto(a.bairro, b.bairro)).map((a) => ({ bairro: a.bairro, cidade: a.cidade, partidas: a.qtd, porcentagem: porcentagem(a.qtd, lista.length) }));
  return { colunas: [{ chave: "bairro", rotulo: "Bairro", tipo: "texto" }, { chave: "cidade", rotulo: "Cidade", tipo: "texto" }, { chave: "partidas", rotulo: "Partidas", tipo: "numero" }, { chave: "porcentagem", rotulo: "Porcentagem", tipo: "pct" }], linhas };
}

function statEmpresa(empresaId: string, f: Filtros): Tabela {
  const { lista, x } = corridasDo(empresaId, f);
  const com = lista.filter((c) => empresaDe(c, x));
  const linhas = agrupar(com, (c) => empresaDe(c, x)).map((a) => ({ empresa: a.nome, corridas: a.qtd, valor: cent(a.valor), porcentagem: porcentagem(a.qtd, com.length) }));
  return { colunas: [{ chave: "empresa", rotulo: "Empresa", tipo: "texto" }, { chave: "corridas", rotulo: "Corridas", tipo: "numero" }, COL.valor, { chave: "porcentagem", rotulo: "Porcentagem", tipo: "pct" }], linhas };
}

function statPagamento(empresaId: string, f: Filtros): Tabela {
  const { lista } = corridasDo(empresaId, f);
  const linhas = agrupar(lista, (c) => c.pagamento || "Não informado").map((a) => ({ forma: a.nome, corridas: a.qtd, porcentagem: porcentagem(a.qtd, lista.length) }));
  return { colunas: [{ chave: "forma", rotulo: "Forma de pagamento", tipo: "texto" }, { chave: "corridas", rotulo: "Corridas", tipo: "numero" }, { chave: "porcentagem", rotulo: "Porcentagem", tipo: "pct" }], linhas };
}

function statMotorista(empresaId: string, f: Filtros): Tabela {
  const { lista, x } = corridasDo(empresaId, f);
  const linhas = agrupar(lista, (c) => `${viaturaDe(c, x)} - ${c.motorista || "Sem motorista"}`.trim()).map((a) => ({ id: a.nome, corridas: a.qtd, porcentagem: porcentagem(a.qtd, lista.length) }));
  return { colunas: [{ chave: "id", rotulo: "ID", tipo: "texto" }, { chave: "corridas", rotulo: "Corridas", tipo: "numero" }, { chave: "porcentagem", rotulo: "Porcentagem", tipo: "pct" }], linhas };
}

function statOperador(empresaId: string, f: Filtros): Tabela {
  const { lista: todas, x } = corridasDo(empresaId, f, ["finalizada", "cancelada", "nao_atendida"]);
  const g = new Map<string, { nome: string; fin: number; pass: number; mot: number; ope: number; nat: number }>();
  // quem trabalha na central aparece mesmo sem corridas no período
  for (const nome of x.operadores.values()) g.set(normal(nome), { nome, fin: 0, pass: 0, mot: 0, ope: 0, nat: 0 });
  for (const c of todas) {
    const nome = operadorDe(c, x), a = g.get(normal(nome)) ?? { nome, fin: 0, pass: 0, mot: 0, ope: 0, nat: 0 };
    if (c.status === "finalizada") a.fin++;
    else if (c.status === "nao_atendida") a.nat++;
    else if (c.canceladaPor === "Passageiro") a.pass++;
    else if (c.canceladaPor === "Motorista") a.mot++;
    else a.ope++;
    g.set(normal(nome), a);
  }
  const linhas = [...g.values()].sort((a, b) => ordemTexto(a.nome, b.nome)).map((a) => ({ operador: a.nome, finalizadas: a.fin, cancPass: a.pass, cancMotorista: a.mot, cancOpe: a.ope, naoAtend: a.nat, totais: a.fin + a.pass + a.mot + a.ope + a.nat }));
  const t = (k: "finalizadas" | "cancPass" | "cancMotorista" | "cancOpe" | "naoAtend" | "totais") => linhas.reduce((s, l) => s + l[k], 0);
  return {
    colunas: [{ chave: "operador", rotulo: "Operador", tipo: "texto" }, { chave: "finalizadas", rotulo: "FINALIZADAS", tipo: "numero" }, { chave: "cancPass", rotulo: "CANC PASS", tipo: "numero" }, { chave: "cancMotorista", rotulo: "CANC MOTORISTA", tipo: "numero" },
      { chave: "cancOpe", rotulo: "CANC OPE", tipo: "numero" }, { chave: "naoAtend", rotulo: "N/ATEND", tipo: "numero" }, { chave: "totais", rotulo: "TOTAIS", tipo: "numero" }],
    linhas, totais: { operador: "Total", finalizadas: t("finalizadas"), cancPass: t("cancPass"), cancMotorista: t("cancMotorista"), cancOpe: t("cancOpe"), naoAtend: t("naoAtend"), totais: t("totais") },
  };
}

function corridaMotorista(empresaId: string, f: Filtros): Tabela {
  const { lista, x } = corridasDo(empresaId, f);
  const linhas = lista.sort((a, b) => (b.finalizadaEm ?? b.solicitadaEm).localeCompare(a.finalizadaEm ?? a.solicitadaEm))
    .map((c) => ({ os: c.os, voucher: c.voucher ?? "", data: dataBr(c.finalizadaEm ?? c.solicitadaEm), viatura: viaturaDe(c, x), partida: c.embarque.texto, destino: c.destino?.texto ?? "", empresa: empresaDe(c, x), valor: c.valor }));
  return {
    colunas: [COL.os, { chave: "voucher", rotulo: "Voucher", tipo: "texto" }, { chave: "data", rotulo: "Data", tipo: "texto" }, { chave: "viatura", rotulo: "Viatura", tipo: "texto" }, { chave: "partida", rotulo: "Partida", tipo: "texto" },
      { chave: "destino", rotulo: "Destino", tipo: "texto" }, { chave: "empresa", rotulo: "Empresa", tipo: "texto" }, COL.valor],
    linhas, totais: { os: "Total", valor: cent(lista.reduce((s, c) => s + (c.valor ?? 0), 0)) },
  };
}

function kmRodados(empresaId: string, f: Filtros): Tabela {
  const { lista, x } = corridasDo(empresaId, f);
  const g = new Map<string, { nome: string; id: string; qtd: number; km: number; valor: number }>();
  for (const c of lista) {
    const k = c.motoristaId ?? `n:${c.motorista}`;
    const a = g.get(k) ?? { nome: c.motorista || "Sem motorista", id: c.motoristaId ?? "", qtd: 0, km: 0, valor: 0 };
    a.qtd++; a.km += kmDe(c); a.valor += c.valor ?? 0; g.set(k, a);
  }
  const linhas = [...g.values()].sort((a, b) => ordemTexto(a.nome, b.nome)).map((a) => {
    const m = x.motoristas.get(a.id);
    return { nome: a.nome, modelo: String(m?.veiculo ?? ""), placa: String(m?.placa ?? ""), telefone: String(m?.telefone ?? ""), qtd: a.qtd, km: Math.round(a.km * 1000) / 1000, valor: cent(a.valor) };
  });
  return {
    colunas: [{ chave: "nome", rotulo: "Nome", tipo: "texto" }, { chave: "modelo", rotulo: "Modelo", tipo: "texto" }, { chave: "placa", rotulo: "Placa", tipo: "texto" }, { chave: "telefone", rotulo: "Telefone", tipo: "texto" },
      { chave: "qtd", rotulo: "Qtd corridas", tipo: "numero" }, { chave: "km", rotulo: "Km rodados", tipo: "km" }, { chave: "valor", rotulo: "Valor total", tipo: "dinheiro" }],
    linhas, totais: { nome: "Total", qtd: linhas.reduce((s, l) => s + l.qtd, 0), km: Math.round(linhas.reduce((s, l) => s + l.km, 0) * 1000) / 1000, valor: cent(linhas.reduce((s, l) => s + l.valor, 0)) },
  };
}

// Relatórios sugeridos como modelo (olham as transações online da central).
function transacoes(empresaId: string, f: Filtros, filtro: (t: ReturnType<typeof transacoesOnline>[number]) => boolean): Tabela {
  const l = transacoesOnline(empresaId, { inicio: f.inicio, fim: f.fim }).filter(filtro);
  return {
    colunas: [{ chave: "data", rotulo: "Data e hora", tipo: "texto" }, { chave: "id", rotulo: "ID da transação", tipo: "texto" }, { chave: "tipo", rotulo: "Tipo de transação", tipo: "texto" }, { chave: "forma", rotulo: "Forma de pagamento", tipo: "texto" },
      { chave: "status", rotulo: "Status", tipo: "texto" }, { chave: "pessoa", rotulo: "Pessoa", tipo: "texto" }, { chave: "detalhe", rotulo: "Detalhe", tipo: "texto" }, { chave: "valor", rotulo: "Valor", tipo: "dinheiro" }],
    linhas: l.map((t) => ({ data: dataBr(t.em), id: t.id, tipo: t.tipo, forma: t.forma, status: t.status, pessoa: t.pessoa, detalhe: t.detalhe, valor: t.valor })),
    totais: { data: "Total", valor: cent(l.reduce((s, t) => s + t.valor, 0)) },
  };
}
const suspeita = (t: { status: string }) => t.status === "Chargeback" || t.status === "Estornado";

const F_DATAS: CampoFiltro[] = [];
const F_EMPRESA = (obrigatorio: boolean): CampoFiltro => ({ chave: "empresa", rotulo: "Empresa", tipo: "empresa", obrigatorio });
const F_MOTORISTA: CampoFiltro = { chave: "motorista", rotulo: "Nome do motorista", tipo: "texto" };

export const DEFINICOES: Definicao[] = [
  { id: "faturamento-empresa", titulo: "Faturamento por empresa", descricao: "Corridas finalizadas de uma empresa conveniada no período.", gerar: faturamentoEmpresa,
    filtros: [F_EMPRESA(true), { chave: "pagamento", rotulo: "Forma de pagamento", tipo: "pagamento" }, { chave: "motorista", rotulo: "Motorista", tipo: "texto" }, { chave: "viatura", rotulo: "Número da viatura", tipo: "texto" }] },
  { id: "faturamento-centro-custo", titulo: "Faturamento de centro de custo", descricao: "Corridas finalizadas por centro de custo.", gerar: faturamentoCentroCusto, filtros: [F_EMPRESA(false)] },
  { id: "faturamento-periodo", titulo: "Faturamento por período", descricao: "Quanto cada motorista faturou e quanto deve à central, com taxa em % e valores fixos.", gerar: faturamentoPeriodo,
    filtros: [{ chave: "motorista", rotulo: "Nome", tipo: "texto" }, { chave: "taxa", rotulo: "Taxa cobrada (%)", tipo: "percentual", padrao: 20 }, { chave: "valorFixo", rotulo: "Valor fixo (R$)", tipo: "dinheiro" },
      { chave: "valorPorCorrida", rotulo: "Valor fixo por corrida (R$)", tipo: "dinheiro" }, { chave: "categoria", rotulo: "Categorias ativas", tipo: "categoria" }, { chave: "pagamentos", rotulo: "Tipos de pagamento", tipo: "pagamentos" }] },
  { id: "vouchers-motoristas", titulo: "Vouchers e tickets por motoristas", descricao: "Quanto cada motorista tem a receber em vouchers e tickets.", gerar: vouchersMotoristas,
    filtros: [{ chave: "motorista", rotulo: "Nome", tipo: "texto" }, { chave: "viatura", rotulo: "Número da viatura", tipo: "texto" }] },
  { id: "os-bairro", titulo: "Estatística por bairro", descricao: "Partidas por bairro de embarque.", gerar: statBairro, filtros: F_DATAS },
  { id: "os-empresa", titulo: "Estatística por empresa", descricao: "Corridas e valor por empresa conveniada.", gerar: statEmpresa, filtros: F_DATAS },
  { id: "os-pagamento", titulo: "Estatística por forma de pagamento", descricao: "Corridas por forma de pagamento.", gerar: statPagamento, filtros: F_DATAS },
  { id: "os-percentual-motorista", titulo: "Estatísticas por motorista", descricao: "Participação de cada motorista no total de corridas.", gerar: statMotorista, filtros: F_DATAS },
  { id: "os-operador", titulo: "Estatísticas por operador", descricao: "Corridas finalizadas, canceladas e não atendidas por operador.", gerar: statOperador, filtros: F_DATAS },
  { id: "os-motorista", titulo: "Corrida por motorista", descricao: "Corridas finalizadas, uma por linha.", gerar: corridaMotorista, filtros: [F_MOTORISTA] },
  { id: "km-rodados", titulo: "Relatório de Km rodados", descricao: "Corridas, quilômetros e valor por motorista.", gerar: kmRodados, filtros: [F_MOTORISTA] },
  // Bases só de modelo (sem item no menu)
  { id: "recargas-pix-clientes", titulo: "Relatório de recarga via pix de Clientes", descricao: "Recargas Pix feitas pelos passageiros.", gerar: (e, f) => transacoes(e, f, (t) => t.tipo === "Recarga passageiro"), filtros: F_DATAS },
  { id: "suspeitas-fraude-pix", titulo: "Relatório de suspeitas de fraudes no Pix", descricao: "Pagamentos e recargas por Pix marcados como chargeback ou estorno.", gerar: (e, f) => transacoes(e, f, (t) => suspeita(t) && normal(t.forma).includes("pix")), filtros: F_DATAS },
  { id: "suspeitas-fraude-cartao", titulo: "Relatório de suspeitas de fraudes em cartão", descricao: "Pagamentos no cartão do app marcados como chargeback ou estorno.", gerar: (e, f) => transacoes(e, f, (t) => suspeita(t) && normal(t.forma).includes("cartao")), filtros: F_DATAS },
];
export const definicao = (id: string) => DEFINICOES.find((d) => d.id === id);

// ------------------------------------------------------------------ execução, paginação e CSV

/** Filtros vindos da URL ou do modelo: só as chaves conhecidas, com tamanho limitado. */
export function lerFiltros(b: Record<string, unknown>): Filtros {
  const { inicio, fim } = lerPeriodo(b.inicio, b.fim);
  const num = (v: unknown) => { const n = Number(String(v ?? "").replace(",", ".")); return String(v ?? "").trim() !== "" && Number.isFinite(n) ? n : undefined; };
  const lista = Array.isArray(b.pagamentos) ? b.pagamentos : typeof b.pagamentos === "string" && b.pagamentos ? b.pagamentos.split("|") : [];
  return {
    inicio, fim, empresa: limpar(b.empresa, 80), pagamento: limpar(b.pagamento, 40), pagamentos: lista.map((p) => limpar(p, 40)).filter(Boolean).slice(0, 15),
    motorista: limpar(b.motorista, 80), viatura: limpar(b.viatura, 20), categoria: limpar(b.categoria, 60),
    taxa: num(b.taxa), valorFixo: num(b.valorFixo), valorPorCorrida: num(b.valorPorCorrida),
  };
}

export function gerarRelatorio(empresaId: string, id: string, f: Filtros, pagina = 1) {
  const d = definicao(id);
  if (!d) throw new Error("Relatório não encontrado.");
  const t = d.gerar(empresaId, f);
  const total = t.linhas.length, paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const p = Math.min(paginas, Math.max(1, Math.floor(pagina) || 1));
  return { id: d.id, titulo: d.titulo, periodo: { inicio: f.inicio, fim: f.fim }, colunas: t.colunas, linhas: t.linhas.slice((p - 1) * POR_PAGINA, p * POR_PAGINA), totais: t.totais ?? null, total, pagina: p, paginas, porPagina: POR_PAGINA };
}

export function csvDoRelatorio(empresaId: string, id: string, f: Filtros): string {
  const d = definicao(id);
  if (!d) throw new Error("Relatório não encontrado.");
  const t = d.gerar(empresaId, f);
  const linhas = t.linhas.slice(0, LIMITE_CSV).map((l) => t.colunas.map((c) => l[c.chave]));
  if (t.totais) linhas.push(t.colunas.map((c) => t.totais![c.chave] ?? ""));
  return montarCsv(t.colunas.map((c) => c.rotulo), linhas);
}

/** Listas para os filtros: empresas conveniadas, categorias e formas de pagamento. */
export function opcoesDosFiltros(empresaId: string) {
  const cats = listar(empresaId, cadastroPorId("categorias")!).filter((c) => c.ativa !== false).map((c) => String(c.nome ?? "")).filter(Boolean);
  return { empresas: nomesConveniadas(empresaId), categorias: cats, formas: FORMAS_PAGAMENTO };
}

// ------------------------------------------------------------------ modelos de relatório

export interface Modelo { id: string; nome: string; base: string; baseNome: string; filtros: Record<string, unknown>; por: string; em: string; sugerido: boolean }

const SUGERIDOS: Array<{ id: string; base: string }> = [
  { id: "sugerido-fraude-pix", base: "suspeitas-fraude-pix" },
  { id: "sugerido-fraude-cartao", base: "suspeitas-fraude-cartao" },
  { id: "sugerido-recarga-pix", base: "recargas-pix-clientes" },
];
const CHAVES_MODELO = ["empresa", "pagamento", "pagamentos", "motorista", "viatura", "categoria", "taxa", "valorFixo", "valorPorCorrida"];

export function listarModelos(empresaId: string): Modelo[] {
  const salvos = (banco().prepare("SELECT id, nome, base, filtros, em, por FROM relatorio_modelos WHERE empresa = ? ORDER BY em DESC").all(empresaId) as unknown as Array<{ id: string; nome: string; base: string; filtros: string; em: string; por: string }>)
    .filter((r) => definicao(r.base))
    .map((r) => ({ id: r.id, nome: r.nome, base: r.base, baseNome: definicao(r.base)!.titulo, filtros: JSON.parse(r.filtros) as Record<string, unknown>, por: r.por, em: r.em, sugerido: false }));
  const sug = SUGERIDOS.map((s) => ({ id: s.id, nome: definicao(s.base)!.titulo, base: s.base, baseNome: definicao(s.base)!.titulo, filtros: {}, por: "", em: "", sugerido: true }));
  return [...salvos, ...sug];
}

export function criarModelo(empresaId: string, d: { nome?: unknown; base?: unknown; filtros?: unknown }, por: string): Modelo {
  const nome = limpar(d.nome, 80);
  if (!nome) throw new Error("Dê um nome ao modelo.");
  const base = String(d.base ?? "");
  if (!definicao(base)) throw new Error("Escolha o relatório em que o modelo se baseia.");
  if (listarModelos(empresaId).some((m) => !m.sugerido && normal(m.nome) === normal(nome))) throw new Error("Já existe um modelo com este nome.");
  const bruto = (d.filtros && typeof d.filtros === "object" ? d.filtros : {}) as Record<string, unknown>;
  const filtros: Record<string, unknown> = {};
  for (const k of CHAVES_MODELO) if (bruto[k] != null && bruto[k] !== "") filtros[k] = Array.isArray(bruto[k]) ? (bruto[k] as unknown[]).map((x) => limpar(x, 40)).slice(0, 15) : limpar(bruto[k], 80);
  const id = crypto.randomUUID(), em = agoraBr().toISOString();
  banco().prepare("INSERT INTO relatorio_modelos (empresa, id, nome, base, filtros, em, por) VALUES (?, ?, ?, ?, ?, ?, ?)").run(empresaId, id, nome, base, JSON.stringify(filtros), em, por.slice(0, 80));
  return { id, nome, base, baseNome: definicao(base)!.titulo, filtros, por, em, sugerido: false };
}

export function removerModelo(empresaId: string, id: string) {
  if (!banco().prepare("DELETE FROM relatorio_modelos WHERE empresa = ? AND id = ?").run(empresaId, id).changes) throw new Error("Modelo não encontrado.");
}
