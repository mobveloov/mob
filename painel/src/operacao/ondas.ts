// Ondas de envio: cada oferta do despacho (src/apps/despacho.ts) a um motorista, com o fim dela
// (aceitou, recusou, deixou passar, saiu do ar). Alimenta a Auditoria (Raio-X) e o "Histórico de Repasses".

import { cadastroPorId } from "../comum/cadastros.ts";
import { listar } from "../cadastros/armazem.ts";
import { aoMudarOferta, type FimOferta, type Oferta } from "../apps/despacho.ts";
import { ehFavorito } from "../apps/extras.ts";
import { corridaPorId } from "../corridas/index.ts";
import { agoraBr } from "../servidor/util.ts";
import { arquivoDoBanco, banco, migrarUmaVez } from "../servidor/banco.ts";
import { arquivoOperacao } from "./armazem.ts";

export interface Onda {
  id: string; corridaId: string; os: string; motoristaId: string; nome: string; placa: string; veiculo: string;
  distanciaKm: number | null; etapa: "FAVORITOS" | "PROXIMIDADE"; oferecidaEm: string; fim: FimOferta; fimEm: string | null;
}

// As ondas ficam no banco (tabela ondas, uma linha por oferta). Antes, cada oferta regravava o ondas.json inteiro.
// O ondas.json antigo entra no banco na primeira vez e vira ondas.json.migrado (guardado).
const MAX = 5000;

function preparar(empresaId: string) {
  migrarUmaVez(empresaId, "ondas", arquivoOperacao(empresaId, "ondas.json"), (conteudo) => {
    const l = (Array.isArray(conteudo) ? (conteudo as Onda[]).filter((o) => o && typeof o.id === "string") : []).slice(-MAX);
    const ins = banco().prepare("INSERT OR IGNORE INTO ondas (empresa, id, corrida_id, dados) VALUES (?, ?, ?, ?)");
    for (const o of l) ins.run(empresaId, o.id, String(o.corridaId ?? ""), JSON.stringify(o));
    return l.length;
  });
}

// Lista das ondas da empresa na memória (só leitura); some a cada gravação e é remontada só quando alguém pede.
const memoria = new Map<string, { arquivoBanco: string; lista: readonly Onda[] }>();

export function ondas(empresaId: string): Onda[] {
  preparar(empresaId);
  const m = memoria.get(empresaId);
  if (m && m.arquivoBanco === arquivoDoBanco()) return m.lista as Onda[];
  const linhas = banco().prepare("SELECT dados FROM ondas WHERE empresa = ? ORDER BY seq DESC LIMIT ?").all(empresaId, MAX) as Array<{ dados: string }>;
  const lista = Object.freeze(linhas.map((r) => JSON.parse(r.dados) as Onda).reverse());
  memoria.set(empresaId, { arquivoBanco: arquivoDoBanco(), lista });
  return lista as Onda[];
}

export function ondasDaCorrida(empresaId: string, corridaId: string): Onda[] {
  preparar(empresaId);
  return (banco().prepare("SELECT dados FROM ondas WHERE empresa = ? AND corrida_id = ? ORDER BY seq").all(empresaId, corridaId) as Array<{ dados: string }>)
    .map((r) => JSON.parse(r.dados) as Onda);
}

export function registrarOnda(empresaId: string, o: Oferta, fim: FimOferta) {
  preparar(empresaId);
  const db = banco();
  const agora = agoraBr().toISOString();
  const atual = db.prepare("SELECT dados FROM ondas WHERE empresa = ? AND id = ?").get(empresaId, o.id) as { dados: string } | undefined;
  if (atual) {
    const nova = { ...(JSON.parse(atual.dados) as Onda), fim, fimEm: agora };
    db.prepare("UPDATE ondas SET dados = ? WHERE empresa = ? AND id = ?").run(JSON.stringify(nova), empresaId, o.id);
  } else {
    const m = listar(empresaId, cadastroPorId("motoristas")!).find((x) => x.id === o.motoristaId);
    const c = corridaPorId(empresaId, o.corridaId);
    let fav = false;
    try { fav = !!c && ehFavorito(empresaId, c.passageiro.telefone, o.motoristaId); } catch { fav = false; }
    const nova: Onda = {
      id: o.id, corridaId: o.corridaId, os: c?.os ?? "", motoristaId: o.motoristaId, nome: String(m?.nome ?? ""), placa: String(m?.placa ?? ""),
      veiculo: String(m?.veiculo ?? ""), distanciaKm: o.distanciaKm, etapa: fav ? "FAVORITOS" : "PROXIMIDADE",
      oferecidaEm: agora, fim, fimEm: fim === "oferecida" ? null : agora,
    };
    db.prepare("INSERT INTO ondas (empresa, id, corrida_id, dados) VALUES (?, ?, ?, ?)").run(empresaId, o.id, o.corridaId, JSON.stringify(nova));
    // Guarda só as últimas MAX ondas da empresa.
    db.prepare("DELETE FROM ondas WHERE empresa = ? AND seq <= (SELECT seq FROM ondas WHERE empresa = ? ORDER BY seq DESC LIMIT 1 OFFSET ?)").run(empresaId, empresaId, MAX);
  }
  memoria.delete(empresaId);
}

/** Só para os testes: esquece a lista da memória. */
export const esquecerOndasDaMemoria = () => memoria.clear();

// Liga a auditoria assim que este módulo é carregado (o servidor carrega pelas rotas da operação).
aoMudarOferta(registrarOnda);
