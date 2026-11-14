// Alertas para empresas (Comunicação): lista com filtros (empresa, conteúdo, tipo, status) e a tela "Criar Alerta".
// Criar e encerrar: administrador e operador, como nas notificações push.
import { useState } from "react";
import { Aviso, Cab, Campo, Carregando, dataHoraBr, pedirConfig, useCarregar, useSalvar } from "./comum";

const TOM: Record<string, string> = { Urgente: "ruim", "Atenção": "alerta", Aviso: "info" };
const VAZIO = { empresa: "", conteudo: "", tipo: "", status: "" };

export function AlertasEmpresas() {
  const [criando, setCriando] = useState(false);
  const [f, setF] = useState(VAZIO), [aplicado, setAplicado] = useState(VAZIO);
  const qs = new URLSearchParams(Object.entries(aplicado).filter(([, v]) => v)).toString();
  const d = useCarregar(() => pedirConfig(`/alertas?${qs}`), [qs]);
  const { msg, salvar } = useSalvar();
  if (criando) return <CriarAlerta empresas={d.dados?.empresas ?? []} onVoltar={() => setCriando(false)} onCriado={() => { setCriando(false); d.recarregar(); }} />;
  const x = d.dados;
  return (
    <>
      <Cab titulo="Alertas para empresas" sub="Avisos com início e duração, para uma empresa cliente ou para todas">
        <button className="botao primario" onClick={() => setCriando(true)}>Criar Alerta</button>
      </Cab>
      <form className="dm-cartao dm-filtros" onSubmit={(e) => { e.preventDefault(); setAplicado(f); }}>
        <Campo rotulo="Empresa"><select value={f.empresa} onChange={(e) => setF({ ...f, empresa: e.target.value })}><option value="">Selecione</option><option value="sem">Todas as empresas</option>{(x?.empresas ?? []).map((e: any) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></Campo>
        <Campo rotulo="Conteúdo do alerta"><input value={f.conteudo} onChange={(e) => setF({ ...f, conteudo: e.target.value })} maxLength={80} /></Campo>
        <Campo rotulo="Tipo de alerta"><select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}><option value="">Todos</option>{(x?.tipos ?? []).map((t: string) => <option key={t}>{t}</option>)}</select></Campo>
        <Campo rotulo="Status"><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">Todos</option><option>Ativo</option><option>Inativo</option></select></Campo>
        <button className="botao primario">Filtrar</button>
        <button type="button" className="botao" onClick={() => { setF(VAZIO); setAplicado(VAZIO); }}>Limpar filtros</button>
      </form>
      <Aviso erro={d.erro ?? msg?.erro} ok={msg?.ok} />
      <div className="dm-cartao tabela-rola">
        <table>
          <thead><tr><th>Empresa</th><th>Conteúdo do alerta</th><th>Tipo</th><th>Data de início</th><th>Data de término</th><th>Status</th><th /></tr></thead>
          <tbody>
            {!x ? <tr><td colSpan={7}><Carregando /></td></tr> : !x.itens.length ? <tr><td colSpan={7} className="vazio">Nenhum resultado encontrado.</td></tr> : x.itens.map((a: any) => (
              <tr key={a.id}><td>{a.empresaAlvo}</td><td>{a.conteudo}<small className="bloco">por {a.criadoPor}</small></td>
                <td><span className={`selo ${TOM[a.tipo]}`}>{a.tipo}</span></td><td>{dataHoraBr(a.inicioEm)}</td><td>{dataHoraBr(a.encerradoEm ?? a.terminoEm)}</td>
                <td><span className={`selo ${a.status === "Ativo" ? "ok" : ""}`}>{a.agendado ? "Inativo (agendado)" : a.status}</span></td>
                <td>{a.status === "Ativo" && <button className="botao" onClick={() => { if (confirm("Encerrar este alerta agora?")) salvar(async () => { await pedirConfig(`/alertas/${a.id}/encerrar`, "POST", {}); d.recarregar(); }, "Alerta encerrado."); }}>Encerrar</button>}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

const hojeBr = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

function CriarAlerta({ empresas, onVoltar, onCriado }: { empresas: Array<{ id: string; nome: string }>; onVoltar: () => void; onCriado: () => void }) {
  const [f, setF] = useState({ empresaAlvoId: "todos", tipo: "", conteudo: "", data: hojeBr(), hora: "00:00", duracao: "1", unidade: "Dias" });
  const { msg, salvando, salvar } = useSalvar();
  const set = (k: string, v: string) => setF({ ...f, [k]: v });
  return (
    <>
      <Cab titulo="Criar Alerta" sub="Campos com * são obrigatórios." />
      <form className="dm-cartao dm-form" onSubmit={async (e) => { e.preventDefault(); const r = await salvar(() => pedirConfig("/alertas", "POST", { ...f, duracao: Number(f.duracao) }), "Alerta criado."); if (r) onCriado(); }}>
        <Campo rotulo="Empresa"><select value={f.empresaAlvoId} onChange={(e) => set("empresaAlvoId", e.target.value)}><option value="todos">Todos</option>{empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></Campo>
        <Campo rotulo="Tipo de alerta *"><select value={f.tipo} onChange={(e) => set("tipo", e.target.value)} required><option value="">Selecione</option><option>Urgente</option><option>Atenção</option><option>Aviso</option></select></Campo>
        <Campo rotulo="Conteúdo do alerta *"><textarea value={f.conteudo} onChange={(e) => set("conteudo", e.target.value)} maxLength={500} rows={4} placeholder="Insira a mensagem para exibir no alerta" required /></Campo>
        <div className="dm-duplo">
          <Campo rotulo="Data de início *"><input type="date" value={f.data} onChange={(e) => set("data", e.target.value)} required /></Campo>
          <Campo rotulo="A partir das *"><input type="time" value={f.hora} onChange={(e) => set("hora", e.target.value)} required /></Campo>
        </div>
        <div className="dm-duplo">
          <Campo rotulo="Exibir alerta por *"><input type="number" min={1} step={1} value={f.duracao} onChange={(e) => set("duracao", e.target.value)} required /></Campo>
          <Campo rotulo="Unidade"><select value={f.unidade} onChange={(e) => set("unidade", e.target.value)}><option>Horas</option><option>Dias</option><option>Semanas</option></select></Campo>
        </div>
        <Aviso erro={msg?.erro} />
        <div className="dm-rodape-modal"><button type="button" className="botao" onClick={onVoltar}>Voltar</button><button className="botao primario" disabled={salvando}>Criar</button></div>
      </form>
    </>
  );
}
