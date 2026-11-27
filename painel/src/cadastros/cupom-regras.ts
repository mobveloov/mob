// Regras do cupom do cadastro "Cupons" (as mesmas do Novo cupom da Machine): quando o cupom VALE para um pedido.
// Puro (sem banco): quem chama entrega o contexto (cliente, pagamento, histórico de usos, local do pedido).

import type { Registro } from "./armazem.ts";

export type LimiteUso = "sem_limite" | "uma_vez" | "primeira_corrida" | "por_passageiro";
export type FormaCupom = "dinheiro" | "debito" | "credito" | "cartao_app" | "pix";
export const FORMAS_CUPOM: Array<[FormaCupom, string]> = [["dinheiro", "Dinheiro"], ["debito", "Cartão de débito"], ["credito", "Cartão de crédito"], ["cartao_app", "Cartão no app"], ["pix", "Pix"]];
export const LIMITES_USO: Array<[LimiteUso, string, string]> = [
  ["sem_limite", "Sem limite", "Pode ser utilizado à vontade até a data de expiração."],
  ["uma_vez", "Apenas uma vez", "Pode ser utilizado somente uma vez e depois ficará indisponível."],
  ["primeira_corrida", "Apenas na primeira corrida", "Só pode ser utilizado por clientes na sua primeira corrida."],
  ["por_passageiro", "Até um limite (por passageiro)", "Pode ser utilizado por cada cliente apenas a quantidade de vezes que for configurada."],
];

export interface ClienteCupom { telefone: string; nome: string }
export interface PontoCupom { lat?: number | null; lng?: number | null }
export interface ContextoCupom {
  /** AAAA-MM-DD e HH:MM do pedido (Brasília). */
  hoje: string; hora: string;
  /** Sem telefone (undefined) não confere o cliente: usado ao refazer o desconto de uma corrida que já tinha o cupom. */
  telefone?: string; forma?: FormaCupom | null; valor?: number | null; categoria?: string;
  /** Usos válidos já feitos (corridas não canceladas com este cupom): do passageiro e de todos. */
  usosDoPassageiro?: number; usosTotal?: number;
  /** Corridas finalizadas do passageiro (para "apenas na primeira corrida"). */
  finalizadasDoPassageiro?: number;
  embarque?: PontoCupom; destino?: PontoCupom;
  /** Diz se o ponto está dentro da área (id). */
  naArea?: (areaId: string, ponto: PontoCupom) => boolean;
}
export interface Veredito { vale: boolean; motivo?: string }
type Cupom = Pick<Registro, string>;

const soDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");
export const mesmoTelefone = (a: unknown, b: unknown) => {
  const x = soDigitos(a), y = soDigitos(b);
  const base = (v: string) => ((v.length === 12 || v.length === 13) && v.startsWith("55") ? v.slice(2) : v);
  const a1 = base(x), b1 = base(y);
  // Só 10 ou 11 dígitos (DDD + número) e do mesmo tamanho: sufixo curto não vale.
  return (a1.length === 10 || a1.length === 11) && a1 === b1;
};

/** Clientes específicos do cupom (lista nova ou o telefone VIP antigo). */
export function clientesDoCupom(c: Cupom): ClienteCupom[] {
  const l: ClienteCupom[] = [];
  try {
    const x = typeof c.clientes === "string" && c.clientes ? JSON.parse(c.clientes) : [];
    if (Array.isArray(x)) for (const i of x) if (i && soDigitos(i.telefone)) l.push({ telefone: soDigitos(i.telefone), nome: String(i.nome ?? "").slice(0, 80) });
  } catch { /* lista estragada: vale o telefone VIP */ }
  if (!l.length && soDigitos(c.clienteTelefone)) l.push({ telefone: soDigitos(c.clienteTelefone), nome: String(c.clienteNome ?? "") });
  return l;
}
export const cupomEspecifico = (c: Cupom) => c.publico === "especificos" || (!c.publico && clientesDoCupom(c).length > 0);

/** Formas de pagamento liberadas (vazio = todas). */
export function formasDoCupom(c: Cupom): FormaCupom[] {
  const ok = new Set<string>(FORMAS_CUPOM.map(([k]) => k));
  return String(c.pagamentos ?? "").split(",").map((x) => x.trim()).filter((x): x is FormaCupom => ok.has(x));
}

/** Limite de uso do cupom; cupom antigo sem o campo usa "por passageiro" se tinha usos por passageiro. */
export function limiteDoCupom(c: Cupom): LimiteUso {
  const v = String(c.limiteUso ?? "");
  if (LIMITES_USO.some(([k]) => k === v)) return v as LimiteUso;
  return Number(c.usoPorPassageiro) > 0 ? "por_passageiro" : "sem_limite";
}

