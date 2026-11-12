// Cadastro › Veículos: frota, quem usa cada veículo e quais ficam guardados. Servidor: /api/gestao/veiculos.

import { useState } from "react";
import { Plus } from "lucide-react";
import { useCarregar } from "../../componentes/ui";
import { Abas, Cabecalho, Campo, chamar, ComFiltros, consulta, Janela, MenuAcoes, Paginacao, Selo, useAviso, Vazio } from "./base";

interface Linha { id: string; modelo: string; cor: string; placa: string; ano: number | null; categoria: string; motoristaId: string; motorista: string; statusMotorista: string; emUso: boolean }
interface Resposta { veiculos: Linha[]; paginacao: { atual: number; totalPaginas: number }; contadores: { todos: number; emUso: number; guardados: number } }
const VAZIO = { modelo: "", placa: "", motorista: "", status: "todos" };

export default function Veiculos() {
  const [form, setForm] = useState(VAZIO);
  const [filtro, setFiltro] = useState(VAZIO);
  const [aba, setAba] = useState<"todos" | "ativo" | "guardado">("todos");
  const [pagina, setPagina] = useState(1);
  const l = useCarregar(() => chamar<Resposta>("GET", `/veiculos${consulta({ ...filtro, status: aba, pagina })}`), [filtro, aba, pagina]);
  const [novo, setNovo] = useState(false);
  const { aviso, tentar } = useAviso();
  const d = l.dados;

  return (
    <div className="cg-pagina-solta">
      {aviso}
      <Cabecalho titulo="Veículos" sub="Frota & Cadastros"><button className="cg-botao primario" onClick={() => setNovo(true)}><Plus size={16} /> Novo Veículo</button></Cabecalho>
      <ComFiltros filtros={
        <form onSubmit={(e) => { e.preventDefault(); setPagina(1); setFiltro(form); }}>
          <Campo rotulo="Modelo / Cor"><input value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} /></Campo>
          <Campo rotulo="Placa"><input value={form.placa} onChange={(e) => setForm({ ...form, placa: e.target.value.toUpperCase() })} /></Campo>
          <Campo rotulo="Motorista"><input value={form.motorista} onChange={(e) => setForm({ ...form, motorista: e.target.value })} /></Campo>
          <Campo rotulo="Status"><select value={aba} onChange={(e) => { setAba(e.target.value as typeof aba); setPagina(1); }}><option value="todos">Todos</option><option value="ativo">Em Uso</option><option value="guardado">Guardados</option></select></Campo>
          <button className="cg-botao primario cheio">Aplicar Filtros</button>
          <button type="button" className="cg-botao cheio" onClick={() => { setForm(VAZIO); setFiltro(VAZIO); setAba("todos"); setPagina(1); }}>Limpar</button>
        </form>
      }>
        <Abas itens={[{ id: "todos" as const, rotulo: "Todos", n: d?.contadores.todos ?? 0 }, { id: "ativo" as const, rotulo: "Em Uso", n: d?.contadores.emUso ?? 0 }, { id: "guardado" as const, rotulo: "Guardados", n: d?.contadores.guardados ?? 0 }]} valor={aba} onChange={(v) => { setAba(v); setPagina(1); }} />
        <div className="cg-tabela-caixa">
          <div className="cg-rolagem"><table className="cg-tabela">
            <thead><tr><th>Veículo</th><th>Placa / Ano</th><th>Motorista</th><th>Status Mot.</th><th>Situação</th><th className="direita">Ações</th></tr></thead>
            <tbody>{d?.veiculos.map((v) => (
              <tr key={v.id}>
                <td><div className="cg-veiculo"><strong>{v.modelo}</strong><span className="cg-mono">{v.cor}{v.categoria ? ` · ${v.categoria}` : ""}</span></div></td>
                <td><span className="cg-mono">{v.placa}{v.ano ? ` · ${v.ano}` : ""}</span></td>
                <td>{v.motorista || "-"}</td>
                <td>{v.statusMotorista ? <Selo tom={v.statusMotorista === "Ativo" ? "ok" : "neutro"}>{v.statusMotorista}</Selo> : "-"}</td>
                <td><Selo tom={v.emUso ? "ok" : "neutro"}>{v.emUso ? "Em uso" : "Guardado"}</Selo></td>
                <td className="direita"><MenuAcoes itens={[
                  { rotulo: v.emUso ? "Guardar" : "Colocar em uso", onClick: () => void tentar(async () => { await chamar("POST", `/veiculos/${v.id}/uso`, { emUso: !v.emUso }); l.recarregar(); }) },
                  { rotulo: "Excluir", perigo: true, onClick: () => confirm("Excluir este veículo?") && void tentar(async () => { await chamar("DELETE", `/veiculos/${v.id}`); l.recarregar(); }, "Veículo excluído.") },
                ]} /></td>
              </tr>))}
            </tbody>
          </table></div>
          {d && !d.veiculos.length && <Vazio titulo="Nenhum veículo encontrado." />}
          <Paginacao atual={d?.paginacao.atual ?? 1} total={d?.paginacao.totalPaginas ?? 1} onChange={setPagina} />
        </div>
      </ComFiltros>
      {novo && <NovoVeiculo onFechar={() => setNovo(false)} onSalvo={() => l.recarregar()} />}
    </div>
  );
}

function NovoVeiculo({ onFechar, onSalvo }: { onFechar: () => void; onSalvo: () => void }) {
  const [f, setF] = useState({ motoristaId: "", modelo: "", cor: "", placa: "", ano: "" });
  const [busca, setBusca] = useState("");
  const mot = useCarregar(() => chamar<{ motoristas: Array<{ id: string; nome: string }> }>("GET", `/motoristas-busca${consulta({ q: busca })}`), [busca]);
  const { aviso, tentar } = useAviso();
  const salvar = async () => { if (await tentar(() => chamar("POST", "/veiculos", { ...f, ano: f.ano ? Number(f.ano) : null }), "Veículo salvo.")) { onSalvo(); onFechar(); } };
  return (
    <Janela aberta titulo="Novo Veículo" sub="Cadastro de Frota" onFechar={onFechar} largura="pequena" rodape={<><button className="cg-botao" onClick={onFechar}>Cancelar</button><button className="cg-botao primario" onClick={() => void salvar()}>Salvar Veículo</button></>}>
      {aviso}
      <div style={{ display: "grid", gap: 12 }}>
        <Campo rotulo="Motorista Proprietário">
          <><input placeholder="Buscar motorista..." value={busca} onChange={(e) => setBusca(e.target.value)} />
            <select value={f.motoristaId} onChange={(e) => setF({ ...f, motoristaId: e.target.value })}><option value="">Selecione</option>{mot.dados?.motoristas.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></>
        </Campo>
        <Campo rotulo="Modelo do Veículo"><input value={f.modelo} onChange={(e) => setF({ ...f, modelo: e.target.value })} /></Campo>
        <Campo rotulo="Cor Predominante"><input value={f.cor} onChange={(e) => setF({ ...f, cor: e.target.value })} /></Campo>
        <Campo rotulo="Placa (Mercosul/Antiga)"><input value={f.placa} onChange={(e) => setF({ ...f, placa: e.target.value.toUpperCase() })} /></Campo>
        <Campo rotulo="Ano Fabricação"><input type="number" value={f.ano} onChange={(e) => setF({ ...f, ano: e.target.value })} /></Campo>
      </div>
    </Janela>
  );
}
