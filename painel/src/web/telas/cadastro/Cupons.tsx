// Cadastro › Cupons: campanhas por cidade ou cupons exclusivos de cliente (VIP). Lista: /api/gestao/cupons; gravação: /api/cadastros/cupons.

import { useState } from "react";
import { Plus } from "lucide-react";
import { api } from "../../api";
import { useCarregar } from "../../componentes/ui";
import { Abas, Cabecalho, Campo, chamar, consulta, dataBr, dinheiro, Janela, MenuAcoes, Paginacao, Selo, useAviso, Vazio } from "./base";

type Cupom = Record<string, string | number | boolean | null> & { id: string; usos: number; descontoTotal: number; situacao: string };
interface Resposta { cupons: Cupom[]; paginacao: { atual: number; totalPaginas: number }; kpis: { total: number; usos: number; economia: number } }
const TOM: Record<string, "ok" | "ruim" | "alerta" | "neutro"> = { Ativo: "ok", Vencido: "ruim", Esgotado: "alerta", Inativo: "neutro" };
const ABAS = [["Todos", "Todos"], ["Validos", "Ativos"], ["Vencidos", "Vencidos"], ["Pausados", "Pausados"]] as const;

export default function Cupons() {
  const [aba, setAba] = useState("Todos");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const l = useCarregar(() => chamar<Resposta>("GET", `/cupons${consulta({ status: aba, busca, pagina })}`), [aba, busca, pagina]);
  const cidades = useCarregar(() => chamar<{ cidades: string[] }>("GET", "/cidades"), []);
  const [editando, setEditando] = useState<Cupom | "novo" | null>(null);
  const { aviso, tentar } = useAviso();
  const d = l.dados;

  return (
    <div className="cg-pagina-solta">
      {aviso}
      <Cabecalho titulo="Gestão de Cupons" sub="Crie campanhas para sua cidade ou envie cupons exclusivos para clientes VIP."><button className="cg-botao primario" onClick={() => setEditando("novo")}><Plus size={16} /> Novo Cupom</button></Cabecalho>
      <div className="cg-kpis">
        <div className="cg-kpi"><span>Total de Cupons</span><strong>{d?.kpis.total ?? 0}</strong></div>
        <div className="cg-kpi"><span>Usos Realizados</span><strong>{d?.kpis.usos ?? 0}</strong></div>
        <div className="cg-kpi"><span>Descontos Aplicados</span><strong>{dinheiro(d?.kpis.economia)}</strong></div>
      </div>
      <div className="cg-linha-tab">
        <div style={{ flex: "2 1 320px" }}><Abas itens={ABAS.map(([id, rotulo]) => ({ id, rotulo }))} valor={aba as "Todos"} onChange={(v) => { setAba(v); setPagina(1); }} /></div>
        <input placeholder="Buscar" value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }} aria-label="Buscar" />
      </div>
      <div className="cg-tabela-caixa">
        <div className="cg-rolagem"><table className="cg-tabela">
          <thead><tr><th>Cupom</th><th>Desconto</th><th>Destinatário</th><th>Validade &amp; Regras</th><th>Usos</th><th>Status</th><th className="direita">Ações</th></tr></thead>
          <tbody>{d?.cupons.map((c) => (
            <tr key={c.id}>
              <td><strong>{String(c.codigo)}</strong><br /><small className="cg-mono">{String(c.descricao ?? "")}</small></td>
              <td>{c.tipoDesconto === "Percentual" ? `${c.valor}%` : dinheiro(Number(c.valor))}{c.valorMaximo ? <><br /><small className="cg-mono">teto {dinheiro(Number(c.valorMaximo))}</small></> : null}</td>
              <td>{c.clienteTelefone ? <Selo tom="roxo">VIP {String(c.clienteNome || c.clienteTelefone)}</Selo> : <span>Todos{c.cidade ? ` · ${c.cidade}` : ""}</span>}</td>
              <td>{c.inicio ? dataBr(String(c.inicio)) : "—"} a {c.fim ? dataBr(String(c.fim)) : "sem fim"}<br /><small className="cg-mono">{c.minimoCorrida ? `mín. ${dinheiro(Number(c.minimoCorrida))}` : "sem mínimo"}{c.usoPorPassageiro ? ` · ${c.usoPorPassageiro}/cliente` : ""}</small></td>
              <td>{c.usos}{c.limiteUsos ? ` / ${c.limiteUsos}` : ""}</td>
              <td><Selo tom={TOM[c.situacao] ?? "neutro"}>{c.situacao === "Inativo" ? "Pausado" : c.situacao}</Selo></td>
              <td className="direita"><MenuAcoes itens={[
                { rotulo: "Editar", onClick: () => setEditando(c) },
                { rotulo: c.ativo === true ? "Pausar" : "Ativar", onClick: () => void tentar(async () => { await api.salvarRegistro("cupons", c.id, { ...c, ativo: c.ativo !== true }); l.recarregar(); }) },
                { rotulo: "Excluir", perigo: true, onClick: () => confirm(`Excluir o cupom ${c.codigo}?`) && void tentar(async () => { await api.apagarRegistro("cupons", c.id); l.recarregar(); }, "Cupom excluído.") },
              ]} /></td>
            </tr>))}
          </tbody>
        </table></div>
        {d && !d.cupons.length && <Vazio titulo="Nenhum cupom encontrado." />}
        <Paginacao atual={d?.paginacao.atual ?? 1} total={d?.paginacao.totalPaginas ?? 1} onChange={setPagina} />
      </div>
      {editando && <Formulario c={editando === "novo" ? null : editando} cidades={cidades.dados?.cidades ?? []} onFechar={() => setEditando(null)} onSalvo={() => l.recarregar()} />}
    </div>
  );
}

