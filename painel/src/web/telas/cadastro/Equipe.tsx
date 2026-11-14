// Cadastro › Equipe (Minha Equipe): usuários do painel e seus cargos. Servidor: /api/gestao/equipe.

import { useState } from "react";
import { Plus } from "lucide-react";
import { useSessao } from "../../App";
import { CARGOS as LISTA_CARGOS, DESCRICAO_CARGO, NOME_CARGO, podeCargo, type Cargo } from "../../../comum/cargos.ts";
import { funcoesDoCargo } from "../../../comum/funcoes.ts";
import { useCarregar } from "../../componentes/ui";
import { Abas, Cabecalho, Campo, chamar, ComFiltros, Janela, Selo, useAviso, Vazio } from "./base";

interface Membro { id: string; nome: string; email: string; papel: Cargo; criadoEm: string }
// Cargos como na Machine. A lista de funções de cada cargo vem do menu (src/comum/funcoes.ts), então nunca fica desatualizada.
const SIGLA: Record<Cargo, string> = { plataforma: "ADMIN MESTRE", admin: "ADMIN", gestor: "GESTOR", operador: "OPERADOR" };
const resumoFuncoes = (c: Cargo) => {
  const grupos = new Map<string, number>();
  for (const f of funcoesDoCargo(c)) grupos.set(f.grupo, (grupos.get(f.grupo) ?? 0) + 1);
  return [...grupos.entries()].map(([g, n]) => `${g} (${n})`);
};
const tomDoCargo = (c: Cargo) => (c === "operador" ? "info" : c === "gestor" ? "neutro" : "ok");

export default function Equipe() {
  const { sessao } = useSessao();
  const l = useCarregar(() => chamar<{ equipe: Membro[] }>("GET", "/equipe"), []);
  const [aba, setAba] = useState<"membros" | "cargos">("membros");
  const [busca, setBusca] = useState("");
  const [cargo, setCargo] = useState("");
  const [editando, setEditando] = useState<Membro | "novo" | null>(null);
  const { aviso, tentar } = useAviso();
  const admin = podeCargo(sessao.usuario.papel, "admin");
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
          <Campo rotulo="Cargo"><select value={cargo} onChange={(e) => setCargo(e.target.value)}><option value="">Todos</option>{LISTA_CARGOS.map((c) => <option key={c} value={c}>{NOME_CARGO[c]}</option>)}</select></Campo>
        </form>
      }>
        <Abas itens={[{ id: "membros" as const, rotulo: "Membros" }, { id: "cargos" as const, rotulo: "Cargos" }]} valor={aba} onChange={setAba} />
        {aba === "membros" ? (lista.length ? (
          <div className="cg-cartoes">{lista.map((m) => (
            <div className="cg-cartao" key={m.id}>
              <div className="cg-pessoa"><span className="cg-avatar">{m.nome.slice(0, 1).toUpperCase()}</span><div><strong>{m.nome}</strong><div><Selo tom={tomDoCargo(m.papel)}>{SIGLA[m.papel] ?? m.papel}</Selo></div></div></div>
              <span className="cg-mono">{m.email}</span>
              {admin && <div className="cg-acoes">
                <button className="cg-botao" onClick={() => setEditando(m)}>Editar Perfil</button>
                {m.id !== sessao.usuario.id && <button className="cg-botao perigo" onClick={() => confirm(`Remover ${m.nome}?`) && void tentar(async () => { await chamar("DELETE", `/equipe/${m.id}`); l.recarregar(); }, "Membro removido.")}>Remover</button>}
              </div>}
            </div>))}
          </div>
        ) : <div className="cg-tabela-caixa"><Vazio titulo="Nenhum membro encontrado." /></div>) : (
          <div className="cg-cartoes">{[...LISTA_CARGOS].reverse().map((k) => (
            <div className="cg-cartao" key={k}><h4>{NOME_CARGO[k]}</h4><Selo tom={tomDoCargo(k)}>{SIGLA[k]}</Selo><p>{DESCRICAO_CARGO[k]}</p><span className="cg-mono">{resumoFuncoes(k).join(" · ")}</span><Selo tom="info">GLOBAL (Sistema)</Selo></div>))}
          </div>
        )}
      </ComFiltros>
      {editando && <FormMembro m={editando === "novo" ? null : editando} onFechar={() => setEditando(null)} onSalvo={() => l.recarregar()} />}
    </div>
  );
}

function FormMembro({ m, onFechar, onSalvo }: { m: Membro | null; onFechar: () => void; onSalvo: () => void }) {
  const [f, setF] = useState({ nome: m?.nome ?? "", email: m?.email ?? "", papel: (m?.papel === "plataforma" ? "admin" : m?.papel ?? "operador") as Cargo, senha: "" });
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
        <Campo rotulo="Cargo *"><select value={f.papel} onChange={(e) => setF({ ...f, papel: e.target.value as Cargo })} disabled={m?.papel === "plataforma"}>{(["admin", "gestor", "operador"] as Cargo[]).map((c) => <option key={c} value={c}>{NOME_CARGO[c]}</option>)}</select></Campo>
        <Campo rotulo="Senha" dica={m ? "Deixe vazio para manter. Mínimo de 8 caracteres." : "Obrigatória apenas no cadastro (mínimo de 8 caracteres)."}><input type="password" autoComplete="new-password" value={f.senha} onChange={(e) => setF({ ...f, senha: e.target.value })} /></Campo>
      </div>
    </Janela>
  );
}
