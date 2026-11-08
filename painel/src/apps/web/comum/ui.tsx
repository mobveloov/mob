// Peças de tela comuns aos dois apps: marca da empresa, login, chat (texto e áudio), mapa simples e estrelas.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, config, ErroApi, guardarToken, Gravador, trocarServidor, urlArquivo, urlDoAudio, type Papel, type Posicao } from "./api";

export interface MarcaApp {
  empresaId: string; nome: string; nomeExibido: string; cores: { primaria: string; secundaria: string; fundo: string; texto: string };
  fonte: string; logoClaro: string | null; logoEscuro: string | null; icone: string | null; suporte: { email: string; telefone: string }; push: boolean;
}

/** Cor do texto que dá leitura sobre a cor de fundo. */
function contraste(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#111111" : "#ffffff";
}

export function aplicarMarca(m: MarcaApp) {
  const s = document.documentElement.style;
  s.setProperty("--cor", m.cores.primaria);
  s.setProperty("--cor-texto", contraste(m.cores.primaria));
  s.setProperty("--cor2", m.cores.secundaria);
  s.setProperty("--fundo", m.cores.fundo);
  s.setProperty("--texto", m.cores.texto);
  s.setProperty("--fonte", `"${m.fonte}", system-ui, sans-serif`);
  document.title = m.nome;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", m.cores.primaria);
}

export function useMarca() {
  const [marca, setMarca] = useState<MarcaApp | null>(null);
  const [erro, setErro] = useState("");
  // Sem sinal ao abrir: mostra o aviso e tenta de novo a cada 3 s, sozinho.
  useEffect(() => {
    let vivo = true, t: ReturnType<typeof setTimeout>;
    const tentar = () => api<MarcaApp>("/marca").then((m) => { if (vivo) { aplicarMarca(m); setMarca(m); setErro(""); } })
      .catch((e) => { if (vivo) { setErro(e.message); t = setTimeout(tentar, 3000); } });
    void tentar();
    return () => { vivo = false; clearTimeout(t); };
  }, []);
  return { marca, erro };
}

export function Logo({ marca }: { marca: MarcaApp }) {
  const src = urlArquivo(marca.logoClaro || marca.icone);
  return src ? <img className="logo" src={src} alt={marca.nome} /> : <div className="logo-texto">{marca.nome}</div>;
}

export function Aviso({ texto, tipo = "erro" }: { texto: string; tipo?: "erro" | "ok" | "info" }) {
  return texto ? <div className={`aviso aviso-${tipo}`} role="alert">{texto}</div> : null;
}

/** Só no APK de teste: mostra e troca o endereço do servidor (o túnel temporário muda quando reinicia). */
export function ServidorTeste() {
  const [aberto, setAberto] = useState(false);
  const [url, setUrl] = useState(config().api);
  const [erro, setErro] = useState("");
  if (!config().teste) return null;
  if (!aberto) return <button type="button" className="botao-link" onClick={() => setAberto(true)}>Servidor de teste: {config().api || "—"}</button>;
  return (
    <form className="cartao" onSubmit={(e) => { e.preventDefault(); try { trocarServidor(url); } catch (x) { setErro((x as Error).message); } }}>
      <label>Endereço do servidor (teste)<input inputMode="url" value={url} placeholder="https://….trycloudflare.com" onChange={(e) => setUrl(e.target.value)} /></label>
      <Aviso texto={erro} />
      <div className="linha">
        <button type="button" className="botao secundario" onClick={() => trocarServidor("")}>Voltar ao padrão</button>
        <button className="botao">Salvar</button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------------ login pelo telefone

export function Entrar({ marca, papel, aoEntrar }: { marca: MarcaApp; papel: Papel; aoEntrar: () => void }) {
  const [telefone, setTelefone] = useState("");
  const [codigo, setCodigo] = useState("");
  const [fase, setFase] = useState<"telefone" | "codigo">("telefone");
  const [erro, setErro] = useState("");
  const [info, setInfo] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const pedir = async () => {
    setErro(""); setOcupado(true);
    try {
      const r = await api<{ enviado: boolean; codigoTeste?: string }>("/entrar/codigo", { corpo: { papel, telefone } });
      setFase("codigo");
      setInfo(r.enviado ? "Mandamos o código pelo WhatsApp." : "Pedimos o código. Se não chegar, fale com a central.");
      if (r.codigoTeste) setCodigo(r.codigoTeste);
    } catch (e) { setErro((e as Error).message); } finally { setOcupado(false); }
  };
  const confirmar = async () => {
    setErro(""); setOcupado(true);
    try {
      const r = await api<{ token: string }>("/entrar", { corpo: { papel, telefone, codigo } });
      guardarToken(r.token);
      aoEntrar();
    } catch (e) { setErro((e as Error).message); } finally { setOcupado(false); }
  };

  return (
    <div className="tela entrar">
      <Logo marca={marca} />
      <h1>{papel === "motorista" ? "Entrar como motorista" : "Entrar"}</h1>
      {fase === "telefone" ? (
        <form onSubmit={(e) => { e.preventDefault(); void pedir(); }}>
          <label>Seu celular com DDD
            <input inputMode="tel" autoComplete="tel" placeholder="(00) 00000-0000" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
          </label>
          <button className="botao" disabled={ocupado || telefone.replace(/\D/g, "").length < 10}>Receber código</button>
        </form>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void confirmar(); }}>
          <Aviso texto={info} tipo="info" />
          <label>Código de 6 números
            <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))} />
          </label>
          <button className="botao" disabled={ocupado || codigo.length !== 6}>Entrar</button>
          <button type="button" className="botao-link" onClick={() => { setFase("telefone"); setCodigo(""); }}>Trocar o número</button>
        </form>
      )}
      <Aviso texto={erro} />
      {papel === "motorista" && <p className="dica">Só entra quem está cadastrado pela central. Dúvidas: {marca.suporte.telefone}</p>}
      <ServidorTeste />
    </div>
  );
}

