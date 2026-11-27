// Config › Gerais: as abas da "Alterando Bandeira" da Machine que são só formulário (Motorista, Passageiro, Financeiro, Filtros,
// Formas de pagamento e Recursos Premium). O desenho vem de comum/bandeira-form.ts: cada linha tem rótulo, campos e o texto de ajuda.

import { useEffect, useState, type MutableRefObject, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ehLinha, type AbaForm, type ControleForm, type LinhaForm, type ValoresForm } from "../../../comum/bandeira-form.ts";
import { Aviso, Carregando, pedirConfig, useCarregar, useGestor, useSalvar } from "../demais/comum";

const contador = (c: ControleForm, v: unknown) => (c.tipo === "area" || (c.tipo === "texto" && (c.tamanho ?? 0) > 0 && (c.tamanho ?? 0) <= 100 && /titulo|mensagem/.test(c.nome)) ? `${String(v ?? "").length}/${c.tamanho ?? 500}` : "");

/** Comandos que a tela de fora usa quando os campos da aba entram no "Salvar alterações" dela (sem Voltar/Gravar próprios). */
export type ComandosAba = { gravar: () => Promise<void>; desfazer: () => void };

export function BandeiraAbas({ aba, especiais, aoGravar, extra, comandos }: { aba: AbaForm; especiais?: Partial<Record<"documentos", ReactNode>>; aoGravar?: () => Promise<void>; extra?: ReactNode; comandos?: MutableRefObject<ComandosAba | null> }) {
  const gestor = useGestor();
  const navegar = useNavigate();
  const d = useCarregar(() => pedirConfig("/bandeira-campos"), []);
  const [v, setV] = useState<ValoresForm | null>(null);
  const [abertas, setAbertas] = useState<Record<string, number>>({});
  const { msg, salvando, salvar } = useSalvar();
  useEffect(() => { if (d.dados) setV(structuredClone(d.dados.valores)); }, [d.dados]);
  if (!v) return <>{d.erro ? <Aviso erro={d.erro} /> : <Carregando />}</>;
  const categorias: Array<{ id: string; nome: string }> = d.dados?.categorias ?? [];
  const set = (nome: string, valor: string | number | boolean) => setV({ ...v, [nome]: valor });
  const habilitado = (c: ControleForm) => gestor && (!c.de || c.de.em.includes(String(v[c.de.nome])));
  const enviarValores = async () => {
    const nomes = aba.itens.filter(ehLinha).flatMap((l) => l.controles.map((c) => c.nome));
    const r = await pedirConfig("/bandeira-campos", "PUT", { valores: Object.fromEntries(nomes.map((n) => [n, v[n]])) });
    setV({ ...v, ...r.valores });
    await aoGravar?.();
  };
  const gravar = () => salvar(enviarValores, "Configurações gravadas.");
  // Com "comandos", quem manda é a tela de fora: um só "Salvar alterações" grava estes campos junto com o resto.
  if (comandos) comandos.current = { gravar: enviarValores, desfazer: () => d.dados && setV(structuredClone(d.dados.valores)) };

  const controle = (c: ControleForm, linha: LinhaForm) => {
    const nome = `${aba.id}-${c.nome}`;
    const on = habilitado(c);
    const dica = contador(c, v[c.nome]);
    if (c.tipo === "radio") {
      return <div key={c.nome} className="dm-radios dm-radios-col">{c.rotulo && <strong>{c.rotulo}</strong>}{(c.opcoes ?? []).map((o) => (
        <label key={o.v} className="dm-check"><input type="radio" name={nome} disabled={!on || o.desab} checked={String(v[c.nome]) === o.v} onChange={() => set(c.nome, o.v)} /> {o.t}</label>
      ))}</div>;
    }
    if (c.tipo === "caixa") return <label key={c.nome} className="dm-check">{c.dica && <small className="bloco">{c.dica}</small>}<input type="checkbox" disabled={!on} checked={!!v[c.nome]} onChange={(e) => set(c.nome, e.target.checked)} /> {c.rotulo ?? linha.rotulo}</label>;
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

  /** Lista com "Adicionar nova mensagem" e "×" (como na Machine): mostra os espaços preenchidos e os que a pessoa abriu. */
  const mensagens = (linha: LinhaForm) => {
    const nomes = linha.controles.map((c) => c.nome);
    const cheios = nomes.reduce((ate, n, k) => (String(v[n] ?? "").trim() !== "" ? k + 1 : ate), 0);
    const visiveis = Math.min(nomes.length, Math.max(cheios, abertas[nomes[0]] ?? 0));
    // Os preenchidos ficam juntos no começo: apagar um puxa os de baixo para cima.
    const lista = nomes.map((n) => String(v[n] ?? ""));
    const gravarLista = (nova: string[]) => setV({ ...v, ...Object.fromEntries(nomes.map((n, k) => [n, nova[k] ?? ""])) });
    return (
      <div className="dm-lista-edit">
        <small>* Até 50 caracteres</small>
        {nomes.slice(0, visiveis).map((n, k) => (
          <div key={n} className="dm-linha">
            <input value={lista[k]} maxLength={50} placeholder="Escreva aqui" disabled={!gestor} aria-label={`Mensagem ${k + 1}`} onChange={(e) => set(n, e.target.value)} />
            {gestor && <button type="button" className="icone" aria-label={`Remover mensagem ${k + 1}`} onClick={() => { gravarLista(lista.filter((_, j) => j !== k)); setAbertas({ ...abertas, [nomes[0]]: Math.max(0, visiveis - 1) }); }}>×</button>}
          </div>
        ))}
        {gestor && visiveis < nomes.length && <button type="button" className="botao" onClick={() => setAbertas({ ...abertas, [nomes[0]]: visiveis + 1 })}>+ Adicionar nova mensagem</button>}
      </div>
    );
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
            {i.especial === "documentos" ? especiais?.documentos : i.especial === "mensagens" ? mensagens(i) : i.controles.map((c) => controle(c, i))}
            {i.ajuda && <small className="bloco" style={{ whiteSpace: "pre-line" }}>{i.ajuda}</small>}
          </div>
        ))}
      </section>
      {extra}
      {!comandos && <div className="dm-salvar"><button type="button" className="botao" onClick={() => navegar(-1)}>Voltar</button>{gestor && <button className="botao primario" disabled={salvando} onClick={gravar}>Gravar</button>}</div>}
    </>
  );
}
