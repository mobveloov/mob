// Totens & Preços › Jogos de recompensa: Roleta de Cupom e Raspadinha. O passageiro recebe o link no WhatsApp da empresa e
// joga numa página pública; o prêmio vira um cupom (vale uma vez, só para ele). Aqui o admin liga os convites, escolhe os
// prêmios e as chances, copia o link aberto e manda o convite agora ou para um telefone.

import { useState } from "react";
import { Copy, Gift, Loader2, Plus, Save, Send, Trash2 } from "lucide-react";
import { Cartao, Titulo, useCarregar } from "../componentes/ui";
import Fidelidade from "./FidelidadeAdmin";
import { apiCentral, type JogoPremio, type PremioConfig } from "./api";

const TIPOS: Array<[PremioConfig["type"], string]> = [["percent", "Desconto em %"], ["fixed", "Desconto em R$"], ["none", "Não ganha nada"]];
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default function PremiosAdmin() {
  const { dados, erro, recarregar } = useCarregar(() => apiCentral.premios(), []);
  return (
    <>
      <Titulo titulo="Jogos de recompensa" sub="Roleta de Cupom e Raspadinha: o passageiro joga pelo link e ganha um cupom" />
      {erro && <div className="aviso erro">{erro}</div>}
      {!dados ? <div className="vazio"><Loader2 className="gira" /></div> : dados.jogos.map((j) => <Jogo key={j.kind} j={j} empresa={dados.empresa} aoSalvar={recarregar} />)}
      {dados && <Fidelidade empresa={dados.empresa} />}
    </>
  );
}

