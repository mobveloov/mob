// Cadastro › Passageiros (clientes): filtros, abas por origem do cadastro, lista e janela com dados e restrições.
// Servidor: /api/gestao/passageiros.

import { DataBr } from "../../componentes/DataBr";
import { useState } from "react";
import { Plus } from "lucide-react";
import { useCarregar } from "../../componentes/ui";
import { CampoEndereco, type PontoEscolhido } from "../../componentes/CampoEndereco";
import { Cabecalho, Campo, chamar, ComFiltros, consulta, Janela, MenuAcoes, Paginacao, Selo, useAviso, Vazio } from "./base";
import { decimal } from "../../../comum/formato-br.ts";

interface Linha { id: string; nome: string; telefone: string; email: string; cidade: string; genero: string; dispositivo: string; origem: string; tipoCurto: string; nota: number | null; status: string; bloqueado: boolean }
interface Resposta { passageiros: Linha[]; paginacao: { atual: number; totalPaginas: number; totalItens: number }; contadores: Record<string, number> }
interface Restrito { id: string; nome: string; placa: string }

// Tela "Clientes" da Machine: filtros, Criar Estabelecimento, Criar Cliente e Exportar.
const VAZIO = { nome: "", telefone: "", cpf: "", email: "", nascIni: "", nascFim: "", cadIni: "", cadFim: "", avaliacao: "", status: [] as string[], tipo: "" };
const STATUS = ["Ativo", "Inativo", "Suspenso", "Aguardando Ativação", "Aguardando Deleção", "Deletado", "Suspenso por nota", "Bloqueado"];
const TIPOS: Array<[string, string]> = [["Estabelecimento", "Estabelecimento"], ["App", "Passageiro App"], ["Painel", "Passageiro Call-Center"], ["Motorista", "Passageiro Maçaneta"]];

