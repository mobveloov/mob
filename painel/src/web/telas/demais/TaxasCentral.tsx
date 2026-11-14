// Config › Taxas da central › Taxa por corrida: taxas cobradas a cada corrida, do motorista ou do passageiro.
// Cada taxa tem nome, faixas de valor (porcentagem ou valor fixo), quem paga, categorias e formas de pagamento.
// Servidor: /api/config/taxas (src/config/taxas.ts). Vale para a central escolhida no topo (cada central tem as suas).

import { useState } from "react";
import { ChevronRight, Info, Plus, PlusCircle, Trash2 } from "lucide-react";
import { FORMAS_TAXA, MAX_FAIXAS, resumoDaTaxa, simular, type FaixaTaxa, type Taxa } from "../../../comum/taxas";
import { Abas, Aviso, Cab, Campo, Carregando, Modal, dinheiro, pedirConfig, useAdmin, useCarregar, useSalvar } from "./comum";

const num = (v: string) => (v === "" ? 0 : Number(String(v).replace(/\./g, "").replace(",", ".")) || 0);
const txt = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));
const rs = (n: number) => dinheiro(n);

interface Rascunho { id?: string; nome: string; quemPaga: "motorista" | "passageiro"; categorias: string[]; pagamentos: string[]; faixas: FaixaTaxa[] }
const NOVA: Rascunho = { nome: "", quemPaga: "motorista", categorias: [], pagamentos: [], faixas: [{ de: 0, ate: null, tipo: "porcentagem", valor: 0 }] };

