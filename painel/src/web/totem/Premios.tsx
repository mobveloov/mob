// Página pública dos Prêmios: /p/<empresa>/<token> (convite) ou /premios/<empresa>/<roleta|raspadinha> (link aberto: o
// telefone recebe o link do jogo no WhatsApp). O sorteio e o cupom acontecem no servidor.

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Copy, Gift, Loader2 } from "lucide-react";
import "./premios.css";

type Prize = { label: string; type: "percent" | "fixed" | "none"; color?: string };
type Game = { kind: "roleta" | "raspadinha"; title: string; message: string; button_text: string; card_headline: string; card_phrase: string; color: string; prizes: Prize[] };
type Result = { prize_index: number | null; prize: { label: string; type: string } | null; code: string | null; coupon_error: string | null };
type Info = { company: string; first_name: string; game: Game; expired: boolean; result: Result | null };

const CORES_ROLETA = ["#D4A017", "#1E293B", "#B45309", "#334155", "#CA8A04", "#0F172A", "#A16207", "#475569"];

async function chamar<T>(empresa: string, rota: string, corpo: Record<string, unknown>): Promise<{ data?: T; error?: string }> {
  try {
    const r = await fetch(`/api/totem/premios/publico/${encodeURIComponent(empresa)}/${rota}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    const d = await r.json().catch(() => null) as (T & { erro?: string }) | null;
    if (!r.ok || !d) return { error: d?.erro ?? "Não foi possível carregar agora. Tente de novo." };
    return { data: d };
  } catch { return { error: "Sem conexão. Verifique a internet." }; }
}

function caminho(): { empresa: string; token: string | null; jogo: string | null } {
  const s = window.location.pathname.split("/").filter(Boolean);
  if (s[0] === "p" && s[1] && s[2]) return { empresa: s[1], token: s[2], jogo: null };
  if (s[0] === "premios" && s[1] && s[2]) return { empresa: s[1], token: null, jogo: s[2] };
  return { empresa: "", token: null, jogo: null };
}

export default function Premios() {
  const { empresa, token, jogo } = caminho();
  const [info, setInfo] = useState<Info | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(!!token);
  useEffect(() => {
    if (!token) return;
    chamar<Info>(empresa, "info", { token }).then((r) => {
      setCarregando(false);
      if (r.error || !r.data?.game) setErro(r.error ?? "Convite não encontrado."); else setInfo(r.data);
    });
  }, [empresa, token]);

  if (!token && jogo && empresa) return <Moldura><PorTelefone empresa={empresa} jogo={jogo} /></Moldura>;
  if (!token) return <Moldura><Aviso icone="erro" texto="Link inválido." /></Moldura>;
  if (carregando) return <Moldura><div className="pr-centro"><Loader2 size={32} className="pr-gira" /></div></Moldura>;
  if (erro || !info) return <Moldura><Aviso icone="erro" texto={erro ?? "Convite não encontrado."} /></Moldura>;
  return (
    <Moldura cor={info.game.color} empresa={info.company}>
      {info.game.kind === "roleta" ? <Roleta empresa={empresa} token={token} info={info} /> : <Raspadinha empresa={empresa} token={token} info={info} />}
    </Moldura>
  );
}

function Moldura({ children, cor = "#D4A017", empresa }: { children: React.ReactNode; cor?: string; empresa?: string }) {
  useEffect(() => { document.title = empresa ? `${empresa} · Prêmios` : "Prêmios"; }, [empresa]);
  return (
    <div className="pr">
      <div className="pr-col">
        {empresa && <p className="pr-empresa" style={{ color: cor }}>{empresa}</p>}
        {children}
      </div>
    </div>
  );
}

function Aviso({ icone, texto }: { icone: "erro" | "presente"; texto: string }) {
  return (
    <div className="pr-cartao pr-centro">
      {icone === "erro" ? <AlertCircle size={32} color="#f87171" /> : <Gift size={32} color="#D4A017" />}
      <p>{texto}</p>
    </div>
  );
}

/** Link aberto: com o telefone, o servidor manda o link do jogo para o WhatsApp desse passageiro. */
function PorTelefone({ empresa, jogo }: { empresa: string; jogo: string }) {
  const [tel, setTel] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<string | null>(null);
  const enviar = async () => {
    setOcupado(true); setErro(null);
    const r = await chamar<{ sent?: boolean; played?: boolean }>(empresa, "abrir", { kind: jogo, telefone: tel });
    setOcupado(false);
    if (r.error || !r.data) return setErro(r.error ?? "Não foi possível abrir.");
    setFeito(r.data.played ? "Você já jogou. O resultado está na mensagem que você recebeu." : "Pronto! Enviamos o link para o seu WhatsApp. Abra a mensagem para jogar.");
  };
  if (feito) return <Aviso icone="presente" texto={feito} />;
  return (
    <div className="pr-cartao">
      <Gift size={40} color="#D4A017" className="pr-icone" />
      <h1 className="pr-titulo-pequeno">{jogo === "raspadinha" ? "Raspadinha" : "Roleta de prêmios"}</h1>
      <p className="pr-suave">Digite o telefone cadastrado no aplicativo.</p>
      <input inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void enviar(); }} placeholder="(16) 99999-9999" className="pr-campo" />
      {erro && <p className="pr-erro">{erro}</p>}
      <button onClick={() => void enviar()} disabled={ocupado || tel.replace(/\D/g, "").length < 10} className="pr-botao" style={{ background: "#D4A017" }}>{ocupado ? "Abrindo..." : "Continuar"}</button>
    </div>
  );
}

function Resultado({ result, cor }: { result: Result; cor: string }) {
  const [copiado, setCopiado] = useState(false);
  const ganhou = result.prize && result.prize.type !== "none";
  return (
    <div className="pr-cartao pr-centro pr-resultado">
      <p className="pr-grande" style={{ color: ganhou ? cor : undefined }}>{ganhou ? `Você ganhou ${result.prize!.label}!` : "Não foi dessa vez"}</p>
      {ganhou && result.code && (
        <>
          <p className="pr-suave">Use este cupom ao pedir a próxima corrida no aplicativo:</p>
          <button className="pr-cupom" style={{ borderColor: cor, color: cor }} onClick={() => { navigator.clipboard?.writeText(result.code!).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2000); }, () => undefined); }}>
            {result.code} {copiado ? <Check size={20} /> : <Copy size={20} />}
          </button>
          <p className="pr-mini">{copiado ? "Copiado!" : "Toque para copiar. Vale só para você e uma vez."}</p>
        </>
      )}
      {ganhou && !result.code && <p className="pr-suave">Seu prêmio foi registrado. A central vai liberar o cupom para você.</p>}
      {!ganhou && <p className="pr-suave">Fique de olho: logo tem outra chance.</p>}
    </div>
  );
}

function Roleta({ empresa, token, info }: { empresa: string; token: string; info: Info }) {
  const { game } = info;
  // Roleta com 1 prêmio: desenha 2 fatias iguais (antes ficava meia roda)
  const fatias = game.prizes.length === 1 ? [game.prizes[0], game.prizes[0]] : game.prizes;
  const n = Math.max(fatias.length, 2);
  const seg = 360 / n;
  const [giro, setGiro] = useState(0);
  const [girando, setGirando] = useState(false);
  const [result, setResult] = useState<Result | null>(info.result);
  const [erro, setErro] = useState<string | null>(info.expired && !info.result ? "Este convite venceu." : null);
  const [mostrar, setMostrar] = useState(!!info.result);

  const girar = async () => {
    if (girando || result) return;
    setGirando(true); setErro(null);
    const r = await chamar<{ result: Result }>(empresa, "play", { token });
    if (r.error || !r.data?.result) { setGirando(false); return setErro(r.error ?? "Não foi possível girar."); }
    const res = r.data.result;
    const idx = res.prize_index != null && res.prize_index >= 0 ? res.prize_index : Math.max(0, game.prizes.findIndex((p) => p.type === "none"));
    // Ponteiro no topo: o centro da fatia sorteada para em 0°
    setGiro(360 * 6 + (360 - (idx * seg + seg / 2)));
    setResult(res);
    setTimeout(() => { setGirando(false); setMostrar(true); }, 4300);
  };

  const raio = 140, c = 150;
  const arco = (i: number) => {
    const a0 = ((i * seg - 90) * Math.PI) / 180, a1 = (((i + 1) * seg - 90) * Math.PI) / 180;
    return `M${c},${c} L${c + raio * Math.cos(a0)},${c + raio * Math.sin(a0)} A${raio},${raio} 0 ${seg > 180 ? 1 : 0} 1 ${c + raio * Math.cos(a1)},${c + raio * Math.sin(a1)} Z`;
  };
  return (
    <div className="pr-centro">
      <h1 className="pr-titulo" style={{ color: game.color }}>{game.card_headline || game.title}</h1>
      <p className="pr-suave">{info.first_name ? `${info.first_name}, ` : ""}{game.card_phrase || game.message}</p>
      <div className="pr-roleta">
        <div className="pr-ponteiro" style={{ borderTopColor: game.color }} />
        <svg viewBox="0 0 300 300" style={{ transform: `rotate(${giro}deg)`, transition: girando ? "transform 4.2s cubic-bezier(0.17, 0.67, 0.12, 0.99)" : "none" }}>
          {fatias.map((p, i) => {
            const meio = ((i + 0.5) * seg - 90) * Math.PI / 180;
            const tx = c + raio * 0.62 * Math.cos(meio), ty = c + raio * 0.62 * Math.sin(meio);
            return (
              <g key={i}>
                <path d={arco(i)} fill={p.color ?? CORES_ROLETA[i % CORES_ROLETA.length]} stroke="#0b1220" strokeWidth="2" />
                <text x={tx} y={ty} fill="#fff" fontSize="13" fontWeight="700" textAnchor="middle" dominantBaseline="middle" transform={`rotate(${(i + 0.5) * seg}, ${tx}, ${ty})`}>{p.label.slice(0, 14)}</text>
              </g>
            );
          })}
          <circle cx={c} cy={c} r="22" fill="#0b1220" stroke={game.color} strokeWidth="4" />
        </svg>
      </div>
      {!result && !erro && <button onClick={() => void girar()} disabled={girando} className="pr-botao" style={{ background: game.color }}>{girando ? "Girando..." : game.button_text || "Girar"}</button>}
      {erro && <Aviso icone="erro" texto={erro} />}
      {result && mostrar && <Resultado result={result} cor={game.color} />}
    </div>
  );
}

function Raspadinha({ empresa, token, info }: { empresa: string; token: string; info: Info }) {
  const { game } = info;
  const tela = useRef<HTMLCanvasElement | null>(null);
  const [result, setResult] = useState<Result | null>(info.result);
  const [revelado, setRevelado] = useState(!!info.result);
  const [erro, setErro] = useState<string | null>(info.expired && !info.result ? "Este convite venceu." : null);
  const jogando = useRef(false);
  const riscando = useRef(false);

  useEffect(() => {
    const cv = tela.current;
    if (!cv || revelado) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const g = ctx.createLinearGradient(0, 0, cv.width, cv.height);
    g.addColorStop(0, "#9CA3AF"); g.addColorStop(0.5, "#E5E7EB"); g.addColorStop(1, "#9CA3AF");
    ctx.fillStyle = g; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = "#4B5563"; ctx.font = "bold 22px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("RASPE AQUI", cv.width / 2, cv.height / 2 + 8);
  }, [revelado]);

  const garantir = useCallback(async () => {
    if (result || jogando.current) return;
    jogando.current = true;
    const r = await chamar<{ result: Result }>(empresa, "play", { token });
    // Falha (rede): libera para tentar de novo raspando
    if (r.error || !r.data?.result) { jogando.current = false; return setErro(r.error ?? "Não foi possível raspar. Tente de novo."); }
    setErro(null); setResult(r.data.result);
  }, [empresa, token, result]);

  const raspar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = tela.current;
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * cv.width, y = ((e.clientY - rect.top) / rect.height) * cv.height;
    const ctx = cv.getContext("2d")!;
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath(); ctx.arc(x, y, 26, 0, Math.PI * 2); ctx.fill();
  };
  const conferir = () => {
    const cv = tela.current;
    if (!cv) return;
    const d = cv.getContext("2d")!.getImageData(0, 0, cv.width, cv.height).data;
    let limpo = 0;
    for (let i = 3; i < d.length; i += 4 * 16) if (d[i] === 0) limpo++;
    if (limpo / (d.length / (4 * 16)) > 0.5) setRevelado(true);
  };

  const ganhou = result?.prize && result.prize.type !== "none";
  return (
    <div className="pr-centro">
      <div className="pr-raspa-fundo" style={{ background: `linear-gradient(160deg, ${game.color}33, #0f172a)` }}>
        {info.first_name && <p className="pr-nome" style={{ color: game.color }}>{info.first_name},</p>}
        <h1 className="pr-titulo pr-maiusculo" style={{ color: game.color }}>{game.card_headline}</h1>
        <p className="pr-suave">{game.card_phrase}</p>
        <div className="pr-premio">
          <p>{result ? (ganhou ? result.prize!.label : "Não foi dessa vez") : "..."}</p>
          {!revelado && !erro && (
            <canvas ref={tela} width={640} height={320}
              onPointerDown={(e) => { riscando.current = true; void garantir(); raspar(e); }}
              onPointerMove={(e) => { if (riscando.current) raspar(e); }}
              onPointerUp={() => { riscando.current = false; conferir(); }}
              onPointerLeave={() => { riscando.current = false; }} />
          )}
        </div>
        {!revelado && !erro && <p className="pr-mini">Raspe com o dedo para descobrir.</p>}
      </div>
      {erro && <Aviso icone="erro" texto={erro} />}
      {erro && !info.expired && !result && <button className="pr-botao" style={{ background: game.color }} onClick={() => { setErro(null); void garantir().then(() => setRevelado(true)); }}>Tentar de novo</button>}
      {result && revelado && <Resultado result={result} cor={game.color} />}
    </div>
  );
}