export default function Passageiros() {
  const [form, setForm] = useState(VAZIO);
  const [filtro, setFiltro] = useState(VAZIO);
  const [pagina, setPagina] = useState(1);
  const cidades = useCarregar(() => chamar<{ cidades: string[] }>("GET", "/cidades"), []);
  const params = { ...filtro, status: filtro.status.join("|"), pagina };
  const l = useCarregar(() => chamar<Resposta>("GET", `/passageiros${consulta(params)}`), [filtro, pagina]);
  const [editando, setEditando] = useState<string | "novo" | "estabelecimento" | null>(null);
  const [restricoes, setRestricoes] = useState<Linha | null>(null);
  const { aviso, tentar } = useAviso();
  const d = l.dados;
  const de = d ? (d.paginacao.atual - 1) * 10 + 1 : 0;
  async function exportar() {
    await tentar(async () => {
      const r = await fetch(`/api/gestao/passageiros/exportar${consulta({ ...filtro, status: filtro.status.join("|") })}`, { credentials: "same-origin" });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { erro?: string }).erro || `Erro ${r.status}`);
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a"); a.href = url; a.download = "clientes.csv"; a.click(); URL.revokeObjectURL(url);
    }, "Exportado.");
  }
  const marcar = (st: string) => setForm({ ...form, status: form.status.includes(st) ? form.status.filter((x) => x !== st) : [...form.status, st] });

  return (
    <div className="cg-pagina-solta">
      {aviso}
      <Cabecalho titulo="Clientes">
        <button className="cg-botao" onClick={() => setEditando("estabelecimento")}><Plus size={16} /> Criar Estabelecimento</button>
        <button className="cg-botao primario" onClick={() => setEditando("novo")}><Plus size={16} /> Criar Cliente</button>
        <button className="cg-botao" onClick={() => void exportar()}>Exportar</button>
      </Cabecalho>
      <ComFiltros filtros={
        <form onSubmit={(e) => { e.preventDefault(); setPagina(1); setFiltro(form); }}>
          <Campo rotulo="Nome"><input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></Campo>
          <Campo rotulo="Telefone"><input value={form.telefone} placeholder="11 96123-4567" maxLength={30} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></Campo>
          <Campo rotulo="CPF"><input value={form.cpf} inputMode="numeric" onChange={(e) => setForm({ ...form, cpf: e.target.value })} /></Campo>
          <Campo rotulo="E-mail"><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Campo>
          <Campo rotulo="Período de data de nascimento"><DataBr aria-label="Nascimento de" placeholder="Data inicial" valor={form.nascIni} onChange={(v) => setForm({ ...form, nascIni: v })} /><DataBr aria-label="Nascimento até" placeholder="Data final" valor={form.nascFim} onChange={(v) => setForm({ ...form, nascFim: v })} /></Campo>
          <Campo rotulo="Período de cadastro"><DataBr aria-label="Cadastro de" placeholder="Data inicial" valor={form.cadIni} onChange={(v) => setForm({ ...form, cadIni: v })} /><DataBr aria-label="Cadastro até" placeholder="Data final" valor={form.cadFim} onChange={(v) => setForm({ ...form, cadFim: v })} /></Campo>
          <Campo rotulo="Avaliação"><input value={form.avaliacao} maxLength={3} inputMode="decimal" onChange={(e) => setForm({ ...form, avaliacao: e.target.value.replace(",", ".").replace(/[^0-9.]/g, "") })} /></Campo>
          <Campo rotulo="Status"><div>{STATUS.map((st) => <label key={st} style={{ display: "block" }}><input type="checkbox" checked={form.status.includes(st)} onChange={() => marcar(st)} /> {st}</label>)}</div></Campo>
          <Campo rotulo="Tipo"><select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}><option value="">Selecione</option>{TIPOS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></Campo>
          <button className="cg-botao primario cheio">Filtrar</button>
          <button type="button" className="cg-botao cheio" onClick={() => { setForm(VAZIO); setFiltro(VAZIO); setPagina(1); }}>Limpar filtros</button>
        </form>
      }>
        <div className="cg-tabela-caixa">
          {d && <p className="cg-mono" style={{ margin: "8px 12px" }}>{d.paginacao.totalItens ? `Exibindo ${de}-${de + d.passageiros.length - 1} de ${d.paginacao.totalItens} ${d.paginacao.totalItens === 1 ? "resultado" : "resultados"}.` : ""}</p>}
          <div className="cg-rolagem"><table className="cg-tabela">
            <thead><tr><th>Nome</th><th>Telefone</th><th>E-mail</th><th>Avaliação</th><th>Status</th><th>Tipo</th><th className="direita" /></tr></thead>
            <tbody>{d?.passageiros.map((p) => (
              <tr key={p.id}>
                <td><strong>{p.nome}</strong></td>
                <td>{p.telefone}</td>
                <td>{p.email}</td>
                <td>{p.nota == null ? "Avaliações Insuficientes" : `${decimal(p.nota, 1)} ★`}</td>
                <td><Selo tom={p.bloqueado ? "ruim" : "ok"}>{p.status}</Selo></td>
                <td>{p.tipoCurto}</td>
                <td className="direita"><MenuAcoes itens={[
                  { rotulo: "Editar", onClick: () => setEditando(p.id) },
                  { rotulo: p.bloqueado ? "Desbloquear" : "Bloquear", perigo: !p.bloqueado, onClick: () => void tentar(async () => { await chamar("POST", `/passageiros/${p.id}/status`, { bloqueado: !p.bloqueado }); l.recarregar(); }, p.bloqueado ? "Passageiro desbloqueado." : "Passageiro bloqueado.") },
                  { rotulo: "Restrições de motoristas", onClick: () => setRestricoes(p) },
                ]} /></td>
              </tr>))}
            </tbody>
          </table></div>
          {d && !d.passageiros.length && <Vazio titulo="Nenhum resultado encontrado." />}
          <Paginacao atual={d?.paginacao.atual ?? 1} total={d?.paginacao.totalPaginas ?? 1} onChange={setPagina} />
        </div>
      </ComFiltros>
      {editando && <Formulario id={editando === "estabelecimento" ? "novo" : editando} estabelecimento={editando === "estabelecimento"} cidades={cidades.dados?.cidades ?? []} onFechar={() => setEditando(null)} onSalvo={() => l.recarregar()} />}
      {restricoes && <Restricoes p={restricoes} onFechar={() => setRestricoes(null)} />}
    </div>
  );
}

