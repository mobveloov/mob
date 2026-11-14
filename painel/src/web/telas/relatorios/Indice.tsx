// Relatórios (índice): relatórios padrão, modelos personalizados e "Criar modelo".

import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import { Aviso, Campo, Cab, Carregando, Modal, useAdmin, useCarregar, useSalvar } from "../demais/comum";
import { pedirRel } from "./comum";
import Relatorio, { useDefinicoes } from "./Relatorio";

export default function Indice() {
  const admin = useAdmin();
  const d = useCarregar(() => pedirRel<any>("/indice"), []);
  const defs = useDefinicoes();
  const { msg, salvar } = useSalvar();
  const [aberto, setAberto] = useState<{ base: string; filtros: Record<string, any> } | null>(null);
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState(""), [base, setBase] = useState(""), [empresa, setEmpresa] = useState(""), [pagamento, setPagamento] = useState("");

  if (aberto) return <Relatorio id={aberto.base} filtrosIniciais={aberto.filtros} aoVoltar={() => setAberto(null)} />;
  const x = d.dados;
  const bases: any[] = defs.dados?.relatorios ?? [];

  return (
    <>
      <Cab titulo="Relatórios" sub="Relatórios padrão e modelos personalizados da central." />
      <Aviso erro={d.erro ?? msg?.erro} ok={msg?.ok} />
      <div className="dm-cartao">
        <h3>Relatórios padrão</h3>
        {!x ? <Carregando /> : (
          <ol>
            <li><Link to="/relatorios">Motoristas</Link></li>
            {x.padrao.map((r: any) => <li key={r.id}><Link to={r.rota}>{r.titulo}</Link></li>)}
          </ol>
        )}
      </div>
      <div className="dm-cartao tabela-rola">
        <div className="dm-cab"><h3>Modelos de relatórios personalizados</h3>{admin && <button className="botao primario" onClick={() => setCriando(true)}><Plus size={14} /> Criar modelo</button>}</div>
        <table>
          <thead><tr><th>Nome do relatório</th><th>Criado por</th><th>Baseado em</th><th /></tr></thead>
          <tbody>
            {!x ? <tr><td colSpan={4}><Carregando /></td></tr> : x.modelos.map((m: any) => (
              <tr key={m.id}>
                <td><button className="dm-ordem" onClick={() => setAberto({ base: m.base, filtros: m.filtros })}>{m.nome}</button></td>
                <td>{m.sugerido ? "Modelo sugerido" : m.por}</td>
                <td>{m.baseNome}</td>
                <td>{admin && !m.sugerido && <button className="icone" aria-label={`Apagar modelo ${m.nome}`} onClick={() => confirm(`Apagar o modelo "${m.nome}"?`) && salvar(async () => { await pedirRel(`/modelos/${m.id}`, "DELETE"); d.recarregar(); }, "Modelo apagado.")}><Trash2 size={15} /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal aberto={criando} onFechar={() => setCriando(false)} titulo="Criar modelo" sub="Salva um relatório com os filtros já escolhidos.">
        <Campo rotulo="Nome do relatório *"><input value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} /></Campo>
        <Campo rotulo="Baseado em *"><select value={base} onChange={(e) => setBase(e.target.value)}><option value="">Selecione</option>{bases.map((b) => <option key={b.id} value={b.id}>{b.titulo}</option>)}</select></Campo>
        <Campo rotulo="Empresa (opcional)"><select value={empresa} onChange={(e) => setEmpresa(e.target.value)}><option value="">Todas</option>{defs.dados?.opcoes.empresas.map((n: string) => <option key={n}>{n}</option>)}</select></Campo>
        <Campo rotulo="Forma de pagamento (opcional)"><select value={pagamento} onChange={(e) => setPagamento(e.target.value)}><option value="">Todas</option>{defs.dados?.formas.map((n: string) => <option key={n}>{n}</option>)}</select></Campo>
        <div className="dm-rodape-modal">
          <button className="botao" onClick={() => setCriando(false)}>Cancelar</button>
          <button className="botao primario" onClick={async () => { const r = await salvar(async () => { await pedirRel("/modelos", "POST", { nome, base, filtros: { empresa, pagamento } }); d.recarregar(); return true; }, "Modelo criado."); if (r) { setCriando(false); setNome(""); setBase(""); } }}>Criar</button>
        </div>
      </Modal>
    </>
  );
}
