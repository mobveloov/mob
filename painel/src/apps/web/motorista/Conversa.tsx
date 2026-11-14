// Conversa do app do motorista (chat da corrida e chat com o suporte): topo escuro com avatar, datas, balões,
// respostas rápidas em pílulas, campo de texto e microfone redondo (grava e envia áudio).

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, Mic, Phone, Send, User, Volume2 } from "lucide-react";
import { api, Gravador, urlDoAudio } from "../comum/api";
import { mensagemDeErro, type Mensagem } from "../comum/ui";
import { Erro, useImagem } from "./Pecas";
import type { Corrida } from "./tipos";

export interface MensagemM { id: string; meu: boolean; texto?: string; audio?: ReactNode; em: string; nome?: string }

/** Respostas rápidas da empresa (rota /mensagens-rapidas) ou, sem elas, as de sempre. */
const PADRAO = ["Estou a caminho!", "Cheguei no local", "Aguarde na frente, por favor"];
export function useRespostasRapidas() {
  const [l, setL] = useState<string[]>(PADRAO);
  useEffect(() => {
    void api<{ mensagens: unknown[] }>("/mensagens-rapidas").then((r) => {
      const t = (r.mensagens ?? []).map((m) => (typeof m === "string" ? m : String((m as { texto?: string })?.texto ?? ""))).filter(Boolean);
      if (t.length) setL(t);
    }).catch(() => undefined);
  }, []);
  return l;
}

