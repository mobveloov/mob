// Financeiro › Recompensas por indicação (Machine): abas Motoristas e Clientes, filtros de período, tipo do usuário e status
// (Todos, Pendente, Concluído), Exportar e a tabela de indicados com a meta de corridas, paginada de 10 em 10.

import { useState } from "react";
import { Download } from "lucide-react";
import { Abas, Aviso, Cab, Carregando, dinheiro, useCarregar } from "../demais/comum";

const PERIODOS: Array<[string, string]> = [["todo", "Todos os períodos"], ["hoje", "Hoje"], ["ontem", "Ontem"], ["esta_semana", "Esta semana"], ["este_mes", "Este mês"], ["mes_passado", "Mês passado"], ["este_ano", "Este ano"], ["personalizado", "Personalizado"]];
const STATUS: Array<[string, string]> = [["todos", "Todos"], ["pendente", "Pendente"], ["concluido", "Concluído"]];

async function pedir(qs: string) {
  let emp = "";
  try { emp = localStorage.getItem("empresa") ?? ""; } catch { /* sem armazenamento */ }
  const r = await fetch(`/api/gestao/recompensas-indicacao?${qs}`, { credentials: "same-origin", headers: emp ? { "X-Empresa": emp } : {} });
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { erro?: string }).erro || `Erro ${r.status}`);
  return r;
}

export function Recompensas() {
  const [tipo, setTipo] = useState<"motorista" | "passageiro">("motorista");
  const [f, setF] = useState({ periodo: "todo", inicio: "", fim: "", status: "todos", busca: "" });
  const [ap, setAp] = useState(f);
  const [pagina, setPagina] = useState(1);
  const [erro, setErro] = useState<string | null>(null);
  const qs = (extra = "") => new URLSearchParams({ tipo, periodo: ap.periodo, inicio: ap.inicio, fim: ap.fim, status: ap.status, busca: ap.busca, pagina: String(pagina) }).toString() + extra;
  const d = useCarregar(async () => (await pedir(qs())).json() as Promise<{ itens: any[]; paginacao: { atual: number; totalPaginas: number; totalItens: number } }>, [tipo, ap, pagina]);
  const exportar = async () => {
    setErro(null);
    try {
      const blob = await (await pedir(qs("&csv=1"))).blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "recompensas-indicacao.csv"; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) { setErro((e as Error).message); }
  };
  const aplicar = (n: typeof f) => { setF(n); setAp(n); setPagina(1); };
  const dados = d.dados;
  return (
    <>
      <Cab titulo="Recompensas por indicação"><button className="botao" onClick={() => void exportar()}><Download size={14} /> Exportar</button></Cab>
      <Abas abas={[["motorista", "Motoristas"], ["passageiro", "Clientes"]]} valor={tipo} onChange={(t) => { setTipo(t); setPagina(1); }} />
      <div className="dm-cartao dm-filtros">
        <label className="dm-campo"><span>Período</span><select value={f.periodo} onChange={(e) => aplicar({ ...f, periodo: e.target.value })}>{PERIODOS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></label>
        {f.periodo === "personalizado" && <><label className="dm-campo"><span>De</span><input type="date" value={f.inicio} onChange={(e) => setF({ ...f, inicio: e.target.value })} /></label><label className="dm-campo"><span>Até</span><input type="date" value={f.fim} onChange={(e) => setF({ ...f, fim: e.target.value })} /></label><button className="botao" onClick={() => aplicar(f)}>Aplicar</button></>}
        <label className="dm-campo"><span>Tipo do usuário</span><select value={tipo} onChange={(e) => { setTipo(e.target.value as "motorista" | "passageiro"); setPagina(1); }}><option value="motorista">Motorista</option><option value="passageiro">Cliente</option></select></label>
        <label className="dm-campo"><span>Status</span><select value={f.status} onChange={(e) => aplicar({ ...f, status: e.target.value })}>{STATUS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></label>
        <form onSubmit={(e) => { e.preventDefault(); aplicar(f); }}><label className="dm-campo"><span>Buscar</span><input value={f.busca} placeholder="Quem indicou ou indicado" onChange={(e) => setF({ ...f, busca: e.target.value })} /></label></form>
      </div>
      <Aviso erro={erro ?? d.erro} />
      {!dados ? <Carregando /> : (
        <div className="dm-cartao tabela-rola">
          <table>
            <thead><tr><th>Indicado em</th><th>Quem indicou</th><th>Recompensa de quem indicou</th><th>Indicado</th><th>Tipo do usuário</th><th>Tipo da recompensa</th><th>Corridas realizadas</th><th>Meta de corridas</th></tr></thead>
            <tbody>
              {!dados.itens.length ? <tr><td colSpan={8} className="vazio">Nenhuma indicação encontrada.</td></tr> : dados.itens.map((x, i) => (
                <tr key={i}><td>{x.em ? new Date(Date.parse(x.em) - 3 * 3600_000).toISOString().replace(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2}).*/, "$3/$2/$1 às $4") : "—"}</td><td>{x.quemIndicou}</td><td>{dinheiro(x.recompensa)}</td><td>{x.indicado}</td><td>{x.tipoUsuario}</td><td>{x.tipoRecompensa}</td><td>{x.realizadas}</td><td>{x.meta}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="dm-linha dm-entre">
            <small>{dados.paginacao.totalItens} registro(s)</small>
            <span className="dm-linha"><button className="botao" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>←</button><span>{dados.paginacao.atual} / {dados.paginacao.totalPaginas}</span><button className="botao" disabled={pagina >= dados.paginacao.totalPaginas} onClick={() => setPagina(pagina + 1)}>→</button></span>
          </div>
        </div>
      )}
    </>
  );
}
