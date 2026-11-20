// Ajuda › Ouvidoria: registrar reclamação, sugestão ou elogio (com protocolo) e acompanhar. O admin vê todas, responde e muda o status.
// Servidor: /api/gestao/ouvidoria.

import { useState } from "react";
import { Plus } from "lucide-react";
import { useCarregar } from "../../componentes/ui";
import { Cabecalho, Campo, chamar, consulta, Janela, Paginacao, Selo, useAviso, Vazio } from "../cadastro/base";
import { useSessao } from "../../App";
import { podeCargo } from "../../../comum/cargos";

interface Manifestacao { id: string; protocolo: string; tipo: string; assunto: string; mensagem: string; nome: string; contato: string; email: string; status: string; resposta: string; criadoEm: string; atualizadoEm: string; respondidoPor: string }
interface Resposta { manifestacoes: Manifestacao[]; paginacao: { atual: number; totalPaginas: number }; todas: boolean; tipos: string[]; situacoes: string[]; kpis: { total: number; abertas: number; emAnalise: number; respondidas: number } }
const TOM: Record<string, "ok" | "alerta" | "info" | "neutro"> = { Aberto: "alerta", "Em análise": "info", Respondido: "ok", Encerrado: "neutro" };
const dataHora = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)} ${s.slice(11, 16)}`;

export default function Ouvidoria() {
  const { sessao } = useSessao();
  const admin = podeCargo(sessao.usuario.papel, "admin");
  const [status, setStatus] = useState(""), [tipo, setTipo] = useState(""), [busca, setBusca] = useState(""), [pagina, setPagina] = useState(1);
  const l = useCarregar(() => chamar<Resposta>("GET", `/ouvidoria${consulta({ status, tipo, busca, pagina })}`), [status, tipo, busca, pagina]);
  const [novo, setNovo] = useState(false);
  const [aberta, setAberta] = useState<Manifestacao | null>(null);
  const [criada, setCriada] = useState<string | null>(null);
  const { aviso } = useAviso();
  const d = l.dados;
  const mudar = (f: () => void) => { f(); setPagina(1); };
  return (
    <div className="cg-pagina-solta">
      {aviso}
      <Cabecalho titulo="Ouvidoria" sub={admin ? "Todas as manifestações da central" : "Suas manifestações"}><button className="cg-botao primario" onClick={() => setNovo(true)}><Plus size={16} /> Nova manifestação</button></Cabecalho>
      {criada && <div className="cg-aviso ok" role="status">Manifestação registrada. Guarde o protocolo: <strong>{criada}</strong></div>}
      <div className="cg-kpis">
        <div className="cg-kpi"><span>Total</span><strong>{d?.kpis.total ?? 0}</strong></div>
        <div className="cg-kpi"><span>Abertas</span><strong>{d?.kpis.abertas ?? 0}</strong></div>
        <div className="cg-kpi"><span>Em análise</span><strong>{d?.kpis.emAnalise ?? 0}</strong></div>
        <div className="cg-kpi"><span>Respondidas</span><strong>{d?.kpis.respondidas ?? 0}</strong></div>
      </div>
      <div className="cg-filtros-linha">
        <input placeholder="Buscar por protocolo, assunto ou nome" aria-label="Buscar" value={busca} onChange={(e) => mudar(() => setBusca(e.target.value))} />
        <select aria-label="Tipo" value={tipo} onChange={(e) => mudar(() => setTipo(e.target.value))}><option value="">Tipo (todos)</option>{(d?.tipos ?? []).map((t) => <option key={t}>{t}</option>)}</select>
        <select aria-label="Situação" value={status} onChange={(e) => mudar(() => setStatus(e.target.value))}><option value="">Situação (todas)</option>{(d?.situacoes ?? []).map((t) => <option key={t}>{t}</option>)}</select>
      </div>
      {l.erro && <div className="cg-aviso erro">{l.erro}</div>}
      <div className="cg-tabela-caixa">
        {d && !d.manifestacoes.length ? <Vazio titulo="Nenhuma manifestação encontrada." sub="Use Nova manifestação para registrar uma reclamação, sugestão ou elogio." /> : (
          <div className="cg-rolagem"><table className="cg-tabela">
            <thead><tr><th>Protocolo</th><th>Tipo</th><th>Assunto</th>{d?.todas && <th>Quem</th>}<th>Data</th><th>Situação</th></tr></thead>
            <tbody>{d?.manifestacoes.map((m) => (
              <tr key={m.id} onClick={() => setAberta(m)} style={{ cursor: "pointer" }}>
                <td><strong className="cg-mono">{m.protocolo}</strong></td><td>{m.tipo}</td><td>{m.assunto}</td>{d.todas && <td>{m.nome}<br /><small className="cg-mono">{m.email}</small></td>}
                <td>{dataHora(m.criadoEm)}</td><td><Selo tom={TOM[m.status] ?? "neutro"}>{m.status}</Selo></td>
              </tr>))}</tbody>
          </table></div>
        )}
        {!!d?.manifestacoes.length && <Paginacao atual={d.paginacao.atual} total={d.paginacao.totalPaginas} onChange={setPagina} />}
      </div>
      {novo && d && <Formulario tipos={d.tipos} onFechar={() => setNovo(false)} onCriada={(p) => { setCriada(p); l.recarregar(); }} />}
      {aberta && d && <Detalhe m={aberta} admin={admin} situacoes={d.situacoes} onFechar={() => setAberta(null)} onSalvo={() => { setAberta(null); l.recarregar(); }} />}
    </div>
  );
}

function Formulario({ tipos, onFechar, onCriada }: { tipos: string[]; onFechar: () => void; onCriada: (protocolo: string) => void }) {
  const [f, setF] = useState({ tipo: tipos[0] ?? "Reclamação", assunto: "", mensagem: "", contato: "" });
  const { aviso, tentar } = useAviso();
  const enviar = async () => {
    let protocolo = "";
    if (await tentar(async () => { protocolo = (await chamar<{ manifestacao: { protocolo: string } }>("POST", "/ouvidoria", f)).manifestacao.protocolo; })) { onCriada(protocolo); onFechar(); }
  };
  return (
    <Janela aberta titulo="Nova manifestação" sub="Reclamação, sugestão ou elogio" onFechar={onFechar} rodape={<><button className="cg-botao" onClick={onFechar}>Cancelar</button><button className="cg-botao primario" onClick={() => void enviar()}>Enviar</button></>}>
      {aviso}
      <div className="cg-grade">
        <Campo rotulo="Tipo *"><select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>{tipos.map((t) => <option key={t}>{t}</option>)}</select></Campo>
        <Campo rotulo="Assunto *"><input value={f.assunto} maxLength={120} onChange={(e) => setF({ ...f, assunto: e.target.value })} /></Campo>
        <Campo rotulo="Mensagem *" dica="Conte com detalhes: o que aconteceu, quando e com quem."><textarea rows={6} value={f.mensagem} maxLength={3000} onChange={(e) => setF({ ...f, mensagem: e.target.value })} /></Campo>
        <Campo rotulo="Contato para retorno" dica="Telefone ou e-mail, se quiser ser chamado."><input value={f.contato} maxLength={120} onChange={(e) => setF({ ...f, contato: e.target.value })} /></Campo>
      </div>
    </Janela>
  );
}

function Detalhe({ m, admin, situacoes, onFechar, onSalvo }: { m: Manifestacao; admin: boolean; situacoes: string[]; onFechar: () => void; onSalvo: () => void }) {
  const [status, setStatus] = useState(m.status), [resposta, setResposta] = useState(m.resposta);
  const { aviso, tentar } = useAviso();
  return (
    <Janela aberta titulo={m.protocolo} sub={`${m.tipo} · ${dataHora(m.criadoEm)}`} onFechar={onFechar}
      rodape={admin ? <><button className="cg-botao" onClick={onFechar}>Fechar</button><button className="cg-botao primario" onClick={() => void tentar(async () => { await chamar("PUT", `/ouvidoria/${m.id}`, { status, resposta }); onSalvo(); })}>Salvar</button></> : <button className="cg-botao" onClick={onFechar}>Fechar</button>}>
      {aviso}
      <h4 style={{ margin: "0 0 4px" }}>{m.assunto}</h4>
      <p style={{ whiteSpace: "pre-wrap", margin: "0 0 10px" }}>{m.mensagem}</p>
      <small className="cg-mono">{m.nome} · {m.email}{m.contato ? ` · retorno: ${m.contato}` : ""}</small>
      <div className="cg-grade" style={{ marginTop: 14 }}>
        {admin ? (
          <>
            <Campo rotulo="Situação"><select value={status} onChange={(e) => setStatus(e.target.value)}>{situacoes.map((s) => <option key={s}>{s}</option>)}</select></Campo>
            <Campo rotulo="Resposta"><textarea rows={5} value={resposta} maxLength={3000} onChange={(e) => setResposta(e.target.value)} /></Campo>
          </>
        ) : (
          <>
            <Campo rotulo="Situação"><div><Selo tom={TOM[m.status] ?? "neutro"}>{m.status}</Selo></div></Campo>
            {m.resposta && <Campo rotulo="Resposta"><p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{m.resposta}</p></Campo>}
          </>
        )}
      </div>
    </Janela>
  );
}