const dia = (em: string, utc: boolean) => new Date(em).toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric", ...(utc ? { timeZone: "UTC" } : {}) }).replace(/ de /g, " ");
const horaMsg = (em: string, utc: boolean) => new Date(em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", ...(utc ? { timeZone: "UTC" } : {}) });

export function Conversa({ titulo, subtitulo, avatar, mensagens, utc = false, aberto = true, avisoFechado, fechar, telefone, enviarTexto, enviarAudio, direita, rapidas = true }: {
  titulo: ReactNode; subtitulo?: string; avatar: ReactNode; mensagens: MensagemM[]; utc?: boolean; aberto?: boolean; avisoFechado?: string; fechar: () => void; telefone?: string;
  enviarTexto: (t: string) => Promise<void>; enviarAudio: (a: Blob, segundos: number) => Promise<void>; direita?: ReactNode; rapidas?: boolean;
}) {
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState("");
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const gravador = useRef(new Gravador());
  const fim = useRef<HTMLDivElement>(null);
  const respostas = useRespostasRapidas();
  useEffect(() => { fim.current?.scrollIntoView({ behavior: "smooth" }); }, [mensagens.length]);
  useEffect(() => () => { void gravador.current.parar(true); }, []);
  useEffect(() => {
    if (!gravando) return;
    setSegundos(0);
    const t = setInterval(() => setSegundos((s) => { if (s >= 59) void parar(false); return s + 1; }), 1000);
    return () => clearInterval(t);
  }, [gravando]); // eslint-disable-line react-hooks/exhaustive-deps

  const enviar = async (t: string) => {
    if (!t.trim()) return;
    setErro("");
    try { await enviarTexto(t.trim()); setTexto(""); } catch (e) { setErro(mensagemDeErro(e)); }
  };
  const gravar = async () => { setErro(""); try { await gravador.current.comecar(); setGravando(true); } catch (e) { setErro(mensagemDeErro(e)); } };
  const parar = async (cancelar: boolean) => {
    const r = await gravador.current.parar(cancelar);
    setGravando(false);
    if (!r) return;
    if (r.segundos < 1) { setErro("Áudio curto demais."); return; }
    try { await enviarAudio(r.audio, r.segundos); } catch (e) { setErro(mensagemDeErro(e)); }
  };

  let ultimoDia = "";
  return (
    <div className="chat-m">
      <div className="chat-m-topo">
        <button type="button" className="voltar-chat" aria-label="Voltar" onClick={fechar}><ChevronLeft size={26} /></button>
        <span className="avatar-chat">{avatar}</span>
        <div className="nomes"><strong>{titulo}</strong>{subtitulo && <small>{subtitulo}</small>}</div>
        {telefone ? <a className="redondo" href={`tel:${telefone}`} aria-label="Ligar"><Phone size={19} /></a> : null}
        {direita ?? <span className="redondo" aria-hidden><Volume2 size={19} /></span>}
      </div>
      <div className="chat-m-lista">
        {!mensagens.length && <p className="dica" style={{ textAlign: "center", margin: "auto" }}>Nenhuma mensagem ainda.</p>}
        {mensagens.map((m) => {
          const d = dia(m.em, utc);
          const mostrarDia = d !== ultimoDia; ultimoDia = d;
          return (
            <div key={m.id} style={{ display: "contents" }}>
              {mostrarDia && <span className="chat-m-dia">{d}</span>}
              <div className={`balao ${m.meu ? "meu" : "dele"}`}>
                {!m.meu && m.nome && <small>{m.nome}</small>}
                {m.texto && <p>{m.texto}</p>}
                {m.audio}
                <time>{horaMsg(m.em, utc)}</time>
              </div>
            </div>
          );
        })}
        <div ref={fim} />
      </div>
      <Erro texto={erro} />
      {aberto ? (
        <>
          {rapidas && !gravando && <div className="respostas-rapidas">{respostas.map((r) => <button key={r} type="button" onClick={() => void enviar(r)}>{r}</button>)}</div>}
          {gravando ? (
            <div className="chat-m-entrada gravando">
              <span className="ponto-rec" /> Gravando… {segundos}s
              <button type="button" className="link-m perigo" onClick={() => void parar(true)}>Descartar</button>
              <button type="button" className="redondo" aria-label="Enviar áudio" onClick={() => void parar(false)}><Send size={20} /></button>
            </div>
          ) : (
            <form className="chat-m-entrada" onSubmit={(e) => { e.preventDefault(); void enviar(texto); }}>
              <input placeholder="Digite uma mensagem..." value={texto} maxLength={1000} onChange={(e) => setTexto(e.target.value)} />
              {texto.trim()
                ? <button className="redondo" aria-label="Enviar"><Send size={20} /></button>
                : <button type="button" className="redondo" aria-label="Gravar áudio" onClick={() => void gravar()}><Mic size={22} /></button>}
            </form>
          )}
        </>
      ) : <p className="dica" style={{ textAlign: "center", padding: "1rem" }}>{avisoFechado ?? "O chat fica aberto só durante a corrida."}</p>}
    </div>
  );
}

// ------------------------------------------------------------------ chat da corrida (com o passageiro)

function AudioCorrida({ corridaId, audioId }: { corridaId: string; audioId: string }) {
  const [url, setUrl] = useState("");
  const [erro, setErro] = useState("");
  useEffect(() => { urlDoAudio(corridaId, audioId).then(setUrl).catch((e) => setErro(mensagemDeErro(e))); }, [corridaId, audioId]);
  if (erro) return <span className="dica">{erro}</span>;
  return url ? <audio controls preload="metadata" src={url} /> : <span className="dica">Carregando áudio…</span>;
}

export function ChatCorrida({ corrida, mensagens, fechar }: { corrida: Corrida; mensagens: Mensagem[]; fechar: () => void }) {
  const foto = useImagem(corrida.passageiro.foto);
  const tel = corrida.passageiro.telefone?.replace(/\D/g, "");
  const lista: MensagemM[] = mensagens.map((m) => ({ id: m.id, meu: m.de === "motorista", texto: m.texto, em: m.em, nome: m.nome, audio: m.audio ? <AudioCorrida corridaId={corrida.id} audioId={m.audio.id} /> : undefined }));
  return (
    <Conversa titulo={corrida.passageiro.nome} subtitulo={corrida.aberta ? "Viagem ativa" : "Viagem encerrada"} avatar={foto ? <img src={foto} alt="" /> : <User size={22} />} telefone={tel || undefined}
      mensagens={lista} aberto={corrida.aberta} fechar={fechar}
      enviarTexto={async (texto) => { await api(`/corridas/${corrida.id}/chat`, { corpo: { texto } }); }}
      enviarAudio={async (audio, segundos) => { await api(`/corridas/${corrida.id}/audio`, { bruto: audio, cabecalhos: { "x-segundos": String(segundos) } }); }} />
  );
}
