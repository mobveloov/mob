// Financeiro: Carteiras, Extrato Geral, Saques, Recargas e Relatórios & Stats.

import { useMemo, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, Filter, Search, Wallet } from "lucide-react";
import Analise from "../../paginas/Analise";
import { Abas, Aviso, Cab, Campo, Carregando, FiltroPeriodo, Modal, PERIODO_MES, dataBr, dataHoraBr, dinheiro, pedirConfig, queryPeriodo, textoPeriodo, useAdmin, useCarregar, useSalvar, type PeriodoSel } from "./comum";

// ------------------------------------------------------------------ Carteiras

type Papel = "motorista" | "passageiro";
export function Carteiras() {
  const admin = useAdmin();
  const [papel, setPapel] = useState<Papel>("motorista");
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState("todos");
  const [menu, setMenu] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const lista = useCarregar(() => pedirConfig(`/carteiras?papel=${papel}&busca=${encodeURIComponent(busca)}&situacao=${situacao}`), [papel, busca, situacao]);
  return (
    <div className="dm-carteiras">
      <aside className={`dm-esquerda ${sel ? "oculta-movel" : ""}`}>
        <div className="dm-esq-topo">
          <div className="dm-linha"><h2>Carteiras</h2>
            <div className="dm-pilulas" role="tablist"><button role="tab" aria-selected={papel === "motorista"} className={papel === "motorista" ? "ativo" : ""} onClick={() => { setPapel("motorista"); setSel(null); }}>Motoristas</button><button role="tab" aria-selected={papel === "passageiro"} className={papel === "passageiro" ? "ativo" : ""} onClick={() => { setPapel("passageiro"); setSel(null); }}>Passageiros</button></div>
          </div>
          <div className="dm-linha">
            <label className="dm-busca"><Search size={16} /><input placeholder="Buscar..." value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar carteira" /></label>
            <div className="dm-dropdown"><button className="botao escuro" aria-label="Filtrar por status" onClick={() => setMenu(!menu)}><Filter size={16} /></button>
              {menu && <div className="dm-dropdown-menu direita"><small>Status</small>{["todos", "Ativos", "Suspensos"].map((s) => <button key={s} onClick={() => { setSituacao(s); setMenu(false); }}>{s === "todos" ? "Todos" : s}</button>)}</div>}
            </div>
          </div>
        </div>
        <div className="dm-esq-lista">
          {lista.carregando && !lista.dados ? <Carregando texto="Carregando carteiras..." /> : lista.erro ? <Aviso erro={lista.erro} /> : !lista.dados?.itens.length ? <p className="vazio">Nenhuma carteira encontrada.</p> :
            lista.dados.itens.map((i: any) => (
              <button key={i.chave} className={`dm-item ${sel === i.chave ? "ativo" : ""}`} onClick={() => setSel(i.chave)}>
                <span className={`dm-bolinha ${i.suspenso ? "ruim" : "ok"}`} aria-hidden />
                <span className="dm-item-nome"><strong>{i.nome}</strong><small>{i.telefone || i.cidade}</small></span>
                <b className={i.saldo < 0 ? "txt-ruim" : ""}>{dinheiro(i.saldo)}</b>
              </button>
            ))}
        </div>
        <div className="dm-esq-rodape"><span>Total: {lista.dados?.total ?? 0}</span><span className="txt-ok">Saldo: {dinheiro(lista.dados?.saldoTotal ?? 0)}</span></div>
      </aside>
      <section className="dm-direita">
        {sel ? <DetalheCarteira key={`${papel}${sel}`} papel={papel} chave={sel} admin={admin} onFechar={() => setSel(null)} onMudou={lista.recarregar} /> : (
          <div className="dm-vazio-grande"><div className="dm-circulo"><Wallet size={44} /></div><h3>Selecione uma Carteira</h3><p>Gerencie saldos, visualize extratos e faça ajustes financeiros com segurança.</p></div>
        )}
      </section>
    </div>
  );
}

