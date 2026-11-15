import { useEffect, useState } from "react";
import { History, PauseCircle, RefreshCw } from "lucide-react";
import { infoGatilho } from "../../crm/catalogo.ts";
import { Cartao, useCarregar } from "../componentes/ui";
import { automacao } from "./api-automacao";
import { ate, classeEnvio, Contagem, hora, Paginador, ROTULO_ENVIO } from "./automacao-comum";

const FASE: Record<string, string> = { pre_janela: "Pré-janela", meio_janela: "Meio-janela" };
const ESTADO: Record<string, string> = { sent: "Enviado", failed: "Falhou", pending: "Agendado", processing: "Enviando", skipped: "Pulado", canceled: "Cancelado" };
const hh = (h: number) => `${String(h).padStart(2, "0")}h`;

/** CRM › Comunicação › Histórico de Disparos: comportamentais, automações por gatilho e pausas e retomadas. */
export default function Historico() {
  const [fonte, setFonte] = useState<"behavior" | "automation" | "pausas">("behavior");
  return (
    <div className="pilha">
      <div className="periodo">
        {([["behavior", "Comportamentais"], ["automation", "Automações por gatilho"], ["pausas", "Pausas e retomadas"]] as const).map(([k, l]) => (
          <button key={k} className={fonte === k ? "chip ativo" : "chip"} onClick={() => setFonte(k)}>{l}</button>
        ))}
      </div>
      {fonte === "behavior" ? <Comportamentais /> : fonte === "pausas" ? <Pausas /> : <PorGatilho />}
    </div>
  );
}

function Comportamentais() {
  const [dias, setDias] = useState(7);
  const [fase, setFase] = useState("");
  const [estado, setEstado] = useState("");
  const [template, setTemplate] = useState("");
  const [pagina, setPagina] = useState(0);
  useEffect(() => { setPagina(0); }, [dias, fase, estado, template]);
  const { dados, erro, recarregar } = useCarregar(() => automacao.historicoComportamental({ dias, fase, estado, template, pagina }), [dias, fase, estado, template, pagina]);
  const nomes = new Map((dados?.nomes ?? []).map((n) => [n.id, n.name]));
  const bs = dados?.stats.by_status ?? {}, bp = dados?.stats.by_phase ?? {};
  return (
    <>
      <div className="linha-filtro">
        <div className="periodo">
          {[1, 7, 30].map((d) => <button key={d} className={dias === d ? "chip ativo" : "chip"} onClick={() => setDias(d)}>{d === 1 ? "Hoje" : `${d} dias`}</button>)}
          <select value={template} onChange={(e) => setTemplate(e.target.value)}><option value="">Todos os templates</option>{[...nomes.entries()].map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
          <select value={fase} onChange={(e) => setFase(e.target.value)}><option value="">Todas as fases</option>{Object.entries(FASE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <select value={estado} onChange={(e) => setEstado(e.target.value)}><option value="">Todos os status</option>{Object.entries(ESTADO).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </div>
        <button className="icone" aria-label="Atualizar" onClick={recarregar}><RefreshCw size={14} /></button>
      </div>
      {erro && <div className="aviso erro">{erro}</div>}
      <div className="kpis">
        <Contagem rotulo="Disparos" valor={dados?.stats.total ?? 0} />
        <Contagem rotulo="Pré-janela" valor={bp.pre_janela ?? 0} />
        <Contagem rotulo="Meio-janela" valor={bp.meio_janela ?? 0} />
        <Contagem rotulo="Enviados" valor={bs.sent ?? 0} tom="ok" />
        <Contagem rotulo="Pulados (já correu)" valor={bs.skipped ?? 0} tom="alerta" />
      </div>
      {dados && !dados.linhas.length && <Cartao><p className="vazio"><History size={16} /> Nenhum disparo comportamental nesse período.</p></Cartao>}
      {dados?.linhas.map((d) => (
        <Cartao key={d.id}>
          <p style={{ margin: 0 }}>
            <span className={`selo ${classeEnvio(d.estado)}`}>{ESTADO[d.estado] ?? d.estado}</span> <span className="selo">{FASE[d.fase] ?? d.fase}</span>{" "}
            <strong>{nomes.get(d.template_id) ?? "Template removido"}</strong>{" "}
            <small className="sub">{d.nome || "Sem nome"} · {d.telefone}{d.hora_pref != null ? ` · hora preferida ${hh(d.hora_pref)}` : ""} · {d.estado === "pending" ? `sai ${hora(d.agendado_para)}` : hora(d.enviado_em ?? d.criado_em)}</small>
          </p>
          {d.erro && <small style={{ color: "var(--alerta)" }}>{d.erro}</small>}
        </Cartao>
      ))}
      {dados && <Paginador pagina={pagina} total={dados.total} onPagina={setPagina} />}
    </>
  );
}

function PorGatilho() {
  const [pagina, setPagina] = useState(0);
  const { dados, erro } = useCarregar(() => automacao.fila({ visao: "all", pagina }), [pagina]);
  const gat = new Map((dados?.gatilhos ?? []).map((g) => [g.id, g]));
  return (
    <>
      <small className="sub">Gatilhos com atraso (por exemplo, Simulou e não pediu): quando entraram na fila e o que aconteceu com cada um.</small>
      {erro && <div className="aviso erro">{erro}</div>}
      {dados && !dados.linhas.length && <Cartao><p className="vazio"><History size={16} /> Nenhuma automação por gatilho ainda.</p></Cartao>}
      {dados?.linhas.map((l) => (
        <Cartao key={l.id}>
          <p style={{ margin: 0 }}>
            <span className={`selo ${classeEnvio(l.estado)}`}>{ROTULO_ENVIO[l.estado] ?? l.estado}</span> <strong>{gat.get(l.gatilho_id)?.name ?? "Gatilho removido"}</strong>{" "}
            {gat.get(l.gatilho_id) && <small className="sub">{infoGatilho(gat.get(l.gatilho_id)!.type)?.label}</small>}<br />
            <small className="sub">{l.nome || "Sem nome"} · {l.telefone} · entrou {hora(l.criado_em)} · {l.estado === "pending" ? `sai ${hora(l.sai_em)} (${ate(l.sai_em)})` : `programado para ${hora(l.sai_em)}`}</small>
          </p>
          {l.erro && <small style={{ color: "var(--alerta)" }}>{l.erro}</small>}
        </Cartao>
      ))}
      {dados && <Paginador pagina={pagina} total={dados.total} onPagina={setPagina} />}
    </>
  );
}

function Pausas() {
  const { dados, erro } = useCarregar(() => automacao.pausas(), []);
  return (
    <>
      {erro && <div className="aviso erro">{erro}</div>}
      {dados && !dados.pausas.length && <Cartao><p className="vazio"><PauseCircle size={16} /> Nenhuma pausa ou retomada ainda.</p></Cartao>}
      {!!dados?.pausas.length && (
        <Cartao>
          <div className="tabela-rola"><table>
            <thead><tr><th>Quando</th><th>Ação</th><th>Quem</th></tr></thead>
            <tbody>{dados.pausas.map((p) => (
              <tr key={p.em}><td>{new Date(p.em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td><td><span className={`selo ${p.acao === "pausou" ? "alerta" : "ok"}`}>{p.acao === "pausou" ? "Pausou todos os envios" : "Continuou os envios"}</span></td><td>{p.por || "-"}</td></tr>
            ))}</tbody>
          </table></div>
        </Cartao>
      )}
    </>
  );
}
