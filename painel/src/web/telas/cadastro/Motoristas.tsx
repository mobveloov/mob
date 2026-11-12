// Cadastro › Motoristas: filtros, contadores por situação, lista (perfil, veículo, nível, carteira, situação, diagnóstico)
// e ações (editar, alterar status, mudar cidade, nova senha, histórico). Servidor: /api/gestao/motoristas.

import { useState } from "react";
import { Ghost, Plus, Smartphone, Wifi, WifiOff } from "lucide-react";
import { useCarregar } from "../../componentes/ui";
import { Abas, Cabecalho, Campo, chamar, ComFiltros, consulta, dataHoraBr, dinheiro, Janela, MenuAcoes, Paginacao, Selo, useAviso, Vazio } from "./base";
import MotoristaJanela from "./MotoristaJanela";

export interface LinhaMotorista {
  id: string; nome: string; cpf: string; telefone: string; email: string; cidade: string; veiculo: string; placa: string; ano: number | null; nivel: string;
  saldo: number; status: string; aba: string; viatura: string; categorias: string; cnh: string; criadoEm: string;
  diagnostico: { online: boolean; app: boolean; fantasma: boolean; versao: string | null };
}
interface Resposta { motoristas: LinhaMotorista[]; paginacao: { atual: number; totalPaginas: number; totalItens: number }; contadores: Record<string, number> }

export const SITUACOES = ["Ativo", "Em análise", "Fila de espera", "Bloqueado", "Rejeitado", "Inativo", "Lixeira"];
const TOM: Record<string, "ok" | "alerta" | "ruim" | "info" | "neutro"> = { Ativo: "ok", "Em análise": "alerta", "Aguardando aprovação": "alerta", Bloqueado: "ruim", "Fila de espera": "info" };
const ABAS = [["todos", "Todos"], ["ativos", "Ativos"], ["analise", "Análise"], ["fila", "Fila"], ["bloqueados", "Bloqueados"], ["rejeitados", "Rej"], ["inativos", "Inat"], ["lixeira", "Lixeira"]] as const;
const CNH = [["valida", "Válida (Em dia)"], ["nao_preenchida", "Sem data / Pendente"], ["vence_30", "Vence em 30 dias"], ["vencida", "Vencida"]];
const VAZIO = { cidade: "", nome: "", cpf: "", viatura: "", placa: "", telefone: "", email: "", anoDe: "", anoAte: "", dataIni: "", dataFim: "", categorias: [] as string[], cnh: [] as string[] };

