// Busca de corridas no formato de filtro que o painel usa (datas AAAA-MM-DD, grupo de status, busca livre).
// Lê várias páginas de cada integração, junta e filtra. Cada integração que falhar entra em `indisponivel`.

import { ehMotorErro } from "./erros.ts";
import type { Motor } from "./index.ts";
import type { Corrida, GrupoStatus, Origem, StatusCorrida } from "./tipos.ts";

export interface FiltroPainel {
  inicio?: string; // AAAA-MM-DD (horário de Brasília)
  fim?: string; // AAAA-MM-DD
  ultimasHoras?: number;
  os?: string; // número da corrida no sistema de origem
  busca?: string; // passageiro, motorista, telefone ou endereço
  status?: GrupoStatus;
  cidade?: string;
  categoria?: string;
  pagamento?: string;
  canal?: string;
  programada?: boolean;
}

export interface Indisponivel {
  integracaoId: string;
  origem: Origem;
  codigo: string;
  motivo: string;
}

export interface ResultadoBusca {
  corridas: Corrida[];
  avisos: string[];
  indisponivel: Indisponivel[];
}

const STATUS_DO_GRUPO: Record<GrupoStatus, StatusCorrida[]> = {
  finalizada: ["finalizada"],
  cancelada: ["cancelada"],
  nao_atendida: ["nao_atendida"],
  aberta: ["distribuindo", "pendente", "em_espera", "aceita", "no_local", "em_andamento", "aguardando_pagamento", "agrupada"],
};

const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

const dia = /^\d{4}-\d{2}-\d{2}$/;

export function intervaloDoFiltro(f: FiltroPainel, agora = new Date()): { de: string; ate?: string } {
  if (f.ultimasHoras && f.ultimasHoras > 0) return { de: new Date(agora.getTime() - f.ultimasHoras * 3600_000).toISOString() };
  const de = f.inicio && dia.test(f.inicio) ? `${f.inicio}T00:00:00-03:00` : new Date(agora.getTime() - 86_400_000).toISOString();
  const ate = f.fim && dia.test(f.fim) ? `${f.fim}T23:59:59-03:00` : undefined;
  return { de, ate };
}

/** Aplica os filtros que os sistemas não fazem do lado deles. */
export function filtrarLocal(c: Corrida, f: FiltroPainel): boolean {
  if (f.status && c.grupo !== f.status) return false;
  if (f.busca) {
    const alvo = norm(f.busca);
    const dig = f.busca.replace(/\D/g, "");
    const campos = [c.idOriginal, c.passageiro.nome, c.motorista?.nome, c.partida.texto, c.destino?.texto, c.veiculo?.placa].map(norm);
    const fones = [c.passageiro.telefone, c.motorista?.telefone].map((t) => String(t ?? "").replace(/\D/g, ""));
    if (!campos.some((x) => x.includes(alvo)) && !(dig.length >= 4 && fones.some((t) => t.includes(dig)))) return false;
  }
  if (f.cidade && !norm(`${c.partida.cidade ?? ""} ${c.partida.texto}`).includes(norm(f.cidade))) return false;
  if (f.categoria && norm(c.categoria?.nome) !== norm(f.categoria) && c.categoria?.id !== f.categoria) return false;
  if (f.pagamento && c.pagamento !== f.pagamento && !norm(c.pagamentoOriginal).includes(norm(f.pagamento))) return false;
  if (f.canal && !norm(c.canal).includes(norm(f.canal))) return false;
  return true;
}

export async function buscarCorridas(motor: Motor, f: FiltroPainel = {}, op: { maxPaginas?: number; limite?: number } = {}): Promise<ResultadoBusca> {
  const maxPaginas = op.maxPaginas ?? 20;
  const limite = op.limite ?? 100;
  const avisos: string[] = [];
  const indisponivel: Indisponivel[] = [];
  const corridas: Corrida[] = [];

  for (const a of motor.adaptadores) {
    const falhar = (codigo: string, motivo: string) => indisponivel.push({ integracaoId: a.integracaoId, origem: a.origem, codigo, motivo });
    if (!a.configurado()) {
      falhar("NAO_CONFIGURADO", a.pendencias().join(" "));
      continue;
    }
    if (f.programada) {
      falhar("NAO_SUPORTADO", a.capacidades().programadas.motivo ?? "corridas programadas indisponíveis");
      continue;
    }
    try {
      if (f.os) {
        try {
          const c = await a.detalharCorrida(f.os.trim());
          if (filtrarLocal(c, { ...f, os: undefined })) corridas.push(c);
        } catch (e) {
          if (!(ehMotorErro(e) && e.codigo === "NAO_ENCONTRADO")) throw e;
        }
        continue;
      }
      const { de, ate } = intervaloDoFiltro(f);
      const status = f.status ? STATUS_DO_GRUPO[f.status] : undefined;
      let pagina = 1;
      for (; pagina <= maxPaginas; pagina++) {
        const r = await a.listarCorridas({ de, ate, status, pagina, limite });
        corridas.push(...r.itens.filter((c) => filtrarLocal(c, f)));
        if (!r.temMais) break;
      }
      if (pagina > maxPaginas) avisos.push(`${a.nome} (${a.integracaoId}): resultado cortado em ${maxPaginas} páginas. Diminua o período.`);
    } catch (e) {
      falhar(ehMotorErro(e) ? e.codigo : "ERRO_REMOTO", e instanceof Error ? e.message : String(e));
    }
  }

  const quando = (c: Corrida) => (c.solicitadaEm ? Date.parse(c.solicitadaEm) || 0 : 0);
  corridas.sort((x, y) => quando(y) - quando(x));
  for (const i of indisponivel) avisos.push(i.motivo);
  return { corridas, avisos, indisponivel };
}
