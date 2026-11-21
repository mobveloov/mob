// Config › Gerais: as abas da "Alterando Bandeira" da Machine que são só formulário (Motorista, Passageiro, Financeiro, Filtros,
// Formas de pagamento e Recursos Premium). O desenho vem de comum/bandeira-form.ts: cada linha tem rótulo, campos e o texto de ajuda.

import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ehLinha, type AbaForm, type ControleForm, type LinhaForm, type ValoresForm } from "../../../comum/bandeira-form.ts";
import { Aviso, Carregando, pedirConfig, useCarregar, useGestor, useSalvar } from "../demais/comum";

const contador = (c: ControleForm, v: unknown) => (c.tipo === "area" || (c.tipo === "texto" && (c.tamanho ?? 0) > 0 && (c.tamanho ?? 0) <= 100 && /titulo|mensagem/.test(c.nome)) ? `${String(v ?? "").length}/${c.tamanho ?? 500}` : "");

export function BandeiraAbas({ aba, especiais, aoGravar, extra }: { aba: AbaForm; especiais?: Partial<Record<"documentos", ReactNode>>; aoGravar?: () => Promise<void>; extra?: ReactNode }) {
  const gestor = useGestor();
  const navegar = useNavigate();
  const d = useCarregar(() => pedirConfig("/bandeira-campos"), []);
  const [v, setV] = useState<ValoresForm | null>(null);
  const { msg, salvando, salvar } = useSalvar();
  useEffect(() => { if (d.dados) setV(structuredClone(d.dados.valores)); }, [d.dados]);
  if (!v) return <>{d.erro ? <Aviso erro={d.erro} /> : <Carregando />}</>;
  const categorias: Array<{ id: string; nome: string }> = d.dados?.categorias ?? [];
  const set = (nome: string, valor: string | number | boolean) => setV({ ...v, [nome]: valor });
  const habilitado = (c: ControleForm) => gestor && (!c.de || c.de.em.includes(String(v[c.de.nome])));
  const gravar = () => salvar(async () => {
    const nomes = aba.itens.filter(ehLinha).flatMap((l) => l.controles.map((c) => c.nome));
    const r = await pedirConfig("/bandeira-campos", "PUT", { valores: Object.fromEntries(nomes.map((n) => [n, v[n]])) });
    setV({ ...v, ...r.valores });
    await aoGravar?.();
  }, "Configurações gravadas.");

  const controle = (c: ControleForm, linha: LinhaForm) => {
    const nome = `${aba.id}-${c.nome}`;
    const on = habilitado(c);
    const dica = contador(c, v[c.nome]);
    if (c.tipo === "radio") {
      return <div key={c.nome} className="dm-radios dm-radios-col">{c.rotulo && <strong>{c.rotulo}</strong>}{(c.opcoes ?? []).map((o) => (
        <label key={o.v} className="dm-check"><input type="radio" name={nome} disabled={!on || o.desab} checked={String(v[c.nome]) === o.v} onChange={() => set(c.nome, o.v)} /> {o.t}</label>
      ))}</div>;
    }
    if (c.tipo === "caixa") return <label key={c.nome} className="dm-check"><input type="checkbox" disabled={!on} checked={!!v[c.nome]} onChange={(e) => set(c.nome, e.target.checked)} /> {c.rotulo ?? linha.rotulo}</label>;
    const cx = c.tipo === "selecao" ? (
      <select value={String(v[c.nome] ?? "")} disabled={!on} onChange={(e) => set(c.nome, e.target.value)} aria-label={c.rotulo ?? linha.rotulo}>
        {c.fonte === "categorias" ? <>{!v[c.nome] && <option value="">Selecione</option>}{categorias.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</> : (c.opcoes ?? []).map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
      </select>
    ) : c.tipo === "area" ? (
      <textarea rows={3} value={String(v[c.nome] ?? "")} maxLength={c.tamanho} disabled={!on} onChange={(e) => set(c.nome, e.target.value)} aria-label={c.rotulo ?? linha.rotulo} />
    ) : (
      <input type={c.tipo === "numero" ? "number" : "text"} inputMode={c.tipo === "numero" ? "decimal" : undefined} value={String(v[c.nome] ?? "")} min={c.min} max={c.max} step={c.passo ?? (c.tipo === "numero" ? "any" : undefined)}
        maxLength={c.tipo === "texto" ? c.tamanho : undefined} placeholder={c.dica} disabled={!on} onChange={(e) => set(c.nome, c.tipo === "numero" ? e.target.value : e.target.value)} aria-label={c.rotulo ?? linha.rotulo} />
    );
    return <label key={c.nome} className="dm-campo"><span>{c.rotulo && c.rotulo !== linha.rotulo ? c.rotulo : ""}{dica && <small> {dica}</small>}</span><span className="dm-linha">{cx}{c.unidade && <small>{c.unidade}</small>}</span></label>;
  };

  return (
    <>
      <Aviso erro={msg?.erro} ok={msg?.ok} />
      {aba.intro[0] && <div className="aviso" role="note">{aba.intro[0]}</div>}
      <section className="dm-cartao">
        {aba.intro[1] && <p className="sub">{aba.intro[1]}</p>}
        {aba.itens.map((i, k) => !ehLinha(i) ? <h3 key={k} className="dm-sep">{i.secao}</h3> : (
          <div key={k} className="dm-opcao">
            <h4>{i.rotulo}</h4>
            {i.especial === "documentos" ? especiais?.documentos : i.controles.map((c) => controle(c, i))}
            {i.ajuda && <small className="bloco" style={{ whiteSpace: "pre-line" }}>{i.ajuda}</small>}
          </div>
        ))}
      </section>
      {extra}
      <div className="dm-salvar"><button type="button" className="botao" onClick={() => navegar(-1)}>Voltar</button>{gestor && <button className="botao primario" disabled={salvando} onClick={gravar}>Gravar</button>}</div>
    </>
  );
}