export default function Motoristas() {
  const [form, setForm] = useState(VAZIO);
  const [filtro, setFiltro] = useState(VAZIO);
  const [aba, setAba] = useState("todos");
  const [pagina, setPagina] = useState(1);
  const opcoes = useCarregar(() => chamar<{ cidades: string[]; categorias: string[] }>("GET", "/cidades"), []);
  const lista = useCarregar(() => chamar<Resposta>("GET", `/motoristas${consulta({ ...filtro, categorias: filtro.categorias.join(","), cnh: filtro.cnh.join(","), aba, pagina })}`), [filtro, aba, pagina], 30_000);
  const { aviso, tentar } = useAviso();
  const [editando, setEditando] = useState<string | "novo" | null>(null);
  const [status, setStatus] = useState<LinhaMotorista | null>(null);
  const [senha, setSenha] = useState<LinhaMotorista | null>(null);
  const [cidade, setCidade] = useState<LinhaMotorista | null>(null);
  const [historico, setHistorico] = useState<LinhaMotorista | null>(null);

  const alternar = (k: "categorias" | "cnh", v: string) => setForm({ ...form, [k]: form[k].includes(v) ? form[k].filter((x) => x !== v) : [...form[k], v] });
  const d = lista.dados;
  const c = d?.contadores ?? {};

  return (
    <div className="cg-pagina-solta">
      {aviso}
      <Cabecalho titulo="Motoristas" sub="Gestão de Parceiros">
        <button className="cg-botao primario" onClick={() => setEditando("novo")}><Plus size={16} /> Novo Motorista</button>
      </Cabecalho>
      <ComFiltros filtros={
        <form onSubmit={(e) => { e.preventDefault(); setPagina(1); setFiltro(form); }}>
          <h4>Filtro Avançado</h4>
          <Campo rotulo="Cidade"><select value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })}><option value="">Todas as minhas</option>{opcoes.dados?.cidades.map((x) => <option key={x}>{x}</option>)}</select></Campo>
          <Campo rotulo="Nome"><input value={form.nome} placeholder="Digite o nome..." onChange={(e) => setForm({ ...form, nome: e.target.value })} /></Campo>
          <Campo rotulo="CPF"><input value={form.cpf} placeholder="000.000.000-00" onChange={(e) => setForm({ ...form, cpf: e.target.value })} /></Campo>
          <Campo rotulo="Número da viatura"><input value={form.viatura} placeholder="Ex: 1050" onChange={(e) => setForm({ ...form, viatura: e.target.value })} /></Campo>
          <Campo rotulo="Placa"><input value={form.placa} placeholder="ABC-1234" onChange={(e) => setForm({ ...form, placa: e.target.value.toUpperCase() })} /></Campo>
          <Campo rotulo="Telefone"><input value={form.telefone} placeholder="(00) 00000-0000" onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></Campo>
          <Campo rotulo="E-mail"><input value={form.email} placeholder="email@exemplo.com" onChange={(e) => setForm({ ...form, email: e.target.value })} /></Campo>
          <Campo rotulo="Ano do veículo"><div className="cg-duplo"><input type="number" placeholder="De" value={form.anoDe} onChange={(e) => setForm({ ...form, anoDe: e.target.value })} /><span>-</span><input type="number" placeholder="Até" value={form.anoAte} onChange={(e) => setForm({ ...form, anoAte: e.target.value })} /></div></Campo>
          <Campo rotulo="Período de cadastro"><div className="cg-duplo"><input type="date" aria-label="Início" value={form.dataIni} onChange={(e) => setForm({ ...form, dataIni: e.target.value })} /><input type="date" aria-label="Fim" value={form.dataFim} onChange={(e) => setForm({ ...form, dataFim: e.target.value })} /></div></Campo>
          <h4>Categorias</h4>
          <div className="cg-caixas">{opcoes.dados?.categorias.map((x) => <label key={x}><input type="checkbox" checked={form.categorias.includes(x)} onChange={() => alternar("categorias", x)} />{x}</label>)}</div>
          <h4>Validade da CNH</h4>
          <div className="cg-caixas">{CNH.map(([v, r]) => <label key={v}><input type="checkbox" checked={form.cnh.includes(v)} onChange={() => alternar("cnh", v)} />{r}</label>)}</div>
          <button className="cg-botao primario cheio">Aplicar Filtros</button>
          <button type="button" className="cg-botao cheio" onClick={() => { setForm(VAZIO); setFiltro(VAZIO); setPagina(1); }}>Limpar tudo</button>
        </form>
      }>
        <Abas itens={ABAS.map(([id, rotulo]) => ({ id, rotulo, n: c[id] ?? 0 }))} valor={aba as (typeof ABAS)[number][0]} onChange={(v) => { setAba(v); setPagina(1); }} />
        <div className="cg-tabela-caixa">
          <div className="cg-rolagem">
            <table className="cg-tabela">
              <thead><tr><th>Perfil do Motorista</th><th>Veículo Ativo</th><th>Nível</th><th>Carteira</th><th>Situação</th><th className="centro">Diagnóstico</th><th className="direita">Ações</th></tr></thead>
              <tbody>
                {d?.motoristas.map((m) => (
                  <tr key={m.id}>
                    <td><div className="cg-pessoa"><span className="cg-avatar">{m.nome.slice(0, 1).toUpperCase()}</span><div><strong>{m.nome}</strong><small>{m.cpf}</small></div></div></td>
                    <td><div className="cg-veiculo"><strong>{m.veiculo || "---"}</strong><span className="cg-mono">{m.placa || "SEM PLACA"}</span></div></td>
                    <td><span className="cg-chip-nivel">{m.nivel}</span></td>
                    <td><strong style={m.saldo < 0 ? { color: "var(--cg-ruim)" } : undefined}>{dinheiro(m.saldo)}</strong></td>
                    <td><Selo tom={TOM[m.status] ?? "neutro"}>{m.status}</Selo></td>
                    <td className="centro">
                      <div className="cg-diag">
                        <div className={m.diagnostico.online ? "on" : ""} title={m.diagnostico.online ? "Online" : "Offline"}><i />{m.diagnostico.online ? "ON" : "OFF"}</div>
                        <div className={m.diagnostico.app ? "on" : "off"} title={m.diagnostico.app ? "App instalado" : "App desinstalado"}>{m.diagnostico.app ? <Wifi size={16} /> : <WifiOff size={16} />}{m.diagnostico.app ? "APP ON" : "APP OFF"}</div>
                        {m.diagnostico.fantasma && <div className="roxo" title="Modo fantasma (oculto no mapa)"><Ghost size={16} />OCULTO</div>}
                        <div title="Versão do app"><Smartphone size={16} />{m.diagnostico.versao ? `v${m.diagnostico.versao}` : "v-"}</div>
                      </div>
                    </td>
                    <td className="direita">
                      <MenuAcoes itens={[
                        { rotulo: "Editar Dados", onClick: () => setEditando(m.id) }, { rotulo: "Alterar Status", onClick: () => setStatus(m) },
                        { rotulo: "Mudar Cidade", onClick: () => setCidade(m) }, { rotulo: "Nova Senha", onClick: () => setSenha(m) }, { rotulo: "Histórico", onClick: () => setHistorico(m) },
                      ]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {d && !d.motoristas.length && <Vazio titulo="Nenhum motorista encontrado." sub="Tente ajustar seus filtros." />}
          <Paginacao atual={d?.paginacao.atual ?? 1} total={d?.paginacao.totalPaginas ?? 1} onChange={setPagina} />
        </div>
      </ComFiltros>

      {editando && <MotoristaJanela id={editando} onFechar={() => setEditando(null)} onSalvo={() => lista.recarregar()} cidades={opcoes.dados?.cidades ?? []} categorias={opcoes.dados?.categorias ?? []} />}
      <JanelaStatus m={status} onFechar={() => setStatus(null)} onSalvar={async (s) => { if (status && await tentar(() => chamar("POST", `/motoristas/${status.id}/status`, { status: s }), "Situação atualizada.")) { setStatus(null); lista.recarregar(); } }} />
      <JanelaSenha m={senha} onFechar={() => setSenha(null)} onSalvar={async (s) => { if (senha && await tentar(() => chamar("POST", `/motoristas/${senha.id}/senha`, { senha: s }), "Senha alterada. Vale na hora no app do motorista.")) setSenha(null); }} />
      <JanelaCidade m={cidade} cidades={opcoes.dados?.cidades ?? []} onFechar={() => setCidade(null)} onSalvar={async (cid) => { if (cidade && await tentar(() => chamar("PUT", `/motoristas/${cidade.id}`, { dados: { cidade: cid } }), "Cidade alterada.")) { setCidade(null); lista.recarregar(); } }} />
      <JanelaHistorico m={historico} onFechar={() => setHistorico(null)} />
    </div>
  );
}

function JanelaStatus({ m, onFechar, onSalvar }: { m: LinhaMotorista | null; onFechar: () => void; onSalvar: (s: string) => void }) {
  const [s, setS] = useState("");
  if (!m) return null;
  const valor = s || m.status;
  return (
    <Janela aberta titulo="Alterar Status" sub={m.nome} onFechar={() => { setS(""); onFechar(); }} largura="pequena" rodape={<button className="cg-botao primario cheio" onClick={() => onSalvar(valor)}>Confirmar Alteração</button>}>
      <Campo rotulo="Novo Status"><select value={valor} onChange={(e) => setS(e.target.value)}>{SITUACOES.map((x) => <option key={x}>{x}</option>)}</select></Campo>
    </Janela>
  );
}

function JanelaSenha({ m, onFechar, onSalvar }: { m: LinhaMotorista | null; onFechar: () => void; onSalvar: (s: string) => void }) {
  const [s, setS] = useState("");
  if (!m) return null;
  return (
    <Janela aberta titulo="Nova Senha" sub={m.nome} onFechar={() => { setS(""); onFechar(); }} largura="pequena" rodape={<button className="cg-botao primario cheio" disabled={s.trim().length < 6} onClick={() => { onSalvar(s); setS(""); }}>Salvar Senha</button>}>
      <Campo rotulo="Defina a nova senha" dica="A senha será alterada imediatamente no app do motorista (mínimo 6 caracteres)."><input type="text" autoComplete="off" value={s} onChange={(e) => setS(e.target.value)} /></Campo>
    </Janela>
  );
}

function JanelaCidade({ m, cidades, onFechar, onSalvar }: { m: LinhaMotorista | null; cidades: string[]; onFechar: () => void; onSalvar: (c: string) => void }) {
  const [c, setC] = useState("");
  if (!m) return null;
  const valor = c || m.cidade;
  return (
    <Janela aberta titulo="Mudar Cidade" sub={m.nome} onFechar={() => { setC(""); onFechar(); }} largura="pequena" rodape={<button className="cg-botao primario cheio" onClick={() => onSalvar(valor)}>Mudar</button>}>
      <Campo rotulo="Nova cidade"><select value={valor} onChange={(e) => setC(e.target.value)}><option value="">Selecione</option>{cidades.map((x) => <option key={x}>{x}</option>)}</select></Campo>
    </Janela>
  );
}

function JanelaHistorico({ m, onFechar }: { m: LinhaMotorista | null; onFechar: () => void }) {
  const h = useCarregar(() => (m ? chamar<{ corridas: Array<{ id: string; os: string; em: string; status: string; embarque: string; passageiro: string; valor: number | null }> }>("GET", `/motoristas/${m.id}/historico`) : Promise.resolve(null)), [m?.id]);
  if (!m) return null;
  return (
    <Janela aberta titulo="Histórico" sub={m.nome} onFechar={onFechar} largura="grande">
      {!h.dados?.corridas.length ? <Vazio titulo="Sem corridas." sub="Este motorista ainda não fez corridas." /> : (
        <div className="cg-rolagem"><table className="cg-tabela">
          <thead><tr><th>OS</th><th>Data</th><th>Passageiro</th><th>Embarque</th><th>Situação</th><th>Valor</th></tr></thead>
          <tbody>{h.dados.corridas.map((c) => <tr key={c.id}><td>{c.os}</td><td>{dataHoraBr(c.em)}</td><td>{c.passageiro}</td><td>{c.embarque}</td><td>{c.status}</td><td>{c.valor == null ? "-" : dinheiro(c.valor)}</td></tr>)}</tbody>
        </table></div>
      )}
    </Janela>
  );
}
