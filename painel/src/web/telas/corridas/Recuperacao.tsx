// Recuperação de Vendas ("Radar de Intenções"): quem cotou e não pediu, corridas perdidas e motoristas que deixaram chamadas passar.
import { useMemo, useState } from "react";
import { CheckCircle2, FileDown, MessageCircle } from "lucide-react";
import { baixar } from "../../api";
import { useSessao } from "../../App";
import { Aviso, Paginacao, Selo, Vazio, dh, fone, hojeBr, msgErro, op, qs, reais, useDados, zap } from "./comum";
import "./corridas.css";

type Aba = "passageiros" | "motoristas_simulou" | "motoristas_iniciou";
const ABAS: Array<[Aba, string]> = [["passageiros", "Passageiros (App)"], ["motoristas_simulou", "Motoristas: Só Simulou"], ["motoristas_iniciou", "Motoristas: Iniciaram"]];
const dias = (n: number) => new Date(Date.now() - 3 * 3600_000 - n * 86_400_000).toISOString().slice(0, 10);
const PERIODOS: Array<[string, string]> = [["hoje", "Hoje"], ["ontem", "Ontem"], ["7", "Últimos 7 Dias"], ["mes", "Este Mês"], ["custom", "Personalizado..."]];
const POR_PAGINA = 15;

