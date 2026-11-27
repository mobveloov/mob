// Desafios da central, iguais nos dois apps (motorista e passageiro): abas Ativos / Concluídos / Expirados, cartões com título, regras,
// barra de progresso (x de meta), prêmio, prazo e situação ("Em análise" até a central aprovar o prêmio manual). Tudo vem de GET /desafios,
// que lê o cadastro Desafios do painel. O prêmio automático entra na carteira sozinho (e aparece no extrato).

import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { api, reais } from "./api";
import { mensagemDeErro } from "./ui";

export type SituacaoDesafio = "ativo" | "em_analise" | "concluido" | "expirado";
export interface DesafioApp {
  id?: string; nome: string; tipo: string; meta: number; feito: number; premio: number | null; fim: string | null; regras: string; ganho: boolean;
  situacao?: SituacaoDesafio; inicio?: string | null; premioDescricao?: string; aprovacao?: string; categorias?: string[];
}

const ABAS: Array<{ id: "ativos" | "concluidos" | "expirados"; rotulo: string; casa: (s: SituacaoDesafio) => boolean }> = [
  { id: "ativos", rotulo: "Ativos", casa: (s) => s === "ativo" || s === "em_analise" },
  { id: "concluidos", rotulo: "Concluídos", casa: (s) => s === "concluido" },
  { id: "expirados", rotulo: "Expirados", casa: (s) => s === "expirado" },
];
const situacaoDe = (d: DesafioApp): SituacaoDesafio => d.situacao ?? (d.ganho ? "concluido" : "ativo");
const dataBr = (iso: string) => { const [a, m, d] = iso.split("-"); return d && m ? `${d}/${m}${a ? `/${a}` : ""}` : iso; };

/** Quantos desafios estão em andamento (para o selo do menu). */
export function useDesafiosAtivos(): number | null {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => { void api<{ desafios: DesafioApp[] }>("/desafios").then((r) => setN(r.desafios.filter((d) => situacaoDe(d) === "ativo" || situacaoDe(d) === "em_analise").length)).catch(() => setN(null)); }, []);
  return n;
}

export function ListaDeDesafios({ classeCartao }: { classeCartao: string }) {
  const [lista, setLista] = useState<DesafioApp[] | null>(null);
  const [erro, setErro] = useState("");
  const [aba, setAba] = useState<(typeof ABAS)[number]["id"]>("ativos");
  useEffect(() => { void api<{ desafios: DesafioApp[] }>("/desafios").then((r) => setLista(r.desafios)).catch((e) => { setErro(mensagemDeErro(e)); setLista([]); }); }, []);
  if (!lista) return <div className="vazio"><div className="girando" /></div>;
  const atual = ABAS.find((a) => a.id === aba)!;
  const mostrados = lista.filter((d) => atual.casa(situacaoDe(d)));
  return (
    <div className="desafios-app">
      <div className="abas-desafios" role="tablist">
        {ABAS.map((a) => {
          const n = lista.filter((d) => a.casa(situacaoDe(d))).length;
          return <button key={a.id} type="button" role="tab" aria-selected={aba === a.id} className={aba === a.id ? "ativa" : ""} onClick={() => setAba(a.id)}>{a.rotulo}{n > 0 && <span className="selo-aba">{n}</span>}</button>;
        })}
      </div>
      {erro && <p className="dica" role="alert">{erro}</p>}
      {!mostrados.length && <p className="dica vazio-desafios"><Trophy size={28} />{aba === "ativos" ? "Nenhum desafio agora. Volte mais tarde." : aba === "concluidos" ? "Você ainda não concluiu nenhum desafio." : "Nenhum desafio expirado."}</p>}
      {mostrados.map((x, i) => {
        const s = situacaoDe(x), pct = x.meta > 0 ? Math.min(100, Math.round((x.feito / x.meta) * 100)) : 0;
        return (
          <div key={x.id ?? i} className={`${classeCartao} cartao-desafio ${s}`}>
            <div className="desafio-topo"><strong>{x.nome}</strong>
              {s === "concluido" && <span className="chip ok">Prêmio ganho</span>}
              {s === "em_analise" && <span className="chip aviso">Em análise</span>}
              {s === "expirado" && <span className="chip">Expirado</span>}
            </div>
            <p className="dica desafio-meta">{x.tipo}{x.fim ? ` · ${s === "expirado" ? "terminou em" : "até"} ${dataBr(x.fim)}` : ""}</p>
            {x.regras && <p className="desafio-regras">{x.regras}</p>}
            <div className="barra" role="progressbar" aria-valuemin={0} aria-valuemax={x.meta} aria-valuenow={Math.min(x.feito, x.meta)}><span style={{ width: `${pct}%` }} /></div>
            <p className="desafio-progresso"><strong>{Math.min(x.feito, x.meta)} de {x.meta}</strong>{x.premio ? ` · prêmio ${reais(x.premio)}` : x.premioDescricao ? ` · prêmio: ${x.premioDescricao}` : ""}</p>
            {s === "em_analise" && <p className="dica">Meta batida. O prêmio entra na carteira quando a central aprovar.</p>}
            {x.categorias && x.categorias.length > 0 && <p className="dica">Vale para: {x.categorias.join(", ")}</p>}
          </div>
        );
      })}
    </div>
  );
}
