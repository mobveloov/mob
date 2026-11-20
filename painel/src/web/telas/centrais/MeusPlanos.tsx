// Meus planos: plano da central, tarifas, taxas, serviços adicionais e (para a principal) a categoria de bonificação da rede.
import { useState } from "react";
import { Check, ChevronDown, Crown, Gem, HelpCircle, Medal, Award } from "lucide-react";
import { Aviso, Cab, Carregando, Interruptor, Modal, dinheiro, useCarregar, useSalvar } from "../demais/comum";
import { AbrirAssociada } from "./AbrirAssociada";
import { definirFoco, pedirCentrais, useFoco, type CentralResumo } from "./comum";

const pct = (n: number) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const num = (n: number) => n.toLocaleString("pt-BR");
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const nomeMes = (c: string) => MESES[Number(c.split("-")[1]) - 1];
const lista = (a: string[]) => (a.length > 1 ? `${a.slice(0, -1).join(", ")} e ${a[a.length - 1]}` : a[0] ?? "");
const COR_FAIXA: Record<string, string> = { Bronze: "#b9794a", Prata: "#9aa3b2", Ouro: "#e0a93b", Safira: "#2f6fe4" };
const ICONE_FAIXA: Record<string, typeof Medal> = { Bronze: Medal, Prata: Medal, Ouro: Medal, Safira: Gem };

