// Relatórios (índice): relatórios padrão, modelos personalizados e "Criar modelo".

import { useState } from "react";
import { funcaoPorId } from "../../../comum/funcoes.ts";
import { FileText, MoreVertical, Plus } from "lucide-react";
import { Aviso, Campo, Cab, Carregando, Modal, useAdmin, useCarregar, useSalvar } from "../demais/comum";
import { pedirRel } from "./comum";
import Relatorio, { useDefinicoes } from "./Relatorio";
import "./relatorios.css";

// Os 9 relatórios padrão, na ordem da Machine (o primeiro é a lista de motoristas).
const PADRAO = ["motoristas", "faturamento-empresa", "faturamento-centro-custo", "faturamento-periodo", "vouchers-motoristas", "os-motorista", "os-pagamento", "os-percentual-motorista", "km-rodados"];

export default function Indice() {
  const admin = useAdmin();
  const d = useCarregar(() => pedirRel<any>("/indice"), []);
  const defs = useDefinicoes();
  const { msg, salvar } = useSalvar();
  const [aberto, setAberto] = useState<{ base: string; filtros: Record<string, any> } | null>(null);
  const [criando, setCriando] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [nome, setNome] = useState(""), [base, setBase] = useState(""), [empresa, setEmpresa] = useState(""), [pagamento, setPagamento] = useState("");

  if (aberto) return <Relatorio id={aberto.base} filtrosIniciais={aberto.filtros} aoVoltar={() => setAberto(null)} />;
  const x = d.dados;
  const bases: any[] = defs.dados?.relatorios ?? [];

  return (
    <>
      <Cab titulo="Relatórios" />
      <Aviso erro={d.erro ?? msg?.erro} ok={msg?.ok} />
      <section className="dm-cartao">
        <p><strong>Relatórios padrão</strong></p>
        <div className="index-relatorios">
          {PADRAO.map((id, i) => {
            const f = funcaoPorId(id)!;
            return <a key={id} href={f.rota} target="_blank" rel="noopener noreferrer"><span className="numero">{i + 1}</span><FileText size={26} color="#00a9e2" aria-hidden /><h4>{f.nome}</h4></a>;
          })}
        </div>
      </section>
      <div className="dm-cartao tabela-rola">
        <div className="dm-cab"><p><strong>Modelos de relatórios personalizados</strong></p>{admin && <button className="botao primario" onClick={() => setCriando(true)}><Plus size={14} /> Criar modelo</button>}</div>
        <table>
          <thead><tr><th>Nome do relatório</th><th>Criado por</th><th /></tr></thead>
          <tbody>
            {!x ? <tr><td colSpan={3}><Carregando /></td></tr> : x.modelos.map((m: any) => (
              <tr key={m.id}>
                <td><button className="modelo-nome" onClick={() => setAberto({ base: m.base, filtros: m.filtros })}><FileText size={18} color="#00a9e2" aria-hidden /> {m.nome}</button></td>
                <td>{m.sugerido ? "Modelo sugerido" : m.por}</td>
                <td>
                  <div className="modelo-menu">
                    <button className="icone" aria-label={`Opções de ${m.nome}`} aria-haspopup="menu" aria-expanded={menu === m.id} onClick={() => setMenu(menu === m.id ? null : m.id)}><MoreVertical size={16} /></button>
                    {menu === m.id && (
                      <ul role="menu">
                        <li role="none"><button role="menuitem" onClick={() => { setMenu(null); setAberto({ base: m.base, filtros: m.filtros }); }}>Abrir</button></li>
                        {admin && !m.sugerido && <li role="none"><button role="menuitem" onClick={() => { setMenu(null); if (confirm(`Apagar o modelo "${m.nome}"?`)) salvar(async () => { await pedirRel(`/modelos/${m.id}`, "DELETE"); d.recarregar(); }, "Modelo apagado."); }}>Apagar</button></li>}
                      </ul>
                    )}
                  </div>
                </td>
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
