// Alertas para empresas (Comunicação): lista com filtros (empresa, conteúdo, tipo, status) e a tela "Criar Alerta".
// Criar e encerrar: administrador e operador, como nas notificações push.
import { useState } from "react";
import "./alertas.css";
import { Aviso, Cab, Campo, Carregando, dataHoraBr, pedirConfig, useCarregar, useSalvar } from "./comum";

const TOM: Record<string, string> = { Urgente: "ruim", "Atenção": "alerta", Aviso: "info" };
interface Filtro { empresa: string; conteudo: string; tipo: string[]; status: string[] }
const VAZIO: Filtro = { empresa: "", conteudo: "", tipo: [], status: [] };
const PADRAO: Filtro = { ...VAZIO, status: ["Ativo"] }; // como na Machine, abre só com "Ativo" marcado
const alternar = (l: string[], v: string) => (l.includes(v) ? l.filter((x) => x !== v) : [...l, v]);

export function AlertasEmpresas() {
  const [criando, setCriando] = useState(false);
  const [f, setF] = useState<Filtro>(PADRAO), [aplicado, setAplicado] = useState<Filtro>(PADRAO);
  const qs = new URLSearchParams(Object.entries({ ...aplicado, tipo: aplicado.tipo.join(","), status: aplicado.status.join(",") }).filter(([, v]) => v)).toString();
  const d = useCarregar(() => pedirConfig(`/alertas?${qs}`), [qs]);
  const { msg, salvar } = useSalvar();
  if (criando) return <CriarAlerta empresas={d.dados?.empresas ?? []} onVoltar={() => setCriando(false)} onCriado={() => { setCriando(false); d.recarregar(); }} />;
  const x = d.dados;
  return (
    <>
      <Cab titulo="Alertas para empresas" sub="Avisos com início e duração, para uma empresa cliente ou para todas">
        <button className="botao primario" onClick={() => setCriando(true)}>Criar Alerta</button>
      </Cab>
      <div className="dm-com-filtros">
      <form className="dm-cartao dm-filtros dm-lateral" onSubmit={(e) => { e.preventDefault(); setAplicado(f); }}>
        <h3>Filtros</h3>
        <Campo rotulo="Empresa"><select value={f.empresa} onChange={(e) => setF({ ...f, empresa: e.target.value })}><option value="">Selecione</option>{(x?.empresas ?? []).map((e: any) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></Campo>
        <Campo rotulo="Conteúdo do alerta"><input value={f.conteudo} onChange={(e) => setF({ ...f, conteudo: e.target.value })} maxLength={80} /></Campo>
        <fieldset className="dm-marcas"><legend>Tipo de alerta</legend>
          {(["Urgente", "Atenção", "Aviso"]).map((t) => <label key={t} className="dm-check"><input type="checkbox" checked={f.tipo.includes(t)} onChange={() => setF({ ...f, tipo: alternar(f.tipo, t) })} /> {t}</label>)}
        </fieldset>
        <fieldset className="dm-marcas"><legend>Status</legend>
          {(["Ativo", "Inativo"]).map((t) => <label key={t} className="dm-check"><input type="checkbox" checked={f.status.includes(t)} onChange={() => setF({ ...f, status: alternar(f.status, t) })} /> {t}</label>)}
        </fieldset>
        <button className="botao primario">Filtrar</button>
        <button type="button" className="botao" onClick={() => { setF(VAZIO); setAplicado(VAZIO); }}>Limpar filtros</button>
      </form>
      <div>
      <Aviso erro={d.erro ?? msg?.erro} ok={msg?.ok} />
      <div className="dm-cartao tabela-rola">
        <table>
          <thead><tr><th>Empresa</th><th>Conteúdo do alerta</th><th>Data de início</th><th>Data de término</th><th /></tr></thead>
          <tbody>
            {!x ? <tr><td colSpan={5}><Carregando /></td></tr> : !x.itens.length ? <tr><td colSpan={5} className="vazio">Nenhum resultado encontrado.</td></tr> : x.itens.map((a: any) => (
              <tr key={a.id}><td>{a.empresaAlvo}</td><td><span className={`selo ${TOM[a.tipo]}`}>{a.tipo}</span> {a.conteudo}<small className="bloco">por {a.criadoPor}{a.agendado ? " · agendado" : ""}</small></td>
                <td>{dataHoraBr(a.inicioEm)}</td><td>{dataHoraBr(a.encerradoEm ?? a.terminoEm)}</td>
                <td>{a.status === "Ativo" && <button className="botao" onClick={() => { if (confirm("Encerrar este alerta agora?")) salvar(async () => { await pedirConfig(`/alertas/${a.id}/encerrar`, "POST", {}); d.recarregar(); }, "Alerta encerrado."); }}>Encerrar</button>}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
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
          <Campo rotulo="Exibir alerta por *"><input type="number" min={1} max={750} step={1} value={f.duracao} onChange={(e) => set("duracao", e.target.value)} required /></Campo>
          <Campo rotulo=" "><select value={f.unidade} onChange={(e) => set("unidade", e.target.value)}><option>Horas</option><option>Dias</option><option>Semanas</option></select></Campo>
        </div>
        <Aviso erro={msg?.erro} />
        <div className="dm-rodape-modal"><button type="button" className="botao" onClick={onVoltar}>Voltar</button><button className="botao primario" disabled={salvando}>Criar</button></div>
      </form>
    </>
  );
}
