import { useState, type FormEvent } from "react";
import { Eye, EyeOff, Lock, Mail, Phone, Save, ShieldCheck, User } from "lucide-react";
import { api } from "../api";
import { useSessao } from "../App";
import { Titulo } from "../componentes/ui";

const CARGO: Record<string, string> = { plataforma: "Plataforma", admin: "Gestor", operador: "Operador" };

/** Campo de senha com o olho para mostrar/ocultar. */
function CampoSenha({ rotulo, valor, onChange, auto }: { rotulo: string; valor: string; onChange: (v: string) => void; auto: string }) {
  const [ver, setVer] = useState(false);
  return (
    <div>
      <label className="rotulo">{rotulo}</label>
      <div className="campo-conta">
        <input type={ver ? "text" : "password"} value={valor} onChange={(e) => onChange(e.target.value)} autoComplete={auto} required />
        <button type="button" className="icone" style={{ position: "absolute", right: 4, top: 4, width: 32, height: 32, border: 0 }} onClick={() => setVer(!ver)} aria-label={ver ? "Ocultar senha" : "Mostrar senha"}>
          {ver ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}

/** Alterar Senha: perfil do usuário à esquerda e troca de senha à direita, como na referência. */
export default function AlterarSenha() {
  const { sessao, recarregar } = useSessao();
  const u = sessao.usuario;
  const [perfil, setPerfil] = useState({ nome: u.nome, email: u.email, telefone: u.telefone ?? "" });
  const [msgPerfil, setMsgPerfil] = useState<{ ok: boolean; texto: string } | null>(null);
  const [senha, setSenha] = useState({ atual: "", nova: "", confirmar: "" });
  const [msgSenha, setMsgSenha] = useState<{ ok: boolean; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  const salvarPerfil = async (e: FormEvent) => {
    e.preventDefault();
    setSalvando(true); setMsgPerfil(null);
    try { await api.salvarConta(perfil); setMsgPerfil({ ok: true, texto: "Dados atualizados." }); recarregar(); }
    catch (er) { setMsgPerfil({ ok: false, texto: (er as Error).message }); }
    setSalvando(false);
  };
  const trocar = async (e: FormEvent) => {
    e.preventDefault();
    setMsgSenha(null);
    if (senha.nova.length < 8) return setMsgSenha({ ok: false, texto: "A nova senha precisa de pelo menos 8 caracteres." });
    if (senha.nova !== senha.confirmar) return setMsgSenha({ ok: false, texto: "A confirmação não é igual à nova senha." });
    setSalvando(true);
    try { await api.trocarSenha(senha); setSenha({ atual: "", nova: "", confirmar: "" }); setMsgSenha({ ok: true, texto: "Senha alterada com sucesso." }); }
    catch (er) { setMsgSenha({ ok: false, texto: (er as Error).message }); }
    setSalvando(false);
  };

  return (
    <>
      <Titulo titulo="Alterar Senha" sub="Gerencie seu perfil e a segurança do seu acesso" />
      <div className="conta">
        <div className="conta-perfil">
          <div className="conta-avatar">{(u.nome || u.email).trim().charAt(0).toUpperCase()}</div>
          <h2>{u.nome}</h2>
          <span className="conta-cargo">{CARGO[u.papel] ?? u.papel}</span>
          <form onSubmit={salvarPerfil}>
            <div><label className="rotulo">Nome Completo</label><div className="campo-conta"><input value={perfil.nome} onChange={(e) => setPerfil({ ...perfil, nome: e.target.value })} required /><User size={16} /></div></div>
            <div><label className="rotulo">E-mail</label><div className="campo-conta"><input type="email" value={perfil.email} onChange={(e) => setPerfil({ ...perfil, email: e.target.value })} required /><Mail size={16} /></div></div>
            <div><label className="rotulo">Telefone</label><div className="campo-conta"><input value={perfil.telefone} onChange={(e) => setPerfil({ ...perfil, telefone: e.target.value })} placeholder="(00) 00000-0000" /><Phone size={16} /></div></div>
            {msgPerfil && <div className={`aviso ${msgPerfil.ok ? "ok" : "erro"}`} role="status">{msgPerfil.texto}</div>}
            <button type="submit" className="botao primario botao-largo" disabled={salvando}><Save size={16} /> Atualizar Dados</button>
          </form>
        </div>
        <div className="conta-seguranca">
          <h3><ShieldCheck size={22} /> Segurança</h3>
          <p>Altere sua senha de acesso periodicamente.</p>
          <form onSubmit={trocar}>
            <div className="caixa-senha">
              <CampoSenha rotulo="Senha Atual" valor={senha.atual} onChange={(v) => setSenha({ ...senha, atual: v })} auto="current-password" />
              <small>Digite sua senha atual para confirmar.</small>
            </div>
            <CampoSenha rotulo="Nova Senha" valor={senha.nova} onChange={(v) => setSenha({ ...senha, nova: v })} auto="new-password" />
            <CampoSenha rotulo="Confirmar Nova Senha" valor={senha.confirmar} onChange={(v) => setSenha({ ...senha, confirmar: v })} auto="new-password" />
            {msgSenha && <div className={`aviso ${msgSenha.ok ? "" : "erro"}`} role="status">{msgSenha.texto}</div>}
            <button type="submit" className="botao-escuro" disabled={salvando}><Lock size={16} /> Alterar Senha</button>
          </form>
        </div>
      </div>
    </>
  );
}