const horaOu = (v: unknown, padrao: string) => (/^\d{2}:\d{2}$/.test(String(v ?? "")) ? String(v) : padrao);

/** Começo e fim do cupom (AAAA-MM-DDTHH:MM). Sem data: sem limite daquele lado. */
export const inicioDoCupom = (c: Cupom) => (c.inicio ? `${c.inicio}T${horaOu(c.horaInicio, "00:00")}` : "");
export const fimDoCupom = (c: Cupom) => (c.fim ? `${c.fim}T${horaOu(c.horaFim, "23:59")}` : "");

export type SituacaoCupom = "Ativo" | "Aguardando" | "Inativo" | "Encerrado" | "Esgotado";
/** Situação na lista: Ativo, Aguardando (começa depois), Inativo (pausado), Encerrado (passou do fim) ou Esgotado (usos acabaram). */
export function situacaoDoCupom(c: Cupom, usosTotal: number, hoje: string, hora: string): SituacaoCupom {
  if (c.ativo !== true) return "Inativo";
  const agora = `${hoje}T${hora}`;
  if (fimDoCupom(c) && fimDoCupom(c) < agora) return "Encerrado";
  if ((limiteDoCupom(c) === "uma_vez" && usosTotal >= 1) || (Number(c.limiteUsos) > 0 && usosTotal >= Number(c.limiteUsos))) return "Esgotado";
  if (inicioDoCupom(c) && inicioDoCupom(c) > agora) return "Aguardando";
  return "Ativo";
}

/** O cupom vale para este pedido? (o código já foi conferido por quem chama; aqui só as regras) */
export function cupomVale(c: Cupom, x: ContextoCupom): Veredito {
  if (c.ativo !== true) return { vale: false, motivo: "Cupom desligado." };
  const agora = `${x.hoje}T${x.hora}`;
  if (inicioDoCupom(c) && inicioDoCupom(c) > agora) return { vale: false, motivo: "Este cupom ainda não começou." };
  if (fimDoCupom(c) && fimDoCupom(c) < agora) return { vale: false, motivo: "Este cupom já encerrou." };
  const cats = String(c.categorias ?? "").split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
  if (cats.length && x.categoria !== undefined && !cats.includes(String(x.categoria ?? "").trim().toLowerCase())) return { vale: false, motivo: "Este cupom não vale para a categoria escolhida." };
  if (Number(c.minimoCorrida) > 0 && x.valor != null && x.valor < Number(c.minimoCorrida)) return { vale: false, motivo: "O valor da corrida está abaixo do mínimo do cupom." };

  if (cupomEspecifico(c) && x.telefone !== undefined && (!x.telefone || !clientesDoCupom(c).some((k) => mesmoTelefone(k.telefone, x.telefone)))) return { vale: false, motivo: "Este cupom é de outros clientes." };
  const formas = formasDoCupom(c);
  if (formas.length && x.forma && !formas.includes(x.forma)) return { vale: false, motivo: "Este cupom não vale para a forma de pagamento escolhida." };

  const lim = limiteDoCupom(c), meus = x.usosDoPassageiro ?? 0, total = x.usosTotal ?? 0;
  if (lim === "uma_vez" && total >= 1) return { vale: false, motivo: "Este cupom já foi utilizado." };
  if (lim === "primeira_corrida" && ((x.finalizadasDoPassageiro ?? 0) > 0 || meus > 0)) return { vale: false, motivo: "Este cupom vale só na primeira corrida." };
  if (lim === "por_passageiro" && meus >= Math.max(1, Number(c.usoPorPassageiro) || 1)) return { vale: false, motivo: "Você já usou este cupom o máximo de vezes." };
  if (lim !== "por_passageiro" && Number(c.usoPorPassageiro) > 0 && meus >= Number(c.usoPorPassageiro)) return { vale: false, motivo: "Você já usou este cupom o máximo de vezes." };
  if (Number(c.limiteUsos) > 0 && total >= Number(c.limiteUsos)) return { vale: false, motivo: "Este cupom esgotou." };

  const areaId = String(c.areaId ?? "");
  if (areaId && x.naArea) {
    const destino = c.localAplicacao === "D";
    const ponto = destino ? x.destino : x.embarque;
    if (!ponto || ponto.lat == null || ponto.lng == null || !x.naArea(areaId, ponto)) return { vale: false, motivo: `Este cupom vale só quando ${destino ? "o destino" : "a partida"} está na área indicada.` };
  }
  return { vale: true };
}