export function MeusPlanos() {
  const foco = useFoco();
  const d = useCarregar(() => pedirCentrais(`/planos${foco ? `?central=${encodeURIComponent(foco)}` : ""}`), [foco]);
  const redes = useCarregar(() => pedirCentrais<{ centrais: CentralResumo[]; podeAbrir: boolean }>("/rede"), []);
  const { msg, salvar } = useSalvar();
  const [abrir, setAbrir] = useState(false), [ajuda, setAjuda] = useState(false), [lista_, setLista] = useState(false);
  const x = d.dados;
  const salvarPlano = (plano: string) => salvar(async () => { await pedirCentrais("/planos", "PUT", { central: foco || undefined, plano }); d.recarregar(); }, "Plano atualizado.");
  const alternar = (id: string, ativo: boolean) => {
    const atuais = (x?.servicos ?? []).filter((s: any) => s.ativo).map((s: any) => s.id as string);
    const novos = ativo ? [...atuais, id] : atuais.filter((s: string) => s !== id);
    return salvar(async () => { await pedirCentrais("/servicos", "PUT", { central: foco || undefined, servicos: novos }); d.recarregar(); }, "Serviços atualizados.");
  };
  return (
    <>
      <Cab titulo="Meus planos" sub="Plano, tarifas e serviços adicionais da central" />
      <Aviso erro={d.erro ?? msg?.erro} ok={msg?.ok} />
      {redes.dados?.podeAbrir && (
        <div className="dm-cartao cc-chamada">
          <div><strong>Precisa expandir sua empresa?</strong><p>Crie centrais associadas para configurar despacho, taxas e categorias conforme o público de cada cidade.</p></div>
          <button className="botao primario" onClick={() => setAbrir(true)}>Abrir uma central associada</button>
        </div>
      )}
      {!x ? null : (
        <div className="mp-cabeca">
          <h2 id="meus-planos-title">{x.central.nome} - Plano {x.plano.nome}{x.plano.nome === "Ultra" && <Crown size={24} className="mp-coroa" aria-label="Plano Ultra" />}</h2>
          {(redes.dados?.centrais?.length ?? 0) > 1 && (
            <div className="mp-dropdown">
              <button type="button" className="mp-dropdown-botao" aria-haspopup="listbox" aria-expanded={lista_} onClick={() => setLista(!lista_)}>
                <span>{redes.dados!.centrais.find((c) => c.id === (foco || redes.dados!.centrais[0].id))?.tipo === "principal" ? "Central principal" : redes.dados!.centrais.find((c) => c.id === foco)?.rotulo}</span><ChevronDown size={18} />
              </button>
              {lista_ && (
                <div className="mp-dropdown-lista" role="listbox">
                  {redes.dados!.centrais.map((c) => <a key={c.id} role="option" href="#" onClick={(e) => { e.preventDefault(); setLista(false); definirFoco(c.id === redes.dados!.centrais[0].id ? "" : c.id); }}>{c.tipo === "principal" ? "Central principal" : c.rotulo}</a>)}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {!x ? <Carregando /> : (
        <>
          {!x.podeEditar && <p className="dm-dica">Você vê o plano desta central; só ela mesma pode mudar.</p>}
          {x.rede && (() => {
            const Ic = ICONE_FAIXA[x.rede.categoria] ?? Award, cor = COR_FAIXA[x.rede.categoria] ?? "#e0a93b";
            const alvo = x.rede.proxima ? x.rede.finalizadasRede + x.rede.proxima.faltam : x.rede.finalizadasRede || 1;
            const larg = Math.max(8, Math.min(100, Math.round((x.rede.finalizadasRede / alvo) * 100)));
            return (
              <section className="mp-cartao" aria-label="Bonificação da rede" style={{ ["--faixa" as string]: cor }}>
                <div className="mp-destaque">
                  <div className="mp-faixa"><span className="mp-gema"><Ic size={30} /></span><div><div className="mp-suave">Sua categoria</div><div className="mp-faixa-nome">{x.rede.categoria}</div></div></div>
                  <div className="mp-credito">
                    <div><div className="mp-credito-titulo">Você recebe <b>{x.rede.percentual}%</b> de <b>bonificação</b>
                      <button type="button" className="mp-ajuda" aria-label="Como funciona a bonificação" onClick={() => setAjuda(true)}>?</button></div>
                      <div className="mp-suave">sobre a tarifa da plataforma nesta faixa</div></div>
                    <div className="mp-credito-valor"><span className="mp-suave">Bonificação recebida este mês</span><strong>{dinheiro(x.rede.recebidaNoMes)}</strong></div>
                  </div>
                </div>
                <div className="mp-barra"><div style={{ width: `${larg}%` }} /></div>
                <div className="mp-barra-meta">
                  <span><strong>{num(x.rede.finalizadasRede)}</strong> corridas finalizadas pela rede {x.central.nome} em {lista([...x.rede.meses].reverse().map(nomeMes))}</span>
                  {x.rede.proxima && <span className="mp-suave">Faltam <strong>{num(x.rede.proxima.faltam)}</strong> para {x.rede.proxima.nome}</span>}
                </div>
              </section>
            );
          })()}
          <div className="mp-grade3">
            <section className="mp-cartao" aria-label="Tarifa por corrida">
              <h3 className="mp-titulo">Tarifa por corridas finalizadas</h3>
              <div className="mp-formula"><span className="mp-chip">{dinheiro(x.plano.tarifaFixa)} <small>fixo</small></span><span className="mp-op">+</span><span className="mp-chip">{pct(x.plano.percentual)} <small>do valor bruto</small></span></div>
              <div className="mp-teto">Cobrança sempre limitada ao teto de <b>{dinheiro(x.plano.teto)}</b> por corrida finalizada.</div>
            </section>
            <section className="mp-cartao" aria-label="Cobrança fixa mensal">
              <h3 className="mp-titulo">Cobrança fixa mensal</h3>
              <div className="mp-preco">{dinheiro(x.plano.mensalidade)} <small>/ mês</small></div>
              <p className="mp-suave">É cobrado <b>todos os meses</b>, independentemente do faturamento da central, somado às tarifas da plataforma e aos serviços adicionais.</p>
            </section>
            <section className="mp-cartao" aria-label="Taxas">
              <h3 className="mp-titulo">Taxas</h3>
              <div className="mp-taxa"><span>Taxa Pix</span><strong>{x.plano.taxaPix.percentual.toLocaleString("pt-BR")}% (mínimo {dinheiro(x.plano.taxaPix.minimo)})</strong></div>
              <div className="mp-taxa"><span>Taxa de saque via pix</span><strong>{dinheiro(x.plano.taxaSaquePix)}</strong></div>
            </section>
          </div>
          {x.plano.inclusos.length > 0 && (
            <section className="mp-cartao" aria-label="Recursos inclusos sem custo adicional">
              <h3 className="mp-titulo">Incluso sem custo adicional</h3>
              <div className="mp-checks">{x.plano.inclusos.map((i: string) => <div key={i}><Check size={16} />{i}</div>)}</div>
            </section>
          )}
          <section className="mp-cartao" aria-label="Serviços adicionais">
            <h3 className="mp-titulo">Serviços adicionais <span className="mp-ajuda" tabIndex={0} role="note" title="Cobrado no último dia de cada mês, junto às demais cobranças da central." aria-label="Cobrado no último dia de cada mês, junto às demais cobranças da central.">?</span></h3>
            {x.servicos.map((s: any) => (
              <div key={s.id} className="cc-servico">
                <div><strong>{s.nome}</strong><p>{s.descricao}</p></div>
                <div className="cc-preco">{dinheiro(s.preco)} <small>/ {s.unidade === "mês" ? "mês" : "a cada 1000 corridas"}</small></div>
                <Interruptor valor={s.ativo} onChange={(v) => alternar(s.id, v)} desabilitado={!x.podeEditar} rotulo={s.ativo ? "Ativo" : "Desativado"} />
              </div>
            ))}
          </section>
          <div className="dm-cartao">
            <h3>Planos disponíveis</h3>
            <div className="cc-planos">
              {x.planos.map((p: any) => (
                <div key={p.id} className={`cc-plano ${p.id === x.plano.id ? "atual" : ""}`}>
                  <strong>{p.nome}</strong>
                  <span>{dinheiro(p.mensalidade)} / mês</span>
                  <small>{dinheiro(p.tarifaFixa)} + {pct(p.percentual)} por corrida (teto {dinheiro(p.teto)})</small>
                  <small>{p.inclusos.length} serviço{p.inclusos.length === 1 ? "" : "s"} incluso{p.inclusos.length === 1 ? "" : "s"}</small>
                  {p.id === x.plano.id ? <span className="selo ok">Plano atual</span> : x.podeEditar && <button className="botao" onClick={() => { if (confirm(`Mudar para o plano ${p.nome}?`)) salvarPlano(p.id); }}>Escolher</button>}
                </div>
              ))}
            </div>
            <p className="dm-dica">Sem gateway: a mudança vale a partir de agora no Demonstrativo Mensal; nada é cobrado automaticamente.</p>
          </div>
        </>
      )}
      <Modal aberto={ajuda} onFechar={() => setAjuda(false)} titulo="Como funciona a bonificação" sub="Sua categoria depende das corridas finalizadas pela rede nos últimos 3 meses">
        <table><thead><tr><th>Categoria</th><th>Corridas finalizadas (3 meses)</th><th>Bonificação</th></tr></thead>
          <tbody>{(x?.categorias ?? []).map((c: any) => <tr key={c.nome}><td>{c.nome}</td><td>a partir de {num(c.minimo)}</td><td>{c.bonificacao}% da tarifa da plataforma</td></tr>)}</tbody></table>
      </Modal>
      <AbrirAssociada aberto={abrir} onFechar={() => setAbrir(false)} onCriada={() => { redes.recarregar(); window.dispatchEvent(new Event("central-foco")); }} />
    </>
  );
}
