import { useEffect, useRef, useState } from "react";
import { MessageCircle, RefreshCw, Send, Undo2 } from "lucide-react";
import { Cartao, useCarregar } from "../componentes/ui";
import { apiBot, ETAPA, hora, partesWhatsApp, type Mensagem } from "./api";

const QUEM: Record<Mensagem["de"], string> = { passageiro: "Passageiro", bot: "Bot", operador: "Operador" };

export function Bolha({ m }: { m: Mensagem }) {
  return (
    <div className={`bot-msg ${m.de}`}>
      {partesWhatsApp(m.texto).map((p, i) => (p.negrito ? <strong key={i}>{p.t}</strong> : <span key={i}>{p.t}</span>))}
      <small>{m.de === "operador" && m.autor ? m.autor : QUEM[m.de]} · {hora(m.em)}</small>
    </div>
  );
}

/** Conversas registradas do bot, com histórico por passageiro e resposta manual do operador. */
export function BotConversas() {
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState<string | null>(null);
  const lista = useCarregar(() => apiBot.conversas(busca), [busca], 8000);
  const conv = useCarregar(() => (aberta ? apiBot.conversa(aberta) : Promise.resolve(null)), [aberta], 5000);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const fim = useRef<HTMLDivElement>(null);
  const c = conv.dados?.conversa;

  useEffect(() => { fim.current?.scrollIntoView({ block: "end" }); }, [c?.mensagens.length]);

  const responder = async () => {
    if (!aberta || !texto.trim()) return;
    try { await apiBot.responder(aberta, texto); setTexto(""); setErro(null); conv.recarregar(); lista.recarregar(); }
    catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
  };
  const encerrar = async () => {
    if (!aberta) return;
    try { await apiBot.encerrar(aberta); conv.recarregar(); lista.recarregar(); } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <div className="bot-conversas">
      <Cartao titulo="Conversas">
        <div className="bot-linha" style={{ marginBottom: 8 }}>
          <input placeholder="Buscar nome ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ flex: 1 }} />
          <button className="botao" onClick={lista.recarregar} aria-label="Atualizar"><RefreshCw size={14} className={lista.carregando ? "gira" : ""} /></button>
        </div>
        {lista.erro && <div className="aviso erro">{lista.erro}</div>}
        {!lista.dados?.conversas.length && <p className="vazio"><MessageCircle size={16} /> Nenhuma conversa ainda.</p>}
        <ul className="bot-lista">
          {lista.dados?.conversas.map((x) => (
            <li key={x.id}>
              <button className={x.id === aberta ? "ativo" : ""} onClick={() => { setAberta(x.id); setErro(null); }}>
                <div className="bot-topo-item">
                  <strong>{x.nome}</strong>
                  {x.naoLidas > 0 && <span className="bot-bolinha">{x.naoLidas}</span>}
                </div>
                <small>{ETAPA[x.etapa] ?? x.etapa}{x.corrida ? ` · corrida ${x.corrida.os}` : ""} · {hora(x.atualizadaEm)}</small>
                {x.ultima && <small>{x.ultima.texto.replaceAll("*", "")}</small>}
              </button>
            </li>
          ))}
        </ul>
      </Cartao>

      <Cartao titulo={c ? `${c.nome} · ${c.id}` : "Histórico"}>
        {!c && <p className="vazio">Escolha uma conversa.</p>}
        {c && (
          <>
            <div className="bot-linha" style={{ marginBottom: 8 }}>
              <span className={`selo ${c.etapa === "suporte" ? "alerta" : c.corrida ? "info" : ""}`}>{ETAPA[c.etapa] ?? c.etapa}</span>
              {c.corrida && <span className="selo info">OS {c.corrida.os}: {c.corrida.status}</span>}
              {c.historico.length > 0 && <span className="selo">{c.historico.length} corrida(s) antes</span>}
              {c.etapa === "suporte" && <button className="botao direita" onClick={encerrar}><Undo2 size={14} /> Devolver ao bot</button>}
            </div>
            <div className="bot-chat">
              {c.mensagens.map((m, i) => <Bolha key={i} m={m} />)}
              <div ref={fim} />
            </div>
            {erro && <div className="aviso erro" style={{ marginTop: 8 }}>{erro}</div>}
            <form className="bot-resposta" onSubmit={(e) => { e.preventDefault(); responder(); }}>
              <input placeholder="Responder como operador" value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={2000} />
              <button className="botao primario" disabled={!texto.trim()}><Send size={14} /> Enviar</button>
            </form>
          </>
        )}
      </Cartao>
    </div>
  );
}
