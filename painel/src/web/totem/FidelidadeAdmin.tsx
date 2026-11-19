// Totens & Preços › Jogos de recompensa (continuação): Cartão Fidelidade e Pontos de Troca, como na tela Prêmios do sistema de
// referência. As corridas finalizadas contam sozinhas (trabalhador do CRM, a cada 15 segundos). O cupom vai para o cadastro Cupons.

import { useState } from "react";
import { Award, CheckCircle2, Coins, Copy, Loader2, Plus, Save, Trash2, Users } from "lucide-react";
import { Cartao, Titulo, useCarregar } from "../componentes/ui";
import { apiCentral, type CartaoFidelidade, type ConfigPontos, type DadosFidelidade, type PremioPontos } from "./api";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const brl = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;
const dia = (ms: number) => new Date(ms).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const novoCartao = (): CartaoFidelidade => ({ name: "Cartão 10 corridas", rides_needed: 10, reward_type: "percent", reward_value: 5, once: true, active: false, title: "Você ganhou um presente! 🎁", message: "Seu cupom de desconto: {cupom}" });

type Msg = { texto: string; erro?: boolean } | null;

export default function Fidelidade({ empresa }: { empresa: string }) {
  const { dados, erro, recarregar } = useCarregar(() => apiCentral.fidelidade(), []);
  return (
    <>
      <Titulo titulo="Cartão Fidelidade e Pontos de Troca" sub="Prêmio por corridas feitas: o passageiro ganha cupom e o aviso chega pelo WhatsApp" />
      {erro && <div className="aviso erro">{erro}</div>}
      {!dados ? <div className="vazio"><Loader2 className="gira" /></div> : (
        <>
          <Cartoes d={dados} recarregar={recarregar} />
          <Pontos d={dados} empresa={empresa} recarregar={recarregar} />
        </>
      )}
    </>
  );
}

function useAcao(recarregar: () => void) {
  const [msg, setMsg] = useState<Msg>(null);
  const [ocupado, setOcupado] = useState(false);
  const rodar = async (f: () => Promise<string>) => {
    setOcupado(true); setMsg(null);
    try { setMsg({ texto: await f() }); recarregar(); } catch (e) { setMsg({ texto: e instanceof Error ? e.message : String(e), erro: true }); } finally { setOcupado(false); }
  };
  return { msg, ocupado, rodar, setMsg };
}

function Cartoes({ d, recarregar }: { d: DadosFidelidade; recarregar: () => void }) {
  const [novos, setNovos] = useState<CartaoFidelidade[]>([]);
  const { msg, setMsg } = useAcao(recarregar);
  return (
    <Cartao titulo="Cartão Fidelidade">
      <p className="sub">Prêmio por marcos de corridas. As corridas contam <b>a partir de quando o cartão é ligado</b> (corridas do app, do bot e do totem). Ao chegar no marco, o passageiro recebe um cupom e um aviso no WhatsApp.</p>
      <div className="acoes">
        <small>Modelos prontos:</small>
        {d.modelos.map((t) => <button key={t.name} className="botao" onClick={() => setNovos((n) => [...n, { ...t }])}>{t.name}</button>)}
        <button className="botao" onClick={() => setNovos((n) => [...n, novoCartao()])}><Plus size={14} /> Novo cartão</button>
      </div>
      {msg && <div className={msg.erro ? "aviso erro" : "aviso ok"}>{msg.texto}</div>}
      {!d.cartoes.length && !novos.length && <p className="vazio">Nenhum cartão ainda. Use um modelo pronto ou crie um novo.</p>}
      {d.cartoes.map((c) => <Linha key={c.id} id={c.id} inicial={c.config} info={c} aoMudar={recarregar} aoAviso={setMsg} />)}
      {novos.map((c, i) => <Linha key={`n${i}`} id={null} inicial={c} info={null} aoMudar={() => { setNovos((n) => n.filter((_, k) => k !== i)); recarregar(); }} aoAviso={setMsg} aoDescartar={() => setNovos((n) => n.filter((_, k) => k !== i))} />)}
    </Cartao>
  );
}

