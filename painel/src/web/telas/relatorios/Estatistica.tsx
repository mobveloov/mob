// Estatísticas no formato da Machine (por bairro, empresa, forma de pagamento, motorista e operador):
// filtros numa coluna à esquerda (Data inicial, Data final, Filtrar, Limpar filtros), tabela à direita com
// "Exibindo 1-10 de N resultados.", colunas que ordenam ao clicar e páginas ← 1 2 3 →.
// Só a tela de operador tem "Exportar" (CSV); todas têm "Imprimir".

import { useState } from "react";
import { Aviso, Carregando, useCarregar, useSalvar } from "../demais/comum";
import { useAvisoRelatorio } from "../../componentes/AvisoRelatorio";
import { buscarCsvRel, mesAtual, pedirRel } from "./comum";
import "./relatorios.css";
import { decimal } from "../../../comum/formato-br.ts";

type Valores = { inicio: string; fim: string };
const TITULOS: Record<string, string> = {
  "os-bairro": "Estatística por bairro",
  "os-empresa": "Estatística por empresa",
  "os-pagamento": "Estatística por forma de pagamento",
  "os-percentual-motorista": "Estatísticas por motorista",
  "os-operador": "Estatísticas por operador",
};
const ALINHA_NUM = ["numero", "dinheiro", "pct", "km"];

// A Machine mostra "12.07%" (ponto) e dinheiro em reais.
function celula(tipo: string, v: unknown) {
  if (v == null || v === "") return "";
  if (tipo === "pct") return `${decimal(Number(v), 2)}%`;
  if (tipo === "dinheiro") return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  if (tipo === "numero") return Number(v).toLocaleString("pt-BR");
  return String(v);
}

export default function Estatistica({ id }: { id: string }) {
  const padrao = mesAtual();
  const [form, setForm] = useState<Valores>(padrao);
  const [aplicado, setAplicado] = useState<Valores>(padrao);
  const [pagina, setPagina] = useState(1);
  const [ordem, setOrdem] = useState(""), [dir, setDir] = useState<"asc" | "desc">("asc");
  const { msg, salvar } = useSalvar();
  const { gerar, aviso } = useAvisoRelatorio();
  const titulo = TITULOS[id] ?? id;
  const csv = id === "os-operador";
  const obrigatorios = id === "os-pagamento"; // a Machine só marca o asterisco nesta tela

  const consulta = new URLSearchParams({ inicio: aplicado.inicio, fim: aplicado.fim, pagina: String(pagina), ...(ordem ? { ordem, dir } : {}) }).toString();
  const d = useCarregar(() => pedirRel<any>(`/relatorio/${id}?${consulta}`), [id, consulta]);
  const x = d.dados;

  const filtrar = (e: React.FormEvent) => { e.preventDefault(); setPagina(1); setAplicado(form); };
  const limpar = () => { setForm(padrao); setAplicado(padrao); setPagina(1); setOrdem(""); setDir("asc"); };
  const ordenar = (chave: string) => {
    if (ordem === chave) setDir(dir === "asc" ? "desc" : "asc"); else { setOrdem(chave); setDir("asc"); }
    setPagina(1);
  };
  const de = x ? (x.total ? (x.pagina - 1) * x.porPagina + 1 : 0) : 0, ate = x ? Math.min(x.total, x.pagina * x.porPagina) : 0;
  const paginas: number[] = x ? Array.from({ length: x.paginas }, (_, i) => i + 1).filter((p) => p === 1 || p === x.paginas || Math.abs(p - x.pagina) <= 2) : [];
  const marca = obrigatorios ? " *" : "";

  return (
    <>
      <div className="dm-cab">
        <div><h1>{titulo}</h1></div>
        <div className="dm-cab-acoes">
          {csv && <button className="botao primario" onClick={() => salvar(() => gerar(() => buscarCsvRel(`/relatorio/${id}/csv?inicio=${aplicado.inicio}&fim=${aplicado.fim}`), `${id}.csv`), "")}>Exportar</button>}
          <button className="botao" disabled={!x?.total} onClick={() => window.print()}>Imprimir</button>
        </div>
      </div>
      <Aviso erro={msg?.erro} ok={msg?.ok} />
      <div className="est-layout">
        <form className="dm-cartao est-filtros" onSubmit={filtrar}>
          <h3>Filtros</h3>
          <label className="dm-campo"><span>Data inicial{marca}</span><input type="date" required value={form.inicio} onChange={(e) => setForm({ ...form, inicio: e.target.value })} /></label>
          <label className="dm-campo"><span>Data final{marca}</span><input type="date" required value={form.fim} onChange={(e) => setForm({ ...form, fim: e.target.value })} /></label>
          <button className="botao primario" type="submit">Filtrar</button>
          <button className="botao" type="button" onClick={limpar}>Limpar filtros</button>
        </form>
        <div className="dm-cartao tabela-rola est-tabela">
          <Aviso erro={d.erro} />
          {!x ? <Carregando /> : (
            <>
              <div className="est-resumo">{x.total ? `Exibindo ${de}-${ate} de ${x.total} resultados.` : ""}</div>
              <table>
                <thead>
                  <tr>{x.colunas.map((c: any) => (
                    <th key={c.chave} className={ALINHA_NUM.includes(c.tipo) ? "num" : ""} aria-sort={ordem === c.chave ? (dir === "asc" ? "ascending" : "descending") : "none"}>
                      <button type="button" className="est-ordem" onClick={() => ordenar(c.chave)}>{c.rotulo}{ordem === c.chave && <span aria-hidden> {dir === "asc" ? "▲" : "▼"}</span>}</button>
                    </th>
                  ))}</tr>
                </thead>
                <tbody>
                  {!x.linhas.length ? <tr><td colSpan={x.colunas.length} className="vazio">Nenhum resultado encontrado.</td></tr> : x.linhas.map((l: any, i: number) => (
                    <tr key={i}>{x.colunas.map((c: any) => <td key={c.chave} data-rotulo={c.rotulo} className={ALINHA_NUM.includes(c.tipo) ? "num" : ""}>{celula(c.tipo, l[c.chave])}</td>)}</tr>
                  ))}
                </tbody>
              </table>
              {x.paginas > 1 && (
                <div className="dm-cab-acoes est-paginas" role="navigation" aria-label="Páginas">
                  <button className="botao" disabled={x.pagina <= 1} onClick={() => setPagina(x.pagina - 1)}>←</button>
                  {paginas.map((p) => <button key={p} className={`botao ${p === x.pagina ? "primario" : ""}`} onClick={() => setPagina(p)}>{p}</button>)}
                  <button className="botao" disabled={x.pagina >= x.paginas} onClick={() => setPagina(x.pagina + 1)}>→</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {aviso}
    </>
  );
}
