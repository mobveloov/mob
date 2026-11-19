// Bot & Totem › App do Totem: baixar o app Android do totem (versão ativa publicada pelo dono da plataforma) para deixar
// o tablet ou celular do totem em modo quiosque. O dono da plataforma também publica e liga/desliga as versões aqui.

import { useState } from "react";
import { AlertCircle, Download, Loader2, Smartphone } from "lucide-react";
import { podeCargo } from "../../comum/cargos.ts";
import { useSessao } from "../App";
import { Cartao, Titulo, useCarregar } from "../componentes/ui";
import { apiCentral } from "./api";

const tamanho = (b: number | null) => (b ? `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : null);

export default function AppTotem() {
  const { sessao } = useSessao();
  const dono = podeCargo(sessao.usuario.papel, "plataforma");
  const { dados, erro, recarregar } = useCarregar(() => apiCentral.apk(), []);
  const apk = dados?.versao ?? null;
  const size = tamanho(apk?.tamanho ?? null);

  return (
    <>
      <Titulo titulo="App do Totem" sub="Aplicativo Android para deixar o tablet/celular do totem em modo quiosque" />
      {!dados && !erro ? (
        <div className="vazio"><Loader2 className="gira" /></div>
      ) : !apk ? (
        <Cartao>
          <p><AlertCircle size={16} /> {erro ? "Não foi possível consultar o app agora. Tente de novo em alguns minutos." : "Nenhuma versão do app publicada ainda. Fale com a plataforma."}</p>
        </Cartao>
      ) : (
        <Cartao>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div>
              <h3 style={{ margin: 0 }}>Versão {apk.nome}</h3>
              <small>Publicada em {new Date(apk.criadaEm).toLocaleDateString("pt-BR")}{size ? ` · ${size}` : ""}</small>
            </div>
            <a className="botao primario" href={apk.url} target="_blank" rel="noreferrer noopener" download><Download size={14} /> Baixar app (.apk)</a>
          </div>
          {apk.notas && <p style={{ whiteSpace: "pre-line" }}>{apk.notas}</p>}
          <h4>Como instalar no tablet do totem</h4>
          <ol>
            <li>Abra este painel no tablet e toque em "Baixar app".</li>
            <li>Permita instalar apps desta origem quando o Android pedir.</li>
            <li>Abra o app e informe o link do totem (Bot &amp; Totem › Totens &amp; Preços).</li>
            <li>A senha de fechamento do totem é a cadastrada no local.</li>
          </ol>
        </Cartao>
      )}
      {dono && <Versoes aoMudar={recarregar} />}
    </>
  );
}

/** Só o dono da plataforma: publicar o endereço de uma versão nova e ligar ou desligar as que existem. */
function Versoes({ aoMudar }: { aoMudar: () => void }) {
  const lista = useCarregar(() => apiCentral.apkVersoes(), []);
  const [f, setF] = useState({ nome: "", codigo: "", url: "", tamanho: "", notas: "" });
  const [msg, setMsg] = useState<{ texto: string; erro?: boolean } | null>(null);
  const publicar = async () => {
    try {
      await apiCentral.publicarApk({ nome: f.nome, codigo: Number(f.codigo), url: f.url, tamanho: f.tamanho ? Number(f.tamanho) * 1024 * 1024 : undefined, notas: f.notas });
      setF({ nome: "", codigo: "", url: "", tamanho: "", notas: "" }); setMsg({ texto: "Versão publicada." }); lista.recarregar(); aoMudar();
    } catch (e) { setMsg({ texto: e instanceof Error ? e.message : String(e), erro: true }); }
  };
  return (
    <Cartao titulo="Versões do app (plataforma)">
      <ul className="lista">{lista.dados?.versoes.map((v) => (
        <li key={v.id}>
          <strong>{v.nome}</strong> <small>(código {v.codigo})</small> <span className={v.ativa ? "selo ok" : "selo"}>{v.ativa ? "Ativa" : "Desligada"}</span><br />
          <small>{v.url}</small>
          <div className="acoes"><button className="botao" onClick={async () => { await apiCentral.ligarApk(v.id, !v.ativa); lista.recarregar(); aoMudar(); }}>{v.ativa ? "Desligar" : "Ligar"}</button></div>
        </li>
      ))}</ul>
      <form className="form" onSubmit={(e) => { e.preventDefault(); void publicar(); }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
          <label>Versão (ex.: 1.2.0)<input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} required maxLength={30} /></label>
          <label>Código (número, cresce a cada versão)<input type="number" min="1" value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value })} required /></label>
          <label>Tamanho em MB (opcional)<input type="number" min="0" step="0.1" value={f.tamanho} onChange={(e) => setF({ ...f, tamanho: e.target.value })} /></label>
        </div>
        <label>Endereço do arquivo .apk (https)<input type="url" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} required placeholder="https://..." /></label>
        <label>O que mudou (opcional)<textarea rows={3} value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} maxLength={1000} /></label>
        {msg && <div className={msg.erro ? "aviso erro" : "aviso ok"}>{msg.texto}</div>}
        <button className="botao primario"><Smartphone size={14} /> Publicar versão</button>
      </form>
    </Cartao>
  );
}
