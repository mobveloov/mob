// Régua de reativação: avisa por WhatsApp quem parou de pedir corrida (1, 7, 30, 90 e 365 dias).
// Liga / pausa / desliga, limite por dia com aquecimento e quantos já saíram hoje. O painel não recebe segredo nenhum.
import { useEffect, useState } from "react";
import { AlertCircle, Check, Pause, Play, Power, RefreshCw, ShieldCheck } from "lucide-react";
import { REGUA_MENSAGEM_PADRAO, renderReguaMessage } from "../../crm/regua-pura.ts";
import { Cartao, useCarregar } from "../componentes/ui";
import { erroTexto } from "./api";
import { automacao, type RespRegua } from "./api-automacao";
import { BarraPausa } from "./automacao-comum";
import { useGestor } from "./comum";

const DIAS: Array<[string, string]> = [["mon", "Seg"], ["tue", "Ter"], ["wed", "Qua"], ["thu", "Qui"], ["fri", "Sex"], ["sat", "Sáb"], ["sun", "Dom"]];

const paraForm = (s: RespRegua) => ({
  numero: s.config.numero === "crm" ? "crm" : "bot", repeatAfterDays: s.config.repeat_after_days ?? 15, message: s.config.message ?? REGUA_MENSAGEM_PADRAO, tiers: s.config.tiers.join(", "),
  maxPerDay: s.config.max_per_day, warmupStart: s.config.warmup_start, warmupStep: s.config.warmup_step, windowStart: s.config.window_start, windowEnd: s.config.window_end,
  days: s.config.days, errorLimit: s.config.error_limit,
});

