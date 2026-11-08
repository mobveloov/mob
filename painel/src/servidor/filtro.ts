// Filtro do painel: o mesmo para qualquer origem. Roda depois de buscar as corridas.

import type { CorridaPainel, Filtro } from "../comum/corrida.ts";
import { agoraBr, normal } from "./util.ts";

function dia(s: string | undefined, fimDoDia: boolean): Date | null {
  const m = String(s ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return fimDoDia ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 23, 59, 59, 999)) : new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

/** Começo e fim do filtro, no padrão do painel. Sem datas: últimas 24 horas. */
export function intervalo(f: Filtro, agora = agoraBr()): { de: Date; ate: Date } {
  if (f.ultimasHoras && f.ultimasHoras > 0) return { de: new Date(agora.getTime() - f.ultimasHoras * 3600_000), ate: agora };
  const de = dia(f.inicio, false), ate = dia(f.fim ?? f.inicio, true);
  if (!de) return { de: new Date(agora.getTime() - 86_400_000), ate: agora };
  return { de, ate: ate ?? agora };
}

export function aplicarFiltro(lista: CorridaPainel[], f: Filtro, agora = agoraBr()): CorridaPainel[] {
  const { de, ate } = intervalo(f, agora);
  const busca = normal(f.busca);
  const digitos = busca.replace(/\D/g, "");
  const igual = (a: string, b?: string) => !b || normal(a) === normal(b);
  return lista
    .filter((c) => {
      const t = c.solicitadaEm ? Date.parse(c.solicitadaEm) : NaN;
      if (Number.isNaN(t) || t < de.getTime() || t > ate.getTime()) return false;
      if (f.os && !c.os.includes(f.os.trim())) return false;
      if (f.grupo && c.grupo !== f.grupo) return false;
      if (!igual(c.cidade, f.cidade) || !igual(c.categoria, f.categoria) || !igual(c.pagamento, f.pagamento) || !igual(c.canal, f.canal)) return false;
      if (f.origem && c.origem !== f.origem) return false;
      if (f.programada && !c.programada) return false;
      if (busca) {
        const achou = [c.motorista, c.passageiro, c.embarque, c.destino].some((v) => normal(v).includes(busca))
          || (digitos.length >= 4 && [c.telefonePassageiro, c.telefoneMotorista].some((v) => v.replace(/\D/g, "").includes(digitos)));
        if (!achou) return false;
      }
      return true;
    })
    .sort((a, b) => (b.solicitadaEm ?? "").localeCompare(a.solicitadaEm ?? ""));
}

/** Listas para os seletores do filtro. */
export function opcoesDoFiltro(lista: CorridaPainel[]) {
  const uniq = (k: keyof CorridaPainel) => [...new Set(lista.map((c) => String(c[k] ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const origens = [...new Map(lista.map((c) => [c.origem, c.origemNome])).entries()].map(([id, nome]) => ({ id, nome }));
  return { cidades: uniq("cidade"), categorias: uniq("categoria"), pagamentos: uniq("pagamento"), canais: uniq("canal"), origens };
}