function Jogo({ j, empresa, aoSalvar }: { j: JogoPremio; empresa: string; aoSalvar: () => void }) {
  const [c, setC] = useState(j.config);
  const [msg, setMsg] = useState<{ texto: string; erro?: boolean } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [tel, setTel] = useState("");
  const link = `${location.origin}/premios/${empresa}/${j.kind}`;
  const soma = c.prizes.reduce((s, p) => s + (p.type === "none" ? 0 : Number(p.chance) || 0), 0);
  const mudar = <K extends keyof typeof c>(k: K, v: (typeof c)[K]) => setC((x) => ({ ...x, [k]: v }));
  const premio = (i: number, p: Partial<PremioConfig>) => setC((x) => ({ ...x, prizes: x.prizes.map((y, k) => (k === i ? { ...y, ...p } : y)) }));
  const rodar = async (qual: string, f: () => Promise<string>) => {
    setOcupado(qual); setMsg(null);
    try { setMsg({ texto: await f() }); aoSalvar(); } catch (e) { setMsg({ texto: e instanceof Error ? e.message : String(e), erro: true }); } finally { setOcupado(null); }
  };

  return (
    <Cartao titulo={`${j.rotulo}${j.kind === "roleta" ? " 🎡" : " 🎟️"}`}>
      <small>Hoje: {j.stats.today} convite(s), {j.stats.played_today} jogaram, {j.stats.coupons_today} cupom(ns), {j.stats.failed_today} falha(s) de envio. Total: {j.stats.played} de {j.stats.total} jogaram.</small>
      <div className="form">
        <label className="check"><input type="checkbox" checked={c.invites_enabled} onChange={(e) => mudar("invites_enabled", e.target.checked)} /> Disparar convites (liga o "Enviar agora" e o convite por telefone)</label>
        <label className="check"><input type="checkbox" checked={c.public_open} onChange={(e) => mudar("public_open", e.target.checked)} /> Link aberto (o passageiro digita o telefone e recebe o jogo no WhatsApp)</label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          <label>Título (aviso)<input value={c.title} maxLength={40} onChange={(e) => mudar("title", e.target.value)} /></label>
          <label>Mensagem (aviso)<input value={c.message} maxLength={255} onChange={(e) => mudar("message", e.target.value)} /></label>
          <label>Texto do botão<input value={c.button_text} maxLength={20} onChange={(e) => mudar("button_text", e.target.value)} /></label>
          <label>Chamada no cartão<input value={c.card_headline} maxLength={40} onChange={(e) => mudar("card_headline", e.target.value)} /></label>
          <label>Frase no cartão<input value={c.card_phrase} maxLength={80} onChange={(e) => mudar("card_phrase", e.target.value)} /></label>
          <label>Cor<input type="color" value={c.color} onChange={(e) => mudar("color", e.target.value)} /></label>
          <label>Cupom vale por (dias)<input type="number" min="1" max="60" value={c.coupon_valid_days} onChange={(e) => mudar("coupon_valid_days", Number(e.target.value))} /></label>
        </div>

        <fieldset className="cartao" style={{ margin: 0 }}>
          <legend className="sub">Prêmios e chances</legend>
          {c.prizes.map((p, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1.4fr 1fr 1fr auto", gap: 8, alignItems: "end", marginBottom: 6 }}>
              <label>Texto<input value={p.label} maxLength={30} onChange={(e) => premio(i, { label: e.target.value })} /></label>
              <label>Tipo<select value={p.type} onChange={(e) => premio(i, { type: e.target.value as PremioConfig["type"] })}>{TIPOS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></label>
              <label>Valor<input type="number" min="0" step="0.5" disabled={p.type === "none"} value={p.value} onChange={(e) => premio(i, { value: Number(e.target.value) })} /></label>
              <label>Chance (%)<input type="number" min="0" max="100" step="0.5" disabled={p.type === "none"} value={p.chance} onChange={(e) => premio(i, { chance: Number(e.target.value) })} /></label>
              <button type="button" className="icone" aria-label="Remover prêmio" onClick={() => setC((x) => ({ ...x, prizes: x.prizes.filter((_, k) => k !== i) }))}><Trash2 size={14} /></button>
            </div>
          ))}
          <button type="button" className="botao" disabled={c.prizes.length >= 12} onClick={() => setC((x) => ({ ...x, prizes: [...x.prizes, { label: "10% OFF", type: "percent", value: 10, chance: 5 }] }))}><Plus size={14} /> Adicionar prêmio</button>
          <small>De cada 100 jogadas, {Math.min(100, soma)} ganham cupom e {Math.max(0, 100 - soma)} não ganham nada. A soma das chances não passa de 100.</small>
        </fieldset>

        <fieldset className="cartao" style={{ margin: 0 }}>
          <legend className="sub">Avisos agendados</legend>
          <label className="check"><input type="checkbox" checked={c.schedule_enabled} onChange={(e) => mudar("schedule_enabled", e.target.checked)} /> Mandar o convite sozinho nos dias e horários abaixo</label>
          <div className="acoes">{DIAS.map((d, i) => <label key={d} className="check"><input type="checkbox" checked={c.days.includes(i)} onChange={(e) => mudar("days", e.target.checked ? [...c.days, i].sort() : c.days.filter((x) => x !== i))} /> {d}</label>)}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
            <label>Horário<input type="time" value={c.send_time} onChange={(e) => mudar("send_time", e.target.value)} /></label>
            <label>Vezes por dia (6 h entre elas)<input type="number" min="1" max="3" value={c.times_per_day} onChange={(e) => mudar("times_per_day", Number(e.target.value))} /></label>
            <label>Um convite a cada (dias)<input type="number" min="1" max="30" value={c.every_n_days} onChange={(e) => mudar("every_n_days", Number(e.target.value))} /></label>
          </div>
          <small>O agendador do CRM manda o convite no 1º horário e um lembrete a quem ainda não jogou nos outros, respeitando a pausa, a janela de horário, o teto diário e o descadastro do CRM. Salve o jogo uma vez por este painel para o agendador saber o endereço do link.</small>
        </fieldset>

        {msg && <div className={msg.erro ? "aviso erro" : "aviso ok"}>{msg.texto}</div>}
        <div className="acoes">
          <button className="botao primario" disabled={!!ocupado} onClick={() => void rodar("salvar", async () => { await apiCentral.salvarPremio(j.kind, c); return "Salvo!"; })}><Save size={14} /> Salvar</button>
          <button className="botao" disabled={!!ocupado || !j.saved || !j.config.invites_enabled}
            onClick={() => confirm("Enviar o convite agora para os passageiros que ainda não receberam hoje?") && void rodar("agora", async () => { const r = await apiCentral.enviarPremiosAgora(j.kind); return `${r.enviados} convite(s) enviado(s), ${r.falhas} falha(s).`; })}><Send size={14} /> Enviar agora</button>
          <button className="botao" onClick={() => navigator.clipboard?.writeText(link).then(() => setMsg({ texto: "Link copiado!" }))}><Copy size={14} /> Copiar link aberto</button>
        </div>
        <small>Link aberto: <code>{link}</code></small>
        <div className="acoes">
          <label>Convite para um telefone<input inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)} placeholder="(11) 99999-9999" /></label>
          <button className="botao" disabled={!!ocupado || tel.replace(/\D/g, "").length < 10} onClick={() => void rodar("tel", async () => { await apiCentral.convidarPremio(j.kind, tel); setTel(""); return "Convite enviado pelo WhatsApp."; })}><Gift size={14} /> Enviar convite</button>
        </div>
      </div>
    </Cartao>
  );
}
