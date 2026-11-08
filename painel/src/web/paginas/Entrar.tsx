import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { Marca } from "../../comum/marca.ts";
import { api } from "../api";

/** Entrar (ou primeiro acesso, quando ainda não existe nenhum usuário). Usa a marca do domínio. */
export default function Entrar({ marca, logo, primeiroAcesso, onEntrou }: { marca: Marca; logo?: string; primeiroAcesso: boolean; onEntrou: () => void }) {
  const [d, setD] = useState({ empresa: "", nome: "", email: "", senha: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const campo = (k: keyof typeof d, rotulo: string, tipo = "text", auto?: string) => (
    <label>{rotulo}<input type={tipo} value={d[k]} autoComplete={auto} required onChange={(e) => setD({ ...d, [k]: e.target.value })} /></label>
  );
  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true); setErro(null);
    try {
      if (primeiroAcesso) await api.configurar(d); else await api.entrar(d.email, d.senha);
      onEntrou();
    } catch (x) { setErro(x instanceof Error ? x.message : String(x)); } finally { setEnviando(false); }
  }
  return (
    <div className="entrar">
      <form className="cartao" onSubmit={enviar}>
        {logo && <img className="logo-entrar" src={logo} alt={marca.nomeExibido} />}
        <h1>{marca.produto}</h1>
        <p className="sub">{primeiroAcesso ? "Primeiro acesso: crie a sua empresa e o seu usuário." : marca.textos.saudacao}</p>
        {primeiroAcesso && campo("empresa", "Nome da empresa")}
        {primeiroAcesso && campo("nome", "Seu nome", "text", "name")}
        {campo("email", "E-mail", "email", "username")}
        {campo("senha", primeiroAcesso ? "Senha (mínimo 8 caracteres)" : "Senha", "password", primeiroAcesso ? "new-password" : "current-password")}
        {erro && <div className="aviso erro">{erro}</div>}
        <button className="botao primario" disabled={enviando}>{enviando && <Loader2 size={16} className="gira" />} {primeiroAcesso ? "Criar e entrar" : "Entrar"}</button>
        {(marca.textos.suporteEmail || marca.textos.suporteTelefone) && <p className="sub">Ajuda: {[marca.textos.suporteEmail, marca.textos.suporteTelefone].filter(Boolean).join(" · ")}</p>}
      </form>
    </div>
  );
}
