// Personalização dos apps: "Imagem de abertura" (tela que aparece ao abrir o app) e "Recursos Premium" daquele app.
// A imagem é enviada crua (PNG, JPG ou WEBP, até 8 MB) e o servidor guarda em WebP; "Voltar ao padrão" apaga o arquivo da empresa.

import { useEffect, useState, type MutableRefObject } from "react";
import { Image as ImagemIcone, Sparkles, Trash2, Upload, Volume2 } from "lucide-react";
import { ABA_PREMIUM_MOTORISTA, ABA_PREMIUM_PASSAGEIRO } from "../../../comum/bandeira-form.ts";
import { Aviso, Interruptor, pedirConfig, useAdmin } from "../demais/comum";
import { BandeiraAbas, type ComandosAba } from "./BandeiraAbas";
import type { SecaoMenu } from "./PersonalizacaoPecas";

const MAX = 8 * 1024 * 1024;
type Abertura = { url: string; versao: string } | null;

export const MENU_ABERTURA: SecaoMenu = {
  titulo: "Abertura e premium",
  itens: [{ id: "imagem-de-abertura", rotulo: "Imagem de abertura", icone: <ImagemIcone size={16} /> }, { id: "voz-dos-avisos", rotulo: "Voz dos avisos", icone: <Volume2 size={16} /> }, { id: "recursos-premium", rotulo: "Recursos Premium", icone: <Sparkles size={16} /> }],
};

export type VozApp = { ligada: boolean; motor: "auto" | "gemini" | "edge"; genero: "feminina" | "masculina"; velocidade: number };

/** Voz dos avisos do app (gerada no servidor). Os valores moram na personalização e gravam no mesmo "Salvar alterações". */
function SecaoVoz({ app, voz, aoMudar }: { app: "passageiro" | "motorista"; voz: VozApp; aoMudar: (v: VozApp) => void }) {
  const admin = useAdmin();
  const [msg, setMsg] = useState<{ erro?: string; ok?: string } | null>(null);
  const [gerando, setGerando] = useState(false);
  const mudar = (parte: Partial<VozApp>) => aoMudar({ ...voz, ...parte });
  const gerar = async () => {
    setGerando(true); setMsg(null);
    try {
      const r = await pedirConfig("/voz/pre-gerar", "POST", { app, aguardar: true });
      setMsg(r.falhas ? { erro: `${r.geradas + r.jaNoCache} de ${r.total} frases prontas; ${r.falhas} falharam (sem chave do Gemini ou sem rede para a voz Edge).` } : { ok: `${r.total} frases prontas no servidor.` });
    } catch (e) { setMsg({ erro: (e as Error).message }); } finally { setGerando(false); }
  };
  return (
    <section className="dm-cartao" id="voz-dos-avisos">
      <h2>Voz dos avisos</h2>
      <p className="sub">Avisos falados do app do {app} (por exemplo, "Seu motorista está a caminho"). A voz é gerada no servidor, bem mais natural que a do aparelho. Vale depois de salvar. Se ficar desligada ou indisponível, o app só toca o aviso.</p>
      <Aviso erro={msg?.erro} ok={msg?.ok} />
      <Interruptor valor={voz.ligada} onChange={(v) => mudar({ ligada: v })} rotulo="Voz ligada" desabilitado={!admin} />
      <div className="dm-linha" style={{ flexWrap: "wrap", gap: 16, opacity: voz.ligada ? 1 : 0.5 }}>
        <label>Motor<br />
          <select value={voz.motor} disabled={!admin || !voz.ligada} onChange={(e) => mudar({ motor: e.target.value as VozApp["motor"] })}>
            <option value="auto">Automático (Gemini, depois Edge)</option><option value="gemini">Gemini (chave nas Integrações)</option><option value="edge">Edge (sem chave)</option>
          </select></label>
        <label>Voz<br />
          <select value={voz.genero} disabled={!admin || !voz.ligada} onChange={(e) => mudar({ genero: e.target.value as VozApp["genero"] })}>
            <option value="feminina">Feminina</option><option value="masculina">Masculina</option>
          </select></label>
        <label>Velocidade: {voz.velocidade.toFixed(2).replace(".", ",")}x<br />
          <input type="range" min={0.7} max={1.5} step={0.05} value={voz.velocidade} disabled={!admin || !voz.ligada} onChange={(e) => mudar({ velocidade: Number(e.target.value) })} /></label>
      </div>
      {admin && <div className="dm-linha"><button type="button" className="botao" disabled={gerando} onClick={() => void gerar()}><Volume2 size={14} /> {gerando ? "Gerando…" : "Gerar frases fixas agora"}</button></div>}
    </section>
  );
}