/** CRM › Automação › Régua de reativação. */
export default function Regua() {
  const { dados: st, erro, recarregar } = useCarregar(() => automacao.regua(), [], 30_000);
  const gestor = useGestor();
  const [form, setForm] = useState<ReturnType<typeof paraForm> | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  // O formulário nasce da primeira leitura; as leituras seguintes (a cada 30 s) só atualizam os números, sem apagar o que a pessoa digita.
  useEffect(() => { if (st && !form) setForm(paraForm(st)); }, [st, form]);

  const salvar = async (status?: "on" | "paused" | "off") => {
    if (!form) return;
    setOcupado(true); setMsg(null);
    try {
      await automacao.salvarRegua({
        numero: form.numero, repeatAfterDays: form.repeatAfterDays, ...(status ? { status } : {}), message: form.message === REGUA_MENSAGEM_PADRAO ? "" : form.message,
        tiers: form.tiers.split(/[\s,;]+/).filter(Boolean).map(Number), maxPerDay: form.maxPerDay, warmupStart: form.warmupStart, warmupStep: form.warmupStep,
        windowStart: form.windowStart, windowEnd: form.windowEnd, days: form.days, errorLimit: form.errorLimit,
      });
      setMsg({ ok: true, texto: status === "on" ? "Régua ligada." : status === "paused" ? "Régua pausada." : status === "off" ? "Régua desligada." : "Configuração salva." });
      recarregar();
    } catch (e) { setMsg({ ok: false, texto: erroTexto(e) }); }
    setOcupado(false);
  };

  if (erro && !st) return <div className="aviso erro">{erro}</div>;
  if (!st || !form) return <p className="vazio">Carregando...</p>;
  const c = st.config;
  const selo = c.status === "on" ? <span className="selo ok">Ligada</span> : c.status === "paused" ? <span className="selo alerta">Pausada</span> : <span className="selo">Desligada</span>;
  const previa = renderReguaMessage(form.message, "Maria", "sua empresa");
  const mudar = (p: Partial<typeof form>) => setForm({ ...form, ...p });
  const num = (k: keyof typeof form, min: number, max: number) => <input type="number" min={min} max={max} value={form[k] as number} disabled={!gestor} onChange={(e) => mudar({ [k]: Number(e.target.value) })} />;

  return (
    <div className="pilha">
      <BarraPausa />
      <Cartao>
        <p style={{ margin: "0 0 8px" }}>
          <ShieldCheck size={18} /> <strong style={{ fontSize: 16 }}>Régua de reativação</strong> {selo}
          <button className="icone" style={{ float: "right" }} aria-label="Atualizar" onClick={recarregar}><RefreshCw size={14} /></button>
        </p>
        <p className="sub">Avisa por WhatsApp quem parou de pedir corrida, por faixa de dias. A mesma faixa pode se repetir depois do intervalo que você escolher (não é todo dia). Sai devagar e no horário comercial, pelo número escolhido abaixo.</p>
        {c.status === "paused" && c.paused_reason && <div className="aviso"><AlertCircle size={14} /> {c.paused_reason}</div>}
        {!st.numero.connected && <div className="aviso erro">{st.numero.motivo ?? "WhatsApp de envio desconectado."}</div>}
        {st.numero.botPausado && <div className="aviso">A automação do número do bot está pausada: a régua espera e não envia.</div>}
        {gestor && (
          <div className="acoes">
            {c.status !== "on" && <button className="botao primario" disabled={ocupado} onClick={() => salvar("on")}><Play size={14} /> Ligar</button>}
            {c.status === "on" && <button className="botao" disabled={ocupado} onClick={() => salvar("paused")}><Pause size={14} /> Pausar</button>}
            {c.status !== "off" && <button className="botao" disabled={ocupado} onClick={() => salvar("off")}><Power size={14} /> Desligar</button>}
          </div>
        )}
        {!gestor && <div className="aviso">Só o administrador liga e configura a régua.</div>}
        {msg && <div className={msg.ok ? "aviso ok" : "aviso erro"} style={{ marginTop: 10 }}>{msg.ok ? <Check size={14} /> : <AlertCircle size={14} />} {msg.texto}</div>}
      </Cartao>

      <Cartao titulo="Hoje, por número">
        {st.numeros.length === 0 && <small className="sub">Nenhum número de WhatsApp encontrado. Conecte um em Bot de WhatsApp.</small>}
        {st.numeros.map((n) => {
          const pct = n.limite > 0 ? Math.min(100, Math.round((n.enviadosHoje / n.limite) * 100)) : 0;
          return (
            <div key={(n.id ?? "crm") + (n.instance ?? "")} className="cartao" style={{ marginBottom: 10, borderColor: n.escolhido ? "var(--primaria)" : undefined }}>
              <p style={{ margin: "0 0 8px" }}>
                <strong>{n.instance ?? "—"}</strong> {n.phone && <small className="sub">{n.phone}</small>}{" "}
                <span className="selo">{n.tipo === "crm" ? "WhatsApp do CRM" : "Bot"}</span>{" "}
                {n.connected ? <span className="selo ok">Conectado</span> : <span className="selo ruim">Desconectado</span>}{" "}
                {n.pausado && <span className="selo alerta">Automação pausada</span>}{" "}
                {n.escolhido && <span className="selo info">Número de envio</span>}
              </p>
              <div className="kpis" style={{ marginBottom: 8 }}>
                <div className="kpi"><span>Pela régua hoje</span><strong>{n.reguaHoje}</strong></div>
                <div className="kpi"><span>No número todo (CRM)</span><strong>{n.enviadosHoje}</strong></div>
                <div className="kpi"><span>Limite de hoje</span><strong>{n.limite}</strong></div>
                <div className="kpi"><span>Aquecimento</span><strong>dia {n.aquecimentoDia}</strong></div>
                <div className={`kpi ${n.erros ? "ruim" : ""}`}><span>Erros de envio</span><strong>{n.erros}</strong></div>
              </div>
              <div style={{ height: 6, borderRadius: 4, background: "var(--borda)", overflow: "hidden" }}><div style={{ height: "100%", width: `${pct}%`, background: "var(--primaria)" }} /></div>
            </div>
          );
        })}
        <small className="sub">O limite de hoje já considera o aquecimento: começa com {c.warmup_start} por dia e sobe {c.warmup_step} por dia até {c.max_per_day}. Campanhas e gatilhos do CRM contam no mesmo limite. O CRM não guarda em qual número cada mensagem saiu: no número de envio, "No número todo" é tudo do CRM no dia; nos outros, só o da régua. Total de hoje: régua {st.hoje.regua}, erros {st.hoje.erros}.</small>
      </Cartao>

      <Cartao titulo="Configuração">
        <div className="form">
          <label>Mensagem (use {"{nome}"} e {"{empresa}"})
            <textarea rows={7} value={form.message} disabled={!gestor} onChange={(e) => mudar({ message: e.target.value })} />
          </label>
          <p style={{ whiteSpace: "pre-wrap", background: "var(--fundo)", borderRadius: 10, padding: 12, margin: 0 }}><small>{previa}</small></p>
          {!/n[aã]o quero mais/i.test(form.message) && <small style={{ color: "var(--alerta)" }}>Dica: deixe o aviso de como parar de receber ("Responda NÃO QUERO MAIS").</small>}
          <div className="grade" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
            <label>Faixas (dias sem pedir corrida)<input value={form.tiers} disabled={!gestor} onChange={(e) => mudar({ tiers: e.target.value })} /></label>
            <label>Número de envio
              <select value={form.numero} disabled={!gestor} onChange={(e) => mudar({ numero: e.target.value })}>
                <option value="bot">O WhatsApp do bot de atendimento (o passageiro responde ali e já pede a corrida)</option>
                <option value="crm">WhatsApp do CRM (número separado)</option>
              </select>
              <small className="sub">Número desconectado não envia: a régua para e avisa.</small>
            </label>
            <label>Repetir a mesma faixa depois de (dias, 0 = nunca){num("repeatAfterDays", 0, 365)}</label>
            <label>Limite por dia (por número){num("maxPerDay", 0, 500)}</label>
            <label>Aquecimento: começa com{num("warmupStart", 0, 500)}</label>
            <label>Aquecimento: sobe por dia{num("warmupStep", 0, 500)}</label>
            <label>Horário: das<input type="time" value={form.windowStart} disabled={!gestor} onChange={(e) => mudar({ windowStart: e.target.value })} /></label>
            <label>Horário: até<input type="time" value={form.windowEnd} disabled={!gestor} onChange={(e) => mudar({ windowEnd: e.target.value })} /></label>
            <label>Parar sozinha após quantos erros seguidos{num("errorLimit", 1, 20)}</label>
          </div>
          <div className="periodo">
            {DIAS.map(([k, l]) => (
              <button key={k} type="button" disabled={!gestor} className={form.days.includes(k) ? "chip ativo" : "chip"} onClick={() => mudar({ days: form.days.includes(k) ? form.days.filter((d) => d !== k) : [...form.days, k] })}>{l}</button>
            ))}
          </div>
          {gestor && <div className="acoes"><button className="botao primario" disabled={ocupado} onClick={() => salvar()}>Salvar configuração</button></div>}
        </div>
      </Cartao>
    </div>
  );
}
