import { useState } from "react";
import { Shield } from "lucide-react";
import { Cartao, useCarregar } from "../componentes/ui";
import { AUDITORIA_ACOES, AUDITORIA_ENTIDADES } from "../../crm2/catalogo";
import { crm2, dataHora } from "./api";

const CLASSE: Record<string, string> = { criou: "ok", editou: "info", ativou: "ok", desativou: "alerta", pausou: "alerta", arquivou: "", excluiu: "ruim" };
const mostrar = (v: unknown) => (JSON.stringify(v) ?? "undefined").slice(0, 120);

/** CRM › Configurações › Auditoria: quem criou, editou, ativou, desativou ou excluiu gatilhos, campanhas, jornadas, templates e segmentos. */
export default function Auditoria() {
  const [dias, setDias] = useState(7);
  const [entidade, setEntidade] = useState("all");
  const [acao, setAcao] = useState("all");
  const [aberto, setAberto] = useState<string | null>(null);
  const { dados, erro, carregando } = useCarregar(() => crm2.auditoria({ dias, entidade, acao }), [dias, entidade, acao]);
  const linhas = dados?.linhas ?? [];
  return (
    <div className="pilha">
      <p className="sub">Quem criou, editou, ativou, desativou ou excluiu gatilhos, campanhas, jornadas, templates e segmentos.</p>
      <div className="linha-filtro">
        <div className="acoes">
          <select value={dias} onChange={(e) => setDias(Number(e.target.value))} aria-label="Período">
            <option value={1}>Últimas 24h</option><option value={7}>Últimos 7 dias</option><option value={30}>Últimos 30 dias</option><option value={90}>Últimos 90 dias</option>
          </select>
          <select value={entidade} onChange={(e) => setEntidade(e.target.value)} aria-label="Tipo">
            <option value="all">Todos os tipos</option>
            {AUDITORIA_ENTIDADES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={acao} onChange={(e) => setAcao(e.target.value)} aria-label="Ação">
            <option value="all">Todas as ações</option>
            {AUDITORIA_ACOES.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>
      {erro && <div className="aviso erro">{erro}</div>}
      {!dados && carregando ? <p className="vazio">Carregando...</p> : !linhas.length ? <Cartao><p className="vazio"><Shield size={16} /> Nenhuma alteração no período.</p></Cartao> : linhas.map((r) => (
        <div key={r.id} className="crm2-auditoria">
          <button onClick={() => setAberto(aberto === r.id ? null : r.id)} aria-expanded={aberto === r.id}>
            <span className="topo-linha">
              <span className={`selo ${CLASSE[r.action] ?? ""}`}>{r.action}</span>
              <small className="sub" style={{ textTransform: "uppercase" }}>{r.entity_type}</small>
              <strong>{r.entity_name || "-"}</strong>
              {r.changed_fields.length > 0 && <small className="sub">{r.changed_fields.length} campo(s): {r.changed_fields.slice(0, 4).join(", ")}{r.changed_fields.length > 4 ? "…" : ""}</small>}
            </span>
            <span className="sub" style={{ textAlign: "right" }}>{r.actor_email || "Sistema (automação)"}<br />{dataHora(r.created_at)}</span>
          </button>
          {aberto === r.id && r.changed_fields.length > 0 && (
            <div style={{ borderTop: "1px solid var(--borda)", marginTop: 8, paddingTop: 6 }}>
              {r.changed_fields.map((f) => (
                <p key={f} className="crm2-diff"><strong>{f}</strong>: <del>{mostrar(r.old_data?.[f])}</del> → <ins>{mostrar(r.new_data?.[f])}</ins></p>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