function DetalheCarteira({ papel, chave, admin, onFechar, onMudou }: { papel: Papel; chave: string; admin: boolean; onFechar: () => void; onMudou: () => void }) {
  const [per, setPer] = useState<PeriodoSel>({ chave: "hoje", inicio: "", fim: "" });
  const [tudo, setTudo] = useState(false);
  const [ajuste, setAjuste] = useState<null | "adicionar" | "remover">(null);
  const d = useCarregar(() => pedirConfig(`/carteiras/${papel}/${encodeURIComponent(chave)}?${queryPeriodo(per.chave === "hoje" ? { ...per, chave: "hoje" } : per)}`), [papel, chave, per]);
  const x = d.dados;
  const lista: any[] = x ? (tudo ? x.transacoes : x.transacoes.slice(0, 8)) : [];
  return (
    <div className="dm-detalhe">
      <button className="botao dm-voltar" onClick={onFechar}>← Detalhes da Carteira</button>
      {d.erro && <Aviso erro={d.erro} />}
      {!x ? <Carregando /> : (
        <>
          <div className="dm-cartao dm-perfil"><div><h1>{x.nome}</h1><span className="selo">{papel === "motorista" ? "Motorista" : "Passageiro"}</span> <span>{x.telefone || "—"}</span> {x.suspenso && <span className="selo alerta">Suspenso</span>}</div></div>
          <div className="dm-cartao dm-saldo">
            <div><small>Saldo Disponível</small><h2 className={x.saldo < 0 ? "txt-ruim" : ""}>{dinheiro(x.saldo)}</h2></div>
            {admin && <div className="dm-linha"><button className="botao primario" onClick={() => setAjuste("adicionar")}><ArrowUpCircle size={16} /> Adicionar</button><button className="botao" onClick={() => setAjuste("remover")}><ArrowDownCircle size={16} /> Retirar</button></div>}
            <div className="dm-duplo"><div><small>Entradas</small><p className="txt-ok">{dinheiro(x.entradas)}</p></div><div><small>Saídas</small><p className="txt-ruim">{dinheiro(x.saidas)}</p></div></div>
          </div>
          <div className="dm-linha dm-entre"><div><small>Período Analisado</small> <FiltroPeriodo valor={per} onChange={setPer} extras={[["semana", "Esta Semana"], ["mes", "Este Mês"]]} /></div></div>
          <div className="dm-cartao">
            <div className="dm-linha dm-entre"><h3>Últimas Transações</h3>{x.transacoes.length > 8 && <button className="botao" onClick={() => setTudo(!tudo)}>{tudo ? "Ver menos" : "Ver tudo"}</button>}</div>
            {!lista.length ? <p className="vazio">Nenhuma transação neste período.</p> : <ul className="dm-transacoes">{lista.map((t) => <li key={t.id}><span><strong>{t.descricao}</strong><small>{dataHoraBr(t.em)} · {t.por}</small></span><b className={t.valor < 0 ? "txt-ruim" : "txt-ok"}>{t.valor > 0 ? "+ " : "- "}{dinheiro(Math.abs(t.valor))}</b></li>)}</ul>}
          </div>
        </>
      )}
      <ModalAjuste tipo={ajuste} onFechar={() => setAjuste(null)} papel={papel} chave={chave} onFeito={() => { setAjuste(null); d.recarregar(); onMudou(); }} />
    </div>
  );
}

