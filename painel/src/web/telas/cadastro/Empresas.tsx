// Cadastro › Empresas (parceiros B2B): empresas conveniadas, funcionários e fatura do mês. Servidor: /api/gestao/empresas.

import { useState } from "react";
import { Download, Plus } from "lucide-react";
import { api } from "../../api";
import { useCarregar } from "../../componentes/ui";
import { Cabecalho, Campo, chamar, ComFiltros, consulta, dinheiro, Janela, MenuAcoes, Paginacao, Selo, useAviso, Vazio } from "./base";

type Empresa = Record<string, string | number | boolean | null> & { id: string; funcionarios: number; faturaMes: number; ativa: boolean };
interface Resposta { empresas: Empresa[]; paginacao: { atual: number; totalPaginas: number }; kpis: { ativas: number; faturaMes: number } }

export default function Empresas() {
  const [busca, setBusca] = useState("");
  const [termo, setTermo] = useState("");
  const [pagina, setPagina] = useState(1);
  const l = useCarregar(() => chamar<Resposta>("GET", `/empresas${consulta({ busca: termo, pagina })}`), [termo, pagina]);
  const cidades = useCarregar(() => chamar<{ cidades: string[] }>("GET", "/cidades"), []);
  const [editando, setEditando] = useState<Empresa | "nova" | null>(null);
  const [func, setFunc] = useState<Empresa | null>(null);
  const { aviso, tentar } = useAviso();
  const d = l.dados;

  const relatorio = () => {
    const linhas = [["Empresa", "CNPJ", "Responsável", "Cidade", "Funcionários", "Fatura do mês", "Situação"], ...(d?.empresas ?? []).map((e) => [e.nome, e.cnpj ?? "", e.contato ?? "", e.cidade ?? "", e.funcionarios, e.faturaMes, e.status])];
    const csv = linhas.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
    a.download = "empresas.csv"; a.click(); URL.revokeObjectURL(a.href);
  };

  return (
    <div className="cg-pagina-solta">
      {aviso}
      <Cabecalho titulo="Parceiros B2B" sub="Gestão de Empresas"><button className="cg-botao primario" onClick={() => setEditando("nova")}><Plus size={16} /> Nova Empresa</button></Cabecalho>
      <ComFiltros filtros={
        <form onSubmit={(e) => { e.preventDefault(); setPagina(1); setTermo(busca); }}>
          <Campo rotulo="Buscar"><input placeholder="Nome" value={busca} onChange={(e) => setBusca(e.target.value)} /></Campo>
          <button className="cg-botao primario cheio">Filtrar</button>
          <button type="button" className="cg-botao cheio" onClick={() => { setBusca(""); setTermo(""); setPagina(1); }}>Limpar</button>
        </form>
      }>
        <div className="cg-kpis">
          <div className="cg-kpi"><span>Ativas</span><strong>{d?.kpis.ativas ?? 0}</strong></div>
          <div className="cg-kpi"><span>Fatura Mês</span><strong>{dinheiro(d?.kpis.faturaMes)}</strong></div>
          <div className="cg-kpi" style={{ display: "flex", alignItems: "center" }}><button className="cg-botao cheio" onClick={relatorio}><Download size={14} /> Relatório</button></div>
        </div>
        <div className="cg-tabela-caixa">
          <div className="cg-rolagem"><table className="cg-tabela">
            <thead><tr><th>Empresa</th><th>Responsável</th><th>Cidade</th><th>Funcionários</th><th>Fatura Mês</th><th>Status</th><th className="direita">Ações</th></tr></thead>
            <tbody>{d?.empresas.map((e) => (
              <tr key={e.id}>
                <td><strong>{String(e.nome)}</strong><br /><small className="cg-mono">{String(e.cnpj ?? "")}</small></td>
                <td>{String(e.contato ?? "")}<br /><small className="cg-mono">{String(e.telefone ?? "")}</small></td>
                <td>{String(e.cidade ?? "")}</td><td>{e.funcionarios}</td><td>{dinheiro(e.faturaMes)}</td>
                <td><Selo tom={e.ativa ? "ok" : "neutro"}>{String(e.status)}</Selo></td>
                <td className="direita"><MenuAcoes itens={[
                  { rotulo: "Editar", onClick: () => setEditando(e) }, { rotulo: "Adicionar funcionário", onClick: () => setFunc(e) },
                  { rotulo: "Excluir", perigo: true, onClick: () => confirm(`Excluir ${e.nome}?`) && void tentar(async () => { await api.apagarRegistro("conveniadas", e.id); l.recarregar(); }, "Empresa excluída.") },
                ]} /></td>
              </tr>))}
            </tbody>
          </table></div>
          {d && !d.empresas.length && <Vazio titulo="Nenhuma empresa encontrada." />}
          <Paginacao atual={d?.paginacao.atual ?? 1} total={d?.paginacao.totalPaginas ?? 1} onChange={setPagina} />
        </div>
      </ComFiltros>
      {editando && <Formulario e={editando === "nova" ? null : editando} cidades={cidades.dados?.cidades ?? []} onFechar={() => setEditando(null)} onSalvo={() => l.recarregar()} />}
      {func && <Funcionario e={func} onFechar={() => setFunc(null)} onSalvo={() => l.recarregar()} />}
    </div>
  );
}