function Formulario({ c, cidades, onFechar, onSalvo }: { c: Cupom | null; cidades: string[]; onFechar: () => void; onSalvo: () => void }) {
  const t = (k: string) => (c?.[k] == null ? "" : String(c[k]));
  const [f, setF] = useState({
    codigo: t("codigo"), descricao: t("descricao"), tipoDesconto: t("tipoDesconto") || "Valor fixo", valor: t("valor"), valorMaximo: t("valorMaximo"), cidade: t("cidade"),
    clienteTelefone: t("clienteTelefone"), clienteNome: t("clienteNome"), inicio: t("inicio"), fim: t("fim"), minimoCorrida: t("minimoCorrida"), limiteUsos: t("limiteUsos"), usoPorPassageiro: t("usoPorPassageiro"),
  });
  const { aviso, tentar } = useAviso();
  const set = (k: string, v: string) => setF({ ...f, [k]: v });
  const salvar = async () => {
    const n = (v: string) => (v === "" ? null : Number(v.replace(",", ".")));
    const corpo = { ...f, codigo: f.codigo.trim().toUpperCase(), valor: n(f.valor), valorMaximo: n(f.valorMaximo), minimoCorrida: n(f.minimoCorrida), limiteUsos: n(f.limiteUsos), usoPorPassageiro: n(f.usoPorPassageiro), ativo: c ? c.ativo === true : true };
    if (await tentar(() => (c ? api.salvarRegistro("cupons", c.id, corpo) : api.criarRegistro("cupons", corpo)), "Cupom salvo.")) { onSalvo(); onFechar(); }
  };
  return (
    <Janela aberta titulo={c ? "Editar Cupom" : "Novo Cupom"} sub="Configure as condições e o público-alvo" onFechar={onFechar} rodape={<><button className="cg-botao" onClick={onFechar}>Cancelar</button><button className="cg-botao primario" onClick={() => void salvar()}>Salvar Cupom</button></>}>
      {aviso}
      <div className="cg-grade">
        <Campo rotulo="Código do Cupom *"><input value={f.codigo} onChange={(e) => set("codigo", e.target.value.toUpperCase())} /></Campo>
        <Campo rotulo="Descrição"><input value={f.descricao} onChange={(e) => set("descricao", e.target.value)} /></Campo>
        <Campo rotulo="Tipo"><select value={f.tipoDesconto} onChange={(e) => set("tipoDesconto", e.target.value)}><option value="Valor fixo">R$ Fixo</option><option value="Percentual">% Porcentagem</option></select></Campo>
        <Campo rotulo="Valor"><input inputMode="decimal" value={f.valor} onChange={(e) => set("valor", e.target.value)} /></Campo>
        <Campo rotulo="Teto Máx (R$)"><input inputMode="decimal" value={f.valorMaximo} onChange={(e) => set("valorMaximo", e.target.value)} /></Campo>
        <Campo rotulo="Cidade"><select value={f.cidade} onChange={(e) => set("cidade", e.target.value)}><option value="">Todas</option>{cidades.map((x) => <option key={x}>{x}</option>)}</select></Campo>
        <Campo rotulo="Cliente Exclusivo (VIP)" dica="Vazio = Cupom liberado para todos na cidade."><input placeholder="Telefone do cliente" value={f.clienteTelefone} onChange={(e) => set("clienteTelefone", e.target.value)} /></Campo>
        <Campo rotulo="Nome do cliente VIP"><input value={f.clienteNome} onChange={(e) => set("clienteNome", e.target.value)} /></Campo>
        <Campo rotulo="Início"><input type="date" value={f.inicio} onChange={(e) => set("inicio", e.target.value)} /></Campo>
        <Campo rotulo="Expiração"><input type="date" value={f.fim} onChange={(e) => set("fim", e.target.value)} /></Campo>
        <Campo rotulo="Mínimo Corrida"><input inputMode="decimal" value={f.minimoCorrida} onChange={(e) => set("minimoCorrida", e.target.value)} /></Campo>
        <Campo rotulo="Limite Total"><input type="number" value={f.limiteUsos} onChange={(e) => set("limiteUsos", e.target.value)} /></Campo>
        <Campo rotulo="Usos / Cliente"><input type="number" value={f.usoPorPassageiro} onChange={(e) => set("usoPorPassageiro", e.target.value)} /></Campo>
      </div>
    </Janela>
  );
}
