import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Clock, Save, Settings, Shield, Users, XCircle } from "lucide-react";
import { Cartao, useCarregar } from "../componentes/ui";
import { useAdmin, useRetorno } from "../crm/comum";
import { crm2 } from "./api";

/** CRM › Configurações › Governança: consentimento (LGPD), métricas de entrega e regras de envio. */
export default function Governanca() {
  const { dados, erro } = useCarregar(() => crm2.governanca(), []);
  const [ini, setIni] = useState("08:00");
  const [fim, setFim] = useState("21:00");
  const [optin, setOptin] = useState(false);
  const [horas, setHoras] = useState("24");
  const [salvo, setSalvo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const { tentar, caixa } = useRetorno();
  const admin = useAdmin();
  useEffect(() => { if (dados) { setIni(dados.settings.janelaInicio); setFim(dados.settings.janelaFim); setOptin(dados.settings.exigirOptIn); setHoras(String(dados.settings.atribuicaoHoras)); } }, [dados]);

  const salvar = async () => {
    if (!/^([01]\d|2[0-3]):[0-5]\d/.test(ini) || !/^([01]\d|2[0-3]):[0-5]\d/.test(fim)) return alert("Informe o horário de início e de fim da janela de envio.");
    setSalvando(true);
    const r = await tentar(() => crm2.salvarGovernanca({ crm_send_window_start: ini, crm_send_window_end: fim, crm_require_opt_in: optin, crm_attribution_hours: Number(horas) || 24 }));
    setSalvando(false);
    if (r) { setSalvo(true); setTimeout(() => setSalvo(false), 2000); }
  };

  if (erro) return <div className="aviso erro">{erro}</div>;
  if (!dados) return <p className="vazio">Carregando...</p>;
  const Linha = ({ rotulo, valor, cor }: { rotulo: string; valor: string | number; cor?: string }) => <div className="crm2-resumo"><span>{rotulo}</span><strong style={{ color: cor }}>{valor}</strong></div>;
  return (
    <div className="pilha">
      <p className="sub">Governança de dados, consentimento LGPD e métricas de entrega</p>
      <div className="grade">
        <div className="kpi"><span><Users size={12} /> Total de Contatos</span><strong>{dados.totalContacts}</strong></div>
        <div className="kpi ok"><span><CheckCircle2 size={12} /> Opt-in Ativos</span><strong>{dados.optIn}</strong></div>
        <div className="kpi ruim"><span><XCircle size={12} /> Opt-out</span><strong>{dados.optOut}</strong></div>
        <div className="kpi alerta"><span><AlertCircle size={12} /> Pendentes</span><strong>{dados.pending}</strong></div>
      </div>
      <div className="grade" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        <Cartao titulo="Métricas de Entrega (últimos 30 dias)">
          <Linha rotulo="Mensagens Enviadas" valor={dados.sentCount} cor="var(--ok)" />
          <Linha rotulo="Falhas de Envio" valor={dados.failedCount} cor="var(--ruim)" />
          <Linha rotulo="Puladas (opt-out / janela)" valor={dados.skippedCount} cor="var(--alerta)" />
          <Linha rotulo="Taxa de Entrega" valor={`${dados.deliveryRate}%`} />
        </Cartao>
        <Cartao titulo="Consentimento LGPD">
          <Linha rotulo="Taxa de Consentimento" valor={`${dados.consentRate}%`} />
          <div className="crm2-consentimento"><span style={{ width: `${dados.consentRate}%` }} /></div>
          <div className="grade" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
            <div className="crm2-resumo" style={{ flexDirection: "column" }}><strong style={{ color: "var(--ok)" }}>{dados.optIn}</strong><small>Opt-in</small></div>
            <div className="crm2-resumo" style={{ flexDirection: "column" }}><strong style={{ color: "var(--alerta)" }}>{dados.pending}</strong><small>Pendentes</small></div>
            <div className="crm2-resumo" style={{ flexDirection: "column" }}><strong style={{ color: "var(--ruim)" }}>{dados.optOut}</strong><small>Opt-out</small></div>
          </div>
          <p className="sub">Passageiros com opt-out nunca recebem mensagens do CRM. O consentimento é verificado no momento de cada disparo.</p>
        </Cartao>
      </div>
      <Cartao titulo="Configurações de Envio">
        {caixa}
        <div className="grade" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <label><Clock size={13} /> Início da Janela de Envio<input type="time" value={ini} onChange={(e) => setIni(e.target.value)} disabled={!admin} /></label>
          <label><Clock size={13} /> Fim da Janela de Envio<input type="time" value={fim} onChange={(e) => setFim(e.target.value)} disabled={!admin} /></label>
          <label>Janela de atribuição (horas)<input type="number" min={1} max={168} value={horas} onChange={(e) => setHoras(e.target.value)} disabled={!admin} /></label>
        </div>
        <p className="sub">Fora da janela as mensagens esperam na fila. A janela de atribuição diz até quantas horas depois da mensagem uma corrida conta como conversão.</p>
        <div className="linha-filtro">
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Shield size={18} />
            <span><strong>Exigir Opt-in explícito</strong><br /><small className="sub">Quando ativo, apenas passageiros com opt-in confirmado recebem mensagens</small></span>
          </div>
          <input type="checkbox" role="switch" aria-label="Exigir opt-in explícito" checked={optin} onChange={(e) => setOptin(e.target.checked)} disabled={!admin} />
        </div>
        <div className="acoes">
          <button className="botao primario" onClick={salvar} disabled={salvando || !admin}><Settings size={14} /><Save size={14} /> Salvar Configurações</button>
          {salvo && <span className="selo ok">Salvo!</span>}
          {!admin && <small className="sub">Só o admin da empresa muda estas regras.</small>}
        </div>
      </Cartao>
    </div>
  );
}