function Formulario({ e, cidades, onFechar, onSalvo }: { e: Empresa | null; cidades: string[]; onFechar: () => void; onSalvo: () => void }) {
  const t = (k: string) => (e?.[k] == null ? "" : String(e[k]));
  const [f, setF] = useState({ nome: t("nome"), razaoSocial: t("razaoSocial"), cnpj: t("cnpj"), contato: t("contato"), email: t("email"), telefone: t("telefone"), cidade: t("cidade"), status: t("status") || "Ativa" });
  const { aviso, tentar } = useAviso();
  const set = (k: string, v: string) => setF({ ...f, [k]: v });
  const salvar = async () => { if (await tentar(() => (e ? api.salvarRegistro("conveniadas", e.id, { ...e, ...f }) : api.criarRegistro("conveniadas", f)), "Empresa salva.")) { onSalvo(); onFechar(); } };
  return (
    <Janela aberta titulo={e ? "Editar Empresa" : "Nova Empresa"} onFechar={onFechar} rodape={<><button className="cg-botao" onClick={onFechar}>Cancelar</button><button className="cg-botao primario" onClick={() => void salvar()}>Salvar</button></>}>
      {aviso}
      <div className="cg-grade">
        <Campo rotulo="Nome Fantasia *"><input value={f.nome} onChange={(x) => set("nome", x.target.value)} /></Campo>
        <Campo rotulo="Razão Social"><input value={f.razaoSocial} onChange={(x) => set("razaoSocial", x.target.value)} /></Campo>
        <Campo rotulo="CNPJ"><input value={f.cnpj} onChange={(x) => set("cnpj", x.target.value)} /></Campo>
        <Campo rotulo="Responsável"><input value={f.contato} onChange={(x) => set("contato", x.target.value)} /></Campo>
        <Campo rotulo="E-mail Responsável"><input type="email" value={f.email} onChange={(x) => set("email", x.target.value)} /></Campo>
        <Campo rotulo="Telefone"><input value={f.telefone} onChange={(x) => set("telefone", x.target.value)} /></Campo>
        <Campo rotulo="Cidade Sede *"><select value={f.cidade} onChange={(x) => set("cidade", x.target.value)}><option value="">Selecione</option>{cidades.map((c) => <option key={c}>{c}</option>)}</select></Campo>
        <Campo rotulo="Situação"><select value={f.status} onChange={(x) => set("status", x.target.value)}><option>Ativa</option><option>Suspensa</option><option>Encerrada</option></select></Campo>
      </div>
    </Janela>
  );
}

function Funcionario({ e, onFechar, onSalvo }: { e: Empresa; onFechar: () => void; onSalvo: () => void }) {
  const [tel, setTel] = useState("");
  const { aviso, tentar } = useAviso();
  return (
    <Janela aberta titulo="Adicionar funcionário" sub={String(e.nome)} onFechar={onFechar} largura="pequena" rodape={<button className="cg-botao primario cheio" onClick={() => void tentar(async () => { await chamar("POST", `/empresas/${e.id}/funcionarios`, { telefone: tel }); onSalvo(); onFechar(); }, "Funcionário vinculado.")}>Vincular</button>}>
      {aviso}
      <Campo rotulo="Telefone do passageiro" dica="O passageiro precisa estar cadastrado."><input value={tel} onChange={(x) => setTel(x.target.value)} /></Campo>
    </Janela>
  );
}
