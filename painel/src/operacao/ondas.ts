// Ondas de envio: cada oferta do despacho (src/apps/despacho.ts) a um motorista, com o fim dela
// (aceitou, recusou, deixou passar, saiu do ar). Alimenta a Auditoria (Raio-X) e o "Histórico de Repasses".

import { cadastroPorId } from "../comum/cadastros.ts";
import { listar } from "../cadastros/armazem.ts";
import { aoMudarOferta, type FimOferta, type Oferta } from "../apps/despacho.ts";
import { ehFavorito } from "../apps/extras.ts";
import { listarProprias } from "../corridas/index.ts";
import { agoraBr } from "../servidor/util.ts";
import { gravarOperacao, lerOperacao } from "./armazem.ts";

export interface Onda {
  id: string; corridaId: string; os: string; motoristaId: string; nome: string; placa: string; veiculo: string;
  distanciaKm: number | null; etapa: "FAVORITOS" | "PROXIMIDADE"; oferecidaEm: string; fim: FimOferta; fimEm: string | null;
}

const ARQ = "ondas.json";
const MAX = 5000;

export const ondas = (empresaId: string) => lerOperacao<Onda[]>(empresaId, ARQ, []);
export const ondasDaCorrida = (empresaId: string, corridaId: string) => ondas(empresaId).filter((o) => o.corridaId === corridaId);

export function registrarOnda(empresaId: string, o: Oferta, fim: FimOferta) {
  const lista = [...ondas(empresaId)];
  const agora = agoraBr().toISOString();
  const i = lista.findIndex((x) => x.id === o.id);
  if (i >= 0) { lista[i] = { ...lista[i], fim, fimEm: agora }; }
  else {
    const m = listar(empresaId, cadastroPorId("motoristas")!).find((x) => x.id === o.motoristaId);
    const c = listarProprias(empresaId).find((x) => x.id === o.corridaId);
    let fav = false;
    try { fav = !!c && ehFavorito(empresaId, c.passageiro.telefone, o.motoristaId); } catch { fav = false; }
    lista.push({
      id: o.id, corridaId: o.corridaId, os: c?.os ?? "", motoristaId: o.motoristaId, nome: String(m?.nome ?? ""), placa: String(m?.placa ?? ""),
      veiculo: String(m?.veiculo ?? ""), distanciaKm: o.distanciaKm, etapa: fav ? "FAVORITOS" : "PROXIMIDADE",
      oferecidaEm: agora, fim, fimEm: fim === "oferecida" ? null : agora,
    });
  }
  gravarOperacao(empresaId, ARQ, lista.slice(-MAX));
}

// Liga a auditoria assim que este módulo é carregado (o servidor carrega pelas rotas da operação).
aoMudarOferta(registrarOnda);
