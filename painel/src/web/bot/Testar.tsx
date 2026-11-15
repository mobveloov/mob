import { useEffect, useRef, useState } from "react";
import { Mic, MapPin, RefreshCw, Send } from "lucide-react";
import { Cartao, useCarregar } from "../componentes/ui";
import { apiBot } from "./api";
import { Bolha } from "./Conversas";

const TELEFONE = "5500000000000";

/** Conversa de teste com o bot (modo simulado): o operador escreve como se fosse o passageiro. */
export function BotTestar() {
  const [texto, setTexto] = useState("");
  const [falado, setFalado] = useState("");
  const [conexao, setConexao] = useState("principal");
  const [erro, setErro] = useState<string | null>(null);
  const cons = useCarregar(() => apiBot.conexoes(), []);
  const simuladas = (cons.dados?.conexoes ?? []).filter((x) => x.provedor === "simulado" && x.ativa);
  const conv = useCarregar(() => apiBot.conversa(TELEFONE).catch(() => null), []);
  const fim = useRef<HTMLDivElement>(null);
  const c = conv.dados?.conversa;
  useEffect(() => { fim.current?.scrollIntoView({ block: "end" }); }, [c?.mensagens.length]);

  const mandar = async (d: { texto?: string; transcricao?: string; local?: { lat: number; lng: number; texto: string } }) => {
    try { await apiBot.simular({ telefone: TELEFONE, nome: "Passageiro de teste", conexao, ...d }); setTexto(""); setFalado(""); setErro(null); conv.recarregar(); }
    catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
  };
  const status = async () => {
    try { const r = await apiBot.simularStatus(TELEFONE); setErro(r.texto ? null : "Sem mudança de status."); conv.recarregar(); }
    catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <Cartao titulo="Testar conversa (modo simulado)">
      <p className="sub">Escreva como passageiro. Nada sai pelo WhatsApp. A corrida nasce de verdade em Corridas (canal WhatsApp): mude o status por lá e clique em “Consultar status”.</p>
      <div className="bot-chat" style={{ minHeight: 200 }}>
        {c?.mensagens.map((m, i) => <Bolha key={i} m={m} />)}
        {!c && <p className="vazio">Mande “oi” para começar.</p>}
        <div ref={fim} />
      </div>
      {erro && <div className="aviso" style={{ marginTop: 8 }}>{erro}</div>}
      <form className="bot-resposta" onSubmit={(e) => { e.preventDefault(); if (texto.trim()) mandar({ texto }); }}>
        <input placeholder="Mensagem do passageiro" value={texto} onChange={(e) => setTexto(e.target.value)} />
        <button className="botao primario" disabled={!texto.trim()}><Send size={14} /> Enviar</button>
      </form>
      <form className="bot-resposta" onSubmit={(e) => { e.preventDefault(); if (falado.trim()) mandar({ transcricao: falado }); }}>
        <input placeholder="Áudio do passageiro (digite o que ele falou)" value={falado} onChange={(e) => setFalado(e.target.value)} />
        <button className="botao" disabled={!falado.trim()}><Mic size={14} /> Enviar áudio</button>
      </form>
      {simuladas.length > 1 && (
        <label className="bot-linha" style={{ marginTop: 8 }}>Número por onde o passageiro escreve
          <select value={conexao} onChange={(e) => setConexao(e.target.value)}>{simuladas.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select>
        </label>
      )}
      <div className="bot-linha" style={{ marginTop: 8 }}>
        <button className="botao" onClick={() => mandar({ local: { lat: -23.55, lng: -46.63, texto: "Praça Central, 10" } })}><MapPin size={14} /> Enviar localização</button>
        <button className="botao" onClick={status}><RefreshCw size={14} /> Consultar status</button>
      </div>
    </Cartao>
  );
}
