// Meus planos: plano da central, tarifas, taxas, serviços adicionais e (para a principal) a categoria de bonificação da rede.
import { useState } from "react";
import { Aviso, Cab, Carregando, Interruptor, dinheiro, useCarregar, useSalvar } from "../demais/comum";
import { AbrirAssociada } from "./AbrirAssociada";
import { definirFoco, pedirCentrais, useFoco, type CentralResumo } from "./comum";

const pct = (n: number) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const num = (n: number) => n.toLocaleString("pt-BR");

export function MeusPlanos() {
  const foco = useFoco();
  const d = useCarregar(() => pedirCentrais(`/planos${foco ? `?central=${encodeURIComponent(foco)}` : ""}`), [foco]);
  const redes = useCarregar(() => pedirCentrais<{ centrais: CentralResumo[]; podeAbrir: boolean }>("/rede"), []);
  const { msg, salvar } = useSalvar();
  const [abrir, setAbrir] = useState(false);
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
      {(redes.dados?.centrais?.length ?? 0) > 1 && (
        <div className="dm-cartao dm-filtros">
          <label>Central <select value={foco || redes.dados!.centrais[0].id} onChange={(e) => definirFoco(e.target.value === redes.dados!.centrais[0].id ? "" : e.target.value)}>
            {redes.dados!.centrais.map((c) => <option key={c.id} value={c.id}>{c.rotulo}{c.tipo === "principal" ? " (principal)" : ""}</option>)}</select></label>
        </div>
      )}
      {!x ? <Carregando /> : (
        <>
          <div className="dm-cartao"><h2>{x.central.nome} - Plano {x.plano.nome}</h2>{!x.podeEditar && <p className="dm-dica">Você vê o plano desta central; só ela mesma pode mudar.</p>}</div>
          {x.rede && (
            <div className="dm-kpis">
              <div className="dm-kpi destaque"><small>Sua categoria</small><strong>{x.rede.categoria}</strong><small>Você recebe {x.rede.percentual}% de bonificação sobre as tarifas da plataforma</small></div>
              <div className="dm-kpi"><small>Bonificação recebida este mês</small><strong>{dinheiro(x.rede.recebidaNoMes)}</strong></div>
              <div className="dm-kpi"><small>Corridas finalizadas pela rede (3 meses)</small><strong>{num(x.rede.finalizadasRede)}</strong>{x.rede.proxima && <small>Faltam {num(x.rede.proxima.faltam)} para {x.rede.proxima.nome}</small>}</div>
            </div>
          )}
          <div className="dm-kpis">
            <div className="dm-kpi"><small>Tarifa por corrida finalizada</small><strong>{dinheiro(x.plano.tarifaFixa)}</strong><small>fixo + {pct(x.plano.percentual)} do valor bruto, limitado a {dinheiro(x.plano.teto)} por corrida</small></div>
            <div className="dm-kpi"><small>Cobrança fixa mensal</small><strong>{dinheiro(x.plano.mensalidade)}</strong><small>por mês, somada às tarifas e aos serviços adicionais</small></div>
            <div className="dm-kpi"><small>Taxas</small><strong>Pix {x.plano.taxaPix.percentual.toLocaleString("pt-BR")}%</strong><small>mínimo {dinheiro(x.plano.taxaPix.minimo)}; saque via Pix {dinheiro(x.plano.taxaSaquePix)}</small></div>
          </div>
          <div className="dm-cartao">
            <h3>Incluso sem custo adicional</h3>
            {x.plano.inclusos.length ? <ul>{x.plano.inclusos.map((i: string) => <li key={i}>{i}</li>)}</ul> : <p className="dm-dica">Este plano não inclui serviços sem custo. Veja os planos abaixo.</p>}
          </div>
          <div className="dm-cartao">
            <h3>Serviços adicionais</h3>
            {x.servicos.map((s: any) => (
              <div key={s.id} className="cc-servico">
                <div><strong>{s.nome}</strong><p>{s.descricao}</p></div>
                <div className="cc-preco">{dinheiro(s.preco)} <small>/ {s.unidade === "mês" ? "mês" : "a cada 1000 corridas"}</small></div>
                <Interruptor valor={s.ativo} onChange={(v) => alternar(s.id, v)} desabilitado={!x.podeEditar} rotulo={s.ativo ? "Ativo" : "Desativado"} />
              </div>
            ))}
          </div>
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
      <AbrirAssociada aberto={abrir} onFechar={() => setAbrir(false)} onCriada={() => { redes.recarregar(); window.dispatchEvent(new Event("central-foco")); }} />
    </>
  );
}
