// Financeiro > Créditos (Recargas e Saques, Extrato) e Financeiro > Cartão (Painel de Controle, Transações, Saldo da Central,
// Saldo do Motorista) e Cobrança > Último boleto. Sem página de referência da Machine: telas simples em cima dos dados do painel.
// Os números vêm de /api/config/creditos/* e /api/config/cartao/* (cargo Gestor ou acima) e de /api/centrais/ultimo-boleto.

import { useState } from "react";
import { Link } from "react-router-dom";
import { Download, Search } from "lucide-react";
import { Aviso, Campo, Carregando, FiltroPeriodo, Modal, PERIODO_MES, PERIODOS_MACHINE, dataBr, dataHoraBr, dinheiro, pedirConfig, queryPeriodo, textoPeriodo, useAdmin, useCarregar, useSalvar, type PeriodoSel } from "./comum";
import { baixarCsv } from "./FinanceiroMachine";
import { baixarCsvCentrais, pedirCentrais, useFoco } from "../centrais/comum";

const ULTIMOS_30: PeriodoSel = { chave: "ultimos_30", inicio: "", fim: "" };
const tom = (s: string) => (["Pago", "Confirmada", "Repassado"].includes(s) ? "ok" : ["Pendente", "A repassar"].includes(s) ? "alerta" : ["—"].includes(s) ? "" : "ruim");

function Kpi({ t, v, sub, destaque, cor }: { t: string; v: string; sub?: string; destaque?: boolean; cor?: string }) {
  return <div className={`dm-kpi ${destaque ? "destaque" : ""}`}><small>{t}</small><strong className={cor}>{v}</strong>{sub && <small>{sub}</small>}</div>;
}
const din = (n: number | undefined) => (n == null ? "—" : dinheiro(n));

