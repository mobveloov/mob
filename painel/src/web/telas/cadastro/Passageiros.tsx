// Cadastro › Passageiros (clientes): filtros, abas por origem do cadastro, lista e janela com dados e restrições.
// Servidor: /api/gestao/passageiros.

import { useState } from "react";
import { Plus } from "lucide-react";
import { useCarregar } from "../../componentes/ui";
import { Abas, Cabecalho, Campo, chamar, ComFiltros, consulta, Janela, MenuAcoes, Paginacao, Selo, useAviso, Vazio } from "./base";

interface Linha { id: string; nome: string; telefone: string; email: string; cidade: string; genero: string; dispositivo: string; origem: string; nota: number | null; status: string; bloqueado: boolean }
interface Resposta { passageiros: Linha[]; paginacao: { atual: number; totalPaginas: number }; contadores: Record<string, number> }
interface Restrito { id: string; nome: string; placa: string }

const VAZIO = { cidade: "", nome: "", telefone: "", dispositivo: "Todos", status: "Todos" };
const ABAS = [["Todos", "Todos", "todos"], ["App", "App", "App"], ["Painel", "Central", "Painel"], ["Motorista", "Motorista", "Motorista"]] as const;

export default function Passageiros() {
  const [form, setForm] = useState(VAZIO);
  const [filtro, setFiltro] = useState(VAZIO);
  const [tipo, setTipo] = useState("Todos");
  const [pagina, setPagina] = useState(1);
  const cidades = useCarregar(() => chamar<{ cidades: string[] }>("GET", "/cidades"), []);
  const l = useCarregar(() => chamar<Resposta>("GET", `/passageiros${consulta({ ...filtro, tipo, pagina })}`), [filtro, tipo, pagina]);
  const [editando, setEditando] = useState<string | "novo" | null>(null);
  const [restricoes, setRestricoes] = useState<Linha | null>(null);
  const { aviso, tentar } = useAviso();
  const d = l.dados;

  return (
    <div className="cg-pagina-solta">
      {aviso}
      <Cabecalho titulo="Passageiros" sub="Gestão & Auditoria"><button className="cg-botao primario" onClick={() => setEditando("novo")}><Plus size={16} /> Novo Cliente</button></Cabecalho>
      <ComFiltros filtros={
        <form onSubmit={(e) => { e.preventDefault(); setPagina(1); setFiltro(form); }}>
          <Campo rotulo="Central"><select value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })}><option value="">Todas as Cidades</option>{cidades.dados?.cidades.map((c) => <option key={c}>{c}</option>)}</select></Campo>
          <Campo rotulo="Nome"><input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></Campo>
          <Campo rotulo="Telefone"><input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></Campo>
          <Campo rotulo="Dispositivo"><select value={form.dispositivo} onChange={(e) => setForm({ ...form, dispositivo: e.target.value })}><option>Todos</option><option>Android</option><option value="iOS">iOS (iPhone)</option><option value="Não identificado">Não Identificado</option></select></Campo>
          <Campo rotulo="Status"><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option>Todos</option><option value="Ativos">Ativos</option><option value="Bloqueados">Bloqueados</option></select></Campo>
          <button className="cg-botao primario cheio">Filtrar</button>
          <button type="button" className="cg-botao cheio" onClick={() => { setForm(VAZIO); setFiltro(VAZIO); setPagina(1); }}>Limpar</button>
        </form>
      }>
        <Abas itens={ABAS.map(([id, rotulo, k]) => ({ id, rotulo, n: d?.contadores[k] ?? 0 }))} valor={tipo as "Todos"} onChange={(v) => { setTipo(v); setPagina(1); }} />
        <div className="cg-tabela-caixa">
          <div className="cg-rolagem"><table className="cg-tabela">
            <thead><tr><th>Passageiro</th><th>Dados</th><th>Contato</th><th>Nota</th><th>Status</th><th className="direita">Ações</th></tr></thead>
            <tbody>{d?.passageiros.map((p) => (
              <tr key={p.id}>
                <td><div className="cg-pessoa"><span className="cg-avatar">{p.nome.slice(0, 1).toUpperCase()}</span><div><strong>{p.nome}</strong><small>{p.cidade}</small></div></div></td>
                <td>{p.genero || "Não informado"}<br /><small className="cg-mono">{p.dispositivo}</small></td>
                <td>{p.telefone}<br /><small className="cg-mono">{p.email}</small></td>
                <td>{p.nota == null ? "-" : `${p.nota.toFixed(1)} ★`}</td>
                <td><Selo tom={p.bloqueado ? "ruim" : "ok"}>{p.bloqueado ? "Bloqueado" : "Ativo"}</Selo></td>
                <td className="direita"><MenuAcoes itens={[
                  { rotulo: "Editar", onClick: () => setEditando(p.id) },
                  { rotulo: p.bloqueado ? "Desbloquear" : "Bloquear", perigo: !p.bloqueado, onClick: () => void tentar(async () => { await chamar("POST", `/passageiros/${p.id}/status`, { bloqueado: !p.bloqueado }); l.recarregar(); }, p.bloqueado ? "Passageiro desbloqueado." : "Passageiro bloqueado.") },
                  { rotulo: "Restrições de motoristas", onClick: () => setRestricoes(p) },
                ]} /></td>
              </tr>))}
            </tbody>
          </table></div>
          {d && !d.passageiros.length && <Vazio titulo="Nenhum passageiro encontrado." />}
          <Paginacao atual={d?.paginacao.atual ?? 1} total={d?.paginacao.totalPaginas ?? 1} onChange={setPagina} />
        </div>
      </ComFiltros>
      {editando && <Formulario id={editando} cidades={cidades.dados?.cidades ?? []} onFechar={() => setEditando(null)} onSalvo={() => l.recarregar()} />}
      {restricoes && <Restricoes p={restricoes} onFechar={() => setRestricoes(null)} />}
    </div>
  );
}

