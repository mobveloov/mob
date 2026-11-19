// WhatsApp deste totem (modo individual): conecta o número PRÓPRIO do totem pelo QR. As corridas desse totem
// (dados do motorista, avisos e chat) saem por esse número. Sem ele conectado, o totem fica indisponível.

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, MessageCircle, QrCode, Unplug } from "lucide-react";
import { apiCentral, type ConexaoZap } from "./api";

export default function ZapTotem({ id, admin }: { id: string; admin: boolean }) {
  const [estado, setEstado] = useState<ConexaoZap | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const relogio = useRef<number | null>(null);
  const parar = () => { if (relogio.current) { window.clearInterval(relogio.current); relogio.current = null; } };
  useEffect(() => parar, []);

  const ver = async () => { try { setEstado(await apiCentral.whatsapp(id)); } catch { setEstado({ situacao: "erro" }); } };
  useEffect(() => { void ver(); }, [id]);
  const conectado = estado?.situacao === "conectado";

  const conectar = async () => {
    setOcupado(true); setErro(null);
    try {
      const r = await apiCentral.conectarWhatsapp(id);
      if (r.situacao === "conectado") { setQr(null); await ver(); return; }
      setQr(r.qr ?? null);
      parar();
      let n = 0;
      relogio.current = window.setInterval(async () => {
        n++;
        try {
          const s = await apiCentral.whatsapp(id);
          if (s.situacao === "conectado") { parar(); setQr(null); setEstado(s); }
          else if (n % 10 === 0) { const novo = await apiCentral.conectarWhatsapp(id); if (novo.qr) setQr(novo.qr); }
        } catch { /* tenta de novo no próximo ciclo */ }
        if (n > 100) { parar(); setQr(null); setErro("O QR Code expirou. Clique em Conectar de novo."); }
      }, 3000);
    } catch (e) { setErro(e instanceof Error ? e.message : "Erro ao conectar."); }
    finally { setOcupado(false); }
  };
  const desconectar = async () => {
    if (!confirm("Desconectar o WhatsApp deste totem? Ele para de pedir corridas até conectar de novo.")) return;
    setOcupado(true); setErro(null);
    try { await apiCentral.desconectarWhatsapp(id); await ver(); } catch (e) { setErro(e instanceof Error ? e.message : "Erro ao desconectar."); } finally { setOcupado(false); }
  };

  return (
    <div className="cartao" style={{ marginTop: 10, padding: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span><MessageCircle size={15} /> <b>WhatsApp deste totem</b>{" "}
          {!estado ? <Loader2 size={13} className="gira" /> : conectado
            ? <span className="selo ok"><CheckCircle2 size={12} /> conectado</span>
            : <span className="selo">{estado.situacao === "nao_configurado" ? "não configurado" : "desconectado"}</span>}
        </span>
        {admin && (conectado
          ? <button className="botao" disabled={ocupado} onClick={() => void desconectar()}>{ocupado ? <Loader2 size={13} className="gira" /> : <Unplug size={14} />} Desconectar</button>
          : <button className="botao primario" disabled={ocupado} onClick={() => void conectar()}>{ocupado ? <Loader2 size={13} className="gira" /> : <QrCode size={14} />} Conectar WhatsApp</button>)}
      </div>
      <small>Modo individual: os dados do motorista, os avisos e o chat das corridas deste totem saem por este número. Sem ele conectado, o totem fica indisponível.</small>
      {qr && (
        <div style={{ textAlign: "center", marginTop: 8 }}>
          <img src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`} alt="QR Code do WhatsApp" style={{ width: 224, height: 224, background: "#fff", padding: 8, borderRadius: 8 }} />
          <p><small>No celular do totem: WhatsApp › Aparelhos conectados › Conectar aparelho. Aguardando a leitura…</small></p>
        </div>
      )}
      {estado?.detalhe && !conectado && !qr && <small> {estado.detalhe}</small>}
      {erro && <p className="aviso erro"><AlertCircle size={13} /> {erro}</p>}
    </div>
  );
}