/** `premium`: a tela de fora lê dali os comandos para gravar/desfazer os Recursos Premium junto com o seu "Salvar alterações". */
export function SecaoAberturaPremium({ app, premium, voz, aoMudarVoz }: { app: "passageiro" | "motorista"; premium: MutableRefObject<ComandosAba | null>; voz?: VozApp; aoMudarVoz?: (v: VozApp) => void }) {
  const admin = useAdmin();
  const [ab, setAb] = useState<Abertura | undefined>(undefined);
  const [msg, setMsg] = useState<{ erro?: string; ok?: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  useEffect(() => { pedirConfig(`/abertura/${app}`).then((r) => setAb(r.abertura ?? null)).catch((e) => setMsg({ erro: (e as Error).message })); }, [app]);

  const enviar = async (f: File | undefined) => {
    if (!f) return;
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { setMsg({ erro: "Envie uma imagem PNG, JPG ou WEBP." }); return; }
    if (f.size > MAX) { setMsg({ erro: "Imagem grande demais (máximo 8 MB)." }); return; }
    setEnviando(true); setMsg(null);
    try { const r = await pedirConfig(`/abertura/${app}`, "POST", f); setAb(r.abertura); setMsg({ ok: "Imagem de abertura salva." }); }
    catch (e) { setMsg({ erro: (e as Error).message }); } finally { setEnviando(false); }
  };
  const padrao = async () => {
    try { const r = await pedirConfig(`/abertura/${app}`, "DELETE"); setAb(r.abertura); setMsg({ ok: "Voltou ao padrão." }); } catch (e) { setMsg({ erro: (e as Error).message }); }
  };

  return (
    <>
      <section className="dm-cartao" id="imagem-de-abertura">
        <h2>Imagem de abertura</h2>
        <p className="sub">Tela que aparece assim que o app do {app} abre. Formato PNG, JPG ou WEBP, até 8 MB. Salva em WebP. Em pé (retrato) fica melhor.</p>
        <Aviso erro={msg?.erro} ok={msg?.ok} />
        {ab ? <img src={ab.url} alt={`Imagem de abertura do app do ${app}`} style={{ maxHeight: 360, maxWidth: "100%", borderRadius: 12, display: "block", margin: "8px 0" }} /> : <p className="sub">{ab === undefined ? "Carregando…" : "Sem imagem enviada: o app usa a abertura padrão."}</p>}
        {admin && (
          <div className="dm-linha">
            <label className="botao"><Upload size={14} /> {ab ? "Trocar imagem" : "Enviar imagem"}<input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={enviando} onChange={(e) => { void enviar(e.target.files?.[0]); e.target.value = ""; }} /></label>
            {ab && <button type="button" className="botao" onClick={() => void padrao()}><Trash2 size={14} /> Voltar ao padrão</button>}
          </div>
        )}
      </section>
      {voz && aoMudarVoz && <SecaoVoz app={app} voz={voz} aoMudar={aoMudarVoz} />}
      <div id="recursos-premium"><h2 style={{ margin: "16px 0 4px" }}>Recursos Premium</h2>
        <BandeiraAbas aba={app === "motorista" ? ABA_PREMIUM_MOTORISTA : ABA_PREMIUM_PASSAGEIRO} comandos={premium} />
      </div>
    </>
  );
}