function Linha({ id, inicial, info, aoMudar, aoAviso, aoDescartar }: { id: string | null; inicial: CartaoFidelidade; info: { members: number; delivered: number; activated_at: number | null } | null; aoMudar: () => void; aoAviso: (m: Msg) => void; aoDescartar?: () => void }) {
  const [c, setC] = useState(inicial);
  const [ocupado, setOcupado] = useState(false);
  const mudar = <K extends keyof CartaoFidelidade>(k: K, v: CartaoFidelidade[K]) => setC((x) => ({ ...x, [k]: v }));
  const rodar = async (f: () => Promise<string>) => {
    setOcupado(true); aoAviso(null);
    try { aoAviso({ texto: await f() }); aoMudar(); } catch (e) { aoAviso({ texto: e instanceof Error ? e.message : String(e), erro: true }); } finally { setOcupado(false); }
  };
  return (
    <fieldset className="cartao" style={{ margin: 0 }}>
      <div className="form">
        <div className="acoes">
          <input value={c.name} maxLength={60} onChange={(e) => mudar("name", e.target.value)} aria-label="Nome do cartão" style={{ fontWeight: 600, maxWidth: 360 }} />
          <label className="check"><input type="checkbox" checked={c.active} onChange={(e) => mudar("active", e.target.checked)} /> Ligado</label>
        </div>
        {info && <small>{info.members} passageiro(s) com corridas contadas · {info.delivered} prêmio(s) entregue(s){info.activated_at ? ` · contando desde ${dia(info.activated_at)}` : ""}</small>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
          <label>Corridas<input type="number" min="1" value={c.rides_needed} onChange={(e) => mudar("rides_needed", Number(e.target.value))} /></label>
          <label>Desconto<select value={c.reward_type} onChange={(e) => mudar("reward_type", e.target.value as "percent" | "fixed")}><option value="percent">%</option><option value="fixed">R$</option></select></label>
          <label>Valor<input type="number" value={c.reward_value} onChange={(e) => mudar("reward_value", Number(e.target.value))} /></label>
          <label>Frequência<select value={c.once ? "once" : "repeat"} onChange={(e) => mudar("once", e.target.value === "once")}><option value="once">Uma vez na vida</option><option value="repeat">A cada {c.rides_needed} corridas</option></select></label>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          <label>Título do aviso<input maxLength={40} value={c.title} onChange={(e) => mudar("title", e.target.value)} /></label>
          <label>Mensagem ({"{cupom}"}, {"{desconto}"}, {"{nome}"})<input maxLength={255} value={c.message} onChange={(e) => mudar("message", e.target.value)} /></label>
        </div>
        <div className="acoes">
          <button className="botao primario" disabled={ocupado} onClick={() => void rodar(async () => { await apiCentral.salvarCartao(id, c); return "Cartão salvo!"; })}><Save size={14} /> Salvar</button>
          <button className="botao" disabled={ocupado} onClick={() => {
            if (!id) return aoDescartar?.();
            if (confirm("Excluir este cartão? O progresso dos passageiros nele é apagado.")) void rodar(async () => { await apiCentral.excluirCartao(id); return "Cartão excluído."; });
          }}><Trash2 size={14} /> Excluir</button>
        </div>
      </div>
    </fieldset>
  );
}

function Pontos({ d, empresa, recarregar }: { d: DadosFidelidade; empresa: string; recarregar: () => void }) {
  const [c, setC] = useState<ConfigPontos>(d.pontos.config);
  const { msg, ocupado, rodar, setMsg } = useAcao(recarregar);
  const mudar = (p: Partial<ConfigPontos>) => setC((x) => ({ ...x, ...p }));
  const premio = (i: number, p: Partial<PremioPontos>) => mudar({ prizes: c.prizes.map((x, k) => (k === i ? { ...x, ...p } : x)) });
  const link = `${location.origin}/pontos/${empresa}`;
  const corridas = Math.ceil(c.min_points / Math.max(1, c.points_per_ride));
  const valorDe = (p: number) => Math.round(p * c.point_value * 100) / 100;
  return (
    <Cartao titulo="Pontos de Troca">
      <div className="grade">
        <div className="kpi"><small><Users size={12} /> Passageiros com pontos</small><strong>{d.pontos.stats.passengers}</strong></div>
        <div className="kpi"><small><Coins size={12} /> Pontos em circulação</small><strong>{d.pontos.stats.circulating} ({brl(d.pontos.money_value)})</strong></div>
        <div className="kpi"><small><Award size={12} /> Pontos já trocados</small><strong>{d.pontos.stats.redeemed}</strong></div>
      </div>
      <div className="form">
        <label className="check"><input type="checkbox" checked={c.enabled} onChange={(e) => mudar({ enabled: e.target.checked })} /> <span><b>Pontos ligados</b>: cada corrida finalizada (app, bot ou totem) vira ponto sozinha. Desligado, ninguém ganha nem troca.</span></label>
        <small>Página do passageiro: <code>{link}</code> <button type="button" className="icone" aria-label="Copiar link" onClick={() => navigator.clipboard?.writeText(link).then(() => setMsg({ texto: "Link copiado!" }))}><Copy size={14} /></button></small>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
          <label>Pontos por corrida<input type="number" min="1" value={c.points_per_ride} onChange={(e) => mudar({ points_per_ride: Number(e.target.value) })} /></label>
          <label>Quanto vale 1 ponto (R$)<input type="number" step="0.01" value={c.point_value} onChange={(e) => mudar({ point_value: Number(e.target.value) })} /></label>
          <label>Mínimo para trocar<input type="number" min="1" value={c.min_points} onChange={(e) => mudar({ min_points: Number(e.target.value) })} /></label>
          <label>Pontos vencem em (dias)<input type="number" min="7" value={c.points_expire_days} onChange={(e) => mudar({ points_expire_days: Number(e.target.value) })} /></label>
          <label>Cupom vale (dias)<input type="number" min="1" value={c.coupon_valid_days} onChange={(e) => mudar({ coupon_valid_days: Number(e.target.value) })} /></label>
        </div>
        <p className="sub">O passageiro faz <b>{corridas} corridas</b> e troca por <b>{brl(valorDe(c.min_points))}</b> de desconto (cada corrida custa {brl(valorDe(c.points_per_ride))} para a empresa).</p>

        <fieldset className="cartao" style={{ margin: 0 }}>
          <legend className="sub">Prêmios que o passageiro pode escolher (opcional)</legend>
          <small>Além do desconto em dinheiro: brindes para retirar (lanche, camiseta...) ou cupons de valor fixo/porcentagem.</small>
          {c.prizes.map((p, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1.5fr 0.8fr 1fr 0.8fr auto", gap: 8, alignItems: "end", marginBottom: 6 }}>
              <label>Nome<input value={p.name} maxLength={40} onChange={(e) => premio(i, { name: e.target.value })} /></label>
              <label>Pontos<input type="number" value={p.points} onChange={(e) => premio(i, { points: Number(e.target.value) })} /></label>
              <label>Tipo<select value={p.type} onChange={(e) => premio(i, { type: e.target.value as PremioPontos["type"] })}><option value="pickup">Para retirar</option><option value="percent">Cupom %</option><option value="fixed">Cupom R$</option></select></label>
              <label>Valor<input type="number" disabled={p.type === "pickup"} value={p.type === "pickup" ? "" : p.value} onChange={(e) => premio(i, { value: Number(e.target.value) })} /></label>
              <button type="button" className="icone" aria-label="Remover prêmio" onClick={() => mudar({ prizes: c.prizes.filter((_, k) => k !== i) })}><Trash2 size={14} /></button>
            </div>
          ))}
          <button type="button" className="botao" disabled={c.prizes.length >= 12} onClick={() => mudar({ prizes: [...c.prizes, { name: "Lanche", points: 30, type: "pickup", value: 0 }] })}><Plus size={14} /> Adicionar prêmio</button>
          <label>WhatsApp para combinar a retirada<input value={c.whatsapp} onChange={(e) => mudar({ whatsapp: e.target.value })} placeholder="16999999999" style={{ maxWidth: 220 }} /></label>
        </fieldset>

        <fieldset className="cartao" style={{ margin: 0 }}>
          <legend className="sub">Aviso no WhatsApp</legend>
          <small>Sai sozinho quando o passageiro junta o mínimo. Com a agenda ligada, também avisa nos dias marcados quem já pode trocar (respeita as travas do CRM).</small>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            <label>Título<input maxLength={40} value={c.title} onChange={(e) => mudar({ title: e.target.value })} /></label>
            <label>Mensagem<input maxLength={255} value={c.message} onChange={(e) => mudar({ message: e.target.value })} /></label>
          </div>
          <label className="check"><input type="checkbox" checked={c.schedule_enabled} onChange={(e) => mudar({ schedule_enabled: e.target.checked })} /> Lembrar nos dias marcados</label>
          <div className="acoes">
            {DIAS.map((n, i) => <label key={n} className="check"><input type="checkbox" checked={c.days.includes(i)} onChange={(e) => mudar({ days: e.target.checked ? [...c.days, i].sort() : c.days.filter((x) => x !== i) })} /> {n}</label>)}
            <input type="time" value={c.send_time} onChange={(e) => mudar({ send_time: e.target.value })} aria-label="Horário" />
          </div>
        </fieldset>
        {msg && <div className={msg.erro ? "aviso erro" : "aviso ok"}>{msg.texto}</div>}
        <div className="acoes"><button className="botao primario" disabled={ocupado} onClick={() => void rodar(async () => { await apiCentral.salvarPontos(c); return "Pontos salvos!"; })}><Save size={14} /> Salvar pontos</button></div>
      </div>

      {d.pontos.pickups.length > 0 && (
        <fieldset className="cartao" style={{ margin: 0 }}>
          <legend className="sub">Prêmios para retirar</legend>
          {d.pontos.pickups.map((p) => (
            <div key={p.id} className="linha-filtro">
              <span>{p.prize?.name ?? "Prêmio"} · <code>{p.pickup_code}</code> · {p.phone} · {dia(p.created_at)}</span>
              {p.pickup_done_at ? <span className="selo ok"><CheckCircle2 size={12} /> Entregue</span> : <button className="botao" onClick={() => void rodar(async () => { await apiCentral.retiradaEntregue(p.id); return "Marcado como entregue."; })}>Marcar entregue</button>}
            </div>
          ))}
        </fieldset>
      )}
      {d.pontos.top.length > 0 && (
        <fieldset className="cartao" style={{ margin: 0 }}>
          <legend className="sub">Quem tem mais pontos</legend>
          {d.pontos.top.map((t) => <div key={t.phone} className="linha-filtro"><span>{t.phone}</span><strong>{t.balance}</strong></div>)}
        </fieldset>
      )}
    </Cartao>
  );
}
