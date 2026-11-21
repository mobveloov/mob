import { useEffect, useState } from "react";
import { Bell, ChevronDown, ChevronRight, RefreshCw, Search, X } from "lucide-react";
import { CANAIS_ENVIO, infoGatilho, ROTULOS_ORIGEM, TIPOS_GATILHO } from "../../crm/catalogo.ts";
import { Cartao, useCarregar } from "../componentes/ui";
import { automacao } from "./api-automacao";
import { classeApp, ROTULO_APP, StatusApp } from "./status-app";
import { classeEnvio, Contagem, hora, Paginador, ROTULO_ENVIO, useAtrasado } from "./automacao-comum";

type Periodo = "today" | "7d" | "30d" | "custom";
const DIA = 86_400_000;

/** Início do dia de hoje em Brasília (UTC-3 fixo), em ms. */
const inicioDoDia = () => { const b = new Date(Date.now() - 3 * 3_600_000); return Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()) + 3 * 3_600_000; };

function faixa(p: Periodo, de: string, ate: string): { de: number; ate: number } {
  const fim = Date.now() + 60_000;
  if (p === "today") return { de: inicioDoDia(), ate: fim };
  if (p === "7d") return { de: Date.now() - 7 * DIA, ate: fim };
  if (p === "30d") return { de: Date.now() - 30 * DIA, ate: fim };
  return { de: (de && Date.parse(de)) || Date.now() - 7 * DIA, ate: (ate && Date.parse(ate)) || fim };
}

