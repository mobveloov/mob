// Cadastro › Filiais: nome, cidade, endereço, responsável e se está ativa; liga motoristas e operadores a cada filial.
// Servidor: /api/filiais.

import { useState } from "react";
import { Plus } from "lucide-react";
import { useCarregar } from "../../componentes/ui";
import { Cabecalho, Campo, chamar, Interruptor, Janela, MenuAcoes, Selo, useAviso, Vazio } from "./base";

interface Filial { id: string; nome: string; cidade: string; endereco: string; responsavel: string; telefone: string; ativa: boolean; motoristas: number; operadores: number }
interface Detalhe { filial: Filial; motoristas: Array<{ id: string; nome: string; telefone: string; status: string }>; operadores: Array<{ id: string; nome: string; email: string; papel: string }>; equipeLivre: Array<{ id: string; nome: string; email: string; papel: string }> }

const api = <T,>(metodo: "GET" | "POST" | "PUT" | "DELETE", caminho: string, corpo?: unknown) => chamar<T>(metodo, caminho, corpo, "/api/filiais");

export default function Filiais() {
  const l = useCarregar(() => api<{ filiais: Filial[] }>("GET", ""), []);
  const [editando, setEditando] = useState<Filial | "nova" | null>(null);
  const [pessoas, setPessoas] = useState<Filial | null>(null);
  const [busca, setBusca] = useState("");
  const { aviso, tentar } = useAviso();
  const lista = (l.dados?.filiais ?? []).filter((f) => !busca || `${f.nome} ${f.cidade} ${f.responsavel}`.toLowerCase().includes(busca.toLowerCase()));

  return (
    <div className="cg-pagina-solta">
      {aviso}
      <Cabecalho titulo="Filiais" sub="Unidades da sua empresa, com motoristas e operadores de cada uma">
        <button className="cg-botao primario" onClick={() => setEditando("nova")}><Plus size={16} /> Nova filial</button>
      </Cabecalho>
      <div className="cg-tabela-caixa">
        <div style={{ padding: 12 }}><Campo rotulo="Buscar"><input value={busca} placeholder="Nome, cidade ou responsável" onChange={(e) => setBusca(e.target.value)} /></Campo></div>
        <div className="cg-rolagem"><table className="cg-tabela">
          <thead><tr><th>Filial</th><th>Cidade</th><th>Responsável</th><th>Motoristas</th><th>Operadores</th><th>Situação</th><th className="direita">Ações</th></tr></thead>
          <tbody>{lista.map((f) => (
            <tr key={f.id}>
              <td><strong>{f.nome}</strong><small style={{ display: "block" }}>{f.endereco}</small></td>
              <td>{f.cidade || "—"}</td><td>{f.responsavel || "—"}{f.telefone && <small style={{ display: "block" }}>{f.telefone}</small>}</td>
              <td>{f.motoristas}</td><td>{f.operadores}</td>
              <td><Selo tom={f.ativa ? "ok" : "neutro"}>{f.ativa ? "Ativa" : "Inativa"}</Selo></td>
              <td className="direita"><MenuAcoes itens={[
                { rotulo: "Editar", onClick: () => setEditando(f) },
                { rotulo: "Motoristas e operadores", onClick: () => setPessoas(f) },
                { rotulo: "Remover", perigo: true, onClick: () => confirm(`Remover a filial ${f.nome}? Motoristas e operadores ficam sem filial.`) && void tentar(async () => { await api("DELETE", `/${f.id}`); l.recarregar(); }, "Filial removida.") },
              ]} /></td>
            </tr>))}
          </tbody>
        </table></div>
        {l.dados && !lista.length && <Vazio titulo="Nenhuma filial cadastrada." sub="Crie a primeira em Nova filial." />}
      </div>
      {editando && <FormFilial f={editando === "nova" ? null : editando} onFechar={() => setEditando(null)} onSalvo={() => l.recarregar()} />}
      {pessoas && <Pessoas f={pessoas} onFechar={() => { setPessoas(null); l.recarregar(); }} />}
    </div>
  );
}