function Formulario({ id, estabelecimento, cidades, onFechar, onSalvo }: { id: string | "novo"; estabelecimento?: boolean; cidades: string[]; onFechar: () => void; onSalvo: () => void }) {
  const novo = id === "novo";
  const [f, setF] = useState<Record<string, string>>({ nome: "", genero: "", telefone: "", email: "", nascimento: "", cidade: "", cpf: "", status: "Ativo", origemCadastro: estabelecimento ? "Estabelecimento" : "Painel", observacao: "", avaliouApp: "Pendente", notaApp: "0", senha: "" });
  const [nota, setNota] = useState<number | null>(null);
  const [casa, setCasa] = useState<PontoEscolhido>({ texto: "" });
  const [trabalho, setTrabalho] = useState<PontoEscolhido>({ texto: "" });
  const { aviso, tentar } = useAviso();
  useCarregar(async () => {
    if (novo) return null;
    const r = await chamar<{ passageiro: Record<string, unknown>; nota: number | null }>("GET", `/passageiros/${id}`);
    setF((a) => ({ ...a, ...Object.fromEntries(["nome", "genero", "telefone", "email", "nascimento", "cidade", "cpf", "status", "origemCadastro", "observacao", "avaliouApp"].map((k) => [k, String(r.passageiro[k] ?? a[k])])), notaApp: String(r.passageiro.notaApp ?? 0) }));
    setNota(r.nota);
    const ponto = (t: unknown, pos: unknown): PontoEscolhido => { const m = /^(-?[\d.]+),(-?[\d.]+)$/.exec(String(pos ?? "")); return { texto: String(t ?? ""), ...(m ? { lat: Number(m[1]), lng: Number(m[2]) } : {}) }; };
    setCasa(ponto(r.passageiro.enderecoCasa, r.passageiro.enderecoCasaPos)); setTrabalho(ponto(r.passageiro.enderecoTrabalho, r.passageiro.enderecoTrabalhoPos));
    return r;
  }, [id]);
  const set = (k: string, v: string) => setF({ ...f, [k]: v });
  const salvar = async () => {
    const pos = (p: PontoEscolhido) => (p.lat != null && p.lng != null ? `${p.lat},${p.lng}` : "");
    const corpo = { ...f, notaApp: Number(f.notaApp) || 0, senha: f.senha || undefined, ...(novo ? {} : { enderecoCasa: casa.texto, enderecoCasaPos: pos(casa), enderecoTrabalho: trabalho.texto, enderecoTrabalhoPos: pos(trabalho) }) };
    if (await tentar(() => (novo ? chamar("POST", "/passageiros", corpo) : chamar("PUT", `/passageiros/${id}`, corpo)), "Cliente salvo.")) { onSalvo(); onFechar(); }
  };
  return (
    <Janela cheia aberta titulo="Cadastro de passageiro" onFechar={onFechar} rodape={<><button className="cg-botao" onClick={onFechar}>Voltar</button><button className="cg-botao primario" onClick={() => void salvar()}>Gravar</button></>}>
      {aviso}
      <h4 className="cg-secao">Informações gerais</h4>
      <div className="cg-grade">
        <Campo rotulo="Bandeira *"><select value={f.cidade || cidades[0] || ""} disabled={novo && cidades.length === 1} onChange={(e) => set("cidade", e.target.value)}>{cidades.length !== 1 && <option value="">Selecione</option>}{cidades.map((c) => <option key={c}>{c}</option>)}</select></Campo>
        <Campo rotulo="Tipo *"><select value={f.origemCadastro} onChange={(e) => set("origemCadastro", e.target.value)}>{TIPOS.filter(([v]) => estabelecimento || novo === false || v !== "Estabelecimento").map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></Campo>
        <Campo rotulo="Status *"><select value={f.status} onChange={(e) => set("status", e.target.value)}>{STATUS.filter((st) => !novo || ["Ativo", "Inativo", "Suspenso", "Aguardando Ativação", "Aguardando Deleção"].includes(st)).map((st) => <option key={st}>{st}</option>)}</select></Campo>
      </div>
      <h4 className="cg-secao">Dados pessoais</h4>
      <div className="cg-grade">
        {!novo && <Campo rotulo="Foto de perfil" className="larga"><input readOnly disabled value="(Sem foto)" /></Campo>}
        <Campo rotulo="Nome *" className="larga"><input value={f.nome} onChange={(e) => set("nome", e.target.value)} /></Campo>
        <Campo rotulo="Telefone *"><input value={f.telefone} placeholder="11 96123-4567" maxLength={30} onChange={(e) => set("telefone", e.target.value)} /></Campo>
        <Campo rotulo="CPF"><input value={f.cpf} inputMode="numeric" maxLength={14} onChange={(e) => set("cpf", e.target.value)} /></Campo>
        {!novo && <Campo rotulo="CPF validado"><input readOnly disabled value="Não" /></Campo>}
        {!novo && <>
          <Campo rotulo="E-mail"><input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Campo>
          <Campo rotulo="Data de nascimento"><input type="date" value={f.nascimento} onChange={(e) => set("nascimento", e.target.value)} /></Campo>
          <Campo rotulo="Gênero"><select value={f.genero} onChange={(e) => set("genero", e.target.value)}><option value="">Não informado</option><option>Masculino</option><option>Feminino</option><option>Outro</option></select></Campo>
          <Campo rotulo="E-mail validado?" dica="Não enviamos link de validação de e-mail."><input readOnly disabled value="Não" /></Campo>
          <Campo rotulo="Recebimento de e-mails bloqueado?"><select disabled value="false"><option value="true">Sim</option><option value="false">Não</option></select></Campo>
          <Campo rotulo="Senha do app" dica="Deixe vazio para manter."><input type="text" autoComplete="off" value={f.senha} onChange={(e) => set("senha", e.target.value)} /></Campo>
        </>}
      </div>
      <p className="cg-mono">Campos com * são obrigatórios.</p>
      {!novo && <>
        <h4 className="cg-secao">Endereços salvos</h4>
        <p className="cg-mono">Os mesmos "Casa" e "Trabalho" que o passageiro vê no app.</p>
        <div className="cg-grade">
          <div className="larga"><CampoEndereco rotulo="Casa" valor={casa} onChange={setCasa} /></div>
          <div className="larga"><CampoEndereco rotulo="Trabalho" valor={trabalho} onChange={setTrabalho} /></div>
        </div>
      </>}
      <h4 className="cg-secao">Dados internos</h4>
      <Campo rotulo="Observação" dica={`${f.observacao.length}/5000. Só a central vê.`}><textarea value={f.observacao} maxLength={5000} rows={3} onChange={(e) => set("observacao", e.target.value)} /></Campo>
      {!novo && <>
        <h4 className="cg-secao">Avaliações</h4>
        <div className="cg-grade">
          <Campo rotulo="Nota Passageiro (Média)"><input readOnly value={nota == null ? "-" : decimal(nota, 1)} /></Campo>
          <Campo rotulo="Avaliou o App?"><select value={f.avaliouApp} onChange={(e) => set("avaliouApp", e.target.value)}><option>Pendente</option><option>Avaliou</option><option>Não quis avaliar</option><option>Adiou</option></select></Campo>
          <Campo rotulo="Nota para o App"><select value={f.notaApp} onChange={(e) => set("notaApp", e.target.value)}>{[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} ★</option>)}</select></Campo>
        </div>
      </>}
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