// ------------------------------------------------------------------ chat da corrida

export interface Mensagem { id: string; de: Papel; nome: string; texto?: string; audio?: { id: string; mime: string; bytes: number; segundos: number | null }; em: string }

function TocarAudio({ corridaId, m }: { corridaId: string; m: Mensagem }) {
  const [url, setUrl] = useState("");
  const [erro, setErro] = useState("");
  useEffect(() => { urlDoAudio(corridaId, m.audio!.id).then(setUrl).catch((e) => setErro(e.message)); }, [corridaId, m.audio]);
  if (erro) return <span className="dica">{erro}</span>;
  return url ? <audio controls preload="metadata" src={url} /> : <span className="dica">Carregando áudio…</span>;
}

export function Chat({ corridaId, papel, mensagens, aberto, fechar }: { corridaId: string; papel: Papel; mensagens: Mensagem[]; aberto: boolean; fechar: () => void }) {
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState("");
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const gravador = useRef(new Gravador());
  const fim = useRef<HTMLDivElement>(null);
  useEffect(() => { fim.current?.scrollIntoView({ behavior: "smooth" }); }, [mensagens.length]);
  useEffect(() => {
    if (!gravando) return;
    setSegundos(0);
    const t = setInterval(() => setSegundos((s) => { if (s >= 59) void pararGravacao(false); return s + 1; }), 1000);
    return () => clearInterval(t);
  }, [gravando]); // eslint-disable-line react-hooks/exhaustive-deps

  const enviar = async () => {
    if (!texto.trim()) return;
    setErro("");
    try { await api(`/corridas/${corridaId}/chat`, { corpo: { texto } }); setTexto(""); } catch (e) { setErro((e as Error).message); }
  };
  const gravar = async () => {
    setErro("");
    try { await gravador.current.comecar(); setGravando(true); } catch (e) { setErro((e as Error).message); }
  };
  const pararGravacao = async (cancelar: boolean) => {
    const r = await gravador.current.parar(cancelar);
    setGravando(false);
    if (!r) return;
    if (r.segundos < 1) { setErro("Áudio curto demais."); return; }
    try { await api(`/corridas/${corridaId}/audio`, { bruto: r.audio, cabecalhos: { "x-segundos": String(r.segundos) } }); }
    catch (e) { setErro((e as Error).message); }
  };
  useEffect(() => () => { void gravador.current.parar(true); }, []);

  return (
    <div className="chat">
      <div className="chat-topo"><button className="botao-link" onClick={fechar}>‹ Voltar</button><strong>Mensagens</strong><span /></div>
      <div className="chat-lista">
        {!mensagens.length && <p className="dica centro">Nenhuma mensagem ainda.</p>}
        {mensagens.map((m) => (
          <div key={m.id} className={`balao ${m.de === papel ? "meu" : "dele"}`}>
            {m.de !== papel && <small>{m.nome}</small>}
            {m.texto && <p>{m.texto}</p>}
            {m.audio && <TocarAudio corridaId={corridaId} m={m} />}
            <time>{new Date(m.em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</time>
          </div>
        ))}
        <div ref={fim} />
      </div>
      <Aviso texto={erro} />
      {aberto ? (
        gravando ? (
          <div className="chat-entrada gravando">
            <span className="ponto-rec" /> Gravando… {segundos}s
            <button className="botao-link" onClick={() => void pararGravacao(true)}>Descartar</button>
            <button className="botao" onClick={() => void pararGravacao(false)}>Enviar áudio</button>
          </div>
        ) : (
          <form className="chat-entrada" onSubmit={(e) => { e.preventDefault(); void enviar(); }}>
            <input placeholder="Escreva uma mensagem" value={texto} maxLength={1000} onChange={(e) => setTexto(e.target.value)} />
            {texto.trim() ? <button className="botao">Enviar</button> : <button type="button" className="botao microfone" aria-label="Gravar áudio" onClick={() => void gravar()}>🎤</button>}
          </form>
        )
      ) : <p className="dica centro">O chat fica aberto só durante a corrida.</p>}
    </div>
  );
}

// ------------------------------------------------------------------ mapa simples (sem serviço de mapas)

export function MapaSimples({ pontos }: { pontos: Array<Posicao & { rotulo: string; tipo: "embarque" | "destino" | "carro" | "eu" }> }) {
  const validos = pontos.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (!validos.length) return null;
  const lats = validos.map((p) => p.lat), lngs = validos.map((p) => p.lng);
  const [a, b, c, d] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const folga = Math.max(b - a, d - c, 0.004) * 0.25;
  const W = 320, H = 180;
  const x = (lng: number) => ((lng - (c - folga)) / (d - c + 2 * folga || 1)) * W;
  const y = (lat: number) => H - ((lat - (a - folga)) / (b - a + 2 * folga || 1)) * H;
  const cor = { embarque: "var(--cor)", destino: "#c0392b", carro: "#1f2937", eu: "#2563eb" };
  const emb = validos.find((p) => p.tipo === "embarque"), des = validos.find((p) => p.tipo === "destino");
  return (
    <svg className="mapa" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Posições no mapa">
      <rect width={W} height={H} rx="12" className="mapa-fundo" />
      {emb && des && <line x1={x(emb.lng)} y1={y(emb.lat)} x2={x(des.lng)} y2={y(des.lat)} className="mapa-linha" />}
      {validos.map((p, i) => (
        <g key={i} transform={`translate(${x(p.lng)},${y(p.lat)})`}>
          <circle r={p.tipo === "carro" ? 9 : 7} fill={cor[p.tipo]} stroke="#fff" strokeWidth="2" />
          <text y={-12} textAnchor="middle" className="mapa-rotulo">{p.rotulo}</text>
        </g>
      ))}
    </svg>
  );
}

export function Estrelas({ valor, aoEscolher }: { valor: number; aoEscolher?: (n: number) => void }) {
  return (
    <div className="estrelas" role="radiogroup" aria-label="Nota">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={valor === n} aria-label={`${n} estrela${n > 1 ? "s" : ""}`} className={n <= valor ? "acesa" : ""} onClick={() => aoEscolher?.(n)} disabled={!aoEscolher}>★</button>
      ))}
    </div>
  );
}

export function Abas<T extends string>({ abas, atual, mudar }: { abas: Array<[T, string]>; atual: T; mudar: (a: T) => void }) {
  return <nav className="abas">{abas.map(([id, nome]) => <button key={id} className={atual === id ? "ativa" : ""} onClick={() => mudar(id)}>{nome}</button>)}</nav>;
}

export function Carregando({ texto = "Carregando…" }: { texto?: string }) { return <div className="tela centro"><div className="girando" /><p>{texto}</p></div>; }

export function Cartao({ children, className = "" }: { children: ReactNode; className?: string }) { return <section className={`cartao ${className}`}>{children}</section>; }

export const mensagemDeErro = (e: unknown) => (e instanceof ErroApi || e instanceof Error ? e.message : "Erro.");
