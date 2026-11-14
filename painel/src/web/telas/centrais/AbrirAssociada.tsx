// "Abrir uma central associada": cria uma empresa nova ligada à central principal, com o primeiro administrador (opcional).
import { useState } from "react";
import { Aviso, Campo, Modal, useSalvar } from "../demais/comum";
import { pedirCentrais } from "./comum";

export function AbrirAssociada({ aberto, onFechar, onCriada }: { aberto: boolean; onFechar: () => void; onCriada: () => void }) {
  const [f, setF] = useState({ nome: "", adminNome: "", adminEmail: "", adminSenha: "" });
  const { msg, salvando, salvar } = useSalvar();
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v });
  return (
    <Modal aberto={aberto} onFechar={onFechar} titulo="Abrir uma central associada" sub="A nova central tem dados próprios e separados. Você acompanha só a cobrança e o que ela permitir.">
      <form className="dm-form" onSubmit={async (e) => { e.preventDefault(); const r = await salvar(() => pedirCentrais("/associadas", "POST", f), "Central criada."); if (r) { setF({ nome: "", adminNome: "", adminEmail: "", adminSenha: "" }); onCriada(); onFechar(); } }}>
        <Campo rotulo="Nome da central *"><input value={f.nome} onChange={(e) => set("nome", e.target.value)} maxLength={80} required /></Campo>
        <p className="dm-dica">Administrador da central (opcional). Sem ele, a plataforma cria o acesso depois.</p>
        <Campo rotulo="Nome do administrador"><input value={f.adminNome} onChange={(e) => set("adminNome", e.target.value)} maxLength={80} /></Campo>
        <Campo rotulo="E-mail do administrador"><input type="email" value={f.adminEmail} onChange={(e) => set("adminEmail", e.target.value)} maxLength={120} /></Campo>
        <Campo rotulo="Senha inicial (mínimo de 8 caracteres)"><input type="password" autoComplete="new-password" value={f.adminSenha} onChange={(e) => set("adminSenha", e.target.value)} minLength={f.adminEmail ? 8 : 0} /></Campo>
        <Aviso erro={msg?.erro} />
        <div className="dm-rodape-modal"><button type="button" className="botao" onClick={onFechar}>Cancelar</button><button className="botao primario" disabled={salvando}>Criar central</button></div>
      </form>
    </Modal>
  );
}