function Cabeca({ titulo, sub, per, onPer, csv, nomeCsv, onMsg }: { titulo: string; sub: string; per?: PeriodoSel; onPer?: (p: PeriodoSel) => void; csv?: string; nomeCsv?: string; onMsg?: (m: string | null) => void }) {
  const { salvar } = useSalvar();
  return (
    <div className="dm-cab">
      <div><h1>{titulo}</h1><p>{sub}{per ? ` · Período: ${textoPeriodo(per)}` : ""}</p></div>
      <div className="dm-cab-acoes">
        {per && onPer && <FiltroPeriodo valor={per} onChange={onPer} atalhos={PERIODOS_MACHINE} />}
        {csv && <button className="botao" onClick={async () => { onMsg?.(null); const r = await salvar(() => baixarCsv(csv, nomeCsv ?? "arquivo.csv")); if (r === undefined) onMsg?.("Não foi possível exportar o CSV."); }}><Download size={14} /> Exportar CSV</button>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Créditos > Recargas e Saques

const PADRAO_RS = { tipo: "todos", papel: "todos", situacao: "todos", busca: "" };

export function RecargasESaques() {
  const admin = useAdmin();
  const [per, setPer] = useState<PeriodoSel>(PERIODO_MES);
  const [f, setF] = useState(PADRAO_RS);
  const [recusar, setRecusar] = useState<any>(null), [motivo, setMotivo] = useState("");
  const { msg, salvar } = useSalvar();
  const [erroCsv, setErroCsv] = useState<string | null>(null);
  const qs = `${queryPeriodo(per)}&tipo=${f.tipo}&papel=${f.papel}&situacao=${f.situacao}&busca=${encodeURIComponent(f.busca)}`;
  const d = useCarregar(() => pedirConfig(`/creditos/recargas-saques?${qs}`), [qs]);
  const x = d.dados;
  const resolver = (id: string, acao: "pagar" | "recusar", m = "") => salvar(async () => { await pedirConfig(`/saques/${id}/${acao}`, "POST", { motivo: m }); d.recarregar(); }, acao === "pagar" ? "Saque marcado como pago." : "Saque recusado e valor devolvido à carteira.");
  return (
    <>
      <Cabeca titulo="Recargas e Saques" sub="Recargas de crédito e pedidos de saque de motoristas e passageiros" per={per} onPer={setPer} csv={`/creditos/recargas-saques/csv?${qs}`} nomeCsv="recargas-e-saques.csv" onMsg={setErroCsv} />
      <div className="dm-cartao dm-filtros">
        <label>Tipo<select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}><option value="todos">Recargas e saques</option><option value="recarga">Só recargas</option><option value="saque">Só saques</option></select></label>
        <label>Quem<select value={f.papel} onChange={(e) => setF({ ...f, papel: e.target.value })}><option value="todos">Motoristas e passageiros</option><option value="motorista">Motoristas</option><option value="passageiro">Passageiros</option></select></label>
        <label>Situação<select value={f.situacao} onChange={(e) => setF({ ...f, situacao: e.target.value })}><option value="todos">Todas</option>{(x?.situacoes ?? []).map((s: string) => <option key={s}>{s}</option>)}</select></label>
        <label className="dm-busca"><Search size={14} aria-hidden /><input type="search" value={f.busca} onChange={(e) => setF({ ...f, busca: e.target.value })} placeholder="Buscar por nome ou detalhe" aria-label="Buscar" /></label>
        <button className="botao" onClick={() => setF(PADRAO_RS)}>Limpar filtros</button>
      </div>
      <Aviso erro={d.erro ?? msg?.erro ?? erroCsv} ok={msg?.ok} />
      <div className="dm-kpis">
        <Kpi t="Recargas no período" v={din(x?.recargas.valor)} sub={`${x?.recargas.qtd ?? 0} entradas · Pix ${din(x?.recargas.pix)} · manual ${din(x?.recargas.manual)}`} destaque />
        <Kpi t="Saques aguardando" v={din(x?.saques.pendente)} sub={`${x?.saques.qtdPendentes ?? 0} pedidos`} />
        <Kpi t="Saques pagos" v={din(x?.saques.pago)} />
        <Kpi t="Saques recusados" v={din(x?.saques.recusado)} />
      </div>
      <div className="dm-cartao tabela-rola">
        <table>
          <thead><tr><th>Data</th><th>Tipo</th><th>Pessoa</th><th>Cidade</th><th>Origem e detalhe</th><th>Valor</th><th>Situação</th><th>Ações</th></tr></thead>
          <tbody>
            {!x ? <tr><td colSpan={8}>{d.erro ? "" : <Carregando />}</td></tr> : !x.itens.length ? <tr><td colSpan={8} className="vazio">Nenhuma recarga ou saque encontrado para os filtros selecionados.</td></tr> : x.itens.map((i: any) => (
              <tr key={i.id}>
                <td>{dataHoraBr(i.em)}</td><td>{i.tipo}</td>
                <td className="forte">{i.pessoa}<small className="bloco">{i.papel === "motorista" ? "Motorista" : "Passageiro"}</small></td><td>{i.cidade || "—"}</td>
                <td>{i.origem}<small className="bloco">{i.detalhe}</small></td>
                <td className={`num ${i.tipo === "Saque" ? "txt-ruim" : "txt-ok"}`}>{i.tipo === "Saque" ? "- " : ""}{dinheiro(i.valor)}</td>
                <td><span className={`selo ${tom(i.situacao)}`}>{i.situacao}</span></td>
                <td>{i.situacao === "Pendente" && admin && i.saqueId && <span className="dm-linha">
                  <button className="botao primario" onClick={() => confirm(`Marcar o saque de ${dinheiro(i.valor)} como pago? Faça o Pix antes.`) && resolver(i.saqueId, "pagar")}>Aprovar</button>
                  <button className="botao" onClick={() => { setMotivo(""); setRecusar(i); }}>Recusar</button></span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {x && x.total > x.itens.length && <p className="vazio">Mostrando {x.itens.length} de {x.total}. Refine os filtros ou exporte o CSV.</p>}
      </div>
      <p className="dm-dica">Pedidos de saque existem só para motoristas. Para recusar, o valor volta para a carteira do motorista.</p>
      <Modal aberto={!!recusar} onFechar={() => setRecusar(null)} titulo="Recusar saque" sub="O valor volta para a carteira do motorista.">
        <Campo rotulo="Motivo"><input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: chave Pix inválida" maxLength={200} /></Campo>
        <div className="dm-rodape-modal"><button className="botao" onClick={() => setRecusar(null)}>Cancelar</button><button className="botao primario" onClick={async () => { await resolver(recusar.saqueId, "recusar", motivo); setRecusar(null); }}>Recusar saque</button></div>
      </Modal>
    </>
  );
}

// ------------------------------------------------------------------ Créditos > Extrato

const PADRAO_EX = { papel: "todos", tipo: "todos", busca: "" };

export function ExtratoCreditos() {
  const [per, setPer] = useState<PeriodoSel>(PERIODO_MES);
  const [f, setF] = useState(PADRAO_EX);
  const [erroCsv, setErroCsv] = useState<string | null>(null);
  const qs = `${queryPeriodo(per)}&papel=${f.papel}&tipo=${f.tipo}&busca=${encodeURIComponent(f.busca)}`;
  const d = useCarregar(() => pedirConfig(`/creditos/extrato?${qs}`), [qs]);
  const x = d.dados;
  return (
    <>
      <Cabeca titulo="Extrato" sub="Movimentos de crédito das carteiras de motoristas e passageiros" per={per} onPer={setPer} csv={`/creditos/extrato/csv?${qs}`} nomeCsv="extrato-de-creditos.csv" onMsg={setErroCsv} />
      <div className="dm-cartao dm-filtros">
        <label className="dm-busca"><Search size={14} aria-hidden /><input type="search" value={f.busca} onChange={(e) => setF({ ...f, busca: e.target.value })} placeholder="Pessoa (nome ou telefone) ou descrição" aria-label="Buscar pessoa" /></label>
        <label>Quem<select value={f.papel} onChange={(e) => setF({ ...f, papel: e.target.value })}><option value="todos">Motoristas e passageiros</option><option value="motorista">Motoristas</option><option value="passageiro">Passageiros</option></select></label>
        <label>Tipo<select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}><option value="todos">Todos</option>{(x?.tipos ?? []).map(([v, n]: [string, string]) => <option key={v} value={v}>{n}</option>)}</select></label>
        <button className="botao" onClick={() => setF(PADRAO_EX)}>Limpar filtros</button>
      </div>
      <Aviso erro={d.erro ?? erroCsv} />
      <div className="dm-kpis">
        <Kpi t="Entradas" v={din(x?.entradas)} cor="txt-ok" />
        <Kpi t="Saídas" v={din(x?.saidas)} cor="txt-ruim" />
        <Kpi t="Resultado do período" v={din(x?.liquido)} sub={`${x?.total ?? 0} movimentos`} destaque />
      </div>
      <div className="dm-cartao tabela-rola">
        <table>
          <thead><tr><th>Data</th><th>Pessoa</th><th>Tipo</th><th>Descrição</th><th>Lançado por</th><th>Valor</th></tr></thead>
          <tbody>
            {!x ? <tr><td colSpan={6}>{d.erro ? "" : <Carregando />}</td></tr> : !x.itens.length ? <tr><td colSpan={6} className="vazio">Nenhum movimento encontrado para os filtros selecionados.</td></tr> : x.itens.map((i: any) => (
              <tr key={i.id}>
                <td>{dataHoraBr(i.em)}</td><td className="forte">{i.pessoa}<small className="bloco">{i.papel === "motorista" ? "Motorista" : "Passageiro"}{i.telefone ? ` · ${i.telefone}` : ""}</small></td>
                <td>{i.tipo}</td><td>{i.descricao}</td><td>{i.por}</td>
                <td className={`num ${i.valor < 0 ? "txt-ruim" : "txt-ok"}`}>{i.valor < 0 ? "- " : ""}{dinheiro(Math.abs(i.valor))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {x?.cortado && <p className="vazio">Mostrando os {x.itens.length} mais recentes de {x.total}. Refine os filtros ou exporte o CSV.</p>}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Cartão > Painel de Controle

function TaxaInfo({ t }: { t?: any }) {
  if (!t) return null;
  return <p className="dm-dica">Plano de recebimento: {t.plano}. Taxa do cartão no app: {String(t.percentual).replace(".", ",")}%, paga pela {t.pagaPor === "motorista" ? "pessoa do motorista" : "central"}. Repasse previsto em {t.prazoDias === 1 ? "1 dia" : `${t.prazoDias} dias`} (a maquininha não tem taxa nem repasse por aqui).</p>;
}

export function PainelCartao() {
  const [per, setPer] = useState<PeriodoSel>(ULTIMOS_30);
  const d = useCarregar(() => pedirConfig(`/cartao/painel?${queryPeriodo(per)}`), [per]);
  const x = d.dados;
  return (
    <>
      <Cabeca titulo="Painel de Controle" sub="Pagamentos por cartão no app e na maquininha" per={per} onPer={setPer} />
      <Aviso erro={d.erro} />
      <div className="dm-kpis">
        <Kpi t="Total pago no cartão" v={din(x?.total)} sub={`${x?.qtd ?? 0} pagamentos`} destaque />
        <Kpi t="Cartão no app (bruto)" v={din(x?.app.bruto)} sub={`${x?.app.qtd ?? 0} pagamentos`} />
        <Kpi t="Taxa do cartão no app" v={din(x?.app.taxa)} cor="txt-ruim" sub={x ? `${String(x.taxa.percentual).replace(".", ",")}%` : undefined} />
        <Kpi t="Líquido do app" v={din(x?.app.liquido)} />
        <Kpi t="Maquininha" v={din(x?.maquininha.bruto)} sub={`${x?.maquininha.qtd ?? 0} pagamentos`} />
      </div>
      <div className="dm-kpis">
        <Kpi t="Já repassado (app)" v={din(x?.repasses.repassado)} cor="txt-ok" />
        <Kpi t="A repassar (app)" v={din(x?.repasses.aRepassar)} />
      </div>
      <div className="dm-cartao tabela-rola">
        <h3>Por status</h3>
        <table>
          <thead><tr><th>Status</th><th>Quantidade</th><th>Valor</th></tr></thead>
          <tbody>{!x ? <tr><td colSpan={3}><Carregando /></td></tr> : x.porStatus.map((s: any) => <tr key={s.status}><td><span className={`selo ${tom(s.status)}`}>{s.status}</span></td><td>{s.qtd}</td><td className="num">{dinheiro(s.valor)}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="dm-cartao tabela-rola">
        <h3>Por forma de pagamento</h3>
        <table>
          <thead><tr><th>Forma</th><th>Quantidade</th><th>Valor</th></tr></thead>
          <tbody>{!x ? <tr><td colSpan={3}><Carregando /></td></tr> : !x.porForma.length ? <tr><td colSpan={3} className="vazio">Nenhum pagamento por cartão no período.</td></tr> : x.porForma.map((s: any) => <tr key={s.forma}><td>{s.forma}</td><td>{s.qtd}</td><td className="num">{dinheiro(s.valor)}</td></tr>)}</tbody>
        </table>
      </div>
      <TaxaInfo t={x?.taxa} />
    </>
  );
}

// ------------------------------------------------------------------ Cartão > Transações

const PADRAO_TR = { origem: "todas", status: "todos", repasse: "todos", busca: "" };

export function TransacoesCartao() {
  const [per, setPer] = useState<PeriodoSel>(ULTIMOS_30);
  const [f, setF] = useState(PADRAO_TR);
  const [erroCsv, setErroCsv] = useState<string | null>(null);
  const qs = `${queryPeriodo(per)}&origem=${f.origem}&status=${f.status}&repasse=${encodeURIComponent(f.repasse)}&busca=${encodeURIComponent(f.busca)}`;
  const d = useCarregar(() => pedirConfig(`/cartao/transacoes?${qs}`), [qs]);
  const x = d.dados;
  return (
    <>
      <Cabeca titulo="Transações" sub="Pagamentos de corridas por cartão" per={per} onPer={setPer} csv={`/cartao/transacoes/csv?${qs}`} nomeCsv="transacoes-de-cartao.csv" onMsg={setErroCsv} />
      <div className="dm-cartao dm-filtros">
        <label className="dm-busca"><Search size={14} aria-hidden /><input type="search" value={f.busca} onChange={(e) => setF({ ...f, busca: e.target.value })} placeholder="Código, OS, passageiro ou motorista" aria-label="Buscar transação" /></label>
        <label>Origem<select value={f.origem} onChange={(e) => setF({ ...f, origem: e.target.value })}><option value="todas">Todas</option><option value="App">Cartão no app</option><option value="Maquininha">Maquininha</option></select></label>
        <label>Status<select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="todos">Todos</option>{["Pago", "Pendente", "Chargeback", "Estornado", "Cancelado"].map((s) => <option key={s}>{s}</option>)}</select></label>
        <label>Repasse<select value={f.repasse} onChange={(e) => setF({ ...f, repasse: e.target.value })}><option value="todos">Todos</option><option>Repassado</option><option>A repassar</option></select></label>
        <button className="botao" onClick={() => setF(PADRAO_TR)}>Limpar filtros</button>
      </div>
      <Aviso erro={d.erro ?? erroCsv} />
      <div className="dm-kpis">
        <Kpi t="Valor bruto" v={din(x?.bruto)} sub={`${x?.total ?? 0} transações`} destaque />
        <Kpi t="Taxas" v={din(x?.taxas)} cor="txt-ruim" />
        <Kpi t="Valor líquido" v={din(x?.liquido)} />
      </div>
      <div className="dm-cartao tabela-rola">
        <table>
          <thead><tr><th>Data e hora</th><th>Código</th><th>Origem</th><th>OS</th><th>Passageiro</th><th>Motorista</th><th>Status</th><th>Repasse</th><th>Valor</th><th>Taxa</th><th>Líquido</th></tr></thead>
          <tbody>
            {!x ? <tr><td colSpan={11}>{d.erro ? "" : <Carregando />}</td></tr> : !x.itens.length ? <tr><td colSpan={11} className="vazio"><strong>Nenhuma transação de cartão encontrada para os filtros selecionados</strong></td></tr> : x.itens.map((i: any) => (
              <tr key={i.id}>
                <td>{dataHoraBr(i.em)}</td><td><code>{i.codigo}</code></td><td>{i.forma}</td><td>{i.os}</td><td>{i.passageiro}</td><td>{i.motorista || "—"}</td>
                <td><span className={`selo ${tom(i.status)}`}>{i.status}</span></td>
                <td>{i.repasse === "—" ? "—" : <><span className={`selo ${tom(i.repasse)}`}>{i.repasse}</span><small className="bloco">{dataBr(i.repasseEm)}</small></>}</td>
                <td className="num">{dinheiro(i.valor)}</td><td className="num">{i.origem === "App" ? dinheiro(i.taxa) : "—"}</td><td className="num">{dinheiro(i.liquido)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {x && x.total > x.itens.length && <p className="vazio">Mostrando {x.itens.length} de {x.total}. Refine os filtros ou exporte o CSV.</p>}
      </div>
      <TaxaInfo t={x?.taxa} />
    </>
  );
}

// ------------------------------------------------------------------ Cartão > Saldo da Central

export function SaldoCentral() {
  const [per, setPer] = useState<PeriodoSel>(ULTIMOS_30);
  const d = useCarregar(() => pedirConfig(`/cartao/saldo-central?${queryPeriodo(per)}`), [per]);
  const x = d.dados;
  return (
    <>
      <Cabeca titulo="Saldo da Central" sub="Caixa da central, valores a receber e repasses do cartão" per={per} onPer={setPer} />
      <Aviso erro={d.erro} />
      <div className="dm-kpis">
        <Kpi t="Saldo atual" v={din(x?.saldoAtual)} sub="Comissões e recargas menos saques pagos" destaque />
        <Kpi t="Recargas de saldo aguardando" v={din(x?.aguardandoRecarga)} sub={`${x?.qtdRecargasAguardando ?? 0} pedidos`} />
        <Kpi t="A receber do cartão" v={din(x?.aReceber)} sub="Líquido do app ainda a repassar no período" />
        <Kpi t="Repassado do cartão" v={din(x?.repassado)} cor="txt-ok" sub="Líquido do app já repassado no período" />
      </div>
      <div className="dm-kpis">
        <Kpi t="Saldo inicial do período" v={din(x?.saldoInicial)} />
        <Kpi t="Entradas" v={din(x?.totalEntradas)} cor="txt-ok" />
        <Kpi t="Saídas" v={din(x?.totalSaidas)} cor="txt-ruim" />
        <Kpi t="Saldo final do período" v={din(x?.saldoFinal)} />
      </div>
      <div className="dm-cartao tabela-rola">
        <h3>Últimas movimentações</h3>
        <table>
          <thead><tr><th>Data</th><th>Descrição</th><th>Detalhe</th><th>Valor</th></tr></thead>
          <tbody>{!x ? <tr><td colSpan={4}><Carregando /></td></tr> : !x.movimentos.length ? <tr><td colSpan={4} className="vazio">Nenhuma movimentação no período.</td></tr> : x.movimentos.map((m: any) => (
            <tr key={m.id}><td>{dataHoraBr(m.em)}</td><td>{m.descricao}</td><td>{m.detalhe || "—"}</td><td className={`num ${m.tipo === "entrada" ? "txt-ok" : "txt-ruim"}`}>{m.tipo === "entrada" ? "" : "- "}{dinheiro(m.valor)}</td></tr>
          ))}</tbody>
        </table>
      </div>
      <p className="dm-dica">O painel não tem limite de crédito da central: o saldo é o que o caixa registrou. Para o dia a dia, veja o <Link to="/extrato-central">Extrato da central</Link>.</p>
      <TaxaInfo t={x?.taxa} />
    </>
  );
}

// ------------------------------------------------------------------ Cartão > Saldo do Motorista

export function SaldoMotorista() {
  const [per, setPer] = useState<PeriodoSel>(ULTIMOS_30);
  const [busca, setBusca] = useState("");
  const [erroCsv, setErroCsv] = useState<string | null>(null);
  const qs = `${queryPeriodo(per)}&busca=${encodeURIComponent(busca)}`;
  const d = useCarregar(() => pedirConfig(`/cartao/saldo-motorista?${qs}`), [qs]);
  const x = d.dados;
  return (
    <>
      <Cabeca titulo="Saldo do Motorista" sub="Saldo da carteira, saques pendentes e cartão por motorista" per={per} onPer={setPer} csv={`/cartao/saldo-motorista/csv?${qs}`} nomeCsv="saldo-do-motorista.csv" onMsg={setErroCsv} />
      <div className="dm-cartao dm-filtros">
        <label className="dm-busca"><Search size={14} aria-hidden /><input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar motorista (nome ou telefone)" aria-label="Buscar motorista" /></label>
      </div>
      <Aviso erro={d.erro ?? erroCsv} />
      <div className="dm-kpis">
        <Kpi t="Saldo total dos motoristas" v={din(x?.saldoTotal)} sub={`${x?.total ?? 0} motoristas`} destaque />
        <Kpi t="Saques pendentes" v={din(x?.saquesPendentes)} />
      </div>
      <div className="dm-cartao tabela-rola">
        <table>
          <thead><tr><th>Motorista</th><th>Cidade</th><th>Saldo na carteira</th><th>Saque pendente</th><th>Cartão repassado</th><th>Cartão a repassar</th></tr></thead>
          <tbody>{!x ? <tr><td colSpan={6}>{d.erro ? "" : <Carregando />}</td></tr> : !x.itens.length ? <tr><td colSpan={6} className="vazio">Nenhum motorista encontrado.</td></tr> : x.itens.map((i: any) => (
            <tr key={i.id}>
              <td className="forte">{i.nome}{i.suspenso && <span className="selo alerta"> Suspenso</span>}<small className="bloco">{i.telefone || "—"}</small></td><td>{i.cidade || "—"}</td>
              <td className={`num ${i.saldo < 0 ? "txt-ruim" : ""}`}>{dinheiro(i.saldo)}</td><td className="num">{dinheiro(i.saquePendente)}</td><td className="num">{dinheiro(i.cartaoRepassado)}</td><td className="num">{dinheiro(i.cartaoARepassar)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p className="dm-dica">Cartão repassado e a repassar são do cartão no app, no período escolhido, já descontada a taxa do plano.</p>
    </>
  );
}

// ------------------------------------------------------------------ Cobrança > Último boleto

export function UltimoBoleto() {
  const foco = useFoco();
  const d = useCarregar(() => pedirCentrais(`/ultimo-boleto${foco ? `?central=${encodeURIComponent(foco)}` : ""}`), [foco]);
  const { msg, salvar } = useSalvar();
  const x = d.dados;
  return (
    <>
      <div className="dm-cab"><div><h1>Último boleto</h1><p>Cobrança da plataforma para a central{x ? ` · ${x.central.nome}` : ""}</p></div></div>
      <Aviso erro={d.erro ?? msg?.erro} ok={msg?.ok} />
      <div className="dm-cartao tabela-rola">
        <table>
          <thead><tr><th>Competência</th><th>Plano</th><th>Vencimento</th><th>Valor</th><th>Situação</th><th>Ações</th></tr></thead>
          <tbody>
            {!x ? <tr><td colSpan={6}>{d.erro ? "" : <Carregando />}</td></tr> : (
              <tr>
                <td>{x.competenciaRotulo}</td><td>{x.plano.nome}</td>
                <td>{dataBr(x.vencimento)}{x.vencimentoPrevisto && <small className="bloco">previsto</small>}</td>
                <td className="num"><strong>{dinheiro(x.valor)}</strong>{x.descontos > 0 && <small className="bloco">já com {dinheiro(x.descontos)} de desconto</small>}</td>
                <td><span className="selo alerta">{x.status}</span></td>
                <td><span className="dm-linha">
                  <Link className="botao" to="/demonstrativo-mensal">Ver demonstrativo</Link>
                  <button className="botao" onClick={() => salvar(() => baixarCsvCentrais(`/demonstrativo/csv?${foco ? `central=${encodeURIComponent(foco)}&` : ""}competencia=${x.competencia}`, `demonstrativo-${x.competencia}.csv`), "CSV exportado.")}><Download size={14} /> Exportar CSV</button>
                </span></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {x && <p className="dm-dica">{x.aviso}{x.quemPaga === "principal" ? " Este boleto é pago pela central principal." : ""}</p>}
    </>
  );
}