function ModalAjuste({ tipo, onFechar, papel, chave, onFeito }: { tipo: null | "adicionar" | "remover"; onFechar: () => void; papel: Papel; chave: string; onFeito: () => void }) {
  const [valor, setValor] = useState(""), [desc, setDesc] = useState("");
  const { msg, salvando, salvar } = useSalvar();
  return (
    <Modal aberto={!!tipo} onFechar={onFechar} titulo={tipo === "remover" ? "Retirar saldo" : "Adicionar saldo"} sub="O lançamento fica registrado no extrato com o seu usuário.">
      <form className="dm-form" onSubmit={async (e) => { e.preventDefault(); const r = await salvar(() => pedirConfig(`/carteiras/${papel}/${encodeURIComponent(chave)}/ajuste`, "POST", { acao: tipo, valor: Number(valor.replace(",", ".")), descricao: desc })); if (r) { setValor(""); setDesc(""); onFeito(); } }}>
        <Campo rotulo="Valor (R$)"><input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" required /></Campo>
        <Campo rotulo="Motivo (aparece no extrato)"><input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ex.: Recarga manual" maxLength={120} /></Campo>
        <Aviso erro={msg?.erro} />
        <div className="dm-rodape-modal"><button type="button" className="botao" onClick={onFechar}>Cancelar</button><button className="botao primario" disabled={salvando || !valor}>{tipo === "remover" ? "Retirar" : "Adicionar"}</button></div>
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ Extrato Geral

export function Extrato() {
  const [aba, setAba] = useState<"geral" | "motorista" | "passageiro">("geral");
  const [per, setPer] = useState<PeriodoSel>(PERIODO_MES);
  const d = useCarregar(() => pedirConfig(`/extrato?aba=${aba}&${queryPeriodo(per)}`), [aba, per]);
  const x = d.dados;
  return (
    <>
      <Abas abas={[["geral", "Visão Geral"], ["motorista", "Motoristas"], ["passageiro", "Passageiros"]]} valor={aba} onChange={setAba} />
      <Cab titulo="Fluxo de Caixa" sub="Recargas, Comissões e Movimentações."><FiltroPeriodo valor={per} onChange={setPer} /></Cab>
      <Aviso erro={d.erro} />
      <div className="dm-kpis">
        <Kpi t="Faturamento (Comissões)" v={x?.faturamento} destaque />
        <Kpi t="Total Recargas" v={x?.recargas} sub="Pix + Manual" />
        <Kpi t="Via Pix (Auto)" v={x?.pix} />
        <Kpi t="Manual (ADM)" v={x?.manual} />
        <Kpi t="Total Saques" v={x?.saques} />
      </div>
      <div className="dm-cartao">
        <h3>Histórico de Entradas e Recargas</h3>
        {!x ? <Carregando /> : !x.historico.length ? <p className="vazio">Nenhuma movimentação em {textoPeriodo(per).toLowerCase()}.</p> : (
          <ul className="dm-transacoes">{x.historico.map((h: any) => <li key={h.id}><span><strong>{h.titulo}</strong><small>{h.papel === "motorista" ? "Mot" : "Pass"}: {h.pessoa}</small></span><span className="dm-dir"><b className="txt-ok">+ {dinheiro(h.valor)}</b><small>{dataHoraBr(h.em)}</small></span></li>)}</ul>
        )}
      </div>
    </>
  );
}

function Kpi({ t, v, sub, destaque }: { t: string; v: number | undefined; sub?: string; destaque?: boolean }) {
  return <div className={`dm-kpi ${destaque ? "destaque" : ""}`}><small>{t}</small><strong>{v == null ? "—" : dinheiro(v)}</strong>{sub && <small>{sub}</small>}</div>;
}

// ------------------------------------------------------------------ Saques

export function Saques() {
  const admin = useAdmin();
  const [per, setPer] = useState<PeriodoSel>(PERIODO_MES);
  const [recusar, setRecusar] = useState<any>(null), [motivo, setMotivo] = useState("");
  const d = useCarregar(() => pedirConfig(`/saques?${queryPeriodo(per)}`), [per]);
  const { msg, salvar } = useSalvar();
  const x = d.dados;
  return (
    <>
      <Cab titulo="Gestão de Saques" sub="Aprovação e histórico de retiradas."><FiltroPeriodo valor={per} onChange={setPer} /></Cab>
      <Aviso erro={d.erro ?? msg?.erro} />
      <div className="dm-kpis">
        <div className="dm-kpi destaque"><small>Aguardando Aprovação</small><strong>{x ? dinheiro(x.pendente) : "—"}</strong><small>{x?.qtdPendentes ?? 0} solicitações</small></div>
        <div className="dm-kpi"><small>Total Pago (Período)</small><strong>{x ? dinheiro(x.totalPago) : "—"}</strong><small>App + Manual</small></div>
        <div className="dm-kpi"><small>Pagamentos Manuais</small><strong>{x ? dinheiro(x.manuais) : "—"}</strong><small>Débitos via ADM</small></div>
      </div>
      <div className="dm-cartao tabela-rola">
        <table>
          <thead><tr><th>Data</th><th>Motorista</th><th>Cidade</th><th>Detalhe (Pix / Motivo)</th><th>Valor</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>
            {!x ? <tr><td colSpan={7}><Carregando /></td></tr> : !x.itens.length ? <tr><td colSpan={7} className="vazio">Nenhuma solicitação encontrada neste filtro.</td></tr> : x.itens.map((s: any) => (
              <tr key={s.id}>
                <td>{dataHoraBr(s.em)}</td><td className="forte">{s.nome}</td><td>{s.cidade || "—"}</td><td>{s.chavePix}{s.motivo && <small className="bloco">{s.motivo}</small>}</td><td className="num">{dinheiro(s.valor)}</td>
                <td><span className={`selo ${s.situacao === "Pago" ? "ok" : s.situacao === "Recusado" ? "ruim" : "alerta"}`}>{s.situacao}</span></td>
                <td>{s.situacao === "Pendente" && admin && <span className="dm-linha"><button className="botao primario" onClick={() => confirm(`Marcar o saque de ${dinheiro(s.valor)} como pago? Faça o Pix antes.`) && salvar(async () => { await pedirConfig(`/saques/${s.id}/pagar`, "POST", {}); d.recarregar(); }, "Saque pago.")}>Pagar</button><button className="botao" onClick={() => { setRecusar(s); setMotivo(""); }}>Recusar</button></span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal aberto={!!recusar} onFechar={() => setRecusar(null)} titulo="Recusar saque" sub="O valor volta para a carteira do motorista.">
        <Campo rotulo="Motivo"><input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: chave Pix inválida" maxLength={200} /></Campo>
        <div className="dm-rodape-modal"><button className="botao" onClick={() => setRecusar(null)}>Cancelar</button><button className="botao primario" onClick={async () => { await salvar(async () => { await pedirConfig(`/saques/${recusar.id}/recusar`, "POST", { motivo }); d.recarregar(); }, "Saque recusado."); setRecusar(null); }}>Recusar saque</button></div>
      </Modal>
    </>
  );
}

// ------------------------------------------------------------------ Recargas

export function Recargas() {
  const [aba, setAba] = useState<Papel>("motorista");
  const [per, setPer] = useState<PeriodoSel>(PERIODO_MES);
  const d = useCarregar(() => pedirConfig(`/recargas?aba=${aba}&${queryPeriodo(per)}`), [aba, per]);
  const x = d.dados;
  return (
    <>
      <Abas abas={[["motorista", "Motoristas"], ["passageiro", "Passageiros"]]} valor={aba} onChange={setAba} />
      <Cab titulo="Recargas & Entradas" sub="Histórico de Pix e créditos manuais."><FiltroPeriodo valor={per} onChange={setPer} /></Cab>
      <Aviso erro={d.erro} />
      <div className="dm-kpis">
        <div className="dm-kpi destaque"><small>Total Recebido</small><strong>{x ? dinheiro(x.total) : "—"}</strong><small>{x?.qtd ?? 0} entradas</small></div>
        <div className="dm-kpi"><small>Via Pix (Automático)</small><strong>{x ? dinheiro(x.pix) : "—"}</strong><small>Processado pelo App</small></div>
        <div className="dm-kpi"><small>Manual (ADM)</small><strong>{x ? dinheiro(x.manual) : "—"}</strong><small>Ajustes de carteira</small></div>
      </div>
      <div className="dm-cartao tabela-rola">
        <table>
          <thead><tr><th>Data</th><th>Usuário</th><th>Cidade</th><th>Detalhe</th><th>Origem</th><th>Valor</th></tr></thead>
          <tbody>{!x ? <tr><td colSpan={6}><Carregando /></td></tr> : !x.itens.length ? <tr><td colSpan={6} className="vazio">Nenhuma recarga encontrada.</td></tr> : x.itens.map((r: any) => (
            <tr key={r.id}><td>{dataHoraBr(r.em)}</td><td className="forte">{r.usuario}</td><td>{r.cidade || "—"}</td><td>{r.detalhe}</td><td>{r.origem}</td><td className="num txt-ok">{dinheiro(r.valor)}</td></tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Relatórios & Stats

export function Relatorios() {
  const [aba, setAba] = useState<"producao" | "ia">("producao");
  return (
    <>
      <Abas abas={[["producao", "Produção dos Motoristas"], ["ia", "Análise com IA"]]} valor={aba} onChange={setAba} />
      {aba === "producao" ? <Producao /> : <Analise />}
    </>
  );
}

function Producao() {
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const [f, setF] = useState({ busca: "", categoria: "todas", pagamento: "todos", inicio: hoje.slice(0, 8) + "01", fim: hoje, ordem: "faturamento_total", dir: "DESC" });
  const [aplicado, setAplicado] = useState(f);
  const qs = useMemo(() => new URLSearchParams(aplicado as Record<string, string>).toString(), [aplicado]);
  const d = useCarregar(() => pedirConfig(`/relatorios/producao?${qs}`), [qs]);
  const x = d.dados;
  const ordenar = (campo: string) => setAplicado({ ...aplicado, ordem: campo, dir: aplicado.ordem === campo && aplicado.dir === "DESC" ? "ASC" : "DESC" });
  return (
    <>
      <Cab titulo="Produção dos Motoristas" sub="Acompanhamento de faturamento e comissões." />
      <form className="dm-cartao dm-filtros" onSubmit={(e) => { e.preventDefault(); setAplicado(f); }}>
        <input placeholder="Nome, Placa ou Tel" value={f.busca} onChange={(e) => setF({ ...f, busca: e.target.value })} aria-label="Buscar motorista" />
        <select value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })} aria-label="Categoria"><option value="todas">Todas Categorias</option>{x?.categorias.map((c: string) => <option key={c}>{c}</option>)}</select>
        <select value={f.pagamento} onChange={(e) => setF({ ...f, pagamento: e.target.value })} aria-label="Pagamento"><option value="todos">Todos Pagam.</option>{x?.pagamentos.map((c: string) => <option key={c}>{c}</option>)}</select>
        <input type="date" value={f.inicio} onChange={(e) => setF({ ...f, inicio: e.target.value })} aria-label="Data inicial" /><input type="date" value={f.fim} onChange={(e) => setF({ ...f, fim: e.target.value })} aria-label="Data final" />
        <button className="botao primario"><Search size={14} /> Filtrar</button>
      </form>
      <Aviso erro={d.erro} />
      <div className="dm-kpis">
        <div className="dm-kpi"><small>Faturamento Bruto</small><strong>{x ? dinheiro(x.bruto) : "—"}</strong><small>Soma de todas as corridas</small></div>
        <div className="dm-kpi destaque"><small>Receita da Plataforma</small><strong>{x ? dinheiro(x.receita) : "—"}</strong><small>Valor a receber (Comissões)</small></div>
        <div className="dm-kpi"><small>Corridas Finalizadas</small><strong>{x?.corridas ?? "—"}</strong><small>No período selecionado</small></div>
      </div>
      <div className="dm-cartao tabela-rola">
        <table>
          <thead><tr><th><button className="dm-ordem" onClick={() => ordenar("nome")}>Motorista</button></th><th>Categoria</th><th><button className="dm-ordem" onClick={() => ordenar("qtd_corridas")}>Qtd</button></th><th><button className="dm-ordem" onClick={() => ordenar("faturamento_total")}>Faturamento</button></th><th><button className="dm-ordem" onClick={() => ordenar("ticket_medio")}>Ticket Médio</button></th><th><button className="dm-ordem" onClick={() => ordenar("comissao_total")}>Comissão (App)</button></th></tr></thead>
          <tbody>
            {!x ? <tr><td colSpan={6}><Carregando /></td></tr> : !x.itens.length ? <tr><td colSpan={6} className="vazio">Nenhuma corrida finalizada neste filtro.</td></tr> : x.itens.map((i: any) => (
              <tr key={`${i.motoristaId}${i.categoria}`}><td><strong>{i.motorista}</strong>{i.placa && <small className="bloco">{i.placa}</small>}</td><td>{i.categoria}</td><td>{i.qtd}</td><td className="num">{dinheiro(i.faturamento)}</td><td className="num">{dinheiro(i.ticket)}</td><td className="num txt-ok">{dinheiro(i.comissao)}</td></tr>
            ))}
          </tbody>
          {x && x.itens.length > 0 && <tfoot><tr><td>TOTAL GERAL</td><td>—</td><td>{x.corridas}</td><td className="num">{dinheiro(x.bruto)}</td><td>—</td><td className="num txt-ok">{dinheiro(x.receita)}</td></tr></tfoot>}
        </table>
      </div>
    </>
  );
}

export { dataBr };
