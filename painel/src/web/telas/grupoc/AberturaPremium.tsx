// Personalização dos apps: "Imagem de abertura" (tela que aparece ao abrir o app) e "Recursos Premium" daquele app.
// A imagem é enviada crua (PNG, JPG ou WEBP, até 8 MB) e o servidor guarda em WebP; "Voltar ao padrão" apaga o arquivo da empresa.

import { useEffect, useState } from "react";
import { Image as ImagemIcone, Sparkles, Trash2, Upload } from "lucide-react";
import { ABA_PREMIUM_MOTORISTA, ABA_PREMIUM_PASSAGEIRO } from "../../../comum/bandeira-form.ts";
import { Aviso, pedirConfig, useAdmin } from "../demais/comum";
import { BandeiraAbas } from "./BandeiraAbas";
import type { SecaoMenu } from "./PersonalizacaoPecas";

const MAX = 8 * 1024 * 1024;
type Abertura = { url: string; versao: string } | null;

export const MENU_ABERTURA: SecaoMenu = {
  titulo: "Abertura e premium",
  itens: [{ id: "imagem-de-abertura", rotulo: "Imagem de abertura", icone: <ImagemIcone size={16} /> }, { id: "recursos-premium", rotulo: "Recursos Premium", icone: <Sparkles size={16} /> }],
};

export function SecaoAberturaPremium({ app }: { app: "passageiro" | "motorista" }) {
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
      <div id="recursos-premium"><h2 style={{ margin: "16px 0 4px" }}>Recursos Premium</h2>
        <BandeiraAbas aba={app === "motorista" ? ABA_PREMIUM_MOTORISTA : ABA_PREMIUM_PASSAGEIRO} />
      </div>
    </>
  );
}
