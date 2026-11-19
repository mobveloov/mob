// Página pública dos Pontos de Troca: /pontos/<empresa>/<token> (link do aviso: vê o saldo e troca) ou /pontos/<empresa>
// (digita o telefone: só vê o saldo). Troca e extrato só pelo link do aviso, para ninguém gastar os pontos de outra pessoa.

import { useEffect, useState } from "react";
import { AlertCircle, Check, Coins, Copy, Gift, Loader2 } from "lucide-react";
import "./premios.css";

type Premio = { index: number; name: string; points: number; type: "pickup" | "percent" | "fixed"; value: number };
type Info = {
  company: string; enabled: boolean; balance: number; min_points: number; point_value: number; money_value: number;
  next_expiry: { points: number; at: string } | null; prizes: Premio[]; redeem_needs_link: boolean; whatsapp: string | null;
  history: Array<{ kind: string; points: number; created_at: number; coupon_code: string | null; pickup_code: string | null; prize: { name?: string } | null }>;
};
type Troca = { coupon: string | null; pickup: string | null; balance: number; whatsapp_link: string | null };

const brl = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;
const COR = "#D4A017";

async function chamar<T>(empresa: string, rota: string, corpo: Record<string, unknown>): Promise<{ data?: T; error?: string }> {
  try {
    const r = await fetch(`/api/totem/pontos/publico/${encodeURIComponent(empresa)}/${rota}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    const d = await r.json().catch(() => null) as (T & { erro?: string }) | null;
    if (!r.ok || !d) return { error: d?.erro ?? "Não foi possível carregar agora. Tente de novo." };
    return { data: d };
  } catch { return { error: "Sem conexão. Verifique a internet." }; }
}

function caminho() {
  const s = window.location.pathname.split("/").filter(Boolean);
  return { empresa: s[0] === "pontos" ? s[1] ?? "" : "", token: s[0] === "pontos" ? s[2] ?? "" : "" };
}

export default function Pontos() {
  const { empresa, token } = caminho();
  const [info, setInfo] = useState<Info | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tel, setTel] = useState("");
  const [carregando, setCarregando] = useState(!!token);
  const [troca, setTroca] = useState<Troca | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = async (corpo: Record<string, unknown>) => {
    setCarregando(true); setErro(null);
    const r = await chamar<Info>(empresa, "info", corpo);
    setCarregando(false);
    if (r.error || !r.data) setErro(r.error ?? "Não foi possível abrir."); else setInfo(r.data);
  };
  useEffect(() => { if (token) void carregar({ token }); }, [empresa, token]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { document.title = info?.company ? `${info.company} · Pontos` : "Pontos"; }, [info?.company]);

  const trocar = async (prize: number | "money") => {
    if (!confirm("Trocar seus pontos agora?")) return;
    setOcupado(true); setErro(null);
    const r = await chamar<Troca>(empresa, "trocar", { token, prize });
    setOcupado(false);
    if (r.error || !r.data) return setErro(r.error ?? "Não foi possível trocar.");
    setTroca(r.data);
    void carregar({ token });
  };

  return (
    <div className="pr"><div className="pr-col">
      {info?.company && <p className="pr-empresa" style={{ color: COR }}>{info.company}</p>}
      {!empresa ? <Aviso texto="Link inválido." /> : carregando ? <div className="pr-centro"><Loader2 size={32} className="pr-gira" /></div> : !info ? (
        token ? <Aviso texto={erro ?? "Link inválido."} /> : (
          <div className="pr-cartao">
            <Coins size={40} color={COR} className="pr-icone" />
            <h1 className="pr-titulo-pequeno">Meus pontos</h1>
            <p className="pr-suave">Digite o telefone cadastrado no aplicativo.</p>
            <input inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void carregar({ telefone: tel }); }} placeholder="(16) 99999-9999" className="pr-campo" />
            {erro && <p className="pr-erro">{erro}</p>}
            <button className="pr-botao" style={{ background: COR }} disabled={tel.replace(/\D/g, "").length < 10} onClick={() => void carregar({ telefone: tel })}>Ver meus pontos</button>
          </div>
        )
      ) : (
        <div className="pr-cartao pr-centro">
          <Coins size={36} color={COR} />
          <p className="pr-grande" style={{ color: COR }}>{info.balance} ponto(s)</p>
          <p className="pr-suave">Valem {brl(info.money_value)} de desconto{info.balance < info.min_points ? `. Junte ${info.min_points - info.balance} para trocar.` : "."}</p>
          {info.next_expiry && <p className="pr-mini">{info.next_expiry.points} ponto(s) vencem em {new Date(info.next_expiry.at).toLocaleDateString("pt-BR")}.</p>}
          {!info.enabled && <p className="pr-erro">O programa de pontos está desligado.</p>}
          {erro && <p className="pr-erro">{erro}</p>}
          {troca && (
            <div className="pr-resultado">
              {troca.coupon && <Codigo rotulo="Seu cupom (use ao pedir a corrida no aplicativo):" codigo={troca.coupon} />}
              {troca.pickup && <Codigo rotulo="Seu código de retirada:" codigo={troca.pickup} />}
              {troca.whatsapp_link && <a className="pr-botao" style={{ background: COR, textDecoration: "none", display: "block" }} href={troca.whatsapp_link}>Combinar a retirada no WhatsApp</a>}
            </div>
          )}
          {info.enabled && info.redeem_needs_link && <p className="pr-mini">Para trocar, abra o link que enviamos no aviso.</p>}
          {info.enabled && !info.redeem_needs_link && (
            <>
              {info.balance >= info.min_points && <button className="pr-botao" style={{ background: COR }} disabled={ocupado} onClick={() => void trocar("money")}>Trocar tudo por {brl(info.money_value)}</button>}
              {info.prizes.map((p) => (
                <button key={p.index} className="pr-botao" style={{ background: "#1e293b", color: "#f1f5f9" }} disabled={ocupado || info.balance < p.points} onClick={() => void trocar(p.index)}>
                  <Gift size={16} /> {p.name} · {p.points} pontos
                </button>
              ))}
            </>
          )}
          {info.history.length > 0 && (
            <div style={{ width: "100%", textAlign: "left" }}>
              <p className="pr-mini">Últimos movimentos</p>
              {info.history.map((h, i) => (
                <p key={i} className="pr-suave" style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>{h.kind === "earn" ? "Corrida" : h.kind === "redeem" ? `Troca${h.prize?.name ? `: ${h.prize.name}` : ""}` : "Vencidos"}</span><span>{h.points > 0 ? `+${h.points}` : h.points}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div></div>
  );
}

function Aviso({ texto }: { texto: string }) {
  return <div className="pr-cartao pr-centro"><AlertCircle size={32} color="#f87171" /><p>{texto}</p></div>;
}

function Codigo({ rotulo, codigo }: { rotulo: string; codigo: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <>
      <p className="pr-suave">{rotulo}</p>
      <button className="pr-cupom" style={{ borderColor: COR, color: COR }} onClick={() => { navigator.clipboard?.writeText(codigo).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2000); }, () => undefined); }}>
        {codigo} {copiado ? <Check size={20} /> : <Copy size={20} />}
      </button>
    </>
  );
}
