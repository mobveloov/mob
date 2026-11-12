// Página pública /apps/baixar/: baixar o app do passageiro e o do motorista (APK de Android) da empresa.
// A empresa vem de ?empresa=<id> ou do domínio. Os APKs ficam em DADOS_DIR/empresas/<id>/apps/apks/ (fora do Git).

import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { Car, Download, ShieldCheck, Smartphone, UserRound } from "lucide-react";
import "../comum/apps.css";
import "./baixar.css";

interface Apk { existe: boolean; nome: string; tamanhoMb?: number; versao?: string; em?: string }
interface Info { empresa: string; nome: string; cores: { primaria: string; secundaria: string; fundo: string; texto: string }; logo: string | null; passageiro: Apk; motorista: Apk }

const contraste = (hex: string) => { const n = parseInt(hex.replace("#", ""), 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 150 ? "#111" : "#fff"; };

async function empresaDaPagina(): Promise<string> {
  const q = new URLSearchParams(location.search).get("empresa");
  if (q && /^[a-z0-9][a-z0-9-]{1,40}$/.test(q)) return q;
  const r = await fetch("/api/publico/marca");
  const j = (await r.json().catch(() => ({}))) as { empresaId?: string | null };
  if (!j.empresaId) throw new Error("Não achei a empresa. Use o link completo, com ?empresa=<nome>.");
  return j.empresaId;
}

function Cartao({ info, app, icone }: { info: Info; app: "passageiro" | "motorista"; icone: React.ReactNode }) {
  const a = info[app];
  return (
    <section className="baixar-cartao">
      <span className="baixar-icone">{icone}</span>
      <h2>{a.nome}</h2>
      <p className="dica">{app === "passageiro" ? "Peça corridas, acompanhe o motorista e converse com ele." : "Receba chamadas, ganhe por corrida e acompanhe seus ganhos."}</p>
      {a.existe ? (
        <>
          <a className="botao baixar-botao" href={`/api/apps/${info.empresa}/apks/${app}`} download><Download size={20} /> BAIXAR PARA ANDROID</a>
          <small className="dica">{a.versao ? `Versão ${a.versao} · ` : ""}{a.tamanhoMb ? `${a.tamanhoMb.toFixed(1).replace(".", ",")} MB` : ""}{a.em ? ` · ${new Date(a.em).toLocaleDateString("pt-BR")}` : ""}</small>
        </>
      ) : <p className="aviso aviso-info">Este app ainda não foi publicado. Fale com a central.</p>}
    </section>
  );
}

function Pagina() {
  const [info, setInfo] = useState<Info | null>(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    void (async () => {
      try {
        const emp = await empresaDaPagina();
        const r = await fetch(`/api/apps/${emp}/apks`);
        if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { erro?: string }).erro ?? "Não deu para carregar.");
        const i = (await r.json()) as Info;
        setInfo(i);
        const s = document.documentElement.style;
        s.setProperty("--cor", i.cores.primaria); s.setProperty("--cor-texto", contraste(i.cores.primaria)); s.setProperty("--fundo", i.cores.fundo); s.setProperty("--texto", i.cores.texto);
        document.title = `Baixar os apps — ${i.nome}`;
      } catch (e) { setErro(e instanceof Error ? e.message : "Erro."); }
    })();
  }, []);
  if (erro) return <div className="baixar"><div className="aviso aviso-erro">{erro}</div></div>;
  if (!info) return <div className="baixar"><div className="girando" /></div>;
  return (
    <div className="baixar">
      <header>{info.logo ? <img src={info.logo} alt={info.nome} /> : <h1>{info.nome}</h1>}<p className="dica">Baixe o aplicativo no seu celular Android.</p></header>
      <Cartao info={info} app="passageiro" icone={<UserRound size={30} />} />
      <Cartao info={info} app="motorista" icone={<Car size={30} />} />
      <section className="baixar-passos">
        <h3><Smartphone size={18} /> Como instalar</h3>
        <ol>
          <li>Toque em <b>Baixar para Android</b> e abra o arquivo quando terminar.</li>
          <li>Se o celular pedir, permita <b>instalar apps desta fonte</b> (é só desta vez).</li>
          <li>Abra o app e entre com o seu celular ou e-mail.</li>
        </ol>
        <p className="dica"><ShieldCheck size={14} /> O app é da própria empresa. Baixe só por este endereço.</p>
      </section>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("raiz")!).render(<React.StrictMode><Pagina /></React.StrictMode>);
