// Cadastro › Equipe (Minha Equipe): usuários do painel e seus cargos. Servidor: /api/gestao/equipe.

import { useState } from "react";
import { Plus } from "lucide-react";
import { useSessao } from "../../App";
import { useCarregar } from "../../componentes/ui";
import { Abas, Cabecalho, Campo, chamar, ComFiltros, Janela, Selo, useAviso, Vazio } from "./base";

interface Membro { id: string; nome: string; email: string; papel: "plataforma" | "admin" | "operador"; criadoEm: string }
const CARGOS: Record<string, { nome: string; sigla: string; descricao: string; pode: string[] }> = {
  plataforma: { nome: "Dono da plataforma", sigla: "PLATAFORMA", descricao: "Acesso total a todas as empresas.", pode: ["Tudo"] },
  admin: { nome: "Administrador", sigla: "ADM", descricao: "Acesso total à empresa: marca, integrações, equipe, cadastros e financeiro.", pode: ["Cadastros", "Financeiro", "Marca e integrações", "Equipe"] },
  operador: { nome: "Operador", sigla: "OPERADOR", descricao: "Despacha e acompanha corridas, consulta cadastros e relatórios.", pode: ["Despacho", "Acompanhamento", "Consultas e relatórios"] },
};

export default function Equipe() {
  const { sessao } = useSessao();
  const l = useCarregar(() => chamar<{ equipe: Membro[] }>("GET", "/equipe"), []);
  const [aba, setAba] = useState<"membros" | "cargos">("membros");
  const [busca, setBusca] = useState("");
  const [cargo, setCargo] = useState("");
  const [editando, setEditando] = useState<Membro | "novo" | null>(null);
  const { aviso, tentar } = useAviso();
  const admin = sessao.usuario.papel === "admin" || sessao.usuario.papel === "plataforma";
  const lista = (l.dados?.equipe ?? []).filter((m) => (!cargo || m.papel === cargo) && (!busca || `${m.nome} ${m.email}`.toLowerCase().includes(busca.toLowerCase())));

  return (
    <div className="cg-pagina-solta">
      {aviso}
      <Cabecalho titulo="Minha Equipe" sub="Gestão de acessos">
        <button className="cg-botao" onClick={() => setAba("cargos")}>Cargos</button>
        {admin && <button className="cg-botao primario" onClick={() => setEditando("novo")}><Plus size={16} /> Novo Membro</button>}
      </Cabecalho>
      <ComFiltros filtros={
        <form onSubmit={(e) => e.preventDefault()}>
          <Campo rotulo="Buscar"><input value={busca} placeholder="Nome ou e-mail" onChange={(e) => setBusca(e.target.value)} /></Campo>
          <Campo rotulo="Cargo"><select value={cargo} onChange={(e) => setCargo(e.target.value)}><option value="">Todos</option><option value="admin">Administrador</option><option value="operador">Operador</option></select></Campo>
        </form>
      }>
        <Abas itens={[{ id: "membros" as const, rotulo: "Membros" }, { id: "cargos" as const, rotulo: "Cargos" }]} valor={aba} onChange={setAba} />
        {aba === "membros" ? (lista.length ? (
          <div className="cg-cartoes">{lista.map((m) => (
            <div className="cg-cartao" key={m.id}>
              <div className="cg-pessoa"><span className="cg-avatar">{m.nome.slice(0, 1).toUpperCase()}</span><div><strong>{m.nome}</strong><div><Selo tom={m.papel === "operador" ? "info" : "ok"}>{CARGOS[m.papel]?.sigla}</Selo></div></div></div>
              <span className="cg-mono">{m.email}</span>
              {admin && <div className="cg-acoes">
                <button className="cg-botao" onClick={() => setEditando(m)}>Editar Perfil</button>
                {m.id !== sessao.usuario.id && <button className="cg-botao perigo" onClick={() => confirm(`Remover ${m.nome}?`) && void tentar(async () => { await chamar("DELETE", `/equipe/${m.id}`); l.recarregar(); }, "Membro removido.")}>Remover</button>}
              </div>}
            </div>))}
          </div>
        ) : <div className="cg-tabela-caixa"><Vazio titulo="Nenhum membro encontrado." /></div>) : (
          <div className="cg-cartoes">{["admin", "operador"].map((k) => (
            <div className="cg-cartao" key={k}><h4>{CARGOS[k].nome}</h4><Selo tom="neutro">{CARGOS[k].sigla}</Selo><p>{CARGOS[k].descricao}</p><span className="cg-mono">{CARGOS[k].pode.join(" · ")}</span><Selo tom="info">GLOBAL (Sistema)</Selo></div>))}
          </div>
        )}
      </ComFiltros>
      {editando && <FormMembro m={editando === "novo" ? null : editando} onFechar={() => setEditando(null)} onSalvo={() => l.recarregar()} />}
    </div>
  );
}

function FormMembro({ m, onFechar, onSalvo }: { m: Membro | null; onFechar: () => void; onSalvo: () => void }) {
  const [f, setF] = useState({ nome: m?.nome ?? "", email: m?.email ?? "", papel: m?.papel === "admin" ? "admin" : "operador", senha: "" });
  const { aviso, tentar } = useAviso();
  const salvar = async () => {
    if (await tentar(() => (m ? chamar("PUT", `/equipe/${m.id}`, f) : chamar("POST", "/equipe", f)), "Membro salvo.")) { onSalvo(); onFechar(); }
  };
  return (
    <Janela aberta titulo={m ? "Editar Perfil" : "Novo Membro"} sub="Preencha os dados abaixo" onFechar={onFechar} largura="pequena" rodape={<><button className="cg-botao" onClick={onFechar}>Cancelar</button><button className="cg-botao primario" onClick={() => void salvar()}>Salvar</button></>}>
      {aviso}
      <h4 className="cg-secao">Dados Pessoais</h4>
      <div style={{ display: "grid", gap: 12 }}>
        <Campo rotulo="Nome Completo *"><input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Campo>
        <Campo rotulo="Email *"><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Campo>
      </div>
      <h4 className="cg-secao">Acesso e Cargo</h4>
      <div style={{ display: "grid", gap: 12 }}>
        <Campo rotulo="Cargo *"><select value={f.papel} onChange={(e) => setF({ ...f, papel: e.target.value as "admin" | "operador" })}><option value="admin">Administrador</option><option value="operador">Operador</option></select></Campo>
        <Campo rotulo="Senha" dica={m ? "Deixe vazio para manter. Mínimo de 8 caracteres." : "Obrigatória apenas no cadastro (mínimo de 8 caracteres)."}><input type="password" autoComplete="new-password" value={f.senha} onChange={(e) => setF({ ...f, senha: e.target.value })} /></Campo>
      </div>
    </Janela>
  );
}
