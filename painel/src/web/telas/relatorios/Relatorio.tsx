// Tela de relatório no formato da Machine: filtros (período e os do relatório), tabela paginada de 10 em 10, Exportar CSV e Imprimir.
// Os filtros e as colunas vêm do servidor (/api/relatorios/definicoes e /relatorio/:id).

import { useMemo, useState } from "react";
import { Download, Printer } from "lucide-react";
import { Aviso, Cab, Campo, Carregando, dinheiro, useCarregar, useSalvar } from "../demais/comum";
import { baixarCsvRel, mesAtual, pedirRel } from "./comum";

type Valores = Record<string, any>;
const num = (v: unknown, casas: number) => Number(v).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
export const celula = (tipo: string, v: unknown) => {
  if (v == null || v === "") return "";
  if (tipo === "dinheiro") return dinheiro(Number(v));
  if (tipo === "pct") return `${num(v, 2)}%`;
  if (tipo === "km") return num(v, 3);
  if (tipo === "numero") return Number(v).toLocaleString("pt-BR");
  return String(v);
};
const dataBrDia = (d: string) => d.split("-").reverse().join("/");

export function useDefinicoes() {
  return useCarregar(() => pedirRel<any>("/definicoes"), []);
}

export default function Relatorio({ id, filtrosIniciais, aoVoltar }: { id: string; filtrosIniciais?: Valores; aoVoltar?: () => void }) {
  const defs = useDefinicoes();
  const def = defs.dados?.relatorios.find((r: any) => r.id === id);
  const padrao = useMemo(() => ({ ...mesAtual(), ...(filtrosIniciais ?? {}) }), [filtrosIniciais]);
  const [form, setForm] = useState<Valores>(padrao);
  const [aplicado, setAplicado] = useState<Valores>(padrao);
  const [pagina, setPagina] = useState(1);
  const { msg, salvar } = useSalvar();

  // pré-preenche os padrões do relatório (ex.: taxa de 20%) na primeira vez
  const [iniciou, setIniciou] = useState(false);
  if (def && !iniciou) {
    setIniciou(true);
    const p = { ...Object.fromEntries((def.filtros as any[]).filter((f) => f.padrao != null).map((f) => [f.chave, f.padrao])), ...padrao };
    setForm(p); setAplicado(p);
  }

  const qs = (v: Valores, extra = "") => {
    const u = new URLSearchParams();
    for (const [k, x] of Object.entries(v)) if (x !== "" && x != null) u.set(k, Array.isArray(x) ? x.join("|") : String(x));
    return u.toString() + extra;
  };
  const consulta = qs(aplicado, `&pagina=${pagina}`);
  const obrigatorioFalta = !!def && (def.filtros as any[]).some((f) => f.obrigatorio && !String(aplicado[f.chave] ?? "").trim());
  const d = useCarregar(() => (obrigatorioFalta ? Promise.resolve(null) : pedirRel<any>(`/relatorio/${id}?${consulta}`)), [id, consulta, obrigatorioFalta]);
  const x = d.dados;
  const opc = defs.dados?.opcoes;

  const filtrar = (e: React.FormEvent) => { e.preventDefault(); setPagina(1); setAplicado(form); };
  const limpar = () => { setForm(padrao); setAplicado(padrao); setPagina(1); };
  const alternar = (chave: string, forma: string) => {
    const atual: string[] = form[chave] ?? [];
    setForm({ ...form, [chave]: atual.includes(forma) ? atual.filter((f) => f !== forma) : [...atual, forma] });
  };

  if (defs.erro) return <Aviso erro={defs.erro} />;
  if (!def) return <Carregando />;
  const de = x ? (x.pagina - 1) * x.porPagina + 1 : 0, ate = x ? Math.min(x.total, x.pagina * x.porPagina) : 0;
  const paginas: number[] = x ? Array.from({ length: x.paginas }, (_, i) => i + 1).filter((p) => p === 1 || p === x.paginas || Math.abs(p - x.pagina) <= 2) : [];

  return (
    <>
      <Cab titulo={def.titulo} sub={def.descricao}>
        {aoVoltar && <button className="botao" onClick={aoVoltar}>Voltar</button>}
        <button className="botao" disabled={obrigatorioFalta} onClick={() => salvar(() => baixarCsvRel(`/relatorio/${id}/csv?${qs(aplicado)}`, `${id}.csv`), "CSV exportado.")}><Download size={14} /> Exportar CSV</button>
        <button className="botao" onClick={() => window.print()}><Printer size={14} /> Imprimir</button>
      </Cab>
      <Aviso erro={msg?.erro} ok={msg?.ok} />
      <form className="dm-cartao dm-filtros" onSubmit={filtrar}>
        <Campo rotulo="Data inicial *"><input type="date" required value={form.inicio ?? ""} onChange={(e) => setForm({ ...form, inicio: e.target.value })} /></Campo>
        <Campo rotulo="Data final *"><input type="date" required value={form.fim ?? ""} onChange={(e) => setForm({ ...form, fim: e.target.value })} /></Campo>
        {(def.filtros as any[]).map((f) => {
          const rot = f.obrigatorio ? `${f.rotulo} *` : f.rotulo;
          if (f.tipo === "empresa") return <Campo key={f.chave} rotulo={rot}><select value={form[f.chave] ?? ""} onChange={(e) => setForm({ ...form, [f.chave]: e.target.value })}><option value="">Selecione</option>{opc?.empresas.map((n: string) => <option key={n}>{n}</option>)}</select></Campo>;
          if (f.tipo === "pagamento") return <Campo key={f.chave} rotulo={rot}><select value={form[f.chave] ?? ""} onChange={(e) => setForm({ ...form, [f.chave]: e.target.value })}><option value="">Selecione</option>{defs.dados.formas.map((n: string) => <option key={n}>{n}</option>)}</select></Campo>;
          if (f.tipo === "categoria") return <Campo key={f.chave} rotulo={rot}><select value={form[f.chave] ?? ""} onChange={(e) => setForm({ ...form, [f.chave]: e.target.value })}><option value="">Selecione</option>{opc?.categorias.map((n: string) => <option key={n}>{n}</option>)}</select></Campo>;
          if (f.tipo === "pagamentos") return (
            <fieldset key={f.chave} className="dm-campo" style={{ flexBasis: "100%", border: 0, padding: 0 }}>
              <span>{f.rotulo}</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>{defs.dados.formas.map((n: string) => <label key={n}><input type="checkbox" checked={(form[f.chave] ?? []).includes(n)} onChange={() => alternar(f.chave, n)} /> {n}</label>)}</div>
            </fieldset>
          );
          if (f.tipo === "percentual" || f.tipo === "dinheiro") return <Campo key={f.chave} rotulo={rot}><input type="number" min="0" max={f.tipo === "percentual" ? 100 : undefined} step="0.01" value={form[f.chave] ?? ""} onChange={(e) => setForm({ ...form, [f.chave]: e.target.value })} /></Campo>;
          return <Campo key={f.chave} rotulo={rot}><input value={form[f.chave] ?? ""} maxLength={80} onChange={(e) => setForm({ ...form, [f.chave]: e.target.value })} /></Campo>;
        })}
        <button className="botao primario">{id === "faturamento-periodo" ? "Gerar" : "Filtrar"}</button>
        <button type="button" className="botao" onClick={limpar}>Limpar filtros</button>
      </form>
      <Aviso erro={d.erro} />
      {obrigatorioFalta ? <p className="vazio">Escolha os filtros obrigatórios (*) e clique em Filtrar.</p> : !x ? <Carregando /> : (
        <div className="dm-cartao tabela-rola">
          <p><small>Período: {dataBrDia(x.periodo.inicio)} a {dataBrDia(x.periodo.fim)}. {x.total ? `Exibindo ${de}-${ate} de ${x.total} resultados.` : ""}</small></p>
          <table>
            <thead><tr>{x.colunas.map((c: any) => <th key={c.chave} className={["dinheiro", "numero", "pct", "km"].includes(c.tipo) ? "num" : ""}>{c.rotulo}</th>)}</tr></thead>
            <tbody>
              {!x.linhas.length ? <tr><td colSpan={x.colunas.length} className="vazio">Nenhum resultado encontrado.</td></tr> : x.linhas.map((l: any, i: number) => (
                <tr key={i}>{x.colunas.map((c: any) => <td key={c.chave} className={["dinheiro", "numero", "pct", "km"].includes(c.tipo) ? "num" : ""}>{celula(c.tipo, l[c.chave])}</td>)}</tr>
              ))}
            </tbody>
            {x.totais && x.total > 0 && <tfoot><tr>{x.colunas.map((c: any) => <td key={c.chave} className={["dinheiro", "numero", "pct", "km"].includes(c.tipo) ? "num" : ""}>{celula(c.tipo, x.totais[c.chave])}</td>)}</tr></tfoot>}
          </table>
          {x.paginas > 1 && (
            <div className="dm-cab-acoes" style={{ marginTop: 10 }} role="navigation" aria-label="Páginas">
              <button className="botao" disabled={x.pagina <= 1} onClick={() => setPagina(x.pagina - 1)}>←</button>
              {paginas.map((p) => <button key={p} className={`botao ${p === x.pagina ? "primario" : ""}`} onClick={() => setPagina(p)}>{p}</button>)}
              <button className="botao" disabled={x.pagina >= x.paginas} onClick={() => setPagina(x.pagina + 1)}>→</button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