/** Confere e arruma o cupom que veio do Novo cupom (5 passos). `areasIds`: áreas que existem na empresa. */
export function prepararCupom(entrada: Record<string, unknown>, areasIds: string[]): Record<string, unknown> {
  const d = { ...entrada };
  const codigo = String(d.codigo ?? "").trim().toUpperCase();
  if (d.automatico !== true) {
    if (!codigo) throw new Error('Preencha "Código promocional".');
    if (!/^[A-Z0-9_-]{3,30}$/.test(codigo)) throw new Error("Código promocional: de 3 a 30 letras ou números, sem espaço.");
  }
  d.codigo = codigo;
  const valor = Number(d.valor);
  // O valor só é obrigatório com o cupom ativo (automático inativo com valor 0 pode salvar).
  if (d.ativo === true && (!Number.isFinite(valor) || valor <= 0)) throw new Error("Informe o valor do desconto.");
  if (!Number.isFinite(valor)) d.valor = 0;
  if (Number.isFinite(valor) && d.tipoDesconto === "Percentual" && valor > 100) throw new Error("O desconto percentual não passa de 100%.");
  if (d.valorMaximo != null && d.valorMaximo !== "" && !(Number(d.valorMaximo) > 0)) throw new Error("Valor máximo de desconto: informe um valor maior que zero.");
  const data = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ""));
  for (const k of ["inicio", "fim"]) if (d[k] && !data(d[k])) throw new Error("Período de validade: data inválida.");
  for (const k of ["horaInicio", "horaFim"]) if (d[k] && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(d[k]))) throw new Error("Período de validade: hora inválida (use HH:MM).");
  if (d.inicio && d.fim && `${d.fim}T${horaOu(d.horaFim, "23:59")}` <= `${d.inicio}T${horaOu(d.horaInicio, "00:00")}`) throw new Error("A data final precisa ser depois da data de início.");

  // Cupom antigo sem "publico"/"limiteUso": deduz do que ele já tinha (não vira "todos"/"sem limite" sem querer).
  d.publico = d.publico === "especificos" || d.publico === "todos" ? d.publico : cupomEspecifico(d as Cupom) ? "especificos" : "todos";
  const clientes = clientesDoCupom({ clientes: typeof d.clientes === "string" ? d.clientes : d.clientes == null ? "" : JSON.stringify(d.clientes), clienteTelefone: d.publico === "especificos" ? d.clienteTelefone as string : null });
  if (d.publico === "especificos") {
    if (!clientes.length) throw new Error("Escolha pelo menos um cliente para o cupom.");
    const ruim = clientes.find((k) => { const t = k.telefone.length > 11 && k.telefone.startsWith("55") ? k.telefone.slice(2) : k.telefone; return t.length !== 10 && t.length !== 11; });
    if (ruim) throw new Error(`Telefone "${ruim.telefone}" inválido: use DDD + número (10 ou 11 dígitos).`);
    d.clientes = JSON.stringify(clientes);
    d.clienteTelefone = clientes[0].telefone; d.clienteNome = clientes[0].nome;
  } else { d.clientes = null; d.clienteTelefone = null; d.clienteNome = null; }

  const formas = (Array.isArray(d.pagamentos) ? d.pagamentos.join(",") : String(d.pagamentos ?? "")).split(",").map((x) => x.trim()).filter(Boolean);
  const invalida = formas.find((x) => !FORMAS_CUPOM.some(([k]) => k === x));
  if (invalida) throw new Error(`Forma de pagamento "${invalida}" inválida.`);
  d.pagamentos = [...new Set(formas)].join(",") || null;

  d.limiteUso = LIMITES_USO.some(([k]) => k === d.limiteUso) ? d.limiteUso : limiteDoCupom(d as Cupom);
  if (d.limiteUso === "por_passageiro") {
    const n = Number(d.usoPorPassageiro);
    if (!Number.isInteger(n) || n < 1) throw new Error("Limite de uso: informe quantas vezes cada passageiro pode usar.");
  } else d.usoPorPassageiro = d.limiteUso === "uma_vez" ? 1 : null;

  d.localAplicacao = d.localAplicacao === "D" ? "D" : "P";
  if (d.areaId) { if (!areasIds.includes(String(d.areaId))) throw new Error("A área escolhida não existe mais."); } else { d.areaId = null; }
  d.exibirApp = d.exibirApp === true;
  return d;
}
