// Painel do dono da plataforma (ADMIN Mestre): empresas, planos e recursos, marca e domínio, uso e faturamento, centrais e franquias.
// Servidor: /api/superadmin (só o dono; os outros cargos levam 403).

import { useState } from "react";
import { Download, LogIn, Plus } from "lucide-react";
import { escolherEmpresa } from "../../api";
import { useCarregar } from "../../componentes/ui";
import { Abas, Cabecalho, Campo, chamar, dinheiro, Interruptor, Janela, MenuAcoes, Selo, useAviso, Vazio } from "../cadastro/base";

interface Resumo {
  id: string; nome: string; ativa: boolean; suspensao: { em: string; motivo: string; por: string } | null; criadaEm: string; codigo: number;
  plano: { id: string; nome: string; mensalidade: number }; recursosDesligados: string[];
  marca: { produto: string; nomeExibido: string; dominios: string[]; corPrimaria: string };
  rede: { tipo: "principal" | "associada" | "isolada"; principalId: string | null; associadas: number };
  uso: { competencia: string; corridasFinalizadas: number; corridasNaoFinalizadas: number; receitaBruta: number; tarifas: number; aPagar: number; motoristas: number; motoristasAtivos: number; passageiros: number; usuarios: number; filiais: number };
}
interface Lista { empresas: Resumo[]; planos: Array<{ id: string; nome: string; mensalidade: number }>; recursos: Array<{ id: string; nome: string; descricao: string }> }
interface Rede { principais: Array<{ id: string; nome: string; codigo: number; ativa: boolean; associadas: Array<{ id: string; nome: string; codigo: number; ativa: boolean }> }>; livres: Array<{ id: string; nome: string; ativa: boolean }> }

const api = <T,>(metodo: "GET" | "POST" | "PUT" | "DELETE", caminho: string, corpo?: unknown) => chamar<T>(metodo, caminho, corpo, "/api/superadmin");
const mesAtual = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 7);

/** Entra no painel como a empresa (o servidor passa a usar a empresa escolhida nos pedidos do dono). */
function entrarComo(id: string) {
  escolherEmpresa(id);
  try { localStorage.setItem("empresa", id); } catch { /* sem armazenamento */ }
  location.href = "/";
}

export default function Superadmin() {
  const [aba, setAba] = useState<"empresas" | "recursos" | "marca" | "uso" | "centrais">("empresas");
  const [comp, setComp] = useState(mesAtual());
  const l = useCarregar(() => api<Lista>("GET", `/empresas?competencia=${comp}`), [comp]);
  const { aviso, tentar } = useAviso();
  const d = l.dados;

  return (
    <div className="cg-pagina-solta">
      {aviso}
      <Cabecalho titulo="Painel do dono" sub="Empresas, planos, recursos, marca, uso e centrais da plataforma">
        <Campo rotulo="Mês"><input type="month" value={comp} onChange={(e) => e.target.value && setComp(e.target.value)} /></Campo>
      </Cabecalho>
      <Abas itens={[{ id: "empresas" as const, rotulo: "Empresas", n: d?.empresas.length }, { id: "recursos" as const, rotulo: "Planos e recursos" }, { id: "marca" as const, rotulo: "Marca e domínio" }, { id: "uso" as const, rotulo: "Uso e faturamento" }, { id: "centrais" as const, rotulo: "Centrais e franquias" }]} valor={aba} onChange={setAba} />
      {l.erro && <div className="cg-aviso erro">{l.erro}</div>}
      {d && aba === "empresas" && <Empresas d={d} tentar={tentar} recarregar={l.recarregar} />}
      {d && aba === "recursos" && <Recursos d={d} tentar={tentar} recarregar={l.recarregar} />}
      {d && aba === "marca" && <Marcas d={d} tentar={tentar} recarregar={l.recarregar} />}
      {aba === "uso" && <Uso comp={comp} />}
      {aba === "centrais" && <Centrais tentar={tentar} />}
    </div>
  );
}

type Tentar = (f: () => Promise<unknown>, ok?: string) => Promise<boolean>;
interface PropsAba { d: Lista; tentar: Tentar; recarregar: () => void }