export function TaxasCentral() {
  const admin = useAdmin();
  const [aba, setAba] = useState<"taxa" | "automacoes">("taxa");
  const d = useCarregar(() => pedirConfig<{ taxas: Taxa[]; categorias: string[] }>("/taxas"), []);
  const [edit, setEdit] = useState<Rascunho | null>(null);
  const taxas = d.dados?.taxas ?? [];
  return (
    <>
      <Cab titulo="Taxas da central" sub="Defina o que a central cobra a cada corrida, do motorista ou do passageiro." />
      <Abas abas={[["taxa", "Taxa por corrida"], ["automacoes", "Automações"]]} valor={aba} onChange={setAba} />
      {aba === "automacoes" ? (
        <section className="dm-cartao dm-secao"><div className="dm-vazio-pequeno"><h4>Nenhuma automação por aqui</h4><p>As taxas valem para todas as corridas finalizadas, sem nada a mais para ligar.</p></div></section>
      ) : (
        <>
          <div className="dm-info"><Info size={16} aria-hidden /> <span>Ao criar várias taxas, verifique se elas não se sobrepõem para evitar uma cobrança indevida.</span></div>
          <section className="dm-cartao dm-secao">
            <div className="dm-linha dm-entre">
              <div><h3>Taxa da central</h3><p className="sub">Defina qual será o valor da taxa cobrada a cada corrida realizada. Você pode optar por um valor fixo ou percentual do total da corrida.</p></div>
            </div>
            <Aviso erro={d.erro} />
            {!d.dados ? <Carregando /> : !taxas.length ? <div className="dm-vazio-pequeno"><h4>Nenhuma taxa criada</h4><p>Sem taxas, nada é cobrado por corrida além da comissão das categorias.</p></div> : (
              <ul className="dm-taxas">
                {taxas.map((t) => (
                  <li key={t.id}>
                    <button className="dm-taxa" onClick={() => setEdit({ id: t.id, nome: t.nome, quemPaga: t.quemPaga, categorias: t.categorias, pagamentos: t.pagamentos, faixas: t.faixas })} aria-label={`Abrir a taxa ${t.nome}`}>
                      <strong>{t.nome}</strong>
                      <span><small>Taxa</small>{resumoDaTaxa(t.faixas)}</span>
                      <span><small>Quem paga</small>{t.quemPaga === "motorista" ? "Motorista" : "Passageiro"}</span>
                      <span><small>Categorias</small>{t.categorias.join(", ")}</span>
                      <span><small>Tipos de pagamento</small>{t.pagamentos.length === FORMAS_TAXA.length ? "Todas as formas de pagamento" : t.pagamentos.map((p) => FORMAS_TAXA.find((f) => f.id === p)?.nome ?? p).join(", ")}</span>
                      <ChevronRight size={18} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {admin && <div><button className="botao primario" onClick={() => setEdit(structuredClone(NOVA))}><Plus size={14} /> Criar taxa</button></div>}
          </section>
        </>
      )}
      {edit && <EditorTaxa inicial={edit} categorias={d.dados?.categorias ?? []} admin={admin} onFechar={() => setEdit(null)} onMudou={() => { setEdit(null); d.recarregar(); }} />}
    </>
  );
}

function EditorTaxa({ inicial, categorias, admin, onFechar, onMudou }: { inicial: Rascunho; categorias: string[]; admin: boolean; onFechar: () => void; onMudou: () => void }) {
  const [t, setT] = useState<Rascunho>(inicial);
  const [aba, setAba] = useState<"config" | "aplicacoes">("config");
  const [valorSim, setValorSim] = useState("20");
  const { msg, salvando, salvar } = useSalvar();
  const setFaixa = (i: number, p: Partial<FaixaTaxa>) => setT({ ...t, faixas: t.faixas.map((f, j) => (j === i ? { ...f, ...p } : f)) });
  // O "De" de cada faixa acompanha o "Até" da anterior.
  const mudarAte = (i: number, v: string) => setT({ ...t, faixas: t.faixas.map((f, j) => (j === i ? { ...f, ate: v === "" ? null : num(v) } : j === i + 1 ? { ...f, de: v === "" ? 0 : num(v) } : f)) });
  const adicionar = () => {
    const ult = t.faixas[t.faixas.length - 1];
    const de = ult.ate ?? ult.de + 10;
    setT({ ...t, faixas: [...t.faixas.slice(0, -1), { ...ult, ate: de }, { de, ate: null, tipo: "porcentagem", valor: 0 }] });
  };
  const tirar = (i: number) => setT({ ...t, faixas: t.faixas.filter((_, j) => j !== i).map((f, j, l) => ({ ...f, de: j === 0 ? 0 : l[j - 1].ate ?? f.de, ate: j === l.length - 1 ? null : f.ate })) });
  const alterna = (campo: "categorias" | "pagamentos", v: string) => setT({ ...t, [campo]: t[campo].includes(v) ? t[campo].filter((x) => x !== v) : [...t[campo], v] });
  const todos = (campo: "categorias" | "pagamentos", lista: string[]) => setT({ ...t, [campo]: t[campo].length === lista.length ? [] : [...lista] });
  const sim = simular(t.quemPaga, t.faixas, num(valorSim));
  const idsPag = FORMAS_TAXA.map((f) => f.id as string);
  return (
    <Modal aberto onFechar={onFechar} titulo={t.id ? "Editar taxa" : "Criar taxa"} larga>
      <form className="dm-form" onSubmit={async (e) => { e.preventDefault(); if (!admin) return; const r = await salvar(() => pedirConfig("/taxas", "POST", t), "Taxa salva."); if (r) onMudou(); }}>
        <Campo rotulo="Nome *" dica="O nome da taxa será mostrado no extrato do motorista e no extrato de crédito."><input value={t.nome} maxLength={60} required disabled={!admin} onChange={(e) => setT({ ...t, nome: e.target.value })} /></Campo>
        <Abas abas={[["config", "Configurações"], ["aplicacoes", "Aplicações"]]} valor={aba} onChange={setAba} />
        {aba === "config" ? (
          <>
            <h4>Valores da taxa</h4>
            <div className="tabela-rola"><table className="dm-faixas">
              <thead><tr><th>#</th><th>De</th><th>Até</th><th>Cobrar</th><th>Valor</th><th /></tr></thead>
              <tbody>{t.faixas.map((f, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{rs(f.de)}</td>
                  <td>{i === t.faixas.length - 1 ? "sem limite" : <input aria-label={`Até da faixa ${i + 1}`} inputMode="decimal" disabled={!admin} value={txt(f.ate)} onChange={(e) => mudarAte(i, e.target.value)} placeholder="0,00" />}</td>
                  <td><select aria-label={`Cobrar na faixa ${i + 1}`} disabled={!admin} value={f.tipo} onChange={(e) => setFaixa(i, { tipo: e.target.value as FaixaTaxa["tipo"] })}><option value="porcentagem">Porcentagem</option><option value="fixo">Valor fixo</option></select></td>
                  <td><span className="dm-prefixo">{f.tipo === "porcentagem" ? "%" : "R$"}</span><input aria-label={`Valor da faixa ${i + 1}`} inputMode="decimal" disabled={!admin} value={txt(f.valor)} onChange={(e) => setFaixa(i, { valor: num(e.target.value) })} placeholder="0,00" /></td>
                  <td>{admin && t.faixas.length > 1 && <button type="button" className="icone" aria-label={`Remover faixa ${i + 1}`} onClick={() => tirar(i)}><Trash2 size={14} /></button>}</td>
                </tr>
              ))}</tbody>
            </table></div>
            <div className="dm-linha dm-entre">
              {admin && t.faixas.length < MAX_FAIXAS ? <button type="button" className="botao" onClick={adicionar}><PlusCircle size={14} /> Adicionar outra faixa</button> : <span />}
              <small>{t.faixas.length} de {MAX_FAIXAS} faixas</small>
            </div>
            <h4>Quem irá pagar a taxa?</h4>
            <p className="sub">Define quem assumirá o custo financeiro desta taxa.</p>
            <div className="dm-opcoes">
              <label className={t.quemPaga === "passageiro" ? "ativo" : ""}><input type="radio" name="quem" disabled={!admin} checked={t.quemPaga === "passageiro"} onChange={() => setT({ ...t, quemPaga: "passageiro" })} /><span><strong>Passageiro</strong><small>A taxa será acrescida ao valor calculado da corrida.</small></span></label>
              <label className={t.quemPaga === "motorista" ? "ativo" : ""}><input type="radio" name="quem" disabled={!admin} checked={t.quemPaga === "motorista"} onChange={() => setT({ ...t, quemPaga: "motorista" })} /><span><strong>Motorista</strong><small>A taxa será abatida do valor a ser repassado ao motorista.</small></span></label>
            </div>
            <div className="dm-cartao">
              <h4>Simulador de taxa</h4>
              <Campo rotulo="Digite o valor da corrida"><input inputMode="decimal" value={valorSim} onChange={(e) => setValorSim(e.target.value)} placeholder="0,00" /></Campo>
              <div className="dm-duplo">
                <div><small>Total pago pelo passageiro</small><p><strong>{rs(sim.passageiroPaga)}</strong></p><small>{t.quemPaga === "passageiro" ? "(Valor base + Taxa)" : "(Valor base)"}</small></div>
                <div><small>Total recebido pelo motorista</small><p><strong>{rs(sim.motoristaRecebe)}</strong></p><small>{t.quemPaga === "motorista" ? "(Valor base - Taxa)" : "(Valor base)"}</small></div>
                <div><small>Receita da central</small><p><strong>{rs(sim.central)}</strong></p><small>(Taxa)</small></div>
              </div>
            </div>
          </>
        ) : (
          <>
            <h4>Categorias</h4>
            <p className="sub">Categorias aptas para essa taxa.</p>
            <label className="dm-check"><input type="checkbox" disabled={!admin} checked={!!categorias.length && t.categorias.length === categorias.length} onChange={() => todos("categorias", categorias)} /> Selecionar todos</label>
            <div className="dm-checks">{categorias.map((c) => <label key={c} className="dm-check"><input type="checkbox" disabled={!admin} checked={t.categorias.includes(c)} onChange={() => alterna("categorias", c)} /> {c}</label>)}</div>
            <h4>Forma de pagamento</h4>
            <p className="sub">Formas de pagamento válidas para essa taxa.</p>
            <label className="dm-check"><input type="checkbox" disabled={!admin} checked={t.pagamentos.length === idsPag.length} onChange={() => todos("pagamentos", idsPag)} /> Selecionar todos</label>
            <div className="dm-checks">{FORMAS_TAXA.map((f) => <label key={f.id} className="dm-check"><input type="checkbox" disabled={!admin} checked={t.pagamentos.includes(f.id)} onChange={() => alterna("pagamentos", f.id)} /> {f.nome}</label>)}</div>
          </>
        )}
        <Aviso erro={msg?.erro} />
        <div className="dm-rodape-modal">
          {admin && t.id && <button type="button" className="botao perigo" disabled={salvando} onClick={async () => { if (!confirm(`Excluir a taxa "${t.nome}"? As corridas já finalizadas não mudam.`)) return; const r = await salvar(() => pedirConfig(`/taxas/${t.id}`, "DELETE"), "Taxa excluída."); if (r) onMudou(); }}><Trash2 size={14} /> Excluir taxa</button>}
          <button type="button" className="botao" onClick={onFechar}>Cancelar</button>
          {admin && <button className="botao primario" disabled={salvando}>Salvar</button>}
        </div>
      </form>
    </Modal>
  );
}
