import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "../api";
import { useSessao } from "../App";
import { Cartao, Titulo, useCarregar } from "../componentes/ui";

/** Usuários da empresa. Cada usuário só vê os dados da própria empresa. */
export default function Usuarios() {
  const { sessao, recarregar: recarregarSessao } = useSessao();
  const { dados, recarregar } = useCarregar(() => api.usuarios(), []);
  const [novo, setNovo] = useState({ nome: "", email: "", senha: "", papel: "operador" });
  const [empresaNova, setEmpresaNova] = useState({ nome: "", adminNome: "", adminEmail: "", adminSenha: "" });
  const [msg, setMsg] = useState<{ texto: string; erro?: boolean } | null>(null);
  const tentar = async (f: () => Promise<unknown>, ok: string) => {
    try { await f(); setMsg({ texto: ok }); recarregar(); } catch (e) { setMsg({ texto: e instanceof Error ? e.message : String(e), erro: true }); }
  };
  const PAPEL: Record<string, string> = { plataforma: "Dono da plataforma", admin: "Administrador", operador: "Operador" };
  return (
    <>
      <Titulo titulo="Usuários" sub={`Quem acessa o painel da ${sessao.empresa.nome}.`} />
      {msg && <div className={msg.erro ? "aviso erro" : "aviso ok"}>{msg.texto}</div>}
      <div className="grade">
        <Cartao titulo="Usuários da empresa">
          <ul className="lista">{dados?.usuarios.map((u) => (
            <li key={u.id}><strong>{u.nome}</strong> <span className="selo">{PAPEL[u.papel] ?? u.papel}</span><br /><small>{u.email}</small>
              {u.id !== sessao.usuario.id && <button className="icone direita" aria-label="Remover" onClick={() => confirm(`Remover ${u.nome}?`) && tentar(() => api.apagarUsuario(u.id), "Usuário removido.")}><Trash2 size={14} /></button>}
            </li>
          ))}</ul>
        </Cartao>
        <Cartao titulo="Novo usuário">
          <form className="form" onSubmit={(e) => { e.preventDefault(); tentar(() => api.novoUsuario(novo), "Usuário criado."); }}>
            <label>Nome<input value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} required /></label>
            <label>E-mail<input type="email" value={novo.email} onChange={(e) => setNovo({ ...novo, email: e.target.value })} required /></label>
            <label>Senha inicial (mínimo 8)<input type="password" autoComplete="new-password" value={novo.senha} onChange={(e) => setNovo({ ...novo, senha: e.target.value })} required /></label>
            <label>Acesso<select value={novo.papel} onChange={(e) => setNovo({ ...novo, papel: e.target.value })}><option value="operador">Operador (consulta e relatórios)</option><option value="admin">Administrador (também marca, integrações e usuários)</option></select></label>
            <button className="botao primario"><Plus size={14} /> Criar</button>
          </form>
        </Cartao>
        {sessao.usuario.papel === "plataforma" && (
          <Cartao titulo="Nova empresa (plataforma)">
            <form className="form" onSubmit={(e) => { e.preventDefault(); tentar(async () => { await api.novaEmpresa(empresaNova); recarregarSessao(); }, "Empresa criada. Troque de empresa no topo para configurar a marca dela."); }}>
              <label>Nome da empresa<input value={empresaNova.nome} onChange={(e) => setEmpresaNova({ ...empresaNova, nome: e.target.value })} required /></label>
              <label>Nome do administrador<input value={empresaNova.adminNome} onChange={(e) => setEmpresaNova({ ...empresaNova, adminNome: e.target.value })} required /></label>
              <label>E-mail do administrador<input type="email" value={empresaNova.adminEmail} onChange={(e) => setEmpresaNova({ ...empresaNova, adminEmail: e.target.value })} required /></label>
              <label>Senha inicial (mínimo 8)<input type="password" autoComplete="new-password" value={empresaNova.adminSenha} onChange={(e) => setEmpresaNova({ ...empresaNova, adminSenha: e.target.value })} required /></label>
              <button className="botao primario"><Plus size={14} /> Criar empresa</button>
            </form>
          </Cartao>
        )}
      </div>
    </>
  );
}