function Formulario({ id, cidades, onFechar, onSalvo }: { id: string | "novo"; cidades: string[]; onFechar: () => void; onSalvo: () => void }) {
  const novo = id === "novo";
  const [f, setF] = useState<Record<string, string>>({ nome: "", genero: "", telefone: "", email: "", cidade: "", cpf: "", status: "Ativo", observacao: "", avaliouApp: "Pendente", notaApp: "0", senha: "" });
  const [nota, setNota] = useState<number | null>(null);
  const { aviso, tentar } = useAviso();
  useCarregar(async () => {
    if (novo) return null;
    const r = await chamar<{ passageiro: Record<string, unknown>; nota: number | null }>("GET", `/passageiros/${id}`);
    setF((a) => ({ ...a, ...Object.fromEntries(["nome", "genero", "telefone", "email", "cidade", "cpf", "status", "observacao", "avaliouApp"].map((k) => [k, String(r.passageiro[k] ?? a[k])])), notaApp: String(r.passageiro.notaApp ?? 0) }));
    setNota(r.nota);
    return r;
  }, [id]);
  const set = (k: string, v: string) => setF({ ...f, [k]: v });
  const salvar = async () => {
    const corpo = { ...f, notaApp: Number(f.notaApp) || 0, senha: f.senha || undefined };
    if (await tentar(() => (novo ? chamar("POST", "/passageiros", corpo) : chamar("PUT", `/passageiros/${id}`, corpo)), "Passageiro salvo.")) { onSalvo(); onFechar(); }
  };
  return (
    <Janela aberta titulo="Passageiro" sub="Dados Cadastrais" onFechar={onFechar} rodape={<><button className="cg-botao" onClick={onFechar}>Cancelar</button><button className="cg-botao primario" onClick={() => void salvar()}>Salvar</button></>}>
      {aviso}
      <div className="cg-grade">
        <Campo rotulo="Nome Completo" className="larga"><input value={f.nome} onChange={(e) => set("nome", e.target.value)} /></Campo>
        <Campo rotulo="Gênero"><select value={f.genero} onChange={(e) => set("genero", e.target.value)}><option value="">Não informado</option><option>Masculino</option><option>Feminino</option><option>Outro</option></select></Campo>
        <Campo rotulo="Telefone"><input value={f.telefone} onChange={(e) => set("telefone", e.target.value)} /></Campo>
        <Campo rotulo="E-mail"><input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Campo>
        <Campo rotulo="Cidade"><select value={f.cidade} onChange={(e) => set("cidade", e.target.value)}><option value="">Selecione</option>{cidades.map((c) => <option key={c}>{c}</option>)}</select></Campo>
        <Campo rotulo="CPF"><input value={f.cpf} inputMode="numeric" placeholder="000.000.000-00" onChange={(e) => set("cpf", e.target.value)} /></Campo>
        <Campo rotulo="Situação"><select value={f.status} onChange={(e) => set("status", e.target.value)}><option>Ativo</option><option>Inativo</option><option>Suspenso</option><option>Bloqueado</option></select></Campo>
        <Campo rotulo="Senha do app" dica={novo ? "Opcional (mínimo 6)." : "Deixe vazio para manter."}><input type="text" autoComplete="off" value={f.senha} onChange={(e) => set("senha", e.target.value)} /></Campo>
      </div>
      <h4 className="cg-secao">Dados internos</h4>
      <Campo rotulo="Observação" dica={`${f.observacao.length}/5000. Só a central vê.`}><textarea value={f.observacao} maxLength={5000} rows={3} onChange={(e) => set("observacao", e.target.value)} /></Campo>
      <h4 className="cg-secao">Avaliações</h4>
      <div className="cg-grade">
        <Campo rotulo="Nota Passageiro (Média)"><input readOnly value={nota == null ? "-" : nota.toFixed(1)} /></Campo>
        <Campo rotulo="Avaliou o App?"><select value={f.avaliouApp} onChange={(e) => set("avaliouApp", e.target.value)}><option>Pendente</option><option>Avaliou</option><option>Não quis avaliar</option><option>Adiou</option></select></Campo>
        <Campo rotulo="Nota para o App"><select value={f.notaApp} onChange={(e) => set("notaApp", e.target.value)}>{[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} ★</option>)}</select></Campo>
      </div>
    </Janela>
  );
}