function Empresas({ d, tentar, recarregar }: PropsAba) {
  const [nova, setNova] = useState(false);
  const [suspendendo, setSuspendendo] = useState<Resumo | null>(null);
  return (
    <>
      <div style={{ margin: "12px 0" }}><button className="cg-botao primario" onClick={() => setNova(true)}><Plus size={16} /> Nova empresa</button></div>
      <div className="cg-tabela-caixa"><div className="cg-rolagem"><table className="cg-tabela">
        <thead><tr><th>Empresa</th><th>Plano</th><th>Situação</th><th>Corridas no mês</th><th>Motoristas</th><th>Rede</th><th className="direita">Ações</th></tr></thead>
        <tbody>{d.empresas.map((e) => (
          <tr key={e.id}>
            <td><strong>{e.codigo} - {e.nome}</strong><small style={{ display: "block" }}>{e.marca.dominios.join(", ") || e.id}</small></td>
            <td>{e.plano.nome}</td>
            <td><Selo tom={e.ativa ? "ok" : "ruim"}>{e.ativa ? "Ativa" : "Suspensa"}</Selo>{e.suspensao && <small style={{ display: "block" }}>{e.suspensao.motivo}</small>}</td>
            <td>{e.uso.corridasFinalizadas}</td><td>{e.uso.motoristasAtivos}/{e.uso.motoristas}</td>
            <td>{e.rede.tipo === "principal" ? `Principal (${e.rede.associadas})` : e.rede.tipo === "associada" ? "Associada" : "Isolada"}</td>
            <td className="direita">
              <button className="cg-botao" onClick={() => entrarComo(e.id)}><LogIn size={14} /> Entrar</button>{" "}
              <MenuAcoes itens={e.ativa ? [{ rotulo: "Suspender", perigo: true, onClick: () => setSuspendendo(e) }] : [{ rotulo: "Reativar", onClick: () => void tentar(async () => { await api("POST", `/empresas/${e.id}/reativar`); recarregar(); }, "Empresa reativada.") }]} />
            </td>
          </tr>))}
        </tbody>
      </table></div>{!d.empresas.length && <Vazio titulo="Nenhuma empresa." />}</div>
      {nova && <NovaEmpresa d={d} onFechar={() => setNova(false)} onSalvo={recarregar} />}
      {suspendendo && <Suspender e={suspendendo} onFechar={() => setSuspendendo(null)} onSalvo={recarregar} />}
    </>
  );
}

function NovaEmpresa({ d, onFechar, onSalvo }: { d: Lista; onFechar: () => void; onSalvo: () => void }) {
  const [v, setV] = useState({ nome: "", plano: "essencial", adminNome: "", adminEmail: "", adminSenha: "" });
  const { aviso, tentar } = useAviso();
  const salvar = async () => { if (await tentar(() => api("POST", "/empresas", v), "Empresa criada.")) { onSalvo(); onFechar(); } };
  return (
    <Janela aberta titulo="Nova empresa" sub="Cria a empresa e o primeiro ADMIN dela" onFechar={onFechar} largura="pequena" rodape={<><button className="cg-botao" onClick={onFechar}>Cancelar</button><button className="cg-botao primario" onClick={() => void salvar()}>Criar</button></>}>
      {aviso}
      <div style={{ display: "grid", gap: 12 }}>
        <Campo rotulo="Nome da empresa *"><input value={v.nome} onChange={(e) => setV({ ...v, nome: e.target.value })} /></Campo>
        <Campo rotulo="Plano"><select value={v.plano} onChange={(e) => setV({ ...v, plano: e.target.value })}>{d.planos.map((p) => <option key={p.id} value={p.id}>{p.nome} ({dinheiro(p.mensalidade)}/mês)</option>)}</select></Campo>
        <Campo rotulo="Nome do ADMIN"><input value={v.adminNome} onChange={(e) => setV({ ...v, adminNome: e.target.value })} /></Campo>
        <Campo rotulo="E-mail do ADMIN"><input type="email" value={v.adminEmail} onChange={(e) => setV({ ...v, adminEmail: e.target.value })} /></Campo>
        <Campo rotulo="Senha do ADMIN" dica="Mínimo de 8 caracteres."><input type="password" autoComplete="new-password" value={v.adminSenha} onChange={(e) => setV({ ...v, adminSenha: e.target.value })} /></Campo>
      </div>
    </Janela>
  );
}

function Suspender({ e, onFechar, onSalvo }: { e: Resumo; onFechar: () => void; onSalvo: () => void }) {
  const [motivo, setMotivo] = useState("");
  const { aviso, tentar } = useAviso();
  const salvar = async () => { if (await tentar(() => api("POST", `/empresas/${e.id}/suspender`, { motivo }), "Empresa suspensa.")) { onSalvo(); onFechar(); } };
  return (
    <Janela aberta titulo={`Suspender ${e.nome}`} sub="Ninguém da empresa entra no painel nem nos apps até você reativar. Nada é apagado." onFechar={onFechar} largura="pequena" rodape={<><button className="cg-botao" onClick={onFechar}>Cancelar</button><button className="cg-botao perigo" onClick={() => void salvar()}>Suspender</button></>}>
      {aviso}
      <Campo rotulo="Motivo"><input value={motivo} maxLength={200} onChange={(ev) => setMotivo(ev.target.value)} placeholder="Ex.: mensalidade em atraso" /></Campo>
    </Janela>
  );
}