/** CRM › Comunicação › Notificações: todos os envios (campanha, gatilho, jornada, régua e manual) num lugar só. */
export default function Notificacoes() {
  const [periodo, setPeriodo] = useState<Periodo>("7d");
  const [de, setDe] = useState("");
  const [ateF, setAteF] = useState("");
  const [busca, setBusca] = useState("");
  const [origem, setOrigem] = useState("");
  const [estado, setEstado] = useState("");
  const [canal, setCanal] = useState("");
  const [gatilho, setGatilho] = useState("");
  const [evento, setEvento] = useState("");
  const [pagina, setPagina] = useState(0);
  const [aberto, setAberto] = useState<string | null>(null);
  const q = useAtrasado(busca, 400);
  useEffect(() => { setPagina(0); }, [q, origem, estado, canal, gatilho, evento, periodo, de, ateF]);
  const { dados, erro, recarregar } = useCarregar(() => automacao.notificacoes({ ...faixa(periodo, de, ateF), busca: q, origem, estado, canal, gatilho, evento, pagina }), [q, origem, estado, canal, gatilho, evento, periodo, de, ateF, pagina]);
  const nomes = dados?.nomes;
  const gat = new Map((nomes?.gatilhos ?? []).map((g) => [g.id, g]));
  const camp = new Map((nomes?.campanhas ?? []).map((c) => [c.id, c.name]));
  const jor = new Map((nomes?.jornadas ?? []).map((j) => [j.id, j.name]));
  const bs = dados?.stats.by_status ?? {}, bo = dados?.stats.by_origin ?? {};
  const total = dados?.stats.total ?? 0;
  const temFiltro = !!(q || origem || estado || canal || gatilho || evento);
  const limpar = () => { setBusca(""); setOrigem(""); setEstado(""); setCanal(""); setGatilho(""); setEvento(""); };
  const eventos = TIPOS_GATILHO.filter((t) => (nomes?.gatilhos ?? []).some((g) => g.type === t.value));
  const fonte = (l: { origem: string; origem_id: string }) => {
    if (l.origem === "trigger") return gat.get(l.origem_id)?.name ?? "Gatilho removido";
    if (l.origem === "campaign") return camp.get(l.origem_id) ?? "Campanha removida";
    if (l.origem === "journey") return jor.get(l.origem_id) ?? "Jornada removida";
    return null;
  };
  const canalNome = (c: string) => CANAIS_ENVIO.find((x) => x.value === c)?.label ?? c;

  return (
    <div className="pilha">
      <div className="linha-filtro">
        <div className="periodo">
          {([["today", "Hoje"], ["7d", "7 dias"], ["30d", "30 dias"], ["custom", "Período"]] as Array<[Periodo, string]>).map(([k, l]) => (
            <button key={k} className={periodo === k ? "chip ativo" : "chip"} onClick={() => setPeriodo(k)}>{l}</button>
          ))}
          {periodo === "custom" && <>
            <small className="sub">de</small><input type="datetime-local" value={de} onChange={(e) => setDe(e.target.value)} />
            <small className="sub">até</small><input type="datetime-local" value={ateF} onChange={(e) => setAteF(e.target.value)} />
          </>}
        </div>
        <button className="botao" onClick={recarregar}><RefreshCw size={14} /> Atualizar</button>
      </div>
      <div className="kpis">
        <Contagem rotulo="Total no período" valor={total} ativo={!estado} onClick={() => setEstado("")} />
        <Contagem rotulo="Enviadas" valor={bs.sent ?? 0} tom="ok" ativo={estado === "sent"} onClick={() => setEstado(estado === "sent" ? "" : "sent")} />
        <Contagem rotulo="Falhas" valor={bs.failed ?? 0} tom="ruim" ativo={estado === "failed"} onClick={() => setEstado(estado === "failed" ? "" : "failed")} />
        <Contagem rotulo="Puladas (opt-out, limite, janela)" valor={bs.skipped ?? 0} tom="alerta" ativo={estado === "skipped"} onClick={() => setEstado(estado === "skipped" ? "" : "skipped")} />
        <Contagem rotulo="Taxa de entrega" valor={total ? `${Math.round(((bs.sent ?? 0) / total) * 100)}%` : "-"} />
      </div>
      <div className="periodo">
        {Object.entries(ROTULOS_ORIGEM).map(([k, l]) => (
          <button key={k} className={origem === k ? "chip ativo" : "chip"} onClick={() => setOrigem(origem === k ? "" : k)}>{l} · {(bo[k] ?? 0).toLocaleString("pt-BR")}</button>
        ))}
      </div>
      <Cartao>
        <span style={{ position: "relative", display: "block", marginBottom: 8 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: 13 }} />
          <input style={{ paddingLeft: 30, width: "100%" }} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por título, mensagem, nome, telefone ou erro..." />
        </span>
        <div className="periodo">
          <select value={origem} onChange={(e) => setOrigem(e.target.value)}><option value="">Todas as origens</option>{Object.entries(ROTULOS_ORIGEM).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <select value={evento} onChange={(e) => setEvento(e.target.value)}><option value="">Todos os eventos</option>{eventos.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
          <select value={gatilho} onChange={(e) => setGatilho(e.target.value)}><option value="">Todos os gatilhos</option>{(nomes?.gatilhos ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
          <select value={estado} onChange={(e) => setEstado(e.target.value)}><option value="">Todos os status</option>{["sent", "failed", "skipped"].map((s) => <option key={s} value={s}>{ROTULO_ENVIO[s]}</option>)}</select>
          <select value={canal} onChange={(e) => setCanal(e.target.value)}><option value="">Todos os canais</option>{CANAIS_ENVIO.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
          {temFiltro && <button className="botao" onClick={limpar}><X size={14} /> Limpar filtros</button>}
        </div>
      </Cartao>
      {erro && <div className="aviso erro">{erro}</div>}
      {dados && !dados.linhas.length && <Cartao><p className="vazio"><Bell size={16} /> Nenhuma notificação encontrada com esses filtros.</p></Cartao>}
      {dados?.linhas.map((l) => {
        const src = fonte(l);
        const abre = aberto === l.id;
        return (
          <Cartao key={l.id}>
            <button type="button" onClick={() => setAberto(abre ? null : l.id)} style={{ all: "unset", cursor: "pointer", display: "flex", gap: 10, width: "100%" }}>
              {abre ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span style={{ minWidth: 0, flex: 1 }}>
                <span>{l.canal === "app" && l.estado === "sent" && l.app ? <span className={`selo ${classeApp(l.app.estado)}`}>{ROTULO_APP[l.app.estado] ?? l.app.estado}</span> : <span className={`selo ${classeEnvio(l.estado)}`}>{ROTULO_ENVIO[l.estado] ?? l.estado}</span>} <span className="selo">{ROTULOS_ORIGEM[l.origem] ?? l.origem}</span> <span className="selo">{canalNome(l.canal)}</span> {src && <small className="sub">{src}</small>}</span>
                <span style={{ display: "block", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.titulo ? <strong>{l.titulo} </strong> : null}<small className="sub">{l.previa}</small></span>
                <small className="sub">{l.nome || "Sem nome"} · {l.telefone} · {hora(l.em)}</small>
              </span>
            </button>
            {abre && (
              <div style={{ marginTop: 10, borderTop: "1px solid var(--borda)", paddingTop: 10 }}>
                {l.titulo && <p><small className="sub">Título:</small> {l.titulo}</p>}
                {l.previa && <p style={{ whiteSpace: "pre-wrap" }}><small className="sub">Mensagem:</small> {l.previa}</p>}
                {l.erro && <p style={{ color: "var(--alerta)" }}><small className="sub">Motivo/erro:</small> {l.erro}</p>}
                <div className="grade" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 4 }}>
                  <p><small className="sub">{l.app?.papel === "motorista" ? "Motorista" : l.app?.papel === "passageiro" ? "Passageiro" : "Pessoa"}:</small> {l.nome || "-"} ({l.telefone})</p>
                  <p><small className="sub">Data:</small> {hora(l.em)}</p>
                  {l.origem === "trigger" && <p><small className="sub">Evento:</small> {infoGatilho(gat.get(l.origem_id)?.type ?? "")?.label ?? "-"}</p>}
                  {src && <p><small className="sub">{ROTULOS_ORIGEM[l.origem]}:</small> {src}</p>}
                  {l.canal === "app" && l.estado === "sent" && <div style={{ gridColumn: "1 / -1" }}><StatusApp app={l.app} /></div>}
                  {l.faixa != null && <p><small className="sub">Faixa:</small> {l.faixa} dia(s) sem corrida</p>}
                  {l.variante && <p><small className="sub">Variante A/B:</small> {l.variante}</p>}
                </div>
              </div>
            )}
          </Cartao>
        );
      })}
      {dados && <Paginador pagina={pagina} total={dados.total} onPagina={setPagina} />}
    </div>
  );
}