function Restricoes({ p, onFechar }: { p: Linha; onFechar: () => void }) {
  const l = useCarregar(() => chamar<{ restritos: Restrito[] }>("GET", `/passageiros/${p.id}/restricoes`), [p.id]);
  const [busca, setBusca] = useState("");
  const achados = useCarregar(() => (busca.length >= 2 ? chamar<{ motoristas: Array<{ id: string; nome: string }> }>("GET", `/motoristas-busca${consulta({ q: busca })}`) : Promise.resolve(null)), [busca]);
  const { aviso, tentar } = useAviso();
  return (
    <Janela aberta titulo="Restrições" sub={`${p.nome} não recebe chamado destes motoristas`} onFechar={onFechar}>
      {aviso}
      <Campo rotulo="Adicionar motorista"><input value={busca} placeholder="Digite o nome..." onChange={(e) => setBusca(e.target.value)} /></Campo>
      {achados.dados?.motoristas.map((m) => <p key={m.id}><button className="cg-botao" onClick={() => void tentar(async () => { await chamar("POST", `/passageiros/${p.id}/restricoes`, { motoristaId: m.id }); setBusca(""); l.recarregar(); }, "Restrição criada.")}>+ {m.nome}</button></p>)}
      <h4 className="cg-secao">Motoristas restritos</h4>
      {!l.dados?.restritos.length ? <Vazio titulo="Nenhuma restrição." /> : l.dados.restritos.map((r) => (
        <div className="cg-resumo-linha" key={r.id}><span>{r.nome} <small className="cg-mono">{r.placa}</small></span>
          <button className="cg-botao perigo" onClick={() => void tentar(async () => { await chamar("DELETE", `/passageiros/${p.id}/restricoes/${r.id}`); l.recarregar(); }, "Restrição removida.")}>Remover</button></div>
      ))}
    </Janela>
  );
}