function Recursos({ d, tentar, recarregar }: PropsAba) {
  return (
    <div className="cg-tabela-caixa"><div className="cg-rolagem"><table className="cg-tabela">
      <thead><tr><th>Empresa</th><th>Plano</th>{d.recursos.map((r) => <th key={r.id} title={r.descricao}>{r.nome}</th>)}</tr></thead>
      <tbody>{d.empresas.map((e) => (
        <tr key={e.id}>
          <td><strong>{e.nome}</strong></td>
          <td><select value={e.plano.id} onChange={(ev) => void tentar(async () => { await api("PUT", `/empresas/${e.id}/plano`, { plano: ev.target.value }); recarregar(); }, "Plano alterado.")}>{d.planos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></td>
          {d.recursos.map((r) => {
            const ligado = !e.recursosDesligados.includes(r.id);
            return <td key={r.id}><Interruptor ligado={ligado} onChange={(x) => void tentar(async () => { await api("PUT", `/empresas/${e.id}/recursos`, { desligados: x ? e.recursosDesligados.filter((m) => m !== r.id) : [...e.recursosDesligados, r.id] }); recarregar(); }, x ? "Recurso ligado." : "Recurso desligado.")} /></td>;
          })}
        </tr>))}
      </tbody>
    </table></div></div>
  );
}

function Marcas({ d, tentar, recarregar }: PropsAba) {
  const [sel, setSel] = useState(d.empresas[0]?.id ?? "");
  const e = d.empresas.find((x) => x.id === sel) ?? d.empresas[0];
  const [v, setV] = useState<{ produto: string; nomeExibido: string; corPrimaria: string; dominios: string } | null>(null);
  const atual = v ?? (e ? { produto: e.marca.produto, nomeExibido: e.marca.nomeExibido, corPrimaria: e.marca.corPrimaria, dominios: e.marca.dominios.join("\n") } : null);
  if (!e || !atual) return <Vazio titulo="Nenhuma empresa." />;
  const set = (k: keyof typeof atual, x: string) => setV({ ...atual, [k]: x });
  return (
    <div className="cg-cartao" style={{ maxWidth: 560, display: "grid", gap: 12 }}>
      <Campo rotulo="Empresa"><select value={e.id} onChange={(ev) => { setSel(ev.target.value); setV(null); }}>{d.empresas.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></Campo>
      <Campo rotulo="Nome do produto"><input value={atual.produto} onChange={(ev) => set("produto", ev.target.value)} /></Campo>
      <Campo rotulo="Nome exibido"><input value={atual.nomeExibido} onChange={(ev) => set("nomeExibido", ev.target.value)} /></Campo>
      <Campo rotulo="Cor principal"><input type="color" value={atual.corPrimaria} onChange={(ev) => set("corPrimaria", ev.target.value)} /></Campo>
      <Campo rotulo="Domínios" dica="Um por linha, como painel.minhaempresa.com.br. Cada domínio vale para uma empresa só."><textarea rows={3} value={atual.dominios} onChange={(ev) => set("dominios", ev.target.value)} /></Campo>
      <div><button className="cg-botao primario" onClick={() => void tentar(async () => { await api("PUT", `/empresas/${e.id}/marca`, { produto: atual.produto, nomeExibido: atual.nomeExibido, corPrimaria: atual.corPrimaria, dominios: atual.dominios.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean) }); setV(null); recarregar(); }, "Marca salva.")}>Salvar</button></div>
    </div>
  );
}

function Uso({ comp }: { comp: string }) {
  const u = useCarregar(() => api<{ competencia: string; totais: Record<string, number>; empresas: Array<Record<string, any>> }>("GET", `/uso?competencia=${comp}`), [comp]); // eslint-disable-line @typescript-eslint/no-explicit-any
  const baixar = async () => {
    const r = await fetch(`/api/superadmin/uso/csv?competencia=${comp}`, { credentials: "same-origin" });
    if (!r.ok) return;
    const a = document.createElement("a"); a.href = URL.createObjectURL(await r.blob()); a.download = `uso-plataforma-${comp}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const t = u.dados?.totais;
  return (
    <>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "12px 0", alignItems: "center" }}>
        {t && <><Selo tom="info">{t.ativas}/{t.empresas} empresas ativas</Selo><Selo tom="neutro">{t.corridasFinalizadas} corridas</Selo><Selo tom="neutro">Receita bruta {dinheiro(t.receitaBruta)}</Selo><Selo tom="ok">A receber da plataforma {dinheiro(t.aPagar)}</Selo></>}
        <button className="cg-botao" onClick={() => void baixar()}><Download size={14} /> CSV</button>
      </div>
      <div className="cg-tabela-caixa"><div className="cg-rolagem"><table className="cg-tabela">
        <thead><tr><th>Empresa</th><th>Plano</th><th>Corridas</th><th>Receita bruta</th><th>Tarifas</th><th>A pagar</th><th>Motoristas</th><th>Passageiros</th></tr></thead>
        <tbody>{u.dados?.empresas.map((e) => <tr key={e.id}><td><strong>{e.nome}</strong>{!e.ativa && <Selo tom="ruim">Suspensa</Selo>}</td><td>{e.plano}</td><td>{e.corridasFinalizadas}</td><td>{dinheiro(e.receitaBruta)}</td><td>{dinheiro(e.tarifas)}</td><td>{dinheiro(e.aPagar)}</td><td>{e.motoristasAtivos}/{e.motoristas}</td><td>{e.passageiros}</td></tr>)}</tbody>
      </table></div></div>
    </>
  );
}

function Centrais({ tentar }: { tentar: Tentar }) {
  const r = useCarregar(() => api<Rede>("GET", "/centrais"), []);
  const [principal, setPrincipal] = useState("");
  const [associada, setAssociada] = useState("");
  const [nova, setNova] = useState({ principal: "", nome: "" });
  const d = r.dados;
  return (
    <div style={{ display: "grid", gap: 16 }}>
      {d?.principais.map((p) => (
        <div className="cg-cartao" key={p.id}>
          <h4>{p.codigo} - {p.nome} <Selo tom="info">Principal</Selo></h4>
          {p.associadas.map((a) => (
            <div className="cg-pessoa" key={a.id}><div><strong>{a.codigo} - {a.nome}</strong> {!a.ativa && <Selo tom="ruim">Suspensa</Selo>}</div>
              <button className="cg-botao" onClick={() => confirm(`Desfazer o vínculo de ${a.nome}?`) && void tentar(async () => { await api("DELETE", `/centrais/associadas/${a.id}`); r.recarregar(); }, "Vínculo desfeito.")}>Soltar</button></div>
          ))}
        </div>
      ))}
      {d && !d.principais.length && <Vazio titulo="Ainda não há centrais principais." sub="Ligue uma empresa a outra abaixo." />}
      <div className="cg-cartao" style={{ display: "grid", gap: 12, maxWidth: 560 }}>
        <h4>Ligar uma empresa existente a uma principal</h4>
        <Campo rotulo="Central principal"><select value={principal} onChange={(e) => setPrincipal(e.target.value)}><option value="">Escolha</option>{[...(d?.principais ?? []), ...(d?.livres ?? [])].map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></Campo>
        <Campo rotulo="Central associada"><select value={associada} onChange={(e) => setAssociada(e.target.value)}><option value="">Escolha</option>{d?.livres.filter((x) => x.id !== principal).map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></Campo>
        <div><button className="cg-botao primario" disabled={!principal || !associada} onClick={() => void tentar(async () => { await api("POST", "/centrais/vincular", { principalId: principal, associadaId: associada }); setAssociada(""); r.recarregar(); }, "Central ligada.")}>Ligar</button></div>
      </div>
      <div className="cg-cartao" style={{ display: "grid", gap: 12, maxWidth: 560 }}>
        <h4>Abrir uma central associada nova</h4>
        <Campo rotulo="Central principal"><select value={nova.principal} onChange={(e) => setNova({ ...nova, principal: e.target.value })}><option value="">Escolha</option>{[...(d?.principais ?? []), ...(d?.livres ?? [])].map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></Campo>
        <Campo rotulo="Nome da nova central"><input value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} /></Campo>
        <div><button className="cg-botao primario" disabled={!nova.principal || nova.nome.trim().length < 2} onClick={() => void tentar(async () => { await api("POST", `/centrais/${nova.principal}/associadas`, { nome: nova.nome }); setNova({ ...nova, nome: "" }); r.recarregar(); }, "Central criada.")}>Abrir central</button></div>
      </div>
    </div>
  );
}