export default function Recuperacao() {
  const { marca } = useSessao();
  const [aba, setAba] = useState<Aba>("passageiros");
  const [per, setPer] = useState("hoje");
  const [ini, setIni] = useState(hojeBr());
  const [fim, setFim] = useState(hojeBr());
  const [pagina, setPagina] = useState(1);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const intervalo = useMemo(() => {
    const hoje = hojeBr();
    if (per === "ontem") return { inicio: dias(1), fim: dias(1) };
    if (per === "7") return { inicio: dias(6), fim: hoje };
    if (per === "mes") return { inicio: `${hoje.slice(0, 8)}01`, fim: hoje };
    if (per === "custom") return { inicio: ini, fim: fim || ini };
    return { inicio: hoje, fim: hoje };
  }, [per, ini, fim]);
  const { dados, erro, carregando, recarregar } = useDados<any>(() => op(`/recuperacao${qs({ aba, ...intervalo })}`), [aba, intervalo.inicio, intervalo.fim]);
  const lista: any[] = dados?.lista ?? [];
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  const pg = Math.min(pagina, paginas);
  const itens = lista.slice((pg - 1) * POR_PAGINA, pg * POR_PAGINA);

  async function contatar(chave: string) {
    setErroAcao(null);
    try { await op("/recuperacao/contato", { chave }); recarregar(); } catch (e) { setErroAcao(msgErro(e)); }
  }
  function planilha() {
    const esc = (v: unknown) => { const s = String(v ?? "").replace(/"/g, '""'); return /[;"\n]/.test(s) ? `"${s}"` : s; };
    const linhas = aba === "passageiros"
      ? [["Data/Hora", "Tipo", "Cliente", "Telefone", "Origem", "Destino", "Categoria", "Valor", "Contatado em"], ...lista.map((x) => [dh(x.em), x.tipoTexto, x.cliente.nome, x.cliente.telefone, x.cotacao.origem, x.cotacao.destino, x.cotacao.categoria, x.valor ?? "", x.contatadoEm ? dh(x.contatadoEm) : ""])]
      : [["Data/Hora", "Motorista", "Telefone", "Evento", "Detalhe", "Contatado em"], ...lista.map((x) => [dh(x.em), x.motorista.nome, x.motorista.telefone, x.evento, x.detalhe, x.contatadoEm ? dh(x.contatadoEm) : ""])];
    baixar(`radar-intencoes-${aba}-${intervalo.inicio}.csv`, "﻿" + linhas.map((l) => l.map(esc).join(";")).join("\n"), "text/csv;charset=utf-8");
  }

  return (
    <div className="oc">
      <div className="oc-topo">
        <div><h1>Radar de Intenções <small>{marca.nomeExibido}</small></h1><p className="suave" style={{ margin: "2px 0 0" }}>Monitore cotações perdidas de clientes e simulações de motoristas.</p></div>
        <div className="oc-fila">
          <select value={per} onChange={(e) => { setPer(e.target.value); setPagina(1); }} aria-label="Período" style={{ width: 190 }}>{PERIODOS.map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select>
          {per === "custom" && <><input type="date" value={ini} onChange={(e) => setIni(e.target.value)} aria-label="Início" style={{ width: 150 }} /><input type="date" value={fim} onChange={(e) => setFim(e.target.value)} aria-label="Fim" style={{ width: 150 }} /></>}
          <button className="oc-btn" onClick={planilha} disabled={!lista.length}><FileDown size={16} /> Exportar</button>
        </div>
      </div>
      <Aviso texto={erro} erro /><Aviso texto={erroAcao} erro /><Aviso texto={dados?.aviso} />
      <div className="oc-kpis" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        <div className="oc-kpi ruim"><span>Perdidas (App)</span><strong>{dados?.resumo.qtd ?? 0}</strong><small>Cotações s/ pedido</small></div>
        <div className="oc-kpi alerta"><span>Retorno Potencial</span><strong>{reais(dados?.resumo.valor ?? 0)}</strong><small>Valor total abandonado</small></div>
      </div>
      <div className="oc-card">
        <div className="oc-abas">{ABAS.map(([k, r]) => <button key={k} className={aba === k ? "on" : ""} onClick={() => { setAba(k); setPagina(1); }}>{r}</button>)}</div>
        {carregando && !dados && <Vazio>Carregando dados...</Vazio>}
        {dados && !lista.length && !dados.aviso && <Vazio>Nada para recuperar neste período.</Vazio>}
        <div className="oc-lista-rec">
          {itens.map((x) => aba === "passageiros" ? (
            <div key={x.chave}>
              <div>
                <b>{x.cliente.nome}</b> {x.cliente.novo && <Selo tom="rox">Novo</Selo>} <Selo tom={x.tipo === "cotacao" ? "alerta" : "ruim"}>{x.tipoTexto}</Selo> <small className="suave">{dh(x.em)}</small>
                <div className="suave">{x.cotacao.origem} → {x.cotacao.destino}</div>
                <div className="suave">{x.cotacao.categoria} · {fone(x.cliente.telefone)}{x.historico && ` · última corrida ${reais(x.historico.ultimoValor)} em ${dh(x.historico.ultimaData)}`}</div>
              </div>
              <div className="oc-fila"><b style={{ fontSize: 18 }}>{reais(x.valor)}</b>{acao(x, x.cliente.telefone, contatar)}</div>
            </div>
          ) : (
            <div key={x.chave}>
              <div><b>{x.motorista.nome}</b> <Selo tom="alerta">{x.evento}</Selo> <small className="suave">{dh(x.em)}</small><div className="suave">{x.detalhe}</div></div>
              <div className="oc-fila">{acao(x, x.motorista.telefone, contatar)}</div>
            </div>
          ))}
        </div>
        {!!lista.length && <Paginacao pagina={pg} paginas={paginas} total={lista.length} onMudar={setPagina} rotulo="registros" />}
      </div>
    </div>
  );
}

function acao(x: { chave: string; contatadoEm: string | null; contatadoPor: string | null }, tel: string, contatar: (c: string) => void) {
  return x.contatadoEm
    ? <Selo tom="ok"><CheckCircle2 size={12} /> Contatado {x.contatadoEm.slice(8, 10)}/{x.contatadoEm.slice(5, 7)} {x.contatadoEm.slice(11, 16)}</Selo>
    : <a className="oc-btn peq ok" href={zap(tel)} target="_blank" rel="noreferrer" onClick={() => contatar(x.chave)}><MessageCircle size={14} /> Chamar</a>;
}
