// Login do motorista em 2 passos: e-mail (ou celular) e depois a senha. "Esqueceu a senha?" manda um código pelo
// WhatsApp. Sem as rotas novas no servidor, entra pelo código no celular (o login antigo continua valendo).

import { useState } from "react";
import { ArrowRight, Eye, EyeOff, KeyRound, LockKeyhole, Mail, MessageSquareText, UserRound } from "lucide-react";
import { api, guardarToken } from "../comum/api";
import { ServidorTeste, mensagemDeErro, type MarcaApp } from "../comum/ui";
import { Campo, Erro, Info, semRota } from "./Pecas";
import { LogoMarca } from "./Marca";

type Fase = "login" | "senha" | "codigo" | "nova";
const ehTelefone = (s: string) => /^[\d\s()+-]+$/.test(s.trim()) && s.replace(/\D/g, "").length >= 10;

export function Entrar({ marca, aoEntrar, cadastrar }: { marca: MarcaApp; aoEntrar: () => void; cadastrar: () => void }) {
  const [fase, setFase] = useState<Fase>("login");
  const [login, setLogin] = useState("");
  const [mascarado, setMascarado] = useState("");
  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
  const [codigo, setCodigo] = useState("");
  const [ver, setVer] = useState(false);
  const [erro, setErro] = useState("");
  const [info, setInfo] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const fazer = async (f: () => Promise<void>) => {
    setErro(""); setOcupado(true);
    try { await f(); } catch (e) { setErro(mensagemDeErro(e)); } finally { setOcupado(false); }
  };
  const entrou = (t: string) => { guardarToken(t); aoEntrar(); };

  // Login antigo: código de 6 números pelo WhatsApp.
  const pedirCodigo = async () => {
    const r = await api<{ enviado: boolean; codigoTeste?: string }>("/entrar/codigo", { corpo: { papel: "motorista", telefone: login } });
    setInfo(r.enviado ? "Mandamos um código pelo WhatsApp." : "Pedimos o código. Se não chegar, fale com a central.");
    if (r.codigoTeste) setCodigo(r.codigoTeste);
    setFase("codigo");
  };
  const pedirNovaSenha = async (criar: boolean) => {
    const r = await api<{ codigoTeste?: string }>("/conta/esqueci", { corpo: { papel: "motorista", login } });
    setInfo(criar ? "Crie sua senha. Mandamos um código pelo WhatsApp." : "Mandamos um código pelo WhatsApp.");
    if (r.codigoTeste) setCodigo(r.codigoTeste);
    setSenha(""); setSenha2(""); setFase("nova");
  };

  const continuar = () => fazer(async () => {
    setInfo("");
    try {
      const r = await api<{ existe: boolean; temSenha: boolean; mascarado?: string }>("/conta/existe", { corpo: { papel: "motorista", login } });
      if (!r.existe) { setErro("Não achamos uma conta com esse dado. Toque em FAZER CADASTRO."); return; }
      setMascarado(r.mascarado || login);
      if (r.temSenha) setFase("senha");
      else if (ehTelefone(login)) await pedirCodigo();
      else await pedirNovaSenha(true);
    } catch (e) {
      if (!semRota(e)) throw e;
      if (!ehTelefone(login)) { setErro("Por enquanto, entre com o número do celular."); return; }
      setMascarado(login); await pedirCodigo();
    }
  });

  const voltar = () => { setFase("login"); setSenha(""); setCodigo(""); setErro(""); setInfo(""); };
  const olho = <button type="button" className="campo-olho" aria-label={ver ? "Esconder senha" : "Mostrar senha"} onClick={() => setVer(!ver)}>{ver ? <EyeOff size={18} /> : <Eye size={18} />}</button>;

  return (
    <div className="entrar-m claro">
      <div className="entrar-topo">
        {fase === "login" ? (
          <>
            <LogoMarca marca={marca} />
            <small>PARCEIRO</small>
            <h1>MOTORISTA</h1>
          </>
        ) : (
          <>
            <span className="entrar-cadeado"><LockKeyhole size={34} /></span>
            <h1 className="bem-vindo">{fase === "nova" ? "Nova senha" : "Bem-vindo!"}</h1>
          </>
        )}
      </div>

      <form className="entrar-cartao" onSubmit={(e) => {
        e.preventDefault();
        if (fase === "login") void continuar();
        else if (fase === "senha") void fazer(async () => { const r = await api<{ token: string }>("/conta/entrar", { corpo: { papel: "motorista", login, senha } }); entrou(r.token); });
        else if (fase === "codigo") void fazer(async () => { const r = await api<{ token: string }>("/entrar", { corpo: { papel: "motorista", telefone: login, codigo } }); entrou(r.token); });
        else void fazer(async () => {
          if (senha !== senha2) throw new Error("As senhas não são iguais.");
          const r = await api<{ token: string }>("/conta/nova-senha", { corpo: { papel: "motorista", login, codigo, senha } }); entrou(r.token);
        });
      }}>
        {fase === "login" ? (
          <>
            <h2>Acesse sua conta</h2>
            <p className="dica">Digite seu e-mail ou celular</p>
            <span className="campo-caixa"><Mail size={18} className="campo-icone" />
              <input autoComplete="username" inputMode="email" placeholder="Digite seu E-MAIL" value={login} onChange={(e) => setLogin(e.target.value)} />
            </span>
            <Erro texto={erro} />
            <button className="botao-m" disabled={ocupado || login.trim().length < 5}>CONTINUAR <ArrowRight size={18} /></button>
          </>
        ) : (
          <>
            <button type="button" className="etiqueta-login" onClick={voltar} aria-label="Trocar o e-mail"><UserRound size={16} /> {mascarado}</button>
            <Info texto={info} />
            {fase === "senha" && (
              <>
                <Campo rotulo="Sua Senha" icone={KeyRound}>
                  <input type={ver ? "text" : "password"} autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} autoFocus />{olho}
                </Campo>
                <button type="button" className="link-m direita" onClick={() => void fazer(() => pedirNovaSenha(false))}>Esqueceu a senha?</button>
              </>
            )}
            {(fase === "codigo" || fase === "nova") && (
              <Campo rotulo="Código de 6 números" icone={MessageSquareText}>
                <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))} />
              </Campo>
            )}
            {fase === "nova" && (
              <>
                <Campo rotulo="Nova senha" icone={KeyRound}><input type={ver ? "text" : "password"} autoComplete="new-password" placeholder="Mínimo 6 caracteres" value={senha} onChange={(e) => setSenha(e.target.value)} />{olho}</Campo>
                <Campo rotulo="Confirmar senha" icone={KeyRound}><input type={ver ? "text" : "password"} autoComplete="new-password" placeholder="Repita sua senha" value={senha2} onChange={(e) => setSenha2(e.target.value)} /></Campo>
              </>
            )}
            <Erro texto={erro} />
            <button className="botao-m" disabled={ocupado || (fase === "senha" ? !senha : codigo.length !== 6 || (fase === "nova" && senha.length < 6))}>
              {fase === "nova" ? "SALVAR E ENTRAR" : "ACESSAR CONTA"}
            </button>
            <button type="button" className="link-m" onClick={voltar}>Usar outra conta</button>
          </>
        )}
      </form>

      <div className="entrar-rodape">
        {fase === "login" && <><p>Ainda não dirige com a gente?</p><button type="button" className="botao-contorno" onClick={cadastrar}>FAZER CADASTRO</button></>}
        <ServidorTeste />
      </div>
    </div>
  );
}