function FormFilial({ f, onFechar, onSalvo }: { f: Filial | null; onFechar: () => void; onSalvo: () => void }) {
  const [v, setV] = useState({ nome: f?.nome ?? "", cidade: f?.cidade ?? "", endereco: f?.endereco ?? "", responsavel: f?.responsavel ?? "", telefone: f?.telefone ?? "", ativa: f?.ativa ?? true });
  const { aviso, tentar } = useAviso();
  const salvar = async () => { if (await tentar(() => (f ? api("PUT", `/${f.id}`, v) : api("POST", "", v)), "Filial salva.")) { onSalvo(); onFechar(); } };
  const set = (k: keyof typeof v, x: string | boolean) => setV({ ...v, [k]: x });
  return (
    <Janela aberta titulo={f ? "Editar filial" : "Nova filial"} sub="Preencha os dados abaixo" onFechar={onFechar} largura="pequena" rodape={<><button className="cg-botao" onClick={onFechar}>Cancelar</button><button className="cg-botao primario" onClick={() => void salvar()}>Salvar</button></>}>
      {aviso}
      <div style={{ display: "grid", gap: 12 }}>
        <Campo rotulo="Nome *"><input value={v.nome} maxLength={80} onChange={(e) => set("nome", e.target.value)} /></Campo>
        <Campo rotulo="Cidade"><input value={v.cidade} maxLength={80} onChange={(e) => set("cidade", e.target.value)} /></Campo>
        <Campo rotulo="Endereço"><input value={v.endereco} maxLength={160} onChange={(e) => set("endereco", e.target.value)} /></Campo>
        <div className="cg-duplo">
          <Campo rotulo="Responsável"><input value={v.responsavel} maxLength={80} onChange={(e) => set("responsavel", e.target.value)} /></Campo>
          <Campo rotulo="Telefone"><input value={v.telefone} maxLength={20} onChange={(e) => set("telefone", e.target.value)} /></Campo>
        </div>
        <Interruptor ligado={v.ativa} onChange={(x) => set("ativa", x)} rotulo={v.ativa ? "Filial ativa" : "Filial inativa"} />
      </div>
    </Janela>
  );
}

/** Liga e solta motoristas e operadores da filial. */
function Pessoas({ f, onFechar }: { f: Filial; onFechar: () => void }) {
  const d = useCarregar(() => api<Detalhe>("GET", `/${f.id}`), [f.id]);
  const [aba, setAba] = useState<"motoristas" | "operadores">("motoristas");
  const [busca, setBusca] = useState("");
  const { aviso, tentar } = useAviso();
  const motoristas = useCarregar(() => (busca.length >= 2 ? chamar<{ motoristas: Array<{ id: string; nome: string; cpf?: string }> }>("GET", `/motoristas-busca?q=${encodeURIComponent(busca)}`) : Promise.resolve(null)), [busca]);
  const ligar = (tipo: "motoristas" | "operadores", id: string) => void tentar(async () => { await api("POST", `/${f.id}/${tipo}`, { ids: [id] }); d.recarregar(); }, "Ligado à filial.");
  const soltar = (tipo: "motoristas" | "operadores", id: string) => void tentar(async () => { await api("DELETE", `/${f.id}/${tipo}/${id}`); d.recarregar(); }, "Solto da filial.");
  const ligadosM = new Set(d.dados?.motoristas.map((m) => m.id));
  const ligadosO = new Set(d.dados?.operadores.map((o) => o.id));
  const achados = (motoristas.dados?.motoristas ?? []).filter((m) => !ligadosM.has(m.id));
  const livres = (d.dados?.equipeLivre ?? []).filter((u) => !ligadosO.has(u.id));
  return (
    <Janela aberta titulo={f.nome} sub="Motoristas e operadores desta filial" onFechar={onFechar} largura="media" rodape={<button className="cg-botao" onClick={onFechar}>Fechar</button>}>
      {aviso}
      <div className="cg-abas" role="tablist">
        <button role="tab" aria-selected={aba === "motoristas"} className={aba === "motoristas" ? "ativa" : ""} onClick={() => setAba("motoristas")}>Motoristas<b>{d.dados?.motoristas.length ?? 0}</b></button>
        <button role="tab" aria-selected={aba === "operadores"} className={aba === "operadores" ? "ativa" : ""} onClick={() => setAba("operadores")}>Operadores<b>{d.dados?.operadores.length ?? 0}</b></button>
      </div>
      {aba === "motoristas" ? (
        <div style={{ display: "grid", gap: 8 }}>
          {d.dados?.motoristas.map((m) => <div key={m.id} className="cg-pessoa"><div><strong>{m.nome}</strong> <small>{m.telefone} · {m.status}</small></div><button className="cg-botao" onClick={() => soltar("motoristas", m.id)}>Soltar</button></div>)}
          {d.dados && !d.dados.motoristas.length && <Vazio titulo="Nenhum motorista nesta filial." />}
          <Campo rotulo="Ligar motorista" dica="Digite pelo menos 2 letras do nome. Quem estava em outra filial muda para esta."><input value={busca} onChange={(e) => setBusca(e.target.value)} /></Campo>
          {achados.map((m) => <button key={m.id} className="cg-botao" onClick={() => ligar("motoristas", m.id)}>{m.nome} <small className="cg-mono">{m.cpf}</small></button>)}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {d.dados?.operadores.map((o) => <div key={o.id} className="cg-pessoa"><div><strong>{o.nome}</strong> <small>{o.email}</small></div><button className="cg-botao" onClick={() => soltar("operadores", o.id)}>Soltar</button></div>)}
          {d.dados && !d.dados.operadores.length && <Vazio titulo="Nenhum operador nesta filial." sub="Operador e Gestor ligados a uma filial só veem as corridas dela." />}
          {livres.length > 0 && <Campo rotulo="Ligar usuário da equipe"><select value="" onChange={(e) => e.target.value && ligar("operadores", e.target.value)}><option value="">Escolha</option>{livres.map((u) => <option key={u.id} value={u.id}>{u.nome} ({u.email})</option>)}</select></Campo>}
        </div>
      )}
    </Janela>
  );
}
