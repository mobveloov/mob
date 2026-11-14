// Bloqueio do totem e tela sempre acesa (portados do sistema de referência: TotemLockScreen e useWakeLock).
// Fechar ou recarregar a página abre "Totem bloqueado": só fecha quem digitar a senha do local.

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Lock, X } from "lucide-react";

/** Pede a senha para fechar o aplicativo. `verificar` confere a senha do local no servidor. */
export function TotemBloqueio({ verificar }: { verificar: (senha: string) => Promise<boolean> }) {
  const [bloqueado, setBloqueado] = useState(false);
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [indo, setIndo] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  const estado = useRef(false);
  estado.current = bloqueado;

  useEffect(() => {
    const aviso = (e: BeforeUnloadEvent) => {
      if (estado.current) return; // já pediu a senha: deixa sair
      e.preventDefault();
      e.returnValue = "";
      setBloqueado(true);
    };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, []);
  useEffect(() => { if (bloqueado) setTimeout(() => campo.current?.focus(), 100); }, [bloqueado]);

  if (!bloqueado) return null;
  const falhar = (m: string) => { setErro(m); setSenha(""); campo.current?.focus(); };
  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault();
    setIndo(true);
    let ok = false;
    try { ok = await verificar(senha.trim()); } catch { setIndo(false); return falhar("Não foi possível conferir a senha agora. Tente de novo em instantes."); }
    setIndo(false);
    if (!ok) return falhar("Senha incorreta");
    setBloqueado(false); setSenha(""); setErro(null);
    window.close();
  };
  return (
    <div className="tt-bloqueio" role="dialog" aria-label="Totem bloqueado">
      <div>
        <Lock size={44} style={{ margin: "0 auto" }} />
        <div><h2>Totem bloqueado</h2><p>Digite a senha para fechar o aplicativo</p></div>
        <form onSubmit={confirmar} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <input ref={campo} type="password" value={senha} placeholder="Senha" autoComplete="off" onChange={(e) => { setSenha(e.target.value); setErro(null); }} />
          {erro && <div className="tt-erro" role="alert"><AlertCircle size={16} /> {erro}</div>}
          <button className="tt-botao primario" disabled={!senha || indo}>{indo ? "Conferindo..." : "Confirmar e fechar"}</button>
        </form>
        <button type="button" className="tt-botao" onClick={() => { setBloqueado(false); setSenha(""); setErro(null); }}><X size={20} /> Cancelar e continuar usando</button>
      </div>
    </div>
  );
}

/** Mantém a tela acesa enquanto o totem está aberto (quando o aparelho deixa). */
export function useTelaAcesa() {
  useEffect(() => {
    let trava: { release: () => Promise<void> } | null = null;
    let vivo = true;
    const pedir = async () => {
      try {
        const w = (navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
        if (w && vivo && document.visibilityState === "visible") trava = await w.request("screen");
      } catch { /* aparelho sem suporte */ }
    };
    void pedir();
    const volta = () => { if (document.visibilityState === "visible") void pedir(); };
    document.addEventListener("visibilitychange", volta);
    return () => { vivo = false; document.removeEventListener("visibilitychange", volta); void trava?.release().catch(() => undefined); };
  }, []);
}
