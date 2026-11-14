// Transação com Pix (formato da Machine): uma linha por corrida paga com Pix, com situação Paga, Estornada, Processando, Em disputa ou Chargeback.
//
// Não há gateway de Pix: a situação nasce da corrida (finalizada = Paga; ainda em andamento = Processando) e o administrador
// pode registrar à mão Estornada, Em disputa, Chargeback (ou confirmar Paga). A marcação fica em operacao/pix-marcas.json, por empresa,
// e não mexe na carteira de ninguém. Pix estornado ou com chargeback gera uma pendência "Pix no app" (operacao/pendencias.ts).

import { listarProprias } from "../corridas/index.ts";
import { calcularComissao } from "../config/comissao.ts";
import { montarCsv } from "../config/financeiro-visao.ts";
import { agoraBr, arred, normal } from "../servidor/util.ts";
import { gravarOperacao, lerOperacao } from "./armazem.ts";

export const SITUACOES_PIX = ["Paga", "Estornada", "Processando", "Em disputa", "Chargeback"] as const;
export type SituacaoPix = typeof SITUACOES_PIX[number];

interface Marca { situacao: SituacaoPix; motivo: string; em: string; por: string }
const marcas = (empresaId: string) => lerOperacao<Record<string, Marca>>(empresaId, "pix-marcas.json", {});

export interface LinhaPix {
  id: string; os: string; data: string; passageiro: string; telefone: string; motorista: string; motoristaId: string | null;
  valor: number; liquidoBandeira: number; liquidoMotorista: number; situacao: SituacaoPix; automatica: boolean; motivo: string; marcadaEm: string | null; marcadaPor: string;
}

const ehPix = (p: string) => normal(p).includes("pix");

/** Todas as corridas da empresa pagas com Pix, com a situação já calculada. */
export function pixDasCorridas(empresaId: string): LinhaPix[] {
  const mk = marcas(empresaId);
  const l: LinhaPix[] = [];
  for (const c of listarProprias(empresaId)) {
    if (!ehPix(c.pagamento)) continue;
    const m = mk[c.id];
    if (!m && (c.status === "cancelada" || c.status === "nao_atendida")) continue;
    const valor = arred(c.valor ?? c.estimativa.valor ?? 0);
    const taxa = c.motoristaId && valor > 0 ? calcularComissao(empresaId, c.categoria, valor, c.motoristaId).taxaCentral : 0;
    l.push({
      id: c.id, os: c.os, data: c.finalizadaEm ?? c.solicitadaEm, passageiro: c.passageiro.nome, telefone: c.passageiro.telefone, motorista: c.motorista, motoristaId: c.motoristaId,
      valor, liquidoBandeira: arred(taxa), liquidoMotorista: arred(valor - taxa),
      situacao: m?.situacao ?? (c.status === "finalizada" ? "Paga" : "Processando"), automatica: !m, motivo: m?.motivo ?? "", marcadaEm: m?.em ?? null, marcadaPor: m?.por ?? "",
    });
  }
  return l.sort((a, b) => b.data.localeCompare(a.data));
}

export interface FiltroPix { inicio?: string; fim?: string; os?: string; motorista?: string; situacao?: string }
const diaDe = (s: string) => s.slice(0, 10);

function filtrar(empresaId: string, f: FiltroPix) {
  const os = (f.os ?? "").trim(), mot = normal(f.motorista ?? "");
  const sit = SITUACOES_PIX.find((s) => s === f.situacao);
  return pixDasCorridas(empresaId).filter((x) => (!f.inicio || diaDe(x.data) >= f.inicio) && (!f.fim || diaDe(x.data) <= f.fim)
    && (!os || x.os.includes(os)) && (!mot || normal(x.motorista).includes(mot)) && (!sit || x.situacao === sit));
}

export function listarPix(empresaId: string, f: FiltroPix, pagina: number) {
  const l = filtrar(empresaId, f);
  const por = 20, paginas = Math.max(1, Math.ceil(l.length / por)), p = Math.min(Math.max(1, Math.floor(pagina) || 1), paginas);
  const resumo = Object.fromEntries(SITUACOES_PIX.map((s) => { const g = l.filter((x) => x.situacao === s); return [s, { qtd: g.length, valor: arred(g.reduce((t, x) => t + x.valor, 0)) }]; }));
  const pagas = l.filter((x) => x.situacao === "Paga");
  return {
    situacoes: SITUACOES_PIX, resumo,
    totalPago: arred(pagas.reduce((t, x) => t + x.valor, 0)), liquidoBandeira: arred(pagas.reduce((t, x) => t + x.liquidoBandeira, 0)), liquidoMotoristas: arred(pagas.reduce((t, x) => t + x.liquidoMotorista, 0)),
    total: l.length, pagina: p, paginas, itens: l.slice((p - 1) * por, p * por),
  };
}

export function csvPix(empresaId: string, f: FiltroPix): string {
  const br = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)} ${s.slice(11, 16)}`;
  return montarCsv(["Nº OS", "Situação do pagamento", "Data", "Passageiro", "Motorista", "Valor", "Valor líquido da bandeira", "Valor líquido do motorista", "Motivo"],
    filtrar(empresaId, f).map((x) => [x.os, x.situacao, br(x.data), x.passageiro, x.motorista, x.valor, x.liquidoBandeira, x.liquidoMotorista, x.motivo]));
}

/** Registra a situação do Pix da corrida à mão. "automatica" tira a marcação e volta ao que a corrida indica. */
export function marcarPix(empresaId: string, id: string, situacao: string, motivo: string, por: string): LinhaPix {
  const atual = pixDasCorridas(empresaId).find((x) => x.id === id);
  if (!atual) throw new Error("Pix não encontrado: a corrida precisa ter sido paga com Pix.");
  const mk = { ...marcas(empresaId) };
  if (situacao === "automatica") delete mk[id];
  else {
    const s = SITUACOES_PIX.find((x) => x === situacao);
    if (!s) throw new Error(`Situação inválida. Use ${SITUACOES_PIX.join(", ")}.`);
    mk[id] = { situacao: s, motivo: String(motivo ?? "").replace(/[<>]/g, "").trim().slice(0, 200), em: agoraBr().toISOString(), por: por.slice(0, 80) };
  }
  gravarOperacao(empresaId, "pix-marcas.json", mk);
  return pixDasCorridas(empresaId).find((x) => x.id === id)!;
}
